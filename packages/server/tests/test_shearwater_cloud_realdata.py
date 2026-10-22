"""Dry-run a real Shearwater Cloud database against a copy of a real log.

Local only: set ``DIVELOG_SW_CLOUD_DB`` to a ``dive_data.db`` and ``DIVELOG_CONTENT_ROOT`` to a
log repository that already holds every dive of that database. The log's dives, profiles and
the records they refer to are copied into the test's temporary directory, so the original is
never written. The dry run must create nothing; every dive that is not ``have`` is printed
with the reason. The scenarios then take dives out of the copy and import them again: two
hand-logged dives that lost their profiles, a dive the computer split into #13 and #14, and
computer dives the owner logged as several dives (603, 610 and 614).
"""

import json
import os
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from divelog_server.core import deps
from divelog_server.core.config import get_settings
from divelog_server.services import storage as storage_service
from divelog_server.store.store import Store

CLOUD_DB = os.environ.get("DIVELOG_SW_CLOUD_DB")
CONTENT = os.environ.get("DIVELOG_CONTENT_ROOT")
COPIED = ("dives", "profiles", "sites", "people", "regions", "gear", "trips")
URL = "/api/v1/admin/import/shearwater-cloud"

pytestmark = pytest.mark.skipif(
    not (CLOUD_DB and CONTENT), reason="needs DIVELOG_SW_CLOUD_DB and DIVELOG_CONTENT_ROOT"
)


@pytest.fixture
def content_copy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A copy of the real log's records as ``DATA_ROOT``, without its commons or media."""
    assert CONTENT
    root = tmp_path / "content"
    root.mkdir()
    for name in COPIED:
        if (Path(CONTENT) / name).is_dir():
            shutil.copytree(Path(CONTENT) / name, root / name)
    monkeypatch.setenv("DATA_ROOT", str(root))
    monkeypatch.delenv("COMMONS_ROOT", raising=False)
    get_settings.cache_clear()
    deps.reset_store()
    storage_service.reset_storage()
    return root


async def test_real_export_creates_nothing(
    content_copy: Path, owner_client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    assert CLOUD_DB
    files = {"file": ("dive_data.db", Path(CLOUD_DB).read_bytes(), "application/octet-stream")}
    response = await owner_client.post(
        "/api/v1/admin/import/shearwater-cloud", params={"dry_run": "true"}, files=files
    )
    assert response.status_code == 200, response.text
    body = response.json()
    store = deps.get_store()
    counts = Counter(row["status"] for row in body["dives"])
    lines = [f"{body['dives_in_file']} dives: {dict(sorted(counts.items()))}"]
    for row in body["dives"]:
        if row["status"] == "have":
            continue
        reason = row["error"] or ""
        if row["status"] == "attach":
            dive = store.dives[row["dive_number"]]
            by = "number" if row["computer_no"] in dive.computer else "time"
            reason = f"log dive #{dive.number} {dive.date} {dive.time_in}, matched by {by}"
        if row["status"] == "new":
            reason = f"no log dive with the number or within 10 min, would be #{row['dive_number']}"
        lines.append(f"  #{row['computer_no']} {row['start']} {row['status']}: {reason}")
    with capsys.disabled():
        print("\n" + "\n".join(lines))
    assert body["created"] == []


async def cloud_import(client: AsyncClient, **params: Any) -> dict[str, Any]:
    """Post the real database to the Cloud import."""
    assert CLOUD_DB
    files = {"file": ("dive_data.db", Path(CLOUD_DB).read_bytes(), "application/octet-stream")}
    response = await client.post(URL, params=params, files=files)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def strip_computer(store: Store, number: int, **fields: Any) -> None:
    """Make a log dive hand-logged: no profiles or computer numbers, and ``fields`` changed."""
    dive = store.dives[number]
    for relative in dive.profiles:
        (store.root / relative).unlink()
    update = {"computer": [], "profiles": [], **fields}
    await store.save_dive(dive.model_copy(update=update), f"strip dive {number}")


async def test_real_export_ticks_nothing_when_all_is_have(
    content_copy: Path, owner_client: AsyncClient
) -> None:
    body = await cloud_import(owner_client, dry_run="true")
    assert {row["status"] for row in body["dives"]} == {"have"}
    assert not any(row["selected"] for row in body["dives"])


async def test_hand_logged_dives_are_attached_and_linked(
    content_copy: Path, owner_client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    store = deps.get_store()
    await strip_computer(store, 673, time_in="09:20")
    await strip_computer(store, 674)
    typed = {n: store.dives[n].model_copy(deep=True) for n in (673, 674)}

    dry = await cloud_import(owner_client, dry_run="true", clock_offset_min=420)
    rows = {row["computer_no"]: row for row in dry["dives"]}
    assert (rows[674]["status"], rows[674]["dive_number"]) == ("attach", 674)
    assert rows[673]["status"] == "new" and rows[673]["suggested"] == 673
    assert [c["number"] for c in rows[673]["candidates"]] == [673]
    assert rows[673]["selected"] and rows[674]["selected"]
    others = [row for n, row in rows.items() if n not in (673, 674)]
    assert {row["status"] for row in others} == {"have"}

    body = await cloud_import(owner_client, clock_offset_min=420, link="673:673")
    assert body["created"] == [] and sorted(body["updated"]) == [673, 674]
    store = deps.get_store()
    for number in (673, 674):
        dive = store.dives[number]
        assert dive.computer == [number] and len(dive.profiles) == 1
        assert (store.root / dive.profiles[0]).is_file()
        for field in ("time_in", "time_out", "avg_depth_m", "water_temp_c", "max_depth_m"):
            assert getattr(dive, field) == getattr(typed[number], field), (number, field)
    candidate = rows[673]["candidates"][0]
    with capsys.disabled():
        print(
            f"\n#674 attach {rows[674]['start']}; #673 new {rows[673]['start']}, "
            f"candidate {candidate}, suggested {rows[673]['suggested']}; "
            f"commit updated {body['updated']}, 673 time_in {store.dives[673].time_in}"
        )


async def test_split_dive_is_joined_again(
    content_copy: Path, owner_client: AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    """Join #13 and #14 again; the stored profile came from older exports, so its dive time
    may differ from the parts' sum in the last digit."""
    assert CONTENT
    original = json.loads((Path(CONTENT) / "profiles" / "profile_00013.json").read_text())
    store = deps.get_store()
    holder = next(d for d in store.dives.values() if d.computer == [13, 14])
    await store.delete_dive(holder.number, f"remove dive {holder.number}")

    dry = await cloud_import(owner_client, dry_run="true")
    rows = {row["computer_no"]: row for row in dry["dives"]}
    assert rows[13]["status"] == rows[14]["status"] == "new"
    surfaced = rows[14]["surface_before_min"]
    parts = round(rows[13]["duration_min"] + rows[14]["duration_min"], 1)

    body = await cloud_import(owner_client, join="13+14", only="13,14")
    assert len(body["created"]) == 1 and body["updated"] == []
    rows = {row["computer_no"]: row for row in body["dives"]}
    number = body["created"][0]
    assert rows[13]["dive_number"] == rows[14]["dive_number"] == number
    assert rows[14]["joined_to"] == 13
    dive = deps.get_store().dives[number]
    assert dive.computer == [13, 14] and len(dive.profiles) == 1
    profile = json.loads((content_copy / dive.profiles[0]).read_text())
    assert profile["computer_records"] == [13, 14]
    assert profile["max_depth_m"] == original["max_depth_m"]
    assert profile["duration_min"] == parts
    assert round(abs(profile["duration_min"] - original["duration_min"]), 1) <= 0.1
    with capsys.disabled():
        print(
            f"\njoin 13+14 (surfaced {surfaced} min) -> draft #{number} {dive.date} "
            f"{dive.time_in}-{dive.time_out}, max {profile['max_depth_m']} m, "
            f"{profile['duration_min']} min, breaks {profile['surface_breaks']}; stored "
            f"profile_00013: max {original['max_depth_m']} m, {original['duration_min']} min, "
            f"breaks {original['surface_breaks']}"
        )


SPLIT_LOGS = {603: [599, 600], 610: [606, 607], 614: [611, 612, 613]}
CLOSE_MIN = 2


def minutes_between(earlier: str, later: str) -> int:
    """Whole minutes from one ``HH:MM`` to another."""
    apart = datetime.strptime(later, "%H:%M") - datetime.strptime(earlier, "%H:%M")
    return round(apart.total_seconds() / 60)


@pytest.mark.parametrize("computer_no", sorted(SPLIT_LOGS))
async def test_dive_logged_as_several_dives_is_split_again(
    content_copy: Path,
    owner_client: AsyncClient,
    capsys: pytest.CaptureFixture[str],
    computer_no: int,
) -> None:
    """Strip the parts' profiles and computer number, then split the computer dive again.

    The stored profiles were cut by hand: each part ends at the last sample before the break
    and the last one keeps the computer's surface tail, so its ``time_out`` is later than the
    dive's end, which the import uses.
    """
    store = deps.get_store()
    numbers = SPLIT_LOGS[computer_no]
    old = {}
    for number in numbers:
        relative = store.dives[number].profiles[0]
        old[number] = json.loads((content_copy / relative).read_text())
        await strip_computer(store, number)

    dry = await cloud_import(owner_client, dry_run="true")
    rows = {row["computer_no"]: row for row in dry["dives"]}
    row = rows[computer_no]
    assert row["status"] in ("new", "attach") and row["selected"]
    suggested = [b for b in row["breaks"] if b["suggested"]]
    assert len(suggested) == len(numbers) - 1
    others = [r for n, r in rows.items() if n != computer_no]
    assert {r["status"] for r in others} == {"have"}

    split = ",".join(f"{computer_no}@{b['start_s']}" for b in suggested)
    planned = await cloud_import(owner_client, dry_run="true", split=split)
    parts = {row["computer_no"]: row for row in planned["dives"]}[computer_no]["parts"]
    assert [(p["status"], p["dive_number"]) for p in parts] == [("attach", n) for n in numbers]

    body = await cloud_import(owner_client, split=split, only=str(computer_no))
    assert body["created"] == [] and body["updated"] == numbers
    store = deps.get_store()
    lines = [f"\n#{computer_no} {row['start']}: breaks {row['breaks']}"]
    for number in numbers:
        dive = store.dives[number]
        assert dive.computer == [computer_no] and len(dive.profiles) == 1
        profile = json.loads((content_copy / dive.profiles[0]).read_text())
        assert profile["computer_records"] == [computer_no]
        before = old[number]
        assert abs(minutes_between(before["time_in"], profile["time_in"])) <= CLOSE_MIN
        if number != numbers[-1]:
            assert abs(minutes_between(before["time_out"], profile["time_out"])) <= CLOSE_MIN
        else:
            assert minutes_between(profile["time_out"], before["time_out"]) >= -CLOSE_MIN
        lines.append(
            f"  dive #{number}: {profile['time_in']}-{profile['time_out']} "
            f"{profile['duration_min']} min {profile['max_depth_m']} m; stored profile "
            f"{before['time_in']}-{before['time_out']} {before['duration_min']} min "
            f"{before['max_depth_m']} m"
        )
    again = await cloud_import(owner_client, dry_run="true")
    assert {row["status"] for row in again["dives"]} == {"have"}
    with capsys.disabled():
        print("\n".join(lines))
