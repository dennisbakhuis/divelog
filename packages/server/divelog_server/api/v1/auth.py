"""Sign-in by mailed link, the session cookie, and sign-out."""

from html import escape
from typing import Annotated

from fastapi import APIRouter, Form, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse

from divelog_server.core.config import get_settings
from divelog_server.core.deps import OwnerDep, StateDep
from divelog_server.schemas.auth import MagicLinkRequest, Me
from divelog_server.services import auth as auth_service

router = APIRouter()

INTERSTITIAL = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 0; min-height: 100svh; display: grid; place-items: center;
    font: 16px/1.5 system-ui, sans-serif; background: #0b1220; color: #e6edf6; }}
  form {{ padding: 24px; text-align: center; }}
  button {{ min-height: 44px; padding: 0 24px; font: inherit; border: 0; border-radius: 8px;
    background: #3b82f6; color: #fff; cursor: pointer; }}
</style>
</head>
<body>
<form method="post" action="{action}">
  <p>Sign in to {site}?</p>
  <input type="hidden" name="token" value="{token}">
  <button type="submit">Sign in</button>
</form>
</body>
</html>
"""


def _opened_by_a_browser(request: Request) -> bool:
    """Whether the request is a browser opening the link as a page (Fetch Metadata)."""
    headers = request.headers
    return (
        headers.get("sec-fetch-mode") == "navigate" and headers.get("sec-fetch-dest") == "document"
    )


async def _redeem(token: str, request: Request, state: StateDep) -> Response:
    session_token = await auth_service.redeem_magic_link(
        state, token, request.headers.get("user-agent", "")
    )
    if session_token is None:
        return RedirectResponse("/admin/login?error=expired", status_code=303)
    response = RedirectResponse("/admin", status_code=303)
    auth_service.set_session_cookie(response, session_token)
    return response


@router.post("/magic-link", status_code=status.HTTP_202_ACCEPTED)
async def magic_link(body: MagicLinkRequest, request: Request, state: StateDep) -> dict[str, str]:
    ip = request.client.host if request.client else "unknown"
    if auth_service.is_rate_limited(ip):
        raise HTTPException(status_code=429, detail="Too many requests, try again later")
    await auth_service.request_magic_link(state, str(body.email))
    return {"status": "sent"}


@router.get("/verify")
async def verify(token: str, request: Request, state: StateDep) -> Response:
    """Open the mailed link.

    A browser opening it as a page (``Sec-Fetch-Mode: navigate`` with ``Sec-Fetch-Dest:
    document``) is signed in at once and sent to ``/admin``. Any other fetch (a mail
    scanner, a link preview, a prefetch) gets a small page whose button posts the token to
    ``POST /verify``, so fetching the link never spends it.
    """
    if _opened_by_a_browser(request):
        return await _redeem(token, request, state)
    page = INTERSTITIAL.format(
        action=escape(request.url.path, quote=True),
        site=escape(get_settings().SITE_NAME),
        token=escape(token, quote=True),
    )
    return HTMLResponse(
        page,
        headers={
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Robots-Tag": "noindex",
        },
    )


@router.post("/verify")
async def verify_post(
    token: Annotated[str, Form(max_length=200)], request: Request, state: StateDep
) -> Response:
    """Redeem the mailed link's token from the sign-in page and send the browser on."""
    return await _redeem(token, request, state)


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
