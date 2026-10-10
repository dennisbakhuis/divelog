"""Dive edits outside the form (cover, attachment order), gas derivation and site ids."""

import io
import json
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from PIL import Image

from divelog_server.store.files import read_markdown
from divelog_server.store.slug import SITE_ID, site_id_for, slugify
from divelog_server.store.store import Store

ADMIN = "/api/v1/admin"
FIXTURE = Path(__file__).parent / "fixtures" / "subsurface.xml"
KIT_SITE_IDS = (
    Path(__file__).parents[2] / "kit" / "src" / "lib" / "core" / "admin" / "__fixtures__"
) / "site-ids.json"


def jpeg() -> bytes:
    """A small JPEG to upload."""
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (30, 80, 160)).save(buf, format="JPEG")
    return buf.getvalue()


async def upload(client: AsyncClient, number: int, name: str) -> str:
    """Attach a photo to a dive and return its id."""
    response = await client.post(
        f"{ADMIN}/dives/{number}/attachments",
        files={"file": (name, jpeg(), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


def record_commits(store: Store, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Collect the commit messages the store writes from now on."""
    messages: list[str] = []

    async def commit(message: str) -> None:
        messages.append(message)

    monkeypatch.setattr(store.git, "commit", commit)
    return messages


def dive_body(**overrides: Any) -> dict[str, Any]:
    """A minimal valid ``DiveIn`` for dive #50."""
    return {"number": 50, "date": "2026-10-10", "duration_min": 40, "max_depth_m": 12} | overrides


async def test_patch_sets_only_the_cover(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = await upload(owner_client, 1, "a.jpg")
    second = await upload(owner_client, 1, "b.jpg")
    assert store.dives[1].cover == first
    before = store.dives[1].model_dump(exclude={"cover"})
    commits = record_commits(store, monkeypatch)

    patched = await owner_client.patch(f"{ADMIN}/dives/1", json={"cover_attachment_id": second})
    assert patched.status_code == 200, patched.text
    assert patched.json()["cover_attachment_id"] == second
    assert store.dives[1].model_dump(exclude={"cover"}) == before
    assert commits == ["Set cover of dive #1"]
    meta, _ = read_markdown(store.dive_path(1))
    assert meta["cover"] == second

    form = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert form["cover_attachment_id"] == second


async def test_patch_rejects_a_foreign_cover_and_clears_with_null(
    owner_client: AsyncClient, store: Store
) -> None:
    photo = await upload(owner_client, 1, "a.jpg")
    other = await upload(owner_client, 2, "b.jpg")
    wrong = await owner_client.patch(f"{ADMIN}/dives/1", json={"cover_attachment_id": other})
    assert wrong.status_code == 422
    assert store.dives[1].cover == photo

    untouched = await owner_client.patch(f"{ADMIN}/dives/1", json={})
    assert untouched.status_code == 200 and untouched.json()["cover_attachment_id"] == photo

    cleared = await owner_client.patch(f"{ADMIN}/dives/1", json={"cover_attachment_id": None})
    assert cleared.json()["cover_attachment_id"] is None
    assert (await owner_client.patch(f"{ADMIN}/dives/999", json={})).status_code == 404


async def test_patch_is_in_the_openapi_document(owner_client: AsyncClient) -> None:
    spec = (await owner_client.get("/api/openapi.json")).json()
    paths = spec["paths"]
    assert "patch" in paths["/api/v1/admin/dives/{number}"]
    assert "put" in paths["/api/v1/admin/dives/{number}/attachments/order"]
    assert "DivePatch" in spec["components"]["schemas"]


async def test_attachments_reorder_in_one_commit(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    ids = [await upload(owner_client, 2, f"{n}.jpg") for n in "abc"]
    commits = record_commits(store, monkeypatch)
    response = await owner_client.put(
        f"{ADMIN}/dives/2/attachments/order", json=[ids[2], "nope", ids[0]]
    )
    assert response.status_code == 200, response.text
    assert [a["id"] for a in response.json()] == [ids[2], ids[0], ids[1]]
    assert [a["sort"] for a in response.json()] == [0, 1, 2]
    assert commits == ["Reorder attachments of dive #2"]
    stored = sorted(store.dives[2].media, key=lambda m: m.sort)
    assert [m.id for m in stored] == [ids[2], ids[0], ids[1]]
    assert (
        await owner_client.put(f"{ADMIN}/dives/999/attachments/order", json=[])
    ).status_code == (404)


async def test_new_dive_without_tanks_has_no_gas(owner_client: AsyncClient, store: Store) -> None:
    created = await owner_client.post(f"{ADMIN}/dives", json=dive_body())
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["gas"] is None and body["o2_pct"] is None and body["he_pct"] is None
    meta, _ = read_markdown(store.dive_path(50))
    assert "gas" in meta and meta["gas"] is None

    await store.reload()
    assert store.dives[50].gas is None
    public = (await owner_client.get("/api/v1/dive/dives/50")).json()
    assert public["gas"] is None
    index = (await owner_client.get("/api/v1/dive/dives")).json()["dives"]
    row = next(d for d in index if d["number"] == 50)
    assert row["gas"] is None and row["gases"] == []


async def test_tanks_override_the_top_level_gas(owner_client: AsyncClient) -> None:
    tank = {"cylinder": "D12", "volume_l": 24, "gas": "nitrox", "o2_pct": 32, "role": "back"}
    created = await owner_client.post(
        f"{ADMIN}/dives", json=dive_body(gas="air", o2_pct=21, tanks=[tank])
    )
    assert created.status_code == 201, created.text
    assert created.json()["gas"] == "nitrox" and created.json()["o2_pct"] == 32

    emptied = await owner_client.put(f"{ADMIN}/dives/50", json=dive_body(tanks=[]))
    assert emptied.status_code == 200, emptied.text
    assert emptied.json()["gas"] is None and emptied.json()["cylinder"] is None


async def test_put_without_tanks_keeps_the_stored_gas(
    owner_client: AsyncClient, store: Store
) -> None:
    store.dives[3].gas = "nitrox"
    store.dives[3].o2_pct = 28
    body = {"number": 3, "date": "2024-01-03", "duration_min": 45, "max_depth_m": 55}
    saved = await owner_client.put(f"{ADMIN}/dives/3", json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["gas"] == "nitrox" and saved.json()["o2_pct"] == 28

    explicit = await owner_client.put(
        f"{ADMIN}/dives/3", json=body | {"gas": "air", "o2_pct": None}
    )
    assert explicit.json()["gas"] == "air" and explicit.json()["o2_pct"] is None


async def test_dive_still_needs_depth_and_duration(owner_client: AsyncClient) -> None:
    missing = await owner_client.post(
        f"{ADMIN}/dives", json={"number": 51, "date": "2026-10-10", "duration_min": None}
    )
    assert missing.status_code == 422
    fields = {tuple(e["loc"])[-1] for e in missing.json()["detail"]}
    assert {"duration_min", "max_depth_m"} <= fields


def test_site_id_for_prefixes_the_country() -> None:
    assert site_id_for("MEX", "Cenote Tortuga") == "mex-cenote-tortuga"
    assert site_id_for(None, "Émergence du Ressel") == "xxx-emergence-du-ressel"
    assert site_id_for("NLD", "!!!") == "nld-site"
    assert slugify("  Été — Lac ") == "ete-lac"
    assert SITE_ID.match(site_id_for("", ""))


@pytest.mark.skipif(not KIT_SITE_IDS.is_file(), reason="outside the monorepo checkout")
def test_site_ids_match_the_kit_fixture() -> None:
    cases = json.loads(KIT_SITE_IDS.read_text(encoding="utf-8"))
    assert cases
    for case in cases:
        assert site_id_for(case["country"], case["name"]) == case["id"], case


async def test_subsurface_import_creates_prefixed_site_ids(
    owner_client: AsyncClient, store: Store
) -> None:
    response = await owner_client.post(
        f"{ADMIN}/import/subsurface",
        files={"file": ("log.xml", FIXTURE.read_bytes(), "application/xml")},
    )
    assert response.status_code == 200, response.text
    created = [s for s in response.json()["sites"] if s["outcome"] == "created"]
    assert [s["site_id"] for s in created] == ["xxx-emergence-du-ressel"]
    assert all(SITE_ID.match(s["site_id"]) for s in created)


async def test_create_site_checks_the_id_pattern(owner_client: AsyncClient) -> None:
    bad = await owner_client.post(
        f"{ADMIN}/sites", json={"site_id": "New Lake", "name": "New Lake", "country": "NLD"}
    )
    assert bad.status_code == 422
    assert SITE_ID.pattern in bad.json()["detail"]
    good = await owner_client.post(
        f"{ADMIN}/sites", json={"site_id": "nld-new-lake", "name": "New Lake", "country": "NLD"}
    )
    assert good.status_code == 201, good.text
    assert (await owner_client.get(f"{ADMIN}/sites/nld-new-lake")).status_code == 200
    assert (await owner_client.get(f"{ADMIN}/sites/nld-free")).status_code == 404
