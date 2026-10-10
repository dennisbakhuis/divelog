import argparse
import io
import json
from pathlib import Path

import pytest

from divelog_server.store.store import Store
from divelog_server.tools import tiles


def parse(*argv: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    tiles.register(parser.add_subparsers(dest="command"))
    return parser.parse_args(["tiles", *argv])


def test_arguments() -> None:
    args = parse("--log", "/repo", "--media", "/media", "--build", "20260926", "--force")
    assert args.log == Path("/repo")
    assert args.media == Path("/media")
    assert args.build == "20260926"
    assert args.force and not args.dry_run and not args.upload
    assert args.run is tiles.run


def test_cluster_links_close_sites_only() -> None:
    sites = [
        ("nld-a", 51.0, 4.0),
        ("nld-b", 51.2, 4.1),
        ("mex-c", 20.5, -87.3),
    ]
    groups = tiles.cluster(sites)
    assert [sorted(s[0] for s in g) for g in groups] == [["nld-a", "nld-b"], ["mex-c"]]
    assert tiles.slug_for(groups[0]) == "nld-a"
    assert tiles.slug_for([("mex-c", 0, 0), ("bes-z", 0, 0)]) == "bes-mex-z"


def test_bbox_and_tile_count() -> None:
    bbox = tiles.bbox_of([("nld-a", 51.0, 4.0)])
    assert bbox[1] == pytest.approx(50.88) and bbox[3] == pytest.approx(51.12)
    assert bbox[0] < 4.0 < bbox[2]
    assert tiles.tile_count(bbox, 0) == 1
    assert tiles.tile_count(bbox, 15) > tiles.tile_count(bbox, 10)
    assert round(tiles.haversine_km(0, 0, 0, 1)) == 111


def test_placed_sites_of_the_log(store: Store) -> None:
    placed = tiles.placed_sites(store)
    ids = [s[0] for s in placed]
    assert ids == sorted(ids)
    assert "secret" not in ids
    for site_id, lat, lon in placed:
        site = store.sites[site_id]
        assert (site.lat, site.lon) == (lat, lon)


def test_commons_sites_without_dives_are_left_out(commons_store: Store) -> None:
    placed = {s[0] for s in tiles.placed_sites(commons_store)}
    for site_id in placed:
        origin = commons_store.site_origin.get(site_id, "log")
        assert origin != "commons" or commons_store.dives_by_site.get(site_id)
    unused = [
        site_id
        for site_id, origin in commons_store.site_origin.items()
        if origin == "commons" and not commons_store.dives_by_site.get(site_id)
    ]
    assert unused and not placed & set(unused)


def test_dry_run_reports_clusters_without_network(tmp_path: Path) -> None:
    out = io.StringIO()
    code = tiles.run(parse("--media", str(tmp_path), "--dry-run"), out)
    assert code == 0
    assert "world.pmtiles" in out.getvalue()
    assert ".pmtiles" in out.getvalue().splitlines()[-1]
    assert not (tmp_path / "tiles" / "index.json").exists()


def test_missing_pmtiles_binary_is_reported(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(tiles.shutil, "which", lambda name: None)
    out = io.StringIO()
    assert tiles.run(parse("--media", str(tmp_path), "--build", "20260926"), out) == 1
    assert "pmtiles" in out.getvalue()


def test_unchanged_archives_are_kept(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cut: list[str] = []
    monkeypatch.setattr(tiles.shutil, "which", lambda name: "/bin/pmtiles")

    def fake_extract(build: str, target: Path, bbox: object, zoom: int) -> None:
        cut.append(target.name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"pm")

    monkeypatch.setattr(tiles, "extract", fake_extract)
    args = parse("--media", str(tmp_path), "--build", "20260926")
    assert tiles.run(args, io.StringIO()) == 0
    first = list(cut)
    assert "world.pmtiles" in first and len(first) >= 2
    index = json.loads((tmp_path / "tiles" / "index.json").read_text())
    assert index["world"]["build"] == "20260926"
    assert {a["file"] for a in index["archives"]} == set(first) - {"world.pmtiles"}
    cut.clear()
    assert tiles.run(parse("--media", str(tmp_path), "--build", "20261001"), io.StringIO()) == 0
    assert cut == []
