from collections.abc import Sequence
from datetime import date, datetime
from typing import Any, Literal

from pydantic import Field, computed_field, field_validator

from divelog_server.schemas.base import ApiModel
from divelog_server.schemas.sitemap import DiveMapAnnotation, SiteMap
from divelog_server.services.markdown import render
from divelog_server.store.manifest import normalise_licence
from divelog_server.store.models import (
    AccessPoint,
    ChangeEntry,
    Display,
    PinState,
    Price,
    Stroke,
    Visibility,
)

Gas = Literal["air", "nitrox", "trimix"]
TankGas = Literal["air", "nitrox", "trimix", "oxygen"]
TankRole = Literal["back", "stage", "deco", "bailout"]
Mode = Literal["OC", "CCR", "sidemount"]


class TankIn(ApiModel):
    """One cylinder carried on a dive; the first ``back`` tank is the dive's gas."""

    cylinder: str = Field(min_length=1, max_length=40)
    volume_l: float | None = Field(default=None, gt=0, le=60)
    gas: TankGas = "air"
    o2_pct: int | None = Field(default=None, ge=0, le=100)
    o2_measured_pct: float | None = Field(default=None, ge=0, le=100)
    he_pct: int | None = Field(default=None, ge=0, le=100)
    pressure_in_bar: float | None = Field(default=None, ge=0, le=400)
    pressure_out_bar: float | None = Field(default=None, ge=0, le=400)
    role: TankRole = "back"


class TankOut(TankIn):
    """The stored tank with its volume resolved from the preset or the text."""


AttachmentKind = Literal["photo", "scan", "map", "avatar", "video", "export"]


class SiteMapOut(SiteMap):
    """A drawn map as stored; ``revision`` counts saves, ``changelog`` says why, newest first."""

    id: str
    site_id: str
    sort: int
    revision: int
    changelog: list[ChangeEntry] = Field(default_factory=list)
    updated_at: datetime | None


class SiteMapIn(ApiModel):
    data: SiteMap
    note: str = Field(default="", max_length=200)


class MapRef(ApiModel):
    """One map a site page can show, from any of the three collections."""

    ref: str
    collection: Literal["seed", "drawn", "reference"]
    title: str
    url: str | None = None
    public: bool = True
    credit: str | None = None
    warning: str | None = None
    drawn: SiteMapOut | None = None


class AttachmentOut(ApiModel):
    id: str
    kind: str
    mime: str
    bytes: int
    width: int | None
    height: int | None
    caption: str
    credit: str = ""
    sort: int
    public: bool = True
    taken_at: datetime | None
    original_name: str
    url: str
    variants: dict[str, str]
    licence: str | None = None
    author: str | None = None
    source: str | None = None


class AttachmentPatch(ApiModel):
    """The editable fields of an attachment; only those sent are written.

    ``licence``, ``author`` and ``source`` credit someone else's photo: an empty string clears
    one, and ``licence`` must spell an allowlisted licence (``GET /meta/licences``).
    """

    kind: AttachmentKind | None = None
    caption: str | None = Field(default=None, max_length=500)
    credit: str | None = Field(default=None, max_length=300)
    sort: int | None = None
    public: bool | None = None
    licence: str | None = Field(default=None, max_length=40)
    author: str | None = Field(default=None, max_length=200)
    source: str | None = Field(default=None, max_length=500)

    @field_validator("licence")
    @classmethod
    def _allowlisted(cls, value: str | None) -> str | None:
        """An allowlisted licence id, or ``""`` to clear it."""
        if value is None or not value.strip():
            return value
        licence = normalise_licence(value)
        if licence is None:
            raise ValueError(f"{value!r} is not an allowlisted licence")
        return licence


class PersonPublic(ApiModel):
    slug: str
    name: str
    avatar_url: str | None = None


class BuddyOut(PersonPublic):
    """A buddy on a dive page, with what the two of us have logged together."""

    dives_together: int
    first_dive: date | None
    last_dive: date | None
    first_together: bool = False


class PersonPrivate(PersonPublic):
    id: str
    first_name: str
    last_name: str | None
    alias: str | None
    aliases: list[str]
    email: str | None
    display: str
    notes: str | None
    dives: int


class PersonStats(ApiModel):
    dives: int
    minutes: int
    max_depth_m: float
    longest_min: float
    coldest_c: float | None
    first_dive: date | None
    last_dive: date | None
    countries: int
    sites: int


class PersonOut(PersonPublic):
    bio_md: str = ""
    stats: PersonStats
    countries: list[str] = Field(default_factory=list)
    private: PersonPrivate | None = None

    @computed_field
    @property
    def bio_html(self) -> str:
        """The bio as sanitised HTML."""
        return render(self.bio_md) or ""


class PersonIn(ApiModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    alias: str | None = Field(default=None, max_length=80)
    aliases: list[str] = Field(default_factory=list)
    email: str | None = Field(default=None, max_length=200)
    display: Display = "alias-or-first"
    notes: str | None = None
    bio_md: str = ""


class Attribution(ApiModel):
    """Licence and source of a site record taken from a shared commons."""

    licence: str
    source: str
    ref: str | None = None


class SitePrivate(ApiModel):
    """Owner-only part of a site; ``pin`` is None for a personal site."""

    notes: str | None
    reference_maps: list[MapRef]
    pin: PinState | None = None


class SiteOut(ApiModel):
    id: str
    slug: str
    name: str
    full_name: str | None
    short_name: str | None
    aliases: list[str]
    country: str | None
    country_code: str
    country_name: str
    region: str | None
    region_name: str | None
    area: str | None
    system: str | None
    site_type: str
    section_vocabulary: list[str]
    lat: float | None
    lon: float | None
    access: AccessPoint | None
    location_visibility: str
    water: str | None
    halocline: bool
    halocline_m: float | None
    summary: str | None
    description_md: str
    max_depth_m: float | None
    dives: int
    first_dive: date | None
    last_dive: date | None
    maps: list[MapRef] = Field(default_factory=list)
    default_map: str | None = None
    attachments: list[AttachmentOut] = Field(default_factory=list)
    prices: list[Price] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    verified: str | None = None
    geo_source: str | None = None
    origin: Literal["log", "commons", "fork"] = "log"
    attribution: Attribution | None = None
    revision: int = 1
    changelog: list[ChangeEntry] = Field(default_factory=list)
    forked_from: str | None = None
    private: SitePrivate | None = None

    @computed_field
    @property
    def description_html(self) -> str:
        """The site description as sanitised HTML."""
        return render(self.description_md) or ""


class SiteIn(ApiModel):
    """A site as the editor sends it.

    ``note`` says what changed; it becomes the changelog entry when an objective field changes
    (otherwise ``Update site <id>``) and is never stored on the site itself.
    """

    site_id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    full_name: str | None = None
    short_name: str | None = None
    aliases: list[str] = Field(default_factory=list)
    region: str | None = None
    country: str | None = Field(default=None, min_length=3, max_length=3)
    area: str | None = None
    system: str | None = None
    type: str = "sea"
    section_vocabulary: list[str] = Field(default_factory=list)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    access: AccessPoint | None = None
    location_visibility: Literal["exact", "region_only"] = "exact"
    water: Literal["salt", "fresh", "brackish"] | None = None
    halocline: bool = False
    halocline_m: float | None = None
    summary: str | None = None
    description_md: str = ""
    default_map: str | None = None
    prices: list[Price] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    verified: str | None = None
    geo_source: str | None = None
    notes: str | None = None
    note: str | None = Field(default=None, max_length=200)

    @field_validator("access")
    @classmethod
    def _access_in_range(cls, value: AccessPoint | None) -> AccessPoint | None:
        """The access point's coordinates within their ranges."""
        if value is None:
            return value
        if value.lat is not None and not -90 <= value.lat <= 90:
            raise ValueError("access lat must be between -90 and 90")
        if value.lon is not None and not -180 <= value.lon <= 180:
            raise ValueError("access lon must be between -180 and 180")
        return value


class SitePatch(ApiModel):
    default_map: str | None = None
    prices: list[Price] | None = None
    location_visibility: Literal["exact", "region_only"] | None = None


class SiteSummary(ApiModel):
    slug: str
    name: str
    country_code: str
    country_name: str
    region: str | None
    area: str | None = None
    lat: float | None
    lon: float | None
    site_type: str
    water: str | None = None


class RegionSite(SiteSummary):
    """A site in a region's list; ``dives`` counts the dives the viewer may see, 0 if undived."""

    dives: int


class RegionOut(ApiModel):
    id: str
    name: str
    country: str | None
    country_code: str
    waters: list[str]
    body_md: str = ""
    sites: list[RegionSite] = Field(default_factory=list)
    dives: int = 0
    stats: "RegionStats | None" = None
    map_sites: list["MapSite"] = Field(default_factory=list)

    @computed_field
    @property
    def body_html(self) -> str:
        """The region text as sanitised HTML."""
        return render(self.body_md) or ""


class RegionIn(ApiModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=200)
    country: str | None = Field(default=None, min_length=3, max_length=3)
    waters: list[str] = Field(default_factory=list)
    body_md: str = ""


class NearbySite(ApiModel):
    """Another exactly-placed site within walking-or-short-drive distance of a site."""

    slug: str
    name: str
    country_code: str
    site_type: str
    lat: float
    lon: float
    distance_km: float
    dives: int


class SiteRef(ApiModel):
    slug: str
    name: str
    dives: int


class TripOut(ApiModel):
    """A trip as a dive page shows it; ``day_index`` is the day of the trip the dive fell on."""

    slug: str
    name: str
    start_date: date | None
    end_date: date | None
    description_md: str
    day_index: int | None = None
    days: int | None = None
    custom: bool = False

    @computed_field
    @property
    def description_html(self) -> str:
        """The trip description as sanitised HTML."""
        return render(self.description_md) or ""


class TripRef(ApiModel):
    """The trip a row of the log belongs to."""

    slug: str
    name: str


class TripStats(ApiModel):
    dives: int
    minutes: int
    max_depth_m: float | None
    sites: int


class TripBuddy(PersonPublic):
    dives: int


class TripRegion(ApiModel):
    id: str
    name: str


class TripSummary(ApiModel):
    """A trip card, and the head of a trip page; everything counted over visible dives."""

    id: str
    slug: str
    name: str
    start_date: date
    end_date: date
    days: int
    countries: list["CountryStat"]
    regions: list[TripRegion]
    site_ids: list[str]
    dive_numbers: list[int]
    stats: TripStats
    buddies: list[TripBuddy]
    description_md: str = ""
    cover_url: str | None = None

    @computed_field
    @property
    def description_html(self) -> str:
        """The trip description as sanitised HTML."""
        return render(self.description_md) or ""


class TripTogether(ApiModel):
    """A trip a buddy was on, with the number of dives we made together on it."""

    slug: str
    name: str
    start_date: date
    end_date: date
    dives: int


class TripIn(ApiModel):
    """A trip override as the editor sends it; ``slug`` names its file, so it is a plain slug."""

    slug: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    description_md: str = ""


class ProfileSample(ApiModel):
    t: int
    d: float
    temp: float | None = None
    ndl: int | None = None
    stop: float | None = None
    tts: int | None = None


class ProfileMeta(ApiModel):
    gf: str | None = None
    deco_model: str | None = None
    deco: bool = False
    gas_switches: list[list[Any]] = Field(default_factory=list)
    surface_breaks: list[list[int]] = Field(default_factory=list)
    temp_min_c: float | None = None
    temp_max_c: float | None = None
    sample_interval_s: float | None = None
    partial: str | None = None
    samples: int | None = None
    deco_min: float | None = None
    deepest_stop_m: float | None = None
    first_stop_s: int | None = None
    max_ascent_m_min: float | None = None
    max_descent_m_min: float | None = None
    time_at_max_s: int | None = None


class GearSetupRef(ApiModel):
    slug: str
    name: str


class DiveListItem(ApiModel):
    """Compact row for the searchable index; a few hundred of these are one request."""

    number: int
    title: str
    date: date
    time_in: str | None
    duration_min: float
    max_depth_m: float
    water_temp_c: float | None
    tags: list[str]
    gas: str | None
    """Every mix breathed, back gas first: "Nitrox 32", "Trimix 21/35", "Oxygen"."""
    gases: list[str]
    mode: str
    site: SiteSummary | None
    section: str | None
    buddies: list[PersonPublic]
    gear_setup: str | None
    rating: int | None
    has_photos: bool
    has_profile: bool
    spark: list[int] | None
    cover_url: str | None
    search_text: str
    trip: TripRef | None = None


class SameDayDive(ApiModel):
    """Another dive logged on the same day, for the context strip."""

    number: int
    site_name: str | None
    time_in: str | None


class BuddyNoteOut(ApiModel):
    """A buddy's note on a dive; ``person`` is the buddy's slug."""

    person: str
    comment: str | None
    strokes: list[Stroke] | None
    signed_at: datetime
    public: bool


SignRequestState = Literal["none", "open", "expired", "signed", "no_email"]


class SignRequestOut(ApiModel):
    """Where asking one buddy to sign the dive stands; ``person`` is the buddy's slug.

    ``signed`` wins once the buddy's note exists. ``sent_at`` and ``expires_at`` describe the
    last invite mailed, ``signed_at`` the note.
    """

    person: str
    state: SignRequestState
    sent_at: datetime | None
    expires_at: datetime | None
    signed_at: datetime | None


class BuddyNoteIn(ApiModel):
    """The owner's say over an existing note: keep it (public or not); leaving it out deletes it."""

    person: str = Field(min_length=1, max_length=120)
    public: bool


class DivePrivate(ApiModel):
    people: list[PersonPrivate]
    buddy_raw: str | None
    buddy_role: str | None
    operator: str | None
    flags: list[str]
    sketch: str | None
    site_name_raw: str | None
    area_raw: str | None


class DiveOut(ApiModel):
    number: int
    title: str
    date: date
    time_in: str | None
    time_out: str | None
    duration_min: float
    max_depth_m: float
    avg_depth_m: float | None
    water_temp_c: float | None
    surface_temp_c: float | None
    air_temp_c: float | None
    thermocline_m: float | None
    visibility_m: float | None
    visibility_raw: str | None
    site: SiteOut | None
    section: str | None
    trip: TripOut | None
    tags: list[str]
    types_raw: str | None
    gas: str | None
    o2_pct: int | None
    o2_measured_pct: float | None
    he_pct: int | None
    gas_raw: str | None
    mode: str
    suit: str | None
    weights_kg: float | None
    cylinder: str | None
    pressure_in_bar: float | None
    pressure_out_bar: float | None
    tanks: list[TankOut] = Field(default_factory=list)
    sac_l_min: float | None = None
    sac_basis: str | None = None
    safety_stop_min: float | None
    surface_interval: str | None
    conditions: str | None
    difficulty: str | None
    course: str | None
    rating: int | None
    gear_setup: GearSetupRef | None
    guide: str | None
    body_md: str
    notes_nl: str | None
    visibility: str
    buddies: list[BuddyOut]
    attachments: list[AttachmentOut]
    cover_attachment_id: str | None
    computer: list[int]
    profile: list[ProfileSample] | None
    profile_meta: ProfileMeta | None = None
    map_annotation: DiveMapAnnotation | None = None
    annotation_stale: bool = False
    annotation_dropped_legs: int = 0
    map: SiteMapOut | None = None
    prev_number: int | None = None
    next_number: int | None = None
    prev_site_name: str | None = None
    next_site_name: str | None = None
    site_dive_index: int | None = None
    day_index: int | None = None
    same_day: list[SameDayDive] = Field(default_factory=list)
    context_facts: list[str] = Field(default_factory=list)
    buddy_notes: list[BuddyNoteOut] = Field(default_factory=list)
    """The notes buddies chose to show, of buddies shown on the dive."""
    private: DivePrivate | None = None

    @computed_field
    @property
    def body_html(self) -> str:
        """The dive story as sanitised HTML."""
        return render(self.body_md) or ""


class DiveAdminOut(DiveOut):
    """Admin view: raw identifiers alongside the public shape."""

    id: int
    people_ids: list[str]
    site_id: str | None
    trip_id: str | None
    gear_setup_id: str | None
    country: str | None
    sign_requests: list[SignRequestOut] = Field(default_factory=list)
    """One entry per entry of ``people_ids``, in that order; ``buddy_notes`` holds every note."""


class AdminDiveListItem(ApiModel):
    """One row of the editor's dive list: what the table shows, filters and sorts on."""

    number: int
    date: date
    title: str
    site_name: str | None
    max_depth_m: float
    duration_min: float
    tags: list[str]
    attachments: int
    visibility: str


class DiveIn(ApiModel):
    number: int = Field(ge=1)
    title: str = Field(default="", max_length=200)
    date: date
    time_in: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    time_out: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    duration_min: float = Field(ge=1, le=24 * 60)
    max_depth_m: float = Field(ge=0, le=400)
    avg_depth_m: float | None = Field(default=None, ge=0, le=400)
    water_temp_c: float | None = Field(default=None, ge=-3, le=45)
    surface_temp_c: float | None = Field(default=None, ge=-3, le=45)
    air_temp_c: float | None = Field(default=None, ge=-60, le=60)
    thermocline_m: float | None = Field(default=None, ge=0, le=400)
    visibility_m: float | None = Field(default=None, ge=0, le=100)
    visibility_raw: str | None = Field(default=None, max_length=120)
    site_id: str | None = None
    section: str | None = Field(default=None, max_length=120)
    trip_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    types_raw: str | None = Field(default=None, max_length=300)
    gas: Gas | None = None
    """Only read without tanks; with tanks the first back-gas tank sets every gas field."""
    o2_pct: int | None = Field(default=None, ge=0, le=100)
    o2_measured_pct: float | None = Field(default=None, ge=0, le=100)
    he_pct: int | None = Field(default=None, ge=0, le=100)
    gas_raw: str | None = Field(default=None, max_length=200)
    mode: Mode = "OC"
    suit: str | None = Field(default=None, max_length=200)
    weights_kg: float | None = Field(default=None, ge=0, le=40)
    cylinder: str | None = Field(default=None, max_length=120)
    pressure_in_bar: float | None = Field(default=None, ge=0, le=400)
    pressure_out_bar: float | None = Field(default=None, ge=0, le=400)
    tanks: Sequence[TankIn] = Field(default_factory=list, max_length=8)
    safety_stop_min: float | None = Field(default=None, ge=0, le=120)
    surface_interval: str | None = Field(default=None, max_length=40)
    conditions: str | None = Field(default=None, max_length=300)
    difficulty: str | None = Field(default=None, max_length=40)
    course: str | None = Field(default=None, max_length=200)
    rating: int | None = Field(default=None, ge=1, le=5)
    gear_setup_id: str | None = None
    guide: str | None = Field(default=None, max_length=120)
    operator: str | None = Field(default=None, max_length=300)
    buddy_raw: str | None = Field(default=None, max_length=300)
    buddy_role: str | None = Field(default=None, max_length=300)
    body_md: str = ""
    notes_nl: str | None = None
    visibility: Visibility = "public"
    people_ids: list[str] = Field(default_factory=list)
    cover_attachment_id: str | None = None
    computer: list[int] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    sketch: str | None = None
    profile: list[ProfileSample] | None = None
    map_annotation: DiveMapAnnotation | None = None
    buddy_notes: list[BuddyNoteIn] | None = Field(default=None, max_length=50)
    """None leaves the notes as stored; a list is every note to keep, with its ``public``."""

    @field_validator("buddy_notes")
    @classmethod
    def _one_entry_per_person(cls, value: list[BuddyNoteIn] | None) -> list[BuddyNoteIn] | None:
        if value is not None and len({n.person for n in value}) != len(value):
            raise ValueError("buddy_notes names a person twice")
        return value


class DivePatch(ApiModel):
    """The fields that change on their own, outside the dive form: for now the cover."""

    cover_attachment_id: str | None = None


class SiteDiveRoute(ApiModel):
    """One logged dive's route on one of the site's drawn maps."""

    number: int
    date: date
    title: str
    annotation: DiveMapAnnotation


class TagStat(ApiModel):
    tag: str
    count: int


class YearStat(ApiModel):
    year: int
    dives: int
    minutes: int


class CountryStat(ApiModel):
    country_code: str
    country_name: str
    dives: int


class DepthBucket(ApiModel):
    from_m: int
    to_m: int
    dives: int


class MapSite(ApiModel):
    """A site marker; an atlas site the owner never dived has 0 dives and no years."""

    slug: str
    name: str
    country_code: str
    lat: float
    lon: float
    dives: int
    minutes: int
    site_type: str
    max_depth_m: float
    first_year: int | None
    last_year: int | None


class RegionStats(ApiModel):
    """The small stats band on a region page, over the dives the viewer may see."""

    dives: int
    sites: int
    minutes: int
    max_depth_m: float | None
    first_year: int | None
    last_year: int | None
    top_site: SiteRef | None


class RecordDive(ApiModel):
    number: int
    title: str
    value: float
    site: str | None


class DiveStats(ApiModel):
    total_dives: int
    private_dives: int
    total_minutes: int
    max_depth_m: float
    avg_depth_m: float | None
    avg_duration_min: float | None
    countries: int
    sites: int
    first_dive: date | None
    last_dive: date | None
    tags: list[TagStat]
    """Dives at or below DEEP_DIVE_M; a depth is a field, not a tag."""
    deep_dives: int
    years: list[YearStat]
    country_breakdown: list[CountryStat]
    depth_buckets: list[DepthBucket]
    map_sites: list[MapSite]
    deepest: RecordDive | None
    longest: RecordDive | None
    coldest: RecordDive | None


class DiveSummary(ApiModel):
    """Tiny payload for the front-page tile."""

    total_dives: int
    total_hours: float
    countries: int
    max_depth_m: float
    last_dive: date | None
    last_dive_site: str | None
    cave_dives: int
    scooter_dives: int


class ImportSiteOut(ApiModel):
    """How one imported site resolved: matched to an existing site, or created as personal.

    ``matched_by`` is the rule that found the match; ``distance_m`` (whole metres) is set
    whenever both the import and the matched site are placed.
    """

    subsurface_uuid: str | None
    name: str
    site_id: str
    outcome: Literal["matched", "created"]
    matched_by: Literal["uuid", "name", "alias", "distance"] | None = None
    distance_m: float | None = None
    origin: Literal["log", "commons", "fork"]


class ImportResult(ApiModel):
    """What an import did, or with ``dry_run`` what it would do; nothing is written then.

    ``created`` lists the numbers of the new draft dives (on a dry run the numbers they would
    get), ``updated`` the dives a profile was attached to, ``skipped`` the dives already
    complete. ``dives_in_file`` counts the dives read, ``first_date``/``last_date`` span them.
    On a dry run ``import_id`` is empty and ``sites`` lists the sites that would be created.
    """

    import_id: str
    created: list[int]
    updated: list[int]
    skipped: int
    sites_created: int
    sites_matched: int = 0
    sites: list[ImportSiteOut] = Field(default_factory=list)
    dry_run: bool = False
    dives_in_file: int = 0
    first_date: date | None = None
    last_date: date | None = None


class ImportRecordOut(ApiModel):
    """One past import as the import page lists it; ``created_at`` is ISO 8601 as stored."""

    id: str
    format: str
    original_name: str
    created_at: str
    created: list[int]
    updated: list[int]
    url: str


class NextDiveNumber(ApiModel):
    number: int


class TripDetail(ApiModel):
    """A trip page: the trip, its dives in date order and the sites for its map."""

    trip: TripSummary
    dives: list[DiveListItem]
    map_sites: list[MapSite]


class DiveEnvelope(ApiModel):
    """Shape used by the public index endpoint."""

    dives: list[DiveListItem]
    total: int
    tags: list[str]
    countries: list[CountryStat]
    years: list[int]
    regions: list[str]
    site_types: list[str]
    gear_setups: list[GearSetupRef]


class SiteDetail(ApiModel):
    """A site page: the site, the dives the viewer may see there, and what surrounds it."""

    site: SiteOut
    dives: list[DiveListItem]
    people: list[PersonPublic]
    nearby: list[NearbySite]
    routes: list[SiteDiveRoute]


class PersonDetail(ApiModel):
    """A buddy's page: the person and the dives, places, years and trips we shared."""

    person: PersonOut
    countries: list[CountryStat]
    dives: list[DiveListItem]
    map_sites: list[MapSite]
    years: list[YearStat]
    trips: list[TripTogether]


class TimelineYear(ApiModel):
    year: int
    dives: int


class TimelineDive(ApiModel):
    """The latest public dive, for the front-page link."""

    number: int
    date: date
    site: str | None


class DiveTimeline(ApiModel):
    """Front-page timeline: dives per year, gaps included, and the latest public dive."""

    years: list[TimelineYear]
    latest: TimelineDive | None


class RepoStatus(ApiModel):
    state: str
    ahead: int = 0
    behind: int = 0
    head: str | None = None
    dirty: bool = False
    last_push_at: str | None = None
    last_error: str | None = None
    load_errors: list[str] = Field(default_factory=list)
    notices: list[str] = Field(default_factory=list)
    commons_head: str | None = None
    commons_state: str | None = None


RegionOut.model_rebuild()
TripSummary.model_rebuild()
