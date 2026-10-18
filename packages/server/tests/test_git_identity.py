"""GitRepo commits without any git identity configured on the host."""

import os
import subprocess
from pathlib import Path

import pytest

from divelog_server.store.git import GitRepo


def _git(root: Path, *args: str, env: dict[str, str]) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *args], check=True, capture_output=True, text=True, env=env
    ).stdout.strip()


@pytest.fixture
def anonymous_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, str]:
    """An environment where git knows no user at all, like a fresh container."""
    for name in (
        "GIT_AUTHOR_NAME",
        "GIT_AUTHOR_EMAIL",
        "GIT_COMMITTER_NAME",
        "GIT_COMMITTER_EMAIL",
        "EMAIL",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(tmp_path / "home" / "no-gitconfig"))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    (tmp_path / "home").mkdir()
    return dict(os.environ)


async def test_commit_uses_the_owner_as_author_and_committer(
    tmp_path: Path, anonymous_env: dict[str, str]
) -> None:
    root = tmp_path / "log"
    root.mkdir()
    _git(root, "init", "-q", env=anonymous_env)
    (root / "dive.md").write_text("hello\n")

    repo = GitRepo(root, author_name="Sam Example", author_email="sam@example.org")
    assert await repo.commit("Log a dive") is True

    env = repo._env()
    assert _git(root, "log", "-1", "--format=%an <%ae>", env=env) == "Sam Example <sam@example.org>"
    assert _git(root, "log", "-1", "--format=%cn <%ce>", env=env) == "Sam Example <sam@example.org>"
