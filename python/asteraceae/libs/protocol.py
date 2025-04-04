from __future__ import annotations

import logging, uuid, typing as t
import pydantic

from openai.types.completion_usage import CompletionUsage
from openai.types.create_embedding_response import Usage as EmbeddingUsage
from llama_index.core.schema import EnumNameSerializer, NodeRelationship, RelatedNodeType, TransformComponent

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


class ModelForCausalLM(t.TypedDict):
  model_id: str
  structured_output_backend: str
  temperature: float
  top_p: float
  max_model_len: int
  max_tokens: int
  resources: ResourceSchema


class ModelForClassification(t.TypedDict):
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


ReasoningModels: dict[ModelType, ModelForCausalLM] = {
  'r1-qwen': ModelForCausalLM(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    max_model_len=48 * 1024,
    max_tokens=32 * 1024,
    # TODO: switch to 2 for longer context generations
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-qwen-small': ModelForCausalLM(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    max_model_len=48 * 1024,
    max_tokens=32 * 1024,
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-qwen-fast': ModelForCausalLM(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    max_model_len=48 * 1024,
    max_tokens=32 * 1024,
    resources={'gpu': 1, 'gpu_type': 'nvidia-tesla-a100'},
  ),
  'r1-qwen-tiny': ModelForCausalLM(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    temperature=0.6,
    top_p=0.95,
    max_model_len=48 * 1024,
    max_tokens=32 * 1024,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'r1-llama': ModelForCausalLM(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    structured_output_backend='xgrammar',
    temperature=0.6,
    top_p=0.95,
    max_model_len=48 * 1024,
    max_tokens=32 * 1024,
    resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-llama-small': ModelForCausalLM(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
    structured_output_backend='xgrammar',
    temperature=0.6,
    top_p=0.95,
    max_model_len=48 * 1024,
    max_tokens=32 * 1024,
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'qwq': ModelForCausalLM(
    model_id='Qwen/QwQ-32B',
    structured_output_backend='xgrammar',
    temperature=0.6,
    top_p=0.95,
    max_model_len=32 * 1024,
    max_tokens=20 * 1024,
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
}

EmbeddingModels: dict[EmbedType, ModelForClassification] = {
  'gte-qwen': ModelForClassification(
    model_id='Alibaba-NLP/gte-Qwen2-7B-instruct',
    dimensions=3584,
    max_model_len=8192,
    trust_remote_code=True,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'gte-qwen-fast': ModelForClassification(
    model_id='Alibaba-NLP/gte-Qwen2-1.5B-instruct',
    dimensions=1536,
    max_model_len=8192,
    trust_remote_code=True,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'gte-modernbert': ModelForClassification(
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


class Authors(pydantic.BaseModel):
  authors: list[str] = pydantic.Field(description='A list of suggested authors for given essay excerpt')


class Tonality(pydantic.BaseModel):
  formal: float = 0
  fun: float = 0
  logical: float = 0
  soul_cartographer: float = 0

  model_config = pydantic.ConfigDict(
    alias_generator=lambda field_name: field_name.replace('_', '-'), populate_by_name=True, extra='allow'
  )


class LineNumberMetadataExtractor(TransformComponent):
  """Extracts line numbers from document content and adds them to node metadata.

  This extractor assigns line numbers to each line in the document,
  preserving whitespace, and ensures this information is available
  in the node metadata after semantic chunking.
  """

  include_whitespace: bool = True

  def __call__(self, nodes: list[BaseNode], **kwargs: t.Any) -> list[BaseNode]:
    """Process nodes to add line number metadata.

    For each node, this adds:
    - line_numbers: List of line numbers contained in this node
    - start_line: First line number in this node
    - end_line: Last line number in this node
    - line_map: Dictionary mapping line numbers to line content

    Args:
        nodes: The list of nodes to extract metadata from

    Returns:
        The same list of nodes with updated metadata
    """
    for node in nodes:
      if not hasattr(node, 'metadata'):
        continue

      # Get the original text - either from metadata or by looking at source node
      original_text = None

      # First check if we stored original_text in metadata during document creation
      if 'content' in node.metadata:
        original_text = node.metadata['content']
      # Then check source_node for Document-derived nodes
      elif hasattr(node, 'source_node') and node.source_node and hasattr(node.source_node, 'text'):
        original_text = node.source_node.text
      # Or check if this is actually a Document
      elif hasattr(node, 'text'):
        original_text = node.text

      if not original_text:
        logger.warning(
          'No original text found for node %s, skipping line number extraction', getattr(node, 'node_id', 'unknown')
        )
        continue

      # Get the content of this node
      node_text = node.get_content() if hasattr(node, 'get_content') else getattr(node, 'text', '')
      node_text = node_text.strip()  # Strip for better matching

      if not node_text:
        continue

      # Split the original text into lines
      original_lines = original_text.splitlines()

      # Process line by line
      line_numbers = []
      line_map = {}

      # Find the chunk text in the original document
      try:
        # Simple approach: try to find exact chunk in text
        start_char_index = original_text.find(node_text)

        if start_char_index >= 0:
          # If found directly, calculate line numbers
          start_line = original_text.count('\n', 0, start_char_index) + 1
          end_char_index = start_char_index + len(node_text)
          end_line = original_text.count('\n', 0, end_char_index) + 1

          # Generate line numbers and map
          for i in range(start_line, end_line + 1):
            line_numbers.append(i)
            # Use 1-indexed for line numbers
            if i - 1 < len(original_lines):
              line_map[i] = original_lines[i - 1]
        else:
          # Fallback: check line by line for partial matches
          node_sentences = [s.strip() for s in node_text.split('.') if s.strip()]

          for i, line in enumerate(original_lines):
            line_num = i + 1  # 1-indexed

            # Skip empty lines if configured
            if not line.strip() and not self.include_whitespace:
              continue

            # Direct match
            if line.strip() in node_text or any(sent in line for sent in node_sentences):
              line_numbers.append(line_num)
              line_map[line_num] = line
      except Exception as e:
        logger.error('Error extracting line numbers for node %s: %s', getattr(node, 'node_id', 'unknown'), e)
        # Continue with partial results if any

      # Update metadata with line information
      if line_numbers:
        node.metadata['line_numbers'] = line_numbers
        node.metadata['start_line'] = min(line_numbers)
        node.metadata['end_line'] = max(line_numbers)
        node.metadata['line_map'] = line_map
      else:
        # Default values
        node.metadata['line_numbers'] = []
        node.metadata['start_line'] = -1
        node.metadata['end_line'] = -1
        node.metadata['line_map'] = {}

    return nodes

  # For compatibility with llama_index BaseExtractor
  def extract(self, nodes, **kwargs):
    """Extract line metadata as BaseExtractor interface.

    This is for compatibility with the BaseExtractor interface in llama_index,
    which might be used alongside this component.
    """
    # Process nodes using the __call__ method
    self.__call__(nodes, **kwargs)

    # Return metadata in the format expected by BaseExtractor
    metadata_list = []
    for node in nodes:
      if hasattr(node, 'metadata'):
        metadata_list.append({
          'line_numbers': node.metadata.get('line_numbers', []),
          'start_line': node.metadata.get('start_line', -1),
          'end_line': node.metadata.get('end_line', -1),
          'line_map': node.metadata.get('line_map', {}),
        })
      else:
        metadata_list.append({})

    return metadata_list
