# divelog

A dive log you can add to your own website: a FastAPI server over a git repository of markdown
and JSON files, a SvelteKit kit with the public pages, the admin and the map tooling, and a
reference app that doubles as the standalone deployment.

**Status:** 0.4.0 (`divelog-server` and `@divelog/kit`; commons search, near me and the
optional atlas, see [CHANGELOG.md](CHANGELOG.md)), not yet published to PyPI, npm or a
public registry; consumers build the server image from `packages/server` and vendor the kit as a
packed tarball (`pnpm --filter @divelog/kit build && pnpm pack`). API major 1, data format 1.

Logs are personal. Dive sites are shared through the public `divelog-sites` commons, which an
instance layers under its own log.

| Package | What | Where |
| --- | --- | --- |
| `packages/server` | `divelog_server`: API, store, importers, CLI (`divelog`), container image | Python 3.13, uv |
| `packages/kit` | `@divelog/kit`: pages, components, server helpers, styles | Svelte 5, SvelteKit 2 |
| `apps/reference` | Minimal SvelteKit app mounting the kit; dev playground and standalone image | |
| `schema/v1` | JSON Schema of the data formats, exported from the server models | |
| `docs/` | `FORMAT.md` data format, `KIT.md` mounting the kit, `DEPLOY.md`, `CONTRIBUTING.md` | |

Code is AGPL-3.0-only (see `LICENSE` and `NOTICE`). The shared site data in `divelog-sites` is
licensed separately, in three layers:

- the site database (structured fields, map nodes and edges): Open Database License 1.0;
- descriptions and drawn maps as artwork: CC BY-SA 4.0;
- photos: each under its own licence from an allowlist, recorded in `media/manifest.json`.

A personal log stays its owner's; only what is proposed to the commons takes on these licences.

Documentation:

- [`docs/KIT.md`](docs/KIT.md): mounting the kit in a SvelteKit app, config, theming, adopt and pull.
- [`docs/DEPLOY.md`](docs/DEPLOY.md): the server and reference images, compose, the data repositories.
- [`docs/FORMAT.md`](docs/FORMAT.md): the log and commons file formats, revisions, overlays and forks.
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md): working on this repository and on the commons.

One diver, one instance, one log repository; multi-user accounts are not a goal.
