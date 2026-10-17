from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import date

from divelog_server.schemas.dive import (
    CountryStat,
    DepthBucket,
    DiveStats,
    DiveSummary,
    MapSite,
    PersonStats,
    RecordDive,
    RegionStats,
    SiteRef,
    TagStat,
    YearStat,
)
from divelog_server.store.countries import alpha2, country_name
from divelog_server.store.models import DiveRecord, SiteRecord

DEPTH_EDGES = [0, 10, 20, 30, 40, 60, 100]
DEEP_DIVE_M = 30

Sites = dict[str, SiteRecord]


def _site(dive: DiveRecord, sites: Sites) -> SiteRecord | None:
    return sites.get(dive.site) if dive.site else None


def _country(dive: DiveRecord, sites: Sites) -> str | None:
    site = _site(dive, sites)
    return (site.country if site else None) or dive.country


def _record(dive: DiveRecord | None, value: float | None, sites: Sites) -> RecordDive | None:
    if dive is None or value is None:
        return None
    site = _site(dive, sites)
    return RecordDive(
        number=dive.number, title=dive.title, value=value, site=site.name if site else None
    )


def compute_stats(dives: list[DiveRecord], sites: Sites) -> DiveStats:
    """Aggregate every counted dive; private dives count but never surface as records."""
    counted = [d for d in dives if d.visibility != "draft"]
    public = [d for d in counted if d.visibility == "public"]

    total_minutes = round(sum(d.duration_min for d in counted))
    depths = [d.max_depth_m for d in counted]
    durations = [d.duration_min for d in counted]

    tag_counter: Counter[str] = Counter()
    for d in counted:
        tag_counter.update(d.tags)

    years: dict[int, YearStat] = {}
    for d in counted:
        y = years.setdefault(d.date.year, YearStat(year=d.date.year, dives=0, minutes=0))
        y.dives += 1
        y.minutes += round(d.duration_min)

    country_counter: dict[str, CountryStat] = {}
    map_counter: dict[str, MapSite] = {}
    for d in public:
        code = _country(d, sites)
        if code:
            c = country_counter.setdefault(
                code,
                CountryStat(country_code=alpha2(code), country_name=country_name(code), dives=0),
            )
            c.dives += 1
        site = _site(d, sites)
        if site is None or site.lat is None or site.lon is None:
            continue
        if site.location_visibility == "region_only":
            continue
        m = map_counter.setdefault(
            site.site_id,
            MapSite(
                slug=site.site_id,
                name=site.name,
                country_code=alpha2(site.country),
                lat=site.lat,
                lon=site.lon,
                dives=0,
                minutes=0,
                site_type=site.type,
                max_depth_m=0,
                first_year=d.date.year,
                last_year=d.date.year,
            ),
        )
        m.dives += 1
        m.minutes += round(d.duration_min)
        m.max_depth_m = max(m.max_depth_m, d.max_depth_m)
        m.first_year = min(m.first_year or d.date.year, d.date.year)
        m.last_year = max(m.last_year or d.date.year, d.date.year)

    site_ids = {d.site for d in counted if d.site}
    countries_all = {code for d in counted if (code := _country(d, sites))}

    buckets: list[DepthBucket] = []
    for lo, hi in zip(DEPTH_EDGES, DEPTH_EDGES[1:], strict=False):
        n = sum(1 for x in depths if lo <= x < hi)
        buckets.append(DepthBucket(from_m=lo, to_m=hi, dives=n))

    deepest = max(public, key=lambda d: d.max_depth_m, default=None)
    longest = max(public, key=lambda d: d.duration_min, default=None)
    with_temp = [d for d in public if d.water_temp_c is not None]
    coldest = min(with_temp, key=lambda d: d.water_temp_c or 0, default=None)

    return DiveStats(
        total_dives=len(counted),
        private_dives=len(counted) - len(public),
        total_minutes=total_minutes,
        max_depth_m=max(depths, default=0.0),
        avg_depth_m=round(sum(depths) / len(depths), 1) if depths else None,
        avg_duration_min=round(sum(durations) / len(durations), 1) if durations else None,
        countries=len(countries_all),
        sites=len(site_ids),
        first_dive=min((d.date for d in counted), default=None),
        last_dive=max((d.date for d in counted), default=None),
        tags=[TagStat(tag=t, count=n) for t, n in tag_counter.most_common()],
        deep_dives=sum(1 for x in depths if x >= DEEP_DIVE_M),
        years=sorted(years.values(), key=lambda y: y.year),
        country_breakdown=sorted(country_counter.values(), key=lambda c: -c.dives),
        depth_buckets=buckets,
        map_sites=sorted(map_counter.values(), key=lambda m: -m.dives),
        deepest=_record(deepest, deepest.max_depth_m if deepest else None, sites),
        longest=_record(longest, float(longest.duration_min) if longest else None, sites),
        coldest=_record(coldest, coldest.water_temp_c if coldest else None, sites),
    )


def undived_markers(sites: Iterable[SiteRecord], markers: list[MapSite]) -> list[MapSite]:
    """Markers for the exactly placed ``sites`` that ``markers`` lacks, with 0 dives and no years.

    Parameters
    ----------
    sites
        The sites a map may show.
    markers
        The markers of the dived sites, as ``compute_stats`` builds them.

    Returns
    -------
    list[MapSite]
        ``markers`` followed by the undived sites, by name.
    """
    have = {m.slug for m in markers}
    undived = [
        MapSite(
            slug=site.site_id,
            name=site.name,
            country_code=alpha2(site.country),
            lat=site.lat,
            lon=site.lon,
            dives=0,
            minutes=0,
            site_type=site.type,
            max_depth_m=0,
            first_year=None,
            last_year=None,
        )
        for site in sorted(sites, key=lambda s: s.name.lower())
        if site.site_id not in have
        and site.location_visibility != "region_only"
        and site.lat is not None
        and site.lon is not None
    ]
    return [*markers, *undived]


def compute_summary(dives: list[DiveRecord], sites: Sites) -> DiveSummary:
    counted = [d for d in dives if d.visibility != "draft"]
    last = max(counted, key=lambda d: (d.date, d.number), default=None)
    last_site = _site(last, sites) if last and last.visibility == "public" else None
    return DiveSummary(
        total_dives=len(counted),
        total_hours=round(sum(d.duration_min for d in counted) / 60, 1),
        countries=len({code for d in counted if (code := _country(d, sites))}),
        max_depth_m=max((d.max_depth_m for d in counted), default=0.0),
        last_dive=last.date if last else None,
        last_dive_site=last_site.name if last_site else None,
        cave_dives=sum(1 for d in counted if "cave" in d.tags),
        scooter_dives=sum(1 for d in counted if "dpv" in d.tags),
    )


def person_stats(dives: list[DiveRecord], sites: Sites) -> PersonStats:
    """What a buddy and the owner did together."""
    with_temp = [d.water_temp_c for d in dives if d.water_temp_c is not None]
    return PersonStats(
        dives=len(dives),
        minutes=round(sum(d.duration_min for d in dives)),
        max_depth_m=max((d.max_depth_m for d in dives), default=0.0),
        longest_min=max((d.duration_min for d in dives), default=0.0),
        coldest_c=min(with_temp, default=None),
        first_dive=min((d.date for d in dives), default=None),
        last_dive=max((d.date for d in dives), default=None),
        countries=len({code for d in dives if (code := _country(d, sites))}),
        sites=len({d.site for d in dives if d.site}),
    )


def region_stats(dives: list[DiveRecord], sites: Sites) -> RegionStats:
    """Totals for a region's stats band; ``dives`` are already filtered for the viewer."""
    per_site = Counter(d.site for d in dives if d.site)
    top = min(per_site.items(), key=lambda kv: (-kv[1], kv[0]), default=None)
    top_site = None
    if top is not None and (site := sites.get(top[0])) is not None:
        top_site = SiteRef(slug=site.site_id, name=site.name, dives=top[1])
    return RegionStats(
        dives=len(dives),
        sites=len(per_site),
        minutes=round(sum(d.duration_min for d in dives)),
        max_depth_m=max((d.max_depth_m for d in dives), default=None),
        first_year=min((d.date.year for d in dives), default=None),
        last_year=max((d.date.year for d in dives), default=None),
        top_site=top_site,
    )


def years_of(dives: list[DiveRecord]) -> list[int]:
    return sorted({d.date.year for d in dives}, reverse=True)


def tags_of(dives: list[DiveRecord]) -> list[str]:
    counter: Counter[str] = Counter()
    for d in dives:
        counter.update(d.tags)
    return [t for t, _ in counter.most_common()]


def countries_of(dives: list[DiveRecord], sites: Sites) -> list[CountryStat]:
    grouped: dict[str, CountryStat] = defaultdict(
        lambda: CountryStat(country_code="", country_name="", dives=0)
    )
    for d in dives:
        code = _country(d, sites)
        if not code:
            continue
        c = grouped[code]
        c.country_code = alpha2(code)
        c.country_name = country_name(code)
        c.dives += 1
    return sorted(grouped.values(), key=lambda c: -c.dives)


def latest_date(dives: list[DiveRecord]) -> date | None:
    return max((d.date for d in dives), default=None)


FIRST_OF_KIND = {
    "cave": "cave dive",
    "mine": "mine dive",
    "wreck": "wreck dive",
    "night": "night dive",
    "deco": "decompression dive",
    "dpv": "scooter dive",
    "stage": "dive with a stage",
    "boat": "boat dive",
}
YEAR_RECORD_MIN_DIVES = 5
PERCENTILE_MIN_DIVES = 20
PERCENTILE_THRESHOLD = 60
MAX_CONTEXT_FACTS = 3


def chrono_key(dive: DiveRecord) -> tuple[date, int]:
    """Sort key that puts dives in the order they were made; numbers are chronological per day."""
    return (dive.date, dive.number)


def ordinal(n: int) -> str:
    """``1`` → ``1st``, ``12`` → ``12th``, ``22`` → ``22nd``."""
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _records(dive: DiveRecord, pool: list[DiveRecord]) -> list[str]:
    """The record words (deepest, longest, coldest) ``dive`` holds outright within ``pool``.

    The holder is picked as :func:`compute_stats` picks it; a tied value is no record at all.
    """
    words: list[str] = []

    def holds(values: list[tuple[DiveRecord, float]], best: DiveRecord) -> bool:
        """Whether ``dive`` is ``best`` and no other dive shares its value."""
        mine = next((v for d, v in values if d is dive), None)
        return best is dive and sum(1 for _, v in values if v == mine) == 1

    depths = [(d, d.max_depth_m) for d in pool]
    if holds(depths, max(pool, key=lambda d: d.max_depth_m)):
        words.append("deepest")
    durations = [(d, d.duration_min) for d in pool]
    if holds(durations, max(pool, key=lambda d: d.duration_min)):
        words.append("longest")
    with_temp = [d for d in pool if d.water_temp_c is not None]
    temps = [(d, d.water_temp_c or 0) for d in with_temp]
    if with_temp and holds(temps, min(with_temp, key=lambda d: d.water_temp_c or 0)):
        words.append("coldest")
    return words


def _share_below(others: list[DiveRecord], value: float, attr: str) -> int:
    """Whole percentage of ``others`` whose ``attr`` is strictly below ``value``."""
    below = sum(1 for d in others if getattr(d, attr) < value)
    return below * 100 // len(others)


def context_facts(dive: DiveRecord, dives: list[DiveRecord], sites: Sites) -> list[str]:
    """Up to three short, true facts that place ``dive`` in the public log.

    Parameters
    ----------
    dive
        The dive the page is about; counted even when it is not public.
    dives
        Every dive in the store, in store order.
    sites
        Site records by id, for the country of each dive.

    Returns
    -------
    list[str]
        Most remarkable first: all-time records, firsts, records of the year, percentiles.
    """
    pool = [d for d in dives if d.visibility == "public" or d is dive]
    earlier = [d for d in pool if chrono_key(d) < chrono_key(dive)]
    facts: list[str] = []

    all_time = _records(dive, pool) if len(pool) > 1 else []
    facts += [f"{word} dive in the log" for word in all_time]

    if len(pool) > 1 and not earlier:
        facts.append("first dive in the log")
    else:
        code = _country(dive, sites)
        if code and not any(_country(d, sites) == code for d in earlier):
            facts.append(f"first dive in {country_name(code)}")
        for tag in dive.tags:
            label = FIRST_OF_KIND.get(tag)
            if label and not any(tag in d.tags for d in earlier):
                facts.append(f"first {label}")
                break

    same_year = [d for d in pool if d.date.year == dive.date.year]
    year_records: list[str] = []
    if len(same_year) >= YEAR_RECORD_MIN_DIVES:
        year_records = [w for w in _records(dive, same_year) if w not in all_time]
        facts += [f"{word} dive of {dive.date.year}" for word in year_records]
    claimed = set(all_time) | set(year_records)

    others = [d for d in pool if d is not dive]
    if len(others) >= PERCENTILE_MIN_DIVES:
        deeper = _share_below(others, dive.max_depth_m, "max_depth_m")
        if deeper >= PERCENTILE_THRESHOLD and "deepest" not in claimed:
            facts.append(f"deeper than {deeper} % of all dives")
        longer = _share_below(others, dive.duration_min, "duration_min")
        if longer >= PERCENTILE_THRESHOLD and "longest" not in claimed:
            facts.append(f"longer than {longer} % of all dives")
    with_temp = [d for d in others if d.water_temp_c is not None]
    if (
        dive.water_temp_c is not None
        and len(with_temp) >= PERCENTILE_MIN_DIVES
        and "coldest" not in claimed
    ):
        warmer = sum(1 for d in with_temp if (d.water_temp_c or 0) > dive.water_temp_c)
        colder = warmer * 100 // len(with_temp)
        if colder >= PERCENTILE_THRESHOLD:
            facts.append(f"colder than {colder} % of all dives")

    return facts[:MAX_CONTEXT_FACTS]
