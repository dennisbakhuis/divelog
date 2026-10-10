# Deploying divelog

One instance serves one diver: a `divelog-server` container over a checkout of the diver's log
repository (and optionally the site commons), plus a web front end. The front end is either
the reference app image from this repository or your own SvelteKit site that mounts
`@divelog/kit`. Both images are published to GHCR:

- `ghcr.io/<owner>/divelog-server:<version>`: API, admin and the `divelog` CLI, port 8000.
- the reference app image (`apps/reference/Dockerfile`), port 3000. It forwards the browser's
  `/api/v1/*` and `/media/*` requests to the server, so no reverse proxy is needed in front of
  it beyond TLS termination.

## Volumes

| Path in the server container | What | Backed up by |
| --- | --- | --- |
| `/data/repo` | git checkout of the personal log (`DATA_ROOT`) | the git remote |
| `/data/commons` | read-only git checkout of `divelog-sites` (`COMMONS_ROOT`), optional | upstream |
| `/data/media` | media store when `STORAGE_BACKEND=local` (`MEDIA_ROOT`): uploads, scans, WebP variants, `tiles/` | your file backup, or use S3 |
| `/data/state` | sessions, magic-link tokens, lazily rendered variants (`STATE_DIR`) | nothing; losing it signs you out |

The container runs as uid 1001 and treats `/data/repo` and `/data/commons` as git safe
directories, so a checkout owned by another user on the host still works.

## docker compose

```yaml
services:
  divelog-server:
    image: ghcr.io/<owner>/divelog-server:0.1.0
    restart: unless-stopped
    environment:
      SITE_NAME: Jane's dive log
      OWNER_NAME: Jane
      OWNER_EMAIL: jane@example.org
      HOME_COUNTRIES: NLD,BEL
      SITE_URL: https://dives.example.org
      SESSION_SECRET: ${SESSION_SECRET}
      COOKIE_SECURE: "true"
      COMMONS_ROOT: /data/commons
      COMMONS_GIT_ENABLED: "true"
      GIT_AUTHOR_NAME: Jane
      GIT_AUTHOR_EMAIL: jane@example.org
      FORWARDED_ALLOW_IPS: "*"
      BACKEND_SMTP_HOST: smtp.example.org
      BACKEND_SMTP_PORT: "587"
      BACKEND_SMTP_TLS: "true"
      BACKEND_SMTP_USERNAME: dives@example.org
      BACKEND_SMTP_PASSWORD: ${SMTP_PASSWORD}
      BACKEND_SMTP_FROM: dives@example.org
    volumes:
      - ./divelog-data:/data/repo
      - ./divelog-sites:/data/commons
      - ./media:/data/media
      - state:/data/state
    secrets:
      - deploy_key

  web:
    image: ghcr.io/<owner>/divelog-reference:0.1.0
    restart: unless-stopped
    depends_on: [divelog-server]
    environment:
      DIVELOG_BACKEND_URL: http://divelog-server:8000
      DIVELOG_SITE_NAME: Jane's dive log
      DIVELOG_OWNER_NAME: Jane
      DIVELOG_SITE_URL: https://dives.example.org
    ports:
      - "3000:3000"

volumes:
  state:

secrets:
  deploy_key:
    file: ./deploy_key
```

`FORWARDED_ALLOW_IPS: "*"` is safe only while port 8000 is not published, as above: the only
client is the web container, whose `X-Forwarded-*` headers carry the visitor's host and scheme.
Every server variable, with its default, is listed in
[`packages/server/.env.example`](../packages/server/.env.example).

## First start

```sh
git clone git@example.org:jane/divelog-data.git
git clone https://github.com/<owner>/divelog-sites.git      # optional
docker compose run --rm divelog-server divelog validate /data/repo
docker compose up -d
curl -s localhost:3000/api/v1/version   # {"version": ..., "format": 1, "api": 1}
```

An empty log repository needs only a `divelog.yaml` (see [FORMAT.md](FORMAT.md)); dives
come in through the admin import (Subsurface XML, Shearwater XML) or as files. Sign in by
requesting a magic link for `OWNER_EMAIL`.

## Edits and backups

Every admin edit is written to the log checkout and committed; with `GIT_ENABLED=true` the
server pushes with the deploy key mounted at `GIT_SSH_KEY_PATH` (`/run/secrets/deploy_key`).
Give that key write access to the log repository only. The git remote is the backup of the
log; the commons is upstream's. Media in `/data/media` is not in git: back it up with your
usual file backup or set `STORAGE_BACKEND=s3` with the `S3_*` variables.

## Pulling the commons

With `COMMONS_GIT_ENABLED=true` the admin "pull" fetches the log and the commons together; a
commons checkout is never written to. Without it, update by hand and reload:

```sh
git -C divelog-sites pull --ff-only
docker compose exec divelog-server divelog sites status /data/repo   # stale overlays and forks
```

To pin what an instance was validated against, record the commons commit as `ref` in the
log's `divelog.yaml`. Sites whose commons record moved past an overlay's `base_revision` or a
fork's pin show as stale until you review them.

## Basemap tiles and other tools

The locator maps read PMTiles from `/media/tiles/`. Build them on a machine with the `pmtiles`
CLI and copy or upload the result:

```sh
docker compose run --rm divelog-server divelog tiles --dry-run
divelog tiles --log ./divelog-data --media ./media --upload   # needs pmtiles on PATH
```

`divelog --help` lists the other tools: `validate [--base <ref>] [--strict]`, `schema
export|openapi`, `sites split|status|access`, `import shearwater-pnf`, `sitemap-osm`,
`stickmap`, `media fetch|upload`, `maps render|changed`.

## Upgrading

The server publishes `format` (data) and `api` (HTTP interface) majors at `/api/v1/version`;
the kit refuses a server with a different `api` major. Upgrade the server and the front end
together when either major changes, and run `divelog validate` against the log first.
