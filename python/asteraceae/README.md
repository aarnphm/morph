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
> In one terminal run:
>
> ```bash
> BENTOML_DISABLE_GPU_ALLOCATION=True CUDA_VISIBLE_DEVICES=0 VLLM_PLUGINS= bentoml serve service:Engine --port 3001 --debug
> ```
>
> Open a new terminal then run:
>
> ```bash
> BENTOML_DISABLE_GPU_ALLOCATION=True CUDA_VISIBLE_DEVICES=1 VLLM_PLUGINS= bentoml serve service:Embeddings --port 3002 --debug
> ```
>
> Then the API server can be run in a separate terminal:
>
> ```bash
> DEVELOPMENT=1 bentoml serve service:API --port 3000 --debug
> ```

For the LLM engine, if you don't have a large GPUs then you should set `LLM=r1-qwen-tiny` to use smaller models.
