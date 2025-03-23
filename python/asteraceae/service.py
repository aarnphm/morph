from __future__ import annotations

import logging, traceback, os, asyncio, contextlib, pathlib, typing as t
import bentoml, fastapi, pydantic, annotated_types as ae, typing_extensions as te

logger = logging.getLogger(__name__)

openai_api_app = fastapi.FastAPI()

IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']
MODEL_ID = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B'
STRUCTURED_OUTPUT_BACKEND = 'xgrammar:disable-any-whitespace'  # remove any whitespace if it is not qwen.
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', 16 * 1024))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', 8 * 1024))
WORKING_DIR = pathlib.Path(__file__).parent

IMAGE = (
  bentoml.images.PythonImage(python_version='3.11', lock_python_packages=False)
  .requirements_file('requirements.txt')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6')
)


class Suggestion(pydantic.BaseModel):
  suggestion: str
  reasoning: str = pydantic.Field(default='')


class Suggestions(pydantic.BaseModel):
  suggestions: list[Suggestion]


@bentoml.asgi_app(openai_api_app, path='/v1')
@bentoml.service(
  name='asteraceae-inference-engine',
  traffic={'timeout': 1000, 'concurrency': 128},
  resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  tracing={'sample_rate': 1.0},
  envs=[
    {'name': 'HF_TOKEN'},
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': '0'},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR/'logging-config.json').__fspath__()},
  ],
  labels={'owner': 'aarnphm', 'type': 'engine'},
  image=IMAGE,
)
class Engine:
  model_id = MODEL_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import vllm.entrypoints.openai.api_server as vllm_api_server

    from vllm.utils import FlexibleArgumentParser
    from vllm.entrypoints.openai.cli_args import make_arg_parser

    args = make_arg_parser(FlexibleArgumentParser()).parse_args([])
    args.model = self.model
    args.disable_log_requests = True
    args.max_log_len = 1000
    args.served_model_name = [self.model_id]
    args.request_logger = None
    args.disable_log_stats = True
    args.use_tqdm_on_load = False
    args.enable_prefix_caching = True
    args.enable_reasoning = True
    args.reasoning_parser = 'deepseek_r1'
    args.enable_auto_tool_choice = True
    args.tool_call_parser = 'hermes'
    args.max_model_len = MAX_MODEL_LEN
    args.ignore_patterns = IGNORE_PATTERNS
    args.guided_decoding_backend = STRUCTURED_OUTPUT_BACKEND

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
      ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
      ['/models', vllm_api_server.show_available_models, ['GET']],
      ['/embeddings', vllm_api_server.create_embedding, ['POST']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS: router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    openai_api_app.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()

    await vllm_api_server.init_app_state(self.engine, self.model_config, openai_api_app.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self): await self.exit_stack.aclose()


@bentoml.service(
  name='asteraceae-inference-api',
  traffic={'timeout': 1000, 'concurrency': 128},
  http={
    'cors': {
      'enabled': True,
      'access_control_allow_origins': ['*'],
      'access_control_allow_methods': ['GET', 'OPTIONS', 'POST', 'HEAD', 'PUT'],
      'access_control_allow_credentials': True,
      'access_control_allow_headers': ['*'],
      'access_control_max_age': 1200,
      'access_control_expose_headers': ['Content-Length'],
    }
  },
  envs=[
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
  ],
  tracing={'sample_rate': 0.5},
  labels={'owner': 'aarnphm', 'type': 'api'},
  image=IMAGE,
)
class API:
  if int(os.getenv("DEVELOPMENT", "0")) == 1:
    engine = bentoml.depends(url=f'http://127.0.0.1:{os.getenv("ENGINE_PORT", 3001)}')
  else:
    engine = bentoml.depends(Engine)

  def __init__(self):
    from openai import AsyncOpenAI

    self.client = AsyncOpenAI(base_url=f'{self.engine.client_url}/v1', api_key='dummy')

  @bentoml.api
  async def suggests(
    self,
    essay: str,
    num_suggestions: te.Annotated[int, ae.Ge(2)] = 3,
    temperature: te.Annotated[float, ae.Ge(0.5), ae.Le(0.7)] = 0.6,
    max_tokens: te.Annotated[int, ae.Ge(256), ae.Le(MAX_TOKENS)] = MAX_TOKENS,
  ) -> t.AsyncGenerator[str, None]:
    with (WORKING_DIR/"SYSTEM_PROMPT.md").open('r') as f: system_prompt = f.read()
    messages = [
      {'role': 'system', 'content': system_prompt.format(num_suggestions=num_suggestions)},
      {'role': 'user', 'content': essay},
    ]

    prefill = False
    try:
      completions = await self.client.chat.completions.create(
        model=MODEL_ID,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=messages,
        stream=True,
        extra_body={"guided_json": Suggestions.model_json_schema()},
        extra_headers={'Runner-Name': Engine.name}
      )
      async for chunk in completions:
        delta_choice = chunk.choices[0].delta
        if hasattr(delta_choice, 'reasoning_content'):
          s = Suggestion(suggestion=delta_choice.content or '', reasoning=delta_choice.reasoning_content)
        else:
          s = Suggestion(suggestion=delta_choice.content)
        if not prefill:
          prefill = True
          yield ''
        else:
          if not s.reasoning and not s.suggestion: break
          yield f'{s.model_dump_json()}\n'
    except Exception:
      logger.error(traceback.format_exc())
      yield f'{Suggestion(suggestion="Internal error found. Check server logs for more information").model_dump_json()}\n'
      return
