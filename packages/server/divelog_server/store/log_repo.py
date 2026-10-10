"""The personal collections of the log repository: dives, people, trips, gear, imports, profiles.

Everything here belongs to one diver and never comes from a shared source. :class:`Store`
builds on this class and adds the site view merged from the log and the commons.
"""

import asyncio
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from divelog_server.store.files import read_json, remove, write_json, write_markdown
from divelog_server.store.git import GitRepo
from divelog_server.store.loader import Loader
from divelog_server.store.manifest import MANIFEST_FILE, Manifest, read_manifest
from divelog_server.store.models import (
    DiveRecord,
    GearItemRecord,
    GearSetupRecord,
    ImportRecord,
    PersonRecord,
    ReferenceMap,
    TripRecord,
)

MAX_PROFILE_POINTS = 240
SPARK_POINTS = 24


class LogRepo:
    """Personal records of the log repository at ``root``, with their writers.

    Every writer takes the lock, rewrites one file, refreshes the indexes through
    :meth:`_index` and commits.
    """

    def __init__(self, root: Path, git: GitRepo | None = None) -> None:
        self.root = root
        self.git = git or GitRepo(root, author_name="", author_email="", enabled=False)
        self.lock = asyncio.Lock()
        self.errors: list[str] = []
        self.dives: dict[int, DiveRecord] = {}
        self.people: dict[str, PersonRecord] = {}
        self.trips: dict[str, TripRecord] = {}
        self.gear_items: dict[str, GearItemRecord] = {}
        self.gear_setups: dict[str, GearSetupRecord] = {}
        self.reference_maps: list[ReferenceMap] = []
        self.imports: dict[str, ImportRecord] = {}
        self.manifest: Manifest | None = None
        self._sparks: dict[tuple[str, int], list[int] | None] = {}

    # ── paths ──────────────────────────────────────────────────────────────

    def dive_path(self, number: int) -> Path:
        """``dives/<number>.md``, zero-padded to five digits."""
        return self.root / "dives" / f"{number:05d}.md"

    def person_path(self, person_id: str) -> Path:
        """``people/<id>.md``."""
        return self.root / "people" / f"{person_id}.md"

    def trip_path(self, slug: str) -> Path:
        """``trips/<slug>.md``."""
        return self.root / "trips" / f"{slug}.md"

    def import_path(self, import_id: str) -> Path:
        """``imports/<id>.json``."""
        return self.root / "imports" / f"{import_id}.json"

    def reference_file(self, relative: str) -> Path | None:
        """A file under ``maps/reference``; the caller is responsible for owner gating."""
        if ".." in relative or relative.startswith("/"):
            return None
        path = self.root / "maps" / "reference" / relative
        return path if path.is_file() else None

    # ── loading ────────────────────────────────────────────────────────────

    def load_personal(self, loader: Loader) -> None:
        """Read the personal collections; problems go to ``loader.errors``."""
        self.dives = loader.markdown("dives", DiveRecord, key="number")
        self.people = loader.markdown("people", PersonRecord, key="id")
        self.trips = loader.markdown("trips", TripRecord, key="slug")
        self.gear_items = {r.id: r for r in loader.json_list("gear/items.json", GearItemRecord)}
        self.gear_setups = {r.id: r for r in loader.json_list("gear/setups.json", GearSetupRecord)}
        self.reference_maps = self._load_reference_maps(loader)
        self.imports = loader.json_dir("imports", ImportRecord, key="id")
        self.manifest = self._load_manifest(loader)

    def _load_manifest(self, loader: Loader) -> Manifest | None:
        try:
            return read_manifest(self.root)
        except Exception as exc:
            loader.errors.append(f"{MANIFEST_FILE}: {exc}")
            return None

    def _load_reference_maps(self, loader: Loader) -> list[ReferenceMap]:
        path = self.root / "maps" / "reference" / "index.json"
        if not path.exists():
            return []
        entries: list[ReferenceMap] = []
        payload = read_json(path)
        for item in payload.get("maps", []) if isinstance(payload, dict) else []:
            record = loader.validate(path, ReferenceMap, item)
            if record is None:
                continue
            if record.public:
                loader.errors.append(f"maps/reference: {record.file} marked public; forced private")
                record.public = False
            entries.append(record)
        return entries

    def _index(self) -> None:
        """Rebuild the derived indexes; :class:`Store` fills this in."""

    # ── people ─────────────────────────────────────────────────────────────

    def person_slug_clashes(self) -> dict[str, list[str]]:
        """Slugs used by more than one person, with the ids that share them."""
        by_slug: dict[str, list[str]] = {}
        for person in self.people.values():
            by_slug.setdefault(person.slug, []).append(person.id)
        return {slug: ids for slug, ids in by_slug.items() if len(ids) > 1}

    def person_by_name(self, name: str) -> PersonRecord | None:
        """Resolve a written name (any known spelling) to a person."""
        wanted = name.strip().lower()
        if not wanted:
            return None
        for person in self.people.values():
            if wanted in person.match_names:
                return person
        return None

    # ── profiles ───────────────────────────────────────────────────────────

    def profile(self, dive: DiveRecord) -> dict[str, Any] | None:
        """The first profile file of a dive as raw JSON, or None."""
        for relative in dive.profiles:
            path = self.root / relative
            if path.is_file():
                payload = read_json(path)
                return payload if isinstance(payload, dict) else None
        return None

    def profile_samples(self, dive: DiveRecord) -> list[dict[str, float | int]] | None:
        """Downsampled ``{t, d, temp, ndl, stop, tts}`` rows from either stored profile shape."""
        payload = self.profile(dive)
        if payload is None:
            return None
        rows: list[dict[str, float | int]] = []
        if "t_s" in payload:
            temps = payload.get("temp_c") or []
            ndls = payload.get("ndl_min") or []
            stops = payload.get("stop_depth_m") or []
            ttss = payload.get("tts_min") or []
            for i, (t, d) in enumerate(zip(payload["t_s"], payload["depth_m"], strict=False)):
                row: dict[str, float | int] = {"t": int(t), "d": float(d)}
                if i < len(temps) and temps[i] is not None:
                    row["temp"] = temps[i]
                if i < len(ndls) and ndls[i] is not None:
                    row["ndl"] = ndls[i]
                if i < len(stops) and stops[i]:
                    row["stop"] = stops[i]
                if i < len(ttss) and ttss[i] is not None:
                    row["tts"] = ttss[i]
                rows.append(row)
        else:
            rows = [dict(s) for s in payload.get("samples", [])]
        return downsample(rows)

    def sparkline(self, dive: DiveRecord) -> list[int] | None:
        """The profile squeezed to a few depths in decimetres for the list row, or None.

        Cached per file and modification time, since the index asks for every dive at once.
        """
        for relative in dive.profiles:
            path = self.root / relative
            if not path.is_file():
                continue
            key = (relative, path.stat().st_mtime_ns)
            if key not in self._sparks:
                payload = read_json(path)
                self._sparks[key] = (
                    spark_depths(profile_depths(payload)) if isinstance(payload, dict) else None
                )
            return self._sparks[key]
        return None

    def save_profile(self, name: str, payload: dict[str, Any]) -> str:
        """Write a profile file and return the repository-relative path."""
        relative = f"profiles/{name}"
        write_json(self.root / relative, payload)
        return relative

    # ── writers ────────────────────────────────────────────────────────────

    async def save_dive(
        self, record: DiveRecord, message: str, *, previous_number: int | None = None
    ) -> None:
        """Write a dive, removing the old file when its number changed."""
        async with self.lock:
            if previous_number is not None and previous_number != record.number:
                remove(self.dive_path(previous_number))
                self.dives.pop(previous_number, None)
            write_markdown(self.dive_path(record.number), frontmatter(record), record.body_md)
            self.dives[record.number] = record
            self._index()
            await self.git.commit(message)

    async def delete_dive(self, number: int, message: str) -> None:
        """Remove a dive file."""
        async with self.lock:
            remove(self.dive_path(number))
            self.dives.pop(number, None)
            self._index()
            await self.git.commit(message)

    async def save_person(self, record: PersonRecord, message: str) -> None:
        """Write a person file."""
        async with self.lock:
            write_markdown(self.person_path(record.id), frontmatter(record), record.body_md)
            self.people[record.id] = record
            self._index()
            await self.git.commit(message)

    async def delete_person(self, person_id: str, message: str) -> None:
        """Remove a person file."""
        async with self.lock:
            remove(self.person_path(person_id))
            self.people.pop(person_id, None)
            self._index()
            await self.git.commit(message)

    async def save_trip(self, record: TripRecord, message: str) -> None:
        """Write a trip override."""
        async with self.lock:
            write_markdown(self.trip_path(record.slug), frontmatter(record), record.body_md)
            self.trips[record.slug] = record
            self._index()
            await self.git.commit(message)

    async def delete_trip(self, slug: str, message: str) -> None:
        """Remove a trip override."""
        async with self.lock:
            remove(self.trip_path(slug))
            self.trips.pop(slug, None)
            self._index()
            await self.git.commit(message)

    async def save_gear(self, message: str) -> None:
        """Write both gear files from the in-memory items and setups."""
        async with self.lock:
            items = sorted(self.gear_items.values(), key=lambda i: (i.sort, i.name))
            setups = sorted(self.gear_setups.values(), key=lambda s: (s.sort, s.name))
            write_json(self.root / "gear" / "items.json", [frontmatter(i) for i in items])
            write_json(self.root / "gear" / "setups.json", [frontmatter(s) for s in setups])
            self._index()
            await self.git.commit(message)

    async def save_import(self, record: ImportRecord, message: str) -> None:
        """Write an import record."""
        async with self.lock:
            write_json(self.import_path(record.id), record.model_dump(mode="json"))
            self.imports[record.id] = record
            await self.git.commit(message)


def frontmatter(record: BaseModel) -> dict[str, Any]:
    """Frontmatter for a record: JSON-compatible, without nulls and empty top-level values.

    Keys a record lists in ``KEEP_NULL`` are written even when null, where a missing key would
    read back as the field's default.
    """
    payload = record.model_dump(mode="json", exclude_none=True, by_alias=True)
    nulls = {k for k in getattr(record, "KEEP_NULL", ()) if getattr(record, k, None) is None}
    if nulls:
        order = record.model_dump(mode="json", by_alias=True)
        payload = {k: payload.get(k) for k in order if k in payload or k in nulls}
    return {k: v for k, v in payload.items() if k in nulls or v not in (None, [], "", {})}


def profile_depths(payload: dict[str, Any]) -> list[float]:
    """The depth series of a profile file in metres, from the columnar or the row format."""
    if "depth_m" in payload:
        return [float(d) for d in payload["depth_m"] if d is not None]
    return [float(s["d"]) for s in payload.get("samples", []) if s.get("d") is not None]


def spark_depths(depths: list[float], points: int = SPARK_POINTS) -> list[int] | None:
    """At most ``points`` depths in decimetres, the deepest of each even slice of the series.

    Taking the slice maximum rather than a point sample keeps the deepest moment visible.
    """
    if not depths:
        return None
    if len(depths) <= points:
        return [round(d * 10) for d in depths]
    step = len(depths) / points
    return [
        round(max(depths[int(i * step) : max(int((i + 1) * step), int(i * step) + 1)]) * 10)
        for i in range(points)
    ]


def downsample(
    samples: list[dict[str, float | int]], max_points: int = MAX_PROFILE_POINTS
) -> list[dict[str, float | int]]:
    """Keep at most ``max_points`` evenly spaced samples; the chart needs no more."""
    if len(samples) <= max_points:
        return samples
    step = len(samples) / max_points
    picked = [samples[int(i * step)] for i in range(max_points)]
    if picked[-1] is not samples[-1]:
        picked.append(samples[-1])
    return picked
