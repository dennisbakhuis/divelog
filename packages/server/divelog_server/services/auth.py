import hashlib
import hmac
import logging
import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import Response

from divelog_server.core.config import get_settings
from divelog_server.services.email import send_mail
from divelog_server.store.state import AdminSession, AuthState, MagicToken

logger = logging.getLogger(__name__)

_MAGIC_LINK_LIMIT = 5
_MAGIC_LINK_WINDOW = timedelta(minutes=10)
_recent_requests: dict[str, list[datetime]] = defaultdict(list)


def _hash(token: str) -> str:
    settings = get_settings()
    return hmac.new(settings.SESSION_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def is_rate_limited(ip: str, now: datetime | None = None) -> bool:
    """Five magic-link requests per IP per ten minutes; anything more is dropped."""
    moment = now or _now()
    window_start = moment - _MAGIC_LINK_WINDOW
    recent = [t for t in _recent_requests[ip] if t > window_start]
    _recent_requests[ip] = recent
    if len(recent) >= _MAGIC_LINK_LIMIT:
        return True
    recent.append(moment)
    return False


def is_owner(email: str) -> bool:
    """True for the configured owner address; nobody is the owner while it is unset."""
    owner = get_settings().OWNER_EMAIL.strip().lower()
    return bool(owner) and email.strip().lower() == owner


async def create_magic_link(state: AuthState, email: str) -> str:
    """Store a single-use token and return the full login URL."""
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    async with state.lock:
        state.tokens[_hash(token)] = MagicToken(
            token_hash=_hash(token),
            email=email.lower(),
            created_at=_now(),
            expires_at=_now() + timedelta(minutes=settings.MAGIC_LINK_MINUTES),
        )
        state.save()
    return f"{settings.SITE_URL.rstrip('/')}/api/v1/auth/verify?token={token}"


async def request_magic_link(state: AuthState, email: str) -> None:
    """Mail a login link when the address is the owner's; silently ignore otherwise."""
    if not is_owner(email):
        logger.info("magic link requested for non-owner address")
        return
    url = await create_magic_link(state, email)
    settings = get_settings()
    if settings.DEBUG:
        logger.info("magic link: %s", url)
    greeting = settings.MAIL_GREETING.format(owner_name=settings.OWNER_NAME)
    await send_mail(
        email,
        settings.MAIL_SUBJECT.format(site_name=settings.SITE_NAME),
        f"{greeting}\n\nClick to sign in (valid {settings.MAGIC_LINK_MINUTES} minutes):\n\n"
        f"{url}\n\nIf you did not request this, ignore this mail.\n",
    )


async def redeem_magic_link(state: AuthState, token: str, user_agent: str) -> str | None:
    """Exchange a valid, unused token for a session; return the raw session token."""
    async with state.lock:
        row = state.tokens.get(_hash(token))
        if row is None or row.used_at is not None or row.expires_at < _now():
            return None
        row.used_at = _now()
        state.save()
    return await create_session(state, row.email, user_agent)


async def create_session(state: AuthState, email: str, user_agent: str) -> str:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    async with state.lock:
        state.sessions[_hash(token)] = AdminSession(
            token_hash=_hash(token),
            email=email,
            created_at=_now(),
            expires_at=_now() + timedelta(days=settings.SESSION_DAYS),
            last_seen_at=_now(),
            user_agent=user_agent[:300],
        )
        state.save()
    return token


async def resolve_session(state: AuthState, token: str) -> AdminSession | None:
    """Look up a live session and slide its expiry when it is past halfway."""
    session, _ = await resolve_and_renew(state, token)
    return session


async def resolve_and_renew(state: AuthState, token: str) -> tuple[AdminSession | None, bool]:
    """A live session, sliding its expiry when it is past halfway, and whether it slid.

    When it slid the browser's cookie has to be issued again: its ``max_age`` was set when the
    cookie was, and it would otherwise end before the session does.
    """
    settings = get_settings()
    session = state.sessions.get(_hash(token))
    now = _now()
    if session is None or session.revoked_at is not None or session.expires_at < now:
        return None, False
    lifetime = timedelta(days=settings.SESSION_DAYS)
    if session.expires_at - now < lifetime / 2:
        async with state.lock:
            session.expires_at = now + lifetime
            session.last_seen_at = now
            state.save()
        return session, True
    session.last_seen_at = now
    return session, False


def set_session_cookie(response: Response, token: str) -> None:
    """Give the browser the session cookie for the whole session lifetime."""
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


async def revoke_session(state: AuthState, token: str) -> None:
    async with state.lock:
        session = state.sessions.get(_hash(token))
        if session is not None:
            session.revoked_at = _now()
            state.save()
