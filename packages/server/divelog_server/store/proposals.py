"""Propose a personal site to the commons, and adopt it back as an overlay once it is merged.

``propose`` copies a ``log`` site or a ``fork`` into a branch of a commons checkout: the
objective record (personal fields stripped, a first-person body or summary held back), its
drawn maps renumbered into the commons namespace with ``copied_from``, and the photos whose
licence allows it. It never changes the log. ``adopt`` runs after the proposal was merged and
pulled: the full log record becomes an overlay pinned at the commons revision, and the personal
maps that now live in the commons are dropped with every dive annotation pointed at the copies.
"""

import re
import shlex
import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Literal

from divelog_server.store.files import read_json, read_markdown, remove, write_json, write_markdown
from divelog_server.store.log_repo import frontmatter
from divelog_server.store.manifest import (
    MEDIA_MANIFEST,
    MediaManifest,
    normalise_licence,
    read_manifest,
)
from divelog_server.store.models import (
    ChangeEntry,
    MediaRef,
    SiteCore,
    SiteMapRecord,
    SiteOverlayRecord,
    SiteRecord,
)
from divelog_server.store.overlay import (
    merge_site,
    objective_changes,
    overlay_for,
    overlay_frontmatter,
    overlay_is_empty,
)
from divelog_server.store.sources import COMMONS_PREFIX, REPO_PREFIX, CommonsSource
from divelog_server.store.split import compact_media, generated_summary, summary_from_body
from divelog_server.store.store import Store
from divelog_server.store.validate import (
    LONG_BODY,
    SAFE_UNDERLAYS,
    Problem,
    errors,
    first_person,
    first_person_lines,
    validate_commons,
    warnings,
)

FORK_NOTES = ("Forked from commons revision", "Reviewed against commons revision")
LICENCE_KEYS = ("licence", "license", "source", "page", "author")
PR_BODY = """\
Proposes `{site_id}` ({name}) from the personal log `{log_name}`.

{summary}

## Checklist

- [ ] Coordinates name their `geo_source`
- [ ] Summary and body are neutral (no first person) and not copied from a guidebook
- [ ] Maps are my own work or derived from OpenStreetMap; no copyrighted survey was traced
- [ ] Photos are mine or carry the licence listed in `media/manifest.json`

## Licence

I contribute this site data under the Open Database License (ODbL 1.0) and the descriptions,
maps and photos I made under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), as the
commons' LICENSE.md describes.

Signed-off-by: {author} <{email}>
(Developer Certificate of Origin 1.1, https://developercertificate.org)
"""


class ProposeError(RuntimeError):
    """A proposal that cannot start: unknown site, a commons site, a dirty checkout."""


class AdoptError(RuntimeError):
    """An adoption that cannot start: no commons record for the site, no commons at all."""


# ── git ───────────────────────────────────────────────────────────────────


def run_git(root: Path, *args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    """``git -C <root> <args>``; with ``check`` a failure raises :class:`ProposeError`."""
    done = subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True, check=False
    )
    if check and done.returncode != 0:
        output = (done.stderr or done.stdout).strip()
        raise ProposeError(f"git {' '.join(args)} failed in {root}: {output}")
    return done


def is_git_repo(root: Path) -> bool:
    """Whether ``root`` is inside a git work tree."""
    return run_git(root, "rev-parse", "--is-inside-work-tree").returncode == 0


def identity_args(name: str, email: str) -> list[str]:
    """``-c`` options that make ``name <email>`` author and committer of the next commit."""
    return ["-c", f"user.name={name}", "-c", f"user.email={email}", "-c", "commit.gpgsign=false"]


def commit_all(root: Path, message: str, name: str, email: str, signoff: bool = False) -> bool:
    """Stage everything under ``root`` and commit; False when there was nothing to commit."""
    run_git(root, "add", "-A", check=True)
    if run_git(root, "diff", "--cached", "--quiet").returncode == 0:
        return False
    extra = ["--signoff"] if signoff else []
    run_git(root, *identity_args(name, email), "commit", "-q", *extra, "-m", message, check=True)
    return True


def short_head(root: Path) -> str | None:
    """The abbreviated commit checked out at ``root``."""
    done = run_git(root, "rev-parse", "--short", "HEAD")
    if done.returncode != 0:
        return None
    return done.stdout.strip() or None


def split_author(author: str | None, name: str, email: str) -> tuple[str, str]:
    """``Name <email>`` or a bare name from ``--author``, with the settings as fallback."""
    if not author:
        return name, email
    match = re.fullmatch(r"\s*(.*?)\s*<([^>]+)>\s*", author)
    if match:
        return match.group(1) or name, match.group(2)
    return author.strip(), email


def log_name(root: Path) -> str:
    """The log's name in changelog notes: the manifest ``name``, else the folder name."""
    try:
        manifest = read_manifest(root)
    except ValueError:
        manifest = None
    return (manifest.name if manifest and manifest.name else None) or root.resolve().name


# ── propose: planning ─────────────────────────────────────────────────────


@dataclass
class ProposeOptions:
    """What to propose and where.

    Parameters
    ----------
    site_id
        The ``log`` or ``fork`` site.
    log_root
        The personal log; only read.
    commons
        A git checkout of the commons the branch is made in.
    branch
        The new branch; ``propose/<site_id>`` when None.
    author, author_email
        Changelog author and commit identity.
    validate
        Run the commons validator before committing.
    media_root
        A local media store to find uploaded photos in, or None.
    skip_maps
        Drawn map ids that stay out of the proposal.
    today
        Date of the changelog entries.
    """

    site_id: str
    log_root: Path
    commons: Path
    branch: str | None = None
    author: str = "divelog"
    author_email: str = "divelog@localhost"
    validate: bool = True
    media_root: Path | None = None
    skip_maps: frozenset[str] = frozenset()
    today: date = field(default_factory=date.today)

    @property
    def branch_name(self) -> str:
        """The branch the proposal is committed on."""
        return self.branch or f"propose/{self.site_id}"


@dataclass
class MapCopy:
    """One personal drawn map copied into the commons under a new id."""

    old_id: str
    new_id: str
    revision: int
    payload: dict[str, Any]
    note: str = ""


@dataclass
class PhotoCopy:
    """One photo copied into the commons with its manifest entry."""

    media_id: str
    source: Path
    target: str
    entry: dict[str, Any]
    reuse: bool = False


@dataclass
class ProposePlan:
    """Everything a proposal writes into the commons, decided before anything is written."""

    options: ProposeOptions
    origin: Literal["log", "fork"]
    log_name: str
    record: SiteRecord
    maps: list[MapCopy] = field(default_factory=list)
    photos: list[PhotoCopy] = field(default_factory=list)
    skipped_photos: list[tuple[str, str]] = field(default_factory=list)
    skipped_maps: list[str] = field(default_factory=list)
    seed_files: list[str] = field(default_factory=list)
    region_file: str | None = None
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def site_id(self) -> str:
        """The proposed site."""
        return self.record.site_id

    @property
    def commit_message(self) -> str:
        """``Propose <id>: <name>``."""
        return f"Propose {self.site_id}: {self.record.name}"


def plan_propose(options: ProposeOptions) -> ProposePlan:
    """Decide the commons record, maps and photos of a proposal, reading both repositories.

    Raises
    ------
    ProposeError
        The site does not exist in the log, or is a commons site without a fork.
    """
    site_id = options.site_id
    commons = CommonsSource(options.commons)
    store = Store(options.log_root, commons=commons)
    store.load()
    origin = store.site_origin.get(site_id)
    if origin is None:
        raise ProposeError(f"unknown site {site_id!r} in {options.log_root}")
    if origin == "commons":
        raise ProposeError(
            f"{site_id} is already a commons site; fork it (PUT ?fork=true) to propose changes"
        )
    source = store.log_sites.sites[site_id]
    base = commons.sites.get(site_id)
    plan = ProposePlan(
        options=options,
        origin="fork" if base is not None else "log",
        log_name=log_name(options.log_root),
        record=source,
    )
    renames = _plan_maps(plan, store, commons)
    maps = _rewrite_refs(plan, source.maps, renames, store, commons)
    default = _rewrite_refs(
        plan, [source.default_map] if source.default_map else [], renames, store, commons
    )
    media = _plan_photos(plan, store, source)
    body, summary = _plan_text(plan, source, store)
    if source.region and source.region not in commons.regions:
        if source.region in store.log_sites.regions:
            plan.region_file = f"regions/{source.region}.md"
        else:
            plan.warnings.append(f"region {source.region} exists in neither repository")

    payload = source.model_dump(mode="json", include=set(SiteCore.model_fields))
    payload.update(
        maps=maps,
        default_map=default[0] if default else None,
        media=[m.model_dump(mode="json") for m in media],
        summary=summary,
        body_md=body,
    )
    payload["revision"], payload["changelog"] = _versioning(plan, base)
    record = SiteRecord.model_validate(payload)
    record.body_md = body
    plan.record = record
    return plan


def _versioning(plan: ProposePlan, base: SiteRecord | None) -> tuple[int, list[dict[str, Any]]]:
    options = plan.options
    if base is None:
        note = f"Proposed from {plan.log_name}'s log"
        entry = ChangeEntry(revision=1, date=options.today, author=options.author, note=note)
        return 1, [entry.model_dump(mode="json")]
    fork = plan.record
    seen = {(e.revision, e.note) for e in base.changelog}
    own = [
        e.note
        for e in fork.changelog
        if (e.revision, e.note) not in seen and not e.note.startswith(FORK_NOTES)
    ]
    note = f"Updated from {plan.log_name}'s fork" + (": " + "; ".join(own) if own else "")
    pinned = fork.forked_from_revision
    if pinned is not None and pinned < base.revision:
        plan.warnings.append(
            f"the commons moved from revision {pinned} to {base.revision} since the fork; "
            "this proposal replaces those changes, review the diff"
        )
    revision = base.revision + 1
    entry = ChangeEntry(revision=revision, date=options.today, author=options.author, note=note)
    changelog = [entry, *base.changelog]
    return revision, [e.model_dump(mode="json") for e in changelog]


def _plan_maps(plan: ProposePlan, store: Store, commons: CommonsSource) -> dict[str, str]:
    options = plan.options
    site_id = plan.site_id
    numbered = re.compile(rf"^{re.escape(site_id)}-(\d+)$")
    taken = {int(m.group(1)) for i in commons.maps if (m := numbered.match(i))}
    n = max(taken, default=0)
    renames: dict[str, str] = {}
    records = sorted(
        (m for m in store.log_sites.maps.values() if m.site_id == site_id),
        key=lambda m: (m.sort, m.id),
    )
    for record in records:
        if record.id in options.skip_maps:
            plan.skipped_maps.append(record.id)
            continue
        n += 1
        while f"{site_id}-{n}" in commons.maps:
            n += 1
        new_id = f"{site_id}-{n}"
        payload = read_json(store.map_path(record.id))
        note = ""
        underlay = record.underlay.ref if record.underlay else None
        if underlay and not _underlay_resolves(plan, underlay, store, commons):
            payload.pop("underlay", None)
            note = f"underlay {underlay} dropped"
        if first_person(payload.get("notes")):
            payload["notes"] = ""
            note = "; ".join(filter(None, [note, "first-person notes left out"]))
        entry = ChangeEntry(
            revision=1,
            date=options.today,
            author=options.author,
            note=f"Copied from {plan.log_name}'s map {record.id}",
        )
        payload.update(
            id=new_id,
            revision=1,
            changelog=[entry.model_dump(mode="json")],
            copied_from=f"{record.id}@{record.revision}",
        )
        payload.pop("updated_at", None)
        plan.maps.append(MapCopy(record.id, new_id, record.revision, payload, note))
        renames[record.id] = new_id
    return renames


def _underlay_resolves(plan: ProposePlan, ref: str, store: Store, commons: CommonsSource) -> bool:
    collection, _, name = ref.partition(":")
    if collection == "seed":
        return _seed_available(plan, name, store, commons)
    return collection in SAFE_UNDERLAYS


def _seed_available(plan: ProposePlan, name: str, store: Store, commons: CommonsSource) -> bool:
    """Whether a seed sketch is in the commons, copying it from the log when only there."""
    if name in commons.seed_maps:
        return True
    if name not in store.log_sites.seed_maps:
        return False
    for path in sorted((store.root / "maps" / "seed").glob(f"{name}.*")):
        relative = str(path.relative_to(store.root))
        if relative not in plan.seed_files:
            plan.seed_files.append(relative)
    return True


def _rewrite_refs(
    plan: ProposePlan,
    refs: list[str],
    renames: dict[str, str],
    store: Store,
    commons: CommonsSource,
) -> list[str]:
    kept: list[str] = []
    for ref in refs:
        collection, _, name = ref.partition(":")
        new: str | None = ref
        if collection == "drawn":
            if name in renames:
                new = f"drawn:{renames[name]}"
            elif name not in commons.maps:
                new = None
        elif collection == "seed":
            new = ref if _seed_available(plan, name, store, commons) else None
        elif collection == "reference":
            new = None
        if new is None:
            plan.notes.append(f"map reference {ref} left out (personal or not in the commons)")
        elif new not in kept:
            kept.append(new)
    return kept


def _plan_photos(plan: ProposePlan, store: Store, record: SiteRecord) -> list[MediaRef]:
    options = plan.options
    commons_root = options.commons
    manifest_path = options.log_root / MEDIA_MANIFEST
    manifest = MediaManifest(read_json(manifest_path) if manifest_path.is_file() else None)
    targets: set[str] = set()
    kept: list[MediaRef] = []
    for media in record.media:
        if media.key.startswith(COMMONS_PREFIX):
            path = media.key[len(COMMONS_PREFIX) :]
            kept.append(media.model_copy(deep=True, update={"key": REPO_PREFIX + path}))
            continue
        if not media.public:
            plan.skipped_photos.append((media.id, "not public"))
            continue
        repo_path = repo_photo_path(media.key)
        extras = {
            **(media.model_extra or {}),
            **media.model_dump(include={"licence", "author", "source"}, exclude_none=True),
        }
        from_ref = {k: extras[k] for k in LICENCE_KEYS if extras.get(k)}
        entry = manifest.entries.get(repo_path) if repo_path else None
        if entry is not None and entry.get("public") is not True:
            plan.skipped_photos.append((media.id, "manifest entry not public"))
            continue
        merged = {**from_ref, **(entry or {})}
        licence_text = merged.get("licence") or merged.get("license")
        licence = normalise_licence(licence_text)
        if licence is None:
            reason = f"licence {licence_text!r} not allowlisted" if licence_text else "no licence"
            plan.skipped_photos.append((media.id, reason))
            continue
        source = _photo_file(options, media.key, repo_path)
        if source is None:
            plan.skipped_photos.append((media.id, "file not found"))
            continue
        target = _photo_target(plan.site_id, media.key, repo_path, source, commons_root, targets)
        targets.add(target)
        reuse = (commons_root / target).is_file()
        manifest_entry = {
            "source": merged.get("source", ""),
            "page": merged.get("page", ""),
            "author": merged.get("author") or media.credit,
            "licence": licence,
            "public": True,
        }
        plan.photos.append(PhotoCopy(media.id, source, target, manifest_entry, reuse))
        ref = media.model_dump(mode="json")
        for key in LICENCE_KEYS:
            ref.pop(key, None)
        ref["key"] = REPO_PREFIX + target
        if not ref.get("credit") and manifest_entry["author"]:
            ref["credit"] = manifest_entry["author"]
        kept.append(MediaRef.model_validate(ref))
    return kept


def repo_photo_path(key: str) -> str | None:
    """The repository path a photo key names: ``repo:<path>``, or a store key ``sites/<file>``."""
    if key.startswith(REPO_PREFIX):
        return key[len(REPO_PREFIX) :]
    folder, _, name = key.partition("/")
    if folder == "sites" and name and "/" not in name:
        return f"media/sites/{name}"
    return None


def _photo_file(options: ProposeOptions, key: str, repo_path: str | None) -> Path | None:
    if repo_path and (options.log_root / repo_path).is_file():
        return options.log_root / repo_path
    if options.media_root and not key.startswith(REPO_PREFIX):
        path = options.media_root / key
        if ".." not in key and path.is_file():
            return path
    return None


def _photo_target(
    site_id: str,
    key: str,
    repo_path: str | None,
    source: Path,
    commons_root: Path,
    taken: set[str],
) -> str:
    """Where a photo goes in the commons; a different file of the same name gets a suffix."""
    if repo_path and repo_path.startswith("media/"):
        wanted = repo_path
    else:
        name = Path(key).name
        wanted = f"media/sites/{name if name.startswith(site_id) else f'{site_id}-{name}'}"
    stem, suffix = Path(wanted).stem, Path(wanted).suffix
    folder = str(Path(wanted).parent)
    candidate, n = wanted, 1
    while candidate in taken or _differs(commons_root / candidate, source):
        n += 1
        candidate = f"{folder}/{stem}-{n}{suffix}"
    return candidate


def _differs(path: Path, source: Path) -> bool:
    return path.is_file() and path.read_bytes() != source.read_bytes()


def _plan_text(plan: ProposePlan, record: SiteRecord, store: Store) -> tuple[str, str | None]:
    body = record.body_md
    lines = first_person_lines(body)
    if lines:
        numbers = ", ".join(str(n) for n, _ in lines[:5])
        plan.notes.append(
            f"body left out: first person on line {numbers}; "
            "write a neutral body in the commons branch"
        )
        body = ""
    elif len(body.strip()) > LONG_BODY and not record.sources:
        plan.notes.append("body left out: over 400 characters without sources; add sources")
        body = ""
    summary = record.summary
    if first_person(summary):
        region = store.regions.get(record.region) if record.region else None
        summary = summary_from_body(record.body_md) or generated_summary(
            record, region.name if region else None
        )
        plan.notes.append(f"summary in the first person replaced by: {summary}")
    return body, summary


# ── propose: writing ──────────────────────────────────────────────────────


@dataclass
class ProposeResult:
    """The plan, the validation problems, and where the proposal was committed."""

    plan: ProposePlan
    problems: list[Problem] = field(default_factory=list)
    warnings: list[Problem] = field(default_factory=list)
    head: str | None = None
    returned_to: str | None = None
    body_file: Path | None = None

    @property
    def ok(self) -> bool:
        """Validated and committed."""
        return not self.problems and self.head is not None


def write_proposal(plan: ProposePlan) -> None:
    """Write the record, maps, seeds, region and photos of ``plan`` into the commons checkout."""
    log = plan.options.log_root
    target = plan.options.commons
    record = plan.record
    meta = compact_media(frontmatter(record))
    write_markdown(target / "sites" / f"{record.site_id}.md", meta, record.body_md)
    for copy in plan.maps:
        write_json(target / "maps" / "drawn" / f"{copy.new_id}.json", copy.payload)
    for relative in [*plan.seed_files, *([plan.region_file] if plan.region_file else [])]:
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(log / relative, destination)
    if not plan.photos:
        return
    manifest_path = target / MEDIA_MANIFEST
    payload: dict[str, Any] = read_json(manifest_path) if manifest_path.is_file() else {}
    for photo in plan.photos:
        if not photo.reuse:
            destination = target / photo.target
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(photo.source, destination)
        payload.setdefault(photo.target, photo.entry)
    write_json(manifest_path, dict(sorted(payload.items())))


def run_propose(options: ProposeOptions, *, dry_run: bool = False) -> ProposeResult:
    """Plan a proposal and, unless ``dry_run``, branch, write, validate and commit it.

    The checkout returns to the branch it was on after a successful commit; when validation
    fails the new branch stays checked out with the files written, for fixing.

    Raises
    ------
    ProposeError
        Unknown or commons site, a checkout that is not git, dirty, or already has the branch.
    """
    commons = options.commons
    if not (commons / "divelog.yaml").is_file() and not (commons / "sites").is_dir():
        raise ProposeError(f"{commons} is not a commons checkout")
    plan = plan_propose(options)
    if dry_run:
        return ProposeResult(plan)
    if not is_git_repo(commons):
        raise ProposeError(f"{commons} is not a git checkout")
    if run_git(commons, "status", "--porcelain", check=True).stdout.strip():
        raise ProposeError(f"{commons} has uncommitted changes; commit or stash them first")
    branch = options.branch_name
    if run_git(commons, "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}").returncode == 0:
        raise ProposeError(f"branch {branch} already exists in {commons}")
    previous = run_git(commons, "branch", "--show-current").stdout.strip() or None
    run_git(commons, "switch", "-q", "-c", branch, check=True)
    write_proposal(plan)
    result = ProposeResult(plan)
    if options.validate:
        found = validate_commons(commons, base="HEAD")
        result.problems, result.warnings = errors(found), warnings(found)
        if result.problems:
            return result
    commit_all(commons, plan.commit_message, options.author, options.author_email, signoff=True)
    result.head = short_head(commons)
    if previous:
        run_git(commons, "switch", "-q", previous, check=True)
        result.returned_to = previous
    result.body_file = _write_pr_body(plan)
    return result


def pr_body(plan: ProposePlan) -> str:
    """The pull request description: what is proposed, the licence statement, the DCO line."""
    options = plan.options
    return PR_BODY.format(
        site_id=plan.site_id,
        name=plan.record.name,
        log_name=plan.log_name,
        summary=plan.record.summary or "",
        author=options.author,
        email=options.author_email,
    )


def _write_pr_body(plan: ProposePlan) -> Path:
    git_dir = run_git(plan.options.commons, "rev-parse", "--absolute-git-dir", check=True)
    path = Path(git_dir.stdout.strip()) / f"divelog-propose-{plan.site_id}.md"
    path.write_text(pr_body(plan), encoding="utf-8")
    return path


def next_steps(result: ProposeResult) -> list[str]:
    """The commands that push the branch and open the pull request."""
    plan = result.plan
    commons = str(plan.options.commons)
    branch = plan.options.branch_name
    body = (
        f"--body-file {shlex.quote(str(result.body_file))}"
        if result.body_file
        else f"--body {shlex.quote(pr_body(plan))}"
    )
    return [
        f"git -C {shlex.quote(commons)} push -u origin {shlex.quote(branch)}",
        f"cd {shlex.quote(commons)}; gh pr create --head {shlex.quote(branch)} "
        f"--title {shlex.quote(plan.commit_message)} {body}",
    ]


def render_plan(plan: ProposePlan) -> list[str]:
    """The proposal as lines of text: record, maps, photos, notes and warnings."""
    record = plan.record
    lines = [
        f"propose {plan.site_id} ({plan.origin}) as revision {record.revision} "
        f"on branch {plan.options.branch_name}",
    ]
    for copy in plan.maps:
        extra = f"; {copy.note}" if copy.note else ""
        source = f"{copy.old_id}@{copy.revision}"
        lines.append(f"  map {copy.old_id} -> {copy.new_id} (copied_from {source}{extra})")
    for map_id in plan.skipped_maps:
        lines.append(f"  map {map_id} stays personal (--skip-map)")
    for photo in plan.photos:
        how = "already there" if photo.reuse else "copied"
        lines.append(
            f"  photo {photo.media_id} -> {photo.target} ({photo.entry['licence']}, {how})"
        )
    for media_id, reason in plan.skipped_photos:
        lines.append(f"  photo {media_id} skipped: {reason}")
    for relative in plan.seed_files:
        lines.append(f"  seed {relative}")
    if plan.region_file:
        lines.append(f"  region {plan.region_file}")
    lines += [f"  note: {note}" for note in plan.notes]
    lines += [f"  warning: {warning}" for warning in plan.warnings]
    return lines


# ── adopt ─────────────────────────────────────────────────────────────────


@dataclass
class AdoptResult:
    """What one adoption changed in the log."""

    site_id: str
    already: bool = False
    overlay: bool = False
    maps_removed: dict[str, str] = field(default_factory=dict)
    maps_renamed: dict[str, str] = field(default_factory=dict)
    dives: list[int] = field(default_factory=list)
    photos_removed: list[str] = field(default_factory=list)
    from_commons: list[str] = field(default_factory=list)
    base_revision: int = 0
    committed: bool = False
    problems: list[str] = field(default_factory=list)


def load_merged(log_root: Path, commons_root: Path) -> Store:
    """The log merged with the commons checkout at ``commons_root``."""
    store = Store(log_root, commons=CommonsSource(commons_root))
    store.load()
    return store


def copied_maps(store: Store, site_id: str) -> dict[str, SiteMapRecord]:
    """Log map id → the commons map copied from it, for the drawn maps of one site."""
    assert store.commons is not None
    found: dict[str, SiteMapRecord] = {}
    for record in store.commons.maps.values():
        if record.site_id != site_id or not record.copied_from:
            continue
        old = record.copied_from.rpartition("@")[0]
        personal = store.log_sites.maps.get(old)
        if personal is not None and personal.site_id == site_id:
            found[old] = record
    return found


def adoptable(store: Store, name: str) -> list[str]:
    """Log or fork sites whose commons record came from this log's proposal."""
    assert store.commons is not None
    found: list[str] = []
    marks = (f"Proposed from {name}'s log", f"Updated from {name}'s fork")
    for site_id in sorted(store.log_sites.sites):
        base = store.commons.sites.get(site_id)
        if base is None:
            continue
        proposed = any(e.note.startswith(marks) for e in base.changelog)
        if proposed or copied_maps(store, site_id):
            found.append(site_id)
    return found


def adopt_site(store: Store, site_id: str, *, keep_maps: bool = False) -> AdoptResult:
    """Turn the full log record of ``site_id`` into an overlay on its commons record.

    Writes the log files; the caller commits. ``store`` must be loaded with the commons.

    Raises
    ------
    AdoptError
        The commons has no record for the site, or the log has no record at all.
    """
    if store.commons is None:
        raise AdoptError("no commons checkout")
    base_record = store.commons.sites.get(site_id)
    if base_record is None:
        raise AdoptError(
            f"the commons has no record for {site_id}; merge the proposal and pull the commons"
        )
    result = AdoptResult(site_id, base_revision=base_record.revision)
    record = store.log_sites.sites.get(site_id)
    if record is None:
        result.already = True
        return result
    record = record.model_copy(deep=True)
    base = merge_site(base_record, None)
    matches = copied_maps(store, site_id)
    renames: dict[str, tuple[str, int | None]] = {}
    if keep_maps:
        taken = set(store.maps)
        n = 0
        for old in sorted(matches):
            if old not in store.commons.maps:
                continue
            n += 1
            while f"{site_id}-p{n}" in taken:
                n += 1
            new = f"{site_id}-p{n}"
            taken.add(new)
            renames[old] = (new, None)
            payload = read_json(store.map_path(old))
            payload["id"] = new
            write_json(store.map_path(new), payload)
            remove(store.map_path(old))
            result.maps_renamed[old] = new
    else:
        for old, copy in matches.items():
            renames[old] = (copy.id, copy.revision)
            remove(store.map_path(old))
            result.maps_removed[old] = copy.id
    record.maps = _dedupe(_renamed_ref(r, renames) for r in record.maps)
    if record.default_map:
        record.default_map = _renamed_ref(record.default_map, renames)
    result.dives = _rewrite_annotations(store, renames)
    result.from_commons = [n for n in objective_changes(record, base) if n != "media"]
    result.photos_removed = _drop_copied_photos(store, record, base)
    extras = dict(record.model_extra or {})
    overlay = overlay_for(record, base)
    payload = {**extras, **overlay.model_dump(mode="json")}
    overlay = SiteOverlayRecord.model_validate(payload)
    overlay.body_md = record.body_md if record.body_md != base.body_md else ""
    path = store.site_path(site_id)
    if overlay_is_empty(overlay):
        remove(path)
    else:
        write_markdown(path, compact_media(overlay_frontmatter(overlay)), overlay.body_md)
        result.overlay = True
    return result


def _renamed_ref(ref: str, renames: dict[str, tuple[str, int | None]]) -> str:
    collection, _, name = ref.partition(":")
    if collection == "drawn" and name in renames:
        return f"drawn:{renames[name][0]}"
    return ref


def _dedupe(refs: Any) -> list[str]:
    kept: list[str] = []
    for ref in refs:
        if ref not in kept:
            kept.append(ref)
    return kept


def _rewrite_annotations(store: Store, renames: dict[str, tuple[str, int | None]]) -> list[int]:
    """Point dive annotations on renamed maps at the new id (and commons revision)."""
    changed: list[int] = []
    for number, dive in sorted(store.dives.items()):
        old = (dive.map_annotation or {}).get("map_id")
        if old not in renames:
            continue
        new, revision = renames[old]
        path = store.dive_path(number)
        meta, body = read_markdown(path)
        annotation = dict(meta.get("map_annotation") or {})
        annotation["map_id"] = new
        if revision is not None:
            annotation["revision"] = revision
        meta["map_annotation"] = annotation
        write_markdown(path, meta, body)
        changed.append(number)
    return changed


def _drop_copied_photos(store: Store, record: SiteRecord, base: SiteRecord) -> list[str]:
    """Remove log copies of photos that now live in the commons under the same path."""
    in_commons = {m.id: m.key for m in base.media}
    manifest_path = store.root / MEDIA_MANIFEST
    if not manifest_path.is_file():
        manifest = MediaManifest()
    else:
        manifest = MediaManifest(read_json(manifest_path))
    removed: list[str] = []
    for media in record.media:
        commons_key = in_commons.get(media.id)
        path = repo_photo_path(media.key)
        if commons_key is None or path is None or not media.key.startswith(REPO_PREFIX):
            continue
        if commons_key != COMMONS_PREFIX + path:
            continue
        owners = [o for o in store.media_referrers(media.key) if o != ("site", record.site_id)]
        if owners:
            continue
        remove(store.root / path)
        manifest.remove(path)
        removed.append(path)
    if removed and manifest_path.is_file():
        write_json(manifest_path, manifest.payload)
    return removed


def render_adopt(result: AdoptResult) -> list[str]:
    """What an adoption changed, as lines of text."""
    if result.already:
        return [f"{result.site_id}: already a commons site, nothing to adopt"]
    what = "overlay written" if result.overlay else "no personal material left, file removed"
    lines = [f"adopt {result.site_id}: {what}, pinned at commons revision {result.base_revision}"]
    for old, new in sorted(result.maps_removed.items()):
        lines.append(f"  map {old} removed, the commons has it as {new}")
    for old, new in sorted(result.maps_renamed.items()):
        lines.append(f"  map {old} kept as personal map {new}")
    if result.dives:
        lines.append(f"  dive annotations rewritten: {', '.join(str(n) for n in result.dives)}")
    for path in result.photos_removed:
        lines.append(f"  photo {path} removed, it lives in the commons")
    if result.from_commons:
        lines.append(f"  taken from the commons record: {', '.join(result.from_commons)}")
    lines += [f"  problem: {p}" for p in result.problems]
    return lines
