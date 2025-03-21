from __future__ import annotations

import logging, traceback, os, asyncio, contextlib, typing as t
import bentoml, fastapi, pydantic, annotated_types as ae, typing_extensions as te

logger = logging.getLogger(__name__)

openai_api_app = fastapi.FastAPI()

MODEL_ID = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B'
STRUCTURED_OUTPUT_BACKEND = 'xgrammar:disable-any-whitespace'  # remove any whitespace if it is not qwen.
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', 16 * 1024))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', 8 * 1024))
SYSTEM_PROMPT = """You are a professional writer heavily influenced by the styles of Raymond Carver, Franz Kafka, Albert Camus, Iain McGilchrist, and Ian McEwan. Your task is to provide suggestions by offering concise, meaningful additions that match the stylistic choices and tonality of the given essay excerpt.

Please follow these steps to generate a suggestion:

1. Analyze the excerpt, paying close attention to its style, tone, and central concept.
2. Consider how you might might approach expanding or enhancing the excerpt.
3. Formulate a suggestion that builds upon the existing concept while maintaining a terse and authentic voice.
4. Ensure your suggestion adds depth to the writing without drastically changing its original intent.

Guidelines for your suggestion:
1. Keep it concise and authentic, typically one to two sentences.
2. Focus on enhancing emotional depth, vivid imagery, or character insight.
3. Maintain the overall tone and style of the original excerpt.
4. Build upon the central concept or theme present in the excerpt.
5. Make sure to provide minimum {num_suggestions} suggestions.
"""

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
  traffic={'timeout': 300, 'concurrency': 128},
  resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  tracing={'sample_rate': 0.5},
  envs=[
    {'name': 'HF_TOKEN'},
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': '0'},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': os.path.join(os.path.dirname(__file__), 'logging-config.json')},
  ],
  labels={'owner': 'aarnphm', 'type': 'engine'},
  image=IMAGE,
)
class Engine:
  model_id = MODEL_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=['*.pth', '*.pt', 'original/**/*'])

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
    args.max_model_len = MAX_MODEL_LEN
    args.enable_prefix_caching = True
    args.enable_reasoning = True
    args.reasoning_parser = 'deepseek_r1'
    args.enable_auto_tool_choice = True
    args.tool_call_parser = 'hermes'
    args.guided_decoding_backend = STRUCTURED_OUTPUT_BACKEND

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
      ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
      ['/models', vllm_api_server.show_available_models, ['GET']],
      ['/embeddings', vllm_api_server.create_embedding, ['POST']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS:
      router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    openai_api_app.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()

    await vllm_api_server.init_app_state(self.engine, self.model_config, openai_api_app.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.exit_stack.aclose()


@bentoml.service(
  name='asteraceae-inference-api',
  traffic={'timeout': 300, 'concurrency': 128},
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
  tracing={'sample_rate': 0.4},
  labels={'owner': 'aarnphm', 'type': 'api'},
  image=IMAGE,
)
class API:
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
    messages = [
      {'role': 'system', 'content': SYSTEM_PROMPT.format(num_suggestions=num_suggestions)},
      {'role': 'user', 'content': essay},
    ]

    prefill = False
    try:
      completions = await self.client.chat.completions.create(
        model=Engine.inner.model_id,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=messages,
        stream=True,
        extra_body=dict(guided_json=Suggestions.model_json_schema()),
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
          if not s.reasoning and not s.suggestion:
            break
          yield f'{s.model_dump_json()}\n'
    except Exception:
      logger.error(traceback.format_exc())
      yield f'{Suggestion(suggestion="Internal error found. Check server logs for more information").model_dump_json()}\n'
      return
