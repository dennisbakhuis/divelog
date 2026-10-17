from pathlib import Path
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from divelog_server.core.config import get_settings
from divelog_server.services import auth as auth_service
from divelog_server.store.git import GitRepo
from divelog_server.store.manifest import commons_root_for, read_manifest
from divelog_server.store.sources import CommonsSource
from divelog_server.store.state import AdminSession, AuthState
from divelog_server.store.store import Store

_store: Store | None = None
_state: AuthState | None = None


def get_store() -> Store:
    """The process-wide store; created on first use and loaded by the app lifespan."""
    global _store
    if _store is None:
        settings = get_settings()
        root = Path(settings.DATA_ROOT)
        git = GitRepo(
            root,
            author_name=settings.GIT_AUTHOR_NAME,
            author_email=settings.GIT_AUTHOR_EMAIL or settings.OWNER_EMAIL,
            enabled=settings.GIT_ENABLED,
            ssh_key_path=settings.GIT_SSH_KEY_PATH,
        )
        _store = Store(
            root,
            git,
            home_countries=settings.home_countries,
            commons=build_commons(),
            owner_name=settings.OWNER_NAME,
            public_commons=settings.PUBLIC_COMMONS_SITES,
            public_commons_regions=settings.public_commons_regions,
        )
        _store.load()
    return _store


def build_commons() -> CommonsSource | None:
    """The read-only site commons, or None when there is none.

    ``COMMONS_ROOT`` wins; else the ``path`` of the first commons source in the log's
    ``divelog.yaml``, relative to ``DATA_ROOT``.
    """
    settings = get_settings()
    name: str | None = None
    if settings.COMMONS_ROOT:
        root = Path(settings.COMMONS_ROOT)
    else:
        log_root = Path(settings.DATA_ROOT)
        try:
            manifest = read_manifest(log_root)
        except ValueError:
            return None
        found = commons_root_for(log_root, manifest)
        if found is None or manifest is None:
            return None
        root = found
        source = manifest.commons_source()
        name = source.name if source else None
    git = GitRepo(
        root,
        author_name="",
        author_email="",
        enabled=settings.COMMONS_GIT_ENABLED,
        ssh_key_path=settings.GIT_SSH_KEY_PATH,
        readonly=True,
    )
    return CommonsSource(root, git, name=name)


def get_state() -> AuthState:
    global _state
    if _state is None:
        _state = AuthState(Path(get_settings().STATE_DIR) / "auth.json")
    return _state


def reset_store() -> None:
    global _store, _state
    _store = None
    _state = None


StoreDep = Annotated[Store, Depends(get_store)]
StateDep = Annotated[AuthState, Depends(get_state)]


async def optional_owner(request: Request, state: StateDep) -> AdminSession | None:
    """The owner's session when the request carries a live cookie, otherwise None."""
    raw = request.cookies.get(get_settings().SESSION_COOKIE_NAME)
    return await auth_service.resolve_session(state, raw) if raw else None


OptionalOwnerDep = Annotated[AdminSession | None, Depends(optional_owner)]


async def require_owner(session: OptionalOwnerDep) -> AdminSession:
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    return session


OwnerDep = Annotated[AdminSession, Depends(require_owner)]
