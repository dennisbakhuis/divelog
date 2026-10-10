"""``divelog commons pull``: fast-forward the commons checkout and pin the log to it."""

import argparse
from pathlib import Path
from typing import TextIO

from divelog_server.core.config import get_settings
from divelog_server.store.commons_sync import PullError, pull
from divelog_server.store.proposals import split_author


def register(commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add ``commons pull`` to the top-level commands."""
    commons = commands.add_parser("commons", help="follow the site commons")
    commons_commands = commons.add_subparsers(dest="commons_command", required=True)
    parser = commons_commands.add_parser(
        "pull", help="git pull --ff-only the commons, pin divelog.yaml, list stale sites"
    )
    parser.add_argument("--log", type=Path, help="log repository (default: DATA_ROOT)")
    parser.add_argument("--commons", type=Path, help="commons checkout (default: divelog.yaml)")
    parser.add_argument("--ref", help="pin this commit instead of the new head")
    parser.add_argument("--author", help="commit author (default: OWNER_NAME)")
    parser.set_defaults(run=run)


def run(args: argparse.Namespace, out: TextIO) -> int:
    """Pull, pin, commit the log, and print the sites that became stale."""
    settings = get_settings()
    log_root: Path = args.log or Path(settings.DATA_ROOT)
    email = settings.GIT_AUTHOR_EMAIL or settings.OWNER_EMAIL or "divelog@localhost"
    name, email = split_author(args.author, settings.OWNER_NAME, email)
    try:
        result = pull(log_root, args.commons, args.ref, author=name, email=email)
    except PullError as exc:
        print(exc, file=out)
        return 1
    moved = (
        f"{result.previous} -> {result.head}" if result.previous != result.head else "up to date"
    )
    print(f"commons {moved}", file=out)
    if result.pinned:
        committed = ", committed" if result.committed else ""
        print(f"divelog.yaml pinned at {result.head}{committed}", file=out)
    new = [s for s in result.stale if s.new]
    print(f"{len(new)} sites became stale, {len(result.stale)} stale in all", file=out)
    for site in result.stale:
        pinned = site.pinned_revision if site.pinned_revision is not None else "?"
        flag = " (new)" if site.new else ""
        print(
            f"  {site.site_id:<36} {site.origin:<8} {pinned}/{site.current_revision}{flag}",
            file=out,
        )
    return 0
