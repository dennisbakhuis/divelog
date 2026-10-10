"""Turn a scanned cave map into a drawn stick map for a site.

The workflow is: ``grid`` overlays labelled pixel coordinates on the source image so
the line can be read off precisely; a trace file records stations, edges and outlines
in image pixels together with the scale bar and the entrance; ``build`` converts that
into the site-map JSON the backend stores (metres, x east, y south, entrance at the
origin); ``overlay`` draws the result back onto the source image to check the fit;
``push`` saves it through the admin API and makes it the site's default map.

Trace file::

    {
      "site_id": "mex-tortuga",
      "image": "tortuga_cave_lines_map.webp",
      "title": "Tortuga line survey",
      "scale": {"from": [640, 462], "to": [855, 462], "metres": 100},
      "north_arrow": {"from": [x, y], "to": [x, y]},        # optional, tail -> tip
      "origin": {"px": [790, 178], "lat": 20.27748, "lon": -87.47545},
      "nodes": [{"id": "ent", "px": [790, 178], "type": "entrance", "label": "Cenote Tortuga",
                 "depth": null}],
      "edges": [{"from": "ent", "to": "s1", "style": "line", "note": ""}],
      "lines": [{"id": "cenote", "kind": "shoreline", "closed": true, "px": [[x, y], ...]}],
      "notes": "Traced from ..."
    }

Run with ``divelog stickmap <command> ...``.
"""

import argparse
import math
from pathlib import Path
from typing import Any, TextIO

from PIL import Image, ImageDraw

from divelog_server.tools.common import (
    default_api,
    dump,
    font,
    load,
    push_map,
    session_cookie,
    set_default_map,
)

NODE_COLOURS = {
    "entrance": "#ff9500",
    "t": "#ff2d55",
    "jump": "#af52de",
    "end": "#000000",
    "restriction": "#ff3b30",
    "air": "#5ac8fa",
    "station": "#007aff",
}


class Frame:
    """The similarity transform between image pixels and map metres."""

    def __init__(self, trace: dict[str, Any]) -> None:
        bar = trace["scale"]
        (x0, y0), (x1, y1) = bar["from"], bar["to"]
        self.metres_per_px: float = bar["metres"] / math.hypot(x1 - x0, y1 - y0)
        self.ox: float
        self.oy: float
        self.ox, self.oy = trace["origin"]["px"]
        arrow = trace.get("north_arrow")
        if arrow:
            (ax, ay), (bx, by) = arrow["from"], arrow["to"]
            self.north = (-math.degrees(math.atan2(bx - ax, -(by - ay)))) % 360
        else:
            self.north = float(trace.get("north", 0)) % 360

    def to_map(self, px: float, py: float) -> tuple[float, float]:
        """Map metres of an image pixel."""
        return (
            round((px - self.ox) * self.metres_per_px, 1),
            round((py - self.oy) * self.metres_per_px, 1),
        )

    def to_px(self, x: float, y: float) -> tuple[float, float]:
        """The image pixel of a map position."""
        return (x / self.metres_per_px + self.ox, y / self.metres_per_px + self.oy)


def cmd_grid(args: argparse.Namespace, out: TextIO) -> int:
    """Write the image with a labelled pixel grid, optionally cropped and enlarged."""
    image = Image.open(args.image).convert("RGB")
    x0, y0, x1, y1 = (0, 0, *image.size)
    if args.crop:
        x0, y0, x1, y1 = (int(v) for v in args.crop.split(","))
        image = image.crop((x0, y0, x1, y1))
    zoom = args.zoom
    if zoom != 1:
        image = image.resize(
            (round(image.width * zoom), round(image.height * zoom)),
            Image.Resampling.LANCZOS,
        )
    draw = ImageDraw.Draw(image, "RGBA")
    label = font(max(10, round(11 * zoom)))
    step = args.step
    minor = max(1, step // 5)
    for gx in range(x0 - x0 % minor, x1 + 1, minor):
        sx = (gx - x0) * zoom
        major = gx % step == 0
        draw.line(
            [(sx, 0), (sx, image.height)],
            fill=(255, 0, 200, 140 if major else 45),
            width=1,
        )
        if major:
            draw.text((sx + 2, 2), str(gx), fill=(200, 0, 160, 255), font=label)
            draw.text(
                (sx + 2, image.height - 14 * zoom),
                str(gx),
                fill=(200, 0, 160, 255),
                font=label,
            )
    for gy in range(y0 - y0 % minor, y1 + 1, minor):
        sy = (gy - y0) * zoom
        major = gy % step == 0
        draw.line(
            [(0, sy), (image.width, sy)],
            fill=(255, 0, 200, 140 if major else 45),
            width=1,
        )
        if major:
            draw.text((2, sy + 2), str(gy), fill=(200, 0, 160, 255), font=label)
            draw.text(
                (image.width - 40 * zoom, sy + 2),
                str(gy),
                fill=(200, 0, 160, 255),
                font=label,
            )
    image.save(args.out)
    print(
        f"{args.out}: {image.width}x{image.height}, grid every {step} px (minor {minor})",
        file=out,
    )
    return 0


def build_map(trace: dict[str, Any]) -> dict[str, Any]:
    """Convert a pixel trace into a version-3 site map."""
    frame = Frame(trace)
    nodes = []
    for node in trace["nodes"]:
        x, y = frame.to_map(*node["px"])
        nodes.append(
            {
                "id": node["id"],
                "x": x,
                "y": y,
                "type": node.get("type", "station"),
                "label": node.get("label", ""),
                "depth": node.get("depth"),
                "object_kind": node.get("object_kind"),
                "left": node.get("left"),
                "right": node.get("right"),
            }
        )
    ids = {node["id"] for node in nodes}
    edges = []
    for edge in trace.get("edges", []):
        missing = {edge["from"], edge["to"]} - ids
        if missing:
            raise SystemExit(f"edge {edge['from']}→{edge['to']} refers to unknown node {missing}")
        edges.append(
            {
                "from": edge["from"],
                "to": edge["to"],
                "distance": edge.get("distance"),
                "azimuth": edge.get("azimuth"),
                "note": edge.get("note", ""),
                "style": edge.get("style", "line"),
            }
        )
    lines = []
    for line in trace.get("lines", []):
        lines.append(
            {
                "id": line["id"],
                "kind": line.get("kind", "wall"),
                "label": line.get("label", ""),
                "depth": line.get("depth"),
                "closed": line.get("closed", False),
                "points": [
                    dict(zip(("x", "y"), frame.to_map(*p), strict=True)) for p in line["px"]
                ],
            }
        )
    areas = []
    for area in trace.get("areas", []):
        areas.append(
            {
                "id": area["id"],
                "kind": area.get("kind", "outline"),
                "label": area.get("label", ""),
                "depth": area.get("depth"),
                "points": [
                    dict(zip(("x", "y"), frame.to_map(*p), strict=True)) for p in area["px"]
                ],
            }
        )
    origin = trace["origin"]
    return {
        "version": 3,
        "kind": trace.get("kind", "stickmap"),
        "title": trace.get("title", ""),
        "north": round(frame.north, 1),
        "to_scale": trace.get("to_scale", True),
        "nodes": nodes,
        "edges": edges,
        "areas": areas,
        "lines": lines,
        "notes": trace.get("notes", ""),
        "origin": {"lat": origin["lat"], "lon": origin["lon"]},
        "underlay": None,
    }


def cmd_build(args: argparse.Namespace, out: TextIO) -> int:
    """Write the site map of a trace and warn about loose stations."""
    trace = load(args.trace)
    site_map = build_map(trace)
    dump(site_map, args.out)
    frame = Frame(trace)
    xs = [n["x"] for n in site_map["nodes"]]
    ys = [n["y"] for n in site_map["nodes"]]
    print(
        f"{args.out}: {len(site_map['nodes'])} nodes, {len(site_map['edges'])} edges, "
        f"{len(site_map['lines'])} lines; {frame.metres_per_px:.3f} m/px; "
        f"north {site_map['north']}°; "
        f"extent x {min(xs):.0f}..{max(xs):.0f} m, y {min(ys):.0f}..{max(ys):.0f} m",
        file=out,
    )
    degree = {n["id"]: 0 for n in site_map["nodes"]}
    for edge in site_map["edges"]:
        degree[edge["from"]] += 1
        degree[edge["to"]] += 1
    loose = [n for n, d in degree.items() if d == 0]
    if loose:
        print(f"warning: nodes without edges: {', '.join(loose)}", file=out)
    for node in site_map["nodes"]:
        if node["type"] == "t" and degree[node["id"]] < 3:
            print(f"warning: T {node['id']} has {degree[node['id']]} edges", file=out)
        if node["type"] == "end" and degree[node["id"]] != 1:
            print(f"warning: end {node['id']} has {degree[node['id']]} edges", file=out)
    return 0


def cmd_overlay(args: argparse.Namespace, out: TextIO) -> int:
    """Draw the built map back onto the source image so misplaced points stand out."""
    trace = load(args.trace)
    site_map = build_map(trace)
    frame = Frame(trace)
    image_path = Path(args.trace).parent / trace["image"]
    image = Image.open(image_path).convert("RGB")
    zoom = args.zoom
    if zoom != 1:
        image = image.resize(
            (round(image.width * zoom), round(image.height * zoom)),
            Image.Resampling.LANCZOS,
        )
    draw = ImageDraw.Draw(image, "RGBA")
    label = font(max(9, round(9 * zoom)))

    def scaled(x: float, y: float) -> tuple[float, float]:
        sx, sy = frame.to_px(x, y)
        return (sx * zoom, sy * zoom)

    px = {n["id"]: scaled(n["x"], n["y"]) for n in site_map["nodes"]}
    for line in site_map["lines"]:
        pts = [scaled(p["x"], p["y"]) for p in line["points"]]
        if line["closed"]:
            pts.append(pts[0])
        draw.line(pts, fill=(0, 170, 90, 200), width=max(2, round(2 * zoom)))
    for edge in site_map["edges"]:
        colour = (0, 120, 255, 200) if edge["style"] == "line" else (170, 60, 220, 200)
        draw.line(
            [px[edge["from"]], px[edge["to"]]],
            fill=colour,
            width=max(2, round(2 * zoom)),
        )
    r = max(3, round(3.5 * zoom))
    for node in site_map["nodes"]:
        x, y = px[node["id"]]
        fill = NODE_COLOURS.get(node["type"], "#007aff")
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline="white")
        draw.text((x + r + 1, y - r - 2), node["id"], fill=(200, 30, 30, 255), font=label)
    image.save(args.out)
    print(f"{args.out}: {image.width}x{image.height}", file=out)
    return 0


def cmd_push(args: argparse.Namespace, out: TextIO) -> int:
    """Create or replace the site's map through the admin API and make it the default."""
    trace = load(args.trace)
    site_map = build_map(trace)
    jar = session_cookie(args.cookies)
    site_id = trace["site_id"]
    saved = push_map(args.base, jar, site_id, site_map, args.note, args.map_id)
    map_id = saved["id"]
    set_default_map(args.base, jar, site_id, map_id)
    print(
        f"saved {map_id} revision {saved['revision']}; default_map of {site_id} set",
        file=out,
    )
    return 0


def register(commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add the ``stickmap`` subcommand with its own sub-subcommands."""
    parser = commands.add_parser(
        "stickmap",
        help="trace a scanned cave map into a drawn stick map",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="tool_command", required=True)

    grid = sub.add_parser("grid", help="overlay a labelled pixel grid on an image")
    grid.add_argument("image")
    grid.add_argument("out")
    grid.add_argument("--step", type=int, default=50, help="major grid spacing in source pixels")
    grid.add_argument("--crop", help="x0,y0,x1,y1 in source pixels")
    grid.add_argument("--zoom", type=float, default=1, help="enlarge the (cropped) image")
    grid.set_defaults(run=cmd_grid)

    build = sub.add_parser("build", help="convert a trace into site-map JSON")
    build.add_argument("trace")
    build.add_argument("out")
    build.set_defaults(run=cmd_build)

    overlay = sub.add_parser("overlay", help="draw the built map over the source image")
    overlay.add_argument("trace")
    overlay.add_argument("out")
    overlay.add_argument("--zoom", type=float, default=1)
    overlay.set_defaults(run=cmd_overlay)

    push = sub.add_parser("push", help="save the map through the admin API")
    push.add_argument("trace")
    push.add_argument("--cookies", required=True, help="Netscape cookie jar with an admin session")
    push.add_argument("--base", default=default_api())
    push.add_argument("--map-id", help="replace this existing map instead of creating one")
    push.add_argument("--note", default="Traced from the reference map")
    push.set_defaults(run=cmd_push)
