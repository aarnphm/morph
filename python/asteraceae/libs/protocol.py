from __future__ import annotations

import typing as t
import pydantic

from openai.types.completion_usage import CompletionUsage

if t.TYPE_CHECKING:
  from _bentoml_sdk.images import Image
  from _bentoml_sdk.service.config import TrafficSchema, TracingSchema, ResourceSchema, HTTPSchema

TaskType = t.Literal['generate', 'embed']
EmbedType = t.Literal['gte-qwen', 'gte-qwen-fast', 'gte-modernbert']
ModelType = t.Literal['r1-qwen', 'r1-qwen-small', 'r1-qwen-tiny', 'r1-qwen-fast', 'r1-llama', 'r1-llama-small', 'qwq']


class LLMMetadata(t.TypedDict):
  model_id: str
  structured_output_backend: str
  temperature: float
  top_p: float
  resources: ResourceSchema


class EmbeddingModelMetadata(t.TypedDict):
  model_id: str
  dimensions: int
  max_tokens: int
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
    resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
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
    max_tokens=8192,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'gte-qwen-fast': EmbeddingModelMetadata(
    model_id='Alibaba-NLP/gte-Qwen2-1.5B-instruct',
    dimensions=1536,
    max_tokens=8192,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'gte-modernbert': EmbeddingModelMetadata(
    model_id='Alibaba-NLP/gte-modernbert-base',
    dimensions=786,
    max_tokens=8192,
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
}


class DependentStatus(pydantic.BaseModel):
  name: str
  healthy: bool = pydantic.Field(default=False)
  latency_ms: float = pydantic.Field(default=0.0)
  error: str = pydantic.Field(default='')


class HealthStatus(pydantic.BaseModel):
  healthy: bool
  services: list[DependentStatus]
  timestamp: str


class Suggestion(pydantic.BaseModel):
  suggestion: str
  reasoning: str = pydantic.Field(default='')
  usage: t.Optional[CompletionUsage] = None


class Suggestions(pydantic.BaseModel):
  suggestions: list[Suggestion]


class Tonality(pydantic.BaseModel):
  formal: float = 0
  fun: float = 0
  logical: float = 0
  soul_cartographer: float = 0

  model_config = pydantic.ConfigDict(
    alias_generator=lambda field_name: field_name.replace('_', '-'), populate_by_name=True
  )
