"""Saving a dive's map annotation: renamed nodes, the revision it is pinned to, the site's maps."""

from typing import Any

from httpx import AsyncClient

ADMIN = "/api/v1/admin"
SITE = "fra-commons-only"
MAP = f"{SITE}-1"


async def dive_body(client: AsyncClient, number: int, **changes: Any) -> dict[str, Any]:
    dive = (await client.get(f"{ADMIN}/dives/{number}")).json()
    body = {k: dive[k] for k in ("number", "date", "duration_min", "max_depth_m", "title")}
    return body | {"site_id": dive["site_id"]} | changes


def annotation(route: list[tuple[str, str]], **fields: Any) -> dict[str, Any]:
    return {"map_id": MAP, "route": [{"from": a, "to": b} for a, b in route]} | fields


async def test_renamed_nodes_are_followed_and_the_annotation_moves_to_the_map_revision(
    commons_owner_client: AsyncClient,
) -> None:
    body = await dive_body(
        commons_owner_client,
        1,
        site_id=SITE,
        map_annotation=annotation([("a", "old-b"), ("old-b", "c")], revision=1, turn="old-b"),
    )
    saved = await commons_owner_client.put(f"{ADMIN}/dives/1", json=body)
    assert saved.status_code == 200, saved.text
    out = saved.json()
    assert out["map_annotation"]["route"] == [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}]
    assert out["map_annotation"]["turn"] == "b"
    assert out["map_annotation"]["revision"] == 2
    public = (await commons_owner_client.get("/api/v1/dive/dives/1")).json()
    assert public["annotation_stale"] is False
    assert public["annotation_dropped_legs"] == 0


async def test_a_dropped_leg_keeps_the_revision_so_the_dive_stays_stale(
    commons_owner_client: AsyncClient,
) -> None:
    body = await dive_body(
        commons_owner_client,
        1,
        site_id=SITE,
        map_annotation=annotation([("old-b", "c"), ("c", "gone")], revision=1),
    )
    saved = await commons_owner_client.put(f"{ADMIN}/dives/1", json=body)
    assert saved.status_code == 200, saved.text
    out = saved.json()
    assert out["map_annotation"]["route"] == [{"from": "b", "to": "c"}]
    assert out["map_annotation"]["revision"] == 1
    public = (await commons_owner_client.get("/api/v1/dive/dives/1")).json()
    assert public["annotation_stale"] is True


async def test_a_lost_turn_keeps_the_revision(commons_owner_client: AsyncClient) -> None:
    body = await dive_body(
        commons_owner_client,
        1,
        site_id=SITE,
        map_annotation=annotation([("a", "b")], revision=1, turn="nowhere"),
    )
    out = (await commons_owner_client.put(f"{ADMIN}/dives/1", json=body)).json()
    assert out["map_annotation"]["turn"] is None
    assert out["map_annotation"]["revision"] == 1


async def test_a_map_of_another_site_is_refused(commons_owner_client: AsyncClient) -> None:
    dive = (await commons_owner_client.get(f"{ADMIN}/dives/1")).json()
    assert dive["site_id"] != SITE
    body = await dive_body(commons_owner_client, 1, map_annotation=annotation([("a", "b")]))
    refused = await commons_owner_client.put(f"{ADMIN}/dives/1", json=body)
    assert refused.status_code == 422
    assert "not a map of the dive's site" in refused.json()["detail"]
    without_site = body | {"site_id": None}
    assert (
        await commons_owner_client.put(f"{ADMIN}/dives/1", json=without_site)
    ).status_code == 422
