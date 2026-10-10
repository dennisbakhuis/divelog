"""Read-only endpoints. The owner's cookie unlocks private fields and turns caching off."""

from fastapi import APIRouter, HTTPException, Response

from divelog_server.core.deps import OptionalOwnerDep, StoreDep
from divelog_server.schemas.dive import (
    DiveEnvelope,
    DiveListItem,
    DiveOut,
    DiveStats,
    DiveSummary,
    DiveTimeline,
    GearSetupRef,
    PersonDetail,
    PersonOut,
    PersonPublic,
    RegionOut,
    SiteDetail,
    SiteDiveRoute,
    SiteOut,
    TimelineDive,
    TimelineYear,
    TripDetail,
    TripSummary,
)
from divelog_server.schemas.gear import GearItemOut, GearPage, GearSetupOut
from divelog_server.schemas.sitemap import DiveMapAnnotation
from divelog_server.services import dives as dive_service
from divelog_server.services import stats as stats_service
from divelog_server.services import trips as trip_service
from divelog_server.store.countries import alpha2
from divelog_server.store.models import DiveRecord, PersonRecord
from divelog_server.store.store import Store

router = APIRouter()

PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=600"
PRIVATE_CACHE = "private, no-store"


def _cache(response: Response, owner: bool) -> None:
    response.headers["Cache-Control"] = PRIVATE_CACHE if owner else PUBLIC_CACHE
    response.headers["Vary"] = "Cookie"


def _visible(store: Store, owner: bool) -> list[DiveRecord]:
    dives = [store.dives[n] for n in reversed(store.sorted_numbers)]
    if owner:
        return [d for d in dives if d.visibility != "draft"]
    return [d for d in dives if d.visibility == "public"]


def _by_date(dives: list[DiveRecord]) -> list[DiveRecord]:
    return sorted(dives, key=lambda d: (d.date, d.number), reverse=True)


@router.get("/stats", response_model=DiveStats)
async def dive_stats(store: StoreDep, owner: OptionalOwnerDep, response: Response) -> DiveStats:
    is_owner = owner is not None
    _cache(response, is_owner)
    return stats_service.compute_stats(list(store.dives.values()), store.listed_sites(is_owner))


@router.get("/summary", response_model=DiveSummary)
async def dive_summary(store: StoreDep, response: Response) -> DiveSummary:
    _cache(response, False)
    return stats_service.compute_summary(list(store.dives.values()), store.listed_sites())


@router.get("/timeline", response_model=DiveTimeline)
async def dive_timeline(store: StoreDep, response: Response) -> DiveTimeline:
    """Front-page timeline: dives per year and the latest public dive to link to."""
    _cache(response, False)
    counted = [d for d in store.dives.values() if d.visibility != "draft"]
    per_year: dict[int, int] = {}
    for d in counted:
        per_year[d.date.year] = per_year.get(d.date.year, 0) + 1
    years = (
        [
            TimelineYear(year=y, dives=per_year.get(y, 0))
            for y in range(min(per_year), max(per_year) + 1)
        ]
        if per_year
        else []
    )
    public = [d for d in counted if d.visibility == "public"]
    last = max(public, key=lambda d: (d.date, d.number), default=None)
    latest = None
    if last is not None:
        site = store.sites.get(last.site) if last.site else None
        latest = TimelineDive(number=last.number, date=last.date, site=site.name if site else None)
    return DiveTimeline(years=years, latest=latest)


@router.get("/dives", response_model=DiveEnvelope)
async def list_dives(store: StoreDep, owner: OptionalOwnerDep, response: Response) -> DiveEnvelope:
    is_owner = owner is not None
    _cache(response, is_owner)
    dives = _by_date(_visible(store, is_owner))
    setups = sorted(store.gear_setups.values(), key=lambda s: (s.sort, s.name))
    regions = sorted(
        {s.region for d in dives if d.site and (s := store.sites.get(d.site)) and s.region}
    )
    types = sorted({s.type for d in dives if d.site and (s := store.sites.get(d.site))})
    return DiveEnvelope(
        dives=[dive_service.list_item(store, d, is_owner) for d in dives],
        total=len(dives),
        tags=stats_service.tags_of(dives),
        countries=stats_service.countries_of(dives, store.sites),
        years=stats_service.years_of(dives),
        regions=regions,
        site_types=types,
        gear_setups=[GearSetupRef(slug=s.id, name=s.name) for s in setups],
    )


@router.get("/dives/{number}", response_model=DiveOut)
async def get_dive(
    number: int, store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> DiveOut:
    is_owner = owner is not None
    dive = store.dives.get(number)
    if dive is None or (dive.visibility != "public" and not is_owner):
        raise HTTPException(status_code=404, detail="Dive not found")
    _cache(response, is_owner)
    prev_number, next_number = dive_service.neighbours(store, dive, is_owner)
    return dive_service.dive_out(
        store, dive, owner=is_owner, prev_number=prev_number, next_number=next_number
    )


@router.get("/sites", response_model=list[SiteOut])
async def list_sites(store: StoreDep, owner: OptionalOwnerDep, response: Response) -> list[SiteOut]:
    is_owner = owner is not None
    _cache(response, is_owner)
    sites = sorted(store.listed_sites(is_owner).values(), key=lambda s: s.name.lower())
    return [dive_service.site_out(store, s, is_owner) for s in sites]


@router.get("/sites/{slug}", response_model=SiteDetail)
async def get_site(
    slug: str, store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> SiteDetail:
    is_owner = owner is not None
    site = store.sites.get(slug)
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    _cache(response, is_owner)
    numbers = store.dives_by_site.get(site.site_id, [])
    dives = _by_date([d for n in numbers if (d := store.dives[n]) in _visible(store, is_owner)])
    items: list[DiveListItem] = [dive_service.list_item(store, d, is_owner) for d in dives]
    people: dict[str, PersonPublic] = {}
    for d in dives:
        for buddy in dive_service.public_buddies(store, d):
            people.setdefault(buddy.slug, buddy)
    return SiteDetail(
        site=dive_service.site_out(store, site, is_owner),
        dives=items,
        people=sorted(people.values(), key=lambda p: p.name.lower()),
        nearby=dive_service.nearby_sites(store, site, is_owner),
        routes=[
            SiteDiveRoute(
                number=d.number,
                date=d.date,
                title=d.title,
                annotation=DiveMapAnnotation.model_validate(d.map_annotation),
            )
            for d in dives
            if d.map_annotation is not None
        ],
    )


@router.get("/regions", response_model=list[RegionOut])
async def list_regions(
    store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> list[RegionOut]:
    is_owner = owner is not None
    _cache(response, is_owner)
    return [
        region_out(store, rid, is_owner, with_body=False) for rid in store.listed_regions(is_owner)
    ]


@router.get("/regions/{region_id}", response_model=RegionOut)
async def get_region(
    region_id: str, store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> RegionOut:
    if region_id not in store.regions:
        raise HTTPException(status_code=404, detail="Region not found")
    is_owner = owner is not None
    _cache(response, is_owner)
    return region_out(store, region_id, is_owner, with_body=True)


def region_out(store: Store, region_id: str, owner: bool, *, with_body: bool) -> RegionOut:
    """A region with its listed sites; ``with_body`` adds the description, stats and map."""
    region = store.regions[region_id]
    listed = store.listed_sites(owner)
    sites = sorted(
        (s for s in listed.values() if s.region == region_id), key=lambda s: s.name.lower()
    )
    visible = {d.number for d in _visible(store, owner)}
    numbers = [n for s in sites for n in store.dives_by_site.get(s.site_id, []) if n in visible]
    region_dives = [store.dives[n] for n in numbers] if with_body else []
    return RegionOut(
        id=region.region,
        name=region.name,
        country=region.country,
        country_code=alpha2(region.country),
        waters=region.waters,
        body_md=region.body_md if with_body else "",
        sites=[dive_service.site_summary(store, s) for s in sites],
        dives=len(numbers),
        stats=stats_service.region_stats(region_dives, listed) if with_body else None,
        map_sites=stats_service.compute_stats(region_dives, listed).map_sites if with_body else [],
    )


@router.get("/trips", response_model=list[TripSummary])
async def list_trips(
    store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> list[TripSummary]:
    is_owner = owner is not None
    _cache(response, is_owner)
    return trip_service.trip_list(store, is_owner)


@router.get("/trips/{slug}", response_model=TripDetail)
async def get_trip(
    slug: str, store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> TripDetail:
    is_owner = owner is not None
    trip = store.trip_index(is_owner).trips.get(slug)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    _cache(response, is_owner)
    return trip_service.trip_detail(store, trip, is_owner)


@router.get("/people", response_model=list[PersonOut])
async def list_people(
    store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> list[PersonOut]:
    is_owner = owner is not None
    _cache(response, is_owner)
    out = [
        p
        for person in store.people.values()
        if (p := _person_out(store, person, is_owner, with_bio=False)) is not None
    ]
    return sorted(out, key=lambda p: (-p.stats.dives, p.name.lower()))


@router.get("/people/{slug}", response_model=PersonDetail)
async def get_person(
    slug: str, store: StoreDep, owner: OptionalOwnerDep, response: Response
) -> PersonDetail:
    is_owner = owner is not None
    person_id = store.person_by_slug.get(slug)
    person = store.people.get(person_id) if person_id else None
    out = _person_out(store, person, is_owner, with_bio=True) if person else None
    if person is None or out is None:
        raise HTTPException(status_code=404, detail="Person not found")
    _cache(response, is_owner)
    dives = _by_date(dive_service.person_dives(store, person, is_owner))
    stats = stats_service.compute_stats(dives, store.sites)
    return PersonDetail(
        person=out,
        countries=stats_service.countries_of(dives, store.sites),
        dives=[dive_service.list_item(store, d, is_owner) for d in dives],
        map_sites=stats.map_sites,
        years=stats.years,
        trips=trip_service.person_trips(store, person, is_owner),
    )


def _person_out(
    store: Store, person: PersonRecord, owner: bool, *, with_bio: bool
) -> PersonOut | None:
    public = dive_service.person_public(person)
    if public is None and not owner:
        return None
    dives = dive_service.person_dives(store, person, owner)
    if not dives and not owner:
        return None
    return PersonOut(
        slug=person.slug,
        name=public.name if public else person.first_name,
        avatar_url=dive_service.avatar_url(person),
        bio_md=person.body_md if with_bio else "",
        stats=stats_service.person_stats(dives, store.sites),
        countries=[c.country_code for c in stats_service.countries_of(dives, store.sites)],
        private=dive_service.person_private(store, person) if owner else None,
    )


@router.get("/gear", response_model=GearPage)
async def gear(store: StoreDep, owner: OptionalOwnerDep, response: Response) -> GearPage:
    _cache(response, owner is not None)
    setups = sorted(store.gear_setups.values(), key=lambda s: (s.sort, s.name))
    items = sorted(store.gear_items.values(), key=lambda i: (i.sort, i.name))
    setup_counts = dive_service.setup_dive_counts(store)
    item_counts = dive_service.item_dive_counts(store)

    def item_out(item_id: str) -> GearItemOut | None:
        item = store.gear_items.get(item_id)
        if item is None:
            return None
        photo = next((m for m in item.media if m.kind == "photo"), None)
        return GearItemOut(
            id=item.id,
            name=item.name,
            category=item.category,
            brand=item.brand,
            model=item.model,
            acquired=item.acquired,
            retired=item.retired,
            notes_md=item.notes_md,
            sort=item.sort,
            photo_url=dive_service.best_variant(photo, "w800", "thumb") if photo else None,
            dive_count=item_counts.get(item.id, 0),
        )

    return GearPage(
        setups=[
            GearSetupOut(
                id=s.id,
                slug=s.id,
                name=s.name,
                description_md=s.description_md,
                sort=s.sort,
                items=[i for item_id in s.items if (i := item_out(item_id)) is not None],
                dive_count=setup_counts.get(s.id, 0),
                tanks=[dive_service.tank_out(t) for t in s.tanks],
                suit=s.suit,
                weights_kg=s.weights_kg,
            )
            for s in setups
        ],
        items=[i for item in items if (i := item_out(item.id)) is not None],
    )
