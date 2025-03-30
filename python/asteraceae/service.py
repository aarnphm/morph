from __future__ import annotations

import logging, argparse, traceback, asyncio, os, contextlib, pathlib, time, datetime, typing as t
import bentoml, fastapi, jinja2, annotated_types as ae

with bentoml.importing():
  import hnswlib, openai, transformers

  from openai.types.chat import ChatCompletionUserMessageParam
  from llama_index.core import VectorStoreIndex, StorageContext
  from llama_index.core.node_parser import SemanticSplitterNodeParser, SentenceSplitter
  from llama_index.core.schema import TextNode
  from llama_index.embeddings.openai import OpenAIEmbedding
  from llama_index.vector_stores.hnswlib import HnswlibVectorStore

  from libs.protocol import ServiceOpts

from libs.protocol import (
  ReasoningModels,
  EmbeddingModels,
  SERVICE_CONFIG,
  EmbedType,
  ModelType,
  Essay,
  Note,
  EmbedMetadata,
  EmbedTask,
  DocumentType,
  ServiceHealth,
  HealthStatus,
  Suggestion,
  Suggestions,
)

if t.TYPE_CHECKING:
  from _bentoml_impl.client import RemoteProxy
  from vllm.entrypoints.openai.protocol import DeltaMessage

logger = logging.getLogger('bentoml.service')


WORKING_DIR = pathlib.Path(__file__).parent
IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', 16 * 1024))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', 8 * 1024))

LLM_ID: str = (llm_ := ReasoningModels[t.cast(ModelType, os.getenv('LLM', 'r1-qwen'))])['model_id']
STRUCTURED_OUTPUT_BACKEND = llm_['structured_output_backend']

EMBED_ID: str = (embed_ := EmbeddingModels[t.cast(EmbedType, os.getenv('EMBED', 'gte-qwen'))])['model_id']
DIMENSIONS = embed_['dimensions']


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
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': str(engine_version)},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR / 'logging-config.json').__fspath__()},
  ])
  return results


TaskType = t.Literal['generate', 'embed']


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
    guided_decoding_backend=STRUCTURED_OUTPUT_BACKEND,
    **kwargs,
  )
  args = make_arg_parser(FlexibleArgumentParser()).parse_args([])
  for k, v in variables.items():
    setattr(args, k, v)
  return args


def make_labels(task: TaskType) -> dict[str, t.Any]:
  return {'owner': 'aarnphm', 'type': 'engine', 'task': task}


def make_url(task: TaskType) -> str | None:
  var: dict[TaskType, dict[str, str]] = {
    'embed': dict(key='EMBED_PORT', value='3002'),
    'generate': dict(key='LLM_PORT', value='3001'),
  }
  return f'http://127.0.0.1:{os.getenv((k := var[task])["key"], k["value"])}' if os.getenv('DEVELOPMENT') else None


inference_api = fastapi.FastAPI()


@bentoml.asgi_app(inference_api, path='/v1')
@bentoml.service(labels=make_labels('generate'), envs=make_env(0), **make_engine_service_config())
class Engine:
  model_id = LLM_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import vllm.entrypoints.openai.api_server as vllm_api_server

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
      ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
      ['/models', vllm_api_server.show_available_models, ['GET']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS:
      router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    inference_api.include_router(router)

    args = make_args(self.model, self.model_id, task='generate')
    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()
    await vllm_api_server.init_app_state(self.engine, self.model_config, inference_api.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.exit_stack.aclose()


embedding_api = fastapi.FastAPI()


@bentoml.asgi_app(embedding_api, path='/v1')
@bentoml.service(labels=make_labels('embed'), envs=make_env(0), **make_engine_service_config('embed'))
class Embeddings:
  model_id = EMBED_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import torch, vllm.entrypoints.openai.api_server as vllm_api_server

    args = make_args(
      self.model,
      self.model_id,
      task='embed',
      max_tokens=8192,
      reasoning=False,
      trust_remote_code=True,
      prefix_caching=False,
      dtype=torch.bfloat16,
      hf_overrides={'is_causal': True},
    )

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
      ['/models', vllm_api_server.show_available_models, ['GET']],
      ['/embeddings', vllm_api_server.create_embedding, ['POST']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS:
      router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    embedding_api.include_router(router)

    self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(args))
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()

    await vllm_api_server.init_app_state(self.engine, self.model_config, embedding_api.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.exit_stack.aclose()


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
  envs=make_env(0, skip_hf=True),
  **SERVICE_CONFIG,
)
class API:
  llm = bentoml.depends(Engine, url=make_url('generate'))
  embedding = bentoml.depends(Embeddings, url=make_url('embed'))

  metapath = WORKING_DIR / 'indexes'

  # vector stores configuration
  dimensions: int = DIMENSIONS
  M: int = 16
  ef_construction: int = 50
  max_elements: int = 10000
  space: t.Literal['ip', 'l2', 'cosine'] = 'l2'

  def __init__(self):
    loader = jinja2.FileSystemLoader(searchpath=WORKING_DIR)
    self.jinja2_env = jinja2.Environment(loader=loader)

  @bentoml.on_startup
  def setup_clients(self):
    self.bento_llm = self.llm.to_async.client
    self.bento_embedding = self.embedding.to_async.client

    self.openai_llm = openai.AsyncOpenAI(base_url=f'{self.llm.client_url}/v1', api_key='dummy')
    self.openai_embed = openai.AsyncOpenAI(base_url=f'{self.embedding.client_url}/v1', api_key='dummy')

    self.wrapper_embed = OpenAIEmbedding(
      dimensions=self.dimensions,
      http_client=self.embedding.to_sync.client,
      async_http_client=self.embedding.to_async.client,
      default_headers={'Runner-Name': Embeddings.name},
    )

  @bentoml.on_startup
  def setup_parsers_tooling(self):
    self.metapath.mkdir(exist_ok=True)

    tokenizer = transformers.AutoTokenizer.from_pretrained(Embeddings.inner.model_id)
    self.sentence_splitter = SentenceSplitter(
      # NOTE: that this supports linebreaks in Quartz and Obsidian.
      paragraph_separator='\n\n',
      tokenizer=tokenizer,
      chunk_size=1024,
      chunk_overlap=20,
    )
    self.chunker = SemanticSplitterNodeParser(
      buffer_size=1,
      breakpoint_percentile_threshold=95,
      embed_model=self.wrapper_embed,
      sentence_splitter=self.sentence_splitter,
    )

    hnsw_index = hnswlib.Index(space=self.space, dim=self.dimensions)
    hnsw_index.init_index(max_elements=self.max_elements, ef_construction=self.ef_construction, M=self.M)
    storage_context = StorageContext.from_defaults(vector_store=HnswlibVectorStore(hnsw_index))
    self.index = VectorStoreIndex.from_documents([], storage_context=storage_context, embed_model=self.wrapper_embed)

  @bentoml.api
  async def health(self, timeout: int = 30) -> HealthStatus:
    services_health: list[ServiceHealth] = []

    async def check_service_health(name: str) -> ServiceHealth:
      service_health = ServiceHealth(name=name)
      try:
        start_time = time.time()
        service_health.healthy = await t.cast('RemoteProxy', getattr(self, name)).is_ready(timeout)
        service_health.latency_ms = round((time.time() - start_time) * 1000, 2)
      except Exception as e:
        service_health.healthy = False
        service_health.error = str(e)
      return service_health

    # Wait for all health check tasks to complete
    services_health = await asyncio.gather(*[
      asyncio.create_task(check_service_health(name)) for name in ['llm', 'embedding']
    ])

    return HealthStatus(
      services=services_health,
      healthy=all(service.healthy for service in services_health),
      timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )

  @bentoml.task
  async def essays(self, essay: Essay) -> EmbedTask:
    metadata = EmbedMetadata(vault=essay.vault_id, file=essay.file_id, type=DocumentType.ESSAY)

    # Create a unique ID for the essay
    essay_id = f'{essay.vault_id}_{essay.file_id}'

    try:
      # Check if the essay is already in the index
      existing_nodes = self.vector_store.get_by_metadata({'id': essay_id})

      if existing_nodes:
        # Essay already exists in index, return the embedding
        existing_node = existing_nodes[0]
        return EmbedTask(metadata=metadata, embedding=existing_node.embedding)

      # Essay not found, create embedding
      result = await self.embed_model.embeddings.create(
        input=[essay.content], model=self.model_id, extra_headers={'Runner-Name': self.__class__.__name__}
      )

      embedding = result.data[0].embedding

      # Create a node and add to vector store
      node = TextNode(
        text=essay.content,
        metadata={'id': essay_id, 'vault_id': essay.vault_id, 'file_id': essay.file_id},
        embedding=embedding,
      )
      self.vector_store.add([node])

      return EmbedTask(metadata=metadata, embedding=embedding)

    except Exception:
      logger.error(traceback.format_exc())
      return EmbedTask(
        metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
      )

  @bentoml.api(batchable=True)
  async def notes(self, notes: list[Note]) -> list[EmbedTask]:
    results = []

    for note in notes:
      metadata = EmbedMetadata(vault=note.vault_id, file=note.file_id, type=DocumentType.NOTE, note=note.note_id)

      try:
        # Create a unique ID for the note
        note_id = f'{note.vault_id}_{note.file_id}_{note.note_id}'

        # Check if the note is already in the index
        existing_nodes = self.vector_store.get_by_metadata({'id': note_id})

        if existing_nodes:
          # Note already exists in index, return the embedding
          existing_node = existing_nodes[0]
          results.append(EmbedTask(metadata=metadata, embedding=existing_node.embedding))
          continue

        # Note not found, create embedding
        embedding_result = await self.embed_model.embeddings.create(
          input=[note.content], model=self.model_id, extra_headers={'Runner-Name': self.__class__.__name__}
        )

        embedding = embedding_result.data[0].embedding

        # Create a node and add to vector store
        node = TextNode(
          text=note.content,
          metadata={'id': note_id, 'vault_id': note.vault_id, 'file_id': note.file_id, 'note_id': note.note_id},
          embedding=embedding,
        )
        self.vector_store.add([node])

        results.append(EmbedTask(metadata=metadata, embedding=embedding))
      except Exception:
        logger.error(traceback.format_exc())
        results.append(
          EmbedTask(
            metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
          )
        )

    return results

  @bentoml.api
  async def suggests(
    self,
    essay: str,
    authors: t.Optional[list[str]] = None,
    tonality: t.Optional[dict[str, t.Any]] = None,
    num_suggestions: t.Annotated[int, ae.Ge(2)] = 3,
    *,
    temperature: t.Annotated[float, ae.Ge(0), ae.Le(1)] = 0.6,
    max_tokens: t.Annotated[int, ae.Ge(256), ae.Le(MAX_TOKENS)] = MAX_TOKENS,
    usage: bool = False,
  ) -> t.AsyncGenerator[str, None]:
    # TODO: add tonality lookup and steering vector strength for influence the distributions
    # for now, we will just use the features lookup from given SAEs constrasted with the models.
    if authors is None:
      authors = ['Raymond Carver', 'Franz Kafka', 'Albert Camus', 'Iain McGilchrist', 'Ian McEwan']
    PROMPT = self.jinja2_env.get_template('SYSTEM_PROMPT.md').render(
      num_suggestions=num_suggestions, authors=authors, tonality=tonality, excerpt=essay
    )
    prefill = False

    try:
      completions = await self.openai_llm.chat.completions.create(
        model=LLM_ID,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[ChatCompletionUserMessageParam(role='user', content=PROMPT)],
        stream=True,
        extra_body={'guided_json': Suggestions.model_json_schema()},
        extra_headers={'Runner-Name': Engine.name},
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
          yield f'{s.model_dump_json()}\n'
    except Exception:
      logger.error(traceback.format_exc())
      yield f'{Suggestion(suggestion="Internal error found. Check server logs for more information").model_dump_json()}\n'
      return
