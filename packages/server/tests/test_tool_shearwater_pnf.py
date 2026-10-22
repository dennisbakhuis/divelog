import argparse
import io
import json
import sqlite3
from datetime import datetime
from pathlib import Path

from divelog_server.tools import shearwater_pnf
from tests import pnf_builder as pnf

GOLDEN = Path(__file__).parent / "fixtures" / "shearwater"


def log(number: int, start: datetime, depths: list[float]) -> bytes:
    return pnf.blob(
        [
            pnf.opening0(number=number, start=start),
            pnf.opening1(serial=0xDEADBEEF),
            pnf.opening2(),
            pnf.opening3(),
            pnf.opening4(),
            pnf.opening5(),
            *[pnf.sample(depth=d) for d in depths],
            pnf.closing0(max_depth=max(depths), duration_s=10 * len(depths)),
            pnf.final(serial=0xDEADBEEF),
        ]
    )


def database(path: Path) -> Path:
    con = sqlite3.connect(path)
    con.executescript(
        """
        create table dive_details (DiveId text, SerialNumber text, DiveNumber int);
        create table log_data (log_id text, file_name text, format text, data_bytes_1 blob);
        """
    )
    logs = [
        ("d1", "a.swlogzp", log(7, datetime(2025, 3, 1, 9, 30), [2.0, 18.5, 1.0, 0.0, 0.0])),
        ("d2", "b.swlogzp", log(8, datetime(2025, 3, 1, 11, 0), [3.0, 0.0])),
        ("d3", "c.swlogzp", log(8, datetime(2025, 3, 1, 11, 5), [4.0, 0.0])),
        ("d4", "broken.swlogzp", b"\xff\xff" + bytes(30)),
    ]
    for log_id, name, blob in logs:
        con.execute("insert into dive_details values (?, ?, ?)", (log_id, "DEADBEEF", 1))
        con.execute("insert into log_data values (?, ?, 'sw-pnf', ?)", (log_id, name, blob))
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
    assert parse("cloud.db", "--out", "p").interval is None


def test_dives_merge_split_logs_and_report_errors(tmp_path: Path) -> None:
    rows = shearwater_pnf.dive_rows(database(tmp_path / "cloud.db"))
    assert len(rows) == 4
    dives, errors = shearwater_pnf.dives(rows)
    assert [d.number for d in dives] == [7, 8]
    assert errors == ["broken.swlogzp: Predator-style (FFFF) logs are not supported"]
    first, split = (d.profile() for d in dives)
    assert first["t_s"] == [0, 10, 20, 30] and first["depth_m"] == [2.0, 18.5, 1.0, 0.0]
    assert first["source"] == "Perdix AI DEADBEEF"
    assert split["computer_records"] == [8, 8] and split["surface_breaks"] == [[10, 300]]
    assert shearwater_pnf.file_name(dives[0]) == "shearwater_2025-03-01_0007.json"


def test_interval_override(tmp_path: Path) -> None:
    rows = shearwater_pnf.dive_rows(database(tmp_path / "cloud.db"))
    dives, _ = shearwater_pnf.dives(rows, interval_s=2)
    assert dives[0].t_s == [0, 2, 4, 6]


def test_run_writes_profiles_and_keeps_existing(tmp_path: Path) -> None:
    db = database(tmp_path / "cloud.db")
    out = io.StringIO()
    assert shearwater_pnf.run(parse(str(db), "--out", str(tmp_path / "p")), out) == 0
    assert "broken.swlogzp: Predator-style" in out.getvalue()
    assert "2 profiles written, 0 existing kept" in out.getvalue()
    written = tmp_path / "p" / "shearwater_2025-03-01_0007.json"
    assert json.loads(written.read_text())["max_depth_m"] == 18.5
    again = io.StringIO()
    assert shearwater_pnf.run(parse(str(db), "--out", str(tmp_path / "p")), again) == 0
    assert "0 profiles written, 2 existing kept" in again.getvalue()
    forced = io.StringIO()
    assert shearwater_pnf.run(parse(str(db), "--out", str(tmp_path / "p"), "--force"), forced) == 0
    assert "2 profiles written" in forced.getvalue()
    assert shearwater_pnf.run(parse(str(tmp_path / "none.db"), "--out", "x"), io.StringIO()) == 1


def test_run_on_a_golden_log_writes_its_profile(tmp_path: Path) -> None:
    con = sqlite3.connect(tmp_path / "cloud.db")
    con.executescript(
        """
        create table dive_details (DiveId text, SerialNumber text);
        create table log_data (log_id text, file_name text, data_bytes_1 blob);
        """
    )
    con.execute("insert into dive_details values ('x', '344FDE85')")
    con.execute(
        "insert into log_data values ('x', '457.swlogzp', ?)",
        ((GOLDEN / "457.swlog").read_bytes(),),
    )
    con.commit()
    con.close()
    args = parse(str(tmp_path / "cloud.db"), "--out", str(tmp_path / "p"))
    assert shearwater_pnf.run(args, io.StringIO()) == 0
    written = json.loads((tmp_path / "p" / "shearwater_2020-03-07_0457.json").read_text())
    assert written == json.loads((GOLDEN / "457.json").read_text())
