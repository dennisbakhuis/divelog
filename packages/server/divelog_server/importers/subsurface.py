"""Parse a Subsurface XML export into draft dives.

Subsurface is the interchange format most dive computers and log apps can
export to, and it carries everything the log needs: numbering, timing, depths,
temperatures, the site with GPS, buddies, tags, notes and the sample profile.
"""

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time

from lxml import etree

_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


@dataclass
class DraftSite:
    uuid: str
    name: str
    lat: float | None = None
    lon: float | None = None
    description: str = ""


@dataclass
class DraftDive:
    number: int | None
    date: date
    time_in: time | None
    duration_min: int
    max_depth_m: float
    avg_depth_m: float | None
    water_temp_c: float | None
    air_temp_c: float | None
    site_uuid: str | None
    buddies: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    notes: str = ""
    rating: int | None = None
    o2_pct: int | None = None
    he_pct: int | None = None
    suit: str | None = None
    weights_kg: float | None = None
    samples: list[dict[str, float | int]] = field(default_factory=list)
    computer: str = ""

    @property
    def starts_at(self) -> datetime:
        return datetime.combine(self.date, self.time_in or time(0, 0))


@dataclass
class SubsurfaceLog:
    sites: dict[str, DraftSite]
    dives: list[DraftDive]


def _num(raw: str | None) -> float | None:
    if not raw:
        return None
    match = _NUMBER_RE.search(raw)
    return float(match.group()) if match else None


def _minutes(raw: str | None) -> int:
    """'52:30 min' → 53; '45 min' → 45."""
    if not raw:
        return 0
    head = raw.split()[0]
    if ":" in head:
        mins, secs = head.split(":", 1)
        return int(mins) + (1 if int(secs or 0) >= 30 else 0)
    return int(float(head))


def _seconds(raw: str | None) -> int:
    if not raw:
        return 0
    head = raw.split()[0]
    if ":" in head:
        mins, secs = head.split(":", 1)
        return int(mins) * 60 + int(secs or 0)
    return int(float(head)) * 60


def _text(el: etree._Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def parse_subsurface(data: bytes) -> SubsurfaceLog:
    root = etree.fromstring(data, parser=etree.XMLParser(resolve_entities=False, no_network=True))

    sites: dict[str, DraftSite] = {}
    for site in root.iter("site"):
        uuid = site.get("uuid") or ""
        lat = lon = None
        gps = site.get("gps")
        if gps:
            parts = gps.split()
            if len(parts) == 2:
                lat, lon = float(parts[0]), float(parts[1])
        sites[uuid] = DraftSite(
            uuid=uuid,
            name=site.get("name") or "Unnamed site",
            lat=lat,
            lon=lon,
            description=_text(site.find("notes")),
        )

    dives: list[DraftDive] = []
    for dive in root.iter("dive"):
        raw_date = dive.get("date")
        if not raw_date:
            continue
        dive_date = date.fromisoformat(raw_date)
        raw_time = dive.get("time")
        time_in = time.fromisoformat(raw_time) if raw_time else None

        depth = dive.find("depth")
        if depth is None:
            depth = dive.find("divecomputer/depth")
        temp = dive.find("divecomputer/temperature")
        if temp is None:
            temp = dive.find("temperature")
        cylinder = dive.find("cylinder")
        computer = dive.find("divecomputer")
        weights = dive.find("weightsystem")

        samples: list[dict[str, float | int]] = []
        if computer is not None:
            for s in computer.iter("sample"):
                d = _num(s.get("depth"))
                if d is None:
                    continue
                sample: dict[str, float | int] = {"t": _seconds(s.get("time")), "d": d}
                t = _num(s.get("temp"))
                if t is not None:
                    sample["temp"] = t
                samples.append(sample)

        tags = [t.strip() for t in (dive.get("tags") or "").split(",") if t.strip()]
        rating = int(dive.get("rating") or 0) or None
        o2 = _num(cylinder.get("o2")) if cylinder is not None else None
        he = _num(cylinder.get("he")) if cylinder is not None else None

        dives.append(
            DraftDive(
                number=int(raw_number) if (raw_number := dive.get("number")) else None,
                date=dive_date,
                time_in=time_in,
                duration_min=_minutes(dive.get("duration")),
                max_depth_m=(_num(depth.get("max")) if depth is not None else None) or 0.0,
                avg_depth_m=_num(depth.get("mean")) if depth is not None else None,
                water_temp_c=_num(temp.get("water")) if temp is not None else None,
                air_temp_c=_num(temp.get("air")) if temp is not None else None,
                site_uuid=dive.get("divesiteid"),
                buddies=[b for b in re.split(r",\s*", _text(dive.find("buddy"))) if b],
                tags=tags,
                notes=_text(dive.find("notes")),
                rating=rating,
                o2_pct=round(o2) if o2 is not None else None,
                he_pct=round(he) if he is not None else None,
                suit=_text(dive.find("suit")) or None,
                weights_kg=_num(weights.get("weight")) if weights is not None else None,
                samples=downsample(samples),
                computer=computer.get("model", "") if computer is not None else "",
            )
        )

    return SubsurfaceLog(sites=sites, dives=dives)


def downsample(
    samples: list[dict[str, float | int]], max_points: int = 240
) -> list[dict[str, float | int]]:
    """Keep at most `max_points` evenly spaced samples; the chart needs no more."""
    if len(samples) <= max_points:
        return samples
    step = len(samples) / max_points
    picked = [samples[int(i * step)] for i in range(max_points)]
    if picked[-1] is not samples[-1]:
        picked.append(samples[-1])
    return picked


def gas_for(o2: int | None, he: int | None) -> str:
    if he:
        return "trimix"
    if o2 and o2 > 22:
        return "nitrox"
    return "air"
