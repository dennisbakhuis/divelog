"""Helpers shared by the tools: JSON files, fonts for rendered previews and the admin API."""

import json
import os
import urllib.request
from pathlib import Path
from typing import Any

from PIL import ImageFont

from divelog_server.core.config import get_settings
from divelog_server.store.commons_sync import resolve_commons
from divelog_server.store.sources import CommonsSource
from divelog_server.store.store import Store

FONT_CANDIDATES = (
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)
DEFAULT_API = "http://localhost:8000"


def font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    """A system TrueType font at ``size`` px, or Pillow's built-in bitmap font."""
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def load(path: str | Path) -> dict[str, Any]:
    """Read a JSON object from a file."""
    with open(path, encoding="utf-8") as handle:
        data: dict[str, Any] = json.load(handle)
    return data


def dump(data: Any, path: str | Path) -> None:
    """Write JSON with one-space indent, the layout of the data repository."""
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=1, ensure_ascii=False)
        handle.write("\n")


def default_api() -> str:
    """The server the ``push`` commands talk to: env ``DIVELOG_API`` or localhost:8000."""
    return os.environ.get("DIVELOG_API", DEFAULT_API)


def user_agent(contact: str | None = None) -> str:
    """The User-Agent for public APIs (Overpass, Wikimedia), with a contact when known."""
    who = contact or os.environ.get("DIVELOG_CONTACT") or os.environ.get("OWNER_EMAIL", "")
    return f"divelog/0.1 ({who})" if who else "divelog/0.1"


def session_cookie(path: str | Path) -> str:
    """The Cookie header from a curl (Netscape) cookie jar; localhost cookies confuse cookiejar."""
    pairs = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        fields = line.removeprefix("#HttpOnly_").split("\t")
        if len(fields) == 7 and not fields[0].startswith("#"):
            pairs.append(f"{fields[5]}={fields[6]}")
    if not pairs:
        raise SystemExit(f"no cookies in {path}")
    return "; ".join(pairs)


def request(base: str, cookie: str, method: str, path: str, body: Any = None) -> Any:
    """One JSON request to the admin API with the owner's session cookie."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base.rstrip("/") + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Cookie", cookie)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read() or b"null")


def push_map(
    base: str, cookie: str, site_id: str, data: dict[str, Any], note: str, map_id: str | None
) -> dict[str, Any]:
    """Create a drawn map for a site, or replace ``map_id``; returns the saved map."""
    body = {"data": data, "note": note}
    if map_id:
        saved: dict[str, Any] = request(base, cookie, "PUT", f"/api/v1/admin/maps/{map_id}", body)
    else:
        saved = request(base, cookie, "POST", f"/api/v1/admin/sites/{site_id}/maps", body)
    return saved


def set_default_map(base: str, cookie: str, site_id: str, map_id: str) -> None:
    """Make a drawn map the site's default map."""
    request(
        base, cookie, "PATCH", f"/api/v1/admin/sites/{site_id}", {"default_map": f"drawn:{map_id}"}
    )


def log_root(path: Path | None) -> Path:
    """The log repository a tool works on: ``--log``, else env ``DATA_ROOT``."""
    return path if path is not None else Path(get_settings().DATA_ROOT)


def commons_root(root: Path, commons: Path | None = None) -> Path | None:
    """The commons of a log: ``--commons``, else env ``COMMONS_ROOT``, else its ``divelog.yaml``.

    Raises
    ------
    PullError
        The commons that was named does not exist, or ``divelog.yaml`` does not parse.
    """
    return resolve_commons(root, commons, required=False)


def open_store(root: Path, commons: Path | None = None) -> Store:
    """The merged read view of a log and its commons, loaded from disk without git.

    Raises
    ------
    PullError
        As :func:`commons_root`.
    """
    found = commons_root(root, commons)
    store = Store(root, commons=CommonsSource(found) if found else None)
    store.load()
    return store
