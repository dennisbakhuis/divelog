from httpx import AsyncClient

from divelog_server.services.dives import haversine_km
from divelog_server.store.models import SiteRecord
from divelog_server.store.store import Store


async def test_public_dive_hides_private_material(client: AsyncClient) -> None:
    response = await client.get("/api/v1/dive/dives/1")
    assert response.status_code == 200
    assert response.headers["cache-control"].startswith("public")
    body = response.json()
    public_keys = ("slug", "name", "avatar_url")
    assert [{k: b[k] for k in public_keys} for b in body["buddies"]] == [
        {"slug": "kim", "name": "Kim", "avatar_url": None}
    ]
    assert body["buddies"][0]["dives_together"] == 1
    assert "email" not in body["buddies"][0]
    assert body["private"] is None
    assert body["attachments"] == []
    assert body["site"]["private"] is None
    assert "Bakhuis" not in response.text
    assert "PADI" not in response.text
    assert "kim@example.com" not in response.text


async def test_owner_sees_private_material_uncached(owner_client: AsyncClient) -> None:
    response = await owner_client.get("/api/v1/dive/dives/1")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert body["private"]["people"][0]["last_name"] == "Bakhuis"
    assert body["private"]["people"][0]["email"] == "kim@example.com"
    assert body["private"]["operator"] == "Some Guide, PADI 123"
    assert [a["kind"] for a in body["attachments"]] == ["scan"]
    assert body["site"]["private"]["reference_maps"][0]["public"] is False
    assert body["site"]["private"]["reference_maps"][0]["warning"] == "No redistribution."


async def test_hidden_person_never_appears(client: AsyncClient) -> None:
    dive = (await client.get("/api/v1/dive/dives/2")).json()
    assert dive["buddies"] == []
    people = (await client.get("/api/v1/dive/people")).json()
    assert [p["slug"] for p in people] == ["kim"]
    assert (await client.get("/api/v1/dive/people/ghost")).status_code == 404


async def test_person_page(client: AsyncClient, owner_client: AsyncClient) -> None:
    public = (await client.get("/api/v1/dive/people/kim")).json()
    assert public["person"]["name"] == "Kim"
    assert public["person"]["private"] is None
    assert public["person"]["stats"]["dives"] == 1
    assert [d["number"] for d in public["dives"]] == [1]
    private = (await owner_client.get("/api/v1/dive/people/kim")).json()
    assert private["person"]["private"]["last_name"] == "Bakhuis"
    assert private["person"]["bio_md"].startswith("Dives with me")


async def test_reference_maps_are_owner_only(
    client: AsyncClient, owner_client: AsyncClient
) -> None:
    public = (await client.get("/api/v1/dive/sites/zeelandbrug")).json()["site"]
    assert public["maps"] == []
    assert public["private"] is None
    denied = await client.get("/api/v1/admin/files/reference/zeelandbrug/map.png")
    assert denied.status_code == 401
    allowed = await owner_client.get("/api/v1/admin/files/reference/zeelandbrug/map.png")
    assert allowed.status_code == 200
    assert allowed.headers["cache-control"] == "private, no-store"
    assert (await client.get("/media/repo/maps/reference/zeelandbrug/map.png")).status_code == 404
    assert (await client.get("/media/repo/../sites/ressel.md")).status_code in (404, 400)


async def test_region_only_site_hides_coordinates(
    client: AsyncClient, owner_client: AsyncClient
) -> None:
    sites = {s["slug"]: s for s in (await client.get("/api/v1/dive/sites")).json()}
    assert sites["secret"]["lat"] is None
    owner_sites = {s["slug"]: s for s in (await owner_client.get("/api/v1/dive/sites")).json()}
    assert owner_sites["secret"]["lat"] == 44.1


async def test_search_text_carries_private_names_only_for_owner(
    client: AsyncClient, owner_client: AsyncClient
) -> None:
    public = (await client.get("/api/v1/dive/dives")).json()["dives"]
    first = next(d for d in public if d["number"] == 1)
    assert "Zeelandbrug" in first["search_text"]
    assert "Bakhuis" not in first["search_text"]
    private = (await owner_client.get("/api/v1/dive/dives")).json()["dives"]
    first = next(d for d in private if d["number"] == 1)
    assert "Bakhuis" in first["search_text"]


def test_haversine() -> None:
    assert haversine_km(52.0, 4.0, 52.0, 4.0) == 0
    assert abs(haversine_km(0.0, 0.0, 0.0, 1.0) - 111.19) < 0.05
    assert abs(haversine_km(51.6, 3.9, 44.5, 1.9) - 802) < 5


async def test_nearby_sites_skip_region_only(client: AsyncClient, store: Store) -> None:
    for site_id, lat, lon, visibility in (
        ("near", 44.52, 1.9, "exact"),
        ("far", 44.9, 1.9, "exact"),
        ("hidden-near", 44.51, 1.91, "region_only"),
    ):
        store.sites[site_id] = SiteRecord(
            site_id=site_id,
            name=site_id,
            country="FRA",
            type="cave",
            lat=lat,
            lon=lon,
            location_visibility=visibility,
        )
    ressel = (await client.get("/api/v1/dive/sites/ressel")).json()
    assert [(n["slug"], n["distance_km"], n["dives"]) for n in ressel["nearby"]] == [
        ("near", 2.2, 0)
    ]
    near = (await client.get("/api/v1/dive/sites/near")).json()
    assert [(n["slug"], n["dives"]) for n in near["nearby"]] == [("ressel", 1)]
    assert (await client.get("/api/v1/dive/sites/hidden-near")).json()["nearby"] == []
    assert (await client.get("/api/v1/dive/sites/secret")).json()["nearby"] == []
    assert "hidden-near" not in str(near) and "secret" not in str(near)


async def test_site_provenance_is_public(client: AsyncClient, owner_client: AsyncClient) -> None:
    public = (await client.get("/api/v1/dive/sites/zeelandbrug")).json()["site"]
    assert public["verified"] == "web"
    assert public["geo_source"] == "OSM way/1"
    assert public["origin"] == "log"
    assert public["attribution"] is None
    assert public["description_html"] == "<p>Under the pillars.</p>"
    assert public["description_md"].strip() == "Under the pillars."
    assert "Coordinate from the OSM way." not in str(public)
    owner = (await owner_client.get("/api/v1/dive/sites/zeelandbrug")).json()["site"]
    assert set(owner["private"]) == {"notes", "reference_maps", "pin"}
    assert owner["private"]["pin"] is None
    assert owner["private"]["notes"] == "Coordinate from the OSM way."
    assert owner["verified"] == "web"
