"""Instance features over the commons fixture: import matching and the public listing filter."""

from datetime import date
from typing import Any

from httpx import AsyncClient

from divelog_server.importers.site_match import MATCH_RADIUS_M, match_site
from divelog_server.importers.subsurface import DraftSite
from divelog_server.store.files import read_markdown
from divelog_server.store.models import DiveRecord
from divelog_server.store.store import Store

SITE = "fra-commons-only"
ADMIN = "/api/v1/admin"
PUBLIC = "/api/v1/dive"


def subsurface_xml(uuid: str, name: str, gps: str = "", number: int = 300) -> bytes:
    """A one-dive Subsurface export at one site."""
    where = f" gps='{gps}'" if gps else ""
    return (
        "<divelog program='subsurface' version='3'><divesites>"
        f"<site uuid='{uuid}' name='{name}'{where}/>"
        "</divesites><dives>"
        f"<dive number='{number}' date='2025-07-0{number % 9 + 1}' time='10:00:00' "
        f"duration='40 min' divesiteid='{uuid}'><divecomputer model='X'>"
        "<depth max='12.0 m' mean='8.0 m' /></divecomputer></dive>"
        "</dives></divelog>"
    ).encode()


async def import_xml(client: AsyncClient, data: bytes) -> dict[str, Any]:
    response = await client.post(
        f"{ADMIN}/import/subsurface", files={"file": ("log.xml", data, "application/xml")}
    )
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


# ── matching rules ─────────────────────────────────────────────────────────


def test_match_by_name_ignores_case(commons_store: Store) -> None:
    match = match_site(DraftSite(uuid="u", name="  commons SPRING "), commons_store.sites)
    assert match is not None and (match.site_id, match.matched_by) == (SITE, "name")


def test_match_by_alias(commons_store: Store) -> None:
    match = match_site(DraftSite(uuid="u", name="la source"), commons_store.sites)
    assert match is not None and (match.site_id, match.matched_by) == (SITE, "alias")


def test_match_by_distance_within_radius(commons_store: Store) -> None:
    draft = DraftSite(uuid="u", name="Spring car park", lat=44.602, lon=1.7)
    match = match_site(draft, commons_store.sites)
    assert match is not None and (match.site_id, match.matched_by) == (SITE, "distance")
    assert match.distance_m is not None and 200 < match.distance_m < MATCH_RADIUS_M


def test_no_match_outside_radius(commons_store: Store) -> None:
    draft = DraftSite(uuid="u", name="Spring car park", lat=44.604, lon=1.7)
    assert match_site(draft, commons_store.sites) is None


def test_match_by_uuid_comes_first(commons_store: Store) -> None:
    commons_store.sites["ressel"].subsurface_uuid = "abc"
    match = match_site(DraftSite(uuid="abc", name="Commons Spring"), commons_store.sites)
    assert match is not None and (match.site_id, match.matched_by) == ("ressel", "uuid")


# ── the importer ───────────────────────────────────────────────────────────


async def test_import_adopts_commons_site_by_name(
    commons_owner_client: AsyncClient, commons_store: Store
) -> None:
    body = await import_xml(commons_owner_client, subsurface_xml("ss-1", "Commons Spring"))
    assert body["sites_created"] == 0 and body["sites_matched"] == 1
    assert body["sites"] == [
        {
            "subsurface_uuid": "ss-1",
            "name": "Commons Spring",
            "site_id": SITE,
            "outcome": "matched",
            "matched_by": "name",
            "distance_m": None,
            "origin": "commons",
        }
    ]
    dive = commons_store.dives[body["created"][0]]
    assert dive.site == SITE and dive.country == "FRA"
    assert commons_store.site_origin[SITE] == "commons"
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert meta["extends"] == "commons" and meta["subsurface_uuid"] == "ss-1"
    assert "name" not in meta and "lat" not in meta


async def test_import_uuid_round_trip_through_the_overlay(
    commons_owner_client: AsyncClient, commons_store: Store
) -> None:
    await import_xml(commons_owner_client, subsurface_xml("ss-2", "La Source", number=301))
    commons_store.load()
    assert commons_store.sites[SITE].subsurface_uuid == "ss-2"
    again = await import_xml(
        commons_owner_client, subsurface_xml("ss-2", "Renamed in Subsurface", number=302)
    )
    assert again["sites"][0]["matched_by"] == "uuid"
    assert again["sites"][0]["site_id"] == SITE
    assert commons_store.dives[302].site == SITE


async def test_import_reports_distance_match(
    commons_owner_client: AsyncClient, commons_store: Store
) -> None:
    body = await import_xml(
        commons_owner_client, subsurface_xml("ss-3", "Spring car park", "44.602000 1.700000")
    )
    report = body["sites"][0]
    assert report["outcome"] == "matched" and report["matched_by"] == "distance"
    assert report["site_id"] == SITE and 200 < report["distance_m"] < MATCH_RADIUS_M


async def test_import_creates_personal_site_without_match(
    commons_owner_client: AsyncClient, commons_store: Store
) -> None:
    body = await import_xml(
        commons_owner_client, subsurface_xml("ss-4", "Spring car park", "44.604000 1.700000")
    )
    report = body["sites"][0]
    assert report["outcome"] == "created" and report["matched_by"] is None
    assert report["origin"] == "log" and body["sites_created"] == 1
    site = commons_store.sites[report["site_id"]]
    assert site.subsurface_uuid == "ss-4"
    assert report["site_id"] in commons_store.log_sites.sites


# ── public listing filter ──────────────────────────────────────────────────


def test_listed_sites_skip_undived_commons(commons_store: Store) -> None:
    assert SITE in commons_store.sites and not commons_store.is_listed(SITE)
    assert SITE not in commons_store.listed_sites()
    assert SITE in commons_store.listed_sites(owner=True)
    assert {"ressel", "zeelandbrug"} <= set(commons_store.listed_sites())
    assert "fra-causses" not in commons_store.listed_regions()
    assert "fra-causses" in commons_store.listed_regions(owner=True)


async def test_public_sites_skip_undived_commons_site(
    commons_client: AsyncClient, commons_owner_client: AsyncClient
) -> None:
    public = await commons_client.get(f"{PUBLIC}/sites")
    assert SITE not in {s["id"] for s in public.json()}
    direct = await commons_client.get(f"{PUBLIC}/sites/{SITE}")
    assert direct.status_code == 200 and direct.json()["site"]["origin"] == "commons"
    owner = await commons_owner_client.get(f"{PUBLIC}/sites")
    assert SITE in {s["id"] for s in owner.json()}
    admin = await commons_owner_client.get(f"{ADMIN}/sites")
    assert SITE in {s["id"] for s in admin.json()}


async def test_public_regions_skip_regions_without_listed_sites(
    commons_client: AsyncClient,
) -> None:
    regions = (await commons_client.get(f"{PUBLIC}/regions")).json()
    ids = {r["id"] for r in regions}
    assert "fra-causses" not in ids and {"lot-karst", "zeeland-delta"} <= ids
    region = await commons_client.get(f"{PUBLIC}/regions/fra-causses")
    assert region.status_code == 200 and region.json()["sites"] == []


async def test_nearby_skips_undived_commons_site(
    commons_client: AsyncClient, commons_owner_client: AsyncClient
) -> None:
    public = (await commons_client.get(f"{PUBLIC}/sites/ressel")).json()
    assert SITE not in {n["slug"] for n in public["nearby"]}
    owner = (await commons_owner_client.get(f"{PUBLIC}/sites/ressel")).json()
    assert SITE in {n["slug"] for n in owner["nearby"]}


async def test_a_dive_lists_the_commons_site(
    commons_client: AsyncClient, commons_store: Store
) -> None:
    dive = DiveRecord(
        number=400,
        date=date(2025, 8, 1),
        duration_min=50,
        max_depth_m=20.0,
        site=SITE,
        visibility="public",
    )
    await commons_store.save_dive(dive, "Dive the commons spring")
    sites = (await commons_client.get(f"{PUBLIC}/sites")).json()
    assert SITE in {s["id"] for s in sites}
    regions = (await commons_client.get(f"{PUBLIC}/regions")).json()
    causses = next(r for r in regions if r["id"] == "fra-causses")
    assert [s["slug"] for s in causses["sites"]] == [SITE]
    stats = (await commons_client.get(f"{PUBLIC}/stats")).json()
    assert SITE in {m["slug"] for m in stats["map_sites"]}
