"""Site and logbook media: fetch freely licensed photos, push files into the media store.

``fetch`` searches Wikimedia Commons for each ``site_id=search term`` pair (or a JSON file of
them), downloads the best freely licensed image per site into ``--out`` and records source,
author and licence in ``<out>/CREDITS.json``. Sites already credited are skipped.

``upload`` processes every ``media`` entry of the log's dives, sites and people whose
``variants`` list is still empty with the same Pillow pipeline as admin uploads, stores the
original and its WebP variants in ``MEDIA_ROOT`` and updates the frontmatter in place. Two
entries that share a storage key are processed once. Idempotent.
"""

import argparse
import asyncio
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, TextIO

from divelog_server.core.config import get_settings
from divelog_server.services.images import process_image
from divelog_server.services.storage import LocalStorage, variant_key
from divelog_server.store.files import read_markdown, write_markdown
from divelog_server.tools.common import log_root, user_agent

API = "https://commons.wikimedia.org/w/api.php"
FREE = ("cc0", "ccby", "ccbysa", "publicdomain", "pd")
REPO_PREFIX = "repo:"
UPLOAD_FOLDERS = ("dives", "sites", "people")


def register(commands: "argparse._SubParsersAction[argparse.ArgumentParser]") -> None:
    """Add the ``media`` subcommand with ``fetch`` and ``upload``."""
    parser = commands.add_parser(
        "media",
        help="fetch site photos, upload media into the store",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    media_commands = parser.add_subparsers(dest="media_command", required=True)

    fetch = media_commands.add_parser("fetch", help="free Wikimedia Commons photos per site")
    fetch.add_argument("pairs", nargs="*", metavar="SITE=TERM", help="site id and search term")
    fetch.add_argument("--terms", type=Path, help="JSON object of site id -> search term")
    fetch.add_argument("--out", type=Path, required=True, help="folder for images + CREDITS.json")
    fetch.add_argument("--contact", help="contact for the User-Agent (default: OWNER_EMAIL)")
    fetch.add_argument("--delay", type=float, default=0.8, help="seconds between downloads")
    fetch.set_defaults(run=run_fetch)

    upload = media_commands.add_parser("upload", help="process and store pending media entries")
    upload.add_argument("--log", type=Path, help="log repository (default: env DATA_ROOT)")
    upload.add_argument("--media", type=Path, help="media directory (default: env MEDIA_ROOT)")
    upload.add_argument("--scans", type=Path, help="directory with the scans/ files")
    upload.add_argument("--dry-run", action="store_true")
    upload.set_defaults(run=run_upload)


def search_terms(pairs: list[str], terms: Path | None) -> dict[str, str]:
    """The site id -> search term mapping from a JSON file and ``SITE=TERM`` arguments."""
    found: dict[str, str] = {}
    if terms is not None:
        loaded = json.loads(terms.read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise ValueError(f"{terms}: expected a JSON object of site id -> search term")
        found.update({str(k): str(v) for k, v in loaded.items()})
    for pair in pairs:
        site_id, sep, term = pair.partition("=")
        if not sep or not site_id.strip() or not term.strip():
            raise ValueError(f"{pair!r}: expected SITE=TERM")
        found[site_id.strip()] = term.strip()
    return found


def call(params: dict[str, Any], agent: str) -> Any:
    """GET the Commons API and return parsed JSON."""
    query = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": agent})
    with urllib.request.urlopen(req, timeout=40) as fh:
        return json.load(fh)


def strip_markup(html: str | None) -> str:
    """Remove markup and collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html or "")).strip()


def is_free(licence: str | None) -> bool:
    """True when the licence short name is one we are allowed to redistribute."""
    key = re.sub(r"[^a-z0-9]", "", (licence or "").lower())
    return any(key.startswith(f) for f in FREE)


def describe(data: dict[str, Any], titles: list[str]) -> list[dict[str, Any]]:
    """Candidate rows from an ``imageinfo`` response, in the order of the search hits."""
    order = {t: n for n, t in enumerate(titles)}
    out = []
    for page in data.get("query", {}).get("pages", []):
        for ii in page.get("imageinfo", []):
            ex = ii.get("extmetadata", {})
            description = strip_markup((ex.get("ImageDescription", {}) or {}).get("value", ""))
            out.append(
                {
                    "title": page["title"],
                    "rank": order.get(page["title"], 99),
                    "licence": (ex.get("LicenseShortName", {}) or {}).get("value", ""),
                    "author": strip_markup((ex.get("Artist", {}) or {}).get("value", "")),
                    "description": description[:200],
                    "url": ii.get("thumburl") or ii.get("url"),
                    "page": ii.get("descriptionurl"),
                }
            )
    out.sort(key=lambda r: r["rank"])
    return out


def candidates(term: str, agent: str, limit: int = 10) -> list[dict[str, Any]]:
    """Commons file metadata for a search term, best first."""
    found = call(
        {
            "action": "query",
            "list": "search",
            "srsearch": f"{term} filetype:bitmap",
            "srnamespace": "6",
            "srlimit": limit,
        },
        agent,
    )
    titles = [x["title"] for x in found.get("query", {}).get("search", [])]
    if not titles:
        return []
    data = call(
        {
            "action": "query",
            "titles": "|".join(titles),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size",
            "iiurlwidth": "1600",
        },
        agent,
    )
    return describe(data, titles)


def download(url: str, dest: Path, agent: str) -> int:
    """Fetch url into dest and return the byte count."""
    req = urllib.request.Request(url, headers={"User-Agent": agent})
    with urllib.request.urlopen(req, timeout=90) as fh:
        blob = fh.read()
    dest.write_bytes(blob)
    return len(blob)


def credit(pick: dict[str, Any], dest: Path) -> dict[str, Any]:
    """The ``CREDITS.json`` entry of a downloaded image."""
    return {
        "file": dest.name,
        "source": "Wikimedia Commons",
        "commons_title": pick["title"],
        "page": pick["page"],
        "author": pick["author"],
        "licence": pick["licence"],
        "description": pick["description"],
        "public": True,
    }


def run_fetch(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog media fetch``: one free image per site, and the credits index."""
    try:
        wanted = search_terms(args.pairs, args.terms)
    except ValueError as exc:
        print(exc, file=out)
        return 1
    if not wanted:
        print("nothing to fetch: give SITE=TERM pairs or --terms", file=out)
        return 1
    agent = user_agent(args.contact)
    folder: Path = args.out
    folder.mkdir(parents=True, exist_ok=True)
    credits_path = folder / "CREDITS.json"
    credits = json.loads(credits_path.read_text(encoding="utf-8")) if credits_path.exists() else {}
    for site_id, term in wanted.items():
        if site_id in credits:
            continue
        try:
            picks = [c for c in candidates(term, agent) if is_free(c["licence"]) and c["url"]]
        except Exception as exc:
            print(f"{site_id:26} error {exc}", file=out)
            continue
        if not picks:
            print(f"{site_id:26} no free image for {term!r}", file=out)
            continue
        pick = picks[0]
        name = pick["title"][5:].replace(" ", "_")
        ext = Path(name).suffix.lower() or ".jpg"
        dest = folder / f"{site_id}{ext}"
        size = download(pick["url"], dest, agent)
        credits[site_id] = credit(pick, dest)
        print(
            f"{site_id:26} {pick['licence'][:16]:18} {size // 1024:>5} kB  {pick['title'][5:60]}",
            file=out,
        )
        time.sleep(args.delay)
    credits_path.write_text(json.dumps(credits, indent=1, ensure_ascii=False) + "\n")
    print(f"\ncredited files: {len(credits)}", file=out)
    return 0


def source_for(entry: dict[str, Any], data: Path, scans: Path | None) -> tuple[Path, str] | None:
    """(local file, storage key) for an entry that still needs uploading."""
    key = str(entry.get("key", ""))
    if key.startswith(REPO_PREFIX):
        relative = key[len(REPO_PREFIX) :]
        return data / relative, relative.removeprefix("media/")
    if key.startswith("scans/") and scans is not None:
        return scans / Path(key).name, key
    if key.startswith("sites/"):
        return data / "media" / key, key
    return None


async def store_image(storage: LocalStorage, source: Path, key: str) -> dict[str, Any]:
    """Process one image, store original and variants, return the frontmatter fields."""
    processed = process_image(source.read_bytes())
    ext = "png" if processed.original_mime == "image/png" else "jpg"
    key = f"{key.rsplit('.', 1)[0]}.{ext}"
    await storage.put(key, processed.original, processed.original_mime)
    for name, blob in processed.variants.items():
        await storage.put(variant_key(key, name), blob, "image/webp")
    return {
        "key": key,
        "mime": processed.original_mime,
        "bytes": len(processed.original),
        "width": processed.width,
        "height": processed.height,
        "variants": sorted(processed.variants),
        "original_name": source.name,
    }


async def upload_pending(
    data: Path, media: Path, scans: Path | None, dry_run: bool, out: TextIO
) -> tuple[int, int, list[str]]:
    """Store every pending media entry; (files stored, records updated, missing sources)."""
    storage = LocalStorage(str(media))
    done: dict[str, dict[str, Any]] = {}
    touched = 0
    missing: list[str] = []
    for folder in UPLOAD_FOLDERS:
        for path in sorted((data / folder).glob("*.md")):
            meta, body = read_markdown(path)
            changed = False
            for entry in meta.get("media", []):
                if entry.get("variants"):
                    continue
                found = source_for(entry, data, scans)
                if found is None:
                    continue
                source, key = found
                if key not in done:
                    if not source.exists():
                        missing.append(str(source))
                        continue
                    print(f"  {source.name} -> {key}", file=out)
                    done[key] = {} if dry_run else await store_image(storage, source, key)
                if not dry_run:
                    entry.update(done[key])
                    changed = True
            if changed:
                write_markdown(path, meta, body)
                touched += 1
    return len(done), touched, missing


def run_upload(args: argparse.Namespace, out: TextIO) -> int:
    """``divelog media upload``: process pending entries and record them in the frontmatter."""
    media = args.media or Path(get_settings().MEDIA_ROOT)
    stored, touched, missing = asyncio.run(
        upload_pending(log_root(args.log), media, args.scans, args.dry_run, out)
    )
    print(f"uploaded {stored} files, updated {touched} records", file=out)
    if missing:
        print(f"missing sources ({len(missing)}):", file=out)
        for m in missing[:20]:
            print("  ", m, file=out)
    return 0
