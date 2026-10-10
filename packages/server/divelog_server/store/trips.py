"""Trips derived from the dive log: runs of dives abroad, a few days apart at most.

Nothing here is written back to the data repository. Optional ``trips/*.md`` overrides can
claim a date window, rename or describe a derived trip, or merge several into one.
"""

import re
import unicodedata
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date

from divelog_server.store.countries import country_name
from divelog_server.store.models import DiveRecord, RegionRecord, SiteRecord, TripRecord

DEFAULT_HOME_COUNTRIES: frozenset[str] = frozenset()
MAX_GAP_DAYS = 4
MIN_DIVES = 2
DOMINANT_SHARE = 0.75
SHORT_LABEL_WORDS = 2
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


@dataclass
class Trip:
    """One trip: its dives in chronological order and the dates it spans."""

    slug: str
    name: str
    start: date
    end: date
    numbers: list[int] = field(default_factory=list)
    description_md: str = ""
    cover: str | None = None

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def day_index(self, day: date) -> int:
        """1-based day of the trip ``day`` falls on."""
        return (day - self.start).days + 1


@dataclass
class TripIndex:
    """The trips one kind of viewer sees, newest first, and the trip of each dive."""

    trips: dict[str, Trip] = field(default_factory=dict)
    by_number: dict[int, Trip] = field(default_factory=dict)


def slugify(text: str) -> str:
    """ASCII, lower-case, dash-separated: ``Quercy causses`` → ``quercy-causses``."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or "trip"


def period(start: date, end: date) -> str:
    """``Feb 2026``, ``Feb–Mar 2025`` or ``Dec 2009–Jan 2010``."""
    first = MONTHS[start.month - 1]
    last = MONTHS[end.month - 1]
    if start.year != end.year:
        return f"{first} {start.year}–{last} {end.year}"
    if start.month != end.month:
        return f"{first}–{last} {end.year}"
    return f"{first} {start.year}"


def short_region_name(name: str) -> str | None:
    """A region name short enough for a trip title, without a leading "The", or None."""
    words = name.split()
    if words and words[0].lower() == "the":
        words = words[1:]
    return " ".join(words) if 0 < len(words) <= SHORT_LABEL_WORDS else None


def dive_country(dive: DiveRecord, sites: dict[str, SiteRecord]) -> str | None:
    site = sites.get(dive.site) if dive.site else None
    return (site.country if site else None) or dive.country


def trip_label(
    dives: list[DiveRecord], sites: dict[str, SiteRecord], regions: dict[str, RegionRecord]
) -> str:
    """The place a trip is named after.

    A region that holds most of the dives and has a short name wins; otherwise the country
    with the most dives.
    """
    region_counts = Counter(
        site.region for d in dives if (site := sites.get(d.site or "")) and site.region
    )
    if region_counts:
        top, count = min(region_counts.items(), key=lambda kv: (-kv[1], kv[0]))
        region = regions.get(top)
        if region and count / len(dives) >= DOMINANT_SHARE:
            short = short_region_name(region.name)
            if short:
                return short
    countries = Counter(code for d in dives if (code := dive_country(d, sites)))
    if not countries:
        return "Trip"
    code, _ = min(countries.items(), key=lambda kv: (-kv[1], kv[0]))
    return country_name(code)


def _abroad(dive: DiveRecord, sites: dict[str, SiteRecord], home: frozenset[str]) -> bool:
    """True when the dive's country is known and not a home country; never without a home."""
    if not home:
        return False
    code = dive_country(dive, sites)
    return code is not None and code.upper() not in home


def _runs(
    chrono: list[DiveRecord], sites: dict[str, SiteRecord], home: frozenset[str]
) -> list[list[DiveRecord]]:
    runs: list[list[DiveRecord]] = []
    current: list[DiveRecord] = []
    for dive in chrono:
        if not _abroad(dive, sites, home):
            if current:
                runs.append(current)
            current = []
            continue
        if current and (dive.date - current[-1].date).days > MAX_GAP_DAYS:
            runs.append(current)
            current = []
        current.append(dive)
    if current:
        runs.append(current)
    return [run for run in runs if len(run) >= MIN_DIVES]


def _unique(base: str, taken: set[str]) -> str:
    slug, n = base, 2
    while slug in taken:
        slug, n = f"{base}-{n}", n + 1
    taken.add(slug)
    return slug


def derive_trips(
    dives: Iterable[DiveRecord],
    sites: dict[str, SiteRecord],
    regions: dict[str, RegionRecord],
    overrides: Iterable[TripRecord] = (),
    home_countries: frozenset[str] = DEFAULT_HOME_COUNTRIES,
) -> TripIndex:
    """Group ``dives`` into trips.

    Parameters
    ----------
    dives
        The dives the viewer may see; the caller filters for visibility.
    sites, regions
        Records by id, for each dive's country and the trip's name.
    overrides
        ``trips/*.md`` records. One with both dates claims every dive in its window (and any
        dive whose ``trip`` names it) before derivation; one without renames, describes or
        merges the derived trips its slug and ``merge`` list name.
    home_countries
        ISO-3 codes of the countries that do not count as abroad. Empty means every dive is
        at home: no trips are derived, only the ``trips/*.md`` records with dates group dives.

    Returns
    -------
    TripIndex
        Trips newest first, and the trip of every dive that belongs to one.
    """
    chrono = sorted(dives, key=lambda d: (d.date, d.number))
    records = list(overrides)
    windows = [r for r in records if r.start_date and r.end_date]
    window_slugs = {r.slug for r in windows}
    claimed: dict[str, list[DiveRecord]] = {r.slug: [] for r in windows}
    rest: list[DiveRecord] = []
    for dive in chrono:
        owner = next(
            (
                r.slug
                for r in windows
                if dive.trip == r.slug
                or (r.start_date and r.end_date and r.start_date <= dive.date <= r.end_date)
            ),
            None,
        )
        if owner:
            claimed[owner].append(dive)
        else:
            rest.append(dive)

    taken = set(window_slugs)
    derived: dict[str, list[DiveRecord]] = {}
    for run in _runs(rest, sites, home_countries):
        label = trip_label(run, sites, regions)
        start = run[0].date
        derived[_unique(f"{slugify(label)}-{start.year}-{start.month:02d}", taken)] = run

    groups: dict[str, tuple[list[DiveRecord], TripRecord | None]] = {
        slug: (run, None) for slug, run in derived.items()
    }
    for record in records:
        members = list(claimed.get(record.slug, []))
        for slug in [record.slug, *record.merge]:
            if slug in groups and groups[slug][1] is None:
                members += groups.pop(slug)[0]
        if members:
            members.sort(key=lambda d: (d.date, d.number))
            groups[record.slug] = (members, record)

    trips: list[Trip] = []
    for slug, (members, override) in groups.items():
        start = min(d.date for d in members)
        end = max(d.date for d in members)
        if override and override.start_date and override.end_date:
            start, end = min(start, override.start_date), max(end, override.end_date)
        name = (override.name if override else "") or (
            f"{trip_label(members, sites, regions)} {period(start, end)}"
        )
        trips.append(
            Trip(
                slug=slug,
                name=name,
                start=start,
                end=end,
                numbers=[d.number for d in members],
                description_md=override.body_md if override else "",
                cover=override.cover if override else None,
            )
        )
    trips.sort(key=lambda t: (t.start, t.slug), reverse=True)
    index = TripIndex(trips={t.slug: t for t in trips})
    for trip in trips:
        for number in trip.numbers:
            index.by_number[number] = trip
    return index
