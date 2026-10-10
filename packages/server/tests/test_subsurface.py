from datetime import date, time
from pathlib import Path

from divelog_server.importers.subsurface import downsample, gas_for, parse_subsurface

FIXTURE = Path(__file__).parent / "fixtures" / "subsurface.xml"


def test_parse_sites_and_dives() -> None:
    log = parse_subsurface(FIXTURE.read_bytes())
    assert len(log.sites) == 2
    ressel = log.sites["1a2b3c4d"]
    assert ressel.name == "Émergence du Ressel"
    assert ressel.lat == 44.5741
    assert ressel.description == "Lot cave, park at the road."

    assert len(log.dives) == 2
    first = log.dives[0]
    assert first.number == 120
    assert first.date == date(2024, 5, 8)
    assert first.time_in == time(10, 30)
    assert first.duration_min == 84
    assert first.max_depth_m == 40.2
    assert first.avg_depth_m == 24.8
    assert first.water_temp_c == 13.0
    assert first.air_temp_c == 19.0
    assert first.buddies == ["Kim de Boer", "Mark de Vries"]
    assert first.tags == ["cave", "scooter"]
    assert first.rating == 5
    assert first.o2_pct == 32
    assert first.suit == "Drysuit"
    assert first.weights_kg == 4.0
    assert first.computer == "Shearwater Perdix 2"
    assert first.samples[1] == {"t": 60, "d": 8.5, "temp": 13.5}
    assert first.samples[-1] == {"t": 84 * 60 + 20, "d": 0.0}

    second = log.dives[1]
    assert second.duration_min == 45
    assert second.buddies == []
    assert second.samples == []


def test_downsample_keeps_ends() -> None:
    samples = [{"t": i, "d": float(i)} for i in range(1000)]
    picked = downsample(samples, max_points=100)
    assert len(picked) == 101
    assert picked[0]["t"] == 0
    assert picked[-1]["t"] == 999


def test_gas_for() -> None:
    assert gas_for(None, None) == "air"
    assert gas_for(21, None) == "air"
    assert gas_for(32, None) == "nitrox"
    assert gas_for(18, 45) == "trimix"
