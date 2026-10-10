import argparse
import io
import json
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from divelog_server.schemas.sitemap import SiteMap
from divelog_server.tools import common, sitemap_osm
from divelog_server.tools.sitemap_osm import (
    Frame,
    clip_runs,
    clip_segment,
    simplify,
    starter_map,
    stitch,
)

LAT, LON = 51.6, 3.9
SITE = {"lat": LAT, "lon": LON, "name": "Zeelandbrug", "short_name": "Bridge"}


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    sitemap_osm.register(root.add_subparsers(dest="command", required=True))
    return root


def run(*argv: str) -> tuple[int, str]:
    args = parser().parse_args(["sitemap-osm", *argv])
    out = io.StringIO()
    code = args.run(args, out)
    return code, out.getvalue()


def geo(*points: tuple[float, float]) -> list[dict[str, float]]:
    return [{"lat": LAT + dlat, "lon": LON + dlon} for dlat, dlon in points]


def tiny_osm() -> dict[str, Any]:
    ring = ((0.001, -0.002), (0.001, 0.002), (-0.001, 0.002), (-0.001, -0.002), (0.001, -0.002))
    beach = ((0.0005, 0.0), (0.0005, 0.0005), (0.0, 0.0005), (0.0005, 0.0))
    return {
        "elements": [
            {"type": "way", "id": 1, "tags": {"natural": "water"}, "geometry": geo(*ring)},
            {
                "type": "way",
                "id": 2,
                "tags": {"man_made": "pier", "name": "Long Pier"},
                "geometry": geo((0.0, 0.0), (0.0003, 0.0)),
            },
            {
                "type": "way",
                "id": 3,
                "tags": {"natural": "beach"},
                "geometry": geo(*beach),
            },
            {
                "type": "node",
                "id": 4,
                "lat": LAT - 0.0002,
                "lon": LON + 0.0003,
                "tags": {"historic": "wreck", "name": "SS Test"},
            },
            {
                "type": "node",
                "id": 5,
                "lat": LAT + 0.0001,
                "lon": LON,
                "tags": {"leisure": "slipway"},
            },
        ]
    }


def tiny_map(**extra: Any) -> dict[str, Any]:
    site_map: dict[str, Any] = {
        "version": 3,
        "kind": "sitemap",
        "title": "Tiny",
        "north": 0.0,
        "nodes": [
            {"id": "entry", "x": 0.0, "y": 0.0, "type": "entry", "label": "Entry"},
            {"id": "buoy", "x": 20.0, "y": 10.0, "type": "buoy", "label": "", "depth": 5.0},
        ],
        "edges": [],
        "areas": [
            {
                "id": "sand",
                "kind": "sand",
                "label": "Sand",
                "points": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}],
            }
        ],
        "lines": [
            {
                "id": "shore",
                "kind": "shoreline",
                "label": "Shore",
                "closed": False,
                "points": [{"x": -10, "y": -10}, {"x": 40, "y": -10}],
            }
        ],
        "notes": "Hand drawn.",
        "origin": {"lat": LAT, "lon": LON},
        "underlay": None,
    }
    site_map.update(extra)
    return site_map


def write(path: Path, data: Any) -> Path:
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_register_parses_every_subcommand() -> None:
    p = parser()
    args = p.parse_args(["sitemap-osm", "fetch", "zeelandbrug", "--out", "w", "--radius", "300"])
    assert (args.tool_command, args.site_id, args.radius, args.log) == (
        "fetch",
        "zeelandbrug",
        300,
        None,
    )
    assert args.run is sitemap_osm.cmd_fetch
    args = p.parse_args(["sitemap-osm", "check", "m.json", "--strict"])
    assert args.strict and args.run is sitemap_osm.cmd_check
    args = p.parse_args(["sitemap-osm", "render", "m.json", "o.png", "--scale", "2"])
    assert args.scale == 2.0 and args.size == 1400
    args = p.parse_args(["sitemap-osm", "merge", "a", "b", "c", "--title-from-extra"])
    assert args.title_from_extra
    args = p.parse_args(["sitemap-osm", "recentre", "m", "o", "--at", "1,2"])
    assert args.at == "1,2"
    args = p.parse_args(["sitemap-osm", "push", "m", "--site", "s", "--cookies", "c"])
    assert args.base == common.default_api() and not args.no_default and args.map_id is None
    with pytest.raises(SystemExit):
        p.parse_args(["sitemap-osm"])


def test_frame_to_map_is_metres_east_and_south() -> None:
    frame = Frame(LAT, LON)
    assert frame.to_map(LAT, LON) == (0.0, 0.0)
    x, y = frame.to_map(LAT - 0.001, LON + 0.001)
    assert y == pytest.approx(110.6, abs=0.1)
    assert x == pytest.approx(69.2, abs=0.2)


def test_simplify_drops_collinear_points_and_keeps_corners() -> None:
    assert simplify([(0, 0), (5, 0.5), (10, 0)], 1.0) == [(0, 0), (10, 0)]
    assert simplify([(0, 0), (5, 5), (10, 0)], 1.0) == [(0, 0), (5, 5), (10, 0)]
    assert simplify([(0, 0), (1, 1)], 1.0) == [(0, 0), (1, 1)]


def test_clip_segment_and_runs() -> None:
    assert clip_segment((0, 0), (20, 0), 10) == ((0, 0), (10.0, 0.0))
    assert clip_segment((20, 20), (30, 30), 10) is None
    inside = [(0.0, 0.0), (1.0, 1.0)]
    assert clip_runs(inside, 10, True) == [(inside, True)]
    runs = clip_runs([(-20.0, 0.0), (0.0, 0.0), (20.0, 0.0)], 10, False)
    assert runs == [([(-10.0, 0.0), (0.0, 0.0), (10.0, 0.0)], False)]


def test_stitch_joins_touching_ways() -> None:
    joined = stitch([[(0, 0), (1, 0)], [(2, 0), (1, 0)], [(5, 5)]])
    assert joined == [[(0, 0), (1, 0), (2, 0)]]


def test_starter_map_from_tiny_overpass() -> None:
    site_map = starter_map(SITE, tiny_osm(), 300)
    assert sorted((line["kind"], line["closed"]) for line in site_map["lines"]) == [
        ("shoreline", True),
        ("wall", False),
    ]
    assert [line["label"] for line in site_map["lines"] if line["kind"] == "wall"] == ["Long Pier"]
    assert [area["kind"] for area in site_map["areas"]] == ["sand"]
    nodes = {node["type"]: node for node in site_map["nodes"]}
    assert set(nodes) == {"object", "entry"}
    assert nodes["object"]["object_kind"] == "wreck"
    assert nodes["object"]["label"] == "SS Test"
    assert nodes["entry"]["label"] == "Slipway"
    assert site_map["title"] == "Bridge"
    assert site_map["origin"] == {"lat": LAT, "lon": LON}
    SiteMap.model_validate(site_map)


def test_check_valid_map(tmp_path: Path) -> None:
    path = write(tmp_path / "map.json", tiny_map())
    code, output = run("check", str(path), "--strict")
    assert code == 0
    assert "sitemap 'Tiny', 2 nodes" in output
    assert "warning" not in output


def test_check_strict_fails_on_problems(tmp_path: Path) -> None:
    broken = tiny_map(
        nodes=[{"id": "obj", "x": 0, "y": 0, "type": "object"}],
        notes="",
        origin=None,
        id="m1",
        revision=3,
    )
    path = write(tmp_path / "map.json", broken)
    code, output = run("check", str(path), "--strict")
    assert code == 1
    for problem in ("object obj has no object_kind", "no entry point", "no origin", "empty notes"):
        assert problem in output
    assert run("check", str(path))[0] == 0


def test_merge_keeps_ids_unique(tmp_path: Path) -> None:
    base = write(tmp_path / "a.json", tiny_map())
    extra = write(
        tmp_path / "b.json",
        tiny_map(title="Extra", notes="From the club.", edges=[{"from": "entry", "to": "buoy"}]),
    )
    target = tmp_path / "out.json"
    code, output = run("merge", str(base), str(extra), str(target), "--title-from-extra")
    assert code == 0
    merged = json.loads(target.read_text())
    assert [n["id"] for n in merged["nodes"]] == ["entry", "buoy", "entry-2", "buoy-2"]
    assert [line["id"] for line in merged["lines"]] == ["shore", "shore-2"]
    assert merged["notes"] == "Hand drawn. From the club."
    assert merged["title"] == "Extra"
    assert "4 nodes, 1 edges, 2 lines, 2 areas" in output


def test_recentre_shifts_coordinates_and_origin(tmp_path: Path) -> None:
    path = write(tmp_path / "map.json", tiny_map())
    target = tmp_path / "out.json"
    assert run("recentre", str(path), str(target))[0] == 0
    moved = json.loads(target.read_text())
    assert moved["nodes"][0] == {**tiny_map()["nodes"][0], "x": -15.0, "y": 0.0}
    assert moved["origin"]["lat"] == LAT and moved["origin"]["lon"] > LON
    assert run("recentre", str(path), str(target), "--at", "10,0")[0] == 0
    moved = json.loads(target.read_text())
    assert moved["lines"][0]["points"][0] == {"x": -20.0, "y": -10.0}
    assert run("recentre", str(path), str(target), "--at", "0,10")[0] == 0
    assert json.loads(target.read_text())["origin"]["lat"] < LAT


def test_render_writes_png(tmp_path: Path) -> None:
    path = write(tmp_path / "map.json", tiny_map())
    target = tmp_path / "map.png"
    code, output = run("render", str(path), str(target), "--size", "400")
    assert code == 0
    assert "px/m" in output
    with Image.open(target) as image:
        assert image.format == "PNG"
        assert image.width >= 300


def test_fetch_uses_cached_overpass_and_the_store(tmp_path: Path) -> None:
    work = tmp_path / "work"
    work.mkdir()
    write(work / "osm.json", tiny_osm())
    code, output = run("fetch", "zeelandbrug", "--out", str(work))
    assert code == 0
    assert "zeelandbrug (sea) at 51.6, 3.9: radius 900 m, 5 OSM elements" in output
    assert "node:object: 1" in output
    site_map = json.loads((work / "map.json").read_text())
    assert site_map["title"] == "Zeelandbrug"
    SiteMap.model_validate(site_map)


def test_fetch_unknown_site_fails(tmp_path: Path) -> None:
    code, output = run("fetch", "nowhere", "--out", str(tmp_path / "w"))
    assert code == 1
    assert "unknown site nowhere" in output


def test_push_creates_and_sets_default(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str, str, Any]] = []

    def fake(base: str, cookie: str, method: str, path: str, body: Any = None) -> Any:
        calls.append((method, path, cookie, body))
        return {"id": "m9", "revision": 1}

    monkeypatch.setattr(common, "request", fake)
    jar = tmp_path / "cookies.txt"
    jar.write_text("#HttpOnly_localhost\tFALSE\t/\tFALSE\t0\tsession\tabc\n")
    path = write(tmp_path / "map.json", tiny_map(id="old", revision=2))
    code, output = run("push", str(path), "--site", "zeelandbrug", "--cookies", str(jar))
    assert code == 0
    assert output.strip() == "saved m9 revision 1; default_map of zeelandbrug set"
    assert [(method, path) for method, path, _, _ in calls] == [
        ("POST", "/api/v1/admin/sites/zeelandbrug/maps"),
        ("PATCH", "/api/v1/admin/sites/zeelandbrug"),
    ]
    assert calls[0][2] == "session=abc"
    assert "id" not in calls[0][3]["data"] and "revision" not in calls[0][3]["data"]
    calls.clear()
    args = ["push", str(path), "--site", "s", "--cookies", str(jar), "--map-id", "m9"]
    code, _ = run(*args, "--no-default")
    assert code == 0
    assert [(method, path) for method, path, _, _ in calls] == [("PUT", "/api/v1/admin/maps/m9")]
