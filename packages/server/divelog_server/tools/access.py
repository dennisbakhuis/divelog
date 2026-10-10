"""Give sites a road-side access point as well as their own position.

A cenote or resurgence is often kilometres down an unsigned track, so the coordinate you dive
at is not the one you navigate to. The access point is the junction on the nearest paved road.
The points come from a JSON file of ``site_id -> {lat, lon, note?, road?, km?}`` (for example
from an OpenStreetMap road-network query); without a note one is written from ``road`` and
``km``. Each changed site file gets the ``access`` field and a new revision. Overlays of commons
sites are skipped: the access point is an objective field and belongs in the commons.
"""

import argparse
import json
from pathlib import Path
from typing import Any, TextIO

from divelog_server.core.config import get_settings
from divelog_server.store.files import read_markdown, write_markdown
from divelog_server.store.log_repo import frontmatter
from divelog_server.store.models import AccessPoint, SiteRecord
from divelog_server.tools.common import log_root

ROADSIDE_KM = 0.25
CHANGE_NOTE = "Road-side access point"


def register(site_commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add ``sites access`` to the ``sites`` subcommands."""
    parser = site_commands.add_parser(
        "access",
        help="write road-side access points into site files",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("points", type=Path, help="JSON: site_id -> {lat, lon, note?, road?, km?}")
    parser.add_argument("--log", type=Path, help="log or commons repository (default: DATA_ROOT)")
    parser.add_argument("--author", help="changelog author (default OWNER_NAME)")
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    parser.set_defaults(run=run)


def access_note(point: dict[str, Any]) -> str | None:
    """The point's own note, or one written from the road name and the track length."""
    if point.get("note"):
        return str(point["note"])
    road = point.get("road")
    km = point.get("km")
    if not road or km is None:
        return None
    if float(km) >= ROADSIDE_KM:
        return (
            f"Turn off {road} here; the site is about {float(km):.1f} km further "
            "on an unpaved track."
        )
    return f"Roadside on {road}."


def access_point(point: dict[str, Any]) -> AccessPoint:
    """The ``access`` value of a site for one entry of the points file."""
    return AccessPoint(lat=float(point["lat"]), lon=float(point["lon"]), note=access_note(point))


def apply_access(
    root: Path, points: dict[str, dict[str, Any]], author: str | None, dry_run: bool
) -> dict[str, list[str]]:
    """Write the access points; the site ids by outcome (written, unchanged, skipped)."""
    outcome: dict[str, list[str]] = {"written": [], "unchanged": [], "skipped": []}
    for site_id, point in sorted(points.items()):
        path = root / "sites" / f"{site_id}.md"
        if not path.is_file():
            outcome["skipped"].append(f"{site_id}: no sites/{site_id}.md")
            continue
        meta, body = read_markdown(path)
        if meta.get("extends"):
            outcome["skipped"].append(f"{site_id}: overlay of a commons site")
            continue
        record = SiteRecord.model_validate(meta)
        access = access_point(point)
        if record.access == access:
            outcome["unchanged"].append(site_id)
            continue
        record.access = access
        record.bump(CHANGE_NOTE, author)
        if not dry_run:
            write_markdown(path, frontmatter(record), body)
        outcome["written"].append(site_id)
    return outcome


def run(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog sites access``: write each point into its site file."""
    points = json.loads(args.points.read_text(encoding="utf-8"))
    if not isinstance(points, dict):
        print(f"{args.points}: expected a JSON object of site id -> point", file=out)
        return 1
    author = args.author or get_settings().OWNER_NAME
    outcome = apply_access(log_root(args.log), points, author, args.dry_run)
    verb = "would write" if args.dry_run else "written"
    print(f"access points {verb}: {len(outcome['written'])}", file=out)
    for site_id in outcome["written"]:
        point = points[site_id]
        km = f"{float(point['km']):5.2f} km off {point.get('road', '?')}" if "km" in point else ""
        print(f"  {site_id:28s} {km}".rstrip(), file=out)
    if outcome["unchanged"]:
        print(f"unchanged: {len(outcome['unchanged'])}", file=out)
    for reason in outcome["skipped"]:
        print(f"skipped {reason}", file=out)
    return 0
