"""Buddy notes on a dive: how they show, who may see them, and the owner's edits to them.

The dive file names a note's buddy by person id, like ``people``; the API speaks slugs.
"""

from collections.abc import Mapping
from datetime import UTC, datetime

from divelog_server.schemas.dive import (
    BuddyNoteIn,
    BuddyNoteOut,
    SignRequestOut,
    SignRequestState,
)
from divelog_server.store.models import BuddyNoteRecord, DiveRecord, PersonRecord
from divelog_server.store.state import SignInvite
from divelog_server.store.store import Store


def person_slug(store: Store, person_id: str) -> str:
    """The slug of person ``person_id``, or the id itself when the person is unknown."""
    person = store.people.get(person_id)
    return person.slug if person else person_id


def dive_person(store: Store, dive: DiveRecord, name: str) -> PersonRecord | None:
    """The dive's person whose slug (or id) is ``name``, or None when nobody on it is."""
    for person_id in dive.people:
        person = store.people.get(person_id)
        if person and name in (person.slug, person.id):
            return person
    return None


def note_out(store: Store, note: BuddyNoteRecord) -> BuddyNoteOut:
    """A stored note as the API returns it."""
    return BuddyNoteOut(
        person=person_slug(store, note.person),
        comment=note.comment,
        strokes=note.strokes,
        signed_at=note.signed_at,
        public=note.public,
    )


def note_of(dive: DiveRecord, person_id: str) -> BuddyNoteRecord | None:
    """The note person ``person_id`` left on ``dive``, if any."""
    return next((n for n in dive.buddy_notes if n.person == person_id), None)


def public_notes(store: Store, dive: DiveRecord) -> list[BuddyNoteOut]:
    """The notes a visitor sees: public ones, by buddies on the dive who are not hidden."""
    shown: list[BuddyNoteOut] = []
    for note in dive.buddy_notes:
        person = store.people.get(note.person)
        if note.public and note.person in dive.people and person and person.public_name:
            shown.append(note_out(store, note))
    return shown


def all_notes(store: Store, dive: DiveRecord) -> list[BuddyNoteOut]:
    """Every note on the dive, for the owner."""
    return [note_out(store, n) for n in dive.buddy_notes]


def apply_note_edits(
    store: Store, notes: list[BuddyNoteRecord], edits: list[BuddyNoteIn] | None, people: list[str]
) -> list[BuddyNoteRecord]:
    """The notes to store after a form save.

    ``edits`` None keeps every note; a list sets ``public`` on the notes it names (by slug or
    id) and leaves the others as they are, so a form opened before a buddy signed never
    deletes that note. Deleting is the DELETE endpoint's job. Notes of people no longer on the
    dive go either way. A note's comment, strokes and time never change here.
    """
    kept = [n for n in notes if n.person in people]
    if edits is None:
        return kept
    wanted: dict[str, bool] = {}
    for edit in edits:
        for note in kept:
            if edit.person in (note.person, person_slug(store, note.person)):
                wanted[note.person] = edit.public
    return [n.model_copy(update={"public": wanted.get(n.person, n.public)}) for n in kept]


def request_state(
    store: Store, dive: DiveRecord, person_id: str, invite: SignInvite | None, now: datetime
) -> SignRequestState:
    """Where asking person ``person_id`` to sign ``dive`` stands.

    A note means ``signed`` whatever the invite says. A used invite whose note the owner
    deleted counts as ``expired``: that link signs no more.
    """
    if note_of(dive, person_id) is not None:
        return "signed"
    if invite is not None:
        return "open" if invite.used_at is None and invite.expires_at > now else "expired"
    person = store.people.get(person_id)
    return "none" if person and person.email else "no_email"


def sign_requests(
    store: Store,
    dive: DiveRecord,
    invites: Mapping[str, SignInvite] | None = None,
    now: datetime | None = None,
) -> list[SignRequestOut]:
    """Where asking each of the dive's people to sign stands, in ``people`` order.

    ``invites`` holds the dive's invites by person id.
    """
    invites = invites or {}
    moment = now or datetime.now(UTC)
    out: list[SignRequestOut] = []
    for person_id in dive.people:
        note = note_of(dive, person_id)
        invite = invites.get(person_id)
        out.append(
            SignRequestOut(
                person=person_slug(store, person_id),
                state=request_state(store, dive, person_id, invite, moment),
                sent_at=invite.created_at if invite else None,
                expires_at=invite.expires_at if invite else None,
                signed_at=note.signed_at if note else None,
            )
        )
    return out
