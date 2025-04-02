---
id: Scratch
aliases:
  - dump
  - scratch
tags:
  - evergreen
author: aarnphm
comments: false
date: "2024-09-18"
modified: 2025-03-31 14:45:51 GMT-04:00
title: Scratchpad
---

## features development

design UI: everyone P0 (time to do this)

- workflow: how does panel interact

- implementation UI: @nebrask (A/B testing)

- iterative feature development afterwards: @lucas @waleed

- ML components: @aarnphm

- training: (research) (quality testing) <- @aarnphm[^3]
- inference: (infrastructure) (A/B testing, regression testing) @waleed

  - OpenAI-compatible API server: [functional](https://github.com/aarnphm/morph/tree/main/python/asteraceae)
  - Edit logits for inference server (vllm, llama-cpp)
  - local inference
  - UX: TTFT (time to first tokens)
  - inference engine: vLLM (GPU), llama-cpp (CPU)
  - vllm plugins [support](https://github.com/vllm-project/vllm/commit/16422ea76f213f5b1035513b441245b19ca5bdce)

- multiplayer text editor: (target: stakeholders) + (other player: AI models) (P3)

### ux.

- session history: https://translucentweb.site/
- writing => graph (embeddings representation for the text)

https://x.com/thesephist/status/1793033871606382748

Inline-definition

https://x.com/JohnPhamous/status/1841527353270476808

accesibility:

- https://www.w3.org/WAI/standards-guidelines/aria/

[Telescopic text](https://www.telescopictext.org/)

expansion upon telescopic text: [notation](https://thesephist.com/posts/hyperlink/)

https://x.com/david_perell/status/1841875983676162124

[_website_](https://writingexamples.com/article/orwell-symbols-tell-a-story)

cursor navigation:

https://x.com/JaceThings/status/1843441743187861850

graph-based:

=> Conceptual: Mind map

- empirical

non-linear actions -> linear actions

drag-and-drop posted notes => generate posted-notes

### cost.

Using EC2 for GPUs and inference cost. (Running on A100 with 32 CPUs)

## text editor

> [!question]
>
> - What sort of data structure we want to use for implement this?
> - How should we implement cursor and certain buffers?
> - File management locally (preferrably user-owned instead of centralized data storage)
> - [Stretch, preference] Can we support modal editing?
> - How do we handle syntax highlighting as well as markdown rendering (think of treesitter, but then shiki is pretty computationally expensive)
> - How should we handle file (Chromium has a file system API builtin the browser)

> For node server, I'm thinking we should keep it light, as it can run a simple proxy server that opens a websocket to stream the JSON to the browser (probably easiest for us as we don't have to worry too much about graphQL or any of that nonsense db) has context menu

See [[play.html]] for dead-simple editor I played with.

Local file is a must (can be accessed via `file:///`)

```javascript
async function createFolder() {
  try {
    const dirHandle = await window.showDirectoryPicker()

    // Create a new folder
    const newFolderHandle = await dirHandle.getDirectoryHandle("NewFolder", { create: true })

    console.log("Folder created successfully")
    return newFolderHandle
  } catch (err) {
    console.error("Error creating folder:", err)
  }
}
```

Possible UI component library: [shadcn/ui](https://ui.shadcn.com/)

https://x.com/CherrilynnZ/status/1836881535154409629

editor: https://prosemirror.net/

> [!question]- What is the data model for planning?
>
> CoT drawbacks

## training [[glossary#sparse autoencoders|SAEs]]

see also: [Goodfire](https://goodfire.ai/blog/research-preview/) preview releases

Dictionary learning: https://transformer-circuits.pub/2023/monosemantic-features/index.html
=> motivation to prove SAE results in interpretable features

https://transformer-circuits.pub/2024/scaling-monosemanticity/

for finding attention activation.

Anthropic's report on [training SAEs](https://transformer-circuits.pub/2024/april-update/index.html#training-saes)

- https://github.com/EleutherAI/sae
- https://github.com/jbloomAus/SAELens
  - use as reference, but probably `torch.distributed` and `transformers.Trainer` should be more than enough

on GPT-2: [github](https://github.com/openai/sparse_autoencoder) and [paper](https://cdn.openai.com/papers/sparse-autoencoders.pdf)

- lens into viewing random activations

https://lstmvis.vizhub.ai/ => LSTM vis
https://github.com/TransformerLensOrg/TransformerLens

https://blog.eleuther.ai/autointerp/

Attribute allocation?

> [!question]
> How should we steer?
>
> - Think of using SAEs => iterate better prompt
>
> Features composition for guided steering
>
> - [activation steering](https://github.com/nrimsky/CAA/blob/main/activation_steering_interp.ipynb)
>
> features rep? Correctness w/ models internal representation (trie for models)
>
> - manually curate features
>   features ablation:
>
> Accurate mappings based on human and machine features?
>
> Context: reduction in third space of model representations

representation based on users text (build features)

Use SAE to steerable generations[^1] <= User feedbacks

> [!IMPORTANT] problem statement.
> actionable steering for attention-based models

> [!question] RAG-infused pipeline
>
> What if we add additional web-search vectors to enhance correctness in steering?

## inference

Steering Llama via Contrastive Activation Addition [@panickssery2024steeringllama2contrastive], [code](https://github.com/nrimsky/CAA)

- Seems like they are using layer 16 for interp Claude's features

## self-explanation

_Excerpt from [Self-explaining SAE features](https://www.alignmentforum.org/posts/8ev6coxChSWcxCDy8/self-explaining-sae-features)_

- Idea: replace residual stream on X with decoder direction times a given scale, called ==self-explanation==
- auto-interp: use a larger LLM to spot patterns in max activating examples (See Neuronpedia's auto-interp)

A variant of activation patching

See also: [SelfE](https://arxiv.org/abs/2403.10949) or [Patchscope](https://arxiv.org/abs/2401.06102)

> [!important]
>
> align with auto-interp[^2] as the current standard for SAE feature interpretation.

### self-similarity

measure cosine similarity between the 16th layer residual stream of last prompt tokens and original SAE feature.

### entropy

based on predicted distribution of the answer's first token.

The distribution is represented as $P(t_n | t_{1 \dots n-1})$. Since we will insert SAE feature direction into one of
the prompt token, the distribution becomes $P(t_n | t_{1 \dots n-1}, f)$ where $f$ is the SAE feature index..

Note that entropy decreases as the mutual information between random variable representing the feature and first answer
token increases.

### composite

ranks the optimal scale in the top-3 list for a much larger percentage of cases.

$$
\text{composite}(x) = \alpha \cdot \text{self-similarity}(x) + (1 - \alpha) \cdot \text{entropy}(x)
$$

[^1]: Linus' talk on interface for latent space exploration [site](https://thesephist.com/posts/latent/) or [yt](https://www.youtube.com/watch?v=bPSq7oAd6-o&ab_channel=SouthParkCommons)

[^2]: [Language models can explain neurons in language models](https://openaipublic.blob.core.windows.net/neuron-explainer/paper/index.html)

[^3]: [mwatkins's earlier exploration](https://www.lesswrong.com/posts/c6uTNm5erRrmyJvvD/mapping-the-semantic-void-strange-goings-on-in-gpt-embedding)

## mathematical framework for transformers circuits

_excerpt from [this transformers threads](https://transformer-circuits.pub/2021/framework/index.html#residual-comms)_

## automatic interpretability

see also: [Transluce's Monitor](https://transluce.org/) [source](https://github.com/TransluceAI/observatory)

## plan

- update docs
  - waleed & lucas
- frontend
  - nebras
- server
  - aarnphm

---

Prep for POC interview

1. Lectures
2. TA meetings
3. Extras

## Extras

user manual and usability testing
