"""Decode Shearwater "sw-pnf" sample blocks from a Shearwater Cloud database into profiles.

The log blob is a gzip stream (after a four-byte prefix) of 32-byte blocks. Blocks whose first
byte is 0x01 are samples; everything else is header, tissue-loading or event data and is
skipped. ``divelog import shearwater-pnf <db> --out <dir>`` writes one columnar profile JSON
per dive (the shape of ``profiles/*.json`` in a log repository) for linking from dive files.
"""

import argparse
import gzip
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, TextIO

from divelog_server.store.files import write_json

RECORD = 32
SAMPLE_MARKER = 0x01
DEFAULT_INTERVAL_S = 10
COLUMNS = ("depth_m", "temp_c", "ndl_min", "tts_min", "stop_depth_m")


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
        "--interval", type=int, help="seconds between samples (default: from the dive length)"
    )
    parser.add_argument("--force", action="store_true", help="overwrite existing files")
    parser.set_defaults(run=run)


def _blocks(blob: bytes) -> bytes:
    start = blob.find(b"\x1f\x8b")
    if start < 0:
        raise ValueError("no gzip stream in log blob")
    return gzip.decompress(blob[start:])


def samples(blob: bytes, interval_s: int = DEFAULT_INTERVAL_S) -> list[dict[str, int | float]]:
    """Decode one dive's samples.

    Parameters
    ----------
    blob : bytes
        The ``log_data.data_bytes_1`` value for the dive.
    interval_s : int
        Seconds between samples as recorded by the computer.

    Returns
    -------
    list of dict
        One entry per sample with ``t_s``, ``depth_m``, ``temp_c``,
        ``ndl_min``, ``tts_min`` and ``stop_depth_m``.
    """
    raw = _blocks(blob)
    out: list[dict[str, int | float]] = []
    for off in range(0, len(raw) - RECORD + 1, RECORD):
        if raw[off] != SAMPLE_MARKER:
            continue
        out.append(
            {
                "t_s": len(out) * interval_s,
                "depth_m": int.from_bytes(raw[off + 1 : off + 3], "big") / 10,
                "temp_c": raw[off + 14],
                "ndl_min": raw[off + 10],
                "tts_min": raw[off + 6],
                "stop_depth_m": raw[off + 5],
            }
        )
    return out


def dive_rows(db: Path) -> list[dict[str, Any]]:
    """Every dive in the Shearwater database, with its raw sample blob."""
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """
        select d.DiveId, d.DiveNumber, d.DiveDate, d.Depth, d.DiveLengthTime,
               d.FileName, l.data_bytes_1
        from dive_details d join log_data l on l.log_id = d.DiveId
        order by d.DiveDate
        """
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def sample_interval(row: dict[str, Any], count: int) -> int:
    """Seconds between samples: the dive length over the sample count, else the default."""
    length = row.get("DiveLengthTime")
    if not length or not count:
        return DEFAULT_INTERVAL_S
    return max(1, round(float(length) / count))


def profile(row: dict[str, Any], interval_s: int | None = None) -> dict[str, Any]:
    """The columnar profile file of one database row."""
    count = len(samples(row["data_bytes_1"]))
    interval = interval_s or sample_interval(row, count)
    rows = samples(row["data_bytes_1"], interval)
    started = datetime.fromisoformat(str(row["DiveDate"]))
    payload: dict[str, Any] = {
        "computer_no": row.get("DiveNumber"),
        "date": started.date().isoformat(),
        "time_in": started.strftime("%H:%M"),
        "sample_interval_s": interval,
        "t_s": [r["t_s"] for r in rows],
    }
    for column in COLUMNS:
        payload[column] = [r[column] for r in rows]
    temps = [float(t) for t in payload["temp_c"]]
    if temps:
        payload["temp_min_c"] = min(temps)
        payload["temp_max_c"] = max(temps)
    return payload


def file_name(row: dict[str, Any]) -> str:
    """``shearwater_<date>_<dive number>.json``."""
    day = datetime.fromisoformat(str(row["DiveDate"])).date().isoformat()
    return f"shearwater_{day}_{int(row.get('DiveNumber') or 0):04d}.json"


def run(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog import shearwater-pnf``: one profile file per dive in the database."""
    if not args.db.is_file():
        print(f"{args.db}: no such database", file=out)
        return 1
    folder: Path = args.out
    written = skipped = 0
    for row in dive_rows(args.db):
        target = folder / file_name(row)
        if target.exists() and not args.force:
            skipped += 1
            continue
        try:
            payload = profile(row, args.interval)
        except (ValueError, OSError) as exc:
            print(f"{target.name}: {exc}", file=out)
            continue
        write_json(target, payload)
        written += 1
        print(f"{target.name}: {len(payload['t_s'])} samples", file=out)
    print(f"{written} profiles written, {skipped} existing kept, in {folder}", file=out)
    return 0
