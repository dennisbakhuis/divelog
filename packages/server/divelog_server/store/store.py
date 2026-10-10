"""The data repositories loaded into memory, with typed collections and derived indexes.

Files are the source of truth. The personal log (:class:`LogRepo` plus a
:class:`LogSiteSource`) and an optional read-only site commons (:class:`CommonsSource`) are read
by ``load()`` (a file that fails validation is reported and skipped, never fatal) and merged into
one view: every site id resolves to a personal ``log`` record, a ``fork`` that shadows a commons
record, or a ``commons`` record with the personal overlay applied. Writers rewrite one file of
the log, update the indexes and end in a git commit; the commons is never written.

Site records carry their own ``revision`` and ``changelog``. Overlays and forks are pinned to the
commons revision they were written against; :meth:`Store.site_pin_state` says when the commons
has moved on, and only :meth:`Store.pin_site` moves the pin.
"""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from divelog_server.services.storage import media_base
from divelog_server.store.files import remove, write_json, write_markdown
from divelog_server.store.git import GitRepo
from divelog_server.store.loader import Loader
from divelog_server.store.log_repo import (
    MAX_PROFILE_POINTS,
    SPARK_POINTS,
    LogRepo,
    downsample,
    frontmatter,
    profile_depths,
    spark_depths,
)
from divelog_server.store.models import (
    MediaRef,
    PinState,
    RegionRecord,
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
from divelog_server.store.sources import PUBLIC_REPO_DIRS, CommonsSource, LogSiteSource
from divelog_server.store.trips import DEFAULT_HOME_COUNTRIES, TripIndex, derive_trips

__all__ = [
    "MAX_PROFILE_POINTS",
    "PUBLIC_REPO_DIRS",
    "SPARK_POINTS",
    "CommonsEditError",
    "NothingToPinError",
    "Store",
    "downsample",
    "frontmatter",
    "profile_depths",
    "spark_depths",
]

logger = logging.getLogger(__name__)

SiteOrigin = Literal["log", "commons", "fork"]
MapOrigin = Literal["log", "commons"]

COMMONS_SITE = "commons site; fork to edit"
COMMONS_MAP = "commons map; copy it to a personal map to edit"
COMMONS_REGION = "commons region; it cannot be deleted here"


class CommonsEditError(ValueError):
    """A write that would change a record owned by the commons; the API answers 422."""


class NothingToPinError(LookupError):
    """A pin on a site that has no commons record, or no overlay or fork of one; 404."""


class Store(LogRepo):
    """The merged, in-memory view of the log repository and the optional site commons.

    Parameters
    ----------
    root
        The log repository checkout.
    git
        The log repository's git wrapper; a disabled one when omitted.
    home_countries
        ISO-3 codes that do not count as abroad for derived trips.
    commons
        A read-only site commons, or None for a log-only instance.
    owner_name
        Author of the changelog entries written when a site moves to a new revision.
    """

    def __init__(
        self,
        root: Path,
        git: GitRepo | None = None,
        home_countries: frozenset[str] = DEFAULT_HOME_COUNTRIES,
        commons: CommonsSource | None = None,
        owner_name: str | None = None,
    ) -> None:
        super().__init__(root, git)
        self.home_countries = home_countries
        self.owner_name = owner_name
        self.log_sites = LogSiteSource(root)
        self.commons = commons
        self._load_errors: list[str] = []
        self.sites: dict[str, SiteRecord] = {}
        self.regions: dict[str, RegionRecord] = {}
        self.maps: dict[str, SiteMapRecord] = {}
        self.seed_maps: set[str] = set()
        self.site_origin: dict[str, SiteOrigin] = {}
        self.map_origin: dict[str, MapOrigin] = {}
        self.dangling_sites: set[str] = set()
        self.status: list[str] = []
        self._resolve()
        self._index()

    # ── paths ──────────────────────────────────────────────────────────────

    def site_path(self, site_id: str) -> Path:
        """The log file of a site: a full record or an overlay."""
        return self.log_sites.site_path(site_id)

    def region_path(self, region_id: str) -> Path:
        """The log file of a region."""
        return self.log_sites.region_path(region_id)

    def map_path(self, map_id: str) -> Path:
        """The log file of a drawn map."""
        return self.log_sites.map_path(map_id)

    def public_file(self, relative: str) -> Path | None:
        """A file under one of the publishable directories of the log repository, or None."""
        return self.log_sites.public_file(relative)

    def commons_file(self, relative: str) -> Path | None:
        """A file under one of the publishable directories of the commons, or None."""
        return self.commons.public_file(relative) if self.commons else None

    def commons_head(self) -> str | None:
        """The commons commit checked out at the last load, or None."""
        return self.commons.head() if self.commons else None

    # ── loading ────────────────────────────────────────────────────────────

    def load(self) -> None:
        """Read both repositories from disk and rebuild every index."""
        loader = Loader(self.root)
        self.load_personal(loader)
        errors = loader.errors + self.log_sites.load()
        if self.commons is not None:
            errors += self.commons.load()
        for slug, ids in self.person_slug_clashes().items():
            errors.append(f"people: slug {slug!r} used by {', '.join(ids)}")
        self._load_errors = errors
        self._resolve()
        self._index()
        for message in self.errors:
            logger.warning("store: %s", message)
        for message in self.status:
            logger.info("store: %s", message)
        logger.info(
            "store loaded: %d dives, %d sites, %d people, %d maps",
            len(self.dives),
            len(self.sites),
            len(self.people),
            len(self.maps),
        )

    async def reload(self) -> None:
        """Re-read everything under the write lock."""
        async with self.lock:
            await asyncio.to_thread(self.load)

    # ── merging the sources ────────────────────────────────────────────────

    def _resolve(self) -> None:
        """Merge log and commons into ``sites``, ``regions``, ``maps`` and their origins.

        A full log record wins (``fork`` when it shadows a commons id), else the commons record
        with its overlay applied; an overlay without a commons record is an error and skipped.
        """
        commons = self.commons
        base_sites = commons.sites if commons else {}
        overlays = self.log_sites.overlays
        status: list[str] = []
        errors: list[str] = []
        sites: dict[str, SiteRecord] = {}
        origin: dict[str, SiteOrigin] = {}
        for site_id, record in self.log_sites.sites.items():
            sites[site_id] = record
            if site_id in base_sites:
                origin[site_id] = "fork"
                status.append(f"site {site_id} shadows the commons record")
            else:
                origin[site_id] = "log"
        for site_id, base in base_sites.items():
            if site_id not in sites:
                sites[site_id] = merge_site(base, overlays.get(site_id))
                origin[site_id] = "commons"
        for site_id in sorted(sites):
            pin = pin_state(
                origin[site_id], sites[site_id], base_sites.get(site_id), overlays.get(site_id)
            )
            if pin is not None and pin.stale:
                status.append(stale_notice(site_id, origin[site_id], pin))
        self.dangling_sites = {site_id for site_id in overlays if site_id not in base_sites}
        for site_id in sorted(self.dangling_sites):
            errors.append(f"sites/{site_id}.md: overlay for {site_id} has no commons record")
        base_regions = commons.regions if commons else {}
        for region_id in self.log_sites.regions:
            if region_id in base_regions:
                status.append(f"region {region_id} shadows the commons record")
        base_maps = commons.maps if commons else {}
        map_origin: dict[str, MapOrigin] = dict.fromkeys(base_maps, "commons")
        for map_id in self.log_sites.maps:
            if map_id in base_maps:
                status.append(f"map {map_id} shadows the commons record")
            map_origin[map_id] = "log"
        self.sites = sites
        self.site_origin = origin
        self.regions = {**base_regions, **self.log_sites.regions}
        self.maps = {**base_maps, **self.log_sites.maps}
        self.map_origin = map_origin
        self.seed_maps = self.log_sites.seed_maps | (commons.seed_maps if commons else set())
        self.status = status
        self.errors = [*self._load_errors, *errors]

    def site_pin_state(self, site_id: str) -> PinState | None:
        """The pin of an overlay or fork against the commons; None for a personal site."""
        base = self.commons.sites.get(site_id) if self.commons else None
        site = self.sites.get(site_id)
        if site is None:
            return None
        overlay = self.log_sites.overlays.get(site_id)
        return pin_state(self.site_origin.get(site_id, "log"), site, base, overlay)

    # ── indexes ────────────────────────────────────────────────────────────

    def _index(self) -> None:
        """Rebuild the derived lookups after a load or a write."""
        self.dives_by_site: dict[str, list[int]] = defaultdict(list)
        self.dives_by_person: dict[str, list[int]] = defaultdict(list)
        self.maps_by_site: dict[str, list[str]] = defaultdict(list)
        self.person_by_slug: dict[str, str] = {}
        self.media_owner: dict[str, tuple[str, str | int]] = {}
        self.media_public: dict[str, bool] = {}
        self.sorted_numbers: list[int] = sorted(self.dives)
        for number in self.sorted_numbers:
            dive = self.dives[number]
            if dive.site:
                self.dives_by_site[dive.site].append(number)
            for person_id in dive.people:
                self.dives_by_person[person_id].append(number)
            for media in dive.media:
                self._index_media(media, ("dive", number))
        for site in self.sites.values():
            for media in site.media:
                self._index_media(media, ("site", site.site_id))
        for person in self.people.values():
            self.person_by_slug.setdefault(person.slug, person.id)
            for media in person.media:
                self._index_media(media, ("person", person.id))
        for item in self.gear_items.values():
            for media in item.media:
                self._index_media(media, ("gear", item.id))
        for record in sorted(self.maps.values(), key=lambda m: (m.sort, m.id)):
            self.maps_by_site[record.site_id].append(record.id)
        self._index_trips()

    def _index_trips(self) -> None:
        public = [d for d in self.dives.values() if d.visibility == "public"]
        counted = [d for d in self.dives.values() if d.visibility != "draft"]
        overrides = list(self.trips.values())
        home = self.home_countries
        self.trips_public = derive_trips(public, self.sites, self.regions, overrides, home)
        self.trips_owner = derive_trips(counted, self.sites, self.regions, overrides, home)

    def trip_index(self, owner: bool) -> TripIndex:
        """Derived trips as the viewer sees them: over public dives, or all but drafts."""
        return self.trips_owner if owner else self.trips_public

    def _index_media(self, media: MediaRef, owner: tuple[str, str | int]) -> None:
        self.media_owner[media.id] = owner
        base = media_base(media.key)
        self.media_public[base] = self.media_public.get(base, True) and media.public

    def next_dive_number(self) -> int:
        """One past the highest dive number."""
        return (self.sorted_numbers[-1] if self.sorted_numbers else 0) + 1

    def media_referrers(self, key: str) -> list[tuple[str, str | int]]:
        """Every record that points at a storage key; shared scan pages have two."""
        owners: list[tuple[str, str | int]] = []
        for dive in self.dives.values():
            if any(m.key == key for m in dive.media):
                owners.append(("dive", dive.number))
        for site in self.sites.values():
            if any(m.key == key for m in site.media):
                owners.append(("site", site.site_id))
        for person in self.people.values():
            if any(m.key == key for m in person.media):
                owners.append(("person", person.id))
        for item in self.gear_items.values():
            if any(m.key == key for m in item.media):
                owners.append(("gear", item.id))
        return owners

    # ── site writers ───────────────────────────────────────────────────────

    def _refresh(self) -> None:
        self._resolve()
        self._index()

    async def save_site(
        self, record: SiteRecord, message: str, *, fork: bool = False
    ) -> SiteRecord:
        """Write a site to the log by its origin, and return it as the merged view now shows it.

        A ``log`` or ``fork`` site is written as a full record. On a ``commons`` site only
        overlay material is written, to an overlay file; a change to an objective field raises
        :class:`CommonsEditError` unless ``fork`` is set, which writes a full record marked
        ``forked_from: commons@<revision>`` instead.

        ``revision`` and ``changelog`` of ``record`` are ignored: a new site starts at revision
        1, a full record moves to the next revision (with ``message`` as the changelog note)
        only when an objective field changed, and a fork continues the commons changelog.

        Raises
        ------
        CommonsEditError
            Objective fields of a commons site changed without ``fork``.
        """
        site_id = record.site_id
        async with self.lock:
            base = self.commons.sites.get(site_id) if self.commons else None
            if base is not None and self.site_origin.get(site_id) != "fork":
                if fork:
                    self._write_fork(record, base)
                else:
                    changed = objective_changes(record, base)
                    if changed:
                        self._refresh()
                        raise CommonsEditError(COMMONS_SITE)
                    self._write_overlay(record, base)
            else:
                self._version(record, self.log_sites.sites.get(site_id), message)
                self._write_full(record)
            self._refresh()
            await self.git.commit(message)
            return self.sites[site_id]

    def _version(self, record: SiteRecord, stored: SiteRecord | None, message: str) -> None:
        """Give ``record`` the revision and changelog it has after a save over ``stored``."""
        if stored is None:
            record.revision, record.changelog = 1, []
            return
        record.revision = stored.revision
        record.changelog = [entry.model_copy() for entry in stored.changelog]
        record.forked_from = stored.forked_from
        if objective_changes(record, stored):
            record.bump(message, self.owner_name)

    def _write_fork(self, record: SiteRecord, base: SiteRecord) -> None:
        record.revision = base.revision
        record.changelog = [entry.model_copy() for entry in base.changelog]
        record.forked_from = f"commons@{base.revision}"
        record.bump(f"Forked from commons revision {base.revision}", self.owner_name)
        self._write_full(record)
        self.log_sites.overlays.pop(record.site_id, None)

    def _write_full(self, record: SiteRecord) -> None:
        write_markdown(self.site_path(record.site_id), frontmatter(record), record.body_md)
        self.log_sites.sites[record.site_id] = record

    def _write_overlay(self, record: SiteRecord, base: SiteRecord) -> None:
        stored = self.log_sites.overlays.get(record.site_id)
        overlay = overlay_for(record, base, stored.base_revision if stored else None)
        path = self.site_path(record.site_id)
        if overlay_is_empty(overlay):
            remove(path)
            self.log_sites.overlays.pop(record.site_id, None)
            return
        write_markdown(path, overlay_frontmatter(overlay), overlay.body_md)
        self.log_sites.overlays[record.site_id] = overlay

    async def pin_site(self, site_id: str) -> SiteRecord:
        """Move the pin of an overlay or fork to the current commons revision.

        An overlay gets the commons revision as ``base_revision``; a fork gets a new
        ``forked_from`` and a changelog entry on its next revision.

        Raises
        ------
        NothingToPinError
            The site is personal, has no commons record, or a commons site has no overlay.
        """
        async with self.lock:
            base = self.commons.sites.get(site_id) if self.commons else None
            origin = self.site_origin.get(site_id)
            if base is None or origin == "log":
                raise NothingToPinError(site_id)
            revision = base.revision
            path = self.site_path(site_id)
            if origin == "fork":
                record = self.log_sites.sites[site_id].model_copy(deep=True)
                record.forked_from = f"commons@{revision}"
                record.bump(f"Reviewed against commons revision {revision}", self.owner_name)
                self._write_full(record)
            else:
                overlay = self.log_sites.overlays.get(site_id)
                if overlay is None:
                    raise NothingToPinError(site_id)
                overlay = overlay.model_copy(update={"base_revision": revision})
                write_markdown(path, overlay_frontmatter(overlay), overlay.body_md)
                self.log_sites.overlays[site_id] = overlay
            self._refresh()
            await self.git.commit(f"Pin site {site_id} to commons revision {revision}")
            return self.sites[site_id]

    async def delete_site(self, site_id: str, message: str) -> None:
        """Remove the log file of a site.

        A ``commons`` site loses its overlay only; a ``fork`` falls back to the commons record.
        """
        async with self.lock:
            remove(self.site_path(site_id))
            self.log_sites.sites.pop(site_id, None)
            self.log_sites.overlays.pop(site_id, None)
            self._refresh()
            await self.git.commit(message)

    async def save_region(self, record: RegionRecord, message: str) -> None:
        """Write a region to the log; on a commons id the log copy shadows the commons one."""
        async with self.lock:
            write_markdown(self.region_path(record.region), frontmatter(record), record.body_md)
            self.log_sites.regions[record.region] = record
            self._resolve()
            self._index_trips()
            await self.git.commit(message)

    async def delete_region(self, region_id: str, message: str) -> None:
        """Remove a region from the log.

        Raises
        ------
        CommonsEditError
            The region exists only in the commons.
        """
        async with self.lock:
            if region_id not in self.log_sites.regions:
                raise CommonsEditError(COMMONS_REGION)
            remove(self.region_path(region_id))
            self.log_sites.regions.pop(region_id, None)
            self._resolve()
            self._index_trips()
            await self.git.commit(message)

    # ── map writers ────────────────────────────────────────────────────────

    def _check_map_writable(self, map_id: str) -> None:
        if self.map_origin.get(map_id) == "commons":
            raise CommonsEditError(COMMONS_MAP)

    async def save_map(self, record: SiteMapRecord, message: str) -> None:
        """Write a drawn map to the log.

        Raises
        ------
        CommonsEditError
            The id belongs to a commons map.
        """
        async with self.lock:
            self._check_map_writable(record.id)
            record.updated_at = datetime.now(UTC)
            write_json(self.map_path(record.id), record.model_dump(mode="json", by_alias=True))
            self.log_sites.maps[record.id] = record
            self._refresh()
            await self.git.commit(message)

    async def save_maps(self, records: Iterable[SiteMapRecord], message: str) -> None:
        """Write several drawn maps in one commit; commons maps are refused as a whole."""
        async with self.lock:
            records = list(records)
            for record in records:
                self._check_map_writable(record.id)
            for record in records:
                write_json(self.map_path(record.id), record.model_dump(mode="json", by_alias=True))
                self.log_sites.maps[record.id] = record
            self._refresh()
            await self.git.commit(message)

    async def delete_map(self, map_id: str, message: str) -> None:
        """Remove a drawn map from the log.

        Raises
        ------
        CommonsEditError
            The id belongs to a commons map.
        """
        async with self.lock:
            self._check_map_writable(map_id)
            remove(self.map_path(map_id))
            self.log_sites.maps.pop(map_id, None)
            self._refresh()
            await self.git.commit(message)


def pin_state(
    origin: str, site: SiteRecord, base: SiteRecord | None, overlay: SiteOverlayRecord | None
) -> PinState | None:
    """How an overlay or fork of ``base`` stands against it; None for a personal site.

    A missing pin (files from before revisions) counts as stale once the commons has moved
    past revision 1; a commons site without an overlay has nothing that can go stale.
    """
    if base is None or origin == "log":
        return None
    if origin == "commons" and overlay is None:
        return PinState(pinned_revision=None, current_revision=base.revision, stale=False)
    pinned = site.forked_from_revision if origin == "fork" else site.base_revision
    stale = base.revision > 1 if pinned is None else pinned < base.revision
    return PinState(pinned_revision=pinned, current_revision=base.revision, stale=stale)


def stale_notice(site_id: str, origin: str, pin: PinState) -> str:
    """The status line for an overlay or fork that the commons has moved past."""
    what = "fork" if origin == "fork" else "overlay"
    pinned = (
        f"pinned to commons revision {pin.pinned_revision}"
        if pin.pinned_revision is not None
        else "not pinned to a commons revision"
    )
    return f"{site_id}: {what} {pinned}, commons is at {pin.current_revision}"
