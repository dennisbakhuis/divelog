# Data format

A divelog instance reads two kinds of git repository: one personal **log** per diver and, optionally,
one shared **site commons** (`divelog-sites`). Both are plain files: Markdown with YAML
frontmatter for records with prose, JSON for drawings and lists. The server never needs a
database; the git history is the audit trail and the backup.

This is format **1**. The server publishes the format it reads as `format` in
`GET /api/v1/version`. Machine-readable JSON Schemas of every file type live in
[`schema/v1/`](../schema/v1) (generated with `divelog schema export schema`); this page is the
prose companion. Unknown frontmatter keys are kept on a round trip through the admin editor, so
files can carry extra fields.

Check a repository with `divelog validate <root>` (the kind comes from `divelog.yaml`); the
commons rules are listed under [Validating the commons](#validating-the-commons).

## Repository layout

```
log/                                   divelog.yaml kind: log
  divelog.yaml                         manifest: format, kind, commons source
  dives/<nnnnn>.md                     one dive per file, zero-padded number
  people/<id>.md                       buddies, guides
  trips/<slug>.md                      optional trip overrides
  gear/items.json, gear/setups.json    equipment and named setups
  profiles/<name>.json                 dive computer profiles, linked from dives
  imports/<id>.json                    record of each import run
  sites/<site_id>.md                   personal sites, overlays and forks of commons sites
  regions/<id>.md                      personal regions
  maps/drawn/<map_id>.json             personal drawn maps (<site>-p<n> on commons sites)
  maps/seed/<site_id>.json|.svg        generated sketches
  maps/reference/index.json + files    third-party reference maps, never public
  media/...                            files addressed as repo:<path>

divelog-sites/                         divelog.yaml kind: sites
  divelog.yaml
  sites/<iso3>-<slug>.md               objective site records (SiteCore)
  regions/<id>.md
  maps/drawn/<site>-<n>.json, maps/seed/
  media/sites/...                      photos, every one listed in media/manifest.json
  media/manifest.json
  redirects.yaml                       renamed site ids, old -> new
```

Media that is not in a repository (photos uploaded through the admin, logbook scans, rendered
variants, basemap tiles) lives in the media store (`MEDIA_ROOT` or an S3 bucket) and is addressed
by its storage key.

## `divelog.yaml`

```yaml
format: 1
kind: log            # log | sites
name: divelog-data
sources:             # log only: the commons this log layers on
  - kind: commons
    name: divelog-sites
    path: ../divelog-sites   # relative to the log root; COMMONS_ROOT overrides it on a server
    ref: 3f0c1a2             # commit the log was last validated against
```

## Dives: `dives/<nnnnn>.md`

Frontmatter is the dive, the body is the dive's story (Markdown). `number` is the identity and
matches the file name. Required: `number`, `date`, `duration_min`. `site` references a site id
from the merged view of log and commons. `visibility` is `public`, `private` (owner only) or
`draft` (not counted). `people` lists person ids. `tanks` holds cylinders with gas and
pressures, `profiles` lists repository paths of profile files, `media` attached files,
`map_annotation` what the dive did on a site map (`map_id`, the map `revision` it was drawn
against, `route` legs `{from, to}` by node id, `turn`, `pins`, free `path`). Fields ending in
`_raw` keep the original logbook text next to a normalised value.

```markdown
---
number: 412
date: '2025-03-01'
time_in: '09:30'
duration_min: 62
max_depth_m: 18.5
water_temp_c: 24
site: mex-tortuga
people: [kim]
tags: [cave]
gas: nitrox
o2_pct: 32
tanks:
  - {cylinder: AL80, gas: nitrox, o2_pct: 32, pressure_in_bar: 210, pressure_out_bar: 70}
profiles: [profiles/shearwater_2025-03-01_0007.json]
visibility: public
---

Downstream to the halocline room.
```

**Profiles** (`profiles/*.json`) are columnar: equal-length arrays `t_s`, `depth_m` and,
optionally, `temp_c`, `ndl_min`, `tts_min`, `stop_depth_m`, plus metadata such as
`sample_interval_s`, `date`, `time_in`, `gf`, `gas_switches`. A row form
`{"samples": [{"t": 0, "d": 0.0, "temp": 24}, ...]}` is read as well.

## People, trips, gear, regions

- `people/<id>.md`: `id`, `slug` (URL), `first_name`, optional `last_name`, `alias`,
  `aliases` (spellings that match on import), `display` (`alias-or-first`, `full`, `hidden`),
  `avatar`, `media`, `notes` (private). The body is the person's bio.
- `trips/<slug>.md`: trips are derived from runs of dives abroad (see `HOME_COUNTRIES`). A
  file with `start_date` and `end_date` claims every dive in its window; one without renames,
  describes or (with `merge: [slug, ...]`) joins derived trips. Body: the trip description.
- `gear/items.json`: a list of `{id, name, category, brand, model, acquired, retired,
  notes_md, sort, media}`; `gear/setups.json`: `{id, name, description_md, sort, items}`.
- `regions/<id>.md`: `region`, `name`, `country`, `waters`; body: the region text.

## Sites: `sites/<site_id>.md`

Site ids match `^[a-z]{3}-[a-z0-9-]+$` (ISO-3 country, then a slug) and are never deleted from
the commons; a rename goes into `redirects.yaml`. A site file is one of three things:

| Origin | File | Meaning |
| --- | --- | --- |
| `log` | full record, no `extends` | a personal site, unknown to the commons |
| `commons` | `extends: commons` (or no log file) | the commons record plus a personal overlay |
| `fork` | full record with `forked_from: commons@<revision>` | a personal copy shadowing a commons id |

**Objective fields** (`SiteCore`, what a commons record carries): `site_id, name, full_name,
short_name, aliases, region, country, area, system, type, section_vocabulary, lat, lon, access
{lat, lon, note}, location_visibility (exact | region_only), water (salt | fresh | brackish),
halocline, halocline_m, summary, maps, default_map, media, sources, verified, geo_source,
revision, changelog`. The body is the neutral site description.

**Personal fields** (overlay): `notes, prices [{date, amount, currency, note}],
reference_maps, subsurface_uuid, summary_override`, a preferred `default_map`, extra `aliases`,
`maps` and `media`, and `base_revision` (the commons revision the overlay was written
against). The overlay body is shown as "My dives here" next to the commons description.

**Merge rules**: overlay fields replace, `maps`, `media` and `aliases` concatenate, objective
fields are never overridden by an overlay (that is what a fork is for).

**Versioning**: every site carries `revision` (≥ 1, default 1) and a newest-first `changelog`
of `{revision, date, author?, note}` whose revisions are unique, strictly descending and start
at `revision`. Only the server (or a `divelog` command) moves a revision: a save that changes an
objective field bumps it; preference and overlay saves do not. When the commons moves past an
overlay's `base_revision` or a fork's pin, the site is reported as stale.

Map references in `maps` and `default_map` are `drawn:<map_id>`, `seed:<site_id>` or
`reference:<file>` (reference maps are personal and never enter the commons).

A commons record:

```markdown
---
site_id: fra-ressel
name: Émergence du Ressel
region: fra-lot
country: FRA
type: cave
lat: 44.5574
lon: 1.7395
access: {lat: 44.5581, lon: 1.7402, note: Roadside on D41.}
water: fresh
summary: A resurgence of the Célé with a long sump system.
maps: [drawn:fra-ressel-1]
default_map: drawn:fra-ressel-1
sources: [https://example.org/ressel]
verified: field
geo_source: OSM node/123
revision: 2
changelog:
  - {revision: 2, date: '2026-10-01', author: Ann, note: Road-side access point}
  - {revision: 1, date: '2026-09-30', note: Imported}
---

The Ressel is a resurgence of the Célé ...
```

An overlay on it in the log:

```markdown
---
site_id: fra-ressel
extends: commons
base_revision: 2
default_map: drawn:fra-ressel-p1
maps: [drawn:fra-ressel-p1]
prices:
  - {date: '2024-06-01', amount: 12, currency: EUR, note: parking}
---

I dived it twice with my buddy.
```

## Drawn maps: `maps/drawn/<map_id>.json`

A drawing in metres in plan view, `x` east and `y` south. Commons maps are `<site>-<n>`,
personal maps `<site>-p<n>`. Fields: `version` (3),
`kind` (`stickmap` for caves, `sitemap` for open water), `title`, `north` (degrees),
`to_scale`, `nodes` (`id, x, y, type, label, depth, object_kind, left, right, color`),
`edges` (`from, to, distance, azimuth, note, style`), `areas` and `lines` (`id, kind, label,
depth, points [{x, y}]`, lines also `closed`), `notes` (where the drawing comes from),
`origin {lat, lon}` (where (0, 0) sits), `underlay` (tracing aid, never rendered), and the
record fields `id, site_id, sort, revision, changelog, updated_at`. Node ids are stable
because dives annotate routes by them: a removed id goes into `retired_nodes`, a rename into
`renamed_nodes {old: new}`, with a revision bump.

```json
{
 "version": 3,
 "kind": "stickmap",
 "title": "Main line",
 "north": 0,
 "nodes": [
  {"id": "ent", "x": 0, "y": 0, "type": "entrance", "label": "Pool"},
  {"id": "t1", "x": 40, "y": 0, "type": "t", "depth": 12}
 ],
 "edges": [{"from": "ent", "to": "t1", "distance": 40, "style": "line"}],
 "areas": [],
 "lines": [],
 "notes": "Traced from the 2019 survey.",
 "origin": {"lat": 20.27748, "lon": -87.47545},
 "id": "mex-tortuga-1",
 "site_id": "mex-tortuga",
 "sort": 0,
 "revision": 2,
 "changelog": [{"revision": 2, "date": "2026-09-30", "note": "Added the T"}],
 "retired_nodes": [],
 "renamed_nodes": {}
}
```

`divelog stickmap` (scanned cave map → stick map) and `divelog sitemap-osm` (OpenStreetMap →
open-water site map) produce these files.

## Media

A `media` entry (`MediaRef`) on a dive, site, person or gear item: `id`, `key`, `kind`
(`photo`, `scan`, ...), `mime`, `bytes`, `width`, `height`, `taken_at`, `caption`, `credit`,
`sort`, `public`, `variants` (rendered WebP sizes that exist) and `original_name`. The `key`
addresses the media store; `repo:<path>` points into the log repository and `commons:<path>`
into the commons.

Every photo in the commons is listed in `media/manifest.json` with its origin and licence; only
the licences of the validator's allowlist (CC0, CC BY, CC BY-SA, public domain mark) are
accepted and `public` must be true:

```json
{
 "media/sites/fra-ressel.jpg": {
  "source": "Wikimedia Commons",
  "page": "https://commons.wikimedia.org/wiki/File:Ressel.jpg",
  "author": "Jane Doe",
  "licence": "CC-BY-SA-4.0",
  "public": true
 }
}
```

## Licences of the commons

Structured site data is ODbL 1.0, descriptions and map artwork CC BY-SA 4.0, photos keep their
own licence from the media manifest. A log repository is private and needs no licence.

## Validating the commons

`divelog validate --kind sites <root>` prints `path: message` per problem. Errors fail the run;
warnings (`path: warning: message`) are printed but pass unless `--strict` is given.

Rules on the tree as it is:

- ids: site ids match the pattern, name their file and are unique; drawn map ids have no
  `-p<n>`, name their file and are unique.
- references: regions, drawn and seed maps, photos (`repo:`/`commons:` files), map sites and
  underlays resolve inside the commons. `redirects.yaml` (`old: new`) points at existing sites
  in one step and never redirects a live id.
- provenance: `lat`/`lon` need a `geo_source`; a body over 400 characters needs `sources`.
- licences: every media file has a `media/manifest.json` entry with an allowlisted licence and
  `public: true`; no `reference:` maps or underlays; no personal (`notes`, `prices`,
  `reference_maps`, `subsurface_uuid`) or overlay/fork keys.
- editorial: no first-person words (`I`, `my`, `we`, `our`, `us`, ...) in site summaries and
  bodies, region bodies, or drawn-map titles, notes and labels. A Roman numeral after a name
  (`Andrea I`, `Malek II`) is not a pronoun. Owner-voice phrases without a pronoun (`in the
  log`, `the workbook`, `dive(s) here`, `favourite`, `the owner's`) are warnings.
- visibility: a `location_visibility: region_only` site with more than two decimals in
  `lat`/`lon` is a warning: such records carry a coarse point only.
- node ids: ids in `retired_nodes` are not used again; `renamed_nodes` targets are nodes.

With `--base <git ref>` the working tree is also compared with that revision (commons CI passes
the pull request's base branch):

- a changed site (any objective field or the body) moves `revision` up by exactly 1 and adds a
  changelog entry at the new revision with a non-empty note, dated no earlier than the newest
  base entry; the base changelog stays unchanged below it. A revision never goes down.
- a deleted or renamed site id needs a `redirects.yaml` entry.
- a drawn map whose geometry changed (`nodes`, `edges`, `lines`, `areas`, `origin`, `north`,
  `to_scale`) is bumped the same way; title and notes edits need no bump. A node id that
  disappeared is listed in `retired_nodes` or `renamed_nodes`, and neither list loses entries.
- a deleted region or removed manifest entry that is still referenced is caught by the
  reference and licence rules above.

`divelog maps changed --base <ref>` prints the ids of drawn maps added or changed since the
ref, and `divelog maps render <map-id | file> --out <png> [--root <commons>]` draws one as a
1600 px PNG (areas, lines, edges, nodes with labels, north arrow, scale bar for maps drawn to
scale) for review.
