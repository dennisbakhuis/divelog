"""Render drawn maps to PNG for review, and list the maps a change touched.

``divelog maps render <map-id | path> --out map.png`` draws a map JSON with Pillow alone: areas
filled, lines, edges between nodes, node dots with labels, a north arrow and, for maps drawn to
scale, a scale bar. The output is 1600 px wide on white and byte-for-byte the same on every run,
so commons CI can attach it to a pull request. ``divelog maps changed --base <ref>`` prints the
ids of the drawn maps that differ from a git ref.
"""

import argparse
import json
import math
import unicodedata
from collections.abc import Iterable
from functools import cache
from pathlib import Path
from typing import TextIO

from PIL import Image, ImageDraw, ImageFont
from pydantic import ValidationError

from divelog_server.store.files import read_json
from divelog_server.store.gitfiles import GitFilesError, GitTree
from divelog_server.store.models import SiteMapRecord

WIDTH = 1600
MARGIN = 90
HEADER = 70
MIN_HEIGHT = 500
MAX_HEIGHT = 2400
DRAWN = Path("maps") / "drawn"

Point = tuple[float, float]
Colour = tuple[int, int, int]

AREA_FILL: dict[str, Colour] = {
    "outline": (214, 234, 248),
    "depth": (174, 206, 232),
    "shallows": (226, 242, 246),
    "coral": (247, 204, 196),
    "sand": (246, 234, 200),
    "wall": (200, 200, 200),
    "wreck": (190, 175, 160),
    "reeds": (205, 228, 190),
    "other": (225, 225, 225),
}
LINE_COLOUR: dict[str, Colour] = {
    "shoreline": (60, 90, 120),
    "depth": (90, 140, 190),
    "path": (210, 110, 30),
    "wall": (110, 110, 110),
    "pipe": (140, 100, 60),
    "line": (40, 40, 40),
}
EDGE_COLOUR: dict[str, Colour] = {
    "line": (20, 20, 20),
    "jump": (210, 120, 20),
    "unsurveyed": (150, 150, 150),
    "route": (30, 100, 200),
}
NODE_COLOUR: dict[str, Colour] = {
    "entrance": (20, 140, 60),
    "end": (190, 30, 30),
    "restriction": (200, 120, 0),
    "air": (40, 160, 220),
    "hazard": (200, 30, 30),
    "entry": (20, 140, 60),
}
INK: Colour = (25, 25, 25)
MUTED: Colour = (110, 110, 110)


@cache
def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Pillow's bundled default font at ``size`` (the bitmap font without FreeType)."""
    return ImageFont.load_default(size=size)


def plain(text: str) -> str:
    """``text`` without accents: the bundled font has no glyphs for most accented letters."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def hex_colour(value: str) -> Colour:
    """The RGB tuple of a ``#rrggbb`` colour."""
    return (int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16))


def map_points(record: SiteMapRecord) -> list[Point]:
    """Every coordinate the drawing uses: nodes, area outlines and line vertices."""
    points = [(n.x, n.y) for n in record.nodes]
    for area in record.areas:
        points += [(p.x, p.y) for p in area.points]
    for line in record.lines:
        points += [(p.x, p.y) for p in line.points]
    return points


class Frame:
    """Map metres to image pixels: the drawing's bounding box fitted into the canvas."""

    def __init__(self, points: list[Point]) -> None:
        xs = [p[0] for p in points] or [0.0]
        ys = [p[1] for p in points] or [0.0]
        self.min_x, self.min_y = min(xs), min(ys)
        span_x = max(max(xs) - self.min_x, 1.0)
        span_y = max(max(ys) - self.min_y, 1.0)
        inner = WIDTH - 2 * MARGIN
        self.scale = inner / span_x
        tallest = MAX_HEIGHT - HEADER - 2 * MARGIN
        if span_y * self.scale > tallest:
            self.scale = tallest / span_y
        drawn_height = span_y * self.scale if points else 0.0
        self.height = max(MIN_HEIGHT, round(HEADER + 2 * MARGIN + drawn_height))
        self.offset_x = (WIDTH - span_x * self.scale) / 2
        self.offset_y = HEADER + (self.height - HEADER - drawn_height) / 2

    def px(self, x: float, y: float) -> Point:
        """The pixel position of map point ``(x, y)``."""
        return (
            round(self.offset_x + (x - self.min_x) * self.scale, 2),
            round(self.offset_y + (y - self.min_y) * self.scale, 2),
        )


def dashed(draw: ImageDraw.ImageDraw, a: Point, b: Point, colour: Colour, width: int) -> None:
    """A dashed segment from ``a`` to ``b``."""
    length = math.dist(a, b)
    if length == 0:
        return
    dash, gap = 12.0, 8.0
    ux, uy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
    position = 0.0
    while position < length:
        end = min(position + dash, length)
        start_point = (a[0] + ux * position, a[1] + uy * position)
        end_point = (a[0] + ux * end, a[1] + uy * end)
        draw.line([start_point, end_point], fill=colour, width=width)
        position = end + gap


def nice_length(target: float) -> float:
    """The largest 1, 2 or 5 times a power of ten not above ``target`` (metres)."""
    if target <= 0:
        return 1.0
    power = 10 ** math.floor(math.log10(target))
    return max(step * power for step in (1, 2, 5) if step * power <= target)


def centre(points: Iterable[Point]) -> Point:
    """The mean of ``points``."""
    listed = list(points)
    return (sum(p[0] for p in listed) / len(listed), sum(p[1] for p in listed) / len(listed))


def draw_north(draw: ImageDraw.ImageDraw, north: float) -> None:
    """An arrow in the top right corner pointing to north, ``north`` degrees clockwise from up."""
    cx, cy, size = WIDTH - MARGIN / 2 - 10, HEADER + 40, 30.0
    angle = math.radians(north)
    tip = (cx + size * math.sin(angle), cy - size * math.cos(angle))
    tail = (cx - size * math.sin(angle), cy + size * math.cos(angle))
    left = (cx + 10 * math.sin(angle - math.pi / 2), cy - 10 * math.cos(angle - math.pi / 2))
    right = (cx + 10 * math.sin(angle + math.pi / 2), cy - 10 * math.cos(angle + math.pi / 2))
    draw.polygon([tip, left, tail, right], outline=INK, fill=(255, 255, 255))
    draw.polygon([tip, left, (cx, cy), right], fill=INK)
    label = (cx + (size + 14) * math.sin(angle), cy - (size + 14) * math.cos(angle))
    draw.text(label, "N", fill=INK, font=font(18), anchor="mm")


def draw_scale(draw: ImageDraw.ImageDraw, frame: Frame) -> None:
    """A scale bar in the bottom left corner, about a fifth of the canvas wide."""
    metres = nice_length((WIDTH - 2 * MARGIN) / 5 / frame.scale)
    length = metres * frame.scale
    x, y = MARGIN, frame.height - MARGIN / 2
    draw.line([(x, y), (x + length, y)], fill=INK, width=4)
    for tick in (x, x + length):
        draw.line([(tick, y - 8), (tick, y + 8)], fill=INK, width=3)
    text = f"{metres:g} m"
    draw.text((x + length / 2, y - 12), text, fill=INK, font=font(16), anchor="mb")


def render(record: SiteMapRecord) -> Image.Image:
    """The drawn map as an RGB image, 1600 px wide."""
    frame = Frame(map_points(record))
    image = Image.new("RGB", (WIDTH, frame.height), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    for area in record.areas:
        if len(area.points) >= 3:
            outline = [frame.px(p.x, p.y) for p in area.points]
            fill = AREA_FILL.get(area.kind, AREA_FILL["other"])
            draw.polygon(outline, fill=fill, outline=MUTED)
    for line in record.lines:
        if len(line.points) >= 2:
            points = [frame.px(p.x, p.y) for p in line.points]
            if line.closed:
                points.append(points[0])
            colour = LINE_COLOUR.get(line.kind, INK)
            draw.line(points, fill=colour, width=3, joint="curve")
    nodes = {n.id: n for n in record.nodes}
    for edge in record.edges:
        start, end = nodes.get(edge.from_), nodes.get(edge.to)
        if start is None or end is None:
            continue
        a, b = frame.px(start.x, start.y), frame.px(end.x, end.y)
        colour = EDGE_COLOUR.get(edge.style, INK)
        if edge.style in ("jump", "unsurveyed"):
            dashed(draw, a, b, colour, 3)
        else:
            draw.line([a, b], fill=colour, width=4 if edge.style == "line" else 3)
    labels = font(16)
    for area in record.areas:
        if area.label and area.points:
            x, y = frame.px(*centre((p.x, p.y) for p in area.points))
            draw.text((x, y), plain(area.label), fill=MUTED, font=labels, anchor="mm")
    for line in record.lines:
        if line.label and line.points:
            middle = line.points[len(line.points) // 2]
            draw.text(frame.px(middle.x, middle.y), plain(line.label), fill=MUTED, font=labels)
    for node in record.nodes:
        x, y = frame.px(node.x, node.y)
        radius = 9 if node.type in ("entrance", "entry") else 6
        colour = NODE_COLOUR.get(node.type, INK)
        if node.color:
            colour = hex_colour(node.color)
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=colour, outline=INK)
        if node.label:
            draw.text((x + radius + 4, y - radius - 4), plain(node.label), fill=INK, font=labels)
    title = record.title or record.id
    draw.text((MARGIN / 2, HEADER / 2), plain(title), fill=INK, font=font(28), anchor="lm")
    detail = f"{record.id} · revision {record.revision} · {record.kind}"
    draw.text((WIDTH - MARGIN / 2, HEADER / 2), detail, fill=MUTED, font=font(16), anchor="rm")
    draw_north(draw, record.north)
    if record.to_scale:
        draw_scale(draw, frame)
    return image


def render_png(record: SiteMapRecord, out: Path) -> None:
    """Write the rendered map to ``out`` as a PNG without metadata."""
    out.parent.mkdir(parents=True, exist_ok=True)
    render(record).save(out, format="PNG")


def resolve_map(spec: str, root: Path) -> Path:
    """A map file: ``spec`` itself when it is a file, else ``<root>/maps/drawn/<spec>.json``."""
    path = Path(spec)
    if path.is_file():
        return path
    return root / DRAWN / f"{spec}.json"


def changed_maps(root: Path, base: str) -> list[str]:
    """Ids of the drawn maps under ``root`` that are new or differ from git ``base``.

    Raises
    ------
    GitFilesError
        ``root`` is not in a git repository or ``base`` is unknown.
    """
    tree = GitTree(root, base)
    prefix = f"{DRAWN.as_posix()}/"
    before = tree.read(p for p in tree.paths() if p.startswith(prefix) and p.endswith(".json"))
    changed = []
    for path in sorted((root / DRAWN).glob("*.json")):
        relative = f"{prefix}{path.name}"
        old = before.get(relative)
        try:
            same = old is not None and json.loads(old) == read_json(path)
        except ValueError:
            same = False
        if not same:
            changed.append(path.stem)
    return changed


def cmd_render(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog maps render``: one map JSON to a PNG."""
    path = resolve_map(args.map, args.root)
    if not path.is_file():
        print(f"{path}: no such map", file=out)
        return 1
    try:
        record = SiteMapRecord.model_validate(read_json(path))
    except (ValueError, ValidationError) as exc:
        print(f"{path}: {exc}", file=out)
        return 1
    render_png(record, args.out)
    print(args.out, file=out)
    return 0


def cmd_changed(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog maps changed``: the ids of the maps changed since ``--base``, one per line."""
    try:
        ids = changed_maps(args.root, args.base)
    except GitFilesError as exc:
        print(f"base {args.base!r}: {exc}", file=out)
        return 1
    for map_id in ids:
        print(map_id, file=out)
    return 0


def register(commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add the ``maps render`` and ``maps changed`` subcommands."""
    parser = commands.add_parser("maps", help="render drawn maps, list changed maps")
    maps_commands = parser.add_subparsers(dest="maps_command", required=True)
    render_parser = maps_commands.add_parser("render", help="draw one map as a PNG")
    render_parser.add_argument("map", help="map id (under --root) or a map JSON file")
    render_parser.add_argument("--out", type=Path, required=True, help="PNG file to write")
    render_parser.add_argument("--root", type=Path, default=Path("."), help="commons checkout")
    render_parser.set_defaults(run=cmd_render)
    changed = maps_commands.add_parser("changed", help="ids of maps changed since a git ref")
    changed.add_argument("--base", required=True, help="git ref to compare with")
    changed.add_argument("--root", type=Path, default=Path("."), help="commons checkout")
    changed.set_defaults(run=cmd_changed)
