from fastapi import APIRouter

from divelog_server.core.config import get_settings

router = APIRouter()


@router.get("/version")
async def version() -> dict[str, str]:
    return {"version": get_settings().APP_VERSION}
