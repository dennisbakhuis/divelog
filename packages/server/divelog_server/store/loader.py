"""Generic readers that turn a repository folder into validated records.

A file that fails to parse or validate is reported in ``errors`` and skipped, never fatal; the
same loader serves the personal log and the site commons.
"""

import subprocess
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from divelog_server.store.files import read_json, read_markdown


class Loader:
    """Reads Markdown and JSON records under ``root`` and collects what went wrong.

    Parameters
    ----------
    root
        The repository checkout.
    label
        Prefix for error messages, so errors of a second repository can be told apart.
    """

    def __init__(self, root: Path, label: str = "") -> None:
        self.root = root
        self.label = label
        self.errors: list[str] = []

    def where(self, path: Path) -> str:
        """The path as reported in errors: relative to the root, with the label in front."""
        return f"{self.label}{path.relative_to(self.root)}"

    def error(self, path: Path, message: str) -> None:
        """Record a problem with one file."""
        self.errors.append(f"{self.where(path)}: {message}")

    def markdown_files(self, folder: str) -> list[tuple[Path, dict[str, Any]]]:
        """Every ``*.md`` in ``folder`` (READMEs skipped) as ``(path, frontmatter + body_md)``."""
        found: list[tuple[Path, dict[str, Any]]] = []
        for path in sorted((self.root / folder).glob("*.md")):
            if path.stem.upper() == "README":
                continue
            try:
                meta, body = read_markdown(path)
            except Exception as exc:
                self.errors.append(f"{self.where(path)}: {exc}")
                continue
            found.append((path, {**meta, "body_md": body}))
        return found

    def markdown[T: BaseModel](self, folder: str, model: type[T], *, key: str) -> dict[Any, T]:
        """Records from the Markdown files of ``folder``, keyed by the field ``key``."""
        records: dict[Any, T] = {}
        for path, payload in self.markdown_files(folder):
            record = self.validate(path, model, payload)
            if record is not None:
                records[getattr(record, key)] = record
        return records

    def json_dir[T: BaseModel](self, folder: str, model: type[T], *, key: str) -> dict[Any, T]:
        """Records from the ``*.json`` files of ``folder``, one record per file."""
        records: dict[Any, T] = {}
        for path in sorted((self.root / folder).glob("*.json")):
            try:
                payload = read_json(path)
            except Exception as exc:
                self.errors.append(f"{self.where(path)}: {exc}")
                continue
            record = self.validate(path, model, payload)
            if record is not None:
                records[getattr(record, key)] = record
        return records

    def json_list[T: BaseModel](self, relative: str, model: type[T]) -> list[T]:
        """Records from one JSON file holding a list; a missing file is an empty list."""
        path = self.root / relative
        if not path.exists():
            return []
        items = read_json(path)
        result: list[T] = []
        for item in items if isinstance(items, list) else []:
            record = self.validate(path, model, item)
            if record is not None:
                result.append(record)
        return result

    def validate[T: BaseModel](self, path: Path, model: type[T], payload: Any) -> T | None:
        """``payload`` as a ``model``, or None with the first validation error recorded."""
        try:
            return model.model_validate(payload)
        except ValidationError as exc:
            first = exc.errors()[0]
            where = ".".join(str(p) for p in first["loc"])
            self.errors.append(f"{self.where(path)}: {where}: {first['msg']}")
            return None


def git_head(root: Path) -> str | None:
    """The short commit hash checked out at ``root`` when it is a git repository of its own."""
    if not (root / ".git").exists():
        return None
    try:
        done = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    head = done.stdout.strip()
    return head if done.returncode == 0 and head else None
