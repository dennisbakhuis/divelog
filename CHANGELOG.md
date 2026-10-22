# Changelog

`@divelog/kit` and `divelog-server` share version numbers. API major and data format stay at 1
unless a section says otherwise.

## Unreleased

- A computer dive number only matches a logged dive dated within a day of the computer dive, so
  a new computer whose numbers restart at 1 no longer attaches its #14 to a hand-logged dive
  `computer: [14]` from years ago. A number on a far date falls through to the time match. This
  holds for the Shearwater Cloud and XML imports.
- Profiles from the Shearwater Cloud import keep the Cloud `DiveId` of each log in
  `"source_ids"`, after `"source"`; joined and split dives carry the ids of their logs. A dive
  whose id is in a profile is recognised as already in the log, even after its computer number
  was removed from the dive, and cannot be linked, joined or split again.

## 0.6.0 — Shearwater dives from the phone (22 October 2026)

Dives come into the log from a Shearwater computer without the desktop app: the database the
Shearwater Cloud app exports (Profile tab → Export (\*.db)) is uploaded on the import page, and
the server reads the computer's own dive records from it. The API changes are additive
(`POST /admin/import/shearwater-cloud`, `ImportResult.dives`); data format stays 1.

- The import page opens with a Shearwater Cloud card. It takes the app's `.db` export, the
  desktop `dive_data.db` or an account ZIP, and previews every dive in it: a new draft, a
  profile for a logged dive, already in the log, or unreadable. Only dives newer than the log's
  latest imported one start ticked, so the whole export can be uploaded every time. "Import
  from Shearwater" on the Dives and New dive pages goes straight to it.
- A dive is matched by its computer number and serial, else by the nearest logged dive that day
  within 10 minutes, never one that already has a profile from that computer. A clock offset
  corrects a drifting computer clock and flags the dive ("time corrected by +7 h (was 07:44)").
- Each new dive can belong to a logged dive of the same day ("Belongs to"), with the clearly
  nearest one suggested. Adding a profile to a logged dive only fills its empty time in, time
  out, average depth and water temperature.
- Dives the computer ended at a surface break can be joined ("Same dive as #13 (surfaced 12
  min)") into one dive with one profile, and a dive it kept going through a surface break can be
  split at the break into one dive per part, each with its own profile and "Belongs to". A
  break where a logged dive starts is suggested; neither happens on its own.
- Shearwater PNF dive logs are parsed by a parser written from `docs/SHEARWATER.md`, with the
  format knowledge credited to libdivecomputer and Subsurface in `NOTICE`: samples on the
  computer's real interval from t = 0, the surface tail after the dive trimmed, logs split in
  two by the computer merged. `divelog import shearwater-pnf` uses it and writes full profiles,
  with the stop depth from the right field.
- The raw log of each imported dive is kept under `imports/YYYY/MM/`, and the import is listed
  with format `shearwater-cloud`. The Shearwater XML import shares the matching, so it no longer
  attaches a profile by time to a dive that already has one.

## 0.5.0 — logging from a phone, buddies sign by e-mail, patched trust stores (21 October 2026)

Every admin function has to work on a phone; this release makes logging a dive at a new or
known site, with photos and the route swum, hold up on one, lets buddies sign a dive through a
mailed link, and rebuilds the images on trust stores that refuse the compromised eMudhra
intermediates. Data shapes stay compatible and the API changes are additive; the server adds
`POST /auth/verify`, the sign endpoints, `pillow-heif`, and stricter validation.

- The combobox footers ("+ New site", "From the commons", "Add person", "+ New trip") and the
  ▾ toggle respond to a tap on iOS Safari, which blurred the input before the click landed. The
  list fits above the on-screen keyboard with its footer always visible, inputs are 16 px on
  touch screens so iOS no longer zooms, Enter closes the keyboard instead of saving, and every
  button, option, chip and nav link is 44 px on a coarse pointer.
- The new-site and new-trip dialogs are kit dialogs: the page behind them no longer scrolls,
  and a dialog starts with the type and water of the site in the form. A country or region
  suggested from the previous site is only a suggestion: the pin replaces it, with the "from
  the pin" and "nearest" chips, and a region of another country is dropped when the country
  changes. A pin at sea clears a country the pin had set.
- Pasted positions keep each coordinate's own hemisphere ("N20°30.000' W087°18.000'" is now
  west), read unmarked degrees-minutes-seconds, refuse leftovers instead of guessing, and take
  a Google Maps link's dropped pin. "Use my location" asks for a fresh fix and says when it is
  rough. The pin drags without scrolling the page, a paste keeps its zoom, the map stays near
  the previous site instead of framing the whole country (and a country frames its largest
  polygon only), and create waits for the pin's country lookup.
- The route editor opens full screen on a phone ("Draw on the map"), with the tools in a bottom
  strip. Taps on stations survive a finger wobble, slow drags pan, iOS pinch no longer zooms
  twice, a public map takes over gestures only after a tap, the first track point is drawn,
  pins and turns can land on stations and lines, notes are kept as typed, every step including
  Clear is undoable, hints say "Tap" on a touch screen, and a free-drawn track no longer dims
  the whole map. The site page's "All dived lines" draws free tracks too. An empty annotation
  is saved as none.
- The dive form: Save & new starts a blank form every time (the second one used to keep the
  dive just saved and fail with "already exists"); a published dive opens unchanged instead of
  being auto-filled; a derived water temperature, interval or trip clears when its source goes
  away and a restored backup keeps what was typed; picking another site drops the old site's
  route and section; the surface interval takes a full keyboard and reads 1.15 as 1:15; a time
  out before the time in is an error instead of a 24-hour dive; filled tank rows need a
  cylinder; field errors without a control show in the save bar; edits typed while photos
  upload survive; the backup is written when the page is hidden; photos offer the camera.
- Toasts sit under the admin bar on a phone instead of over the save bar, at most three at a
  time; the Menu's repository and commons panels open inside the Menu.
- Buddies sign a dive by e-mail. Tick "E-mail buddies to sign" next to Save and every buddy
  with an e-mail address in their person record gets a mail with a link to the dive page
  (`/dive/{n}?sign=…`), valid for 7 days. The page shows the dive, also a private one, with a
  sign box: a short comment, a finger-drawn signature or doodle, and a choice whether the note
  is shown on the dive page. Submitting stores the note on the dive and spends the link; the
  page then says "You signed this dive on …". A buddy is mailed once per dive, saving again
  mails only buddies never asked, there are no reminders, and only the editor's Resend sends a
  new link. The editor shows per buddy whether a request is open, expired or signed, sets a
  note public or private, deletes it or withdraws a request. The public dive page lists the
  notes under the buddies. Format: `buddy_notes` on a dive (person, comment, strokes in a
  1000 × 400 box, signed_at, public); server: `POST /admin/dives/{n}/sign-requests`,
  `DELETE …/sign-requests/{person}`, `DELETE …/buddy-notes/{person}`, public
  `GET|POST /dive/sign/{token}`, settings `SIGN_INVITE_DAYS` and `SIGN_MAIL_SUBJECT`, invites
  in the auth state file. A form save sets `public` on the notes it names and never deletes.
- A magic link works for two minutes (`MAGIC_LINK_MINUTES`, still an env setting) and the
  login page says so from the request's `valid_minutes`.
- Server: a save during a photo upload no longer undoes the other (uploads change the stored
  dive under the lock); a commit made during a running push is pushed; writes, commits and
  rebases share one repository lock and a failed `add` is an error; the mailed link signs in
  only when a browser opens it as a page, so link scanners cannot spend it; a sliding session
  issues its cookie again; HEIC photos decode; photos are recognised by their bytes, keep their
  colour profile, are processed off the event loop and are dated by DateTimeOriginal; files
  that are not processed default to private. A dive's annotation follows renamed map nodes,
  moves to the map's revision only when nothing was dropped, and must be on a map of the
  dive's site. Site create checks the country, region and id prefix, claims the id under the
  lock, and a 409 says whether the log or the commons has it. Trip saves keep the override's
  merge list and cover, and a trip slug is validated.
- Images: the server and reference images pin their base by digest with the October 2026
  trust stores (Debian `ca-certificates` 20250419+deb13u1, Node 22.23.4, certifi 2026.10.19),
  and boto3 verifies against the OS store, refusing chains forged from the compromised eMudhra
  intermediates.

## 0.4.2 — the CLI finds the commons inside the container (18 October 2026)

- `divelog validate`, `sites status|adopt`, `commons pull`, `tiles` and `sitemap-osm fetch` find
  the commons like the server: `--commons`, else `COMMONS_ROOT`, else the `divelog.yaml` source
  path. In the image they no longer report every overlay as lacking a commons record because
  `divelog.yaml` names a path on the operator's machine; a commons path that does not exist is
  an error naming it and the three ways to set it.

## 0.4.1 — git identity in containers (18 October 2026)

- The server sets the owner as git author *and* committer for every commit, pull and rebase.
  A container has no `user.name` or `user.email`, and git refused to commit without one, so
  admin edits were written to disk but never committed or pushed.

## 0.4.0 — commons search, near me, optional atlas (18 October 2026)

Finding a site in the commons is forgiving and location-aware, and an instance can list the
commons sites you have not dived yet; every server change is additive.

- Searching the commons from the admin takes several words, each matching a name, alias or
  area ("blue hole dahab"), and forgives small typos ("tortuge" finds Tortuga); exact and
  prefix matches rank first. The new-site "already known?" check uses the same search for names
  and aliases. The server now depends on `rapidfuzz`.
- The commons search has a "Near me" button where no site position is given: it uses the device
  location to list commons sites within 25 km. Hits found around a point show how far away
  they are ("400 m away", "13 km away").
- `PUBLIC_COMMONS_SITES` (off by default, optionally limited by `PUBLIC_COMMONS_REGIONS`) lists
  commons sites you never dived in the public site list, region pages and region maps; the kit
  marks them "not dived" (badge, hollow marker) and the sites list gets an "Only my dives"
  toggle. Region site lists carry a `dives` count, and an undived `MapSite` has 0 dives and
  null years.
- The server logs a warning at startup while `SESSION_SECRET` is the shipped default, and
  refuses to start on it when `COOKIE_SECURE` is true.

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
