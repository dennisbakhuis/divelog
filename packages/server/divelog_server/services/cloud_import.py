"""Plan a Shearwater Cloud import: match every dive, apply the owner's links and joins.

``plan`` classifies each dive of the export against the log before anything is written, so a
dry run and a commit agree. A ``link`` turns a ``new`` dive into an ``attach`` to the log dive
the owner chose, a ``join`` imports several computer dives as one. The resulting ``Unit``s are
what the import writes; ``ImportDiveOut`` rows describe every dive of the export for the
preview, with the default tick, the log dives a new dive may belong to and a suggestion.
"""

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from divelog_server.importers.shearwater import ShearwaterDive
from divelog_server.importers.shearwater_cloud import CloudDive
from divelog_server.importers.shearwater_pnf import merge_parts
from divelog_server.schemas.dive import ImportCandidateOut, ImportDiveOut
from divelog_server.services.computer_import import Match, candidates, classify, has_profile_from
from divelog_server.store.models import DiveRecord
from divelog_server.store.store import Store

LINK_PATTERN = r"^(\d+:\d+(,\d+:\d+)*)?$"
JOIN_PATTERN = r"^(\d+(\+\d+)*(,\d+(\+\d+)*)*)?$"
SUGGEST_WITHIN_MIN = 60
SUGGEST_RATIO = 2


class PlanError(ValueError):
    """A link or join the export cannot honour; the message is the response's detail."""


@dataclass
class Unit:
    """One dive the import writes: a dive of the export, or several joined into one.

    ``indices`` point into the export's dives in start order, the first being the one the
    unit is named after. ``imported`` is whether ``only`` selects it.
    """

    indices: list[int]
    dive: ShearwaterDive
    match: Match
    imported: bool

    @property
    def head(self) -> int:
        """The index of the unit's first dive."""
        return self.indices[0]


@dataclass
class Plan:
    """What the import does: the units to write and one preview row per dive of the export."""

    units: list[Unit]
    rows: list[ImportDiveOut]


def parse_links(text: str | None) -> dict[int, int]:
    """``{computer_no: log dive number}`` of ``link=673:675,672:680``.

    Raises
    ------
    PlanError
        When a computer number is linked twice.
    """
    links: dict[int, int] = {}
    for pair in filter(None, (text or "").split(",")):
        number, target = (int(part) for part in pair.split(":"))
        if number in links:
            raise PlanError(f"Cannot link #{number}: it is linked more than once")
        links[number] = target
    return links


def parse_joins(text: str | None) -> list[list[int]]:
    """The groups of ``join=13+14,37+38+39``, as given."""
    return [[int(n) for n in group.split("+")] for group in filter(None, (text or "").split(","))]


def plan(
    store: Store,
    entries: Sequence[CloudDive],
    *,
    offset: timedelta,
    only: Collection[int] | None,
    links: dict[int, int],
    joins: Sequence[Sequence[int]],
    legacy_serial: str,
) -> Plan:
    """Classify the export's dives and apply the links and joins to them.

    Parameters
    ----------
    store : Store
        The log, as it is before the import.
    entries : sequence of CloudDive
        The export's dives in start order, with their starts already corrected.
    offset : timedelta
        The clock correction, which a dive whose log could not be read still needs.
    only : collection of int or None
        The computer numbers to import; None imports every ``new`` and ``attach`` dive. A link
        on a number it leaves out is ignored, and so is a join whose first dive it leaves out.
    links : dict
        ``{computer_no: log dive number}``: the ``new`` dives to attach to a chosen dive.
    joins : sequence of sequence of int
        Groups of computer numbers to import as one dive each.
    legacy_serial : str
        The serial assumed for profiles whose ``source`` names none.

    Returns
    -------
    Plan
        The units to write and the preview rows, in the order of ``entries``.

    Raises
    ------
    PlanError
        With the response's detail, when a link or join cannot be honoured.
    """
    own = {
        index: classify(store, entry.dive, serial=entry.serial, legacy_serial=legacy_serial)
        for index, entry in enumerate(entries)
        if entry.dive is not None
    }
    linked = _linked(store, entries, own, links, only, legacy_serial)
    units = _joined(entries, own, linked, joins, only)
    grouped = {index for unit in units for index in unit.indices}
    units += [
        Unit([index], dive, Match("attach", linked[index]) if index in linked else match, False)
        for index, match in own.items()
        if index not in grouped and (dive := entries[index].dive) is not None
    ]
    units.sort(key=lambda unit: unit.head)
    for unit in units:
        unit.imported = only is None or entries[unit.head].computer_no in only
    attached = {m.dive.number for m in own.values() if m.status == "attach" and m.dive}
    rows = _rows(store, entries, units, attached, legacy_serial, offset)
    return Plan(units, rows)


def _linked(
    store: Store,
    entries: Sequence[CloudDive],
    own: dict[int, Match],
    links: dict[int, int],
    only: Collection[int] | None,
    legacy: str,
) -> dict[int, DiveRecord]:
    """The log dive each linked ``new`` dive attaches to, by its index in ``entries``."""
    linked: dict[int, DiveRecord] = {}
    for number, target_no in links.items():
        if only is not None and number not in only:
            continue
        refused = f"Cannot link #{number}"
        indices = [i for i, entry in enumerate(entries) if entry.computer_no == number]
        new = [i for i in indices if i in own and own[i].status == "new"]
        if not new:
            raise PlanError(f"{refused}: {_not_new(indices, own)}")
        target = store.dives.get(target_no)
        if target is None:
            raise PlanError(f"{refused}: dive #{target_no} does not exist")
        for index in new:
            if has_profile_from(store, target, entries[index].serial, legacy):
                raise PlanError(
                    f"{refused}: dive #{target_no} already has a profile from this computer"
                )
            linked[index] = target
    return linked


def _not_new(indices: list[int], own: dict[int, Match]) -> str:
    """Why the computer dive at ``indices`` cannot be linked."""
    if not indices:
        return "it is not in this export"
    match = own.get(indices[0])
    if match is None:
        return "its log could not be read"
    number = match.dive.number if match.dive else None
    if match.status == "have":
        return f"it is already dive #{number}"
    return f"it already belongs to dive #{number}"


def _joined(
    entries: Sequence[CloudDive],
    own: dict[int, Match],
    linked: dict[int, DiveRecord],
    joins: Sequence[Sequence[int]],
    only: Collection[int] | None,
) -> list[Unit]:
    """One unit per join, its dives merged in start order (``entries`` is in start order).

    A join whose first dive ``only`` leaves out is not imported, so it is ignored unchecked.
    """
    units: list[Unit] = []
    taken: set[int] = set()
    for group in joins:
        if only is not None and _first_number(entries, group) not in only:
            continue
        refused = "Cannot join " + "+".join(str(n) for n in group)
        if len(group) < 2:
            raise PlanError(f"{refused}: a join needs at least two dives")
        if len(set(group)) < len(group) or taken & set(group):
            raise PlanError(f"{refused}: a dive can be in only one join")
        taken |= set(group)
        indices = sorted(_member(entries, own, number, refused) for number in group)
        if len({entries[i].serial for i in indices}) > 1:
            raise PlanError(f"{refused}: the dives come from different computers")
        dives = [dive for i in indices if (dive := entries[i].dive) is not None]
        if len({dive.start.date() for dive in dives}) > 1:
            raise PlanError(f"{refused}: the dives are on different days")
        targets = {linked[i].number: linked[i] for i in indices if i in linked}
        if len(targets) > 1:
            raise PlanError(f"{refused}: its dives are linked to different dives")
        match = Match("attach", next(iter(targets.values()))) if targets else own[indices[0]]
        units.append(Unit(indices, merge_parts(dives), match, False))
    return units


def _first_number(entries: Sequence[CloudDive], group: Sequence[int]) -> int:
    """The computer number of a join's earliest dive in the export, else the first given."""
    present = [i for i, entry in enumerate(entries) if entry.computer_no in group]
    return entries[min(present)].computer_no if present else group[0]


def _member(entries: Sequence[CloudDive], own: dict[int, Match], number: int, refused: str) -> int:
    """The index of a join's dive in ``entries``, refusing one that cannot be joined."""
    indices = [i for i, entry in enumerate(entries) if entry.computer_no == number]
    if not indices:
        raise PlanError(f"{refused}: #{number} is not in this export")
    if len(indices) > 1:
        raise PlanError(f"{refused}: #{number} is in this export more than once")
    match = own.get(indices[0])
    if match is None:
        raise PlanError(f"{refused}: the log of #{number} could not be read")
    if match.status == "have":
        number_in_log = match.dive.number if match.dive else None
        raise PlanError(f"{refused}: #{number} is already dive #{number_in_log}")
    return indices[0]


def _rows(
    store: Store,
    entries: Sequence[CloudDive],
    units: list[Unit],
    attached: set[int],
    legacy: str,
    offset: timedelta,
) -> list[ImportDiveOut]:
    """The preview row of every dive of the export."""
    rows = [_row(entry, offset) for entry in entries]
    for index, minutes in _surface_before(entries).items():
        rows[index].surface_before_min = minutes
    newest: dict[str, datetime] = {}
    for unit in units:
        if unit.match.status == "have":
            serial = entries[unit.head].serial
            newest[serial] = max(newest.get(serial, unit.dive.start), unit.dive.start)
    for unit in units:
        head = entries[unit.head]
        status = unit.match.status
        number = unit.match.dive.number if unit.match.dive else None
        selected = status == "attach" or (
            status == "new" and (head.serial not in newest or unit.dive.start > newest[head.serial])
        )
        for index in unit.indices:
            rows[index].status = status
            rows[index].dive_number = number
            rows[index].selected = selected
            if index != unit.head:
                rows[index].joined_to = head.computer_no
        row = rows[unit.head]
        row.max_depth_m = unit.dive.max_depth_m
        row.duration_min = unit.dive.duration_min
        if status == "new":
            found = candidates(
                store, unit.dive.start, serial=head.serial, legacy_serial=legacy, exclude=attached
            )
            row.candidates = [_candidate(store, dive, minutes) for dive, minutes in found]
            row.suggested = suggest(row.candidates)
    return rows


def _row(entry: CloudDive, offset: timedelta) -> ImportDiveOut:
    """An export dive's row before it is matched: its ``error`` status and values."""
    start = cloud_start(entry, offset)
    computer_start = start - offset if start else None
    return ImportDiveOut(
        computer_no=entry.computer_no,
        serial=entry.serial,
        model=entry.model,
        start=start.isoformat(timespec="seconds") if start else "",
        computer_start=computer_start.isoformat(timespec="seconds") if computer_start else "",
        max_depth_m=entry.dive.max_depth_m if entry.dive else 0.0,
        duration_min=entry.dive.duration_min if entry.dive else 0.0,
        status="error",
        error=entry.error,
    )


def cloud_start(entry: CloudDive, offset: timedelta) -> datetime | None:
    """The corrected start of an export dive; a dive that failed to parse uses Cloud's date."""
    if entry.dive is not None:
        return entry.dive.start
    return entry.logged_at + offset if entry.logged_at else None


def _surface_before(entries: Sequence[CloudDive]) -> dict[int, int]:
    """Whole minutes from the end of the computer's previous dive that day, by index."""
    surface: dict[int, int] = {}
    last: dict[str, ShearwaterDive] = {}
    for index, entry in enumerate(entries):
        dive = entry.dive
        if dive is None:
            continue
        previous = last.get(entry.serial)
        if previous is not None and previous.start.date() == dive.start.date():
            ended = previous.end or previous.start + timedelta(minutes=previous.duration_min)
            surface[index] = max(0, round((dive.start - ended).total_seconds() / 60))
        last[entry.serial] = dive
    return surface


def _candidate(store: Store, dive: DiveRecord, minutes: int | None) -> ImportCandidateOut:
    """A log dive as a candidate, named after its site."""
    site = store.sites.get(dive.site) if dive.site else None
    return ImportCandidateOut(
        number=dive.number,
        date=dive.date,
        time_in=dive.time_in,
        site=site.name if site else dive.site_name_raw,
        max_depth_m=dive.max_depth_m,
        minutes_apart=minutes,
    )


def suggest(found: Sequence[ImportCandidateOut]) -> int | None:
    """The candidate to pre-select: the only one, or one clearly nearest within an hour.

    The nearest is clearly nearest when the next is at least ``SUGGEST_RATIO`` times as far
    away, or of unknown distance; two at the same distance suggest nothing.
    """
    if len(found) == 1:
        return found[0].number
    if not found or found[0].minutes_apart is None:
        return None
    nearest, after = found[0].minutes_apart, found[1].minutes_apart
    if nearest > SUGGEST_WITHIN_MIN:
        return None
    if after is None or (after >= SUGGEST_RATIO * nearest and after > nearest):
        return found[0].number
    return None
