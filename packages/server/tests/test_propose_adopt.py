import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from divelog_server.core import deps
from divelog_server.core.config import get_settings
from divelog_server.main import create_app
from divelog_server.schemas.sitemap import DiveMapAnnotation
from divelog_server.services import auth as auth_service
from divelog_server.services import dives as dive_service
from divelog_server.store.files import read_json, read_markdown, write_json, write_markdown
from divelog_server.store.proposals import load_merged
from divelog_server.store.validate import errors, validate_commons
from tests.commons_repos import (
    COMMONS_SITE,
    DIARY,
    NEWSITE_BODY,
    SITE,
    Repos,
    build_repos,
    git,
    merge_proposal,
    run,
)
from tests.test_commons import ADMIN, admin_site, site_in

BRANCH = f"propose/{SITE}"


@pytest.fixture
def repos(tmp_path: Path) -> Repos:
    return build_repos(tmp_path)


def propose(repos: Repos, site_id: str = SITE, *extra: str) -> tuple[int, str]:
    return run(
        "sites", "propose", site_id, "--log", str(repos.log), "--commons", str(repos.commons),
        *extra,
    )  # fmt: skip


def adopt(repos: Repos, *extra: str) -> tuple[int, str]:
    return run("sites", "adopt", *extra, "--log", str(repos.log))


def pull(repos: Repos) -> tuple[int, str]:
    return run("commons", "pull", "--log", str(repos.log))


@pytest.fixture
def proposed(repos: Repos) -> str:
    code, output = propose(repos)
    assert code == 0, output
    return output


@pytest.fixture
def merged(repos: Repos, proposed: str) -> Repos:
    merge_proposal(repos, BRANCH)
    code, output = pull(repos)
    assert code == 0, output
    return repos


@pytest.fixture
def adopted(merged: Repos) -> str:
    code, output = adopt(merged, SITE)
    assert code == 0, output
    return output


def on_branch(repos: Repos, path: str, branch: str = BRANCH) -> str:
    return git(repos.commons, "show", f"{branch}:{path}")


def branch_meta(repos: Repos, site_id: str = SITE, branch: str = BRANCH) -> dict[str, object]:
    git(repos.commons, "switch", "-q", branch)
    try:
        return read_markdown(repos.commons / "sites" / f"{site_id}.md")[0]
    finally:
        git(repos.commons, "switch", "-q", "main")


# ── propose ───────────────────────────────────────────────────────────────


def test_propose_creates_the_branch_with_one_commit(repos: Repos, proposed: str) -> None:
    assert git(repos.commons, "branch", "--list", BRANCH).strip().endswith(BRANCH)
    log = git(repos.commons, "log", "--format=%s", f"main..{BRANCH}")
    assert log == "Propose fra-newsite: New Spring"
    assert f"on {BRANCH}, back on main" in proposed


def test_propose_returns_to_main_and_leaves_it_clean(repos: Repos, proposed: str) -> None:
    assert git(repos.commons, "branch", "--show-current") == "main"
    assert git(repos.commons, "status", "--porcelain") == ""
    assert not (repos.commons / "sites" / f"{SITE}.md").exists()


def test_propose_commit_author_and_signoff(repos: Repos, proposed: str) -> None:
    settings = get_settings()
    author = git(repos.commons, "log", "-1", "--format=%an <%ae>", BRANCH)
    assert author == f"{settings.OWNER_NAME} <{settings.OWNER_EMAIL}>"
    body = git(repos.commons, "log", "-1", "--format=%b", BRANCH)
    assert f"Signed-off-by: {author}" in body


def test_propose_author_option(repos: Repos) -> None:
    code, _ = propose(repos, SITE, "--author", "Jane Diver <jane@example.org>")
    assert code == 0
    assert git(repos.commons, "log", "-1", "--format=%an <%ae>", BRANCH) == (
        "Jane Diver <jane@example.org>"
    )
    assert branch_meta(repos)["changelog"][0]["author"] == "Jane Diver"  # type: ignore[index]


def test_proposed_branch_validates(repos: Repos, proposed: str) -> None:
    git(repos.commons, "switch", "-q", BRANCH)
    assert errors(validate_commons(repos.commons, base="main")) == []


def test_proposed_record_is_objective_only(repos: Repos, proposed: str) -> None:
    meta = branch_meta(repos)
    for key in ("notes", "prices", "reference_maps", "subsurface_uuid", "forked_from", "extends"):
        assert key not in meta
    assert meta["name"] == "New Spring" and meta["geo_source"] == "GPS 2026"
    assert meta["revision"] == 1
    assert [(c["revision"], c["note"]) for c in meta["changelog"]] == [  # type: ignore[attr-defined]
        (1, "Proposed from mylog's log")
    ]
    assert "maps" not in meta
    assert read_markdown(repos.log / "sites" / f"{SITE}.md")[1].strip() == NEWSITE_BODY
    git(repos.commons, "switch", "-q", BRANCH)
    assert read_markdown(repos.commons / "sites" / f"{SITE}.md")[1].strip() == NEWSITE_BODY


def test_proposed_map_is_renumbered_with_copied_from(repos: Repos, proposed: str) -> None:
    payload = json.loads(on_branch(repos, f"maps/drawn/{SITE}-1.json"))
    assert payload["id"] == f"{SITE}-1"
    assert payload["copied_from"] == f"{SITE}-p1@1"
    assert payload["revision"] == 1
    assert [c["note"] for c in payload["changelog"]] == [f"Copied from mylog's map {SITE}-p1"]
    assert branch_meta(repos)["default_map"] == f"drawn:{SITE}-1"


def test_reference_underlay_is_dropped_and_noted(repos: Repos, proposed: str) -> None:
    payload = json.loads(on_branch(repos, f"maps/drawn/{SITE}-1.json"))
    assert "underlay" not in payload
    assert "underlay reference:survey/map.png dropped" in proposed
    assert "reference:survey/map.png left out" in proposed


def test_licensed_photos_are_copied_with_manifest_entries(repos: Repos, proposed: str) -> None:
    git(repos.commons, "switch", "-q", BRANCH)
    manifest = read_json(repos.commons / "media" / "manifest.json")
    assert manifest["media/sites/fra-newsite.jpg"]["licence"] == "CC-BY-4.0"
    assert manifest["media/sites/fra-newsite-upload.jpg"] == {
        "source": "",
        "page": "",
        "author": "A. Diver",
        "licence": "CC-BY-SA-4.0",
        "public": True,
    }
    assert (repos.commons / "media" / "sites" / "fra-newsite-upload.jpg").read_bytes() == (
        b"uploaded photo"
    )
    keys = {
        m["id"]: m["key"] for m in read_markdown(repos.commons / "sites" / f"{SITE}.md")[0]["media"]
    }
    assert keys == {
        "ns-cc": "repo:media/sites/fra-newsite.jpg",
        "ns-upload": "repo:media/sites/fra-newsite-upload.jpg",
    }


def test_ineligible_photos_are_skipped_and_listed(repos: Repos, proposed: str) -> None:
    assert "photo ns-private skipped: manifest entry not public" in proposed
    assert "photo ns-unlicensed skipped: no licence" in proposed
    assert "fra-newsite-private.jpg" not in on_branch(repos, "media/manifest.json")


def test_propose_leaves_the_log_untouched(repos: Repos) -> None:
    head = git(repos.log, "rev-parse", "HEAD")
    code, _ = propose(repos)
    assert code == 0
    assert git(repos.log, "status", "--porcelain") == ""
    assert git(repos.log, "rev-parse", "HEAD") == head


def test_printed_commands_name_the_branch(repos: Repos, proposed: str) -> None:
    assert f"git -C {repos.commons} push -u origin {BRANCH}" in proposed
    assert f"gh pr create --head {BRANCH} --title 'Propose fra-newsite: New Spring'" in proposed


def test_pr_body_carries_the_licence_statement_and_dco(repos: Repos, proposed: str) -> None:
    body = (repos.commons / ".git" / f"divelog-propose-{SITE}.md").read_text()
    assert "--body-file" in proposed and str(repos.commons / ".git") in proposed
    assert "ODbL" in body and "CC BY-SA 4.0" in body
    assert f"Signed-off-by: {get_settings().OWNER_NAME} <{get_settings().OWNER_EMAIL}>" in body
    assert "Developer Certificate of Origin" in body


def test_first_person_body_and_summary_are_held_back(repos: Repos) -> None:
    code, output = propose(repos, DIARY)
    assert code == 0, output
    assert "body left out: first person on line 1" in output
    assert "summary in the first person replaced by: The gallery is wide and deep." in output
    meta = branch_meta(repos, DIARY, f"propose/{DIARY}")
    assert meta["summary"] == "The gallery is wide and deep."
    assert "I loved" not in on_branch(repos, f"sites/{DIARY}.md", f"propose/{DIARY}")


def test_warnings_are_printed_without_failing(repos: Repos) -> None:
    path = repos.log / "sites" / f"{SITE}.md"
    meta, body = read_markdown(path)
    meta["summary"] = "A favourite spring beside the river."
    write_markdown(path, meta, body)
    code, output = propose(repos)
    assert code == 0, output
    assert f"sites/{SITE}.md: warning: owner voice in summary" in output
    assert "committed" in output


def test_first_person_map_notes_are_left_out(repos: Repos) -> None:
    path = repos.log / "maps" / "drawn" / f"{SITE}-p1.json"
    payload = read_json(path)
    payload["notes"] = "I surveyed this line in 2025."
    write_json(path, payload)
    code, output = propose(repos)
    assert code == 0, output
    assert "first-person notes left out" in output
    assert json.loads(on_branch(repos, f"maps/drawn/{SITE}-1.json"))["notes"] == ""


def test_dry_run_prints_the_plan_and_writes_nothing(repos: Repos) -> None:
    code, output = propose(repos, SITE, "--dry-run")
    assert code == 0
    assert f"map {SITE}-p1 -> {SITE}-1" in output and "dry run: nothing written" in output
    assert git(repos.commons, "branch", "--list", BRANCH) == ""
    assert git(repos.commons, "status", "--porcelain") == ""


def test_branch_option(repos: Repos) -> None:
    code, output = propose(repos, SITE, "--branch", "sites/new-spring")
    assert code == 0, output
    assert "push -u origin sites/new-spring" in output
    assert git(repos.commons, "branch", "--list", "sites/new-spring") != ""


def test_skip_map_keeps_a_map_out(repos: Repos) -> None:
    code, output = propose(repos, SITE, "--skip-map", f"{SITE}-p1")
    assert code == 0, output
    assert f"map {SITE}-p1 stays personal" in output
    assert "default_map" not in branch_meta(repos)


def test_dirty_checkout_is_refused(repos: Repos) -> None:
    (repos.commons / "scratch.txt").write_text("wip")
    code, output = propose(repos)
    assert code == 1
    assert "uncommitted changes" in output
    assert git(repos.commons, "branch", "--list", BRANCH) == ""


def test_unknown_site_is_refused(repos: Repos) -> None:
    code, output = propose(repos, "fra-nowhere")
    assert code == 1
    assert "unknown site 'fra-nowhere'" in output


def test_commons_site_without_fork_is_refused(repos: Repos) -> None:
    code, output = propose(repos, COMMONS_SITE)
    assert code == 1
    assert "already a commons site" in output


def test_existing_branch_is_refused(repos: Repos, proposed: str) -> None:
    code, output = propose(repos)
    assert code == 1
    assert f"branch {BRANCH} already exists" in output


def test_invalid_proposal_exits_1_and_leaves_the_branch(repos: Repos) -> None:
    path = repos.log / "sites" / f"{SITE}.md"
    meta, body = read_markdown(path)
    meta.pop("geo_source")
    write_markdown(path, meta, body)
    code, output = propose(repos)
    assert code == 1
    assert "does not validate" in output
    assert f"sites/{SITE}.md: lat/lon set without geo_source" in output
    assert git(repos.commons, "branch", "--show-current") == BRANCH
    assert git(repos.commons, "log", "--format=%s", f"main..{BRANCH}") == ""


def test_no_validate_commits_an_invalid_proposal(repos: Repos) -> None:
    path = repos.log / "sites" / f"{SITE}.md"
    meta, body = read_markdown(path)
    meta.pop("geo_source")
    write_markdown(path, meta, body)
    code, output = propose(repos, SITE, "--no-validate")
    assert code == 0, output
    assert git(repos.commons, "log", "--format=%s", f"main..{BRANCH}") != ""


# ── adopt ─────────────────────────────────────────────────────────────────


def test_adopt_writes_an_overlay_pinned_at_the_commons_revision(
    merged: Repos, adopted: str
) -> None:
    meta, _ = read_markdown(merged.log / "sites" / f"{SITE}.md")
    assert meta["extends"] == "commons" and meta["base_revision"] == 1
    assert meta["notes"] == "Owner note." and meta["reference_maps"] == ["reference:survey/map.png"]
    assert "name" not in meta and "lat" not in meta and "default_map" not in meta
    assert [m["id"] for m in meta["media"]] == ["ns-private", "ns-unlicensed"]
    assert "pinned at commons revision 1" in adopted


def test_adopt_removes_the_personal_map(merged: Repos, adopted: str) -> None:
    assert not (merged.log / "maps" / "drawn" / f"{SITE}-p1.json").exists()
    assert f"map {SITE}-p1 removed, the commons has it as {SITE}-1" in adopted


def test_adopt_points_the_annotation_at_the_commons_map(merged: Repos, adopted: str) -> None:
    annotation = read_markdown(merged.log / "dives" / "00001.md")[0]["map_annotation"]
    assert annotation["map_id"] == f"{SITE}-1"
    assert annotation["revision"] == 1
    assert annotation["route"] == [{"from": "a", "to": "b"}]


def test_adopted_site_loads_from_the_commons_with_a_fresh_annotation(
    merged: Repos, adopted: str
) -> None:
    store = load_merged(merged.log, merged.commons)
    assert store.site_origin[SITE] == "commons"
    assert store.map_origin[f"{SITE}-1"] == "commons"
    assert store.sites[SITE].notes == "Owner note."
    assert store.sites[SITE].default_map == f"drawn:{SITE}-1"
    annotation = DiveMapAnnotation.model_validate(store.dives[1].map_annotation)
    assert dive_service.annotation_health(store, annotation) == (False, 0)
    pin = store.site_pin_state(SITE)
    assert pin is not None and not pin.stale and pin.pinned_revision == 1


def test_adopt_commits_the_log(merged: Repos, adopted: str) -> None:
    assert git(merged.log, "log", "-1", "--format=%s") == f"Adopt {SITE} from the commons"
    assert git(merged.log, "status", "--porcelain") == ""


def test_adopt_drops_the_log_copy_of_a_commons_photo(merged: Repos, adopted: str) -> None:
    assert not (merged.log / "media" / "sites" / "fra-newsite.jpg").exists()
    assert (merged.log / "media" / "sites" / "fra-newsite-private.jpg").exists()
    manifest = read_json(merged.log / "media" / "manifest.json")
    assert list(manifest) == ["media/sites/fra-newsite-private.jpg"]


def test_adopt_keep_maps_keeps_them_personal(merged: Repos) -> None:
    code, output = adopt(merged, SITE, "--keep-maps")
    assert code == 0, output
    assert (merged.log / "maps" / "drawn" / f"{SITE}-p1.json").exists()
    annotation = read_markdown(merged.log / "dives" / "00001.md")[0]["map_annotation"]
    assert annotation["map_id"] == f"{SITE}-p1"
    store = load_merged(merged.log, merged.commons)
    assert store.site_origin[SITE] == "commons"
    assert {f"{SITE}-1", f"{SITE}-p1"} <= set(store.maps_by_site[SITE])


def test_adopt_without_a_commons_record_fails(repos: Repos) -> None:
    code, output = adopt(repos, SITE)
    assert code == 1
    assert f"the commons has no record for {SITE}" in output
    assert "extends" not in read_markdown(repos.log / "sites" / f"{SITE}.md")[0]


def test_adopt_twice_has_nothing_to_do(merged: Repos, adopted: str) -> None:
    code, output = adopt(merged, SITE)
    assert code == 0
    assert "nothing to adopt" in output


def test_adopt_all_finds_the_proposed_sites(merged: Repos) -> None:
    code, output = adopt(merged, "--all")
    assert code == 0, output
    assert f"adopt {SITE}:" in output and DIARY not in output
    code, output = adopt(merged, "--all")
    assert "nothing to adopt" in output


# ── the fork path ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def owner(repos: Repos, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    """An owner client over the round-trip log with its commons checkout."""
    monkeypatch.setenv("DATA_ROOT", str(repos.log))
    monkeypatch.delenv("COMMONS_ROOT", raising=False)
    get_settings.cache_clear()
    deps.reset_store()
    token = await auth_service.create_session(deps.get_state(), "owner@example.com", "pytest")
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        c.cookies.set(get_settings().SESSION_COOKIE_NAME, token)
        yield c


@pytest_asyncio.fixture
async def forked(repos: Repos, owner: AsyncClient) -> Repos:
    site = await admin_site(owner, COMMONS_SITE)
    response = await owner.put(
        f"{ADMIN}/sites/{COMMONS_SITE}?fork=true", json=site_in(site, lat=44.65)
    )
    assert response.status_code == 200, response.text
    site = await admin_site(owner, COMMONS_SITE)
    response = await owner.put(f"{ADMIN}/sites/{COMMONS_SITE}", json=site_in(site, lon=1.75))
    assert response.status_code == 200, response.text
    assert response.json()["origin"] == "fork"
    git(repos.log, "add", "-A")
    git(repos.log, "commit", "-q", "-m", "fork")
    return repos


async def test_fork_proposal_moves_the_commons_revision(forked: Repos) -> None:
    code, output = propose(forked, COMMONS_SITE)
    assert code == 0, output
    meta = branch_meta(forked, COMMONS_SITE, f"propose/{COMMONS_SITE}")
    assert meta["revision"] == 2
    assert meta["lat"] == 44.65 and meta["lon"] == 1.75
    assert "forked_from" not in meta and "notes" not in meta
    assert [(c["revision"], c["note"]) for c in meta["changelog"]] == [  # type: ignore[attr-defined]
        (2, f"Updated from mylog's fork: Update site {COMMONS_SITE}")
    ]
    assert [m["key"] for m in meta["media"]] == [  # type: ignore[attr-defined]
        "repo:media/sites/fra-commons-only.jpg"
    ]
    git(forked.commons, "switch", "-q", f"propose/{COMMONS_SITE}")
    assert errors(validate_commons(forked.commons, base="main")) == []


async def test_adopt_turns_the_fork_back_into_an_overlay(forked: Repos) -> None:
    code, output = propose(forked, COMMONS_SITE)
    assert code == 0, output
    merge_proposal(forked, f"propose/{COMMONS_SITE}")
    assert pull(forked)[0] == 0
    code, output = adopt(forked, COMMONS_SITE)
    assert code == 0, output
    assert "no personal material left, file removed" in output
    assert not (forked.log / "sites" / f"{COMMONS_SITE}.md").exists()
    store = load_merged(forked.log, forked.commons)
    assert store.site_origin[COMMONS_SITE] == "commons"
    assert store.sites[COMMONS_SITE].lat == 44.65
    assert store.sites[COMMONS_SITE].revision == 2


async def test_adopt_keeps_the_personal_part_of_a_fork(forked: Repos, owner: AsyncClient) -> None:
    site = await admin_site(owner, COMMONS_SITE)
    response = await owner.put(
        f"{ADMIN}/sites/{COMMONS_SITE}", json=site_in(site, notes="Bring a torch.")
    )
    assert response.status_code == 200, response.text
    git(forked.log, "add", "-A")
    git(forked.log, "commit", "-q", "-m", "notes")
    assert propose(forked, COMMONS_SITE)[0] == 0
    merge_proposal(forked, f"propose/{COMMONS_SITE}")
    assert pull(forked)[0] == 0
    assert adopt(forked, COMMONS_SITE)[0] == 0
    meta = read_markdown(forked.log / "sites" / f"{COMMONS_SITE}.md")[0]
    assert meta["extends"] == "commons" and meta["base_revision"] == 2
    assert meta["notes"] == "Bring a torch."
    assert "lat" not in meta and "forked_from" not in meta and "revision" not in meta
