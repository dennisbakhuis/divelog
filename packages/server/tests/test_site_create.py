"""Creating a site: country, region and id prefix are checked, and the id is claimed once."""

import asyncio
from typing import Any

from httpx import AsyncClient

from divelog_server.store.store import Store

SITES = "/api/v1/admin/sites"


def errors(response: Any) -> dict[str, str]:
    return {d["loc"][-1]: d["msg"] for d in response.json()["detail"]}


async def test_an_unknown_country_or_region_is_refused(owner_client: AsyncClient) -> None:
    response = await owner_client.post(
        SITES, json={"site_id": "zzz-new-place", "name": "New", "country": "zzz", "region": "nope"}
    )
    assert response.status_code == 422
    assert set(errors(response)) == {"country", "region"}


async def test_the_id_starts_with_the_country(owner_client: AsyncClient) -> None:
    response = await owner_client.post(
        SITES, json={"site_id": "nld-kreidesee", "name": "Kreidesee", "country": "DEU"}
    )
    assert response.status_code == 422
    assert errors(response) == {"site_id": "A site id here starts with deu-"}
    unplaced = await owner_client.post(SITES, json={"site_id": "deu-somewhere", "name": "S"})
    assert unplaced.status_code == 422
    assert errors(unplaced) == {"site_id": "A site id here starts with xxx-"}


async def test_the_country_is_stored_in_capitals(owner_client: AsyncClient, store: Store) -> None:
    region = next(iter(store.regions))
    response = await owner_client.post(
        SITES,
        json={"site_id": "deu-kreidesee", "name": "Kreidesee", "country": "deu", "region": region},
    )
    assert response.status_code == 201, response.text
    assert store.sites["deu-kreidesee"].country == "DEU"
    assert store.sites["deu-kreidesee"].region == region


async def test_a_taken_id_names_where_it_is_taken(commons_owner_client: AsyncClient) -> None:
    commons = await commons_owner_client.post(
        SITES, json={"site_id": "fra-commons-only", "name": "X", "country": "FRA"}
    )
    assert commons.status_code == 409
    assert commons.json()["detail"] == "Site id fra-commons-only is already in use in the commons"
    body = {"site_id": "fra-mine", "name": "Mine", "country": "FRA"}
    assert (await commons_owner_client.post(SITES, json=body)).status_code == 201
    taken = await commons_owner_client.post(SITES, json=body)
    assert taken.status_code == 409
    assert taken.json()["detail"] == "Site id fra-mine is already in use in your log"


async def test_two_creates_waiting_on_a_write_make_one_site(
    owner_client: AsyncClient, store: Store
) -> None:
    body = {"site_id": "deu-hemmoor", "name": "Kreidesee Hemmoor", "country": "DEU"}
    async with store.lock:
        pending = [
            asyncio.create_task(owner_client.post(SITES, json=body)),
            asyncio.create_task(owner_client.post(SITES, json=body | {"name": "B"})),
        ]
        await asyncio.sleep(0.1)
    first, second = await asyncio.gather(*pending)
    assert sorted([first.status_code, second.status_code]) == [201, 409]
    winner = first if first.status_code == 201 else second
    assert store.sites["deu-hemmoor"].name == winner.json()["name"]


async def test_nearby_keeps_an_exact_name_ahead_of_nearer_sites(owner_client: AsyncClient) -> None:
    for slug, lat in (("alpha-pit", 53.6950), ("beta-pit", 53.6951), ("gamma-pit", 53.6952)):
        site = {"site_id": f"deu-{slug}", "name": slug.replace("-", " ").title(), "country": "DEU"}
        created = await owner_client.post(SITES, json=site | {"lat": lat, "lon": 9.15})
        assert created.status_code == 201, created.text
    far = {"site_id": "deu-kreidesee-hemmoor", "name": "Kreidesee Hemmoor", "country": "DEU"}
    assert (await owner_client.post(SITES, json=far | {"lat": 53.7, "lon": 9.2})).status_code == 201
    found = await owner_client.get(
        f"{SITES}/nearby",
        params={"name": "kreidesee hemmoor", "lat": 53.695, "lon": 9.15, "limit": 2},
    )
    assert found.status_code == 200
    ids = [hit["site_id"] for hit in found.json()["log"]]
    assert len(ids) == 2
    assert ids[1] == "deu-kreidesee-hemmoor", "the nearest first, the exact name kept"
