from pathlib import Path

import pytest

from divelog_server.core.config import get_settings
from divelog_server.store.files import write_markdown
from divelog_server.store.manifest import read_manifest, write_manifest
from tests.commons_repos import COMMONS_SITE, Repos, build_repos, run

LAPTOP_PATH = "../divelog-sites"
SET_IT = "--commons PATH, the COMMONS_ROOT environment variable, or the path of the commons source"


@pytest.fixture
def repos(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Repos:
    """A log with an overlay whose ``divelog.yaml`` names a commons path that is not there."""
    repos = build_repos(tmp_path)
    manifest = read_manifest(repos.log)
    assert manifest is not None
    source = manifest.commons_source()
    assert source is not None
    source.path = LAPTOP_PATH
    write_manifest(repos.log, manifest)
    write_markdown(
        repos.log / "sites" / f"{COMMONS_SITE}.md",
        {"site_id": COMMONS_SITE, "extends": "commons", "notes": "Owner note."},
        "",
    )
    commons_env(monkeypatch, None)
    return repos


def commons_env(monkeypatch: pytest.MonkeyPatch, value: Path | str | None) -> None:
    """Set ``COMMONS_ROOT`` to ``value``, or unset it for None, and drop the cached settings."""
    if value is None:
        monkeypatch.delenv("COMMONS_ROOT", raising=False)
    else:
        monkeypatch.setenv("COMMONS_ROOT", str(value))
    get_settings.cache_clear()


def test_commons_root_lets_validate_find_the_commons(
    repos: Repos, monkeypatch: pytest.MonkeyPatch
) -> None:
    commons_env(monkeypatch, repos.commons)
    code, output = run("validate", str(repos.log))
    assert code == 0, output
    assert "has no commons record" not in output
    assert "valid log repository" in output


def test_commons_root_lets_sites_status_find_the_commons(
    repos: Repos, monkeypatch: pytest.MonkeyPatch
) -> None:
    commons_env(monkeypatch, repos.commons)
    code, output = run("sites", "status", str(repos.log))
    assert code == 0, output
    assert "3 sites: 2 log, 1 commons, 0 fork" in output


def test_an_empty_commons_root_is_not_set(repos: Repos, monkeypatch: pytest.MonkeyPatch) -> None:
    commons_env(monkeypatch, "")
    code, output = run("validate", str(repos.log))
    assert code == 1
    assert "named by the commons source path in divelog.yaml" in output


def test_commons_option_wins_over_commons_root(
    repos: Repos, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    commons_env(monkeypatch, tmp_path / "elsewhere")
    for command in (["validate"], ["sites", "status"]):
        code, output = run(*command, "--commons", str(repos.commons), str(repos.log))
        assert code == 0, output
    assert "1 commons" in output


def test_a_missing_commons_option_is_not_replaced_by_commons_root(
    repos: Repos, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    commons_env(monkeypatch, repos.commons)
    missing = tmp_path / "typo"
    code, output = run("validate", "--commons", str(missing), str(repos.log))
    assert code == 1
    assert f"the commons checkout {missing} does not exist (named by --commons)" in output


@pytest.mark.parametrize("command", [["validate"], ["sites", "status"]])
def test_nothing_set_names_the_path_and_how_to_set_it(repos: Repos, command: list[str]) -> None:
    code, output = run(*command, str(repos.log))
    assert code == 1
    missing = (repos.log / LAPTOP_PATH).resolve()
    assert f"the commons checkout {missing} does not exist" in output
    assert "named by the commons source path in divelog.yaml" in output
    assert SET_IT in output
    assert "has no commons record" not in output


def test_a_missing_commons_root_is_named(
    repos: Repos, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    commons_env(monkeypatch, tmp_path / "data" / "commons")
    code, output = run("sites", "status", str(repos.log))
    assert code == 1
    assert f"{tmp_path / 'data' / 'commons'} does not exist" in output
    assert "named by the COMMONS_ROOT environment variable" in output


def test_a_log_without_a_commons_source_validates_without_one(
    repos: Repos, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest = read_manifest(repos.log)
    assert manifest is not None
    manifest.sources = []
    write_manifest(repos.log, manifest)
    (repos.log / "sites" / f"{COMMONS_SITE}.md").unlink()
    code, output = run("sites", "status", str(repos.log))
    assert code == 0, output
    assert "0 commons" in output


def test_commons_pull_reads_commons_root(repos: Repos, monkeypatch: pytest.MonkeyPatch) -> None:
    code, output = run("commons", "pull", "--log", str(repos.log))
    assert code == 1
    assert SET_IT in output
    commons_env(monkeypatch, repos.commons)
    code, output = run("commons", "pull", "--log", str(repos.log))
    assert code == 0, output
    assert "divelog.yaml pinned at" in output
