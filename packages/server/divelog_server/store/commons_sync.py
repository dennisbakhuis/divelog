"""Follow the commons: pull the checkout, pin the log manifest to it, find sites to adopt.

``pull`` fast-forwards the commons checkout a log names in ``divelog.yaml``, records the new
head as the manifest ``ref`` and reports the overlays and forks the new commons revisions made
stale. ``search`` is the "adopt a site" lookup over the commons records, by words (typos
allowed, see :mod:`~divelog_server.store.site_search`) and/or distance.
"""

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, overload

from divelog_server.store.manifest import locate_commons, read_manifest, write_manifest
from divelog_server.store.proposals import commit_all, is_git_repo, run_git, short_head
from divelog_server.store.site_search import match, words
from divelog_server.store.sources import CommonsSource
from divelog_server.store.store import SiteOrigin, Store

NEAR_KM = 25.0
EARTH_RADIUS_KM = 6371.0088


class PullError(RuntimeError):
    """The pull cannot run or git refused it (no commons source, diverged history)."""


@dataclass
class StaleSite:
    """An overlay or fork the commons has moved past."""

    site_id: str
    origin: SiteOrigin
    pinned_revision: int | None
    current_revision: int
    new: bool


@dataclass
class PullResult:
    """The commons head before and after, whether the manifest moved, and the stale sites."""

    previous: str | None
    head: str | None
    pinned: bool
    committed: bool
    stale: list[StaleSite] = field(default_factory=list)
    output: str = ""


def stale_sites(store: Store) -> dict[str, StaleSite]:
    """Every stale overlay or fork of a loaded store, by site id."""
    found: dict[str, StaleSite] = {}
    for site_id in sorted(store.sites):
        pin = store.site_pin_state(site_id)
        if pin is None or not pin.stale:
            continue
        found[site_id] = StaleSite(
            site_id,
            store.site_origin.get(site_id, "log"),
            pin.pinned_revision,
            pin.current_revision,
            new=True,
        )
    return found


def newly_stale(before: dict[str, StaleSite], after: dict[str, StaleSite]) -> list[StaleSite]:
    """The stale sites of ``after``, each marked ``new`` unless it was already stale before."""
    for site_id, site in after.items():
        old = before.get(site_id)
        site.new = old is None or old.current_revision != site.current_revision
    return list(after.values())


def pin_manifest(log_root: Path, head: str) -> bool:
    """Set the ``ref`` of the log's commons source to ``head``; False when nothing changed."""
    manifest = read_manifest(log_root)
    source = manifest.commons_source() if manifest else None
    if manifest is None or source is None or source.ref == head:
        return False
    source.ref = head
    write_manifest(log_root, manifest)
    return True


SET_COMMONS = (
    "set it with --commons PATH, the COMMONS_ROOT environment variable, "
    "or the path of the commons source in divelog.yaml"
)
NAMED_BY = {
    "--commons": "--commons",
    "COMMONS_ROOT": "the COMMONS_ROOT environment variable",
    "divelog.yaml": "the commons source path in divelog.yaml",
}


@overload
def resolve_commons(
    log_root: Path, commons: Path | None, *, required: Literal[True] = True
) -> Path: ...


@overload
def resolve_commons(log_root: Path, commons: Path | None, *, required: bool) -> Path | None: ...


def resolve_commons(log_root: Path, commons: Path | None, *, required: bool = True) -> Path | None:
    """The existing commons checkout of a log, found as :func:`locate_commons` describes.

    Parameters
    ----------
    log_root
        The log repository; its ``divelog.yaml`` is read.
    commons
        The ``--commons`` option, None when not given.
    required
        Whether a log that names no commons anywhere is an error; when False it gives None.

    Raises
    ------
    PullError
        ``divelog.yaml`` does not parse, the commons path that was found does not exist, or
        (``required``) nothing names a commons.
    """
    try:
        manifest = read_manifest(log_root)
    except ValueError as exc:
        raise PullError(f"divelog.yaml: {exc}") from exc
    location = locate_commons(log_root, manifest, commons)
    if location is None:
        if not required:
            return None
        raise PullError(
            f"{log_root}/divelog.yaml names no commons source with a path; {SET_COMMONS}"
        )
    if not location.root.is_dir():
        raise PullError(
            f"the commons checkout {location.root} does not exist "
            f"(named by {NAMED_BY[location.via]}); {SET_COMMONS}"
        )
    return location.root


def pull(
    log_root: Path,
    commons: Path | None = None,
    ref: str | None = None,
    *,
    author: str = "divelog",
    email: str = "divelog@localhost",
) -> PullResult:
    """``git pull --ff-only`` in the commons, pin the manifest to the result, report staleness.

    A commons checkout without an upstream branch (a local commons) is not pulled; its
    current head is pinned.

    Parameters
    ----------
    log_root
        The log repository; its manifest is rewritten and committed.
    commons
        The commons checkout; when None, ``COMMONS_ROOT``, then the manifest source path.
    ref
        Pin this commit instead of the new head (it must exist in the commons).
    author, email
        Identity of the log commit.

    Raises
    ------
    PullError
        No commons, not a git checkout, the pull is not a fast-forward, or ``ref`` is unknown.
    """
    root = resolve_commons(log_root, commons)
    if not is_git_repo(root):
        raise PullError(f"{root} is not a git checkout")
    before = stale_sites(_store(log_root, root))
    previous = short_head(root)
    if run_git(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").returncode:
        output = "no upstream branch; pinning the local checkout"
    else:
        done = run_git(root, "pull", "--ff-only", "--quiet")
        output = (done.stdout + done.stderr).strip()
        if done.returncode != 0:
            raise PullError(f"git pull --ff-only failed in {root}: {output}")
    head = short_head(root)
    if ref:
        found = run_git(root, "rev-parse", "--short", "--verify", "--quiet", f"{ref}^{{commit}}")
        if found.returncode != 0:
            raise PullError(f"{ref} is not a commit of {root}")
        head = found.stdout.strip()
    pinned = pin_manifest(log_root, head) if head else False
    committed = False
    if pinned and is_git_repo(log_root):
        committed = commit_all(log_root, f"Pin the commons at {head}", author, email)
    after = stale_sites(_store(log_root, root))
    return PullResult(previous, head, pinned, committed, newly_stale(before, after), output)


def _store(log_root: Path, commons: Path) -> Store:
    store = Store(log_root, commons=CommonsSource(commons))
    store.load()
    return store


# ── adopt-a-site search ───────────────────────────────────────────────────


@dataclass
class CommonsHit:
    """One commons site found by :func:`search`."""

    site_id: str
    name: str
    country: str | None
    type: str
    lat: float | None
    lon: float | None
    area: str | None
    dives: int
    origin: SiteOrigin
    distance_km: float | None = None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def parse_near(text: str) -> tuple[float, float]:
    """``lat,lon`` as numbers.

    Raises
    ------
    ValueError
        Not two numbers, or out of range.
    """
    parts = text.split(",")
    if len(parts) != 2:
        raise ValueError("near must be lat,lon")
    lat, lon = float(parts[0]), float(parts[1])
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("near is out of range")
    return lat, lon


def search(
    store: Store,
    q: str = "",
    near: tuple[float, float] | None = None,
    limit: int = 20,
    radius_km: float = NEAR_KM,
) -> list[CommonsHit]:
    """Commons sites matching every word of ``q`` and/or within ``radius_km`` of ``near``.

    Words match names, aliases and the area as :mod:`~divelog_server.store.site_search`
    describes, typos included. With ``near`` the hits are ordered by distance, then by how
    well they match; without it by how well they match, then by name.
    """
    if store.commons is None:
        return []
    scores = match(q, store.commons_index()) if words(q) else None
    ranked: list[tuple[tuple[bool, float, float], CommonsHit]] = []
    for site_id, record in store.commons.sites.items():
        score = scores.get(site_id) if scores is not None else None
        if scores is not None and score is None:
            continue
        distance = None
        if near is not None:
            if record.lat is None or record.lon is None:
                continue
            distance = haversine_km(near[0], near[1], record.lat, record.lon)
            if distance > radius_km:
                continue
        hit = CommonsHit(
            site_id=site_id,
            name=record.name,
            country=record.country,
            type=record.type,
            lat=record.lat,
            lon=record.lon,
            area=record.area,
            dives=len(store.dives_by_site.get(site_id, [])),
            origin=store.site_origin.get(site_id, "commons"),
            distance_km=round(distance, 3) if distance is not None else None,
        )
        ranked.append((score.rank if score is not None else (False, 0.0, 0.0), hit))
    if near is not None:
        ranked.sort(key=lambda item: (item[1].distance_km or 0.0, item[0], item[1].name))
    else:
        ranked.sort(key=lambda item: (item[0], item[1].name.casefold(), item[1].site_id))
    return [hit for _, hit in ranked[:limit]]
