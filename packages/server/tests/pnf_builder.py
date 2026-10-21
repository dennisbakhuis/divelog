"""Write Shearwater PNF records from field values, for parser tests (see docs/SHEARWATER.md)."""

import gzip
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Literal

RECORD = 32
START = datetime(2025, 3, 1, 9, 30)
END = datetime(2025, 3, 1, 10, 15, 30)


def record(kind: int, fields: dict[int, bytes] | None = None) -> bytes:
    """A 32-byte record of ``kind`` with ``fields`` written at their offsets."""
    raw = bytearray(RECORD)
    raw[0] = kind
    for offset, value in (fields or {}).items():
        raw[offset : offset + len(value)] = value
    assert len(raw) == RECORD
    return bytes(raw)


def _int(value: int, size: int) -> bytes:
    """``value`` as a big-endian field of ``size`` bytes, two's complement when negative."""
    return (value % (1 << (8 * size))).to_bytes(size, "big")


def _stamp(moment: datetime) -> bytes:
    """A naive local time as PNF seconds since 1970."""
    return _int(int(moment.replace(tzinfo=UTC).timestamp()), 4)


def _padded(values: Sequence[int], size: int) -> bytes:
    """``values`` as single bytes, zero-filled to ``size``."""
    return bytes([*values, *[0] * (size - len(values))])


def opening0(
    *,
    number: int = 7,
    gf_low: int = 55,
    gf_high: int = 85,
    units: int = 0,
    start: datetime = START,
    o2: Sequence[int] = (32,),
    diluent_o2: Sequence[int] = (),
    he01: Sequence[int] = (0, 0),
) -> bytes:
    """Opening record 0: number, gradient factors, units, start and gases 0–9."""
    return record(
        0x10,
        {
            2: _int(number, 2),
            4: bytes([gf_low, gf_high]),
            8: bytes([units]),
            12: _stamp(start),
            20: _padded(o2, 5),
            25: _padded(diluent_o2, 5),
            30: _padded(he01, 2),
        },
    )


def opening1(
    *, he: Sequence[int] = (), surface_mbar: int = 1013, serial: int = 0x344FDE85
) -> bytes:
    """Opening record 1: He of gases 2–9, surface pressure and serial."""
    return record(0x11, {1: _padded(he, 8), 16: _int(surface_mbar, 2), 18: _int(serial, 4)})


def opening2(*, deco_model: int = 0) -> bytes:
    """Opening record 2: the deco model."""
    return record(0x12, {18: bytes([deco_model])})


def opening3(*, density: int = 1020) -> bytes:
    """Opening record 3: the water density."""
    return record(0x13, {3: _int(density, 2)})


def opening4(*, mode: int = 1, log_version: int = 13, enabled: int = 0b1) -> bytes:
    """Opening record 4: dive mode, log version and enabled gases."""
    return record(0x14, {1: bytes([mode]), 16: bytes([log_version]), 17: _int(enabled, 2)})


def opening5(*, interval_ms: int = 10_000, utc_offset_min: int = 0) -> bytes:
    """Opening record 5: sample interval and time zone."""
    return record(0x15, {23: _int(interval_ms, 2), 26: _int(utc_offset_min, 4)})


def closing0(*, max_depth: float = 18.5, duration_s: int = 2700, end: datetime = END) -> bytes:
    """Closing record 0: maximum depth (metres or feet), dive time and end."""
    return record(
        0x20, {4: _int(round(max_depth * 10), 2), 6: _int(duration_s, 3), 12: _stamp(end)}
    )


def final(*, serial: int = 0x344FDE85, model: int = 6) -> bytes:
    """The final record: serial and model."""
    return record(0xFF, {2: _int(serial, 4), 13: bytes([model])})


def sample(
    *,
    depth: float = 0.0,
    stop: int = 0,
    tts: int = 0,
    ndl: int = 99,
    o2: int = 32,
    he: int = 0,
    temp: int = 20,
    status: int = 0x10,
) -> bytes:
    """A dive sample; depth and stop in metres or feet, temp as the raw signed byte."""
    return record(
        0x01,
        {
            1: _int(round(depth * 10), 2),
            3: _int(stop, 2),
            5: _int(tts, 2),
            8: bytes([o2, he, ndl]),
            12: bytes([status]),
            14: _int(temp, 1),
        },
    )


def unknown(kind: int = 0x70) -> bytes:
    """A record of a type the parser does not read, filled with noise."""
    return record(kind, {1: bytes(range(1, RECORD))})


def pad() -> bytes:
    """A padding record."""
    return bytes(RECORD)


def header(*, log_version: int = 13, units: int = 0) -> list[bytes]:
    """Opening records 0–5 with defaults, for tests about samples."""
    records = [
        opening0(units=units),
        opening1(),
        opening2(),
        opening3(),
        opening4(log_version=log_version),
    ]
    return [*records, opening5()] if log_version >= 9 else records


def blob(records: Iterable[bytes], framing: Literal["gzip", "plain"] = "gzip") -> bytes:
    """The records as a Shearwater Cloud blob (length and gzip) or a plain record stream."""
    body = b"".join(records)
    if framing == "plain":
        return body
    return len(body).to_bytes(4, "little") + gzip.compress(body)
