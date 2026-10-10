import subprocess
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from divelog_server.core.config import get_settings
from divelog_server.services import dives as dive_service
from divelog_server.services.storage import media_url, variant_key
from divelog_server.store.files import read_json, read_markdown, write_json, write_markdown
from divelog_server.store.git import GitRepo
from divelog_server.store.models import ChangeEntry, MediaRef, SiteOverlayRecord, SiteRecord
from divelog_server.store.overlay import merge_site, objective_changes, overlay_for, split_site
from divelog_server.store.sources import CommonsSource
from divelog_server.store.store import CommonsEditError, Store

SITE = "fra-commons-only"
ADMIN = "/api/v1/admin"
PUBLIC = "/api/v1/dive"
PHOTO = "media/sites/fra-commons-only.jpg"


def base_site() -> SiteRecord:
    return SiteRecord.model_validate(
        {
            "site_id": "fra-x",
            "name": "X",
            "aliases": ["Ex"],
            "country": "FRA",
            "type": "cave",
            "lat": 44.0,
            "lon": 1.0,
            "summary": "Commons summary.",
            "maps": ["seed:fra-x"],
            "default_map": "drawn:fra-x-1",
            "media": [{"id": "c1", "key": "commons:media/sites/x.jpg"}],
            "body_md": "Commons body.",
        }
    )


def overlay(**fields: Any) -> SiteOverlayRecord:
    return SiteOverlayRecord.model_validate({"site_id": "fra-x", "extends": "commons", **fields})


def write_overlay(root: Path, site_id: str, meta: dict[str, Any], body: str = "") -> None:
    write_markdown(
        root / "sites" / f"{site_id}.md", {"site_id": site_id, "extends": "commons", **meta}, body
    )


def site_in(site: dict[str, Any], **changes: Any) -> dict[str, Any]:
    payload = {
        "site_id": site["id"],
        "name": site["name"],
        "full_name": site["full_name"],
        "short_name": site["short_name"],
        "aliases": site["aliases"],
        "region": site["region"],
        "country": site["country"],
        "area": site["area"],
        "system": site["system"],
        "type": site["site_type"],
        "section_vocabulary": site["section_vocabulary"],
        "lat": site["lat"],
        "lon": site["lon"],
        "access": site["access"],
        "location_visibility": site["location_visibility"],
        "water": site["water"],
        "halocline": site["halocline"],
        "halocline_m": site["halocline_m"],
        "summary": site["summary"],
        "description_md": site["description_md"],
        "default_map": site["default_map"],
        "prices": site["prices"],
        "sources": site["sources"],
        "verified": site["verified"],
        "geo_source": site["geo_source"],
        "notes": (site.get("private") or {}).get("notes"),
    }
    payload.update(changes)
    return payload


async def admin_site(client: AsyncClient, site_id: str) -> dict[str, Any]:
    response = await client.get(f"{ADMIN}/sites/{site_id}")
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


def stick(*node_ids: str) -> dict[str, Any]:
    nodes = [{"id": n, "x": i * 10, "y": 0} for i, n in enumerate(node_ids)]
    edges = [{"from": a, "to": b} for a, b in zip(node_ids, node_ids[1:], strict=False)]
    return {"kind": "stickmap", "nodes": nodes, "edges": edges}


def bump_commons(root: Path, site_id: str, revision: int) -> None:
    """Move a commons fixture site to ``revision`` with one changelog entry per step."""
    path = root / "sites" / f"{site_id}.md"
    meta, body = read_markdown(path)
    meta["revision"] = revision
    meta["changelog"] = [
        {"revision": r, "date": f"2026-09-{r:02d}", "note": f"Change {r}"}
        for r in range(revision, 1, -1)
    ]
    write_markdown(path, meta, body)


def git_init(root: Path) -> str:
    def run(*args: str) -> str:
        done = subprocess.run(
            ["git", "-C", str(root), "-c", "user.name=t", "-c", "user.email=t@e", *args],
            capture_output=True,
            text=True,
            check=True,
        )
        return done.stdout.strip()

    run("init", "-q")
    run("add", "-A")
    run("commit", "-q", "-m", "init")
    return run("rev-parse", "--short", "HEAD")


# ── merge rules ────────────────────────────────────────────────────────────


def test_merge_without_overlay_copies_base() -> None:
    base = base_site()
    merged = merge_site(base, None)
    assert merged is not base
    assert merged.body_md == merged.body_md_commons == "Commons body."
    merged.media.append(MediaRef(id="p1", key="2026/01/p1.jpg"))
    assert len(base.media) == 1


def test_merge_overlay_replaces_and_concatenates() -> None:
    base = base_site()
    merged = merge_site(
        base,
        overlay(
            notes="Mine",
            prices=[{"date": "2025-01-01", "amount": 10}],
            reference_maps=["reference:x.png"],
            subsurface_uuid="u1",
            summary_override="My summary.",
            default_map="drawn:fra-x-p1",
            aliases=["Ex", "Mine"],
            maps=["seed:fra-x", "drawn:fra-x-p1"],
            media=[{"id": "p1", "key": "2026/01/p1.jpg"}],
            body_md="My dives here.",
        ),
    )
    assert merged.notes == "Mine" and merged.subsurface_uuid == "u1"
    assert merged.prices[0].amount == 10 and merged.reference_maps == ["reference:x.png"]
    assert merged.summary == "My summary."
    assert merged.default_map == "drawn:fra-x-p1"
    assert merged.aliases == ["Ex", "Mine"]
    assert merged.maps == ["seed:fra-x", "drawn:fra-x-p1"]
    assert [m.id for m in merged.media] == ["c1", "p1"]
    assert merged.body_md == "My dives here."
    assert merged.body_md_commons == "Commons body."
    assert merged.lat == 44.0 and merged.name == "X"


def test_merge_empty_overlay_body_keeps_commons_body() -> None:
    merged = merge_site(base_site(), overlay(notes="n", body_md="  \n"))
    assert merged.body_md == "Commons body."
    assert merged.summary == "Commons summary."
    assert merged.default_map == "drawn:fra-x-1"


def test_overlay_never_overrides_objective_fields() -> None:
    sneaky = SiteOverlayRecord.model_validate(
        {"site_id": "fra-x", "extends": "commons", "lat": 1.0, "name": "Other", "type": "sea"}
    )
    merged = merge_site(base_site(), sneaky)
    assert (merged.lat, merged.name, merged.type) == (44.0, "X", "cave")


def test_split_then_merge_gives_the_record_back() -> None:
    record = base_site().model_copy(
        update={"notes": "n", "subsurface_uuid": "u", "reference_maps": ["reference:r.png"]}
    )
    core, personal = split_site(record)
    assert core.notes is None and core.reference_maps == [] and core.body_md == ""
    assert personal.notes == "n" and personal.body_md == "Commons body."
    assert personal.extends == "commons"
    merged = merge_site(core, personal)
    assert merged.model_dump() == record.model_dump()
    assert merged.body_md == record.body_md


def test_objective_changes() -> None:
    base = base_site()
    assert objective_changes(merge_site(base, None), base) == []
    moved = base.model_copy(update={"lat": 45.0, "location_visibility": "region_only"})
    assert objective_changes(moved, base) == ["lat", "location_visibility"]
    fewer = base.model_copy(update={"aliases": [], "maps": [], "media": []})
    assert objective_changes(fewer, base) == ["aliases", "maps", "media"]
    recaptioned = base.model_copy(deep=True)
    recaptioned.media[0].caption = "new"
    assert objective_changes(recaptioned, base) == ["media"]
    added = base.model_copy(
        update={"aliases": ["Ex", "Y"], "summary": "S", "notes": "n", "default_map": None}
    )
    assert objective_changes(added, base) == []


def test_overlay_for_holds_only_differences() -> None:
    base = base_site()
    record = merge_site(base, None)
    record.notes = "n"
    record.aliases.append("Y")
    record.media.append(MediaRef(id="p1", key="2026/01/p1.jpg"))
    result = overlay_for(record, base)
    assert result.notes == "n" and result.aliases == ["Y"]
    assert [m.id for m in result.media] == ["p1"]
    assert result.summary_override is None and result.default_map is None
    assert result.body_md == "" and result.maps == []


# ── origins and loading ────────────────────────────────────────────────────


def test_without_commons_every_site_is_log(store: Store) -> None:
    assert store.commons is None
    assert set(store.site_origin.values()) == {"log"}
    assert store.status == [] and store.dangling_sites == set()
    assert all(origin == "log" for origin in store.map_origin.values())


def test_origin_resolution(commons_store: Store) -> None:
    store = commons_store
    assert store.site_origin == {
        "ressel": "fork",
        "secret": "log",
        "zeelandbrug": "log",
        SITE: "commons",
    }
    assert store.sites["ressel"].name == "Ressel"
    assert store.sites[SITE].name == "Commons Spring"
    assert store.sites[SITE].body_md_commons.startswith("About the spring")
    assert store.errors == []
    assert "site ressel shadows the commons record" in store.status
    assert store.dives_by_site["ressel"] == [2]


def test_commons_regions_maps_and_seeds_join_the_view(commons_store: Store) -> None:
    store = commons_store
    assert {"fra-causses", "lot-karst", "zeeland-delta"} <= set(store.regions)
    assert store.maps_by_site[SITE] == [f"{SITE}-1"]
    assert store.map_origin[f"{SITE}-1"] == "commons"
    assert SITE in store.seed_maps and SITE not in store.log_sites.seed_maps


def test_commons_photo_keys_point_at_the_commons(commons_store: Store) -> None:
    photo = commons_store.sites[SITE].media[0]
    assert photo.key == f"commons:{PHOTO}"
    assert commons_store.media_owner[photo.id] == ("site", SITE)


def test_commons_name_from_manifest_or_folder(commons_root: Path, tmp_path: Path) -> None:
    assert CommonsSource(commons_root).name == "divelog-sites-fixture"
    bare = tmp_path / "bare-sites"
    bare.mkdir()
    assert CommonsSource(bare).name == "bare-sites"


def test_commons_rejects_overlays_and_personal_map_ids(commons_root: Path) -> None:
    write_overlay(commons_root, "fra-bad", {"notes": "x"})
    payload = read_json(commons_root / "maps" / "drawn" / f"{SITE}-1.json")
    payload["id"] = f"{SITE}-p1"
    write_json(commons_root / "maps" / "drawn" / f"{SITE}-p1.json", payload)
    source = CommonsSource(commons_root)
    errors = source.load()
    assert any("fra-bad.md" in e and "do not belong" in e for e in errors)
    assert any("personal map id" in e for e in errors)
    assert all(e.startswith("commons:") for e in errors)


def test_overlay_merges_on_load(commons_store: Store) -> None:
    write_overlay(
        commons_store.root,
        SITE,
        {"notes": "Cold.", "summary_override": "My favourite spring.", "aliases": ["Spring"]},
        "My dives here.",
    )
    commons_store.load()
    site = commons_store.sites[SITE]
    assert commons_store.site_origin[SITE] == "commons"
    assert site.notes == "Cold." and site.summary == "My favourite spring."
    assert site.aliases == ["La Source", "Spring"]
    assert site.body_md.strip() == "My dives here."
    assert site.body_md_commons.startswith("About the spring")
    assert SITE in commons_store.log_sites.overlays and SITE not in commons_store.log_sites.sites


def test_dangling_overlay_is_an_error_and_skipped(store: Store) -> None:
    write_overlay(store.root, "fra-ghost", {"notes": "x"})
    dive = store.dive_path(1)
    meta, body = read_markdown(dive)
    write_markdown(dive, {**meta, "site": "fra-ghost"}, body)
    store.load()
    assert "fra-ghost" not in store.sites
    assert store.dangling_sites == {"fra-ghost"}
    assert "sites/fra-ghost.md: overlay for fra-ghost has no commons record" in store.errors
    assert len(store.dives) == 4
    item = dive_service.list_item(store, store.dives[1], True)
    assert item.site is None
    out = dive_service.dive_out(store, store.dives[1], owner=True)
    assert out.site is None


async def test_dangling_overlay_keeps_pages_serving(store: Store, client: AsyncClient) -> None:
    write_overlay(store.root, "fra-ghost", {"notes": "x"})
    dive = store.dive_path(1)
    meta, body = read_markdown(dive)
    write_markdown(dive, {**meta, "site": "fra-ghost"}, body)
    store.load()
    assert (await client.get(f"{PUBLIC}/dives")).status_code == 200
    assert (await client.get(f"{PUBLIC}/dives/1")).status_code == 200
    assert (await client.get(f"{PUBLIC}/stats")).status_code == 200


def test_log_map_shadowing_a_commons_map_is_a_notice(commons_store: Store) -> None:
    source = commons_store.commons
    assert source is not None
    payload = read_json(source.root / "maps" / "drawn" / f"{SITE}-1.json")
    payload["title"] = "Mine"
    write_json(commons_store.map_path(f"{SITE}-1"), payload)
    commons_store.load()
    assert commons_store.map_origin[f"{SITE}-1"] == "log"
    assert commons_store.maps[f"{SITE}-1"].title == "Mine"
    assert f"map {SITE}-1 shadows the commons record" in commons_store.status


def test_log_region_shadowing_a_commons_region_is_a_notice(commons_store: Store) -> None:
    write_markdown(
        commons_store.region_path("fra-causses"),
        {"region": "fra-causses", "name": "My Causses", "country": "FRA"},
        "",
    )
    commons_store.load()
    assert commons_store.regions["fra-causses"].name == "My Causses"
    assert "region fra-causses shadows the commons record" in commons_store.status


# ── public output ──────────────────────────────────────────────────────────


async def test_site_out_carries_origin_and_attribution(commons_client: AsyncClient) -> None:
    response = await commons_client.get(f"{PUBLIC}/sites/{SITE}")
    assert response.status_code == 200, response.text
    site = response.json()["site"]
    assert site["origin"] == "commons"
    assert site["attribution"] == {
        "licence": "ODbL-1.0 + CC-BY-SA-4.0",
        "source": "divelog-sites-fixture",
        "ref": None,
    }
    assert site["region_name"] == "Les Causses"
    assert site["verified"] == "field"
    photo = site["attachments"][0]
    assert photo["url"] == f"/media/commons/{PHOTO}"
    assert photo["variants"]["thumb"] == "/media/commons/media/sites/fra-commons-only-thumb.webp"
    refs = {m["ref"]: m for m in site["maps"]}
    assert refs[f"drawn:{SITE}-1"]["drawn"]["revision"] == 2
    assert refs[f"seed:{SITE}"]["url"] == f"/media/commons/maps/seed/{SITE}.svg"
    assert site["maps"][0]["ref"] == f"drawn:{SITE}-1"


async def test_fork_and_log_sites_have_no_attribution(commons_client: AsyncClient) -> None:
    ressel = (await commons_client.get(f"{PUBLIC}/sites/ressel")).json()["site"]
    assert ressel["origin"] == "fork" and ressel["attribution"] is None
    zeeland = (await commons_client.get(f"{PUBLIC}/sites/zeelandbrug")).json()["site"]
    assert zeeland["origin"] == "log" and zeeland["attribution"] is None


async def test_attribution_ref_is_the_commons_head(
    commons_root: Path, commons_client: AsyncClient
) -> None:
    head = git_init(commons_root)
    from divelog_server.core import deps

    deps.get_store().load()
    site = (await commons_client.get(f"{PUBLIC}/sites/{SITE}")).json()["site"]
    assert site["attribution"]["ref"] == head


def test_media_url_for_commons_keys() -> None:
    assert media_url(f"commons:{PHOTO}") == f"/media/commons/{PHOTO}"
    assert media_url(variant_key(f"commons:{PHOTO}", "w800")) == (
        "/media/commons/media/sites/fra-commons-only-w800.webp"
    )
    assert media_url("repo:media/x.jpg") == "/media/repo/media/x.jpg"
    assert media_url("2026/01/x.jpg") == "/media/2026/01/x.jpg"


# ── write policy: sites ────────────────────────────────────────────────────


async def test_put_objective_change_on_commons_site_is_refused(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    site = await admin_site(commons_owner_client, SITE)
    response = await commons_owner_client.put(f"{ADMIN}/sites/{SITE}", json=site_in(site, lat=45.0))
    assert response.status_code == 422
    assert response.json() == {"detail": "commons site; fork to edit"}
    assert not commons_store.site_path(SITE).exists()
    assert commons_store.sites[SITE].lat == 44.6


async def test_put_with_fork_writes_a_full_record(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    site = await admin_site(commons_owner_client, SITE)
    response = await commons_owner_client.put(
        f"{ADMIN}/sites/{SITE}?fork=true", json=site_in(site, lat=45.0)
    )
    assert response.status_code == 200, response.text
    assert response.json()["origin"] == "fork" and response.json()["lat"] == 45.0
    meta, body = read_markdown(commons_store.site_path(SITE))
    assert meta["forked_from"] == "commons@1"
    assert meta["revision"] == 2
    assert [(c["revision"], c["note"]) for c in meta["changelog"]] == [
        (2, "Forked from commons revision 1")
    ]
    assert "extends" not in meta and meta["lat"] == 45.0 and meta["name"] == "Commons Spring"
    assert body.startswith("About the spring")
    assert commons_store.site_origin[SITE] == "fork"
    assert f"site {SITE} shadows the commons record" in commons_store.status
    commons_store.load()
    assert commons_store.site_origin[SITE] == "fork"


async def test_fork_records_the_commons_revision(
    commons_root: Path, commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    bump_commons(commons_root, SITE, 3)
    commons_store.load()
    site = await admin_site(commons_owner_client, SITE)
    response = await commons_owner_client.put(f"{ADMIN}/sites/{SITE}?fork=true", json=site_in(site))
    out = response.json()
    assert out["forked_from"] == "commons@3" and out["revision"] == 4
    assert [c["revision"] for c in out["changelog"]] == [4, 3, 2]
    assert out["changelog"][0]["note"] == "Forked from commons revision 3"
    assert out["changelog"][0]["author"] == get_settings().OWNER_NAME
    assert out["private"]["pin"] == {"pinned_revision": 3, "current_revision": 3, "stale": False}
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert meta["forked_from"] == "commons@3"
    assert commons_store.sites[SITE].forked_from_revision == 3


async def test_put_overlay_change_writes_an_overlay(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    site = await admin_site(commons_owner_client, SITE)
    payload = site_in(
        site,
        summary="My favourite spring.",
        notes="Bring a torch.",
        description_md="My dives here.",
        aliases=["La Source", "The Spring"],
    )
    response = await commons_owner_client.put(f"{ADMIN}/sites/{SITE}", json=payload)
    assert response.status_code == 200, response.text
    out = response.json()
    assert out["origin"] == "commons" and out["summary"] == "My favourite spring."
    assert out["description_md"] == "My dives here."
    assert out["private"]["notes"] == "Bring a torch."
    meta, body = read_markdown(commons_store.site_path(SITE))
    assert list(meta)[:2] == ["site_id", "extends"] and meta["extends"] == "commons"
    assert meta["summary_override"] == "My favourite spring."
    assert meta["notes"] == "Bring a torch." and meta["aliases"] == ["The Spring"]
    assert not {"lat", "lon", "name", "type", "media", "maps", "default_map"} & set(meta)
    assert body.strip() == "My dives here."
    commons_store.load()
    assert commons_store.sites[SITE].summary == "My favourite spring."
    assert commons_store.sites[SITE].body_md_commons.startswith("About the spring")


async def test_unchanged_put_on_commons_site_writes_nothing(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    site = await admin_site(commons_owner_client, SITE)
    response = await commons_owner_client.put(f"{ADMIN}/sites/{SITE}", json=site_in(site))
    assert response.status_code == 200, response.text
    assert not commons_store.site_path(SITE).exists()


async def test_patch_default_map_and_prices_write_the_overlay(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    response = await commons_owner_client.patch(
        f"{ADMIN}/sites/{SITE}",
        json={
            "default_map": f"seed:{SITE}",
            "prices": [{"date": "2025-05-01", "amount": 12, "currency": "EUR"}],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["default_map"] == f"seed:{SITE}"
    assert response.json()["maps"][0]["ref"] == f"seed:{SITE}"
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert meta["extends"] == "commons" and meta["default_map"] == f"seed:{SITE}"
    assert meta["prices"][0]["amount"] == 12


async def test_patch_location_visibility_on_commons_site_needs_a_fork(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    response = await commons_owner_client.patch(
        f"{ADMIN}/sites/{SITE}", json={"location_visibility": "region_only"}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "commons site; fork to edit"
    assert commons_store.sites[SITE].location_visibility == "exact"
    assert not commons_store.site_path(SITE).exists()


async def test_put_on_a_fork_and_a_log_site_writes_the_record(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    ressel = await admin_site(commons_owner_client, "ressel")
    response = await commons_owner_client.put(
        f"{ADMIN}/sites/ressel", json=site_in(ressel, lat=44.0)
    )
    assert response.status_code == 200, response.text
    assert response.json()["origin"] == "fork"
    meta, _ = read_markdown(commons_store.site_path("ressel"))
    assert meta["lat"] == 44.0 and "extends" not in meta


async def test_create_site_with_a_commons_id_conflicts(
    commons_owner_client: AsyncClient,
) -> None:
    response = await commons_owner_client.post(
        f"{ADMIN}/sites", json={"site_id": SITE, "name": "Clash", "country": "FRA"}
    )
    assert response.status_code == 409


async def test_delete_commons_site_removes_the_overlay_only(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    await commons_owner_client.patch(f"{ADMIN}/sites/{SITE}", json={"default_map": f"seed:{SITE}"})
    assert commons_store.site_path(SITE).exists()
    response = await commons_owner_client.delete(f"{ADMIN}/sites/{SITE}")
    assert response.status_code == 204
    assert not commons_store.site_path(SITE).exists()
    assert commons_store.site_origin[SITE] == "commons"
    assert commons_store.sites[SITE].default_map == f"drawn:{SITE}-1"


async def test_delete_fork_falls_back_to_the_commons(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    assert commons_store.dives_by_site["ressel"]
    response = await commons_owner_client.delete(f"{ADMIN}/sites/ressel")
    assert response.status_code == 204
    assert not commons_store.site_path("ressel").exists()
    assert commons_store.site_origin["ressel"] == "commons"
    assert commons_store.sites["ressel"].name == "Émergence du Ressel"
    assert "site ressel shadows the commons record" not in commons_store.status
    dive = (await commons_owner_client.get(f"{PUBLIC}/dives/2")).json()
    assert dive["site"]["origin"] == "commons"


async def test_delete_log_site_with_dives_still_conflicts(
    commons_owner_client: AsyncClient,
) -> None:
    response = await commons_owner_client.delete(f"{ADMIN}/sites/zeelandbrug")
    assert response.status_code == 409


async def test_site_photo_upload_on_commons_site_goes_to_the_overlay(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    jpeg = (Path(__file__).parent / "fixtures" / "commons" / PHOTO).read_bytes()
    response = await commons_owner_client.post(
        f"{ADMIN}/sites/{SITE}/attachments",
        files={"file": ("mine.jpg", jpeg, "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    media_id = response.json()["id"]
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert meta["extends"] == "commons"
    assert [m["id"] for m in meta["media"]] == [media_id]
    site = await admin_site(commons_owner_client, SITE)
    assert [a["id"] for a in site["attachments"]] == ["commons-photo-1", media_id]

    caption = await commons_owner_client.patch(
        f"{ADMIN}/attachments/{media_id}", json={"caption": "Mine"}
    )
    assert caption.status_code == 200
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert meta["media"][0]["caption"] == "Mine"

    removed = await commons_owner_client.delete(f"{ADMIN}/attachments/{media_id}")
    assert removed.status_code == 204
    assert not commons_store.site_path(SITE).exists()


async def test_commons_photo_cannot_be_changed_or_removed(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    caption = await commons_owner_client.patch(
        f"{ADMIN}/attachments/commons-photo-1", json={"caption": "Mine"}
    )
    assert caption.status_code == 422
    removed = await commons_owner_client.delete(f"{ADMIN}/attachments/commons-photo-1")
    assert removed.status_code == 422
    assert commons_store.sites[SITE].media[0].caption == ""
    assert not commons_store.site_path(SITE).exists()


async def test_dive_on_a_commons_site(commons_owner_client: AsyncClient) -> None:
    payload = {
        "number": 5,
        "title": "Spring dive",
        "date": "2025-06-02",
        "duration_min": 40,
        "max_depth_m": 12,
        "site_id": SITE,
        "visibility": "public",
    }
    created = await commons_owner_client.post(f"{ADMIN}/dives", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["site"]["origin"] == "commons"
    assert created.json()["country"] == "FRA"
    site = (await commons_owner_client.get(f"{PUBLIC}/sites/{SITE}")).json()
    assert site["site"]["dives"] == 1 and [d["number"] for d in site["dives"]] == [5]


# ── write policy: maps and regions ─────────────────────────────────────────


async def test_new_map_on_commons_site_gets_a_personal_id(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    first = await commons_owner_client.post(
        f"{ADMIN}/sites/{SITE}/maps", json={"data": stick("x", "y")}
    )
    assert first.status_code == 201, first.text
    assert first.json()["id"] == f"{SITE}-p1"
    assert commons_store.map_path(f"{SITE}-p1").exists()
    assert commons_store.map_origin[f"{SITE}-p1"] == "log"
    second = await commons_owner_client.post(
        f"{ADMIN}/sites/{SITE}/maps", json={"data": stick("x", "y")}
    )
    assert second.json()["id"] == f"{SITE}-p2"
    assert commons_store.maps_by_site[SITE] == [f"{SITE}-1", f"{SITE}-p1", f"{SITE}-p2"]
    edit = await commons_owner_client.put(
        f"{ADMIN}/maps/{SITE}-p1", json={"data": stick("x", "y", "z")}
    )
    assert edit.status_code == 200 and edit.json()["revision"] == 2


async def test_new_map_on_fork_and_log_sites(commons_owner_client: AsyncClient) -> None:
    fork = await commons_owner_client.post(
        f"{ADMIN}/sites/ressel/maps", json={"data": stick("x", "y")}
    )
    assert fork.json()["id"] == "ressel-p1"
    log = await commons_owner_client.post(
        f"{ADMIN}/sites/zeelandbrug/maps", json={"data": stick("x", "y")}
    )
    assert log.json()["id"] == "zeelandbrug-1"


async def test_commons_map_cannot_be_edited_or_deleted(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    edit = await commons_owner_client.put(f"{ADMIN}/maps/{SITE}-1", json={"data": stick("x", "y")})
    assert edit.status_code == 422
    assert "commons map" in edit.json()["detail"]
    gone = await commons_owner_client.delete(f"{ADMIN}/maps/{SITE}-1")
    assert gone.status_code == 422
    assert not commons_store.map_path(f"{SITE}-1").exists()
    assert commons_store.maps[f"{SITE}-1"].revision == 2


async def test_map_order_leaves_commons_maps_alone(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    created = await commons_owner_client.post(
        f"{ADMIN}/sites/{SITE}/maps", json={"data": stick("x", "y")}
    )
    personal = created.json()["id"]
    response = await commons_owner_client.put(
        f"{ADMIN}/sites/{SITE}/maps/order", json=[personal, f"{SITE}-1"]
    )
    assert response.status_code == 200, response.text
    assert not commons_store.map_path(f"{SITE}-1").exists()
    assert read_json(commons_store.map_path(personal))["sort"] == 0


async def test_commons_region_cannot_be_deleted(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    used = await commons_owner_client.delete(f"{ADMIN}/regions/fra-causses")
    assert used.status_code == 409
    with pytest.raises(CommonsEditError):
        await commons_store.delete_region("fra-causses", "gone")
    regions = (await commons_owner_client.get(f"{ADMIN}/regions")).json()
    assert "fra-causses" in {r["id"] for r in regions}


async def test_editing_a_commons_region_writes_a_log_copy(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    response = await commons_owner_client.put(
        f"{ADMIN}/regions/fra-causses",
        json={"id": "fra-causses", "name": "My Causses", "country": "FRA"},
    )
    assert response.status_code == 200, response.text
    assert commons_store.region_path("fra-causses").exists()
    assert commons_store.regions["fra-causses"].name == "My Causses"
    assert "region fra-causses shadows the commons record" in commons_store.status


# ── annotations ────────────────────────────────────────────────────────────


def annotate(store: Store, revision: int, route: list[tuple[str, str]]) -> None:
    path = store.dive_path(1)
    meta, body = read_markdown(path)
    meta["site"] = SITE
    meta["map_annotation"] = {
        "map_id": f"{SITE}-1",
        "revision": revision,
        "route": [{"from": a, "to": b} for a, b in route],
    }
    write_markdown(path, meta, body)
    store.load()


def test_annotation_stale_and_dropped_legs(commons_store: Store) -> None:
    annotate(commons_store, 1, [("a", "b"), ("old-b", "c"), ("x", "c")])
    out = dive_service.dive_out(commons_store, commons_store.dives[1], owner=True)
    assert out.annotation_stale is True
    assert out.annotation_dropped_legs == 1


def test_annotation_current_revision_is_fresh(commons_store: Store) -> None:
    annotate(commons_store, 2, [("a", "b"), ("b", "c")])
    out = dive_service.dive_out(commons_store, commons_store.dives[1], owner=True)
    assert out.annotation_stale is False
    assert out.annotation_dropped_legs == 0


def test_annotation_on_a_missing_map(store: Store) -> None:
    annotate(store, 1, [("a", "b"), ("b", "c")])
    out = dive_service.dive_out(store, store.dives[1], owner=True)
    assert out.annotation_stale is True and out.annotation_dropped_legs == 2


async def test_dive_without_annotation_is_not_stale(client: AsyncClient) -> None:
    dive = (await client.get(f"{PUBLIC}/dives/1")).json()
    assert dive["annotation_stale"] is False and dive["annotation_dropped_legs"] == 0


# ── media ──────────────────────────────────────────────────────────────────


async def test_commons_file_is_served_with_an_etag(commons_client: AsyncClient) -> None:
    response = await commons_client.get(f"/media/commons/{PHOTO}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["cache-control"] == "public, max-age=86400"
    etag = response.headers["etag"]
    again = await commons_client.get(f"/media/commons/{PHOTO}", headers={"If-None-Match": etag})
    assert again.status_code == 304
    seed = await commons_client.get(f"/media/commons/maps/seed/{SITE}.svg")
    assert seed.status_code == 200


async def test_commons_etag_follows_the_head(
    commons_root: Path, commons_client: AsyncClient
) -> None:
    before = (await commons_client.get(f"/media/commons/{PHOTO}")).headers["etag"]
    git_init(commons_root)
    from divelog_server.core import deps

    deps.get_store().load()
    after = (await commons_client.get(f"/media/commons/{PHOTO}")).headers["etag"]
    assert before != after


async def test_commons_media_outside_public_dirs_is_404(commons_client: AsyncClient) -> None:
    for path in (f"sites/{SITE}.md", "divelog.yaml", "media/nope.jpg"):
        assert (await commons_client.get(f"/media/commons/{path}")).status_code == 404, path
    from divelog_server.core import deps

    store = deps.get_store()
    assert store.commons_file(f"media/../media/{PHOTO[6:]}") is None
    assert store.commons_file(f"/{PHOTO}") is None
    assert store.commons_file(PHOTO) is not None


async def test_commons_media_without_commons_is_404(client: AsyncClient) -> None:
    assert (await client.get(f"/media/commons/{PHOTO}")).status_code == 404


async def test_commons_variant_is_rendered_once_and_cached(
    commons_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = "/media/commons/media/sites/fra-commons-only-thumb.webp"
    response = await commons_client.get(url)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/webp"
    assert response.headers["etag"]
    cache = Path(get_settings().STATE_DIR) / "variants"
    names = sorted(p.name.rsplit("-", 1)[1] for p in cache.glob("*.webp"))
    assert names == ["thumb.webp", "w800.webp"]

    def boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("rendered twice")

    monkeypatch.setattr("divelog_server.api.v1.media.process_image", boom)
    assert (await commons_client.get(url)).status_code == 200
    w800 = await commons_client.get("/media/commons/media/sites/fra-commons-only-w800.webp")
    assert w800.status_code == 200


async def test_commons_variant_that_cannot_exist_is_404(commons_client: AsyncClient) -> None:
    big = await commons_client.get("/media/commons/media/sites/fra-commons-only-w1600.webp")
    assert big.status_code == 404
    missing = await commons_client.get("/media/commons/media/sites/nothing-thumb.webp")
    assert missing.status_code == 404


# ── repository status ──────────────────────────────────────────────────────


async def test_repo_status_reports_the_commons(commons_owner_client: AsyncClient) -> None:
    status = (await commons_owner_client.get(f"{ADMIN}/repo/status")).json()
    assert status["commons_head"] is None
    assert status["commons_state"] == "disabled"
    assert "site ressel shadows the commons record" in status["notices"]


async def test_repo_status_without_commons(owner_client: AsyncClient) -> None:
    status = (await owner_client.get(f"{ADMIN}/repo/status")).json()
    assert status["commons_head"] is None and status["commons_state"] is None
    assert status["notices"] == []


async def test_repo_reload_rereads_the_commons(
    commons_root: Path, commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    head = git_init(commons_root)
    status = (await commons_owner_client.post(f"{ADMIN}/repo/reload")).json()
    assert status["commons_head"] == head


async def test_readonly_git_never_commits(tmp_path: Path) -> None:
    root = tmp_path / "ro"
    root.mkdir()
    (root / "a.txt").write_text("a")
    git_init(root)
    repo = GitRepo(root, author_name="t", author_email="t@e", readonly=True)
    (root / "b.txt").write_text("b")
    assert await repo.commit("nope") is False
    assert await repo.push() is False
    status = await repo.status()
    assert status["state"] == "dirty"
    (root / "b.txt").unlink()
    assert (await repo.status())["state"] == "clean"


# ── revisions and pins ─────────────────────────────────────────────────────


def pin_of(store: Store, site_id: str) -> tuple[int | None, int, bool] | None:
    pin = store.site_pin_state(site_id)
    return None if pin is None else (pin.pinned_revision, pin.current_revision, pin.stale)


def test_fixture_commons_ressel_is_at_revision_two(commons_store: Store) -> None:
    source = commons_store.commons
    assert source is not None
    ressel = source.sites["ressel"]
    assert ressel.revision == 2
    assert [(c.revision, c.author) for c in ressel.changelog] == [(2, "Commons Editor")]
    assert source.sites[SITE].revision == 1 and source.sites[SITE].changelog == []


def test_merge_keeps_the_base_revision_and_changelog() -> None:
    base = base_site().model_copy(update={"revision": 2})
    base.changelog = [ChangeEntry(revision=2, date=date(2026, 9, 1), note="Moved")]
    sneaky = SiteOverlayRecord.model_validate(
        {
            "site_id": "fra-x",
            "extends": "commons",
            "base_revision": 1,
            "revision": 7,
            "changelog": [{"revision": 7, "date": "2026-01-01", "note": "mine"}],
        }
    )
    merged = merge_site(base, sneaky)
    assert merged.revision == 2 and [c.note for c in merged.changelog] == ["Moved"]
    assert merged.base_revision == 1
    assert merge_site(base, None).base_revision is None
    core, personal = split_site(merged)
    assert core.revision == 2 and personal.base_revision == 2


def test_overlay_for_keeps_or_sets_the_pin() -> None:
    base = base_site().model_copy(update={"revision": 3})
    record = merge_site(base, None)
    record.notes = "n"
    assert overlay_for(record, base).base_revision == 3
    assert overlay_for(record, base, 2).base_revision == 2


def test_pin_states_for_the_three_origins(commons_root: Path, commons_store: Store) -> None:
    assert pin_of(commons_store, "zeelandbrug") is None
    assert pin_of(commons_store, "ressel") == (None, 2, True)
    assert pin_of(commons_store, SITE) == (None, 1, False)
    write_overlay(commons_root.parent / "data", SITE, {"notes": "n"})
    commons_store.load()
    assert pin_of(commons_store, SITE) == (None, 1, False)
    bump_commons(commons_root, SITE, 2)
    commons_store.load()
    assert pin_of(commons_store, SITE) == (None, 2, True)
    write_overlay(commons_root.parent / "data", SITE, {"notes": "n", "base_revision": 2})
    commons_store.load()
    assert pin_of(commons_store, SITE) == (2, 2, False)
    bump_commons(commons_root, SITE, 3)
    commons_store.load()
    assert pin_of(commons_store, SITE) == (2, 3, True)
    assert commons_store.sites[SITE].base_revision == 2


def test_fork_pins_from_forked_from(commons_store: Store) -> None:
    path = commons_store.site_path("ressel")
    meta, body = read_markdown(path)
    write_markdown(path, {**meta, "forked_from": "commons@ab12f3c"}, body)
    commons_store.load()
    assert pin_of(commons_store, "ressel") == (None, 2, True)
    write_markdown(path, {**meta, "forked_from": "commons@1"}, body)
    commons_store.load()
    assert pin_of(commons_store, "ressel") == (1, 2, True)
    write_markdown(path, {**meta, "forked_from": "commons@2"}, body)
    commons_store.load()
    assert pin_of(commons_store, "ressel") == (2, 2, False)
    assert not any(n.startswith("ressel:") for n in commons_store.status)


def test_stale_pins_are_status_notices(commons_root: Path, commons_store: Store) -> None:
    assert "ressel: fork not pinned to a commons revision, commons is at 2" in commons_store.status
    write_overlay(commons_root.parent / "data", SITE, {"notes": "n", "base_revision": 2})
    bump_commons(commons_root, SITE, 3)
    commons_store.load()
    assert f"{SITE}: overlay pinned to commons revision 2, commons is at 3" in (
        commons_store.status
    )


def test_without_commons_nothing_is_pinned(store: Store) -> None:
    assert all(store.site_pin_state(s) is None for s in store.sites)
    assert store.site_pin_state("nope") is None


def test_bad_changelog_is_a_load_error(commons_root: Path, commons_store: Store) -> None:
    path = commons_root / "sites" / f"{SITE}.md"
    meta, body = read_markdown(path)
    write_markdown(
        path,
        {**meta, "revision": 2, "changelog": [{"revision": 1, "date": "2026-01-01", "note": "x"}]},
        body,
    )
    log_path = commons_store.site_path("zeelandbrug")
    meta, body = read_markdown(log_path)
    write_markdown(log_path, {**meta, "revision": 0}, body)
    commons_store.load()
    assert SITE not in commons_store.sites and "zeelandbrug" not in commons_store.sites
    assert any(e.startswith(f"commons:sites/{SITE}.md") for e in commons_store.errors)
    assert any(e.startswith("sites/zeelandbrug.md") for e in commons_store.errors)
    source = CommonsSource(commons_root)
    assert any(f"{SITE}.md" in e and "changelog" in e for e in source.load())


async def test_overlay_first_write_pins_and_later_writes_keep_the_pin(
    commons_root: Path, commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    bump_commons(commons_root, SITE, 2)
    commons_store.load()
    site = await admin_site(commons_owner_client, SITE)
    response = await commons_owner_client.put(
        f"{ADMIN}/sites/{SITE}", json=site_in(site, notes="Cold.")
    )
    assert response.status_code == 200, response.text
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert list(meta)[:3] == ["site_id", "extends", "base_revision"]
    assert meta["base_revision"] == 2 and "revision" not in meta
    assert response.json()["private"]["pin"] == {
        "pinned_revision": 2,
        "current_revision": 2,
        "stale": False,
    }
    bump_commons(commons_root, SITE, 3)
    commons_store.load()
    site = await admin_site(commons_owner_client, SITE)
    assert site["revision"] == 3 and site["private"]["pin"]["stale"] is True
    await commons_owner_client.patch(
        f"{ADMIN}/sites/{SITE}", json={"prices": [{"date": "2025-05-01", "amount": 9}]}
    )
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert meta["base_revision"] == 2


async def test_objective_save_of_a_log_site_bumps_the_revision(
    store: Store, owner_client: AsyncClient
) -> None:
    site = await admin_site(owner_client, "zeelandbrug")
    assert site["revision"] == 1 and site["changelog"] == []
    response = await owner_client.put(f"{ADMIN}/sites/zeelandbrug", json=site_in(site, lat=51.7))
    out = response.json()
    assert out["revision"] == 2
    assert out["changelog"] == [
        {
            "revision": 2,
            "date": date.today().isoformat(),
            "author": get_settings().OWNER_NAME,
            "note": "Update site zeelandbrug",
        }
    ]
    meta, _ = read_markdown(store.site_path("zeelandbrug"))
    assert meta["revision"] == 2 and meta["changelog"][0]["note"] == "Update site zeelandbrug"
    keys = list(meta)
    assert keys.index("geo_source") < keys.index("revision") < keys.index("changelog")


async def test_preference_save_does_not_bump(store: Store, owner_client: AsyncClient) -> None:
    site = await admin_site(owner_client, "zeelandbrug")
    response = await owner_client.put(
        f"{ADMIN}/sites/zeelandbrug",
        json=site_in(
            site, summary="Mine.", notes="Bring a torch.", aliases=[*site["aliases"], "ZB"]
        ),
    )
    assert response.json()["revision"] == 1
    patched = await owner_client.patch(
        f"{ADMIN}/sites/zeelandbrug", json={"prices": [{"date": "2025-05-01", "amount": 9}]}
    )
    assert patched.json()["revision"] == 1 and patched.json()["changelog"] == []
    meta, _ = read_markdown(store.site_path("zeelandbrug"))
    assert meta["revision"] == 1 and "changelog" not in meta


async def test_put_cannot_set_or_rewind_the_revision(
    store: Store, owner_client: AsyncClient
) -> None:
    site = await admin_site(owner_client, "zeelandbrug")
    await owner_client.put(f"{ADMIN}/sites/zeelandbrug", json=site_in(site, lat=51.7))
    await owner_client.put(f"{ADMIN}/sites/zeelandbrug", json=site_in(site, lat=51.8))
    assert store.sites["zeelandbrug"].revision == 3
    stale_form = site_in(site, lat=51.8, revision=1, changelog=[])
    response = await owner_client.put(f"{ADMIN}/sites/zeelandbrug", json=stale_form)
    assert response.status_code == 200, response.text
    assert response.json()["revision"] == 3 and len(response.json()["changelog"]) == 2
    forged = site_in(
        site, lat=51.8, revision=9, changelog=[{"revision": 9, "date": "2026-01-01", "note": "x"}]
    )
    response = await owner_client.put(f"{ADMIN}/sites/zeelandbrug", json=forged)
    assert response.json()["revision"] == 3


async def test_new_and_imported_sites_start_at_revision_one(
    store: Store, owner_client: AsyncClient
) -> None:
    response = await owner_client.post(
        f"{ADMIN}/sites",
        json={"site_id": "nld-new", "name": "New", "country": "NLD", "revision": 5},
    )
    assert response.status_code == 201, response.text
    assert response.json()["revision"] == 1 and response.json()["changelog"] == []
    meta, _ = read_markdown(store.site_path("nld-new"))
    assert meta["revision"] == 1 and "changelog" not in meta
    record = SiteRecord(site_id="nld-imported", name="Imported", revision=4)
    saved = await store.save_site(record, "Import site nld-imported")
    assert saved.revision == 1 and saved.changelog == []


async def test_save_on_a_fork_bumps_its_own_revision(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    site = await admin_site(commons_owner_client, SITE)
    await commons_owner_client.put(f"{ADMIN}/sites/{SITE}?fork=true", json=site_in(site))
    forked = await admin_site(commons_owner_client, SITE)
    response = await commons_owner_client.put(
        f"{ADMIN}/sites/{SITE}", json=site_in(forked, lat=45.0)
    )
    out = response.json()
    assert out["origin"] == "fork" and out["revision"] == 3
    assert out["forked_from"] == "commons@1"
    assert [c["note"] for c in out["changelog"]] == [
        f"Update site {SITE}",
        "Forked from commons revision 1",
    ]


async def test_pin_an_overlay(
    commons_root: Path, commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    write_overlay(commons_root.parent / "data", SITE, {"notes": "n", "base_revision": 2})
    bump_commons(commons_root, SITE, 3)
    commons_store.load()
    response = await commons_owner_client.post(f"{ADMIN}/sites/{SITE}/pin")
    assert response.status_code == 200, response.text
    out = response.json()
    assert out["private"]["pin"] == {"pinned_revision": 3, "current_revision": 3, "stale": False}
    assert out["revision"] == 3 and out["origin"] == "commons"
    assert out["private"]["notes"] == "n"
    meta, _ = read_markdown(commons_store.site_path(SITE))
    assert meta["base_revision"] == 3 and meta["notes"] == "n"
    assert not any(n.startswith(f"{SITE}:") for n in commons_store.status)


async def test_pin_a_fork(commons_store: Store, commons_owner_client: AsyncClient) -> None:
    response = await commons_owner_client.post(f"{ADMIN}/sites/ressel/pin")
    assert response.status_code == 200, response.text
    out = response.json()
    assert out["origin"] == "fork" and out["forked_from"] == "commons@2"
    assert out["revision"] == 2
    assert out["changelog"][0]["note"] == "Reviewed against commons revision 2"
    assert out["private"]["pin"] == {"pinned_revision": 2, "current_revision": 2, "stale": False}
    meta, _ = read_markdown(commons_store.site_path("ressel"))
    assert meta["forked_from"] == "commons@2" and meta["name"] == "Ressel"
    status = (await commons_owner_client.get(f"{ADMIN}/repo/status")).json()
    assert not any(n.startswith("ressel:") for n in status["notices"])


async def test_pin_needs_something_pinned(commons_owner_client: AsyncClient) -> None:
    for site_id in ("zeelandbrug", SITE, "nope"):
        response = await commons_owner_client.post(f"{ADMIN}/sites/{site_id}/pin")
        assert response.status_code == 404, site_id


async def test_pin_without_commons_is_404(owner_client: AsyncClient) -> None:
    response = await owner_client.post(f"{ADMIN}/sites/ressel/pin")
    assert response.status_code == 404


async def test_pin_is_owner_only(commons_client: AsyncClient) -> None:
    response = await commons_client.post(f"{ADMIN}/sites/ressel/pin")
    assert response.status_code in (401, 403)


async def test_site_out_carries_revision_and_provenance(
    commons_client: AsyncClient, commons_owner_client: AsyncClient
) -> None:
    ressel = (await commons_client.get(f"{PUBLIC}/sites/ressel")).json()["site"]
    assert ressel["revision"] == 1 and ressel["changelog"] == []
    assert ressel["forked_from"] is None and ressel["private"] is None
    listed = (await commons_owner_client.get(f"{ADMIN}/sites")).json()
    by_id = {s["id"]: s for s in listed}
    assert by_id["ressel"]["private"]["pin"]["stale"] is True
    assert by_id["zeelandbrug"]["private"]["pin"] is None


async def test_map_update_adds_a_changelog_entry(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    created = await commons_owner_client.post(
        f"{ADMIN}/sites/{SITE}/maps", json={"data": stick("x", "y")}
    )
    assert created.json()["revision"] == 1 and created.json()["changelog"] == []
    map_id = created.json()["id"]
    edit = await commons_owner_client.put(
        f"{ADMIN}/maps/{map_id}", json={"data": stick("x", "y", "z"), "note": "Added z"}
    )
    assert edit.json()["revision"] == 2
    assert [(c["revision"], c["note"]) for c in edit.json()["changelog"]] == [(2, "Added z")]
    again = await commons_owner_client.put(
        f"{ADMIN}/maps/{map_id}", json={"data": stick("x", "y", "z", "w")}
    )
    assert [c["revision"] for c in again.json()["changelog"]] == [3, 2]
    payload = read_json(commons_store.map_path(map_id))
    keys = list(payload)
    assert keys[keys.index("revision") + 1] == "changelog"
    assert payload["changelog"][0]["note"] == "Updated the drawing"


async def test_site_photo_reorder_on_commons_site_needs_a_fork(
    commons_store: Store, commons_owner_client: AsyncClient
) -> None:
    jpeg = (Path(__file__).parent / "fixtures" / "commons" / PHOTO).read_bytes()
    response = await commons_owner_client.post(
        f"{ADMIN}/sites/{SITE}/attachments",
        files={"file": ("mine.jpg", jpeg, "image/jpeg")},
    )
    media_id = response.json()["id"]
    reorder = await commons_owner_client.put(
        f"{ADMIN}/sites/{SITE}/attachments/order", json=[media_id, "commons-photo-1"]
    )
    assert reorder.status_code == 422
    site = await admin_site(commons_owner_client, SITE)
    assert [a["id"] for a in site["attachments"]] == ["commons-photo-1", media_id]
