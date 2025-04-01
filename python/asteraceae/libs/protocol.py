from __future__ import annotations

import logging, uuid, typing as t
import pydantic

from openai.types.completion_usage import CompletionUsage
from openai.types.create_embedding_response import Usage as EmbeddingUsage
from llama_index.core.schema import EnumNameSerializer, NodeRelationship, RelatedNodeType, TransformComponent, Document

if t.TYPE_CHECKING:
  from llama_index.core.schema import BaseNode
  from _bentoml_sdk.images import Image
  from _bentoml_sdk.service.config import TrafficSchema, TracingSchema, ResourceSchema, HTTPSchema

TaskType = t.Literal['generate', 'embed']
EmbedType = t.Literal['gte-qwen', 'gte-qwen-fast', 'gte-modernbert']
ModelType = t.Literal['r1-qwen', 'r1-qwen-small', 'r1-qwen-tiny', 'r1-qwen-fast', 'r1-llama', 'r1-llama-small', 'qwq']

logger = logging.getLogger('bentoml.service')


def random_uuid() -> str:
  return str(uuid.uuid4().hex)


class LLMMetadata(t.TypedDict):
  model_id: str
  structured_output_backend: str
  temperature: float
  top_p: float
  resources: ResourceSchema


class EmbeddingModelMetadata(t.TypedDict):
  model_id: str
  dimensions: int
  max_model_len: int
  trust_remote_code: bool
  resources: ResourceSchema


class ServiceOpts(t.TypedDict, total=False):
  name: str
  image: Image
  traffic: TrafficSchema
  tracing: TracingSchema
  resources: ResourceSchema
  http: HTTPSchema


ReasoningModels: dict[ModelType, LLMMetadata] = {
  'r1-qwen': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    # TODO: switch to 2 for longer context generations
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-qwen-small': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-qwen-fast': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    resources={'gpu': 1, 'gpu_type': 'nvidia-tesla-a100'},
  ),
  'r1-qwen-tiny': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'r1-llama': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    structured_output_backend='xgrammar',
    temperature=0.6,
    top_p=0.95,
    resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-llama-small': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
    structured_output_backend='xgrammar',
    temperature=0.6,
    top_p=0.95,
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'qwq': LLMMetadata(
    model_id='Qwen/QwQ-32B',
    structured_output_backend='xgrammar',
    temperature=0.6,
    top_p=0.95,
    resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
  ),
}

EmbeddingModels: dict[EmbedType, EmbeddingModelMetadata] = {
  'gte-qwen': EmbeddingModelMetadata(
    model_id='Alibaba-NLP/gte-Qwen2-7B-instruct',
    dimensions=3584,
    max_model_len=8192,
    trust_remote_code=True,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'gte-qwen-fast': EmbeddingModelMetadata(
    model_id='Alibaba-NLP/gte-Qwen2-1.5B-instruct',
    dimensions=1536,
    max_model_len=8192,
    trust_remote_code=True,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'gte-modernbert': EmbeddingModelMetadata(
    model_id='Alibaba-NLP/gte-modernbert-base',
    dimensions=786,
    max_model_len=8192,
    trust_remote_code=False,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
}


class NotesRequest(pydantic.BaseModel):
  vault_id: str
  file_id: str
  note_id: str
  content: str


class EssayRequest(pydantic.BaseModel):
  vault_id: str
  file_id: str
  content: str


class EssayNode(pydantic.BaseModel):
  embedding: list[float] | None
  node_id: str
  metadata: dict[str, t.Any]
  relationships: dict[t.Annotated[NodeRelationship, EnumNameSerializer], RelatedNodeType]
  metadata_separator: str


class EssayResponse(pydantic.BaseModel):
  vault_id: str
  file_id: str
  nodes: list[EssayNode]
  error: str = ''


class NotesResponse(pydantic.BaseModel):
  vault_id: str
  file_id: str
  note_id: str
  embedding: list[float]
  error: str = ''
  usage: EmbeddingUsage = pydantic.Field(default_factory=lambda: EmbeddingUsage(prompt_tokens=0, total_tokens=0))


class HealthRequest(pydantic.BaseModel):
  timeout: int = 30


class DependentStatus(pydantic.BaseModel):
  name: str
  healthy: bool = pydantic.Field(default=False)
  latency_ms: float = pydantic.Field(default=0.0)
  error: str = pydantic.Field(default='')


class HealthResponse(pydantic.BaseModel):
  healthy: bool
  services: list[DependentStatus]
  timestamp: str


class LLMInfo(pydantic.BaseModel):
  model_id: str
  model_type: str
  structured_outputs: str


class EmbedInfo(pydantic.BaseModel):
  model_id: str
  model_type: str
  M: int
  ef_construction: int
  dimensions: int


class MetadataResponse(pydantic.BaseModel):
  llm: LLMInfo
  embed: EmbedInfo


class Suggestion(pydantic.BaseModel):
  suggestion: str
  reasoning: str = pydantic.Field(default='')
  usage: CompletionUsage | None = None


class Suggestions(pydantic.BaseModel):
  suggestions: list[Suggestion]


class Tonality(pydantic.BaseModel):
  formal: float = 0
  fun: float = 0
  logical: float = 0
  soul_cartographer: float = 0

  model_config = pydantic.ConfigDict(
    alias_generator=lambda field_name: field_name.replace('_', '-'), populate_by_name=True, extra='allow'
  )


class LineNumberMetadataExtractor(TransformComponent):
  def __call__(self, nodes: list[BaseNode], **kwargs: t.Any) -> list[BaseNode]:
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
