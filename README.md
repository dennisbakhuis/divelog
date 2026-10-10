# divelog

A dive log you can add to your own website: a FastAPI server over a git repository of markdown
and JSON files, a SvelteKit kit with the public pages, the admin and the map tooling, and a
reference app that doubles as the standalone deployment.

Logs are personal. Dive sites are shared through the public `divelog-sites` commons, which an
instance layers under its own log.

| Package | What | Where |
| --- | --- | --- |
| `packages/server` | `divelog_server`: API, store, importers, CLI (`divelog`), container image | Python 3.13, uv |
| `packages/kit` | `@divelog/kit`: pages, components, server helpers, styles | Svelte 5, SvelteKit 2 |
| `apps/reference` | Minimal SvelteKit app mounting the kit; dev playground and standalone image | |
| `schema/v1` | JSON Schema of the data formats, exported from the server models | |
| `docs/` | `FORMAT.md` data format, `KIT.md` mounting the kit, `DEPLOY.md`, `CONTRIBUTING.md` | |

Code is Apache-2.0 (see `LICENSE` and `NOTICE`). One diver, one instance, one log repository;
multi-user accounts are not a goal.
