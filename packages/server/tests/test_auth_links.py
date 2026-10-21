"""The mailed sign-in link survives scanners, and a session in use keeps its cookie."""

from datetime import UTC, datetime, timedelta

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
