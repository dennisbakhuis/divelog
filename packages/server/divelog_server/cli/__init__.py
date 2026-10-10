"""The ``divelog`` command line: validate repositories, export schemas, split and inspect sites."""

import argparse
import json
import sys
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import TextIO

from pydantic import BaseModel

from divelog_server.core.config import get_settings
from divelog_server.store.manifest import (
    Manifest,
    MediaManifestEntry,
    commons_root_for,
    read_manifest,
)
from divelog_server.store.models import RegionRecord, SiteCore, SiteMapRecord, SiteOverlayRecord
from divelog_server.store.sources import CommonsSource
from divelog_server.store.split import (
    MAP_RIGHTS,
    SplitError,
    SplitOptions,
    render_report,
    run_split,
)
from divelog_server.store.store import Store
from divelog_server.store.validate import Problem, validate_commons, validate_log

SCHEMAS: dict[str, type[BaseModel]] = {
    "site-core": SiteCore,
    "site-overlay": SiteOverlayRecord,
    "site-map": SiteMapRecord,
    "region": RegionRecord,
    "media-manifest-entry": MediaManifestEntry,
    "divelog-manifest": Manifest,
}


def build_parser() -> argparse.ArgumentParser:
    """The argument parser of every subcommand."""
    parser = argparse.ArgumentParser(prog="divelog", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("validate", help="validate a log or commons repository")
    validate.add_argument("--kind", choices=("log", "sites"), help="default: divelog.yaml kind")
    validate.add_argument("root", type=Path)

    schema = commands.add_parser("schema", help="JSON Schema of the data files")
    schema_commands = schema.add_subparsers(dest="schema_command", required=True)
    export = schema_commands.add_parser("export", help="write <dir>/v1/*.json")
    export.add_argument("dir", type=Path)

    sites = commands.add_parser("sites", help="site commons tooling")
    site_commands = sites.add_subparsers(dest="sites_command", required=True)
    split = site_commands.add_parser("split", help="split a log into a commons and overlays")
    split.add_argument("--to", type=Path, required=True, help="the new commons repository")
    split.add_argument("--dry-run", action="store_true", help="print the report, write nothing")
    split.add_argument("--map-rights", choices=MAP_RIGHTS, default="underlay")
    split.add_argument("--keep-personal", default="", help="map ids that stay personal, a,b,c")
    split.add_argument("--author", help="changelog and commit author (default OWNER_NAME)")
    split.add_argument("--no-git", action="store_true", help="do not git init and commit")
    split.add_argument("log_root", type=Path)
    status = site_commands.add_parser("status", help="origin, revision and pin of every site")
    status.add_argument("log_root", type=Path)
    return parser


def main(argv: Sequence[str] | None = None, out: TextIO | None = None) -> int:
    """Run one ``divelog`` command; returns the exit code."""
    args = build_parser().parse_args(argv)
    stream = out or sys.stdout
    if args.command == "validate":
        return cmd_validate(args.root, args.kind, stream)
    if args.command == "schema":
        return cmd_schema_export(args.dir, stream)
    if args.sites_command == "split":
        keep = frozenset(i.strip() for i in args.keep_personal.split(",") if i.strip())
        settings = get_settings()
        options = SplitOptions(
            log_root=args.log_root,
            to=args.to,
            map_rights=args.map_rights,
            keep_personal=keep,
            author=args.author or settings.OWNER_NAME,
            author_email=settings.GIT_AUTHOR_EMAIL or settings.OWNER_EMAIL,
            git=not args.no_git,
        )
        return cmd_split(options, args.dry_run, stream)
    return cmd_status(args.log_root, stream)


def print_problems(problems: list[Problem], out: TextIO) -> int:
    """Print each problem as ``path: message``; 1 when there are any."""
    for problem in problems:
        print(problem, file=out)
    return 1 if problems else 0


def cmd_validate(root: Path, kind: str | None, out: TextIO) -> int:
    """``divelog validate``: every problem of the repository, exit 1 on any."""
    try:
        manifest = read_manifest(root)
    except ValueError as exc:
        print(f"divelog.yaml: {exc}", file=out)
        return 1
    kind = kind or (manifest.kind if manifest else "log")
    if kind == "sites":
        problems = validate_commons(root)
    else:
        problems = validate_log(root, commons_root_for(root, manifest))
    code = print_problems(problems, out)
    if not code:
        print(f"{root}: valid {kind} repository", file=out)
    return code


def cmd_schema_export(target: Path, out: TextIO) -> int:
    """``divelog schema export``: the JSON Schemas into ``<dir>/v1``."""
    folder = target / "v1"
    folder.mkdir(parents=True, exist_ok=True)
    for name, model in SCHEMAS.items():
        path = folder / f"{name}.json"
        schema = model.model_json_schema()
        path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(path, file=out)
    return 0


def cmd_split(options: SplitOptions, dry_run: bool, out: TextIO) -> int:
    """``divelog sites split``: write the commons, rewrite the log, verify the result."""
    try:
        result = run_split(options, dry_run=dry_run)
    except SplitError as exc:
        print(exc, file=out)
        return 1
    if dry_run:
        print(render_report(result.plan), file=out)
    if result.problems:
        stage = {
            "dry-run": "the staged commons would not validate",
            "commons": f"the commons at {options.to} does not validate; the log is untouched",
            "done": "the split result does not load cleanly",
        }[result.stage]
        print(f"split failed: {stage}", file=out)
        return print_problems(result.problems, out)
    if not dry_run:
        plan = result.plan
        print(
            f"split {len(plan.exported)} sites into {options.to}"
            f" ({len(plan.kept)} kept personal, {len(plan.renames)} maps renamed)"
            + (f", commons at {result.head}" if result.head else ""),
            file=out,
        )
        print(f"report: {options.to / 'IMPORT-REPORT.md'}", file=out)
    return 0


def cmd_status(log_root: Path, out: TextIO) -> int:
    """``divelog sites status``: origin, revision, pin and staleness of every site."""
    try:
        manifest = read_manifest(log_root)
    except ValueError as exc:
        print(f"divelog.yaml: {exc}", file=out)
        return 1
    commons_root = commons_root_for(log_root, manifest)
    store = Store(log_root, commons=CommonsSource(commons_root) if commons_root else None)
    store.load()
    origins: Counter[str] = Counter()
    stale = 0
    print(f"{'site':<36} {'origin':<8} {'rev':>4}  {'pin':<9} stale", file=out)
    for site_id in sorted(store.sites):
        origin = store.site_origin.get(site_id, "log")
        origins[origin] += 1
        pin = store.site_pin_state(site_id)
        pinned = "–"
        flag = ""
        if pin is not None:
            pinned = f"{pin.pinned_revision or '?'}/{pin.current_revision}"
            if pin.stale:
                stale += 1
                flag = "stale"
        revision = store.sites[site_id].revision
        print(f"{site_id:<36} {origin:<8} {revision:>4}  {pinned:<9} {flag}", file=out)
    counts = ", ".join(f"{origins[o]} {o}" for o in ("log", "commons", "fork"))
    print(f"{len(store.sites)} sites: {counts}; {stale} stale", file=out)
    return 0
