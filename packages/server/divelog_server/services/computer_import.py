"""Match a dive computer's dive against the log and import it: the XML and Cloud imports share this.

``classify`` decides whether a computer dive is ``new`` to the log, belongs to a log dive that
still lacks its profile (``attach``), or is already imported (``have``). ``apply`` then stores
the raw log and writes the draft dive or the attached profile.
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from divelog_server.importers.shearwater import ShearwaterDive, gas_of
from divelog_server.services.storage import get_storage
from divelog_server.store.files import read_json
from divelog_server.store.models import DiveRecord
from divelog_server.store.store import Store

MATCH_WINDOW = timedelta(minutes=10)
SERIAL = re.compile(r"[0-9A-Fa-f]{8}")

Status = Literal["new", "attach", "have"]


@dataclass(frozen=True)
class Match:
    """How a computer dive relates to the log: its status and the log dive it matches."""

    status: Status
    dive: DiveRecord | None = None


def classify(
    store: Store, dive: ShearwaterDive, *, serial: str | None, legacy_serial: str = ""
) -> Match:
    """Find the log dive a computer dive belongs to.

    A log dive whose ``computer`` list holds the dive number matches; several can, when the
    owner split one log into several dives or joined several numbers into one. If one of them
    has a profile from this computer the dive is ``have``; otherwise the first is ``attach``.
    Without a number match, a dive on the same date starting within ``MATCH_WINDOW`` is
    ``attach``, and anything else is ``new``.

    Parameters
    ----------
    store : Store
        The log.
    dive : ShearwaterDive
        The computer dive, with its start already corrected by any clock offset.
    serial : str or None
        The computer's serial. A profiled dive with this number only counts as ``have`` when
        its profile names the same serial or none; None skips that check.
    legacy_serial : str
        The serial assumed for profiles whose ``source`` names none.

    Returns
    -------
    Match
        The status and the matched log dive (None for ``new``).
    """
    numbered = [d for d in store.dives.values() if dive.number in d.computer]
    for candidate in numbered:
        if candidate.profiles and _same_computer(store, candidate, serial, legacy_serial):
            return Match("have", candidate)
    for candidate in numbered:
        if not candidate.profiles:
            return Match("attach", candidate)
    start = dive.start
    for candidate in store.dives.values():
        if candidate.date != start.date() or not candidate.time_in:
            continue
        began = datetime.combine(
            candidate.date, datetime.strptime(candidate.time_in, "%H:%M").time()
        )
        if abs(began - start) <= MATCH_WINDOW:
            return Match("attach", candidate)
    return Match("new")


def _same_computer(store: Store, dive: DiveRecord, serial: str | None, legacy: str) -> bool:
    """Whether one of the dive's profiles came from the computer with ``serial``.

    A profile's serial is the last word of its ``source`` when that is eight hex digits, else
    ``legacy``; an unknown serial on either side agrees.
    """
    if not serial:
        return True
    for relative in dive.profiles:
        theirs = _profile_serial(store, relative) or legacy
        if not theirs or theirs.upper() == serial.upper():
            return True
    return False


def _profile_serial(store: Store, relative: str) -> str:
    """The serial a stored profile's ``source`` names, or an empty string."""
    path = store.root / relative
    try:
        payload = read_json(path) if path.is_file() else None
    except ValueError:
        return ""
    source = payload.get("source") if isinstance(payload, dict) else None
    words = str(source or "").split()
    return words[-1].upper() if words and SERIAL.fullmatch(words[-1]) else ""


def part_keys(storage_key: str, parts: int) -> list[str]:
    """The storage keys of a dive's raw logs: ``storage_key`` itself, or one per part.

    Parameters
    ----------
    storage_key : str
        The key of a single log, such as ``imports/2026/10/<id>-344FDE85-674.swlog``.
    parts : int
        How many logs the dive has.

    Returns
    -------
    list of str
        ``[storage_key]`` for one log, else the key with ``-1``, ``-2``, … before the extension.
    """
    if parts <= 1:
        return [storage_key]
    stem, dot, extension = storage_key.rpartition(".")
    if not dot:
        stem, extension = storage_key, ""
    return [f"{stem}-{part}{dot}{extension}" for part in range(1, parts + 1)]


async def apply(
    store: Store,
    dive: ShearwaterDive,
    raw: Sequence[bytes],
    match: Match,
    *,
    import_id: str,
    storage_key: str,
    profile_name: str | Callable[[int], str],
    dry_run: bool,
    planned: int,
    content_type: str = "application/xml",
    label: str = "Perdix",
    flags: Sequence[str] = (),
) -> int:
    """Store a computer dive's raw logs and write it to the log as its match says.

    ``have`` only stores the raw logs. ``attach`` writes the profile, adds it, the dive number
    and ``flags`` to the matched dive. ``new`` creates a draft dive with the next free number.
    A dry run writes nothing.

    Parameters
    ----------
    store : Store
        The log.
    dive : ShearwaterDive
        The computer dive.
    raw : sequence of bytes
        The dive's logs as uploaded; more than one for a dive the computer split.
    match : Match
        The result of ``classify``.
    import_id : str
        The import the dive is written under.
    storage_key : str
        Where the raw log is stored; ``part_keys`` derives one key per log.
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

    Returns
    -------
    int
        The matched dive's number, or the new dive's (``planned`` on a dry run).
    """
    if dry_run:
        return match.dive.number if match.dive is not None else planned

    storage = get_storage()
    for key, data in zip(part_keys(storage_key, len(raw)), raw, strict=True):
        await storage.put(key, data, content_type)
    if match.status == "have" and match.dive is not None:
        return match.dive.number
    name_for = profile_name if callable(profile_name) else lambda _number: str(profile_name)
    payload = dive.profile()
    if match.dive is not None:
        target = match.dive
        payload["log_dive_no"] = target.number
        relative = store.save_profile(name_for(target.number), payload)
        if relative not in target.profiles:
            target.profiles.append(relative)
        if dive.number not in target.computer:
            target.computer.append(dive.number)
        target.flags.extend(flag for flag in flags if flag not in target.flags)
        target.import_id = import_id
        await store.save_dive(target, f"Attach {label} #{dive.number} to dive #{target.number}")
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
        computer=[dive.number],
        profiles=[store.save_profile(name_for(number), payload)],
        flags=list(flags),
        visibility="draft",
        import_id=import_id,
    )
    await store.save_dive(record, f"Import {label} #{dive.number} as draft dive #{number}")
    return number


def import_month() -> str:
    """The ``YYYY/MM`` folder raw imports of this month are stored under."""
    return datetime.now(UTC).strftime("%Y/%m")
