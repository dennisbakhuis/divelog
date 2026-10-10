"""The drawing model for site maps: cave stick maps and open-water site maps.

Coordinates are metres in plan view (x east, y south). Version 3 adds free lines (shorelines,
depth contours, dive paths), object pictograms, survey azimuths, a geographic origin and an
optional tracing underlay.
"""

from typing import Literal

from pydantic import ConfigDict, Field

from divelog_server.schemas.base import ApiModel

MapKind = Literal["stickmap", "sitemap"]
MapNodeType = Literal[
    "entrance",
    "station",
    "t",
    "jump",
    "restriction",
    "end",
    "air",
    "marker",
    "entry",
    "platform",
    "wreck",
    "object",
    "buoy",
    "hazard",
    "poi",
]
MapObjectKind = Literal[
    "bus",
    "car",
    "plane",
    "boat",
    "wreck",
    "platform",
    "wipkip",
    "statue",
    "container",
    "pipe",
    "tree",
    "ladder",
    "cage",
    "net",
    "anchor",
    "pinnacle",
    "house",
    "caravan",
    "lighthouse",
    "machine",
    "ruin",
    "gate",
    "reel",
    "postbox",
    "bridge",
    "shark",
    "hopper",
    "truck",
    "turtle",
    "other",
]
MapEdgeStyle = Literal["line", "jump", "unsurveyed", "route"]
MapAreaKind = Literal[
    "outline",
    "depth",
    "shallows",
    "coral",
    "sand",
    "wall",
    "wreck",
    "reeds",
    "other",
]
MapLineKind = Literal["shoreline", "depth", "path", "wall", "pipe", "line"]


class MapNode(ApiModel):
    """A station or object on a site map."""

    id: str = Field(min_length=1, max_length=40)
    x: float
    y: float
    type: MapNodeType = "station"
    label: str = Field(default="", max_length=80)
    depth: float | None = None
    object_kind: MapObjectKind | None = None
    left: float | None = Field(default=None, ge=0)
    right: float | None = Field(default=None, ge=0)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class MapEdge(ApiModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from", min_length=1, max_length=40)
    to: str = Field(min_length=1, max_length=40)
    distance: float | None = None
    azimuth: float | None = Field(default=None, ge=0, lt=360)
    note: str = Field(default="", max_length=120)
    style: MapEdgeStyle = "line"


class MapPoint(ApiModel):
    x: float
    y: float


class MapArea(ApiModel):
    """A closed shape: the shore, a depth band, coral, sand or a wreck footprint."""

    id: str = Field(min_length=1, max_length=40)
    kind: MapAreaKind = "outline"
    label: str = Field(default="", max_length=80)
    depth: float | None = None
    points: list[MapPoint] = Field(default_factory=list, max_length=500)


class MapLine(ApiModel):
    """An open or closed polyline: a shoreline, a depth contour, a dive path, a wall."""

    id: str = Field(min_length=1, max_length=40)
    kind: MapLineKind = "path"
    label: str = Field(default="", max_length=80)
    depth: float | None = None
    closed: bool = False
    points: list[MapPoint] = Field(default_factory=list, max_length=1000)


class MapOrigin(ApiModel):
    """Where (0, 0) of the drawing sits on the earth."""

    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class MapUnderlay(ApiModel):
    """A map shown beneath the canvas while drawing; never part of the rendered result."""

    ref: str = Field(min_length=1, max_length=200)
    scale: float = Field(default=1, gt=0)
    dx: float = 0
    dy: float = 0
    rotation: float = Field(default=0, ge=-360, le=360)
    opacity: float = Field(default=0.5, ge=0, le=1)


class SiteMap(ApiModel):
    """One drawing for a site."""

    version: int = 3
    kind: MapKind = "stickmap"
    title: str = Field(default="", max_length=120)
    north: float = Field(default=0, ge=0, lt=360)
    to_scale: bool = True
    nodes: list[MapNode] = Field(default_factory=list, max_length=2000)
    edges: list[MapEdge] = Field(default_factory=list, max_length=4000)
    areas: list[MapArea] = Field(default_factory=list, max_length=200)
    lines: list[MapLine] = Field(default_factory=list, max_length=400)
    notes: str = Field(default="", max_length=2000)
    origin: MapOrigin | None = None
    underlay: MapUnderlay | None = None


class MapEdgeRef(ApiModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from", min_length=1, max_length=40)
    to: str = Field(min_length=1, max_length=40)


class DiveMapPin(ApiModel):
    id: str = Field(min_length=1, max_length=40)
    x: float
    y: float
    note: str = Field(default="", max_length=200)


class DiveMapAnnotation(ApiModel):
    """What one dive did on a site map.

    ``route`` follows the drawn line of a stick map, leg by leg in swim order; ``path`` is a
    free-drawn track on a site map. ``turn`` names the station, ``turn_at`` the path point,
    where the dive turned.
    """

    map_id: str = Field(min_length=1, max_length=80)
    revision: int = Field(default=1, ge=1)
    route: list[MapEdgeRef] = Field(default_factory=list, max_length=4000)
    turn: str | None = Field(default=None, max_length=40)
    pins: list[DiveMapPin] = Field(default_factory=list, max_length=200)
    path: list[MapPoint] = Field(default_factory=list, max_length=2000)
    turn_at: int | None = Field(default=None, ge=0)
    note: str = Field(default="", max_length=500)
