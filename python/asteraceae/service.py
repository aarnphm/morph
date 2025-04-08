from __future__ import annotations

import logging, argparse, multiprocessing, json, itertools, traceback, asyncio, os, shutil, contextlib, pathlib, time, datetime, typing as t
import bentoml, fastapi, pydantic, jinja2, annotated_types as at

from starlette.responses import JSONResponse, StreamingResponse

with bentoml.importing():
  import openai, exa_py

  from openai.types import CreateEmbeddingResponse
  from openai.types.chat import ChatCompletionChunk
  from llama_index.core import Document
  from llama_index.core.ingestion import IngestionPipeline
  from llama_index.core.node_parser import SemanticSplitterNodeParser
  from llama_index.core.extractors import TitleExtractor
  from llama_index.embeddings.openai import OpenAIEmbedding
  from llama_index.llms.openai_like import OpenAILike
  from vllm.entrypoints.openai.protocol import (
    ChatCompletionRequest,
    DeltaMessage,
    ModelCard,
    ModelList,
    ErrorResponse,
    EmbeddingCompletionRequest,
  )

  from libs.protocol import (
    EssayNode,
    EssayRequest,
    EssayResponse,
    HealthRequest,
    MetadataResponse,
    NotesResponse,
    ReasoningModels,
    EmbeddingModels,
    ServiceOpts,
    EmbedType,
    ModelType,
    DependentStatus,
    HealthResponse,
    LineNumberMetadataExtractor,
    Suggestion,
    SuggestionsSchema,
    Authors,
    TaskType,
    Tonality,
    NotesRequest,
    AuthorSchema,
  )

if t.TYPE_CHECKING:
  from _bentoml_impl.client import RemoteProxy
  from vllm.entrypoints.openai.serving_embedding import OpenAIServingEmbedding

logger = logging.getLogger('bentoml.service')


WORKING_DIR = pathlib.Path(__file__).parent
IGNORE_PATTERNS = ['*.pth', '*.pt', 'original/**/*']

MODEL_TYPE = t.cast(ModelType, os.getenv('LLM', 'qwq'))
LLM_ID: str = (llm_ := ReasoningModels[MODEL_TYPE])['model_id']
EMBED_TYPE = t.cast(EmbedType, os.getenv('EMBED', 'gte-qwen-fast'))
EMBED_ID: str = (embed_ := EmbeddingModels[EMBED_TYPE])['model_id']
MAX_MODEL_LEN = int(os.environ.get('MAX_MODEL_LEN', llm_['max_model_len']))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', llm_['max_tokens']))

SupportedBackend = t.Literal['vllm']
SUPPORTED_BACKENDS: t.Sequence[SupportedBackend] = ['vllm']

DEFAULT_AUTHORS = ['Raymond Carver', 'Franz Kafka', 'Albert Camus', 'Iain McGilchrist', 'Ian McEwan']

SERVICE_CONFIG: ServiceOpts = {
  'tracing': {'sample_rate': 1.0},
  'traffic': {'timeout': 1000, 'concurrency': 128},
  'http': {
    'cors': {
      'enabled': True,
      'access_control_allow_origins': ['*'],
      'access_control_allow_methods': ['*'],
      'access_control_allow_headers': ['*'],
      'access_control_max_age': 1200,
    }
  },
  'image': bentoml.images.PythonImage(python_version='3.11')
  .system_packages('curl', 'git', 'build-essential', 'clang')
  .pyproject_toml('pyproject.toml')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6'),
}


class SuggestRequest(pydantic.BaseModel):
  essay: str
  authors: t.Optional[list[str]] = pydantic.Field(DEFAULT_AUTHORS)
  tonality: t.Optional[Tonality] = None
  notes: t.Optional[list[NotesRequest]] = None
  num_suggestions: t.Annotated[int, at.Ge(1)] = 3
  top_p: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['top_p']
  temperature: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['temperature']
  max_tokens: t.Annotated[int, at.Ge(256), at.Le(MAX_TOKENS)] = MAX_TOKENS
  usage: bool = True


class AuthorRequest(pydantic.BaseModel):
  essay: str
  num_authors: t.Annotated[int, at.Ge(1)] = 8
  top_p: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['top_p']
  temperature: t.Annotated[float, at.Ge(0), at.Le(1)] = llm_['temperature']
  max_tokens: t.Annotated[int, at.Ge(256), at.Le(MAX_TOKENS)] = MAX_TOKENS
  authors: t.Optional[list[str]] = None
  use_tool: bool = True
  search_backend: t.Optional[t.Literal['exa']] = 'exa'
  num_search_results: t.Annotated[int, at.Ge(1), at.Le(15)] = 3


class StreamingCall(pydantic.BaseModel):
  task: t.Literal['tool-call', 'tool-result', 'tool-error', 'tool-end', 'tool-start', 'llm-call', 'llm-result']
  content: t.Union[pydantic.BaseModel, dict, str]
  error: t.Optional[str] = None


class StreamingToolCall(pydantic.BaseModel):
  tool: str
  content: t.Union[str, dict, list]


class SearchItem(pydantic.BaseModel):
  url: str
  id: str
  title: str
  summary: str
  highlights: str


class SearchResults(pydantic.BaseModel):
  query: str
  items: list[SearchItem]


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


def make_env(engine_version: t.Literal[0, 1] = 1, *, skip_hf: bool = False, **kwargs: bool) -> list[dict[str, str]]:
  # We provide a kwargs supports for all required envs for this service if specified
  results = []
  if not skip_hf:
    results.append({'name': 'HF_TOKEN'})
  results.extend([
    {'name': 'UV_NO_PROGRESS', 'value': '1'},
    {'name': 'CXX', 'value': t.cast(str, shutil.which('c++'))},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': '1'},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
    {'name': 'VLLM_USE_V1', 'value': str(engine_version)},
  ])
  if MODEL_TYPE == 'qwq':
    results.append({'name': 'VLLM_ALLOW_LONG_MAX_MODEL_LEN', 'value': '1'})
  required_envs = [{'name': k.upper()} for k, v in kwargs.items() if v]
  if all(required_envs):
    results.extend(required_envs)
  return results


def make_args(
  model: str,
  model_id: str,
  /,
  *,
  task: TaskType,
  max_log_len: int = 2000,
  max_num_seqs: int = 256,
  max_model_len: int = MAX_MODEL_LEN,
  reasoning: bool = True,
  reasoning_parser: str = 'deepseek_r1',
  trust_remote_code: bool = False,
  prefix_caching: bool = True,
  chunked_prefill: bool = True,
  tool: bool = True,
  tool_parser: str = 'hermes',
  **kwargs: t.Any,
) -> argparse.Namespace:
  from vllm.utils import FlexibleArgumentParser
  from vllm.entrypoints.openai.cli_args import make_arg_parser

  disable_logs = str(os.getenv('DEBUG', '0')).lower() in ['0', 'n', 'no', 'false', 'f']
  variables = dict(
    task=task,
    model=model,
    max_log_len=max_log_len,
    served_model_name=[model_id],
    disable_log_requests=disable_logs,
    disable_log_stats=disable_logs,
    use_tqdm_on_load=False,
    max_num_seqs=max_num_seqs,
    enable_prefix_caching=prefix_caching,
    enable_auto_tool_choice=tool,
    enable_chunked_prefill=chunked_prefill,
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
  if MODEL_TYPE == 'qwq':
    variables['hf_overrides'] = {
      'rope_scaling': {'factor': 4.0, 'original_max_position_embeddings': 32768, 'rope_type': 'yarn'}
    }
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

    args = make_args(self.model, self.model_id, task='generate', gpu_memory_utilization=0.90)

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
    messages: list[dict[str, t.Any]],
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
          messages=messages,
          stream=True,
          extra_body={'guided_json': SuggestionsSchema.model_json_schema()},
          stream_options={'continuous_usage_stats': True, 'include_usage': True} if usage else None,
        ),
      )
      async for chunk in completions:
        delta_choice = t.cast(DeltaMessage, chunk.choices[0].delta)
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
      max_num_seqs=256,
      chunked_prefill=False,
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
    self.embed_handler: OpenAIServingEmbedding = embed_app.state.openai_serving_embedding

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.exit_stack.aclose()

  @bentoml.api
  async def generate(self, content: list[str]) -> CreateEmbeddingResponse:
    try:
      return await self.client.embeddings.create(input=content, model=self.model_id)
    except Exception:
      logger.error(traceback.format_exc())
      raise


@bentoml.asgi_app(app)
@bentoml.service(
  name='asteraceae-inference-api',
  resources={'cpu': 4},
  labels={'owner': 'aarnphm', 'type': 'api'},
  envs=make_env(0, skip_hf=True, EXA_API_KEY=True),
  **SERVICE_CONFIG,
)
class API:
  llm = bentoml.depends(LLM, url=make_url('generate'))
  embed = bentoml.depends(Embeddings, url=make_url('embed'))

  search_backend: t.Literal['exa'] = 'exa'

  def __init__(self):
    loader = jinja2.FileSystemLoader(searchpath=WORKING_DIR)
    self.templater = jinja2.Environment(loader=loader)

  def as_proxy(self, it: t.Any) -> RemoteProxy:
    return t.cast('RemoteProxy', it)

  @bentoml.on_startup
  def setup_clients(self):
    self.llm_httpx = (tllm := self.as_proxy(self.llm)).to_async.client
    self.embed_httpx = (tembed := self.as_proxy(self.embed)).to_async.client

    self.exa = exa_py.Exa(api_key=os.environ.get('EXA_API_KEY'))

    self.llm_client = openai.AsyncOpenAI(
      base_url=f'{tllm.client_url}/v1', api_key='dummy', default_headers={'Runner-Name': LLM.name}
    )
    self.embed_client = openai.AsyncOpenAI(
      base_url=f'{tembed.client_url}/v1', api_key='dummy', default_headers={'Runner-Name': Embeddings.name}
    )

    self.llm_model = OpenAILike(
      model=LLM.inner.model_id,
      tokenizer=LLM.inner.model_id,
      api_key='dummy',
      api_version='',
      api_base=f'{tllm.client_url}/v1',
      is_chat_model=True,
      max_tokens=MAX_TOKENS,
      context_window=MAX_MODEL_LEN,
      temperature=llm_['temperature'],
      default_headers={'Runner-Name': LLM.name},
      strict=True,
      timeout=6000,  # V0 limitations atm, but once we support thinking in V1, will move there.
    )
    self.embed_model = OpenAIEmbedding(
      api_key='dummy',
      model_name=Embeddings.inner.model_id,
      api_base=f'{tembed.client_url}/v1',
      dimensions=None,
      default_headers={'Runner-Name': Embeddings.name},
    )

    # Setup the semantic chunker with appropriate parameters
    chunker = SemanticSplitterNodeParser(
      buffer_size=1,
      breakpoint_percentile_threshold=95,  # Threshold for determining chunk boundaries
      embed_model=self.embed_model,
    )

    # Create our line number metadata extractor
    line_extractor = LineNumberMetadataExtractor(include_whitespace=True)

    # Create the title extractor
    title_extractor = TitleExtractor(llm=self.llm_model)

    # Set up the full ingestion pipeline with all components
    self.pipeline = IngestionPipeline(
      transformations=[
        chunker,  # First split into semantic chunks
        line_extractor,  # Then extract line numbers for each chunk
        title_extractor,  # Then generate titles for each chunk
        self.embed_model,  # Finally generate embeddings
      ]
    )

  @bentoml.api(route='/v1/embeddings')
  async def create_embedding(self, request: EmbeddingCompletionRequest, /):
    request.model = Embeddings.inner.model_id
    try:
      # Make a direct request to the embed endpoint
      resp = await self.embed_httpx.post(
        '/v1/embeddings',
        json=request.model_dump(exclude_unset=True),
        headers={'Accept': 'application/json', 'Content-Type': 'application/json'},
      )

      if resp.status_code != 200:
        error_content = resp.json()
        return JSONResponse(content=error_content, status_code=resp.status_code)

      return resp.json()
    except Exception as e:
      logger.error('Error forwarding embedding request: %s', e)
      logger.error(traceback.format_exc())
      return JSONResponse(
        content=ErrorResponse(
          message=f'Internal server error: {e!s}', type='InternalServerError', code=500
        ).model_dump(),
        status_code=500,
      )

  @bentoml.api(route='/v1/chat/completions')
  async def create_chat_completion(self, request: ChatCompletionRequest, /):
    request.model = LLM.inner.model_id
    try:
      if request.stream:
        # Use streaming context manager for streaming responses
        async def stream_response():
          async with self.llm_httpx.stream(
            'POST',
            '/v1/chat/completions',
            json=request.model_dump(exclude_unset=True),
            headers={'Accept': 'application/json', 'Content-Type': 'application/json'},
          ) as resp:
            if resp.status_code != 200:
              error_content = await resp.json()
              yield f'data: {json.dumps(error_content)}\n\n'
              return

            async for chunk in resp.aiter_text():
              if chunk.strip():
                # Pass through the chunk directly if it's already in SSE format
                if chunk.startswith('data:'):
                  yield chunk
                else:
                  # Wrap it in SSE format if it's not
                  yield f'data: {chunk}\n\n'

        return StreamingResponse(stream_response(), media_type='text/event-stream')
      else:
        # For non-streaming responses, continue using post
        resp = await self.llm_httpx.post(
          '/v1/chat/completions',
          json=request.model_dump(exclude_unset=True),
          headers={'Accept': 'application/json', 'Content-Type': 'application/json'},
        )

        if resp.status_code != 200:
          error_content = resp.json()
          return JSONResponse(content=error_content, status_code=resp.status_code)

        return JSONResponse(content=resp.json())
    except Exception as e:
      logger.error('Error forwarding chat completion request: %s', e)
      logger.error(traceback.format_exc())
      return JSONResponse(
        content=ErrorResponse(
          message=f'Internal server error: {e!s}', type='InternalServerError', code=500
        ).model_dump(),
        status_code=500,
      )

  @app.get('/v1/models')
  async def show_available_models(self) -> ModelList:
    results = await asyncio.gather(*[
      caller() for caller in [self.llm_client.models.list, self.embed_client.models.list]
    ])
    return ModelList(
      data=[ModelCard(**d.model_dump()) for d in list(itertools.chain.from_iterable(p.data for p in results))]
    )

  @bentoml.task
  async def authors(self, request: AuthorRequest, /) -> Authors:
    """Generate author suggestions based on essay analysis, using function calling and search tools."""

    # Use the request's search backend if specified, otherwise use the default
    search_backend = request.search_backend or self.search_backend
    logger.info('Using search backend: %s', search_backend)

    # Define the search tool specifications
    tools = [
      {
        'type': 'function',
        'function': {
          'name': 'search_tool',
          'description': 'Search the internet for information about authors, writing styles, or other relevant literary information',
          'parameters': {
            'type': 'object',
            'properties': {
              'query': {
                'type': 'string',
                'description': 'The search query to find information about authors, writing styles, or literary information',
              }
            },
            'required': ['query'],
          },
        },
      }
    ]

    # Initial message to analyze the text and consider authors
    messages = [
      {
        'role': 'system',
        'content': self.templater.get_template('TOOL_CALLING.md').render(
          excerpt=request.essay, num_authors=request.num_authors, authors=request.authors
        ),
      },
      {
        'role': 'user',
        'content': 'Find similar authors that matches the given criteria. Consider key terms, themes, and style elements that would yield relevant results.',
      },
    ]

    try:
      logger.info('Synthesize search query')
      # First call: Let the model analyze and potentially use search tools
      tool_caller = await self.llm_client.chat.completions.create(
        model=LLM_ID,
        messages=messages,
        tools=tools,
        temperature=request.temperature,
        top_p=request.top_p,
        max_tokens=request.max_tokens,
        # tool_choice={'type': 'function', 'function': {'name': 'search_tool'}},
        tool_choice='auto',  # ok, doesn't work for deepseek, but the generated lists looks cool afaict
        extra_body={'repetition_penalty': 1.05},
      )

      assistant_message = tool_caller.choices[0].message
      messages.append(assistant_message.model_dump())

      # Process any tool calls
      if assistant_message.tool_calls and request.use_tool:
        logger.info('Processing %d tool calls', len(assistant_message.tool_calls))
        queries = []
        for tool_call in assistant_message.tool_calls:
          if tool_call.function.name == 'search_tool':
            try:
              # Parse the arguments - Qwen/vLLM provides JSON string
              args = json.loads(tool_call.function.arguments)
              search_query = args.get('query', '')
              logger.info('Executing search for: "%s"', search_query)
              queries.append(search_query)

              # Execute the search using the configured backend
              search_results = await self.search(
                search_query, backend=search_backend, num_results=request.num_search_results
              )
              logger.info('Found %d search results', len(search_results.items))

              # Add the tool response to messages
              messages.append({
                'role': 'tool',
                'tool_call_id': tool_call.id,
                'name': 'search_tool',
                'content': search_results.model_dump_json(),
              })

            except Exception as e:
              # Handle errors in tool execution
              error_message = f'Error executing search tool: {e!s}'
              logger.error('Search error: %s', error_message)
              messages.append({
                'role': 'tool',
                'tool_call_id': tool_call.id,
                'name': 'search_tool',
                'content': '<empty>',
              })

        section = 'the search results and the excerpt' if queries else 'the excerpt'
        # Add a prompt to use the search results
        messages.append({
          'role': 'user',
          'content': f'Based on {section}, provide the final {request.num_authors} list of authors fitted for this excerpt.',
        })

        logger.info('Making final completion with guided_json')

        # Final call: Generate structured output with guided_json and enable reasoning
        # For Qwen models with vLLM, guided_json is the recommended structured output format
        completions = await self.llm_client.chat.completions.create(
          model=LLM_ID,
          messages=messages,
          temperature=request.temperature * 0.88,  # Slightly lower temperature for more consistent output
          max_tokens=request.max_tokens,
          extra_body={'guided_json': AuthorSchema.model_json_schema()},
        )

        # Parse the response which may contain reasoning
        try:
          content = completions.choices[0].message.content or '{}'
          reasoning_content = completions.choices[0].message.reasoning_content
          logger.info('reasoning logics: %s', reasoning_content)

          authors_data = json.loads(content)
          authors_list = authors_data.get('authors', [])
          logger.info('Found %d authors: %s', len(authors_list), authors_list)
          return Authors(authors=authors_list, queries=queries)
        except Exception as e:
          logger.error('Error parsing final authors response: %s', e)
          return Authors(authors=DEFAULT_AUTHORS)
      else:
        logger.info('No tool calls, parsing initial response')
        # The model already generated a response without using tools
        try:
          content = assistant_message.content
          reasoning_content = assistant_message.reasoning_content
          logger.info('reasoning logics: %s', reasoning_content)

          # Try regular JSON parsing
          authors_data = json.loads(content)
          authors_list = authors_data.get('authors', [])
          logger.info('Found %d authors: %s', len(authors_list), authors_list)
          return Authors(authors=authors_list)
        except Exception:
          logger.info('Initial response not in JSON format, making final guided_json request')
          # If the output is not JSON, make a final request with guided_json
          messages.append({
            'role': 'user',
            'content': "Please format your response as a valid JSON object with a single key 'authors' and a list of author names as strings.",
          })

          completions = await self.llm_client.chat.completions.create(
            model=LLM_ID,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            extra_body={'guided_json': Authors.model_json_schema()},
          )

          try:
            content = completions.choices[0].message.content or '{}'
            reasoning_content = completions.choices[0].message.reasoning_content
            logger.info('reasoning logics: %s', reasoning_content)

            # Standard JSON parsing
            authors_data = json.loads(content)
            authors_list = authors_data.get('authors', [])
            logger.info('Found %d authors from final request: %s', len(authors_list), authors_list)
            return Authors(authors=authors_list)
          except Exception as inner_e:
            logger.error('Error generating final authors list: %s', inner_e)
            return Authors(authors=DEFAULT_AUTHORS)

    except Exception as e:
      logger.error('Error in authors function: %s', e)
      logger.error(traceback.format_exc())
      return Authors(authors=DEFAULT_AUTHORS)

  async def search(self, query: str, backend: t.Literal['exa'] | str = 'exa', num_results: int = 10) -> SearchResults:
    if backend == 'exa':
      if self.exa is None:
        raise ValueError('Currently only exa is supported')
      result = self.exa.search_and_contents(
        query, num_results=num_results, use_autoprompt=True, text=True, type='auto', highlights=True, summary=True
      )
      return SearchResults(
        query=query,
        items=[
          SearchItem(url=r.url, id=r.id, title=r.title, summary=r.summary, highlights=r.highlights)
          for r in result.results
        ],
      )
    else:
      raise ValueError(f'Unsupported search backend: {backend}')

  @bentoml.api
  async def suggests(self, request: SuggestRequest, /) -> t.AsyncGenerator[str, None]:
    # TODO: add tonality lookup and steering vector strength for influence the distributions
    # for now, we will just use the features lookup from given SAEs constrasted with the models.
    messages = [
      dict(
        role='user',
        content=self.templater.get_template('SYSTEM_PROMPT.md').render(
          num_suggestions=request.num_suggestions,
          notes=request.notes,
          authors=request.authors,
          tonality=request.tonality.model_dump_json(exclude_defaults=True) if request.tonality else None,
          excerpt=request.essay,
        ),
      )
    ]

    async for chunk in self.llm.generate(
      messages=messages,
      temperature=request.temperature,
      max_tokens=request.max_tokens,
      top_p=request.top_p,
      usage=request.usage,
    ):
      yield chunk

  @bentoml.task
  async def notes(self, note: NotesRequest, /) -> NotesResponse:
    try:
      result = await self.embed.generate(content=[note.content])
      return NotesResponse(
        embedding=result.data[0].embedding, usage=result.usage, **note.model_dump(exclude={'content'})
      )
    except Exception as e:
      traceback.print_exc()
      return NotesResponse(embedding=[], error=str(e), **note.model_dump(exclude={'content'}))

  @bentoml.task
  async def essays(self, essay: EssayRequest, /) -> EssayResponse:
    try:
      result = await self.pipeline.arun(
        show_progress=True,
        documents=[Document(text=essay.content, doc_id=essay.file_id, metadata=essay.model_dump())],
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

  @app.get('/metadata')
  def metadata(self) -> MetadataResponse:
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
