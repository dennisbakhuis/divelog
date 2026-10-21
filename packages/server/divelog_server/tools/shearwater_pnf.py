"""Write dive profiles from the "sw-pnf" logs in a Shearwater Cloud database.

Every ``log_data`` blob is parsed with ``importers.shearwater_pnf``; logs with the same serial
and dive number (a dive the computer split at a surface break) are merged. ``divelog import
shearwater-pnf <db> --out <dir>`` writes one columnar profile JSON per dive (the shape of
``profiles/*.json`` in a log repository) for linking from dive files. The database is opened
read-only.
"""

import argparse
import sqlite3
from pathlib import Path
from typing import Any, TextIO

from divelog_server.importers.shearwater import ShearwaterDive
from divelog_server.importers.shearwater_pnf import merge_parts, parse_pnf, unwrap
from divelog_server.store.files import write_json


def register(import_commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add ``import shearwater-pnf`` to the ``import`` subcommands."""
    parser = import_commands.add_parser(
        "shearwater-pnf",
        help="profiles from a Shearwater Cloud database",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("db", type=Path, help="Shearwater Cloud SQLite database")
    parser.add_argument("--out", type=Path, required=True, help="folder for the profile files")
    parser.add_argument(
        "--interval", type=float, help="seconds between samples (default: as logged)"
    )
    parser.add_argument("--force", action="store_true", help="overwrite existing files")
    parser.set_defaults(run=run)


def dive_rows(db: Path) -> list[dict[str, Any]]:
    """Every log in the Shearwater database, with its file name, serial and raw blob."""
    con = sqlite3.connect(f"{db.resolve().as_uri()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(
            """
            select l.log_id, l.file_name, d.SerialNumber, l.data_bytes_1
            from log_data l left join dive_details d on d.DiveId = l.log_id
            order by l.file_name
            """
        ).fetchall()
    finally:
        con.close()
    return [dict(r) for r in rows]


def dives(
    rows: list[dict[str, Any]], interval_s: float | None = None
) -> tuple[list[ShearwaterDive], list[str]]:
    """Parse the logs and merge the parts of split dives.

    Parameters
    ----------
    rows : list of dict
        Database rows from ``dive_rows``.
    interval_s : float, optional
        Seconds between samples, overriding the logged interval.

    Returns
    -------
    tuple of (list of ShearwaterDive, list of str)
        The dives in start order, and one message per log that could not be read.
    """
    groups: dict[tuple[str, int], list[ShearwaterDive]] = {}
    errors: list[str] = []
    for row in rows:
        try:
            dive = parse_pnf(
                unwrap(row["data_bytes_1"] or b""),
                serial=row.get("SerialNumber") or None,
                interval_s=interval_s,
            )
        except ValueError as exc:
            errors.append(f"{row.get('file_name') or row['log_id']}: {exc}")
            continue
        groups.setdefault((dive.serial, dive.number), []).append(dive)
    merged = [merge_parts(parts) for parts in groups.values()]
    return sorted(merged, key=lambda dive: dive.start), errors


def file_name(dive: ShearwaterDive) -> str:
    """``shearwater_<date>_<dive number>.json``."""
    return f"shearwater_{dive.start.date().isoformat()}_{dive.number:04d}.json"


def run(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog import shearwater-pnf``: one profile file per dive in the database."""
    if not args.db.is_file():
        print(f"{args.db}: no such database", file=out)
        return 1
    folder: Path = args.out
    parsed, errors = dives(dive_rows(args.db), args.interval)
    for error in errors:
        print(error, file=out)
    written = skipped = 0
    for dive in parsed:
        target = folder / file_name(dive)
        if target.exists() and not args.force:
            skipped += 1
            continue
        write_json(target, dive.profile())
        written += 1
        print(f"{target.name}: {len(dive.t_s)} samples", file=out)
    print(f"{written} profiles written, {skipped} existing kept, in {folder}", file=out)
    return 0
