from pathlib import Path
from typing import Any

import pytest

from divelog_server.store.files import read_json, read_markdown, write_json, write_markdown
from divelog_server.store.manifest import MediaManifest, normalise_licence
from divelog_server.store.models import SiteMapRecord, SiteRecord
from divelog_server.store.validate import (
    CommonsTree,
    MapFile,
    Problem,
    SiteFile,
    check_editorial,
    check_licences,
    check_map_ids,
    check_map_nodes,
    check_provenance,
    check_redirects,
    check_references,
    check_revisions,
    check_site_ids,
    check_visibility,
    decimals,
    errors,
    first_person,
    first_person_lines,
    load_commons_tree,
    owner_voice,
    validate_commons,
    warnings,
)
from tests.logbuilder import build_commons

SITE = "fra-commons-only"


@pytest.fixture
def commons(tmp_path: Path) -> Path:
    return build_commons(tmp_path / "commons")


def edit_site(root: Path, site_id: str = SITE, body: str | None = None, **changes: Any) -> None:
    path = root / "sites" / f"{site_id}.md"
    meta, old_body = read_markdown(path)
    for key, value in changes.items():
        if value is None:
            meta.pop(key, None)
        else:
            meta[key] = value
    write_markdown(path, meta, old_body if body is None else body)


def messages(problems: list[Problem]) -> list[str]:
    return [str(p) for p in problems]


def rule(check: Any, root: Path) -> list[str]:
    tree, _ = load_commons_tree(root)
    return messages(check(tree))


def test_clean_commons_has_no_problems(commons: Path) -> None:
    assert validate_commons(commons) == []


def test_problem_prints_as_path_and_message() -> None:
    assert str(Problem("sites/x.md", "broken")) == "sites/x.md: broken"
    assert Problem.parse("sites/x.md: a: b") == Problem("sites/x.md", "a: b")


def test_site_id_must_match_the_pattern(commons: Path) -> None:
    write_markdown(commons / "sites" / "Ressel.md", {"site_id": "Ressel", "name": "R"}, "")
    found = rule(check_site_ids, commons)
    assert any("site id 'Ressel' does not match" in m for m in found)


def test_site_file_must_be_named_after_its_id(commons: Path) -> None:
    write_markdown(commons / "sites" / "fra-a.md", {"site_id": "fra-b", "name": "B"}, "")
    assert "sites/fra-a.md: file name does not match site_id 'fra-b'" in rule(
        check_site_ids, commons
    )


def test_site_ids_are_unique(commons: Path) -> None:
    write_markdown(commons / "sites" / "fra-z.md", {"site_id": SITE, "name": "Dup"}, "")
    assert any("also used by" in m for m in rule(check_site_ids, commons))


def test_personal_map_id_is_refused(commons: Path) -> None:
    payload = read_json(commons / "maps" / "drawn" / f"{SITE}-1.json")
    write_json(commons / "maps" / "drawn" / f"{SITE}-p1.json", {**payload, "id": f"{SITE}-p1"})
    assert f"maps/drawn/{SITE}-p1.json: personal map id '{SITE}-p1' (-p<n>)" in rule(
        check_map_ids, commons
    )


def test_region_must_exist(commons: Path) -> None:
    edit_site(commons, region="fra-nowhere")
    assert f"sites/{SITE}.md: region 'fra-nowhere' does not exist" in rule(
        check_references, commons
    )


def test_drawn_and_seed_maps_must_exist(commons: Path) -> None:
    edit_site(commons, maps=["seed:missing", "drawn:missing-1"], default_map="other:x")
    found = rule(check_references, commons)
    assert f"sites/{SITE}.md: seed map 'missing' does not exist" in found
    assert f"sites/{SITE}.md: drawn map 'missing-1' does not exist" in found
    assert f"sites/{SITE}.md: unknown map reference 'other:x'" in found


def test_photo_files_must_exist(commons: Path) -> None:
    (commons / "media" / "sites" / f"{SITE}.jpg").unlink()
    found = rule(check_references, commons)
    assert f"sites/{SITE}.md: photo commons-photo-1: media/sites/{SITE}.jpg does not exist" in found


def test_photo_must_be_a_repository_file(commons: Path) -> None:
    edit_site(commons, media=[{"id": "s3", "key": "sites/x/upload.jpg"}])
    assert any("is not a file" in m for m in rule(check_references, commons))


def test_map_site_must_exist(commons: Path) -> None:
    path = commons / "maps" / "drawn" / f"{SITE}-1.json"
    write_json(path, {**read_json(path), "site_id": "fra-gone"})
    assert any("site 'fra-gone' does not exist" in m for m in rule(check_references, commons))


def test_underlay_must_resolve_in_the_commons(commons: Path) -> None:
    path = commons / "maps" / "drawn" / f"{SITE}-1.json"
    write_json(path, {**read_json(path), "underlay": {"ref": "upload:abc"}})
    assert any(
        "underlay 'upload:abc' does not resolve" in m for m in rule(check_references, commons)
    )
    write_json(path, {**read_json(path), "underlay": {"ref": "seed:fra-commons-only"}})
    assert rule(check_references, commons) == []


def test_coordinates_need_a_geo_source(commons: Path) -> None:
    edit_site(commons, geo_source=None)
    assert rule(check_provenance, commons) == [f"sites/{SITE}.md: lat/lon set without geo_source"]


def test_long_body_needs_sources(commons: Path) -> None:
    edit_site(commons, body="Neutral text. " * 40, sources=None)
    assert any("characters without sources" in m for m in rule(check_provenance, commons))


def test_manifest_licence_must_be_allowlisted(commons: Path) -> None:
    path = commons / "media" / "manifest.json"
    manifest = read_json(path)
    manifest[f"media/sites/{SITE}.jpg"]["licence"] = "All rights reserved"
    write_json(path, manifest)
    assert any("licence 'All rights reserved' not in" in m for m in rule(check_licences, commons))


def test_manifest_entry_must_be_public(commons: Path) -> None:
    path = commons / "media" / "manifest.json"
    manifest = read_json(path)
    manifest[f"media/sites/{SITE}.jpg"]["public"] = False
    write_json(path, manifest)
    assert any("not marked public: true" in m for m in rule(check_licences, commons))


def test_media_file_needs_a_manifest_entry(commons: Path) -> None:
    (commons / "media" / "sites" / "stray.jpg").write_bytes(b"x")
    assert "media/sites/stray.jpg: no entry in media/manifest.json" in rule(check_licences, commons)


def test_non_public_photo_is_refused(commons: Path) -> None:
    meta, _ = read_markdown(commons / "sites" / f"{SITE}.md")
    media = [{**meta["media"][0], "public": False}]
    edit_site(commons, media=media)
    assert f"sites/{SITE}.md: photo commons-photo-1: not public" in rule(check_licences, commons)


def test_reference_maps_may_not_enter(commons: Path) -> None:
    edit_site(commons, maps=["reference:x/map.png"])
    path = commons / "maps" / "drawn" / f"{SITE}-1.json"
    write_json(path, {**read_json(path), "underlay": {"ref": "reference:x/map.png"}})
    found = rule(check_licences, commons)
    assert f"sites/{SITE}.md: reference map 'reference:x/map.png' may not enter" in found
    assert any("is a reference map" in m for m in found)


def test_personal_fields_may_not_enter(commons: Path) -> None:
    edit_site(commons, notes="Private.", subsurface_uuid="u", reference_maps=["reference:a"])
    found = rule(check_licences, commons)
    for key in ("notes", "subsurface_uuid", "reference_maps"):
        assert f"sites/{SITE}.md: personal field '{key}' may not enter" in found


def test_overlay_fields_may_not_enter(commons: Path) -> None:
    edit_site(commons, forked_from="commons@1")
    assert f"sites/{SITE}.md: overlay or fork field 'forked_from' may not enter" in rule(
        check_licences, commons
    )


def test_first_person_summary_fails(commons: Path) -> None:
    edit_site(commons, summary="My favourite spring.")
    assert rule(check_editorial, commons) == [
        f"sites/{SITE}.md: first person in summary: My favourite spring."
    ]


def test_first_person_body_lists_each_line(commons: Path) -> None:
    edit_site(commons, body="A neutral line.\nWe dived it.\nAnother.\nI'm back.")
    assert rule(check_editorial, commons) == [
        f"sites/{SITE}.md: first person in body line 2: We dived it.",
        f"sites/{SITE}.md: first person in body line 4: I'm back.",
    ]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("I dived here", True),
        ("I've been", True),
        ("Our club", True),
        ("Let US go", True),
        ("Iron gate and an Island", False),
        ("i is lowercase", False),
        ("See https://example.org/me/us for more", False),
        ("Rebuilt after the storm", False),
    ],
)
def test_first_person_tokens(text: str, expected: bool) -> None:
    assert first_person(text) is expected


def test_first_person_lines_numbers_from_one() -> None:
    assert first_person_lines("ok\nmy line") == [(2, "my line")]


def test_changelog_mismatch_is_a_load_problem(commons: Path) -> None:
    edit_site(commons, revision=2, changelog=[{"revision": 1, "date": "2026-01-01", "note": "x"}])
    found = messages(validate_commons(commons))
    assert any("changelog starts at revision 1, the record is at 2" in m for m in found)


def test_map_revision_below_one_is_a_load_problem(commons: Path) -> None:
    path = commons / "maps" / "drawn" / f"{SITE}-1.json"
    write_json(path, {**read_json(path), "revision": 0})
    found = messages(validate_commons(commons))
    assert any(m.startswith(f"maps/drawn/{SITE}-1.json: revision") for m in found)


def test_revision_rule_on_constructed_records() -> None:
    site = SiteRecord.model_construct(site_id="fra-a", name="A", revision=0)
    drawn = SiteMapRecord.model_construct(id="fra-a-1", site_id="fra-a", revision=0)
    tree = CommonsTree(
        sites=[SiteFile("sites/fra-a.md", {"site_id"}, site)],
        maps=[MapFile("maps/drawn/fra-a-1.json", drawn)],
    )
    assert messages(check_revisions(tree)) == [
        "sites/fra-a.md: revision 0 below 1",
        "maps/drawn/fra-a-1.json: revision 0 below 1",
    ]


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("CC BY 2.0", "CC-BY-2.0"),
        ("CC BY-SA 4.0", "CC-BY-SA-4.0"),
        ("cc-by-sa-3.0", "CC-BY-SA-3.0"),
        ("CC BY-SA 2.5", "CC-BY-SA-2.5"),
        ("CC BY 2.5", "CC-BY-2.5"),
        ("CC0", "CC0-1.0"),
        ("Public Domain Mark 1.0", "PDM"),
        ("CC BY-NC 4.0", None),
        ("", None),
    ],
)
def test_normalise_licence(given: str, expected: str | None) -> None:
    assert normalise_licence(given) == expected


def test_media_manifest_reads_both_shapes() -> None:
    flat = MediaManifest({"media/sites/a.jpg": {"licence": "CC0-1.0"}})
    nested = MediaManifest({"sites": {"a": {"file": "a.jpg", "licence": "CC0-1.0"}}})
    assert set(flat.entries) == set(nested.entries) == {"media/sites/a.jpg"}
    nested.remove("media/sites/a.jpg")
    assert nested.payload == {"sites": {}}


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Andrea I is a wreck", False),
        ("The Malek II lies upright", False),
        ("When I dived it", True),
        ("I'd go back", True),
        ("I’m sure", True),
        ("Section I.", False),
    ],
)
def test_roman_numeral_after_a_name_is_not_first_person(text: str, expected: bool) -> None:
    assert first_person(text) is expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Most dives here start at the pool.", True),
        ("Listed in the log as a training site.", True),
        ("Site notes in the workbook.", True),
        ("A favourite with photographers.", True),
        ("The owner's boat leaves at nine.", True),
        ("Divers enter from the quay.", False),
    ],
)
def test_owner_voice_phrases(text: str, expected: bool) -> None:
    assert owner_voice(text) is expected


def test_warning_prints_its_level() -> None:
    problem = Problem("sites/x.md", "owner voice", "warning")
    assert str(problem) == "sites/x.md: warning: owner voice"
    assert errors([problem]) == [] and warnings([problem]) == [problem]


def test_owner_voice_body_is_a_warning(commons: Path) -> None:
    edit_site(commons, body="A neutral line.\nMost dives here start at the pool.\nWe dive here.")
    tree, _ = load_commons_tree(commons)
    assert check_editorial(tree) == [
        Problem(f"sites/{SITE}.md", "first person in body line 3: We dive here."),
        Problem(
            f"sites/{SITE}.md",
            "owner voice in body line 2: Most dives here start at the pool.",
            "warning",
        ),
    ]


def test_drawn_map_texts_are_linted(commons: Path) -> None:
    path = commons / "maps" / "drawn" / f"{SITE}-1.json"
    payload = read_json(path)
    payload["title"] = "My line"
    payload["notes"] = "A favourite traverse."
    payload["nodes"][1]["label"] = "Where we turned"
    payload["lines"] = [{"id": "l1", "label": "Our path", "points": []}]
    payload["areas"] = [{"id": "a1", "label": "Sand", "points": []}]
    write_json(path, payload)
    where = f"maps/drawn/{SITE}-1.json"
    assert rule(check_editorial, commons) == [
        f"{where}: first person in title: My line",
        f"{where}: warning: owner voice in notes: A favourite traverse.",
        f"{where}: first person in node 'b' label: Where we turned",
        f"{where}: first person in line 'l1' label: Our path",
    ]


def test_region_body_is_linted(commons: Path) -> None:
    write_markdown(
        commons / "regions" / "fra-causses.md",
        {"region": "fra-causses", "name": "Les Causses"},
        "Our favourite plateau.\nDives here are cold.",
    )
    assert rule(check_editorial, commons) == [
        "regions/fra-causses.md: first person in body line 1: Our favourite plateau.",
        "regions/fra-causses.md: warning: owner voice in body line 2: Dives here are cold.",
    ]


def test_region_only_site_with_a_precise_point_warns(commons: Path) -> None:
    edit_site(commons, location_visibility="region_only", lat=44.6123, lon=1.7)
    tree, _ = load_commons_tree(commons)
    assert check_visibility(tree) == [
        Problem(
            f"sites/{SITE}.md",
            "region_only site with a precise point: round lat/lon to two decimals",
            "warning",
        )
    ]
    edit_site(commons, lat=44.61, lon=1.7)
    assert rule(check_visibility, commons) == []


def test_exact_site_may_be_precise(commons: Path) -> None:
    edit_site(commons, lat=44.612345)
    assert rule(check_visibility, commons) == []


@pytest.mark.parametrize(("value", "expected"), [(44.6, 1), (44.61, 2), (1.0, 1), (5, 0)])
def test_decimals(value: float, expected: int) -> None:
    assert decimals(value) == expected


def test_redirects_must_point_at_existing_sites(commons: Path) -> None:
    (commons / "redirects.yaml").write_text(
        f"fra-old: {SITE}\nfra-older: fra-old\nfra-gone: fra-nowhere\n{SITE}: fra-old\n",
        encoding="utf-8",
    )
    assert rule(check_redirects, commons) == [
        "redirects.yaml: fra-commons-only: still an existing site, not a redirect",
        "redirects.yaml: fra-commons-only: chains through fra-old; point at the end",
        "redirects.yaml: fra-gone: target site 'fra-nowhere' does not exist",
        "redirects.yaml: fra-old: chains through fra-commons-only; point at the end",
        "redirects.yaml: fra-older: chains through fra-old; point at the end",
    ]


def test_redirects_must_be_a_mapping(commons: Path) -> None:
    (commons / "redirects.yaml").write_text("- a\n- b\n", encoding="utf-8")
    assert "redirects.yaml: not a mapping of old id: new id" in messages(validate_commons(commons))


def test_retired_ids_are_not_reused_and_renames_resolve(commons: Path) -> None:
    path = commons / "maps" / "drawn" / f"{SITE}-1.json"
    payload = read_json(path)
    renamed = {"old-b": "b", "x": "y"}
    write_json(path, {**payload, "retired_nodes": ["c"], "renamed_nodes": renamed})
    assert rule(check_map_nodes, commons) == [
        f"maps/drawn/{SITE}-1.json: retired node id 'c' is used again",
        f"maps/drawn/{SITE}-1.json: renamed node 'x' -> 'y': 'y' is not a node",
    ]


def test_rename_chains_resolve_to_the_last_name(commons: Path) -> None:
    path = commons / "maps" / "drawn" / f"{SITE}-1.json"
    write_json(path, {**read_json(path), "renamed_nodes": {"old-b": "mid-b", "mid-b": "b"}})
    assert rule(check_map_nodes, commons) == []
