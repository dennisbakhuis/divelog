from pydantic import EmailStr

from divelog_server.schemas.base import ApiModel


class MagicLinkRequest(ApiModel):
    email: EmailStr


class MagicLinkSent(ApiModel):
    """The answer to a sign-in request: how many minutes a mailed link works."""

    status: str = "sent"
    valid_minutes: int


class Me(ApiModel):
    email: str
    expires_at: str
