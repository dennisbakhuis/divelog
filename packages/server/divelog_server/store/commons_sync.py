"""Follow the commons: pull the checkout, pin the log manifest to it, find sites to adopt.

``pull`` fast-forwards the commons checkout a log names in ``divelog.yaml``, records the new
head as the manifest ``ref`` and reports the overlays and forks the new commons revisions made
stale. ``search`` is the "adopt a site" lookup over the commons records.
"""

import math
from dataclasses import dataclass, field
from pathlib import Path

from divelog_server.store.manifest import commons_root_for, read_manifest, write_manifest
from divelog_server.store.proposals import commit_all, is_git_repo, run_git, short_head
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


def resolve_commons(log_root: Path, commons: Path | None) -> Path:
    """The commons checkout of a log: ``commons`` when given, else the manifest source path.

    Raises
    ------
    PullError
        The log names no commons source with a path, and none was given.
    """
    try:
        manifest = read_manifest(log_root)
    except ValueError as exc:
        raise PullError(f"divelog.yaml: {exc}") from exc
    if commons is not None:
        return commons
    found = commons_root_for(log_root, manifest)
    if found is None:
        raise PullError(f"{log_root}/divelog.yaml names no commons source with a path")
    return found


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
        The commons checkout; the manifest source path when None.
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
    """Commons sites matching ``q`` (name, alias or area substring) and/or within ``radius_km``.

    With ``near`` the hits are ordered by distance, else by name.
    """
    if store.commons is None:
        return []
    needle = q.strip().casefold()
    hits: list[CommonsHit] = []
    for site_id, record in store.commons.sites.items():
        if needle:
            names = [record.name, record.full_name, record.short_name, record.area, *record.aliases]
            if not any(needle in n.casefold() for n in names if n):
                continue
        distance = None
        if near is not None:
            if record.lat is None or record.lon is None:
                continue
            distance = haversine_km(near[0], near[1], record.lat, record.lon)
            if distance > radius_km:
                continue
        hits.append(
            CommonsHit(
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
        )
    if near is not None:
        hits.sort(key=lambda h: (h.distance_km or 0.0, h.name))
    else:
        hits.sort(key=lambda h: (h.name.casefold(), h.site_id))
    return hits[:limit]
