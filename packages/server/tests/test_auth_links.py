"""The mailed sign-in link survives scanners, and a session in use keeps its cookie."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from divelog_server.core.config import get_settings
from divelog_server.services import auth as auth_service
from divelog_server.store.state import AuthState

VERIFY = "/api/v1/auth/verify"
BROWSER = {"Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document", "Sec-Fetch-Site": "none"}


async def link_token(state: AuthState) -> str:
    url = await auth_service.create_magic_link(state, "owner@example.com")
    return url.split("token=", 1)[1]


async def test_a_fetch_without_fetch_metadata_gets_a_page_and_leaves_the_link_valid(
    client: AsyncClient, state: AuthState
) -> None:
    token = await link_token(state)
    scanned = await client.get(VERIFY, params={"token": token})
    assert scanned.status_code == 200
    assert scanned.headers["content-type"].startswith("text/html")
    assert scanned.headers["cache-control"] == "no-store"
    assert f'value="{token}"' in scanned.text
    assert f'action="{VERIFY}"' in scanned.text
    assert "set-cookie" not in scanned.headers

    opened = await client.get(VERIFY, params={"token": token}, headers=BROWSER)
    assert opened.status_code == 303
    assert opened.headers["location"] == "/admin"
    assert get_settings().SESSION_COOKIE_NAME in opened.headers["set-cookie"]


async def test_a_prefetch_is_not_a_page_open(client: AsyncClient, state: AuthState) -> None:
    token = await link_token(state)
    prefetch = {"Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "empty"}
    assert (await client.get(VERIFY, params={"token": token}, headers=prefetch)).status_code == 200
    opened = await client.get(VERIFY, params={"token": token}, headers=BROWSER)
    assert opened.headers["location"] == "/admin"


async def test_the_page_button_posts_the_token_once(client: AsyncClient, state: AuthState) -> None:
    token = await link_token(state)
    signed_in = await client.post(VERIFY, data={"token": token})
    assert signed_in.status_code == 303
    assert signed_in.headers["location"] == "/admin"
    cookie = signed_in.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Max-Age=2592000" in cookie

    again = await client.post(VERIFY, data={"token": token})
    assert again.status_code == 303
    assert again.headers["location"] == "/admin/login?error=expired"


async def test_the_token_is_escaped_on_the_page(client: AsyncClient) -> None:
    page = await client.get(VERIFY, params={"token": '"><script>alert(1)</script>'})
    assert "<script>" not in page.text
    assert "&quot;&gt;&lt;script&gt;" in page.text


async def test_a_sliding_session_issues_the_cookie_again(
    owner_client: AsyncClient, state: AuthState
) -> None:
    name = get_settings().SESSION_COOKIE_NAME
    fresh = await owner_client.get("/api/v1/auth/me")
    assert fresh.status_code == 200
    assert "set-cookie" not in fresh.headers

    token = owner_client.cookies[name]
    session = next(iter(state.sessions.values()))
    session.expires_at = datetime.now(UTC) + timedelta(days=5)
    renewed = await owner_client.get("/api/v1/admin/dives/next-number")
    assert renewed.status_code == 200
    cookie = renewed.headers["set-cookie"]
    assert cookie.startswith(f"{name}={token};")
    assert "Max-Age=2592000" in cookie
    assert session.expires_at > datetime.now(UTC) + timedelta(days=29)


async def redeem_at(
    client: AsyncClient, state: AuthState, monkeypatch: pytest.MonkeyPatch, after: timedelta
) -> str:
    start = datetime.now(UTC)
    monkeypatch.setattr(auth_service, "_now", lambda: start)
    token = await link_token(state)
    monkeypatch.setattr(auth_service, "_now", lambda: start + after)
    response = await client.post(VERIFY, data={"token": token})
    return str(response.headers["location"])


async def test_a_link_works_for_two_minutes(
    client: AsyncClient, state: AuthState, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert get_settings().MAGIC_LINK_MINUTES == 2
    late = timedelta(minutes=1, seconds=59)
    assert await redeem_at(client, state, monkeypatch, late) == "/admin"


async def test_a_link_has_expired_after_two_minutes(
    client: AsyncClient, state: AuthState, monkeypatch: pytest.MonkeyPatch
) -> None:
    late = timedelta(minutes=2, seconds=1)
    assert await redeem_at(client, state, monkeypatch, late) == "/admin/login?error=expired"


async def test_the_request_says_how_many_minutes_the_link_works(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[str] = []

    async def fake_send(to: str, subject: str, text: str) -> None:
        sent.append(text)

    monkeypatch.setattr(auth_service, "send_mail", fake_send)
    monkeypatch.setattr(auth_service, "_recent_requests", defaultdict(list))
    for email in ("owner@example.com", "stranger@example.com"):
        response = await client.post("/api/v1/auth/magic-link", json={"email": email})
        assert response.status_code == 202
        assert response.json()["valid_minutes"] == 2
    assert len(sent) == 1
    assert "valid 2 minutes" in sent[0]


async def test_the_lifetime_stays_a_setting(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAGIC_LINK_MINUTES", "3")
    get_settings.cache_clear()
    monkeypatch.setattr(auth_service, "_recent_requests", defaultdict(list))
    response = await client.post("/api/v1/auth/magic-link", json={"email": "x@example.com"})
    assert response.json()["valid_minutes"] == 3
