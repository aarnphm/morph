from __future__ import annotations

import logging, traceback, os, contextlib, typing as t
import bentoml, fastapi, pydantic, annotated_types as ae, typing_extensions as te

logger = logging.getLogger(__name__)

openai_api_app = fastapi.FastAPI()

MODEL_ID = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B'
MAX_MODEL_LEN = int(os.environ.get("MAX_MODEL_LEN", 16 * 1024))
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", 8 * 1024))
SYSTEM_PROMPT = """You are a professional writing assistant influenced by the styles of Raymond Carver, Franz Kafka, Albert Camus, Iain McGilchrist, and Ian McEwan. Your task is to provide suggestions to improve a user's writing by offering concise, meaningful additions that match the stylistic choices and tonality of the given essay excerpt.

Please follow these steps to generate a suggestion:

1. Analyze the excerpt, paying close attention to its style, tone, and central concept.
2. Consider how two of the aforementioned authors might approach expanding or enhancing the excerpt.
3. Formulate a suggestion that builds upon the existing concept while maintaining a terse and authentic voice.
4. Ensure your suggestion adds depth to the writing without drastically changing its original intent.

Guidelines for your suggestion:
1. Keep it concise and authentic, typically one to two sentences.
2. Focus on enhancing emotional depth, vivid imagery, or character insight.
3. Maintain the overall tone and style of the original excerpt.
4. Build upon the central concept or theme present in the excerpt.

Please proceed with your analysis and suggestion for the given essay excerpt."""


class Suggestion(pydantic.BaseModel):
  suggestion: str


@bentoml.asgi_app(openai_api_app, path='/v1')
@bentoml.service(
  name='asteraceae-inference-service',
  traffic={'timeout': 300, 'concurrency': 128},
  resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
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
      {'name': 'HF_TOKEN'},
      {'name': 'UV_NO_PROGRESS', 'value': '1'},
      {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
      {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
      {'name': 'VLLM_USE_V1', 'value': '0'},
      {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': os.path.join(os.path.dirname(__file__), 'logging-config.json')},
  ],
  labels={'owner': 'aarnphm', 'type': 'inference'},
  image=bentoml.images.PythonImage(python_version='3.11', lock_python_packages=False)
  .requirements_file('requirements.txt')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6'),
)

class Engine:
  model_id = MODEL_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=['*.pth', '*.pt', 'original/**/*'])
  def __init__(self):
    from openai import AsyncOpenAI

    self.openai = AsyncOpenAI(base_url='http://127.0.0.1:3000/v1', api_key='dummy')
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
    args.guided_decoding_backend = "xgrammar:disable-any-whitespace"

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
        ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
        ['/models', vllm_api_server.show_available_models, ['GET']],
        ["/embeddings", vllm_api_server.create_embedding, ["POST"]],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS: router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    openai_api_app.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()
    args.enable_reasoning = True
    args.enable_auto_tool_choice = True
    args.tool_call_parser = 'hermes'
    args.reasoning_parser = 'deepseek_r1'
    args.reasoning_backend = 'deepseek_r1'

    await vllm_api_server.init_app_state(self.engine, self.model_config, openai_api_app.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self): await self.exit_stack.aclose()

  @bentoml.api
  async def suggests(
    self,
    essay: str,
    temperature: te.Annotated[float, ae.Ge(0.5), ae.Le(0.7)] = 0.6,
    max_tokens: te.Annotated[int, ae.Ge(256), ae.Le(MAX_TOKENS)] = MAX_TOKENS,
  ) -> t.AsyncGenerator[str, None]:

    messages = [
      {'role': 'system', 'content': SYSTEM_PROMPT},
      {'role': 'user', 'content': essay},
    ]

    try:
      completions = await self.openai.chat.completions.create(
        model=self.model_id,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=messages,
        stream=True,
        extra_body=dict(guided_json=Suggestion.model_json_schema()),
      )
      async for chunk in completions:
        yield chunk.choices[0].delta.content or ''
    except Exception:
      logger.error(traceback.format_exc())
      yield 'Internal error found. Check server logs for more information'
      return
