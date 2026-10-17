"""What the editor's helper endpoints compute from the store: the new-dive template, the paged
dive list and the possible duplicates of a site being created."""

from collections import Counter
from datetime import date, timedelta
from typing import Any

from pydantic import ValidationError

from divelog_server.importers.site_match import MATCH_RADIUS_M, nearby
from divelog_server.schemas.admin import (
    AdminDivePage,
    AdminDiveRow,
    DiveSort,
    DiveTemplateDive,
    DiveTemplateOut,
    NearbyCommonsSite,
    NearbyLogSite,
    NearbySitesOut,
    SiteLastDive,
    TemplatePerson,
    TemplateSite,
)
from divelog_server.schemas.dive import DiveIn, TripOut, TripRef
from divelog_server.services import dives as dive_service
from divelog_server.store.models import DiveRecord, TripRecord
from divelog_server.store.store import Store
from divelog_server.store.trips import Trip

RECENT_SITES = 8
FREQUENT_PEOPLE = 12
FREQUENT_WINDOW = timedelta(days=730)

RENAMED = {
    "site": "site_id",
    "trip": "trip_id",
    "gear_setup": "gear_setup_id",
    "people": "people_ids",
    "cover": "cover_attachment_id",
}
CLAMPED = {"duration_min": (1.0, 24 * 60.0), "max_depth_m": (0.0, 400.0)}


def _when(dive: DiveRecord) -> tuple[date, str, int]:
    return (dive.date, dive.time_in or "", dive.number)


def _logged_before(dive: DiveRecord, anchor: DiveRecord) -> bool:
    """True when ``dive`` took place before ``anchor``: an earlier day, or the same day and an
    earlier start (by number when either start time is missing)."""
    if dive.number == anchor.number or dive.date > anchor.date:
        return False
    if dive.date < anchor.date:
        return True
    if dive.time_in and anchor.time_in and dive.time_in != anchor.time_in:
        return dive.time_in < anchor.time_in
    return dive.number < anchor.number


def dive_input(dive: DiveRecord) -> DiveTemplateDive:
    """A stored dive as the form's input, without its profile.

    Values a hand-edited file holds outside the input's ranges are dropped (or, for the
    required duration and depth, clamped) so the result always validates.
    """
    record = dive.model_dump(mode="json")
    payload: dict[str, Any] = {
        name: record[name] for name in DiveIn.model_fields if name in record and name != "profile"
    }
    for stored, field in RENAMED.items():
        payload[field] = record.get(stored)
    payload["people_ids"] = payload["people_ids"] or []
    payload["body_md"] = dive.body_md
    for _ in range(len(payload)):
        try:
            return DiveTemplateDive.model_validate(payload)
        except ValidationError as exc:
            for error in exc.errors():
                field = str(error["loc"][0])
                if field in CLAMPED:
                    low, high = CLAMPED[field]
                    value = payload.get(field)
                    number = value if isinstance(value, int | float) else low
                    payload[field] = min(max(float(number), low), high)
                else:
                    payload.pop(field, None)
    return DiveTemplateDive.model_validate(payload)


def _trip_containing(store: Store, day: date) -> TripOut | None:
    """The trip whose dates hold ``day``: a derived trip first, else a dated override."""
    trips = store.trip_index(True).trips.values()
    derived: list[Trip] = [t for t in trips if t.start <= day <= t.end]
    if derived:
        trip = min(derived, key=lambda t: (t.start, t.slug))
        return TripOut(
            slug=trip.slug,
            name=trip.name,
            start_date=trip.start,
            end_date=trip.end,
            description_md=trip.description_md,
            day_index=trip.day_index(day),
            days=trip.days,
            custom=trip.slug in store.trips,
        )
    overrides: list[TripRecord] = [
        t
        for t in store.trips.values()
        if t.start_date and t.end_date and t.start_date <= day <= t.end_date
    ]
    if not overrides:
        return None
    trip_record = min(overrides, key=lambda t: (t.start_date or day, t.slug))
    start, end = trip_record.start_date or day, trip_record.end_date or day
    return TripOut(
        slug=trip_record.slug,
        name=trip_record.name or trip_record.slug,
        start_date=start,
        end_date=end,
        description_md=trip_record.body_md,
        day_index=(day - start).days + 1,
        days=(end - start).days + 1,
        custom=True,
    )


def _site_last_dive(store: Store, site_id: str, day: date) -> SiteLastDive | None:
    dives = [
        store.dives[n] for n in store.dives_by_site.get(site_id, []) if store.dives[n].date <= day
    ]
    if not dives:
        return None
    last = max(dives, key=_when)
    annotation = last.map_annotation or {}
    map_id = annotation.get("map_id")
    return SiteLastDive(
        number=last.number,
        date=last.date,
        section=last.section,
        map_id=str(map_id) if map_id else None,
        water_temp_c=last.water_temp_c,
        surface_temp_c=last.surface_temp_c,
        air_temp_c=last.air_temp_c,
        visibility_m=last.visibility_m,
    )


def _recent_sites(store: Store, dives: list[DiveRecord]) -> list[TemplateSite]:
    last: dict[str, date] = {}
    counts: Counter[str] = Counter()
    for dive in dives:
        if not dive.site or dive.site not in store.sites:
            continue
        counts[dive.site] += 1
        last[dive.site] = max(last.get(dive.site, dive.date), dive.date)
    ranked = sorted(last, key=lambda s: (-last[s].toordinal(), store.sites[s].name.casefold()))
    return [
        TemplateSite(
            site_id=site_id,
            name=store.sites[site_id].name,
            country=store.sites[site_id].country,
            region=store.sites[site_id].region,
            last_dive=last[site_id],
            dives=counts[site_id],
        )
        for site_id in ranked[:RECENT_SITES]
    ]


def _frequent_people(store: Store, dives: list[DiveRecord], day: date) -> list[TemplatePerson]:
    since = day - FREQUENT_WINDOW
    counts: Counter[str] = Counter()
    for dive in dives:
        if dive.date >= since:
            counts.update(p for p in dive.people if p in store.people)
    people = sorted(
        store.people.values(), key=lambda p: (-counts[p.id], p.full_name.casefold(), p.id)
    )
    return [
        TemplatePerson(id=p.id, slug=p.slug, name=p.full_name, dives=counts[p.id])
        for p in people[:FREQUENT_PEOPLE]
    ]


def dive_template(
    store: Store, site_id: str | None, day: date, before: int | None = None
) -> DiveTemplateOut:
    """What a new dive on ``day`` (at ``site_id``, when given) starts from.

    Only dives on or before ``day`` count, so back-filling an old dive gets the context of
    its own time. With ``before`` (a dive number), the previous dive is the latest one
    logged before that dive: earlier on the same day or on an earlier day.
    """
    earlier = [d for d in store.dives.values() if d.date <= day]
    candidates = earlier
    if before is not None:
        anchor = store.dives.get(before)
        if anchor is None:
            candidates = [d for d in earlier if d.number < before]
        else:
            candidates = [d for d in earlier if _logged_before(d, anchor)]
    previous = max(candidates, key=_when) if candidates else None
    return DiveTemplateOut(
        date=day,
        next_number=store.next_dive_number(),
        previous=dive_input(previous) if previous else None,
        at_site=_site_last_dive(store, site_id, day) if site_id else None,
        recent_sites=_recent_sites(store, earlier),
        frequent_people=_frequent_people(store, earlier, day),
        trip_for_date=_trip_containing(store, day),
    )


def _haystack(store: Store, dive: DiveRecord) -> str:
    site = store.sites.get(dive.site) if dive.site else None
    parts: list[str | None] = [dive.title, dive.site_name_raw, dive.buddy_raw]
    if site:
        parts += [site.name, site.full_name, site.short_name, *site.aliases]
    for person in dive_service.dive_people(store, dive):
        parts += [person.full_name, person.alias, *person.aliases]
    return " ".join(p for p in parts if p).casefold()


def _matches(store: Store, dive: DiveRecord, tokens: list[str]) -> bool:
    text = _haystack(store, dive)
    for token in tokens:
        bare = token.lstrip("#")
        if bare.isdigit() and int(bare) == dive.number:
            continue
        if token not in text:
            return False
    return True


def admin_row(store: Store, dive: DiveRecord) -> AdminDiveRow:
    """The list row of ``dive`` with its start time, site id and trip."""
    trip = dive_service.dive_trip(store, dive, owner=True)
    return AdminDiveRow(
        **dive_service.admin_list_item(store, dive).model_dump(),
        time_in=dive.time_in,
        site_id=dive.site,
        trip=TripRef(slug=trip.slug, name=trip.name) if trip else None,
    )


SORT_KEYS: dict[str, Any] = {
    "date": _when,
    "number": lambda d: d.number,
    "depth": lambda d: (d.max_depth_m, d.number),
    "duration": lambda d: (d.duration_min, d.number),
}


def dive_page(
    store: Store,
    offset: int,
    limit: int,
    status: str | None,
    q: str,
    sort: DiveSort,
    asc: bool,
    site: str | None = None,
) -> AdminDivePage:
    """A filtered, sorted slice of every dive as list rows.

    Every word of ``q`` must match: a number (``650`` or ``#650``) the dive number, anything
    else a substring of the title, the site's names or a buddy's names. ``site`` keeps only
    the dives at that site id.
    """
    tokens = q.casefold().split()
    rows = [
        d
        for d in store.dives.values()
        if (status is None or d.visibility == status)
        and (site is None or d.site == site)
        and (not tokens or _matches(store, d, tokens))
    ]
    rows.sort(key=SORT_KEYS[sort], reverse=not asc)
    return AdminDivePage(
        items=[admin_row(store, d) for d in rows[offset : offset + limit]],
        total=len(rows),
        offset=offset,
        limit=limit,
    )


def nearby_sites(
    store: Store,
    lat: float | None,
    lon: float | None,
    name: str | None,
    radius_m: float = MATCH_RADIUS_M,
    limit: int = 8,
) -> NearbySitesOut:
    """Sites that may already be the one being created, in this log and in the commons.

    The log list covers every site the log lists (its own, forks and commons sites it dived
    or overlays); the commons list the remaining commons sites. Both list the sites whose
    name or alias matches every word of ``name`` (typos allowed, as in the admin search) and
    those placed within ``radius_m``.
    """
    log_ids = {sid for sid in store.sites if store.in_log(sid)}
    log_hits = nearby(name, lat, lon, (store.sites[s] for s in log_ids), radius_m)
    log = [
        NearbyLogSite(
            site_id=hit.site_id,
            name=store.sites[hit.site_id].name,
            country=store.sites[hit.site_id].country,
            type=store.sites[hit.site_id].type,
            lat=store.sites[hit.site_id].lat,
            lon=store.sites[hit.site_id].lon,
            matched_by=hit.matched_by if hit.matched_by != "uuid" else "name",
            distance_m=hit.distance_m,
            origin=store.site_origin.get(hit.site_id, "log"),
            dives=len(store.dives_by_site.get(hit.site_id, [])),
        )
        for hit in log_hits[:limit]
    ]
    commons_sites = store.commons.sites if store.commons is not None else {}
    unused = (record for sid, record in commons_sites.items() if sid not in log_ids)
    commons = [
        NearbyCommonsSite(
            site_id=hit.site_id,
            name=commons_sites[hit.site_id].name,
            country=commons_sites[hit.site_id].country,
            type=commons_sites[hit.site_id].type,
            area=commons_sites[hit.site_id].area,
            lat=commons_sites[hit.site_id].lat,
            lon=commons_sites[hit.site_id].lon,
            matched_by=hit.matched_by if hit.matched_by != "uuid" else "name",
            distance_m=hit.distance_m,
        )
        for hit in nearby(name, lat, lon, unused, radius_m, store.commons_index())[:limit]
    ]
    return NearbySitesOut(log=log, commons=commons)
