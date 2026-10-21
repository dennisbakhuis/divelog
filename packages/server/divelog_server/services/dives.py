"""Shapes the store's records into API responses, and validated input back into records."""

import bisect
import math
from collections.abc import Sequence
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

from divelog_server.schemas.dive import (
    AdminDiveListItem,
    AttachmentOut,
    Attribution,
    BuddyOut,
    DiveAdminOut,
    DiveIn,
    DiveListItem,
    DiveOut,
    DivePrivate,
    GearSetupRef,
    MapRef,
    NearbySite,
    PersonPrivate,
    PersonPublic,
    ProfileMeta,
    ProfileSample,
    SameDayDive,
    SiteMapOut,
    SiteOut,
    SitePrivate,
    SiteSummary,
    TankIn,
    TankOut,
    TripOut,
    TripRef,
)
from divelog_server.schemas.sitemap import DiveMapAnnotation
from divelog_server.services import stats as stats_service
from divelog_server.services.cylinders import sac_from_tanks, sac_rate, tank_volume_l
from divelog_server.services.profile import profile_stats
from divelog_server.services.storage import media_url, variant_key
from divelog_server.store.countries import alpha2, country_name
from divelog_server.store.models import (
    DiveRecord,
    MediaRef,
    PersonRecord,
    SiteMapRecord,
    SiteRecord,
    TankRecord,
)
from divelog_server.store.store import Store
from divelog_server.store.trips import Trip

EARTH_RADIUS_KM = 6371.0088
NEARBY_RADIUS_KM = 25.0
NEARBY_LIMIT = 6


# ── media ──────────────────────────────────────────────────────────────────


def attachment_out(media: MediaRef) -> AttachmentOut:
    return AttachmentOut(
        id=media.id,
        kind=media.kind,
        mime=media.mime,
        bytes=media.bytes,
        width=media.width,
        height=media.height,
        caption=media.caption,
        credit=media.credit,
        sort=media.sort,
        public=media.public,
        taken_at=media.taken_at,
        original_name=media.original_name,
        url=media_url(media.key),
        variants={name: media_url(variant_key(media.key, name)) for name in media.variants},
        licence=media.licence,
        author=media.author,
        source=media.source,
    )


def visible_media(items: list[MediaRef], owner: bool) -> list[MediaRef]:
    """The attachments a viewer sees, by their order and then by the camera's wall clock."""
    return sorted(
        (m for m in items if owner or m.public),
        key=lambda m: (m.sort, (m.taken_at or datetime.min).replace(tzinfo=None)),
    )


def best_variant(media: MediaRef, *names: str) -> str:
    for name in names:
        if name in media.variants:
            return media_url(variant_key(media.key, name))
    return media_url(media.key)


def cover_url(dive: DiveRecord, owner: bool) -> str | None:
    photos = [m for m in visible_media(dive.media, owner) if m.kind == "photo"]
    if not photos:
        return None
    cover = next((m for m in photos if m.id == dive.cover), photos[0])
    return best_variant(cover, "w800", "thumb")


# ── people ─────────────────────────────────────────────────────────────────


def avatar_url(person: PersonRecord) -> str | None:
    avatar = next((m for m in person.media if m.id == person.avatar), None)
    if avatar is None:
        avatar = next((m for m in person.media if m.kind == "avatar"), None)
    return best_variant(avatar, "avatar", "thumb") if avatar else None


def person_public(person: PersonRecord) -> PersonPublic | None:
    name = person.public_name
    if name is None:
        return None
    return PersonPublic(slug=person.slug, name=name, avatar_url=avatar_url(person))


def person_dive_count(store: Store, person_id: str) -> int:
    """How many dives name the person, whatever their visibility."""
    return len(set(store.dives_by_person.get(person_id, [])))


def person_private(store: Store, person: PersonRecord) -> PersonPrivate:
    return PersonPrivate(
        slug=person.slug,
        name=person.public_name or person.first_name,
        avatar_url=avatar_url(person),
        id=person.id,
        first_name=person.first_name,
        last_name=person.last_name,
        alias=person.alias,
        aliases=person.aliases,
        email=person.email,
        display=person.display,
        notes=person.notes,
        dives=person_dive_count(store, person.id),
    )


def dive_people(store: Store, dive: DiveRecord) -> list[PersonRecord]:
    people = [p for pid in dive.people if (p := store.people.get(pid))]
    return sorted(people, key=lambda p: (p.public_name or p.first_name).lower())


def public_buddies(store: Store, dive: DiveRecord) -> list[PersonPublic]:
    return [out for p in dive_people(store, dive) if (out := person_public(p))]


def viewable(dive: DiveRecord, owner: bool) -> bool:
    """Whether the viewer may see ``dive``: public to all, private to the owner, drafts to none."""
    return dive.visibility == "public" or (owner and dive.visibility != "draft")


def person_dives(store: Store, person: PersonRecord, owner: bool) -> list[DiveRecord]:
    """The dives the viewer may see that ``person`` was on, in dive-number order."""
    dives = (store.dives[n] for n in store.dives_by_person.get(person.id, []))
    return [d for d in dives if viewable(d, owner)]


def dive_buddies(store: Store, dive: DiveRecord, owner: bool) -> list[BuddyOut]:
    """Public buddies of ``dive`` with the same together-stats the people pages show."""
    out: list[BuddyOut] = []
    for person in dive_people(store, dive):
        public = person_public(person)
        if public is None:
            continue
        together = person_dives(store, person, owner)
        stats = stats_service.person_stats(together, store.sites)
        first = min(together, key=stats_service.chrono_key, default=None)
        out.append(
            BuddyOut(
                **public.model_dump(),
                dives_together=stats.dives,
                first_dive=stats.first_dive,
                last_dive=stats.last_dive,
                first_together=first is dive,
            )
        )
    return out


# ── sites and maps ─────────────────────────────────────────────────────────


def site_map_out(record: SiteMapRecord) -> SiteMapOut:
    return SiteMapOut.model_validate(record.model_dump(by_alias=True))


def map_ref(store: Store, site: SiteRecord, ref: str) -> MapRef | None:
    """Resolve a ``collection:name`` reference to something a page can show."""
    collection, _, name = ref.partition(":")
    if collection == "seed":
        if name not in store.seed_maps:
            return None
        base = "repo" if name in store.log_sites.seed_maps else "commons"
        return MapRef(
            ref=ref,
            collection="seed",
            title="Site sketch",
            url=f"/media/{base}/maps/seed/{name}.svg",
        )
    if collection == "drawn":
        record = store.maps.get(name)
        if record is None:
            return None
        return MapRef(
            ref=ref,
            collection="drawn",
            title=record.title or ("Stick map" if record.kind == "stickmap" else "Site map"),
            drawn=site_map_out(record),
        )
    if collection == "reference":
        entry = next((r for r in store.reference_maps if r.file == name), None)
        if entry is None:
            return None
        return MapRef(
            ref=ref,
            collection="reference",
            title=entry.title or name,
            url=f"/api/v1/admin/files/reference/{name}",
            public=False,
            credit=entry.source or None,
            warning=entry.warning,
        )
    return None


def site_maps(store: Store, site: SiteRecord) -> list[MapRef]:
    """Public maps of a site: drawn first, then seed sketches."""
    refs: list[str] = [f"drawn:{m}" for m in store.maps_by_site.get(site.site_id, [])]
    refs += [r for r in site.maps if not r.startswith("drawn:")]
    seen: set[str] = set()
    out: list[MapRef] = []
    for ref in refs:
        if ref in seen:
            continue
        seen.add(ref)
        resolved = map_ref(store, site, ref)
        if resolved is None:
            continue
        out.append(resolved)
    if site.default_map:
        out.sort(key=lambda m: m.ref != site.default_map)
    return out


def site_summary(store: Store, site: SiteRecord) -> SiteSummary:
    hidden = site.location_visibility == "region_only"
    return SiteSummary(
        slug=site.site_id,
        name=site.name,
        country_code=alpha2(site.country),
        country_name=country_name(site.country),
        region=site.region,
        area=site.area,
        lat=None if hidden else site.lat,
        lon=None if hidden else site.lon,
        site_type=site.type,
        water=site.water,
    )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres between two points in degrees."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def _placed(site: SiteRecord) -> tuple[float, float] | None:
    if site.location_visibility != "exact" or site.lat is None or site.lon is None:
        return None
    return site.lat, site.lon


def nearby_sites(
    store: Store,
    site: SiteRecord,
    owner: bool,
    *,
    radius_km: float = NEARBY_RADIUS_KM,
    limit: int = NEARBY_LIMIT,
) -> list[NearbySite]:
    """Closest other sites within ``radius_km``, nearest first.

    Only sites whose exact position is public take part, on both ends: a
    ``region_only`` site gets no neighbours and is nobody's neighbour, so no
    distance can be used to triangulate it.

    Parameters
    ----------
    store
        The loaded data.
    site
        The site whose page is shown.
    owner
        Whether private dives count towards each neighbour's dive count.
    radius_km
        Largest distance to include.
    limit
        Most neighbours to return.

    Returns
    -------
    list[NearbySite]
        Distance rounded to 0.1 km.
    """
    origin = _placed(site)
    if origin is None:
        return []
    found: list[tuple[float, SiteRecord, tuple[float, float]]] = []
    for other in store.listed_sites(owner).values():
        if other.site_id == site.site_id or (where := _placed(other)) is None:
            continue
        distance = haversine_km(*origin, *where)
        if distance <= radius_km:
            found.append((distance, other, where))
    found.sort(key=lambda item: (item[0], item[1].name.lower()))
    return [
        NearbySite(
            slug=other.site_id,
            name=other.name,
            country_code=alpha2(other.country),
            site_type=other.type,
            lat=where[0],
            lon=where[1],
            distance_km=round(distance, 1),
            dives=sum(
                1
                for n in store.dives_by_site.get(other.site_id, [])
                if viewable(store.dives[n], owner)
            ),
        )
        for distance, other, where in found[:limit]
    ]


COMMONS_LICENCE = "ODbL-1.0 + CC-BY-SA-4.0"


def site_attribution(store: Store, site: SiteRecord) -> Attribution | None:
    """Licence and source of a site taken from the commons; None for personal sites."""
    if store.commons is None or store.site_origin.get(site.site_id) != "commons":
        return None
    return Attribution(licence=COMMONS_LICENCE, source=store.commons.name, ref=store.commons.head())


def site_out(store: Store, site: SiteRecord, owner: bool) -> SiteOut:
    numbers = store.dives_by_site.get(site.site_id, [])
    dives = [store.dives[n] for n in numbers if store.dives[n].visibility != "draft"]
    if not owner:
        dives = [d for d in dives if d.visibility == "public"]
    region = store.regions.get(site.region) if site.region else None
    hidden = site.location_visibility == "region_only" and not owner
    private = None
    if owner:
        reference = [
            r for ref in site.reference_maps if (r := map_ref(store, site, ref)) is not None
        ]
        private = SitePrivate(
            notes=site.notes,
            reference_maps=reference,
            pin=store.site_pin_state(site.site_id),
        )
    return SiteOut(
        id=site.site_id,
        slug=site.site_id,
        name=site.name,
        full_name=site.full_name,
        short_name=site.short_name,
        aliases=site.aliases,
        country=site.country,
        country_code=alpha2(site.country),
        country_name=country_name(site.country),
        region=site.region,
        region_name=region.name if region else None,
        area=site.area,
        system=site.system,
        site_type=site.type,
        section_vocabulary=site.section_vocabulary,
        lat=None if hidden else site.lat,
        lon=None if hidden else site.lon,
        access=None if hidden else site.access,
        location_visibility=site.location_visibility,
        water=site.water,
        halocline=site.halocline,
        halocline_m=site.halocline_m,
        summary=site.summary,
        description_md=site.body_md,
        max_depth_m=max((d.max_depth_m for d in dives), default=None),
        dives=len(dives),
        first_dive=min((d.date for d in dives), default=None),
        last_dive=max((d.date for d in dives), default=None),
        maps=site_maps(store, site),
        default_map=site.default_map,
        attachments=[attachment_out(m) for m in visible_media(site.media, owner)],
        prices=site.prices,
        sources=site.sources,
        verified=site.verified,
        geo_source=site.geo_source,
        origin=store.site_origin.get(site.site_id, "log"),
        attribution=site_attribution(store, site),
        revision=site.revision,
        changelog=site.changelog,
        forked_from=site.forked_from,
        private=private,
    )


# ── dives ──────────────────────────────────────────────────────────────────


def gas_label(gas: str, o2: int | None, he: int | None) -> str:
    """The mix as divers say it: "Air", "Nitrox 32", "Trimix 21/35", "Oxygen"."""
    if gas == "trimix":
        return f"Trimix {o2 if o2 is not None else '?'}/{he if he is not None else '?'}"
    if gas == "nitrox":
        return f"Nitrox {o2 if o2 is not None else 32}"
    if gas == "oxygen":
        return "Oxygen"
    return "Air"


def gases_of(dive: DiveRecord) -> list[str]:
    """Every distinct mix on the dive, the back gas first; none when the gas is not known."""
    labels = [gas_label(dive.gas, dive.o2_pct, dive.he_pct)] if dive.gas else []
    for tank in dive.tanks:
        label = gas_label(tank.gas, tank.o2_pct, tank.he_pct)
        if label not in labels:
            labels.append(label)
    return labels


def search_text(store: Store, dive: DiveRecord, owner: bool) -> str:
    """Every word worth searching for, once; the index tokenises it anyway."""
    site = store.sites.get(dive.site) if dive.site else None
    region = store.regions.get(site.region) if site and site.region else None
    parts: list[str | None] = [
        f"#{dive.number}",
        dive.title,
        site.name if site else dive.site_name_raw,
        site.full_name if site else None,
        " ".join(site.aliases) if site else None,
        site.area if site else dive.area_raw,
        site.system if site else None,
        country_name(site.country if site else dive.country),
        region.name if region else None,
        site.type if site else None,
        dive.section,
        " ".join(p.name for p in public_buddies(store, dive)),
        " ".join(dive.tags),
        dive.types_raw,
        dive.gas,
        " ".join(gases_of(dive)),
        dive.gas_raw,
        dive.mode,
        dive.suit,
        dive.course,
        dive.body_md,
        dive.notes_nl,
    ]
    if owner:
        parts += [
            " ".join(p.full_name for p in dive_people(store, dive)),
            dive.buddy_raw,
            dive.operator,
        ]
    seen: set[str] = set()
    tokens: list[str] = []
    for part in parts:
        for token in (part or "").split():
            key = token.lower().strip(".,;:()[]\"'")
            if key and key not in seen:
                seen.add(key)
                tokens.append(token)
    return " ".join(tokens)


def dive_trip(store: Store, dive: DiveRecord, owner: bool) -> Trip | None:
    """The derived trip ``dive`` belongs to, as the viewer sees the trips."""
    return store.trip_index(owner).by_number.get(dive.number)


def trip_out(trip: Trip, dive: DiveRecord) -> TripOut:
    return TripOut(
        slug=trip.slug,
        name=trip.name,
        start_date=trip.start,
        end_date=trip.end,
        description_md=trip.description_md,
        day_index=trip.day_index(dive.date),
        days=trip.days,
    )


def list_item(store: Store, dive: DiveRecord, owner: bool) -> DiveListItem:
    site = store.sites.get(dive.site) if dive.site else None
    trip = dive_trip(store, dive, owner)
    setup = store.gear_setups.get(dive.gear_setup) if dive.gear_setup else None
    return DiveListItem(
        number=dive.number,
        title=dive.title,
        date=dive.date,
        time_in=dive.time_in,
        duration_min=dive.duration_min,
        max_depth_m=dive.max_depth_m,
        water_temp_c=dive.water_temp_c,
        tags=dive.tags,
        gas=dive.gas,
        gases=gases_of(dive),
        mode=dive.mode,
        site=site_summary(store, site) if site else None,
        section=dive.section,
        buddies=public_buddies(store, dive),
        gear_setup=setup.id if setup else None,
        rating=dive.rating,
        has_photos=any(m.kind == "photo" for m in visible_media(dive.media, owner)),
        has_profile=bool(dive.profiles),
        spark=store.sparkline(dive),
        cover_url=cover_url(dive, owner),
        search_text=search_text(store, dive, owner),
        trip=TripRef(slug=trip.slug, name=trip.name) if trip else None,
    )


def profile_out(
    store: Store, dive: DiveRecord
) -> tuple[list[ProfileSample] | None, ProfileMeta | None]:
    rows = store.profile_samples(dive)
    if rows is None:
        return None, None
    payload = store.profile(dive) or {}
    stats = profile_stats(payload)
    meta = ProfileMeta(
        gf=payload.get("gf"),
        deco_model=payload.get("deco_model"),
        deco=bool(payload.get("deco")),
        gas_switches=payload.get("gas_switches") or [],
        surface_breaks=payload.get("surface_breaks") or [],
        temp_min_c=payload.get("temp_min_c"),
        temp_max_c=payload.get("temp_max_c"),
        sample_interval_s=payload.get("sample_interval_s"),
        partial=payload.get("partial"),
        **(asdict(stats) if stats else {}),
    )
    return [ProfileSample.model_validate(r) for r in rows], meta


def dive_map(store: Store, dive: DiveRecord) -> SiteMapOut | None:
    """The map a dive is drawn on: the annotated one, else the site's default drawn map."""
    if dive.map_annotation:
        annotation = DiveMapAnnotation.model_validate(dive.map_annotation)
        record = store.maps.get(annotation.map_id)
        return site_map_out(record) if record else None
    site = store.sites.get(dive.site) if dive.site else None
    if site is None:
        return None
    drawn = [store.maps[m] for m in store.maps_by_site.get(site.site_id, [])]
    if not drawn:
        return None
    preferred = next((m for m in drawn if f"drawn:{m.id}" == site.default_map), None)
    return site_map_out(preferred or min(drawn, key=lambda m: m.sort))


def neighbours(store: Store, dive: DiveRecord, owner: bool) -> tuple[int | None, int | None]:
    """Previous and next dive by number, skipping what the viewer may not see."""
    numbers = store.sorted_numbers
    index = bisect.bisect_left(numbers, dive.number)

    def visible(n: int) -> bool:
        return owner or store.dives[n].visibility == "public"

    prev_number = next((n for n in reversed(numbers[:index]) if visible(n)), None)
    next_number = next((n for n in numbers[index + 1 :] if visible(n)), None)
    return prev_number, next_number


def site_dive_index(store: Store, dive: DiveRecord, owner: bool) -> int | None:
    """Chronological rank of ``dive`` among the dives at its site the viewer may see."""
    if not dive.site or not viewable(dive, owner):
        return None
    at_site = [
        d for n in store.dives_by_site.get(dive.site, []) if viewable(d := store.dives[n], owner)
    ]
    at_site.sort(key=stats_service.chrono_key)
    return at_site.index(dive) + 1


def dive_site_name(store: Store, dive: DiveRecord) -> str | None:
    """The site name the dive list shows, else the name as logged."""
    site = store.sites.get(dive.site) if dive.site else None
    return site.name if site else dive.site_name_raw


def neighbour_site_name(store: Store, number: int | None) -> str | None:
    """Site name of the dive numbered ``number``, when there is one."""
    dive = store.dives.get(number) if number is not None else None
    return dive_site_name(store, dive) if dive else None


def same_day(store: Store, dive: DiveRecord, owner: bool) -> tuple[int | None, list[SameDayDive]]:
    """This dive's place in its day, and the other dives that day, when there were several."""
    day = [d for d in store.dives.values() if d.date == dive.date and viewable(d, owner)]
    if not any(d is dive for d in day):
        day.append(dive)
    if len(day) < 2:
        return None, []
    day.sort(key=stats_service.chrono_key)
    others = [
        SameDayDive(
            number=d.number,
            site_name=dive_site_name(store, d),
            time_in=d.time_in,
        )
        for d in day
        if d is not dive
    ]
    return day.index(dive) + 1, others


def dive_out(
    store: Store,
    dive: DiveRecord,
    *,
    owner: bool,
    prev_number: int | None = None,
    next_number: int | None = None,
) -> DiveOut:
    site = store.sites.get(dive.site) if dive.site else None
    trip = dive_trip(store, dive, owner)
    setup = store.gear_setups.get(dive.gear_setup) if dive.gear_setup else None
    samples, meta = profile_out(store, dive)
    day_index, day_others = same_day(store, dive, owner)
    annotation = (
        DiveMapAnnotation.model_validate(dive.map_annotation) if dive.map_annotation else None
    )
    stale, dropped = annotation_health(store, annotation)
    if dive.tanks:
        sac_l_min, sac_basis = sac_from_tanks(dive.tanks, dive.duration_min, dive.avg_depth_m)
    else:
        sac_l_min, sac_basis = sac_rate(
            dive.cylinder,
            dive.pressure_in_bar,
            dive.pressure_out_bar,
            dive.duration_min,
            dive.avg_depth_m,
        )
    private = None
    if owner:
        private = DivePrivate(
            people=[person_private(store, p) for p in dive_people(store, dive)],
            buddy_raw=dive.buddy_raw,
            buddy_role=dive.buddy_role,
            operator=dive.operator,
            flags=dive.flags,
            sketch=dive.sketch,
            site_name_raw=dive.site_name_raw,
            area_raw=dive.area_raw,
        )
    return DiveOut(
        number=dive.number,
        title=dive.title,
        date=dive.date,
        time_in=dive.time_in,
        time_out=dive.time_out,
        duration_min=dive.duration_min,
        max_depth_m=dive.max_depth_m,
        avg_depth_m=dive.avg_depth_m,
        water_temp_c=dive.water_temp_c,
        surface_temp_c=dive.surface_temp_c,
        air_temp_c=dive.air_temp_c,
        thermocline_m=dive.thermocline_m,
        visibility_m=dive.visibility_m,
        visibility_raw=dive.visibility_raw,
        site=site_out(store, site, owner) if site else None,
        section=dive.section,
        trip=trip_out(trip, dive) if trip else None,
        tags=dive.tags,
        types_raw=dive.types_raw,
        gas=dive.gas,
        o2_pct=dive.o2_pct,
        o2_measured_pct=dive.o2_measured_pct,
        he_pct=dive.he_pct,
        gas_raw=dive.gas_raw,
        mode=dive.mode,
        suit=dive.suit,
        weights_kg=dive.weights_kg,
        cylinder=dive.cylinder,
        pressure_in_bar=dive.pressure_in_bar,
        pressure_out_bar=dive.pressure_out_bar,
        tanks=[tank_out(t) for t in dive.tanks],
        sac_l_min=sac_l_min,
        sac_basis=sac_basis,
        safety_stop_min=dive.safety_stop_min,
        surface_interval=dive.surface_interval,
        conditions=dive.conditions,
        difficulty=dive.difficulty,
        course=dive.course,
        rating=dive.rating,
        gear_setup=GearSetupRef(slug=setup.id, name=setup.name) if setup else None,
        guide=dive.guide,
        body_md=dive.body_md,
        notes_nl=dive.notes_nl,
        visibility=dive.visibility,
        buddies=dive_buddies(store, dive, owner),
        attachments=[attachment_out(m) for m in visible_media(dive.media, owner)],
        cover_attachment_id=dive.cover,
        computer=dive.computer,
        profile=samples,
        profile_meta=meta,
        map_annotation=annotation,
        annotation_stale=stale,
        annotation_dropped_legs=dropped,
        map=dive_map(store, dive),
        prev_number=prev_number,
        next_number=next_number,
        prev_site_name=neighbour_site_name(store, prev_number),
        next_site_name=neighbour_site_name(store, next_number),
        site_dive_index=site_dive_index(store, dive, owner),
        day_index=day_index,
        same_day=day_others,
        context_facts=stats_service.context_facts(dive, list(store.dives.values()), store.sites),
        private=private,
    )


def dive_admin_out(store: Store, dive: DiveRecord) -> DiveAdminOut:
    base = dive_out(store, dive, owner=True).model_dump(by_alias=True)
    return DiveAdminOut(
        **base,
        id=dive.number,
        people_ids=list(dive.people),
        site_id=dive.site,
        trip_id=dive.trip,
        gear_setup_id=dive.gear_setup,
        country=dive.country,
    )


def admin_list_item(store: Store, dive: DiveRecord) -> AdminDiveListItem:
    """The editor's list row for ``dive``; the full record comes from ``dive_admin_out``."""
    site = store.sites.get(dive.site) if dive.site else None
    return AdminDiveListItem(
        number=dive.number,
        date=dive.date,
        title=dive.title,
        site_name=site.name if site else None,
        max_depth_m=dive.max_depth_m,
        duration_min=dive.duration_min,
        tags=dive.tags,
        attachments=len(visible_media(dive.media, owner=True)),
        visibility=dive.visibility,
    )


def annotation_health(store: Store, annotation: DiveMapAnnotation | None) -> tuple[bool, int]:
    """Whether an annotation predates its map's revision, and how many legs no longer fit.

    Node renames listed on the map (``renamed_nodes``) are followed before a leg counts as
    dropped; a leg is dropped when one of its ends is not a node of the map any more. An
    annotation on a map that is gone is stale with every leg dropped.

    Returns
    -------
    tuple[bool, int]
        ``(annotation_stale, annotation_dropped_legs)``.
    """
    if annotation is None:
        return False, 0
    record = store.maps.get(annotation.map_id)
    if record is None:
        return True, len(annotation.route)
    node_ids = {n.id for n in record.nodes}
    renamed = record.renamed_nodes

    def current(node_id: str) -> str:
        seen: set[str] = set()
        while node_id in renamed and node_id not in seen:
            seen.add(node_id)
            node_id = renamed[node_id]
        return node_id

    dropped = sum(
        1
        for leg in annotation.route
        if current(leg.from_) not in node_ids or current(leg.to) not in node_ids
    )
    return annotation.revision < record.revision, dropped


class AnnotationError(ValueError):
    """The annotation points at a map that does not exist."""


def clean_annotation(store: Store, annotation: DiveMapAnnotation | None) -> dict[str, Any] | None:
    """Drop route legs, turn and pins that do not exist on the referenced map.

    Legs stay in swim order and may repeat: an out-and-back swims a leg twice.
    """
    if annotation is None:
        return None
    record = store.maps.get(annotation.map_id)
    if record is None:
        raise AnnotationError("Map not found")
    node_ids = {n.id for n in record.nodes}
    edge_keys = {frozenset((e.from_, e.to)) for e in record.edges}
    route = [leg for leg in annotation.route if frozenset((leg.from_, leg.to)) in edge_keys]
    cleaned = annotation.model_copy(
        update={
            "revision": record.revision,
            "route": route,
            "turn": annotation.turn if annotation.turn in node_ids else None,
            "turn_at": (
                annotation.turn_at
                if annotation.turn_at is not None and annotation.turn_at < len(annotation.path)
                else None
            ),
        }
    )
    return cleaned.model_dump(by_alias=True, mode="json")


def tank_out(tank: TankRecord) -> TankOut:
    return TankOut(
        cylinder=tank.cylinder,
        volume_l=tank_volume_l(tank.cylinder, tank.volume_l),
        gas=tank.gas,
        o2_pct=tank.o2_pct,
        o2_measured_pct=tank.o2_measured_pct,
        he_pct=tank.he_pct,
        pressure_in_bar=tank.pressure_in_bar,
        pressure_out_bar=tank.pressure_out_bar,
        role=tank.role,
    )


STAGE_ROLES = {"stage", "deco"}


def with_stage_tag(tags: list[str], tanks: Sequence[TankIn]) -> list[str]:
    """The tags with ``stage`` added when a stage or deco cylinder was carried."""
    if "stage" in tags or not any(t.role in STAGE_ROLES for t in tanks):
        return list(tags)
    return [*tags, "stage"]


def gas_summary(tanks: Sequence[TankIn]) -> dict[str, Any]:
    """The single-gas fields the list, filters and stats read, taken from the back gas.

    The first ``back`` tank (or the first tank) is the gas of the dive; its
    pressures are the dive's pressures, and the cylinder text names every tank.
    """
    main = next((t for t in tanks if t.role == "back"), tanks[0])
    gas = main.gas if main.gas != "oxygen" else "nitrox"
    return {
        "gas": gas,
        "o2_pct": 100 if main.gas == "oxygen" else main.o2_pct,
        "o2_measured_pct": main.o2_measured_pct,
        "he_pct": main.he_pct,
        "cylinder": " + ".join(t.cylinder for t in tanks),
        "pressure_in_bar": main.pressure_in_bar,
        "pressure_out_bar": main.pressure_out_bar,
    }


GAS_FIELDS = (
    "gas",
    "o2_pct",
    "o2_measured_pct",
    "he_pct",
    "cylinder",
    "pressure_in_bar",
    "pressure_out_bar",
)


def apply_dive_in(store: Store, dive: DiveRecord | None, data: DiveIn) -> DiveRecord:
    """Build the record for validated input, keeping what the form does not carry.

    The single-gas fields follow the tanks: with tanks the first back-gas tank sets them, so
    whatever the body says is ignored. Without tanks they are taken from the body when sent,
    otherwise kept from the stored dive, and unknown (``null``) on a new dive or once the last
    tank is removed.
    """
    unsent = {f for f in GAS_FIELDS if f not in data.model_fields_set}
    fields = data.model_dump(
        exclude={
            "people_ids",
            "profile",
            "map_annotation",
            "site_id",
            "trip_id",
            "gear_setup_id",
            "cover_attachment_id",
            *unsent,
        }
    )
    payload: dict[str, Any] = dive.model_dump() if dive else {}
    if dive is None or dive.tanks:
        payload.update(dict.fromkeys(unsent))
    payload.update(fields)
    if data.tanks:
        payload.update(gas_summary(data.tanks))
        payload["tags"] = with_stage_tag(data.tags, data.tanks)
    payload["site"] = data.site_id
    payload["trip"] = data.trip_id
    payload["gear_setup"] = data.gear_setup_id
    payload["cover"] = data.cover_attachment_id
    payload["people"] = [pid for pid in data.people_ids if pid in store.people]
    if data.site_id and data.site_id not in store.sites:
        raise ValueError(f"Unknown site {data.site_id!r}")
    site = store.sites.get(data.site_id) if data.site_id else None
    payload["country"] = site.country if site else payload.get("country")
    payload["map_annotation"] = clean_annotation(store, data.map_annotation)
    payload["media"] = dive.media if dive else []
    payload["profiles"] = list(dive.profiles) if dive else []
    if data.profile is not None:
        samples = [s.model_dump(exclude_none=True) for s in data.profile]
        name = f"manual_{data.number:05d}.json"
        relative = store.save_profile(name, {"source": "manual", "samples": samples})
        payload["profiles"] = [relative]
    record = DiveRecord.model_validate(payload)
    record.body_md = data.body_md
    return record


def setup_dive_counts(store: Store) -> dict[str, int]:
    counts: dict[str, int] = {}
    for dive in store.dives.values():
        if dive.gear_setup:
            counts[dive.gear_setup] = counts.get(dive.gear_setup, 0) + 1
    return counts


def item_dive_counts(store: Store) -> dict[str, int]:
    """Dives per gear item, via the setups the item is part of."""
    per_setup = setup_dive_counts(store)
    counts: dict[str, int] = {}
    for setup in store.gear_setups.values():
        for item_id in setup.items:
            counts[item_id] = counts.get(item_id, 0) + per_setup.get(setup.id, 0)
    return counts


def now() -> datetime:
    return datetime.now(UTC)
