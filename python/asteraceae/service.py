from __future__ import annotations

import logging, traceback, os, contextlib, pathlib, typing as t
import bentoml, fastapi, pydantic, jinja2, annotated_types as ae, typing_extensions as te

if t.TYPE_CHECKING:
  from vllm.entrypoints.openai.protocol import DeltaMessage
  from _bentoml_sdk.images import Image
  from _bentoml_sdk.service.config import TrafficSchema, TracingSchema

logger = logging.getLogger(__name__)

inference_api = fastapi.FastAPI()
embedding_api = fastapi.FastAPI()


IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']
INFERENCE_ID = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B'
EMBEDDING_ID = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B'
STRUCTURED_OUTPUT_BACKEND = 'xgrammar:disable-any-whitespace'  # remove any whitespace if it is not qwen.
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', 16 * 1024))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', 8 * 1024))
WORKING_DIR = pathlib.Path(__file__).parent


class ServiceOpts(t.TypedDict, total=False):
  image: Image
  traffic: TrafficSchema
  tracing: TracingSchema


SERVICE_CONFIG: ServiceOpts = {
  'image': bentoml.images.PythonImage(python_version='3.11', lock_python_packages=False)
  .requirements_file('requirements.txt')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6'),
  'traffic': {'timeout': 1000, 'concurrency': 128},
  'tracing': {'sample_rate': 1.0},
}


class Suggestion(pydantic.BaseModel):
  suggestion: str
  reasoning: str = pydantic.Field(default='')


class Suggestions(pydantic.BaseModel):
  suggestions: list[Suggestion]


@bentoml.asgi_app(inference_api, path='/v1')
@bentoml.service(
  name='asteraceae-inference-engine',
  resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
  labels={'owner': 'aarnphm', 'type': 'engine', 'task': 'generate'},
  envs=[
    {'name': 'HF_TOKEN'},
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': '0'},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR / 'logging-config.json').__fspath__()},
  ],
  **SERVICE_CONFIG,
)
class Engine:
  model_id = INFERENCE_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import vllm.entrypoints.openai.api_server as vllm_api_server

    from vllm.utils import FlexibleArgumentParser
    from vllm.entrypoints.openai.cli_args import make_arg_parser

    args = make_arg_parser(FlexibleArgumentParser()).parse_args([])
    args.task = "generate"
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
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS:
      router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    inference_api.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()

    await vllm_api_server.init_app_state(self.engine, self.model_config, inference_api.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self): await self.exit_stack.aclose()


@bentoml.asgi_app(embedding_api, path='/v1')
@bentoml.service(
  name='asteraceae-embedding-engine',
  resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  labels={'owner': 'aarnphm', 'type': 'engine', 'task': 'embed'},
  envs=[
    {'name': 'HF_TOKEN'},
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': '0'},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR / 'logging-config.json').__fspath__()},
  ],
  **SERVICE_CONFIG,
)
class Embeddings:
  model_id = EMBEDDING_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import vllm.entrypoints.openai.api_server as vllm_api_server

    from vllm.utils import FlexibleArgumentParser
    from vllm.entrypoints.openai.cli_args import make_arg_parser

    args = make_arg_parser(FlexibleArgumentParser()).parse_args([])
    args.task = "embed"
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
      ['/models', vllm_api_server.show_available_models, ['GET']],
      ['/embeddings', vllm_api_server.create_embedding, ['POST']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS:
      router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    inference_api.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()

    await vllm_api_server.init_app_state(self.engine, self.model_config, inference_api.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self): await self.exit_stack.aclose()

class EmbedMetadata(pydantic.BaseModel):
  vault: str
  file: str
  type: t.Literal[0, 1]
  note: t.Optional[str] = pydantic.Field(default=None)

class EmbedTask(pydantic.BaseModel):
  metadata: EmbedMetadata
  embedding: list[float]
  error: str = pydantic.Field(default='')

@bentoml.service(
  name='asteraceae-inference-api',
  resources={'cpu': 2},
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
  labels={'owner': 'aarnphm', 'type': 'api'},
  envs=[
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR / 'logging-config.json').__fspath__()},
  ],
  **SERVICE_CONFIG,
)
class API:
  if int(os.getenv('DEVELOPMENT', '0')) == 1:
    inference = bentoml.depends(url=f'http://127.0.0.1:{os.getenv("ENGINE_PORT", 3001)}')
    embedding = bentoml.depends(url=f'http://127.0.0.1:{os.getenv("EMBED_PORT", 3002)}')
  else:
    inference = bentoml.depends(Engine)
    embedding = bentoml.depends(Embeddings)

  def __init__(self):
    from openai import AsyncOpenAI

    self.inference_client = AsyncOpenAI(base_url=f'{self.inference.client_url}/v1', api_key='dummy')
    self.embedding_client = AsyncOpenAI(base_url=f'{self.embedding.client_url}/v1', api_key='dummy')

    loader = jinja2.FileSystemLoader(searchpath=WORKING_DIR)
    self.jinja2_env = jinja2.Environment(loader=loader)

  @bentoml.task
  async def embed(self, vault_id: str, file_id: str, content: str, note_id: t.Optional[str] = None) -> EmbedTask:
    # 0 will be note, 1 will be content
    metadata = EmbedMetadata(vault=vault_id, file=file_id, type=0 if note_id is not None else 1, note=note_id)
    try:
      results = await self.embedding_client.embeddings.create(input=[content], model=EMBEDDING_ID, dimensions=1024)
      return EmbedTask(metadata=metadata, embedding=results.data[0].embedding)
    except Exception:
      logger.error(traceback.format_exc())
      return EmbedTask(metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information')


  @bentoml.api
  async def suggests(
    self,
    essay: str,
    num_suggestions: t.Annotated[int, ae.Ge(2)] = 3,
    temperature: t.Annotated[float, ae.Ge(0.5), ae.Le(0.7)] = 0.6,
    max_tokens: t.Annotated[int, ae.Ge(256), ae.Le(MAX_TOKENS)] = MAX_TOKENS,
  ) -> t.AsyncGenerator[str, None]:
    from openai.types.chat import ChatCompletionUserMessageParam

    PROMPT = self.jinja2_env.get_template('SYSTEM_PROMPT.md').render(num_suggestions=num_suggestions, excerpt=essay)
    prefill = False

    try:
      completions = await self.inference_client.chat.completions.create(
        model=INFERENCE_ID,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[ChatCompletionUserMessageParam(role='user', content=PROMPT)],
        stream=True,
        extra_body={'guided_json': Suggestions.model_json_schema()},
        extra_headers={'Runner-Name': Engine.name},
      )
      async for chunk in completions:
        delta_choice = t.cast('DeltaMessage', chunk.choices[0].delta)
        if hasattr(delta_choice, 'reasoning_content'):
          s = Suggestion(suggestion=delta_choice.content or '', reasoning=delta_choice.reasoning_content or '')
        else:
          s = Suggestion(suggestion=delta_choice.content or '')
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
