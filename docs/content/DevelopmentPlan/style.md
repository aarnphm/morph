---
id: style
tags:
  - meta
author: aarnphm
date: "2024-09-23"
modified: 2025-03-31 14:50:16 GMT-04:00
title: Python coding style
---

## The coding style

This documentation serves as a brief discussion of the coding style used for
`morph`'s python coding style. As you might noticed, it is different from the conventional
[PEP8](https://peps.python.org/pep-0008/) style as across many Python projects.
The manifestation of morph code style is a combination of [Google Python Style](https://google.github.io/styleguide/pyguide.html),
inspiration from coding language such as APL, Haskell, and is designed for fast,
experimental development and prototyping.

Everyone always has their own opinions on style. We believe this is exemplified
further within the Python community, as it tries to be beginner-friendly, and
therefore most people hold a very strong opinion on styling. We don't have a
strong opinion on style either (Aaron: I don't have any issue with PEP8, as I use it
at my company and other projects), as long as:

- You don't use any linter, formatter that change the style drastically other
  than what specified within the projects' [`pyproject.toml`](https://github.com/aarnphm/morph/blob/main/pyproject.toml).
- The code you contribute is not widely different from the style of the code
  surrounding it.

With that being said, we want to use this project as a playground the explore a
style that is both: "feels natural" and expressive for mathematical reasoning. We
hope that you find this guide somewhat thought-provoking and interesting, that
you can iterate and try to adopt some of them as part of the process
contributing to the library.

While PEP8 is a great base for a style guide, we find it to be having way too
much white spaces and makes the code feels 'robotic'. Having a deterministic
style and formatter is great to reduce the overhead of stylistic discussions,
but we think it is important to write code that express the intent of reasoning.
(_The policy here is definitely not "shovel everything into one line", but
rather "compact and flowing"_)

The styling is heavily inspired by Kenneth Iverson's 1979 Turing award lecture, [Notation as a Tool of Thought](https://www.eecg.toronto.edu/~jzhu/csc326/readings/iverson.pdf),
and a lot of the stylistic inspiration comes from [Jeremy Howard's](https://jeremy.fast.ai/) [fastai](https://docs.fast.ai/). One
thing that has been stuck with me ever since is the idea of =="brevity facilitates
reasoning"==, as such the tersity of style aren't just for the sake of shortness,
rather the brevity of expression.

> It enables [expository programming](http://archive.vector.org.uk/art10000980), combining with prototyping new ideas and logics within models implementation.

## Some guidelines.

Though we have stopped using deterministic formatter and linter, we do understand
that people have preferences for using these tools, and it plays nicely with IDE
and editors. As such, we included a [`pyproject.toml`](https://github.com/aarnphm/morph/blob/main/pyproject.toml) file
that specifies some configuration for the tools that makes it compiliant with
the repository's style. In short, we're using `ruff` for both linting and formatting,
`mypy` for type checking, and provide a `pyright` compatible configuration for those
who wishes to use VSCode or `pyright` LSP.

> [!NOTE] running tools
> You can use `uvx` to run all this tools, so no need for installation manually whatsoever.

Overtime, Python has incorporated a lot of features that supports this style of
coding, including list comprehension, generator expression, lambda, array-based
programming. Yet, Python will remain verbose per say, and the goal is that to
make code fit nicely on a screen, and we don't have to always scroll downwards.

While brevity is important, it is also important to make sure functions are
somewhat, type-safe. Since there is no real type-safety when working with
Python, typing should be a best-effort to make sure we don't introduce too many
bugs.

### Naming.

- follow Python standard for this, we don't have too much opinion on this. Just
  make sure that it is descriptive, and the abbreviation describes the intent of
  the variable. i.e: `to_gpu` instead of `t_gpu`, `to_cpu` instead of `t_cpu`.
- any math-related notation or neural net layers should be expressive and stay
  close to the paper as much as possible. For example: `lm_head.weight` instead
  of `lm_head.w`. Espically for implementing custom kernels and layers, it is
  crucial to follow its nomenclature. E.g: `conv1` instead of
  `first_conv_layer`.
- for functions, try to use verb-noun naming convention. i.e: `get_tokenizer`,
- also just use single quotes for string, and double quotes for within string when needed.
  i.e: `f'hello "{name}"'`

_If you have any suggestions, feel free to send me a message!_

### Layout.

- Preferably not a lot of whitespaces, but rather flowing. If you can fit
  everything for `if`, `def` or a `return` within one line, then there's no need
  to break it into multiple line:

  ```python
  def foo(x): return rotate_cv(x) if x > 0 else -x
  ```

- imports should be grouped by their types: standard library, third-party, and local

  ```python
  import os, sys
  import orjson, bentoml
  ```

  This is suboptimal when it comes to merge conflicts, however, this makes it easier for IDE to navigate context definition.

- indent with 2 spaces, which follow the Google codestyle.

- With regards to writing operator, try to follow the domain-specific notation.
  I.e: when writing pathlib, just don't add space since that is not how you
  write a path in the terminal. In the terminal you are writing `a/ba/c`, not `a / c / d`

- Avoid trailing whitespace to save tokens.

- use array, pytorch or numpy-based indexing where possible.

- If you need to export anything, put it in `__all__` or do lazy export for type-safe checker

### Misc.

- import alias should be concise and descriptive. A convention is to always `import typing as t`.
- Writing docstring when it is possible. No need to comment everything as it
  makes the codebase hard to read. For docstring, follow the Google style guide.
- We do lazy imports, so consult some of the `__init__.py` to see how we do it.
- If anything that is not used for runtime, just put it under `t.TYPE_CHECKING`

### Types.

We do believe in static type checking, and often times all of the code in `morph/python` are safely-types.
Types play nicely with static analysis tools, and it is a great way to catch bugs for applications
downstream. In Python, there are two ways for doing static type:

1. Stubs files (recommended)

If you have seen files that ends with `.pyi`, those are stubs files. Stubs files are great format
for specifying types for external API, and it is a great way to separate the implementation from
the API. For example, if you want to specify the type for `exo.Client`, you can create
a stubs file `exo/__init__.pyi` and specify the type there.

Example: [`openllm`'s init types definition](https://github.com/bentoml/OpenLLM/blob/v0.5/openllm-python/src/_openllm_tiny/__init__.pyi) and [implementation](https://github.com/bentoml/OpenLLM/blob/v0.5/openllm-python/src/_openllm_tiny/__init__.py).

> [!important]
> If you touch any public API, make sure to also update and add/update the stubs files correctly.

2. Inline annotations (encourage, not required)

Inline annotations are great for specifying types for internal functions. For example:

```python
def _resolve_internal_converter(llm: LLM, type_: str) -> Converter: ...
```

This is not always required. If the internal functions are expressive enough, as well
as the variable names are descriptive to ensure there is not type abrasion, then it is not
required to specify the types. For example:

```python
import torch, torch.nn.functional as F
rms_norm = lambda tensor: torch.sqrt(F.mean(torch.square(tensor)))
```

As you can see, the function calculate the RMSNorm of a given torch tensor.

> [!note] `TYPE_CHECKING` block.
> As you can see, we also incorporate `TYPE_CHECKING` argument into various places.
> This will provides some nice in line type checking when development. Usually, I think
> it is nice to have, but once the files get more and more complex, it is better to just
> provide a stubs file for it.

## FAQ.

### Why not use `black`?

`black` is pretty common in Python community, but we rather find `black` to be very
verbose and overtime it is annoying to work with too much whitespaces.

Personally, we think four spaces is a mistake, as in some cases it is harder to read
with four spaces code versus two spaces code.

### Why not pep8?

PEP8 is great if you are writing library such as this, but we're going to do a lot
of experimenting for implementing papers, so we decided early on that PEP8 is
probably not fit here, and want to explore more expressive style.

### Editor is complaining about the style, what should i do?

Kindly ask you to disable formatting for this project 🤗. We will try my best to
accomodate for ruff, but we don't want to spend too much time on this.
It is pretty stragithforward to disable it in your editor, with google.

### Style might put off new contributors?

We don't think so, as mentioned before, We don't have too much opinion on style as
long as it somewhat follow what we have described above or the style of the code
surrounding it. We will still accept styles PR as long as it is not too drastic.
Just make sure to add the revision to `.git-blame-ignore-revs` so that
`git blame` would work correctly.

As for people who are too close-minded about styling, such individuals aren't
the ones we want to work with anyway!
