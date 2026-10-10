"""Parse a Shearwater Perdix XML export (one dive per file) into a columnar profile.

Shearwater Cloud writes UTF-16 XML with a ``diveLog`` header and one ``diveLogRecord`` per sample.
The result is the same shape as the profiles in the data repository, so a dive imported today
looks exactly like the 2020 backfill.
"""

import statistics
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from lxml import etree

DECO_MODELS = {"0": "ZHL-16C GF", "1": "VPM-B", "2": "VPM-B/GFS", "3": "DCIEM"}
DATE_FORMATS = (
    "%m/%d/%Y %I:%M:%S %p",
    "%d/%m/%Y %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
)


@dataclass
class ShearwaterDive:
    number: int
    start: datetime
    end: datetime | None
    max_depth_m: float
    duration_min: float
    gf: str | None
    deco_model: str | None
    surface_pressure_mbar: int | None
    serial: str
    t_s: list[int] = field(default_factory=list)
    depth_m: list[float] = field(default_factory=list)
    temp_c: list[float] = field(default_factory=list)
    ndl_min: list[int] = field(default_factory=list)
    tts_min: list[int] = field(default_factory=list)
    stop_depth_m: list[float] = field(default_factory=list)
    gas_switches: list[list[Any]] = field(default_factory=list)

    @property
    def time_in(self) -> str:
        return self.start.strftime("%H:%M")

    @property
    def time_out(self) -> str | None:
        return self.end.strftime("%H:%M") if self.end else None

    @property
    def avg_depth_m(self) -> float | None:
        below = [d for d in self.depth_m if d > 0.5]
        return round(sum(below) / len(below), 1) if below else None

    @property
    def sample_interval_s(self) -> float | None:
        gaps = [b - a for a, b in zip(self.t_s, self.t_s[1:], strict=False) if b > a]
        return round(statistics.median(gaps), 1) if gaps else None

    def profile(self) -> dict[str, Any]:
        """The columnar JSON document the data repository stores per dive."""
        return {
            "computer_no": self.number,
            "computer_records": [self.number],
            "log_dive_no": None,
            "date": self.start.date().isoformat(),
            "time_in": self.time_in,
            "time_out": self.time_out,
            "duration_min": self.duration_min,
            "max_depth_m": self.max_depth_m,
            "avg_depth_m": self.avg_depth_m,
            "temp_min_c": min(self.temp_c, default=None),
            "temp_max_c": max(self.temp_c, default=None),
            "deco": any(s > 0 for s in self.stop_depth_m),
            "gf": self.gf,
            "deco_model": self.deco_model,
            "sample_interval_s": self.sample_interval_s,
            "surface_breaks": [],
            "gas_switches": self.gas_switches,
            "partial": None,
            "source": f"Perdix {self.serial}",
            "t_s": self.t_s,
            "depth_m": self.depth_m,
            "temp_c": self.temp_c,
            "ndl_min": self.ndl_min,
            "tts_min": self.tts_min,
            "stop_depth_m": self.stop_depth_m,
        }


def _text(parent: etree._Element, tag: str) -> str:
    node = parent.find(tag)
    return (node.text or "").strip() if node is not None else ""


def _number(parent: etree._Element, tag: str) -> float | None:
    raw = _text(parent, tag)
    try:
        return float(raw)
    except ValueError:
        return None


def _date(raw: str) -> datetime | None:
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def _gas_label(o2: float | None, he: float | None) -> str:
    o2_pct = round((o2 or 0.21) * 100)
    he_pct = round((he or 0) * 100)
    return f"{o2_pct}/{he_pct}" if he_pct else str(o2_pct)


def parse_shearwater(data: bytes) -> ShearwaterDive:
    """Parse one export; raises ValueError when it is not a Shearwater dive."""
    root = etree.fromstring(
        data, parser=etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
    )
    log = root.find("diveLog") if root is not None and root.tag == "dive" else None
    if log is None:
        raise ValueError("not a Shearwater dive export")
    start = _date(_text(log, "startDate"))
    if start is None:
        raise ValueError("unreadable start date")
    gf_min, gf_max = _text(log, "gfMin"), _text(log, "gfMax")
    dive = ShearwaterDive(
        number=int(_number(log, "number") or 0),
        start=start,
        end=_date(_text(log, "endDate")),
        max_depth_m=_number(log, "maxDepth") or 0.0,
        duration_min=round((_number(log, "maxTime") or 0) / 60, 1),
        gf=f"{gf_min}/{gf_max}" if gf_min and gf_max else None,
        deco_model=DECO_MODELS.get(_text(log, "decoModel")),
        surface_pressure_mbar=int(_number(log, "startSurfacePressure") or 0) or None,
        serial=_text(log, "computerSerial"),
    )
    last_gas: str | None = None
    for record in log.iter("diveLogRecord"):
        t_ms = _number(record, "currentTime")
        depth = _number(record, "currentDepth")
        if t_ms is None or depth is None:
            continue
        t = int(round(t_ms / 1000))
        dive.t_s.append(t)
        dive.depth_m.append(round(depth, 1))
        dive.temp_c.append(_number(record, "waterTemp") or 0.0)
        dive.ndl_min.append(int(_number(record, "currentNdl") or 0))
        dive.tts_min.append(int(_number(record, "ttsMins") or 0))
        dive.stop_depth_m.append(_number(record, "firstStopDepth") or 0.0)
        gas = _gas_label(_number(record, "fractionO2"), _number(record, "fractionHe"))
        if gas != last_gas:
            dive.gas_switches.append([t, gas])
            last_gas = gas
    if not dive.t_s:
        raise ValueError("no samples in export")
    return dive


def gas_of(dive: ShearwaterDive) -> tuple[str, int | None, int | None]:
    """(gas, o2, he) of the first gas breathed."""
    if not dive.gas_switches:
        return "air", 21, 0
    label = str(dive.gas_switches[0][1])
    o2, _, he = label.partition("/")
    o2_pct, he_pct = int(o2), int(he or 0)
    if he_pct:
        return "trimix", o2_pct, he_pct
    return ("nitrox", o2_pct, 0) if o2_pct > 22 else ("air", o2_pct, 0)
