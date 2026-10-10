"""The commons CI as a pull request sees it: one bad change per test against a committed base."""

import subprocess
from pathlib import Path
from typing import Any

import pytest

from divelog_server.store.files import read_json, read_markdown, write_json, write_markdown
from divelog_server.store.gitfiles import GitFilesError, GitTree
from divelog_server.store.validate import Problem, errors, validate_commons, warnings
from tests.logbuilder import build_commons

SITE = "fra-commons-only"
SECOND = "fra-second"
MAP = f"maps/drawn/{SITE}-1.json"
SITE_PATH = f"sites/{SITE}.md"
REAL_COMMONS = Path("/Users/dennis/repos/divelog-sites")


def git(root: Path, *args: str) -> str:
    done = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "-c",
            "user.name=Tester",
            "-c",
            "user.email=tester@example.org",
            "-c",
            "commit.gpgsign=false",
            *args,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout


def edit_site(root: Path, site_id: str = SITE, body: str | None = None, **changes: Any) -> None:
    path = root / "sites" / f"{site_id}.md"
    meta, old_body = read_markdown(path)
    meta.update(changes)
    write_markdown(path, meta, old_body if body is None else body)


def edit_map(root: Path, **changes: Any) -> None:
    path = root / MAP
    write_json(path, {**read_json(path), **changes})


def entry(revision: int, note: str = "Edit", day: str = "2026-10-10") -> dict[str, Any]:
    return {"revision": revision, "date": day, "author": "Tester", "note": note}


def bump_site(root: Path, body: str | None = None, **changes: Any) -> None:
    """A correct site change: revision 2 with a changelog entry, plus ``changes``."""
    edit_site(root, body=body, revision=2, changelog=[entry(2)], **changes)


def bump_map(root: Path, **changes: Any) -> None:
    """A correct map change: revision 3 on top of the fixture's 2, plus ``changes``."""
    edit_map(root, revision=3, changelog=[entry(3)], **changes)


def found(root: Path) -> list[str]:
    return [str(p) for p in errors(validate_commons(root, base="HEAD"))]


@pytest.fixture
def commons(tmp_path: Path) -> Path:
    """The fixture commons plus a second plain site, committed as the base of every PR."""
    root = build_commons(tmp_path / "commons")
    write_markdown(
        root / "sites" / f"{SECOND}.md",
        {"site_id": SECOND, "name": "Second", "region": "fra-causses", "revision": 1},
        "A second spring downstream.",
    )
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "Base")
    return root


def test_unchanged_commons_passes(commons: Path) -> None:
    assert validate_commons(commons, base="HEAD") == []


def test_good_pr_bump_entry_and_retired_node_passes(commons: Path) -> None:
    payload = read_json(commons / MAP)
    bump_map(
        commons,
        nodes=[n for n in payload["nodes"] if n["id"] != "c"],
        edges=[e for e in payload["edges"] if e["to"] != "c"],
        retired_nodes=["c"],
    )
    bump_site(commons, summary="A spring in the Causses, reached through a short sump.")
    assert validate_commons(commons, base="HEAD") == []


def test_first_person_body(commons: Path) -> None:
    bump_site(commons, body="We dived it twice.")
    assert found(commons) == [f"{SITE_PATH}: first person in body line 1: We dived it twice."]


def test_changed_site_without_bump(commons: Path) -> None:
    edit_site(commons, summary="A spring with a short sump.")
    assert found(commons) == [f"{SITE_PATH}: changed without a revision bump (still 1)"]


def test_body_change_needs_a_bump_too(commons: Path) -> None:
    edit_site(commons, body="About the spring: a long sump.")
    assert found(commons) == [f"{SITE_PATH}: changed without a revision bump (still 1)"]


def test_bump_without_changelog_entry(commons: Path) -> None:
    edit_site(commons, summary="A spring with a short sump.", revision=2)
    assert found(commons) == [f"{SITE_PATH}: revision 2 without a changelog entry at 2"]


def test_bump_by_more_than_one(commons: Path) -> None:
    edit_site(commons, summary="Changed.", revision=3, changelog=[entry(3)])
    assert found(commons) == [f"{SITE_PATH}: revision went from 1 to 3; bump by exactly 1"]


def test_changelog_entry_needs_a_note(commons: Path) -> None:
    edit_site(commons, summary="Changed.", revision=2, changelog=[entry(2, note=" ")])
    assert found(commons) == [f"{SITE_PATH}: changelog entry at revision 2 has no note"]


def test_rewritten_history(commons: Path) -> None:
    edit_site(commons, revision=2, changelog=[entry(2, "Second"), entry(1, "First")])
    git(commons, "commit", "-qam", "Two revisions")
    edit_site(
        commons,
        summary="Changed.",
        revision=3,
        changelog=[entry(3, "Third"), entry(2, "Second"), entry(1, "Rewritten")],
    )
    assert found(commons) == [f"{SITE_PATH}: changelog history rewritten: existing entries changed"]


def test_new_entry_dated_before_the_base(commons: Path) -> None:
    edit_site(commons, revision=2, changelog=[entry(2, day="2026-10-01")])
    git(commons, "commit", "-qam", "Dated")
    edit_site(
        commons,
        summary="Changed.",
        revision=3,
        changelog=[entry(3, day="2026-09-01"), entry(2, day="2026-10-01")],
    )
    assert found(commons) == [
        f"{SITE_PATH}: changelog entry at revision 3 is dated before 2026-10-01"
    ]


def test_revision_may_not_go_back(commons: Path) -> None:
    edit_map(commons, revision=1, changelog=[])
    assert found(commons) == [f"{MAP}: revision went back from 2 to 1"]


def test_deleted_site_without_redirect(commons: Path) -> None:
    (commons / "sites" / f"{SECOND}.md").unlink()
    assert found(commons) == [
        f"sites/{SECOND}.md: site '{SECOND}' deleted without a redirects.yaml entry"
    ]


def test_deleted_site_with_redirect_passes(commons: Path) -> None:
    (commons / "sites" / f"{SECOND}.md").unlink()
    (commons / "redirects.yaml").write_text(f"{SECOND}: {SITE}\n", encoding="utf-8")
    assert found(commons) == []


def test_renamed_site_needs_a_redirect(commons: Path) -> None:
    source = commons / "sites" / f"{SECOND}.md"
    meta, body = read_markdown(source)
    source.unlink()
    write_markdown(
        commons / "sites" / "fra-second-spring.md", {**meta, "site_id": "fra-second-spring"}, body
    )
    assert found(commons) == [
        f"sites/{SECOND}.md: site '{SECOND}' deleted without a redirects.yaml entry"
    ]
    (commons / "redirects.yaml").write_text(f"{SECOND}: fra-second-spring\n", encoding="utf-8")
    assert found(commons) == []


def test_map_node_removed_without_retired_nodes(commons: Path) -> None:
    payload = read_json(commons / MAP)
    bump_map(
        commons,
        nodes=[n for n in payload["nodes"] if n["id"] != "c"],
        edges=[e for e in payload["edges"] if e["to"] != "c"],
    )
    assert found(commons) == [f"{MAP}: node 'c' removed without a retired_nodes entry"]


def test_node_renamed_without_renamed_nodes(commons: Path) -> None:
    payload = read_json(commons / MAP)
    nodes = [{**n, "id": "c2"} if n["id"] == "c" else n for n in payload["nodes"]]
    edges = [{**e, "to": "c2"} if e["to"] == "c" else e for e in payload["edges"]]
    bump_map(commons, nodes=nodes, edges=edges)
    assert found(commons) == [f"{MAP}: node 'c' renamed to 'c2' without a renamed_nodes entry"]
    bump_map(commons, nodes=nodes, edges=edges, renamed_nodes={"old-b": "b", "c": "c2"})
    assert found(commons) == []


def test_map_geometry_changed_without_bump(commons: Path) -> None:
    payload = read_json(commons / MAP)
    nodes = [{**n, "x": 85} if n["id"] == "c" else n for n in payload["nodes"]]
    edit_map(commons, nodes=nodes)
    assert found(commons) == [f"{MAP}: changed without a revision bump (still 2)"]


def test_map_title_change_needs_no_bump(commons: Path) -> None:
    edit_map(commons, title="Commons line, upstream part", notes="Surveyed in 2025.")
    assert found(commons) == []


def test_reused_retired_node_id(commons: Path) -> None:
    edit_map(commons, retired_nodes=["d"])
    git(commons, "commit", "-qam", "Retire d")
    payload = read_json(commons / MAP)
    bump_map(commons, nodes=[*payload["nodes"], {"id": "d", "x": 120, "y": 10}])
    assert found(commons) == [f"{MAP}: retired node id 'd' is used again"]


def test_retired_node_may_not_be_dropped(commons: Path) -> None:
    edit_map(commons, retired_nodes=["d"])
    git(commons, "commit", "-qam", "Retire d")
    edit_map(commons, retired_nodes=[])
    assert found(commons) == [f"{MAP}: retired node 'd' dropped from retired_nodes"]


def test_personal_map_id(commons: Path) -> None:
    payload = read_json(commons / MAP)
    write_json(commons / f"maps/drawn/{SITE}-p1.json", {**payload, "id": f"{SITE}-p1"})
    assert found(commons) == [f"maps/drawn/{SITE}-p1.json: personal map id '{SITE}-p1' (-p<n>)"]


def test_reference_map_ref(commons: Path) -> None:
    bump_site(commons, maps=["seed:fra-commons-only", "reference:survey/plan.png"])
    assert found(commons) == [
        f"{SITE_PATH}: reference map 'reference:survey/plan.png' may not enter"
    ]


def test_non_allowlisted_licence(commons: Path) -> None:
    path = commons / "media" / "manifest.json"
    manifest = read_json(path)
    manifest[f"media/sites/{SITE}.jpg"]["licence"] = "All rights reserved"
    write_json(path, manifest)
    problems = found(commons)
    assert len(problems) == 1
    assert problems[0].startswith(
        f"media/manifest.json: media/sites/{SITE}.jpg: licence 'All rights reserved' not in"
    )


def test_long_body_without_sources(commons: Path) -> None:
    body = "The spring rises in a limestone basin below the cliff. " * 9
    bump_site(commons, body=body, sources=[])
    assert found(commons) == [
        f"{SITE_PATH}: body of {len(body.strip())} characters without sources"
    ]


def test_dangling_region(commons: Path) -> None:
    (commons / "regions" / "fra-causses.md").unlink()
    assert found(commons) == [
        f"{SITE_PATH}: region 'fra-causses' does not exist",
        f"sites/{SECOND}.md: region 'fra-causses' does not exist",
    ]


def test_removed_manifest_entry_still_referenced(commons: Path) -> None:
    write_json(commons / "media" / "manifest.json", {})
    assert found(commons) == [
        f"media/sites/{SITE}.jpg: no entry in media/manifest.json",
        f"{SITE_PATH}: photo commons-photo-1: no manifest entry",
    ]


def test_owner_voice_is_a_warning_only(commons: Path) -> None:
    bump_site(commons, body="Most dives here start at the pool.")
    problems = validate_commons(commons, base="HEAD")
    assert errors(problems) == []
    assert warnings(problems) == [
        Problem(
            SITE_PATH, "owner voice in body line 1: Most dives here start at the pool.", "warning"
        )
    ]


def test_unknown_base_is_reported(commons: Path) -> None:
    assert found(commons) == []
    problems = validate_commons(commons, base="no-such-ref")
    assert problems == [Problem(".", "base 'no-such-ref': unknown revision 'no-such-ref'")]


def test_base_outside_git_is_reported(tmp_path: Path) -> None:
    root = build_commons(tmp_path / "plain")
    problems = validate_commons(root, base="HEAD")
    assert len(problems) == 1 and problems[0].path == "."


def test_git_tree_reads_a_subdirectory(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    build_commons(repo / "commons")
    git(repo, "init", "-q")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "Base")
    tree = GitTree(repo / "commons", "HEAD")
    assert SITE_PATH in tree.paths()
    blobs = tree.read([SITE_PATH, "sites/missing.md"])
    assert list(blobs) == [SITE_PATH]
    assert blobs[SITE_PATH].startswith(b"---\nsite_id: fra-commons-only")
    with pytest.raises(GitFilesError):
        GitTree(repo / "commons", "nope")


@pytest.mark.skipif(not (REAL_COMMONS / ".git").exists(), reason="real commons not checked out")
def test_real_commons_has_no_errors() -> None:
    assert errors(validate_commons(REAL_COMMONS, base="HEAD")) == []
