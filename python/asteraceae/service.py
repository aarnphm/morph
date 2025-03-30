from __future__ import annotations

import logging, argparse, traceback, asyncio, os, contextlib, pathlib, time, datetime, typing as t
import bentoml, fastapi, pydantic, jinja2, annotated_types as ae

with bentoml.importing():
  import hnswlib, openai

  from openai.types.chat import ChatCompletionUserMessageParam
  from llama_index.core.storage.docstore import SimpleDocumentStore
  from llama_index.core.postprocessor import LLMRerank
  from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter
  from llama_index.core import VectorStoreIndex, StorageContext, Document, QueryBundle
  from llama_index.core.ingestion import IngestionPipeline
  from llama_index.core.node_parser import SemanticSplitterNodeParser
  from llama_index.core.extractors import TitleExtractor
  from llama_index.embeddings.openai import OpenAIEmbedding
  from llama_index.llms.openai_like import OpenAILike
  from llama_index.vector_stores.hnswlib import HnswlibVectorStore
  from llama_index.core.ingestion.pipeline import TransformComponent
  from llama_index.core.schema import BaseNode

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
  TaskType,
)

if t.TYPE_CHECKING:
  from _bentoml_impl.client import RemoteProxy
  from _bentoml_sdk.service.factory import Service
  from vllm.entrypoints.openai.protocol import DeltaMessage

logger = logging.getLogger('bentoml.service')


class LineNumberMetadataExtractor(TransformComponent):
  """A transformation that adds start_line and end_line metadata to nodes."""

  def __call__(self, nodes: t.List[BaseNode], **kwargs: t.Any) -> t.List[BaseNode]:
    for node in nodes:
      # Ensure it's a TextNode derived from a Document and has source info
      if (
        isinstance(node, Document)
        or not hasattr(node, 'source_node')
        or not node.source_node
        or not hasattr(node.source_node, 'text')
      ):
        continue

      original_text = node.source_node.text
      chunk_text = node.get_content()  # Use get_content() for robustness

      node.metadata['start_line'] = -1  # Default value indicating failure
      node.metadata['end_line'] = -1

      try:
        start_char_index = original_text.find(chunk_text)
        if start_char_index == -1:
          # Log a warning if the exact chunk text isn't found
          logger.warning(
            'Could not find exact chunk text for node %s in original document %s. Line numbers will not be added.',
            node.node_id,
            node.source_node.node_id,
          )
          continue

        # Calculate start line (1-based)
        start_line = original_text.count('\n', 0, start_char_index) + 1

        # Calculate end line (1-based)
        # Count newlines *within* the chunk itself
        end_line = start_line + chunk_text.count('\n')

        node.metadata['start_line'] = start_line
        node.metadata['end_line'] = end_line

      except Exception as e:
        logger.error('Error extracting line numbers for node %s: %s', node.node_id, e)
        # Keep default -1 values if an error occurs

    return nodes


WORKING_DIR = pathlib.Path(__file__).parent
IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', 16 * 1024))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', 8 * 1024))

model_type_ = t.cast(ModelType, os.getenv('LLM', 'r1-qwen'))
LLM_ID: str = (llm_ := ReasoningModels[model_type_])['model_id']
TEMPERATURE: float = llm_['temperature']
STRUCTURED_OUTPUT_BACKEND = llm_['structured_output_backend']

embed_type_ = t.cast(EmbedType, os.getenv('EMBED', 'gte-qwen-fast'))
EMBED_ID: str = (embed_ := EmbeddingModels[embed_type_])['model_id']
DIMENSIONS = embed_['dimensions']


class RerankRequest(pydantic.BaseModel):
  vault_id: str
  file_id: str
  notes_text: str
  similarity_top_k: int = 10
  rerank_top_n: int = 1


class RerankResponse(pydantic.BaseModel):
  node_id: str
  text: str
  score: t.Optional[float] = None
  error: t.Optional[str] = None


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


api_app = fastapi.FastAPI()


@bentoml.asgi_app(api_app)
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
    self.llm_openai_client = openai.AsyncOpenAI(base_url=f'{self.llm.client_url}/v1', api_key='dummy')
    self.embed_openai_client = openai.AsyncOpenAI(base_url=f'{self.embedding.client_url}/v1', api_key='dummy')

    self.embed_model = OpenAIEmbedding(
      api_key='dummy',
      model_name=Embeddings.inner.model_id,
      api_base=f'{self.embedding.client_url}/v1',
      dimensions=None,  # TODO: support dimensions in vLLM
      default_headers={'Runner-Name': Embeddings.name},
    )
    self.embed_model._aclient = self.embed_openai_client
    self.llm_model = OpenAILike(
      model=Engine.inner.model_id,
      api_key='dummy',
      api_base=f'{self.llm.client_url}/v1',
      is_chat_model=True,
      max_tokens=MAX_TOKENS,
      context_window=MAX_MODEL_LEN,
      temperature=TEMPERATURE,
      default_headers={'Runner-Name': Engine.name},
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
        input=[note.content], model=Embeddings.inner.model_id, extra_headers={'Runner-Name': Embeddings.name}
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
    authors: t.Optional[list[str]] = None,
    tonality: t.Optional[dict[str, t.Any]] = None,
    num_suggestions: t.Annotated[int, ae.Ge(2)] = 3,
    *,
    temperature: t.Annotated[float, ae.Ge(0), ae.Le(1)] = TEMPERATURE,
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
      completions = await self.llm_openai_client.chat.completions.create(
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

  @bentoml.api
  async def rerank(self, request: RerankRequest) -> RerankResponse:
    """
    Reranks chunks from a specific essay based on the provided notes text.
    """
    try:
      # 1. Define metadata filters
      filters = MetadataFilters(
        filters=[
          ExactMatchFilter(key='vault', value=request.vault_id),
          ExactMatchFilter(key='file', value=request.file_id),
          ExactMatchFilter(key='type', value=DocumentType.ESSAY.value),
        ]
      )

      # 2. Get retriever with filters
      retriever = self.index.as_retriever(similarity_top_k=request.similarity_top_k, filters=filters)

      # 3. Instantiate LLMRerank
      # Using the LLM already configured in the service
      reranker = LLMRerank(
        llm=self.llm_model,
        top_n=request.rerank_top_n,
        # choice_batch_size can be adjusted based on model context window and performance needs
        choice_batch_size=5,
      )

      # 4. Create RetrieverQueryEngine
      # Note: We use aquery directly on the retriever + reranker for simplicity,
      # as we don't need the full synthesis capabilities of the query engine here.
      # If synthesis were needed later, RetrieverQueryEngine would be appropriate.
      # query_engine = RetrieverQueryEngine(retriever=retriever, node_postprocessors=[reranker])
      # response = await query_engine.aquery(request.notes_text)

      # Alternative: Direct retrieval and reranking
      query_bundle = QueryBundle(request.notes_text)
      retrieved_nodes = await retriever.aretrieve(query_bundle)
      reranked_nodes = await reranker.apostprocess_nodes(retrieved_nodes, query_bundle=query_bundle)

      if not reranked_nodes:
        return RerankResponse(node_id='', text='', error='No relevant chunks found after reranking.')

      # 5. Extract top node
      top_node = reranked_nodes[0]  # LLMRerank returns sorted nodes

      return RerankResponse(node_id=top_node.node.node_id, text=top_node.node.get_content(), score=top_node.score)

    except Exception:
      logger.error(
        'Error during rerank for vault %s, file %s: %s', request.vault_id, request.file_id, traceback.format_exc()
      )
      return RerankResponse(node_id='', text='', error='Internal server error check logs for more information')


@api_app.get('/metadata')
def metadata(api: Service = fastapi.Depends(API)) -> dict[str, t.Any]:
  return dict(
    llm=dict(model_type=model_type_, model_id=LLM_ID, structured_outputs=STRUCTURED_OUTPUT_BACKEND),
    embed=dict(
      model_id=EMBED_ID, M=api.M, ef_construction=api.ef_construction, embed_type=embed_type_, dimensions=DIMENSIONS
    ),
  )
