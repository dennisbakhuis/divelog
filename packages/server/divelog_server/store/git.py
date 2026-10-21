"""Commit and push the data repository after admin writes.

Every write becomes one commit authored by the owner. Pushing happens in the background: fetch
and rebase after the local commit (so a dirty tree never blocks it), then push, with a short
retry ladder. A rebase conflict is aborted and reported; the store keeps serving local data.

One repository lock (:attr:`GitRepo.lock`, which the store writes under) covers the file writes,
the commit, the rebase and the fast-forward pull, so a background rebase never runs while a
writer changes files or commits; fetching and pushing need no lock. A commit made while a push
is running is pushed by that same background task before it ends.
"""

import asyncio
import logging
import os
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

BACKOFF_SECONDS = (2, 8, 30)


class GitRepo:
    """A git working tree the store writes to, or with ``readonly`` only pulls into.

    A read-only repository (the site commons checkout) never commits or pushes; it can pull
    and report its head and state.
    """

    def __init__(
        self,
        root: Path,
        *,
        author_name: str,
        author_email: str,
        enabled: bool = True,
        ssh_key_path: str = "",
        readonly: bool = False,
    ) -> None:
        self.root = root
        self.author_name = author_name
        self.author_email = author_email
        self.author = f"{author_name} <{author_email}>"
        self.enabled = enabled
        self.readonly = readonly
        self.ssh_key_path = ssh_key_path
        self.state = "clean" if enabled else "disabled"
        self.last_error: str | None = None
        self.last_push_at: datetime | None = None
        self._push_lock = asyncio.Lock()
        self.lock = asyncio.Lock()
        self._pending: asyncio.Task[bool] | None = None
        self._unpushed = False

    def _env(self) -> dict[str, str]:
        """Environment for git: the owner as author and committer, and the deploy key for SSH.

        A container has no ``user.name`` or ``user.email`` configured, and git refuses to
        commit or rebase without a committer identity.
        """
        env = dict(os.environ)
        env["GIT_AUTHOR_NAME"] = self.author_name
        env["GIT_AUTHOR_EMAIL"] = self.author_email
        env["GIT_COMMITTER_NAME"] = self.author_name
        env["GIT_COMMITTER_EMAIL"] = self.author_email
        if self.ssh_key_path and Path(self.ssh_key_path).exists():
            env["GIT_SSH_COMMAND"] = (
                f"ssh -i {self.ssh_key_path} -o IdentitiesOnly=yes "
                "-o StrictHostKeyChecking=accept-new"
            )
        return env

    async def _run(self, *args: str) -> tuple[int, str]:
        proc = await asyncio.create_subprocess_exec(
            "git",
            "-C",
            str(self.root),
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=self._env(),
        )
        out, _ = await proc.communicate()
        return proc.returncode or 0, out.decode(errors="replace").strip()

    async def is_repo(self) -> bool:
        if not self.enabled:
            return False
        code, _ = await self._run("rev-parse", "--is-inside-work-tree")
        return code == 0

    async def commit(self, message: str) -> bool:
        """Stage everything and commit; returns False when there was nothing to commit.

        The caller holds :attr:`lock` around its file writes and this call. A failed ``add`` or
        ``commit`` puts the repository in the ``error`` state; a reported rebase conflict stays
        the state until a push gets through.
        """
        if not self.enabled or self.readonly:
            return False
        code, out = await self._run("add", "-A")
        if code != 0:
            self._fail("git add failed", out)
            return False
        code, out = await self._run("diff", "--cached", "--quiet")
        if code == 0:
            return False
        code, out = await self._run("commit", "-q", "--author", self.author, "-m", message)
        if code != 0:
            self._fail("git commit failed", out)
            return False
        if self.state != "conflict":
            self.state = "unpushed"
        self._unpushed = True
        self.schedule_push()
        return True

    def _fail(self, what: str, out: str) -> None:
        self.state = "error"
        self.last_error = out
        logger.error("%s: %s", what, out)

    def schedule_push(self) -> None:
        """Start a background push unless one is already running."""
        if not self.enabled or self.readonly:
            return
        if self._pending is None or self._pending.done():
            self._pending = asyncio.create_task(self.push())

    async def has_remote(self) -> bool:
        code, out = await self._run("remote")
        return code == 0 and bool(out.strip())

    async def push(self) -> bool:
        """Rebase on the remote and push, retrying transient failures.

        Commits that land while an attempt runs are pushed by another round before returning.
        """
        if not self.enabled or self.readonly or not await self.has_remote():
            return False
        async with self._push_lock:
            pushed = False
            self._unpushed = True
            while self._unpushed:
                self._unpushed = False
                pushed = await self._push_once()
                if not pushed:
                    return False
            return pushed

    async def _push_once(self) -> bool:
        self.state = "pushing"
        for attempt, delay in enumerate((*BACKOFF_SECONDS, None)):
            code, out = await self._run("fetch", "--quiet")
            if code == 0:
                code, out = await self._rebase()
                if code != 0 and "conflict" in out.lower():
                    self.state = "conflict"
                    self.last_error = out
                    logger.error("git rebase conflict: %s", out)
                    return False
            if code == 0:
                code, out = await self._run("push", "--quiet")
                if code == 0:
                    self.state = "unpushed" if self._unpushed else "clean"
                    self.last_error = None
                    self.last_push_at = datetime.now(UTC)
                    return True
            self.last_error = out
            logger.warning("git push attempt %d failed: %s", attempt + 1, out)
            if delay is None:
                break
            await asyncio.sleep(delay)
        self.state = "unpushed"
        return False

    async def _rebase(self) -> tuple[int, str]:
        """Replay local commits on the fetched upstream; a failed rebase is aborted."""
        async with self.lock:
            code, out = await self._run("rebase", "--quiet")
            if code != 0:
                await self._run("rebase", "--abort")
        return code, out

    async def pull(self) -> tuple[bool, str]:
        """Fast-forward to the remote so edits made elsewhere reach the running store."""
        if not self.enabled:
            return False, "git disabled"
        if not await self.has_remote():
            return False, "no remote configured"
        async with self.lock:
            code, out = await self._run("pull", "--ff-only", "--quiet")
        return code == 0, out

    async def status(self) -> dict[str, object]:
        if not self.enabled:
            return {"state": "disabled", "ahead": 0, "behind": 0, "head": None}
        _, head = await self._run("rev-parse", "--short", "HEAD")
        ahead = behind = 0
        code, counts = await self._run("rev-list", "--left-right", "--count", "HEAD...@{u}")
        if code == 0 and counts:
            left, right = counts.split()
            ahead, behind = int(left), int(right)
        _, dirty = await self._run("status", "--porcelain")
        state = self.state
        if self.readonly:
            state = "dirty" if dirty else "behind" if behind else "clean"
        elif state in ("clean", "unpushed"):
            state = "unpushed" if ahead or dirty else "clean"
        return {
            "state": state,
            "ahead": ahead,
            "behind": behind,
            "head": head or None,
            "dirty": bool(dirty),
            "last_push_at": self.last_push_at.isoformat() if self.last_push_at else None,
            "last_error": self.last_error,
        }
