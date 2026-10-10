from datetime import date

from httpx import AsyncClient

from divelog_server.store.models import DiveRecord, RegionRecord, SiteRecord, TripRecord
from divelog_server.store.store import Store
from divelog_server.store.trips import derive_trips, period, short_region_name, slugify

SITES = {
    "cenote": SiteRecord(site_id="cenote", name="Cenote", country="MEX", region="cenotes"),
    "reef": SiteRecord(site_id="reef", name="Reef", country="MEX", region="reef"),
    "wreck": SiteRecord(site_id="wreck", name="Wreck", country="EGY", region="gubal"),
    "lake": SiteRecord(site_id="lake", name="Lake", country="NLD"),
    "cave": SiteRecord(site_id="cave", name="Cave", country="FRA", region="lot"),
}
REGIONS = {
    "cenotes": RegionRecord(region="cenotes", name="The Quintana Roo cenotes", country="MEX"),
    "reef": RegionRecord(region="reef", name="The Playa del Carmen coast", country="MEX"),
    "gubal": RegionRecord(region="gubal", name="The Strait of Gubal", country="EGY"),
    "lot": RegionRecord(region="lot", name="The Quercy causses", country="FRA"),
}


def dive(number: int, day: str, site: str, **extra: object) -> DiveRecord:
    return DiveRecord.model_validate(
        {"number": number, "date": day, "duration_min": 50, "site": site, **extra}
    )


def test_helpers() -> None:
    assert slugify("Curaçao & Bonaire") == "curacao-bonaire"
    assert period(date(2026, 2, 6), date(2026, 2, 22)) == "Feb 2026"
    assert period(date(2025, 2, 25), date(2025, 3, 10)) == "Feb–Mar 2025"
    assert period(date(2009, 12, 30), date(2010, 1, 2)) == "Dec 2009–Jan 2010"
    assert short_region_name("The Quercy causses") == "Quercy causses"
    assert short_region_name("The Quintana Roo cenotes") is None


def test_runs_abroad_split_on_gaps_and_home_dives() -> None:
    dives = [
        dive(1, "2026-02-06", "cenote"),
        dive(2, "2026-02-06", "cenote"),
        dive(3, "2026-02-10", "reef"),
        dive(4, "2026-02-15", "cenote"),
        dive(5, "2026-02-16", "cenote"),
        dive(6, "2026-02-17", "lake"),
        dive(7, "2026-02-18", "cenote"),
        dive(8, "2026-03-01", "cave"),
        dive(9, "2026-03-01", "cave"),
    ]
    index = derive_trips(dives, SITES, REGIONS)
    assert list(index.trips) == ["quercy-causses-2026-03", "mexico-2026-02-2", "mexico-2026-02"]
    first = index.trips["mexico-2026-02"]
    assert first.numbers == [1, 2, 3]
    assert first.name == "Mexico Feb 2026"
    assert first.days == 5
    assert first.day_index(date(2026, 2, 10)) == 5
    assert index.trips["mexico-2026-02-2"].numbers == [4, 5]
    assert 7 not in index.by_number
    assert 6 not in index.by_number
    assert index.by_number[8].name == "Quercy causses Mar 2026"


def test_overrides_rename_merge_and_claim() -> None:
    dives = [
        dive(1, "2026-02-06", "cenote"),
        dive(2, "2026-02-07", "cenote"),
        dive(3, "2026-02-20", "cenote"),
        dive(4, "2026-02-21", "cenote"),
        dive(5, "2017-10-13", "wreck"),
        dive(6, "2017-10-14", "lake"),
        dive(7, "2017-10-20", "wreck"),
    ]
    overrides = [
        TripRecord.model_validate(
            {"id": "yucatan", "name": "Yucatán", "merge": ["mexico-2026-02", "mexico-2026-02-2"]}
        ),
        TripRecord.model_validate(
            {"id": "red-sea", "start": "2017-10-12", "end": "2017-10-20", "body_md": "Liveaboard."}
        ),
    ]
    index = derive_trips(dives, SITES, REGIONS, overrides)
    assert set(index.trips) == {"yucatan", "red-sea"}
    assert index.trips["yucatan"].numbers == [1, 2, 3, 4]
    assert index.trips["yucatan"].name == "Yucatán"
    red_sea = index.trips["red-sea"]
    assert red_sea.numbers == [5, 6, 7]
    assert red_sea.name == "Egypt Oct 2017"
    assert red_sea.description_md == "Liveaboard."
    assert (red_sea.start, red_sea.days) == (date(2017, 10, 12), 9)


def _write(store: Store, number: int, day: str, visibility: str = "public") -> None:
    store.dive_path(number).write_text(
        f"---\nnumber: {number}\ndate: '{day}'\nduration_min: 40\nmax_depth_m: {number}\n"
        f"site: ressel\npeople: [kim_de_boer]\nvisibility: {visibility}\n---\n"
    )


async def test_trip_endpoints_respect_visibility(
    client: AsyncClient, owner_client: AsyncClient, store: Store
) -> None:
    _write(store, 10, "2024-01-05")
    _write(store, 11, "2024-01-08", visibility="private")
    _write(store, 12, "2024-01-09", visibility="draft")
    store.load()

    trips = (await client.get("/api/v1/dive/trips")).json()
    assert [t["slug"] for t in trips] == ["lot-2024-01"]
    assert trips[0]["dive_numbers"] == [2, 10]
    assert trips[0]["stats"]["dives"] == 2
    assert trips[0]["buddies"] == [{"slug": "kim", "name": "Kim", "avatar_url": None, "dives": 1}]
    owner_trips = (await owner_client.get("/api/v1/dive/trips")).json()
    assert owner_trips[0]["dive_numbers"] == [10, 11]

    detail = (await client.get("/api/v1/dive/trips/lot-2024-01")).json()
    assert [d["number"] for d in detail["dives"]] == [2, 10]
    assert detail["dives"][0]["trip"]["name"] == "Lot Jan 2024"
    assert (await client.get("/api/v1/dive/trips/nope")).status_code == 404

    page = (await client.get("/api/v1/dive/dives/10")).json()
    assert page["trip"]["day_index"] == 4
    assert page["trip"]["days"] == 4

    person = (await client.get("/api/v1/dive/people/kim")).json()
    assert person["trips"][0]["slug"] == "lot-2024-01"
    assert person["trips"][0]["dives"] == 1


def test_home_countries_are_configurable() -> None:
    dives = [dive(1, "2026-02-06", "lake"), dive(2, "2026-02-07", "lake")]
    assert derive_trips(dives, SITES, REGIONS).trips == {}
    index = derive_trips(dives, SITES, REGIONS, home_countries=frozenset({"BEL"}))
    assert [t.numbers for t in index.trips.values()] == [[1, 2]]


def test_settings_parse_home_countries() -> None:
    from divelog_server.core.config import Settings

    settings = Settings(HOME_COUNTRIES=" nld, fra ,,")
    assert settings.home_countries == frozenset({"NLD", "FRA"})
    assert Settings().SITE_NAME
