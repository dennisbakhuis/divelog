"""Read the dive logs out of a Shearwater Cloud export.

The mobile app's Export (*.db) button on the Profile tab writes the Cloud SQLite database; the
desktop app keeps the same database as ``dive_data.db``, and an account ZIP holds it too. All
are accepted. The database is opened in memory, only read, and each ``sw-pnf`` blob in it is
parsed with ``shearwater_pnf``. Logs the computer split at a surface break (same serial and
dive number) are merged into one dive. Each log's ``DiveId`` becomes one of the dive's
``source_ids``.
"""

import io
import re
import sqlite3
import zipfile
import zlib
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime
from typing import IO

from divelog_server.importers.shearwater import ShearwaterDive
from divelog_server.importers.shearwater_pnf import merge_parts, parse_pnf, unwrap

ZIP_MAGIC = b"PK\x03\x04"
SQLITE_MAGIC = b"SQLite format 3\x00"
MAX_MEMBERS = 20
MAX_MEMBER_BYTES = 100 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024
TABLES = ("log_data", "dive_details")
PNF_FORMAT = "sw-pnf"
LOGS_QUERY = """
    SELECT l.log_id, l.file_name, l.data_bytes_1, d.SerialNumber, d.DiveDate
    FROM log_data AS l LEFT JOIN dive_details AS d ON d.DiveId = l.log_id
    WHERE l.format = ?
    ORDER BY l.log_id
"""
FILE_NAME = re.compile(r"^(?P<model>[^\[]*)\[(?P<serial>[0-9A-Fa-f]+)\]#(?P<number>\d+)")


@dataclass
class CloudLog:
    """One ``log_data`` row with the ``dive_details`` it joins; ``log_id`` is its ``DiveId``."""

    log_id: str
    file_name: str
    blob: bytes | None
    serial: str
    logged_at: datetime | None


@dataclass
class CloudDive:
    """One dive in the export: the parsed dive, or why its log could not be read.

    ``file_names``, ``blobs`` and ``source_ids`` (the ``DiveId`` of each) hold every log of the
    dive in start order; more than one when the computer split it. ``logged_at`` is the start
    Shearwater Cloud recorded, for a dive whose log could not be parsed.
    """

    serial: str
    computer_no: int
    file_names: list[str]
    blobs: list[bytes]
    dive: ShearwaterDive | None
    error: str | None = None
    model: str | None = None
    logged_at: datetime | None = None
    source_ids: list[str] = field(default_factory=list)


@dataclass
class _Group:
    """The logs that share a serial and dive number, while they are collected."""

    file_names: list[str] = field(default_factory=list)
    blobs: list[bytes] = field(default_factory=list)
    log_ids: list[str] = field(default_factory=list)
    dives: list[ShearwaterDive] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    model: str | None = None
    logged_at: datetime | None = None


class CloudExport:
    """The dive logs of one Shearwater Cloud database.

    Parameters
    ----------
    logs : list of CloudLog
        The ``sw-pnf`` rows of the database, read by ``open_export``.
    """

    def __init__(self, logs: list[CloudLog]) -> None:
        self.logs = logs

    def dives(self) -> Iterator[CloudDive]:
        """Every dive, with the logs of a split dive merged.

        Yields
        ------
        CloudDive
            One per (serial, computer dive number), in the order the database lists them. A log
            that cannot be parsed makes its dive an error entry instead of failing the export.
        """
        groups: dict[tuple[str, int | str], _Group] = {}
        for index, log in enumerate(self.logs):
            dive, error = _parse(log)
            named = FILE_NAME.match(log.file_name)
            if dive is not None:
                key: tuple[str, int | str] = (dive.serial, dive.number)
                model = dive.model_name
            elif named is not None:
                key = (log.serial or named["serial"].upper(), int(named["number"]))
                model = named["model"].strip() or None
            else:
                key, model = (log.serial, f"log-{index}"), None
            group = groups.setdefault(key, _Group())
            group.file_names.append(log.file_name)
            group.blobs.append(log.blob or b"")
            group.log_ids.append(log.log_id)
            group.model = group.model or model
            group.logged_at = group.logged_at or log.logged_at
            if dive is not None:
                group.dives.append(dive)
            if error is not None:
                group.errors.append(f"{log.file_name or 'log'}: {error}")
        for (serial, number), group in groups.items():
            computer_no = number if isinstance(number, int) else 0
            if group.errors:
                yield CloudDive(
                    serial=serial,
                    computer_no=computer_no,
                    file_names=group.file_names,
                    blobs=group.blobs,
                    dive=None,
                    error="; ".join(group.errors),
                    model=group.model,
                    logged_at=group.logged_at,
                    source_ids=[i for i in group.log_ids if i],
                )
                continue
            order = sorted(range(len(group.dives)), key=lambda k: group.dives[k].start)
            yield CloudDive(
                serial=serial,
                computer_no=computer_no,
                file_names=[group.file_names[k] for k in order],
                blobs=[group.blobs[k] for k in order],
                dive=merge_parts(group.dives),
                model=group.model,
                logged_at=group.logged_at,
                source_ids=[group.log_ids[k] for k in order if group.log_ids[k]],
            )


def _parse(log: CloudLog) -> tuple[ShearwaterDive | None, str | None]:
    """The dive in one log, or why it could not be read."""
    if not log.blob:
        return None, "the log has no dive data"
    try:
        dive = parse_pnf(unwrap(log.blob), serial=log.serial or None)
    except ValueError as exc:
        return None, str(exc)
    dive.source_ids = [log.log_id] if log.log_id else []
    return dive, None


def open_export(data: bytes) -> CloudExport:
    """Open a Shearwater Cloud export: a ZIP holding the database, or the bare database.

    Parameters
    ----------
    data : bytes
        The uploaded file.

    Returns
    -------
    CloudExport
        The export's ``sw-pnf`` dive logs, read into memory.

    Raises
    ------
    ValueError
        With a readable reason when the file is neither, the ZIP is corrupt, holds no database
        with ``log_data`` and ``dive_details`` or a member over ``MAX_MEMBER_BYTES``, or the
        database cannot be read.
    """
    if data.startswith(SQLITE_MAGIC):
        logs = _read_logs(data)
        if logs is None:
            raise ValueError("the database has no log_data and dive_details tables")
        return CloudExport(logs)
    if data.startswith(ZIP_MAGIC):
        return CloudExport(_logs_from_zip(data))
    raise ValueError("not a ZIP or SQLite file")


def _logs_from_zip(data: bytes) -> list[CloudLog]:
    """The logs of the first SQLite member with the Cloud tables; nested archives are ignored."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for info in archive.infolist()[:MAX_MEMBERS]:
                if info.is_dir():
                    continue
                with archive.open(info) as member:
                    head = member.read(len(SQLITE_MAGIC))
                    if head != SQLITE_MAGIC:
                        continue
                    if info.file_size > MAX_MEMBER_BYTES:
                        raise ValueError(_too_large(info.file_size))
                    body = _read_bounded(member, head)
                logs = _read_logs(body)
                if logs is not None:
                    return logs
    except (zipfile.BadZipFile, zlib.error, EOFError, RuntimeError, NotImplementedError) as exc:
        raise ValueError(f"corrupt ZIP: {exc}") from exc
    raise ValueError("the ZIP holds no Shearwater Cloud database")


def _read_bounded(member: IO[bytes], head: bytes) -> bytes:
    """The rest of a ZIP member after ``head``, refusing to inflate past the size limit."""
    buffer = bytearray(head)
    while chunk := member.read(CHUNK_BYTES):
        buffer += chunk
        if len(buffer) > MAX_MEMBER_BYTES:
            raise ValueError(_too_large(len(buffer)))
    return bytes(buffer)


def _too_large(size: int) -> str:
    """The reason for refusing a member of ``size`` bytes."""
    return (
        f"a database of {size / 1_048_576:.0f} MB is over the "
        f"{MAX_MEMBER_BYTES / 1_048_576:.0f} MB limit"
    )


def _read_logs(data: bytes) -> list[CloudLog] | None:
    """The ``sw-pnf`` logs of a database image, or None when it lacks the Cloud tables."""
    connection = sqlite3.connect(":memory:")
    try:
        connection.deserialize(data)
        connection.execute("PRAGMA trusted_schema=OFF")
        connection.execute("PRAGMA query_only=ON")
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        if not set(TABLES) <= tables:
            return None
        rows = connection.execute(LOGS_QUERY, (PNF_FORMAT,)).fetchall()
    except sqlite3.Error as exc:
        raise ValueError(f"unreadable database: {exc}") from exc
    finally:
        connection.close()
    return [
        CloudLog(
            log_id=str(log_id or "").strip(),
            file_name=str(file_name or ""),
            blob=bytes(blob) if isinstance(blob, bytes | bytearray | memoryview) else None,
            serial=str(serial or "").strip().upper(),
            logged_at=_logged_at(logged_at),
        )
        for log_id, file_name, blob, serial, logged_at in rows
    ]


def _logged_at(value: object) -> datetime | None:
    """``dive_details.DiveDate`` as a naive datetime, when it reads as one."""
    try:
        return datetime.fromisoformat(str(value)).replace(tzinfo=None) if value else None
    except ValueError:
        return None
