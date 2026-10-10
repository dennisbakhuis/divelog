import subprocess
from datetime import date
from pathlib import Path

import pytest
import yaml

from divelog_server.store import split as split_module
from divelog_server.store.files import read_json, read_markdown, write_json, write_markdown
from divelog_server.store.models import SITE_KEY_ORDER, SiteMapRecord
from divelog_server.store.sources import CommonsSource
from divelog_server.store.split import (
    SplitError,
    SplitOptions,
    SplitResult,
    body_sentences,
    map_rights,
    plan_split,
    run_split,
    summary_from_body,
)
from divelog_server.store.store import Store
from divelog_server.store.validate import Problem, validate_commons, validate_log
from tests.logbuilder import CABOUY_BODY, LONG_BODY, RESSEL_BODY, build_log, drawn_map

TODAY = date(2026, 10, 10)


@pytest.fixture
def log(tmp_path: Path) -> Path:
    return build_log(tmp_path / "log")


@pytest.fixture
def to(tmp_path: Path) -> Path:
    return tmp_path / "divelog-sites"


def options(log: Path, to: Path, **extra: object) -> SplitOptions:
    return SplitOptions(log_root=log, to=to, author="Tester", today=TODAY, **extra)  # type: ignore[arg-type]


@pytest.fixture
def result(log: Path, to: Path) -> SplitResult:
    done = run_split(options(log, to))
    assert done.problems == []
    return done


def meta(path: Path) -> dict[str, object]:
    return read_markdown(path)[0]


def body(path: Path) -> str:
    return read_markdown(path)[1]


def merged(log: Path, to: Path) -> Store:
    store = Store(log, commons=CommonsSource(to))
    store.load()
    return store


def test_sites_that_fail_commons_rules_stay_personal(result: SplitResult, log: Path) -> None:
    kept = {s.site_id: s.reason for s in result.plan.kept}
    assert kept == {
        "secret": "id does not match ^[a-z]{3}-[a-z0-9-]+$",
        "fra-nogeo": "coordinates without geo_source",
    }
    assert "extends" not in meta(log / "sites" / "secret.md")


def test_commons_holds_exactly_the_exported_sites(result: SplitResult, to: Path) -> None:
    assert sorted(p.stem for p in (to / "sites").glob("*.md")) == [
        "fra-cabouy",
        "fra-longbody",
        "fra-marchepied",
        "fra-ressel",
        "nld-clipper-anna",
        "nld-zeelandbrug",
    ]


def test_core_starts_at_revision_one_with_import_entry(result: SplitResult, to: Path) -> None:
    core = meta(to / "sites" / "fra-ressel.md")
    assert core["revision"] == 1
    assert core["changelog"] == [
        {
            "revision": 1,
            "date": "2026-10-10",
            "author": "Tester",
            "note": "Imported from the personal log",
        }
    ]


def test_core_keys_follow_site_key_order(result: SplitResult, to: Path) -> None:
    keys = list(meta(to / "sites" / "nld-zeelandbrug.md"))
    assert keys == sorted(keys, key=SITE_KEY_ORDER.index)


def test_core_has_no_personal_fields(result: SplitResult, to: Path) -> None:
    for path in (to / "sites").glob("*.md"):
        assert not {"notes", "prices", "reference_maps", "subsurface_uuid", "osm_way"} & set(
            meta(path)
        )


def test_first_person_body_goes_to_the_overlay(result: SplitResult, log: Path, to: Path) -> None:
    assert body(to / "sites" / "fra-ressel.md") == ""
    assert body(log / "sites" / "fra-ressel.md").strip() == RESSEL_BODY
    overlay = meta(log / "sites" / "fra-ressel.md")
    assert overlay["extends"] == "commons"
    assert overlay["base_revision"] == 1
    assert overlay["notes"] == "Owner note."
    assert overlay["subsurface_uuid"] == "abc-123"


def test_first_person_summary_is_overridden_and_taken_from_body(
    result: SplitResult, log: Path, to: Path
) -> None:
    assert meta(log / "sites" / "fra-cabouy.md")["summary_override"] == (
        "The cave where I learned sidemount."
    )
    assert meta(to / "sites" / "fra-cabouy.md")["summary"] == (
        "The Gouffre de Cabouy is a large sinkhole near Pinsac."
    )
    assert body(log / "sites" / "fra-cabouy.md").strip() == CABOUY_BODY
    decision = next(s for s in result.plan.sites if s.site_id == "fra-cabouy")
    assert decision.summary == "from body"


def test_first_person_summary_without_body_gets_a_generated_one(
    result: SplitResult, to: Path
) -> None:
    assert meta(to / "sites" / "fra-marchepied.md")["summary"] == "Cave in Marcilhac-sur-Célé, Lot"
    decision = next(s for s in result.plan.sites if s.site_id == "fra-marchepied")
    assert decision.summary == "generated"


def test_clean_body_goes_to_the_commons(result: SplitResult, log: Path, to: Path) -> None:
    assert body(to / "sites" / "nld-zeelandbrug.md").startswith("Diving under the pillars")
    assert body(log / "sites" / "nld-zeelandbrug.md") == ""


def test_long_body_without_sources_stays_personal(result: SplitResult, log: Path, to: Path) -> None:
    assert body(to / "sites" / "fra-longbody.md") == ""
    assert body(log / "sites" / "fra-longbody.md").strip() == LONG_BODY.strip()


def test_empty_overlay_is_removed_and_hidden_site_exported(
    result: SplitResult, log: Path, to: Path
) -> None:
    assert not (log / "sites" / "nld-clipper-anna.md").exists()
    assert meta(to / "sites" / "nld-clipper-anna.md")["location_visibility"] == "region_only"


def test_unknown_keys_stay_in_the_overlay(result: SplitResult, log: Path) -> None:
    assert meta(log / "sites" / "nld-zeelandbrug.md")["osm_way"] == "way/1"


def test_stick_map_on_reference_underlay_is_renamed_personal(
    result: SplitResult, log: Path, to: Path
) -> None:
    assert result.plan.renames == {"fra-ressel-1": "fra-ressel-p1", "fra-cabouy-2": "fra-cabouy-p1"}
    assert not (log / "maps" / "drawn" / "fra-ressel-1.json").exists()
    assert read_json(log / "maps" / "drawn" / "fra-ressel-p1.json")["id"] == "fra-ressel-p1"
    assert not (to / "maps" / "drawn" / "fra-ressel-1.json").exists()


def test_maps_without_third_party_underlay_go_to_the_commons(
    result: SplitResult, log: Path, to: Path
) -> None:
    for map_id in ("fra-ressel-2", "fra-cabouy-1", "nld-zeelandbrug-1", "nld-zeelandbrug-2"):
        assert (to / "maps" / "drawn" / f"{map_id}.json").exists()
        assert not (log / "maps" / "drawn" / f"{map_id}.json").exists()


def test_unresolvable_underlay_is_dropped_from_a_commons_site_map(
    result: SplitResult, to: Path
) -> None:
    assert "underlay" not in read_json(to / "maps" / "drawn" / "nld-zeelandbrug-2.json")
    decision = next(m for m in result.plan.maps if m.map_id == "nld-zeelandbrug-2")
    assert "dropped" in decision.note


def test_commons_map_keeps_revision_with_one_import_entry(result: SplitResult, to: Path) -> None:
    payload = read_json(to / "maps" / "drawn" / "nld-zeelandbrug-1.json")
    assert payload["revision"] == 3
    assert [e["revision"] for e in payload["changelog"]] == [3]
    assert payload["changelog"][0]["note"] == "Imported from the personal log"
    assert SiteMapRecord.model_validate(payload).revision == 3


def test_overlay_points_at_renamed_default_map(result: SplitResult, log: Path, to: Path) -> None:
    assert meta(log / "sites" / "fra-ressel.md")["default_map"] == "drawn:fra-ressel-p1"
    assert "default_map" not in meta(to / "sites" / "fra-ressel.md")
    assert meta(log / "sites" / "nld-zeelandbrug.md")["maps"] == ["reference:zeelandbrug/map.png"]
    assert meta(to / "sites" / "nld-zeelandbrug.md")["maps"] == ["seed:nld-zeelandbrug"]


def test_dive_annotation_follows_the_rename(result: SplitResult, log: Path) -> None:
    text = (log / "dives" / "00002.md").read_text()
    assert "map_id: fra-ressel-p1" in text
    assert "fra-ressel-1" not in text
    assert meta(log / "dives" / "00001.md")["map_annotation"] == {"map_id": "nld-zeelandbrug-1"}
    assert result.plan.annotation_renames == {2: "fra-ressel-p1"}


def test_renames_file_in_the_log(result: SplitResult, log: Path) -> None:
    assert read_json(log / "maps" / "renames.json") == {
        "fra-cabouy-2": "fra-cabouy-p1",
        "fra-ressel-1": "fra-ressel-p1",
    }


def test_regions_and_seed_maps_move(result: SplitResult, log: Path, to: Path) -> None:
    assert sorted(p.stem for p in (to / "regions").glob("*.md")) == ["fra-lot", "nld-zeeland"]
    assert not list((log / "regions").glob("*.md"))
    assert (to / "maps" / "seed" / "nld-zeelandbrug.svg").exists()
    assert not (log / "maps" / "seed" / "nld-zeelandbrug.json").exists()
    assert (log / "maps" / "reference" / "index.json").exists()


def test_cc_photo_moves_to_the_commons(result: SplitResult, log: Path, to: Path) -> None:
    assert (to / "media" / "sites" / "nld-zeelandbrug.jpg").read_bytes() == b"cc photo"
    assert not (log / "media" / "sites" / "nld-zeelandbrug.jpg").exists()
    entry = read_json(to / "media" / "manifest.json")["media/sites/nld-zeelandbrug.jpg"]
    assert entry["licence"] == "CC-BY-2.0"
    assert entry["public"] is True
    core_media = meta(to / "sites" / "nld-zeelandbrug.md")["media"]
    assert core_media == [
        {"id": "zb-cc", "key": "repo:media/sites/nld-zeelandbrug.jpg", "credit": "A. Author"}
    ]
    assert "nld-zeelandbrug" not in read_json(log / "media" / "manifest.json")["sites"]


def test_merged_view_points_the_photo_at_the_commons(
    result: SplitResult, log: Path, to: Path
) -> None:
    site = merged(log, to).sites["nld-zeelandbrug"]
    keys = {m.id: m.key for m in site.media}
    assert keys["zb-cc"] == "commons:media/sites/nld-zeelandbrug.jpg"
    assert keys["zb-private"] == "repo:media/sites/nld-zeelandbrug-private.jpg"


def test_media_store_key_with_a_log_copy_moves_to_the_commons(log: Path, to: Path) -> None:
    site_path = log / "sites" / "nld-zeelandbrug.md"
    site_meta, site_body = read_markdown(site_path)
    site_meta["media"] = [
        *site_meta["media"],
        {"id": "zb-store", "key": "sites/nld-zeelandbrug-store.jpg", "public": True},
        {"id": "zb-orphan", "key": "sites/nld-zeelandbrug-orphan.jpg", "public": True},
    ]
    write_markdown(site_path, site_meta, site_body)
    (log / "media" / "sites" / "nld-zeelandbrug-store.jpg").write_bytes(b"store photo")
    manifest = read_json(log / "media" / "manifest.json")
    manifest["sites"]["nld-zeelandbrug-store"] = {
        "file": "nld-zeelandbrug-store.jpg",
        "source": "Wikimedia Commons",
        "licence": "CC BY-SA 2.5",
        "public": True,
    }
    write_json(log / "media" / "manifest.json", manifest)

    done = run_split(options(log, to))

    assert done.problems == []
    assert (to / "media" / "sites" / "nld-zeelandbrug-store.jpg").read_bytes() == b"store photo"
    assert not (log / "media" / "sites" / "nld-zeelandbrug-store.jpg").exists()
    entry = read_json(to / "media" / "manifest.json")["media/sites/nld-zeelandbrug-store.jpg"]
    assert entry["licence"] == "CC-BY-SA-2.5"
    assert "nld-zeelandbrug-store" not in read_json(log / "media" / "manifest.json")["sites"]
    core_keys = [m["key"] for m in meta(to / "sites" / "nld-zeelandbrug.md")["media"]]  # type: ignore[index]
    assert "repo:media/sites/nld-zeelandbrug-store.jpg" in core_keys
    overlay_ids = [m["id"] for m in meta(log / "sites" / "nld-zeelandbrug.md")["media"]]  # type: ignore[index]
    assert overlay_ids == ["zb-private", "zb-upload", "zb-orphan"]
    keys = {m.id: m.key for m in merged(log, to).sites["nld-zeelandbrug"].media}
    assert keys["zb-store"] == "commons:media/sites/nld-zeelandbrug-store.jpg"
    assert keys["zb-orphan"] == "sites/nld-zeelandbrug-orphan.jpg"
    assert keys["zb-upload"] == "sites/nld-zeelandbrug/own.jpg"


def test_non_public_photo_stays_personal(result: SplitResult, log: Path, to: Path) -> None:
    assert (log / "media" / "sites" / "nld-zeelandbrug-private.jpg").exists()
    assert not (to / "media" / "sites" / "nld-zeelandbrug-private.jpg").exists()
    ids = [m["id"] for m in meta(log / "sites" / "nld-zeelandbrug.md")["media"]]  # type: ignore[index]
    assert ids == ["zb-private", "zb-upload"]


def test_log_manifest_names_the_commons(result: SplitResult, log: Path) -> None:
    manifest = yaml.safe_load((log / "divelog.yaml").read_text())
    assert manifest == {
        "format": 1,
        "kind": "log",
        "sources": [
            {
                "kind": "commons",
                "name": "divelog-sites",
                "path": "../divelog-sites",
                "ref": result.head,
            }
        ],
    }
    assert result.head


def test_commons_manifest_and_fixed_files(result: SplitResult, to: Path) -> None:
    manifest = yaml.safe_load((to / "divelog.yaml").read_text())
    assert manifest["format"] == 1 and manifest["kind"] == "sites"
    for name in ("LICENSE.md", "README.md", "CONTRIBUTING.md", "redirects.yaml"):
        assert (to / name).is_file()
    assert "ODbL" in (to / "LICENSE.md").read_text()
    assert "CC BY-SA 4.0" in (to / "LICENSE.md").read_text()
    assert (
        "DCO" in (to / "CONTRIBUTING.md").read_text()
        or "Developer Certificate" in (to / "CONTRIBUTING.md").read_text()
    )
    assert yaml.safe_load((to / "redirects.yaml").read_text()) == {}
    workflow = (to / ".github" / "workflows" / "validate.yml").read_text()
    assert "uvx --from bakhuis-backend divelog validate --kind sites ." in workflow


def test_commons_is_one_git_commit(result: SplitResult, to: Path) -> None:
    log_lines = subprocess.run(
        ["git", "-C", str(to), "log", "--format=%an|%s"], capture_output=True, text=True, check=True
    ).stdout.splitlines()
    assert log_lines == ["Tester|Initial import from log"]


def test_report_tables(result: SplitResult, to: Path) -> None:
    report = (to / "IMPORT-REPORT.md").read_text()
    assert "| fra-ressel | overlay (first person in body) | kept |" in report
    assert "| fra-ressel-1 | fra-ressel-p1 |" in report
    assert "| secret | id does not match" in report
    assert "`fra-marchepied` (generated): Cave in Marcilhac-sur-Célé, Lot" in report
    assert "Dive annotations updated: 2." in report


def test_report_contains_no_personal_text(result: SplitResult, to: Path) -> None:
    report = (to / "IMPORT-REPORT.md").read_text()
    for text in ("I dived it", "learned sidemount", "My favourite", "Owner note"):
        assert text not in report


def test_post_split_store_matches_the_log(result: SplitResult, log: Path, to: Path) -> None:
    store = merged(log, to)
    assert len(store.sites) == result.plan.site_count == 8
    assert store.site_origin["fra-ressel"] == "commons"
    assert store.site_origin["secret"] == "log"
    assert all(d.site in store.sites for d in store.dives.values())
    for dive in store.dives.values():
        if dive.map_annotation:
            assert dive.map_annotation["map_id"] in store.maps
    assert store.map_origin["fra-ressel-p1"] == "log"
    assert store.map_origin["fra-ressel-2"] == "commons"
    assert store.sites["fra-cabouy"].summary == "The cave where I learned sidemount."
    assert store.sites["fra-ressel"].body_md.strip() == RESSEL_BODY


def test_both_repositories_validate(result: SplitResult, log: Path, to: Path) -> None:
    assert validate_commons(to) == []
    assert validate_log(log, to) == []


def test_personal_sites_keep_their_maps(result: SplitResult, log: Path) -> None:
    assert read_json(log / "maps" / "drawn" / "secret-1.json")["id"] == "secret-1"
    assert merged(log, result.plan.options.to).sites["secret"].name == "Secret Spring"


def test_second_split_is_refused(result: SplitResult, log: Path, tmp_path: Path) -> None:
    with pytest.raises(SplitError, match="already has a commons source"):
        run_split(options(log, tmp_path / "again"))


def test_non_empty_target_is_refused(log: Path, to: Path) -> None:
    to.mkdir()
    (to / "x").write_text("x")
    with pytest.raises(SplitError, match="exists and is not empty"):
        run_split(options(log, to))


def test_dry_run_writes_nothing(log: Path, to: Path) -> None:
    before = {p: p.read_bytes() for p in log.rglob("*") if p.is_file()}
    done = run_split(options(log, to), dry_run=True)
    assert done.stage == "dry-run" and done.problems == []
    assert not to.exists()
    assert {p: p.read_bytes() for p in log.rglob("*") if p.is_file()} == before


def test_no_git_leaves_no_ref(log: Path, to: Path) -> None:
    done = run_split(options(log, to, git=False))
    assert done.problems == [] and done.head is None
    assert not (to / ".git").exists()
    source = yaml.safe_load((log / "divelog.yaml").read_text())["sources"][0]
    assert "ref" not in source


def test_stick_personal_policy(log: Path, to: Path) -> None:
    done = run_split(options(log, to, map_rights="stick-personal"))
    assert done.problems == []
    assert not (to / "maps" / "drawn" / "fra-ressel-2.json").exists()
    assert (to / "maps" / "drawn" / "nld-zeelandbrug-1.json").exists()
    assert done.plan.renames["fra-ressel-2"] == "fra-ressel-p2"


def test_keep_personal_override(log: Path, to: Path) -> None:
    done = run_split(options(log, to, keep_personal=frozenset({"nld-zeelandbrug-1"})))
    assert done.problems == []
    assert done.plan.renames["nld-zeelandbrug-1"] == "nld-zeelandbrug-p1"
    assert meta(log / "sites" / "nld-zeelandbrug.md")["default_map"] == "drawn:nld-zeelandbrug-p1"
    assert meta(log / "dives" / "00001.md")["map_annotation"] == {"map_id": "nld-zeelandbrug-p1"}


def test_commons_problems_leave_the_log_untouched(
    log: Path, to: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(split_module, "validate_commons", lambda root: [Problem("x", "broken")])
    before = {p: p.read_bytes() for p in log.rglob("*") if p.is_file()}
    done = run_split(options(log, to))
    assert done.stage == "commons" and done.problems == [Problem("x", "broken")]
    assert {p: p.read_bytes() for p in log.rglob("*") if p.is_file()} == before


@pytest.mark.parametrize(
    ("kind", "underlay", "policy", "personal"),
    [
        ("stickmap", None, "underlay", False),
        ("stickmap", "osm", "underlay", False),
        ("stickmap", "locator", "underlay", False),
        ("stickmap", "seed:x", "underlay", False),
        ("stickmap", "upload:scan", "underlay", True),
        ("stickmap", "reference:a.png", "underlay", True),
        ("sitemap", "upload:scan", "underlay", False),
        ("sitemap", "reference:a.png", "underlay", True),
        ("stickmap", None, "stick-personal", True),
        ("sitemap", None, "stick-personal", False),
        ("sitemap", None, "all-personal", True),
    ],
)
def test_map_rights_rule(kind: str, underlay: str | None, policy: str, personal: bool) -> None:
    extra = {"underlay": {"ref": underlay}} if underlay else {}
    record = SiteMapRecord.model_validate(drawn_map("fra-a-1", "fra-a", kind, **extra))
    assert map_rights(record, policy)[0] is personal  # type: ignore[arg-type]


def test_body_sentences_skip_headings_and_lists() -> None:
    text = "# Title\n\n- a list item here\n\nFirst [linked](http://x) sentence here. Second one."
    assert body_sentences(text) == ["First linked sentence here.", "Second one."]


def test_summary_from_body_skips_first_person_and_short_sentences() -> None:
    text = "Short one. I loved this cave a lot. The cave has three sumps and a dry gallery."
    assert summary_from_body(text) == "The cave has three sumps and a dry gallery."
    assert summary_from_body("We went there together with friends.") is None


def test_plan_counts_before_writing(log: Path, to: Path) -> None:
    plan = plan_split(options(log, to))
    assert plan.site_count == 8
    assert plan.dives_resolved == {1, 2, 3, 4}
    assert plan.annotations_resolved == {1, 2, 4}
    assert not to.exists()
