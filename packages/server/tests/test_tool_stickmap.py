import argparse
import io
import json
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from divelog_server.schemas.sitemap import SiteMap
from divelog_server.tools import common, stickmap
from divelog_server.tools.stickmap import Frame, build_map


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    stickmap.register(root.add_subparsers(dest="command", required=True))
    return root


def run(*argv: str) -> tuple[int, str]:
    args = parser().parse_args(["stickmap", *argv])
    out = io.StringIO()
    code = args.run(args, out)
    return code, out.getvalue()


def tiny_trace(**extra: Any) -> dict[str, Any]:
    trace: dict[str, Any] = {
        "site_id": "ressel",
        "image": "scan.png",
        "title": "Tiny cave",
        "scale": {"from": [10, 90], "to": [60, 90], "metres": 100},
        "origin": {"px": [20, 20], "lat": 44.5, "lon": 1.9},
        "nodes": [
            {"id": "ent", "px": [20, 20], "type": "entrance", "label": "Entrance"},
            {"id": "s1", "px": [40, 20], "depth": 12},
            {"id": "end", "px": [40, 50], "type": "end"},
        ],
        "edges": [
            {"from": "ent", "to": "s1"},
            {"from": "s1", "to": "end", "style": "jump", "note": "gap"},
        ],
        "lines": [
            {
                "id": "pool",
                "kind": "shoreline",
                "closed": True,
                "px": [[15, 15], [25, 15], [25, 25]],
            }
        ],
        "areas": [{"id": "room", "px": [[30, 30], [50, 30], [50, 50]]}],
        "notes": "Traced from a test scan.",
    }
    trace.update(extra)
    return trace


def scan(tmp_path: Path) -> Path:
    path = tmp_path / "scan.png"
    Image.new("RGB", (100, 100), "white").save(path)
    return path


def write(path: Path, data: Any) -> Path:
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_register_parses_every_subcommand() -> None:
    p = parser()
    args = p.parse_args(["stickmap", "grid", "in.png", "out.png", "--crop", "0,0,5,5"])
    assert (args.tool_command, args.step, args.zoom, args.crop) == ("grid", 50, 1, "0,0,5,5")
    assert args.run is stickmap.cmd_grid
    args = p.parse_args(["stickmap", "build", "t.json", "m.json"])
    assert args.run is stickmap.cmd_build
    args = p.parse_args(["stickmap", "overlay", "t.json", "o.png", "--zoom", "2"])
    assert args.zoom == 2.0 and args.run is stickmap.cmd_overlay
    args = p.parse_args(["stickmap", "push", "t.json", "--cookies", "c"])
    assert args.base == common.default_api()
    assert args.note == "Traced from the reference map"
    with pytest.raises(SystemExit):
        p.parse_args(["stickmap"])


def test_frame_scale_and_north_from_arrow() -> None:
    frame = Frame(tiny_trace())
    assert frame.metres_per_px == 2.0
    assert frame.north == 0.0
    assert frame.to_map(30, 25) == (20.0, 10.0)
    assert frame.to_px(20.0, 10.0) == (30.0, 25.0)
    east = Frame(tiny_trace(north_arrow={"from": [0, 0], "to": [10, 0]}))
    assert east.north == pytest.approx(270.0)
    assert Frame(tiny_trace(north=-30)).north == 330.0


def test_build_map_converts_to_metres_with_entrance_at_origin() -> None:
    site_map = build_map(tiny_trace())
    nodes = {node["id"]: node for node in site_map["nodes"]}
    assert (nodes["ent"]["x"], nodes["ent"]["y"]) == (0.0, 0.0)
    assert (nodes["s1"]["x"], nodes["s1"]["y"], nodes["s1"]["type"]) == (40.0, 0.0, "station")
    assert (nodes["end"]["x"], nodes["end"]["y"]) == (40.0, 60.0)
    assert [(e["from"], e["to"], e["style"]) for e in site_map["edges"]] == [
        ("ent", "s1", "line"),
        ("s1", "end", "jump"),
    ]
    assert site_map["lines"][0]["points"][0] == {"x": -10.0, "y": -10.0}
    assert site_map["areas"][0]["kind"] == "outline"
    assert site_map["origin"] == {"lat": 44.5, "lon": 1.9}
    assert site_map["kind"] == "stickmap"
    SiteMap.model_validate(site_map)


def test_build_map_rejects_unknown_edge_ends() -> None:
    with pytest.raises(SystemExit):
        build_map(tiny_trace(edges=[{"from": "ent", "to": "ghost"}]))


def test_build_command_writes_map_and_warns(tmp_path: Path) -> None:
    trace = tiny_trace(nodes=[*tiny_trace()["nodes"], {"id": "lone", "px": [90, 90], "type": "t"}])
    path = write(tmp_path / "trace.json", trace)
    target = tmp_path / "map.json"
    code, output = run("build", str(path), str(target))
    assert code == 0
    assert "4 nodes, 2 edges, 1 lines; 2.000 m/px; north 0.0°" in output
    assert "warning: nodes without edges: lone" in output
    assert "warning: T lone has 0 edges" in output
    SiteMap.model_validate(json.loads(target.read_text()))


def test_overlay_and_grid_write_images(tmp_path: Path) -> None:
    image = scan(tmp_path)
    trace = write(tmp_path / "trace.json", tiny_trace())
    overlay = tmp_path / "overlay.png"
    code, output = run("overlay", str(trace), str(overlay), "--zoom", "2")
    assert code == 0
    assert output.strip() == f"{overlay}: 200x200"
    with Image.open(overlay) as drawn:
        assert drawn.size == (200, 200)
    grid = tmp_path / "grid.png"
    code, output = run("grid", str(image), str(grid), "--step", "20", "--crop", "10,10,60,60")
    assert code == 0
    assert "50x50, grid every 20 px (minor 4)" in output
    with Image.open(grid) as drawn:
        assert drawn.size == (50, 50)


def test_push_posts_and_sets_default(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str, Any]] = []

    def fake(base: str, cookie: str, method: str, path: str, body: Any = None) -> Any:
        calls.append((method, base + path, body))
        return {"id": "m1", "revision": 2}

    monkeypatch.setattr(common, "request", fake)
    jar = tmp_path / "cookies.txt"
    jar.write_text("localhost\tFALSE\t/\tFALSE\t0\tsession\tabc\n")
    trace = write(tmp_path / "trace.json", tiny_trace())
    code, output = run("push", str(trace), "--cookies", str(jar), "--base", "http://x")
    assert code == 0
    assert output.strip() == "saved m1 revision 2; default_map of ressel set"
    assert [(method, url) for method, url, _ in calls] == [
        ("POST", "http://x/api/v1/admin/sites/ressel/maps"),
        ("PATCH", "http://x/api/v1/admin/sites/ressel"),
    ]
    assert calls[0][2]["note"] == "Traced from the reference map"
    assert calls[1][2] == {"default_map": "drawn:m1"}
    calls.clear()
    run("push", str(trace), "--cookies", str(jar), "--base", "http://x", "--map-id", "m1")
    assert calls[0][:2] == ("PUT", "http://x/api/v1/admin/maps/m1")
