from __future__ import annotations

import logging, argparse, contextlib, typing as t
import fastapi, bentoml

from llama_index.core.schema import TransformComponent
from llama_index.core import Document

from libs.protocol import ServiceOpts, TaskType

if t.TYPE_CHECKING:
  from _bentoml_sdk import Service
  from llama_index.core.schema import BaseNode

logger = logging.getLogger('bentoml.service')

T = t.TypeVar('T', bound=object)


def make_labels(task: TaskType) -> dict[str, t.Any]:
  return {'owner': 'aarnphm', 'type': 'engine', 'task': task}


def inference_service(
  *, hf_id: str, exclude: list[str], task: TaskType, envs: list[dict[str, str]], service_config: ServiceOpts
):
  app = fastapi.FastAPI()

  class Shared:
    model_id = hf_id
    model = bentoml.models.HuggingFaceModel(model_id, exclude=exclude)

    if t.TYPE_CHECKING:
      args: argparse.Namespace

    def __init__(self):
      self.exit_stack = contextlib.AsyncExitStack()

    @bentoml.on_startup
    async def init_engine(self) -> None:
      import vllm.entrypoints.openai.api_server as vllm_api_server

      router = fastapi.APIRouter(lifespan=vllm_api_server.lifespan)
      OPENAI_ENDPOINTS = [
        ['/chat/completions', vllm_api_server.create_chat_completion, ['POST']],
        ['/completions', vllm_api_server.create_completion, ['POST']],
        ['/embeddings', vllm_api_server.create_embedding, ['POST']],
        ['/models', vllm_api_server.show_available_models, ['GET']],
      ]

      for route, endpoint, methods in OPENAI_ENDPOINTS:
        router.add_api_route(path=route, endpoint=endpoint, methods=methods, include_in_schema=True)
      app.include_router(router)

      self.engine = await self.exit_stack.enter_async_context(vllm_api_server.build_async_engine_client(self.args))
      self.model_config = await self.engine.get_model_config()
      self.tokenizer = await self.engine.get_tokenizer()

      await vllm_api_server.init_app_state(self.engine, self.model_config, app.state, self.args)

    @bentoml.on_shutdown
    async def teardown_engine(self):
      await self.exit_stack.aclose()

  def decorator(inner: type[T]) -> Service[t.Any]:
    @bentoml.asgi_app(app, path='/v1')
    @bentoml.service(labels=make_labels(task=task), envs=envs, **service_config)
    class Inner(Shared, inner):
      pass

    Inner.inner.__qualname__ = inner.__qualname__
    Inner.inner.__name__ = inner.__name__
    return Inner

  return decorator


class LineNumberMetadataExtractor(TransformComponent):
  def __call__(self, nodes: t.Sequence[BaseNode], **kwargs: t.Any) -> list[BaseNode]:
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
