"""Parse Shearwater PNF dive logs (the ``sw-pnf`` blobs of Shearwater Cloud) into profiles.

A PNF log is a stream of 32-byte records: opening records with the settings at the start of
the dive, one record per sample, closing records with the state at the end and a final record
naming the computer. The format is described in ``docs/SHEARWATER.md``; the result is the same
``ShearwaterDive`` the XML importer builds, so both imports write identical profiles.
"""

import zlib
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

from divelog_server.importers.shearwater import DECO_MODELS, ShearwaterDive, _gas_label

RECORD = 32
GZIP_MAGIC = b"\x1f\x8b"
PREDATOR_MAGIC = b"\xff\xff"
PADDING = 0x00
SAMPLE = 0x01
FREEDIVE_SAMPLE = 0x02
OPENING = (0x10, 0x11, 0x12, 0x13, 0x14, 0x15)
CLOSING_0 = 0x20
FINAL = 0xFF
DEFAULT_INTERVAL_MS = 10_000
OPEN_CIRCUIT = 0x10
FREEDIVE_MODE = 7
GASES = 10
FEET_TO_M = 0.3048
SURFACE_M = 0.3
BREAK_MIN_S = 60
BREAK_MERGE_S = 180
BREAK_MARGIN_S = 180
MODELS = {
    3: "Petrel 2",
    5: "Perdix",
    6: "Perdix AI",
    7: "NERD 2",
    8: "Teric",
    9: "Peregrine",
    10: "Petrel 3",
    11: "Perdix 2",
    12: "Tern",
    13: "Peregrine TX",
    14: "Perdix 3",
}


def unwrap(blob: bytes) -> bytes:
    """The PNF record stream inside a stored log.

    Parameters
    ----------
    blob : bytes
        A Shearwater Cloud ``data_bytes_1`` value (4-byte little-endian length, then gzip),
        a bare gzip stream, or plain PNF bytes such as a ``.swlogdata`` file.

    Returns
    -------
    bytes
        The uncompressed record stream.

    Raises
    ------
    ValueError
        When the gzip stream is corrupt, cut short or not the announced length.
    """
    if blob[4:6] == GZIP_MAGIC:
        body = _gunzip(blob[4:])
        expected = int.from_bytes(blob[:4], "little")
        if len(body) != expected:
            raise ValueError(f"PNF log is {len(body)} bytes, its header announces {expected}")
        return body
    if blob[:2] == GZIP_MAGIC:
        return _gunzip(blob)
    return blob


def _gunzip(stream: bytes) -> bytes:
    """Decompress one gzip member, ignoring the zero padding Shearwater Cloud appends."""
    inflater = zlib.decompressobj(wbits=31)
    try:
        body = inflater.decompress(stream)
    except zlib.error as exc:
        raise ValueError(f"corrupt gzip stream in PNF log: {exc}") from exc
    if not inflater.eof:
        raise ValueError("truncated gzip stream in PNF log")
    return body


def _uint(record: bytes, offset: int, size: int) -> int:
    """A big-endian unsigned field of a record."""
    return int.from_bytes(record[offset : offset + size], "big")


def _stamp(seconds: int) -> datetime | None:
    """A PNF time stamp (local wall-clock seconds since 1970) as a naive datetime."""
    return datetime.fromtimestamp(seconds, UTC).replace(tzinfo=None) if seconds else None


def _temperature(raw: int, imperial: bool) -> float:
    """Water temperature in °C from the signed sample byte, with the negative fix-up."""
    value = raw - 256 if raw > 127 else raw
    if value < 0:
        value = min(value + 102, 0)
    return round((value - 32) * 5 / 9, 1) if imperial else float(value)


def _metres(value: float, imperial: bool) -> float:
    """A depth in metres, from metres or feet, to 0.1 m."""
    return round(float(value) * FEET_TO_M if imperial else float(value), 1)


def _records(data: bytes) -> tuple[dict[int, bytes], list[bytes]]:
    """The first record of each type and the dive samples, in log order."""
    if not data:
        raise ValueError("empty PNF log")
    if data[:2] == PREDATOR_MAGIC:
        raise ValueError("Predator-style (FFFF) logs are not supported")
    if len(data) % RECORD:
        raise ValueError(f"truncated PNF log: {len(data)} bytes is not a whole number of records")
    first: dict[int, bytes] = {}
    samples: list[bytes] = []
    for offset in range(0, len(data), RECORD):
        record = data[offset : offset + RECORD]
        kind = record[0]
        if kind == SAMPLE:
            samples.append(record)
        elif kind == FREEDIVE_SAMPLE:
            raise ValueError("freedive logs are not supported")
        elif kind != PADDING:
            first.setdefault(kind, record)
    return first, samples


def _gases(first: dict[int, bytes]) -> list[list[int]]:
    """``[O2, He]`` of each enabled gas, from opening records 0, 1 and 4."""
    o0, o1, o4 = first[OPENING[0]], first.get(OPENING[1]), first.get(OPENING[4])
    he = [*o0[30:32], *(o1[1:9] if o1 else bytes(8))]
    enabled = _uint(o4, 17, 2) if o4 else (1 << GASES) - 1
    return [[o0[20 + i], he[i]] for i in range(GASES) if enabled & (1 << i) and o0[20 + i] > 0]


def parse_pnf(
    data: bytes,
    *,
    serial: str | None = None,
    model_name: str | None = None,
    interval_s: float | None = None,
) -> ShearwaterDive:
    """Parse one PNF dive log.

    Parameters
    ----------
    data : bytes
        The record stream, as returned by ``unwrap``.
    serial : str, optional
        The computer's serial; read from the log when not given.
    model_name : str, optional
        The computer's model, such as ``"Perdix AI"``; read from the final record when not given.
    interval_s : float, optional
        Seconds between samples, overriding the logged interval.

    Returns
    -------
    ShearwaterDive
        The dive, without the surface samples logged after it ended.

    Raises
    ------
    ValueError
        For a Predator-style, freedive, closed-circuit, empty or truncated log, or one without
        opening record 0, closing record 0 or samples.
    """
    first, samples = _records(data)
    o0 = first.get(OPENING[0])
    if o0 is None:
        raise ValueError("PNF log has no opening record 0")
    c0 = first.get(CLOSING_0)
    if c0 is None:
        raise ValueError("PNF log has no closing record 0")
    o1, o2, o3, o4, o5 = (first.get(kind) for kind in OPENING[1:])
    final = first.get(FINAL)
    log_version = o4[16] if o4 else None
    mode = o4[1] if o4 and o4[16] >= 8 else None
    if mode == FREEDIVE_MODE:
        raise ValueError("freedive logs are not supported")
    if not samples:
        raise ValueError("PNF log has no samples")
    if not any(sample[12] & OPEN_CIRCUIT for sample in samples):
        raise ValueError("closed-circuit logs are not supported")
    start = _stamp(_uint(o0, 12, 4))
    if start is None:
        raise ValueError("PNF log has no start time")
    imperial = o0[8] == 1
    if serial is None:
        serial_no = _uint(o1, 18, 4) if o1 else 0
        serial_no = serial_no or (_uint(final, 2, 4) if final else 0)
        serial = f"{serial_no:08X}" if serial_no else ""
    if model_name is None and final is not None:
        model_name = MODELS.get(final[13], "Shearwater")
    logged_ms = _uint(o5, 23, 2) if o5 else 0
    interval_ms = interval_s * 1000 if interval_s else logged_ms or DEFAULT_INTERVAL_MS

    depths = [_uint(sample, 1, 2) for sample in samples]
    last_below = max((k for k, depth in enumerate(depths) if depth > 0), default=-1)
    dive = ShearwaterDive(
        number=_uint(o0, 2, 2),
        start=start,
        end=_stamp(_uint(c0, 12, 4)),
        max_depth_m=_metres(_uint(c0, 4, 2) / 10, imperial),
        duration_min=round(_uint(c0, 6, 3) / 60, 1),
        gf=f"{o0[4]}/{o0[5]}",
        deco_model=DECO_MODELS.get(str(o2[18])) if o2 else None,
        surface_pressure_mbar=(_uint(o1, 16, 2) or None) if o1 else None,
        serial=serial,
        model_name=model_name,
        log_version=log_version,
        water_density=(_uint(o3, 3, 2) or None) if o3 else None,
        gases=_gases(first),
    )
    last_gas: str | None = None
    for k, sample in enumerate(samples[: last_below + 2]):
        t = round(k * interval_ms / 1000)
        stop = _uint(sample, 3, 2)
        dive.t_s.append(t)
        dive.depth_m.append(_metres(depths[k] / 10, imperial))
        dive.temp_c.append(_temperature(sample[14], imperial))
        dive.ndl_min.append(0 if stop else sample[10])
        dive.tts_min.append(_uint(sample, 5, 2))
        dive.stop_depth_m.append(_metres(stop, imperial))
        o2_pct, he_pct = sample[8], sample[9]
        if not o2_pct and not he_pct:
            continue
        gas = _gas_label(o2_pct / 100, he_pct / 100)
        if gas != last_gas:
            dive.gas_switches.append([t, gas])
            last_gas = gas
    return dive


def merge_parts(parts: list[ShearwaterDive]) -> ShearwaterDive:
    """Join the logs of one dive the computer split at a surface break.

    Parameters
    ----------
    parts : list of ShearwaterDive
        The logs, in any order.

    Returns
    -------
    ShearwaterDive
        One dive on the first part's time axis: later samples are offset by their start, each
        join is a surface break, the dive time is the sum of the parts' and the end is the last.
        Its ``source_ids`` are the parts' in start order.

    Raises
    ------
    ValueError
        When there are no parts.
    """
    if not parts:
        raise ValueError("no dive logs to merge")
    ordered = sorted(parts, key=lambda part: part.start)
    head = ordered[0]
    merged = replace(
        head,
        t_s=[],
        depth_m=[],
        temp_c=[],
        ndl_min=[],
        tts_min=[],
        stop_depth_m=[],
        gas_switches=[],
        computer_records=[],
        surface_breaks=[],
        source_ids=list(dict.fromkeys(i for part in ordered for i in part.source_ids)),
    )
    for part in ordered:
        offset = int((part.start - head.start).total_seconds())
        if merged.t_s and part.t_s:
            merged.surface_breaks.append([merged.t_s[-1], part.t_s[0] + offset])
        merged.surface_breaks.extend([a + offset, b + offset] for a, b in part.surface_breaks)
        merged.t_s.extend(t + offset for t in part.t_s)
        merged.depth_m.extend(part.depth_m)
        merged.temp_c.extend(part.temp_c)
        merged.ndl_min.extend(part.ndl_min)
        merged.tts_min.extend(part.tts_min)
        merged.stop_depth_m.extend(part.stop_depth_m)
        for t, gas in part.gas_switches:
            if not merged.gas_switches or merged.gas_switches[-1][1] != gas:
                merged.gas_switches.append([t + offset, gas])
        merged.computer_records.extend(part.computer_records or [part.number])
    merged.end = ordered[-1].end
    merged.max_depth_m = max(part.max_depth_m for part in ordered)
    merged.duration_min = round(sum(part.duration_min for part in ordered), 1)
    if len(ordered) == 1:
        merged.computer_records = list(head.computer_records)
    return merged


def surface_breaks_of(dive: ShearwaterDive) -> list[tuple[int, int]]:
    """The surface intervals inside a dive, where the owner may cut it into several dives.

    A break is a run of consecutive samples at most ``SURFACE_M`` deep lasting at least
    ``BREAK_MIN_S``; runs less than ``BREAK_MERGE_S`` apart are one break. Only breaks that
    start ``BREAK_MARGIN_S`` after the first sample and end ``BREAK_MARGIN_S`` before the last
    sample below the surface count, so the surface before the descent and the tail after the
    ascent never do.

    Parameters
    ----------
    dive : ShearwaterDive
        The computer dive.

    Returns
    -------
    list of (int, int)
        ``(start_s, end_s)`` of each break: the times of its first and last surface sample.
    """
    runs: list[list[int]] = []
    at_surface = False
    for t, depth in zip(dive.t_s, dive.depth_m, strict=False):
        if depth <= SURFACE_M and at_surface:
            runs[-1][1] = t
        elif depth <= SURFACE_M:
            runs.append([t, t])
        at_surface = depth <= SURFACE_M
    breaks: list[list[int]] = []
    for first, last in runs:
        if last - first < BREAK_MIN_S:
            continue
        if breaks and first - breaks[-1][1] < BREAK_MERGE_S:
            breaks[-1][1] = last
        else:
            breaks.append([first, last])
    below = [t for t, depth in zip(dive.t_s, dive.depth_m, strict=False) if depth > SURFACE_M]
    if not below:
        return []
    earliest, latest = dive.t_s[0] + BREAK_MARGIN_S, below[-1] - BREAK_MARGIN_S
    return [(first, last) for first, last in breaks if first >= earliest and last <= latest]


def split_at(dive: ShearwaterDive, breaks: list[tuple[int, int]]) -> list[ShearwaterDive]:
    """Cut one computer dive into several dives at surface breaks.

    Part 1 runs from t = 0 to the first break's start, a later part from the previous break's
    end to the next break's start or the end of the dive. Each part's samples are shifted to
    start at t = 0 and its start moves by that much; its dive time, depths, temperatures and
    gas switches come from its own samples, the first switch being the gas in use when it
    starts.

    Parameters
    ----------
    dive : ShearwaterDive
        The computer dive.
    breaks : list of (int, int)
        ``(start_s, end_s)`` of the breaks to cut at, as ``surface_breaks_of`` gives them.

    Returns
    -------
    list of ShearwaterDive
        The parts in time order, each with ``computer_records`` naming the computer dive and
        the dive's ``source_ids``.
    """
    cuts = sorted(breaks)
    edges = [0, *(t for cut in cuts for t in cut)]
    bounds: list[tuple[int, int | None]] = [
        (edges[k], edges[k + 1] if k + 1 < len(edges) else None) for k in range(0, len(edges), 2)
    ]
    return [_part(dive, lo, hi) for lo, hi in bounds]


def _part(dive: ShearwaterDive, lo: int, hi: int | None) -> ShearwaterDive:
    """The samples of ``dive`` from ``lo`` to ``hi`` seconds (to the end for None) as a dive."""
    keep = [k for k, t in enumerate(dive.t_s) if t >= lo and (hi is None or t <= hi)]
    t_s = [dive.t_s[k] - lo for k in keep]
    depth_m = _picked(dive.depth_m, keep)
    start = dive.start + timedelta(seconds=lo)
    return replace(
        dive,
        start=start,
        end=dive.end if hi is None else dive.start + timedelta(seconds=hi),
        max_depth_m=max(depth_m, default=0.0),
        duration_min=round(t_s[-1] / 60, 1) if t_s else 0.0,
        t_s=t_s,
        depth_m=depth_m,
        temp_c=_picked(dive.temp_c, keep),
        ndl_min=_picked(dive.ndl_min, keep),
        tts_min=_picked(dive.tts_min, keep),
        stop_depth_m=_picked(dive.stop_depth_m, keep),
        gas_switches=_switches_within(dive.gas_switches, lo, hi),
        computer_records=[dive.number],
        source_ids=list(dive.source_ids),
        surface_breaks=[
            [a - lo, b - lo] for a, b in dive.surface_breaks if a >= lo and (hi is None or b <= hi)
        ],
    )


def _picked(values: list[Any], keep: list[int]) -> list[Any]:
    """The values of one sample column at the indices ``keep``."""
    return [values[k] for k in keep if k < len(values)]


def _switches_within(switches: list[list[Any]], lo: int, hi: int | None) -> list[list[Any]]:
    """The gas switches from ``lo`` to ``hi`` shifted to ``lo``, led by the gas in use at ``lo``."""
    ordered = sorted(switches, key=lambda switch: switch[0])
    in_use = [gas for t, gas in ordered if t <= lo]
    found: list[list[Any]] = [[0, in_use[-1]]] if in_use else []
    for t, gas in ordered:
        if t > lo and (hi is None or t <= hi) and (not found or found[-1][1] != gas):
            found.append([t - lo, gas])
    return found
