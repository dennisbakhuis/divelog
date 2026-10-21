"""Trip overrides through the editor: a save keeps merge and cover, slugs stay file names."""

import pytest
from httpx import AsyncClient

from divelog_server.store.files import read_markdown, write_markdown
from divelog_server.store.store import Store

TRIPS = "/api/v1/admin/trips"


async def test_a_save_keeps_merge_and_cover(owner_client: AsyncClient, store: Store) -> None:
    path = store.trip_path("lot-2024-01")
    write_markdown(
        path,
        {"slug": "lot-2024-01", "name": "Lot", "merge": ["lot-2024-02"], "cover": "photo-1"},
        "",
    )
    store.load()
    saved = await owner_client.put(
        f"{TRIPS}/lot-2024-01",
        json={"slug": "lot-2024-01", "name": "Lot again", "description_md": "Caves."},
    )
    assert saved.status_code == 200, saved.text
    meta, body = read_markdown(path)
    assert meta["name"] == "Lot again"
    assert meta["merge"] == ["lot-2024-02"]
    assert meta["cover"] == "photo-1"
    assert body.strip() == "Caves."


@pytest.mark.parametrize("slug", ["../../etc/passwd", "Lot", "lot/2024", "lot 2024", ".."])
async def test_a_slug_that_is_not_a_plain_slug_is_refused(
    owner_client: AsyncClient, store: Store, slug: str
) -> None:
    response = await owner_client.post(TRIPS, json={"slug": slug, "name": "X"})
    assert response.status_code == 422
    assert slug not in store.trips
