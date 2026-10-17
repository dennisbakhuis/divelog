"""``PUBLIC_COMMONS_SITES``: undived commons sites in the public lists, optionally per region."""

from collections.abc import Callable
from pathlib import Path

import pytest
from httpx import AsyncClient

from divelog_server.core import deps
from divelog_server.core.config import Settings, get_settings
from divelog_server.store.store import Store

SITE = "fra-commons-only"
REGION = "fra-causses"
ADMIN = "/api/v1/admin"
PUBLIC = "/api/v1/dive"

Atlas = Callable[[str], None]


@pytest.fixture
def atlas(commons_root: Path, monkeypatch: pytest.MonkeyPatch) -> Atlas:
    """Turn ``PUBLIC_COMMONS_SITES`` on, limited to the given comma-separated regions."""

    def switch(regions: str = "") -> None:
        monkeypatch.setenv("PUBLIC_COMMONS_SITES", "true")
        monkeypatch.setenv("PUBLIC_COMMONS_REGIONS", regions)
        get_settings.cache_clear()
        deps.reset_store()

    return switch


def test_setting_is_off_by_default() -> None:
    settings = Settings()
    assert settings.PUBLIC_COMMONS_SITES is False
    assert settings.public_commons_regions == frozenset()


def test_regions_setting_is_a_trimmed_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUBLIC_COMMONS_REGIONS", " fra-causses, lot-karst ,,")
    assert Settings().public_commons_regions == frozenset({"fra-causses", "lot-karst"})


# ── off ────────────────────────────────────────────────────────────────────


def test_off_keeps_undived_commons_sites_out(commons_store: Store) -> None:
    assert not commons_store.public_commons
    assert not commons_store.is_listed(SITE) and not commons_store.in_atlas(SITE)
    assert REGION not in commons_store.listed_regions()


async def test_off_region_page_has_no_undived_markers(commons_client: AsyncClient) -> None:
    region = (await commons_client.get(f"{PUBLIC}/regions/lot-karst")).json()
    assert region["sites"] and all(s["dives"] > 0 for s in region["sites"])
    assert {m["slug"] for m in region["map_sites"]} == {s["slug"] for s in region["sites"]}
    assert all(m["dives"] > 0 and m["first_year"] for m in region["map_sites"])


# ── on ─────────────────────────────────────────────────────────────────────


def test_on_lists_undived_commons_sites(atlas: Atlas) -> None:
    atlas("")
    store = deps.get_store()
    assert store.is_listed(SITE) and store.in_atlas(SITE) and not store.in_log(SITE)
    assert SITE in store.listed_sites()
    assert REGION in store.listed_regions()
    assert not store.in_atlas("ressel")


async def test_on_public_sites_carry_a_zero_dive_count(
    atlas: Atlas, commons_client: AsyncClient
) -> None:
    atlas("")
    sites = {s["id"]: s for s in (await commons_client.get(f"{PUBLIC}/sites")).json()}
    assert sites[SITE]["dives"] == 0 and sites[SITE]["origin"] == "commons"
    assert sites["ressel"]["dives"] > 0


async def test_on_region_lists_the_site_and_a_marker(
    atlas: Atlas, commons_client: AsyncClient
) -> None:
    atlas("")
    regions = {r["id"]: r for r in (await commons_client.get(f"{PUBLIC}/regions")).json()}
    assert [(s["slug"], s["dives"]) for s in regions[REGION]["sites"]] == [(SITE, 0)]
    region = (await commons_client.get(f"{PUBLIC}/regions/{REGION}")).json()
    assert region["dives"] == 0
    [marker] = region["map_sites"]
    assert marker["slug"] == SITE and marker["dives"] == 0
    assert marker["first_year"] is None and marker["last_year"] is None


async def test_on_keeps_dived_markers_first(atlas: Atlas, commons_client: AsyncClient) -> None:
    atlas("")
    region = (await commons_client.get(f"{PUBLIC}/regions/lot-karst")).json()
    assert region["map_sites"][0]["dives"] > 0


async def test_on_nearby_lists_the_atlas_site(atlas: Atlas, commons_client: AsyncClient) -> None:
    atlas("")
    detail = (await commons_client.get(f"{PUBLIC}/sites/ressel")).json()
    nearby = {n["slug"]: n for n in detail["nearby"]}
    assert nearby[SITE]["dives"] == 0


async def test_on_leaves_the_log_stats_map_alone(atlas: Atlas, commons_client: AsyncClient) -> None:
    atlas("")
    stats = (await commons_client.get(f"{PUBLIC}/stats")).json()
    assert SITE not in {m["slug"] for m in stats["map_sites"]}


async def test_on_admin_still_offers_to_adopt(
    atlas: Atlas, commons_owner_client: AsyncClient
) -> None:
    atlas("")
    response = await commons_owner_client.get(
        f"{ADMIN}/sites/nearby", params={"name": "Commons Spring"}
    )
    body = response.json()
    assert SITE in {s["site_id"] for s in body["commons"]}
    assert SITE not in {s["site_id"] for s in body["log"]}


# ── region restriction ─────────────────────────────────────────────────────


def test_restriction_to_another_region_keeps_the_site_out(atlas: Atlas) -> None:
    atlas("lot-karst, zeeland-delta")
    store = deps.get_store()
    assert not store.is_listed(SITE)
    assert REGION not in store.listed_regions()


async def test_restriction_to_its_region_lists_the_site(
    atlas: Atlas, commons_client: AsyncClient
) -> None:
    atlas(f"lot-karst,{REGION}")
    sites = {s["id"] for s in (await commons_client.get(f"{PUBLIC}/sites")).json()}
    assert SITE in sites
    regions = {r["id"] for r in (await commons_client.get(f"{PUBLIC}/regions")).json()}
    assert REGION in regions
