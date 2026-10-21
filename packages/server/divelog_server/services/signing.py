"""Buddies sign a dive through a mailed one-time link.

Only the owner's explicit request mails anyone: there is no scheduler and no reminder. A
buddy is mailed once per dive; only a resend mails again, with a new link that replaces the
old one. The link opens the dive as visitors see it (a private one too) and signs once.
"""

import logging
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import cast

from divelog_server.core.config import get_settings
from divelog_server.schemas.dive import DiveOut
from divelog_server.schemas.signing import (
    Signer,
    SignIn,
    SignPageOut,
    SignRequestsOut,
    SignSkip,
    SkipReason,
)
from divelog_server.services import buddy_notes as notes_service
from divelog_server.services import dives as dive_service
from divelog_server.services.auth import hash_token
from divelog_server.services.email import send_mail
from divelog_server.store.models import BuddyNoteRecord, DiveRecord, PersonRecord
from divelog_server.store.state import AuthState, SignInvite
from divelog_server.store.store import Store

logger = logging.getLogger(__name__)


class SignLinkGone(LookupError):
    """The link is unknown or expired, or no longer fits its dive."""


class AlreadySigned(RuntimeError):
    """The link was used, or the buddy's note exists already."""


class DraftDive(ValueError):
    """A draft cannot be sent for signing: the buddy would see an unfinished dive."""


@dataclass
class MailFailed(RuntimeError):
    """Some invites could not be mailed; those were rolled back, the others stand."""

    sent: list[str]
    failed: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        sent = f"; sent to {', '.join(self.sent)}" if self.sent else ""
        return f"Mail to {', '.join(self.failed)} could not be sent{sent}"


@dataclass
class _Target:
    person: PersonRecord
    token: str
    token_hash: str
    replaced: dict[str, SignInvite]


def _now() -> datetime:
    return datetime.now(UTC)


def dive_invites(state: AuthState, number: int) -> dict[str, SignInvite]:
    """The invites of dive ``number`` by person id; one per person."""
    return {i.person: i for i in state.sign_invites.values() if i.dive == number}


def sign_link(number: int, token: str) -> str:
    """The mailed link: the dive's own page with the token."""
    return f"{get_settings().SITE_URL.rstrip('/')}/dive/{number}?sign={token}"


def _long_date(dive: DiveRecord) -> str:
    return f"{dive.date.day} {dive.date:%B %Y}"


def invite_mail(store: Store, dive: DiveRecord, person: PersonRecord, link: str) -> tuple[str, str]:
    """Subject and text of the mail asking ``person`` to sign ``dive``."""
    settings = get_settings()
    site_name = dive_service.dive_site_name(store, dive)
    where = f" at {site_name}" if site_name else ""
    days = settings.SIGN_INVITE_DAYS
    lifetime = "1 day" if days == 1 else f"{days} days"
    subject = settings.SIGN_MAIL_SUBJECT.format(
        owner_name=settings.OWNER_NAME, site_name=settings.SITE_NAME, dive_site=site_name or ""
    )
    text = (
        f"Hi {person.first_name},\n\n"
        f"{settings.OWNER_NAME} logged a dive with you{where} on {_long_date(dive)}. "
        f"Have a look and sign it:\n\n{link}\n\n"
        f"The link works for {lifetime} and signs once.\n\n"
        f"-- \n{settings.SITE_NAME}\n"
    )
    return subject, text


def _skip_reason(
    store: Store, dive: DiveRecord, person: PersonRecord, invite: SignInvite | None, resend: bool
) -> SignSkip | None:
    state = notes_service.request_state(store, dive, person.id, invite, _now())
    if state == "none" or (resend and state in ("open", "expired")):
        return None
    return SignSkip(person=person.slug, reason=cast(SkipReason, state))


async def request_signatures(
    store: Store, state: AuthState, dive: DiveRecord, people: list[str] | None, resend: bool
) -> SignRequestsOut:
    """Mail the dive's buddies a link to sign it.

    Without ``resend`` only buddies with an e-mail address who were never asked and left no
    note are mailed: ``people`` None means every buddy. With ``resend`` each named buddy gets
    a new link and the old one stops working; a buddy who signed is never mailed again.

    Raises
    ------
    DraftDive
        The dive is a draft.
    MailFailed
        A mail could not be sent; that buddy's invite is as it was before.
    """
    if dive.visibility == "draft":
        raise DraftDive(f"Dive #{dive.number} is a draft; publish it before asking buddies")
    names = list(dict.fromkeys(people if people is not None else _slugs(store, dive)))
    settings = get_settings()
    skipped: list[SignSkip] = []
    targets: list[_Target] = []
    async with state.lock:
        invites = dive_invites(state, dive.number)
        for name in names:
            person = notes_service.dive_person(store, dive, name)
            if person is None:
                skipped.append(SignSkip(person=name, reason="not_a_buddy"))
                continue
            skip = _skip_reason(store, dive, person, invites.get(person.id), resend)
            if skip is not None:
                skipped.append(skip)
                continue
            targets.append(_claim(state, dive.number, person, settings.SIGN_INVITE_DAYS))
        if targets:
            state.save()
    sent, failed = await _mail(store, dive, targets)
    if failed:
        await _roll_back(state, failed)
        raise MailFailed(sent=sent, failed=[t.person.first_name for t in failed])
    return SignRequestsOut(
        sent=sent,
        skipped=skipped,
        sign_requests=notes_service.sign_requests(
            store, dive, dive_invites(state, dive.number), _now()
        ),
    )


def _slugs(store: Store, dive: DiveRecord) -> list[str]:
    return [notes_service.person_slug(store, pid) for pid in dive.people]


def _claim(state: AuthState, number: int, person: PersonRecord, days: int) -> _Target:
    """Store a new invite for ``person``, taking the place of any earlier one."""
    replaced = {
        h: i for h, i in state.sign_invites.items() if i.dive == number and i.person == person.id
    }
    for token_hash in replaced:
        del state.sign_invites[token_hash]
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)
    now = _now()
    state.sign_invites[token_hash] = SignInvite(
        dive=number,
        person=person.id,
        email=person.email or "",
        created_at=now,
        expires_at=now + timedelta(days=days),
    )
    return _Target(person=person, token=token, token_hash=token_hash, replaced=replaced)


async def _mail(
    store: Store, dive: DiveRecord, targets: list[_Target]
) -> tuple[list[str], list[_Target]]:
    sent: list[str] = []
    failed: list[_Target] = []
    for target in targets:
        link = sign_link(dive.number, target.token)
        if get_settings().DEBUG:
            logger.info("sign link for %s: %s", target.person.slug, link)
        subject, text = invite_mail(store, dive, target.person, link)
        try:
            await send_mail(target.person.email or "", subject, text)
        except Exception:
            logger.exception("sign invite for dive #%d to %s failed", dive.number, target.person.id)
            failed.append(target)
            continue
        sent.append(target.person.slug)
    return sent, failed


async def _roll_back(state: AuthState, failed: list[_Target]) -> None:
    async with state.lock:
        for target in failed:
            state.sign_invites.pop(target.token_hash, None)
            state.sign_invites.update(target.replaced)
        state.save()


async def withdraw(state: AuthState, number: int, person_id: str) -> bool:
    """Drop the invite of ``person_id`` on dive ``number``; False when there is none."""
    async with state.lock:
        gone = [
            h for h, i in state.sign_invites.items() if i.dive == number and i.person == person_id
        ]
        for token_hash in gone:
            del state.sign_invites[token_hash]
        if gone:
            state.save()
    return bool(gone)


async def follow_dive(state: AuthState, previous_number: int, dive: DiveRecord | None) -> None:
    """Keep the invites of a saved or deleted dive in step with it.

    A deleted dive (``dive`` None) takes its invites along; a renumbered one moves them; a
    buddy taken off the dive loses theirs, so the link stops working.
    """
    async with state.lock:
        changed = False
        for token_hash, invite in list(state.sign_invites.items()):
            if invite.dive != previous_number:
                continue
            if dive is None or invite.person not in dive.people:
                del state.sign_invites[token_hash]
                changed = True
            elif dive.number != previous_number:
                invite.dive = dive.number
                changed = True
        if changed:
            state.save()


@dataclass
class _Link:
    invite: SignInvite
    dive: DiveRecord
    person: PersonRecord


def _resolve(store: Store, state: AuthState, token: str) -> _Link:
    invite = state.sign_invites.get(hash_token(token))
    if invite is None or invite.expires_at <= _now():
        raise SignLinkGone("This sign link has expired")
    dive = store.dives.get(invite.dive)
    person = store.people.get(invite.person)
    if dive is None or dive.visibility == "draft" or person is None:
        raise SignLinkGone("This sign link has expired")
    if invite.person not in dive.people:
        raise SignLinkGone("This sign link has expired")
    return _Link(invite=invite, dive=dive, person=person)


def page_dive(store: Store, dive: DiveRecord) -> DiveOut:
    """The dive as the public page shows it, without links to other dives."""
    out = dive_service.dive_out(store, dive, owner=False)
    return out.model_copy(update={"same_day": [], "day_index": None})


def sign_page(store: Store, state: AuthState, token: str) -> SignPageOut:
    """What the link shows; looking never spends it.

    Raises
    ------
    SignLinkGone
        The link is unknown or expired, or no longer fits its dive.
    """
    link = _resolve(store, state, token)
    note = notes_service.note_of(link.dive, link.person.id)
    used = link.invite.used_at is not None or note is not None
    return SignPageOut(
        state="used" if used else "open",
        signer=Signer(slug=link.person.slug, first_name=link.person.first_name),
        expires_at=link.invite.expires_at,
        note=notes_service.note_out(store, note) if note else None,
        dive=page_dive(store, link.dive),
    )


async def sign(store: Store, state: AuthState, token: str, body: SignIn) -> BuddyNoteRecord:
    """Store the buddy's note on the dive and spend the link.

    The note is written through :meth:`Store.update_dive`, under the dive lock, and committed;
    the invite is marked used under the state lock held around it, so a link signs once.

    Raises
    ------
    SignLinkGone
        The link is unknown or expired, or no longer fits its dive.
    AlreadySigned
        The link was used, or the buddy's note exists already.
    """
    async with state.lock:
        link = _resolve(store, state, token)
        if link.invite.used_at is not None:
            raise AlreadySigned("This dive is signed already")
        person_id = link.person.id
        note = BuddyNoteRecord(
            person=person_id,
            comment=body.comment,
            strokes=body.strokes,
            signed_at=_now().replace(microsecond=0),
            public=body.public,
        )

        def change(dive: DiveRecord) -> DiveRecord:
            if person_id not in dive.people or dive.visibility == "draft":
                raise SignLinkGone("This sign link has expired")
            if notes_service.note_of(dive, person_id) is not None:
                raise AlreadySigned("This dive is signed already")
            dive.buddy_notes.append(note)
            return dive

        message = f"Add {link.person.first_name}'s note to dive #{link.dive.number}"
        try:
            await store.update_dive(link.dive.number, change, message)
        except KeyError:
            raise SignLinkGone("This sign link has expired") from None
        link.invite.used_at = _now()
        state.save()
    return note
