"""Validation of a log repository and of a site commons, as lists of ``path: message`` problems.

The commons rules (§1.6 of docs/MODULE.md) are pure functions over a loaded
:class:`CommonsTree`, so the CLI, commons CI and the API can run the same checks. Model rules
(field types, ``revision ≥ 1``, changelog order) are enforced while loading and come back as
problems of the file that broke them.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from divelog_server.store.files import read_json
from divelog_server.store.loader import Loader
from divelog_server.store.manifest import LICENCE_ALLOWLIST, MEDIA_MANIFEST, MediaManifest
from divelog_server.store.models import RegionRecord, SiteMapRecord, SiteRecord
from divelog_server.store.sources import COMMONS_PREFIX, PERSONAL_MAP_ID, REPO_PREFIX, CommonsSource
from divelog_server.store.store import Store

SITE_ID = re.compile(r"^[a-z]{3}-[a-z0-9-]+$")
PERSONAL_KEYS = ("notes", "prices", "reference_maps", "subsurface_uuid")
OVERLAY_KEYS = ("extends", "forked_from", "summary_override", "base_revision")
SAFE_UNDERLAYS = ("osm", "locator", "seed")
LONG_BODY = 400

_URL = re.compile(r"https?://\S+")
_FIRST_PERSON_CASED = re.compile(r"\b(?:I|I'm|I've)\b")
_FIRST_PERSON = re.compile(r"\b(?:my|me|we|our|us)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Problem:
    """One thing wrong with one file of a repository."""

    path: str
    message: str

    def __str__(self) -> str:
        return f"{self.path}: {self.message}"

    @classmethod
    def parse(cls, text: str) -> "Problem":
        """A loader error string (``path: message``) as a problem."""
        path, _, message = text.partition(": ")
        return cls(path, message) if message else cls("", text)


@dataclass
class SiteFile:
    """A site file of the commons: its path, raw frontmatter keys and validated record."""

    path: str
    keys: set[str]
    record: SiteRecord


@dataclass
class MapFile:
    """A drawn map file of the commons."""

    path: str
    record: SiteMapRecord


@dataclass
class CommonsTree:
    """Everything the commons rules look at, loaded once."""

    sites: list[SiteFile] = field(default_factory=list)
    regions: dict[str, RegionRecord] = field(default_factory=dict)
    maps: list[MapFile] = field(default_factory=list)
    seed_maps: set[str] = field(default_factory=set)
    manifest: dict[str, dict[str, Any]] = field(default_factory=dict)
    files: set[str] = field(default_factory=set)


def first_person(text: str | None) -> bool:
    """Whether ``text`` speaks in the first person (links are ignored)."""
    if not text:
        return False
    plain = _URL.sub(" ", text)
    return bool(_FIRST_PERSON_CASED.search(plain) or _FIRST_PERSON.search(plain))


def first_person_lines(text: str) -> list[tuple[int, str]]:
    """``(line number, line)`` for every line of ``text`` in the first person, from 1."""
    return [
        (number, line.strip())
        for number, line in enumerate(text.splitlines(), start=1)
        if first_person(line)
    ]


def load_commons_tree(root: Path) -> tuple[CommonsTree, list[Problem]]:
    """Read a commons checkout for the rules; files that fail their model are problems."""
    loader = Loader(root)
    tree = CommonsTree()
    for path, payload in loader.markdown_files("sites"):
        record = loader.validate(path, SiteRecord, payload)
        if record is not None:
            tree.sites.append(SiteFile(loader.where(path), set(payload), record))
    tree.regions = loader.markdown("regions", RegionRecord, key="region")
    for path in sorted((root / "maps" / "drawn").glob("*.json")):
        try:
            payload = read_json(path)
        except Exception as exc:
            loader.error(path, str(exc))
            continue
        map_record = loader.validate(path, SiteMapRecord, payload)
        if map_record is not None:
            tree.maps.append(MapFile(loader.where(path), map_record))
    tree.seed_maps = {p.stem for p in (root / "maps" / "seed").glob("*.json")}
    manifest_path = root / MEDIA_MANIFEST
    if manifest_path.is_file():
        try:
            tree.manifest = MediaManifest(read_json(manifest_path)).entries
        except Exception as exc:
            loader.error(manifest_path, str(exc))
    media = root / "media"
    tree.files = {
        str(p.relative_to(root))
        for p in media.rglob("*")
        if p.is_file() and p.name != "manifest.json" and not p.name.startswith(".")
    }
    return tree, [Problem.parse(e) for e in loader.errors]


def media_file(key: str) -> str | None:
    """The repository path a ``repo:``/``commons:`` key names, or None for storage keys."""
    for prefix in (REPO_PREFIX, COMMONS_PREFIX):
        if key.startswith(prefix):
            return key[len(prefix) :]
    return None


def check_site_ids(tree: CommonsTree) -> list[Problem]:
    """Site ids match ``^[a-z]{3}-[a-z0-9-]+$``, name their file and are unique."""
    problems: list[Problem] = []
    seen: dict[str, str] = {}
    for site in tree.sites:
        site_id = site.record.site_id
        if not SITE_ID.match(site_id):
            message = f"site id {site_id!r} does not match {SITE_ID.pattern}"
            problems.append(Problem(site.path, message))
        if Path(site.path).stem != site_id:
            problems.append(Problem(site.path, f"file name does not match site_id {site_id!r}"))
        if site_id in seen:
            problems.append(Problem(site.path, f"site id {site_id!r} also used by {seen[site_id]}"))
        seen.setdefault(site_id, site.path)
    return problems


def check_map_ids(tree: CommonsTree) -> list[Problem]:
    """Drawn map ids are commons ids (no ``-p<n>``), name their file and are unique."""
    problems: list[Problem] = []
    seen: dict[str, str] = {}
    for drawn in tree.maps:
        map_id = drawn.record.id
        if PERSONAL_MAP_ID.search(map_id):
            problems.append(Problem(drawn.path, f"personal map id {map_id!r} (-p<n>)"))
        if Path(drawn.path).stem != map_id:
            problems.append(Problem(drawn.path, f"file name does not match id {map_id!r}"))
        if map_id in seen:
            problems.append(Problem(drawn.path, f"map id {map_id!r} also used by {seen[map_id]}"))
        seen.setdefault(map_id, drawn.path)
    return problems


def check_references(tree: CommonsTree) -> list[Problem]:
    """Regions, maps, default maps, photos, map sites and underlays all resolve in the commons."""
    problems: list[Problem] = []
    site_ids = {s.record.site_id for s in tree.sites}
    drawn_ids = {m.record.id for m in tree.maps}
    media_ids: dict[str, str] = {}
    for site in tree.sites:
        record = site.record
        if record.region and record.region not in tree.regions:
            problems.append(Problem(site.path, f"region {record.region!r} does not exist"))
        refs = [*record.maps, *([record.default_map] if record.default_map else [])]
        for ref in refs:
            message = _map_ref_problem(ref, drawn_ids, tree.seed_maps)
            if message:
                problems.append(Problem(site.path, message))
        for media in record.media:
            if media.id in media_ids:
                problems.append(
                    Problem(site.path, f"photo id {media.id!r} also used by {media_ids[media.id]}")
                )
            media_ids.setdefault(media.id, site.path)
            path = media_file(media.key)
            if path is None:
                problems.append(Problem(site.path, f"photo {media.id}: {media.key} is not a file"))
            elif path not in tree.files:
                problems.append(Problem(site.path, f"photo {media.id}: {path} does not exist"))
    for drawn in tree.maps:
        record_map = drawn.record
        if record_map.site_id not in site_ids:
            problems.append(Problem(drawn.path, f"site {record_map.site_id!r} does not exist"))
        if record_map.underlay is not None:
            message = _underlay_problem(record_map.underlay.ref, tree.seed_maps)
            if message:
                problems.append(Problem(drawn.path, message))
    return problems


def _map_ref_problem(ref: str, drawn_ids: set[str], seed_maps: set[str]) -> str | None:
    collection, _, name = ref.partition(":")
    if collection == "drawn":
        return None if name in drawn_ids else f"drawn map {name!r} does not exist"
    if collection == "seed":
        return None if name in seed_maps else f"seed map {name!r} does not exist"
    if collection == "reference":
        return None
    return f"unknown map reference {ref!r}"


def _underlay_problem(ref: str, seed_maps: set[str]) -> str | None:
    collection, _, name = ref.partition(":")
    if collection == "reference":
        return None
    if collection == "seed":
        return None if name in seed_maps else f"underlay seed map {name!r} does not exist"
    if collection in SAFE_UNDERLAYS:
        return None
    return f"underlay {ref!r} does not resolve in the commons"


def check_provenance(tree: CommonsTree) -> list[Problem]:
    """Coordinates name their ``geo_source``; a body over 400 characters names its ``sources``."""
    problems: list[Problem] = []
    for site in tree.sites:
        record = site.record
        has_coordinates = record.lat is not None or record.lon is not None
        if has_coordinates and not (record.geo_source or "").strip():
            problems.append(Problem(site.path, "lat/lon set without geo_source"))
        length = len(record.body_md.strip())
        if length > LONG_BODY and not record.sources:
            problems.append(Problem(site.path, f"body of {length} characters without sources"))
    return problems


def check_licences(tree: CommonsTree) -> list[Problem]:
    """Photos are allowlisted and public, no reference maps, no personal or overlay keys."""
    problems: list[Problem] = []
    allowed = ", ".join(sorted(LICENCE_ALLOWLIST))
    for path, entry in sorted(tree.manifest.items()):
        licence = entry.get("licence")
        if licence not in LICENCE_ALLOWLIST:
            problems.append(
                Problem(MEDIA_MANIFEST, f"{path}: licence {licence!r} not in {allowed}")
            )
        if entry.get("public") is not True:
            problems.append(Problem(MEDIA_MANIFEST, f"{path}: not marked public: true"))
    for path in sorted(tree.files - set(tree.manifest)):
        problems.append(Problem(path, "no entry in media/manifest.json"))
    for site in tree.sites:
        record = site.record
        for media in record.media:
            file = media_file(media.key)
            if file is not None and file in tree.files and file not in tree.manifest:
                problems.append(Problem(site.path, f"photo {media.id}: no manifest entry"))
            if not media.public:
                problems.append(Problem(site.path, f"photo {media.id}: not public"))
        refs = [*record.maps, *([record.default_map] if record.default_map else [])]
        for ref in refs:
            if ref.startswith("reference:"):
                problems.append(Problem(site.path, f"reference map {ref!r} may not enter"))
        for key in PERSONAL_KEYS:
            if key in site.keys:
                problems.append(Problem(site.path, f"personal field {key!r} may not enter"))
        for key in OVERLAY_KEYS:
            if key in site.keys:
                problems.append(Problem(site.path, f"overlay or fork field {key!r} may not enter"))
    for drawn in tree.maps:
        underlay = drawn.record.underlay
        if underlay is not None and underlay.ref.startswith("reference:"):
            problems.append(Problem(drawn.path, f"underlay {underlay.ref!r} is a reference map"))
    return problems


def check_editorial(tree: CommonsTree) -> list[Problem]:
    """No first-person text in a summary or body; each offending line is listed."""
    problems: list[Problem] = []
    for site in tree.sites:
        record = site.record
        if first_person(record.summary):
            problems.append(Problem(site.path, f"first person in summary: {record.summary}"))
        for number, line in first_person_lines(record.body_md):
            problems.append(Problem(site.path, f"first person in body line {number}: {line}"))
    return problems


def check_revisions(tree: CommonsTree) -> list[Problem]:
    """Every site and map is at revision 1 or later (the models reject less while loading)."""
    problems: list[Problem] = []
    for site in tree.sites:
        if site.record.revision < 1:
            problems.append(Problem(site.path, f"revision {site.record.revision} below 1"))
    for drawn in tree.maps:
        if drawn.record.revision < 1:
            problems.append(Problem(drawn.path, f"revision {drawn.record.revision} below 1"))
    return problems


COMMONS_RULES: tuple[Callable[[CommonsTree], list[Problem]], ...] = (
    check_site_ids,
    check_map_ids,
    check_references,
    check_provenance,
    check_licences,
    check_editorial,
    check_revisions,
)


def validate_commons(root: Path) -> list[Problem]:
    """Every problem of the commons checkout at ``root``: load errors, then each rule."""
    tree, problems = load_commons_tree(root)
    for rule in COMMONS_RULES:
        problems.extend(rule(tree))
    return problems


def validate_log(root: Path, commons_root: Path | None = None) -> list[Problem]:
    """Every load error of the log at ``root``, merged with the commons at ``commons_root``."""
    commons = CommonsSource(commons_root) if commons_root else None
    store = Store(root, commons=commons)
    store.load()
    return [Problem.parse(e) for e in store.errors]
