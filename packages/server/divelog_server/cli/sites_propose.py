"""``divelog sites propose`` and ``sites adopt``: send a site to the commons and take it back."""

import argparse
from pathlib import Path
from typing import TextIO

from divelog_server.core.config import get_settings
from divelog_server.store.commons_sync import PullError, resolve_commons
from divelog_server.store.proposals import (
    AdoptError,
    ProposeError,
    ProposeOptions,
    adopt_site,
    adoptable,
    commit_all,
    is_git_repo,
    load_merged,
    log_name,
    next_steps,
    render_adopt,
    render_plan,
    run_propose,
    split_author,
)


def register(site_commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add ``sites propose`` and ``sites adopt`` to the ``sites`` subcommands."""
    propose = site_commands.add_parser(
        "propose", help="copy a personal site into a branch of a commons checkout"
    )
    propose.add_argument("site_id")
    propose.add_argument("--commons", type=Path, required=True, help="commons git checkout")
    propose.add_argument("--log", type=Path, help="log repository (default: DATA_ROOT)")
    propose.add_argument("--branch", help="branch name (default: propose/<site-id>)")
    propose.add_argument("--author", help="'Name' or 'Name <email>' (default: OWNER_NAME)")
    propose.add_argument("--skip-map", action="append", default=[], help="map id that stays out")
    propose.add_argument("--no-validate", action="store_true", help="commit without validating")
    propose.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    propose.set_defaults(run=run_propose_command)

    adopt = site_commands.add_parser(
        "adopt", help="turn a proposed site into an overlay on its merged commons record"
    )
    target = adopt.add_mutually_exclusive_group(required=True)
    target.add_argument("site_id", nargs="?")
    target.add_argument("--all", action="store_true", help="every site this log proposed")
    adopt.add_argument("--log", type=Path, help="log repository (default: DATA_ROOT)")
    adopt.add_argument("--commons", type=Path, help="commons checkout (default: divelog.yaml)")
    adopt.add_argument("--keep-maps", action="store_true", help="keep copied maps as personal")
    adopt.add_argument("--author", help="commit author (default: OWNER_NAME)")
    adopt.set_defaults(run=run_adopt_command)


def _identity(author: str | None) -> tuple[str, str]:
    settings = get_settings()
    email = settings.GIT_AUTHOR_EMAIL or settings.OWNER_EMAIL or "divelog@localhost"
    return split_author(author, settings.OWNER_NAME, email)


def run_propose_command(args: argparse.Namespace, out: TextIO) -> int:
    """Plan, branch, write, validate and commit a proposal; print the next steps."""
    settings = get_settings()
    name, email = _identity(args.author)
    media_root = Path(settings.MEDIA_ROOT) if settings.STORAGE_BACKEND == "local" else None
    options = ProposeOptions(
        site_id=args.site_id,
        log_root=args.log or Path(settings.DATA_ROOT),
        commons=args.commons,
        branch=args.branch,
        author=name,
        author_email=email,
        validate=not args.no_validate,
        media_root=media_root,
        skip_maps=frozenset(args.skip_map),
    )
    try:
        result = run_propose(options, dry_run=args.dry_run)
    except ProposeError as exc:
        print(exc, file=out)
        return 1
    for line in render_plan(result.plan):
        print(line, file=out)
    if args.dry_run:
        print("dry run: nothing written", file=out)
        return 0
    if result.problems:
        print(
            f"the proposal does not validate; branch {options.branch_name} is checked out "
            f"in {options.commons} for fixing",
            file=out,
        )
        for problem in result.problems:
            print(problem, file=out)
        return 1
    back = f", back on {result.returned_to}" if result.returned_to else ""
    print(f"committed {result.head} on {options.branch_name}{back}", file=out)
    print("next steps:", file=out)
    for command in next_steps(result):
        print(f"  {command}", file=out)
    return 0


def run_adopt_command(args: argparse.Namespace, out: TextIO) -> int:
    """Adopt one site or ``--all`` proposed sites and commit the log."""
    settings = get_settings()
    log_root: Path = args.log or Path(settings.DATA_ROOT)
    name, email = _identity(args.author)
    try:
        commons = resolve_commons(log_root, args.commons)
    except PullError as exc:
        print(exc, file=out)
        return 1
    store = load_merged(log_root, commons)
    site_ids = adoptable(store, log_name(log_root)) if args.all else [args.site_id]
    if not site_ids:
        print("nothing to adopt", file=out)
        return 0
    code = 0
    for site_id in site_ids:
        try:
            result = adopt_site(store, site_id, keep_maps=args.keep_maps)
        except AdoptError as exc:
            print(exc, file=out)
            code = 1
            continue
        if not result.already and is_git_repo(log_root):
            result.committed = commit_all(
                log_root, f"Adopt {site_id} from the commons", name, email
            )
        store = load_merged(log_root, commons)
        if not result.already and store.site_origin.get(site_id) != "commons":
            result.problems.append(f"origin is {store.site_origin.get(site_id)} after adopting")
            code = 1
        for line in render_adopt(result):
            print(line, file=out)
    return code
