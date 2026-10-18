from datetime import date
from pathlib import Path

from httpx import AsyncClient

from divelog_server.importers.shearwater import gas_of, parse_shearwater
from divelog_server.store.store import Store

FIXTURE = Path(__file__).parent / "fixtures" / "perdix_sample.xml"


def test_parse_perdix_export() -> None:
    dive = parse_shearwater(FIXTURE.read_bytes())
    assert dive.number == 11
    assert dive.time_in == "10:02" and dive.time_out == "10:57"
    assert dive.max_depth_m == 28.6 and dive.duration_min == 54.8
    assert dive.gf == "55/85" and dive.deco_model == "ZHL-16C GF"
    assert dive.t_s == [0, 10, 20, 30, 40]
    assert dive.sample_interval_s == 10
    assert dive.gas_switches == [[0, "32"], [40, "99"]]
    assert gas_of(dive) == ("nitrox", 32, 0)
    profile = dive.profile()
    assert profile["temp_min_c"] == 18 and profile["deco"] is False
    assert profile["source"] == "Perdix DEADBEEF"


def test_rejects_other_xml() -> None:
    try:
        parse_shearwater(b"<divelog><dive/></divelog>")
    except ValueError as exc:
        assert "Shearwater" in str(exc)
    else:
        raise AssertionError("expected a ValueError")


async def test_import_creates_draft_then_attaches(owner_client: AsyncClient, store: Store) -> None:
    files = [("files", ("perdix_sample.xml", FIXTURE.read_bytes(), "application/xml"))]
    first = await owner_client.post("/api/v1/admin/import/shearwater", files=files)
    assert first.status_code == 200, first.text
    assert first.json()["created"] == [5]
    draft = store.dives[5]
    assert draft.visibility == "draft" and draft.computer == [11]
    assert draft.time_in == "10:02" and draft.gas == "nitrox"
    assert (store.root / draft.profiles[0]).exists()
    public = await owner_client.get("/api/v1/dive/dives/5")
    assert len(public.json()["profile"]) == 5
    assert public.json()["profile_meta"]["gf"] == "55/85"

    again = await owner_client.post("/api/v1/admin/import/shearwater", files=files)
    assert again.json()["skipped"] == 1

    imports = (await owner_client.get("/api/v1/admin/imports")).json()
    assert imports[0]["format"] == "shearwater-xml"


async def test_import_attaches_to_matching_dive(owner_client: AsyncClient, store: Store) -> None:
    dive = store.dives[1].model_copy(update={"date": date(2019, 5, 14), "time_in": "10:10"})
    await store.save_dive(dive, "move dive 1 to the perdix day")
    files = [("files", ("perdix_sample.xml", FIXTURE.read_bytes(), "application/xml"))]
    result = await owner_client.post("/api/v1/admin/import/shearwater", files=files)
    assert result.json()["updated"] == [1] and result.json()["created"] == []
    assert store.dives[1].computer == [11]
    assert store.dives[1].profiles
