## tooling.

- `node.js>=22` and `pnpm`
- `uv` [installation](https://docs.astral.sh/uv/)

> [!tip]
> Recommended to use `uv` to install python and manage virtual environment for `morph`.

## structure.

`docs`: include both references and exploration notes for `morph`

`crates`: contains all UI related for the editors

`packages`: JS version of the editor.

`python`: include all ML-related models

`scripts`: infra stuff for general tooling

`.github`: All CI-related lives here.

### tools.

uv for python management (both python venv)
ruff for python linting
mypy for type checking
quartz for knowledge management

## python.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh

uv venv -p 3.11
source .venv/bin/activate
```

We will use [CalVer](https://calver.org/) for service versioning

## ui.

Using pnpm and preact with vite as bundler

## docs.

For building docs do the following (first time):

```bash
pnpm run docs:build
```

All consequent run can be used with:

```bash
pnpm run docs:serve
```

Recommended to use [Obsidian](https://obsidian.md/) for editing docs.

> [!tip]
> For updating dates, use the `date` field in the frontmatter.
>
> For citation in markdown the syntax follows [rehype-citations](https://github.com/timlrx/rehype-citation)

<details>

  <summary>example references</summary>

See https://github.com/linozen/exocortex/blob/v4/content/refs/luhrmann2019.md?plain=1 for examples.

</details>

For updating author, change the frontmatter to use `author: <github-id>[,<github-id>]`

To add references, make sure to add marker `[^ref]` somewhere in the given file. See [example](./docs/content/glossary.md)

## ci and meta.

```bash
git config --local blame.ignoreRevsFile .git-blame-ignore-revs
```

If you work on CI, make sure to run this command after (requires `docker` and `fd`, or you can use `find` equivalent):

```bash
fd -Hg "*.yml" .github --exec-batch docker run --rm -v "${PWD}":"${PWD}" -w "${PWD}" -e RATCHET_EXP_KEEP_NEWLINES=true ghcr.io/sethvargo/ratchet:0 update
```

## pull requests.

Push changes to your fork and follow [this article](https://help.github.com/en/articles/creating-a-pull-request)
on how to create a pull request on GitHub. Name your pull request
with one of the following prefixes, e.g. "feat: add support for
PyTorch". This is based on the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/#summary)

- feat: (new feature for the user, not a new feature for build script)
- fix: (bug fix for the user, not a fix to a build script)
- docs: (changes to the documentation)
- style: (formatting, missing semicolons, etc; no production code change)
- refactor: (refactoring production code, eg. renaming a variable)
- perf: (code changes that improve performance)
- test: (adding missing tests, refactoring tests; no production code change)
- chore: (updating grunt tasks etc; no production code change)
- build: (changes that affect the build system or external dependencies)
- ci: (changes to configuration files and scripts)
- revert: (reverts a previous commit)

Once your pull request is created, maintainers will be notified and tests would also be run. Once tests are passed and a reviewer has signed off, we will merge your pull request.
