"""Build a drawn site map for an open-water site from OpenStreetMap, then check, render and push it.

``fetch`` asks the Overpass API for the water, coastline, piers, wrecks, buoys, slipways and
similar features around a site and writes a starter map (version 3 site map, metres, x east,
y south, the site's coordinates at the origin) that a person or an agent then completes with
entries, objects, depths and notes. ``check`` validates a map against the backend schema and
warns about loose ends. ``render`` draws a map to PNG so it can be looked at. ``push`` saves it
through the admin API and makes it the site's default map.

Run with ``divelog sitemap-osm <command> ...``.
"""

import argparse
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from itertools import pairwise
from pathlib import Path
from typing import Any, TextIO

from PIL import Image, ImageDraw

from divelog_server.schemas.sitemap import SiteMap
from divelog_server.tools.common import (
    default_api,
    dump,
    font,
    load,
    log_root,
    open_store,
    push_map,
    session_cookie,
    set_default_map,
    user_agent,
)

Point = tuple[float, float]

OVERPASS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
)
RADIUS = {
    "pool": 120,
    "indoor dive tower": 120,
    "cave": 250,
    "cavern": 250,
    "mine": 300,
    "quarry lake": 700,
    "lake": 700,
    "reservoir": 900,
    "sea": 900,
    "wreck": 900,
    "reef with wrecks": 1200,
}
NODE_COLOURS = {
    "entrance": "#ff9500",
    "entry": "#ff9500",
    "station": "#007aff",
    "t": "#ff2d55",
    "jump": "#af52de",
    "end": "#000000",
    "restriction": "#ff3b30",
    "air": "#5ac8fa",
    "marker": "#8e8e93",
    "platform": "#34c759",
    "wreck": "#5e3b1e",
    "object": "#5e3b1e",
    "buoy": "#ff9f0a",
    "hazard": "#ff3b30",
    "poi": "#8e8e93",
}
LINE_COLOURS = {
    "shoreline": (0, 110, 200),
    "depth": (120, 120, 200),
    "path": (200, 60, 60),
    "wall": (90, 90, 90),
    "pipe": (150, 100, 50),
    "line": (0, 0, 0),
}
AREA_COLOURS = {
    "outline": (0, 110, 200, 40),
    "depth": (0, 80, 180, 40),
    "shallows": (120, 200, 240, 70),
    "coral": (240, 120, 120, 80),
    "sand": (240, 220, 150, 110),
    "wall": (110, 110, 110, 90),
    "wreck": (120, 80, 40, 120),
    "reeds": (110, 180, 90, 90),
    "other": (150, 150, 150, 70),
}
SERVER_KEYS = ("id", "site_id", "sort", "revision", "updated_at")


def slug(text: str) -> str:
    """An ASCII id fragment of at most 40 characters."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "x"


class Frame:
    """Equirectangular metres around the site: x east, y south."""

    def __init__(self, lat: float, lon: float) -> None:
        self.lat, self.lon = lat, lon
        self.mx = 111320 * math.cos(math.radians(lat))
        self.my = 110574

    def to_map(self, lat: float, lon: float) -> Point:
        """Map metres of a coordinate."""
        return (
            round((lon - self.lon) * self.mx, 1),
            round((self.lat - lat) * self.my, 1),
        )


def overpass(lat: float, lon: float, radius: int) -> dict[str, Any]:
    """The OSM features around a point, with geometry, from the first Overpass that answers."""
    around = f"(around:{radius},{lat},{lon})"
    query = f"""[out:json][timeout:90];
(
  way{around}["natural"~"^(water|coastline|reef|beach|bay|rock|shoal|wetland|cliff|sand|shingle)$"];
  relation{around}["natural"~"^(water|reef|beach|bay|wetland)$"];
  way{around}["man_made"~"^(pier|jetty|breakwater|groyne|pipeline|dyke|embankment|quay|dam)$"];
  nwr{around}["man_made"~"^(lighthouse|buoy|beacon|mooring|tower|water_tower)$"];
  nwr{around}["historic"="wreck"];
  nwr{around}["seamark:type"];
  nwr{around}["leisure"~"^(slipway|marina|swimming_area|beach_resort)$"];
  nwr{around}["amenity"~"^(dive_centre|parking|shelter)$"];
  nwr{around}["sport"~"scuba"];
  nwr{around}["waterway"~"^(riverbank|dam|weir|lock_gate|dock|canal|river)$"];
  nwr{around}["place"~"^(islet|island)$"];
  way{around}["bridge"]["bridge"!="no"];
  way{around}["highway"~"^(track|path|footway|steps|service)$"];
  way{around}["highway"]["bridge"]["bridge"!="no"];
  way{around}["barrier"~"^(fence|wall)$"];
);
out body geom;
"""
    last: Exception | None = None
    for attempt in range(6):
        endpoint = OVERPASS[attempt % len(OVERPASS)]
        req = urllib.request.Request(
            endpoint,
            data=urllib.parse.urlencode({"data": query}).encode(),
            headers={"User-Agent": user_agent()},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=150) as response:
                data: dict[str, Any] = json.loads(response.read())
                return data
        except (
            urllib.error.HTTPError,
            urllib.error.URLError,
            TimeoutError,
            json.JSONDecodeError,
        ) as error:
            last = error
            print(f"overpass {endpoint}: {error}; retrying", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"overpass failed: {last}")


def simplify(points: list[Point], tolerance: float) -> list[Point]:
    """Ramer–Douglas–Peucker."""
    if len(points) < 3:
        return points
    (x0, y0), (x1, y1) = points[0], points[-1]
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy) or 1e-9
    best, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        distance = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / length
        if distance > best:
            best, index = distance, i
    if best > tolerance:
        left = simplify(points[: index + 1], tolerance)
        right = simplify(points[index:], tolerance)
        return left[:-1] + right
    return [points[0], points[-1]]


def clip_segment(a: Point, b: Point, half: float) -> tuple[Point, Point] | None:
    """Liang–Barsky: the part of segment a-b inside the square of the given half-size."""
    (x0, y0), (x1, y1) = a, b
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 + half), (dx, half - x0), (-dy, y0 + half), (dy, half - y0)):
        if p == 0:
            if q < 0:
                return None
            continue
        t = q / p
        if p < 0:
            if t > t1:
                return None
            t0 = max(t0, t)
        else:
            if t < t0:
                return None
            t1 = min(t1, t)
    return (
        (round(x0 + t0 * dx, 1), round(y0 + t0 * dy, 1)),
        (round(x0 + t1 * dx, 1), round(y0 + t1 * dy, 1)),
    )


def clip_runs(points: list[Point], half: float, closed: bool) -> list[tuple[list[Point], bool]]:
    """Split a polyline into the runs that lie inside the square of the given half-size."""
    if all(abs(x) <= half and abs(y) <= half for x, y in points):
        return [(points, closed)]
    if closed and points:
        points = points + points[:1]
    runs: list[list[Point]] = []
    current: list[Point] = []
    for a, b in pairwise(points):
        clipped = clip_segment(a, b, half)
        if clipped is None:
            if current:
                runs.append(current)
                current = []
            continue
        start, end = clipped
        if not current or current[-1] != start:
            if current:
                runs.append(current)
            current = [start]
        current.append(end)
    if current:
        runs.append(current)
    return [(run, False) for run in runs if len(run) > 1]


def nearest(points: list[Point]) -> float:
    """Distance from the origin to the closest point."""
    return min(math.hypot(x, y) for x, y in points) if points else float("inf")


def way_points(frame: Frame, element: dict[str, Any]) -> list[Point]:
    """The geometry of a way in map metres."""
    return [frame.to_map(p["lat"], p["lon"]) for p in element.get("geometry", []) if p]


def centroid(points: list[Point]) -> Point:
    """The mean of the points."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (round(sum(xs) / len(xs), 1), round(sum(ys) / len(ys), 1))


def element_points(frame: Frame, element: dict[str, Any]) -> list[list[Point]]:
    """Every ring or line of an element, relations flattened to their member ways."""
    if element["type"] == "node":
        return [[frame.to_map(element["lat"], element["lon"])]]
    if element["type"] == "way":
        return [way_points(frame, element)]
    rings = []
    for member in element.get("members", []):
        if member.get("type") == "way" and member.get("geometry"):
            rings.append([frame.to_map(p["lat"], p["lon"]) for p in member["geometry"] if p])
    return rings


def stitch(rings: list[list[Point]]) -> list[list[Point]]:
    """Join relation member ways end to end where they touch."""
    remaining = [list(r) for r in rings if len(r) > 1]
    out: list[list[Point]] = []
    while remaining:
        current = remaining.pop(0)
        grown = True
        while grown:
            grown = False
            for other in list(remaining):
                if other[0] == current[-1]:
                    current += other[1:]
                elif other[-1] == current[-1]:
                    current += list(reversed(other))[1:]
                elif other[-1] == current[0]:
                    current = other[:-1] + current
                elif other[0] == current[0]:
                    current = list(reversed(other))[:-1] + current
                else:
                    continue
                remaining.remove(other)
                grown = True
        out.append(current)
    return out


def label_of(tags: dict[str, str]) -> str:
    """The name OSM gives a feature, cut to 80 characters."""
    for key in ("name", "seamark:name", "ref", "description"):
        if tags.get(key):
            return tags[key][:80]
    return ""


def starter_map(site: Mapping[str, Any], osm: dict[str, Any], radius: int) -> dict[str, Any]:
    """The features OSM knows about, in map metres, as a version-3 site map.

    Parameters
    ----------
    site
        ``lat`` and ``lon`` of the origin, and ``short_name`` or ``name`` for the title.
    osm
        An Overpass JSON response with geometry.
    radius
        The query radius in metres; features beyond 1.25 times it are clipped.

    Returns
    -------
    dict
        The site map as JSON.
    """
    frame = Frame(site["lat"], site["lon"])
    half = radius * 1.25
    lines: list[dict[str, Any]] = []
    areas: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []
    ids: set[str] = set()

    def unique(base: str) -> str:
        candidate = base
        n = 2
        while candidate in ids:
            candidate = f"{base[:36]}-{n}"
            n += 1
        ids.add(candidate)
        return candidate

    def add_line(
        base: str,
        kind: str,
        label: str,
        pts: list[Point],
        closed: bool,
        depth: float | None = None,
    ) -> None:
        for run, run_closed in clip_runs(pts, half, closed):
            run = simplify(run, 1.5)
            if len(run) < 2:
                continue
            if len(run) > 1000:
                run = run[:: math.ceil(len(run) / 1000)]
            lines.append(
                {
                    "id": unique(base),
                    "kind": kind,
                    "label": label,
                    "depth": depth,
                    "closed": run_closed,
                    "points": [{"x": x, "y": y} for x, y in run],
                }
            )

    def add_area(base: str, kind: str, label: str, pts: list[Point]) -> None:
        if len(pts) < 3 or not any(abs(x) <= half and abs(y) <= half for x, y in pts):
            return
        pts = simplify(pts, 1.5)
        if len(pts) > 500:
            pts = pts[:: math.ceil(len(pts) / 500)]
        areas.append(
            {
                "id": unique(base),
                "kind": kind,
                "label": label,
                "depth": None,
                "points": [{"x": x, "y": y} for x, y in pts],
            }
        )

    def add_node(
        base: str,
        node_type: str,
        label: str,
        xy: Point,
        object_kind: str | None = None,
        depth: float | None = None,
    ) -> None:
        x, y = xy
        if abs(x) > half or abs(y) > half:
            return
        nodes.append(
            {
                "id": unique(base),
                "x": x,
                "y": y,
                "type": node_type,
                "label": label,
                "depth": depth,
                "object_kind": object_kind,
                "left": None,
                "right": None,
                "color": None,
            }
        )

    def is_water(tags: dict[str, str]) -> bool:
        return tags.get("natural") in ("water", "bay") or tags.get("waterway") in (
            "riverbank",
            "dock",
            "canal",
            "river",
        )

    def extent(ring: list[Point]) -> float:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    water_rings = [
        ring
        for element in osm.get("elements", [])
        if is_water(element.get("tags", {}))
        for ring in (
            stitch(element_points(frame, element))
            if element["type"] == "relation"
            else element_points(frame, element)
        )
        if ring
    ]
    largest = max(water_rings, key=extent, default=None)

    for element in osm.get("elements", []):
        tags = element.get("tags", {})
        label = label_of(tags)
        rings = element_points(frame, element)
        if element["type"] == "relation":
            rings = stitch(rings)
        if not rings or not rings[0]:
            continue
        flat = [p for ring in rings for p in ring]
        natural = tags.get("natural", "")
        man_made = tags.get("man_made", "")
        seamark = tags.get("seamark:type", "")
        if is_water(tags):
            for ring in rings:
                if nearest(ring) > radius * 0.6 and ring != largest:
                    continue
                closed = len(ring) > 2 and ring[0] == ring[-1]
                add_line(
                    slug(label or "shore"),
                    "shoreline",
                    label,
                    ring[:-1] if closed else ring,
                    closed,
                )
        elif natural == "coastline":
            for ring in rings:
                add_line("coast", "shoreline", label, ring, False)
        elif seamark == "marine_farm":
            if len(flat) > 2:
                add_area(
                    slug(label or "marine-farm"),
                    "other",
                    label or "Marine farm",
                    flat[:-1] if flat[0] == flat[-1] else flat,
                )
        elif seamark in ("restricted_area", "anchorage", "separation_zone"):
            continue
        elif natural in ("reef", "rock", "shoal"):
            for ring in rings:
                closed = len(ring) > 2 and ring[0] == ring[-1]
                if closed:
                    add_area(
                        slug(label or natural),
                        "coral" if natural == "reef" else "other",
                        label,
                        ring[:-1],
                    )
                elif len(ring) == 1:
                    add_node(slug(label or natural), "poi", label or natural, ring[0])
                else:
                    add_line(slug(label or natural), "wall", label, ring, False)
        elif natural in ("beach", "sand", "shingle"):
            for ring in rings:
                if len(ring) > 2:
                    add_area(
                        slug(label or "beach"),
                        "sand",
                        label or "Beach",
                        ring[:-1] if ring[0] == ring[-1] else ring,
                    )
        elif natural in ("wetland",):
            for ring in rings:
                if len(ring) > 2:
                    add_area(
                        slug(label or "reeds"),
                        "reeds",
                        label,
                        ring[:-1] if ring[0] == ring[-1] else ring,
                    )
        elif natural == "cliff":
            for ring in rings:
                add_line(slug(label or "cliff"), "wall", label or "Cliff", ring, False)
        elif tags.get("historic") == "wreck" or seamark == "wreck" or tags.get("wreck:type"):
            add_node(
                slug(label or "wreck"),
                "object",
                label or "Wreck",
                centroid(flat),
                "wreck",
            )
            if len(flat) > 2:
                add_area(
                    slug((label or "wreck") + "-outline"),
                    "wreck",
                    label,
                    flat[:-1] if flat[0] == flat[-1] else flat,
                )
        elif seamark.startswith(("buoy", "mooring")) or man_made in ("buoy", "mooring"):
            add_node(slug(label or "buoy"), "buoy", label, centroid(flat))
        elif seamark in (
            "beacon_special_purpose",
            "beacon_lateral",
            "beacon_cardinal",
            "light_minor",
            "landmark",
        ) or man_made in ("beacon",):
            add_node(
                slug(label or "beacon"),
                "marker",
                label or seamark.replace("_", " "),
                centroid(flat),
            )
        elif man_made == "lighthouse":
            add_node(
                slug(label or "lighthouse"),
                "object",
                label or "Lighthouse",
                centroid(flat),
                "lighthouse",
            )
        elif man_made in (
            "pier",
            "jetty",
            "breakwater",
            "groyne",
            "quay",
            "dam",
        ) or tags.get("waterway") in ("dam", "weir"):
            names = {
                "pier": "Pier",
                "jetty": "Jetty",
                "breakwater": "Breakwater",
                "groyne": "Groyne",
                "quay": "Quay",
                "dam": "Dam",
                "weir": "Weir",
            }
            kind_name = label or names.get(man_made or tags.get("waterway", ""), "Pier")
            for ring in rings:
                if len(ring) == 1:
                    add_node(slug(kind_name), "poi", kind_name, ring[0])
                else:
                    closed = len(ring) > 2 and ring[0] == ring[-1]
                    add_line(
                        slug(kind_name),
                        "wall",
                        kind_name,
                        ring[:-1] if closed else ring,
                        closed,
                    )
        elif man_made == "pipeline":
            for ring in rings:
                add_line(slug(label or "pipeline"), "pipe", label or "Pipeline", ring, False)
        elif man_made in ("dyke", "embankment") or tags.get("barrier"):
            for ring in rings:
                add_line(
                    slug(label or man_made or tags.get("barrier", "wall")),
                    "wall",
                    label,
                    ring,
                    False,
                )
        elif tags.get("leisure") == "slipway":
            add_node(slug(label or "slipway"), "entry", label or "Slipway", centroid(flat))
        elif tags.get("leisure") in ("marina", "swimming_area", "beach_resort"):
            add_node(
                slug(label or tags["leisure"]),
                "poi",
                label or tags["leisure"].replace("_", " ").capitalize(),
                centroid(flat),
            )
        elif tags.get("amenity") == "dive_centre" or "scuba" in tags.get("sport", ""):
            add_node(
                slug(label or "dive-centre"),
                "poi",
                label or "Dive centre",
                centroid(flat),
            )
        elif tags.get("amenity") == "parking":
            add_node(slug(label or "parking"), "poi", label or "Parking", centroid(flat))
        elif tags.get("amenity") == "shelter":
            add_node(slug(label or "shelter"), "poi", label or "Shelter", centroid(flat))
        elif tags.get("place") in ("islet", "island"):
            if len(flat) > 2:
                for ring in rings:
                    add_line(
                        slug(label or "islet"),
                        "shoreline",
                        label,
                        ring[:-1] if ring[0] == ring[-1] else ring,
                        ring[0] == ring[-1],
                    )
            else:
                add_node(slug(label or "islet"), "poi", label or "Islet", centroid(flat))
        elif man_made in ("tower", "water_tower"):
            add_node(
                slug(label or man_made),
                "poi",
                label or man_made.replace("_", " ").capitalize(),
                centroid(flat),
            )
        elif tags.get("bridge") and tags.get("bridge") != "no":
            for ring in rings:
                add_line(slug(label or "bridge"), "wall", label or "Bridge", ring, False)
        elif tags.get("waterway") == "lock_gate":
            add_node(slug(label or "lock"), "poi", label or "Lock gate", centroid(flat))
    return {
        "version": 3,
        "kind": "sitemap",
        "title": site.get("short_name") or site.get("name", ""),
        "north": 0.0,
        "nodes": nodes,
        "edges": [],
        "areas": areas,
        "lines": lines,
        "notes": "Shoreline and features from OpenStreetMap (© OpenStreetMap contributors, ODbL).",
        "origin": {"lat": site["lat"], "lon": site["lon"]},
        "underlay": None,
    }


def cmd_fetch(args: argparse.Namespace, out: TextIO) -> int:
    """Write ``osm.json`` and a starter ``map.json`` for a site of the merged store."""
    store = open_store(log_root(args.log))
    record = store.sites.get(args.site_id)
    if record is None:
        print(f"unknown site {args.site_id}", file=out)
        return 1
    if record.lat is None or record.lon is None:
        print(f"site {args.site_id} has no coordinates", file=out)
        return 1
    site = {
        "lat": record.lat,
        "lon": record.lon,
        "type": record.type,
        "name": record.name,
        "short_name": record.short_name,
    }
    radius = args.radius or RADIUS.get(record.type, 700)
    folder = Path(args.out)
    folder.mkdir(parents=True, exist_ok=True)
    cached = folder / "osm.json"
    if cached.exists() and not args.refresh:
        osm = load(cached)
    else:
        osm = overpass(record.lat, record.lon, radius)
        dump(osm, cached)
    site_map = starter_map(site, osm, radius)
    dump(site_map, folder / "map.json")
    kinds: dict[str, int] = {}
    for line in site_map["lines"]:
        kinds[f"line:{line['kind']}"] = kinds.get(f"line:{line['kind']}", 0) + 1
    for area in site_map["areas"]:
        kinds[f"area:{area['kind']}"] = kinds.get(f"area:{area['kind']}", 0) + 1
    for node in site_map["nodes"]:
        kinds[f"node:{node['type']}"] = kinds.get(f"node:{node['type']}", 0) + 1
    print(
        f"{args.site_id} ({record.type}) at {record.lat}, {record.lon}: radius {radius} m, "
        f"{len(osm.get('elements', []))} OSM elements -> {folder / 'map.json'}",
        file=out,
    )
    for key in sorted(kinds):
        print(f"  {key}: {kinds[key]}", file=out)
    for node in site_map["nodes"]:
        print(
            f"  node {node['id']} ({node['type']}) '{node['label']}' at {node['x']}, {node['y']}",
            file=out,
        )
    for line in site_map["lines"]:
        if line["label"]:
            print(
                f"  line {line['id']} ({line['kind']}) '{line['label']}' {len(line['points'])} pts",
                file=out,
            )
    return 0


def bounds(site_map: dict[str, Any]) -> tuple[float, float, float, float]:
    """The extent of everything drawn: x0, y0, x1, y1 in metres."""
    xs: list[float] = []
    ys: list[float] = []
    for node in site_map["nodes"]:
        xs.append(node["x"])
        ys.append(node["y"])
    for shape in site_map["lines"] + site_map["areas"]:
        for point in shape["points"]:
            xs.append(point["x"])
            ys.append(point["y"])
    if not xs:
        return (-50, -50, 50, 50)
    return (min(xs), min(ys), max(xs), max(ys))


def map_payload(raw: dict[str, Any]) -> dict[str, Any]:
    """A stored map without the keys the server owns."""
    return {k: v for k, v in raw.items() if k not in SERVER_KEYS}


def cmd_check(args: argparse.Namespace, out: TextIO) -> int:
    """Validate a map and warn about loose ends; 1 with ``--strict`` when there are any."""
    raw = load(args.map)
    site_map = SiteMap.model_validate(map_payload(raw))
    problems: list[str] = []
    ids = [n.id for n in site_map.nodes]
    duplicates = {i for i in ids if ids.count(i) > 1}
    if duplicates:
        problems.append(f"duplicate node ids: {', '.join(sorted(duplicates))}")
    known = set(ids)
    degree = dict.fromkeys(ids, 0)
    for edge in site_map.edges:
        for end in (edge.from_, edge.to):
            if end not in known:
                problems.append(f"edge {edge.from_}->{edge.to} refers to unknown node {end}")
            else:
                degree[end] += 1
    if site_map.edges:
        for node in site_map.nodes:
            if (
                node.type in ("station", "t", "jump", "end", "restriction", "entrance")
                and degree[node.id] == 0
            ):
                problems.append(f"node {node.id} ({node.type}) has no edge")
            if node.type == "t" and degree[node.id] < 3:
                problems.append(f"T {node.id} has {degree[node.id]} edges")
            if node.type == "end" and degree[node.id] != 1:
                problems.append(f"end {node.id} has {degree[node.id]} edges")
    for node in site_map.nodes:
        if node.type == "object" and not node.object_kind:
            problems.append(f"object {node.id} has no object_kind")
    x0, y0, x1, y1 = bounds(raw)
    if site_map.kind == "sitemap" and not any(
        n.type in ("entry", "entrance") for n in site_map.nodes
    ):
        problems.append("no entry point")
    if not site_map.origin:
        problems.append("no origin")
    if not site_map.notes.strip():
        problems.append("empty notes: say where the layout comes from")
    print(
        f"{args.map}: {site_map.kind} '{site_map.title}', {len(site_map.nodes)} nodes, "
        f"{len(site_map.edges)} edges, {len(site_map.lines)} lines, {len(site_map.areas)} areas, "
        f"extent x {x0:.0f}..{x1:.0f} m, y {y0:.0f}..{y1:.0f} m",
        file=out,
    )
    for problem in problems:
        print(f"  warning: {problem}", file=out)
    return 1 if args.strict and problems else 0


def cmd_render(args: argparse.Namespace, out: TextIO) -> int:
    """Draw a map to PNG with a metre grid."""
    site_map = load(args.map)
    x0, y0, x1, y1 = bounds(site_map)
    pad = 30
    span = max(x1 - x0, y1 - y0, 20)
    scale = args.scale or (args.size - 2 * pad) / span
    width = int((x1 - x0) * scale + 2 * pad)
    height = int((y1 - y0) * scale + 2 * pad)
    image = Image.new("RGB", (max(width, 300), max(height, 300)), "white")
    draw = ImageDraw.Draw(image, "RGBA")
    small = font(11)
    big = font(13)

    def px(x: float, y: float) -> Point:
        return ((x - x0) * scale + pad, (y - y0) * scale + pad)

    step: float = 10 ** math.floor(math.log10(span / 4)) if span > 0 else 10
    if span / step > 8:
        step *= 2
    if span / step > 8:
        step *= 2.5
    gx = math.floor(x0 / step) * step
    while gx <= x1:
        draw.line([px(gx, y0), px(gx, y1)], fill=(230, 230, 230), width=1)
        draw.text((px(gx, y0)[0] + 2, 2), f"{gx:g}", fill=(170, 170, 170), font=small)
        gx += step
    gy = math.floor(y0 / step) * step
    while gy <= y1:
        draw.line([px(x0, gy), px(x1, gy)], fill=(230, 230, 230), width=1)
        draw.text((2, px(x0, gy)[1] + 2), f"{gy:g}", fill=(170, 170, 170), font=small)
        gy += step
    for area in site_map["areas"]:
        pts = [px(p["x"], p["y"]) for p in area["points"]]
        if len(pts) > 2:
            draw.polygon(
                pts,
                fill=AREA_COLOURS.get(area["kind"], AREA_COLOURS["other"]),
                outline=(90, 90, 90, 160),
            )
            if area.get("label"):
                cx = sum(p[0] for p in pts) / len(pts)
                cy = sum(p[1] for p in pts) / len(pts)
                draw.text((cx, cy), area["label"], fill=(60, 60, 60), font=small, anchor="mm")
    for line in site_map["lines"]:
        pts = [px(p["x"], p["y"]) for p in line["points"]]
        if line.get("closed") and len(pts) > 2:
            pts.append(pts[0])
        if len(pts) > 1:
            colour = LINE_COLOURS.get(line["kind"], (0, 0, 0))
            draw.line(pts, fill=colour, width=2 if line["kind"] != "path" else 1)
            if line.get("label") or line.get("depth") is not None:
                text = line.get("label") or f"{line['depth']:g} m"
                mid = pts[len(pts) // 2]
                draw.text((mid[0] + 3, mid[1] - 12), text, fill=colour, font=small)
    positions = {n["id"]: px(n["x"], n["y"]) for n in site_map["nodes"]}
    for edge in site_map["edges"]:
        if edge["from"] in positions and edge["to"] in positions:
            colour = {
                "line": (0, 0, 0),
                "jump": (170, 60, 220),
                "unsurveyed": (150, 150, 150),
                "route": (200, 40, 40),
            }[edge["style"]]
            draw.line([positions[edge["from"]], positions[edge["to"]]], fill=colour, width=2)
    for node in site_map["nodes"]:
        x, y = positions[node["id"]]
        r = 5 if node["type"] in ("entry", "entrance", "object", "wreck", "platform", "buoy") else 3
        draw.ellipse(
            [x - r, y - r, x + r, y + r],
            fill=NODE_COLOURS.get(node["type"], "#007aff"),
            outline="white",
        )
        text = node["label"] or (node["id"] if node["type"] not in ("station",) else "")
        if node.get("depth") is not None and node["type"] != "station":
            text = f"{text} ({node['depth']:g} m)".strip()
        if text:
            draw.text((x + r + 2, y - 7), text, fill=(30, 30, 30), font=small)
    draw.text(
        (pad, image.height - 22),
        f"{site_map.get('title', '')} — grid {step:g} m, x east, y south",
        fill=(80, 80, 80),
        font=big,
    )
    image.save(args.out)
    print(f"{args.out}: {image.width}x{image.height}, {scale:.2f} px/m", file=out)
    return 0


def cmd_merge(args: argparse.Namespace, out: TextIO) -> int:
    """Append the nodes, edges, lines and areas of one map to another; ids are kept unique."""
    base = load(args.base)
    extra = load(args.extra)
    for key in ("nodes", "lines", "areas"):
        taken = {item["id"] for item in base.get(key, [])}
        for item in extra.get(key, []):
            candidate = item["id"]
            n = 2
            while candidate in taken:
                candidate = f"{item['id'][:36]}-{n}"
                n += 1
            item["id"] = candidate
            taken.add(candidate)
            base.setdefault(key, []).append(item)
    base.setdefault("edges", []).extend(extra.get("edges", []))
    if extra.get("notes") and extra["notes"] not in base.get("notes", ""):
        base["notes"] = (base.get("notes", "").rstrip() + " " + extra["notes"]).strip()
    if extra.get("title") and args.title_from_extra:
        base["title"] = extra["title"]
    dump(base, args.out)
    print(
        f"{args.out}: {len(base['nodes'])} nodes, {len(base['edges'])} edges, "
        f"{len(base['lines'])} lines, {len(base['areas'])} areas",
        file=out,
    )
    return 0


def cmd_recentre(args: argparse.Namespace, out: TextIO) -> int:
    """Move the origin to the middle of the drawing (or to --at x,y) and shift every coordinate."""
    site_map = load(args.map)
    if args.at:
        cx, cy = (float(v) for v in args.at.split(","))
    else:
        x0, y0, x1, y1 = bounds(site_map)
        cx, cy = round((x0 + x1) / 2, 1), round((y0 + y1) / 2, 1)
    for node in site_map["nodes"]:
        node["x"] = round(node["x"] - cx, 1)
        node["y"] = round(node["y"] - cy, 1)
    for shape in site_map["lines"] + site_map["areas"]:
        for point in shape["points"]:
            point["x"] = round(point["x"] - cx, 1)
            point["y"] = round(point["y"] - cy, 1)
    origin = site_map["origin"]
    frame = Frame(origin["lat"], origin["lon"])
    site_map["origin"] = {
        "lat": round(origin["lat"] - cy / frame.my, 6),
        "lon": round(origin["lon"] + cx / frame.mx, 6),
    }
    dump(site_map, args.out)
    print(
        f"{args.out}: shifted by ({cx}, {cy}) m; "
        f"origin now {site_map['origin']['lat']}, {site_map['origin']['lon']}",
        file=out,
    )
    return 0


def cmd_push(args: argparse.Namespace, out: TextIO) -> int:
    """Save the map through the admin API and, unless ``--no-default``, make it the default."""
    payload = map_payload(load(args.map))
    SiteMap.model_validate(payload)
    cookie = session_cookie(args.cookies)
    saved = push_map(args.base, cookie, args.site, payload, args.note, args.map_id)
    map_id = saved["id"]
    if not args.no_default:
        set_default_map(args.base, cookie, args.site, map_id)
    print(
        f"saved {map_id} revision {saved['revision']}"
        + ("" if args.no_default else f"; default_map of {args.site} set"),
        file=out,
    )
    return 0


def register(commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add the ``sitemap-osm`` subcommand with its own sub-subcommands."""
    parser = commands.add_parser(
        "sitemap-osm",
        help="draw open-water site maps from OpenStreetMap",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="tool_command", required=True)

    fetch = sub.add_parser("fetch", help="starter map from OpenStreetMap")
    fetch.add_argument("site_id")
    fetch.add_argument("--out", required=True, help="work folder; writes osm.json and map.json")
    fetch.add_argument("--radius", type=int, help="metres around the site (default by site type)")
    fetch.add_argument(
        "--refresh",
        action="store_true",
        help="query Overpass again instead of reusing osm.json",
    )
    fetch.add_argument(
        "--log", type=Path, default=None, help="log repository (default: env DATA_ROOT)"
    )
    fetch.set_defaults(run=cmd_fetch)

    check = sub.add_parser("check", help="validate a map against the backend schema")
    check.add_argument("map")
    check.add_argument("--strict", action="store_true")
    check.set_defaults(run=cmd_check)

    render = sub.add_parser("render", help="draw a map to PNG")
    render.add_argument("map")
    render.add_argument("out")
    render.add_argument("--size", type=int, default=1400, help="longest side in px")
    render.add_argument("--scale", type=float, help="px per metre instead of --size")
    render.set_defaults(run=cmd_render)

    merge = sub.add_parser("merge", help="append one map's content to another")
    merge.add_argument("base")
    merge.add_argument("extra")
    merge.add_argument("out")
    merge.add_argument("--title-from-extra", action="store_true")
    merge.set_defaults(run=cmd_merge)

    recentre = sub.add_parser("recentre", help="move the origin into the drawing")
    recentre.add_argument("map")
    recentre.add_argument("out")
    recentre.add_argument(
        "--at", help="x,y in map metres that becomes the new origin (default: centre)"
    )
    recentre.set_defaults(run=cmd_recentre)

    push = sub.add_parser("push", help="save the map through the admin API")
    push.add_argument("map")
    push.add_argument("--site", required=True)
    push.add_argument("--cookies", required=True, help="Netscape cookie jar with an owner session")
    push.add_argument("--base", default=default_api())
    push.add_argument("--map-id", help="replace this existing map instead of creating one")
    push.add_argument(
        "--note", default="Drawn from OpenStreetMap and the site's reference material"
    )
    push.add_argument(
        "--no-default",
        action="store_true",
        help="do not make it the site's default map",
    )
    push.set_defaults(run=cmd_push)
