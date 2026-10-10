import argparse
import gzip
import io
import json
import sqlite3
from pathlib import Path

import pytest

from divelog_server.tools import shearwater_pnf


def block(depth_dm: int, temp: int, ndl: int, tts: int, stop: int) -> bytes:
    raw = bytearray(32)
    raw[0] = shearwater_pnf.SAMPLE_MARKER
    raw[1:3] = depth_dm.to_bytes(2, "big")
    raw[5], raw[6], raw[10], raw[14] = stop, tts, ndl, temp
    return bytes(raw)


def blob() -> bytes:
    header = b"\x02" + bytes(31)
    stream = header + block(0, 20, 99, 0, 0) + block(185, 18, 12, 3, 3) + block(10, 19, 99, 0, 0)
    return b"\x00\x00\x00\x00" + gzip.compress(stream)


def database(path: Path) -> Path:
    con = sqlite3.connect(path)
    con.executescript(
        """
        create table dive_details (DiveId text, DiveNumber int, DiveDate text, Depth real,
                                   DiveLengthTime int, FileName text);
        create table log_data (log_id text, data_bytes_1 blob);
        """
    )
    con.execute(
        "insert into dive_details values (?, ?, ?, ?, ?, ?)",
        ("d1", 7, "2025-03-01 09:30:00", 18.5, 60, "perdix.swlogzp"),
    )
    con.execute("insert into log_data values (?, ?)", ("d1", blob()))
    con.commit()
    con.close()
    return path


def parse(*argv: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command")
    imports = commands.add_parser("import").add_subparsers(dest="import_command")
    shearwater_pnf.register(imports)
    return parser.parse_args(["import", "shearwater-pnf", *argv])


def test_arguments() -> None:
    args = parse("cloud.db", "--out", "profiles", "--interval", "5", "--force")
    assert args.db == Path("cloud.db") and args.out == Path("profiles")
    assert args.interval == 5 and args.force
    assert args.run is shearwater_pnf.run


def test_samples_decode_only_sample_blocks() -> None:
    rows = shearwater_pnf.samples(blob(), interval_s=20)
    assert [r["t_s"] for r in rows] == [0, 20, 40]
    assert rows[1] == {
        "t_s": 20,
        "depth_m": 18.5,
        "temp_c": 18,
        "ndl_min": 12,
        "tts_min": 3,
        "stop_depth_m": 3,
    }
    with pytest.raises(ValueError):
        shearwater_pnf.samples(b"no gzip here")


def test_profile_from_a_database_row(tmp_path: Path) -> None:
    rows = shearwater_pnf.dive_rows(database(tmp_path / "cloud.db"))
    assert len(rows) == 1
    payload = shearwater_pnf.profile(rows[0])
    assert payload["sample_interval_s"] == 20
    assert payload["date"] == "2025-03-01" and payload["time_in"] == "09:30"
    assert payload["depth_m"] == [0.0, 18.5, 1.0]
    assert payload["temp_min_c"] == 18 and payload["temp_max_c"] == 20
    assert shearwater_pnf.file_name(rows[0]) == "shearwater_2025-03-01_0007.json"


def test_run_writes_profiles_and_keeps_existing(tmp_path: Path) -> None:
    db = database(tmp_path / "cloud.db")
    out = io.StringIO()
    assert shearwater_pnf.run(parse(str(db), "--out", str(tmp_path / "p")), out) == 0
    written = tmp_path / "p" / "shearwater_2025-03-01_0007.json"
    assert json.loads(written.read_text())["t_s"] == [0, 20, 40]
    again = io.StringIO()
    assert shearwater_pnf.run(parse(str(db), "--out", str(tmp_path / "p")), again) == 0
    assert "0 profiles written, 1 existing kept" in again.getvalue()
    assert shearwater_pnf.run(parse(str(tmp_path / "none.db"), "--out", "x"), io.StringIO()) == 1
