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
| `/data/state` | sessions, magic-link tokens, invites to sign a dive, lazily rendered variants (`STATE_DIR`) | nothing; losing it signs you out and ends open sign links |

The container runs as uid 1001 and treats `/data/repo` and `/data/commons` as git safe
directories, so a checkout owned by another user on the host still works.

## docker compose

```yaml
services:
  divelog-server:
    image: ghcr.io/<owner>/divelog-server:0.6.0
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
    image: ghcr.io/<owner>/divelog-reference:0.6.0
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

The `divelog` commands in the image (`validate`, `sites status|adopt`, `commons pull`, `tiles`,
`sitemap-osm fetch`) find the commons the way the server does: `--commons PATH` when given,
else `COMMONS_ROOT`, else the source `path` in the log's `divelog.yaml`. The compose file sets
`COMMONS_ROOT`, so no flag is needed inside the container, even when `divelog.yaml` names a path
on your own machine (`../divelog-sites`); a commons path that does not exist is an error that
names it.

```sh
docker compose exec divelog-server divelog validate /data/repo
docker compose exec divelog-server divelog sites status /data/repo
```

## Edits and backups

Every admin edit is written to the log checkout and committed; with `GIT_ENABLED=true` the
server pushes with the deploy key mounted at `GIT_SSH_KEY_PATH` (`/run/secrets/deploy_key`).
Give that key write access to the log repository only. The git remote is the backup of the
log; the commons is upstream's. Media in `/data/media` is not in git: back it up with your
usual file backup or set `STORAGE_BACKEND=s3` with the `S3_*` variables.

## Commons sites in public lists

By default the public site list, the region pages and their maps show only the sites of your
own log: your sites, forks, and commons sites you dived. Every other commons site keeps its own
page at its URL but is listed nowhere, because the instance is a personal logbook.

| Setting | Default | What |
| --- | --- | --- |
| `PUBLIC_COMMONS_SITES` | `false` | List the commons sites you never dived as well: a logbook plus atlas |
| `PUBLIC_COMMONS_REGIONS` | empty | Comma-separated region ids the switch is limited to; empty means all |

With the switch on, those sites appear in the lists with a dive count of 0, and the kit marks
them "not dived" (a badge in the lists, a hollow marker on the region maps) and offers "Only my
dives" on the sites page. It is off by default because a commons can carry thousands of sites
that would bury your own; limit it to the regions you want to present as an atlas. The log
overview's map and stats stay about your dives either way.

## Pulling the commons

With `COMMONS_GIT_ENABLED=true` the admin "pull" fetches the log and the commons together; a
commons checkout is never written to. Without it, update by hand and reload:

```sh
git -C divelog-sites pull --ff-only
docker compose exec divelog-server divelog sites status /data/repo   # stale overlays and forks
```

To pin what an instance was validated against, record the commons commit as `ref` in the
log's `divelog.yaml`. Sites whose commons record moved past an overlay's `base_revision` or a
fork's pin show as stale until you review them. `divelog commons pull --log /data/repo` does
the pull, the pin and the log commit in one step and lists what became stale (a commons
checkout without an upstream branch is not pulled; its local head is pinned). Review each stale
site in its editor ("Mark as reviewed") or with `POST /api/v1/admin/sites/<id>/pin`.

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

### Trust stores

The images pin their base by digest, so a CA distrust (such as the eMudhra intermediate
compromise of 17 October 2026) reaches them only through a new digest and a rebuild. The
server's outbound TLS uses three stores: Debian's `ca-certificates` (`ssl`'s default context:
aiosmtplib, git over https), boto3 (pointed at the same file by `AWS_CA_BUNDLE`, because
botocore's own `cacert.pem` lags), and certifi (dev image only, through httpx). After a rebuild,
check that a forged chain is refused:

```sh
docker run --rm divelog-server:<tag> sh -c 'dpkg -s ca-certificates | grep Version; python -c "
import socket, ssl
h = \"dv-g3b-aaa-emudhra.we-have-a-problem.com\"
ssl.create_default_context().wrap_socket(socket.create_connection((h, 443), timeout=60), server_hostname=h)"'
```

It must end in `SSLCertVerificationError … unable to get local issuer certificate`; repeat
with `dv-g3b-emudhra.we-have-a-problem.com`. For the reference app:
`docker run --rm divelog-reference node -e "fetch('https://dv-g3b-emudhra.we-have-a-problem.com').then(()=>process.exit(2),e=>console.log(e.cause?.code))"`
prints a certificate error code. The probe hosts can be slow; a timeout proves nothing, so retry.
