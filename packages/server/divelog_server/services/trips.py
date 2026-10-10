"""Shapes derived trips into cards, trip pages and a buddy's trips together."""

from collections import Counter

from divelog_server.schemas.dive import (
    TripBuddy,
    TripDetail,
    TripRegion,
    TripStats,
    TripSummary,
    TripTogether,
)
from divelog_server.services import dives as dive_service
from divelog_server.services import stats as stats_service
from divelog_server.store.models import DiveRecord, PersonRecord
from divelog_server.store.store import Store
from divelog_server.store.trips import Trip


def trip_dives(store: Store, trip: Trip) -> list[DiveRecord]:
    """The dives of ``trip`` in the order they were made."""
    return [store.dives[n] for n in trip.numbers if n in store.dives]


def trip_cover(trip: Trip, dives: list[DiveRecord], owner: bool) -> str | None:
    """The override's cover photo when it names one, else the first dive photo of the trip."""
    if trip.cover:
        for dive in dives:
            media = next(
                (m for m in dive_service.visible_media(dive.media, owner) if m.id == trip.cover),
                None,
            )
            if media is not None:
                return dive_service.best_variant(media, "w800", "thumb")
    return next((url for d in dives if (url := dive_service.cover_url(d, owner))), None)


def trip_buddies(store: Store, dives: list[DiveRecord]) -> list[TripBuddy]:
    """Public buddies on the trip's dives, most dives first."""
    counts: Counter[str] = Counter()
    people: dict[str, TripBuddy] = {}
    for dive in dives:
        for buddy in dive_service.public_buddies(store, dive):
            counts[buddy.slug] += 1
            people.setdefault(buddy.slug, TripBuddy(**buddy.model_dump(), dives=0))
    for slug, buddy in people.items():
        buddy.dives = counts[slug]
    return sorted(people.values(), key=lambda b: (-b.dives, b.name.lower()))


def trip_summary(store: Store, trip: Trip, owner: bool) -> TripSummary:
    dives = trip_dives(store, trip)
    site_ids = list(dict.fromkeys(d.site for d in dives if d.site))
    region_ids = list(
        dict.fromkeys(
            site.region for sid in site_ids if (site := store.sites.get(sid)) and site.region
        )
    )
    return TripSummary(
        id=trip.slug,
        slug=trip.slug,
        name=trip.name,
        start_date=trip.start,
        end_date=trip.end,
        days=trip.days,
        countries=stats_service.countries_of(dives, store.sites),
        regions=[
            TripRegion(id=rid, name=region.name if (region := store.regions.get(rid)) else rid)
            for rid in region_ids
        ],
        site_ids=site_ids,
        dive_numbers=[d.number for d in dives],
        stats=TripStats(
            dives=len(dives),
            minutes=round(sum(d.duration_min for d in dives)),
            max_depth_m=max((d.max_depth_m for d in dives), default=None),
            sites=len(site_ids),
        ),
        buddies=trip_buddies(store, dives),
        description_md=trip.description_md,
        cover_url=trip_cover(trip, dives, owner),
    )


def trip_list(store: Store, owner: bool) -> list[TripSummary]:
    """Every trip the viewer may see, newest first."""
    return [trip_summary(store, t, owner) for t in store.trip_index(owner).trips.values()]


def trip_detail(store: Store, trip: Trip, owner: bool) -> TripDetail:
    dives = trip_dives(store, trip)
    return TripDetail(
        trip=trip_summary(store, trip, owner),
        dives=[dive_service.list_item(store, d, owner) for d in dives],
        map_sites=stats_service.compute_stats(dives, store.sites).map_sites,
    )


def person_trips(store: Store, person: PersonRecord, owner: bool) -> list[TripTogether]:
    """Trips ``person`` was on, newest first, with the dives we made together on each."""
    index = store.trip_index(owner)
    together: Counter[str] = Counter()
    for dive in dive_service.person_dives(store, person, owner):
        trip = index.by_number.get(dive.number)
        if trip is not None:
            together[trip.slug] += 1
    return [
        TripTogether(
            slug=trip.slug,
            name=trip.name,
            start_date=trip.start,
            end_date=trip.end,
            dives=together[trip.slug],
        )
        for trip in index.trips.values()
        if together[trip.slug]
    ]
