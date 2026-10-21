"""The Shearwater Cloud import: reading the export, matching its dives and importing them."""

import io
import json
import sqlite3
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient, Response

from divelog_server.core.config import get_settings
from divelog_server.importers import shearwater_cloud
from divelog_server.importers.shearwater_cloud import open_export
from divelog_server.services.storage import get_storage
from divelog_server.store.models import DiveRecord
from divelog_server.store.store import Store
from tests import pnf_builder as pnf
from tests.test_editor_dives import record_commits

URL = "/api/v1/admin/import/shearwater-cloud"
SERIAL = 0x344FDE85
START = datetime(2025, 3, 1, 9, 30)
DAY = START.date()
PERDIX_XML = Path(__file__).parent / "fixtures" / "perdix_sample.xml"


@dataclass
class Log:
    """One ``log_data`` row of a test database."""

    blob: bytes
    serial: str = "344FDE85"
    file_name: str = ""
    logged_at: datetime = START
    format: str = "sw-pnf"


def pnf_log(
    *,
    number: int = 7,
    start: datetime = START,
    serial: int = SERIAL,
    depths: Sequence[float] = (0.0, 6.0, 18.5, 12.0, 4.0, 0.0, 0.0),
    o2: int = 32,
) -> bytes:
    """A Perdix AI dive as a Shearwater Cloud blob, ten seconds between samples."""
    duration_s = 10 * (len(depths) - 2)
    records = [
        pnf.opening0(number=number, start=start, o2=(o2,)),
        pnf.opening1(serial=serial),
        pnf.opening2(),
        pnf.opening3(),
        pnf.opening4(),
        pnf.opening5(),
        *(pnf.sample(depth=depth, o2=o2) for depth in depths),
        pnf.closing0(
            max_depth=max(depths),
            duration_s=duration_s,
            end=start + timedelta(seconds=duration_s),
        ),
        pnf.final(serial=serial),
    ]
    return pnf.blob(records)


def cloud_db(tmp_path: Path, dives: Sequence[bytes | Log] = (), *, tables: bool = True) -> bytes:
    """A real Shearwater Cloud SQLite database with the given dive logs, as bytes."""
    path = tmp_path / f"dive_data-{uuid4().hex[:8]}.db"
    connection = sqlite3.connect(path)
    try:
        if tables:
            connection.execute(
                "CREATE TABLE log_data (log_id varchar primary key not null, file_name varchar,"
                " format varchar, data_bytes_1 blob)"
            )
            connection.execute(
                "CREATE TABLE dive_details (DiveId varchar primary key not null,"
                " SerialNumber varchar, DiveDate datetime, DiveNumber varchar)"
            )
        else:
            connection.execute("CREATE TABLE notes (id integer primary key, body text)")
        for index, entry in enumerate(dives):
            log = entry if isinstance(entry, Log) else Log(entry)
            log_id = str(723431761786175000 + index)
            connection.execute(
                "INSERT INTO log_data VALUES (?, ?, ?, ?)",
                (log_id, log.file_name or f"Perdix AI[{log.serial}]#{index}", log.format, log.blob),
            )
            connection.execute(
                "INSERT INTO dive_details VALUES (?, ?, ?, ?)",
                (log_id, log.serial, f"{log.logged_at:%Y-%m-%d %H:%M:%S}", str(900 + index)),
            )
        connection.commit()
    finally:
        connection.close()
    return path.read_bytes()


def cloud_zip(database: bytes | None, *, extra: dict[str, bytes] | None = None) -> bytes:
    """The mobile app's *Export account* ZIP around ``database``, with its sync report."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("SyncReport.txt", "Sync complete\n")
        for name, data in (extra or {}).items():
            archive.writestr(name, data)
        if database is not None:
            archive.writestr("shearwater@example.org/dive_data.db", database)
    return buffer.getvalue()


async def upload(
    client: AsyncClient, data: bytes, name: str = "export.zip", **params: Any
) -> Response:
    """Post an export to the Cloud import."""
    files = {"file": (name, data, "application/octet-stream")}
    return await client.post(URL, params=params, files=files)


async def preview(client: AsyncClient, data: bytes, **params: Any) -> dict[str, Any]:
    """The dry run of an export."""
    response = await upload(client, data, dry_run="true", **params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def add_dive(
    store: Store,
    number: int,
    *,
    day: date = DAY,
    time_in: str | None = "14:00",
    computer: Sequence[int] = (),
    profiles: dict[str, dict[str, Any]] | None = None,
    **fields: Any,
) -> DiveRecord:
    """Put a dive in the log, with profile files written from ``profiles``."""
    paths = [store.save_profile(name, payload) for name, payload in (profiles or {}).items()]
    dive = DiveRecord(
        number=number,
        date=day,
        time_in=time_in,
        computer=list(computer),
        profiles=paths,
        **({"duration_min": 40, "max_depth_m": 18} | fields),
    )
    await store.save_dive(dive, f"add dive {number}")
    return dive


def statuses(body: dict[str, Any]) -> dict[int, tuple[str, int | None]]:
    """``{computer_no: (status, dive_number)}`` of a result."""
    return {row["computer_no"]: (row["status"], row["dive_number"]) for row in body["dives"]}


def use_legacy_serial(monkeypatch: pytest.MonkeyPatch, serial: str) -> None:
    """Set ``SHEARWATER_LEGACY_SERIAL`` for this test."""
    monkeypatch.setenv("SHEARWATER_LEGACY_SERIAL", serial)
    get_settings.cache_clear()


# ── container ───────────────────────────────────────────────────────────────


def test_reader_lists_the_dives_of_a_database(tmp_path: Path) -> None:
    db = cloud_db(tmp_path, [pnf_log(number=7), pnf_log(number=8, start=START.replace(hour=12))])
    dives = list(open_export(db).dives())
    assert [(d.serial, d.computer_no, d.model) for d in dives] == [
        ("344FDE85", 7, "Perdix AI"),
        ("344FDE85", 8, "Perdix AI"),
    ]
    assert all(d.dive is not None and d.error is None for d in dives)


def test_reader_skips_other_formats(tmp_path: Path) -> None:
    db = cloud_db(tmp_path, [pnf_log(), Log(b"<xml/>", format="sw-xml")])
    assert len(list(open_export(db).dives())) == 1


async def test_zip_export_is_read(owner_client: AsyncClient, tmp_path: Path) -> None:
    body = await preview(owner_client, cloud_zip(cloud_db(tmp_path, [pnf_log()])))
    assert body["dives_in_file"] == 1 and statuses(body) == {7: ("new", 5)}


async def test_bare_database_is_read(owner_client: AsyncClient, tmp_path: Path) -> None:
    response = await upload(
        owner_client, cloud_db(tmp_path, [pnf_log()]), "dive_data.db", dry_run="true"
    )
    assert response.status_code == 200, response.text
    assert statuses(response.json()) == {7: ("new", 5)}


@pytest.mark.parametrize(
    ("make", "reason"),
    [
        (lambda tmp: cloud_zip(None), "no Shearwater Cloud database"),
        (lambda tmp: cloud_db(tmp, tables=False), "no log_data and dive_details"),
        (lambda tmp: cloud_zip(cloud_db(tmp, tables=False)), "no Shearwater Cloud database"),
        (lambda tmp: b"PK\x03\x04" + b"\x00" * 200, "corrupt ZIP"),
        (lambda tmp: cloud_zip(cloud_db(tmp, [pnf_log()]))[:-40], "corrupt ZIP"),
        (lambda tmp: b"SQLite format 3\x00" + b"\xff" * 200, "unreadable database"),
        (lambda tmp: b"just some text", "not a ZIP or SQLite file"),
    ],
)
async def test_unusable_exports_are_refused(
    owner_client: AsyncClient, tmp_path: Path, make: Any, reason: str
) -> None:
    response = await upload(owner_client, make(tmp_path), dry_run="true")
    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert detail.startswith("Could not read export: ") and reason in detail


async def test_oversized_member_is_refused(
    owner_client: AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(shearwater_cloud, "MAX_MEMBER_BYTES", 1024)
    response = await upload(owner_client, cloud_zip(cloud_db(tmp_path, [pnf_log()])))
    assert response.status_code == 400 and "limit" in response.json()["detail"]


def test_member_lying_about_its_size_is_cut_off(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(shearwater_cloud, "MAX_MEMBER_BYTES", 4096)
    monkeypatch.setattr(shearwater_cloud, "CHUNK_BYTES", 512)
    member = io.BytesIO(b"x" * 10_000)
    with pytest.raises(ValueError, match="limit"):
        shearwater_cloud._read_bounded(member, b"")


async def test_nested_zip_is_ignored(owner_client: AsyncClient, tmp_path: Path) -> None:
    inner = cloud_zip(cloud_db(tmp_path, [pnf_log()]))
    response = await upload(owner_client, cloud_zip(None, extra={"inner.zip": inner}))
    assert response.status_code == 400
    assert "no Shearwater Cloud database" in response.json()["detail"]


async def test_only_the_first_twenty_members_are_inspected(
    owner_client: AsyncClient, tmp_path: Path
) -> None:
    filler = {f"photo-{k}.jpg": b"jpeg" for k in range(25)}
    response = await upload(
        owner_client, cloud_zip(cloud_db(tmp_path, [pnf_log()]), extra=filler), dry_run="true"
    )
    assert response.status_code == 400


# ── classify ────────────────────────────────────────────────────────────────


async def test_unknown_dive_is_new(owner_client: AsyncClient, tmp_path: Path) -> None:
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    row = body["dives"][0]
    assert row["status"] == "new" and row["dive_number"] == 5
    assert row["serial"] == "344FDE85" and row["model"] == "Perdix AI"
    assert row["start"] == row["computer_start"] == "2025-03-01T09:30:00"
    assert row["max_depth_m"] == 18.5 and row["duration_min"] == 0.8
    assert row["error"] is None
    assert body["created"] == [5] and body["first_date"] == body["last_date"] == "2025-03-01"


async def test_dive_with_the_number_but_no_profile_is_attach(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, day=date(2025, 2, 1), computer=[7])
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert statuses(body) == {7: ("attach", 20)} and body["updated"] == [20]


async def test_dive_at_the_same_time_is_attach(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="09:38")
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert statuses(body) == {7: ("attach", 20)}


async def test_dive_outside_the_window_is_new(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="09:41")
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert statuses(body) == {7: ("new", 21)}


async def test_dive_with_the_number_and_a_profile_is_have(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(
        store, 20, computer=[7], profiles={"profile_00020.json": {"source": "Perdix AI 344FDE85"}}
    )
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert statuses(body) == {7: ("have", 20)} and body["skipped"] == 1
    assert body["created"] == [] and body["updated"] == []


async def test_joined_numbers_are_have(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, computer=[13, 14], profiles={"profile_00020.json": {}})
    logs = [pnf_log(number=13), pnf_log(number=14, start=START + timedelta(minutes=50))]
    body = await preview(owner_client, cloud_db(tmp_path, logs))
    assert statuses(body) == {13: ("have", 20), 14: ("have", 20)}


async def test_log_split_into_several_dives_is_have(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 30, computer=[7], profiles={"profile_00030_1.json": {}})
    await add_dive(store, 31, computer=[7], profiles={"profile_00030_2.json": {}})
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert statuses(body) == {7: ("have", 30)}


async def test_clock_offset_turns_new_into_attach(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="16:30")
    db = cloud_db(tmp_path, [pnf_log()])
    assert statuses(await preview(owner_client, db)) == {7: ("new", 21)}
    body = await preview(owner_client, db, clock_offset_min=420)
    assert statuses(body) == {7: ("attach", 20)}
    row = body["dives"][0]
    assert row["start"] == "2025-03-01T16:30:00"
    assert row["computer_start"] == "2025-03-01T09:30:00"


async def test_same_number_from_another_computer_is_new(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(
        store, 20, computer=[7], profiles={"profile_00020.json": {"source": "Perdix DEADBEEF"}}
    )
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert statuses(body) == {7: ("new", 21)}


@pytest.mark.parametrize(
    ("legacy", "status"), [("", "have"), ("344FDE85", "have"), ("DEADBEEF", "new")]
)
async def test_profiles_without_a_serial_use_the_legacy_serial(
    owner_client: AsyncClient,
    store: Store,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    legacy: str,
    status: str,
) -> None:
    use_legacy_serial(monkeypatch, legacy)
    await add_dive(store, 20, computer=[7], profiles={"profile_00020.json": {"computer_no": 7}})
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert body["dives"][0]["status"] == status


# ── import ──────────────────────────────────────────────────────────────────


async def test_dry_run_writes_nothing_and_lists_every_dive(
    owner_client: AsyncClient, store: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    await add_dive(store, 20, day=date(2025, 3, 2), time_in="09:30")
    await add_dive(store, 21, computer=[9], profiles={"profile_00021.json": {}})
    commits = record_commits(store, monkeypatch)
    logs = [
        pnf_log(number=9, start=START + timedelta(hours=3)),
        pnf_log(number=8, start=START + timedelta(days=1)),
        pnf_log(number=7),
    ]
    body = await preview(owner_client, cloud_db(tmp_path, logs))
    assert [row["computer_no"] for row in body["dives"]] == [7, 9, 8]
    assert statuses(body) == {7: ("new", 22), 9: ("have", 21), 8: ("attach", 20)}
    assert body["dry_run"] is True and body["import_id"] == ""
    assert body["created"] == [22] and body["updated"] == [20] and body["skipped"] == 1
    assert body["dives_in_file"] == 3 and body["last_date"] == "2025-03-02"
    assert commits == [] and store.imports == {} and 22 not in store.dives
    assert store.dives[20].computer == [] and not (tmp_path / "media").exists()


async def test_import_creates_a_draft_with_profile_flag_and_raw_log(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    raw = pnf_log(o2=32)
    response = await upload(owner_client, cloud_db(tmp_path, [raw]), clock_offset_min=-90)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == [5] and statuses(body) == {7: ("new", 5)}
    dive = store.dives[5]
    assert dive.visibility == "draft" and dive.computer == [7]
    assert dive.date == date(2025, 3, 1) and dive.time_in == "08:00"
    assert dive.gas == "nitrox" and dive.o2_pct == 32 and dive.max_depth_m == 18.5
    assert dive.flags == ["time corrected by -1 h 30 min (was 09:30)"]
    assert dive.import_id == body["import_id"] and dive.profiles == ["profiles/profile_00005.json"]
    profile = json.loads((store.root / dive.profiles[0]).read_text())
    assert profile["log_dive_no"] == 5 and profile["time_in"] == "08:00"
    assert profile["source"] == "Perdix AI 344FDE85" and profile["sample_interval_s"] == 10
    record = store.imports[body["import_id"]]
    assert record.format == "shearwater-cloud" and record.original_name == "export.zip"
    assert record.storage_key.startswith("imports/")
    assert record.storage_key.endswith(f"/{body['import_id']}-344FDE85-7.swlog")
    assert await get_storage().get(record.storage_key) == raw


async def test_import_attaches_profile_and_number(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="16:35")
    response = await upload(owner_client, cloud_db(tmp_path, [pnf_log()]), clock_offset_min=420)
    body = response.json()
    assert body["updated"] == [20] and body["created"] == []
    dive = store.dives[20]
    assert dive.computer == [7] and dive.profiles == ["profiles/profile_00020.json"]
    assert dive.flags == ["time corrected by +7 h (was 09:30)"]
    assert dive.visibility == "public" and dive.import_id == body["import_id"]
    profile = json.loads((store.root / dive.profiles[0]).read_text())
    assert profile["log_dive_no"] == 20 and profile["time_in"] == "16:30"


async def test_taken_profile_name_gets_the_computer_number(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    store.save_profile("profile_00005.json", {"keep": True})
    await upload(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert store.dives[5].profiles == ["profiles/profile_00005_7.json"]
    assert json.loads((store.root / "profiles/profile_00005.json").read_text()) == {"keep": True}


async def test_only_restricts_the_import(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="09:31")
    logs = [
        pnf_log(number=7),
        pnf_log(number=8, start=START + timedelta(hours=2)),
        pnf_log(number=9, start=START + timedelta(hours=4)),
    ]
    response = await upload(owner_client, cloud_db(tmp_path, logs), only="9, 42,x")
    body = response.json()
    assert body["created"] == [21] and body["updated"] == []
    assert statuses(body) == {7: ("attach", 20), 8: ("new", None), 9: ("new", 21)}
    assert store.dives[21].computer == [9] and store.dives[20].computer == []


@pytest.mark.parametrize("only", ["", "  ", ",", " , ,"])
async def test_empty_only_imports_every_dive(
    owner_client: AsyncClient, store: Store, tmp_path: Path, only: str
) -> None:
    await add_dive(store, 20, time_in="09:31")
    logs = [pnf_log(number=7), pnf_log(number=8, start=START + timedelta(hours=2))]
    body = (await upload(owner_client, cloud_db(tmp_path, logs), only=only)).json()
    assert body["updated"] == [20] and body["created"] == [21]
    assert statuses(body) == {7: ("attach", 20), 8: ("new", 21)}


async def test_second_upload_creates_nothing(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    db = cloud_db(tmp_path, [pnf_log(number=7), pnf_log(number=8, start=START.replace(hour=13))])
    first = (await upload(owner_client, db)).json()
    assert first["created"] == [5, 6]
    second = (await upload(owner_client, db)).json()
    assert second["created"] == [] and second["updated"] == [] and second["skipped"] == 2
    assert statuses(second) == {7: ("have", 5), 8: ("have", 6)}
    assert sorted(store.dives) == [1, 2, 3, 4, 5, 6]


async def test_bad_log_is_reported_and_the_rest_imports(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    bad = Log(
        pnf.blob([b"\xff\xff" + bytes(pnf.RECORD - 2)]),
        file_name="Perdix AI[344FDE85]#6 2025-2-28 9-0-0.swlogzp",
        logged_at=datetime(2025, 2, 28, 9, 0),
    )
    response = await upload(owner_client, cloud_db(tmp_path, [pnf_log(), bad]))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == [5] and body["dives_in_file"] == 2
    error = body["dives"][0]
    assert error["status"] == "error" and error["computer_no"] == 6
    assert error["dive_number"] is None and error["start"] == "2025-02-28T09:00:00"
    assert "Predator" in error["error"] and error["model"] == "Perdix AI"
    assert body["first_date"] == "2025-02-28"


async def test_imports_list_shows_the_cloud_format(
    owner_client: AsyncClient, tmp_path: Path
) -> None:
    await upload(owner_client, cloud_zip(cloud_db(tmp_path, [pnf_log()])), "account.zip")
    imports = (await owner_client.get("/api/v1/admin/imports")).json()
    assert imports[0]["format"] == "shearwater-cloud"
    assert imports[0]["original_name"] == "account.zip"
    assert imports[0]["url"].endswith("-344FDE85-7.swlog") and imports[0]["created"] == [5]


async def test_split_dive_imports_as_one_dive(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    second_start = START + timedelta(minutes=5)
    parts = [pnf_log(start=second_start, depths=(0.0, 9.0, 3.0, 0.0)), pnf_log()]
    response = await upload(owner_client, cloud_db(tmp_path, parts))
    body = response.json()
    assert body["dives_in_file"] == 1 and body["created"] == [5]
    assert body["dives"][0]["duration_min"] == 1.1
    profile = json.loads((store.root / store.dives[5].profiles[0]).read_text())
    assert profile["computer_records"] == [7, 7] and profile["surface_breaks"] == [[50, 300]]
    key = store.imports[body["import_id"]].storage_key
    assert key.endswith("-344FDE85-7-1.swlog")
    assert await get_storage().get(key) == parts[1]
    assert await get_storage().get(key.replace("-1.swlog", "-2.swlog")) == parts[0]


# ── preview: ticks, candidates and suggestion ───────────────────────────────

THIS = {"source": "Perdix AI 344FDE85"}
OTHER = {"source": "Perdix DEADBEEF"}


def by_number(body: dict[str, Any]) -> dict[int, dict[str, Any]]:
    """The rows of a result by computer number."""
    return {row["computer_no"]: row for row in body["dives"]}


def at(hours: float) -> datetime:
    """``START`` moved by ``hours``."""
    return START + timedelta(hours=hours)


async def test_only_dives_newer_than_the_newest_have_are_ticked(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, computer=[8], profiles={"profile_00020.json": THIS})
    await add_dive(store, 22, time_in="07:31")
    logs = [
        pnf_log(number=6, start=at(-2)),
        pnf_log(number=7),
        pnf_log(number=8, start=at(1)),
        pnf_log(number=9, start=at(3)),
    ]
    body = await preview(owner_client, cloud_db(tmp_path, logs))
    assert statuses(body) == {6: ("attach", 22), 7: ("new", 23), 8: ("have", 20), 9: ("new", 24)}
    assert {n: row["selected"] for n, row in by_number(body).items()} == {
        6: True,
        7: False,
        8: False,
        9: True,
    }


async def test_first_import_ticks_every_new_dive(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 30, computer=[30], profiles={"profile_00030.json": OTHER})
    bad = Log(
        pnf.blob([b"\xff\xff" + bytes(pnf.RECORD - 2)]),
        file_name="Perdix AI[344FDE85]#6 2025-3-1 8-0-0.swlogzp",
        logged_at=at(-1.5),
    )
    logs = [
        pnf_log(number=7),
        pnf_log(number=8, start=at(2)),
        bad,
        Log(pnf_log(number=30, start=at(5), serial=0xDEADBEEF), serial="DEADBEEF"),
    ]
    body = await preview(owner_client, cloud_db(tmp_path, logs))
    rows = by_number(body)
    assert rows[30]["status"] == "have" and rows[6]["status"] == "error"
    assert {n: row["selected"] for n, row in rows.items()} == {
        6: False,
        7: True,
        8: True,
        30: False,
    }


async def test_candidates_are_same_day_dives_without_a_profile_from_this_computer(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="10:30", site_name_raw="Somewhere")
    await add_dive(store, 21, time_in=None)
    await add_dive(store, 22, time_in="09:50", computer=[99], profiles={"p22.json": THIS})
    await add_dive(store, 23, time_in="08:50", profiles={"p23.json": OTHER}, site="zeelandbrug")
    await add_dive(store, 24, day=date(2025, 3, 2), time_in="09:30")
    await add_dive(store, 25, time_in="13:32")
    await add_dive(store, 26, time_in="10:10", max_depth_m=31.5)
    logs = [pnf_log(number=7), pnf_log(number=8, start=at(4))]
    body = await preview(owner_client, cloud_db(tmp_path, logs))
    rows = by_number(body)
    assert rows[8]["status"] == "attach" and rows[8]["candidates"] == []
    assert rows[8]["suggested"] is None
    found = rows[7]["candidates"]
    assert [(c["number"], c["minutes_apart"]) for c in found] == [
        (23, 40),
        (26, 40),
        (20, 60),
        (21, None),
    ]
    assert found[0] == {
        "number": 23,
        "date": "2025-03-01",
        "time_in": "08:50",
        "site": "Zeelandbrug",
        "max_depth_m": 18.0,
        "minutes_apart": 40,
    }
    assert found[1]["site"] is None and found[1]["max_depth_m"] == 31.5
    assert found[2]["site"] == "Somewhere" and found[3]["time_in"] is None
    assert rows[7]["suggested"] is None


@pytest.mark.parametrize(
    ("times", "suggested"),
    [
        (["11:00"], 20),
        (["09:50", "11:00"], 20),
        (["11:00", "09:50"], 21),
        (["09:50", "10:00"], None),
        (["09:45", None], 20),
        (["10:35", "13:00"], None),
        ([None, None], None),
        ([], None),
    ],
)
async def test_suggestion_is_the_only_or_the_clearly_nearest_candidate(
    owner_client: AsyncClient,
    store: Store,
    tmp_path: Path,
    times: list[str | None],
    suggested: int | None,
) -> None:
    for number, time_in in enumerate(times, start=20):
        await add_dive(store, number, time_in=time_in)
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    row = body["dives"][0]
    assert row["status"] == "new" and row["suggested"] == suggested
    assert len(row["candidates"]) == len(times)


async def test_time_match_picks_the_nearest_dive(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="09:38")
    await add_dive(store, 21, time_in="09:27")
    await add_dive(store, 22, time_in="09:32")
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert statuses(body) == {7: ("attach", 22)}


async def test_surface_interval_is_counted_per_computer_and_day(
    owner_client: AsyncClient, tmp_path: Path
) -> None:
    logs = [
        pnf_log(number=7),
        pnf_log(number=8, start=START + timedelta(minutes=12, seconds=20)),
        Log(
            pnf_log(number=30, start=START + timedelta(minutes=20), serial=0xDEADBEEF),
            serial="DEADBEEF",
        ),
        pnf_log(number=9, start=at(24)),
    ]
    body = await preview(owner_client, cloud_db(tmp_path, logs))
    surface = {n: row["surface_before_min"] for n, row in by_number(body).items()}
    assert surface == {7: None, 8: 12, 30: None, 9: None}
    assert all(row["joined_to"] is None for row in body["dives"])


# ── link ────────────────────────────────────────────────────────────────────


async def test_link_shows_the_chosen_dive_in_the_dry_run(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="11:00")
    body = await preview(owner_client, cloud_db(tmp_path, [pnf_log()]), link="7:20")
    row = body["dives"][0]
    assert statuses(body) == {7: ("attach", 20)} and body["updated"] == [20]
    assert row["selected"] is True and row["candidates"] == [] and row["suggested"] is None
    assert store.dives[20].computer == []


async def test_link_attaches_the_profile_and_number(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="11:00")
    response = await upload(owner_client, cloud_db(tmp_path, [pnf_log()]), link="7:20")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated"] == [20] and body["created"] == []
    assert statuses(body) == {7: ("attach", 20)}
    dive = store.dives[20]
    assert dive.computer == [7] and dive.profiles == ["profiles/profile_00020.json"]
    assert dive.time_in == "11:00" and sorted(store.dives) == [1, 2, 3, 4, 20]


async def test_two_dives_can_link_to_one_dive(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="12:00")
    logs = [pnf_log(number=7), pnf_log(number=8, start=at(0.5))]
    body = (await upload(owner_client, cloud_db(tmp_path, logs), link="7:20,8:20")).json()
    assert body["updated"] == [20, 20] and statuses(body) == {7: ("attach", 20), 8: ("attach", 20)}
    dive = store.dives[20]
    assert dive.computer == [7, 8]
    assert dive.profiles == ["profiles/profile_00020.json", "profiles/profile_00020_8.json"]


@pytest.mark.parametrize(
    ("link", "reason"),
    [
        ("7:99", "Cannot link #7: dive #99 does not exist"),
        ("7:21", "Cannot link #7: dive #21 already has a profile from this computer"),
        ("9:20", "Cannot link #9: it is already dive #22"),
        ("8:20", "Cannot link #8: it already belongs to dive #23"),
        ("42:20", "Cannot link #42: it is not in this export"),
        ("6:20", "Cannot link #6: its log could not be read"),
        ("7:20,7:21", "Cannot link #7: it is linked more than once"),
    ],
)
async def test_impossible_links_are_refused(
    owner_client: AsyncClient,
    store: Store,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    link: str,
    reason: str,
) -> None:
    await add_dive(store, 20, time_in="16:00")
    await add_dive(store, 21, time_in="17:00", computer=[50], profiles={"p21.json": THIS})
    await add_dive(store, 22, computer=[9], profiles={"p22.json": THIS})
    await add_dive(store, 23, time_in="11:31")
    bad = Log(
        pnf.blob([b"\xff\xff" + bytes(pnf.RECORD - 2)]),
        file_name="Perdix AI[344FDE85]#6 2025-3-1 8-0-0.swlogzp",
    )
    logs = [pnf_log(number=7), pnf_log(number=8, start=at(2)), pnf_log(number=9, start=at(4)), bad]
    commits = record_commits(store, monkeypatch)
    response = await upload(owner_client, cloud_db(tmp_path, logs), link=link)
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == reason
    assert commits == [] and store.imports == {}


@pytest.mark.parametrize(
    "link", ["7", "7:", ":20", "a:20", "7:20;8:20", "7:20,", "7:20 ", "7:-20", "7:20:1"]
)
async def test_malformed_links_are_refused(
    owner_client: AsyncClient, tmp_path: Path, link: str
) -> None:
    response = await upload(owner_client, cloud_db(tmp_path, [pnf_log()]), link=link)
    assert response.status_code == 422


@pytest.mark.parametrize("link", ["7:99", "7:21", "7:20", "8:21,7:20"])
async def test_link_outside_only_is_ignored(
    owner_client: AsyncClient, store: Store, tmp_path: Path, link: str
) -> None:
    await add_dive(store, 20, time_in="16:00")
    await add_dive(store, 21, time_in="17:00", computer=[50], profiles={"p21.json": THIS})
    logs = [pnf_log(number=7), pnf_log(number=8, start=at(2))]
    response = await upload(owner_client, cloud_db(tmp_path, logs), only="9", link=link)
    assert response.status_code == 200, response.text
    body = response.json()
    assert statuses(body) == {7: ("new", None), 8: ("new", None)}
    assert body["created"] == body["updated"] == [] and store.dives[20].computer == []


# ── attach fills empty fields ───────────────────────────────────────────────


async def test_attach_fills_empty_fields_and_keeps_typed_ones(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, day=date(2025, 2, 1), time_in=None)
    await add_dive(
        store, 21, time_in="14:31", time_out="15:15", avg_depth_m=12.0, water_temp_c=17.0
    )
    logs = [pnf_log(number=7), pnf_log(number=8, start=at(4.5))]
    response = await upload(
        owner_client, cloud_db(tmp_path, logs), link="7:20", clock_offset_min=30
    )
    assert response.json()["updated"] == [20, 21]
    empty, typed = store.dives[20], store.dives[21]
    assert (empty.time_in, empty.time_out) == ("10:00", "10:00")
    assert empty.avg_depth_m == 10.1 and empty.water_temp_c == 20.0
    assert (typed.time_in, typed.time_out) == ("14:31", "15:15")
    assert typed.avg_depth_m == 12.0 and typed.water_temp_c == 17.0
    assert typed.computer == [8] and typed.profiles


async def test_xml_attach_fills_nothing(owner_client: AsyncClient, store: Store) -> None:
    await add_dive(store, 20, day=date(2019, 5, 14), time_in="10:05")
    files = [("files", ("perdix_sample.xml", PERDIX_XML.read_bytes(), "application/xml"))]
    body = (await owner_client.post("/api/v1/admin/import/shearwater", files=files)).json()
    assert body["updated"] == [20] and body["dives"] == []
    dive = store.dives[20]
    assert dive.computer == [11] and dive.profiles and dive.time_in == "10:05"
    assert dive.time_out is None and dive.avg_depth_m is None and dive.water_temp_c is None


# ── join ────────────────────────────────────────────────────────────────────


def joined_logs() -> list[bytes]:
    """Dives 13 and 14 with a quarter of an hour at the surface between them."""
    return [
        pnf_log(number=13),
        pnf_log(number=14, start=START + timedelta(minutes=15), depths=(0.0, 9.0, 3.0, 0.0)),
    ]


async def test_join_creates_one_draft_with_one_profile(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    response = await upload(owner_client, cloud_db(tmp_path, joined_logs()), join="13+14")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == [5] and body["updated"] == [] and body["dives_in_file"] == 2
    rows = by_number(body)
    assert statuses(body) == {13: ("new", 5), 14: ("new", 5)}
    assert rows[13]["joined_to"] is None and rows[14]["joined_to"] == 13
    assert rows[13]["duration_min"] == 1.1 and rows[13]["max_depth_m"] == 18.5
    assert rows[13]["start"] == "2025-03-01T09:30:00" and rows[14]["surface_before_min"] == 14
    assert rows[13]["selected"] is rows[14]["selected"] is True
    dive = store.dives[5]
    assert dive.computer == [13, 14] and dive.profiles == ["profiles/profile_00005.json"]
    assert dive.duration_min == 1.1 and dive.time_out == "09:45"
    assert sorted(store.dives) == [1, 2, 3, 4, 5]
    profile = json.loads((store.root / dive.profiles[0]).read_text())
    assert profile["computer_records"] == [13, 14] and profile["surface_breaks"] == [[50, 900]]
    key = store.imports[body["import_id"]].storage_key
    assert key.endswith("-344FDE85-13-1.swlog")
    assert await get_storage().get(key.replace("-1.swlog", "-2.swlog")) == joined_logs()[1]


async def test_join_attaches_to_the_dive_the_first_matches(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    await add_dive(store, 20, time_in="09:31")
    response = await upload(owner_client, cloud_db(tmp_path, joined_logs()), join="13+14")
    body = response.json()
    assert body["updated"] == [20] and body["created"] == []
    assert statuses(body) == {13: ("attach", 20), 14: ("attach", 20)}
    dive = store.dives[20]
    assert dive.computer == [13, 14] and len(dive.profiles) == 1
    assert dive.time_in == "09:31" and dive.time_out == "09:45" and dive.avg_depth_m == 8.8


@pytest.mark.parametrize("link", ["13:20", "14:20", "13:20,14:20"])
async def test_join_attaches_to_a_linked_dive(
    owner_client: AsyncClient, store: Store, tmp_path: Path, link: str
) -> None:
    await add_dive(store, 20, time_in="11:00")
    db = cloud_db(tmp_path, joined_logs())
    dry = await preview(owner_client, db, join="13+14", link=link)
    assert statuses(dry) == {13: ("attach", 20), 14: ("attach", 20)}
    body = (await upload(owner_client, db, join="13+14", link=link)).json()
    assert body["updated"] == [20] and body["created"] == []
    assert store.dives[20].computer == [13, 14] and len(store.dives[20].profiles) == 1


async def test_join_chains_three_dives(
    owner_client: AsyncClient, store: Store, tmp_path: Path
) -> None:
    logs = [
        pnf_log(number=37),
        pnf_log(number=38, start=START + timedelta(minutes=10)),
        pnf_log(number=39, start=START + timedelta(minutes=20)),
    ]
    body = (await upload(owner_client, cloud_db(tmp_path, logs), join="38+39+37")).json()
    assert body["created"] == [5]
    rows = by_number(body)
    assert [rows[n]["joined_to"] for n in (37, 38, 39)] == [None, 37, 37]
    assert [rows[n]["surface_before_min"] for n in (37, 38, 39)] == [None, 9, 9]
    assert rows[37]["duration_min"] == 2.4
    profile = json.loads((store.root / store.dives[5].profiles[0]).read_text())
    assert profile["computer_records"] == [37, 38, 39]
    assert profile["surface_breaks"] == [[50, 600], [650, 1200]]
    assert store.dives[5].computer == [37, 38, 39]


@pytest.mark.parametrize(
    ("join", "link", "reason"),
    [
        ("13", None, "Cannot join 13: a join needs at least two dives"),
        ("13+13", None, "Cannot join 13+13: a dive can be in only one join"),
        ("13+14,14+15", None, "Cannot join 14+15: a dive can be in only one join"),
        ("13+42", None, "Cannot join 13+42: #42 is not in this export"),
        ("13+16", None, "Cannot join 13+16: the log of #16 could not be read"),
        ("13+17", None, "Cannot join 13+17: #17 is already dive #30"),
        ("13+18", None, "Cannot join 13+18: the dives come from different computers"),
        ("13+19", None, "Cannot join 13+19: the dives are on different days"),
        ("13+14", "13:20,14:21", "Cannot join 13+14: its dives are linked to different dives"),
    ],
)
async def test_impossible_joins_are_refused(
    owner_client: AsyncClient,
    store: Store,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    join: str,
    link: str | None,
    reason: str,
) -> None:
    await add_dive(store, 20, time_in="16:00")
    await add_dive(store, 21, time_in="17:00")
    await add_dive(store, 30, day=date(2025, 2, 1), computer=[17], profiles={"p30.json": THIS})
    bad = Log(
        pnf.blob([b"\xff\xff" + bytes(pnf.RECORD - 2)]),
        file_name="Perdix AI[344FDE85]#16 2025-3-1 8-0-0.swlogzp",
    )
    logs = [
        *joined_logs(),
        pnf_log(number=15, start=at(1)),
        bad,
        pnf_log(number=17, start=at(2)),
        Log(pnf_log(number=18, start=at(3), serial=0xDEADBEEF), serial="DEADBEEF"),
        pnf_log(number=19, start=at(24)),
    ]
    params = {"join": join} | ({"link": link} if link else {})
    commits = record_commits(store, monkeypatch)
    response = await upload(owner_client, cloud_db(tmp_path, logs), **params)
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == reason
    assert commits == [] and store.imports == {}


@pytest.mark.parametrize("join", ["13+", "+14", "13,14+", "13-14", "13+14 ", "a+b"])
async def test_malformed_joins_are_refused(
    owner_client: AsyncClient, tmp_path: Path, join: str
) -> None:
    response = await upload(owner_client, cloud_db(tmp_path, joined_logs()), join=join)
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("join", "link"),
    [
        ("13+14", None),
        ("14+13", "13:20"),
        ("13+19", None),
        ("13+18", None),
        ("13+14,14+19", None),
        ("13+14", "13:20,14:21"),
    ],
)
async def test_join_outside_only_is_ignored(
    owner_client: AsyncClient, store: Store, tmp_path: Path, join: str, link: str | None
) -> None:
    await add_dive(store, 20, time_in="16:00")
    await add_dive(store, 21, time_in="17:00")
    logs = [
        *joined_logs(),
        pnf_log(number=15, start=at(1)),
        Log(pnf_log(number=18, start=at(3), serial=0xDEADBEEF), serial="DEADBEEF"),
        pnf_log(number=19, start=at(24)),
    ]
    params = {"join": join, "only": "15"} | ({"link": link} if link else {})
    response = await upload(owner_client, cloud_db(tmp_path, logs), **params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == [22] and body["updated"] == []
    assert all(row["joined_to"] is None for row in body["dives"])
    assert statuses(body)[13] == statuses(body)[14] == ("new", None)
    assert store.dives[22].computer == [15] and store.dives[20].computer == []


@pytest.mark.parametrize(
    ("only", "computer"), [("13,14", [13, 14]), ("13", [13, 14]), ("14", [14])]
)
async def test_join_follows_its_first_dive_in_only(
    owner_client: AsyncClient, store: Store, tmp_path: Path, only: str, computer: list[int]
) -> None:
    db = cloud_db(tmp_path, joined_logs())
    body = (await upload(owner_client, db, join="13+14", only=only)).json()
    assert body["created"] == [5] and store.dives[5].computer == computer


# ── auth and limits ─────────────────────────────────────────────────────────


async def test_anonymous_is_refused(client: AsyncClient, tmp_path: Path) -> None:
    response = await upload(client, cloud_db(tmp_path, [pnf_log()]))
    assert response.status_code == 401


async def test_stale_session_is_refused(client: AsyncClient, tmp_path: Path) -> None:
    client.cookies.set(get_settings().SESSION_COOKIE_NAME, "not-a-session")
    response = await upload(client, cloud_db(tmp_path, [pnf_log()]))
    assert response.status_code in (401, 403)


async def test_too_large_upload_is_refused(
    owner_client: AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "1000")
    get_settings.cache_clear()
    response = await upload(owner_client, cloud_db(tmp_path, [pnf_log()]))
    assert response.status_code == 413


@pytest.mark.parametrize("offset", ["1441", "-1441", "seven"])
async def test_bad_clock_offset_is_refused(
    owner_client: AsyncClient, tmp_path: Path, offset: str
) -> None:
    response = await upload(owner_client, cloud_db(tmp_path, [pnf_log()]), clock_offset_min=offset)
    assert response.status_code == 422
