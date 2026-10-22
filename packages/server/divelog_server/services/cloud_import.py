"""Plan a Shearwater Cloud import: match every dive, apply the owner's links, joins and splits.

``plan`` classifies each dive of the export against the log before anything is written, so a
dry run and a commit agree. A ``link`` turns a ``new`` dive into an ``attach`` to the log dive
the owner chose, a ``join`` imports several computer dives as one, a ``split`` cuts one at
surface breaks into several dives, each matched on its own. The resulting ``Unit``s are what
the import writes; ``ImportDiveOut`` rows describe every dive of the export for the preview,
with the default tick, the log dives a new dive may belong to, a suggestion, the dive's
surface breaks and the parts of a split dive. The log's profiles are read once per plan.
"""

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from divelog_server.importers.shearwater import ShearwaterDive
from divelog_server.importers.shearwater_cloud import CloudDive
from divelog_server.importers.shearwater_pnf import merge_parts, split_at, surface_breaks_of
from divelog_server.schemas.dive import (
    ImportBreakOut,
    ImportCandidateOut,
    ImportDiveOut,
    ImportPartOut,
)
from divelog_server.services.computer_import import (
    MATCH_WINDOW,
    Match,
    Profiles,
    candidates,
    classify,
    has_profile_from,
    nearest_in_window,
    numbered_dives,
    starting_between,
)
from divelog_server.store.models import DiveRecord
from divelog_server.store.store import Store

LINK_PATTERN = r"^(\d+(\.\d+)?:\d+(,\d+(\.\d+)?:\d+)*)?$"
JOIN_PATTERN = r"^(\d+(\+\d+)*(,\d+(\+\d+)*)*)?$"
SPLIT_PATTERN = r"^(\d+@\d+(,\d+@\d+)*)?$"
SUGGEST_WITHIN_MIN = 60
SUGGEST_RATIO = 2
BREAK_LEAD = timedelta(minutes=1)

LinkKey = tuple[int, int | None]
Cut = tuple[int, int]


class PlanError(ValueError):
    """A link or join the export cannot honour; the message is the response's detail."""


@dataclass
class Unit:
    """One dive the import writes: a dive of the export, several joined into one, or a part.

    ``indices`` point into the export's dives in start order, the first being the one the
    unit is named after. ``imported`` is whether ``only`` selects it. ``part`` counts the
    parts of a split dive from 1, and is 0 for a whole dive.
    """

    indices: list[int]
    dive: ShearwaterDive
    match: Match
    imported: bool
    part: int = 0

    @property
    def head(self) -> int:
        """The index of the unit's first dive."""
        return self.indices[0]


@dataclass
class Plan:
    """What the import does: the units to write and one preview row per dive of the export."""

    units: list[Unit]
    rows: list[ImportDiveOut]


def parse_links(text: str | None) -> dict[LinkKey, int]:
    """``{(computer_no, part): log dive number}`` of ``link=673:675,614.2:612``.

    A link without a part, ``673:675``, has part None and links the whole dive.

    Raises
    ------
    PlanError
        When a computer number or part is linked twice.
    """
    links: dict[LinkKey, int] = {}
    for pair in filter(None, (text or "").split(",")):
        name, target = pair.split(":")
        number, dot, part = name.partition(".")
        key = (int(number), int(part) if dot else None)
        if key in links:
            raise PlanError(f"Cannot link #{_link_name(key)}: it is linked more than once")
        links[key] = int(target)
    return links


def _link_name(key: LinkKey) -> str:
    """How a refusal names a link: ``673`` or ``614.2``."""
    number, part = key
    return str(number) if part is None else f"{number}.{part}"


def parse_splits(text: str | None) -> dict[int, list[int]]:
    """``{computer_no: [start_s, ...]}`` of ``split=614@1740,614@3970``, each in time order."""
    splits: dict[int, set[int]] = {}
    for pair in filter(None, (text or "").split(",")):
        number, start_s = (int(value) for value in pair.split("@"))
        splits.setdefault(number, set()).add(start_s)
    return {number: sorted(starts) for number, starts in splits.items()}


def parse_joins(text: str | None) -> list[list[int]]:
    """The groups of ``join=13+14,37+38+39``, as given."""
    return [[int(n) for n in group.split("+")] for group in filter(None, (text or "").split(","))]


def plan(
    store: Store,
    entries: Sequence[CloudDive],
    *,
    offset: timedelta,
    only: Collection[int] | None,
    links: dict[LinkKey, int],
    joins: Sequence[Sequence[int]],
    splits: dict[int, list[int]] | None = None,
) -> Plan:
    """Classify the export's dives and apply the links, joins and splits to them.

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
        or split on a number it leaves out is ignored, and so is a join whose first dive it
        leaves out.
    links : dict
        ``{(computer_no, part): log dive number}``: the ``new`` dives (part None) or the parts
        of split dives to attach to a chosen dive.
    joins : sequence of sequence of int
        Groups of computer numbers to import as one dive each.
    splits : dict, optional
        ``{computer_no: [start_s, ...]}``: the dives to cut at the surface breaks starting there.

    Returns
    -------
    Plan
        The units to write and the preview rows, in the order of ``entries``.

    Raises
    ------
    PlanError
        With the response's detail, when a link, join or split cannot be honoured.
    """
    profiles = Profiles(store)
    own = {
        index: classify(store, entry.dive, serial=entry.serial, profiles=profiles)
        for index, entry in enumerate(entries)
        if entry.dive is not None
    }
    active = [group for group in joins if only is None or _first_number(entries, group) in only]
    cuts = _cuts(entries, own, splits or {}, active, only)
    whole = {number: target for (number, part), target in links.items() if part is None}
    split_numbers = {entries[index].computer_no for index in cuts}
    linked = _linked(profiles, entries, own, whole, only, split_numbers)
    units = _joined(entries, own, linked, joins, only)
    grouped = {index for unit in units for index in unit.indices}
    units += [
        Unit([index], dive, Match("attach", linked[index]) if index in linked else match, False)
        for index, match in own.items()
        if index not in grouped and index not in cuts and (dive := entries[index].dive) is not None
    ]
    part_links = {key: target for key, target in links.items() if key[1] is not None}
    units += _parts(profiles, entries, cuts, part_links, _targets(units), only)
    units.sort(key=lambda unit: (unit.head, unit.part))
    for unit in units:
        unit.imported = only is None or entries[unit.head].computer_no in only
    attached = {
        match.dive.number
        for index, match in own.items()
        if match.status == "attach" and match.dive and index not in cuts
    }
    attached |= {unit.match.dive.number for unit in units if unit.part and unit.match.dive}
    rows = _rows(profiles, entries, units, attached, offset)
    return Plan(units, rows)


def _targets(units: Sequence[Unit]) -> set[int]:
    """The log dives the units attach to."""
    return {unit.match.dive.number for unit in units if unit.match.dive is not None}


def _cuts(
    entries: Sequence[CloudDive],
    own: dict[int, Match],
    splits: dict[int, list[int]],
    joins: Sequence[Sequence[int]],
    only: Collection[int] | None,
) -> dict[int, list[Cut]]:
    """The breaks each split dive is cut at, ``(start_s, end_s)``, by its index in ``entries``.

    A split on a number ``only`` leaves out is ignored unchecked.
    """
    cuts: dict[int, list[Cut]] = {}
    for number, starts in splits.items():
        if only is not None and number not in only:
            continue
        refused = f"Cannot split #{number}"
        indices = [i for i, entry in enumerate(entries) if entry.computer_no == number]
        if len(indices) > 1:
            raise PlanError(f"{refused}: it is in this export more than once")
        match = own.get(indices[0]) if indices else None
        dive = entries[indices[0]].dive if indices else None
        if match is None or dive is None or match.status == "have":
            raise PlanError(f"{refused}: {_not_new(indices, own)}")
        group = next((group for group in joins if number in group), None)
        if group is not None:
            others = "+".join(str(n) for n in group if n != number) or str(number)
            raise PlanError(f"{refused}: it is joined to #{others}")
        breaks = dict(surface_breaks_of(dive))
        for start_s in starts:
            if start_s not in breaks:
                raise PlanError(f"{refused}: no surface break at {round(start_s / 60)} min")
        cuts[indices[0]] = [(start_s, breaks[start_s]) for start_s in starts]
    return cuts


def _linked(
    profiles: Profiles,
    entries: Sequence[CloudDive],
    own: dict[int, Match],
    links: dict[int, int],
    only: Collection[int] | None,
    split: Collection[int] = (),
) -> dict[int, DiveRecord]:
    """The log dive each linked ``new`` dive attaches to, by its index in ``entries``."""
    linked: dict[int, DiveRecord] = {}
    for number, target_no in links.items():
        if only is not None and number not in only:
            continue
        refused = f"Cannot link #{number}"
        if number in split:
            raise PlanError(f"{refused}: it is split, link its parts")
        indices = [i for i, entry in enumerate(entries) if entry.computer_no == number]
        new = [i for i in indices if i in own and own[i].status == "new"]
        if not new:
            raise PlanError(f"{refused}: {_not_new(indices, own)}")
        target = profiles.store.dives.get(target_no)
        if target is None:
            raise PlanError(f"{refused}: dive #{target_no} does not exist")
        for index in new:
            if has_profile_from(profiles.store, target, entries[index].serial, profiles=profiles):
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


def _parts(
    profiles: Profiles,
    entries: Sequence[CloudDive],
    cuts: dict[int, list[Cut]],
    links: dict[LinkKey, int],
    taken: set[int],
    only: Collection[int] | None,
) -> list[Unit]:
    """One unit per part of each split dive, matched in time order.

    A part attaches to the dive it is linked to, else to the nearest dive within
    ``MATCH_WINDOW`` of its start, else to a dive near its date with the computer number and
    no profile; dives other dives or earlier parts attach to are not offered again.
    """
    chosen = _part_links(profiles, entries, cuts, links, only)
    taken = taken | {target.number for target in chosen.values()}
    units: list[Unit] = []
    for index in sorted(cuts):
        entry = entries[index]
        if entry.dive is None:
            continue
        for part, piece in enumerate(split_at(entry.dive, cuts[index]), start=1):
            target = chosen.get((entry.computer_no, part)) or _part_match(
                profiles, piece, entry.serial, taken
            )
            if target is not None:
                taken.add(target.number)
            match = Match("attach", target) if target is not None else Match("new")
            units.append(Unit([index], piece, match, False, part))
    return units


def _part_links(
    profiles: Profiles,
    entries: Sequence[CloudDive],
    cuts: dict[int, list[Cut]],
    links: dict[LinkKey, int],
    only: Collection[int] | None,
) -> dict[LinkKey, DiveRecord]:
    """The log dive each linked part attaches to, by ``(computer_no, part)``."""
    split = {entries[index].computer_no: index for index in cuts}
    chosen: dict[LinkKey, DiveRecord] = {}
    for key, target_no in links.items():
        number, part = key
        if only is not None and number not in only:
            continue
        refused = f"Cannot link #{_link_name(key)}"
        if number not in split:
            raise PlanError(f"{refused}: the dive is not split")
        index = split[number]
        count = len(cuts[index]) + 1
        if part is None or not 1 <= part <= count:
            raise PlanError(f"{refused}: the dive has {count} parts")
        target = profiles.store.dives.get(target_no)
        if target is None:
            raise PlanError(f"{refused}: dive #{target_no} does not exist")
        if has_profile_from(profiles.store, target, entries[index].serial, profiles=profiles):
            raise PlanError(
                f"{refused}: dive #{target_no} already has a profile from this computer"
            )
        other = next((k for k, dive in chosen.items() if dive.number == target_no), None)
        if other is not None:
            raise PlanError(
                f"{refused}: dive #{target_no} is already linked to #{_link_name(other)}"
            )
        chosen[key] = target
    return chosen


def _part_match(
    profiles: Profiles, piece: ShearwaterDive, serial: str, taken: set[int]
) -> DiveRecord | None:
    """The log dive a part of a split dive belongs to, or None for a new dive."""
    store = profiles.store
    nearest = nearest_in_window(store, piece.start, serial=serial, exclude=taken, profiles=profiles)
    if nearest is not None:
        return nearest
    numbered = [
        dive
        for dive in numbered_dives(store, piece.number, piece.start)
        if not dive.profiles and dive.number not in taken
    ]
    return min(numbered, key=lambda dive: dive.number) if numbered else None


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
    profiles: Profiles,
    entries: Sequence[CloudDive],
    units: list[Unit],
    attached: set[int],
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
        row = rows[unit.head]
        status = unit.match.status
        number = unit.match.dive.number if unit.match.dive else None
        found: list[ImportCandidateOut] = []
        if status == "new":
            nearby = candidates(
                profiles.store,
                unit.dive.start,
                serial=head.serial,
                exclude=attached,
                profiles=profiles,
            )
            found = [_candidate(profiles.store, dive, minutes) for dive, minutes in nearby]
        if unit.part:
            row.parts.append(_part_row(unit, found))
        if unit.part > 1:
            continue
        selected = status == "attach" or (
            status == "new" and (head.serial not in newest or unit.dive.start > newest[head.serial])
        )
        for index in unit.indices:
            rows[index].status = status
            rows[index].dive_number = number
            rows[index].selected = selected
            if index != unit.head:
                rows[index].joined_to = head.computer_no
        if not unit.part:
            row.max_depth_m = unit.dive.max_depth_m
            row.duration_min = unit.dive.duration_min
        if status == "new":
            row.candidates = found
            row.suggested = suggest(found)
    targets = _row_targets(units)
    for unit in units:
        dive = entries[unit.head].dive
        if len(unit.indices) == 1 and unit.part <= 1 and dive is not None:
            exclude = {n for head, n in targets if head != unit.head}
            rows[unit.head].breaks = _breaks(profiles, dive, entries[unit.head].serial, exclude)
    return rows


def _part_row(unit: Unit, found: list[ImportCandidateOut]) -> ImportPartOut:
    """The preview of one part of a split dive."""
    status = "attach" if unit.match.status == "attach" else "new"
    return ImportPartOut(
        part=unit.part,
        start=unit.dive.start.isoformat(timespec="seconds"),
        duration_min=unit.dive.duration_min,
        max_depth_m=unit.dive.max_depth_m,
        status=status,
        dive_number=unit.match.dive.number if unit.match.dive else None,
        candidates=found,
        suggested=suggest(found),
    )


def _row_targets(units: Sequence[Unit]) -> set[tuple[int, int]]:
    """``(head index, log dive number)`` of every unit that attaches."""
    return {
        (unit.head, unit.match.dive.number)
        for unit in units
        if unit.match.status == "attach" and unit.match.dive is not None
    }


def _breaks(
    profiles: Profiles, dive: ShearwaterDive, serial: str, exclude: Collection[int]
) -> list[ImportBreakOut]:
    """The surface breaks of a computer dive, suggested where a logged dive starts after one.

    A break is suggested when a log dive without a profile from this computer, and not the
    target of another row, starts between a minute before the break and ``MATCH_WINDOW``
    after it.
    """
    found: list[ImportBreakOut] = []
    for start_s, end_s in surface_breaks_of(dive):
        began = dive.start + timedelta(seconds=start_s)
        ended = dive.start + timedelta(seconds=end_s)
        logged = starting_between(
            profiles.store,
            began - BREAK_LEAD,
            ended + MATCH_WINDOW,
            serial=serial,
            exclude=exclude,
            profiles=profiles,
        )
        found.append(
            ImportBreakOut(
                start_s=start_s,
                end_s=end_s,
                minutes=round((end_s - start_s) / 60),
                start=began.strftime("%H:%M"),
                end=ended.strftime("%H:%M"),
                suggested=bool(logged),
            )
        )
    return found


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
