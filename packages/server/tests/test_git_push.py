"""GitRepo's background push: commits during a push, the repository lock and error states."""

import asyncio
import os
import subprocess
from pathlib import Path

import pytest

from divelog_server.store import git as git_module
from divelog_server.store.git import GitRepo

IDENTITY = {
    "GIT_AUTHOR_NAME": "Sam",
    "GIT_AUTHOR_EMAIL": "sam@example.org",
    "GIT_COMMITTER_NAME": "Sam",
    "GIT_COMMITTER_EMAIL": "sam@example.org",
}


def _git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(root), *args],
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, **IDENTITY},
    ).stdout.strip()


@pytest.fixture(autouse=True)
def no_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(git_module, "BACKOFF_SECONDS", ())


@pytest.fixture
def remote(tmp_path: Path) -> Path:
    """A bare remote with one commit on ``main``."""
    bare = tmp_path / "remote.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(bare)], check=True)
    seed = tmp_path / "seed"
    subprocess.run(["git", "clone", "-q", str(bare), str(seed)], check=True, capture_output=True)
    (seed / "a.md").write_text("a\n")
    _git(seed, "add", "-A")
    _git(seed, "commit", "-q", "-m", "init")
    _git(seed, "push", "-q", "origin", "HEAD:main")
    return bare


def _clone(remote: Path, to: Path) -> GitRepo:
    subprocess.run(["git", "clone", "-q", str(remote), str(to)], check=True, capture_output=True)
    return GitRepo(to, author_name="Sam", author_email="sam@example.org")


def _remote_log(remote: Path) -> list[str]:
    return _git(remote, "log", "--format=%s", "main").splitlines()


async def test_a_commit_during_a_push_is_pushed_by_the_same_task(
    remote: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _clone(remote, tmp_path / "work")
    real_run = repo._run
    pushing = asyncio.Event()
    release = asyncio.Event()

    async def slow_run(*args: str) -> tuple[int, str]:
        if args[0] == "push" and not pushing.is_set():
            pushing.set()
            await release.wait()
        return await real_run(*args)

    monkeypatch.setattr(repo, "_run", slow_run)
    (repo.root / "b.md").write_text("b\n")
    async with repo.lock:
        assert await repo.commit("B")
    await pushing.wait()
    (repo.root / "c.md").write_text("c\n")
    async with repo.lock:
        assert await repo.commit("C")
    release.set()
    assert repo._pending is not None
    assert await repo._pending is True
    assert _remote_log(remote)[:2] == ["C", "B"]
    assert repo.state == "clean"


async def test_the_rebase_waits_for_a_writer_holding_the_lock(
    remote: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = _clone(remote, tmp_path / "work")
    real_run = repo._run
    calls: list[str] = []

    async def recording_run(*args: str) -> tuple[int, str]:
        calls.append(args[0])
        return await real_run(*args)

    monkeypatch.setattr(repo, "_run", recording_run)
    async with repo.lock:
        (repo.root / "b.md").write_text("b\n")
        assert await repo.commit("B")
        for _ in range(50):
            await asyncio.sleep(0.01)
            if "fetch" in calls:
                break
        await asyncio.sleep(0.1)
        assert "rebase" not in calls
    assert repo._pending is not None
    assert await repo._pending is True
    assert "rebase" in calls
    assert _remote_log(remote)[0] == "B"


async def test_a_failed_add_is_an_error(tmp_path: Path) -> None:
    root = tmp_path / "work"
    root.mkdir()
    _git(root, "init", "-q")
    (root / "a.md").write_text("a\n")
    (root / ".git" / "index.lock").write_text("")
    repo = GitRepo(root, author_name="Sam", author_email="sam@example.org")
    assert await repo.commit("A") is False
    assert repo.state == "error"
    assert repo.last_error and "index.lock" in repo.last_error


async def test_a_conflict_is_not_masked_by_the_next_commit(remote: Path, tmp_path: Path) -> None:
    other = tmp_path / "other"
    subprocess.run(["git", "clone", "-q", str(remote), str(other)], check=True)
    (other / "a.md").write_text("theirs\n")
    _git(other, "commit", "-q", "-am", "theirs")
    _git(other, "push", "-q")
    repo = _clone(remote, tmp_path / "work")
    _git(repo.root, "reset", "-q", "--hard", "origin/main~1")
    (repo.root / "a.md").write_text("mine\n")
    async with repo.lock:
        assert await repo.commit("mine")
    assert repo._pending is not None
    assert await repo._pending is False
    assert repo.state == "conflict"

    (repo.root / "b.md").write_text("b\n")
    async with repo.lock:
        assert await repo.commit("B")
    assert repo.state == "conflict"
    assert await repo._pending is False
    assert repo.state == "conflict"
    assert (await repo.status())["state"] == "conflict"
