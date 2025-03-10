#This service uses BentoML to host a SentenceTransformers model that encodes sentences into embeddings.
#Input is a list of sentences and output is a numpy array of embeddings

import typing as t
import numpy as np
import bentoml

DEFAULT_SENTENCES = [
    "The sun dips below the horizon, painting the sky orange.",
    "A gentle breeze whispers through the autumn leaves.",
    "The moon casts a silver glow on the tranquil lake.",
    "A solitary lighthouse stands guard on the rocky shore.",
]

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"

@bentoml.service(
    traffic={"timeout": 60},
    resources={"gpu": 1, "gpu_type": "nvidia-t4"},
)
class SentenceTransformers:
    def __init__(self) -> None:
        import torch
        from sentence_transformers import SentenceTransformer, models

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = SentenceTransformer(MODEL_ID, device=self.device)
        print(f"Model '{MODEL_ID}' loaded on device: '{self.device}'.")

    @bentoml.api(batchable=True)
    def encode(self,sentences: t.List[str] = DEFAULT_SENTENCES) -> np.ndarray:
        return self.model.encode(sentences)


service = SentenceTransformers()

# Assuming 'service' is an instance of your SentenceTransformers service
embeddings = service.encode()
print(len(embeddings[0]))

