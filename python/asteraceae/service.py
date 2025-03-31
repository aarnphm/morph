from __future__ import annotations

import argparse
import logging, traceback, asyncio, os, shutil, contextlib, pathlib, time, datetime, typing as t
import bentoml, fastapi, jinja2, annotated_types as ae

with bentoml.importing():
  import hnswlib, openai

  from openai.types.chat import ChatCompletionUserMessageParam
  from llama_index.core.storage.docstore import SimpleDocumentStore
  from llama_index.core import VectorStoreIndex, StorageContext, Document
  from llama_index.core.ingestion import IngestionPipeline
  from llama_index.core.node_parser import SemanticSplitterNodeParser
  from llama_index.core.extractors import TitleExtractor
  from llama_index.embeddings.openai import OpenAIEmbedding
  from llama_index.llms.openai_like import OpenAILike
  from llama_index.vector_stores.hnswlib import HnswlibVectorStore

  from libs.helpers import LineNumberMetadataExtractor, make_labels, inference_service
  from libs.protocol import (
    ReasoningModels,
    EmbeddingModels,
    ServiceOpts,
    EmbedType,
    ModelType,
    Essay,
    Note,
    EmbedMetadata,
    EmbedTask,
    DocumentType,
    DependentStatus,
    HealthStatus,
    Suggestion,
    Suggestions,
    TaskType,
    Tonality,
  )

if t.TYPE_CHECKING:
  from _bentoml_impl.client import RemoteProxy
  from _bentoml_sdk.service.factory import Service
  from vllm.entrypoints.openai.protocol import DeltaMessage

logger = logging.getLogger('bentoml.service')


WORKING_DIR = pathlib.Path(__file__).parent
IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', 16 * 1024))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', 8 * 1024))
AUTHORS = ['Raymond Carver', 'Franz Kafka', 'Albert Camus', 'Iain McGilchrist', 'Ian McEwan']

MODEL_TYPE = t.cast(ModelType, os.getenv('LLM', 'r1-qwen'))
LLM_ID: str = (llm_ := ReasoningModels[MODEL_TYPE])['model_id']
EMBED_TYPE = t.cast(EmbedType, os.getenv('EMBED', 'gte-qwen-fast'))
EMBED_ID: str = (embed_ := EmbeddingModels[EMBED_TYPE])['model_id']


SERVICE_CONFIG: ServiceOpts = {
  'tracing': {'sample_rate': 1.0},
  'traffic': {'timeout': 1000, 'concurrency': 128},
  'http': {
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
  'image': bentoml.images.PythonImage(python_version='3.11')
  .system_packages('curl', 'git', 'build-essential', 'clang')
  .pyproject_toml('pyproject.toml')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6'),
}


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
    {'name': 'CXX', 'value': shutil.which('c++')},
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
  max_tokens: int = MAX_MODEL_LEN,
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
    max_model_len=max_tokens,
    ignore_patterns=IGNORE_PATTERNS,
    enable_reasoning=reasoning,
    trust_remote_code=trust_remote_code,
    reasoning_parser=reasoning_parser,
    guided_decoding_backend=llm_['structured_output_backend'],
    **kwargs,
  )
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


inference_api = fastapi.FastAPI()


@bentoml.asgi_app(inference_api, path='/v1')
@bentoml.service(labels=make_labels('generate'), envs=make_env(0), **make_engine_service_config())
class LLM:
  model_id = LLM_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()
    self.client = openai.AsyncOpenAI(base_url='http://127.0.0.1:3000/v1', api_key='dummy')

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
    inference_api.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()
    await vllm_api_server.init_app_state(self.engine, self.model_config, inference_api.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.exit_stack.aclose()

  @bentoml.api
  async def generate(
    self,
    prompt: str,
    *,
    temperature: t.Annotated[float, ae.Ge(0), ae.Le(1)] = llm_['temperature'],
    top_p: t.Annotated[float, ae.Ge(0), ae.Le(1)] = llm_['top_p'],
    max_tokens: t.Annotated[int, ae.Ge(256), ae.Le(MAX_TOKENS)] = MAX_TOKENS,
    usage: bool = False,
  ) -> t.AsyncGenerator[str, None]:
    prefill = False
    try:
      completions = await self.client.chat.completions.create(
        model=self.model_id,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        messages=[ChatCompletionUserMessageParam(role='user', content=prompt)],
        stream=True,
        extra_body={'guided_json': Suggestions.model_json_schema()},
        stream_options={'continuous_usage_stats': True, 'include_usage': True} if usage else None,
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


@inference_service(
  hf_id=EMBED_ID,
  exclude=IGNORE_PATTERNS,
  task='embed',
  envs=make_env(0),
  service_config=make_engine_service_config('embed'),
)
class Embedding:
  def __init__(self):
    super().__init__()
    self.args = make_args(
      self.model,
      self.model_id,
      task='embed',
      max_tokens=embed_['max_tokens'],
      reasoning=False,
      trust_remote_code=True,
      prefix_caching=False,
      hf_overrides={'is_causal': True},
    )


api_app = fastapi.FastAPI()


@bentoml.asgi_app(api_app)
@bentoml.service(
  name='asteraceae-inference-api',
  resources={'cpu': 2},
  labels={'owner': 'aarnphm', 'type': 'api'},
  envs=make_env(0, skip_hf=True),
  **SERVICE_CONFIG,
)
class API:
  llm = bentoml.depends(LLM, url=make_url('generate'))
  embedding = bentoml.depends(Embedding, url=make_url('embed'))

  # vector stores configuration
  M: int = 16
  ef_construction: int = 50
  max_elements: int = 10000
  dimensions: int = embed_['dimensions']
  space: t.Literal['ip', 'l2', 'cosine'] = 'l2'

  def __init__(self):
    loader = jinja2.FileSystemLoader(searchpath=WORKING_DIR)
    self.templater = jinja2.Environment(loader=loader)

  @bentoml.on_startup
  def setup_clients(self):
    self.llm_openai_client = openai.AsyncOpenAI(base_url=f'{self.llm.client_url}/v1', api_key='dummy')
    self.embed_openai_client = openai.AsyncOpenAI(base_url=f'{self.embedding.client_url}/v1', api_key='dummy')

    self.embed_model = OpenAIEmbedding(
      api_key='dummy',
      model_name=Embedding.inner.model_id,
      api_base=f'{self.embedding.client_url}/v1',
      dimensions=None,  # TODO: support dimensions in vLLM
      default_headers={'Runner-Name': Embedding.name, 'Access-Control-Allow-Origin': '*'},
    )
    self.embed_model._aclient = self.embed_openai_client
    self.llm_model = OpenAILike(
      model=LLM.inner.model_id,
      api_key='dummy',
      api_base=f'{self.llm.client_url}/v1',
      is_chat_model=True,
      max_tokens=MAX_TOKENS,
      context_window=MAX_MODEL_LEN,
      temperature=llm_['temperature'],
      default_headers={'Runner-Name': LLM.name, 'Access-Control-Allow-Origin': '*'},
    )

  @bentoml.on_startup
  def setup_parsers_tooling(self):
    hnsw_index = hnswlib.Index(space=self.space, dim=self.dimensions)
    hnsw_index.init_index(max_elements=self.max_elements, ef_construction=self.ef_construction, M=self.M)
    vector_store = HnswlibVectorStore(hnsw_index)
    docstore = SimpleDocumentStore()
    storage_context = StorageContext.from_defaults(docstore=docstore, vector_store=vector_store)
    self.index = VectorStoreIndex.from_documents([], storage_context=storage_context, embed_model=self.embed_model)

    chunker = SemanticSplitterNodeParser(
      buffer_size=1, breakpoint_percentile_threshold=95, embed_model=self.embed_model
    )
    line_extractor = LineNumberMetadataExtractor()
    title_extractor = TitleExtractor(llm=self.llm_model)

    self.pipeline = IngestionPipeline(
      transformations=[chunker, line_extractor, title_extractor, self.embed_model],
      docstore=docstore,
      vector_store=vector_store,
    )

  @bentoml.task
  async def essays(self, essay: Essay) -> EmbedTask:
    metadata = EmbedMetadata(vault=essay.vault_id, file=essay.file_id, type=DocumentType.ESSAY)

    try:
      result = await self.pipeline.arun(
        show_progress=True,
        documents=[
          Document(text=essay.content, doc_id=essay.file_id, metadata=metadata.model_dump(exclude={'node_ids'}))
        ],
        num_workers=2,
      )
      return EmbedTask(
        metadata=metadata.model_copy(update={'node_ids': [it.node_id for it in result]}),
        embedding=[it.embedding for it in result],
      )
    except Exception:
      logger.error(traceback.format_exc())
      return EmbedTask(
        metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
      )

  @bentoml.task
  async def notes(self, note: Note) -> EmbedTask:
    metadata = EmbedMetadata(vault=note.vault_id, file=note.file_id, type=DocumentType.NOTE, note=note.note_id)

    try:
      results = await self.embed_openai_client.embeddings.create(
        input=[note.content], model=Embedding.inner.model_id, extra_headers={'Runner-Name': Embedding.name}
      )
      return EmbedTask(metadata=metadata, embedding=[results.data[0].embedding])
    except Exception:
      logger.error(traceback.format_exc())
      return EmbedTask(
        metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
      )

  @bentoml.api
  async def suggests(
    self,
    essay: str,
    authors: t.Optional[list[str]] = AUTHORS,
    tonality: t.Optional[Tonality] = None,
    num_suggestions: t.Annotated[int, ae.Ge(2)] = 3,
    *,
    top_p: t.Annotated[float, ae.Ge(0), ae.Le(1)] = llm_['top_p'],
    temperature: t.Annotated[float, ae.Ge(0), ae.Le(1)] = llm_['temperature'],
    max_tokens: t.Annotated[int, ae.Ge(256), ae.Le(MAX_TOKENS)] = MAX_TOKENS,
    usage: bool = True,
  ) -> t.AsyncGenerator[str, None]:
    # TODO: add tonality lookup and steering vector strength for influence the distributions
    # for now, we will just use the features lookup from given SAEs constrasted with the models.
    async for chunk in self.llm.generate(
      prompt=self.templater.get_template('SYSTEM_PROMPT.md').render(
        num_suggestions=num_suggestions, authors=authors, tonality=tonality, excerpt=essay
      ),
      temperature=temperature,
      max_tokens=max_tokens,
      top_p=top_p,
      usage=usage,
    ):
      yield chunk


@api_app.get('/health')
async def health(engine: Service = fastapi.Depends(LLM), embed: Service = fastapi.Depends(Embedding)):
  async def check_service_health(service: Service) -> DependentStatus:
    health = DependentStatus(name=service.name)
    try:
      start_time = time.time()
      health.healthy = await t.cast('RemoteProxy', service).is_ready(30)
      health.latency_ms = round((time.time() - start_time) * 1000, 2)
    except Exception as e:
      health.healthy = False
      health.error = str(e)
    return health

  healthcheck = await asyncio.gather(*[asyncio.create_task(check_service_health(h)) for h in [engine, embed]])
  return HealthStatus(
    services=healthcheck,
    healthy=all(map(lambda x: x.healthy, healthcheck)),
    timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
  )


@api_app.get('/metadata')
def metadata(api: Service = fastapi.Depends(API)) -> dict[str, t.Any]:
  return {
    'llm': {'model_id': LLM_ID, 'model_type': MODEL_TYPE, 'structured_outputs': llm_['structured_output_backend']},
    'embed': {
      'model_id': EMBED_ID,
      'model_type': EMBED_TYPE,
      'M': api.M,
      'ef_construction': api.ef_construction,
      'dimensions': api.dimensions,
    },
  }
