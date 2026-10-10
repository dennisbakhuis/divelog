import argparse
import io
import json
from pathlib import Path

from divelog_server.store.files import read_markdown, write_markdown
from divelog_server.tools import access


def parse(*argv: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command")
    sites = commands.add_parser("sites").add_subparsers(dest="sites_command")
    access.register(sites)
    return parser.parse_args(["sites", "access", *argv])


def site(root: Path, site_id: str, **extra: object) -> Path:
    path = root / "sites" / f"{site_id}.md"
    write_markdown(path, {"site_id": site_id, "name": site_id.title(), **extra}, "Body.")
    return path


def test_arguments() -> None:
    args = parse("points.json", "--log", "/log", "--author", "Ann", "--dry-run")
    assert args.points == Path("points.json")
    assert args.log == Path("/log") and args.author == "Ann" and args.dry_run
    assert args.run is access.run


def test_notes() -> None:
    assert access.access_note({"note": "Gate code 12"}) == "Gate code 12"
    assert access.access_note({"road": "MEX 307", "km": 2.04}) == (
        "Turn off MEX 307 here; the site is about 2.0 km further on an unpaved track."
    )
    assert access.access_note({"road": "N1", "km": 0.1}) == "Roadside on N1."
    assert access.access_note({"lat": 1, "lon": 2}) is None


def test_apply_writes_bumps_and_skips(tmp_path: Path) -> None:
    path = site(tmp_path, "mex-a", lat=20.5, lon=-87.3)
    site(tmp_path, "mex-b", extends="commons")
    site(tmp_path, "mex-c", access={"lat": 1.0, "lon": 2.0, "note": "Roadside on N1."})
    points = {
        "mex-a": {"lat": 20.51, "lon": -87.31, "road": "MEX 307", "km": 3.0},
        "mex-b": {"lat": 1, "lon": 2},
        "mex-c": {"lat": 1.0, "lon": 2.0, "road": "N1", "km": 0},
        "mex-z": {"lat": 1, "lon": 2},
    }
    outcome = access.apply_access(tmp_path, points, "Ann", dry_run=False)
    assert outcome["written"] == ["mex-a"]
    assert outcome["unchanged"] == ["mex-c"]
    assert [s.split(":")[0] for s in outcome["skipped"]] == ["mex-b", "mex-z"]
    meta, body = read_markdown(path)
    assert meta["access"]["lat"] == 20.51 and "MEX 307" in meta["access"]["note"]
    assert meta["revision"] == 2
    assert meta["changelog"][0]["note"] == access.CHANGE_NOTE
    assert meta["changelog"][0]["author"] == "Ann"
    assert list(meta).index("access") == list(meta).index("lon") + 1
    assert body == "Body.\n"


def test_run_dry_run(tmp_path: Path) -> None:
    path = site(tmp_path, "mex-a", lat=20.5, lon=-87.3)
    before = path.read_text()
    points = tmp_path / "points.json"
    points.write_text(json.dumps({"mex-a": {"lat": 20.51, "lon": -87.31, "road": "R", "km": 1}}))
    out = io.StringIO()
    assert access.run(parse(str(points), "--log", str(tmp_path), "--dry-run"), out) == 0
    assert "would write: 1" in out.getvalue() and "1.00 km off R" in out.getvalue()
    assert path.read_text() == before
