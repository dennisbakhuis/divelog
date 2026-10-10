# Changelog

`@divelog/kit` and `divelog-server` share version numbers. API major and data format stay at 1
unless a section says otherwise.

## 0.3.0 — the UX rework (10 October 2026)

Logging a dive and creating a site now take far fewer clicks and less typing, every admin page
works on a phone, and the whole interface is usable from the keyboard and with a screen reader.
Public page addresses, data shapes and SEO are unchanged; every server change is additive.

### Bugs and safe defaults (U0)

- Saving a dive no longer wipes the cover photo that was set after the page opened.
- A new dive without tanks is no longer saved as nitrox 32 behind your back; it has no gas.
- No more made-up duration and depth (45 min, 18 m): the fields start empty and must be filled.
- The date of a new dive is today where you are, not in UTC.
- The admin menu marks the section you are in, not always "Dives".
- Enter in a search box picks the first hit instead of saving the whole dive.
- Imported sites always get a country prefix in their id, and hand-typed site ids are checked
  (and checked for being free) while you type.
- Photo actions (cover, caption, delete, move) report failures instead of failing silently;
  moving a photo is one request.
- The login page shows the "Mailpit" hint only in development.

### Building blocks (U1)

- New kit components with full keyboard and screen-reader support: `Dialog`,
  `ConfirmDialog`/`confirmDialog()`, `Popover`, `Tabs`, `Combobox`, `Field`, `Disclosure`,
  `Toolbar`, `SkipLink`, `LiveRegion`/`announce()`. Browser `confirm()` boxes are gone.
- Type and spacing scales, one input style, a visible focus ring from the kit itself, readable
  faint text (`#8a9bb3`) and control borders with enough contrast, reduced-motion rules.
- Toasts stay mounted, pause on hover, keep errors until dismissed, and are announced.
- Server errors on a field (422) land on that field.

### Server endpoints (US)

- `GET /admin/dives/template`, `GET /admin/dives/page`, `POST /admin/dives/publish`,
  `POST /admin/preview/markdown`, `GET /admin/sites/nearby`, `POST /admin/sites/{id}/maps/seed`,
  `GET /admin/meta/site-fields`, `GET /meta/countries`, `GET /meta/licences`, and a dry run for
  imports. Gear setups can carry tanks, suit and weights; photos a licence, author and source;
  site saves a "what changed" note. Latitude and longitude are range-checked.

### Logging a dive (U2)

- "+ New dive" on every public page for the owner, and "Log a dive here / with X / on this
  trip" on site, person and trip pages, each prefilling the form.
- The new-dive page loads one template: the previous dive, the last dive at the site and the
  sites and buddies you use most.
- The form opens with the essentials; everything else is in sections that remember whether they
  are open. Site, buddies and trip are searchable pickers with your recent choices first.
- Duration from time in and out, surface interval from the previous dive, water temperature
  from the last dive at the site and the trip from the date are filled in for you (and marked
  so). "Same as previous dive" fills the blanks in one go.
- Save, Save & new, Save & next draft, Ctrl/⌘-S, a save bar that stays in view, field errors
  that take you to the field, a guard against leaving with unsaved changes and a backup that
  survives a reload. Photos chosen before the first save are uploaded right after it.
- The dive list pages through the server, keeps its search, filter and sort in the address,
  sorts by column and publishes drafts together. Imports show a dry run first.

### Creating and editing a site (U3)

- One "new site" form for the page and the dive editor: type the name, tap the map. Country,
  region and id follow from the pin; sites that look the same, in your log or the commons, show
  up as you go. Create, create and log a dive, or create and draw a map.
- The site editor is one page with tabs: Details, Location, Maps, Photos, Dives. Commons fields
  are locked with one "Fork to edit" button; your own fields are marked.
- Photos can carry a proper licence, author and source.

### Map editor (U4)

- "Start from OpenStreetMap" draws a starter map around the site; blank site and stick maps
  start at the site's position. Nothing is stored until "Save map" (one commit).
- Trace over the locator map without any aligning; drag and two-point scaling for other
  underlays.
- Single-key shortcuts only work while the drawing has focus, are listed under "?", and can be
  switched off. Pinch zoom, a bottom tool strip and a details sheet on phones.

### Public pages and the shell (U5)

- Skip link, labelled navigation, named pager links, real links inside dive rows (site, trip,
  buddy), a back link that keeps your filters, the sites filter in the address.
- The world map's dots are links or buttons you can reach with the keyboard; the globe has a
  "Sites in view" list, a pause button and a popup that takes and returns focus.
- Larger tags and nav pills, a temperature legend on site pages, underlined region links.
- The admin bar folds into a menu on narrow screens.

### Tests, polish and release (U6)

- An existing dive's template now finds an earlier dive on the same day (`before=` on
  `GET /admin/dives/template`); the site workspace's Dives tab asks the server for the site's
  dives (`site=` on `GET /admin/dives/page`); site photos can be reordered
  (`PUT /admin/sites/{id}/attachments/order`, log and forked sites); `GET /meta/countries`
  lists every ISO 3166 country.
- "Create & draw a map" opens a blank map straight away; a blank map nobody drew on is not
  "unsaved work".
- `toLatLon` turns drawing points the same way as survey shots and the locator underlay, and
  the CLI map render draws its north arrow the same way as the site pages.
- The map editor's press-and-hold menu works with the arrow keys; the dive route tools are a
  `Toolbar`; the person, trip and region forms use `Field` with errors on their fields; the
  site and region tables no longer push a phone page sideways; the home tile's counters are
  read once.
- The reference app's end-to-end tests run axe on every public and admin page signed in and
  out at 1280 and 390 px, the keyboard flows (a repeat dive in six actions, a site with a map
  in five) and a phone pass of every admin page and both editors.
