"""Combine a commons site with the personal overlay of the log, and take a full record apart.

An overlay replaces the personal fields, adds aliases, maps and photos, can prefer another
default map, override the summary and carry a personal body. It never changes an objective
field (that takes a fork), nor the commons ``revision`` and ``changelog``.
"""

from typing import Any

from divelog_server.store.models import SiteCore, SiteOverlayRecord, SiteRecord

PERSONAL_FIELDS = ("reference_maps", "prices", "notes", "subsurface_uuid")
ADDITIVE_FIELDS = ("aliases", "maps", "media")
PREFERENCE_FIELDS = ("site_id", "summary", "default_map", *ADDITIVE_FIELDS)
VERSION_FIELDS = ("revision", "changelog")
OBJECTIVE_FIELDS = tuple(
    name for name in SiteCore.model_fields if name not in (*PREFERENCE_FIELDS, *VERSION_FIELDS)
)


def _dump(record: SiteRecord, name: str) -> Any:
    return record.model_dump(mode="json", include={name}).get(name)


def merge_site(base: SiteRecord, overlay: SiteOverlayRecord | None) -> SiteRecord:
    """The commons record ``base`` as the log owner sees it, with ``overlay`` applied.

    Parameters
    ----------
    base
        The commons record; it is copied, never changed.
    overlay
        The personal overlay, or None.

    Returns
    -------
    SiteRecord
        A new record; ``body_md_commons`` holds the commons body, ``base_revision`` the
        commons revision the overlay was written against.
    """
    merged = base.model_copy(deep=True)
    merged.body_md_commons = base.body_md
    merged.forked_from = None
    merged.base_revision = None
    if overlay is None:
        return merged
    merged.base_revision = overlay.base_revision
    for name in PERSONAL_FIELDS:
        setattr(merged, name, getattr(overlay, name))
    if overlay.summary_override:
        merged.summary = overlay.summary_override
    if overlay.default_map:
        merged.default_map = overlay.default_map
    merged.aliases = [*base.aliases, *(a for a in overlay.aliases if a not in base.aliases)]
    merged.maps = [*base.maps, *(m for m in overlay.maps if m not in base.maps)]
    base_media = {m.id for m in base.media}
    merged.media = [
        *merged.media,
        *(m.model_copy(deep=True) for m in overlay.media if m.id not in base_media),
    ]
    if overlay.body_md.strip():
        merged.body_md = overlay.body_md
    return merged


def objective_changes(record: SiteRecord, base: SiteRecord) -> list[str]:
    """Names of the fields in which ``record`` departs from the commons record ``base``.

    Objective fields must be equal; aliases, maps and photos of the commons record must all
    still be there, unchanged. Additions, the summary, the default map and personal fields are
    overlay material and do not count.
    """
    changed = [name for name in OBJECTIVE_FIELDS if _dump(record, name) != _dump(base, name)]
    if any(a not in record.aliases for a in base.aliases):
        changed.append("aliases")
    if any(m not in record.maps for m in base.maps):
        changed.append("maps")
    kept = {m.id: m.model_dump(mode="json") for m in record.media}
    if any(kept.get(m.id) != m.model_dump(mode="json") for m in base.media):
        changed.append("media")
    return changed


def overlay_for(
    record: SiteRecord, base: SiteRecord, base_revision: int | None = None
) -> SiteOverlayRecord:
    """The overlay that turns ``base`` into ``record``, for a record without objective changes.

    ``base_revision`` is the pin to keep; None pins the overlay to the revision of ``base``.
    """
    base_media = {m.id for m in base.media}
    return SiteOverlayRecord(
        site_id=base.site_id,
        extends="commons",
        base_revision=base_revision or base.revision,
        reference_maps=list(record.reference_maps),
        prices=list(record.prices),
        notes=record.notes,
        subsurface_uuid=record.subsurface_uuid,
        summary_override=record.summary if record.summary != base.summary else None,
        default_map=record.default_map if record.default_map != base.default_map else None,
        aliases=[a for a in record.aliases if a not in base.aliases],
        maps=[m for m in record.maps if m not in base.maps],
        media=[m for m in record.media if m.id not in base_media],
        body_md=record.body_md if record.body_md != base.body_md else "",
    )


def overlay_is_empty(overlay: SiteOverlayRecord) -> bool:
    """Whether the overlay adds nothing, so its file can go."""
    payload = overlay_frontmatter(overlay)
    return set(payload) <= {"site_id", "extends", "base_revision"} and not overlay.body_md.strip()


def overlay_frontmatter(overlay: SiteOverlayRecord) -> dict[str, Any]:
    """Frontmatter of an overlay file: ``site_id``, ``extends``, the pin, then the rest."""
    payload = overlay.model_dump(mode="json", exclude_none=True, by_alias=True)
    payload = {k: v for k, v in payload.items() if v not in (None, [], "", {})}
    head = {"site_id": payload.pop("site_id"), "extends": payload.pop("extends")}
    if "base_revision" in payload:
        head["base_revision"] = payload.pop("base_revision")
    return {**head, **payload}


def split_site(record: SiteRecord) -> tuple[SiteRecord, SiteOverlayRecord]:
    """Take a full personal record apart into a commons core and a personal overlay.

    The body goes to the overlay: prose is personal until an editorial pass moves it to the
    commons, so first-person text never leaks by accident. Maps and photos stay with the core.

    Returns
    -------
    tuple[SiteRecord, SiteOverlayRecord]
        The core (only commons fields set, empty body) and the overlay;
        ``merge_site(core, overlay)`` gives the record back.
    """
    core = SiteRecord.model_validate(
        record.model_dump(include=set(SiteCore.model_fields), mode="json")
    )
    overlay = SiteOverlayRecord(
        site_id=record.site_id,
        extends="commons",
        base_revision=core.revision,
        reference_maps=list(record.reference_maps),
        prices=list(record.prices),
        notes=record.notes,
        subsurface_uuid=record.subsurface_uuid,
        body_md=record.body_md,
    )
    return core, overlay
