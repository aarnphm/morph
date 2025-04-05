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
| `LLM`                 | `r1-qwen`  |          | Check [`protocol.py`](./protocol.py) for mapping |
| `EMBED`               | `gte-qwen` |          | Check [`protocol.py`](./protocol.py) for mapping |

> [!NOTE]
> To run the inference backend locally, make sure you have at least two GPUs.
>
> ```bash
> bash swarm.sh
> ```

To run hot-reload API service, do `DEBUG=1`, otherwise `DEBUG=2` for full verbosity

For the LLM engine, if you don't have a large GPUs then you should set `LLM=r1-qwen-tiny` to use smaller models.

There are a few endpoints to consider:

- `/essays`: handle semantic chunks of essays with line number metadata aware, with title extractors for relevant documents information
- `/notes`: handles creating notes embeddings
- `/authors`: A reasoning RAG search for authors assignments.
- `/v1/chat/completions`: OpenAI-compatible Chat Completions API proxy to internal LLM node.
- `/v1/embeddings`: OpenAI-compatible Embeddings API proxy to internal Embedding node.
- `/v1/models`: will return both informations for the LLM and Embedding node.
