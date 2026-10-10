# Mounting `@divelog/kit` in a SvelteKit site

The kit renders the public dive log, the editor and the Open Graph cards of a divelog server
inside an existing SvelteKit 2 / Svelte 5 site. `apps/reference` is a complete, minimal example
of everything below.

```sh
pnpm add @divelog/kit maplibre-gl @resvg/resvg-js
```

`maplibre-gl` draws the globe and the site locator maps; `@resvg/resvg-js` renders the Open
Graph cards (only `@divelog/kit/og` needs it). Both are optional peers.

## Entry points

| Import                 | What                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| `@divelog/kit`         | Components, `DivelogProvider`, `DiveNav`, toasts, `setMapWorkerUrl`        |
| `@divelog/kit/core`    | Pure TS: `DivelogConfig`, `createUrls`, API types, view logic, map maths  |
| `@divelog/kit/routes`  | `DivePage`, `AdminPage`, `AdminShell`, `LoginPage`, every page component   |
| `@divelog/kit/server`  | `createDivelog`, `divePublicLoad`, `adminLoad`, `handleDivelog`, SEO, sitemap |
| `@divelog/kit/og`      | `diveOg` (PNG cards for dive and site pages)                               |
| `@divelog/kit/widgets` | `DiveTile` and `loadDiveSummary` for a home page                           |
| `@divelog/kit/testing` | Vitest doubles (`fakeDivelog`, `fakeEvent`, `thrown`); tests only          |
| `@divelog/kit/styles/{tokens,divelog,maplibre}.css` | Theme tokens, utility classes, map controls |

## 1. Config and the server binding

One `DivelogConfig` says where the log, the editor, the API and the media live and whose log it
is. Bind it to the server once, in a server-only module:

```ts
// src/lib/divelog.server.ts
import { env } from '$env/dynamic/private';
import { DEFAULT_CONFIG, type DivelogConfig } from '@divelog/kit/core';
import { createDivelog } from '@divelog/kit/server';

export const divelogConfig: DivelogConfig = {
  ...DEFAULT_CONFIG, // basePath /dive, adminPath /admin, apiBase /api/v1, mediaBase /media
  siteName: 'example.org',
  ownerName: 'Sam',
  siteUrl: 'https://example.org',
  titleSuffix: 'Sam Example', // ends every page title; defaults to ownerName
  copy: { gearTitle: 'What I dive with' }, // optional: replace the kit's page copy
  presets: { tags: ['cave', 'wreck'] }, // optional: dive tags, cylinders, gases
};

export const divelog = createDivelog({
  backendUrl: () => env.DIVELOG_BACKEND_URL ?? 'http://localhost:8300',
  config: divelogConfig,
});
```

The SvelteKit server talks to the backend at `backendUrl`. The browser uses the same-origin
`apiBase` and `mediaBase`, so route `/api/v1/*` and `/media/*` to the server, either in your
reverse proxy or with a hook like `apps/reference/src/lib/proxy.server.ts`.

On first use `createDivelog` fetches `GET /api/v1/version` once and logs a warning when the
server's `api` major differs from the kit's `SUPPORTED_API` (servers without the field are
accepted). `KIT_VERSION` is exported from every entry point.

Pass the config to the client through a layout load, e.g. `return { divelogConfig }` from
`src/routes/+layout.server.ts`.

## 2. The hook

`handleDivelog` resolves the signed-in owner from the session cookie into `locals.owner`, sends
visitors of the editor to its login page, marks the editor `noindex` and the owner's pages
`private, no-store`.

```ts
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import { handleDivelog } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';

export const handle = sequence(
  handleDivelog(divelog, { skip: (pathname) => pathname === '/health' }),
  yourOwnHandle,
);
```

Declare the local in `src/app.d.ts`: `interface Locals { owner: string | null }`.

## 3. The public catch-all and the provider

```svelte
<!-- src/routes/dive/+layout.svelte -->
<script lang="ts">
  import { DiveNav, DivelogProvider } from '@divelog/kit';
  let { children, data } = $props();
</script>

<DivelogProvider config={data.divelogConfig}>
  <DiveNav />
  {@render children()}
</DivelogProvider>
```

```ts
// src/routes/dive/[...path]/+page.server.ts
import { divePublicLoad } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';
export const load = (event) => divePublicLoad(divelog, event.params.path, event);

// src/routes/dive/[...path]/+page.ts
import { withPublicPage } from '@divelog/kit/routes';
export const load = ({ data }) => withPublicPage(data);
```

```svelte
<!-- src/routes/dive/[...path]/+page.svelte -->
<script lang="ts">
  import type { Snapshot } from './$types';
  import { DivePage, type PageSnapshot } from '@divelog/kit/routes';
  let { data } = $props();
  let page = $state<{ snapshot: Snapshot<PageSnapshot> }>();
  export const snapshot: Snapshot<PageSnapshot> = {
    capture: () => page?.snapshot.capture() ?? null,
    restore: (saved) => page?.snapshot.restore(saved),
  };
</script>

<DivePage bind:this={page} {data} />
```

`DivelogProvider` puts the config in Svelte context (`getDivelog()`), points the editor's
browser client at `apiBase` and wraps its children in `.divelog`, the scope of the theme tokens.
Each page's data carries `meta` (`title`, `description`): render it in your layout's
`<svelte:head>`. `diveMetaFor(urls, name)` gives the meta of the index pages and
`diveOgImageFor(urls, pathname)` the card of dive and site pages.

## 4. The editor catch-all

```ts
// src/routes/admin/+layout.server.ts
export const load = ({ locals }) => ({ owner: locals.owner });
```

```svelte
<!-- src/routes/admin/+layout.svelte -->
<DivelogProvider config={data.divelogConfig}>
  <AdminShell owner={data.owner}>{@render children()}</AdminShell>
</DivelogProvider>

<!-- src/routes/admin/login/+page.svelte -->
<LoginPage />
```

`src/routes/admin/[...path]/` mirrors the public mount with `adminLoad`, `withAdminPage` and
`<AdminPage {data} />`.

## 5. The Open Graph route

A rest parameter would swallow `.png`, so the cards get their own route:

```ts
// src/routes/dive/og/[kind]/[id].png/+server.ts
import { diveOg } from '@divelog/kit/og';
import { divelog } from '$lib/divelog.server';
export const GET = (event) => diveOg(divelog, event.params.kind, event.params.id, event);
```

## 6. Styles and the map worker

Import the styles once, in the root layout, and hand MapLibre's worker URL to the kit (a
library cannot ship a Vite `?worker&url` import; the consumer's pre-bundler fails on it):

```svelte
<script lang="ts">
  import '@divelog/kit/styles/tokens.css';
  import '@divelog/kit/styles/divelog.css';
  import { setMapWorkerUrl } from '@divelog/kit';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  setMapWorkerUrl(workerUrl);
</script>
```

`maplibre.css` is imported by the map components themselves. Map tiles are self-hosted
PMTiles under `tilesBase` (default `/media/tiles`); without an `index.json` there the maps fall
back to the SVG world map.

## Sitemap and home tile

`diveSitemapEntries(divelog, fetch)` returns `{ path, priority }` for every public trip and
dive (empty when the server is down). For a home page, `loadDiveSummary(divelog, fetch)` in a
`+page.server.ts` and `<DiveTile summary timeline title blurb />` inside a `DivelogProvider`.

## Sharing features

A server that reads a shared site commons (`divelog-sites`) next to the log reports each
site's `origin` (`log`, `commons` or `fork`); the kit shows what follows from it.

- **Attribution.** The commons is ODbL with descriptions and maps under CC BY-SA 4.0, so every
  site page of a `commons` or `fork` site carries a `.dl-attribution` line ("Site data ©
  divelog-sites contributors (ODbL), descriptions and maps CC BY-SA 4.0 · <commit>", the
  source linked when it is a URL), a fork adds "Forked from the commons at revision N", and
  every map taken from the commons (a drawn map or sketch whose id has no personal `-p<n>`
  suffix) gets a short "Map © … CC BY-SA 4.0" line on the site and dive pages. The locator
  map credits OpenStreetMap through the tile index's own attribution. Restyle the line through
  `.dl-attribution`, but keep it visible: it is a licence obligation, not decoration.
- **Origins and forks.** The admin site list has an origin badge and an origin filter (all,
  personal = own sites and forks, commons, stale against the commons). The site editor shows
  the pin against the commons revision with "Mark as reviewed", "Fork this site" on a commons
  site (`PUT …?fork=true`: a full personal copy that shadows the commons record) and "Drop
  fork, back to the commons record" on a fork (`DELETE`, the commons record returns).
- **Stale routes.** When a dive's route was drawn on an older revision of its map, or legs no
  longer resolve, the dive editor says so ("map revision X → Y; N legs no longer resolve"),
  lists the legs and offers "Re-pin route to the current map", which saves the route on the
  current revision without them. The public dive page draws only the legs that resolve.
- **Repo notices.** The admin bar shows the log's and the commons' checked-out commits, the
  commons state and a badge with the load notices (shadowed records, stale overlays and forks),
  each site notice linking to its editor.
- **Adopt a site.** The new-site page and the dive editor's site picker ("From the commons",
  or "Search the commons for …" in the picker's list) search `GET /admin/commons/sites` by
  name, alias or area, optionally within 25 km of the current site, and offer the commons
  sites not in the log yet with their origin and distance. "Use this site" sets the dive's site
  (dive editor) or opens the site editor on the commons record (new-site page): adopting needs
  no file, the first save writes the overlay.
- **Commons pull.** "pull commons" in the admin bar calls `POST /admin/commons/pull`, which
  fast-forwards the commons checkout and pins the log's `divelog.yaml`; the popover shows the
  old and new head and the sites that became stale, each linking to its editor. The button is
  disabled with a reason when the server has git off for the commons.
- **Imports.** The Subsurface import report lists every imported site with the site it
  matched (by Subsurface id, name, alias or distance, in metres) or created, and its origin.

`@divelog/kit/testing` has sample records for these: `fakeSite`, `commonsSite`,
`stalePinSite`, `forkSite`, `fakeMap`, `staleAnnotation`, `fakeRepoStatus`, `fakeCommonsHits`
and `fakeCommonsPull`.

## Ejecting a page

The catch-all only handles paths no more specific route claims. To replace one page, add a
route for it and render your own component, or the kit's with your own wrapper:

```ts
// src/routes/dive/gear/+page.server.ts
import { divePublicLoad } from '@divelog/kit/server';
import { divelog } from '$lib/divelog.server';
export const load = (event) => divePublicLoad(divelog, 'gear', event);
```

```svelte
<!-- src/routes/dive/gear/+page.svelte -->
<script lang="ts">
  import { GearPage } from '@divelog/kit/routes';
  let { data } = $props();
</script>

<h2>My own intro</h2>
<GearPage {data} />
```

Every page component (`LogPage`, `DiveDetailPage`, `SitesPage`, `SitePage`, `RegionPage`,
`TripsPage`, `TripPage`, `PeoplePage`, `PersonPage`, `GearPage` and the `Admin*Page`s) is
exported from `@divelog/kit/routes`.

## Theming

Components read only `--dl-*` custom properties, defined in `styles/tokens.css` under
`:where(.divelog)` with zero specificity. Each falls back to a conventional site token and then
to the default dark palette, so either of these works:

```css
:root {
  --color-bg: #0b1320; /* picked up as --dl-color-bg */
  --color-accent: #ff8a3d;
  --font-display: 'My Display', sans-serif;
}

.divelog {
  --dl-color-accent: #ff8a3d; /* or set the kit's own name */
}
```

The tokens: `--dl-color-{bg,bg-elevated,surface,surface-2,text,text-muted,text-faint,border,
border-strong,accent,accent-strong,accent-soft,warm,warm-soft,success,error,focus-ring,link,
link-hover,button-bg,button-text,button-hover}`, `--dl-c-abyss`, `--dl-tag-<tag>` for the dive
tags, `--dl-font-{display,body,sans,mono}`, `--dl-radius{-sm,,-md,-lg}`, `--dl-shadow-{sm,md}`,
`--dl-container-{max,narrow,detail}`, `--dl-space-{page-x,section}` and `--dl-header-h`.
`apps/reference/src/lib/theme.css` sets the fallback names for a dark and a light scheme.
`styles/divelog.css` holds the `.dl-*` utility classes (`dl-container`, `dl-kicker`, `dl-num`,
`dl-btn`, `dl-card`, `dl-tag`, …) scoped to `.divelog`.
