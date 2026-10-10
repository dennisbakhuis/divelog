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
from divelog_server.store.commons_sync import haversine_km, parse_near
from divelog_server.store.git import GitRepo
from divelog_server.store.manifest import read_manifest
from divelog_server.store.proposals import load_merged
from divelog_server.store.sources import CommonsSource
from divelog_server.store.store import Store
from tests.commons_repos import (
    COMMONS_SITE,
    SITE,
    Repos,
    build_repos,
    bump_map,
    bump_site,
    git,
    maintainer_change,
    merge_proposal,
    run,
)

ADMIN = "/api/v1/admin/commons"


@pytest.fixture
def repos(tmp_path: Path) -> Repos:
    return build_repos(tmp_path)


def pull(repos: Repos, *extra: str) -> tuple[int, str]:
    return run("commons", "pull", "--log", str(repos.log), *extra)


def pinned_ref(repos: Repos) -> str | None:
    manifest = read_manifest(repos.log)
    assert manifest is not None
    source = manifest.commons_source()
    return source.ref if source else None


def short(root: Path, ref: str = "HEAD") -> str:
    return git(root, "rev-parse", "--short", ref)


@pytest.fixture
def adopted(repos: Repos) -> Repos:
    """The round trip up to an adopted site: proposed, merged, pulled, adopted."""
    log = str(repos.log)
    code, output = run("sites", "propose", SITE, "--log", log, "--commons", str(repos.commons))
    assert code == 0, output
    merge_proposal(repos, f"propose/{SITE}")
    assert pull(repos)[0] == 0
    code, output = run("sites", "adopt", SITE, "--log", log)
    assert code == 0, output
    return repos


def bump_newsite(repos: Repos) -> None:
    def change(root: Path) -> None:
        bump_map(root, f"{SITE}-1")
        bump_site(root, SITE)

    maintainer_change(repos, change, "Resurvey the new spring")


# ── divelog commons pull ──────────────────────────────────────────────────


def test_pull_pins_the_manifest_and_commits_the_log(repos: Repos) -> None:
    maintainer_change(repos, lambda root: bump_site(root, COMMONS_SITE), "Bump")
    code, output = pull(repos)
    assert code == 0, output
    head = short(repos.commons)
    assert head == short(repos.maintainer)
    assert pinned_ref(repos) == head
    assert git(repos.log, "log", "-1", "--format=%s") == f"Pin the commons at {head}"
    assert f"divelog.yaml pinned at {head}, committed" in output


def test_pull_when_up_to_date_pins_once_then_changes_nothing(repos: Repos) -> None:
    assert pull(repos)[0] == 0
    commits = git(repos.log, "rev-list", "--count", "HEAD")
    code, output = pull(repos)
    assert code == 0
    assert "commons up to date" in output and "pinned" not in output
    assert git(repos.log, "rev-list", "--count", "HEAD") == commits


def test_pull_reports_the_sites_that_became_stale(adopted: Repos) -> None:
    bump_newsite(adopted)
    code, output = pull(adopted)
    assert code == 0, output
    assert "1 sites became stale, 1 stale in all" in output
    assert f"{SITE}" in output and "1/2 (new)" in output


def test_already_stale_sites_are_not_new_again(adopted: Repos) -> None:
    bump_newsite(adopted)
    assert pull(adopted)[0] == 0
    maintainer_change(adopted, lambda root: bump_site(root, COMMONS_SITE), "Other site")
    code, output = pull(adopted)
    assert code == 0
    assert "0 sites became stale, 1 stale in all" in output


def test_map_revision_bump_makes_the_annotation_stale(adopted: Repos) -> None:
    store = load_merged(adopted.log, adopted.commons)
    annotation = DiveMapAnnotation.model_validate(store.dives[1].map_annotation)
    assert dive_service.annotation_health(store, annotation) == (False, 0)
    bump_newsite(adopted)
    assert pull(adopted)[0] == 0
    store = load_merged(adopted.log, adopted.commons)
    assert dive_service.annotation_health(store, annotation) == (True, 0)
    pin = store.site_pin_state(SITE)
    assert pin is not None and pin.stale and (pin.pinned_revision, pin.current_revision) == (1, 2)


async def test_pin_site_makes_the_pin_current(adopted: Repos) -> None:
    bump_newsite(adopted)
    assert pull(adopted)[0] == 0
    store = Store(adopted.log, commons=CommonsSource(adopted.commons))
    store.load()
    await store.pin_site(SITE)
    pin = store.site_pin_state(SITE)
    assert pin is not None and not pin.stale and pin.pinned_revision == 2
    store.load()
    assert store.log_sites.overlays[SITE].base_revision == 2


def test_pull_with_diverged_history_exits_1(repos: Repos) -> None:
    maintainer_change(repos, lambda root: bump_site(root, COMMONS_SITE), "Upstream")
    (repos.commons / "LOCAL.md").write_text("local")
    git(repos.commons, "add", "-A")
    git(repos.commons, "commit", "-q", "-m", "Local")
    before = pinned_ref(repos)
    code, output = pull(repos)
    assert code == 1
    assert "git pull --ff-only failed" in output
    assert pinned_ref(repos) == before


def test_pull_with_ref_pins_that_commit(repos: Repos) -> None:
    first = short(repos.commons)
    maintainer_change(repos, lambda root: bump_site(root, COMMONS_SITE), "Bump")
    code, output = pull(repos, "--ref", first)
    assert code == 0, output
    assert pinned_ref(repos) == first
    assert short(repos.commons) != first


def test_pull_with_an_unknown_ref_exits_1(repos: Repos) -> None:
    code, output = pull(repos, "--ref", "deadbeef")
    assert code == 1
    assert "deadbeef is not a commit" in output


def test_pull_without_a_commons_source_exits_1(repos: Repos) -> None:
    (repos.log / "divelog.yaml").write_text("format: 1\nkind: log\n")
    code, output = pull(repos)
    assert code == 1
    assert "names no commons source" in output


def test_pull_with_an_explicit_commons_checkout(repos: Repos, tmp_path: Path) -> None:
    other = tmp_path / "other"
    git(tmp_path, "clone", "-q", str(repos.origin), str(other))
    maintainer_change(repos, lambda root: bump_site(root, COMMONS_SITE), "Bump")
    code, output = pull(repos, "--commons", str(other))
    assert code == 0, output
    assert pinned_ref(repos) == short(other)


def test_adopt_after_merge_needs_the_pull(repos: Repos) -> None:
    log = str(repos.log)
    assert run("sites", "propose", SITE, "--log", log, "--commons", str(repos.commons))[0] == 0
    merge_proposal(repos, f"propose/{SITE}")
    code, output = run("sites", "adopt", SITE, "--log", log)
    assert code == 1 and "merge the proposal and pull the commons" in output
    assert pull(repos)[0] == 0
    assert run("sites", "adopt", SITE, "--log", log)[0] == 0


# ── helpers ───────────────────────────────────────────────────────────────


def test_parse_near() -> None:
    assert parse_near("44.6,1.7") == (44.6, 1.7)
    for bad in ("44.6", "a,b", "91,0", "0,181"):
        with pytest.raises(ValueError):
            parse_near(bad)


def test_haversine() -> None:
    assert haversine_km(0, 0, 0, 1) == pytest.approx(111.2, abs=0.1)


# ── API ───────────────────────────────────────────────────────────────────


async def configure_store(
    repos: Repos, monkeypatch: pytest.MonkeyPatch, git_enabled: bool
) -> Store:
    monkeypatch.setenv("DATA_ROOT", str(repos.log))
    monkeypatch.delenv("COMMONS_ROOT", raising=False)
    monkeypatch.setenv("COMMONS_GIT_ENABLED", "true" if git_enabled else "false")
    get_settings.cache_clear()
    deps.reset_store()
    return deps.get_store()


@pytest_asyncio.fixture
async def api(repos: Repos, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    await configure_store(repos, monkeypatch, git_enabled=True)
    token = await auth_service.create_session(deps.get_state(), "owner@example.com", "pytest")
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        c.cookies.set(get_settings().SESSION_COOKIE_NAME, token)
        yield c


async def test_api_pull_is_409_when_commons_git_is_disabled(
    repos: Repos, monkeypatch: pytest.MonkeyPatch, api: AsyncClient
) -> None:
    store = deps.get_store()
    assert store.commons is not None
    store.commons.git = GitRepo(repos.commons, author_name="", author_email="", enabled=False)
    response = await api.post(f"{ADMIN}/pull")
    assert response.status_code == 409
    assert response.json() == {"detail": "commons git is disabled"}


async def test_api_pull_fast_forwards_pins_and_lists_stale(
    adopted: Repos, api: AsyncClient
) -> None:
    previous = short(adopted.commons)
    bump_newsite(adopted)
    response = await api.post(f"{ADMIN}/pull")
    assert response.status_code == 200, response.text
    body = response.json()
    head = short(adopted.commons)
    assert body["previous_head"] == previous and body["head"] == head != previous
    assert body["pinned"] is True and pinned_ref(adopted) == head
    assert body["stale"] == [
        {
            "site_id": SITE,
            "origin": "commons",
            "pinned_revision": 1,
            "current_revision": 2,
            "new": True,
        }
    ]
    assert deps.get_store().commons_head() == head


async def test_api_pull_with_diverged_history_is_409(repos: Repos, api: AsyncClient) -> None:
    maintainer_change(repos, lambda root: bump_site(root, COMMONS_SITE), "Upstream")
    (repos.commons / "LOCAL.md").write_text("local")
    git(repos.commons, "add", "-A")
    git(repos.commons, "commit", "-q", "-m", "Local")
    response = await api.post(f"{ADMIN}/pull")
    assert response.status_code == 409
    assert response.json()["detail"].startswith("commons:")


async def test_api_commons_sites_by_name_alias_and_area(adopted: Repos, api: AsyncClient) -> None:
    by_name = (await api.get(f"{ADMIN}/sites", params={"q": "spring"})).json()
    assert [s["id"] for s in by_name] == [COMMONS_SITE, SITE]
    by_alias = (await api.get(f"{ADMIN}/sites", params={"q": "petite"})).json()
    assert [s["id"] for s in by_alias] == [SITE]
    hit = by_alias[0]
    assert hit == {
        "id": SITE,
        "name": "New Spring",
        "country": "FRA",
        "type": "cave",
        "lat": 44.61,
        "lon": 1.71,
        "area": None,
        "dives": 1,
        "has_dives": True,
        "origin": "commons",
        "distance_km": None,
    }


async def test_api_commons_sites_near_orders_by_distance(adopted: Repos, api: AsyncClient) -> None:
    response = await api.get(f"{ADMIN}/sites", params={"near": "44.6,1.7"})
    hits = response.json()
    assert [h["id"] for h in hits] == [COMMONS_SITE, SITE]
    assert hits[0]["distance_km"] == 0.0 and 0 < hits[1]["distance_km"] < 2
    far = await api.get(f"{ADMIN}/sites", params={"near": "45.0,1.7"})
    assert far.json() == []


async def test_api_commons_sites_limit_and_query_with_near(
    adopted: Repos, api: AsyncClient
) -> None:
    response = await api.get(f"{ADMIN}/sites", params={"limit": 1})
    assert [h["id"] for h in response.json()] == [COMMONS_SITE]
    response = await api.get(f"{ADMIN}/sites", params={"q": "new", "near": "44.6,1.7"})
    assert [h["id"] for h in response.json()] == [SITE]


async def test_api_commons_sites_rejects_a_bad_point(repos: Repos, api: AsyncClient) -> None:
    response = await api.get(f"{ADMIN}/sites", params={"near": "north"})
    assert response.status_code == 422


async def test_api_commons_sites_shows_origin_and_dives(repos: Repos, api: AsyncClient) -> None:
    hits = (await api.get(f"{ADMIN}/sites")).json()
    assert [(h["id"], h["origin"], h["dives"]) for h in hits] == [(COMMONS_SITE, "commons", 1)]


async def test_api_commons_endpoints_need_the_owner(client: AsyncClient) -> None:
    assert (await client.get(f"{ADMIN}/sites")).status_code == 401
    assert (await client.post(f"{ADMIN}/pull")).status_code == 401


async def test_api_commons_sites_without_commons_is_empty(owner_client: AsyncClient) -> None:
    response = await owner_client.get(f"{ADMIN}/sites")
    assert response.status_code == 200 and response.json() == []
    assert (await owner_client.post(f"{ADMIN}/pull")).status_code == 409


def test_openapi_lists_the_commons_models() -> None:
    document = create_app().openapi()
    schemas = document["components"]["schemas"]
    assert {"CommonsSiteHit", "CommonsPullOut", "CommonsStaleSite"} <= set(schemas)
    assert "/api/v1/admin/commons/pull" in document["paths"]
    assert "/api/v1/admin/commons/sites" in document["paths"]
