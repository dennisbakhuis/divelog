"""Login state: sessions and magic-link tokens in one JSON file outside the data repository."""

import asyncio
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from divelog_server.store.files import read_json, write_json


class AdminSession(BaseModel):
    token_hash: str
    email: str
    created_at: datetime
    expires_at: datetime
    last_seen_at: datetime
    user_agent: str = ""
    revoked_at: datetime | None = None


class MagicToken(BaseModel):
    token_hash: str
    email: str
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None = None


class AuthFile(BaseModel):
    sessions: dict[str, AdminSession] = Field(default_factory=dict)
    tokens: dict[str, MagicToken] = Field(default_factory=dict)


class AuthState:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = asyncio.Lock()
        self.data = AuthFile()
        if path.exists():
            self.data = AuthFile.model_validate(read_json(path))

    @property
    def sessions(self) -> dict[str, AdminSession]:
        return self.data.sessions

    @property
    def tokens(self) -> dict[str, MagicToken]:
        return self.data.tokens

    def save(self) -> None:
        """Persist, dropping expired tokens and sessions on the way out."""
        now = datetime.now(UTC)
        self.data.tokens = {k: t for k, t in self.data.tokens.items() if t.expires_at > now}
        self.data.sessions = {
            k: s
            for k, s in self.data.sessions.items()
            if s.expires_at > now and s.revoked_at is None
        }
        write_json(self.path, self.data.model_dump(mode="json"))
