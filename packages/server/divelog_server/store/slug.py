"""Slugs and site ids, the same rules as the kit's ``core/admin/slug.ts``."""

import re
import unicodedata

SITE_ID = re.compile(r"^[a-z]{3}-[a-z0-9-]+$")
UNKNOWN_COUNTRY = "xxx"
FALLBACK_SLUG = "site"


def slugify(value: str) -> str:
    """Lowercase ASCII slug: accents dropped, every other run of characters becomes one dash.

    Parameters
    ----------
    value
        Any text, e.g. a site name.

    Returns
    -------
    str
        The slug; empty when nothing ASCII is left.
    """
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def site_id_for(country: str | None, name: str) -> str:
    """The id a new site gets: ``{iso3}-{slug(name)}``.

    Parameters
    ----------
    country
        ISO 3166 alpha-3 code in any case; anything else counts as unknown (``xxx``).
    name
        The site name.

    Returns
    -------
    str
        An id matching :data:`SITE_ID`.
    """
    code = (country or "").strip().lower()[:3]
    prefix = code if re.fullmatch(r"[a-z]{3}", code) else UNKNOWN_COUNTRY
    return f"{prefix}-{slugify(name) or FALLBACK_SLUG}"
