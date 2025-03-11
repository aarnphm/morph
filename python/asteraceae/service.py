from __future__ import annotations
import logging, traceback, asyncio
import bentoml, fastapi, pydantic

from typing import AsyncGenerator, List, Literal, Optional
from annotated_types import Ge, Le
from typing_extensions import Annotated

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

openai_api_app = fastapi.FastAPI()

MAX_TOKENS = 8192
MODEL_ID = 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B'

SYSTEM_PROMPT = """You are a professional writing assistant influenced by the styles of Raymond Carver, Franz Kafka, Albert Camus, Iain McGilchrist, and Ian McEwan. Your task is to provide suggestions to improve a user's writing by offering concise, meaningful additions that match the stylistic choices and tonality of the given essay excerpt.

Please follow these steps to generate a suggestion:

1. Analyze the excerpt, paying close attention to its style, tone, and central concept.
2. Consider how Raymond Carver or Ian McEwan might approach expanding or enhancing the excerpt.
3. Formulate a suggestion that builds upon the existing concept while maintaining a terse and authentic voice.
4. Ensure your suggestion adds depth to the writing without drastically changing its original intent.

Before providing your final suggestion, wrap your analysis in <thought_process> tags. In this section:
- List key stylistic elements and themes present in the excerpt
- Identify specific influences from the mentioned authors
- Brainstorm potential areas for improvement
- Consider how each improvement aligns with the original style and tone

This will help ensure a thorough interpretation of the excerpt and a well-crafted suggestion. It's OK for this section to be quite long.

Guidelines for your suggestion:
1. Keep it concise and authentic, typically one to two sentences.
2. Focus on enhancing emotional depth, vivid imagery, or character insight.
3. Maintain the overall tone and style of the original excerpt.
4. Build upon the central concept or theme present in the excerpt.

After your analysis, provide your final suggestion in <suggestion> tags.

Example output structure:

<thinking>
[Your detailed analysis of the excerpt, considering style, tone, and concept]
</thinking>

<suggestion>
[Your concise, meaningful suggestion to improve the writing]
</suggestion>

Please proceed with your analysis and suggestion for the given essay excerpt."""


class Suggestion(pydantic.BaseModel):
  suggestion: str


class ServerArgs(pydantic.BaseModel):
  model: str
  disable_log_requests: bool = True
  disable_log_stats: bool = True
  max_log_len: int = 1000
  response_role: str = 'assistant'
  served_model_name: Optional[List[str]] = None
  chat_template: Optional[str] = None
  chat_template_content_format: Literal['auto'] = 'auto'
  lora_modules: Optional[List[str]] = None
  prompt_adapters: Optional[List[str]] = None
  request_logger: Optional[str] = None
  return_tokens_as_token_ids: bool = False
  enable_tool_call_parser: bool = True
  enable_auto_tool_choice: bool = True
  enable_prompt_tokens_details: bool = False
  enable_reasoning: bool = False
  tool_call_parser: str = 'llama3_json'
  guided_decoding_backend: Literal['xgrammar', 'outlines'] = 'xgrammar'
  reasoning_parser: str = 'deepseek_r1'
  task: str = 'generate'


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
  envs=[{'name': 'HF_TOKEN'}, {'name': 'UV_COMPILE_BYTECODE', 'value': "1"}],
  image=bentoml.images.PythonImage(python_version='3.11').requirements_file('requirements.txt'),
)
class Engine:
  ref = bentoml.models.HuggingFaceModel(MODEL_ID, exclude=['*.pth'])

  def __init__(self):
    from vllm import AsyncEngineArgs, AsyncLLMEngine
    import vllm.entrypoints.openai.api_server as vllm_api_server

    ENGINE_ARGS = AsyncEngineArgs(model=self.ref, enable_prefix_caching=True, enable_chunked_prefill=True)
    self.engine = AsyncLLMEngine.from_engine_args(ENGINE_ARGS)

    OPENAI_ENDPOINTS = [
      ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
      ['/completions', vllm_api_server.create_completion, ['POST']],
      ['/embeddings', vllm_api_server.create_embedding, ['POST']],
      ['/models', vllm_api_server.show_available_models, ['GET']],
    ]
    for route, endpoint, methods in OPENAI_ENDPOINTS:
      openai_api_app.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)

    model_config = self.engine.engine.get_model_config()
    # NOTE: This is ok, given that all bentoml service is running within a event loop.
    asyncio.create_task(  # noqa: RUF006
      vllm_api_server.init_app_state(self.engine, model_config, openai_api_app.state, ServerArgs(model=MODEL_ID))
    )

  @bentoml.api
  async def suggests(
    self,
    essay: str,
    temperature: Annotated[float, Ge(0.5), Le(0.7)] = 0.6,
    max_tokens: Annotated[int, Ge(128), Le(MAX_TOKENS)] = MAX_TOKENS,
    num_suggestions: Annotated[int, Ge(1), Le(10)] = 5,
    min_suggestions: Annotated[int, Ge(1), Le(10)] = 3,
  ) -> AsyncGenerator[str, None]:
    if min_suggestions >= num_suggestions:
      raise ValueError(f'min_suggestions ({min_suggestions}) must be less than num_suggestions ({num_suggestions})')

    from openai import AsyncOpenAI
    from openai.types.chat import ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam

    client = AsyncOpenAI(base_url='http://127.0.0.1:3000/v1', api_key='dummy')

    Output = pydantic.create_model(
      'Output',
      __module__=Suggestion.__module__,
      __base__=pydantic.BaseModel,
      suggestions=(pydantic.conlist(Suggestion, min_length=min_suggestions, max_length=num_suggestions), ...),
    )
    params = dict(guided_json=Output.model_json_schema())

    try:
      completions = await client.chat.completions.create(
        model=MODEL_ID,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[
          ChatCompletionSystemMessageParam(role='system', content=SYSTEM_PROMPT),
          ChatCompletionUserMessageParam(role='user', content=essay),
        ],
        stream=True,
        extra_body=params,
      )
      async for chunk in completions:
        yield chunk.choices[0].delta.content or ''
    except Exception:
      yield traceback.format_exc()
