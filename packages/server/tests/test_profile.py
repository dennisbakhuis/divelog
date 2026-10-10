from divelog_server.services.profile import profile_stats


def columnar() -> dict:
    t = list(range(0, 600, 10))
    depth = [min(i * 2.0, 30.0) for i in range(30)] + [30.0 - (i - 29) * 1.0 for i in range(30, 60)]
    stops = [0.0] * 60
    for i in range(40, 52):
        stops[i] = 6.0 if i < 46 else 3.0
    return {"t_s": t, "depth_m": depth, "stop_depth_m": stops}


def test_profile_stats_from_columns() -> None:
    stats = profile_stats(columnar())
    assert stats is not None
    assert stats.samples == 60
    assert stats.deco_min == 2.0
    assert stats.deepest_stop_m == 6.0
    assert stats.first_stop_s == 400
    assert stats.time_at_max_s == 150
    assert stats.max_descent_m_min == 12.0
    assert stats.max_ascent_m_min == 6.0


def test_profile_stats_from_rows_without_deco() -> None:
    rows = [{"t": 0, "d": 0.0}, {"t": 60, "d": 10.0}, {"t": 120, "d": 10.0}, {"t": 180, "d": 0.0}]
    stats = profile_stats({"samples": rows})
    assert stats is not None
    assert stats.deco_min is None
    assert stats.deepest_stop_m is None
    assert stats.first_stop_s is None
    assert stats.max_descent_m_min == 10.0
    assert stats.max_ascent_m_min == 10.0
    assert stats.time_at_max_s == 60


def test_profile_stats_needs_two_samples() -> None:
    assert profile_stats({"samples": [{"t": 0, "d": 0}]}) is None
    assert profile_stats({"t_s": [], "depth_m": []}) is None
