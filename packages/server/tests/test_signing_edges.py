"""Edge cases of buddy signing found while reviewing it."""

import asyncio
from datetime import datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient

from divelog_server.services import auth as auth_service
from divelog_server.store.files import read_markdown
from divelog_server.store.models import DiveRecord, PersonRecord
from divelog_server.store.state import AuthState
from divelog_server.store.store import Store
from tests.test_signing import (
    ADMIN,
    SIGN,
    Mail,
    add_buddies,
    ask,
    clock,
    mails,
    states,
    token_of,
)

__all__ = ["clock", "mails"]


async def invited(owner_client: AsyncClient, store: Store, mails: list[Mail]) -> str:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    return token_of(mails[0])


@pytest.mark.parametrize(
    "raw",
    [
        b'{"strokes": [[[Infinity, 10]]]}',
        b'{"strokes": [[[-Infinity, 10]]]}',
        b'{"strokes": [[[NaN, 10]]]}',
        b'{"strokes": [[[1e400, 10]]]}',
        b'{"strokes": [[[1e30, 10]]]}',
        b'{"strokes": [[[-1, 10]]]}',
        b'{"strokes": [[[10, 401]]]}',
        b'{"strokes": [[["a", 10]]]}',
        b'{"strokes": [[null]]}',
        b'{"strokes": [[]]}',
        b'{"strokes": "M 0 0"}',
        b'{"strokes": [[[1, 1]]], "comment": 5}',
        b'{"strokes": [[[1, 1]]], "public": "maybe"}',
    ],
)
async def test_hostile_strokes_are_a_422_never_a_500(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    mails: list[Mail],
    raw: bytes,
) -> None:
    token = await invited(owner_client, store, mails)
    response = await client.post(
        f"{SIGN}/{token}", content=raw, headers={"content-type": "application/json"}
    )
    assert response.status_code == 422, response.text
    assert store.dives[1].buddy_notes == []
    assert (await client.get(f"{SIGN}/{token}")).json()["state"] == "open"


async def test_the_box_corners_are_inside(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    strokes = [[[0, 0], [1000, 400]]]
    response = await client.post(f"{SIGN}/{token}", json={"strokes": strokes})
    assert response.status_code == 200, response.text
    assert response.json()["note"]["strokes"] == strokes
    assert response.json()["note"]["comment"] is None


@pytest.mark.parametrize(
    "comment",
    [
        "line one\nline two\r\n---\n...",
        "key: value # not a comment\n- item",
        "\x00\x07\x1b[31mred\x7f",
        "  \x85﻿",
        "&anchor *alias !!tag |\n> folded",
        "'single' \"double\" \\ backslash",
        "\U0001f93f" * 50,
        "yes",
        "null",
        "123",
        "<script>alert(1)</script><img src=x onerror=alert(1)>",
        "{{ 7 * 7 }} ${jndi:ldap://x}",
    ],
)
async def test_any_comment_survives_the_dive_file(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    mails: list[Mail],
    comment: str,
) -> None:
    token = await invited(owner_client, store, mails)
    response = await client.post(f"{SIGN}/{token}", json={"comment": comment})
    assert response.status_code == 200, response.text
    stored = response.json()["note"]["comment"]
    assert stored == comment.strip()
    meta, _ = read_markdown(store.dive_path(1))
    assert meta["buddy_notes"][0]["comment"] == stored
    await store.reload()
    assert store.errors == []
    assert store.dives[1].buddy_notes[0].comment == stored
    assert (await owner_client.get(f"{ADMIN}/dives/1")).json()["buddy_notes"][0][
        "comment"
    ] == stored


async def test_a_lone_surrogate_in_a_comment_cannot_break_the_dive_file(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    before = store.dive_path(1).read_bytes()
    response = await client.post(
        f"{SIGN}/{token}",
        content=b'{"comment": "oops \\ud800"}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["note"]["comment"] == "oops ?"
    assert store.dive_path(1).read_bytes() != before
    await store.reload()
    assert store.errors == []


async def test_a_dive_made_a_draft_after_the_invite_stops_its_link(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)

    def draft(dive: DiveRecord) -> DiveRecord:
        dive.visibility = "draft"
        return dive

    await store.update_dive(1, draft, "Draft")
    assert (await client.get(f"{SIGN}/{token}")).status_code == 410
    assert (await client.post(f"{SIGN}/{token}", json={"comment": "Hi"})).status_code == 410
    assert store.dives[1].buddy_notes == []


async def test_a_dive_made_private_after_the_invite_still_opens(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)

    def private(dive: DiveRecord) -> DiveRecord:
        dive.visibility = "private"
        return dive

    await store.update_dive(1, private, "Private")
    assert (await client.get(f"{SIGN}/{token}")).status_code == 200
    assert (await client.get("/api/v1/dive/dives/1")).status_code == 404


async def test_a_used_link_stops_at_its_expiry_too(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    mails: list[Mail],
    clock: list[datetime],
) -> None:
    token = await invited(owner_client, store, mails)
    assert (await client.post(f"{SIGN}/{token}", json={"comment": "Hi"})).status_code == 200
    clock.append(clock[0] + timedelta(days=7))
    assert (await client.get(f"{SIGN}/{token}")).status_code == 410
    assert (await client.post(f"{SIGN}/{token}", json={"comment": "Again"})).status_code == 410


async def test_the_link_dies_at_the_exact_expiry_moment(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    state: AuthState,
    mails: list[Mail],
    clock: list[datetime],
) -> None:
    token = await invited(owner_client, store, mails)
    invite = state.sign_invites[auth_service.hash_token(token)]
    clock.append(invite.expires_at - timedelta(microseconds=1))
    assert (await client.get(f"{SIGN}/{token}")).status_code == 200
    clock.append(invite.expires_at)
    assert (await client.get(f"{SIGN}/{token}")).status_code == 410


async def test_a_token_never_opens_another_dive_of_the_same_buddy(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")
    await add_buddies(store, 2, "alex")
    await ask(owner_client, 1)
    token = token_of(mails[0])
    await client.post(f"{SIGN}/{token}", json={"comment": "Only dive one"})
    assert [n.person for n in store.dives[1].buddy_notes] == ["alex"]
    assert store.dives[2].buddy_notes == []
    result = await ask(owner_client, 2)
    assert states(result) == [("alex", "open")]


async def test_two_asks_at_once_mail_a_buddy_once(
    owner_client: AsyncClient, store: Store, state: AuthState, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")
    responses = await asyncio.gather(
        *[owner_client.post(f"{ADMIN}/dives/1/sign-requests", json={}) for _ in range(4)]
    )
    assert [r.status_code for r in responses] == [200] * 4
    assert len(mails) == 1
    assert len(state.sign_invites) == 1
    sent = sorted(len(r.json()["sent"]) for r in responses)
    assert sent == [0, 0, 0, 1]


async def test_two_resends_at_once_leave_one_live_link(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    state: AuthState,
    mails: list[Mail],
) -> None:
    await invited(owner_client, store, mails)
    await asyncio.gather(
        *[
            owner_client.post(
                f"{ADMIN}/dives/1/sign-requests", json={"people": ["alex"], "resend": True}
            )
            for _ in range(3)
        ]
    )
    assert len(state.sign_invites) == 1
    live = [
        m
        for m in mails
        if (await_status := token_of(m))
        and auth_service.hash_token(await_status) in state.sign_invites
    ]
    assert len(live) == 1


async def test_signing_while_the_buddy_is_taken_off_the_dive_leaves_no_note(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    form = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    results = await asyncio.gather(
        client.post(f"{SIGN}/{token}", json={"comment": "Hi"}),
        owner_client.put(f"{ADMIN}/dives/1", json={**form, "people_ids": []}),
    )
    assert results[1].status_code == 200, results[1].text
    notes = store.dives[1].buddy_notes
    assert notes == []
    assert store.dives[1].people == []


async def test_a_save_during_signing_keeps_the_new_note(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    form = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    form.pop("buddy_notes")
    results = await asyncio.gather(
        client.post(f"{SIGN}/{token}", json={"comment": "Hi"}),
        owner_client.put(f"{ADMIN}/dives/1", json={**form, "title": "Renamed"}),
    )
    assert all(r.status_code == 200 for r in results)
    assert store.dives[1].title == "Renamed"
    assert [n.person for n in store.dives[1].buddy_notes] == ["alex"]


@pytest.mark.parametrize(
    "email", ["alex@example.com\nBcc: spy@example.net", "alex@example.com\r\nSubject: hi", ""]
)
async def test_an_address_that_could_inject_a_header_sends_nothing(
    owner_client: AsyncClient,
    store: Store,
    state: AuthState,
    monkeypatch: pytest.MonkeyPatch,
    email: str,
) -> None:
    sent: list[Any] = []

    async def deliver(message: Any, **kwargs: Any) -> None:
        sent.append(message)

    monkeypatch.setattr("divelog_server.services.email.aiosmtplib.send", deliver)
    await store.save_person(
        PersonRecord(id="evil", slug="evil", first_name="Evil", email=email), "Add Evil"
    )

    def change(dive: DiveRecord) -> DiveRecord:
        dive.people = ["evil"]
        return dive

    await store.update_dive(1, change, "Buddies")
    response = await owner_client.post(f"{ADMIN}/dives/1/sign-requests", json={})
    assert response.status_code in (200, 502)
    for message in sent:
        assert "Bcc" not in message
        assert message["Subject"] == "Diver logged a dive with you"
        assert "\n" not in str(message["To"])
    if response.status_code == 502:
        assert state.sign_invites == {}


async def test_a_name_with_line_breaks_stays_in_the_mail_body(
    owner_client: AsyncClient, store: Store, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[Any] = []

    async def deliver(message: Any, **kwargs: Any) -> None:
        sent.append(message)

    monkeypatch.setattr("divelog_server.services.email.aiosmtplib.send", deliver)
    await store.save_person(
        PersonRecord(
            id="bob", slug="bob", first_name="Bob\r\nBcc: spy@example.net", email="bob@example.com"
        ),
        "Add Bob",
    )

    def change(dive: DiveRecord) -> DiveRecord:
        dive.people = ["bob"]
        return dive

    await store.update_dive(1, change, "Buddies")
    response = await owner_client.post(f"{ADMIN}/dives/1/sign-requests", json={})
    assert response.status_code == 200, response.text
    assert sent[0]["Bcc"] is None
    assert sent[0]["Subject"] == "Diver logged a dive with you"


async def test_a_broken_subject_template_leaves_no_invite(
    owner_client: AsyncClient,
    store: Store,
    state: AuthState,
    mails: list[Mail],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIGN_MAIL_SUBJECT", "{nobody} logged a dive with you")
    from divelog_server.core.config import get_settings

    get_settings.cache_clear()
    try:
        await add_buddies(store, 1, "alex")
        response = await owner_client.post(f"{ADMIN}/dives/1/sign-requests", json={})
        assert response.status_code == 502
        assert mails == []
        assert state.sign_invites == {}
    finally:
        get_settings.cache_clear()


async def test_resending_to_a_buddy_who_was_never_asked_and_has_no_email(
    owner_client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "robin")
    result = await ask(owner_client, 1, people=["robin"], resend=True)
    assert result["sent"] == []
    assert result["skipped"] == [{"person": "robin", "reason": "no_email"}]


async def test_resend_skips_signed_and_strangers(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    await client.post(f"{SIGN}/{token}", json={"comment": "Hi"})
    result = await ask(owner_client, 1, people=["alex", "nobody"], resend=True)
    assert result["sent"] == []
    assert result["skipped"] == [
        {"person": "alex", "reason": "signed"},
        {"person": "nobody", "reason": "not_a_buddy"},
    ]
    assert len(mails) == 1


async def test_withdrawing_kills_the_link_and_allows_asking_again(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    assert (await owner_client.delete(f"{ADMIN}/dives/1/sign-requests/alex")).status_code == 204
    assert (await client.get(f"{SIGN}/{token}")).status_code == 410
    result = await ask(owner_client, 1)
    assert result["sent"] == ["alex"]
    assert token_of(mails[1]) != token


async def test_deleting_a_note_lets_the_owner_resend_but_not_reuse_the_old_link(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    await client.post(f"{SIGN}/{token}", json={"comment": "Hi"})
    assert (await owner_client.delete(f"{ADMIN}/dives/1/buddy-notes/alex")).status_code == 204
    assert (await client.post(f"{SIGN}/{token}", json={"comment": "Again"})).status_code == 409
    result = await ask(owner_client, 1, people=["alex"], resend=True)
    assert result["sent"] == ["alex"]
    fresh = token_of(mails[1])
    assert (await client.post(f"{SIGN}/{fresh}", json={"comment": "Second"})).status_code == 200


async def test_the_sign_endpoints_reject_other_methods_and_cache_nothing(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    page = await client.get(f"{SIGN}/{token}")
    assert page.headers["cache-control"] == "no-store"
    assert page.headers["referrer-policy"] == "no-referrer"
    assert (await client.put(f"{SIGN}/{token}", json={"comment": "x"})).status_code == 405
    assert (await client.delete(f"{SIGN}/{token}")).status_code == 405


async def test_saving_the_login_state_keeps_expired_and_used_invites(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    state: AuthState,
    mails: list[Mail],
    clock: list[datetime],
) -> None:
    token = await invited(owner_client, store, mails)
    clock.append(clock[0] + timedelta(days=30))
    await auth_service.create_session(state, "owner@example.com", "pytest")
    assert auth_service.hash_token(token) in AuthState(state.path).sign_invites
    result = await ask(owner_client, 1)
    assert result["skipped"] == [{"person": "alex", "reason": "expired"}]


def test_a_login_state_file_from_before_signing_still_loads(state: AuthState) -> None:
    state.path.parent.mkdir(parents=True, exist_ok=True)
    state.path.write_text('{"sessions": {}, "tokens": {}}')
    assert AuthState(state.path).sign_invites == {}


async def test_the_sign_page_of_another_buddy_shows_only_their_own_note(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "kim_de_boer", "alex")
    await ask(owner_client, 1)
    kim, alex = token_of(mails[0]), token_of(mails[1])
    await client.post(f"{SIGN}/{kim}", json={"comment": "Kim was here", "public": False})
    page = (await client.get(f"{SIGN}/{alex}")).json()
    assert page["state"] == "open"
    assert page["note"] is None
    assert page["dive"]["buddy_notes"] == []
    assert "Kim was here" not in (await client.get(f"{SIGN}/{alex}")).text


async def test_a_public_note_shows_on_the_public_page_after_signing(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    token = await invited(owner_client, store, mails)
    await client.post(f"{SIGN}/{token}", json={"comment": "<b>Hi</b>", "public": True})
    shown = (await client.get("/api/v1/dive/dives/1")).json()["buddy_notes"]
    assert [(n["person"], n["comment"]) for n in shown] == [("alex", "<b>Hi</b>")]
