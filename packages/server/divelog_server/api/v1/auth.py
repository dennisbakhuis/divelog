from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from divelog_server.core.config import get_settings
from divelog_server.core.deps import OwnerDep, StateDep
from divelog_server.schemas.auth import MagicLinkRequest, Me
from divelog_server.services import auth as auth_service

router = APIRouter()


def _set_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        settings.SESSION_COOKIE_NAME,
        token,
        max_age=settings.SESSION_DAYS * 86400,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


@router.post("/magic-link", status_code=status.HTTP_202_ACCEPTED)
async def magic_link(body: MagicLinkRequest, request: Request, state: StateDep) -> dict[str, str]:
    ip = request.client.host if request.client else "unknown"
    if auth_service.is_rate_limited(ip):
        raise HTTPException(status_code=429, detail="Too many requests, try again later")
    await auth_service.request_magic_link(state, str(body.email))
    return {"status": "sent"}


@router.get("/verify")
async def verify(token: str, request: Request, state: StateDep) -> Response:
    session_token = await auth_service.redeem_magic_link(
        state, token, request.headers.get("user-agent", "")
    )
    if session_token is None:
        return RedirectResponse("/admin/login?error=expired", status_code=303)
    response = RedirectResponse("/admin", status_code=303)
    _set_cookie(response, session_token)
    return response


@router.get("/me", response_model=Me)
async def me(session: OwnerDep) -> Me:
    return Me(email=session.email, expires_at=session.expires_at.isoformat())


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, state: StateDep) -> None:
    settings = get_settings()
    raw = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if raw:
        await auth_service.revoke_session(state, raw)
    response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")
