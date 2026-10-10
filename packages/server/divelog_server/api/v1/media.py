import asyncio
import hashlib
import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse

from divelog_server.core.config import get_settings
from divelog_server.core.deps import OptionalOwnerDep, StoreDep
from divelog_server.services.images import process_image
from divelog_server.services.storage import (
    COMMONS_PREFIX,
    VARIANT_NAMES,
    get_storage,
    guess_content_type,
    media_base,
)
from divelog_server.store.store import Store

router = APIRouter()

IMMUTABLE = "public, max-age=31536000, immutable"
REPO_CACHE = "public, max-age=3600"
COMMONS_CACHE = "public, max-age=86400"
PRIVATE = "private, no-store"
BYTE_RANGE = re.compile(r"^bytes=(\d+)-(\d*)$")
VARIANT_FILE = re.compile(rf"^(?P<base>.+)-(?P<variant>{'|'.join(VARIANT_NAMES)})\.webp$")
ORIGINAL_EXTENSIONS = ("jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG")


@router.get("/media/repo/{path:path}", include_in_schema=False)
async def serve_repo_file(path: str, store: StoreDep) -> Response:
    """A publishable file straight from the data repository: sketches, images."""
    file = store.public_file(path)
    if file is None:
        raise HTTPException(status_code=404)
    return FileResponse(
        file, media_type=guess_content_type(path), headers={"Cache-Control": REPO_CACHE}
    )


def commons_etag(store: Store, path: str, file: Path) -> str:
    """A validator for a commons file: the checked-out commit and the path, else size and time."""
    head = store.commons_head()
    stat = file.stat()
    seed = f"{head}:{path}" if head else f"{path}:{stat.st_size}:{stat.st_mtime_ns}"
    return '"' + hashlib.sha1(seed.encode()).hexdigest()[:20] + '"'


def commons_variant(key: str, original: Path, variant: str) -> Path | None:
    """The cached WebP ``variant`` of a commons photo, rendered on first request.

    Every variant of the photo is written at once to ``STATE_DIR/variants/<sha1(key)>-<name>.webp``
    and rendered again when the original is newer than the cache.
    """
    folder = Path(get_settings().STATE_DIR) / "variants"
    stem = hashlib.sha1(key.encode()).hexdigest()
    target = folder / f"{stem}-{variant}.webp"
    if target.is_file() and target.stat().st_mtime_ns >= original.stat().st_mtime_ns:
        return target
    processed = process_image(original.read_bytes(), square=variant == "avatar")
    folder.mkdir(parents=True, exist_ok=True)
    for name, blob in processed.variants.items():
        (folder / f"{stem}-{name}.webp").write_bytes(blob)
    return target if target.is_file() else None


def _commons_response(request: Request, file: Path, etag: str, media_type: str) -> Response:
    headers = {"Cache-Control": COMMONS_CACHE, "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return FileResponse(file, media_type=media_type, headers=headers)


@router.get("/media/commons/{path:path}", include_in_schema=False)
async def serve_commons_file(path: str, request: Request, store: StoreDep) -> Response:
    """A publishable file of the site commons, or a WebP variant of one of its photos."""
    if store.commons is None:
        raise HTTPException(status_code=404)
    file = store.commons_file(path)
    if file is not None:
        etag = commons_etag(store, path, file)
        return _commons_response(request, file, etag, guess_content_type(path))
    wanted = VARIANT_FILE.match(path)
    if wanted is None:
        raise HTTPException(status_code=404)
    base = wanted.group("base")
    relative = next(
        (f"{base}.{ext}" for ext in ORIGINAL_EXTENSIONS if store.commons_file(f"{base}.{ext}")),
        None,
    )
    original = store.commons_file(relative) if relative else None
    if relative is None or original is None:
        raise HTTPException(status_code=404)
    try:
        cached = await asyncio.to_thread(
            commons_variant, COMMONS_PREFIX + relative, original, wanted.group("variant")
        )
    except OSError as exc:
        raise HTTPException(status_code=404) from exc
    if cached is None:
        raise HTTPException(status_code=404)
    return _commons_response(request, cached, commons_etag(store, path, original), "image/webp")


@router.get("/media/{key:path}", include_in_schema=False)
async def serve_media(
    key: str, request: Request, store: StoreDep, owner: OptionalOwnerDep
) -> Response:
    """Serve a stored file; anything recorded as non-public needs the owner's cookie.

    Single byte ranges are honoured on every backend so the map tiles (one large PMTiles
    archive per region) can be read piecemeal in the browser.
    """
    if ".." in key or key.startswith("/"):
        raise HTTPException(status_code=404)
    public = store.media_public.get(media_base(key), True)
    if not public and owner is None:
        raise HTTPException(status_code=404)
    cache = IMMUTABLE if public else PRIVATE
    media_type = guess_content_type(key)
    storage = get_storage()
    path = storage.local_path(key)
    if path is not None:
        return FileResponse(path, media_type=media_type, headers={"Cache-Control": cache})
    wanted = BYTE_RANGE.match(request.headers.get("range", ""))
    if wanted:
        start = int(wanted.group(1))
        end = int(wanted.group(2)) if wanted.group(2) else start + 16 * 1024 * 1024 - 1
        part = await storage.get_range(key, start, end)
        if part is None:
            raise HTTPException(status_code=404)
        data, total = part
        if not data:
            raise HTTPException(status_code=416)
        return Response(
            data,
            status_code=206,
            media_type=media_type,
            headers={
                "Cache-Control": cache,
                "Accept-Ranges": "bytes",
                "Content-Range": f"bytes {start}-{start + len(data) - 1}/{total}",
            },
        )
    whole = await storage.get(key)
    if whole is None:
        raise HTTPException(status_code=404)
    return Response(
        whole,
        media_type=media_type,
        headers={"Cache-Control": cache, "Accept-Ranges": "bytes"},
    )
