import io
from pathlib import Path

from httpx import AsyncClient
from PIL import Image

from divelog_server.store.files import read_markdown
from divelog_server.store.store import Store


async def test_admin_get_site(owner_client: AsyncClient, client: AsyncClient) -> None:
    listed = (await owner_client.get("/api/v1/admin/sites")).json()
    single = await owner_client.get("/api/v1/admin/sites/secret")
    assert single.status_code == 200
    assert single.json() == next(s for s in listed if s["id"] == "secret")
    assert {"maps", "default_map", "private"} <= set(single.json())
    assert single.json()["lat"] == 44.1
    assert (await owner_client.get("/api/v1/admin/sites/nope")).status_code == 404
    assert (await client.get("/api/v1/admin/sites/secret")).status_code == 401


async def test_admin_person_detail_and_counts(owner_client: AsyncClient) -> None:
    people = (await owner_client.get("/api/v1/admin/people")).json()
    assert {p["id"]: p["dives"] for p in people} == {"ghost": 1, "kim_de_boer": 1}
    kim = await owner_client.get("/api/v1/admin/people/kim_de_boer")
    assert kim.status_code == 200
    assert kim.json()["dives"] == 1
    assert kim.json()["email"] == "kim@example.com"
    assert (await owner_client.get("/api/v1/admin/people/nobody")).status_code == 404


async def test_admin_delete_person(owner_client: AsyncClient, store: Store) -> None:
    refused = await owner_client.delete("/api/v1/admin/people/kim_de_boer")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Still named on 1 dive"
    assert store.person_path("kim_de_boer").exists()

    created = await owner_client.post("/api/v1/admin/people", json={"first_name": "Hanna"})
    assert created.status_code == 201 and created.json()["dives"] == 0
    buf = io.BytesIO()
    Image.new("RGB", (300, 300), (10, 20, 30)).save(buf, format="PNG")
    avatar = await owner_client.post(
        "/api/v1/admin/people/hanna/avatar", files={"file": ("h.png", buf.getvalue(), "image/png")}
    )
    assert avatar.status_code == 201
    media_root = Path(store.root.parent / "media")
    assert list(media_root.rglob("*.webp"))

    deleted = await owner_client.delete("/api/v1/admin/people/hanna")
    assert deleted.status_code == 204
    assert not store.person_path("hanna").exists()
    assert "hanna" not in store.people
    assert not [p for p in media_root.rglob("*") if p.is_file()]
    assert (await owner_client.delete("/api/v1/admin/people/hanna")).status_code == 404


def _abroad(store: Store, number: int, day: str) -> None:
    store.dive_path(number).write_text(
        f"---\nnumber: {number}\ndate: '{day}'\nduration_min: 40\nsite: ressel\n---\n"
    )


async def test_admin_trips_derived_and_overrides(owner_client: AsyncClient, store: Store) -> None:
    _abroad(store, 10, "2024-01-05")
    _abroad(store, 11, "2024-01-07")
    store.load()

    listed = (await owner_client.get("/api/v1/admin/trips")).json()
    assert [(t["slug"], t["custom"]) for t in listed] == [("lot-2024-01", False)]
    derived = (await owner_client.get("/api/v1/admin/trips/lot-2024-01")).json()
    assert derived["name"] == "Lot Jan 2024"
    assert (derived["start_date"], derived["end_date"], derived["days"]) == (
        "2024-01-05",
        "2024-01-07",
        3,
    )
    assert (await owner_client.delete("/api/v1/admin/trips/lot-2024-01")).status_code == 404
    assert (await owner_client.get("/api/v1/admin/trips/nope")).status_code == 404

    created = await owner_client.post(
        "/api/v1/admin/trips",
        json={"slug": "lot-2024-01", "name": "Quercy", "description_md": "Caves."},
    )
    assert created.status_code == 201, created.text
    assert created.json()["custom"] is True and created.json()["days"] == 3
    await owner_client.post(
        "/api/v1/admin/trips",
        json={"slug": "later", "name": "Later", "start_date": "2030-01-01"},
    )
    listed = (await owner_client.get("/api/v1/admin/trips")).json()
    assert [(t["slug"], t["custom"]) for t in listed] == [
        ("later", True),
        ("lot-2024-01", True),
    ]
    custom = (await owner_client.get("/api/v1/admin/trips/lot-2024-01")).json()
    assert (custom["name"], custom["description_md"], custom["start_date"]) == (
        "Quercy",
        "Caves.",
        None,
    )
    public = (await owner_client.get("/api/v1/dive/trips")).json()
    assert public[0]["name"] == "Quercy"

    assert (await owner_client.delete("/api/v1/admin/trips/lot-2024-01")).status_code == 204
    assert not store.trip_path("lot-2024-01").exists()
    restored = (await owner_client.get("/api/v1/admin/trips/lot-2024-01")).json()
    assert (restored["name"], restored["custom"]) == ("Lot Jan 2024", False)
    assert (await owner_client.get("/api/v1/dive/trips")).json()[0]["name"] == "Lot Jan 2024"


async def test_admin_regions(owner_client: AsyncClient, store: Store) -> None:
    regions = (await owner_client.get("/api/v1/admin/regions")).json()
    assert [r["id"] for r in regions] == ["lot-karst", "zeeland-delta"]
    delta = regions[1]
    assert delta["body_md"].startswith("Rebuilt")
    assert delta["waters"] == ["Oosterschelde", "Grevelingenmeer"]
    assert delta["dives"] == 2

    payload = {
        "id": "red-sea-north",
        "name": "The northern Red Sea",
        "country": "egy",
        "waters": ["Strait of Gubal", " "],
        "body_md": "Wrecks.",
    }
    created = await owner_client.post("/api/v1/admin/regions", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["country"] == "EGY" and created.json()["country_code"] == "EG"
    assert created.json()["body_md"] == "Wrecks."
    meta, body = read_markdown(store.region_path("red-sea-north"))
    assert meta == {
        "region": "red-sea-north",
        "name": "The northern Red Sea",
        "country": "EGY",
        "waters": ["Strait of Gubal"],
    }
    assert body.strip() == "Wrecks."
    assert (await owner_client.post("/api/v1/admin/regions", json=payload)).status_code == 409
    bad = await owner_client.post("/api/v1/admin/regions", json={**payload, "id": "Red Sea"})
    assert bad.status_code == 422

    mismatch = await owner_client.put(
        "/api/v1/admin/regions/red-sea-north", json={**payload, "id": "other"}
    )
    assert mismatch.status_code == 422
    missing = await owner_client.put("/api/v1/admin/regions/nope", json={**payload, "id": "nope"})
    assert missing.status_code == 404
    updated = await owner_client.put(
        "/api/v1/admin/regions/red-sea-north", json={**payload, "name": "Northern Red Sea"}
    )
    assert updated.status_code == 200 and updated.json()["name"] == "Northern Red Sea"
    assert store.regions["red-sea-north"].name == "Northern Red Sea"

    refused = await owner_client.delete("/api/v1/admin/regions/lot-karst")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Still used by 1 site"
    assert (await owner_client.delete("/api/v1/admin/regions/red-sea-north")).status_code == 204
    assert not store.region_path("red-sea-north").exists()
    assert (await owner_client.delete("/api/v1/admin/regions/red-sea-north")).status_code == 404
