"""API schemas of the editor's helper endpoints: dive template, list pages, previews, lookups."""

from datetime import date
from typing import Literal

from pydantic import Field

from divelog_server.schemas.base import ApiModel
from divelog_server.schemas.dive import AdminDiveListItem, DiveIn, TripOut, TripRef
from divelog_server.schemas.sitemap import SiteMap

SiteOriginName = Literal["log", "commons", "fork"]
DiveSort = Literal["date", "number", "depth", "duration"]


class TemplateSite(ApiModel):
    """A site dived recently, for the top of the site picker."""

    site_id: str
    name: str
    country: str | None
    region: str | None
    last_dive: date
    dives: int


class TemplatePerson(ApiModel):
    """Someone often dived with; ``dives`` counts the dives together in the last 24 months."""

    id: str
    slug: str
    name: str
    dives: int


class SiteLastDive(ApiModel):
    """The last dive at a site, for the values a new dive there starts from."""

    number: int
    date: date
    section: str | None
    map_id: str | None
    water_temp_c: float | None
    surface_temp_c: float | None
    air_temp_c: float | None
    visibility_m: float | None


class DiveTemplateOut(ApiModel):
    """Everything the new-dive form starts from, in one request.

    ``previous`` is the latest dive on or before ``date`` as the form's input (its profile
    left out), ``at_site`` the latest dive at the requested site, ``recent_sites`` up to 8
    sites by last dive, ``frequent_people`` up to 12 people by dives together in the 24 months
    before ``date`` (then by name), ``trip_for_date`` the trip whose dates hold ``date``.
    """

    date: date
    next_number: int
    previous: DiveIn | None = None
    at_site: SiteLastDive | None = None
    recent_sites: list[TemplateSite] = Field(default_factory=list)
    frequent_people: list[TemplatePerson] = Field(default_factory=list)
    trip_for_date: TripOut | None = None


class AdminDiveRow(AdminDiveListItem):
    """A row of the paged dive list: the list row plus what its secondary links need."""

    time_in: str | None
    site_id: str | None
    trip: TripRef | None


class AdminDivePage(ApiModel):
    """One page of the editor's dive list; ``total`` counts every row the filter matches."""

    items: list[AdminDiveRow]
    total: int
    offset: int
    limit: int


class MarkdownPreviewIn(ApiModel):
    """Markdown to render."""

    md: str = Field(default="", max_length=200_000)


class MarkdownPreviewOut(ApiModel):
    """The Markdown as the public pages render it: sanitised HTML."""

    html: str


class DivesPublishIn(ApiModel):
    """The dives to publish; numbers that are not drafts are left as they are."""

    numbers: list[int] = Field(min_length=1, max_length=5000)


class DivesPublishOut(ApiModel):
    """``published`` were drafts and are public now; ``unchanged`` were not drafts or unknown."""

    published: list[int]
    unchanged: list[int]


class NearbyLogSite(ApiModel):
    """A site of this log that may be the one being created.

    ``matched_by`` is the rule that found it; ``distance_m`` (whole metres) is set when both
    the site and the point are placed.
    """

    site_id: str
    name: str
    country: str | None
    type: str
    lat: float | None
    lon: float | None
    matched_by: Literal["name", "alias", "distance"]
    distance_m: float | None
    origin: SiteOriginName
    dives: int


class NearbyCommonsSite(ApiModel):
    """A commons site this log does not use yet that may be the one being created."""

    site_id: str
    name: str
    country: str | None
    type: str
    area: str | None
    lat: float | None
    lon: float | None
    matched_by: Literal["name", "alias", "distance"]
    distance_m: float | None


class NearbySitesOut(ApiModel):
    """Possible duplicates of a site being created, nearest first, in the log and the commons."""

    log: list[NearbyLogSite]
    commons: list[NearbyCommonsSite]


class CountryOut(ApiModel):
    """A country the log knows: ISO 3166 alpha-3 and alpha-2 codes and the English name."""

    iso3: str
    iso2: str
    name: str


class LicenceOut(ApiModel):
    """A licence a photo of someone else may carry: allowlisted id, name and deed URL."""

    id: str
    name: str
    url: str


class SiteFieldsOut(ApiModel):
    """How the fields of a commons site behave under a personal overlay.

    ``objective`` fields need a fork to change, ``personal`` ones live in the overlay,
    ``additive`` ones add to the commons lists, ``preference`` ones may differ per log.
    """

    objective: list[str]
    personal: list[str]
    additive: list[str]
    preference: list[str]


class SiteMapSeedIn(ApiModel):
    """Where a starter map comes from; ``radius_m`` defaults to one per site type."""

    source: Literal["osm"] = "osm"
    radius_m: int | None = Field(default=None, ge=50, le=3000)


class SiteMapSeedOut(ApiModel):
    """A starter map for a site, not saved: ``map`` is the payload ``POST /maps`` takes.

    ``origin`` is the site's position and ``north`` 0; ``elements`` counts the OSM features
    the query returned, ``radius_m`` is the radius asked for.
    """

    source: Literal["osm"]
    radius_m: int
    elements: int
    map: SiteMap
