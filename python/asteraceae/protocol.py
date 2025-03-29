from __future__ import annotations

import enum, typing as t
import bentoml, pydantic

if t.TYPE_CHECKING:
  from _bentoml_sdk.service.config import ResourceSchema
  from _bentoml_sdk.images import Image
  from _bentoml_sdk.service.config import TrafficSchema, TracingSchema

EmbedType = t.Literal['gte-qwen']
ModelType = t.Literal['r1-qwen', 'r1-qwen-small', 'r1-qwen-tiny', 'r1-qwen-fast', 'r1-llama', 'r1-llama-small', 'qwq']


class LLMMetadata(t.TypedDict):
  model_id: str
  structured_output_backend: str
  resources: ResourceSchema


class EmbeddingModelMetadata(t.TypedDict):
  model_id: str
  dimensions: int
  resources: ResourceSchema


class ServiceOpts(t.TypedDict, total=False):
  name: str
  image: Image
  traffic: TrafficSchema
  tracing: TracingSchema
  resources: ResourceSchema


SERVICE_CONFIG: ServiceOpts = {
  'tracing': {'sample_rate': 1.0},
  'traffic': {'timeout': 1000, 'concurrency': 128},
  'image': bentoml.images.PythonImage(python_version='3.11', lock_python_packages=False)
  .pyproject_toml('pyproject.toml')
  .run('uv pip install --compile-bytecode flashinfer-python --find-links https://flashinfer.ai/whl/cu124/torch2.6'),
}

ReasoningModels: dict[ModelType, LLMMetadata] = {
  'r1-qwen': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-qwen-small': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-14B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-qwen-fast': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    resources={'gpu': 1, 'gpu_type': 'nvidia-tesla-a100'},
  ),
  'r1-qwen-tiny': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
    structured_output_backend='xgrammar:disable-any-whitespace',
    resources={'gpu': 1, 'gpu_type': 'nvidia-l4'},
  ),
  'r1-llama': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    structured_output_backend='xgrammar',
    resources={'gpu': 2, 'gpu_type': 'nvidia-a100-80gb'},
  ),
  'r1-llama-small': LLMMetadata(
    model_id='deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
    structured_output_backend='xgrammar',
    resources={'gpu': 1, 'gpu_type': 'nvidia-tesla-a100'},
  ),
  'qwq': LLMMetadata(
    model_id='Qwen/QwQ-32B', structured_output_backend='xgrammar', resources={'gpu': 1, 'gpu_type': 'nvidia-a100-80gb'}
  ),
}

EmbeddingModels: dict[EmbedType, EmbeddingModelMetadata] = {
  'gte-qwen': EmbeddingModelMetadata(
    model_id='Alibaba-NLP/gte-Qwen2-7B-instruct', dimensions=3584, resources={'gpu': 1, 'gpu_type': 'nvidia-l4'}
  )
}


class Essay(pydantic.BaseModel):
  vault_id: str
  file_id: str
  content: str


class Note(pydantic.BaseModel):
  vault_id: str
  file_id: str
  note_id: str
  content: str


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
