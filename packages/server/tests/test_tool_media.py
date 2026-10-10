import argparse
import io
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from divelog_server.store.files import read_markdown, write_markdown
from divelog_server.tools import media


def parse(*argv: str) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    media.register(parser.add_subparsers(dest="command"))
    return parser.parse_args(["media", *argv])


def jpeg(path: Path, size: tuple[int, int] = (64, 48)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, (10, 120, 200)).save(path, "JPEG")


def test_fetch_arguments(tmp_path: Path) -> None:
    args = parse("fetch", "mex-a=Cenote A", "--out", str(tmp_path), "--delay", "0")
    assert args.pairs == ["mex-a=Cenote A"]
    assert args.out == tmp_path and args.delay == 0
    assert args.run is media.run_fetch


def test_upload_arguments() -> None:
    args = parse("upload", "--log", "/log", "--media", "/m", "--scans", "/s", "--dry-run")
    assert (args.log, args.media, args.scans) == (Path("/log"), Path("/m"), Path("/s"))
    assert args.dry_run and args.run is media.run_upload


def test_search_terms_from_file_and_pairs(tmp_path: Path) -> None:
    terms = tmp_path / "terms.json"
    terms.write_text('{"egy-a": "Thistlegorm", "mex-b": "old"}')
    found = media.search_terms(["mex-b = Cenote B "], terms)
    assert found == {"egy-a": "Thistlegorm", "mex-b": "Cenote B"}
    with pytest.raises(ValueError):
        media.search_terms(["no-term"], None)


def test_licences_and_markup() -> None:
    assert media.is_free("CC BY-SA 4.0")
    assert media.is_free("Public domain")
    assert not media.is_free("All rights reserved")
    assert media.strip_markup("<a href='x'>Jane  <b>Doe</b></a>") == "Jane Doe"


def test_describe_orders_by_search_rank() -> None:
    data = {
        "query": {
            "pages": [
                {
                    "title": "File:B.jpg",
                    "imageinfo": [
                        {
                            "url": "https://u/b",
                            "descriptionurl": "https://p/b",
                            "extmetadata": {"LicenseShortName": {"value": "CC0"}},
                        }
                    ],
                },
                {
                    "title": "File:A.jpg",
                    "imageinfo": [
                        {
                            "thumburl": "https://u/a",
                            "extmetadata": {"Artist": {"value": "<i>Ann</i>"}},
                        }
                    ],
                },
            ]
        }
    }
    rows = media.describe(data, ["File:A.jpg", "File:B.jpg"])
    assert [r["title"] for r in rows] == ["File:A.jpg", "File:B.jpg"]
    assert rows[0]["author"] == "Ann" and rows[0]["url"] == "https://u/a"


def test_fetch_downloads_the_first_free_image(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    picks = [
        {"title": "File:X y.JPG", "licence": "ARR", "url": "u1", "page": "p", "author": "a"},
        {
            "title": "File:Reef shot.JPG",
            "licence": "CC BY 4.0",
            "url": "u2",
            "page": "p2",
            "author": "Ann",
            "description": "Reef",
        },
    ]
    monkeypatch.setattr(media, "candidates", lambda term, agent: picks)

    def fake_download(url: str, dest: Path, agent: str) -> int:
        dest.write_bytes(b"jpeg")
        return 4

    monkeypatch.setattr(media, "download", fake_download)
    out = io.StringIO()
    args = parse("fetch", "mex-a=reef", "--out", str(tmp_path), "--delay", "0")
    assert media.run_fetch(args, out) == 0
    credits = (tmp_path / "CREDITS.json").read_text()
    assert '"file": "mex-a.jpg"' in credits and '"author": "Ann"' in credits
    assert (tmp_path / "mex-a.jpg").read_bytes() == b"jpeg"
    assert media.run_fetch(args, io.StringIO()) == 0


def test_fetch_without_terms_fails(tmp_path: Path) -> None:
    out = io.StringIO()
    assert media.run_fetch(parse("fetch", "--out", str(tmp_path)), out) == 1


def test_source_for_keys(tmp_path: Path) -> None:
    data, scans = tmp_path / "data", tmp_path / "scans"
    assert media.source_for({"key": "repo:media/sites/a.jpg"}, data, scans) == (
        data / "media" / "sites" / "a.jpg",
        "sites/a.jpg",
    )
    assert media.source_for({"key": "scans/x/p1.jpg"}, data, scans) == (
        scans / "p1.jpg",
        "scans/x/p1.jpg",
    )
    assert media.source_for({"key": "scans/p1.jpg"}, data, None) is None
    assert media.source_for({"key": "sites/b.jpg"}, data, None) == (
        data / "media" / "sites" / "b.jpg",
        "sites/b.jpg",
    )
    assert media.source_for({"key": "people/x.jpg"}, data, None) is None


def test_upload_processes_pending_entries_once(tmp_path: Path) -> None:
    log, store_root, scans = tmp_path / "log", tmp_path / "media", tmp_path / "scans"
    jpeg(scans / "page1.jpg")
    entry: dict[str, Any] = {"id": "s1", "key": "scans/page1.jpg", "kind": "scan"}
    write_markdown(log / "dives" / "00001.md", {"number": 1, "media": [dict(entry)]}, "")
    write_markdown(log / "dives" / "00002.md", {"number": 2, "media": [dict(entry)]}, "")
    write_markdown(
        log / "dives" / "00003.md", {"number": 3, "media": [{"key": "scans/no.jpg"}]}, ""
    )
    out = io.StringIO()
    args = parse("upload", "--log", str(log), "--media", str(store_root), "--scans", str(scans))
    assert media.run_upload(args, out) == 0
    assert "uploaded 1 files, updated 2 records" in out.getvalue()
    assert "missing sources (1)" in out.getvalue()
    meta, _ = read_markdown(log / "dives" / "00002.md")
    stored = meta["media"][0]
    assert stored["key"] == "scans/page1.jpg" and stored["width"] == 64
    assert stored["variants"]
    assert (store_root / "scans" / "page1.jpg").is_file()
    again = io.StringIO()
    assert media.run_upload(args, again) == 0
    assert "uploaded 0 files, updated 0 records" in again.getvalue()


def test_upload_dry_run_writes_nothing(tmp_path: Path) -> None:
    log, scans = tmp_path / "log", tmp_path / "scans"
    jpeg(scans / "page1.jpg")
    write_markdown(
        log / "dives" / "00001.md", {"number": 1, "media": [{"key": "scans/page1.jpg"}]}, ""
    )
    args = parse(
        "upload",
        "--log",
        str(log),
        "--media",
        str(tmp_path / "m"),
        "--scans",
        str(scans),
        "--dry-run",
    )
    assert media.run_upload(args, io.StringIO()) == 0
    assert read_markdown(log / "dives" / "00001.md")[0]["media"] == [{"key": "scans/page1.jpg"}]
    assert not (tmp_path / "m").exists()
