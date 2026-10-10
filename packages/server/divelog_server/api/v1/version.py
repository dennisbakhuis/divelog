"""The server version and the compatibility contract a client checks against."""

from fastapi import APIRouter

from divelog_server.core.config import get_settings
from divelog_server.schemas.base import ApiModel
from divelog_server.store.manifest import DATA_FORMAT

API_VERSION = 1

router = APIRouter()


class VersionOut(ApiModel):
    """The running build and the majors of the data format and the API it speaks."""

    version: str
    format: int
    api: int


@router.get("/version", response_model=VersionOut)
async def version() -> VersionOut:
    """``version`` of the build, ``format`` of the data it reads, ``api`` of this interface."""
    return VersionOut(version=get_settings().APP_VERSION, format=DATA_FORMAT, api=API_VERSION)
