# Contributing

Thanks for helping. This repository holds the module code: the Python server
(`packages/server`), the SvelteKit kit (`packages/kit`) and the reference app
(`apps/reference`). Dive sites are contributed to the `divelog-sites` commons instead; its own
`CONTRIBUTING.md` explains how.

## Setup

- Python 3.13 and [uv](https://docs.astral.sh/uv/); Node 22 and pnpm 10.
- `uv sync` at the repository root installs the server and its dev tools into `.venv`.
- `pnpm install` at the root installs the kit and the reference app.

## Server gates

Run from `packages/server`; CI runs the same commands:

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy divelog_server      # strict
uv run pytest -q
```

- Tests use the fixture repositories under `tests/fixtures` (a log in `data/`, a commons in
  `commons/`) and `tests/logbuilder.py` for synthetic logs. No test touches the network: patch
  the HTTP call instead.
- A change to a data model changes `schema/v1`: regenerate it with
  `uv run divelog schema export ../../schema` and commit the result (a test compares them).
- A change to the HTTP interface changes the kit's generated types: run
  `pnpm --filter @divelog/kit types` and commit them.
- A dependency change: `uv lock` at the root, then refresh the image pins with the two
  `uv export` commands at the top of `packages/server/Dockerfile` (CI compares them).
- Docstrings in numpy style, no inline comments unless the reason is truly not obvious.

## Kit and reference app gates

From the root:

```sh
pnpm lint      # eslint, zero warnings
pnpm check     # svelte-check
pnpm test      # vitest
pnpm build     # svelte-package + publint, app build
pnpm e2e       # reference app smoke tests (Playwright)
```

## Compatibility

`GET /api/v1/version` publishes `format` (data) and `api` (HTTP interface). Additive changes
(a new optional field, a new endpoint) keep both. Removing or renaming a field of a data file
bumps `format` and needs a migration; a breaking change to a response bumps `api`. Say which
one your change is in the pull request.

## Pull requests

- One topic per pull request, with tests for behaviour changes.
- Keep commits focused and write messages that say why.
- Sign off every commit (Developer Certificate of Origin, below): `git commit -s`.

## Developer Certificate of Origin

By signing off a commit (`Signed-off-by: Your Name <you@example.org>`) you certify the
[Developer Certificate of Origin 1.1](https://developercertificate.org/):

> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the right to submit it
> under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my knowledge, is
> covered under an appropriate open source license and I have the right under that license to
> submit that work with modifications, whether created in whole or in part by me, under the
> same open source license (unless I am permitted to submit under a different license), as
> indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who certified (a),
> (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are public and that a
> record of the contribution (including all personal information I submit with it, including
> my sign-off) is maintained indefinitely and may be redistributed consistent with this project
> or the open source license(s) involved.

Contributions are licensed under Apache-2.0, the licence of this repository (see `LICENSE` and
`NOTICE`).
