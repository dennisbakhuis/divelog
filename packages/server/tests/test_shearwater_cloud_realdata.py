"""Dry-run a real Shearwater Cloud database against a copy of a real log.

Local only: set ``DIVELOG_SW_CLOUD_DB`` to a ``dive_data.db`` and ``DIVELOG_CONTENT_ROOT`` to a
log repository that already holds every dive of that database. The log's dives, profiles and
the records they refer to are copied into the test's temporary directory, so the original is
never written. The dry run must create nothing; every dive that is not ``have`` is printed
with the reason.
"""

import os
import shutil
from collections import Counter
from pathlib import Path

import pytest
from httpx import AsyncClient

from divelog_server.core import deps
from divelog_server.core.config import get_settings
from divelog_server.services import storage as storage_service

CLOUD_DB = os.environ.get("DIVELOG_SW_CLOUD_DB")
CONTENT = os.environ.get("DIVELOG_CONTENT_ROOT")
COPIED = ("dives", "profiles", "sites", "people", "regions", "gear", "trips")

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
