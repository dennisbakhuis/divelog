"""Match an imported dive site against the merged site index before a personal one is created.

The rules, in order: the Subsurface UUID (or a site id equal to it), then a case-insensitive
name or alias, then the nearest placed site within :data:`MATCH_RADIUS_M`. A name shared by
several sites goes to the nearest of them when the import is placed, else to the first id.
:func:`nearby`, the "already known?" list of the admin, uses the forgiving admin search for
the name instead.
"""

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal

from divelog_server.importers.subsurface import DraftSite
from divelog_server.services.dives import haversine_km
from divelog_server.store.models import SiteRecord
from divelog_server.store.site_search import NAME_KINDS, SearchScore, SiteIndex, match, words

MATCH_RADIUS_M = 300.0

MatchedBy = Literal["uuid", "name", "alias", "distance"]


@dataclass(frozen=True)
class SiteMatch:
    """An existing site an imported one resolves to, and the rule that found it."""

    site_id: str
    matched_by: MatchedBy
    distance_m: float | None = None


def _key(value: str) -> str:
    return " ".join(value.casefold().split())


def _distance_m(draft: DraftSite, site: SiteRecord) -> float | None:
    if draft.lat is None or draft.lon is None or site.lat is None or site.lon is None:
        return None
    return haversine_km(draft.lat, draft.lon, site.lat, site.lon) * 1000


def _pick(draft: DraftSite, candidates: list[SiteRecord], rule: MatchedBy) -> SiteMatch | None:
    if not candidates:
        return None

    def rank(site: SiteRecord) -> tuple[float, str]:
        distance = _distance_m(draft, site)
        return (distance if distance is not None else float("inf"), site.site_id)

    best = min(candidates, key=rank)
    distance = _distance_m(draft, best)
    return SiteMatch(best.site_id, rule, round(distance) if distance is not None else None)


def match_site(
    draft: DraftSite, sites: Mapping[str, SiteRecord], radius_m: float = MATCH_RADIUS_M
) -> SiteMatch | None:
    """The existing site an imported site is, or None when a personal one has to be created.

    Parameters
    ----------
    draft
        The site as the Subsurface export describes it.
    sites
        The merged site index: log, fork and commons records.
    radius_m
        Largest distance for a match by position alone.

    Returns
    -------
    SiteMatch or None
        ``distance_m`` is set, in whole metres, whenever both ends are placed.
    """
    if draft.uuid:
        for site in sites.values():
            if site.subsurface_uuid == draft.uuid or site.site_id == draft.uuid:
                return SiteMatch(site.site_id, "uuid")
    name = _key(draft.name)
    by_name = [
        s
        for s in sites.values()
        if name in {_key(n) for n in (s.name, s.full_name, s.short_name) if n}
    ]
    if found := _pick(draft, by_name, "name"):
        return found
    by_alias = [s for s in sites.values() if name in {_key(a) for a in s.aliases}]
    if found := _pick(draft, by_alias, "alias"):
        return found
    placed = [
        (d, s) for s in sites.values() if (d := _distance_m(draft, s)) is not None and d <= radius_m
    ]
    if not placed:
        return None
    distance, site = min(placed, key=lambda item: (item[0], item[1].site_id))
    return SiteMatch(site.site_id, "distance", round(distance))


def nearby(
    name: str | None,
    lat: float | None,
    lon: float | None,
    sites: Iterable[SiteRecord],
    radius_m: float = MATCH_RADIUS_M,
    index: SiteIndex | None = None,
) -> list[SiteMatch]:
    """Every site that could be the one described: a matching name or alias, or within reach.

    Unlike :func:`match_site`, which only takes an exact name, the name rule is the admin
    search of :mod:`~divelog_server.store.site_search` over names and aliases: every word of
    ``name`` has to match, typos allowed. A name rule wins over the distance rule for the same
    site.

    Parameters
    ----------
    name
        The name being typed, or None.
    lat, lon
        The point being placed, or None.
    sites
        The sites to look through.
    radius_m
        Largest distance for a match by position alone.
    index
        A prebuilt search index that covers ``sites`` (it may hold more); built from
        ``sites`` when omitted.

    Returns
    -------
    list[SiteMatch]
        Nearest first (unplaced ones last), then the best name match, then by site id;
        ``distance_m`` in whole metres whenever both ends are placed. ``matched_by`` is
        ``name`` when every word matched a name, ``alias`` when an alias was needed.
    """
    records = list(sites)
    scores: dict[str, SearchScore] = {}
    if name and words(name):
        scores = match(name, index if index is not None else SiteIndex.of(records), NAME_KINDS)
    point = DraftSite(uuid="", name=name or "", lat=lat, lon=lon)
    found: list[tuple[tuple[bool, float, float], SiteMatch]] = []
    for site in records:
        distance = _distance_m(point, site)
        score = scores.get(site.site_id)
        rule: MatchedBy | None = None
        if score is not None:
            rule = "name" if score.by_name else "alias"
        elif distance is not None and distance <= radius_m:
            rule = "distance"
        if rule is not None:
            found.append(
                (
                    score.rank if score is not None else (True, math.inf, math.inf),
                    SiteMatch(
                        site.site_id, rule, round(distance) if distance is not None else None
                    ),
                )
            )
    found.sort(
        key=lambda item: (
            item[1].distance_m is None,
            item[1].distance_m or 0.0,
            item[0],
            item[1].site_id,
        )
    )
    return [m for _, m in found]
