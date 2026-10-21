"""Cross-check the PNF parser on a real Shearwater Cloud database against a log's profiles.

Local only: set ``DIVELOG_SW_CLOUD_DB`` to a ``dive_data.db`` and ``DIVELOG_CONTENT_ROOT`` to a
log repository whose ``profiles/*.json`` were made from the same dives. Date, gradient factors
and minimum temperature must match; maximum depth (±0.1 m) and dive time (±1 min) too, except
for profiles that joined several computer dives or split one log into several dives. The stored
minimum temperature may come from the surface tail the parser drops, and a split log's from the
surface intervals between its dives. Time-axis differences are only reported: the
old profiles spread the samples over the dive time instead of using the logged interval.
"""

import json
import os
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any

import pytest

from divelog_server.importers.shearwater import ShearwaterDive
from divelog_server.importers.shearwater_pnf import merge_parts, parse_pnf, unwrap

CLOUD_DB = os.environ.get("DIVELOG_SW_CLOUD_DB")
CONTENT = os.environ.get("DIVELOG_CONTENT_ROOT")

pytestmark = pytest.mark.skipif(
    not (CLOUD_DB and CONTENT), reason="needs DIVELOG_SW_CLOUD_DB and DIVELOG_CONTENT_ROOT"
)


def cloud_dives(db: Path) -> tuple[dict[int, ShearwaterDive], int]:
    """Every dive in the database by computer number, with split logs merged, and the log count."""
    con = sqlite3.connect(f"{db.resolve().as_uri()}?mode=ro", uri=True)
    try:
        blobs = [row[0] for row in con.execute("select data_bytes_1 from log_data")]
    finally:
        con.close()
    groups: dict[int, list[ShearwaterDive]] = {}
    for blob in blobs:
        dive = parse_pnf(unwrap(blob))
        groups.setdefault(dive.number, []).append(dive)
    return {number: merge_parts(parts) for number, parts in groups.items()}, len(blobs)


def stored_profiles(content: Path) -> dict[int, list[dict[str, Any]]]:
    """The log's profiles by computer number; one log may have been split into several dives."""
    profiles: dict[int, list[dict[str, Any]]] = {}
    for path in sorted((content / "profiles").glob("profile_*.json")):
        payload = json.loads(path.read_text())
        if payload.get("computer_no") is not None:
            profiles.setdefault(int(payload["computer_no"]), []).append(payload)
    return profiles


def trimmed_temp_min(stored: dict[str, Any]) -> float | None:
    """The stored minimum temperature without the surface tail the parser drops."""
    depths = stored["depth_m"]
    last = max((k for k, depth in enumerate(depths) if depth > 0), default=-1)
    return min(stored["temp_c"][: last + 2], default=None)


def test_parser_matches_the_stored_profiles(capsys: pytest.CaptureFixture[str]) -> None:
    assert CLOUD_DB and CONTENT
    dives, logs = cloud_dives(Path(CLOUD_DB))
    profiles = stored_profiles(Path(CONTENT))
    matched = Counter[str]()
    failures: list[str] = []
    notes: list[str] = []
    for number, pieces in sorted(profiles.items()):
        dive = dives.get(number)
        if dive is None:
            notes.append(f"#{number}: no log in the database")
            continue
        new = dive.profile()
        stored = min(pieces, key=lambda piece: piece["time_in"])
        joined = len(set(stored.get("computer_records") or [number])) > 1
        split = len(pieces) > 1
        temp_min = min(piece["temp_min_c"] for piece in pieces)
        trimmed = min(t for piece in pieces if (t := trimmed_temp_min(piece)) is not None)
        max_depth = max(piece["max_depth_m"] for piece in pieces)
        checks = {
            "date": new["date"] == stored["date"],
            "gf": new["gf"] == stored["gf"],
            "temp_min_c": new["temp_min_c"] in (temp_min, trimmed)
            or (split and new["temp_min_c"] <= temp_min),
            "max_depth_m": joined or round(abs(new["max_depth_m"] - max_depth), 1) <= 0.1,
            "duration_min": joined
            or split
            or abs(new["duration_min"] - stored["duration_min"]) <= 1,
        }
        for name, ok in checks.items():
            if ok:
                matched[name] += 1
            else:
                failures.append(f"#{number} {name}: parsed {new[name]}, stored {stored[name]}")
        if new["temp_min_c"] != temp_min:
            notes.append(f"#{number}: minimum {new['temp_min_c']} °C, stored {temp_min} °C")
        if joined:
            notes.append(f"#{number}: stored profile joins {stored['computer_records']}")
        if split:
            notes.append(f"#{number}: log stored as {len(pieces)} dives")
        if new["time_in"] != stored["time_in"]:
            matched["time_in differs"] += 1
        if new["sample_interval_s"] != stored["sample_interval_s"]:
            matched["sample_interval_s differs"] += 1
        if len(new["t_s"]) != sum(len(piece["t_s"]) for piece in pieces):
            matched["sample count differs"] += 1
        if not split and new["t_s"][-1] != stored["t_s"][-1]:
            matched["last t_s differs"] += 1
    unmatched = sorted(set(dives) - set(profiles))
    with capsys.disabled():
        print(f"\n{logs} logs, {len(dives)} dives, {len(profiles)} computer numbers in profiles")
        for name, count in sorted(matched.items()):
            print(f"  {name}: {count}")
        print(f"  dives without a profile: {unmatched}")
        for line in notes + failures:
            print(f"  {line}")
    assert not failures
