"""Owner-only endpoints behind the session cookie: everything that writes."""

import asyncio
import logging
import re
import unicodedata
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

from divelog_server.api.v1.public import region_out
from divelog_server.core.config import get_settings
from divelog_server.core.deps import StoreDep, require_owner
from divelog_server.importers.shearwater import gas_of, parse_shearwater
from divelog_server.importers.site_match import MATCH_RADIUS_M, match_site
from divelog_server.importers.subsurface import gas_for, parse_subsurface
from divelog_server.schemas.admin import (
    AdminDivePage,
    DiveSort,
    DivesPublishIn,
    DivesPublishOut,
    DiveTemplateOut,
    MarkdownPreviewIn,
    MarkdownPreviewOut,
    NearbySitesOut,
    SiteFieldsOut,
    SiteMapDraft,
    SiteMapSeedIn,
    SiteMapSeedOut,
)
from divelog_server.schemas.dive import (
    AdminDiveListItem,
    AttachmentOut,
    AttachmentPatch,
    DiveAdminOut,
    DiveIn,
    DivePatch,
    ImportRecordOut,
    ImportResult,
    ImportSiteOut,
    NextDiveNumber,
    PersonIn,
    PersonPrivate,
    RegionIn,
    RegionOut,
    RepoStatus,
    SiteIn,
    SiteMapIn,
    SiteMapOut,
    SiteOut,
    SitePatch,
    TripIn,
    TripOut,
)
from divelog_server.schemas.gear import GearItemIn, GearItemOut, GearSetupIn, GearSetupOut
from divelog_server.services import admin_views
from divelog_server.services import dives as dive_service
from divelog_server.services.images import IMAGE_MIMES, image_format, process_image
from divelog_server.services.markdown import render
from divelog_server.services.overpass import OverpassClient, OverpassError, get_overpass_client
from divelog_server.services.storage import (
    COMMONS_PREFIX,
    Storage,
    get_storage,
    guess_content_type,
    media_url,
    variant_key,
)
from divelog_server.store.countries import COUNTRIES
from divelog_server.store.models import (
    DiveRecord,
    GearItemRecord,
    GearSetupRecord,
    ImportRecord,
    MediaRef,
    PersonRecord,
    RegionRecord,
    SiteMapRecord,
    SiteRecord,
    TankRecord,
    TripRecord,
    prepend_change,
)
from divelog_server.store.overlay import (
    ADDITIVE_FIELDS,
    OBJECTIVE_FIELDS,
    PERSONAL_FIELDS,
    PREFERENCE_FIELDS,
)
from divelog_server.store.slug import SITE_ID, UNKNOWN_COUNTRY, site_id_for
from divelog_server.store.sources import PERSONAL_MAP_ID
from divelog_server.store.store import NothingToPinError, SiteIdTakenError, Store
from divelog_server.store.trips import Trip
from divelog_server.tools.sitemap_osm import RADIUS, starter_map

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_owner)])


def slugify(value: str, sep: str = "-") -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", sep, ascii_value.lower()).strip(sep)
    return slug or uuid4().hex[:8]


# ── Dives ───────────────────────────────────────────────────────────────────


@router.get("/dives", response_model=list[AdminDiveListItem])
async def admin_list_dives(store: StoreDep) -> list[AdminDiveListItem]:
    """Every dive, newest first, as list rows; ``GET /dives/{number}`` has the full record."""
    dives = sorted(store.dives.values(), key=lambda d: (d.date, d.number), reverse=True)
    return [dive_service.admin_list_item(store, d) for d in dives]


@router.get("/dives/next-number", response_model=NextDiveNumber)
async def admin_next_number(store: StoreDep) -> NextDiveNumber:
    return NextDiveNumber(number=store.next_dive_number())


@router.post("/dives", response_model=DiveAdminOut, status_code=status.HTTP_201_CREATED)
async def admin_create_dive(body: DiveIn, store: StoreDep) -> DiveAdminOut:
    if body.number in store.dives:
        raise HTTPException(status_code=409, detail=f"Dive #{body.number} already exists")
    record = _apply_dive(store, None, body)
    await store.save_dive(record, f"Add dive #{record.number}")
    return dive_service.dive_admin_out(store, record)


@router.get("/dives/template", response_model=DiveTemplateOut)
async def admin_dive_template(
    store: StoreDep,
    site: str | None = None,
    date: date | None = None,
    before: Annotated[int | None, Query(ge=1)] = None,
) -> DiveTemplateOut:
    """What the new-dive form starts from: previous dive, last dive at the site, recents.

    ``date`` defaults to today; only dives on or before it count. ``before`` (a dive number)
    further limits the previous dive to dives logged before that one, so an existing dive
    (a draft under review) gets an earlier dive of its own day. An unknown ``site`` gives
    no ``at_site``.
    """
    return admin_views.dive_template(
        store, site or None, date or datetime.now().date(), before=before
    )


@router.get("/dives/page", response_model=AdminDivePage)
async def admin_dive_page(
    store: StoreDep,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    status: Literal["public", "private", "draft"] | None = None,
    q: Annotated[str, Query(max_length=200)] = "",
    sort: DiveSort = "date",
    asc: bool = False,
    site: Annotated[str | None, Query(max_length=200)] = None,
) -> AdminDivePage:
    """One page of the dive list, filtered by publish state, site and search words, and sorted.

    ``q`` matches a dive number (``650`` or ``#650``), or the title, the site's names or a
    buddy's names; every word must match. ``site`` keeps the dives at that site id. Newest
    first unless ``sort``/``asc`` say otherwise.
    """
    return admin_views.dive_page(store, offset, limit, status, q, sort, asc, site=site or None)


@router.post("/dives/publish", response_model=DivesPublishOut)
async def admin_publish_dives(body: DivesPublishIn, store: StoreDep) -> DivesPublishOut:
    """Make the listed drafts public in one commit; other dives are left as they are."""
    published: list[DiveRecord] = []
    unchanged: list[int] = []
    for number in dict.fromkeys(body.numbers):
        dive = store.dives.get(number)
        if dive is None or dive.visibility != "draft":
            unchanged.append(number)
            continue
        published.append(dive.model_copy(update={"visibility": "public"}, deep=True))
    if published:
        numbers = ", ".join(f"#{d.number}" for d in published)
        await store.save_dives(published, f"Publish {_count(len(published), 'dive')}: {numbers}")
    return DivesPublishOut(published=[d.number for d in published], unchanged=unchanged)


@router.get("/dives/{number}", response_model=DiveAdminOut)
async def admin_get_dive(number: int, store: StoreDep) -> DiveAdminOut:
    return dive_service.dive_admin_out(store, _dive_or_404(store, number))


@router.put("/dives/{number}", response_model=DiveAdminOut)
async def admin_update_dive(number: int, body: DiveIn, store: StoreDep) -> DiveAdminOut:
    """Replace a dive with the form's fields, over the dive as stored at the moment of writing.

    Attachments come from the stored dive, so a photo uploaded while the form was open stays.
    A ``cover_attachment_id`` that names none of the dive's attachments keeps the stored cover.
    """

    def change(dive: DiveRecord) -> DiveRecord:
        if body.number != number and body.number in store.dives:
            raise HTTPException(status_code=409, detail=f"Dive #{body.number} already exists")
        record = _apply_dive(store, dive, body)
        if record.cover is not None and all(m.id != record.cover for m in record.media):
            logger.warning("dive #%d: cover %s is not one of its attachments", number, record.cover)
            record.cover = dive.cover
        return record

    record = await _update_dive(store, number, change, f"Update dive #{body.number}")
    return dive_service.dive_admin_out(store, record)


@router.delete("/dives/{number}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_dive(number: int, store: StoreDep) -> None:
    dive = _dive_or_404(store, number)
    storage = get_storage()
    for media in dive.media:
        if len(store.media_referrers(media.key)) == 1:
            await _delete_files(storage, media)
    await store.delete_dive(number, f"Delete dive #{number}")


@router.patch("/dives/{number}", response_model=DiveAdminOut)
async def admin_patch_dive(number: int, body: DivePatch, store: StoreDep) -> DiveAdminOut:
    """Change the fields that live outside the dive form, leaving everything else as stored.

    Only the fields present in the body are written; ``cover_attachment_id`` must name one of
    the dive's attachments, or be ``null`` for no cover.
    """
    dive = _dive_or_404(store, number)
    if "cover_attachment_id" not in body.model_fields_set:
        return dive_service.dive_admin_out(store, dive)
    cover = body.cover_attachment_id

    def change(dive: DiveRecord) -> DiveRecord:
        if cover is not None and all(m.id != cover for m in dive.media):
            raise HTTPException(status_code=422, detail=f"Dive #{number} has no attachment {cover}")
        dive.cover = cover
        return dive

    saved = await _update_dive(store, number, change, f"Set cover of dive #{number}")
    return dive_service.dive_admin_out(store, saved)


def _apply_dive(store: Store, dive: DiveRecord | None, body: DiveIn) -> DiveRecord:
    try:
        return dive_service.apply_dive_in(store, dive, body)
    except (dive_service.AnnotationError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _dive_or_404(store: Store, number: int) -> DiveRecord:
    dive = store.dives.get(number)
    if dive is None:
        raise HTTPException(status_code=404, detail="Dive not found")
    return dive


async def _update_dive(
    store: Store, number: int, change: Callable[[DiveRecord], DiveRecord], message: str
) -> DiveRecord:
    """:meth:`Store.update_dive`, with a dive that is gone answered as 404."""
    try:
        return await store.update_dive(number, change, message)
    except KeyError:
        raise HTTPException(status_code=404, detail="Dive not found") from None


# ── Attachments ─────────────────────────────────────────────────────────────


@router.post(
    "/dives/{number}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_upload_attachment(
    number: int,
    store: StoreDep,
    file: UploadFile = File(...),
    kind: str = "photo",
    public: bool | None = None,
) -> AttachmentOut:
    """Store a file and attach it to a dive; the first photo becomes the cover.

    Photos are recognised by their bytes, whatever type was declared. Without ``public`` a
    photo is public unless it is a scan; a file that is not a photo is private.
    """
    _dive_or_404(store, number)
    media = await _store_upload(file, kind, public, image_public=kind != "scan")

    def change(dive: DiveRecord) -> DiveRecord:
        media.sort = len(dive.media)
        dive.media.append(media)
        if kind == "photo" and dive.cover is None:
            dive.cover = media.id
        return dive

    try:
        await store.update_dive(number, change, f"Attach {kind} to dive #{number}")
    except KeyError:
        await _delete_files(get_storage(), media)
        raise HTTPException(status_code=404, detail="Dive not found") from None
    return dive_service.attachment_out(media)


@router.post(
    "/sites/{site_id}/attachments",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_upload_site_attachment(
    site_id: str,
    store: StoreDep,
    file: UploadFile = File(...),
    kind: str = "photo",
    public: bool | None = None,
) -> AttachmentOut:
    """Store a file and attach it to a site; without ``public`` only a photo is public."""
    _site_or_404(store, site_id)
    media = await _store_upload(file, kind, public, image_public=True)

    def change(site: SiteRecord) -> SiteRecord:
        media.sort = len(site.media)
        site.media.append(media)
        return site

    try:
        await store.update_site(site_id, change, f"Attach {kind} to site {site_id}")
    except KeyError:
        await _delete_files(get_storage(), media)
        raise HTTPException(status_code=404, detail="Site not found") from None
    return dive_service.attachment_out(media)


@router.put("/sites/{site_id}/attachments/order", response_model=list[AttachmentOut])
async def admin_order_site_attachments(
    site_id: str, body: list[str], store: StoreDep
) -> list[AttachmentOut]:
    """Put a site's attachments in the order of the ids given, in one commit.

    Unknown ids are ignored; attachments left out keep their relative order after the listed
    ones.
    """
    _site_or_404(store, site_id)

    def change(site: SiteRecord) -> SiteRecord:
        site.media = _in_order(site.media, body)
        return site

    try:
        saved = await store.update_site(site_id, change, f"Reorder attachments of site {site_id}")
    except KeyError:
        raise HTTPException(status_code=404, detail="Site not found") from None
    return [dive_service.attachment_out(m) for m in sorted(saved.media, key=lambda m: m.sort)]


@router.post(
    "/people/{person_id}/avatar",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_upload_avatar(
    person_id: str, store: StoreDep, file: UploadFile = File(...)
) -> AttachmentOut:
    person = _person_or_404(store, person_id)
    storage = get_storage()
    for old in [m for m in person.media if m.kind == "avatar"]:
        await _delete_files(storage, old)
        person.media.remove(old)
    media = await _store_upload(file, "avatar", True, image_only=True)
    person.media.append(media)
    person.avatar = media.id
    await store.save_person(person, f"Set avatar for {person.id}")
    return dive_service.attachment_out(media)


@router.post(
    "/gear/items/{item_id}/photo",
    response_model=AttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_upload_gear_photo(
    item_id: str, store: StoreDep, file: UploadFile = File(...)
) -> AttachmentOut:
    item = store.gear_items.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Gear item not found")
    storage = get_storage()
    for old in list(item.media):
        await _delete_files(storage, old)
    item.media = [await _store_upload(file, "photo", True, image_only=True)]
    await store.save_gear(f"Set photo for gear item {item_id}")
    return dive_service.attachment_out(item.media[0])


@router.put("/dives/{number}/attachments/order", response_model=list[AttachmentOut])
async def admin_order_attachments(
    number: int, body: list[str], store: StoreDep
) -> list[AttachmentOut]:
    """Put a dive's attachments in the order of the ids given, in one commit.

    Unknown ids are ignored; attachments left out keep their relative order after the listed
    ones.
    """
    _dive_or_404(store, number)

    def change(dive: DiveRecord) -> DiveRecord:
        _in_order(dive.media, body)
        return dive

    saved = await _update_dive(store, number, change, f"Reorder attachments of dive #{number}")
    return [dive_service.attachment_out(m) for m in sorted(saved.media, key=lambda m: m.sort)]


def _in_order(media: list[MediaRef], ids: list[str]) -> list[MediaRef]:
    """Renumber ``sort`` to follow ``ids``; the unlisted keep their order after the listed."""
    position = {media_id: i for i, media_id in enumerate(ids)}
    current = sorted(media, key=lambda m: m.sort)
    ordered = sorted(current, key=lambda m: position.get(m.id, len(ids)))
    for i, item in enumerate(ordered):
        item.sort = i
    return ordered


CREDIT_FIELDS = ("licence", "author", "source")


@router.patch("/attachments/{media_id}", response_model=AttachmentOut)
async def admin_patch_attachment(
    media_id: str, body: AttachmentPatch, store: StoreDep
) -> AttachmentOut:
    """Change caption, credit, kind, order, visibility or the licence, author and source."""
    owner, record, media = _media_or_404(store, media_id)
    message = f"Update attachment on {owner[0]} {owner[1]}"
    if isinstance(record, DiveRecord):

        def change(dive: DiveRecord) -> DiveRecord:
            _patch_media(_dive_media_or_404(dive, media_id), body)
            return dive

        saved = await _update_dive(store, record.number, change, message)
        return dive_service.attachment_out(_dive_media_or_404(saved, media_id))
    _patch_media(media, body)
    await _save_owner(store, owner, record, message)
    return dive_service.attachment_out(media)


def _patch_media(media: MediaRef, body: AttachmentPatch) -> None:
    for key, value in body.model_dump(exclude_none=True).items():
        if key in CREDIT_FIELDS:
            value = value.strip() or None
        setattr(media, key, value)


def _dive_media_or_404(dive: DiveRecord, media_id: str) -> MediaRef:
    media = next((m for m in dive.media if m.id == media_id), None)
    if media is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return media


@router.delete("/attachments/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_attachment(media_id: str, store: StoreDep) -> None:
    owner, record, media = _media_or_404(store, media_id)
    if isinstance(record, DiveRecord):

        def change(dive: DiveRecord) -> DiveRecord:
            dive.media.remove(_dive_media_or_404(dive, media_id))
            if dive.cover == media_id:
                dive.cover = None
            return dive

        message = f"Remove attachment from {owner[0]} {owner[1]}"
        await _update_dive(store, record.number, change, message)
        if not store.media_referrers(media.key):
            await _delete_files(get_storage(), media)
        return
    if isinstance(record, PersonRecord) and record.avatar == media.id:
        record.avatar = None
    record.media.remove(media)
    if not store.media_referrers(media.key) or len(store.media_referrers(media.key)) == 1:
        await _delete_files(get_storage(), media)
    await _save_owner(store, owner, record, f"Remove attachment from {owner[0]} {owner[1]}")


MediaOwner = DiveRecord | SiteRecord | PersonRecord | GearItemRecord


def _media_or_404(
    store: Store, media_id: str
) -> tuple[tuple[str, str | int], MediaOwner, MediaRef]:
    owner = store.media_owner.get(media_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    kind, key = owner
    record: MediaOwner | None
    if kind == "dive":
        record = store.dives.get(int(key))
    elif kind == "site":
        record = store.sites.get(str(key))
    elif kind == "person":
        record = store.people.get(str(key))
    else:
        record = store.gear_items.get(str(key))
    if record is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    media = next((m for m in record.media if m.id == media_id), None)
    if media is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return owner, record, media


async def _save_owner(
    store: Store, owner: tuple[str, str | int], record: MediaOwner, message: str
) -> None:
    if isinstance(record, DiveRecord):
        await store.save_dive(record, message)
    elif isinstance(record, SiteRecord):
        await store.save_site(record, message)
    elif isinstance(record, PersonRecord):
        await store.save_person(record, message)
    else:
        await store.save_gear(message)


async def _store_upload(
    file: UploadFile,
    kind: str,
    public: bool | None,
    *,
    image_public: bool = True,
    image_only: bool = False,
) -> MediaRef:
    """Store an upload: a photo processed into a clean original and variants, anything else as is.

    A photo is recognised by its bytes; the declared type only decides that bytes Pillow cannot
    read are an error (400). Without ``public`` a photo gets ``image_public`` and any other
    file stays private, since only photos lose their metadata here. ``image_only`` refuses a
    file that is not a photo.
    """
    settings = get_settings()
    data = await file.read()
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    mime = file.content_type or "application/octet-stream"
    storage = get_storage()
    media_id = uuid4().hex
    base = f"{datetime.now(UTC).strftime('%Y/%m')}/{media_id}"
    variants: list[str] = []
    width = height = None
    taken_at = None
    is_image = image_format(data) is not None
    if not is_image and (image_only or mime in IMAGE_MIMES):
        raise HTTPException(status_code=400, detail="Could not read image")

    if is_image:
        try:
            processed = await asyncio.to_thread(process_image, data, square=kind == "avatar")
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Could not read image") from exc
        ext = "png" if processed.original_mime == "image/png" else "jpg"
        key = f"{base}.{ext}"
        await storage.put(key, processed.original, processed.original_mime)
        for name, blob in processed.variants.items():
            await storage.put(variant_key(key, name), blob, "image/webp")
            variants.append(name)
        width, height = processed.width, processed.height
        taken_at = processed.taken_at
        mime = processed.original_mime
        size = len(processed.original)
    else:
        raw_ext = (
            (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
        )
        key = f"{base}.{re.sub(r'[^a-z0-9]', '', raw_ext)[:8] or 'bin'}"
        await storage.put(key, data, mime)
        size = len(data)

    return MediaRef(
        id=media_id,
        key=key,
        kind=kind,
        mime=mime,
        bytes=size,
        width=width,
        height=height,
        taken_at=taken_at,
        public=public if public is not None else is_image and image_public,
        variants=variants,
        original_name=(file.filename or "")[:255],
    )


async def _delete_files(storage: Storage, media: MediaRef) -> None:
    if media.key.startswith(("repo:", COMMONS_PREFIX)):
        return
    await storage.delete(media.key)
    for name in media.variants:
        await storage.delete(variant_key(media.key, name))


# ── Sites ───────────────────────────────────────────────────────────────────


def _site_or_404(store: Store, site_id: str) -> SiteRecord:
    site = store.sites.get(site_id)
    if site is None:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


@router.get("/sites", response_model=list[SiteOut])
async def admin_sites(store: StoreDep) -> list[SiteOut]:
    sites = sorted(store.sites.values(), key=lambda s: s.name.lower())
    return [dive_service.site_out(store, s, True) for s in sites]


@router.get("/sites/nearby", response_model=NearbySitesOut)
async def admin_sites_nearby(
    store: StoreDep,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lon: Annotated[float | None, Query(ge=-180, le=180)] = None,
    name: Annotated[str | None, Query(max_length=200)] = None,
    radius_m: Annotated[float, Query(gt=0, le=50_000)] = MATCH_RADIUS_M,
    limit: Annotated[int, Query(ge=1, le=50)] = 8,
) -> NearbySitesOut:
    """Sites that may already be the one being created: name or alias matches, or within reach.

    Needs ``lat`` and ``lon`` together, ``name``, or both (422 otherwise).
    """
    if (lat is None) != (lon is None):
        raise HTTPException(status_code=422, detail="lat and lon go together")
    if lat is None and not (name or "").strip():
        raise HTTPException(status_code=422, detail="Give lat and lon, a name, or both")
    return admin_views.nearby_sites(store, lat, lon, name, radius_m, limit)


@router.get("/sites/{site_id}", response_model=SiteOut)
async def admin_get_site(site_id: str, store: StoreDep) -> SiteOut:
    return dive_service.site_out(store, _site_or_404(store, site_id), True)


@router.post("/sites", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
async def admin_create_site(body: SiteIn, store: StoreDep) -> SiteOut:
    """Create a personal site.

    The id must match ``{iso3}-{slug}`` (422 naming the pattern otherwise) and be free (409,
    saying whether the log or the commons has it). The country must be a known ISO 3166
    alpha-3 code (stored in capitals) and the id starts with it in lower case, or with
    ``xxx-`` when there is no country; the region must exist. Those 422s list the fields like
    a validation error. Existing sites keep whatever id they have, so the checks are on create
    only.
    """
    if not SITE_ID.match(body.site_id):
        raise HTTPException(
            status_code=422, detail=f"Site id {body.site_id!r} does not match {SITE_ID.pattern}"
        )
    country = body.country.upper() if body.country else None
    errors: dict[str, str] = {}
    if country is not None and country not in COUNTRIES:
        errors["country"] = f"Unknown country code {country!r}"
    prefix = country.lower() if country else UNKNOWN_COUNTRY
    if not errors and body.site_id.split("-", 1)[0] != prefix:
        errors["site_id"] = f"A site id here starts with {prefix}-"
    if body.region and body.region not in store.regions:
        errors["region"] = f"Unknown region {body.region!r}"
    if errors:
        raise HTTPException(
            status_code=422,
            detail=[
                {"loc": ["body", field], "msg": msg, "type": "value_error"}
                for field, msg in errors.items()
            ],
        )
    record = _site_from(body, None)
    record.country = country
    try:
        saved = await store.create_site(record, f"Add site {record.site_id}")
    except SiteIdTakenError as exc:
        where = "the commons" if exc.origin == "commons" else "your log"
        raise HTTPException(
            status_code=409, detail=f"Site id {exc.site_id} is already in use in {where}"
        ) from None
    return dive_service.site_out(store, saved, True)


@router.put("/sites/{site_id}", response_model=SiteOut)
async def admin_update_site(
    site_id: str, body: SiteIn, store: StoreDep, fork: bool = False
) -> SiteOut:
    """Replace a site.

    On a commons site only overlay material is accepted (422 otherwise); ``fork=true`` writes
    a personal copy that shadows the commons record instead. ``revision`` and ``changelog`` in
    the body are ignored and the stored ones kept, so a stale editor form cannot rewind a
    revision; the server moves to the next revision when an objective field changes, with
    ``note`` as the changelog entry when one is given.
    """
    site = _site_or_404(store, site_id)
    if body.site_id != site_id:
        raise HTTPException(status_code=422, detail="A site keeps its id")
    record = _site_from(body, site)
    message = f"Fork site {site_id}" if fork else f"Update site {site_id}"
    note = (body.note or "").strip() or None
    if note:
        message = f"{message}: {note}"
    saved = await store.save_site(record, message, fork=fork, note=note)
    return dive_service.site_out(store, saved, True)


@router.patch("/sites/{site_id}", response_model=SiteOut)
async def admin_patch_site(site_id: str, body: SitePatch, store: StoreDep) -> SiteOut:
    """Change the default map, prices or location visibility; the latter is objective."""
    site = _site_or_404(store, site_id).model_copy(deep=True)
    for key, value in body:
        if value is not None:
            setattr(site, key, value)
    saved = await store.save_site(site, f"Update site {site_id}")
    return dive_service.site_out(store, saved, True)


@router.post("/sites/{site_id}/pin", response_model=SiteOut)
async def admin_pin_site(site_id: str, store: StoreDep) -> SiteOut:
    """Mark an overlay or fork as reviewed against the current commons revision.

    404 for a personal site, a site without a commons record, or a commons site without an
    overlay: there is nothing pinned.
    """
    _site_or_404(store, site_id)
    try:
        saved = await store.pin_site(site_id)
    except NothingToPinError:
        raise HTTPException(status_code=404, detail="Nothing to pin") from None
    return dive_service.site_out(store, saved, True)


@router.delete("/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_site(site_id: str, store: StoreDep) -> None:
    """Delete a personal site, a fork (back to the commons) or the overlay of a commons site."""
    _site_or_404(store, site_id)
    origin = store.site_origin.get(site_id, "log")
    if origin == "log" and store.dives_by_site.get(site_id):
        raise HTTPException(status_code=409, detail="Site still has dives")
    what = {"log": "site", "fork": "fork of site", "commons": "overlay of site"}[origin]
    await store.delete_site(site_id, f"Delete {what} {site_id}")


def _site_from(body: SiteIn, existing: SiteRecord | None) -> SiteRecord:
    payload = existing.model_dump() if existing else {}
    payload.update(body.model_dump(exclude={"description_md", "note"}))
    if existing:
        payload["media"] = existing.media
        payload["maps"] = existing.maps
        payload["reference_maps"] = existing.reference_maps
    record = SiteRecord.model_validate(payload)
    record.body_md = body.description_md
    return record


# ── Site maps ───────────────────────────────────────────────────────────────


def _author() -> str | None:
    return get_settings().OWNER_NAME or None


def _map_or_404(store: Store, map_id: str) -> SiteMapRecord:
    record = store.maps.get(map_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Map not found")
    return record


@router.post(
    "/sites/{site_id}/maps", response_model=SiteMapOut, status_code=status.HTTP_201_CREATED
)
async def admin_create_map(site_id: str, body: SiteMapIn, store: StoreDep) -> SiteMapOut:
    site = _site_or_404(store, site_id)
    existing = store.maps_by_site.get(site_id, [])
    if store.site_origin.get(site_id) in ("commons", "fork"):
        personal = sum(1 for m in existing if PERSONAL_MAP_ID.search(m))
        map_id = f"{site_id}-p{personal + 1}"
        while map_id in store.maps:
            personal += 1
            map_id = f"{site_id}-p{personal + 1}"
    else:
        map_id = f"{site_id}-{len(existing) + 1}"
    while map_id in store.maps:
        map_id = f"{site_id}-{uuid4().hex[:6]}"
    record = SiteMapRecord(
        id=map_id, site_id=site.site_id, sort=len(existing), **body.data.model_dump(by_alias=True)
    )
    await store.save_map(record, f"Add map {map_id}" + (f": {body.note}" if body.note else ""))
    return dive_service.site_map_out(record)


@router.post("/sites/{site_id}/maps/seed", response_model=SiteMapSeedOut)
async def admin_seed_map(
    site_id: str,
    body: SiteMapSeedIn,
    store: StoreDep,
    overpass: Annotated[OverpassClient, Depends(get_overpass_client)],
) -> SiteMapSeedOut:
    """A starter site map from OpenStreetMap around the site; nothing is saved.

    The radius defaults to one per site type. 404 when the site is unknown or has no
    coordinates, 503 when Overpass does not answer within its timeout.
    """
    site = _site_or_404(store, site_id)
    if site.lat is None or site.lon is None:
        raise HTTPException(status_code=404, detail="Site has no coordinates")
    radius = body.radius_m or RADIUS.get(site.type, 700)
    try:
        osm = await overpass.fetch(site.lat, site.lon, radius)
    except OverpassError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    origin = {"lat": site.lat, "lon": site.lon, "name": site.name, "short_name": site.short_name}
    raw = starter_map(origin, osm, radius)
    return SiteMapSeedOut(
        source=body.source,
        radius_m=radius,
        elements=len(osm.get("elements", [])),
        map=SiteMapDraft.model_validate(raw),
    )


@router.put("/maps/{map_id}", response_model=SiteMapOut)
async def admin_update_map(map_id: str, body: SiteMapIn, store: StoreDep) -> SiteMapOut:
    """Overwrite the drawing; an unchanged one is not saved again."""
    record = _map_or_404(store, map_id)
    incoming = body.data.model_dump(by_alias=True)
    current = record.model_dump(by_alias=True, include=set(incoming))
    if current == incoming:
        return dive_service.site_map_out(record)
    revision, changelog = prepend_change(
        record.revision, record.changelog, body.note or "Updated the drawing", _author()
    )
    updated = SiteMapRecord(
        id=record.id,
        site_id=record.site_id,
        sort=record.sort,
        revision=revision,
        changelog=changelog,
        **incoming,
    )
    await store.save_map(updated, f"Update map {map_id}" + (f": {body.note}" if body.note else ""))
    return dive_service.site_map_out(updated)


@router.delete("/maps/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_map(map_id: str, store: StoreDep) -> None:
    _map_or_404(store, map_id)
    await store.delete_map(map_id, f"Delete map {map_id}")


@router.put("/sites/{site_id}/maps/order", response_model=list[SiteMapOut])
async def admin_order_maps(site_id: str, body: list[str], store: StoreDep) -> list[SiteMapOut]:
    _site_or_404(store, site_id)
    position = {map_id: i for i, map_id in enumerate(body)}
    records = [
        store.maps[m] for m in store.maps_by_site.get(site_id, []) if store.map_origin[m] == "log"
    ]
    for record in records:
        record.sort = position.get(record.id, len(body))
    await store.save_maps(records, f"Reorder maps of {site_id}")
    ordered = [store.maps[m] for m in store.maps_by_site.get(site_id, [])]
    return [dive_service.site_map_out(m) for m in ordered]


# ── Trips ───────────────────────────────────────────────────────────────────


def _trip_out(override: TripRecord | None, derived: Trip | None) -> TripOut:
    """A trip for the editor: the override file's fields when there is one, else the derived trip.

    The name falls back to the derived one when the override leaves it empty; ``days`` always
    comes from the derived trip, since an override without dates spans nothing on its own.
    """
    if override is not None:
        return TripOut(
            slug=override.slug,
            name=override.name or (derived.name if derived else override.slug),
            start_date=override.start_date,
            end_date=override.end_date,
            description_md=override.body_md,
            days=derived.days if derived else None,
            custom=True,
        )
    if derived is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return TripOut(
        slug=derived.slug,
        name=derived.name,
        start_date=derived.start,
        end_date=derived.end,
        description_md=derived.description_md,
        days=derived.days,
    )


def _trip_start(store: Store, slug: str) -> date:
    derived = store.trip_index(True).trips.get(slug)
    if derived is not None:
        return derived.start
    override = store.trips.get(slug)
    return (override.start_date if override else None) or date.min


@router.get("/trips", response_model=list[TripOut])
async def admin_trips(store: StoreDep) -> list[TripOut]:
    """Trips the owner sees on the site plus overrides that claim no dives, newest first."""
    derived = store.trip_index(True).trips
    slugs = sorted(
        set(derived) | set(store.trips), key=lambda s: (_trip_start(store, s), s), reverse=True
    )
    return [_trip_out(store.trips.get(s), derived.get(s)) for s in slugs]


@router.get("/trips/{slug}", response_model=TripOut)
async def admin_get_trip(slug: str, store: StoreDep) -> TripOut:
    return _trip_out(store.trips.get(slug), store.trip_index(True).trips.get(slug))


@router.post("/trips", response_model=TripOut, status_code=status.HTTP_201_CREATED)
async def admin_create_trip(body: TripIn, store: StoreDep) -> TripOut:
    if body.slug in store.trips:
        raise HTTPException(status_code=409, detail="Trip slug already in use")
    trip = TripRecord(**body.model_dump(exclude={"description_md"}), body_md=body.description_md)
    await store.save_trip(trip, f"Add trip {trip.slug}")
    return _trip_out(trip, store.trip_index(True).trips.get(trip.slug))


@router.put("/trips/{slug}", response_model=TripOut)
async def admin_update_trip(slug: str, body: TripIn, store: StoreDep) -> TripOut:
    """Change an override's name, dates and description; ``merge`` and ``cover`` are kept."""
    existing = store.trips.get(slug)
    if existing is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    payload = existing.model_dump() | body.model_dump(exclude={"description_md"}) | {"slug": slug}
    trip = TripRecord.model_validate(payload)
    trip.body_md = body.description_md
    await store.save_trip(trip, f"Update trip {slug}")
    return _trip_out(trip, store.trip_index(True).trips.get(slug))


@router.delete("/trips/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_trip(slug: str, store: StoreDep) -> None:
    """Remove the override file; a derived trip it renamed or merged shows again."""
    if slug not in store.trips:
        raise HTTPException(status_code=404, detail="Trip override not found")
    await store.delete_trip(slug, f"Delete trip {slug}")


# ── Regions ─────────────────────────────────────────────────────────────────


def _region_record(body: RegionIn, existing: RegionRecord | None) -> RegionRecord:
    payload = existing.model_dump() if existing else {}
    payload.update(
        region=body.id,
        name=body.name,
        country=body.country.upper() if body.country else None,
        waters=[w.strip() for w in body.waters if w.strip()],
    )
    record = RegionRecord.model_validate(payload)
    record.body_md = body.body_md
    return record


def _region_or_404(store: Store, region_id: str) -> RegionRecord:
    region = store.regions.get(region_id)
    if region is None:
        raise HTTPException(status_code=404, detail="Region not found")
    return region


def _admin_region_out(store: Store, region_id: str) -> RegionOut:
    out = region_out(store, region_id, True, with_body=False)
    out.body_md = store.regions[region_id].body_md
    return out


@router.get("/regions", response_model=list[RegionOut])
async def admin_regions(store: StoreDep) -> list[RegionOut]:
    """Every region with its sites and dive count, and its description for the editor."""
    return [_admin_region_out(store, rid) for rid in sorted(store.regions)]


@router.post("/regions", response_model=RegionOut, status_code=status.HTTP_201_CREATED)
async def admin_create_region(body: RegionIn, store: StoreDep) -> RegionOut:
    if body.id in store.regions:
        raise HTTPException(status_code=409, detail="Region id already in use")
    record = _region_record(body, None)
    await store.save_region(record, f"Add region {record.region}")
    return _admin_region_out(store, record.region)


@router.put("/regions/{region_id}", response_model=RegionOut)
async def admin_update_region(region_id: str, body: RegionIn, store: StoreDep) -> RegionOut:
    existing = _region_or_404(store, region_id)
    if body.id != region_id:
        raise HTTPException(status_code=422, detail="A region keeps its id")
    record = _region_record(body, existing)
    await store.save_region(record, f"Update region {region_id}")
    return _admin_region_out(store, region_id)


@router.delete("/regions/{region_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_region(region_id: str, store: StoreDep) -> None:
    _region_or_404(store, region_id)
    sites = sum(1 for s in store.sites.values() if s.region == region_id)
    if sites:
        raise HTTPException(status_code=409, detail=f"Still used by {_count(sites, 'site')}")
    await store.delete_region(region_id, f"Delete region {region_id}")


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


# ── People ──────────────────────────────────────────────────────────────────


def _person_or_404(store: Store, person_id: str) -> PersonRecord:
    person = store.people.get(person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


def person_file_id(first_name: str, last_name: str | None) -> str:
    """``first_last`` (hyphens kept inside a double-barrelled surname) or ``first``."""
    first = slugify(first_name, "_")
    if not last_name:
        return first
    last = slugify(last_name.replace(" - ", "-").replace("-", "\x00"), "_").replace("\x00", "-")
    return f"{first}_{last}"


def unique_slug(store: Store, first_name: str, alias: str | None, keep: str | None = None) -> str:
    base = slugify(alias or first_name)
    taken = {p.slug for p in store.people.values() if p.id != keep}
    slug, n = base, 1
    while slug in taken:
        n += 1
        slug = f"{base}-{n}"
    return slug


@router.get("/people", response_model=list[PersonPrivate])
async def admin_people(store: StoreDep) -> list[PersonPrivate]:
    people = sorted(store.people.values(), key=lambda p: p.full_name.lower())
    return [dive_service.person_private(store, p) for p in people]


@router.get("/people/{person_id}", response_model=PersonPrivate)
async def admin_get_person(person_id: str, store: StoreDep) -> PersonPrivate:
    return dive_service.person_private(store, _person_or_404(store, person_id))


@router.delete("/people/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_person(person_id: str, store: StoreDep) -> None:
    """Remove the person file and their media; refused while any dive still names them."""
    person = _person_or_404(store, person_id)
    dives = dive_service.person_dive_count(store, person_id)
    if dives:
        raise HTTPException(status_code=409, detail=f"Still named on {_count(dives, 'dive')}")
    storage = get_storage()
    for media in person.media:
        if len(store.media_referrers(media.key)) == 1:
            await _delete_files(storage, media)
    await store.delete_person(person_id, f"Delete person {person_id}")


@router.post("/people", response_model=PersonPrivate, status_code=status.HTTP_201_CREATED)
async def admin_create_person(body: PersonIn, store: StoreDep) -> PersonPrivate:
    person_id = person_file_id(body.first_name, body.last_name)
    if person_id in store.people:
        raise HTTPException(status_code=409, detail=f"Person {person_id} already exists")
    person = PersonRecord(
        id=person_id,
        slug=unique_slug(store, body.first_name, body.alias),
        **body.model_dump(exclude={"bio_md"}),
        body_md=body.bio_md,
    )
    await store.save_person(person, f"Add person {person_id}")
    return dive_service.person_private(store, person)


@router.put("/people/{person_id}", response_model=PersonPrivate)
async def admin_update_person(person_id: str, body: PersonIn, store: StoreDep) -> PersonPrivate:
    existing = _person_or_404(store, person_id)
    payload = existing.model_dump()
    payload.update(body.model_dump(exclude={"bio_md"}))
    payload["slug"] = unique_slug(store, body.first_name, body.alias, keep=person_id)
    person = PersonRecord.model_validate(payload)
    person.body_md = body.bio_md
    await store.save_person(person, f"Update person {person_id}")
    return dive_service.person_private(store, person)


# ── Gear ────────────────────────────────────────────────────────────────────


def _gear_item_out(item: GearItemRecord) -> GearItemOut:
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
    )


def _gear_setup_out(store: Store, setup: GearSetupRecord) -> GearSetupOut:
    return GearSetupOut(
        id=setup.id,
        slug=setup.id,
        name=setup.name,
        description_md=setup.description_md,
        sort=setup.sort,
        items=[_gear_item_out(store.gear_items[i]) for i in setup.items if i in store.gear_items],
        tanks=[dive_service.tank_out(t) for t in setup.tanks],
        suit=setup.suit,
        weights_kg=setup.weights_kg,
    )


@router.get("/gear/items", response_model=list[GearItemOut])
async def admin_gear_items(store: StoreDep) -> list[GearItemOut]:
    items = sorted(store.gear_items.values(), key=lambda i: (i.sort, i.name))
    return [_gear_item_out(i) for i in items]


@router.post("/gear/items", response_model=GearItemOut, status_code=status.HTTP_201_CREATED)
async def admin_create_gear_item(body: GearItemIn, store: StoreDep) -> GearItemOut:
    item_id = slugify(body.name)
    while item_id in store.gear_items:
        item_id = f"{slugify(body.name)}-{uuid4().hex[:4]}"
    item = GearItemRecord(id=item_id, **body.model_dump())
    store.gear_items[item.id] = item
    await store.save_gear(f"Add gear item {item.id}")
    return _gear_item_out(item)


@router.put("/gear/items/{item_id}", response_model=GearItemOut)
async def admin_update_gear_item(item_id: str, body: GearItemIn, store: StoreDep) -> GearItemOut:
    item = store.gear_items.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Gear item not found")
    updated = GearItemRecord(id=item_id, media=item.media, **body.model_dump())
    store.gear_items[item_id] = updated
    await store.save_gear(f"Update gear item {item_id}")
    return _gear_item_out(updated)


@router.delete("/gear/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_gear_item(item_id: str, store: StoreDep) -> None:
    if item_id not in store.gear_items:
        raise HTTPException(status_code=404, detail="Gear item not found")
    del store.gear_items[item_id]
    for setup in store.gear_setups.values():
        setup.items = [i for i in setup.items if i != item_id]
    await store.save_gear(f"Delete gear item {item_id}")


@router.get("/gear/setups", response_model=list[GearSetupOut])
async def admin_gear_setups(store: StoreDep) -> list[GearSetupOut]:
    setups = sorted(store.gear_setups.values(), key=lambda s: (s.sort, s.name))
    return [_gear_setup_out(store, s) for s in setups]


@router.post("/gear/setups", response_model=GearSetupOut, status_code=status.HTTP_201_CREATED)
async def admin_create_gear_setup(body: GearSetupIn, store: StoreDep) -> GearSetupOut:
    if body.slug in store.gear_setups:
        raise HTTPException(status_code=409, detail="Setup slug already in use")
    setup = GearSetupRecord(
        id=body.slug,
        name=body.name,
        description_md=body.description_md,
        sort=body.sort,
        items=[i for i in body.item_ids if i in store.gear_items],
        tanks=[TankRecord.model_validate(t.model_dump()) for t in body.tanks],
        suit=body.suit or None,
        weights_kg=body.weights_kg,
    )
    store.gear_setups[setup.id] = setup
    await store.save_gear(f"Add gear setup {setup.id}")
    return _gear_setup_out(store, setup)


@router.put("/gear/setups/{setup_id}", response_model=GearSetupOut)
async def admin_update_gear_setup(
    setup_id: str, body: GearSetupIn, store: StoreDep
) -> GearSetupOut:
    if setup_id not in store.gear_setups:
        raise HTTPException(status_code=404, detail="Gear setup not found")
    setup = GearSetupRecord(
        id=setup_id,
        name=body.name,
        description_md=body.description_md,
        sort=body.sort,
        items=[i for i in body.item_ids if i in store.gear_items],
        tanks=[TankRecord.model_validate(t.model_dump()) for t in body.tanks],
        suit=body.suit or None,
        weights_kg=body.weights_kg,
    )
    store.gear_setups[setup_id] = setup
    await store.save_gear(f"Update gear setup {setup_id}")
    return _gear_setup_out(store, setup)


@router.delete("/gear/setups/{setup_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_gear_setup(setup_id: str, store: StoreDep) -> None:
    if setup_id not in store.gear_setups:
        raise HTTPException(status_code=404, detail="Gear setup not found")
    del store.gear_setups[setup_id]
    await store.save_gear(f"Delete gear setup {setup_id}")


# ── Editor helpers ──────────────────────────────────────────────────────────


@router.post("/preview/markdown", response_model=MarkdownPreviewOut)
async def admin_preview_markdown(body: MarkdownPreviewIn) -> MarkdownPreviewOut:
    """Markdown rendered and sanitised exactly as the public pages show it."""
    return MarkdownPreviewOut(html=render(body.md) or "")


@router.get("/meta/site-fields", response_model=SiteFieldsOut)
async def admin_site_fields() -> SiteFieldsOut:
    """Which site fields are objective (fork to edit), personal, additive or a preference."""
    return SiteFieldsOut(
        objective=list(OBJECTIVE_FIELDS),
        personal=list(PERSONAL_FIELDS),
        additive=list(ADDITIVE_FIELDS),
        preference=list(PREFERENCE_FIELDS),
    )


# ── Files that are never public ─────────────────────────────────────────────


@router.get("/files/reference/{path:path}", include_in_schema=False)
async def admin_reference_file(path: str, store: StoreDep) -> Response:
    """Third-party maps kept for reference; served to the owner only, never cached."""
    file = store.reference_file(path)
    if file is None:
        raise HTTPException(status_code=404)
    return FileResponse(
        file, media_type=guess_content_type(path), headers={"Cache-Control": "private, no-store"}
    )


# ── Repository ──────────────────────────────────────────────────────────────


@router.get("/repo/status", response_model=RepoStatus)
async def admin_repo_status(store: StoreDep) -> RepoStatus:
    """State of the log repository, the commons checkout and the last load."""
    status_ = await store.git.status()
    commons_state = None
    if store.commons is not None:
        commons_state = str((await store.commons.git.status())["state"])
    return RepoStatus(
        **status_,
        load_errors=store.errors,
        notices=store.status,
        commons_head=store.commons_head(),
        commons_state=commons_state,
    )


@router.post("/repo/push", response_model=RepoStatus)
async def admin_repo_push(store: StoreDep) -> RepoStatus:
    await store.git.push()
    return await admin_repo_status(store)


@router.post("/repo/pull", response_model=RepoStatus)
async def admin_repo_pull(store: StoreDep) -> RepoStatus:
    ok, out = await store.git.pull()
    if not ok:
        raise HTTPException(status_code=409, detail=out)
    if store.commons is not None and store.commons.git.enabled:
        ok, out = await store.commons.git.pull()
        if not ok:
            raise HTTPException(status_code=409, detail=f"commons: {out}")
    await store.reload()
    return await admin_repo_status(store)


@router.post("/repo/reload", response_model=RepoStatus)
async def admin_repo_reload(store: StoreDep) -> RepoStatus:
    await store.reload()
    return await admin_repo_status(store)


# ── Import ──────────────────────────────────────────────────────────────────


@router.post("/import/subsurface", response_model=ImportResult)
async def admin_import_subsurface(
    store: StoreDep, file: UploadFile = File(...), dry_run: bool = False
) -> ImportResult:
    """Create draft dives (or attach profiles to matching ones) from a Subsurface export.

    With ``dry_run=true`` nothing is stored or written: the result says which dives would be
    created (with the numbers they would get) or updated, and which sites would be created.
    """
    data = await file.read()
    if len(data) > get_settings().MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    try:
        log = parse_subsurface(data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse export: {exc}") from exc

    storage = get_storage()
    import_id = "" if dry_run else uuid4().hex
    key = f"imports/{datetime.now(UTC).strftime('%Y/%m')}/{import_id}.xml"
    if not dry_run:
        await storage.put(key, data, "application/xml")

    by_start = {
        datetime.combine(d.date, datetime.strptime(d.time_in, "%H:%M").time()): d
        for d in store.dives.values()
        if d.time_in
    }
    number = store.next_dive_number()

    sites_by_uuid: dict[str, SiteRecord] = {}
    planned_sites: set[str] = set()
    site_report: list[ImportSiteOut] = []
    for uuid, draft_site in log.sites.items():
        site_match = match_site(draft_site, store.sites)
        if site_match is not None:
            resolved = store.sites[site_match.site_id]
            if (
                not dry_run
                and uuid
                and site_match.matched_by != "uuid"
                and not resolved.subsurface_uuid
            ):
                adopted = resolved.model_copy(update={"subsurface_uuid": uuid})
                resolved = await store.save_site(
                    adopted, f"Link Subsurface site to {resolved.site_id}"
                )
        else:
            base_id = site_id_for(None, draft_site.name)
            site_id = base_id
            while site_id in store.sites or site_id in planned_sites:
                site_id = f"{base_id}-{uuid4().hex[:6]}"
            planned_sites.add(site_id)
            resolved = SiteRecord(
                site_id=site_id,
                name=draft_site.name,
                lat=draft_site.lat,
                lon=draft_site.lon,
                subsurface_uuid=uuid or None,
                body_md=draft_site.description,
            )
            if not dry_run:
                resolved = await store.save_site(resolved, f"Import site {site_id}")
        sites_by_uuid[uuid] = resolved
        site_report.append(
            ImportSiteOut(
                subsurface_uuid=uuid or None,
                name=draft_site.name,
                site_id=resolved.site_id,
                outcome="created" if site_match is None else "matched",
                matched_by=site_match.matched_by if site_match else None,
                distance_m=site_match.distance_m if site_match else None,
                origin=store.site_origin.get(resolved.site_id, "log"),
            )
        )

    created: list[int] = []
    updated: list[int] = []
    taken: set[int] = set()
    skipped = 0
    for draft in log.dives:
        match = by_start.get(draft.starts_at) if draft.time_in else None
        if match is None and draft.number in store.dives:
            match = store.dives[draft.number]
        if match is not None:
            if draft.samples and not match.profiles:
                if not dry_run:
                    name = f"import_{match.number:05d}.json"
                    match.profiles = [
                        store.save_profile(
                            name, {"source": draft.computer, "samples": draft.samples}
                        )
                    ]
                    match.import_id = import_id
                    await store.save_dive(match, f"Attach imported profile to dive #{match.number}")
                updated.append(match.number)
            else:
                skipped += 1
            continue

        free = draft.number and draft.number not in store.dives and draft.number not in taken
        dive_number = draft.number if free and draft.number else number
        number = max(number, dive_number + 1)
        taken.add(dive_number)
        created.append(dive_number)
        if dry_run:
            continue

        people: list[str] = []
        for name in draft.buddies:
            person = store.person_by_name(name)
            if person is None:
                first, _, last = name.partition(" ")
                person = PersonRecord(
                    id=person_file_id(first, last or None),
                    slug=unique_slug(store, first, None),
                    first_name=first,
                    last_name=last or None,
                )
                await store.save_person(person, f"Import person {person.id}")
            people.append(person.id)

        site = sites_by_uuid.get(draft.site_uuid or "")
        profiles: list[str] = []
        if draft.samples:
            name = f"import_{dive_number:05d}.json"
            profiles = [
                store.save_profile(name, {"source": draft.computer, "samples": draft.samples})
            ]
        dive = DiveRecord(
            number=dive_number,
            date=draft.date,
            time_in=draft.time_in.strftime("%H:%M") if draft.time_in else None,
            duration_min=max(draft.duration_min, 1),
            max_depth_m=draft.max_depth_m,
            avg_depth_m=draft.avg_depth_m,
            water_temp_c=draft.water_temp_c,
            air_temp_c=draft.air_temp_c,
            site=site.site_id if site else None,
            country=site.country if site else None,
            people=people,
            tags=draft.tags,
            gas=gas_for(draft.o2_pct, draft.he_pct),
            o2_pct=draft.o2_pct,
            he_pct=draft.he_pct,
            suit=draft.suit,
            weights_kg=draft.weights_kg,
            rating=draft.rating,
            profiles=profiles,
            visibility="draft",
            import_id=import_id,
            body_md=draft.notes,
        )
        await store.save_dive(dive, f"Import dive #{dive.number} as draft")

    dates = [d.date for d in log.dives]
    report = ImportResult(
        import_id=import_id,
        created=created,
        updated=updated,
        skipped=skipped,
        sites_created=sum(1 for r in site_report if r.outcome == "created"),
        sites_matched=sum(1 for r in site_report if r.outcome == "matched"),
        sites=site_report,
        dry_run=dry_run,
        dives_in_file=len(log.dives),
        first_date=min(dates, default=None),
        last_date=max(dates, default=None),
    )
    if dry_run:
        return report
    record = ImportRecord(
        id=import_id,
        format="subsurface-xml",
        original_name=(file.filename or "")[:255],
        storage_key=key,
        created_at=datetime.now(UTC),
        created=created,
        updated=updated,
    )
    await store.save_import(record, f"Record import {import_id[:8]}")
    logger.info(
        "subsurface import: %d created, %d updated, %d skipped", len(created), len(updated), skipped
    )
    return report


MATCH_WINDOW = timedelta(minutes=10)


@router.post("/import/shearwater", response_model=ImportResult)
async def admin_import_shearwater(
    store: StoreDep, files: list[UploadFile] = File(...), dry_run: bool = False
) -> ImportResult:
    """Attach Perdix profiles to the dives they belong to, or create drafts for new ones.

    A dive matches when it starts within ten minutes of the computer's start time, or already
    lists the computer's dive number. Every file is kept as-is in storage. With
    ``dry_run=true`` nothing is stored or written; the result says what would happen.
    """
    storage = get_storage()
    import_id = "" if dry_run else uuid4().hex
    created: list[int] = []
    updated: list[int] = []
    dates: list[date] = []
    skipped = 0
    planned = store.next_dive_number()
    first_key: str | None = None
    for file in files:
        data = await file.read()
        if len(data) > get_settings().MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"{file.filename}: file too large")
        try:
            computer = parse_shearwater(data)
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"{file.filename}: could not parse export: {exc}"
            ) from exc
        dates.append(computer.start.date())
        match = _match_computer(store, computer.start, computer.number)
        complete = match is not None and computer.number in match.computer and match.profiles
        if dry_run:
            if complete:
                skipped += 1
            elif match is not None:
                updated.append(match.number)
            else:
                created.append(planned)
                planned += 1
            continue

        key = f"imports/{datetime.now(UTC).strftime('%Y/%m')}/{import_id}-{computer.number}.xml"
        first_key = first_key or key
        await storage.put(key, data, "application/xml")
        if complete:
            skipped += 1
            continue
        profile_name = f"perdix_{computer.serial}_{computer.number}.json"
        payload = computer.profile()
        if match is not None:
            payload["log_dive_no"] = match.number
            relative = store.save_profile(profile_name, payload)
            if relative not in match.profiles:
                match.profiles.append(relative)
            if computer.number not in match.computer:
                match.computer.append(computer.number)
            match.import_id = import_id
            await store.save_dive(
                match, f"Attach Perdix #{computer.number} to dive #{match.number}"
            )
            updated.append(match.number)
            continue

        number = store.next_dive_number()
        payload["log_dive_no"] = number
        gas, o2, he = gas_of(computer)
        dive = DiveRecord(
            number=number,
            date=computer.start.date(),
            time_in=computer.time_in,
            time_out=computer.time_out,
            duration_min=max(computer.duration_min, 1),
            max_depth_m=computer.max_depth_m,
            avg_depth_m=computer.avg_depth_m,
            water_temp_c=min(computer.temp_c, default=None),
            gas=gas,
            o2_pct=o2,
            he_pct=he,
            computer=[computer.number],
            profiles=[store.save_profile(profile_name, payload)],
            visibility="draft",
            import_id=import_id,
        )
        await store.save_dive(dive, f"Import Perdix #{computer.number} as draft dive #{number}")
        created.append(number)

    report = ImportResult(
        import_id=import_id,
        created=created,
        updated=updated,
        skipped=skipped,
        sites_created=0,
        dry_run=dry_run,
        dives_in_file=len(dates),
        first_date=min(dates, default=None),
        last_date=max(dates, default=None),
    )
    if dry_run:
        return report
    record = ImportRecord(
        id=import_id,
        format="shearwater-xml",
        original_name=", ".join((f.filename or "")[:60] for f in files)[:255],
        storage_key=first_key or "",
        created_at=datetime.now(UTC),
        created=created,
        updated=updated,
    )
    await store.save_import(record, f"Record Perdix import {import_id[:8]}")
    return report


def _match_computer(store: Store, start: datetime, computer_number: int) -> DiveRecord | None:
    """The dive that starts within the window of a computer record, else one already citing it."""
    for dive in store.dives.values():
        if computer_number in dive.computer:
            return dive
    for dive in store.dives.values():
        if dive.date != start.date() or not dive.time_in:
            continue
        began = datetime.combine(dive.date, datetime.strptime(dive.time_in, "%H:%M").time())
        if abs(began - start) <= MATCH_WINDOW:
            return dive
    return None


@router.get("/imports", response_model=list[ImportRecordOut])
async def admin_imports(store: StoreDep) -> list[ImportRecordOut]:
    rows = sorted(store.imports.values(), key=lambda r: r.created_at, reverse=True)
    return [
        ImportRecordOut(
            id=r.id,
            format=r.format,
            original_name=r.original_name,
            created_at=r.created_at.isoformat(),
            created=r.created,
            updated=r.updated,
            url=media_url(r.storage_key),
        )
        for r in rows
    ]
