from __future__ import annotations

import enum
import logging, traceback, os, contextlib, pathlib, typing as t
import bentoml, fastapi, pydantic, jinja2, numpy as np, annotated_types as ae

with bentoml.importing():
  import openai
  import hnswlib
  from llama_index.core import Document
  from llama_index.core.node_parser import SemanticSplitterNodeParser, SentenceSplitter
  from llama_index.core.schema import TextNode
  from llama_index.embeddings.openai import OpenAIEmbedding


if t.TYPE_CHECKING:
  from vllm.entrypoints.openai.protocol import DeltaMessage
  from _bentoml_sdk.images import Image
  from _bentoml_sdk.service.config import TrafficSchema, TracingSchema

logger = logging.getLogger(__name__)


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
  .pyproject_toml('pyproject.toml')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6'),
  'traffic': {'timeout': 1000, 'concurrency': 128},
  'tracing': {'sample_rate': 1.0},
}
VLLM_ENV = [
  {'name': 'HF_TOKEN'},
  {'name': 'UV_NO_PROGRESS', 'value': '1'},
  {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
  {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
  {'name': 'VLLM_USE_V1', 'value': '0'},
  {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR / 'logging-config.json').__fspath__()},
]


class Suggestion(pydantic.BaseModel):
  suggestion: str
  reasoning: str = pydantic.Field(default='')


class Suggestions(pydantic.BaseModel):
  suggestions: list[Suggestion]


inference_api = fastapi.FastAPI()


@bentoml.asgi_app(inference_api, path='/v1')
@bentoml.service(
  name='asteraceae-inference-engine',
  resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
  labels={'owner': 'aarnphm', 'type': 'engine', 'task': 'generate'},
  envs=VLLM_ENV,
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
    args.task = 'generate'
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
  async def teardown_engine(self):
    await self.exit_stack.aclose()


class Essay(pydantic.BaseModel):
  vault_id: str
  file_id: str
  content: str


class Note(pydantic.BaseModel):
  file_id: str
  note_id: str
  content: str


embedding_api = fastapi.FastAPI()


@bentoml.asgi_app(embedding_api, path='/v1')
@bentoml.service(
  name='asteraceae-embedding-engine',
  resources={'gpu': 1, 'gpu_type': 'nvidia-tesla-a100'},
  labels={'owner': 'aarnphm', 'type': 'engine', 'task': 'embed'},
  envs=VLLM_ENV,
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
    args.task = 'embed'
    args.model = self.model
    args.disable_log_requests = True
    args.max_log_len = 1000
    args.served_model_name = [self.model_id]
    args.request_logger = None
    args.disable_log_stats = True
    args.use_tqdm_on_load = False
    args.enable_prefix_caching = True
    args.max_model_len = 8192
    args.ignore_patterns = IGNORE_PATTERNS

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

  @bentoml.on_startup
  def setup_parsers_tooling(self):
    self.embed_model = OpenAIEmbedding(
      model_name=self.model_id,
      api_base=f'{Embeddings.client_url}/v1',
      api_key='dummy',
      dimensions=None,
      additional_headers={'Runner-Name': self.__class__.__name__},
    )

    # Initialize the semantic chunker
    self.sentence_splitter = SentenceSplitter(
      paragraph="\n\n",  # note that this supports linebreaks in Quartz and Obsidian.
      tokenizer=self.tokenizer,
    )
    self.chunker = SemanticSplitterNodeParser(buffer_size=1, breakpoint_percentile_threshold=95,
                                              embed_model=self.embed_model, sentence_splitter=self.sentence_splitter)

  @bentoml.task
  async def essays(self, essay: Essay) -> list[EmbedTask]:
    """Process and embed essay markdown content using semantic chunking.

    For each essay:
    1. Create a Document from the content
    2. Use SemanticChunker to create semantically relevant chunks
    3. Embed each chunk and store with metadata
    """
    results = []
    try:
      # Create document from essay content
      doc = Document(text=essay.content)

      # Apply semantic chunking to get meaningful chunks
      nodes = self.semantic_chunker.get_nodes_from_documents([doc])

      # Process each semantic chunk
      for i, node in enumerate(nodes):
        # Skip empty nodes
        if not node.text.strip() or node.text.strip() == '---':
          continue

        # Create embedding for the chunk
        embedding_result = await self.embedding_client.embeddings.create(
          input=[node.text],
          model=self.model_id,
          extra_headers={'Runner-Name': self.__class__.__name__}
        )

        # Create metadata with chunk index and original node metadata
        metadata = EmbedMetadata(
          vault=essay.vault_id,
          file=essay.file_id,
          type=DocumentType.ESSAY,
          note=f'chunk:{i}',  # Store chunk index in the note field
        )

        # Add embedding to results
        results.append(
          EmbedTask(
            metadata=metadata,
            embedding=embedding_result.data[0].embedding
          )
        )

    except Exception:
      logger.error(traceback.format_exc())
      metadata = EmbedMetadata(
        vault=essay.vault_id,
        file=essay.file_id,
        type=DocumentType.ESSAY
      )
      results.append(
        EmbedTask(
          metadata=metadata,
          embedding=[],
          error='Internal error found. Check server logs for more information'
        )
      )

    return results

  @bentoml.api(batchable=True)
  async def notes(self, notes: list[Note]) -> list[EmbedTask]:
    """Simply embed note content and return embeddings."""
    results = []

    for note in notes:
      try:
        # Create embedding for the note
        embedding_result = await self.embedding_client.embeddings.create(
          input=[note.content],
          model=self.model_id,
          extra_headers={'Runner-Name': self.__class__.__name__}
        )

        # Create embed task
        metadata = EmbedMetadata(
          vault='',  # Note doesn't have vault_id in its parameters
          file=note.file_id,
          type=DocumentType.NOTE,
          note=note.note_id,
        )

        results.append(EmbedTask(metadata=metadata, embedding=embedding_result.data[0].embedding))
      except Exception:
        logger.error(traceback.format_exc())
        metadata = EmbedMetadata(vault='', file=note.file_id, type=DocumentType.NOTE, note=note.note_id)
        results.append(
          EmbedTask(
            metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
          )
        )

    return results


class DocumentType(enum.IntEnum):
  ESSAY = 1
  NOTE = enum.auto()


class EmbedMetadata(pydantic.BaseModel):
  vault: str
  file: str
  type: DocumentType
  note: t.Optional[str] = pydantic.Field(default=None)


class EmbedTask(pydantic.BaseModel):
  metadata: EmbedMetadata
  embedding: list[float]
  error: str = pydantic.Field(default='')


class HNSWIndexManager(pydantic.BaseModel):
  dim: int = 1024
  ef_construction: int = 200
  M: int = 16
  indexes: dict[str, t.Any] = pydantic.Field(default_factory=dict)
  metadata: dict[str, list[EmbedMetadata]] = pydantic.Field(default_factory=dict)

  def create_index(self, index_id: str, reset: bool = False) -> None:
    """Create or reset a vector index.

    Args:
        index_id: Unique identifier for the index
        reset: If True, reset an existing index
    """
    if index_id in self.indexes and not reset:
      return

    # Initialize new index
    index = hnswlib.Index(space='cosine', dim=self.dim)
    index.init_index(max_elements=10000, ef_construction=self.ef_construction, M=self.M)
    index.set_ef(50)  # Sets search accuracy vs speed tradeoff

    self.indexes[index_id] = index
    self.metadata[index_id] = []

  def add_items(self, index_id: str, vectors: List[List[float]], metadata_list: List[EmbedMetadata]) -> None:
    """Add vectors and their metadata to an index.

    Args:
        index_id: Target index identifier
        vectors: List of embedding vectors
        metadata_list: List of metadata corresponding to vectors
    """
    if index_id not in self.indexes:
      self.create_index(index_id)

    index = self.indexes[index_id]
    start_idx = len(self.metadata[index_id])

    # Convert to numpy array
    vectors_np = np.array(vectors, dtype=np.float32)

    # Add items to index
    index.add_items(vectors_np, list(range(start_idx, start_idx + len(vectors))))

    # Store metadata
    self.metadata[index_id].extend(metadata_list)

  def search(
    self, index_id: str, query_vector: List[float], k: int = 5
  ) -> Tuple[List[int], List[float], List[EmbedMetadata]]:
    """Search for similar vectors.

    Args:
        index_id: Target index identifier
        query_vector: Query embedding vector
        k: Number of results to return

    Returns:
        Tuple of (indexes, distances, metadata)
    """
    if index_id not in self.indexes:
      return [], [], []

    index = self.indexes[index_id]
    query_np = np.array(query_vector, dtype=np.float32).reshape(1, -1)

    # Get k nearest neighbors
    indexes, distances = index.knn_query(query_np, k=min(k, len(self.metadata[index_id])))

    # Retrieve metadata for each result
    result_metadata = [self.metadata[index_id][i] for i in indexes[0]]

    return indexes[0].tolist(), distances[0].tolist(), result_metadata

  def save_index(self, index_id: str, path: str) -> None:
    """Save index to disk.

    Args:
        index_id: Index identifier to save
        path: Directory path to save the index
    """
    if index_id not in self.indexes:
      return

    index_path = pathlib.Path(path) / f'{index_id}.hnsw'
    metadata_path = pathlib.Path(path) / f'{index_id}.metadata'

    # Save index
    self.indexes[index_id].save_index(str(index_path))

    # Save metadata using pickle
    import pickle

    with open(metadata_path, 'wb') as f:
      pickle.dump(self.metadata[index_id], f)

  def load_index(self, index_id: str, path: str, max_elements: int = 10000) -> bool:
    """Load index from disk.

    Args:
        index_id: Index identifier to load
        path: Directory path to load the index from
        max_elements: Maximum elements in the index

    Returns:
        True if loaded successfully, False otherwise
    """
    index_path = pathlib.Path(path) / f'{index_id}.hnsw'
    metadata_path = pathlib.Path(path) / f'{index_id}.metadata'

    if not index_path.exists() or not metadata_path.exists():
      return False

    # Create new index
    index = hnswlib.Index(space='cosine', dim=self.dim)
    index.load_index(str(index_path), max_elements=max_elements)

    # Load metadata
    import pickle

    with open(metadata_path, 'rb') as f:
      metadata = pickle.load(f)

    self.indexes[index_id] = index
    self.metadata[index_id] = metadata
    return True


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
    {'name': 'VLLM_USE_V1', 'value': '0'},
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
    self.inference_client = openai.AsyncOpenAI(base_url=f'{self.inference.client_url}/v1', api_key='dummy')
    self.embedding_client = openai.AsyncOpenAI(base_url=f'{self.embedding.client_url}/v1', api_key='dummy')

    loader = jinja2.FileSystemLoader(searchpath=WORKING_DIR)
    self.jinja2_env = jinja2.Environment(loader=loader)

  @bentoml.on_startup
  def initialize_indexes(self):
    # Initialize the vector index manager
    self.index_manager = HNSWIndexManager(dim=512)  # Use 512 dimensions as requested
    self.index_dir = WORKING_DIR / 'indices'
    os.makedirs(self.index_dir, exist_ok=True)

    # Try to load existing indices
    for vault_id in os.listdir(self.index_dir) if self.index_dir.exists() else []:
      vault_path = self.index_dir / vault_id
      if vault_path.is_dir():
        for index_file in vault_path.glob('*.hnsw'):
          index_id = index_file.stem
          self.index_manager.load_index(index_id, str(vault_path))

  @bentoml.task
  async def embed(self, vault_id: str, file_id: str, content: str, note_id: t.Optional[str] = None) -> EmbedTask:
    # 0 will be note, 1 will be content
    metadata = EmbedMetadata(
      vault=vault_id, file=file_id, note=note_id, type=DocumentType.NOTE if note_id is not None else DocumentType.ESSAY
    )
    try:
      results = await self.embedding_client.embeddings.create(
        input=[content], model=EMBEDDING_ID, extra_headers={'Runner-Name': Embeddings.name}
      )
      embed_task = EmbedTask(metadata=metadata, embedding=results.data[0].embedding)

      # Add to appropriate index based on vault and document type
      index_id = f'{vault_id}_{metadata.type.name.lower()}'
      self.index_manager.add_items(index_id=index_id, vectors=[embed_task.embedding], metadata_list=[metadata])

      # Save index
      vault_path = self.index_dir / vault_id
      os.makedirs(vault_path, exist_ok=True)
      self.index_manager.save_index(index_id, str(vault_path))

      return embed_task
    except Exception:
      logger.error(traceback.format_exc())
      return EmbedTask(
        metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
      )

  @bentoml.api
  async def search_similar(
    self, vault_id: str, query: str, doc_type: DocumentType, top_k: t.Annotated[int, ae.Ge(1), ae.Le(20)] = 5
  ) -> List[Tuple[EmbedMetadata, float]]:
    """Search for similar documents based on semantic similarity."""
    try:
      # Create embedding for the query
      results = await self.embedding_client.embeddings.create(
        input=[query], model=EMBEDDING_ID, extra_headers={'Runner-Name': Embeddings.name}
      )
      query_vector = results.data[0].embedding

      # Get the appropriate index
      index_id = f'{vault_id}_{doc_type.name.lower()}'

      # Search for similar items
      _, distances, metadata_list = self.index_manager.search(index_id=index_id, query_vector=query_vector, k=top_k)

      # Return results with similarity scores (convert distance to similarity)
      return [(metadata, 1.0 - distance) for metadata, distance in zip(metadata_list, distances)]
    except Exception:
      logger.error(traceback.format_exc())
      return []

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
