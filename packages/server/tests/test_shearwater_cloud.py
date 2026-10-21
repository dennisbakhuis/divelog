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
) -> DiveRecord:
    """Put a dive in the log, with profile files written from ``profiles``."""
    paths = [store.save_profile(name, payload) for name, payload in (profiles or {}).items()]
    dive = DiveRecord(
        number=number,
        date=day,
        time_in=time_in,
        duration_min=40,
        max_depth_m=18,
        computer=list(computer),
        profiles=paths,
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
