"""Git repositories for the Phase D round trip: a commons with an origin, a maintainer, a log."""

import io
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from divelog_server.cli import main
from divelog_server.store.files import read_json, read_markdown, write_json, write_markdown
from divelog_server.store.manifest import Manifest, ManifestSource, write_manifest
from tests.logbuilder import build_commons, dive, drawn_map, site

SITE = "fra-newsite"
DIARY = "fra-diary"
COMMONS_SITE = "fra-commons-only"
NEWSITE_BODY = "A short sump that opens into a flooded gallery."
ANNOTATION = {"map_id": f"{SITE}-p1", "revision": 1, "route": [{"from": "a", "to": "b"}]}


def git(root: Path, *args: str) -> str:
    """Run git in ``root`` as a test identity; returns stdout."""
    done = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "-c",
            "user.name=Tester",
            "-c",
            "user.email=tester@example.com",
            "-c",
            "commit.gpgsign=false",
            *args,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return done.stdout.strip()


def run(*argv: str) -> tuple[int, str]:
    """Run the ``divelog`` CLI; returns the exit code and the output."""
    out = io.StringIO()
    code = main(list(argv), out=out)
    return code, out.getvalue()


@dataclass
class Repos:
    """The repositories of one round trip."""

    log: Path
    commons: Path
    origin: Path
    maintainer: Path
    media_root: Path


def build_newsite_log(root: Path, commons: Path, media_root: Path) -> Path:
    """A log with two personal sites, a ``-p1`` map, an annotated dive and three photos."""
    root.mkdir(parents=True)
    geo = {"country": "FRA", "type": "cave", "region": "fra-causses", "geo_source": "GPS 2026"}
    site(
        root,
        SITE,
        NEWSITE_BODY,
        name="New Spring",
        aliases=["Petite Source"],
        lat=44.61,
        lon=1.71,
        summary="A small spring beside the river.",
        sources=["https://example.org/new-spring"],
        notes="Owner note.",
        prices=[{"date": "2026-01-01", "amount": 5, "currency": "EUR"}],
        reference_maps=["reference:survey/map.png"],
        maps=["reference:survey/map.png"],
        default_map=f"drawn:{SITE}-p1",
        media=[
            {"id": "ns-cc", "key": "repo:media/sites/fra-newsite.jpg", "credit": "A. Diver"},
            {"id": "ns-private", "key": "repo:media/sites/fra-newsite-private.jpg"},
            {
                "id": "ns-upload",
                "key": "sites/fra-newsite/upload.jpg",
                "licence": "CC BY-SA 4.0",
                "author": "A. Diver",
            },
            {"id": "ns-unlicensed", "key": "sites/fra-newsite/other.jpg"},
        ],
        **geo,
    )
    site(
        root,
        DIARY,
        "I loved this place. The gallery is wide and deep.",
        name="Diary Cave",
        lat=44.9,
        lon=2.5,
        summary="My favourite cave.",
        **geo,
    )
    write_json(
        root / "maps" / "drawn" / f"{SITE}-p1.json",
        drawn_map(f"{SITE}-p1", SITE, underlay={"ref": "reference:survey/map.png"}),
    )
    photos = root / "media" / "sites"
    photos.mkdir(parents=True)
    (photos / "fra-newsite.jpg").write_bytes(b"cc photo")
    (photos / "fra-newsite-private.jpg").write_bytes(b"private photo")
    write_json(
        root / "media" / "manifest.json",
        {
            "media/sites/fra-newsite.jpg": {
                "source": "own",
                "author": "A. Diver",
                "licence": "CC BY 4.0",
                "public": True,
            },
            "media/sites/fra-newsite-private.jpg": {"licence": "CC BY 4.0", "public": False},
        },
    )
    uploads = media_root / "sites" / SITE
    uploads.mkdir(parents=True)
    (uploads / "upload.jpg").write_bytes(b"uploaded photo")
    (uploads / "other.jpg").write_bytes(b"unlicensed photo")
    dive(root, 1, SITE, map_annotation=ANNOTATION)
    dive(root, 2, COMMONS_SITE)
    source = ManifestSource(kind="commons", name="divelog-sites", path="../commons")
    write_manifest(root, Manifest(kind="log", name="mylog", sources=[source]))
    git(root, "init", "-q", "-b", "main")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "log")
    return root


def build_repos(tmp: Path) -> Repos:
    """A commons on an origin, its working checkout and a maintainer clone, and the log."""
    seed = build_commons(tmp / "seed")
    git(seed, "init", "-q", "-b", "main")
    git(seed, "add", "-A")
    git(seed, "commit", "-q", "-m", "commons")
    origin = tmp / "origin.git"
    git(tmp, "clone", "-q", "--bare", str(seed), str(origin))
    commons = tmp / "commons"
    maintainer = tmp / "maintainer"
    git(tmp, "clone", "-q", str(origin), str(commons))
    git(tmp, "clone", "-q", str(origin), str(maintainer))
    media_root = tmp / "media"
    log = build_newsite_log(tmp / "log", commons, media_root)
    return Repos(log, commons, origin, maintainer, media_root)


def merge_proposal(repos: Repos, branch: str) -> None:
    """Push the proposal branch and merge it into the origin's main as a maintainer."""
    git(repos.commons, "push", "-q", "origin", branch)
    git(repos.maintainer, "fetch", "-q", "origin")
    git(repos.maintainer, "merge", "-q", "--no-ff", "-m", f"Merge {branch}", f"origin/{branch}")
    git(repos.maintainer, "push", "-q", "origin", "main")


def maintainer_change(repos: Repos, change: Callable[[Path], None], message: str) -> None:
    """Commit ``change`` in the maintainer clone and push it to the origin."""
    git(repos.maintainer, "pull", "-q", "--ff-only")
    change(repos.maintainer)
    git(repos.maintainer, "add", "-A")
    git(repos.maintainer, "commit", "-q", "-m", message)
    git(repos.maintainer, "push", "-q", "origin", "main")


def bump_map(root: Path, map_id: str) -> None:
    """Move a commons map to its next revision with a changelog entry."""
    path = root / "maps" / "drawn" / f"{map_id}.json"
    payload = read_json(path)
    revision = payload["revision"] + 1
    entry = {"revision": revision, "date": "2026-10-11", "note": "Surveyed again"}
    payload["revision"] = revision
    payload["changelog"] = [entry, *payload.get("changelog", [])]
    write_json(path, payload)


def bump_site(root: Path, site_id: str) -> None:
    """Move a commons site to its next revision with a changelog entry."""
    path = root / "sites" / f"{site_id}.md"
    meta, body = read_markdown(path)
    revision = meta.get("revision", 1) + 1
    entry = {"revision": revision, "date": "2026-10-11", "note": "New entrance"}
    meta["revision"] = revision
    meta["changelog"] = [entry, *meta.get("changelog", [])]
    write_markdown(path, meta, body)
