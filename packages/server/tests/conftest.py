import os
import shutil
from collections.abc import AsyncIterator
from pathlib import Path

os.environ["DEBUG"] = "true"
os.environ["OWNER_EMAIL"] = "owner@example.com"
os.environ["TRUSTED_PROXY_IPS"] = ""
os.environ["GIT_ENABLED"] = "false"
os.environ["HOME_COUNTRIES"] = "NLD,DEU,BEL"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from divelog_server.core import deps
from divelog_server.core.config import get_settings
from divelog_server.main import create_app
from divelog_server.services import auth as auth_service
from divelog_server.services import storage as storage_service
from divelog_server.store.state import AuthState
from divelog_server.store.store import Store

FIXTURE_DATA = Path(__file__).parent / "fixtures" / "data"
FIXTURE_COMMONS = Path(__file__).parent / "fixtures" / "commons"

get_settings.cache_clear()


@pytest.fixture(autouse=True)
def fresh_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Every test works on its own copy of the fixture tree."""
    data_root = tmp_path / "data"
    shutil.copytree(FIXTURE_DATA, data_root)
    monkeypatch.setenv("DATA_ROOT", str(data_root))
    monkeypatch.setenv("STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path / "media"))
    get_settings.cache_clear()
    deps.reset_store()
    storage_service.reset_storage()


@pytest.fixture
def store() -> Store:
    return deps.get_store()


@pytest.fixture
def state() -> AuthState:
    return deps.get_state()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def owner_client(state: AuthState) -> AsyncIterator[AsyncClient]:
    """A second client, signed in as the owner, so tests can compare both views."""
    token = await auth_service.create_session(state, "owner@example.com", "pytest")
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        c.cookies.set(get_settings().SESSION_COOKIE_NAME, token)
        yield c


@pytest.fixture
def commons_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A copy of the commons fixture, configured as ``COMMONS_ROOT`` for this test."""
    root = tmp_path / "commons"
    shutil.copytree(FIXTURE_COMMONS, root)
    monkeypatch.setenv("COMMONS_ROOT", str(root))
    get_settings.cache_clear()
    deps.reset_store()
    return root


@pytest.fixture
def commons_store(commons_root: Path) -> Store:
    """The store over the log fixture with the commons fixture layered underneath."""
    return deps.get_store()


@pytest_asyncio.fixture
async def commons_client(commons_root: Path) -> AsyncIterator[AsyncClient]:
    """A signed-out client against the store with a commons."""
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def commons_owner_client(commons_root: Path, state: AuthState) -> AsyncIterator[AsyncClient]:
    """A signed-in owner client against the store with a commons."""
    token = await auth_service.create_session(state, "owner@example.com", "pytest")
    async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
        c.cookies.set(get_settings().SESSION_COOKIE_NAME, token)
        yield c
