from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from divelog_server.core.config import get_settings
from divelog_server.services import auth as auth_service
from divelog_server.store.state import AuthState


async def test_magic_link_roundtrip(state: AuthState) -> None:
    url = await auth_service.create_magic_link(state, "owner@example.com")
    token = url.split("token=")[1]
    session_token = await auth_service.redeem_magic_link(state, token, "pytest")
    assert session_token is not None
    assert await auth_service.redeem_magic_link(state, token, "pytest") is None
    session = await auth_service.resolve_session(state, session_token)
    assert session is not None and session.email == "owner@example.com"
    assert state.path.exists()
    await auth_service.revoke_session(state, session_token)
    assert await auth_service.resolve_session(state, session_token) is None


async def test_state_survives_reload(state: AuthState) -> None:
    token = await auth_service.create_session(state, "owner@example.com", "pytest")
    reloaded = AuthState(state.path)
    assert await auth_service.resolve_session(reloaded, token) is not None


async def test_bogus_tokens_are_rejected(state: AuthState) -> None:
    assert await auth_service.redeem_magic_link(state, "nope", "pytest") is None
    assert await auth_service.resolve_session(state, "nope") is None


def test_rate_limit_window() -> None:
    now = datetime.now(UTC)
    ip = "203.0.113.7"
    for _ in range(5):
        assert not auth_service.is_rate_limited(ip, now)
    assert auth_service.is_rate_limited(ip, now)
    assert not auth_service.is_rate_limited(ip, now + timedelta(minutes=11))


async def test_non_owner_gets_no_link(state: AuthState, monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[str] = []

    async def fake_send(to: str, subject: str, text: str) -> None:
        sent.append(to)

    monkeypatch.setattr(auth_service, "send_mail", fake_send)
    await auth_service.request_magic_link(state, "stranger@example.com")
    assert sent == []
    await auth_service.request_magic_link(state, "OWNER@example.com")
    assert sent == ["OWNER@example.com"]


async def test_admin_requires_session(client: AsyncClient) -> None:
    response = await client.get("/api/v1/admin/dives")
    assert response.status_code == 401
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 401


async def test_me_and_logout(owner_client: AsyncClient) -> None:
    me = await owner_client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "owner@example.com"
    out = await owner_client.post("/api/v1/auth/logout")
    assert out.status_code == 204


async def test_magic_link_mail_uses_branding(
    state: AuthState, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, str]] = []

    async def fake_send(to: str, subject: str, text: str) -> None:
        sent.append((subject, text))

    monkeypatch.setenv("SITE_NAME", "example.org")
    monkeypatch.setenv("OWNER_NAME", "Ada")
    get_settings.cache_clear()
    try:
        monkeypatch.setattr(auth_service, "send_mail", fake_send)
        await auth_service.request_magic_link(state, "owner@example.com")
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
    assert sent[0][0] == "Sign in to example.org"
    assert sent[0][1].startswith("Hi Ada,\n")
