from datetime import date

from divelog_server.schemas.dive import TankIn
from divelog_server.services.dives import gas_summary, gases_of, tank_out
from divelog_server.store.models import DiveRecord, TankRecord


def test_gas_summary_takes_the_back_gas_and_names_every_tank() -> None:
    tanks = [
        TankIn(cylinder="Alu80", gas="oxygen", role="deco", pressure_in_bar=200),
        TankIn(
            cylinder="D12",
            gas="trimix",
            o2_pct=21,
            he_pct=35,
            pressure_in_bar=210,
            pressure_out_bar=70,
        ),
    ]
    assert gas_summary(tanks) == {
        "gas": "trimix",
        "o2_pct": 21,
        "o2_measured_pct": None,
        "he_pct": 35,
        "cylinder": "Alu80 + D12",
        "pressure_in_bar": 210,
        "pressure_out_bar": 70,
    }


def test_gas_summary_without_a_back_tank_falls_back_to_the_first() -> None:
    summary = gas_summary([TankIn(cylinder="S80", gas="oxygen", role="deco")])
    assert summary["gas"] == "nitrox" and summary["o2_pct"] == 100


def test_tank_out_resolves_the_volume() -> None:
    assert tank_out(TankRecord(cylinder="D12")).volume_l == 24
    assert tank_out(TankRecord(cylinder="D12", volume_l=23.4)).volume_l == 23.4
    assert tank_out(TankRecord(cylinder="odd")).volume_l is None


def test_gases_of_lists_each_mix_once_back_gas_first() -> None:
    dive = DiveRecord(
        number=1,
        date=date(2024, 1, 1),
        duration_min=60,
        gas="trimix",
        o2_pct=21,
        he_pct=35,
        tanks=[
            TankRecord(cylinder="D12", gas="trimix", o2_pct=21, he_pct=35),
            TankRecord(cylinder="Alu80", gas="nitrox", o2_pct=50, role="deco"),
            TankRecord(cylinder="S40", gas="oxygen", role="deco"),
        ],
    )
    assert gases_of(dive) == ["Trimix 21/35", "Nitrox 50", "Oxygen"]
    assert gases_of(DiveRecord(number=2, date=date(2024, 1, 1), duration_min=1)) == ["Air"]


def test_with_stage_tag_marks_a_dive_that_carried_a_stage_or_deco_bottle() -> None:
    from divelog_server.services.dives import with_stage_tag

    back = TankIn(cylinder="D12", gas="nitrox", o2_pct=32, role="back")
    stage = TankIn(cylinder="Alu80", gas="nitrox", o2_pct=32, role="stage")
    assert with_stage_tag(["cave"], [back, stage]) == ["cave", "stage"]
    assert with_stage_tag(["cave", "stage"], [back, stage]) == ["cave", "stage"]
    assert with_stage_tag(["cave"], [back]) == ["cave"]
    assert with_stage_tag([], [TankIn(cylinder="S80", gas="oxygen", role="deco")]) == ["stage"]
