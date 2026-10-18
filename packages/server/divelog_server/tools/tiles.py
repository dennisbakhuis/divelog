"""Build the self-hosted basemap tiles for the site locator maps.

Dive sites are grouped into geographic clusters and one PMTiles archive is cut per cluster from
the daily Protomaps planet build with the ``pmtiles`` CLI (``brew install pmtiles``, or the
release binary from github.com/protomaps/go-pmtiles). The archives and ``index.json`` land in
``<media>/tiles/`` and are served at ``/media/tiles/``: the browser picks the archive whose
bounds contain the site. A single low-zoom planet archive (``world.pmtiles``, z0-7, ~190 MB)
backs the globe on the dive overview. Fonts and sprites live next to them under
``tiles/assets/`` (from github.com/protomaps/basemaps-assets).

The sites are those of the merged view of the log and its commons that have an exact,
publishable position and either have dives or are personal (not commons-only)::

    divelog tiles --log ~/divelog-data --media /data/media [--dry-run] [--upload]

Only archives whose cluster changed are rebuilt. ``--upload`` pushes ``tiles/`` to the S3 bucket
of the server configuration (``S3_*``). Data is © OpenStreetMap contributors (ODbL); the
Protomaps basemap tiles carry that attribution on every map.
"""

import argparse
import asyncio
import json
import math
import shutil
import subprocess
from datetime import date, timedelta
from pathlib import Path
from typing import Any, TextIO
from urllib.request import Request, urlopen

from divelog_server.core.config import get_settings
from divelog_server.store.commons_sync import PullError
from divelog_server.store.files import write_json
from divelog_server.store.store import Store
from divelog_server.tools.common import log_root, open_store

BUILDS = "https://build.protomaps.com/{stamp}.pmtiles"
LINK_KM = 50.0
PAD_DEG = 0.12
DENSE_TILES = 20_000
MAX_ZOOM = 15
DENSE_MAX_ZOOM = 14
WORLD_FILE = "world.pmtiles"
WORLD_MAX_ZOOM = 7

Site = tuple[str, float, float]
BBox = tuple[float, float, float, float]


def register(commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add the ``tiles`` subcommand."""
    parser = commands.add_parser(
        "tiles",
        help="build the PMTiles basemaps for the locator maps",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--log", type=Path, help="log repository (default: env DATA_ROOT)")
    parser.add_argument(
        "--commons",
        type=Path,
        help="commons checkout (default: env COMMONS_ROOT, then divelog.yaml)",
    )
    parser.add_argument("--media", type=Path, help="media directory (default: env MEDIA_ROOT)")
    parser.add_argument("--build", help="Protomaps build stamp, e.g. 20260926 (default: latest)")
    parser.add_argument("--dry-run", action="store_true", help="only report cluster sizes")
    parser.add_argument("--force", action="store_true", help="rebuild unchanged clusters too")
    parser.add_argument("--upload", action="store_true", help="push tiles/ to the S3 bucket")
    parser.set_defaults(run=run)


def placed_sites(store: Store) -> list[Site]:
    """(site_id, lat, lon) of every exact, placed site that has dives or is personal."""
    out = []
    for site_id in sorted(store.sites):
        site = store.sites[site_id]
        if site.location_visibility != "exact" or site.lat is None or site.lon is None:
            continue
        personal = store.site_origin.get(site_id, "log") != "commons"
        if not personal and not store.dives_by_site.get(site_id):
            continue
        out.append((site_id, float(site.lat), float(site.lon)))
    return out


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = phi2 - phi1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def cluster(sites: list[Site]) -> list[list[Site]]:
    """Union sites that lie within LINK_KM of each other; each component becomes one archive."""
    parent = list(range(len(sites)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(sites)):
        for j in range(i + 1, len(sites)):
            if haversine_km(sites[i][1], sites[i][2], sites[j][1], sites[j][2]) <= LINK_KM:
                parent[find(i)] = find(j)
    groups: dict[int, list[Site]] = {}
    for i, site in enumerate(sites):
        groups.setdefault(find(i), []).append(site)
    return sorted(groups.values(), key=lambda g: (-len(g), g[0][0]))


def bbox_of(group: list[Site]) -> BBox:
    """Padded (minlon, minlat, maxlon, maxlat) around a cluster."""
    lats = [s[1] for s in group]
    lons = [s[2] for s in group]
    pad_lon = PAD_DEG / max(0.2, math.cos(math.radians(sum(lats) / len(lats))))
    return (
        round(min(lons) - pad_lon, 4),
        round(min(lats) - PAD_DEG, 4),
        round(max(lons) + pad_lon, 4),
        round(max(lats) + PAD_DEG, 4),
    )


def tile_count(bbox: BBox, zoom: int) -> int:
    """Number of web-mercator tiles a bbox covers at one zoom level."""

    def tile_x(lon: float) -> int:
        return int((lon + 180) / 360 * 2**zoom)

    def tile_y(lat: float) -> int:
        rad = math.radians(lat)
        return int((1 - math.log(math.tan(rad) + 1 / math.cos(rad)) / math.pi) / 2 * 2**zoom)

    return (tile_x(bbox[2]) - tile_x(bbox[0]) + 1) * (tile_y(bbox[1]) - tile_y(bbox[3]) + 1)


def slug_for(group: list[Site]) -> str:
    """A stable archive name: the country prefix plus the alphabetically first site."""
    ids = sorted(s[0] for s in group)
    countries = sorted({s.split("-", 1)[0] for s in ids})
    return "-".join(countries) + "-" + ids[0].split("-", 1)[-1]


def latest_build() -> str:
    """The most recent daily planet build that actually exists."""
    today = date.today()
    for back in range(0, 10):
        stamp = (today - timedelta(days=back)).strftime("%Y%m%d")
        request = Request(BUILDS.format(stamp=stamp), method="HEAD")
        try:
            with urlopen(request, timeout=30) as response:
                if response.status == 200:
                    return stamp
        except OSError:
            continue
    raise SystemExit("no recent Protomaps build found at build.protomaps.com")


def extract(build: str, target: Path, bbox: BBox | None, zoom: int) -> None:
    """Cut one archive from the planet build; no bbox means the whole planet up to ``zoom``."""
    target.parent.mkdir(parents=True, exist_ok=True)
    command = ["pmtiles", "extract", BUILDS.format(stamp=build), str(target), f"--maxzoom={zoom}"]
    if bbox is not None:
        command.append(f"--bbox={','.join(str(v) for v in bbox)}")
    subprocess.run(command, check=True)


def world_entry(
    previous: dict[str, Any] | None, tiles: Path, build: str | None, force: bool, out: TextIO
) -> dict[str, Any]:
    """The planet archive behind the globe, rebuilt only when missing, outdated or forced."""
    entry: dict[str, Any] = {"file": WORLD_FILE, "maxzoom": WORLD_MAX_ZOOM, "build": build}
    tiles_total = (4 ** (WORLD_MAX_ZOOM + 1) - 1) // 3
    print(f"{WORLD_FILE:40} planet     z{WORLD_MAX_ZOOM}  ~{tiles_total:>6} tiles", file=out)
    if build is None:
        return entry
    if (
        not force
        and previous
        and previous.get("maxzoom") == WORLD_MAX_ZOOM
        and (tiles / WORLD_FILE).exists()
    ):
        entry["build"] = previous.get("build")
        return entry
    extract(build, tiles / WORLD_FILE, None, WORLD_MAX_ZOOM)
    return entry


def upload(media: Path, out: TextIO) -> None:
    """Push every file under ``<media>/tiles`` to the configured S3 bucket."""
    from divelog_server.services.storage import S3Storage, guess_content_type

    storage = S3Storage()
    files = sorted(p for p in (media / "tiles").rglob("*") if p.is_file())

    async def push() -> None:
        for path in files:
            key = str(path.relative_to(media))
            print(f"  put {key}", file=out)
            await storage.put(key, path.read_bytes(), guess_content_type(key))

    asyncio.run(push())


def plan_archives(sites: list[Site], build: str | None) -> list[tuple[list[Site], dict[str, Any]]]:
    """Each cluster with its index entry: file name, bbox, zoom and site ids."""
    planned = []
    for group in cluster(sites):
        bbox = bbox_of(group)
        zoom = DENSE_MAX_ZOOM if tile_count(bbox, MAX_ZOOM) > DENSE_TILES else MAX_ZOOM
        entry: dict[str, Any] = {
            "file": f"{slug_for(group)}.pmtiles",
            "bbox": list(bbox),
            "maxzoom": zoom,
            "sites": sorted(s[0] for s in group),
            "build": build,
        }
        planned.append((group, entry))
    return planned


def run(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog tiles``: cluster the sites, cut the changed archives, write ``index.json``."""
    media = args.media or Path(get_settings().MEDIA_ROOT)
    tiles = media / "tiles"
    index_path = tiles / "index.json"
    previous: dict[str, dict[str, Any]] = {}
    previous_world = None
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
        previous = {e["file"]: e for e in index.get("archives", [])}
        previous_world = index.get("world")

    if not args.dry_run and shutil.which("pmtiles") is None:
        print("the pmtiles CLI is not on PATH (github.com/protomaps/go-pmtiles)", file=out)
        return 1
    try:
        store = open_store(log_root(args.log), args.commons)
    except PullError as exc:
        print(exc, file=out)
        return 1
    sites = placed_sites(store)
    build = args.build or (None if args.dry_run else latest_build())
    world = world_entry(previous_world, tiles, build, args.force, out)
    archives = []
    for group, entry in plan_archives(sites, build):
        name, zoom = entry["file"], entry["maxzoom"]
        bbox = bbox_of(group)
        print(
            f"{name:40} {len(group):3} sites  z{zoom}  ~{tile_count(bbox, zoom):>6} tiles",
            file=out,
        )
        if args.dry_run:
            archives.append(entry)
            continue
        unchanged = previous.get(name)
        if (
            not args.force
            and unchanged
            and unchanged.get("bbox") == entry["bbox"]
            and unchanged.get("maxzoom") == zoom
            and (tiles / name).exists()
        ):
            entry["build"] = unchanged.get("build")
            archives.append(entry)
            continue
        assert build is not None
        extract(build, tiles / name, bbox, zoom)
        archives.append(entry)

    if args.dry_run:
        return 0
    for stale in set(previous) - {a["file"] for a in archives}:
        (tiles / stale).unlink(missing_ok=True)
        print(f"removed {stale}", file=out)
    write_json(
        index_path,
        {
            "note": (
                "Basemap archives cut from the Protomaps planet build by `divelog tiles`. "
                "© OpenStreetMap contributors (ODbL); served at /media/tiles/."
            ),
            "attribution": "© OpenStreetMap contributors · Protomaps",
            "world": world,
            "archives": archives,
        },
    )
    print(f"{len(archives)} archives + {WORLD_FILE} in {tiles}", file=out)
    if args.upload:
        upload(media, out)
    return 0
