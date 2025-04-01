from __future__ import annotations

import logging, argparse, multiprocessing, itertools, traceback, asyncio, os, shutil, contextlib, pathlib, time, datetime, typing as t
import bentoml, fastapi, pydantic, jinja2, annotated_types as at

from bentoml._internal.utils import dict_filter_none
from libs.protocol import EssayNode, EssayRequest, EssayResponse, HealthRequest, MetadataResponse, NotesResponse

with bentoml.importing():
  import openai

  from openai.types import Embedding, CreateEmbeddingResponse
  from openai.types.chat import ChatCompletionUserMessageParam, ChatCompletionChunk
  from llama_index.core import Document
  from llama_index.core.ingestion import IngestionPipeline
  from llama_index.core.node_parser import SemanticSplitterNodeParser
  from llama_index.core.extractors import TitleExtractor
  from llama_index.embeddings.openai import OpenAIEmbedding
  from llama_index.llms.openai_like import OpenAILike

  from libs.protocol import (
    ReasoningModels,
    EmbeddingModels,
    ServiceOpts,
    EmbedType,
    ModelType,
    DependentStatus,
    HealthResponse,
    LineNumberMetadataExtractor,
    Suggestion,
    Suggestions,
    TaskType,
    Tonality,
    NoteRequest,
  )

if t.TYPE_CHECKING:
  from _bentoml_impl.client import RemoteProxy
  from _bentoml_sdk.service.config import HTTPCorsSchema
  from vllm.entrypoints.openai.protocol import DeltaMessage

logger = logging.getLogger('bentoml.service')


WORKING_DIR = pathlib.Path(__file__).parent
IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', 16 * 1024))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', 8 * 1024))

MODEL_TYPE = t.cast(ModelType, os.getenv('LLM', 'r1-qwen'))
LLM_ID: str = (llm_ := ReasoningModels[MODEL_TYPE])['model_id']
EMBED_TYPE = t.cast(EmbedType, os.getenv('EMBED', 'gte-qwen-fast'))
EMBED_ID: str = (embed_ := EmbeddingModels[EMBED_TYPE])['model_id']

SupportedBackend = t.Literal['vllm']
SUPPORTED_BACKENDS: t.Sequence[SupportedBackend] = ['vllm']
DEFAULT_BACKEND = t.cast(SupportedBackend, os.environ.get('DEFAULT_BACKEND', 'vllm'))

AUTHORS = ['Raymond Carver', 'Franz Kafka', 'Albert Camus', 'Iain McGilchrist', 'Ian McEwan']

CORS = dict(
  allow_origins=['*'],
  allow_methods=['GET', 'OPTIONS', 'POST', 'HEAD', 'PUT'],
  allow_credentials=True,
  allow_headers=['*'],
  max_age=3600,
  expose_headers=['Content-Length'],
)

SERVICE_CONFIG: ServiceOpts = {
  'tracing': {'sample_rate': 1.0},
  'traffic': {'timeout': 1000, 'concurrency': 128},
  'http': {'cors': t.cast('HTTPCorsSchema', {'enabled': True, **{f'access_control_{k}': v for k, v in CORS.items()}})},
  'image': bentoml.images.PythonImage(python_version='3.11')
  .system_packages('curl', 'git', 'build-essential', 'clang')
  .pyproject_toml('pyproject.toml')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6'),
}


class SuggestRequest(pydantic.BaseModel):
  essay: str
  authors: t.Optional[list[str]] = pydantic.Field(AUTHORS)
  tonality: t.Optional[Tonality] = pydantic.Field(default_factory=lambda: Tonality(soul_cartographer=0.4, logical=0.6))
  num_suggestions: t.Annotated[int, at.Ge(1)] = 3
  top_p: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['top_p']
  temperature: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['temperature']
  max_tokens: t.Annotated[int, at.Ge(256), at.Le(MAX_TOKENS)] = MAX_TOKENS
  usage: bool = True


llm_app = fastapi.FastAPI(title=f'OpenAI Compatible Endpoint for {LLM_ID}')
embed_app = fastapi.FastAPI(title=f'OpenAI Compatible Endpoint for {EMBED_ID}')
app = fastapi.FastAPI(title='API Gateway for morph')


def make_labels(task: TaskType) -> dict[str, t.Any]:
  return {'owner': 'aarnphm', 'type': 'engine', 'task': task}


def make_engine_service_config(type_: t.Literal['llm', 'embed'] = 'llm') -> ServiceOpts:
  return {
    'name': 'asteraceae-inference-engine' if type_ == 'llm' else 'asteraceae-embedding-engine',
    'resources': llm_['resources'] if type_ == 'llm' else embed_['resources'],
    **SERVICE_CONFIG,
  }


def make_env(engine_version: t.Literal[0, 1] = 1, *, skip_hf: bool = False) -> list[dict[str, str]]:
  results = []
  if not skip_hf:
    results.append({'name': 'HF_TOKEN'})
  results.extend([
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'CXX', 'value': t.cast(str, shutil.which('c++'))},
    {'name': 'DEFAULT_BACKEND', 'value': DEFAULT_BACKEND},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': str(engine_version)},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR / 'logging-config.json').__fspath__()},
  ])
  return results


def make_args(
  model: str,
  model_id: str,
  /,
  *,
  task: TaskType,
  max_log_len: int = 2000,
  max_model_len: int = MAX_MODEL_LEN,
  reasoning: bool = True,
  reasoning_parser: str = 'deepseek_r1',
  trust_remote_code: bool = False,
  prefix_caching: bool = True,
  tool: bool = True,
  tool_parser: str = 'hermes',
  **kwargs: t.Any,
) -> argparse.Namespace:
  from vllm.utils import FlexibleArgumentParser
  from vllm.entrypoints.openai.cli_args import make_arg_parser

  variables = dict(
    task=task,
    model=model,
    disable_log_requests=True,
    disable_uvicorn_access_log=True,
    max_log_len=max_log_len,
    served_model_name=[model_id],
    request_logger=None,
    disable_log_stats=True,
    use_tqdm_on_load=False,
    enable_prefix_caching=prefix_caching,
    enable_auto_tool_choice=tool,
    tool_call_parser=tool_parser,
    max_model_len=max_model_len,
    ignore_patterns=IGNORE_PATTERNS,
    enable_reasoning=reasoning,
    trust_remote_code=trust_remote_code,
    reasoning_parser=reasoning_parser,
    guided_decoding_backend=llm_['structured_output_backend'],
    **kwargs,
  )
  if task == 'generate' and (tp := llm_.get('resources', {}).get('gpu', 1)) > 1:
    variables['tensor_parallel_size'] = int(tp)
  args = make_arg_parser(FlexibleArgumentParser()).parse_args([])
  for k, v in variables.items():
    setattr(args, k, v)
  return args


def make_url(task: TaskType) -> str | None:
  var: dict[TaskType, dict[str, str]] = {
    'embed': dict(key='EMBED_PORT', value='3002'),
    'generate': dict(key='LLM_PORT', value='3001'),
  }
  return f'http://127.0.0.1:{os.getenv((k := var[task])["key"], k["value"])}' if os.getenv('DEVELOPMENT') else None


@bentoml.asgi_app(llm_app, path='/v1')
@bentoml.service(labels=make_labels('generate'), envs=make_env(0), **make_engine_service_config())
class LLM:
  model_id = LLM_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  def setup_client(self):
    self.client = openai.AsyncOpenAI(base_url=f'{LLM.url}/v1', api_key='dummy')

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import vllm.entrypoints.openai.api_server as vllm_api_server

    args = make_args(self.model, self.model_id, task='generate')

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
      ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
      ['/completions', vllm_api_server.create_completion, ['POST']],
      ['/models', vllm_api_server.show_available_models, ['GET']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS:
      router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    llm_app.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()
    await vllm_api_server.init_app_state(self.engine, self.model_config, llm_app.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.exit_stack.aclose()

  @bentoml.api
  async def generate(
    self,
    prompt: str,
    *,
    temperature: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['temperature'],
    top_p: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['top_p'],
    max_tokens: t.Annotated[int, at.Ge(256), at.Le(MAX_TOKENS)] = MAX_TOKENS,
    usage: bool = False,
  ) -> t.AsyncGenerator[str, None]:
    prefill = False
    try:
      completions = t.cast(
        openai.AsyncStream[ChatCompletionChunk],
        await self.client.chat.completions.create(
          model=self.model_id,
          temperature=temperature,
          top_p=top_p,
          max_tokens=max_tokens,
          messages=[ChatCompletionUserMessageParam(role='user', content=prompt)],
          stream=True,
          extra_body={'guided_json': Suggestions.model_json_schema()},
          stream_options={'continuous_usage_stats': True, 'include_usage': True} if usage else None,
        ),
      )
      async for chunk in completions:
        delta_choice = t.cast('DeltaMessage', chunk.choices[0].delta)
        if hasattr(delta_choice, 'reasoning_content'):
          s = Suggestion(
            suggestion=delta_choice.content or '', reasoning=delta_choice.reasoning_content or '', usage=chunk.usage
          )
        else:
          s = Suggestion(suggestion=delta_choice.content or '', usage=chunk.usage)
        if not prefill:
          prefill = True
          yield ''
        else:
          if not s.reasoning and not s.suggestion:
            break
          yield f'{s.model_dump_json()}\n\n'
    except Exception:
      logger.error(traceback.format_exc())
      yield f'{Suggestion(suggestion="Internal error found. Check server logs for more information").model_dump_json()}\n\n'
      return


@bentoml.asgi_app(embed_app, path='/v1')
@bentoml.service(labels=make_labels('embed'), envs=make_env(0), **make_engine_service_config('embed'))
class Embeddings:
  model_id = EMBED_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  def setup_client(self):
    self.client = openai.AsyncOpenAI(base_url=f'{Embeddings.url}/v1', api_key='dummy')

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import torch, vllm.entrypoints.openai.api_server as vllm_api_server

    args = make_args(
      self.model,
      self.model_id,
      task='embed',
      max_model_len=embed_['max_model_len'],
      reasoning=False,
      trust_remote_code=embed_['trust_remote_code'],
      prefix_caching=False,
      dtype=torch.float16,
      hf_overrides={'is_causal': True},
    )

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
      ['/models', vllm_api_server.show_available_models, ['GET']],
      ['/embeddings', vllm_api_server.create_embedding, ['POST']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS:
      router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    embed_app.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()

    await vllm_api_server.init_app_state(self.engine, self.model_config, embed_app.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.exit_stack.aclose()

  @bentoml.api
  async def generate(self, content: str) -> list[Embedding]:
    try:
      results = await self.client.embeddings.create(input=[content], model=self.model_id)
      return results.data
    except Exception:
      logger.error(traceback.format_exc())
      raise


@bentoml.asgi_app(app)
@bentoml.service(
  name='asteraceae-inference-api',
  resources={'cpu': 4},
  labels={'owner': 'aarnphm', 'type': 'api'},
  envs=make_env(0, skip_hf=True),
  **SERVICE_CONFIG,
)
class API:
  llm = bentoml.depends(LLM, url=make_url('generate'))
  embed = bentoml.depends(Embeddings, url=make_url('embed'))

  def __init__(self):
    loader = jinja2.FileSystemLoader(searchpath=WORKING_DIR)
    self.templater = jinja2.Environment(loader=loader)

  @bentoml.on_startup
  def setup_clients(self):
    self.llm_client = openai.AsyncOpenAI(
      base_url=f'{t.cast("RemoteProxy", self.llm).client_url}/v1',
      api_key='dummy',
      default_headers={'Runner-Name': LLM.name},
    )
    self.embed_client = openai.AsyncOpenAI(
      base_url=f'{t.cast("RemoteProxy", self.embed).client_url}/v1',
      api_key='dummy',
      default_headers={'Runner-Name': Embeddings.name},
    )

    self.embed_model = OpenAIEmbedding(
      api_key='dummy',
      model_name=Embeddings.inner.model_id,
      api_base=f'{t.cast("RemoteProxy", self.embed).client_url}/v1',
      dimensions=None,
      default_headers={'Runner-Name': Embeddings.name},
    )
    self.llm_model = OpenAILike(
      model=LLM.inner.model_id,
      tokenizer=LLM.inner.model_id,
      api_key='dummy',
      api_version='',
      api_base=f'{t.cast("RemoteProxy", self.llm).client_url}/v1',
      is_chat_model=True,
      max_tokens=MAX_TOKENS,
      context_window=MAX_MODEL_LEN,
      temperature=llm_['temperature'],
      default_headers={'Runner-Name': LLM.name},
      strict=True,
    )

    chunker = SemanticSplitterNodeParser(
      buffer_size=1, breakpoint_percentile_threshold=95, embed_model=self.embed_model
    )
    line_extractor = LineNumberMetadataExtractor()
    title_extractor = TitleExtractor(llm=self.llm_model)

    self.pipeline = IngestionPipeline(transformations=[chunker, line_extractor, title_extractor, self.embed_model])

  def handle_requested_backend(self, extra_body: dict[str, t.Any] | None = None) -> SupportedBackend:
    backend = DEFAULT_BACKEND

    if backend not in SUPPORTED_BACKENDS:
      raise ValueError(f"Backend '{backend}' is not yet supported. Current supported backend: {SUPPORTED_BACKENDS}")

    if extra_body is not None:
      requested_backend = extra_body.pop('backend', DEFAULT_BACKEND)
      if requested_backend not in SUPPORTED_BACKENDS:
        raise ValueError(f"Backend '{backend}' is not yet supported. Current supported backend: {SUPPORTED_BACKENDS}")
      backend = requested_backend
    return backend

  @bentoml.api(route='/v1/embeddings')
  async def embeddings(
    self,
    *,
    input: str | list[str],
    model: str = Embeddings.inner.model_id,
    extra_headers: dict[str, t.Any] | None = None,
    extra_query: dict[str, t.Any] | None = None,
    extra_body: dict[str, t.Any] | None = None,
    timeout: float | None = None,
  ) -> CreateEmbeddingResponse:
    """Partially complete Embeddings API: https://platform.openai.com/docs/api-reference/embeddings

    This is a router to call internal Embeddings models within the replica.
    Current supported engines:
      - vLLM

    To use different backends, pass in `extra_headers={"backend": "different_backend"}`
    """
    backend = self.handle_requested_backend(extra_body)

    try:
      if backend == 'vllm':
        # TODO: support dimensions on vLLM
        return await self.embed_client.embeddings.create(
          input=input,
          model=model,
          **dict_filter_none(
            dict(extra_headers=extra_headers, extra_body=extra_body, extra_query=extra_query, timeout=timeout)
          ),
        )
      else:
        raise ValueError('Unsupported backend')
    except Exception:
      logger.error(traceback.format_exc())
      raise

  @app.get('/v1/models')
  async def models(
    self,
    extra_headers: dict[str, t.Any] | None = None,
    extra_query: dict[str, t.Any] | None = None,
    extra_body: dict[str, t.Any] | None = None,
    timeout: float | None = None,
  ):
    from vllm.entrypoints.openai.protocol import ModelCard, ModelList

    results = await asyncio.gather(*[
      caller(
        **dict_filter_none(
          dict(extra_headers=extra_headers, extra_body=extra_body, extra_query=extra_query, timeout=timeout)
        )
      )
      for caller in [self.llm_client.models.list, self.embed_client.models.list]
    ])
    return ModelList(
      data=[ModelCard(**d.model_dump()) for d in list(itertools.chain.from_iterable(p.data for p in results))]
    )

  @bentoml.api
  async def suggests(self, request: SuggestRequest, /) -> t.AsyncGenerator[str, None]:
    # TODO: add tonality lookup and steering vector strength for influence the distributions
    # for now, we will just use the features lookup from given SAEs constrasted with the models.
    async for chunk in self.llm.generate(
      prompt=self.templater.get_template('SYSTEM_PROMPT.md').render(
        num_suggestions=request.num_suggestions,
        authors=request.authors,
        tonality=request.tonality,
        excerpt=request.essay,
      ),
      temperature=request.temperature,
      max_tokens=request.max_tokens,
      top_p=request.top_p,
      usage=request.usage,
    ):
      yield chunk

  @bentoml.task
  async def notes(self, note: NoteRequest, /) -> NotesResponse:
    try:
      result = await self.embed.generate(note.content)
      return NotesResponse(embedding=result[0].embedding, **note.model_dump(exclude={'content'}))
    except Exception as e:
      traceback.print_exc()
      return NotesResponse(embedding=[], error=str(e), **note.model_dump(exclude={'content'}))

  @bentoml.task
  async def essays(self, essay: EssayRequest, /) -> EssayResponse:
    try:
      result = await self.pipeline.arun(
        show_progress=True,
        documents=[Document(text=essay.content, doc_id=essay.file_id, metadata=dict(vault_id=essay.vault_id))],
        num_workers=multiprocessing.cpu_count(),
      )
      return EssayResponse(
        nodes=[
          EssayNode(
            embedding=it.embedding,
            node_id=it.node_id,
            metadata=it.metadata,
            relationships=it.relationships,
            metadata_separator=it.metadata_separator,
          )
          for it in result
        ],
        **essay.model_dump(exclude={'content'}),
      )
    except Exception as e:
      traceback.print_exc()
      return EssayResponse(nodes=[], error=str(e), **essay.model_dump(exclude={'content'}))

  @bentoml.api
  async def health(self, request: HealthRequest, /) -> HealthResponse:
    async def check_service_health(service: RemoteProxy, name: str) -> DependentStatus:
      health = DependentStatus(name=name)
      try:
        start_time = time.time()
        health.healthy = await service.is_ready(request.timeout)
        health.latency_ms = round((time.time() - start_time) * 1000, 2)
      except Exception as e:
        health.healthy = False
        health.error = str(e)
      return health

    healthcheck = await asyncio.gather(*[
      asyncio.create_task(check_service_health(t.cast('RemoteProxy', h), name))
      for h, name in zip([self.llm, self.embed], ['llm', 'embed'])
    ])

    return HealthResponse(
      services=healthcheck,
      healthy=all(map(lambda x: x.healthy, healthcheck)),
      timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )


@app.get('/metadata')
def metadata() -> MetadataResponse:
  return MetadataResponse.model_construct(
    llm={'model_id': LLM_ID, 'model_type': MODEL_TYPE, 'structured_outputs': llm_['structured_output_backend']},
    embed={
      'model_id': EMBED_ID,
      'model_type': EMBED_TYPE,
      'M': 16,
      'ef_construction': 50,
      'dimensions': embed_['dimensions'],
    },
  )
