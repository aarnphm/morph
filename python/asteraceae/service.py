from __future__ import annotations

import logging, argparse, enum, traceback, os, contextlib, pathlib, typing as t
import bentoml, fastapi, pydantic, jinja2, annotated_types as ae

# from llama_index.core import Document
# from llama_index.core.node_parser import SemanticSplitterNodeParser, SentenceSplitter
# from llama_index.core.schema import TextNode
# from llama_index.embeddings.openai import OpenAIEmbedding


if t.TYPE_CHECKING:
  from vllm.entrypoints.openai.protocol import DeltaMessage
  from _bentoml_sdk.images import Image
  from _bentoml_sdk.service.config import TrafficSchema, TracingSchema

logger = logging.getLogger(__name__)


IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']
INFERENCE_ID = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B'
EMBEDDING_ID = 'Alibaba-NLP/gte-Qwen2-7B-instruct'
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


def make_env(engine_version: t.Literal[0, 1] = 1) -> list[dict[str, str]]:
  return [
    {'name': 'HF_TOKEN'},
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': str(engine_version)},
    {'name': 'VLLM_LOGGING_CONFIG_PATH', 'value': (WORKING_DIR / 'logging-config.json').__fspath__()},
  ]


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


class Suggestion(pydantic.BaseModel):
  suggestion: str
  reasoning: str = pydantic.Field(default='')


class Suggestions(pydantic.BaseModel):
  suggestions: list[Suggestion]


inference_api = fastapi.FastAPI()


@bentoml.asgi_app(inference_api, path='/v1')
@bentoml.service(
  name='asteraceae-inference-engine',
  resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  labels=make_labels('generate'),
  envs=make_env(0),
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
  resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  labels=make_labels('embed'),
  envs=make_env(0),
  **SERVICE_CONFIG,
)
class Embeddings:
  model_id = EMBEDDING_ID
  model = bentoml.models.HuggingFaceModel(model_id, exclude=IGNORE_PATTERNS)

  def __init__(self):
    self.exit_stack = contextlib.AsyncExitStack()

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import torch
    import vllm.entrypoints.openai.api_server as vllm_api_server

    args = make_args(
      self.model,
      self.model_id,
      task='embed',
      max_tokens=8192,
      reasoning=False,
      trust_remote_code=True,
      prefix_caching=False,
      dtype=torch.bfloat16,
    )
    # args.hf_overrides = {'is_causal': True}

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
          input=[node.text], model=self.model_id, extra_headers={'Runner-Name': self.__class__.__name__}
        )

        # Create metadata with chunk index and original node metadata
        metadata = EmbedMetadata(
          vault=essay.vault_id,
          file=essay.file_id,
          type=DocumentType.ESSAY,
          note=f'chunk:{i}',  # Store chunk index in the note field
        )

        # Add embedding to results
        results.append(EmbedTask(metadata=metadata, embedding=embedding_result.data[0].embedding))

    except Exception:
      logger.error(traceback.format_exc())
      metadata = EmbedMetadata(vault=essay.vault_id, file=essay.file_id, type=DocumentType.ESSAY)
      results.append(
        EmbedTask(
          metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
        )
      )

    return results

  @bentoml.api(batchable=True)
  async def notes(self, notes: list[Note]) -> list[EmbedTask]:
    results = []

    try:
      embedding_result = await self.embedding_client.embeddings.create(
        input=[note.content for note in notes],
        model=self.model_id,
        extra_headers={'Runner-Name': self.__class__.__name__},
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
    import openai

    self.inference_client = openai.AsyncOpenAI(base_url=f'{self.inference.client_url}/v1', api_key='dummy')
    self.embedding_client = openai.AsyncOpenAI(base_url=f'{self.embedding.client_url}/v1', api_key='dummy')

    loader = jinja2.FileSystemLoader(searchpath=WORKING_DIR)
    self.jinja2_env = jinja2.Environment(loader=loader)

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

      return embed_task
    except Exception:
      logger.error(traceback.format_exc())
      return EmbedTask(
        metadata=metadata, embedding=[], error='Internal error found. Check server logs for more information'
      )

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
