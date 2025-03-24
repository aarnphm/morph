.DEFAULT_GOAL := help

help: ## Show all Makefile targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

engine: ## Running the engine
	VLLM_PLUGINS= bentoml serve service:Engine --port 3001 --debug

api: ## Running API gateway
	VLLM_PLUGINS= bentoml serve service:API --port 3000

stack: ## Running all stacks
	@make -j 2 engine api

build: ## package the stack
	@bentoml build service:API --debug
