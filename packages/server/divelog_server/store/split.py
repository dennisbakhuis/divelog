"""Split a personal log repository into a fresh site commons and personal overlays.

Every site of the log becomes a commons core at revision 1 plus, when anything personal is left,
an overlay ``sites/<id>.md`` with ``extends: commons``. Prose in the first person, drawn maps
traced over third-party surveys and photos without an allowlisted public licence stay in the
log. Personal maps are renamed ``<site>-p<n>`` everywhere they are referenced, dive annotations
included. Sites that cannot pass the commons rules (id, coordinates without ``geo_source``,
unknown region) stay personal ``log`` sites and are listed in the report.

The plan is computed in memory first (:func:`plan_split`); :func:`run_split` writes the commons,
validates it before the log is touched, commits it, rewrites the log and loads the result.
"""

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Literal

from divelog_server.store import commons_files
from divelog_server.store.countries import COUNTRIES
from divelog_server.store.files import read_json, read_markdown, remove, write_json, write_markdown
from divelog_server.store.loader import git_head
from divelog_server.store.log_repo import frontmatter
from divelog_server.store.manifest import (
    MEDIA_MANIFEST,
    Manifest,
    ManifestSource,
    MediaManifest,
    normalise_licence,
    write_manifest,
)
from divelog_server.store.models import (
    ChangeEntry,
    MediaRef,
    SiteCore,
    SiteMapRecord,
    SiteOverlayRecord,
    SiteRecord,
)
from divelog_server.store.overlay import PERSONAL_FIELDS, overlay_frontmatter, overlay_is_empty
from divelog_server.store.slug import SITE_ID
from divelog_server.store.sources import REPO_PREFIX, CommonsSource
from divelog_server.store.store import Store
from divelog_server.store.validate import (
    LONG_BODY,
    SAFE_UNDERLAYS,
    Problem,
    errors,
    first_person,
    validate_commons,
)

MapRights = Literal["underlay", "stick-personal", "all-personal"]
MAP_RIGHTS: tuple[MapRights, ...] = ("underlay", "stick-personal", "all-personal")
IMPORT_NOTE = "Imported from the personal log"
MIN_SUMMARY_WORDS = 6
COMMONS_NAME = "divelog-sites"
TYPE_LABELS = {"sea": "Dive site", "ocean": "Dive site", "shore": "Shore dive"}

_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_MARKUP = re.compile(r"[*_`]+")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'“‘(])")
_NOT_PROSE = ("#", "|", ">", "```", "- ", "* ", "+ ", "<")
_LIST_ITEM = re.compile(r"\d+[.)]\s")


class SplitError(RuntimeError):
    """The split refuses to start: already split, or the target is not fresh."""


@dataclass
class SplitOptions:
    """What to split and how.

    Parameters
    ----------
    log_root
        The log repository, rewritten in place.
    to
        The new commons repository; must not exist or be empty.
    map_rights
        ``underlay`` keeps maps traced over third-party material personal, ``stick-personal``
        also keeps every stick map personal, ``all-personal`` keeps every drawn map personal.
    keep_personal
        Drawn map ids that stay personal whatever the policy.
    author
        Author of the changelog entries and the import commit.
    author_email
        E-mail of the import commit.
    git
        ``git init`` the commons and commit the import.
    today
        Date of the changelog entries.
    """

    log_root: Path
    to: Path
    map_rights: MapRights = "underlay"
    keep_personal: frozenset[str] = frozenset()
    author: str | None = None
    author_email: str = ""
    git: bool = True
    today: date = field(default_factory=date.today)


@dataclass
class MapDecision:
    """Where one drawn map goes and why."""

    map_id: str
    site_id: str
    kind: str
    underlay: str | None
    personal: bool
    reason: str
    new_id: str | None = None
    note: str = ""


@dataclass
class SiteDecision:
    """What happened to one site."""

    site_id: str
    exported: bool
    reason: str = ""
    body: Literal["commons", "overlay", "none"] = "none"
    body_reason: str = ""
    summary: Literal["kept", "from body", "generated", "none"] = "none"
    commons_maps: list[str] = field(default_factory=list)
    personal_maps: list[str] = field(default_factory=list)
    commons_photos: list[str] = field(default_factory=list)
    personal_photos: list[str] = field(default_factory=list)
    overlay: bool = False
    extras: list[str] = field(default_factory=list)


@dataclass
class SplitPlan:
    """Everything the split will write, decided before anything is written."""

    options: SplitOptions
    log_name: str
    site_count: int
    errors_before: set[str]
    dives_resolved: set[int]
    annotations_resolved: set[int]
    cores: dict[str, SiteRecord] = field(default_factory=dict)
    overlays: dict[str, SiteOverlayRecord] = field(default_factory=dict)
    sites: list[SiteDecision] = field(default_factory=list)
    maps: list[MapDecision] = field(default_factory=list)
    renames: dict[str, str] = field(default_factory=dict)
    commons_maps: dict[str, dict[str, Any]] = field(default_factory=dict)
    regions: list[str] = field(default_factory=list)
    seed_files: list[str] = field(default_factory=list)
    photos: dict[str, dict[str, Any]] = field(default_factory=dict)
    media_manifest: MediaManifest = field(default_factory=MediaManifest)
    annotation_renames: dict[int, str] = field(default_factory=dict)

    @property
    def exported(self) -> list[SiteDecision]:
        """Decisions of the sites that go to the commons."""
        return [s for s in self.sites if s.exported]

    @property
    def kept(self) -> list[SiteDecision]:
        """Decisions of the sites that stay personal."""
        return [s for s in self.sites if not s.exported]


@dataclass
class SplitResult:
    """The plan, the problems found, the commons commit, and whether the split went through."""

    plan: SplitPlan
    problems: list[Problem]
    head: str | None = None
    stage: Literal["dry-run", "commons", "done"] = "done"

    @property
    def ok(self) -> bool:
        """No problems."""
        return not self.problems


# ── decisions ─────────────────────────────────────────────────────────────


def map_rights(
    record: SiteMapRecord, policy: MapRights, keep_personal: frozenset[str] = frozenset()
) -> tuple[bool, str]:
    """Whether a drawn map stays personal, and why.

    A map traced over a ``reference:`` map always stays personal, as does every id in
    ``keep_personal``. Under ``underlay`` a stick map with any underlay other than none,
    ``osm``, ``locator`` or a ``seed:`` sketch stays personal too; ``stick-personal`` keeps all
    stick maps personal; ``all-personal`` every map. Everything else goes to the commons.
    """
    if record.id in keep_personal:
        return True, "listed in --keep-personal"
    ref = record.underlay.ref if record.underlay else None
    prefix = ref.partition(":")[0] if ref else None
    if prefix == "reference":
        return True, f"traced over {ref}"
    if policy == "all-personal":
        return True, "policy all-personal"
    if record.kind == "stickmap":
        if policy == "stick-personal":
            return True, "stick map, policy stick-personal"
        if ref and prefix not in SAFE_UNDERLAYS:
            return True, f"stick map traced over {ref}"
    if ref:
        return False, f"{record.kind} over {ref}"
    return False, f"{record.kind}, no underlay"


def export_blocker(record: SiteRecord, regions: set[str]) -> str | None:
    """Why a site cannot enter the commons as it is, or None."""
    if not SITE_ID.match(record.site_id):
        return f"id does not match {SITE_ID.pattern}"
    has_coordinates = record.lat is not None or record.lon is not None
    if has_coordinates and not (record.geo_source or "").strip():
        return "coordinates without geo_source"
    if record.region and record.region not in regions:
        return f"region {record.region} does not exist"
    return None


def body_sentences(body: str) -> list[str]:
    """The prose sentences of a Markdown body, markup removed, headings and lists skipped."""
    paragraphs: list[str] = []
    current: list[str] = []
    for line in [*body.splitlines(), ""]:
        text = line.strip()
        if not text or text.startswith(_NOT_PROSE) or _LIST_ITEM.match(text):
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        current.append(text)
    sentences: list[str] = []
    for paragraph in paragraphs:
        plain = _MARKUP.sub("", _LINK.sub(r"\1", paragraph))
        sentences.extend(s.strip() for s in _SENTENCE_END.split(plain) if s.strip())
    return sentences


def summary_from_body(body: str) -> str | None:
    """The first sentence of the body that is not in the first person and reads as a summary."""
    for sentence in body_sentences(body):
        long_enough = len(sentence.split()) >= MIN_SUMMARY_WORDS and len(sentence) <= 300
        if long_enough and not first_person(sentence):
            return sentence
    return None


def generated_summary(record: SiteRecord, region_name: str | None) -> str:
    """A neutral placeholder summary from the site type and place, for a human to rewrite."""
    label = TYPE_LABELS.get(record.type, record.type.replace("_", " ").capitalize())
    place = record.area or region_name
    if not place and record.country:
        place = COUNTRIES.get(record.country, ("", record.country))[1]
    return f"{label} in {place}" if place else f"{label}: {record.name}"


# ── planning ──────────────────────────────────────────────────────────────


def plan_split(options: SplitOptions) -> SplitPlan:
    """Decide everything the split writes, reading the log only.

    Raises
    ------
    SplitError
        The log already names a commons source.
    """
    root = options.log_root
    store = Store(root)
    store.load()
    if store.manifest is not None and store.manifest.commons_source() is not None:
        raise SplitError(f"{root} already has a commons source")
    manifest_path = root / MEDIA_MANIFEST
    media_manifest = MediaManifest(read_json(manifest_path) if manifest_path.is_file() else None)
    log = store.log_sites
    plan = SplitPlan(
        options=options,
        log_name=root.resolve().name,
        site_count=len(store.sites),
        errors_before=set(store.errors),
        dives_resolved={n for n, d in store.dives.items() if d.site and d.site in store.sites},
        annotations_resolved={
            n for n, d in store.dives.items() if _annotation_map(d.map_annotation) in store.maps
        },
        media_manifest=media_manifest,
    )
    exportable: dict[str, SiteRecord] = {}
    for site_id, record in sorted(log.sites.items()):
        blocker = export_blocker(record, set(log.regions))
        if blocker:
            plan.sites.append(SiteDecision(site_id, exported=False, reason=blocker))
        else:
            exportable[site_id] = record
    personal_by_site = _plan_maps(plan, log.maps, exportable)
    _plan_renames(plan, personal_by_site, set(log.maps))
    plan.regions = sorted(log.regions)
    seed_dir = root / "maps" / "seed"
    plan.seed_files = (
        sorted(str(p.relative_to(root)) for p in seed_dir.glob("*") if p.is_file())
        if seed_dir.is_dir()
        else []
    )
    for record in exportable.values():
        region = log.regions.get(record.region) if record.region else None
        _plan_site(plan, record, log.seed_maps, region.name if region else None)
    for number, dive in sorted(store.dives.items()):
        old = _annotation_map(dive.map_annotation)
        if old in plan.renames:
            plan.annotation_renames[number] = plan.renames[old]
    plan.sites.sort(key=lambda s: s.site_id)
    return plan


def _annotation_map(annotation: dict[str, Any] | None) -> str | None:
    value = (annotation or {}).get("map_id")
    return str(value) if value else None


def _plan_maps(
    plan: SplitPlan, maps: dict[str, SiteMapRecord], exportable: dict[str, SiteRecord]
) -> dict[str, list[SiteMapRecord]]:
    options = plan.options
    author = options.author
    personal_by_site: dict[str, list[SiteMapRecord]] = {}
    for record in sorted(maps.values(), key=lambda m: (m.site_id, m.sort, m.id)):
        underlay = record.underlay.ref if record.underlay else None
        if record.site_id not in exportable:
            stays = "site stays personal"
            plan.maps.append(
                MapDecision(record.id, record.site_id, record.kind, underlay, True, stays)
            )
            continue
        personal, reason = map_rights(record, options.map_rights, options.keep_personal)
        decision = MapDecision(record.id, record.site_id, record.kind, underlay, personal, reason)
        plan.maps.append(decision)
        if personal:
            personal_by_site.setdefault(record.site_id, []).append(record)
            continue
        commons = read_json(options.log_root / "maps" / "drawn" / f"{record.id}.json")
        entry = ChangeEntry(
            revision=record.revision, date=options.today, author=author, note=IMPORT_NOTE
        )
        commons["revision"] = record.revision
        commons["changelog"] = [entry.model_dump(mode="json")]
        if underlay and underlay.partition(":")[0] not in (*SAFE_UNDERLAYS, "reference"):
            commons.pop("underlay", None)
            decision.note = f"underlay {underlay} dropped (it does not resolve in the commons)"
        plan.commons_maps[record.id] = commons
    return personal_by_site


def _plan_renames(
    plan: SplitPlan, personal_by_site: dict[str, list[SiteMapRecord]], taken: set[str]
) -> None:
    by_id = {d.map_id: d for d in plan.maps}
    for site_id, records in personal_by_site.items():
        n = 0
        for record in records:
            n += 1
            while f"{site_id}-p{n}" in taken and f"{site_id}-p{n}" != record.id:
                n += 1
            new_id = f"{site_id}-p{n}"
            by_id[record.id].new_id = new_id
            if new_id != record.id:
                plan.renames[record.id] = new_id
            taken.add(new_id)


def _plan_site(
    plan: SplitPlan, record: SiteRecord, seed_maps: set[str], region_name: str | None
) -> None:
    site_id = record.site_id
    decision = SiteDecision(site_id, exported=True)
    renames = plan.renames

    def in_commons(ref: str) -> bool:
        collection, _, name = ref.partition(":")
        if collection == "drawn":
            return name in plan.commons_maps
        return collection == "seed" and name in seed_maps

    def renamed(ref: str) -> str:
        collection, _, name = ref.partition(":")
        return f"drawn:{renames[name]}" if collection == "drawn" and name in renames else ref

    core_maps = [r for r in record.maps if in_commons(r)]
    personal_maps = [renamed(r) for r in record.maps if not in_commons(r)]
    default = record.default_map
    core_default = default if default and in_commons(default) else None
    personal_default = renamed(default) if default and core_default is None else None
    decision.commons_maps = [d.map_id for d in plan.maps if d.site_id == site_id and not d.personal]
    decision.personal_maps = [
        d.new_id or d.map_id for d in plan.maps if d.site_id == site_id and d.personal
    ]

    core_media: list[MediaRef] = []
    personal_media: list[MediaRef] = []
    for media in record.media:
        path = _commons_photo(plan, media)
        if path is None:
            personal_media.append(media.model_copy(deep=True))
            decision.personal_photos.append(media.id)
            continue
        core_media.append(media.model_copy(deep=True, update={"key": REPO_PREFIX + path}))
        decision.commons_photos.append(media.id)

    body = record.body_md.strip()
    summary_personal = first_person(record.summary)
    if summary_personal or first_person(record.body_md):
        decision.body = "overlay" if body else "none"
        decision.body_reason = "first person in " + (
            "summary and body"
            if summary_personal and first_person(record.body_md)
            else "summary"
            if summary_personal
            else "body"
        )
    elif body and len(body) > LONG_BODY and not record.sources:
        decision.body, decision.body_reason = "overlay", "long body without sources"
    elif body:
        decision.body = "commons"
    commons_body = record.body_md if decision.body == "commons" else ""

    summary = record.summary
    summary_override = None
    if summary_personal:
        summary_override = record.summary
        summary = summary_from_body(record.body_md)
        decision.summary = "from body" if summary else "generated"
        summary = summary or generated_summary(record, region_name)
    elif summary:
        decision.summary = "kept"

    entry = ChangeEntry(
        revision=1, date=plan.options.today, author=plan.options.author, note=IMPORT_NOTE
    )
    core_payload = record.model_dump(mode="json", include=set(SiteCore.model_fields))
    core_payload.update(
        maps=core_maps,
        default_map=core_default,
        media=[m.model_dump(mode="json") for m in core_media],
        summary=summary,
        revision=1,
        changelog=[entry.model_dump(mode="json")],
        body_md=commons_body,
    )
    plan.cores[site_id] = SiteRecord.model_validate(core_payload)

    extras = dict(record.model_extra or {})
    decision.extras = sorted(extras)
    overlay_payload: dict[str, Any] = {
        **extras,
        **record.model_dump(mode="json", include=set(PERSONAL_FIELDS)),
        "site_id": site_id,
        "extends": "commons",
        "base_revision": 1,
        "summary_override": summary_override,
        "default_map": personal_default,
        "maps": personal_maps,
        "media": [m.model_dump(mode="json") for m in personal_media],
        "body_md": record.body_md if decision.body == "overlay" else "",
    }
    overlay = SiteOverlayRecord.model_validate(overlay_payload)
    decision.overlay = not overlay_is_empty(overlay)
    plan.overlays[site_id] = overlay
    plan.sites.append(decision)


def _commons_photo(plan: SplitPlan, media: MediaRef) -> str | None:
    """The repository path of a photo that may enter the commons, or None."""
    path = _repo_photo_path(media.key)
    if path is None or not media.public:
        return None
    entry = plan.media_manifest.entries.get(path)
    if entry is None or entry.get("public") is not True:
        return None
    licence = normalise_licence(entry.get("licence"))
    if licence is None or not (plan.options.log_root / path).is_file():
        return None
    plan.photos[path] = {**entry, "licence": licence}
    return path


def _repo_photo_path(key: str) -> str | None:
    """The log path a photo key names: ``repo:<path>``, or a media-store ``sites/<file>``.

    A media-store key ``sites/<file>`` counts as ``repo:media/sites/<file>`` when the log keeps
    that file with a manifest entry; the caller checks both.
    """
    if key.startswith(REPO_PREFIX):
        return key[len(REPO_PREFIX) :]
    folder, _, name = key.partition("/")
    if folder == "sites" and name and "/" not in name:
        return f"media/sites/{name}"
    return None


# ── writing ───────────────────────────────────────────────────────────────


def write_commons(plan: SplitPlan, target: Path) -> None:
    """Write the commons tree of ``plan`` under ``target``."""
    log = plan.options.log_root
    for site_id, core in plan.cores.items():
        meta = compact_media(frontmatter(core))
        write_markdown(target / "sites" / f"{site_id}.md", meta, core.body_md)
    for region_id in plan.regions:
        _copy(log / "regions" / f"{region_id}.md", target / "regions" / f"{region_id}.md")
    for map_id, payload in plan.commons_maps.items():
        write_json(target / "maps" / "drawn" / f"{map_id}.json", payload)
    for relative in plan.seed_files:
        _copy(log / relative, target / relative)
    for relative in plan.photos:
        _copy(log / relative, target / relative)
    if plan.photos:
        write_json(target / MEDIA_MANIFEST, dict(sorted(plan.photos.items())))
    write_manifest(target, Manifest(kind="sites", name=target.name))
    for relative, text in commons_files.files(plan.log_name).items():
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    (target / "IMPORT-REPORT.md").write_text(render_report(plan), encoding="utf-8")


def compact_media(meta: dict[str, Any]) -> dict[str, Any]:
    """Frontmatter with each photo reduced to the fields that differ from their defaults."""
    if meta.get("media"):
        meta["media"] = [
            {"id": m["id"], "key": m["key"]}
            | MediaRef.model_validate(m).model_dump(mode="json", exclude_defaults=True)
            for m in meta["media"]
        ]
    return meta


def _copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def rewrite_log(plan: SplitPlan, commons_ref: str | None) -> None:
    """Turn the log into overlays on the commons written from ``plan``."""
    log = plan.options.log_root
    for site_id, overlay in plan.overlays.items():
        path = log / "sites" / f"{site_id}.md"
        if overlay_is_empty(overlay):
            remove(path)
        else:
            meta = compact_media(overlay_frontmatter(overlay))
            write_markdown(path, meta, overlay.body_md)
    for map_id in plan.commons_maps:
        remove(log / "maps" / "drawn" / f"{map_id}.json")
    for old, new in plan.renames.items():
        old_path = log / "maps" / "drawn" / f"{old}.json"
        payload = read_json(old_path)
        payload["id"] = new
        write_json(log / "maps" / "drawn" / f"{new}.json", payload)
        remove(old_path)
    if plan.renames:
        write_json(log / "maps" / "renames.json", dict(sorted(plan.renames.items())))
    for region_id in plan.regions:
        remove(log / "regions" / f"{region_id}.md")
    for relative in plan.seed_files:
        remove(log / relative)
    for relative in plan.photos:
        remove(log / relative)
        plan.media_manifest.remove(relative)
    if plan.photos:
        write_json(log / MEDIA_MANIFEST, plan.media_manifest.payload)
    for number, new in plan.annotation_renames.items():
        rename_annotation(log / "dives" / f"{number:05d}.md", new)
    to = plan.options.to
    source = ManifestSource(
        kind="commons",
        name=COMMONS_NAME if to.name == COMMONS_NAME else to.name,
        path=os.path.relpath(to.resolve(), log.resolve()),
        ref=commons_ref,
    )
    manifest = Manifest(kind="log", sources=[source])
    write_manifest(log, manifest)


def rename_annotation(path: Path, new_id: str) -> None:
    """Point the ``map_annotation`` of a dive file at ``new_id``, touching only that line."""
    text = path.read_text(encoding="utf-8")
    meta, body = read_markdown(path)
    old = _annotation_map(meta.get("map_annotation"))
    if old is None:
        return
    pattern = re.compile(rf"^(\s+map_id:\s*)(['\"]?){re.escape(old)}\2[ \t]*$", re.M)
    updated, count = pattern.subn(lambda m: f"{m.group(1)}{new_id}", text, count=1)
    if count:
        path.write_text(updated, encoding="utf-8")
        if _annotation_map(read_markdown(path)[0].get("map_annotation")) == new_id:
            return
    meta["map_annotation"]["map_id"] = new_id
    write_markdown(path, meta, body)


def commit_commons(root: Path, message: str, author: str, email: str) -> str | None:
    """``git init`` the commons, commit everything as the import, return the short head."""
    identity = [
        "-c",
        f"user.name={author}",
        "-c",
        f"user.email={email or 'divelog@localhost'}",
        "-c",
        "commit.gpgsign=false",
    ]
    for args in (
        ["init", "-q"],
        ["add", "-A"],
        [*identity, "commit", "-q", "-m", message],
    ):
        subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True)
    return git_head(root)


def verify(plan: SplitPlan) -> list[Problem]:
    """Load the split result and compare it with the log before the split."""
    to = plan.options.to
    problems = errors(validate_commons(to))
    store = Store(plan.options.log_root, commons=CommonsSource(to))
    store.load()
    if len(store.sites) != plan.site_count:
        problems.append(
            Problem("sites", f"{len(store.sites)} merged sites, the log had {plan.site_count}")
        )
    for number in sorted(plan.dives_resolved):
        dive = store.dives.get(number)
        if dive is None or dive.site not in store.sites:
            problems.append(Problem(f"dives/{number:05d}.md", "site does not resolve"))
    for number in sorted(plan.annotations_resolved):
        dive = store.dives.get(number)
        map_id = _annotation_map(dive.map_annotation) if dive else None
        if map_id not in store.maps:
            problems.append(Problem(f"dives/{number:05d}.md", f"map {map_id} does not resolve"))
    for error in store.errors:
        if error not in plan.errors_before:
            problems.append(Problem.parse(error))
    return problems


def check_target(to: Path) -> None:
    """Refuse a target that exists and is not empty."""
    if to.exists() and (not to.is_dir() or any(to.iterdir())):
        raise SplitError(f"{to} exists and is not empty")


def run_split(options: SplitOptions, *, dry_run: bool = False) -> SplitResult:
    """Plan, write and verify a split; with ``dry_run`` only plan and validate a staged commons.

    Raises
    ------
    SplitError
        The log is already split, or ``options.to`` is not fresh.
    """
    if not dry_run:
        check_target(options.to)
    plan = plan_split(options)
    if dry_run:
        with tempfile.TemporaryDirectory() as tmp:
            staged = Path(tmp) / options.to.name
            write_commons(plan, staged)
            return SplitResult(plan, errors(validate_commons(staged)), stage="dry-run")
    write_commons(plan, options.to)
    problems = errors(validate_commons(options.to))
    if problems:
        return SplitResult(plan, problems, stage="commons")
    head = None
    if options.git:
        author = options.author or "divelog"
        message = f"Initial import from {plan.log_name}"
        head = commit_commons(options.to, message, author, options.author_email)
    rewrite_log(plan, head)
    return SplitResult(plan, verify(plan), head=head, stage="done")


# ── report ────────────────────────────────────────────────────────────────


def _cell(values: list[str]) -> str:
    return ", ".join(values) if values else "–"


def render_report(plan: SplitPlan) -> str:
    """``IMPORT-REPORT.md``: what went where and why, without any personal text."""
    exported = plan.exported
    personal_maps = [m for m in plan.maps if m.personal]
    rewritten = [s for s in exported if s.summary in ("from body", "generated")]
    lines = [
        "# Import report",
        "",
        f"Imported from the personal log `{plan.log_name}` on {plan.options.today.isoformat()} "
        f"with map rights policy `{plan.options.map_rights}`.",
        "",
        "| What | Count |",
        "| --- | --- |",
        f"| Sites in the commons | {len(exported)} |",
        f"| Sites kept personal | {len(plan.kept)} |",
        f"| Bodies in the commons | {sum(1 for s in exported if s.body == 'commons')} |",
        f"| Bodies kept personal | {sum(1 for s in exported if s.body == 'overlay')} |",
        f"| Summaries to review | {len(rewritten)} |",
        f"| Overlays written | {sum(1 for s in exported if s.overlay)} |",
        f"| Drawn maps in the commons | {len(plan.commons_maps)} |",
        f"| Drawn maps kept personal | {len(personal_maps)} |",
        f"| Photos in the commons | {len(plan.photos)} |",
        f"| Regions | {len(plan.regions)} |",
        "",
        "## Sites",
        "",
        "| Site | Body | Summary | Maps commons | Maps personal | Photos commons "
        "| Photos personal |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for s in exported:
        body = f"{s.body} ({s.body_reason})" if s.body_reason else s.body
        lines.append(
            f"| {s.site_id} | {body} | {s.summary} | {_cell(s.commons_maps)} "
            f"| {_cell(s.personal_maps)} | {_cell(s.commons_photos)} "
            f"| {_cell(s.personal_photos)} |"
        )
    lines += ["", "## Summaries to review", ""]
    if rewritten:
        lines += [
            "The personal summary moved to the overlay; the commons summary below was "
            "taken from the body or generated and needs a human pass.",
            "",
        ]
        for s in rewritten:
            core = plan.cores[s.site_id]
            lines.append(f"- `{s.site_id}` ({s.summary}): {core.summary}")
    else:
        lines.append("None.")
    lines += ["", "## Sites kept personal", ""]
    if plan.kept:
        lines += ["| Site | Reason |", "| --- | --- |"]
        lines += [f"| {s.site_id} | {s.reason} |" for s in plan.kept]
    else:
        lines.append("None.")
    lines += [
        "",
        "## Drawn maps",
        "",
        "| Map | Site | Kind | Underlay | Goes to | Why |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for m in plan.maps:
        where = "personal" if m.personal else "commons"
        why = f"{m.reason}; {m.note}" if m.note else m.reason
        lines.append(
            f"| {m.map_id} | {m.site_id} | {m.kind} | {m.underlay or '–'} | {where} | {why} |"
        )
    lines += ["", "## Renamed personal maps", ""]
    if plan.renames:
        lines += ["| Old id | New id |", "| --- | --- |"]
        lines += [f"| {old} | {new} |" for old, new in sorted(plan.renames.items())]
        if plan.annotation_renames:
            dives = ", ".join(str(n) for n in sorted(plan.annotation_renames))
            lines += ["", f"Dive annotations updated: {dives}."]
    else:
        lines.append("None.")
    return "\n".join(lines) + "\n"
