"""A synthetic personal log for the split tests, with one case per split rule."""

import shutil
from pathlib import Path
from typing import Any

from divelog_server.store.files import write_json, write_markdown

FIXTURE_DATA = Path(__file__).parent / "fixtures" / "data"
FIXTURE_COMMONS = Path(__file__).parent / "fixtures" / "commons"

RESSEL_BODY = "The Ressel is a resurgence of the Célé.\n\nI dived it twice with my buddy."
CABOUY_BODY = (
    "## Access\n\nPark at the gate.\n\n"
    "The Gouffre de Cabouy is a large sinkhole near Pinsac. We dived it in 2019."
)
ZEELANDBRUG_BODY = "Diving under the pillars of the bridge. Strong current at mid-tide."
LONG_BODY = "A long neutral description of the lake and its shores. " * 10


def drawn_map(map_id: str, site_id: str, kind: str = "stickmap", **extra: Any) -> dict[str, Any]:
    """A minimal drawn map payload."""
    return {
        "version": 3,
        "kind": kind,
        "title": map_id,
        "nodes": [{"id": "a", "x": 0, "y": 0}, {"id": "b", "x": 10, "y": 0}],
        "edges": [{"from": "a", "to": "b", "distance": 10}],
        "id": map_id,
        "site_id": site_id,
        "sort": 0,
        "revision": 1,
        **extra,
    }


def site(root: Path, site_id: str, body: str = "", **meta: Any) -> None:
    """Write a full log site file."""
    write_markdown(root / "sites" / f"{site_id}.md", {"site_id": site_id, **meta}, body)


def dive(root: Path, number: int, site_id: str, **meta: Any) -> None:
    """Write a dive file."""
    payload = {
        "number": number,
        "date": f"2024-01-{number:02d}",
        "duration_min": 45,
        "max_depth_m": 20,
        "site": site_id,
        "visibility": "public",
        **meta,
    }
    write_markdown(root / "dives" / f"{number:05d}.md", payload, "")


def build_log(root: Path) -> Path:
    """Write the synthetic log repository at ``root`` and return it."""
    root.mkdir(parents=True)
    shutil.copytree(FIXTURE_DATA / "people", root / "people")
    shutil.copytree(FIXTURE_DATA / "gear", root / "gear")
    shutil.copytree(FIXTURE_DATA / "maps" / "reference", root / "maps" / "reference")
    write_markdown(root / "regions" / "fra-lot.md", {"region": "fra-lot", "name": "The Lot"}, "")
    write_markdown(
        root / "regions" / "nld-zeeland.md",
        {"region": "nld-zeeland", "name": "Zeeland", "country": "NLD"},
        "Rebuilt after 1953.",
    )
    geo = {"lat": 44.5, "lon": 1.9, "geo_source": "OSM node/1", "country": "FRA", "type": "cave"}
    site(
        root,
        "fra-ressel",
        RESSEL_BODY,
        name="Ressel",
        region="fra-lot",
        summary="A resurgence of the Célé.",
        default_map="drawn:fra-ressel-1",
        sources=["https://example.org/ressel"],
        notes="Owner note.",
        subsurface_uuid="abc-123",
        **geo,
    )
    site(
        root,
        "fra-cabouy",
        CABOUY_BODY,
        name="Cabouy",
        region="fra-lot",
        summary="The cave where I learned sidemount.",
        **geo,
    )
    site(
        root,
        "fra-marchepied",
        name="Marchepied",
        region="fra-lot",
        area="Marcilhac-sur-Célé, Lot",
        summary="My favourite sump.",
        **geo,
    )
    site(
        root,
        "nld-zeelandbrug",
        ZEELANDBRUG_BODY,
        name="Zeelandbrug",
        region="nld-zeeland",
        country="NLD",
        type="sea",
        lat=51.6,
        lon=3.9,
        geo_source="OSM way/1",
        summary="A five-kilometre bridge over the Oosterschelde.",
        maps=["seed:nld-zeelandbrug", "reference:zeelandbrug/map.png"],
        default_map="drawn:nld-zeelandbrug-1",
        reference_maps=["reference:zeelandbrug/map.png"],
        prices=[{"date": "2024-01-01", "amount": 0, "currency": "EUR", "note": "Free"}],
        sources=["https://example.org/zeelandbrug"],
        osm_way="way/1",
        media=[
            {"id": "zb-cc", "key": "repo:media/sites/nld-zeelandbrug.jpg", "credit": "A. Author"},
            {"id": "zb-private", "key": "repo:media/sites/nld-zeelandbrug-private.jpg"},
            {"id": "zb-upload", "key": "sites/nld-zeelandbrug/own.jpg"},
        ],
    )
    site(
        root,
        "nld-clipper-anna",
        name="Clipper Anna",
        region="nld-zeeland",
        country="NLD",
        type="wreck",
        lat=51.7,
        lon=3.8,
        geo_source="Owner GPS",
        location_visibility="region_only",
        summary="A sunken clipper.",
    )
    site(
        root,
        "fra-longbody",
        LONG_BODY,
        name="Long Lake",
        region="fra-lot",
        summary="A lake.",
        **{**geo, "type": "lake"},
    )
    site(root, "secret", name="Secret Spring", country="FRA", type="cave", lat=44.1, lon=1.5)
    site(root, "fra-nogeo", name="No Geo", country="FRA", type="cave", lat=44.2, lon=1.6)

    maps = root / "maps" / "drawn"
    reference = {"ref": "reference:zeelandbrug/map.png"}
    write_json(
        maps / "fra-ressel-1.json", drawn_map("fra-ressel-1", "fra-ressel", underlay=reference)
    )
    write_json(maps / "fra-ressel-2.json", drawn_map("fra-ressel-2", "fra-ressel", sort=1))
    write_json(
        maps / "fra-cabouy-1.json", drawn_map("fra-cabouy-1", "fra-cabouy", underlay={"ref": "osm"})
    )
    write_json(
        maps / "fra-cabouy-2.json",
        drawn_map("fra-cabouy-2", "fra-cabouy", sort=1, underlay={"ref": "upload:scan"}),
    )
    changelog = [
        {"revision": 3, "date": "2026-09-30", "note": "Third"},
        {"revision": 2, "date": "2026-09-20", "note": "Second"},
    ]
    write_json(
        maps / "nld-zeelandbrug-1.json",
        drawn_map(
            "nld-zeelandbrug-1", "nld-zeelandbrug", "sitemap", revision=3, changelog=changelog
        ),
    )
    write_json(
        maps / "nld-zeelandbrug-2.json",
        drawn_map(
            "nld-zeelandbrug-2", "nld-zeelandbrug", "sitemap", sort=1, underlay={"ref": "upload:x"}
        ),
    )
    write_json(maps / "secret-1.json", drawn_map("secret-1", "secret"))
    seed = root / "maps" / "seed"
    write_json(seed / "nld-zeelandbrug.json", {"site": "nld-zeelandbrug"})
    (seed / "nld-zeelandbrug.svg").write_text("<svg/>", encoding="utf-8")

    media = root / "media" / "sites"
    media.mkdir(parents=True)
    (media / "nld-zeelandbrug.jpg").write_bytes(b"cc photo")
    (media / "nld-zeelandbrug-private.jpg").write_bytes(b"private photo")
    write_json(
        root / "media" / "manifest.json",
        {
            "sites": {
                "nld-zeelandbrug": {
                    "file": "nld-zeelandbrug.jpg",
                    "source": "Wikimedia Commons",
                    "author": "A. Author",
                    "licence": "CC BY 2.0",
                    "public": True,
                },
                "nld-zeelandbrug-private": {
                    "file": "nld-zeelandbrug-private.jpg",
                    "licence": "CC BY 4.0",
                    "public": False,
                },
            }
        },
    )

    annotation = {"map_id": "fra-ressel-1", "revision": 1, "route": [{"from": "a", "to": "b"}]}
    dive(root, 1, "nld-zeelandbrug", map_annotation={"map_id": "nld-zeelandbrug-1"})
    dive(root, 2, "fra-ressel", map_annotation=annotation)
    dive(root, 3, "fra-cabouy")
    dive(root, 4, "secret", map_annotation={"map_id": "secret-1"})
    return root


def build_commons(root: Path) -> Path:
    """A valid commons: the commons fixture without its legacy ``ressel`` site."""
    shutil.copytree(FIXTURE_COMMONS, root)
    (root / "sites" / "ressel.md").unlink()
    return root
