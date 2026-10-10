"""Figures a dive computer's profile gives away once you look past the depth line."""

from dataclasses import dataclass
from typing import Any

RATE_WINDOW_S = 30
SURFACE_M = 0.5


@dataclass(frozen=True)
class ProfileStats:
    samples: int
    deco_min: float | None
    deepest_stop_m: float | None
    first_stop_s: int | None
    max_ascent_m_min: float | None
    max_descent_m_min: float | None
    time_at_max_s: int | None


def _columns(payload: dict[str, Any]) -> tuple[list[int], list[float], list[float]]:
    """Time, depth and first-stop columns from either stored profile shape."""
    if "t_s" in payload:
        t = [int(x) for x in payload.get("t_s") or []]
        d = [float(x) for x in payload.get("depth_m") or []]
        stops = [float(x or 0) for x in payload.get("stop_depth_m") or []]
    else:
        rows = payload.get("samples") or []
        t = [int(r["t"]) for r in rows]
        d = [float(r["d"]) for r in rows]
        stops = [float(r.get("stop") or 0) for r in rows]
    stops += [0.0] * (len(t) - len(stops))
    n = min(len(t), len(d))
    return t[:n], d[:n], stops[:n]


def _max_rates(t: list[int], d: list[float]) -> tuple[float | None, float | None]:
    """Steepest ascent and descent in m/min over a short window, so one odd sample is ignored."""
    ascent = descent = 0.0
    found = False
    j = 0
    for i in range(len(t)):
        while j < len(t) and t[j] - t[i] < RATE_WINDOW_S:
            j += 1
        if j >= len(t):
            break
        if d[i] < SURFACE_M and d[j] < SURFACE_M:
            continue
        rate = (d[i] - d[j]) / ((t[j] - t[i]) / 60)
        found = True
        ascent = max(ascent, rate)
        descent = max(descent, -rate)
    if not found:
        return None, None
    return round(ascent, 1), round(descent, 1)


def profile_stats(payload: dict[str, Any]) -> ProfileStats | None:
    """Deco time, stops, rates and the moment of maximum depth from the full-resolution profile."""
    t, d, stops = _columns(payload)
    if len(t) < 2:
        return None
    deco_s = 0
    first_stop: int | None = None
    deepest = 0.0
    for i in range(1, len(t)):
        if stops[i] > 0:
            deco_s += t[i] - t[i - 1]
            deepest = max(deepest, stops[i])
            if first_stop is None:
                first_stop = t[i]
    ascent, descent = _max_rates(t, d)
    deepest_i = max(range(len(d)), key=lambda i: d[i])
    return ProfileStats(
        samples=len(t),
        deco_min=round(deco_s / 60, 1) if deco_s else None,
        deepest_stop_m=deepest or None,
        first_stop_s=first_stop,
        max_ascent_m_min=ascent,
        max_descent_m_min=descent,
        time_at_max_s=t[deepest_i],
    )
