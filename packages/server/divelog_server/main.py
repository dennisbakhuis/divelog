import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from divelog_server.api.v1 import media_router
from divelog_server.api.v1 import router as v1_router
from divelog_server.core.config import check_session_secret, get_settings
from divelog_server.core.deps import get_store
from divelog_server.core.logging import configure_logging
from divelog_server.store.store import CommonsEditError

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.DEBUG)
    check_session_secret(settings)
    store = get_store()
    if not store.dives and not store.sites:
        logger.warning("store is empty: is DATA_ROOT=%s a checkout of the data repo?", store.root)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=f"{settings.SITE_NAME} API",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.DEBUG else None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    trusted = [p.strip() for p in settings.TRUSTED_PROXY_IPS.split(",") if p.strip()]
    if trusted:
        application.add_middleware(ProxyHeadersMiddleware, trusted_hosts=trusted)

    @application.exception_handler(CommonsEditError)
    async def commons_edit(request: Request, exc: CommonsEditError) -> JSONResponse:
        """A write that would change a commons record: 422 with the reason."""
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @application.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled exception on %s", request.url.path, exc_info=exc)
        return JSONResponse(status_code=500, content={"detail": "internal_server_error"})

    application.include_router(v1_router, prefix="/api/v1")
    application.include_router(media_router)

    @application.get("/health", tags=["health"])
    async def health() -> JSONResponse:
        store = get_store()
        repo = await store.git.status()
        return JSONResponse(
            content={
                "status": "ok",
                "store": True,
                "dives": len(store.dives),
                "sites": len(store.sites),
                "errors": len(store.errors),
                "repo": repo["state"],
                "version": settings.APP_VERSION,
            }
        )

    return application


app = create_app()
