"""The site editor's helper endpoints: nearby sites, lookups, notes, credits and the OSM seed."""

import io
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from PIL import Image

from divelog_server.core.config import get_settings
from divelog_server.importers.site_match import nearby
from divelog_server.main import create_app
from divelog_server.services import auth as auth_service
from divelog_server.services.overpass import (
    HttpOverpassClient,
    OverpassError,
    get_overpass_client,
)
from divelog_server.store.files import read_markdown
from divelog_server.store.manifest import LICENCE_ALLOWLIST
from divelog_server.store.models import SiteRecord
from divelog_server.store.overlay import OBJECTIVE_FIELDS, PERSONAL_FIELDS
from divelog_server.store.state import AuthState
from divelog_server.store.store import Store
from divelog_server.tools.sitemap_osm import overpass_query
from tests.test_tool_sitemap_osm import tiny_osm

ADMIN = "/api/v1/admin"
META = "/api/v1/meta"


async def nearby_get(client: AsyncClient, **params: Any) -> dict[str, Any]:
    """The nearby-sites answer for the given query."""
    response = await client.get(f"{ADMIN}/sites/nearby", params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def record_commits(store: Store, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Collect the commit messages the store writes from now on."""
    messages: list[str] = []

    async def commit(message: str) -> None:
        messages.append(message)

    monkeypatch.setattr(store.git, "commit", commit)
    return messages


# ── nearby ──────────────────────────────────────────────────────────────────


def test_nearby_prefers_the_name_rule_and_sorts_by_distance() -> None:
    sites = [
        SiteRecord(site_id="b", name="Pier", lat=51.0, lon=4.0),
        SiteRecord(site_id="a", name="Quarry", lat=51.001, lon=4.0),
        SiteRecord(site_id="c", name="Quarry", aliases=["Pit"]),
        SiteRecord(site_id="d", name="Far", lat=52.0, lon=4.0),
    ]
    found = nearby("quarry", 51.0, 4.0, sites)
    assert [(m.site_id, m.matched_by) for m in found] == [
        ("b", "distance"),
        ("a", "name"),
        ("c", "name"),
    ]
    assert found[0].distance_m == 0 and found[1].distance_m == 111
    assert found[2].distance_m is None
    assert [m.matched_by for m in nearby("  pit ", None, None, sites)] == ["alias"]


async def test_nearby_finds_a_log_site_by_position(owner_client: AsyncClient) -> None:
    body = await nearby_get(owner_client, lat=44.5005, lon=1.9)
    assert [s["site_id"] for s in body["log"]] == ["ressel"]
    hit = body["log"][0]
    assert hit["matched_by"] == "distance" and 50 <= hit["distance_m"] <= 60
    assert hit["origin"] == "log" and hit["dives"] == 1 and hit["type"] == "cave"
    assert body["commons"] == []


async def test_nearby_finds_a_log_site_by_name(owner_client: AsyncClient) -> None:
    body = await nearby_get(owner_client, name="zeelandbrug")
    assert [(s["site_id"], s["matched_by"]) for s in body["log"]] == [("zeelandbrug", "name")]
    assert body["log"][0]["distance_m"] is None and body["log"][0]["dives"] == 3


async def test_nearby_name_and_point_together(owner_client: AsyncClient) -> None:
    body = await nearby_get(owner_client, name="Ressel", lat=51.6, lon=3.9)
    assert [(s["site_id"], s["matched_by"]) for s in body["log"]] == [
        ("zeelandbrug", "distance"),
        ("ressel", "name"),
    ]
    assert body["log"][0]["distance_m"] == 0


async def test_nearby_radius_and_limit(owner_client: AsyncClient) -> None:
    assert (await nearby_get(owner_client, lat=44.3, lon=1.7))["log"] == []
    wide = await nearby_get(owner_client, lat=44.15, lon=1.55, radius_m=50_000)
    assert [s["site_id"] for s in wide["log"]] == ["secret", "ressel"]
    one = await nearby_get(owner_client, lat=44.15, lon=1.55, radius_m=50_000, limit=1)
    assert [s["site_id"] for s in one["log"]] == ["secret"]


@pytest.mark.parametrize(
    "params",
    [{}, {"lat": 44.5}, {"lon": 1.9, "name": "x"}, {"lat": 91, "lon": 0}, {"name": "  "}],
)
async def test_nearby_rejects_incomplete_queries(
    owner_client: AsyncClient, params: dict[str, Any]
) -> None:
    response = await owner_client.get(f"{ADMIN}/sites/nearby", params=params)
    assert response.status_code == 422


async def test_nearby_is_not_taken_for_a_site_id(owner_client: AsyncClient) -> None:
    response = await owner_client.get(f"{ADMIN}/sites/nearby", params={"name": "nowhere"})
    assert response.json() == {"log": [], "commons": []}


async def test_nearby_lists_unused_commons_sites(commons_owner_client: AsyncClient) -> None:
    body = await nearby_get(commons_owner_client, lat=44.6005, lon=1.7)
    assert body["log"] == []
    assert [s["site_id"] for s in body["commons"]] == ["fra-commons-only"]
    hit = body["commons"][0]
    assert hit["matched_by"] == "distance" and hit["name"] == "Commons Spring"


async def test_nearby_commons_by_alias(commons_owner_client: AsyncClient) -> None:
    body = await nearby_get(commons_owner_client, name="la source")
    assert [(s["site_id"], s["matched_by"]) for s in body["commons"]] == [
        ("fra-commons-only", "alias")
    ]


async def test_nearby_keeps_log_sites_out_of_the_commons_list(
    commons_owner_client: AsyncClient,
) -> None:
    body = await nearby_get(commons_owner_client, lat=44.51, lon=1.91, radius_m=2000)
    assert [s["site_id"] for s in body["log"]] == ["ressel"]
    assert body["commons"] == []


async def test_nearby_needs_the_owner(client: AsyncClient) -> None:
    response = await client.get(f"{ADMIN}/sites/nearby", params={"name": "x"})
    assert response.status_code in (401, 403)


# ── lookups ─────────────────────────────────────────────────────────────────


async def test_countries_are_public_sorted_and_cached(client: AsyncClient) -> None:
    response = await client.get(f"{META}/countries")
    assert response.status_code == 200
    assert response.headers["cache-control"].startswith("public")
    rows = response.json()
    assert {"iso3": "NLD", "iso2": "NL", "name": "Netherlands"} in rows
    names = [r["name"] for r in rows]
    assert names == sorted(names, key=str.casefold)


async def test_licences_are_the_allowlist(client: AsyncClient) -> None:
    response = await client.get(f"{META}/licences")
    assert response.status_code == 200
    rows = response.json()
    assert {r["id"] for r in rows} == LICENCE_ALLOWLIST
    assert all(r["url"].startswith("https://creativecommons.org/") for r in rows)
    assert rows[0]["id"] == "CC0-1.0"


async def test_site_fields_come_from_the_overlay_rules(owner_client: AsyncClient) -> None:
    response = await owner_client.get(f"{ADMIN}/meta/site-fields")
    assert response.status_code == 200
    body = response.json()
    assert body["objective"] == list(OBJECTIVE_FIELDS)
    assert body["personal"] == list(PERSONAL_FIELDS)
    assert "lat" in body["objective"] and "summary" in body["preference"]
    assert body["additive"] == ["aliases", "maps", "media"]


async def test_site_fields_need_the_owner(client: AsyncClient) -> None:
    response = await client.get(f"{ADMIN}/meta/site-fields")
    assert response.status_code in (401, 403)


# ── site note and coordinate ranges ─────────────────────────────────────────


async def site_body(client: AsyncClient, site_id: str, **changes: Any) -> dict[str, Any]:
    """The editor body of a stored site, with changes applied."""
    site = (await client.get(f"{ADMIN}/sites/{site_id}")).json()
    body = {
        "site_id": site["id"],
        "name": site["name"],
        "country": site["country"],
        "region": site["region"],
        "type": site["site_type"],
        "lat": site["lat"],
        "lon": site["lon"],
        "description_md": site["description_md"],
    }
    return body | changes


async def test_site_note_becomes_the_changelog_entry(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    commits = record_commits(store, monkeypatch)
    body = await site_body(owner_client, "ressel", lat=44.52, note="Moved the pin to the pool")
    response = await owner_client.put(f"{ADMIN}/sites/ressel", json=body)
    assert response.status_code == 200, response.text
    site = response.json()
    assert site["revision"] == 2
    assert site["changelog"][0]["note"] == "Moved the pin to the pool"
    assert commits == ["Update site ressel: Moved the pin to the pool"]
    meta, _ = read_markdown(store.site_path("ressel"))
    assert "note" not in meta


async def test_site_without_note_keeps_the_default_entry(owner_client: AsyncClient) -> None:
    body = await site_body(owner_client, "ressel", lat=44.52)
    site = (await owner_client.put(f"{ADMIN}/sites/ressel", json=body)).json()
    assert site["changelog"][0]["note"] == "Update site ressel"


async def test_site_note_without_objective_change_adds_no_revision(
    owner_client: AsyncClient,
) -> None:
    body = await site_body(owner_client, "ressel", note="Nothing really")
    site = (await owner_client.put(f"{ADMIN}/sites/ressel", json=body)).json()
    assert site["revision"] == 1 and site["changelog"] == []


@pytest.mark.parametrize(
    ("changes", "loc"),
    [
        ({"lat": 95}, ["body", "lat"]),
        ({"lon": -181}, ["body", "lon"]),
        ({"access": {"lat": -91, "lon": 0}}, ["body", "access"]),
        ({"access": {"lat": 0, "lon": 200}}, ["body", "access"]),
    ],
)
async def test_site_coordinates_out_of_range_are_422(
    owner_client: AsyncClient, changes: dict[str, Any], loc: list[str]
) -> None:
    body = {"site_id": "nld-test", "name": "Test", "country": "NLD"} | changes
    response = await owner_client.post(f"{ADMIN}/sites", json=body)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == loc


async def test_site_access_point_in_range_is_kept(owner_client: AsyncClient) -> None:
    body = {
        "site_id": "nld-test",
        "name": "Test",
        "country": "NLD",
        "lat": 51.5,
        "lon": 4.1,
        "access": {"lat": 51.501, "lon": 4.1, "note": "Gate"},
    }
    response = await owner_client.post(f"{ADMIN}/sites", json=body)
    assert response.status_code == 201, response.text
    assert response.json()["access"] == {"lat": 51.501, "lon": 4.1, "note": "Gate"}


# ── attachment credits ──────────────────────────────────────────────────────


def jpeg() -> bytes:
    """A small JPEG to upload."""
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (30, 80, 160)).save(buf, format="JPEG")
    return buf.getvalue()


async def site_photo(client: AsyncClient) -> str:
    """Upload a photo to the Ressel and return its id."""
    response = await client.post(
        f"{ADMIN}/sites/ressel/attachments", files={"file": ("a.jpg", jpeg(), "image/jpeg")}
    )
    assert response.status_code == 201, response.text
    assert response.json()["licence"] is None
    return str(response.json()["id"])


async def test_attachment_credit_is_stored_and_normalised(
    owner_client: AsyncClient, store: Store
) -> None:
    media_id = await site_photo(owner_client)
    response = await owner_client.patch(
        f"{ADMIN}/attachments/{media_id}",
        json={"licence": "cc by-sa 4.0", "author": "A. Diver", "source": "https://example.org/p"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["licence"] == "CC-BY-SA-4.0" and body["author"] == "A. Diver"
    assert body["source"] == "https://example.org/p"
    text = store.site_path("ressel").read_text()
    assert "licence: CC-BY-SA-4.0" in text and "author: A. Diver" in text
    public = (await owner_client.get("/api/v1/dive/sites/ressel")).json()
    assert public["site"]["attachments"][0]["licence"] == "CC-BY-SA-4.0"


async def test_attachment_credit_rejects_other_licences(owner_client: AsyncClient) -> None:
    media_id = await site_photo(owner_client)
    response = await owner_client.patch(
        f"{ADMIN}/attachments/{media_id}", json={"licence": "All rights reserved"}
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "licence"]


async def test_attachment_credit_clears_with_an_empty_string(
    owner_client: AsyncClient, store: Store
) -> None:
    media_id = await site_photo(owner_client)
    await owner_client.patch(
        f"{ADMIN}/attachments/{media_id}", json={"licence": "CC0", "author": "Me"}
    )
    response = await owner_client.patch(
        f"{ADMIN}/attachments/{media_id}", json={"licence": "", "author": " "}
    )
    assert response.json()["licence"] is None and response.json()["author"] is None
    assert "licence:" not in store.site_path("ressel").read_text()


# ── OSM seed ────────────────────────────────────────────────────────────────


class FakeOverpass:
    """Answers every query with the tiny Overpass fixture, or fails."""

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[tuple[float, float, int]] = []

    async def fetch(self, lat: float, lon: float, radius_m: int) -> dict[str, Any]:
        """The fixture response, recording the call."""
        self.calls.append((lat, lon, radius_m))
        if self.fail:
            raise OverpassError("Overpass did not answer within 15 s (test)")
        return tiny_osm()


@pytest.fixture
def overpass() -> FakeOverpass:
    return FakeOverpass()


@pytest_asyncio.fixture
async def seed_client(state: AuthState, overpass: FakeOverpass) -> AsyncIterator[AsyncClient]:
    """An owner client whose app asks the fake Overpass."""
    app: FastAPI = create_app()
    app.dependency_overrides[get_overpass_client] = lambda: overpass
    token = await auth_service.create_session(state, "owner@example.com", "pytest")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        c.cookies.set(get_settings().SESSION_COOKIE_NAME, token)
        yield c


async def test_seed_builds_a_starter_map_without_saving(
    seed_client: AsyncClient,
    overpass: FakeOverpass,
    store: Store,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commits = record_commits(store, monkeypatch)
    maps = set(store.maps)
    response = await seed_client.post(f"{ADMIN}/sites/zeelandbrug/maps/seed", json={})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "osm" and body["radius_m"] == 900 and body["elements"] == 5
    assert overpass.calls == [(51.6, 3.9, 900)]
    site_map = body["map"]
    assert site_map["kind"] == "sitemap" and site_map["north"] == 0
    assert site_map["origin"] == {"lat": 51.6, "lon": 3.9}
    assert {n["type"] for n in site_map["nodes"]} == {"object", "entry"}
    assert commits == [] and set(store.maps) == maps


async def test_seed_map_saves_through_the_map_endpoint(seed_client: AsyncClient) -> None:
    seeded = (await seed_client.post(f"{ADMIN}/sites/zeelandbrug/maps/seed", json={})).json()
    created = await seed_client.post(
        f"{ADMIN}/sites/zeelandbrug/maps", json={"data": seeded["map"], "note": "From OSM"}
    )
    assert created.status_code == 201, created.text


async def test_seed_radius_by_type_and_by_request(
    seed_client: AsyncClient, overpass: FakeOverpass
) -> None:
    await seed_client.post(f"{ADMIN}/sites/ressel/maps/seed", json={})
    await seed_client.post(f"{ADMIN}/sites/ressel/maps/seed", json={"radius_m": 300})
    assert [call[2] for call in overpass.calls] == [250, 300]


async def test_seed_overpass_failure_is_503(
    seed_client: AsyncClient, overpass: FakeOverpass
) -> None:
    overpass.fail = True
    response = await seed_client.post(f"{ADMIN}/sites/zeelandbrug/maps/seed", json={})
    assert response.status_code == 503
    assert "Overpass" in response.json()["detail"]


async def test_seed_needs_a_placed_site(seed_client: AsyncClient, overpass: FakeOverpass) -> None:
    created = await seed_client.post(
        f"{ADMIN}/sites", json={"site_id": "nld-nowhere", "name": "Nowhere", "country": "NLD"}
    )
    assert created.status_code == 201
    unplaced = await seed_client.post(f"{ADMIN}/sites/nld-nowhere/maps/seed", json={})
    assert unplaced.status_code == 404
    assert unplaced.json()["detail"] == "Site has no coordinates"
    unknown = await seed_client.post(f"{ADMIN}/sites/nld-missing/maps/seed", json={})
    assert unknown.status_code == 404
    assert overpass.calls == []


@pytest.mark.parametrize("body", [{"source": "bing"}, {"radius_m": 10}, {"radius_m": 5000}])
async def test_seed_rejects_bad_requests(seed_client: AsyncClient, body: dict[str, Any]) -> None:
    response = await seed_client.post(f"{ADMIN}/sites/zeelandbrug/maps/seed", json=body)
    assert response.status_code == 422


async def test_seed_needs_the_owner(client: AsyncClient) -> None:
    response = await client.post(f"{ADMIN}/sites/zeelandbrug/maps/seed", json={})
    assert response.status_code in (401, 403)


async def test_http_overpass_client_fails_fast_when_nothing_answers() -> None:
    client = HttpOverpassClient(endpoints=("http://127.0.0.1:9/api/interpreter",), timeout_s=2)
    with pytest.raises(OverpassError):
        await client.fetch(51.6, 3.9, 100)


def test_overpass_query_carries_the_timeout_and_radius() -> None:
    query = overpass_query(51.6, 3.9, 300, timeout_s=15)
    assert query.startswith("[out:json][timeout:15];")
    assert "(around:300,51.6,3.9)" in query
