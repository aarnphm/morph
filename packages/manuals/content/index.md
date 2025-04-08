---
id: index
title: morph user manuals
tags:
  - evergreen
date: 03/30/2025
description: user manuals a la carte.
---

## introduction.

In 1972 Alan Kay [@AlanKay1972, 11] conceptualised the Dynabook, a portable device that empower
users of all ages to explore and learn. More than just a portable computer, the Dynabook was envisioned as a dynamic, interactive medium for
learning, creation, and self-expression, that could adapt to users' increasing skills and need.

Fast forward to the $21^{\text{st}}$ century, software has become comoditised and transcend every aspect in our life.
Simultaneously, we've seen exponential growth in machine learning (ML) systems'[^1] capabilities, largely due to a general push of large language models (LLMs) into the mainstream.
As these systems exhibit emergent properties of intelligence, how should we craft interfaces that amplify
users' [[glossary#agency|agency]] and encourage a sense of personalisation through interactions, rather than providing a mere tool for automation?

Imagine you are an engineer who pursues creative writing as a hobby. You often curate topics and ideas from discussion on social media,
then categorise them into themes for your arguments. There are plethora of tools
out there that you can use to assist you with planning for your writing.
For those inclined towards more adventurous endeavours, such as running customized
models to meet specific requirements, you might find yourself in the land of _auto-regressive models_: GPTs and friends.

[[glossary#auto-regressive model|Auto-regressive models]] excels at surfacing machines' internal representation of the world through a simple interface: given
a blob of text, the model will generate a contiguous piece of text that it predicts as the most probable tokens.
For example, if you give it a Wikipedia article, the model should produce text consistent with the remainder of said article.
These models works well given the following assumption: the inputs prompt must be coherent and well-structured
surrounding a given problem the users want to achieve.
A writer might provide paragraphs from their favourite authors - let's say Joan Didion, as context to formulate their
arguments for a certain writing. The model then "suggests" certain ideas that simulate Didion's style of writing. Here
is a big catch: [garbage in, garbage out](https://en.wikipedia.org/wiki/Garbage_in,_garbage_out). If your prompt are
disconnected or incoherent, the model will generate text that is equally incoherent.

This heuristic lays the foundation to the proliferation of conversational user interfaces (CUIs), which is obvious
given that chat is a thin wrapper around text modality. Yet, CUIs often prove frustrating when dealing with tasks that require
larger sets of information (think of support portals, orders forms, etc.). Additionally,
for tasks that require frequent information retrieval (research, travel planning, writing, etc.), CUIs are suboptimal as they
compel users to unnecessarily maintain information in their working memory (for no reason).
For writers, the hardest part of writing or getting over writers block usually relies on how to coherently structure
their thoughts onto papers. This requires a step beyond pure conversation partners, an interface that induces both
planning and modelling of ideas.

Given these challenges, `morph` doesn't seek to be a mere tools for rewriting text. `morph` aims to explore
alternative interfaces for text generations models to extend our cognitive abilities. This means developing spatial and visual
interfaces that allow for non-linear exploration of information and ideas, through writing.

## instruction.

The following docs entail user documentations on how to use [morph](https://morph-editor.app).

Demoed at McMaster Capstone Expo 2025

> [!important] Demo day setup
>
> If you are accessing the day of the capstone (April 8th 2025) and want to try out, please contact the teams for
> getting access.
>
> `morph` will be publicly accessible shortly.

> [!tip]- Navigation of the site
>
> | Shortcut          | Action               |
> | ----------------- | -------------------- |
> | <kbd>ctrl+k</kbd> | search               |
> | <kbd>ctrl+n</kbd> | next search item     |
> | <kbd>ctrl+p</kbd> | previous search item |
> | <kbd>ctrl+g</kbd> | graph                |

## acknowledgements.

We want to give my gratitude to the following individuals/organisations for their works and guidance for
`morph`:

- [EleutherAI](https://www.eleuther.ai/)
- [Linus](https://thesephist.com/) for his general exploration in machine-native interfaces, as well as his initial
  discussion and recommendations.
- [Neel Nanda](https://www.neelnanda.io/about) spearheading the field of [[glossary#mechanistic interpretability]]
- Anthropic Interpretability Team's [Transformers Circuit](https://transformer-circuits.pub/) threads
- Google DeepMind Interpretability Team.

[^1]:
    Historically, the seminar work from Alan Turing laid the foundation for exploring the possibilities of a thinking machine [@10.1093/mind/LIX.236.433].
    Subsequently, the development of AI had taken a symbolic approach, popularized
    through decision-tree reasonings and expert systems -- world representation through high-level and human-readable
    symbols to manipulate the results. Haugeland referred to these systems as Good Old-Fashioned AI (GOFAI) [@10.7551/mitpress/4626.001.0001]

    However, GOFAI presented its limitation and led us into a "AI Winter", largely due to the cynicism of the general research community
    as well as a reduction in funding at most research labs. [@handler2008avoidanotheraiwinter]

    Given the rise to Moore's Law and the exponential amount of computing and [[glossary#data|data]] a new approach
    centered around statistical methods and [[glossary#connectionism|connectionist]] networks arose, and referred as "New Fangled AI" (NFAI).
    Machine learning system nowadays are also known as NFAI systems.

[^ref]
