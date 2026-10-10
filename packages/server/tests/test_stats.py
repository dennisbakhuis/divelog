from datetime import date, timedelta

from divelog_server.services.stats import (
    compute_stats,
    compute_summary,
    context_facts,
    ordinal,
    person_stats,
    region_stats,
)
from divelog_server.store.models import DiveRecord, SiteRecord


def _site(site_id: str, cc: str, lat: float | None = 1.0) -> SiteRecord:
    return SiteRecord(site_id=site_id, name=site_id, country=cc, lat=lat, lon=2.0, type="sea")


def _dive(number: int, **kw: object) -> DiveRecord:
    base: dict[str, object] = {
        "number": number,
        "date": date(2023, 1, number),
        "duration_min": 50,
        "max_depth_m": 20.0,
        "tags": [],
        "visibility": "public",
    }
    base.update(kw)
    return DiveRecord.model_validate(base)


def test_stats_count_private_but_hide_records() -> None:
    sites = {"a": _site("a", "NLD"), "b": _site("b", "FRA")}
    dives = [
        _dive(1, site="a", tags=["cave"], water_temp_c=8.0),
        _dive(2, site="b", max_depth_m=45.0, duration_min=90, water_temp_c=13.0),
        _dive(3, site="a", max_depth_m=70.0, visibility="private"),
        _dive(4, site="a", visibility="draft"),
    ]
    stats = compute_stats(dives, sites)
    assert stats.total_dives == 3
    assert stats.private_dives == 1
    assert stats.total_minutes == 190
    assert stats.max_depth_m == 70.0
    assert stats.countries == 2
    assert stats.deepest is not None and stats.deepest.number == 2
    assert stats.coldest is not None and stats.coldest.number == 1
    assert stats.tags[0].tag == "cave"
    assert [m.slug for m in stats.map_sites] == ["a", "b"]
    assert stats.map_sites[0].dives == 1
    assert stats.map_sites[0].last_year == 2023
    assert stats.country_breakdown[0].country_code == "NL"


def test_region_only_sites_stay_off_the_map() -> None:
    hidden = _site("secret", "FRA")
    hidden.location_visibility = "region_only"
    stats = compute_stats([_dive(1, site="secret")], {"secret": hidden})
    assert stats.map_sites == []
    assert stats.countries == 1


def test_summary() -> None:
    sites = {"a": _site("a", "NLD")}
    dives = [_dive(1, site="a", tags=["cave", "dpv"]), _dive(2, site="a", duration_min=70)]
    summary = compute_summary(dives, sites)
    assert summary.total_dives == 2
    assert summary.total_hours == 2.0
    assert summary.cave_dives == 1
    assert summary.scooter_dives == 1
    assert summary.last_dive == date(2023, 1, 2)
    assert summary.last_dive_site == "a"


def test_person_stats() -> None:
    sites = {"a": _site("a", "NLD"), "b": _site("b", "FRA")}
    dives = [
        _dive(1, site="a", water_temp_c=8.0),
        _dive(2, site="b", max_depth_m=45.0, duration_min=90),
    ]
    stats = person_stats(dives, sites)
    assert stats.dives == 2
    assert stats.minutes == 140
    assert stats.max_depth_m == 45.0
    assert stats.longest_min == 90
    assert stats.coldest_c == 8.0
    assert stats.countries == 2


def test_empty_log() -> None:
    stats = compute_stats([], {})
    assert stats.total_dives == 0
    assert stats.deepest is None
    assert stats.first_dive is None


def _day(number: int, **kw: object) -> DiveRecord:
    return _dive(1, **kw).model_copy(
        update={"number": number, "date": date(2023, 1, 1) + timedelta(days=20 * number)}
    )


def test_ordinal() -> None:
    assert [ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111)] == [
        "1st",
        "2nd",
        "3rd",
        "4th",
        "11th",
        "12th",
        "13th",
        "21st",
        "22nd",
        "101st",
        "111th",
    ]


def test_context_facts_firsts_and_records() -> None:
    sites = {"a": _site("a", "NLD"), "b": _site("b", "MEX")}
    dives = [_dive(n, site="a", water_temp_c=15.0) for n in range(1, 6)]
    dives.append(_dive(6, site="b", tags=["cave"], max_depth_m=30.0, water_temp_c=25.0))
    dives.append(_dive(7, site="a", max_depth_m=90.0, visibility="private"))
    assert context_facts(dives[0], dives, sites) == ["first dive in the log"]
    assert context_facts(dives[5], dives, sites) == [
        "deepest dive in the log",
        "first dive in Mexico",
        "first cave dive",
    ]
    assert context_facts(dives[6], dives, sites)[0] == "deepest dive in the log"


def test_context_facts_year_record_and_percentiles_use_public_dives_only() -> None:
    sites = {"a": _site("a", "NLD")}
    dives = [_day(n, site="a", max_depth_m=10.0 + n, water_temp_c=20.0) for n in range(1, 31)]
    dives += [_day(n, site="a", max_depth_m=99.0, visibility="private") for n in range(31, 41)]
    target = dives[20]
    facts = context_facts(target, dives, sites)
    assert "deeper than 68 % of all dives" in facts
    assert not any("colder" in f for f in facts)
    assert all("in the log" not in f for f in facts)
    first_year = [d for d in dives if d.date.year == 2023]
    deepest_of_year = max(first_year, key=lambda d: d.max_depth_m)
    assert "deepest dive of 2023" in context_facts(deepest_of_year, dives, sites)


def test_context_facts_year_record_replaces_its_percentile() -> None:
    sites = {"a": _site("a", "NLD")}
    older = [_dive(n, site="a", date=date(2022, 1, n), max_depth_m=60.0) for n in range(1, 6)]
    year = [
        _dive(n, site="a", date=date(2023, 1, n), max_depth_m=15.0 + n, water_temp_c=4.0 + n)
        for n in range(6, 31)
    ]
    dives = older + year
    target = year[-1]
    facts = context_facts(target, dives, sites)
    assert "deepest dive of 2023" in facts
    assert not any(f.startswith("deeper than") for f in facts)
    coldest = year[0]
    facts = context_facts(coldest, dives, sites)
    assert "coldest dive in the log" in facts
    assert not any(f.startswith("colder than") for f in facts)


def test_region_stats_band() -> None:
    sites = {"a": _site("a", "NLD"), "b": _site("b", "NLD")}
    dives = [
        _dive(1, site="a", date=date(2019, 5, 1), max_depth_m=12.0),
        _dive(2, site="b", date=date(2021, 5, 1), max_depth_m=31.5, duration_min=70),
        _dive(3, site="b", date=date(2020, 5, 1)),
    ]
    band = region_stats(dives, sites)
    assert band.dives == 3
    assert band.sites == 2
    assert band.minutes == 170
    assert band.max_depth_m == 31.5
    assert (band.first_year, band.last_year) == (2019, 2021)
    assert band.top_site is not None
    assert (band.top_site.slug, band.top_site.dives) == ("b", 2)
    empty = region_stats([], sites)
    assert empty.dives == 0 and empty.top_site is None and empty.max_depth_m is None
