"""Records as they live in the data repository, one Pydantic model per file type.

Unknown frontmatter keys are kept (``extra="allow"``) so a hand-edited file survives a round trip
through the admin editor untouched.
"""

from datetime import date, datetime
from typing import Any, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    model_serializer,
    model_validator,
)

from divelog_server.schemas.sitemap import SiteMap

Visibility = Literal["public", "private", "draft"]
Display = Literal["alias-or-first", "full", "hidden"]


class Record(BaseModel):
    model_config = ConfigDict(extra="allow")


class MediaRef(BaseModel):
    """A stored file attached to a dive, site, person or gear item.

    ``key`` addresses the media storage; a ``repo:`` prefix points into the data repository
    instead. ``variants`` names the rendered WebP sizes that exist for this file.
    """

    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=80)
    key: str = Field(min_length=1, max_length=300)
    kind: str = "photo"
    mime: str = "application/octet-stream"
    bytes: int = 0
    width: int | None = None
    height: int | None = None
    taken_at: datetime | None = None
    caption: str = ""
    credit: str = ""
    sort: int = 0
    public: bool = True
    variants: list[str] = Field(default_factory=list)
    original_name: str = ""


class Price(BaseModel):
    model_config = ConfigDict(extra="allow", json_schema_serialization_defaults_required=True)

    date: date
    amount: float = Field(ge=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    note: str = ""


class AccessPoint(BaseModel):
    model_config = ConfigDict(extra="allow", json_schema_serialization_defaults_required=True)

    lat: float | None = None
    lon: float | None = None
    note: str | None = None


class ChangeEntry(BaseModel):
    """One line of a record's changelog: the revision it produced, when, by whom and why."""

    model_config = ConfigDict(extra="allow", json_schema_serialization_defaults_required=True)

    revision: int = Field(ge=1)
    date: date
    author: str | None = None
    note: str


class PinState(BaseModel):
    """How a personal overlay or fork relates to the current commons revision of its site."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    pinned_revision: int | None
    current_revision: int
    stale: bool


def changelog_problem(revision: int, changelog: list[ChangeEntry]) -> str | None:
    """Why ``changelog`` does not fit ``revision``, or None when it does.

    Entries run newest first with strictly descending revisions, none above ``revision``; a
    non-empty changelog starts at ``revision`` itself.
    """
    revisions = [entry.revision for entry in changelog]
    if any(a <= b for a, b in zip(revisions, revisions[1:], strict=False)):
        return "changelog revisions must be unique and strictly descending"
    if revisions and revisions[0] != revision:
        return f"changelog starts at revision {revisions[0]}, the record is at {revision}"
    return None


def prepend_change(
    revision: int, changelog: list[ChangeEntry], note: str, author: str | None
) -> tuple[int, list[ChangeEntry]]:
    """The next revision and the changelog with its entry, dated today, in front."""
    entry = ChangeEntry(revision=revision + 1, date=date.today(), author=author, note=note)
    return revision + 1, [entry, *changelog]


class TankRecord(BaseModel):
    """One cylinder (or twinset) carried on a dive, with the gas in it and the pressures read."""

    cylinder: str = Field(min_length=1)
    volume_l: float | None = None
    gas: Literal["air", "nitrox", "trimix", "oxygen"] = "air"
    o2_pct: int | None = None
    o2_measured_pct: float | None = None
    he_pct: int | None = None
    pressure_in_bar: float | None = None
    pressure_out_bar: float | None = None
    role: Literal["back", "stage", "deco", "bailout"] = "back"


class DiveRecord(Record):
    number: int = Field(ge=1)
    date: date
    time_in: str | None = None
    time_out: str | None = None
    duration_min: float = Field(ge=0)
    max_depth_m: float = Field(default=0, ge=0)
    avg_depth_m: float | None = None
    water_temp_c: float | None = None
    surface_temp_c: float | None = None
    air_temp_c: float | None = None
    thermocline_m: float | None = None
    visibility_m: float | None = None
    visibility_raw: str | None = None
    title: str = ""
    site: str | None = None
    site_name_raw: str | None = None
    area_raw: str | None = None
    country: str | None = None
    section: str | None = None
    people: list[str] = Field(default_factory=list)
    guide: str | None = None
    buddy_raw: str | None = None
    buddy_role: str | None = None
    operator: str | None = None
    tags: list[str] = Field(default_factory=list)
    types_raw: str | None = None
    gas: str = "air"
    o2_pct: int | None = None
    o2_measured_pct: float | None = None
    he_pct: int | None = None
    gas_raw: str | None = None
    mode: str = "OC"
    suit: str | None = None
    weights_kg: float | None = None
    cylinder: str | None = None
    pressure_in_bar: float | None = None
    pressure_out_bar: float | None = None
    tanks: list[TankRecord] = Field(default_factory=list)
    safety_stop_min: float | None = None
    pressure_group_in: str | None = None
    pressure_group_out: str | None = None
    surface_interval: str | None = None
    conditions: str | None = None
    difficulty: str | None = None
    course: str | None = None
    rating: int | None = None
    gear_setup: str | None = None
    trip: str | None = None
    computer: list[int] = Field(default_factory=list)
    profiles: list[str] = Field(default_factory=list)
    media: list[MediaRef] = Field(default_factory=list)
    cover: str | None = None
    sketch: str | None = None
    flags: list[str] = Field(default_factory=list)
    visibility: Visibility = "public"
    notes_nl: str | None = None
    map_annotation: dict[str, Any] | None = None
    import_id: str | None = None
    body_md: str = Field(default="", exclude=True)


SITE_KEY_ORDER = (
    "site_id",
    "name",
    "full_name",
    "short_name",
    "aliases",
    "region",
    "country",
    "area",
    "system",
    "type",
    "section_vocabulary",
    "lat",
    "lon",
    "access",
    "location_visibility",
    "water",
    "halocline",
    "halocline_m",
    "summary",
    "maps",
    "default_map",
    "reference_maps",
    "media",
    "prices",
    "sources",
    "verified",
    "geo_source",
    "revision",
    "changelog",
    "notes",
    "subsurface_uuid",
)


class SiteCore(Record):
    """The objective description of a dive site: what a shared commons record carries.

    ``verified`` and ``geo_source`` are provenance and therefore public. ``revision`` and
    ``changelog`` version the record in its own file; only the server moves them.
    """

    site_id: str = Field(min_length=1)
    name: str
    full_name: str | None = None
    short_name: str | None = None
    aliases: list[str] = Field(default_factory=list)
    region: str | None = None
    country: str | None = None
    area: str | None = None
    system: str | None = None
    type: str = "sea"
    section_vocabulary: list[str] = Field(default_factory=list)
    lat: float | None = None
    lon: float | None = None
    access: AccessPoint | None = None
    location_visibility: Literal["exact", "region_only"] = "exact"
    water: Literal["salt", "fresh", "brackish"] | None = None
    halocline: bool = False
    halocline_m: float | None = None
    summary: str | None = None
    maps: list[str] = Field(default_factory=list)
    default_map: str | None = None
    media: list[MediaRef] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    verified: str | None = None
    geo_source: str | None = None
    revision: int = Field(default=1, ge=1)
    changelog: list[ChangeEntry] = Field(default_factory=list)

    @model_validator(mode="after")
    def _changelog_fits(self) -> Self:
        problem = changelog_problem(self.revision, self.changelog)
        if problem:
            raise ValueError(problem)
        return self

    def bump(self, note: str, author: str | None) -> None:
        """Move to the next revision and record why."""
        self.revision, self.changelog = prepend_change(self.revision, self.changelog, note, author)


class SiteOverlayFields(Record):
    """The personal part of a site: what the log owner adds on top of the objective record."""

    reference_maps: list[str] = Field(default_factory=list)
    prices: list[Price] = Field(default_factory=list)
    notes: str | None = None
    subsurface_uuid: str | None = None
    summary_override: str | None = None
    body_md: str = Field(default="", exclude=True)


class SiteRecord(SiteCore, SiteOverlayFields):
    """A complete site file in ``sites/<id>.md``: objective and personal fields together.

    ``forked_from`` marks a personal copy that shadows a commons site: ``commons@<revision>``,
    or ``commons@<sha>`` in files written before revisions existed.
    ``body_md_commons`` and ``base_revision`` are never stored: on a merged commons site they
    keep the commons body next to the personal one in ``body_md`` and the commons revision the
    overlay was written against.
    Serialisation keeps the historic key order so re-saved files produce no reordering diffs.
    """

    forked_from: str | None = None
    body_md_commons: str = Field(default="", exclude=True)
    base_revision: int | None = Field(default=None, exclude=True)

    @property
    def forked_from_revision(self) -> int | None:
        """The commons revision a fork was taken from, or None (not a fork, or a commit sha)."""
        if not self.forked_from:
            return None
        _, _, ref = self.forked_from.partition("@")
        return int(ref) if ref.isdigit() else None

    @model_serializer(mode="wrap")
    def _ordered(self, handler: SerializerFunctionWrapHandler) -> Any:
        data = handler(self)
        if not isinstance(data, dict):
            return data
        ordered = {k: data[k] for k in SITE_KEY_ORDER if k in data}
        ordered.update((k, v) for k, v in data.items() if k not in ordered)
        return ordered


class SiteOverlayRecord(SiteOverlayFields):
    """A personal overlay on a commons site, ``sites/<id>.md`` with ``extends: commons``.

    ``default_map`` is a preference among the merged maps; ``aliases``, ``maps`` and ``media``
    add personal names, maps and photos to those of the commons record. ``base_revision`` is
    the commons revision the overlay was written against; None in files from before revisions.
    """

    site_id: str = Field(min_length=1)
    extends: Literal["commons"]
    base_revision: int | None = Field(default=None, ge=1)
    default_map: str | None = None
    aliases: list[str] = Field(default_factory=list)
    maps: list[str] = Field(default_factory=list)
    media: list[MediaRef] = Field(default_factory=list)


class RegionRecord(Record):
    region: str = Field(min_length=1)
    name: str
    country: str | None = None
    waters: list[str] = Field(default_factory=list)
    body_md: str = Field(default="", exclude=True)


class PersonRecord(Record):
    id: str = Field(min_length=1)
    slug: str = Field(min_length=1)
    first_name: str
    last_name: str | None = None
    alias: str | None = None
    aliases: list[str] = Field(default_factory=list)
    email: str | None = None
    display: Display = "alias-or-first"
    avatar: str | None = None
    media: list[MediaRef] = Field(default_factory=list)
    notes: str | None = None
    legacy_id: str | None = None
    body_md: str = Field(default="", exclude=True)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def public_name(self) -> str | None:
        """What visitors see: the alias if set, else the first name; hidden people nothing."""
        if self.display == "hidden":
            return None
        if self.display == "full":
            return self.full_name
        return self.alias or self.first_name

    @property
    def match_names(self) -> set[str]:
        """Every spelling that should resolve to this person, lower-cased."""
        names = {self.full_name, self.first_name, *self.aliases}
        if self.alias:
            names.add(self.alias)
        return {n.strip().lower() for n in names if n and n.strip()}


class TripRecord(Record):
    """A hand-written trip override in ``trips/<slug>.md``.

    With both dates it claims every dive in that window; without, it renames, describes or
    (through ``merge``) joins derived trips whose slug it names. ``id``, ``start`` and ``end``
    are accepted as spellings of ``slug``, ``start_date`` and ``end_date``.
    """

    slug: str = Field(min_length=1)
    name: str = ""
    start_date: date | None = None
    end_date: date | None = None
    cover: str | None = None
    merge: list[str] = Field(default_factory=list)
    body_md: str = Field(default="", exclude=True)

    @model_validator(mode="before")
    @classmethod
    def _aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        data = dict(data)
        for alias, field in (("id", "slug"), ("start", "start_date"), ("end", "end_date")):
            if alias in data:
                value = data.pop(alias)
                data.setdefault(field, value)
        return data


class SiteMapRecord(SiteMap):
    """A drawn map as stored in ``maps/drawn/<id>.json``, with its revision and changelog."""

    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1, max_length=80)
    site_id: str = Field(min_length=1)
    sort: int = 0
    revision: int = Field(default=1, ge=1)
    changelog: list[ChangeEntry] = Field(default_factory=list)
    updated_at: datetime | None = None
    retired_nodes: list[str] = Field(default_factory=list)
    renamed_nodes: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _changelog_fits(self) -> Self:
        problem = changelog_problem(self.revision, self.changelog)
        if problem:
            raise ValueError(problem)
        return self

    def bump(self, note: str, author: str | None) -> None:
        """Move to the next revision and record why."""
        self.revision, self.changelog = prepend_change(self.revision, self.changelog, note, author)


class GearItemRecord(Record):
    id: str = Field(min_length=1)
    name: str
    category: str = "other"
    brand: str = ""
    model: str = ""
    acquired: date | None = None
    retired: date | None = None
    notes_md: str = ""
    sort: int = 0
    media: list[MediaRef] = Field(default_factory=list)


class GearSetupRecord(Record):
    id: str = Field(min_length=1)
    name: str
    description_md: str = ""
    sort: int = 0
    items: list[str] = Field(default_factory=list)


class ReferenceMap(BaseModel):
    """An entry of ``maps/reference/index.json``: third-party artwork, never public."""

    model_config = ConfigDict(extra="allow")

    file: str
    title: str = ""
    site_ids: list[str] = Field(default_factory=list)
    source: str = ""
    page: str = ""
    url: str = ""
    public: bool = False
    warning: str | None = None


class ImportRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    format: str
    original_name: str = ""
    storage_key: str
    created_at: datetime
    created: list[int] = Field(default_factory=list)
    updated: list[int] = Field(default_factory=list)
