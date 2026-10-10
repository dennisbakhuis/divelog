import io
import json
from pathlib import Path

import pytest

from divelog_server.cli import SCHEMAS, main
from divelog_server.core import deps
from divelog_server.core.config import get_settings
from divelog_server.store.files import write_markdown
from divelog_server.store.manifest import Manifest, ManifestSource, read_manifest, write_manifest
from divelog_server.store.store import Store
from tests.logbuilder import FIXTURE_COMMONS, build_commons, build_log


def run(*argv: str) -> tuple[int, str]:
    out = io.StringIO()
    code = main(list(argv), out=out)
    return code, out.getvalue()


def test_validate_sites_green(tmp_path: Path) -> None:
    commons = build_commons(tmp_path / "commons")
    code, output = run("validate", "--kind", "sites", str(commons))
    assert code == 0
    assert "valid sites repository" in output


def test_validate_kind_defaults_from_the_manifest(tmp_path: Path) -> None:
    commons = build_commons(tmp_path / "commons")
    write_markdown(commons / "sites" / "fra-bad.md", {"site_id": "fra-bad", "name": "B"}, "We go.")
    code, output = run("validate", str(commons))
    assert code == 1
    assert "sites/fra-bad.md: first person in body line 1: We go." in output


def test_validate_fixture_commons_reports_its_legacy_site() -> None:
    code, output = run("validate", str(FIXTURE_COMMONS))
    assert code == 1
    assert "sites/ressel.md: site id 'ressel' does not match" in output


def test_validate_log_defaults_to_log(tmp_path: Path) -> None:
    code, output = run("validate", str(build_log(tmp_path / "log")))
    assert code == 0
    assert "valid log repository" in output


def test_validate_log_reports_load_errors(tmp_path: Path) -> None:
    log = build_log(tmp_path / "log")
    write_markdown(log / "dives" / "00009.md", {"number": 9}, "")
    code, output = run("validate", "--kind", "log", str(log))
    assert code == 1
    assert output.startswith("dives/00009.md: ")


def test_schema_export(tmp_path: Path) -> None:
    code, _ = run("schema", "export", str(tmp_path / "schema"))
    assert code == 0
    files = sorted(p.stem for p in (tmp_path / "schema" / "v1").glob("*.json"))
    assert files == sorted(SCHEMAS)
    core = json.loads((tmp_path / "schema" / "v1" / "site-core.json").read_text())
    assert core["title"] == "SiteCore"
    assert "revision" in core["properties"]
    manifest = json.loads((tmp_path / "schema" / "v1" / "divelog-manifest.json").read_text())
    assert set(manifest["properties"]) >= {"format", "kind", "sources"}


def test_sites_split_and_status(tmp_path: Path) -> None:
    log = build_log(tmp_path / "log")
    to = tmp_path / "divelog-sites"
    code, output = run("sites", "split", "--to", str(to), "--author", "Tester", str(log))
    assert code == 0, output
    assert "split 6 sites" in output and "2 kept personal" in output
    code, output = run("sites", "status", str(log))
    assert code == 0
    assert "8 sites: 2 log, 6 commons, 0 fork; 0 stale" in output
    assert any(line.startswith("fra-ressel ") and "commons" in line for line in output.splitlines())


def test_sites_split_dry_run_prints_the_report(tmp_path: Path) -> None:
    log = build_log(tmp_path / "log")
    to = tmp_path / "divelog-sites"
    code, output = run("sites", "split", "--dry-run", "--to", str(to), str(log))
    assert code == 0
    assert output.startswith("# Import report")
    assert not to.exists()


def test_sites_split_refuses_twice(tmp_path: Path) -> None:
    log = build_log(tmp_path / "log")
    assert run("sites", "split", "--no-git", "--to", str(tmp_path / "a"), str(log))[0] == 0
    code, output = run("sites", "split", "--to", str(tmp_path / "b"), str(log))
    assert code == 1
    assert "already has a commons source" in output


def test_status_reports_stale_overlays(tmp_path: Path) -> None:
    log = build_log(tmp_path / "log")
    to = tmp_path / "divelog-sites"
    assert run("sites", "split", "--no-git", "--to", str(to), str(log))[0] == 0
    path = to / "sites" / "fra-ressel.md"
    text = path.read_text().replace(
        "revision: 1\nchangelog:\n",
        "revision: 2\nchangelog:\n- revision: 2\n  date: '2026-10-11'\n  note: Moved\n",
    )
    path.write_text(text)
    code, output = run("sites", "status", str(log))
    assert code == 0
    assert "1/2" in output and "1 stale" in output


def test_manifest_round_trip(tmp_path: Path) -> None:
    manifest = Manifest(sources=[ManifestSource(kind="commons", name="c", path="../c")])
    write_manifest(tmp_path, manifest)
    assert read_manifest(tmp_path) == manifest
    assert read_manifest(tmp_path / "missing") is None


def test_invalid_manifest_is_a_load_error(store: Store) -> None:
    (store.root / "divelog.yaml").write_text("format: 2\n")
    store.load()
    assert any(e.startswith("divelog.yaml: ") for e in store.errors)
    assert store.manifest is None


def test_commons_resolved_from_the_log_manifest(tmp_path: Path) -> None:
    commons = build_commons(tmp_path / "commons")
    data_root = Path(get_settings().DATA_ROOT)
    source = ManifestSource(kind="commons", name="divelog-sites", path="../commons")
    write_manifest(data_root, Manifest(sources=[source]))
    deps.reset_store()
    store = deps.get_store()
    assert store.commons is not None
    assert store.commons.root == commons.resolve()
    assert store.commons.name == "divelog-sites"
    assert store.site_origin["fra-commons-only"] == "commons"
    assert store.manifest is not None and store.manifest.commons_source() == source


def test_commons_root_setting_wins_over_the_manifest(
    tmp_path: Path, commons_root: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data_root = Path(get_settings().DATA_ROOT)
    source = ManifestSource(kind="commons", name="elsewhere", path="../nowhere")
    write_manifest(data_root, Manifest(sources=[source]))
    deps.reset_store()
    store = deps.get_store()
    assert store.commons is not None and store.commons.root == commons_root


def test_no_manifest_no_commons(store: Store) -> None:
    assert store.commons is None
    assert deps.build_commons() is None


SCHEMA_DIR = Path(__file__).resolve().parents[3] / "schema" / "v1"


def test_help_lists_every_subcommand(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        main(["--help"])
    usage = capsys.readouterr().out
    for command in (
        "validate",
        "schema",
        "sites",
        "import",
        "tiles",
        "sitemap-osm",
        "stickmap",
        "media",
    ):
        assert command in usage


def test_schema_openapi_writes_the_api_document(tmp_path: Path) -> None:
    target = tmp_path / "out" / "openapi.json"
    code, output = run("schema", "openapi", str(target))
    assert code == 0
    assert output.strip() == str(target)
    document = json.loads(target.read_text(encoding="utf-8"))
    assert document["openapi"].startswith("3.")
    assert "/api/v1/version" in document["paths"]
    assert "VersionOut" in document["components"]["schemas"]


def test_schema_openapi_to_stdout() -> None:
    code, output = run("schema", "openapi", "-")
    assert code == 0
    assert json.loads(output)["info"]["title"].endswith("API")


@pytest.mark.skipif(not SCHEMA_DIR.is_dir(), reason="outside the monorepo checkout")
def test_committed_schemas_match_a_fresh_export(tmp_path: Path) -> None:
    run("schema", "export", str(tmp_path))
    fresh = {p.name: p.read_text(encoding="utf-8") for p in (tmp_path / "v1").glob("*.json")}
    committed = {p.name: p.read_text(encoding="utf-8") for p in SCHEMA_DIR.glob("*.json")}
    assert committed == fresh, "schema/v1 is stale: run `divelog schema export schema`"
