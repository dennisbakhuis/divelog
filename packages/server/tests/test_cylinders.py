import pytest

from divelog_server.services.cylinders import (
    cylinder_volume_l,
    sac_from_tanks,
    sac_rate,
    tank_volume_l,
)
from divelog_server.store.models import TankRecord


@pytest.mark.parametrize(
    ("text", "litres"),
    [
        ("Alu, single, 12 L", 12),
        ("Steel, single, 12 L", 12),
        ("Steel, single, 10 L", 10),
        ("12 L", 12),
        ("Alu, single, 11 L", 11),
        ("Stalen fles 12 L", 12),
        ("Steel, single, 2x10 L", 20),
        ("D80", 11.1),
        ("2x D80", 22.2),
        ("DD80", 22.2),
        ("D12", 24),
        ("Steel, doubles, 24 L", 24),
        ("Doubles, 24 L", 24),
        ("Alu, single, 11,1 L", 11.1),
        ("4x D80", None),
        ("2x D80 + 1x S80", None),
        ("D12 + Alu80", None),
        ("D12 + Alu80 stage", None),
        ("D12 + 7L", None),
        ("DD80 + stage 80", None),
        ("D12 + Alu80 EANx32 (32,9)", None),
        ("Alufles", None),
        ("Steel, doubles", None),
        ("Stalen fles", None),
        ("Alu, single", None),
        ("Steel, single", None),
        ("Alufles + zaklamp", None),
    ],
)
def test_cylinder_volume(text: str, litres: float | None) -> None:
    assert cylinder_volume_l(text) == litres


def test_sac_rate() -> None:
    assert sac_rate("2x D80", 200, 90, 90, 20) == (9.0, "22.2 L · 200→90 bar")
    assert sac_rate("12 L", 200.0, 50.0, 60, 10) == (15.0, "12 L · 200→50 bar")
    assert sac_rate("D12 + 7L", 200, 90, 90, 20) == (None, None)
    assert sac_rate("12 L", 200, 200, 60, 10) == (None, None)
    assert sac_rate("12 L", 200, 50, 60, None) == (None, None)
    assert sac_rate("12 L", 200, 50, 0, 10) == (None, None)
    assert sac_rate(None, 200, 50, 60, 10) == (None, None)


def test_tank_volume_prefers_logged_then_preset_then_text() -> None:
    assert tank_volume_l("D12") == 24
    assert tank_volume_l("Alu80") == 11.1
    assert tank_volume_l("D12", 23.4) == 23.4
    assert tank_volume_l("Steel, single, 10 L") == 10
    assert tank_volume_l("whatever") is None


def test_sac_from_tanks_counts_back_gas_only() -> None:
    back = TankRecord(
        cylinder="D12", gas="nitrox", o2_pct=32, pressure_in_bar=200, pressure_out_bar=80
    )
    stage = TankRecord(
        cylinder="Alu80",
        gas="nitrox",
        o2_pct=50,
        pressure_in_bar=200,
        pressure_out_bar=150,
        role="deco",
    )
    assert sac_from_tanks([back, stage], 60, 20) == (16.0, "D12 24 L · 200→80 bar")
    twin = TankRecord(cylinder="Alu80", pressure_in_bar=200, pressure_out_bar=100)
    rate, basis = sac_from_tanks([twin, twin], 50, 10)
    assert rate == 22.2 and basis == "Alu80 11.1 L · 200→100 bar + Alu80 11.1 L · 200→100 bar"
    assert sac_from_tanks([stage], 60, 20) == (None, None)
    assert sac_from_tanks([back], 60, None) == (None, None)
