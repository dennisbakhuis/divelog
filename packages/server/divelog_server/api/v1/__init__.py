from fastapi import APIRouter

from divelog_server.api.v1 import admin, auth, media, public, version

router = APIRouter()
router.include_router(version.router)
router.include_router(public.router, prefix="/dive", tags=["dive"])
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(admin.router, prefix="/admin", tags=["admin"])

media_router = media.router
