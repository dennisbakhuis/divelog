import asyncio
import mimetypes
from functools import partial
from pathlib import Path
from typing import Protocol

from divelog_server.core.config import get_settings


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes | None: ...
    async def get_range(self, key: str, start: int, end: int) -> tuple[bytes, int] | None: ...
    async def delete(self, key: str) -> None: ...
    def local_path(self, key: str) -> Path | None: ...


class LocalStorage:
    """Files under MEDIA_ROOT — the development backend."""

    def __init__(self, root: str) -> None:
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("key escapes media root")
        return path

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)

    async def get(self, key: str) -> bytes | None:
        path = self._path(key)
        if not path.is_file():
            return None
        return await asyncio.to_thread(path.read_bytes)

    async def get_range(self, key: str, start: int, end: int) -> tuple[bytes, int] | None:
        path = self._path(key)
        if not path.is_file():
            return None

        def read() -> tuple[bytes, int]:
            total = path.stat().st_size
            with path.open("rb") as fh:
                fh.seek(start)
                return fh.read(end - start + 1), total

        return await asyncio.to_thread(read)

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()

    def local_path(self, key: str) -> Path | None:
        path = self._path(key)
        return path if path.is_file() else None


class S3Storage:
    """Hetzner Object Storage (or any S3) — the production backend."""

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config as BotoConfig

        settings = get_settings()
        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            partial(
                self.client.put_object,
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        )

    async def get(self, key: str) -> bytes | None:
        try:
            obj = await asyncio.to_thread(
                partial(self.client.get_object, Bucket=self.bucket, Key=key)
            )
        except self.client.exceptions.NoSuchKey:
            return None
        return await asyncio.to_thread(obj["Body"].read)

    async def get_range(self, key: str, start: int, end: int) -> tuple[bytes, int] | None:
        try:
            obj = await asyncio.to_thread(
                partial(
                    self.client.get_object,
                    Bucket=self.bucket,
                    Key=key,
                    Range=f"bytes={start}-{end}",
                )
            )
        except self.client.exceptions.NoSuchKey:
            return None
        total = int(str(obj["ContentRange"]).rpartition("/")[2])
        return await asyncio.to_thread(obj["Body"].read), total

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(partial(self.client.delete_object, Bucket=self.bucket, Key=key))

    def local_path(self, key: str) -> Path | None:
        return None


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        settings = get_settings()
        _storage = (
            S3Storage() if settings.STORAGE_BACKEND == "s3" else LocalStorage(settings.MEDIA_ROOT)
        )
    return _storage


def reset_storage() -> None:
    global _storage
    _storage = None


def guess_content_type(key: str) -> str:
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


REPO_PREFIX = "repo:"
COMMONS_PREFIX = "commons:"


def media_url(key: str) -> str:
    """URL for a storage key.

    ``repo:`` keys point into the log repository's public files, ``commons:`` keys into the
    site commons checkout; anything else is in the media storage.
    """
    if key.startswith(REPO_PREFIX):
        return f"/media/repo/{key[len(REPO_PREFIX) :]}"
    if key.startswith(COMMONS_PREFIX):
        return f"/media/commons/{key[len(COMMONS_PREFIX) :]}"
    return f"/media/{key}"


def variant_key(key: str, name: str) -> str:
    """``2026/09/abc.jpg`` + ``thumb`` → ``2026/09/abc-thumb.webp``."""
    base = key.rsplit(".", 1)[0] if "." in key.rsplit("/", 1)[-1] else key
    return f"{base}-{name}.webp"


VARIANT_NAMES = ("thumb", "w800", "w1600", "avatar")


def media_base(key: str) -> str:
    """The key without extension or variant suffix, shared by an original and its variants."""
    folder, _, name = key.rpartition("/")
    stem = name.rsplit(".", 1)[0] if "." in name else name
    head, sep, variant = stem.rpartition("-")
    if sep and variant in VARIANT_NAMES:
        stem = head
    return f"{folder}/{stem}" if folder else stem
