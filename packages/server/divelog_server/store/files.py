"""Read and write the Markdown-with-frontmatter and JSON files of the data repository."""

import json
import os
import re
from pathlib import Path
from typing import Any

import yaml

_FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.S)


def read_markdown(path: Path) -> tuple[dict[str, Any], str]:
    """Return (frontmatter, body) for a Markdown file; a file without frontmatter is all body."""
    text = path.read_text(encoding="utf-8")
    match = _FRONTMATTER.match(text)
    if match is None:
        return {}, text
    meta = yaml.safe_load(match.group(1)) or {}
    if not isinstance(meta, dict):
        raise ValueError(f"{path}: frontmatter is not a mapping")
    return meta, match.group(2).lstrip("\n")


def render_markdown(meta: dict[str, Any], body: str) -> str:
    """Serialise frontmatter and body; key order is preserved so diffs stay readable."""
    front = yaml.safe_dump(meta, sort_keys=False, allow_unicode=True, width=100)
    text = body.rstrip()
    return f"---\n{front}---\n\n{text}\n" if text else f"---\n{front}---\n"


def write_markdown(path: Path, meta: dict[str, Any], body: str) -> None:
    write_text(path, render_markdown(meta, body))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(payload, indent=1, ensure_ascii=False) + "\n")


def write_text(path: Path, text: str) -> None:
    """Atomic write: a hidden temp file in the same directory, then rename over the target."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.tmp"
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def remove(path: Path) -> None:
    if path.exists():
        path.unlink()
