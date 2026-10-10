# reference

A minimal SvelteKit app that mounts `@divelog/kit` the way a host site does: a one-screen home
page with the dive tile, the public log under `/dive`, the editor under `/admin`, Open Graph
cards, `sitemap.xml`, `robots.txt` and `/health`. It is the kit's dev playground, the E2E
target and a standalone image for anyone who wants just the dive log.

## Configuration

Read from the environment at runtime (`src/lib/divelog.server.ts`); see `.env.example`.

| Variable               | Default                 | What                                               |
| ---------------------- | ----------------------- | -------------------------------------------------- |
| `DIVELOG_BACKEND_URL`  | `http://localhost:8300` | The divelog server; `/api/v1` and `/media` go here |
| `DIVELOG_SITE_NAME`    | `divelog`               | Header, titles, Open Graph cards                   |
| `DIVELOG_OWNER_NAME`   | `Diver`                 | Whose log it is                                    |
| `DIVELOG_SITE_URL`     | `http://localhost:3000` | Public origin for the sitemap and card URLs        |
| `DIVELOG_TITLE_SUFFIX` | the owner name          | Ends every page title                              |

The app forwards `/api/v1/*` and `/media/*` to the server itself (`src/lib/proxy.server.ts`),
so the browser only ever talks to the app and the editor's session cookie stays first-party.

## Run against a server container

```fish
# the divelog server (image built from packages/server), with a log checked out at ./my-log
docker run -d --name divelog-server -p 8300:8000 -v (pwd)/my-log:/data/repo divelog-server

# the app in dev mode
pnpm install
cp apps/reference/.env.example apps/reference/.env
pnpm --filter reference dev          # http://localhost:5374
```

Or both as containers on one network:

```fish
docker build -f apps/reference/Dockerfile -t divelog-reference .
docker network create divelog
docker run -d --network divelog --name divelog-server -v (pwd)/my-log:/data/repo divelog-server
docker run -d --network divelog -p 3000:3000 \
  -e DIVELOG_BACKEND_URL=http://divelog-server:8000 \
  -e DIVELOG_SITE_URL=http://localhost:3000 divelog-reference
```

The image is `node:22-slim` with the adapter-node build, runs as a non-root user on
`PORT=3000` and has a `/health` healthcheck. `BODY_SIZE_LIMIT` is raised to 50 MB so photo and
dive-computer uploads pass through the proxy.

## E2E smoke

```fish
pnpm exec playwright install chromium   # once
pnpm --filter reference e2e             # or `pnpm e2e` from the root
```

`pnpm e2e` builds the app, starts `e2e/stub-backend.mjs` (fixture JSON from `e2e/fixtures.mjs`,
a 401 for `/auth/me`, a small PNG for `/media`) and `pnpm preview` against it, then checks that
the home page and the public log pages render without console errors, that `/admin` redirects
to the login page, that the Open Graph card is a PNG and that the sitemap lists every dive.
