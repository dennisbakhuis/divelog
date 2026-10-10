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
It also mounts a "Skip to content" link as its first child (shown only when the page has
`#dl-main`, which `DivePage` and `AdminPage` render around the page; pass `skipLink={false}` to
leave it out), the two live regions behind `announce()` and the dialog that answers
`confirmDialog()`. Mount `<Toast />` once in the root layout; its container is always present.
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
- **Origins and forks.** The admin site list has an origin badge (a fork's origin as visible
  text), a stale chip and an origin filter (all, personal = own sites and forks, commons,
  stale against the commons). In the site workspace a commons site's objective fields (the
  list comes from `GET /admin/meta/site-fields`) are read-only with a lock chip and one
  explanation at the top; "Fork to edit" unlocks them in place and the save then forks
  (`PUT …?fork=true`: a full personal copy that shadows the commons record). The header shows
  the pin against the commons revision with "Mark as reviewed", and on a fork "Drop fork, back
  to the commons record" (`DELETE`, the commons record returns).
- **Stale routes.** When a dive's route was drawn on an older revision of its map, or legs no
  longer resolve, the dive editor says so ("map revision X → Y; N legs no longer resolve"),
  lists the legs and offers "Re-pin route to the current map", which saves the route on the
  current revision without them. The public dive page draws only the legs that resolve.
- **Repo notices.** The admin bar shows the log's and the commons' checked-out commits, the
  commons state and a badge with the load notices (shadowed records, stale overlays and forks),
  each site notice linking to its editor.
- **Adopt a site.** The new-site form lists commons sites with the same name or near the pin
  ("Adopt"), and its "Search the commons by name instead" section and the dive editor's site
  picker ("From the commons") search `GET /admin/commons/sites` by name, alias or area,
  optionally within 25 km of the current site. Adopting needs no file: the site editor opens
  the commons record and the first save writes the overlay.
- **Commons pull.** "pull commons" in the admin bar calls `POST /admin/commons/pull`, which
  fast-forwards the commons checkout and pins the log's `divelog.yaml`; the popover shows the
  old and new head and the sites that became stale, each linking to its editor. The button is
  disabled with a reason when the server has git off for the commons.
- **Imports.** The Subsurface import report lists every imported site with the site it
  matched (by Subsurface id, name, alias or distance, in metres) or created, and its origin.

`@divelog/kit/testing` has sample records for these: `fakeSite`, `commonsSite`,
`stalePinSite`, `forkSite`, `fakeMap`, `staleAnnotation`, `fakeRepoStatus`, `fakeCommonsHits`
and `fakeCommonsPull`.

## Creating a site

`/admin/sites/new` and the dive editor's "+ New site" dialog render the same `SiteCreate`
component (exported, with `LocationPicker`); the dialog passes `compact`.

1. **Name.** Focused on open. Below it the id the site will get, `{iso3}-{slug(name)}`, and
   whether it is free (`GET /admin/sites/{id}`, a 404 means free).
2. **Tap the map.** `LocationPicker` draws the self-hosted PMTiles basemap (the planet archive,
   the regional ones from zoom 8) or, without tiles, the world-atlas country outlines, so a pin
   can always be placed. Tap or click places the pin, dragging moves it; with the map focused
   the arrow keys move the pin (Shift for larger steps), `+`/`-` zoom and Enter drops the pin at
   the centre. The coordinates field takes a paste in either order, degrees-minutes-seconds,
   hemisphere letters or a map link (`@lat,lon`, `mlat=…&mlon=…`, `#map=z/lat/lon`); "Use my
   location" asks the device. `geo_source` records how the position came in ("map pick",
   "pasted coordinates" or "device location", with the date). Without WebGL only the field shows.
3. **Country and region follow the pin.** `countryAt(lat, lon)` finds the country in the 1:50m
   world-atlas outlines (loaded on first use; a wreck off the coast gets the nearest coast within
   60 km; Bonaire, Sint Eustatius and Saba become `BES`), and `regionNearest` picks the region of
   that country with the closest site. Both are marked "from the pin" / "nearest" until changed
   by hand; a hand-picked country is kept when the pin moves. The country list is
   `GET /meta/countries` plus whatever code the pin found.
4. **Already known?** While the name or pin changes, `GET /admin/sites/nearby` lists log sites
   and commons sites with the same name, an alias, or within 300 m, nearest first: "Use this
   site" (log) or "Adopt" (commons) instead of creating a duplicate. Nothing is blocked.
5. **Type sets the water.** The type select is the one list in `core/dive/site-types.ts`
   (`SITE_TYPES`, `waterDefault`): lake, quarry, cave, cenote… fresh; sea, reef, wreck salt. A
   water picked by hand stays. "+ New region" opens `RegionForm` in a dialog with the country
   filled in. "More details" (remembered open or closed) holds the other names, area, system,
   summary, location visibility and halocline.
6. **Create.** Page: **Create** (opens the site), **Create & log a dive here**
   (`urls.admin.newDive({ site })`) or **Create & draw a map** (the Maps tab). Dialog: **Create &
   use** sets the dive's site. Enter in a text field never creates a half-filled site; errors
   from the server land on their fields.

A site with a map is five actions: the name, a tap on the map, Create & draw a map, Start from
OpenStreetMap, Save map.

### The site workspace

`/admin/sites/{id}` is one page with a header (name, origin badge, pin state, View ↗, and a
"Revision" disclosure with the changelog) and tabs: **Details** (the record, grouped; commons
fields locked as above, overlay fields marked "yours"), **Location** (`LocationPicker` for the
site, a second compact one for the entry point with the site shown, location visibility),
**Maps** (the map list and editor; `/admin/sites/{id}/maps` opens this tab), **Photos**
(`Attachments` with `site`: kind photo or map, public, and for someone else's photo a licence
from `GET /meta/licences`, the author and a source URL) and **Dives** (the dives at the site and
"Log a dive here"). Details and Location share one form, so switching between them keeps what
was typed; the save bar carries a "What changed" note that becomes the revision's changelog
entry (`SiteIn.note`). Tabs other than Details and Maps live in the URL hash (`#location`).
Leaving with unsaved changes asks first.

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
border-strong,border-control,accent,accent-strong,accent-soft,warm,warm-soft,success,success-fg,
error,danger,danger-fg,danger-soft,info,info-fg,focus-ring,link,link-hover,button-bg,button-text,
button-hover}`, `--dl-focus-ring` / `--dl-focus-offset`, `--dl-c-abyss`, `--dl-tag-<tag>` for
the dive tags, `--dl-font-{display,body,sans,mono}`, `--dl-radius{-sm,,-md,-lg}`,
`--dl-shadow-{sm,md}`, `--dl-container-{max,narrow,detail}`, `--dl-space-{page-x,section}` and
`--dl-header-h`. The type scale `--dl-text-{xs,sm,md,base,lg,xl,2xl,3xl}` (11, 12, 13, 14, 16,
18, 22, 28 px, in rem) and the spacing scale `--dl-space-1…8` (4, 8, 12, 16, 20, 24, 32, 48 px)
belong to the kit and have no host fallback.

The default palette meets WCAG 2.2 AA on every background (`styles/tokens.test.ts` checks it):
text ≥ 4.5:1 (`text-faint` `#8a9bb3` is 4.7:1 on `surface-2`), `border-control` (`#6b82a3`)
and the focus ring ≥ 3:1. `border` and `border-strong` stay decorative (card outlines, rules);
controls use `border-control`. A host that sets `--color-text-faint` or `--color-border-control`
must keep those ratios.
`apps/reference/src/lib/theme.css` sets the fallback names for a dark and a light scheme.
`styles/divelog.css` holds the `.dl-*` utility classes (`dl-container`, `dl-kicker`, `dl-num`,
`dl-btn`, `dl-btn-danger`, `dl-card`, `dl-tag`, `dl-input`, `dl-select`, `dl-textarea`,
`dl-visually-hidden`, `dl-skip-link`, …) scoped to `.divelog`, a visible `:focus-visible` ring
for everything inside `.divelog`, and `prefers-reduced-motion` rules that stop the kit's own
transitions and animations.

## UI primitives

Exported from `@divelog/kit`, keyboard and screen-reader complete, styled only with `--dl-*`
tokens. Use them instead of hand-made widgets; `window.confirm()` is replaced by
`confirmDialog()`.

| Component | Use | Key props | Keyboard / ARIA |
| --- | --- | --- | --- |
| `Dialog` | Modal on native `<dialog>` + `showModal()` | `bind:open`, `title` or `label`, `description`, `size` `sm\|md\|lg\|full`, `bare`, `closeOnBackdrop`, `initialFocus` (selector), `returnFocus`, `onclose`; snippets `children`, `footer` | Escape closes (and stops there: page shortcuts behind it never see a key), focus goes to the first control and back to the opener; `aria-labelledby`/`aria-describedby` |
| `ConfirmDialog` | Yes/no question | `bind:open`, `title`, `body`, `confirmLabel`, `cancelLabel`, `danger`, `onconfirm`, `oncancel` | Focus starts on Cancel when `danger`, else on the confirm button |
| `confirmDialog(opts)` | `if (await confirmDialog({ title, body?, danger? }))` | `ConfirmOptions` | Answered by the dialog `DivelogProvider` mounts; falls back to `window.confirm` without one |
| `Popover` | Non-modal panel under a button | `bind:open`, `label`, `id`, `role`, `focus` `panel\|first\|none`, `class`; snippets `trigger(props)` (spread on a `<button>`), `children({ close })` | `aria-expanded`/`aria-controls`/`aria-haspopup` on the trigger, focus into the panel, Escape returns focus, click outside closes |
| `Tabs` | Tab list + panels | `tabs: TabItem[]` (`id`, `label`, `class?`, `disabled?`), `bind:active`, `label`, `variant` `underline\|pills`, `hash`, `idPrefix`, `tablistAlways`, `onchange`; snippets `panel(id)`, `tab(item, selected)` | `tablist/tab/tabpanel`, `aria-controls`, roving tabindex, arrows, Home, End; one tab renders just its panel |
| `Combobox` | Pick one or several from static or async options | `bind:value` / `multiple` + `bind:values`, `options` or `source(query, signal)`, `known`, `debounce`, `minChars`, `required`, `clearable`, `name`, `placeholder`, `emptyText`, `onchange`; snippets `option(o)`, `footer({ query, close })`; spread `Field`'s control props on it | ARIA 1.2 combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox/option/group; arrows, Home/End, Enter picks (never submits the form), Escape closes then restores, Backspace removes the last chip. Options: `ComboOption` (`value`, `label`, `group`, `hint`, `keywords`, `disabled`) |
| `Field` | Label + hint + error around one control | `label`, `id`, `hint`, `error`, `required`, `layout` `stacked\|horizontal`, `hideLabel`, `describedby`; snippets `children(control)`, `extra` | `<label for>`, `aria-describedby` (error, hint), `aria-invalid`, `required`; spread `control` on the input |
| `Disclosure` | Collapsible section | `summary` or `label` snippet, `bind:open`, `persistKey` (localStorage `dl-disclosure:<key>`), `count`, `ontoggle` | Native `<details>`/`<summary>` |
| `Toolbar` | Tool picker | `items: ToolItem[]` (`value`, `label`, `hint?`, `shortcut?`, `disabled?`), `bind:value`, `label`, `mode` `radio\|pressed`, `orientation`, `itemClass(item, selected)`, `showShortcuts`, `onchange`; snippet `item(tool, selected)` | `radiogroup`/`radio` + `aria-checked`, or `toolbar` + `aria-pressed`; roving tabindex, arrows, Home, End; hints as `aria-describedby`, shortcuts as `aria-keyshortcuts` |
| `SkipLink` | "Skip to content" | `target` (default `dl-main`), `label` | Mounted by `DivelogProvider` |
| `LiveRegion` / `announce(text, { assertive })` | Status messages for screen readers | — | One polite and one assertive region; only the first mounted region speaks |

Field errors from the API: a 422 throws `AdminApiError` with `fieldErrors`
(`{ max_depth_m: 'Field required', 'tanks.0.o2_pct': '…' }`, keyed by the `loc` without
`body`); pass `err.fieldErrors[name]` to each `Field`'s `error`.

Toasts: `toast.show({ kind: 'success' | 'info' | 'error', message, sticky?, duration? })`.
Errors stay until dismissed; others leave after 5 s, paused while hovered or focused. Every
toast is announced through the live regions (errors assertively).
