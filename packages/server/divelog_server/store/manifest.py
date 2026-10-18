"""The ``divelog.yaml`` manifest at the root of a log or commons repository, and the photo manifest.

A log repository names the site commons it layers on (``sources``); a commons repository says it
is one (``kind: sites``). ``media/manifest.json`` records where each publishable photo came from
and under which licence.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field

from divelog_server.core.config import get_settings

MANIFEST_FILE = "divelog.yaml"
MEDIA_MANIFEST = "media/manifest.json"


class ManifestSource(BaseModel):
    """A site source a log repository layers on; ``path`` is relative to the log root."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["commons"]
    name: str = Field(min_length=1)
    path: str | None = None
    ref: str | None = None


DATA_FORMAT = 1


class Manifest(BaseModel):
    """``divelog.yaml``: the data format version, what the repository is, and its sources."""

    model_config = ConfigDict(extra="forbid")

    format: Literal[1] = 1
    kind: Literal["log", "sites"] = "log"
    name: str | None = None
    sources: list[ManifestSource] = Field(default_factory=list)

    def commons_source(self) -> ManifestSource | None:
        """The first commons source, or None."""
        return next((s for s in self.sources if s.kind == "commons"), None)


class MediaManifestEntry(BaseModel):
    """One photo in ``media/manifest.json``: origin, author, licence and whether it may be shown."""

    model_config = ConfigDict(extra="allow")

    source: str = ""
    page: str = ""
    author: str = ""
    licence: str = ""
    public: bool = False


def read_manifest(root: Path) -> Manifest | None:
    """The manifest of the repository at ``root``, or None when it has none.

    Raises
    ------
    ValueError
        The file exists but is not a valid manifest.
    """
    path = root / MANIFEST_FILE
    if not path.is_file():
        return None
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        raise ValueError(f"{MANIFEST_FILE}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{MANIFEST_FILE}: not a mapping")
    return Manifest.model_validate(payload)


def manifest_payload(manifest: Manifest) -> dict[str, Any]:
    """The manifest as it is written: no empty or unset keys."""
    payload = manifest.model_dump(mode="json", exclude_none=True)
    if not payload.get("sources"):
        payload.pop("sources", None)
    return payload


def write_manifest(root: Path, manifest: Manifest) -> None:
    """Write ``divelog.yaml`` at ``root``."""
    text = yaml.safe_dump(manifest_payload(manifest), sort_keys=False, allow_unicode=True)
    (root / MANIFEST_FILE).write_text(text, encoding="utf-8")


def commons_root_for(log_root: Path, manifest: Manifest | None) -> Path | None:
    """The commons checkout a log manifest points at, resolved against the log root, or None."""
    source = manifest.commons_source() if manifest else None
    if source is None or not source.path:
        return None
    return (log_root / source.path).resolve()


CommonsVia = Literal["--commons", "COMMONS_ROOT", "divelog.yaml"]


@dataclass(frozen=True)
class CommonsLocation:
    """Where the commons checkout of a log is, and which setting named it."""

    root: Path
    via: CommonsVia


def locate_commons(
    log_root: Path, manifest: Manifest | None, commons: Path | None = None
) -> CommonsLocation | None:
    """The commons checkout of a log, as the server and every CLI command find it.

    The order is: ``commons`` (the ``--commons`` option), else the ``COMMONS_ROOT`` setting
    when it is non-empty, else the ``path`` of the manifest's commons source, relative to the
    log root. The path is not checked.

    Returns
    -------
    CommonsLocation or None
        None when none of the three names a commons.
    """
    if commons is not None:
        return CommonsLocation(commons, "--commons")
    configured = get_settings().COMMONS_ROOT.strip()
    if configured:
        return CommonsLocation(Path(configured), "COMMONS_ROOT")
    found = commons_root_for(log_root, manifest)
    return CommonsLocation(found, "divelog.yaml") if found is not None else None


LICENCE_ALLOWLIST = frozenset(
    {
        "CC0-1.0",
        "CC-BY-4.0",
        "CC-BY-SA-4.0",
        "CC-BY-3.0",
        "CC-BY-SA-3.0",
        "CC-BY-2.5",
        "CC-BY-SA-2.5",
        "CC-BY-2.0",
        "CC-BY-SA-2.0",
        "PDM",
    }
)
LICENCES: dict[str, tuple[str, str]] = {
    "CC0-1.0": ("CC0 1.0 Universal", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "PDM": ("Public Domain Mark 1.0", "https://creativecommons.org/publicdomain/mark/1.0/"),
    "CC-BY-4.0": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
    "CC-BY-SA-4.0": ("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"),
    "CC-BY-3.0": ("CC BY 3.0", "https://creativecommons.org/licenses/by/3.0/"),
    "CC-BY-SA-3.0": ("CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"),
    "CC-BY-2.5": ("CC BY 2.5", "https://creativecommons.org/licenses/by/2.5/"),
    "CC-BY-SA-2.5": ("CC BY-SA 2.5", "https://creativecommons.org/licenses/by-sa/2.5/"),
    "CC-BY-2.0": ("CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/"),
    "CC-BY-SA-2.0": ("CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/"),
}
"""Name and deed URL of every allowlisted licence, most open first."""
_PUBLIC_DOMAIN = {"PDM", "PDM-1.0", "PUBLIC-DOMAIN", "PUBLIC-DOMAIN-MARK", "PUBLIC-DOMAIN-MARK-1.0"}


def normalise_licence(text: str | None) -> str | None:
    """The allowlisted id a licence string spells (``CC BY 2.0`` → ``CC-BY-2.0``), or None."""
    if not text:
        return None
    spelled = "-".join(text.strip().upper().split())
    spelled = spelled.removesuffix("-INTERNATIONAL").removesuffix("-GENERIC")
    if spelled in _PUBLIC_DOMAIN:
        return "PDM"
    if spelled == "CC0":
        return "CC0-1.0"
    return spelled if spelled in LICENCE_ALLOWLIST else None


class MediaManifest:
    """``media/manifest.json`` in either of its shapes, keyed by repository-relative path.

    The commons shape maps ``media/sites/<file>`` to an entry; the older log shape nests
    entries under ``sites`` by site id, each naming its ``file`` in ``media/sites/``.

    Parameters
    ----------
    payload
        The parsed JSON, or None for a repository without a manifest.
    """

    def __init__(self, payload: Any = None) -> None:
        self.payload: dict[str, Any] = payload if isinstance(payload, dict) else {}
        self.nested = isinstance(self.payload.get("sites"), dict)
        self._keys: dict[str, str] = {}
        self.entries: dict[str, dict[str, Any]] = {}
        for key, entry in self._table().items():
            if not isinstance(entry, dict):
                continue
            path = media_path(str(entry.get("file", ""))) if self.nested else key
            if path:
                self.entries[path] = entry
                self._keys[path] = key

    def _table(self) -> dict[str, Any]:
        table = self.payload["sites"] if self.nested else self.payload
        return table if isinstance(table, dict) else {}

    def remove(self, path: str) -> None:
        """Drop the entry of ``path``."""
        key = self._keys.pop(path, None)
        self.entries.pop(path, None)
        if key is not None:
            self._table().pop(key, None)


def media_path(file: str) -> str:
    """The repository-relative path of a file named in the nested manifest shape."""
    if not file:
        return ""
    return file if file.startswith("media/") else f"media/sites/{file}"
