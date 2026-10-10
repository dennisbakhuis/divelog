import io
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from divelog_server.core.config import get_settings
from divelog_server.main import create_app
from divelog_server.store.files import read_markdown
from divelog_server.store.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "subsurface.xml"


async def test_public_index_hides_private_and_draft(client: AsyncClient) -> None:
    response = await client.get("/api/v1/dive/dives")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert [d["number"] for d in body["dives"]] == [2, 1]
    assert body["dives"][0]["spark"] == [0, 400, 0]
    assert body["dives"][1]["spark"] is None
    assert body["dives"][1]["buddies"][0]["name"] == "Kim"
    assert "cave" in body["tags"]
    assert body["years"] == [2024]
    assert body["regions"] == ["lot-karst", "zeeland-delta"]
    assert body["countries"][0]["country_code"] in ("NL", "FR")


async def test_public_detail_with_neighbours(client: AsyncClient) -> None:
    response = await client.get("/api/v1/dive/dives/2")
    assert response.status_code == 200
    body = response.json()
    assert body["prev_number"] == 1
    assert body["next_number"] is None
    assert body["prev_site_name"] == "Zeelandbrug"
    assert body["next_site_name"] is None
    assert body["sac_l_min"] == 9.0
    assert body["sac_basis"] == "22.2 L · 200→90 bar"
    assert body["profile"][1] == {
        "t": 600,
        "d": 40.0,
        "temp": 13.0,
        "ndl": 5,
        "stop": None,
        "tts": None,
    }
    assert body["profile_meta"]["gf"] == "55/85"
    assert (await client.get("/api/v1/dive/dives/3")).status_code == 404
    assert (await client.get("/api/v1/dive/dives/999")).status_code == 404


async def test_detail_context(client: AsyncClient, owner_client: AsyncClient) -> None:
    body = (await client.get("/api/v1/dive/dives/1")).json()
    assert body["site_dive_index"] == 1
    assert body["site"]["dives"] == 1
    assert body["day_index"] is None and body["same_day"] == []
    assert body["context_facts"] == ["coldest dive in the log", "first dive in the log"]
    kim = body["buddies"][0]
    assert kim["slug"] == "kim"
    assert kim["dives_together"] == 1
    assert kim["first_dive"] == kim["last_dive"] == "2024-01-01"
    assert kim["first_together"] is True
    people = (await client.get("/api/v1/dive/people")).json()
    assert next(p for p in people if p["slug"] == "kim")["stats"]["dives"] == kim["dives_together"]
    index = (await client.get("/api/v1/dive/dives")).json()
    assert set(index["dives"][1]["buddies"][0]) == {"slug", "name", "avatar_url"}
    private = (await owner_client.get("/api/v1/dive/dives/3")).json()
    assert private["site_dive_index"] == 2
    assert private["site"]["dives"] == 2


async def test_owner_sees_private_dive_and_neighbours(owner_client: AsyncClient) -> None:
    response = await owner_client.get("/api/v1/dive/dives/3")
    assert response.status_code == 200
    assert response.json()["prev_number"] == 2
    assert response.json()["next_number"] == 4
    assert response.json()["prev_site_name"] == "Ressel"
    assert response.json()["next_site_name"] == "Zeelandbrug"
    assert response.json()["sac_l_min"] is None


async def test_stats_and_summary(client: AsyncClient) -> None:
    stats = (await client.get("/api/v1/dive/stats")).json()
    assert stats["total_dives"] == 3
    assert stats["private_dives"] == 1
    assert stats["max_depth_m"] == 55.0
    summary = (await client.get("/api/v1/dive/summary")).json()
    assert summary["cave_dives"] == 1
    assert summary["scooter_dives"] == 1


async def test_timeline(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/dive/timeline")).json()
    assert body["years"] == [{"year": 2024, "dives": 3}]
    assert body["latest"]["number"] == 2
    assert body["latest"]["date"] == "2024-01-02"


async def test_site_page(client: AsyncClient) -> None:
    response = await client.get("/api/v1/dive/sites/zeelandbrug")
    assert response.status_code == 200
    body = response.json()
    assert [d["number"] for d in body["dives"]] == [1]
    assert body["site"]["region_name"] == "The Zeeland Delta"
    assert body["site"]["prices"][0]["note"] == "Free shore access"
    assert body["site"]["dives"] == 1
    assert body["people"][0]["slug"] == "kim"


async def test_regions(client: AsyncClient) -> None:
    regions = (await client.get("/api/v1/dive/regions")).json()
    assert [r["id"] for r in regions] == ["lot-karst", "zeeland-delta"]
    delta = (await client.get("/api/v1/dive/regions/zeeland-delta")).json()
    assert delta["body_md"].startswith("Rebuilt")
    assert [s["slug"] for s in delta["sites"]] == ["zeelandbrug"]
    assert delta["dives"] == 1
    assert delta["stats"]["top_site"] == {"slug": "zeelandbrug", "name": "Zeelandbrug", "dives": 1}
    assert delta["stats"]["max_depth_m"] == 20
    assert [m["slug"] for m in delta["map_sites"]] == ["zeelandbrug"]
    assert regions[0]["stats"] is None and regions[0]["map_sites"] == []


async def test_people_countries(client: AsyncClient) -> None:
    people = (await client.get("/api/v1/dive/people")).json()
    assert people[0]["countries"] == ["NL"]
    kim = (await client.get("/api/v1/dive/people/kim")).json()
    assert [c["country_code"] for c in kim["countries"]] == ["NL"]
    assert kim["countries"][0]["dives"] == 1


async def test_admin_crud_dive(owner_client: AsyncClient, store: Store) -> None:
    nxt = await owner_client.get("/api/v1/admin/dives/next-number")
    assert nxt.json()["number"] == 5
    payload = {
        "number": 5,
        "title": "New dive",
        "date": "2024-03-01",
        "time_in": "09:30",
        "duration_min": 50,
        "max_depth_m": 18.5,
        "site_id": "ressel",
        "tags": ["night"],
        "visibility": "public",
        "people_ids": ["kim_de_boer"],
        "body_md": "Dark and lovely.",
        "profile": [{"t": 0, "d": 0}, {"t": 60, "d": 18.5}],
    }
    created = await owner_client.post("/api/v1/admin/dives", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["id"] == 5
    assert created.json()["buddies"][0]["name"] == "Kim"
    assert created.json()["people_ids"] == ["kim_de_boer"]
    assert created.json()["country"] == "FRA"
    meta, body = read_markdown(store.dive_path(5))
    assert meta["site"] == "ressel" and body.strip() == "Dark and lovely."

    dup = await owner_client.post("/api/v1/admin/dives", json=payload)
    assert dup.status_code == 409

    payload["title"] = "Renamed"
    updated = await owner_client.put("/api/v1/admin/dives/5", json=payload)
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed"

    public = await owner_client.get("/api/v1/dive/dives/5")
    assert public.json()["profile"][1]["d"] == 18.5

    payload["site_id"] = "nowhere"
    assert (await owner_client.put("/api/v1/admin/dives/5", json=payload)).status_code == 422

    deleted = await owner_client.delete("/api/v1/admin/dives/5")
    assert deleted.status_code == 204
    assert (await owner_client.get("/api/v1/dive/dives/5")).status_code == 404
    assert not store.dive_path(5).exists()


async def test_photo_upload_creates_variants(owner_client: AsyncClient) -> None:
    image = Image.new("RGB", (1200, 800), (30, 80, 160))
    buf = io.BytesIO()
    image.save(buf, format="JPEG")
    response = await owner_client.post(
        "/api/v1/admin/dives/1/attachments",
        files={"file": ("test.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["width"] == 1200
    assert set(body["variants"]) == {"thumb", "w800"}
    assert body["url"].startswith("/media/")
    assert body["public"] is True

    served = await owner_client.get(body["variants"]["thumb"])
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/webp"

    detail = await owner_client.get("/api/v1/dive/dives/1")
    assert detail.json()["cover_attachment_id"] == body["id"]

    index = await owner_client.get("/api/v1/dive/dives")
    assert index.json()["dives"][-1]["has_photos"] is True

    patched = await owner_client.patch(
        f"/api/v1/admin/attachments/{body['id']}", json={"caption": "Blue", "public": False}
    )
    assert patched.json()["caption"] == "Blue"
    owner_client.cookies.clear()
    assert (await owner_client.get(body["url"])).status_code == 404


async def test_private_scan_served_only_to_owner(
    client: AsyncClient, owner_client: AsyncClient, store: Store
) -> None:
    media_root = Path(store.root.parent / "media")
    (media_root / "scans").mkdir(parents=True, exist_ok=True)
    (media_root / "scans" / "divelog_00001.jpg").write_bytes(b"jpegish")
    assert (await client.get("/media/scans/divelog_00001.jpg")).status_code == 404
    allowed = await owner_client.get("/media/scans/divelog_00001.jpg")
    assert allowed.status_code == 200
    assert allowed.headers["cache-control"] == "private, no-store"


async def test_media_serves_byte_ranges(client: AsyncClient, store: Store) -> None:
    """Map tiles are one large archive per region, read piecemeal with Range requests."""
    tiles = Path(store.root.parent / "media" / "tiles")
    tiles.mkdir(parents=True, exist_ok=True)
    (tiles / "nl.pmtiles").write_bytes(bytes(range(64)))
    part = await client.get("/media/tiles/nl.pmtiles", headers={"Range": "bytes=8-15"})
    assert part.status_code == 206
    assert part.content == bytes(range(8, 16))
    assert part.headers["content-range"] == "bytes 8-15/64"
    whole = await client.get("/media/tiles/nl.pmtiles")
    assert whole.status_code == 200
    assert whole.headers["accept-ranges"] == "bytes"
    assert len(whole.content) == 64


async def test_avatar_upload(owner_client: AsyncClient) -> None:
    image = Image.new("RGB", (900, 600), (200, 100, 50))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    response = await owner_client.post(
        "/api/v1/admin/people/kim_de_boer/avatar",
        files={"file": ("me.png", buf.getvalue(), "image/png")},
    )
    assert response.status_code == 201, response.text
    assert "avatar" in response.json()["variants"]
    person = (await owner_client.get("/api/v1/dive/people/kim")).json()["person"]
    assert person["avatar_url"].endswith("-avatar.webp")
    served = await owner_client.get(person["avatar_url"])
    assert served.status_code == 200
    with Image.open(io.BytesIO(served.content)) as avatar:
        assert avatar.size == (256, 256)


async def test_subsurface_import_creates_drafts(owner_client: AsyncClient) -> None:
    response = await owner_client.post(
        "/api/v1/admin/import/subsurface",
        files={"file": ("log.xml", FIXTURE.read_bytes(), "application/xml")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == [120, 121]
    assert body["sites_created"] == 2

    admin_list = await owner_client.get("/api/v1/admin/dives")
    drafts = [d for d in admin_list.json() if d["visibility"] == "draft"]
    assert {d["number"] for d in drafts} >= {120, 121}
    row = next(d for d in drafts if d["number"] == 120)
    assert row["site_name"] == "Émergence du Ressel"
    assert set(row) == {
        "number",
        "date",
        "title",
        "site_name",
        "max_depth_m",
        "duration_min",
        "tags",
        "attachments",
        "visibility",
    }
    ressel = (await owner_client.get("/api/v1/admin/dives/120")).json()
    assert ressel["gas"] == "nitrox"
    assert sorted(p["name"] for p in ressel["private"]["people"]) == ["Kim", "Mark"]
    assert ressel["site"]["name"] == "Émergence du Ressel"
    assert len(ressel["profile"]) == 5

    people = (await owner_client.get("/api/v1/admin/people")).json()
    assert "mark_de_vries" in {p["id"] for p in people}

    again = await owner_client.post(
        "/api/v1/admin/import/subsurface",
        files={"file": ("log.xml", FIXTURE.read_bytes(), "application/xml")},
    )
    assert again.json()["created"] == []
    assert again.json()["skipped"] == 2
    imports = (await owner_client.get("/api/v1/admin/imports")).json()
    assert len(imports) == 2


async def test_site_maps_and_upload(owner_client: AsyncClient, store: Store) -> None:
    stick = {
        "kind": "stickmap",
        "title": "Line",
        "nodes": [
            {"id": "a", "x": 0, "y": 0, "type": "entrance", "label": "In"},
            {"id": "b", "x": 30, "y": 10, "depth": 12},
        ],
        "edges": [{"from": "a", "to": "b", "distance": 32, "azimuth": 90}],
        "lines": [
            {
                "id": "l1",
                "kind": "depth",
                "depth": 10,
                "points": [{"x": 0, "y": 5}, {"x": 40, "y": 5}],
            }
        ],
        "origin": {"lat": 44.5, "lon": 1.9},
    }
    created = await owner_client.post(
        "/api/v1/admin/sites/ressel/maps", json={"data": stick, "note": "first survey"}
    )
    assert created.status_code == 201, created.text
    map_id = created.json()["id"]
    assert map_id == "ressel-1"
    assert created.json()["revision"] == 1
    assert created.json()["edges"][0]["from"] == "a"
    assert created.json()["lines"][0]["kind"] == "depth"
    assert store.map_path(map_id).exists()

    unchanged = await owner_client.put(f"/api/v1/admin/maps/{map_id}", json={"data": stick})
    assert unchanged.json()["revision"] == 1

    stick["nodes"].append({"id": "c", "x": 60, "y": 0, "type": "object", "object_kind": "wipkip"})
    updated = await owner_client.put(f"/api/v1/admin/maps/{map_id}", json={"data": stick})
    assert updated.json()["revision"] == 2
    assert updated.json()["nodes"][2]["object_kind"] == "wipkip"

    bad = await owner_client.post(
        "/api/v1/admin/sites/ressel/maps", json={"data": {"kind": "treasure"}}
    )
    assert bad.status_code == 422

    lake = await owner_client.post(
        "/api/v1/admin/sites/ressel/maps",
        json={
            "data": {"kind": "sitemap", "nodes": [{"id": "w", "x": 10, "y": 5, "type": "wreck"}]}
        },
    )
    lake_id = lake.json()["id"]
    ordered = await owner_client.put(
        "/api/v1/admin/sites/ressel/maps/order", json=[lake_id, map_id]
    )
    assert [m["id"] for m in ordered.json()] == [lake_id, map_id]

    image = Image.new("RGB", (600, 400), (200, 200, 200))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    upload = await owner_client.post(
        "/api/v1/admin/sites/ressel/attachments?kind=map",
        files={"file": ("map.png", buf.getvalue(), "image/png")},
    )
    assert upload.status_code == 201, upload.text

    public = (await owner_client.get("/api/v1/dive/sites/ressel")).json()["site"]
    assert [m["collection"] for m in public["maps"]] == ["drawn", "drawn"]
    assert [m["drawn"]["kind"] for m in public["maps"]] == ["sitemap", "stickmap"]
    assert [a["kind"] for a in public["attachments"]] == ["map"]

    starred = await owner_client.patch(
        "/api/v1/admin/sites/ressel", json={"default_map": f"drawn:{map_id}"}
    )
    assert starred.json()["default_map"] == f"drawn:{map_id}"
    first = (await owner_client.get("/api/v1/dive/sites/ressel")).json()["site"]["maps"][0]
    assert first["ref"] == f"drawn:{map_id}"

    gone = await owner_client.delete(f"/api/v1/admin/maps/{lake_id}")
    assert gone.status_code == 204
    assert len((await owner_client.get("/api/v1/dive/sites/ressel")).json()["site"]["maps"]) == 1


async def test_dive_map_annotation(owner_client: AsyncClient) -> None:
    created = await owner_client.post(
        "/api/v1/admin/sites/zeelandbrug/maps",
        json={
            "data": {
                "nodes": [
                    {"id": "a", "x": 0, "y": 0, "type": "entrance"},
                    {"id": "b", "x": 30, "y": 0, "depth": 10},
                    {"id": "c", "x": 60, "y": 0, "depth": 20},
                ],
                "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}],
            }
        },
    )
    map_id = created.json()["id"]
    dive = (await owner_client.get("/api/v1/admin/dives/1")).json()
    body = {k: v for k, v in dive.items() if k in DIVE_IN_FIELDS}
    body["map_annotation"] = {
        "map_id": map_id,
        "route": [
            {"from": "a", "to": "b"},
            {"from": "b", "to": "c"},
            {"from": "c", "to": "b"},
            {"from": "b", "to": "zzz"},
        ],
        "turn": "b",
        "pins": [{"id": "p1", "x": 15, "y": 5, "note": "silty"}],
        "path": [{"x": 0, "y": 0}, {"x": 12.5, "y": 4}],
        "turn_at": 5,
        "note": "short one",
    }
    saved = await owner_client.put("/api/v1/admin/dives/1", json=body)
    assert saved.status_code == 200, saved.text
    annotation = saved.json()["map_annotation"]
    assert annotation["route"] == [
        {"from": "a", "to": "b"},
        {"from": "b", "to": "c"},
        {"from": "c", "to": "b"},
    ], "legs keep their order and direction, and a leg swum back is kept"

    assert annotation["turn"] == "b"
    assert annotation["path"] == [{"x": 0, "y": 0}, {"x": 12.5, "y": 4}]
    assert annotation["turn_at"] is None, "a turn index past the track is dropped"
    assert saved.json()["map"]["id"] == map_id
    site = (await owner_client.get("/api/v1/dive/sites/zeelandbrug")).json()
    assert [r["number"] for r in site["routes"]] == [1]
    assert site["routes"][0]["annotation"]["map_id"] == map_id

    body["map_annotation"]["map_id"] = "missing"
    assert (await owner_client.put("/api/v1/admin/dives/1", json=body)).status_code == 422

    body["map_annotation"] = None
    cleared = await owner_client.put("/api/v1/admin/dives/1", json=body)
    assert cleared.json()["map_annotation"] is None
    assert cleared.json()["map"]["id"] == map_id, "the site's drawn map still shows"
    assert cleared.json()["attachments"][0]["kind"] == "scan"


DIVE_IN_FIELDS = {
    "number",
    "title",
    "date",
    "time_in",
    "time_out",
    "duration_min",
    "max_depth_m",
    "avg_depth_m",
    "water_temp_c",
    "air_temp_c",
    "visibility_m",
    "site_id",
    "section",
    "trip_id",
    "tags",
    "gas",
    "o2_pct",
    "he_pct",
    "mode",
    "suit",
    "weights_kg",
    "rating",
    "gear_setup_id",
    "guide",
    "body_md",
    "notes_nl",
    "visibility",
    "people_ids",
    "cover_attachment_id",
    "computer",
    "flags",
}


async def test_people_admin(owner_client: AsyncClient, store: Store) -> None:
    created = await owner_client.post(
        "/api/v1/admin/people",
        json={"first_name": "Hanna", "last_name": "van Dijk", "aliases": ["H. van Dijk"]},
    )
    assert created.status_code == 201, created.text
    assert created.json()["id"] == "hanna_van_dijk"
    assert created.json()["slug"] == "hanna"
    assert store.person_path("hanna_van_dijk").exists()

    second = await owner_client.post("/api/v1/admin/people", json={"first_name": "Kim"})
    assert second.json()["id"] == "kim" and second.json()["slug"] == "kim-2"

    renamed = await owner_client.put(
        "/api/v1/admin/people/hanna_van_dijk",
        json={"first_name": "Hanna", "last_name": "van Dijk", "alias": "Han"},
    )
    assert renamed.json()["slug"] == "han"
    public = (await owner_client.get("/api/v1/dive/people")).json()
    assert {p["slug"] for p in public} >= {"kim"}


async def test_site_admin(owner_client: AsyncClient, store: Store) -> None:
    payload = {
        "site_id": "nld-new",
        "name": "New Lake",
        "country": "NLD",
        "type": "lake",
        "lat": 52.0,
        "lon": 6.0,
        "description_md": "A new lake.",
        "prices": [{"date": "2025-01-01", "amount": 7.5, "currency": "EUR", "note": "day pass"}],
    }
    created = await owner_client.post("/api/v1/admin/sites", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["country_code"] == "NL"
    meta, body = read_markdown(store.site_path("nld-new"))
    assert meta["prices"][0]["amount"] == 7.5 and body.strip() == "A new lake."
    assert (await owner_client.post("/api/v1/admin/sites", json=payload)).status_code == 409
    assert (await owner_client.delete("/api/v1/admin/sites/zeelandbrug")).status_code == 409
    assert (await owner_client.delete("/api/v1/admin/sites/nld-new")).status_code == 204


async def test_gear_page(owner_client: AsyncClient) -> None:
    item = await owner_client.post(
        "/api/v1/admin/gear/items",
        json={"name": "Perdix", "category": "computer", "brand": "Shearwater"},
    )
    assert item.status_code == 201
    setup = await owner_client.post(
        "/api/v1/admin/gear/setups",
        json={"slug": "rec", "name": "Recreational", "item_ids": [item.json()["id"]]},
    )
    assert setup.status_code == 201
    page = await owner_client.get("/api/v1/dive/gear")
    assert page.status_code == 200
    assert page.json()["setups"][0]["items"][0]["name"] == "Perdix"


async def test_repo_status_and_reload(owner_client: AsyncClient, store: Store) -> None:
    status = await owner_client.get("/api/v1/admin/repo/status")
    assert status.json()["state"] == "disabled"
    (store.root / "dives" / "00007.md").write_text(
        "---\nnumber: 7\ndate: '2024-02-01'\nduration_min: 30\nsite: ressel\n---\n"
    )
    await owner_client.post("/api/v1/admin/repo/reload")
    assert (await owner_client.get("/api/v1/dive/dives/7")).status_code == 200


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["dives"] == 4
    assert response.json()["repo"] == "disabled"


async def test_markdown_bodies_have_html_siblings(
    client: AsyncClient, owner_client: AsyncClient
) -> None:
    region = (await client.get("/api/v1/dive/regions/zeeland-delta")).json()
    assert region["body_html"] == "<p>Rebuilt after 1953.</p>"
    dive = (await client.get("/api/v1/dive/dives/1")).json()
    assert "body_html" in dive
    assert "description_html" in dive["site"]
    person = (await owner_client.get("/api/v1/dive/people/kim")).json()["person"]
    assert person["bio_html"].startswith("<p>Dives with me")
    await owner_client.post(
        "/api/v1/admin/gear/items",
        json={"name": "Perdix", "category": "computer", "notes_md": "**Bright** screen"},
    )
    await owner_client.post(
        "/api/v1/admin/gear/setups",
        json={"slug": "rec", "name": "Rec", "description_md": "# Kit"},
    )
    gear = (await owner_client.get("/api/v1/dive/gear")).json()
    setup = gear["setups"][0]
    assert setup["description_html"] == "<h2>Kit</h2>"
    item = next(i for i in gear["items"] if i["name"] == "Perdix")
    assert item["notes_html"] == "<p><strong>Bright</strong> screen</p>"


async def test_openapi_document_is_served_without_debug(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEBUG", "false")
    get_settings.cache_clear()
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        response = await c.get("/api/openapi.json")
        docs = await c.get("/api/docs")
    get_settings.cache_clear()
    assert response.status_code == 200
    schemas = response.json()["components"]["schemas"]
    assert "description_html" in schemas["SiteOut"]["required"]
    assert "private" in schemas["DiveOut"]["required"]
    assert docs.status_code == 404
