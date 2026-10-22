import gzip
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from divelog_server.importers.shearwater import ShearwaterDive, gas_of, parse_shearwater
from divelog_server.importers.shearwater_pnf import (
    merge_parts,
    parse_pnf,
    split_at,
    surface_breaks_of,
    unwrap,
)
from tests import pnf_builder as pnf

FIXTURES = Path(__file__).parent / "fixtures"
GOLDEN = FIXTURES / "shearwater"


def parse(records: list[bytes], framing: str = "gzip", **kwargs: str) -> ShearwaterDive:
    blob = pnf.blob(records, "plain" if framing == "plain" else "gzip")
    return parse_pnf(unwrap(blob), **kwargs)


def dive_records() -> list[bytes]:
    return [
        pnf.opening0(
            number=674,
            gf_low=50,
            gf_high=85,
            start=datetime(2026, 8, 8, 7, 44, 48),
            o2=(32, 99, 21),
            he01=(0, 0),
        ),
        pnf.opening1(he=(35,), surface_mbar=1009, serial=0x344FDE85),
        pnf.opening2(deco_model=1),
        pnf.opening3(density=1030),
        pnf.opening4(mode=1, log_version=13, enabled=0b101),
        pnf.opening5(interval_ms=10_000),
        pnf.sample(depth=1.2, ndl=0, tts=1, temp=26),
        pnf.sample(depth=18.4, ndl=12, tts=3, temp=24),
        pnf.sample(depth=21.0, stop=6, ndl=4, tts=7, temp=22),
        pnf.sample(depth=6.0, stop=0, ndl=99, tts=1, o2=99, temp=23),
        pnf.sample(depth=0.0, o2=99, temp=25),
        pnf.sample(depth=0.0, o2=99, temp=25),
        pnf.closing0(max_depth=21.1, duration_s=2405, end=datetime(2026, 8, 8, 8, 24, 53)),
        pnf.final(serial=0x344FDE85, model=6),
    ]


def test_every_field_of_a_metric_dive() -> None:
    dive = parse(dive_records())
    assert dive.number == 674
    assert dive.start == datetime(2026, 8, 8, 7, 44, 48)
    assert dive.end == datetime(2026, 8, 8, 8, 24, 53)
    assert dive.time_in == "07:44" and dive.time_out == "08:24"
    assert dive.gf == "50/85"
    assert dive.deco_model == "VPM-B"
    assert dive.surface_pressure_mbar == 1009
    assert dive.water_density == 1030
    assert dive.log_version == 13
    assert dive.serial == "344FDE85"
    assert dive.model_name == "Perdix AI"
    assert dive.gases == [[32, 0], [21, 35]]
    assert dive.max_depth_m == 21.1
    assert dive.duration_min == 40.1
    assert dive.clock_offset_min == 0
    assert dive.t_s == [0, 10, 20, 30, 40]
    assert dive.depth_m == [1.2, 18.4, 21.0, 6.0, 0.0]
    assert dive.stop_depth_m == [0.0, 0.0, 6.0, 0.0, 0.0]
    assert dive.ndl_min == [0, 12, 0, 99, 99]
    assert dive.tts_min == [1, 3, 7, 1, 0]
    assert dive.temp_c == [26.0, 24.0, 22.0, 23.0, 25.0]
    assert dive.gas_switches == [[0, "32"], [30, "99"]]
    assert dive.sample_interval_s == 10
    profile = dive.profile()
    assert profile["source"] == "Perdix AI 344FDE85"
    assert profile["deco"] is True
    assert profile["computer_records"] == [674] and profile["surface_breaks"] == []


def test_imperial_dive_is_converted_to_metric() -> None:
    records = [
        *pnf.header(units=1),
        pnf.sample(depth=60.0, stop=10, temp=50),
        pnf.sample(depth=33.0, temp=-110),
        pnf.closing0(max_depth=66.0),
        pnf.final(),
    ]
    dive = parse(records)
    assert dive.depth_m == [18.3, 10.1]
    assert dive.stop_depth_m == [3.0, 0.0]
    assert dive.temp_c == [10.0, -22.2]
    assert dive.max_depth_m == 20.1


def test_negative_temperatures_are_fixed_up() -> None:
    records = [
        *pnf.header(),
        pnf.sample(depth=3.0, temp=-110),
        pnf.sample(depth=3.0, temp=-5),
        pnf.sample(depth=3.0, temp=-102),
        pnf.closing0(),
    ]
    assert parse(records).temp_c == [-8.0, 0.0, 0.0]


def test_trimix_label_and_gas_of() -> None:
    records = [
        *pnf.header(),
        pnf.sample(depth=30.0, o2=21, he=35),
        pnf.sample(depth=20.0, o2=0, he=0),
        pnf.sample(depth=12.0, o2=50, he=0),
        pnf.closing0(),
    ]
    dive = parse(records)
    assert dive.gas_switches == [[0, "21/35"], [20, "50"]]
    assert gas_of(dive) == ("trimix", 21, 35)


def test_gas_of_a_nitrox_dive() -> None:
    assert gas_of(parse(dive_records())) == ("nitrox", 32, 0)


@pytest.mark.parametrize(
    ("log_version", "interval_ms", "expected"),
    [(13, 2000, [0, 2, 4]), (11, 5000, [0, 5, 10]), (8, None, [0, 10, 20])],
)
def test_sample_interval_by_log_version(
    log_version: int, interval_ms: int | None, expected: list[int]
) -> None:
    records = [
        pnf.opening0(),
        pnf.opening1(),
        pnf.opening2(),
        pnf.opening3(),
        pnf.opening4(log_version=log_version),
    ]
    if interval_ms is not None:
        records.append(pnf.opening5(interval_ms=interval_ms))
    records += [pnf.sample(depth=d) for d in (2.0, 5.0, 1.0)] + [pnf.closing0()]
    dive = parse(records)
    assert dive.log_version == log_version
    assert dive.t_s == expected


def test_interval_override() -> None:
    records = [*pnf.header(), *[pnf.sample(depth=d) for d in (2.0, 5.0)], pnf.closing0()]
    dive = parse_pnf(unwrap(pnf.blob(records)), interval_s=4)
    assert dive.t_s == [0, 4]


def test_unknown_padding_and_repeated_records_are_skipped() -> None:
    records = [
        *pnf.header(),
        pnf.unknown(0x51),
        pnf.sample(depth=4.0),
        pnf.pad(),
        pnf.unknown(0x70),
        pnf.unknown(0x80),
        pnf.opening0(number=999, gf_low=10, gf_high=10),
        pnf.sample(depth=6.0),
        pnf.unknown(0x30),
        pnf.closing0(),
        pnf.pad(),
        pnf.final(),
        pnf.pad(),
    ]
    dive = parse(records)
    assert dive.number == 7 and dive.gf == "55/85"
    assert dive.depth_m == [4.0, 6.0]


def test_serial_and_model_arguments_win() -> None:
    dive = parse(dive_records(), serial="ABCD1234", model_name="Teric")
    assert dive.serial == "ABCD1234"
    assert dive.profile()["source"] == "Teric ABCD1234"


def test_serial_falls_back_to_the_final_record_and_unknown_models() -> None:
    records = [
        pnf.opening0(),
        pnf.opening1(serial=0),
        *[pnf.sample(depth=d) for d in (2.0, 3.0)],
        pnf.closing0(),
        pnf.final(serial=0xC0FFEE, model=99),
    ]
    dive = parse(records)
    assert dive.serial == "00C0FFEE"
    assert dive.model_name == "Shearwater"
    assert dive.log_version is None and dive.deco_model is None and dive.water_density is None


def test_without_final_record_the_source_stays_perdix() -> None:
    records = [*pnf.header(), pnf.sample(depth=2.0), pnf.closing0()]
    dive = parse(records)
    assert dive.model_name is None
    assert dive.profile()["source"] == "Perdix 344FDE85"


def test_surface_tail_is_trimmed_to_one_surface_point() -> None:
    depths = [0.0, 1.5, 4.0, 0.0, 3.0, 1.2, 0.0, 0.0, 0.0, 0.0]
    records = [*pnf.header(), *[pnf.sample(depth=d) for d in depths], pnf.closing0()]
    dive = parse(records)
    assert dive.depth_m == [0.0, 1.5, 4.0, 0.0, 3.0, 1.2, 0.0]
    assert dive.t_s == [0, 10, 20, 30, 40, 50, 60]


def test_tail_ending_below_the_surface_is_kept() -> None:
    records = [*pnf.header(), *[pnf.sample(depth=d) for d in (2.0, 1.1)], pnf.closing0()]
    assert parse(records).depth_m == [2.0, 1.1]


@pytest.mark.parametrize("framing", ["gzip", "plain"])
def test_both_framings(framing: str) -> None:
    dive = parse(dive_records(), framing=framing)
    assert dive.number == 674 and len(dive.t_s) == 5


def test_unwrap_bare_gzip_and_zero_padding() -> None:
    body = b"".join(dive_records())
    assert unwrap(gzip.compress(body)) == body
    padded = len(body).to_bytes(4, "little") + gzip.compress(body) + bytes(64)
    assert unwrap(padded) == body


@pytest.mark.parametrize(
    ("blob", "reason"),
    [
        (len(b"x" * 64).to_bytes(4, "little") + gzip.compress(b"x" * 32), "announces"),
        (b"\x00\x00\x00\x00" + gzip.compress(b"x" * 64)[:-12], "truncated gzip"),
        (b"\x00\x00\x00\x00\x1f\x8b" + b"nonsense" * 4, "corrupt gzip"),
    ],
)
def test_unwrap_rejects_broken_streams(blob: bytes, reason: str) -> None:
    with pytest.raises(ValueError, match=reason):
        unwrap(blob)


@pytest.mark.parametrize(
    ("records", "reason"),
    [
        ([], "empty"),
        ([b"\xff\xff" + bytes(30), pnf.sample(depth=2.0)], "Predator"),
        ([pnf.opening0(), pnf.sample(depth=2.0)[:20]], "truncated"),
        ([pnf.opening1(), pnf.sample(depth=2.0), pnf.closing0()], "opening record 0"),
        ([pnf.opening0(), pnf.sample(depth=2.0)], "closing record 0"),
        ([*pnf.header(), pnf.closing0(), pnf.final()], "no samples"),
        ([pnf.opening0(), pnf.opening4(mode=7), pnf.sample(), pnf.closing0()], "freedive"),
        ([pnf.opening0(), pnf.record(0x02), pnf.closing0()], "freedive"),
        ([*pnf.header(), pnf.sample(depth=9.0, status=0), pnf.closing0()], "closed-circuit"),
        ([pnf.opening0(start=datetime(1970, 1, 1)), pnf.sample(), pnf.closing0()], "start"),
    ],
)
def test_rejected_logs(records: list[bytes], reason: str) -> None:
    with pytest.raises(ValueError, match=reason):
        parse_pnf(b"".join(records))


def test_freedive_mode_needs_log_version_8() -> None:
    records = [pnf.opening0(), pnf.opening4(mode=7, log_version=7), pnf.sample(depth=2.0)]
    dive = parse(records + [pnf.closing0()])
    assert dive.depth_m == [2.0]


def part(start: datetime, depths: list[float], gas: int = 32, number: int = 458) -> list[bytes]:
    return [
        pnf.opening0(number=number, start=start),
        pnf.opening1(),
        pnf.opening2(),
        pnf.opening3(),
        pnf.opening4(),
        pnf.opening5(),
        *[pnf.sample(depth=d, o2=gas) for d in depths],
        pnf.closing0(max_depth=max(depths), duration_s=60 * len(depths), end=start),
        pnf.final(),
    ]


def test_merge_parts_in_start_order() -> None:
    first = parse(part(datetime(2020, 5, 18, 19, 5, 42), [2.0, 13.3, 1.0, 0.0, 0.0]))
    second = parse(part(datetime(2020, 5, 18, 19, 23, 49), [1.1, 21.7, 0.0], gas=99))
    merged = merge_parts([second, first])
    assert merged.start == first.start and merged.end == second.end
    assert merged.number == 458
    assert merged.t_s == [0, 10, 20, 30, 1087, 1097, 1107]
    assert merged.depth_m == [2.0, 13.3, 1.0, 0.0, 1.1, 21.7, 0.0]
    assert merged.max_depth_m == 21.7
    assert merged.duration_min == round(first.duration_min + second.duration_min, 1)
    assert merged.surface_breaks == [[30, 1087]]
    assert merged.gas_switches == [[0, "32"], [1087, "99"]]
    profile = merged.profile()
    assert profile["computer_records"] == [458, 458]
    assert profile["surface_breaks"] == [[30, 1087]]
    assert len(profile["temp_c"]) == len(profile["t_s"]) == len(profile["ndl_min"]) == 7
    assert first.t_s == [0, 10, 20, 30]


def test_merge_drops_a_repeated_gas_and_keeps_one_part_unchanged() -> None:
    first = parse(part(datetime(2020, 5, 18, 19, 0), [5.0, 0.0]))
    second = parse(part(datetime(2020, 5, 18, 19, 30), [6.0, 0.0]))
    assert merge_parts([first, second]).gas_switches == [[0, "32"]]
    assert merge_parts([first]).profile() == first.profile()
    with pytest.raises(ValueError, match="no dive logs"):
        merge_parts([])


def test_profile_keys_match_the_xml_importer() -> None:
    xml = parse_shearwater((FIXTURES / "perdix_sample.xml").read_bytes())
    assert list(parse(dive_records()).profile()) == list(xml.profile())


def golden_parts() -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = {}
    for path in sorted(GOLDEN.glob("*.swlog")):
        groups.setdefault(path.stem.split("-")[0], []).append(path)
    return groups


@pytest.mark.parametrize("number", sorted(golden_parts(), key=int))
def test_golden_dives(number: str) -> None:
    parts = [parse_pnf(unwrap(path.read_bytes())) for path in golden_parts()[number]]
    expected = json.loads((GOLDEN / f"{number}.json").read_text())
    assert merge_parts(parts).profile() == expected


def test_golden_fixtures_cover_the_planned_dives() -> None:
    assert set(golden_parts()) == {"64", "457", "458", "550", "674"}
    assert len(golden_parts()["458"]) == 2


SPLIT_START = datetime(2025, 2, 25, 11, 34, 29)


def built(
    *segments: tuple[float, int],
    gas_switches: list[list[object]] | None = None,
    temps: list[float] | None = None,
) -> ShearwaterDive:
    """A dive of ``(depth, seconds)`` segments sampled every ten seconds from t = 0."""
    depths = [depth for depth, seconds in segments for _ in range(seconds // 10)]
    t_s = [10 * k for k in range(len(depths))]
    return ShearwaterDive(
        number=603,
        start=SPLIT_START,
        end=SPLIT_START + timedelta(seconds=t_s[-1]),
        max_depth_m=max(depths),
        duration_min=round(t_s[-1] / 60, 1),
        gf="55/85",
        deco_model="ZHL-16C",
        surface_pressure_mbar=1013,
        serial="344FDE85",
        t_s=t_s,
        depth_m=depths,
        temp_c=temps or [24.0] * len(depths),
        ndl_min=[99] * len(depths),
        tts_min=[0] * len(depths),
        stop_depth_m=[0.0] * len(depths),
        gas_switches=gas_switches if gas_switches is not None else [[0, "32"]],
        model_name="Perdix AI",
        log_version=13,
        water_density=1020,
    )


@pytest.mark.parametrize(("seconds", "found"), [(60, []), (70, [(610, 670)]), (480, [(610, 1080)])])
def test_a_break_lasts_at_least_a_minute(seconds: int, found: list[tuple[int, int]]) -> None:
    dive = built((0.0, 10), (12.0, 600), (0.0, seconds), (12.0, 600), (0.0, 10))
    assert surface_breaks_of(dive) == found


@pytest.mark.parametrize("depth", [0.0, 0.2, 0.3])
def test_surface_is_three_decimetres_or_less(depth: float) -> None:
    dive = built((0.0, 10), (12.0, 600), (depth, 120), (12.0, 600), (0.0, 10))
    assert surface_breaks_of(dive) == [(610, 720)]


def test_shallow_water_is_not_the_surface() -> None:
    dive = built((0.0, 10), (12.0, 600), (0.4, 120), (12.0, 600), (0.0, 10))
    assert surface_breaks_of(dive) == []


@pytest.mark.parametrize(
    ("gap", "found"),
    [(170, [(610, 960)]), (180, [(610, 700), (880, 970)]), (60, [(610, 850)])],
)
def test_runs_close_together_are_one_break(gap: int, found: list[tuple[int, int]]) -> None:
    dive = built(
        (0.0, 10), (12.0, 600), (0.0, 100), (1.5, gap - 10), (0.0, 100), (12.0, 600), (0.0, 10)
    )
    assert surface_breaks_of(dive) == found


def test_a_short_run_does_not_bridge_two_breaks() -> None:
    dive = built(
        (0.0, 10),
        (12.0, 600),
        (0.0, 100),
        (1.5, 150),
        (0.0, 30),
        (1.5, 150),
        (0.0, 100),
        (12.0, 600),
        (0.0, 10),
    )
    assert surface_breaks_of(dive) == [(610, 700), (1040, 1130)]


@pytest.mark.parametrize(
    ("before", "after", "found"),
    [
        (160, 600, []),
        (170, 600, [(180, 300)]),
        (600, 180, [(610, 730)]),
        (600, 170, []),
    ],
)
def test_only_interior_breaks_count(before: int, after: int, found: list[tuple[int, int]]) -> None:
    dive = built((0.0, 10), (12.0, before), (0.0, 130), (12.0, after), (0.0, 10))
    assert surface_breaks_of(dive) == found


def test_the_surface_tail_is_never_a_break() -> None:
    dive = built((0.0, 300), (12.0, 1200), (0.0, 1200))
    assert surface_breaks_of(dive) == []
    assert surface_breaks_of(built((0.0, 600))) == []


def split_dive() -> ShearwaterDive:
    """Two dives in one log: 20 min at 12 m, 8 min at the surface, 20 min at 15 m."""
    temps = [26.0] * 121 + [28.0] * 49 + [22.0] * 120 + [27.0, 27.0]
    return built(
        (0.0, 10),
        (12.0, 1200),
        (0.0, 490),
        (15.0, 1200),
        (0.0, 20),
        gas_switches=[[0, "32"], [600, "50"], [2000, "21"]],
        temps=temps,
    )


def test_split_cuts_at_the_break_and_shifts_the_later_part() -> None:
    dive = split_dive()
    assert surface_breaks_of(dive) == [(1210, 1690)]
    first, second = split_at(dive, [(1210, 1690)])
    assert first.start == SPLIT_START and first.end == SPLIT_START + timedelta(seconds=1210)
    assert first.t_s[0] == 0 and first.t_s[-1] == 1210 and first.depth_m[-1] == 0.0
    assert second.start == SPLIT_START + timedelta(seconds=1690)
    assert second.end == dive.end and second.time_in == "12:02"
    assert second.t_s[:2] == [0, 10] and second.depth_m[0] == 0.0 and second.depth_m[1] == 15.0
    assert second.t_s[-1] == dive.t_s[-1] - 1690
    assert first.duration_min == 20.2 and second.duration_min == 20.3
    assert (first.max_depth_m, second.max_depth_m) == (12.0, 15.0)
    assert (first.avg_depth_m, second.avg_depth_m) == (12.0, 15.0)
    assert (min(first.temp_c), max(first.temp_c)) == (26.0, 28.0)
    assert (min(second.temp_c), max(second.temp_c)) == (22.0, 28.0)
    assert first.gas_switches == [[0, "32"], [600, "50"]]
    assert second.gas_switches == [[0, "50"], [310, "21"]]
    for part in (first, second):
        assert part.computer_records == [603] and part.surface_breaks == []
        assert part.number == 603 and part.gf == "55/85" and part.serial == "344FDE85"
        assert len(part.t_s) == len(part.depth_m) == len(part.temp_c) == len(part.ndl_min)
        assert part.profile()["computer_records"] == [603]
    assert len(dive.t_s) == 292 and dive.computer_records == []


def test_split_at_two_breaks_gives_three_parts() -> None:
    dive = built(
        (0.0, 10), (10.0, 600), (0.0, 120), (11.0, 600), (0.0, 120), (12.0, 600), (0.0, 10)
    )
    breaks = surface_breaks_of(dive)
    assert breaks == [(610, 720), (1330, 1440)]
    parts = split_at(dive, list(reversed(breaks)))
    assert [part.max_depth_m for part in parts] == [10.0, 11.0, 12.0]
    assert [part.t_s[-1] for part in parts] == [610, 610, 610]
    starts = [int((part.start - SPLIT_START).total_seconds()) for part in parts]
    assert starts == [0, 720, 1440]
    assert [part.gas_switches for part in parts] == [[[0, "32"]]] * 3


def test_split_without_breaks_or_gases_keeps_the_dive() -> None:
    dive = built((0.0, 10), (12.0, 600), (0.0, 10), gas_switches=[])
    (whole,) = split_at(dive, [])
    assert whole.t_s == dive.t_s and whole.end == dive.end and whole.gas_switches == []
    assert whole.duration_min == dive.duration_min
