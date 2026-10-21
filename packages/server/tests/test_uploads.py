"""Uploads: concurrent saves keep every change, photos are recognised by their bytes."""

import asyncio
import io
import threading
from typing import Any

import pytest
from httpx import AsyncClient
from PIL import Image

from divelog_server.api.v1 import admin as admin_api
from divelog_server.services import images as images_service
from divelog_server.services import storage as storage_service
from divelog_server.store.store import Store

ADMIN = "/api/v1/admin"


def jpeg(**params: Any) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (900, 600), (30, 80, 160)).save(buf, format="JPEG", **params)
    return buf.getvalue()


def jpeg_with_gps() -> bytes:
    image = Image.new("RGB", (900, 600))
    exif = image.getexif()
    exif[0x8825] = {1: "N", 2: (53.0, 41.0, 0.0), 3: "E", 4: (9.0, 9.0, 0.0)}
    buf = io.BytesIO()
    image.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


async def form_body(client: AsyncClient, number: int, **changes: Any) -> dict[str, Any]:
    """The body the dive form sends for a stored dive, with ``changes`` applied."""
    dive = (await client.get(f"{ADMIN}/dives/{number}")).json()
    body = {k: dive[k] for k in ("number", "date", "duration_min", "max_depth_m", "title")}
    body |= {"site_id": dive["site_id"], "cover_attachment_id": dive["cover_attachment_id"]}
    return body | changes


async def attachments(client: AsyncClient, number: int) -> list[dict[str, Any]]:
    return list((await client.get(f"{ADMIN}/dives/{number}")).json()["attachments"])


async def test_a_save_during_a_slow_upload_keeps_both(
    owner_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_put = storage_service.LocalStorage.put

    async def slow_put(self: Any, key: str, data: bytes, content_type: str) -> None:
        await asyncio.sleep(0.2)
        await real_put(self, key, data, content_type)

    monkeypatch.setattr(storage_service.LocalStorage, "put", slow_put)
    before = len(await attachments(owner_client, 1))
    body = await form_body(owner_client, 1, title="Edited during the upload")

    async def save_later() -> Any:
        await asyncio.sleep(0.05)
        return await owner_client.put(f"{ADMIN}/dives/1", json=body)

    uploaded, saved = await asyncio.gather(
        owner_client.post(
            f"{ADMIN}/dives/1/attachments", files={"file": ("a.jpg", jpeg(), "image/jpeg")}
        ),
        save_later(),
    )
    assert uploaded.status_code == 201 and saved.status_code == 200
    final = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert final["title"] == "Edited during the upload"
    assert len(final["attachments"]) == before + 1
    assert uploaded.json()["id"] in {a["id"] for a in final["attachments"]}


async def test_a_save_waiting_for_the_lock_keeps_the_new_photo(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def slow_commit(message: str) -> bool:
        await asyncio.sleep(0.2)
        return True

    monkeypatch.setattr(store.git, "commit", slow_commit)
    before = len(await attachments(owner_client, 1))
    body = await form_body(owner_client, 1, title="Saved after the photo")

    async def save_later() -> Any:
        await asyncio.sleep(0.1)
        return await owner_client.put(f"{ADMIN}/dives/1", json=body)

    uploaded, saved = await asyncio.gather(
        owner_client.post(
            f"{ADMIN}/dives/1/attachments", files={"file": ("a.jpg", jpeg(), "image/jpeg")}
        ),
        save_later(),
    )
    assert uploaded.status_code == 201 and saved.status_code == 200
    final = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert final["title"] == "Saved after the photo"
    assert len(final["attachments"]) == before + 1


async def test_parallel_uploads_get_their_own_place(owner_client: AsyncClient) -> None:
    before = len(await attachments(owner_client, 1))
    results = await asyncio.gather(
        *(
            owner_client.post(
                f"{ADMIN}/dives/1/attachments", files={"file": (f"{i}.jpg", jpeg(), "image/jpeg")}
            )
            for i in range(4)
        )
    )
    assert all(r.status_code == 201 for r in results)
    stored = await attachments(owner_client, 1)
    assert len(stored) == before + 4
    assert len({a["sort"] for a in stored}) == len(stored)


async def test_an_unknown_cover_in_the_form_keeps_the_stored_cover(
    owner_client: AsyncClient,
) -> None:
    photo = await owner_client.post(
        f"{ADMIN}/dives/1/attachments", files={"file": ("a.jpg", jpeg(), "image/jpeg")}
    )
    cover = photo.json()["id"]
    body = await form_body(owner_client, 1, cover_attachment_id="no-such-photo")
    saved = await owner_client.put(f"{ADMIN}/dives/1", json=body)
    assert saved.status_code == 200
    assert saved.json()["cover_attachment_id"] == cover


async def test_a_photo_sent_as_octet_stream_is_processed(owner_client: AsyncClient) -> None:
    upload = await owner_client.post(
        f"{ADMIN}/dives/1/attachments",
        files={"file": ("x.jpg", jpeg_with_gps(), "application/octet-stream")},
    )
    assert upload.status_code == 201
    body = upload.json()
    assert body["mime"] == "image/jpeg"
    assert body["public"] is True
    assert set(body["variants"]) == {"thumb", "w800"}
    served = await owner_client.get(body["url"])
    with Image.open(io.BytesIO(served.content)) as image:
        assert 0x8825 not in image.getexif()


async def test_a_file_that_is_not_a_photo_is_private_by_default(
    owner_client: AsyncClient,
) -> None:
    pdf = b"%PDF-1.7\n" + b"0" * 200
    upload = await owner_client.post(
        f"{ADMIN}/dives/1/attachments",
        files={"file": ("log.pdf", pdf, "application/pdf")},
    )
    assert upload.status_code == 201
    assert upload.json()["public"] is False
    chosen = await owner_client.post(
        f"{ADMIN}/dives/1/attachments",
        params={"public": "true"},
        files={"file": ("log.pdf", pdf, "application/pdf")},
    )
    assert chosen.json()["public"] is True
    site = await owner_client.post(
        f"{ADMIN}/sites/ressel/attachments", files={"file": ("plan.pdf", pdf, "application/pdf")}
    )
    assert site.status_code == 201
    assert site.json()["public"] is False


async def test_a_heic_photo_upload_becomes_a_jpeg(owner_client: AsyncClient) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (1000, 750), (20, 90, 160)).save(buf, format="HEIF")
    upload = await owner_client.post(
        f"{ADMIN}/dives/1/attachments", files={"file": ("IMG_0001.HEIC", buf.getvalue(), "")}
    )
    assert upload.status_code == 201, upload.text
    assert upload.json()["mime"] == "image/jpeg"
    assert upload.json()["url"].endswith(".jpg")


async def test_bytes_declared_as_a_photo_that_are_not_one_are_refused(
    owner_client: AsyncClient,
) -> None:
    upload = await owner_client.post(
        f"{ADMIN}/dives/1/attachments",
        files={"file": ("x.heic", b"\x00\x00\x00\x18ftypheic" + b"0" * 100, "image/heic")},
    )
    assert upload.status_code == 400


async def test_an_avatar_must_be_a_photo(owner_client: AsyncClient, store: Store) -> None:
    person = next(iter(store.people))
    upload = await owner_client.post(
        f"{ADMIN}/people/{person}/avatar",
        files={"file": ("me.txt", b"hello", "text/plain")},
    )
    assert upload.status_code == 400


async def test_photos_are_processed_off_the_event_loop(
    owner_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    threads: list[threading.Thread] = []
    real = images_service.process_image

    def recording(data: bytes, *, square: bool = False) -> images_service.ProcessedImage:
        threads.append(threading.current_thread())
        return real(data, square=square)

    monkeypatch.setattr(admin_api, "process_image", recording)
    upload = await owner_client.post(
        f"{ADMIN}/dives/1/attachments", files={"file": ("a.jpg", jpeg(), "image/jpeg")}
    )
    assert upload.status_code == 201
    assert threads and threads[0] is not threading.main_thread()
