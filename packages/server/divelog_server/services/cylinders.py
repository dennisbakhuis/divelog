"""Cylinder volumes from the free-text log field, and the SAC rate they allow."""

import re
from collections.abc import Sequence

from divelog_server.store.models import TankRecord

AL80_L = 11.1
MAX_CYLINDERS = 2

_DECIMAL_COMMA = re.compile(r"(\d),(\d)")
_LITRES = re.compile(r"(?:\b(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*l\b")
_DOUBLES = re.compile(r"(?:\b(\d+)\s*x\s*)?\b(dd|d)(\d+(?:\.\d+)?)\b")


def cylinder_volume_l(text: str) -> float | None:
    """Total water volume in litres of the gas supply the logged pressures describe.

    Only a single cylinder or a pair (doubles, sidemount) counts. Anything with a
    stage (``+``), more than two cylinders, or no readable size gives ``None``.

    Parameters
    ----------
    text
        The free-text cylinder field, e.g. ``"Alu, single, 12 L"``, ``"2x D80"`` or ``"D12"``.

    Returns
    -------
    float | None
        Litres, or ``None`` when the configuration is unknown or ambiguous.
    """
    normalised = _DECIMAL_COMMA.sub(r"\1.\2", text.strip().lower())
    if not normalised or "+" in normalised:
        return None
    if match := _LITRES.search(normalised):
        count = int(match.group(1) or 1)
        volume = float(match.group(2))
    elif match := _DOUBLES.search(normalised):
        size = float(match.group(3))
        per_unit = 2 if match.group(2) == "dd" else 1
        if size == 80:
            volume = AL80_L
        else:
            if match.group(1) or per_unit == 2:
                return None
            per_unit, volume = 2, size
        count = int(match.group(1) or 1) * per_unit
    else:
        return None
    if not 1 <= count <= MAX_CYLINDERS or volume <= 0:
        return None
    return round(count * volume, 1)


def _number(value: float) -> str:
    return f"{value:g}"


def sac_rate(
    cylinder: str | None,
    pressure_in_bar: float | None,
    pressure_out_bar: float | None,
    duration_min: float | None,
    avg_depth_m: float | None,
) -> tuple[float | None, str | None]:
    """Surface air consumption in litres per minute, and the inputs it rests on.

    Parameters
    ----------
    cylinder
        The free-text cylinder field.
    pressure_in_bar, pressure_out_bar
        Start and end pressure.
    duration_min
        Dive time in minutes.
    avg_depth_m
        Average depth in metres.

    Returns
    -------
    tuple[float | None, str | None]
        The rate rounded to one decimal and a basis such as ``"22.2 L · 200→90 bar"``,
        or ``(None, None)`` when any input is missing or not positive.
    """
    volume = cylinder_volume_l(cylinder) if cylinder else None
    if (
        volume is None
        or pressure_in_bar is None
        or pressure_out_bar is None
        or duration_min is None
        or avg_depth_m is None
        or min(pressure_in_bar, pressure_out_bar, duration_min, avg_depth_m) <= 0
        or pressure_in_bar <= pressure_out_bar
    ):
        return None, None
    used_l = (pressure_in_bar - pressure_out_bar) * volume
    rate = used_l / (duration_min * (avg_depth_m / 10 + 1))
    basis = f"{_number(volume)} L · {_number(pressure_in_bar)}→{_number(pressure_out_bar)} bar"
    return round(rate, 1), basis


CYLINDER_PRESETS: dict[str, float] = {
    "d7": 14.0,
    "d8.5": 17.0,
    "d10": 20.0,
    "d12": 24.0,
    "alu80": AL80_L,
    "al80": AL80_L,
    "s80": AL80_L,
    "d80": AL80_L,
    "s40": 5.7,
    "al40": 5.7,
    "alu40": 5.7,
    "s72": 10.0,
    "7l": 7.0,
    "10l": 10.0,
    "12l": 12.0,
    "15l": 15.0,
}


def tank_volume_l(cylinder: str, volume_l: float | None = None) -> float | None:
    """A tank's water volume: as logged, else from the preset name, else parsed from the text."""
    if volume_l:
        return volume_l
    key = cylinder.strip().lower().replace(" ", "")
    if key in CYLINDER_PRESETS:
        return CYLINDER_PRESETS[key]
    return cylinder_volume_l(cylinder)


def sac_from_tanks(
    tanks: Sequence[TankRecord], duration_min: float | None, avg_depth_m: float | None
) -> tuple[float | None, str | None]:
    """SAC over the back gas: every ``back`` tank with a volume and both pressures.

    Stages and deco gases are breathed at other depths for unknown stretches, so
    they are left out; the basis string names what was counted.
    """
    if not duration_min or not avg_depth_m or min(duration_min, avg_depth_m) <= 0:
        return None, None
    used_l = 0.0
    parts: list[str] = []
    for tank in tanks:
        if tank.role != "back":
            continue
        volume = tank_volume_l(tank.cylinder, tank.volume_l)
        if (
            volume is None
            or tank.pressure_in_bar is None
            or tank.pressure_out_bar is None
            or tank.pressure_in_bar <= tank.pressure_out_bar
        ):
            continue
        used_l += (tank.pressure_in_bar - tank.pressure_out_bar) * volume
        parts.append(
            f"{tank.cylinder} {_number(volume)} L · "
            f"{_number(tank.pressure_in_bar)}→{_number(tank.pressure_out_bar)} bar"
        )
    if not parts:
        return None, None
    rate = used_l / (duration_min * (avg_depth_m / 10 + 1))
    return round(rate, 1), " + ".join(parts)
