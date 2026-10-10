"""API schemas of the commons endpoints: the adopt-a-site search and the commons pull."""

from typing import Literal

from pydantic import Field

from divelog_server.schemas.base import ApiModel

SiteOriginName = Literal["log", "commons", "fork"]


class CommonsSiteHit(ApiModel):
    """A commons site offered for adoption, with what this log already has of it."""

    id: str
    name: str
    country: str | None = None
    type: str
    lat: float | None = None
    lon: float | None = None
    area: str | None = None
    dives: int = 0
    has_dives: bool = False
    origin: SiteOriginName
    distance_km: float | None = None


class CommonsStaleSite(ApiModel):
    """An overlay or fork the commons has moved past; ``new`` when this pull made it stale."""

    site_id: str
    origin: SiteOriginName
    pinned_revision: int | None = None
    current_revision: int
    new: bool = True


class CommonsPullOut(ApiModel):
    """The result of a commons pull: heads before and after, the manifest pin, stale sites."""

    previous_head: str | None = None
    head: str | None = None
    pinned: bool = False
    stale: list[CommonsStaleSite] = Field(default_factory=list)
