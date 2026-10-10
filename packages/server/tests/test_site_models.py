from datetime import date
from typing import Any

import pytest
from pydantic import ValidationError

from divelog_server.store.files import read_markdown
from divelog_server.store.models import (
    ChangeEntry,
    SiteCore,
    SiteMapRecord,
    SiteOverlayFields,
    SiteOverlayRecord,
    SiteRecord,
    changelog_problem,
)
from divelog_server.store.overlay import overlay_frontmatter
from divelog_server.store.store import frontmatter

from .conftest import FIXTURE_DATA


def test_site_record_is_core_plus_overlay() -> None:
    assert issubclass(SiteRecord, SiteCore)
    assert issubclass(SiteRecord, SiteOverlayFields)
    core = set(SiteCore.model_fields)
    overlay = set(SiteOverlayFields.model_fields)
    assert {"verified", "geo_source", "location_visibility", "maps", "media"} <= core
    assert {"notes", "prices", "reference_maps", "subsurface_uuid", "summary_override"} <= overlay
    assert not core & overlay
    assert set(SiteRecord.model_fields) == core | overlay | {
        "forked_from",
        "body_md_commons",
        "base_revision",
    }


def test_site_file_round_trips_unchanged() -> None:
    path = FIXTURE_DATA / "sites" / "zeelandbrug.md"
    meta, body = read_markdown(path)
    meta["custom_key"] = {"kept": True}
    record = SiteRecord.model_validate({**meta, "body_md": body})
    dumped = frontmatter(record)
    assert {k: dumped[k] for k in meta} == meta
    assert [k for k in dumped if k in meta] == list(meta)
    assert set(dumped) - set(meta) == {"halocline", "location_visibility", "revision"}
    assert record.body_md == body


def test_site_key_order_is_historic() -> None:
    record = SiteRecord(
        site_id="x",
        name="X",
        notes="n",
        subsurface_uuid="u",
        verified="web",
        geo_source="osm",
        reference_maps=["reference:x.png"],
        maps=["x-1"],
        summary="s",
        forked_from="commons@abc",
        extra_key=1,
    )
    assert list(frontmatter(record)) == [
        "site_id",
        "name",
        "type",
        "location_visibility",
        "halocline",
        "summary",
        "maps",
        "reference_maps",
        "verified",
        "geo_source",
        "revision",
        "notes",
        "subsurface_uuid",
        "forked_from",
        "extra_key",
    ]


def test_overlay_record() -> None:
    overlay = SiteOverlayRecord.model_validate(
        {
            "site_id": "fra-ressel",
            "extends": "commons",
            "default_map": "fra-ressel-p1",
            "maps": ["fra-ressel-p1"],
            "notes": "Park at the top.",
            "summary_override": "My favourite.",
            "prices": [{"date": "2024-05-01", "amount": 12}],
            "unknown": "kept",
        }
    )
    assert overlay.extends == "commons"
    dumped = frontmatter(overlay)
    assert dumped["unknown"] == "kept"
    assert dumped["summary_override"] == "My favourite."
    assert "body_md" not in dumped
    assert SiteOverlayRecord.model_validate(dumped) == overlay


def test_map_node_stability_fields_default_empty() -> None:
    record = SiteMapRecord.model_validate({"id": "m-1", "site_id": "m"})
    assert record.retired_nodes == []
    assert record.renamed_nodes == {}
    record = SiteMapRecord.model_validate(
        {"id": "m-1", "site_id": "m", "retired_nodes": ["a"], "renamed_nodes": {"b": "c"}}
    )
    assert record.model_dump()["renamed_nodes"] == {"b": "c"}


def test_site_out_carries_provenance_and_html() -> None:
    from divelog_server.schemas.dive import SiteOut, SitePrivate

    properties = SiteOut.model_json_schema(mode="serialization")["properties"]
    assert {"verified", "geo_source", "origin", "attribution", "description_html"} <= set(
        properties
    )
    assert set(SitePrivate.model_fields) == {"notes", "reference_maps", "pin"}


def entry(revision: int, note: str = "n", **extra: Any) -> dict[str, Any]:
    return {"revision": revision, "date": "2026-10-01", "note": note, **extra}


def test_revision_defaults_for_files_without_one() -> None:
    meta, body = read_markdown(FIXTURE_DATA / "sites" / "zeelandbrug.md")
    record = SiteRecord.model_validate({**meta, "body_md": body})
    assert record.revision == 1 and record.changelog == []
    assert SiteMapRecord.model_validate({"id": "m-1", "site_id": "m"}).changelog == []


def test_changelog_rules() -> None:
    record = SiteRecord.model_validate(
        {"site_id": "x", "name": "X", "revision": 3, "changelog": [entry(3), entry(2)]}
    )
    assert [c.revision for c in record.changelog] == [3, 2]
    assert isinstance(record.changelog[0], ChangeEntry) and record.changelog[0].author is None
    bad = [
        {"revision": 0},
        {"revision": 2, "changelog": [entry(1)]},
        {"revision": 3, "changelog": [entry(3), entry(3)]},
        {"revision": 3, "changelog": [entry(2), entry(3)]},
        {"revision": 3, "changelog": [entry(4), entry(3)]},
        {"revision": 2, "changelog": [entry(2), entry(0)]},
    ]
    for fields in bad:
        with pytest.raises(ValidationError):
            SiteRecord.model_validate({"site_id": "x", "name": "X", **fields})
        with pytest.raises(ValidationError):
            SiteMapRecord.model_validate({"id": "m-1", "site_id": "m", **fields})
    assert changelog_problem(5, []) is None
    assert changelog_problem(5, [ChangeEntry.model_validate(entry(4))]) is not None


def test_bump_prepends_an_entry_dated_today() -> None:
    record = SiteRecord(site_id="x", name="X")
    record.bump("Moved the entrance", "Dennis")
    record.bump("Renamed", None)
    assert record.revision == 3
    assert [(c.revision, c.note, c.author) for c in record.changelog] == [
        (3, "Renamed", None),
        (2, "Moved the entrance", "Dennis"),
    ]
    assert record.changelog[0].date == date.today()
    SiteRecord.model_validate(record.model_dump())


def test_revision_and_changelog_sit_between_geo_source_and_notes() -> None:
    record = SiteRecord.model_validate(
        {
            "site_id": "x",
            "name": "X",
            "notes": "n",
            "geo_source": "osm",
            "revision": 2,
            "changelog": [entry(2, "Moved", author="Dennis")],
        }
    )
    keys = list(frontmatter(record))
    assert keys[keys.index("geo_source") :] == ["geo_source", "revision", "changelog", "notes"]
    assert frontmatter(record)["changelog"] == [
        {"revision": 2, "date": "2026-10-01", "author": "Dennis", "note": "Moved"}
    ]
    assert "base_revision" not in frontmatter(record.model_copy(update={"base_revision": 2}))


def test_map_changelog_follows_revision_in_json() -> None:
    record = SiteMapRecord.model_validate(
        {"id": "m-1", "site_id": "m", "revision": 2, "changelog": [entry(2)]}
    )
    keys = list(record.model_dump(mode="json", by_alias=True))
    assert keys[keys.index("revision") + 1] == "changelog"


def test_forked_from_parses_revision_and_old_sha() -> None:
    assert SiteRecord(site_id="x", name="X", forked_from="commons@3").forked_from_revision == 3
    assert (
        SiteRecord(site_id="x", name="X", forked_from="commons@ab12f").forked_from_revision is None
    )
    assert (
        SiteRecord(site_id="x", name="X", forked_from="commons@unknown").forked_from_revision
        is None
    )
    assert SiteRecord(site_id="x", name="X").forked_from_revision is None


def test_overlay_base_revision() -> None:
    old = SiteOverlayRecord.model_validate({"site_id": "x", "extends": "commons"})
    assert old.base_revision is None
    pinned = SiteOverlayRecord.model_validate(
        {"site_id": "x", "extends": "commons", "base_revision": 2, "notes": "n"}
    )
    assert list(overlay_frontmatter(pinned)) == ["site_id", "extends", "base_revision", "notes"]
    with pytest.raises(ValidationError):
        SiteOverlayRecord.model_validate({"site_id": "x", "extends": "commons", "base_revision": 0})
