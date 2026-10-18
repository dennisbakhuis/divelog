import logging

import pytest
from fastapi import FastAPI

from divelog_server.core.config import (
    DEFAULT_SESSION_SECRET,
    InsecureSettingsError,
    Settings,
    check_session_secret,
    get_settings,
)
from divelog_server.main import lifespan


def test_default_secret_warns_in_development(caplog: pytest.LogCaptureFixture) -> None:
    settings = Settings(SESSION_SECRET=DEFAULT_SESSION_SECRET, COOKIE_SECURE=False)
    with caplog.at_level(logging.WARNING, logger="divelog_server.core.config"):
        check_session_secret(settings)
    assert "SESSION_SECRET is the shipped default" in caplog.text


def test_default_secret_refused_with_secure_cookies() -> None:
    settings = Settings(SESSION_SECRET=DEFAULT_SESSION_SECRET, COOKIE_SECURE=True)
    with pytest.raises(InsecureSettingsError, match="SESSION_SECRET"):
        check_session_secret(settings)


def test_own_secret_is_quiet(caplog: pytest.LogCaptureFixture) -> None:
    settings = Settings(SESSION_SECRET="a" * 64, COOKIE_SECURE=True)
    with caplog.at_level(logging.WARNING, logger="divelog_server.core.config"):
        check_session_secret(settings)
    assert caplog.text == ""


async def test_startup_refuses_default_secret_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SESSION_SECRET", DEFAULT_SESSION_SECRET)
    monkeypatch.setenv("COOKIE_SECURE", "true")
    get_settings.cache_clear()
    with pytest.raises(InsecureSettingsError):
        async with lifespan(FastAPI()):
            pass


async def test_startup_runs_with_own_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SESSION_SECRET", "b" * 64)
    monkeypatch.setenv("COOKIE_SECURE", "true")
    get_settings.cache_clear()
    async with lifespan(FastAPI()):
        pass
