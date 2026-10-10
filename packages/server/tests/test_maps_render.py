import io
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from divelog_server.cli import main
from divelog_server.store.files import read_json, write_json
from divelog_server.store.models import SiteMapRecord
from divelog_server.tools.maps_render import (
    WIDTH,
    changed_maps,
    nice_length,
    plain,
    render,
    render_png,
)
from tests.logbuilder import FIXTURE_COMMONS, build_commons

STICK = FIXTURE_COMMONS / "maps" / "drawn" / "fra-commons-only-1.json"
SITE = Path(__file__).parent / "fixtures" / "maps" / "fra-lake-1.json"


def run(*argv: str) -> tuple[int, str]:
    out = io.StringIO()
    code = main(list(argv), out=out)
    return code, out.getvalue()


def load(path: Path) -> SiteMapRecord:
    return SiteMapRecord.model_validate(read_json(path))


@pytest.mark.parametrize(("path", "kind"), [(STICK, "stickmap"), (SITE, "sitemap")])
def test_renders_both_kinds_deterministically(path: Path, kind: str, tmp_path: Path) -> None:
    record = load(path)
    assert record.kind == kind
    first, second = tmp_path / "a.png", tmp_path / "b.png"
    render_png(record, first)
    render_png(record, second)
    assert first.read_bytes() == second.read_bytes()
    with Image.open(first) as image:
        assert image.format == "PNG"
        assert image.width == WIDTH
        assert 400 <= image.height <= 2400
        colours = image.convert("RGB").getcolors(maxcolors=1 << 16)
    assert colours is not None and len(colours) > 10
    assert 5_000 < first.stat().st_size < 2_000_000


def test_render_draws_on_white() -> None:
    image = render(load(SITE))
    assert image.getpixel((2, image.height - 2)) == (255, 255, 255)


def test_render_of_an_empty_map() -> None:
    record = SiteMapRecord(id="fra-x-1", site_id="fra-x")
    assert render(record).size == (WIDTH, 500)


@pytest.mark.parametrize(("target", "expected"), [(7.3, 5), (19, 10), (250, 200), (0.4, 0.2)])
def test_nice_length(target: float, expected: float) -> None:
    assert nice_length(target) == pytest.approx(expected)


def test_plain_drops_accents() -> None:
    assert plain("Carrière de l'Écluse") == "Carriere de l'Ecluse"


def test_cli_render_by_id_and_by_path(tmp_path: Path) -> None:
    out = tmp_path / "renders" / "stick.png"
    code, output = run(
        "maps", "render", "fra-commons-only-1", "--root", str(FIXTURE_COMMONS), "--out", str(out)
    )
    assert code == 0 and out.is_file(), output
    code, _ = run("maps", "render", str(SITE), "--out", str(tmp_path / "site.png"))
    assert code == 0
    code, output = run("maps", "render", "nope-1", "--root", str(tmp_path), "--out", str(out))
    assert code == 1 and "no such map" in output


def git(root: Path, *args: str) -> None:
    identity = ["-c", "user.name=T", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false"]
    subprocess.run(["git", "-C", str(root), *identity, *args], check=True, capture_output=True)


def test_changed_maps_lists_new_and_edited_maps(tmp_path: Path) -> None:
    root = build_commons(tmp_path / "commons")
    drawn = root / "maps" / "drawn"
    write_json(drawn / "fra-commons-only-2.json", {**read_json(STICK), "id": "fra-commons-only-2"})
    git(root, "init", "-q")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "Base")
    assert changed_maps(root, "HEAD") == []
    path = drawn / "fra-commons-only-1.json"
    write_json(path, {**read_json(path), "title": "Renamed"})
    write_json(drawn / "fra-commons-only-3.json", {**read_json(STICK), "id": "fra-commons-only-3"})
    code, output = run("maps", "changed", "--base", "HEAD", "--root", str(root))
    assert code == 0
    assert output.split() == ["fra-commons-only-1", "fra-commons-only-3"]
    code, output = run("maps", "changed", "--base", "nope", "--root", str(root))
    assert code == 1 and "unknown revision" in output
