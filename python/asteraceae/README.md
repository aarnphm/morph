# asteraceae

Inference backend for [morph](https://morph-editor.app)

Powered by [BentoML](https://bentoml.com), [vLLM](https://blog.vllm.ai/2023/06/20/vllm.html), [LlamaIndex](https://www.llamaindex.ai/), and [Goodfire](https://www.goodfire.ai/)

Using [CalVer](https://calver.org/) versioning

The following table describes available environment variables to be used with this multi-service inference node:

| environment variables | defaults   | required | notes                                            |
| --------------------- | ---------- | -------- | ------------------------------------------------ |
| `HF_TOKEN`            |            | ✅       |                                                  |
| `MAX_MODEL_LEN`       | 16384      |          |                                                  |
| `MAX_TOKENS`          | 8192       |          |                                                  |
| `INFERENCE_ID`        | `r1-qwen`  |          | Check [`protocol.py`](./protocol.py) for mapping |
| `EMBEDDING_ID`        | `gte-qwen` |          | Check [`protocol.py`](./protocol.py) for mapping |
