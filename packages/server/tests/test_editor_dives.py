"""The dive editor's helper endpoints: template, paged list, publish, preview, gear and imports."""

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from divelog_server.schemas.dive import DiveIn
from divelog_server.services.admin_views import dive_input
from divelog_server.store.models import DiveRecord, PersonRecord, SiteRecord, TripRecord
from divelog_server.store.store import Store

ADMIN = "/api/v1/admin"
FIXTURES = Path(__file__).parent / "fixtures"
SUBSURFACE = FIXTURES / "subsurface.xml"
PERDIX = FIXTURES / "perdix_11.xml"


def record_commits(store: Store, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Collect the commit messages the store writes from now on."""
    messages: list[str] = []

    async def commit(message: str) -> None:
        messages.append(message)

    monkeypatch.setattr(store.git, "commit", commit)
    return messages


async def template(client: AsyncClient, **params: str) -> dict[str, Any]:
    """The dive template for the given query."""
    response = await client.get(f"{ADMIN}/dives/template", params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def page(client: AsyncClient, **params: str | int) -> dict[str, Any]:
    """One page of the admin dive list."""
    response = await client.get(f"{ADMIN}/dives/page", params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def numbers(body: dict[str, Any]) -> list[int]:
    """The dive numbers of a page, in order."""
    return [row["number"] for row in body["items"]]


# ── template ────────────────────────────────────────────────────────────────


async def test_template_defaults_to_today_and_the_latest_dive(owner_client: AsyncClient) -> None:
    body = await template(owner_client)
    assert body["date"] == date.today().isoformat()
    assert body["next_number"] == 5
    assert body["previous"]["number"] == 4
    assert body["at_site"] is None


async def test_template_previous_is_the_form_input_of_the_dive_before_the_date(
    owner_client: AsyncClient,
) -> None:
    previous = (await template(owner_client, date="2024-01-02"))["previous"]
    assert previous["number"] == 2
    assert previous["site_id"] == "ressel"
    assert previous["people_ids"] == ["ghost"]
    assert previous["gas"] == "nitrox" and previous["o2_pct"] == 32
    assert previous["cylinder"] == "2x D80"
    assert previous["profile"] is None
    assert set(previous) == set(DiveIn.model_fields)


async def test_template_previous_round_trips_as_a_new_dive(
    owner_client: AsyncClient, store: Store
) -> None:
    body = await template(owner_client, date="2024-01-01")
    copy = body["previous"] | {"number": body["next_number"], "date": "2024-02-01"}
    created = await owner_client.post(f"{ADMIN}/dives", json=copy)
    assert created.status_code == 201, created.text
    assert store.dives[5].site == "zeelandbrug"
    assert store.dives[5].people == ["kim_de_boer"]
    assert store.dives[5].body_md.strip() == "First dive."


async def test_template_before_the_first_dive_has_no_previous(owner_client: AsyncClient) -> None:
    body = await template(owner_client, date="2020-01-01")
    assert body["previous"] is None
    assert body["recent_sites"] == []


async def test_template_at_site_is_the_last_dive_there(owner_client: AsyncClient) -> None:
    body = await template(owner_client, site="zeelandbrug", date="2024-01-02")
    at_site = body["at_site"]
    assert at_site["number"] == 1 and at_site["water_temp_c"] == 12
    assert at_site["map_id"] is None


async def test_template_at_site_names_the_map_of_its_route(
    owner_client: AsyncClient, store: Store
) -> None:
    dive = store.dives[2].model_copy(update={"map_annotation": {"map_id": "ressel-1"}})
    await store.save_dive(dive, "annotate")
    body = await template(owner_client, site="ressel")
    assert body["at_site"]["number"] == 2 and body["at_site"]["map_id"] == "ressel-1"


async def test_template_unknown_site_has_no_at_site(owner_client: AsyncClient) -> None:
    assert (await template(owner_client, site="nowhere"))["at_site"] is None


async def test_template_recent_sites_by_last_dive(owner_client: AsyncClient) -> None:
    sites = (await template(owner_client, date="2024-01-04"))["recent_sites"]
    assert [s["site_id"] for s in sites] == ["zeelandbrug", "ressel"]
    assert sites[0]["dives"] == 3 and sites[0]["last_dive"] == "2024-01-04"
    assert sites[0]["country"] == "NLD" and sites[0]["region"] == "zeeland-delta"


async def test_template_recent_sites_stop_at_eight(owner_client: AsyncClient, store: Store) -> None:
    for i in range(10):
        site_id = f"nld-pit-{i}"
        await store.save_site(SiteRecord(site_id=site_id, name=f"Pit {i}"), "add")
        record = DiveRecord(
            number=10 + i, date=date(2025, 1, 1) + timedelta(days=i), duration_min=30, site=site_id
        )
        await store.save_dive(record, "add")
    sites = (await template(owner_client))["recent_sites"]
    assert len(sites) == 8
    assert sites[0]["site_id"] == "nld-pit-9"


async def test_template_frequent_people_count_the_last_two_years(owner_client: AsyncClient) -> None:
    people = (await template(owner_client, date="2024-02-01"))["frequent_people"]
    assert [(p["id"], p["dives"]) for p in people] == [("ghost", 1), ("kim_de_boer", 1)]
    assert people[1]["name"] == "Kim de Boer" and people[1]["slug"] == "kim"


async def test_template_frequent_people_outside_the_window_fall_back_to_names(
    owner_client: AsyncClient,
) -> None:
    people = (await template(owner_client, date="2026-10-10"))["frequent_people"]
    assert [p["dives"] for p in people] == [0, 0]
    assert [p["id"] for p in people] == ["ghost", "kim_de_boer"]


async def test_template_frequent_people_rank_and_stop_at_twelve(
    owner_client: AsyncClient, store: Store
) -> None:
    for i in range(14):
        await store.save_person(PersonRecord(id=f"p{i:02d}", slug=f"p{i}", first_name="Ann"), "a")
    dive = store.dives[3].model_copy(update={"people": ["p13", "kim_de_boer"]})
    await store.save_dive(dive, "buddies")
    people = (await template(owner_client, date="2024-02-01"))["frequent_people"]
    assert len(people) == 12
    assert [p["id"] for p in people[:2]] == ["kim_de_boer", "p13"]


async def winter_trip(store: Store) -> None:
    """A dated trip over the four fixture dives."""
    trip = TripRecord(
        slug="winter-2024", name="Winter", start_date=date(2024, 1, 1), end_date=date(2024, 1, 4)
    )
    await store.save_trip(trip, "add trip")


async def test_template_trip_for_date_from_the_derived_trips(
    owner_client: AsyncClient, store: Store
) -> None:
    await winter_trip(store)
    trip = (await template(owner_client, date="2024-01-02"))["trip_for_date"]
    assert trip["slug"] == "winter-2024" and trip["name"] == "Winter"
    assert trip["day_index"] == 2 and trip["days"] == 4 and trip["custom"] is True


async def test_template_trip_for_date_from_a_dated_override(owner_client: AsyncClient) -> None:
    created = await owner_client.post(
        f"{ADMIN}/trips",
        json={
            "slug": "bonaire-2025",
            "name": "Bonaire",
            "start_date": "2025-03-01",
            "end_date": "2025-03-10",
        },
    )
    assert created.status_code == 201, created.text
    trip = (await template(owner_client, date="2025-03-05"))["trip_for_date"]
    assert trip["slug"] == "bonaire-2025" and trip["day_index"] == 5 and trip["custom"] is True
    assert (await template(owner_client, date="2025-03-11"))["trip_for_date"] is None


async def test_template_needs_the_owner(client: AsyncClient) -> None:
    response = await client.get(f"{ADMIN}/dives/template")
    assert response.status_code in (401, 403)


def test_dive_input_clamps_and_drops_values_out_of_range() -> None:
    record = DiveRecord(
        number=7,
        date=date(2024, 1, 1),
        duration_min=0,
        max_depth_m=500,
        weights_kg=80,
        time_in="9:00",
        site="x",
        people=["a"],
    )
    result = dive_input(record)
    assert result.duration_min == 1 and result.max_depth_m == 400
    assert result.weights_kg is None and result.time_in is None
    assert result.site_id == "x" and result.people_ids == ["a"]


# ── paged list ──────────────────────────────────────────────────────────────


async def test_page_lists_newest_first_with_link_fields(owner_client: AsyncClient) -> None:
    body = await page(owner_client)
    assert numbers(body) == [4, 3, 2, 1]
    assert body["total"] == 4 and body["offset"] == 0 and body["limit"] == 100
    row = body["items"][3]
    assert row["site_id"] == "zeelandbrug" and row["time_in"] == "10:00"
    assert row["site_name"] == "Zeelandbrug"


async def test_page_rows_carry_the_trip(owner_client: AsyncClient, store: Store) -> None:
    await winter_trip(store)
    rows = {r["number"]: r for r in (await page(owner_client))["items"]}
    assert rows[2]["trip"] == {"slug": "winter-2024", "name": "Winter"}
    assert rows[4]["trip"] is None


async def test_page_offset_and_limit(owner_client: AsyncClient) -> None:
    body = await page(owner_client, offset=1, limit=2)
    assert numbers(body) == [3, 2]
    assert body["total"] == 4 and body["offset"] == 1 and body["limit"] == 2


async def test_page_filters_by_status(owner_client: AsyncClient) -> None:
    assert numbers(await page(owner_client, status="draft")) == [4]
    assert numbers(await page(owner_client, status="private")) == [3]
    assert (await page(owner_client, status="public"))["total"] == 2


@pytest.mark.parametrize(
    ("q", "expected"),
    [
        ("#2", [2]),
        ("3", [3]),
        ("zeeland", [4, 3, 1]),
        ("ZEELANDBRUG", [4, 3, 1]),
        ("kim", [1]),
        ("jansen", [1]),
        ("ressel ghost", [2]),
        ("ressel kim", []),
    ],
)
async def test_page_search(owner_client: AsyncClient, q: str, expected: list[int]) -> None:
    body = await page(owner_client, q=q)
    assert numbers(body) == expected
    assert body["total"] == len(expected)


async def test_page_search_matches_the_title(owner_client: AsyncClient, store: Store) -> None:
    dive = store.dives[3].model_copy(update={"title": "Night under the bridge"})
    await store.save_dive(dive, "title")
    assert numbers(await page(owner_client, q="night")) == [3]


@pytest.mark.parametrize(
    ("sort", "asc", "expected"),
    [
        ("number", "true", [1, 2, 3, 4]),
        ("number", "false", [4, 3, 2, 1]),
        ("depth", "true", [1, 4, 2, 3]),
        ("duration", "false", [2, 4, 3, 1]),
        ("date", "true", [1, 2, 3, 4]),
    ],
)
async def test_page_sorts(
    owner_client: AsyncClient, sort: str, asc: str, expected: list[int]
) -> None:
    assert numbers(await page(owner_client, sort=sort, asc=asc)) == expected


@pytest.mark.parametrize(
    "params", [{"sort": "rating"}, {"limit": 0}, {"offset": -1}, {"status": "secret"}]
)
async def test_page_rejects_bad_parameters(
    owner_client: AsyncClient, params: dict[str, str | int]
) -> None:
    response = await owner_client.get(f"{ADMIN}/dives/page", params=params)
    assert response.status_code == 422


async def test_old_list_endpoint_keeps_its_shape(owner_client: AsyncClient) -> None:
    rows = (await owner_client.get(f"{ADMIN}/dives")).json()
    assert isinstance(rows, list) and len(rows) == 4
    assert "site_id" not in rows[0] and "trip" not in rows[0]


# ── publish ─────────────────────────────────────────────────────────────────


async def test_publish_turns_drafts_public_in_one_commit(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    await store.save_dive(store.dives[3].model_copy(update={"visibility": "draft"}), "draft")
    commits = record_commits(store, monkeypatch)
    response = await owner_client.post(f"{ADMIN}/dives/publish", json={"numbers": [4, 3]})
    assert response.status_code == 200, response.text
    assert response.json() == {"published": [4, 3], "unchanged": []}
    assert store.dives[3].visibility == "public" and store.dives[4].visibility == "public"
    assert commits == ["Publish 2 dives: #4, #3"]
    assert "visibility: public" in store.dive_path(4).read_text()


async def test_publish_leaves_other_dives_alone(owner_client: AsyncClient, store: Store) -> None:
    response = await owner_client.post(f"{ADMIN}/dives/publish", json={"numbers": [1, 3, 4, 999]})
    assert response.json() == {"published": [4], "unchanged": [1, 3, 999]}
    assert store.dives[3].visibility == "private"


async def test_publish_needs_numbers(owner_client: AsyncClient) -> None:
    response = await owner_client.post(f"{ADMIN}/dives/publish", json={"numbers": []})
    assert response.status_code == 422


# ── markdown preview ────────────────────────────────────────────────────────


async def test_preview_renders_like_the_public_pages(owner_client: AsyncClient) -> None:
    response = await owner_client.post(
        f"{ADMIN}/preview/markdown", json={"md": "# Ressel\n\nA **deep** sump."}
    )
    assert response.status_code == 200
    html = response.json()["html"]
    assert "<h2>Ressel</h2>" in html and "<strong>deep</strong>" in html


async def test_preview_sanitises(owner_client: AsyncClient) -> None:
    response = await owner_client.post(
        f"{ADMIN}/preview/markdown", json={"md": "<script>alert(1)</script>[x](javascript:1)"}
    )
    html = response.json()["html"]
    assert "<script" not in html and 'href="javascript' not in html


async def test_preview_of_nothing_is_empty(owner_client: AsyncClient) -> None:
    response = await owner_client.post(f"{ADMIN}/preview/markdown", json={})
    assert response.json() == {"html": ""}


async def test_preview_needs_the_owner(client: AsyncClient) -> None:
    response = await client.post(f"{ADMIN}/preview/markdown", json={"md": "x"})
    assert response.status_code in (401, 403)


# ── gear setup template ─────────────────────────────────────────────────────

SETUP = {
    "slug": "doubles",
    "name": "Doubles",
    "tanks": [
        {"cylinder": "D12", "gas": "nitrox", "o2_pct": 32},
        {"cylinder": "S80", "gas": "nitrox", "o2_pct": 50, "role": "deco"},
    ],
    "suit": "Drysuit",
    "weights_kg": 4,
}


async def test_gear_setup_keeps_tanks_suit_and_weights(
    owner_client: AsyncClient, store: Store
) -> None:
    created = await owner_client.post(f"{ADMIN}/gear/setups", json=SETUP)
    assert created.status_code == 201, created.text
    body = created.json()
    assert [t["cylinder"] for t in body["tanks"]] == ["D12", "S80"]
    assert body["tanks"][0]["volume_l"] == 24
    assert body["suit"] == "Drysuit" and body["weights_kg"] == 4
    stored = json.loads((store.root / "gear" / "setups.json").read_text())
    assert stored[0]["tanks"][1]["role"] == "deco"
    listed = (await owner_client.get(f"{ADMIN}/gear/setups")).json()
    assert listed[0]["tanks"][1]["o2_pct"] == 50


async def test_gear_setup_update_clears_the_template(
    owner_client: AsyncClient, store: Store
) -> None:
    await owner_client.post(f"{ADMIN}/gear/setups", json=SETUP)
    updated = await owner_client.put(
        f"{ADMIN}/gear/setups/doubles", json={"slug": "doubles", "name": "Doubles", "suit": ""}
    )
    assert updated.status_code == 200
    assert updated.json()["tanks"] == [] and updated.json()["suit"] is None
    stored = json.loads((store.root / "gear" / "setups.json").read_text())
    assert "tanks" not in stored[0] and "suit" not in stored[0]


async def test_gear_setup_rejects_a_bad_tank(owner_client: AsyncClient) -> None:
    body = SETUP | {"tanks": [{"cylinder": "D12", "o2_pct": 101}]}
    response = await owner_client.post(f"{ADMIN}/gear/setups", json=body)
    assert response.status_code == 422


async def test_public_gear_page_shows_the_setup_template(
    owner_client: AsyncClient, client: AsyncClient
) -> None:
    await owner_client.post(f"{ADMIN}/gear/setups", json=SETUP)
    setups = (await client.get("/api/v1/dive/gear")).json()["setups"]
    assert setups[0]["suit"] == "Drysuit" and len(setups[0]["tanks"]) == 2


# ── import dry runs ─────────────────────────────────────────────────────────


def subsurface_file() -> dict[str, tuple[str, bytes, str]]:
    """The Subsurface fixture as an upload."""
    return {"file": ("log.xml", SUBSURFACE.read_bytes(), "application/xml")}


def perdix_files() -> list[tuple[str, tuple[str, bytes, str]]]:
    """The Perdix fixture as an upload."""
    return [("files", ("perdix_11.xml", PERDIX.read_bytes(), "application/xml"))]


async def test_subsurface_dry_run_reports_without_writing(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    commits = record_commits(store, monkeypatch)
    sites, people = set(store.sites), set(store.people)
    response = await owner_client.post(
        f"{ADMIN}/import/subsurface", params={"dry_run": "true"}, files=subsurface_file()
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dry_run"] is True and body["import_id"] == ""
    assert body["created"] == [120, 121] and body["updated"] == []
    assert body["dives_in_file"] == 2
    assert body["first_date"] == "2024-05-08" and body["last_date"] == "2024-06-01"
    created = [s for s in body["sites"] if s["outcome"] == "created"]
    assert [s["name"] for s in created] == ["Émergence du Ressel"]
    assert body["sites_created"] == 1 and body["sites_matched"] == 1
    assert commits == []
    assert set(store.sites) == sites and set(store.people) == people
    assert 120 not in store.dives and store.imports == {}


async def test_subsurface_dry_run_predicts_the_real_import(owner_client: AsyncClient) -> None:
    dry = await owner_client.post(
        f"{ADMIN}/import/subsurface", params={"dry_run": "true"}, files=subsurface_file()
    )
    real = await owner_client.post(f"{ADMIN}/import/subsurface", files=subsurface_file())
    assert real.json()["created"] == dry.json()["created"]
    assert real.json()["dry_run"] is False and real.json()["import_id"]
    assert real.json()["dives_in_file"] == 2
    again = await owner_client.post(
        f"{ADMIN}/import/subsurface", params={"dry_run": "true"}, files=subsurface_file()
    )
    assert again.json()["created"] == [] and again.json()["skipped"] == 2


async def test_shearwater_dry_run_reports_without_writing(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    commits = record_commits(store, monkeypatch)
    response = await owner_client.post(
        f"{ADMIN}/import/shearwater", params={"dry_run": "true"}, files=perdix_files()
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dry_run"] is True and body["created"] == [5]
    assert body["dives_in_file"] == 1 and body["first_date"] == "2020-07-03"
    assert commits == [] and 5 not in store.dives and store.imports == {}


async def test_shearwater_dry_run_names_the_dive_it_would_update(
    owner_client: AsyncClient, store: Store
) -> None:
    dive = store.dives[1].model_copy(update={"date": date(2020, 7, 3), "time_in": "14:20"})
    await store.save_dive(dive, "move dive 1 to the perdix day")
    response = await owner_client.post(
        f"{ADMIN}/import/shearwater", params={"dry_run": "true"}, files=perdix_files()
    )
    assert response.json()["updated"] == [1] and response.json()["created"] == []
    assert store.dives[1].computer == []


async def test_shearwater_import_lists_created_numbers(owner_client: AsyncClient) -> None:
    response = await owner_client.post(f"{ADMIN}/import/shearwater", files=perdix_files())
    body = response.json()
    assert body["created"] == [5] and body["dry_run"] is False
    assert body["last_date"] == "2020-07-03"
