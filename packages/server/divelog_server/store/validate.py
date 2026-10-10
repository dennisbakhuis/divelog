"""Validation of a log repository and of a site commons, as lists of ``path: message`` problems.

The commons rules (§1.6 of docs/MODULE.md) are pure functions over a loaded
:class:`CommonsTree`, so the CLI, commons CI and the API can run the same checks. Model rules
(field types, ``revision ≥ 1``, changelog order) are enforced while loading and come back as
problems of the file that broke them.
"""

import re
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

import yaml

from divelog_server.store.files import read_json
from divelog_server.store.gitfiles import GitFilesError, GitTree
from divelog_server.store.loader import Loader
from divelog_server.store.manifest import LICENCE_ALLOWLIST, MEDIA_MANIFEST, MediaManifest
from divelog_server.store.models import ChangeEntry, RegionRecord, SiteMapRecord, SiteRecord
from divelog_server.store.sources import COMMONS_PREFIX, PERSONAL_MAP_ID, REPO_PREFIX, CommonsSource
from divelog_server.store.store import Store

SITE_ID = re.compile(r"^[a-z]{3}-[a-z0-9-]+$")
PERSONAL_KEYS = ("notes", "prices", "reference_maps", "subsurface_uuid")
OVERLAY_KEYS = ("extends", "forked_from", "summary_override", "base_revision")
SAFE_UNDERLAYS = ("osm", "locator", "seed")
LONG_BODY = 400
REDIRECTS = "redirects.yaml"
MAP_GEOMETRY = ("nodes", "edges", "lines", "areas", "origin", "north", "to_scale")
COARSE_DECIMALS = 2

Level = Literal["error", "warning"]

_URL = re.compile(r"https?://\S+")
_FIRST_PERSON_I = re.compile(r"\bI(?:['\u2019](?:m|ve|d|ll)\b| (?=[a-z]))")
_FIRST_PERSON = re.compile(r"\b(?:my|me|we|our|us)\b", re.IGNORECASE)
_CAPITALISED_BEFORE = re.compile(r"\b([A-Z][\w-]*)\s+$")
_OWNER_VOICE = re.compile(
    r"\b(?:in the log|the workbook|dives? here|favourite|favorite)\b|\bthe owner'?s\b",
    re.IGNORECASE,
)
SENTENCE_STARTERS = frozenset(
    {
        "After",
        "Also",
        "And",
        "As",
        "Because",
        "Before",
        "But",
        "Here",
        "If",
        "Once",
        "Since",
        "So",
        "Then",
        "There",
        "Today",
        "Until",
        "When",
        "Where",
        "While",
    }
)


@dataclass(frozen=True)
class Problem:
    """One thing wrong with one file of a repository; warnings do not fail a run."""

    path: str
    message: str
    level: Level = "error"

    def __str__(self) -> str:
        if self.level == "warning":
            return f"{self.path}: warning: {self.message}"
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
    redirects: dict[str, str] = field(default_factory=dict)
    region_paths: dict[str, str] = field(default_factory=dict)


def errors(problems: list[Problem]) -> list[Problem]:
    """Only the problems that fail a run."""
    return [p for p in problems if p.level == "error"]


def warnings(problems: list[Problem]) -> list[Problem]:
    """Only the problems that are reported without failing a run."""
    return [p for p in problems if p.level == "warning"]


def _first_person_i(text: str) -> bool:
    """A pronoun ``I``; a Roman numeral after a name (``Andrea I is``) is not one."""
    for match in _FIRST_PERSON_I.finditer(text):
        before = _CAPITALISED_BEFORE.search(text[: match.start()])
        if before is None or before.group(1) in SENTENCE_STARTERS:
            return True
    return False


def first_person(text: str | None) -> bool:
    """Whether ``text`` speaks in the first person (links are ignored)."""
    if not text:
        return False
    plain = _URL.sub(" ", text)
    return bool(_first_person_i(plain) or _FIRST_PERSON.search(plain))


def owner_voice(text: str | None) -> bool:
    """Whether ``text`` speaks for the log owner without a pronoun (``dives here``)."""
    return bool(text and _OWNER_VOICE.search(_URL.sub(" ", text)))


def first_person_lines(text: str) -> list[tuple[int, str]]:
    """``(line number, line)`` for every line of ``text`` in the first person, from 1."""
    return [
        (number, line.strip())
        for number, line in enumerate(text.splitlines(), start=1)
        if first_person(line)
    ]


def owner_voice_lines(text: str) -> list[tuple[int, str]]:
    """``(line number, line)`` for every line in the owner's voice but not the first person."""
    return [
        (number, line.strip())
        for number, line in enumerate(text.splitlines(), start=1)
        if owner_voice(line) and not first_person(line)
    ]


def load_commons_tree(root: Path) -> tuple[CommonsTree, list[Problem]]:
    """Read a commons checkout for the rules; files that fail their model are problems."""
    loader = Loader(root)
    tree = CommonsTree()
    for path, payload in loader.markdown_files("sites"):
        record = loader.validate(path, SiteRecord, payload)
        if record is not None:
            tree.sites.append(SiteFile(loader.where(path), set(payload), record))
    for path, payload in loader.markdown_files("regions"):
        region = loader.validate(path, RegionRecord, payload)
        if region is not None:
            tree.regions[region.region] = region
            tree.region_paths[region.region] = loader.where(path)
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
    tree.redirects = _read_redirects(root, loader)
    media = root / "media"
    tree.files = {
        str(p.relative_to(root))
        for p in media.rglob("*")
        if p.is_file() and p.name != "manifest.json" and not p.name.startswith(".")
    }
    return tree, [Problem.parse(e) for e in loader.errors]


def _read_redirects(root: Path, loader: Loader) -> dict[str, str]:
    path = root / REDIRECTS
    if not path.is_file():
        return {}
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as exc:
        loader.error(path, str(exc))
        return {}
    if not isinstance(payload, dict):
        loader.error(path, "not a mapping of old id: new id")
        return {}
    return {str(old): str(new) for old, new in payload.items()}


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


def _lint(path: str, where: str, text: str | None) -> list[Problem]:
    """First person (error) or owner voice (warning) in one short text."""
    if first_person(text):
        return [Problem(path, f"first person in {where}: {text}")]
    if owner_voice(text):
        return [Problem(path, f"owner voice in {where}: {text}", "warning")]
    return []


def _lint_body(path: str, body: str) -> list[Problem]:
    """First person (error) and owner voice (warning), line by line, in a Markdown body."""
    problems = [
        Problem(path, f"first person in body line {number}: {line}")
        for number, line in first_person_lines(body)
    ]
    problems += [
        Problem(path, f"owner voice in body line {number}: {line}", "warning")
        for number, line in owner_voice_lines(body)
    ]
    return problems


def map_texts(record: SiteMapRecord) -> list[tuple[str, str]]:
    """``(where, text)`` for the title, notes and every label of a drawn map."""
    texts = [("title", record.title), ("notes", record.notes)]
    texts += [(f"node {n.id!r} label", n.label) for n in record.nodes]
    texts += [(f"line {line.id!r} label", line.label) for line in record.lines]
    texts += [(f"area {a.id!r} label", a.label) for a in record.areas]
    return [(where, text) for where, text in texts if text]


def check_editorial(tree: CommonsTree) -> list[Problem]:
    """No first-person text in sites, regions and drawn maps; owner voice is a warning.

    Bodies are checked line by line, so each offending line is listed.
    """
    problems: list[Problem] = []
    for site in tree.sites:
        problems += _lint(site.path, "summary", site.record.summary)
        problems += _lint_body(site.path, site.record.body_md)
    for region_id, region in sorted(tree.regions.items()):
        path = tree.region_paths.get(region_id, f"regions/{region_id}.md")
        problems += _lint_body(path, region.body_md)
    for drawn in tree.maps:
        for where, text in map_texts(drawn.record):
            problems += _lint(drawn.path, where, text)
    return problems


def decimals(value: float) -> int:
    """How many decimals ``value`` is written with."""
    exponent = Decimal(str(value)).as_tuple().exponent
    return -exponent if isinstance(exponent, int) and exponent < 0 else 0


def check_visibility(tree: CommonsTree) -> list[Problem]:
    """A ``region_only`` site carries a coarse point: more than two decimals is a warning."""
    problems: list[Problem] = []
    for site in tree.sites:
        record = site.record
        if record.location_visibility != "region_only":
            continue
        coordinates = [v for v in (record.lat, record.lon) if v is not None]
        if any(decimals(v) > COARSE_DECIMALS for v in coordinates):
            message = "region_only site with a precise point: round lat/lon to two decimals"
            problems.append(Problem(site.path, message, "warning"))
    return problems


def check_redirects(tree: CommonsTree) -> list[Problem]:
    """``redirects.yaml`` maps retired ids to existing sites in one step, never a live id."""
    problems: list[Problem] = []
    site_ids = {s.record.site_id for s in tree.sites}
    for old, new in sorted(tree.redirects.items()):
        if old in site_ids:
            problems.append(Problem(REDIRECTS, f"{old}: still an existing site, not a redirect"))
        if new in tree.redirects:
            problems.append(Problem(REDIRECTS, f"{old}: chains through {new}; point at the end"))
        elif new not in site_ids:
            problems.append(Problem(REDIRECTS, f"{old}: target site {new!r} does not exist"))
    return problems


def check_map_nodes(tree: CommonsTree) -> list[Problem]:
    """Retired node ids are not used again; renamed nodes resolve to an existing node."""
    problems: list[Problem] = []
    for drawn in tree.maps:
        record = drawn.record
        node_ids = {n.id for n in record.nodes}
        for node_id in sorted(node_ids & set(record.retired_nodes)):
            problems.append(Problem(drawn.path, f"retired node id {node_id!r} is used again"))
        for old, new in sorted(record.renamed_nodes.items()):
            target, seen = new, {old}
            while target in record.renamed_nodes and target not in seen:
                seen.add(target)
                target = record.renamed_nodes[target]
            if target not in node_ids:
                message = f"renamed node {old!r} -> {new!r}: {target!r} is not a node"
                problems.append(Problem(drawn.path, message))
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
    check_visibility,
    check_redirects,
    check_map_nodes,
)


def _entries(changelog: list[ChangeEntry]) -> list[dict[str, Any]]:
    return [entry.model_dump(mode="json") for entry in changelog]


def revision_problems(
    path: str,
    base: tuple[int, list[ChangeEntry]],
    new: tuple[int, list[ChangeEntry]],
    changed: bool,
) -> list[Problem]:
    """The versioning rules of one record against its base version.

    ``base`` and ``new`` are ``(revision, changelog)``. A content change (``changed``) moves
    the revision up by exactly one and prepends a changelog entry at the new revision with a
    note, dated no earlier than the base's newest entry; the base changelog stays as it was
    below it.
    """
    base_revision, base_log = base
    revision, changelog = new
    if revision < base_revision:
        return [Problem(path, f"revision went back from {base_revision} to {revision}")]
    if revision > base_revision + 1:
        message = f"revision went from {base_revision} to {revision}; bump by exactly 1"
        return [Problem(path, message)]
    rewritten = Problem(path, "changelog history rewritten: existing entries changed")
    if revision == base_revision:
        problems = []
        if changed:
            problems.append(Problem(path, f"changed without a revision bump (still {revision})"))
        if _entries(changelog) != _entries(base_log):
            problems.append(rewritten)
        return problems
    if not changelog or changelog[0].revision != revision:
        return [Problem(path, f"revision {revision} without a changelog entry at {revision}")]
    problems = []
    entry = changelog[0]
    if not entry.note.strip():
        problems.append(Problem(path, f"changelog entry at revision {revision} has no note"))
    newest: date | None = base_log[0].date if base_log else None
    if newest is not None and entry.date < newest:
        message = f"changelog entry at revision {revision} is dated before {newest.isoformat()}"
        problems.append(Problem(path, message))
    if _entries(changelog[1:]) != _entries(base_log):
        problems.append(rewritten)
    return problems


def _site_content(site: SiteFile) -> tuple[dict[str, Any], str]:
    record = site.record
    data = record.model_dump(mode="json", exclude={"revision", "changelog"})
    return data, record.body_md.strip()


def _map_part(record: SiteMapRecord, fields: tuple[str, ...]) -> dict[str, Any]:
    return record.model_dump(mode="json", by_alias=True, include=set(fields))


def check_site_history(base: CommonsTree, tree: CommonsTree) -> list[Problem]:
    """Changed sites are bumped with a changelog entry; a deleted id leaves a redirect."""
    problems: list[Problem] = []
    current = {s.record.site_id: s for s in tree.sites}
    for old in base.sites:
        site_id = old.record.site_id
        new = current.get(site_id)
        if new is None:
            if site_id not in tree.redirects:
                message = f"site {site_id!r} deleted without a {REDIRECTS} entry"
                problems.append(Problem(old.path, message))
            continue
        problems += revision_problems(
            new.path,
            (old.record.revision, old.record.changelog),
            (new.record.revision, new.record.changelog),
            _site_content(old) != _site_content(new),
        )
    return problems


def node_problems(path: str, old: SiteMapRecord, new: SiteMapRecord) -> list[Problem]:
    """Node ids of the base map that vanished without being retired or renamed.

    A vanished node with a new node at the same position is reported as an unlisted rename.
    """
    problems: list[Problem] = []
    new_ids = {n.id for n in new.nodes}
    old_ids = {n.id for n in old.nodes}
    added = {(n.x, n.y): n.id for n in new.nodes if n.id not in old_ids}
    accounted = set(new.retired_nodes) | set(new.renamed_nodes)
    for node in old.nodes:
        if node.id in new_ids or node.id in accounted:
            continue
        successor = added.get((node.x, node.y))
        if successor is not None:
            message = f"node {node.id!r} renamed to {successor!r} without a renamed_nodes entry"
        else:
            message = f"node {node.id!r} removed without a retired_nodes entry"
        problems.append(Problem(path, message))
    for node_id in sorted(set(old.retired_nodes) - set(new.retired_nodes)):
        problems.append(Problem(path, f"retired node {node_id!r} dropped from retired_nodes"))
    for node_id in sorted(set(old.renamed_nodes) - set(new.renamed_nodes)):
        problems.append(Problem(path, f"renamed node {node_id!r} dropped from renamed_nodes"))
    return problems


def check_map_history(base: CommonsTree, tree: CommonsTree) -> list[Problem]:
    """Geometry changes bump the map; node ids stay stable or are retired or renamed.

    Title and notes changes need no bump, but no change may lower the revision.
    """
    problems: list[Problem] = []
    current = {m.record.id: m for m in tree.maps}
    for old in base.maps:
        new = current.get(old.record.id)
        if new is None:
            continue
        geometry = _map_part(old.record, MAP_GEOMETRY) != _map_part(new.record, MAP_GEOMETRY)
        problems += revision_problems(
            new.path,
            (old.record.revision, old.record.changelog),
            (new.record.revision, new.record.changelog),
            geometry,
        )
        problems += node_problems(new.path, old.record, new.record)
    return problems


HISTORY_RULES: tuple[Callable[[CommonsTree, CommonsTree], list[Problem]], ...] = (
    check_site_history,
    check_map_history,
)


def _base_content(path: str) -> bool:
    if path.startswith("maps/drawn/") or path == MEDIA_MANIFEST:
        return True
    return path.endswith((".md", ".yaml", ".yml"))


def load_base_tree(root: Path, ref: str) -> CommonsTree:
    """The commons at ``root`` as it was at git ``ref``; files broken there are skipped.

    Photos and seed maps are listed, not read.

    Raises
    ------
    GitFilesError
        ``root`` is not in a git repository or ``ref`` is unknown.
    """
    git_tree = GitTree(root, ref)
    with tempfile.TemporaryDirectory(prefix="divelog-base-") as folder:
        git_tree.materialise(Path(folder), _base_content)
        tree, _ = load_commons_tree(Path(folder))
    return tree


def validate_commons(root: Path, base: str | None = None) -> list[Problem]:
    """Every problem of the commons checkout at ``root``: load errors, then each rule.

    With ``base`` (a git ref) the working tree is also compared with that revision and the
    history rules (revision bumps, changelog, node-id stability, redirects) run on every
    changed file.
    """
    tree, problems = load_commons_tree(root)
    for rule in COMMONS_RULES:
        problems.extend(rule(tree))
    if base is not None:
        try:
            base_tree = load_base_tree(root, base)
        except GitFilesError as exc:
            return [*problems, Problem(".", f"base {base!r}: {exc}")]
        for history_rule in HISTORY_RULES:
            problems.extend(history_rule(base_tree, tree))
    return problems


def validate_log(root: Path, commons_root: Path | None = None) -> list[Problem]:
    """Every load error of the log at ``root``, merged with the commons at ``commons_root``."""
    commons = CommonsSource(commons_root) if commons_root else None
    store = Store(root, commons=commons)
    store.load()
    return [Problem.parse(e) for e in store.errors]
