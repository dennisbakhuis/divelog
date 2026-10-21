"""Server state outside the data repository, in one JSON file.

Sessions, magic-link tokens and the invites buddies got to sign a dive.
"""

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


class SignInvite(BaseModel):
    """A mailed link asking person ``person`` (an id) to sign dive ``dive``.

    Kept after it expired or was used, so the editor can say who was asked and nobody is
    mailed twice by accident, until the dive is deleted or the owner resends or withdraws.
    """

    dive: int
    person: str
    email: str
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None = None


class AuthFile(BaseModel):
    sessions: dict[str, AdminSession] = Field(default_factory=dict)
    tokens: dict[str, MagicToken] = Field(default_factory=dict)
    sign_invites: dict[str, SignInvite] = Field(default_factory=dict)


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

    @property
    def sign_invites(self) -> dict[str, SignInvite]:
        """Invites to sign a dive by the hash of their token, expired and used ones included."""
        return self.data.sign_invites

    def save(self) -> None:
        """Persist, dropping expired tokens and sessions (not sign invites) on the way out."""
        now = datetime.now(UTC)
        self.data.tokens = {k: t for k, t in self.data.tokens.items() if t.expires_at > now}
        self.data.sessions = {
            k: s
            for k, s in self.data.sessions.items()
            if s.expires_at > now and s.revoked_at is None
        }
        write_json(self.path, self.data.model_dump(mode="json"))
