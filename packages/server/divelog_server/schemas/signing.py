"""Buddies signing a dive through a mailed link: the owner's requests and the buddy's page."""

import math
from datetime import datetime
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from divelog_server.schemas.base import ApiModel
from divelog_server.schemas.dive import BuddyNoteOut, DiveOut, SignRequestOut
from divelog_server.store.models import MAX_NOTE_COMMENT, Stroke, strokes_problem

SkipReason = Literal["open", "expired", "signed", "no_email", "not_a_buddy"]


def _whole(coordinate: object) -> object:
    """A float rounded to a whole number; NaN and infinity become None, which no point accepts.

    The refusal for a non-finite number would echo it back, and JSON cannot carry it.
    """
    if isinstance(coordinate, float):
        return round(coordinate) if math.isfinite(coordinate) else None
    return coordinate


class SignRequestsIn(ApiModel):
    """Whom to mail a link to sign the dive.

    Without ``resend`` only buddies never asked are mailed (all buddies when ``people`` is
    None). ``resend`` mails the named ``people`` a new link, and the old one stops working.
    """

    people: list[str] | None = Field(default=None, max_length=50)
    resend: bool = False

    @model_validator(mode="after")
    def _resend_names_people(self) -> Self:
        if self.resend and not self.people:
            raise ValueError("resend needs the people to mail again")
        return self


class SignSkip(ApiModel):
    """A buddy who got no mail, and why."""

    person: str
    reason: SkipReason


class SignRequestsOut(ApiModel):
    """Who was mailed (slugs), who was not and why, and every buddy's request afterwards."""

    sent: list[str]
    skipped: list[SignSkip]
    sign_requests: list[SignRequestOut]


class Signer(ApiModel):
    slug: str
    first_name: str


class SignPageOut(ApiModel):
    """What the mailed link opens: the dive as visitors see it, and the buddy's own note.

    ``state`` is ``used`` once the buddy signed; the link keeps showing the dive until it
    expires. ``dive`` has no links to other dives.
    """

    state: Literal["open", "used"]
    signer: Signer
    expires_at: datetime
    note: BuddyNoteOut | None
    dive: DiveOut


class SignIn(ApiModel):
    """A buddy's note: a comment, a drawing, or both, and whether visitors may see it.

    Points are rounded to whole numbers, a lone surrogate (which no file can hold) becomes a
    question mark, and an empty comment or drawing counts as none.
    """

    comment: str | None = None
    strokes: list[Stroke] | None = None
    public: bool = True

    @field_validator("comment", mode="before")
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.encode("utf-8", "replace").decode("utf-8").strip() or None
        return value

    @field_validator("comment")
    @classmethod
    def _short(cls, value: str | None) -> str | None:
        if value is not None and len(value) > MAX_NOTE_COMMENT:
            raise ValueError(f"a comment has at most {MAX_NOTE_COMMENT} characters")
        return value

    @field_validator("strokes", mode="before")
    @classmethod
    def _whole_points(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return [
            [[_whole(c) for c in point] if isinstance(point, list) else point for point in stroke]
            if isinstance(stroke, list)
            else stroke
            for stroke in value
        ] or None

    @model_validator(mode="after")
    def _has_content(self) -> Self:
        if self.comment is None and not self.strokes:
            raise ValueError("write a comment or draw a signature")
        problem = strokes_problem(self.strokes or [])
        if problem:
            raise ValueError(problem)
        return self


class SignedOut(ApiModel):
    note: BuddyNoteOut
