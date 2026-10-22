"""Match a dive computer's dive against the log and import it: the XML and Cloud imports share this.

``classify`` decides whether a computer dive is ``new`` to the log, belongs to a log dive that
still lacks its profile (``attach``), or is already imported (``have``). ``apply`` then stores
the raw log and writes the draft dive or the attached profile. ``Profiles`` reads the log's
stored profiles once per import, for the serial and Shearwater Cloud ids they name.
"""

import re
from collections import Counter
from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from divelog_server.importers.shearwater import ShearwaterDive, gas_of
from divelog_server.services.storage import get_storage
from divelog_server.store.files import read_json
from divelog_server.store.models import DiveRecord
from divelog_server.store.store import Store

MATCH_WINDOW = timedelta(minutes=10)
NUMBER_WINDOW = timedelta(days=1)
SERIAL = re.compile(r"[0-9A-Fa-f]{8}")

Status = Literal["new", "attach", "have"]


@dataclass(frozen=True)
class Match:
    """How a computer dive relates to the log: its status and the log dive it matches."""

    status: Status
    dive: DiveRecord | None = None


@dataclass(frozen=True)
class ProfileSource:
    """The computer a stored profile names: its serial (or ``""``) and Cloud ``source_ids``."""

    serial: str = ""
    ids: tuple[str, ...] = ()


class Profiles:
    """The log's stored profiles as matching needs them, each file read at most once.

    Build one per import, before anything is written: ``source`` reads a profile on first use
    and ``dive_with_id`` indexes every profile's ``source_ids`` on first use.

    Parameters
    ----------
    store : Store
        The log.
    """

    def __init__(self, store: Store) -> None:
        self.store = store
        self._sources: dict[str, ProfileSource] = {}
        self._by_id: dict[str, DiveRecord] | None = None

    def source(self, relative: str) -> ProfileSource:
        """What the profile at ``relative`` names; empty when it is missing or unreadable."""
        if relative not in self._sources:
            self._sources[relative] = _read_source(self.store, relative)
        return self._sources[relative]

    def dive_with_id(self, ids: Collection[str]) -> DiveRecord | None:
        """The log dive with a profile naming one of ``ids``, the lowest number when several do."""
        if not ids:
            return None
        if self._by_id is None:
            self._by_id = {}
            for holder in sorted(self.store.dives.values(), key=lambda d: d.number):
                for relative in holder.profiles:
                    for source_id in self.source(relative).ids:
                        self._by_id.setdefault(source_id, holder)
        found = [self._by_id[i] for i in ids if i in self._by_id]
        return min(found, key=lambda d: d.number) if found else None


def classify(
    store: Store,
    dive: ShearwaterDive,
    *,
    serial: str | None,
    profiles: Profiles | None = None,
) -> Match:
    """Find the log dive a computer dive belongs to.

    A log dive holding a profile with one of the dive's ``source_ids`` makes it ``have``.
    Otherwise a log dive whose ``computer`` list holds the dive number and whose date is
    within ``NUMBER_WINDOW`` of the dive's matches; several can, when the owner split one log
    into several dives or joined several numbers into one. If one of them has a profile from
    this computer the dive is ``have``; otherwise the first is ``attach``. Without a number
    match, the dive on the same date starting nearest to it, within ``MATCH_WINDOW`` and
    without a profile from this computer, is ``attach``, and anything else is ``new``.

    Parameters
    ----------
    store : Store
        The log.
    dive : ShearwaterDive
        The computer dive, with its start already corrected by any clock offset.
    serial : str or None
        The computer's serial. A profiled dive with this number only counts as ``have`` when
        its profile names the same serial or none; None skips that check.
    profiles : Profiles, optional
        The log's profiles, built once per import; a fresh one when not given.

    Returns
    -------
    Match
        The status and the matched log dive (None for ``new``).
    """
    profiles = profiles or Profiles(store)
    known = profiles.dive_with_id(dive.source_ids)
    if known is not None:
        return Match("have", known)
    numbered = numbered_dives(store, dive.number, dive.start)
    for candidate in numbered:
        if candidate.profiles and _same_computer(profiles, candidate, serial):
            return Match("have", candidate)
    for candidate in numbered:
        if not candidate.profiles:
            return Match("attach", candidate)
    nearest = nearest_in_window(store, dive.start, serial=serial, profiles=profiles)
    return Match("attach", nearest) if nearest is not None else Match("new")


def numbered_dives(store: Store, number: int, start: datetime) -> list[DiveRecord]:
    """The log dives listing computer dive ``number``, dated within ``NUMBER_WINDOW`` of ``start``.

    A computer's numbers restart when the owner buys a new one, so a number only identifies a
    dive near its date.

    Parameters
    ----------
    store : Store
        The log.
    number : int
        The computer dive number.
    start : datetime
        The computer dive's corrected start.

    Returns
    -------
    list of DiveRecord
        The dives in the log's order.
    """
    return [
        candidate
        for candidate in store.dives.values()
        if number in candidate.computer and abs(candidate.date - start.date()) <= NUMBER_WINDOW
    ]


def nearest_in_window(
    store: Store,
    start: datetime,
    *,
    serial: str | None,
    exclude: Collection[int] = (),
    profiles: Profiles | None = None,
) -> DiveRecord | None:
    """The log dive starting nearest to ``start`` on its date, within ``MATCH_WINDOW``.

    Parameters
    ----------
    store : Store
        The log.
    start : datetime
        The computer dive's corrected start.
    serial : str or None
        The computer's serial: dives with a profile from it are left out.
    exclude : collection of int
        Log dive numbers to leave out, such as those other dives attach to.
    profiles : Profiles, optional
        The log's profiles, built once per import; a fresh one when not given.

    Returns
    -------
    DiveRecord or None
        The nearest dive, the lowest number on a tie, or None when none is in the window.
    """
    profiles = profiles or Profiles(store)
    window = [
        (apart, candidate.number, candidate)
        for candidate, apart in _same_day(store, start)
        if apart is not None
        and apart <= MATCH_WINDOW
        and candidate.number not in exclude
        and not has_profile_from(store, candidate, serial, profiles=profiles)
    ]
    return min(window, key=lambda item: item[:2])[2] if window else None


def candidates(
    store: Store,
    start: datetime,
    *,
    serial: str | None,
    exclude: Collection[int] = (),
    profiles: Profiles | None = None,
) -> list[tuple[DiveRecord, int | None]]:
    """The log dives a new computer dive may belong to, nearest first.

    Parameters
    ----------
    store : Store
        The log.
    start : datetime
        The computer dive's corrected start.
    serial : str or None
        The computer's serial: dives with a profile from it are left out.
    exclude : collection of int
        Log dive numbers to leave out, such as those other dives attach to.
    profiles : Profiles, optional
        The log's profiles, built once per import; a fresh one when not given.

    Returns
    -------
    list of (DiveRecord, int or None)
        The dives on ``start``'s date with their distance from it in whole minutes (None
        without a ``time_in``), by distance with unknown distances last, then by number.
    """
    profiles = profiles or Profiles(store)
    found = [
        (candidate, None if apart is None else round(apart.total_seconds() / 60))
        for candidate, apart in _same_day(store, start)
        if candidate.number not in exclude
        and not has_profile_from(store, candidate, serial, profiles=profiles)
    ]
    return sorted(found, key=lambda item: (item[1] is None, item[1] or 0, item[0].number))


def starting_between(
    store: Store,
    earliest: datetime,
    latest: datetime,
    *,
    serial: str | None,
    exclude: Collection[int] = (),
    profiles: Profiles | None = None,
) -> list[DiveRecord]:
    """The log dives on ``earliest``'s date whose ``time_in`` lies in ``[earliest, latest]``.

    Parameters
    ----------
    store : Store
        The log.
    earliest, latest : datetime
        The corrected wall-clock bounds, both included.
    serial : str or None
        The computer's serial: dives with a profile from it are left out.
    exclude : collection of int
        Log dive numbers to leave out, such as those other dives attach to.
    profiles : Profiles, optional
        The log's profiles, built once per import; a fresh one when not given.

    Returns
    -------
    list of DiveRecord
        The dives in the log's order.
    """
    profiles = profiles or Profiles(store)
    return [
        candidate
        for candidate in store.dives.values()
        if candidate.date == earliest.date()
        and candidate.number not in exclude
        and (began := _began(candidate)) is not None
        and earliest <= began <= latest
        and not has_profile_from(store, candidate, serial, profiles=profiles)
    ]


def has_profile_from(
    store: Store, dive: DiveRecord, serial: str | None, *, profiles: Profiles | None = None
) -> bool:
    """Whether the dive holds a profile from the computer with ``serial``, as ``have`` means.

    ``profiles`` is the log's profiles, built once per import; a fresh one when not given.
    """
    return bool(dive.profiles) and _same_computer(profiles or Profiles(store), dive, serial)


def _same_day(store: Store, start: datetime) -> list[tuple[DiveRecord, timedelta | None]]:
    """The log dives on ``start``'s date and how far their ``time_in`` is from it."""
    found: list[tuple[DiveRecord, timedelta | None]] = []
    for candidate in store.dives.values():
        if candidate.date != start.date():
            continue
        began = _began(candidate)
        found.append((candidate, abs(began - start) if began else None))
    return found


def _began(dive: DiveRecord) -> datetime | None:
    """The dive's start from its ``time_in``, or None without a readable one."""
    try:
        clock = datetime.strptime(dive.time_in or "", "%H:%M").time()
    except ValueError:
        return None
    return datetime.combine(dive.date, clock)


def computer_numbers(dive: ShearwaterDive) -> list[int]:
    """The computer dive numbers a dive holds: one, or each joined one in order."""
    return list(dict.fromkeys(dive.computer_records or [dive.number]))


def _same_computer(profiles: Profiles, dive: DiveRecord, serial: str | None) -> bool:
    """Whether one of the dive's profiles came from the computer with ``serial``.

    A profile's serial is the last word of its ``source`` when that is eight hex digits. An
    unknown serial on either side agrees: a profile whose ``source`` names none counts as this
    computer's, and so does every profile when ``serial`` is empty.
    """
    if not serial:
        return True
    for relative in dive.profiles:
        theirs = profiles.source(relative).serial
        if not theirs or theirs.upper() == serial.upper():
            return True
    return False


def _read_source(store: Store, relative: str) -> ProfileSource:
    """The serial a stored profile's ``source`` names and its ``source_ids``, read from disk."""
    path = store.root / relative
    try:
        payload = read_json(path) if path.is_file() else None
    except ValueError:
        return ProfileSource()
    if not isinstance(payload, dict):
        return ProfileSource()
    words = str(payload.get("source") or "").split()
    serial = words[-1].upper() if words and SERIAL.fullmatch(words[-1]) else ""
    ids = payload.get("source_ids")
    return ProfileSource(serial, tuple(str(i) for i in ids) if isinstance(ids, list) else ())


def raw_keys(stem: str, numbers: Sequence[int], extension: str) -> list[str]:
    """The storage keys of a dive's raw logs, one per log, named after its computer dive number.

    Parameters
    ----------
    stem : str
        The key without number and extension, such as ``imports/2026/10/<id>-344FDE85``.
    numbers : sequence of int
        The computer dive number of each log, in order.
    extension : str
        The file extension, such as ``swlog``.

    Returns
    -------
    list of str
        ``<stem>-<number>.<extension>`` per log; a number with several logs (a dive the
        computer split) gets ``-1``, ``-2``, … after it.
    """
    counts = Counter(numbers)
    seen: Counter[int] = Counter()
    keys = []
    for number in numbers:
        seen[number] += 1
        part = f"-{seen[number]}" if counts[number] > 1 else ""
        keys.append(f"{stem}-{number}{part}.{extension}")
    return keys


async def apply(
    store: Store,
    dive: ShearwaterDive,
    raw: Sequence[tuple[str, bytes]],
    match: Match,
    *,
    import_id: str,
    profile_name: str | Callable[[int], str],
    dry_run: bool,
    planned: int,
    content_type: str = "application/xml",
    label: str = "Perdix",
    flags: Sequence[str] = (),
    fill_empty: bool = False,
) -> int:
    """Store a computer dive's raw logs and write it to the log as its match says.

    ``have`` only stores the raw logs. ``attach`` writes the profile, adds it, the dive numbers
    and ``flags`` to the matched dive. ``new`` creates a draft dive with the next free number.
    A dry run writes nothing.

    Parameters
    ----------
    store : Store
        The log.
    dive : ShearwaterDive
        The computer dive.
    raw : sequence of (str, bytes)
        The storage key and content of each of the dive's logs as uploaded; more than one for
        a joined dive or one the computer split, none when another part of the same log
        already stored them.
    match : Match
        The result of ``classify``.
    import_id : str
        The import the dive is written under.
    profile_name : str or callable
        The profile file name, or a function giving it for the number of the log dive the
        profile belongs to.
    dry_run : bool
        Only report the dive number.
    planned : int
        The number a new dive gets on a dry run.
    content_type : str
        The media type the raw logs are stored with.
    label : str
        The computer as commit messages name it.
    flags : sequence of str
        Review flags for a created or attached dive, such as a clock correction.
    fill_empty : bool
        On ``attach``, also set the dive's ``time_in``, ``time_out``, ``avg_depth_m`` and
        ``water_temp_c`` from the computer where they are empty.

    Returns
    -------
    int
        The matched dive's number, or the new dive's (``planned`` on a dry run).
    """
    if dry_run:
        return match.dive.number if match.dive is not None else planned

    storage = get_storage()
    for key, data in raw:
        await storage.put(key, data, content_type)
    if match.status == "have" and match.dive is not None:
        return match.dive.number
    name_for = profile_name if callable(profile_name) else lambda _number: str(profile_name)
    payload = dive.profile()
    numbers = computer_numbers(dive)
    numbered = "+".join(str(n) for n in numbers)
    if match.dive is not None:
        target = match.dive
        payload["log_dive_no"] = target.number
        relative = store.save_profile(name_for(target.number), payload)
        if relative not in target.profiles:
            target.profiles.append(relative)
        target.computer.extend(n for n in numbers if n not in target.computer)
        target.flags.extend(flag for flag in flags if flag not in target.flags)
        target.import_id = import_id
        if fill_empty:
            _fill_empty(target, dive)
        await store.save_dive(target, f"Attach {label} #{numbered} to dive #{target.number}")
        return target.number

    number = store.next_dive_number()
    payload["log_dive_no"] = number
    gas, o2, he = gas_of(dive)
    record = DiveRecord(
        number=number,
        date=dive.start.date(),
        time_in=dive.time_in,
        time_out=dive.time_out,
        duration_min=max(dive.duration_min, 1),
        max_depth_m=dive.max_depth_m,
        avg_depth_m=dive.avg_depth_m,
        water_temp_c=min(dive.temp_c, default=None),
        gas=gas,
        o2_pct=o2,
        he_pct=he,
        computer=numbers,
        profiles=[store.save_profile(name_for(number), payload)],
        flags=list(flags),
        visibility="draft",
        import_id=import_id,
    )
    await store.save_dive(record, f"Import {label} #{numbered} as draft dive #{number}")
    return number


def _fill_empty(target: DiveRecord, dive: ShearwaterDive) -> None:
    """Set the log dive's times, average depth and water temperature where they are empty."""
    target.time_in = target.time_in or dive.time_in
    target.time_out = target.time_out or dive.time_out
    if target.avg_depth_m is None:
        target.avg_depth_m = dive.avg_depth_m
    if target.water_temp_c is None:
        target.water_temp_c = min(dive.temp_c, default=None)


def import_month() -> str:
    """The ``YYYY/MM`` folder raw imports of this month are stored under."""
    return datetime.now(UTC).strftime("%Y/%m")
