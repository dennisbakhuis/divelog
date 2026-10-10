"""Owner endpoints over the site commons: pull it (and pin the log) and search it to adopt."""

from fastapi import APIRouter, Depends, HTTPException, Query

from divelog_server.core.deps import StoreDep, require_owner
from divelog_server.schemas.commons import CommonsPullOut, CommonsSiteHit, CommonsStaleSite
from divelog_server.store.commons_sync import (
    newly_stale,
    parse_near,
    pin_manifest,
    search,
    stale_sites,
)
from divelog_server.store.loader import git_head

router = APIRouter(dependencies=[Depends(require_owner)])


@router.post("/pull", response_model=CommonsPullOut)
async def admin_commons_pull(store: StoreDep) -> CommonsPullOut:
    """Fast-forward the commons checkout, pin ``divelog.yaml`` to it, list the stale sites.

    409 when there is no commons, ``COMMONS_GIT_ENABLED`` is off, or git refuses the pull.
    """
    commons = store.commons
    if commons is None:
        raise HTTPException(status_code=409, detail="no commons configured")
    if not commons.git.enabled:
        raise HTTPException(status_code=409, detail="commons git is disabled")
    before = stale_sites(store)
    previous = store.commons_head()
    ok, out = await commons.git.pull()
    if not ok:
        raise HTTPException(status_code=409, detail=f"commons: {out}")
    head = git_head(commons.root)
    pinned = False
    if head:
        async with store.lock:
            pinned = pin_manifest(store.root, head)
        if pinned:
            await store.git.commit(f"Pin the commons at {head}")
    await store.reload()
    stale = newly_stale(before, stale_sites(store))
    return CommonsPullOut(
        previous_head=previous,
        head=head,
        pinned=pinned,
        stale=[
            CommonsStaleSite(
                site_id=s.site_id,
                origin=s.origin,
                pinned_revision=s.pinned_revision,
                current_revision=s.current_revision,
                new=s.new,
            )
            for s in stale
        ],
    )


@router.get("/sites", response_model=list[CommonsSiteHit])
async def admin_commons_sites(
    store: StoreDep,
    q: str = "",
    near: str | None = Query(default=None, description="lat,lon; sites within 25 km"),
    limit: int = Query(default=20, ge=1, le=200),
) -> list[CommonsSiteHit]:
    """Adopt-a-site search: commons sites by name, alias or area, or near a point."""
    point = None
    if near:
        try:
            point = parse_near(near)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    return [
        CommonsSiteHit(
            id=hit.site_id,
            name=hit.name,
            country=hit.country,
            type=hit.type,
            lat=hit.lat,
            lon=hit.lon,
            area=hit.area,
            dives=hit.dives,
            has_dives=hit.dives > 0,
            origin=hit.origin,
            distance_km=hit.distance_km,
        )
        for hit in search(store, q, point, limit)
    ]
