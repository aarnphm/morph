from __future__ import annotations

import logging, traceback, asyncio
import bentoml, fastapi, pydantic

from typing import AsyncGenerator, List, Literal, Optional
from annotated_types import Ge, Le
from typing_extensions import Annotated

logger = logging.getLogger(__name__)

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

<suggestion>
[Your concise, meaningful suggestion to improve the writing]
</suggestion>

Please proceed with your analysis and suggestion for the given essay excerpt."""


class Suggestion(pydantic.BaseModel):
  suggestion: str


@bentoml.asgi_app(openai_api_app, path='/v1')
@bentoml.service(
  name='asteraceae-inference-service',
  traffic={'timeout': 300, 'concurrency': 128},
  resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
  labels={'owner': 'hinterland', 'type': 'inference-service'},
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
    {'name': 'UV_COMPILE_BYTECODE', 'value': 1},
    {'name': 'UV_NO_PROGRESS', 'value': 1},
    {'name': 'HF_HUB_DISABLE_PROGRESS_BARS', 'value': 1},
    {'name': 'VLLM_ATTENTION_BACKEND', 'value': 'FLASH_ATTN'},
  ],
  image=bentoml.images.PythonImage(python_version='3.11', lock_python_packages=False)
  .requirements_file('requirements.txt')
  .run('uv pip install flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.5'),
)
class Engine:
  ref = bentoml.models.HuggingFaceModel(MODEL_ID, exclude=['*.pth'])

  def __init__(self):
    from openai import AsyncOpenAI

    self.openai = AsyncOpenAI(base_url='http://127.0.0.1:3000/v1', api_key='dummy')

  @bentoml.on_startup
  async def init_engine(self) -> None:
    import vllm.entrypoints.openai.api_server as vllm_api_server

    from vllm.utils import FlexibleArgumentParser
    from vllm.entrypoints.openai.cli_args import make_arg_parser

    args = make_arg_parser(FlexibleArgumentParser()).parse_args([])
    args.model = self.ref
    args.disable_log_requests = True
    args.max_log_len = 1000
    args.served_model_name = [MODEL_ID]
    args.request_logger = None
    args.disable_log_stats = True
    args.enable_prefix_caching = True
    args.max_model_len = 16384

    router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
    OPENAI_ENDPOINTS = [
        ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
        ['/models', vllm_api_server.show_available_models, ['GET']],
    ]

    for route, endpoint, methods in OPENAI_ENDPOINTS: router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
    openai_api_app.include_router(router)

    self.engine_context = vllm_api_server.build_async_engine_client(args)
    self.engine = await self.engine_context.__aenter__()
    self.model_config = await self.engine.get_model_config()
    self.tokenizer = await self.engine.get_tokenizer()
    args.enable_reasoning = True
    args.enable_auto_tool_choice = True
    args.reasoning_parser = 'deepseek_r1'
    args.tool_call_parser = 'hermes'

    await vllm_api_server.init_app_state(self.engine, self.model_config, openai_api_app.state, args)

  @bentoml.on_shutdown
  async def teardown_engine(self):
    await self.engine_context.__aexit__(GeneratorExit, None, None)

  @bentoml.api
  async def suggests(
    self,
    essay: str,
    temperature: Annotated[float, Ge(0.5), Le(0.7)] = 0.6,
    max_tokens: Annotated[int, Ge(128), Le(MAX_TOKENS)] = MAX_TOKENS,
    num_suggestions: Annotated[int, Ge(1), Le(10)] = 5,
    min_suggestions: Annotated[int, Ge(1), Le(10)] = 3,
  ) -> AsyncGenerator[str, None]:
    if min_suggestions >= num_suggestions: raise ValueError(f'min_suggestions ({min_suggestions}) must be less than num_suggestions ({num_suggestions})')

    from openai.types.chat import ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam

    Output = pydantic.create_model(
      'Output',
      __module__=Suggestion.__module__,
      __base__=pydantic.BaseModel,
      suggestions=(pydantic.conlist(Suggestion, min_length=min_suggestions, max_length=num_suggestions), ...),
    )
    params = dict(guided_json=Output.model_json_schema())

    try:
      completions = await self.openai.chat.completions.create(
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
      async for chunk in completions: yield chunk.choices[0].delta.content or ''
    except Exception:
      logger.error(traceback.format_exc())
      yield 'Internal error found. Check server logs for more information'
      return
