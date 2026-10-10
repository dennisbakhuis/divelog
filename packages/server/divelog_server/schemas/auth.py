from pydantic import EmailStr

from divelog_server.schemas.base import ApiModel


class MagicLinkRequest(ApiModel):
    email: EmailStr


class Me(ApiModel):
    email: str
    expires_at: str
