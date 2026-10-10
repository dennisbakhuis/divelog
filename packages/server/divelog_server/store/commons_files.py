"""The fixed files of a new site commons: licence, readme, contribution guide, redirects, CI."""

SERVER_PACKAGE = "bakhuis-backend"

LICENSE = """\
# Licence

This repository is a shared database of dive sites. It is licensed in layers.

## Database

The site database (the structured fields of `sites/*.md`, `regions/*.md` and the node and edge
data of `maps/drawn/*.json`) is made available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Any rights in individual contents of the database are licensed under the
[Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/), except where a
layer below says otherwise.

## Prose and drawn-map artwork

Descriptions (the Markdown bodies and summaries of sites and regions) and the drawn maps as
artwork are licensed under
[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

## Photos

Every photo under `media/` keeps its own licence, recorded with its source and author in
`media/manifest.json`. Only the licences in the allowlist of the validator are accepted.

## Attribution

Show this line wherever the data is used:

> Site data © divelog-sites contributors (ODbL), descriptions CC BY-SA 4.0,
> map data © OpenStreetMap contributors.
"""

README = """\
# divelog-sites

A shared, community-maintained database of dive sites: coordinates, type, water, access,
regions, drawn site and cave maps, sketches and freely licensed photos. Instances of the
`divelog` module clone this repository read-only and layer a diver's personal log on top.

- `sites/<iso3>-<slug>.md`: one site per file, frontmatter plus a neutral description.
- `regions/<id>.md`: regions the sites belong to.
- `maps/drawn/<id>.json`: drawn maps (`<site>-<n>`), `maps/seed/`: generated sketches.
- `media/sites/`: photos, with source, author and licence in `media/manifest.json`.
- `redirects.yaml`: renamed site ids (old → new); ids are never deleted.

Every site and map carries a `revision` and a newest-first `changelog`.

Validate locally with `uvx --from {package} divelog validate --kind sites .`.
See `CONTRIBUTING.md` for how to propose changes and `LICENSE.md` for the licence layers.

Initial content imported from the personal log `{log_name}`.
"""

CONTRIBUTING = """\
# Contributing

Changes arrive as pull requests: fork the repository, commit on a branch, open a PR. CI runs
the validator on every PR; a red run is not merged.

## Sign-off

Every commit carries a Developer Certificate of Origin sign-off (`git commit -s`), stating
that you have the right to submit the change under the licences in `LICENSE.md`. There is no
contributor licence agreement.

## What a change looks like

- New site: `sites/<iso3>-<slug>.md`, id matching `^[a-z]{3}-[a-z0-9-]+$`, `revision: 1`.
- Changed site or map: bump `revision` and add a changelog entry at the top.
- Map edits keep node ids stable; list removed ids in `retired_nodes`, renamed ones in
  `renamed_nodes`.
- Coordinates name their `geo_source`; a description longer than 400 characters names its
  `sources`.

## What may not enter

- Third-party reference maps (`reference:` refs) or maps traced from copyrighted surveys
  without permission.
- Text copied from guide books or websites. Citing them in `sources` is fine, copying is not.
- First-person prose ("I", "my", "we", ...): descriptions are neutral; personal stories
  belong in the diver's own log.
- Personal fields: `notes`, `prices`, `reference_maps`, `subsurface_uuid`.
- Photos without an allowlisted licence, or not marked `public: true` in the manifest.
- Personal map ids (`-p<n>`) and sensitive locations that are not hidden on the record
  (`location_visibility: region_only`).
"""

REDIRECTS = """\
# Renamed site ids, old: new. Site ids are never deleted.
{}
"""

WORKFLOW = """\
name: validate

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - name: Validate the commons
        run: uvx --from {package} divelog validate --kind sites .
"""


def files(log_name: str) -> dict[str, str]:
    """The fixed files of a new commons by path, for an import from ``log_name``."""
    return {
        "LICENSE.md": LICENSE,
        "README.md": README.format(package=SERVER_PACKAGE, log_name=log_name),
        "CONTRIBUTING.md": CONTRIBUTING,
        "redirects.yaml": REDIRECTS,
        ".github/workflows/validate.yml": WORKFLOW.format(package=SERVER_PACKAGE),
    }
