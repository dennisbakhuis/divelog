"""Read the files of a repository as they were at a git revision, without checking it out.

The commons CI compares a pull request with its base: these helpers list the tree of a ref and
read blobs in one ``git cat-file --batch`` process. Paths are relative to ``root``, which may be a
subdirectory of the repository.
"""

import subprocess
from collections.abc import Callable, Iterable
from pathlib import Path


class GitFilesError(RuntimeError):
    """``root`` is not inside a git repository or ``ref`` does not name a commit."""


def _git(root: Path, *args: str, stdin: bytes | None = None) -> bytes:
    try:
        done = subprocess.run(
            ["git", "-C", str(root), *args],
            input=stdin,
            capture_output=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise GitFilesError(f"git {args[0]}: {exc}") from exc
    if done.returncode != 0:
        message = done.stderr.decode(errors="replace").strip() or f"git {args[0]} failed"
        raise GitFilesError(message)
    return done.stdout


class GitTree:
    """The files under ``root`` at commit ``ref``.

    Parameters
    ----------
    root
        A directory inside a git working tree; listed and read paths are relative to it.
    ref
        Anything ``git rev-parse`` resolves to a commit (``HEAD``, ``origin/main``, a sha).

    Raises
    ------
    GitFilesError
        ``root`` is not in a repository or ``ref`` is unknown.
    """

    def __init__(self, root: Path, ref: str) -> None:
        self.root = root
        self.ref = ref
        self.prefix = _git(root, "rev-parse", "--show-prefix").decode().strip()
        try:
            resolved = _git(root, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}")
        except GitFilesError as exc:
            raise GitFilesError(f"unknown revision {ref!r}") from exc
        self.commit = resolved.decode().strip()

    def paths(self) -> list[str]:
        """Every file path of the tree, relative to ``root``, sorted."""
        args = ["ls-tree", "-r", "-z", "--name-only", "--full-tree", self.commit]
        if self.prefix:
            args += ["--", self.prefix]
        listed = _git(self.root, *args).decode().split("\0")
        return sorted(p[len(self.prefix) :] for p in listed if p)

    def read(self, paths: Iterable[str]) -> dict[str, bytes]:
        """The contents of ``paths`` at the ref; missing paths are left out."""
        wanted = list(paths)
        if not wanted:
            return {}
        request = "".join(f"{self.commit}:{self.prefix}{p}\n" for p in wanted).encode()
        raw = _git(self.root, "cat-file", "--batch", stdin=request)
        found: dict[str, bytes] = {}
        offset = 0
        for path in wanted:
            end = raw.index(b"\n", offset)
            header = raw[offset:end].decode().split()
            offset = end + 1
            if header[-1] == "missing":
                continue
            size = int(header[2])
            found[path] = raw[offset : offset + size]
            offset += size + 1
        return found

    def materialise(self, dest: Path, content: Callable[[str], bool]) -> list[str]:
        """Write the tree into ``dest``: files ``content`` selects with their bytes, the rest empty.

        Empty placeholders keep listings (photos, seed maps) right without copying large blobs.
        Returns every path written.
        """
        paths = self.paths()
        blobs = self.read(p for p in paths if content(p))
        for path in paths:
            target = dest / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blobs.get(path, b""))
        return paths
