"""Public lookup lists the editor and other clients share: countries and photo licences."""

from fastapi import APIRouter, Response

from divelog_server.schemas.admin import CountryOut, LicenceOut
from divelog_server.store.countries import COUNTRIES
from divelog_server.store.manifest import LICENCES

router = APIRouter()

LOOKUP_CACHE = "public, max-age=86400"


def _countries() -> list[CountryOut]:
    """The known countries by name."""
    rows = [CountryOut(iso3=iso3, iso2=iso2, name=name) for iso3, (iso2, name) in COUNTRIES.items()]
    return sorted(rows, key=lambda c: c.name.casefold())


def _licences() -> list[LicenceOut]:
    """The allowlisted licences, most open first."""
    return [LicenceOut(id=key, name=name, url=url) for key, (name, url) in LICENCES.items()]


COUNTRY_LIST = _countries()
LICENCE_LIST = _licences()


@router.get("/countries", response_model=list[CountryOut])
async def meta_countries(response: Response) -> list[CountryOut]:
    """Every country the log knows, by name, with its ISO alpha-3 and alpha-2 codes."""
    response.headers["Cache-Control"] = LOOKUP_CACHE
    return COUNTRY_LIST


@router.get("/licences", response_model=list[LicenceOut])
async def meta_licences(response: Response) -> list[LicenceOut]:
    """The licences a photo by someone else may carry here, with name and deed URL."""
    response.headers["Cache-Control"] = LOOKUP_CACHE
    return LICENCE_LIST
