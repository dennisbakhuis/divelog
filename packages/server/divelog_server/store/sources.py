"""Where site knowledge comes from: the personal log repository and the shared commons.

Both expose the same shape (:class:`SiteSource`): sites, regions, drawn maps and seed sketches
loaded from a repository checkout, with publishable files and the checked-out commit.
"""

import re
from pathlib import Path
from typing import Protocol

import yaml

from divelog_server.store.git import GitRepo
from divelog_server.store.loader import Loader, git_head
from divelog_server.store.models import (
    MediaRef,
    RegionRecord,
    SiteMapRecord,
    SiteOverlayRecord,
    SiteRecord,
)

PUBLIC_REPO_DIRS = ("maps/seed", "media")
REPO_PREFIX = "repo:"
COMMONS_PREFIX = "commons:"
PERSONAL_MAP_ID = re.compile(r"-p\d+$")


class SiteSource(Protocol):
    """A repository that contributes sites, regions and maps to the store."""

    name: str
    root: Path
    writable: bool
    sites: dict[str, SiteRecord]
    regions: dict[str, RegionRecord]
    maps: dict[str, SiteMapRecord]
    seed_maps: set[str]

    def load(self) -> list[str]:
        """Read the repository; returns the load errors."""
        ...

    def public_file(self, relative: str) -> Path | None:
        """A publishable file of the repository, or None."""
        ...

    def head(self) -> str | None:
        """The checked-out commit, or None outside git."""
        ...


def public_file_under(root: Path, relative: str) -> Path | None:
    """A file under one of the publishable directories of ``root``, or None."""
    if ".." in relative or relative.startswith("/"):
        return None
    if not any(relative.startswith(prefix + "/") for prefix in PUBLIC_REPO_DIRS):
        return None
    path = root / relative
    return path if path.is_file() else None


class _RepoSites:
    """The site folders every source shares: sites, regions, drawn maps, seed sketches."""

    name: str
    writable: bool

    def __init__(self, root: Path, label: str = "") -> None:
        self.root = root
        self.label = label
        self.sites: dict[str, SiteRecord] = {}
        self.regions: dict[str, RegionRecord] = {}
        self.maps: dict[str, SiteMapRecord] = {}
        self.seed_maps: set[str] = set()
        self._head: str | None = None

    def site_path(self, site_id: str) -> Path:
        """``sites/<id>.md``: a full record or, in the log, an overlay."""
        return self.root / "sites" / f"{site_id}.md"

    def region_path(self, region_id: str) -> Path:
        """``regions/<id>.md``."""
        return self.root / "regions" / f"{region_id}.md"

    def map_path(self, map_id: str) -> Path:
        """``maps/drawn/<id>.json``."""
        return self.root / "maps" / "drawn" / f"{map_id}.json"

    def _load_common(self, loader: Loader) -> None:
        self.regions = loader.markdown("regions", RegionRecord, key="region")
        self.maps = loader.json_dir("maps/drawn", SiteMapRecord, key="id")
        self.seed_maps = {p.stem for p in (self.root / "maps" / "seed").glob("*.json")}
        self._head = git_head(self.root)

    def public_file(self, relative: str) -> Path | None:
        """A file under ``maps/seed`` or ``media`` of this repository, or None."""
        return public_file_under(self.root, relative)

    def head(self) -> str | None:
        """The commit checked out at the last load, or None outside git."""
        return self._head


class LogSiteSource(_RepoSites):
    """The site part of the personal log: personal sites, forks, overlays, regions and maps.

    A site file with ``extends: commons`` is an overlay and lands in ``overlays``; every other
    site file is a full record (a fork when it carries ``forked_from`` or shadows a commons id).
    """

    name = "log"
    writable = True

    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.overlays: dict[str, SiteOverlayRecord] = {}

    def load(self) -> list[str]:
        """Read sites, overlays, regions and maps; returns the load errors."""
        loader = Loader(self.root)
        self.sites = {}
        self.overlays = {}
        for path, payload in loader.markdown_files("sites"):
            if payload.get("extends") == "commons":
                overlay = loader.validate(path, SiteOverlayRecord, payload)
                if overlay is not None:
                    self.overlays[overlay.site_id] = overlay
                continue
            record = loader.validate(path, SiteRecord, payload)
            if record is not None:
                self.sites[record.site_id] = record
        self._load_common(loader)
        return loader.errors


class CommonsSource(_RepoSites):
    """A read-only checkout of a shared site repository (``COMMONS_ROOT``).

    Photos referenced as ``repo:<path>`` inside the commons are rewritten to ``commons:<path>``
    so they resolve against this checkout, not the log.

    Parameters
    ----------
    root
        The checkout.
    git
        A read-only :class:`GitRepo` used to pull; a disabled one when omitted.
    name
        Shown in attributions; the manifest ``name`` or the folder name when omitted.
    """

    writable = False

    def __init__(self, root: Path, git: GitRepo | None = None, name: str | None = None) -> None:
        super().__init__(root, label="commons:")
        self.git = git or GitRepo(
            root, author_name="", author_email="", enabled=False, readonly=True
        )
        self.name = name or self._manifest_name() or root.name

    def _manifest_name(self) -> str | None:
        manifest = self.root / "divelog.yaml"
        if not manifest.is_file():
            return None
        meta = yaml.safe_load(manifest.read_text(encoding="utf-8"))
        value = meta.get("name") if isinstance(meta, dict) else None
        return str(value) if value else None

    def load(self) -> list[str]:
        """Read sites, regions and maps of the commons; returns the load errors."""
        loader = Loader(self.root, label=self.label)
        self.sites = {}
        for path, payload in loader.markdown_files("sites"):
            if "extends" in payload or payload.get("forked_from"):
                loader.error(path, "overlays and forks do not belong in the commons")
                continue
            record = loader.validate(path, SiteRecord, payload)
            if record is None:
                continue
            record.media = [commons_media(m) for m in record.media]
            self.sites[record.site_id] = record
        self._load_common(loader)
        for map_id in self.maps:
            if PERSONAL_MAP_ID.search(map_id):
                loader.errors.append(f"{self.label}maps/drawn/{map_id}.json: personal map id")
        return loader.errors


def commons_media(media: MediaRef) -> MediaRef:
    """A commons photo with its ``repo:`` key pointed at the commons checkout."""
    if media.key.startswith(REPO_PREFIX):
        media.key = COMMONS_PREFIX + media.key[len(REPO_PREFIX) :]
    return media
