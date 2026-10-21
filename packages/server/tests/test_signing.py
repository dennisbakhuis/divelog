"""Buddies are invited by e-mail and sign a dive through a one-time link."""

import asyncio
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from divelog_server.services import auth as auth_service
from divelog_server.services import signing
from divelog_server.store.files import read_markdown
from divelog_server.store.models import DiveRecord, PersonRecord
from divelog_server.store.state import AuthState
from divelog_server.store.store import Store

ADMIN = "/api/v1/admin"
SIGN = "/api/v1/dive/sign"
PACKAGE = Path(signing.__file__).resolve().parents[1]

Mail = tuple[str, str, str]


@pytest.fixture
def mails(monkeypatch: pytest.MonkeyPatch) -> list[Mail]:
    """Mails the sign service sends, instead of sending them; fresh rate limits."""
    sent: list[Mail] = []

    async def fake_send(to: str, subject: str, text: str) -> None:
        sent.append((to, subject, text))

    monkeypatch.setattr(signing, "send_mail", fake_send)
    monkeypatch.setattr(auth_service, "_recent_signs", defaultdict(list))
    return sent


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> list[datetime]:
    """The sign service's clock; append a moment to move it."""
    moments = [datetime.now(UTC)]
    monkeypatch.setattr(signing, "_now", lambda: moments[-1])
    return moments


async def add_buddies(store: Store, number: int, *people: str) -> None:
    """Put ``people`` on dive ``number``; alex has an e-mail address, robin has none."""
    for person in (
        PersonRecord(id="alex", slug="alex", first_name="Alex", email="alex@example.com"),
        PersonRecord(id="robin", slug="robin", first_name="Robin"),
    ):
        if person.id not in store.people:
            await store.save_person(person, f"Add {person.first_name}")

    def change(dive: DiveRecord) -> DiveRecord:
        dive.people = list(people)
        return dive

    await store.update_dive(number, change, "Buddies")


def token_of(mail: Mail) -> str:
    match = re.search(r"/dive/\d+\?sign=(\S+)", mail[2])
    assert match, mail[2]
    return match.group(1)


async def ask(client: AsyncClient, number: int, **body: Any) -> Any:
    response = await client.post(f"{ADMIN}/dives/{number}/sign-requests", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def states(result: Any) -> list[tuple[str, str]]:
    return [(r["person"], r["state"]) for r in result["sign_requests"]]


async def test_each_buddy_with_an_email_gets_one_mail_with_a_link(
    owner_client: AsyncClient, store: Store, state: AuthState, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "kim_de_boer", "alex", "robin")
    result = await ask(owner_client, 1)
    assert result["sent"] == ["kim", "alex"]
    assert result["skipped"] == [{"person": "robin", "reason": "no_email"}]
    assert states(result) == [("kim", "open"), ("alex", "open"), ("robin", "no_email")]
    assert [m[0] for m in mails] == ["kim@example.com", "alex@example.com"]
    assert len(state.sign_invites) == 2
    assert len({token_of(m) for m in mails}) == 2

    to, subject, text = mails[1]
    assert subject == "Diver logged a dive with you"
    assert text.startswith("Hi Alex,\n")
    assert "Diver logged a dive with you at Zeelandbrug on 1 January 2024." in text
    assert "Have a look and sign it:" in text
    assert f"http://localhost:5173/dive/1?sign={token_of(mails[1])}" in text
    assert "The link works for 7 days and signs once." in text

    alex = result["sign_requests"][1]
    sent_at = datetime.fromisoformat(alex["sent_at"])
    assert datetime.fromisoformat(alex["expires_at"]) - sent_at == timedelta(days=7)
    editor = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert editor["sign_requests"] == result["sign_requests"]


async def test_only_a_hash_of_the_token_is_stored(
    owner_client: AsyncClient, store: Store, state: AuthState, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    token = token_of(mails[0])
    assert token not in state.path.read_text()
    assert auth_service.hash_token(token) in state.sign_invites
    assert AuthState(state.path).sign_invites == state.sign_invites


async def test_a_second_call_mails_nobody_who_was_asked(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    mails: list[Mail],
    clock: list[datetime],
) -> None:
    await add_buddies(store, 1, "kim_de_boer", "alex")
    await ask(owner_client, 1)
    assert (await ask(owner_client, 1))["sent"] == []
    assert len(mails) == 2

    signed = await client.post(f"{SIGN}/{token_of(mails[1])}", json={"comment": "Nice"})
    assert signed.status_code == 200
    clock.append(clock[0] + timedelta(days=8))
    await add_buddies(store, 1, "kim_de_boer", "alex", "robin", "ghost")
    ghost = store.people["ghost"].model_copy(update={"email": "ghost@example.com"})
    await store.save_person(ghost, "Ghost's address")

    again = await ask(owner_client, 1)
    assert again["sent"] == ["ghost"]
    assert again["skipped"] == [
        {"person": "kim", "reason": "expired"},
        {"person": "alex", "reason": "signed"},
        {"person": "robin", "reason": "no_email"},
    ]
    assert [m[0] for m in mails[2:]] == ["ghost@example.com"]


async def test_a_used_link_whose_note_was_deleted_is_not_mailed_again(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    await client.post(f"{SIGN}/{token_of(mails[0])}", json={"comment": "Nice"})
    deleted = await owner_client.delete(f"{ADMIN}/dives/1/buddy-notes/alex")
    assert deleted.status_code == 204
    assert store.dives[1].buddy_notes == []
    again = await ask(owner_client, 1)
    assert again["skipped"] == [{"person": "alex", "reason": "expired"}]
    assert len(mails) == 1
    gone = await owner_client.delete(f"{ADMIN}/dives/1/buddy-notes/alex")
    assert gone.status_code == 404


async def test_named_people_without_resend_are_asked_only_once(
    owner_client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "kim_de_boer", "alex")
    first = await ask(owner_client, 1, people=["alex", "nobody"])
    assert first["sent"] == ["alex"]
    assert first["skipped"] == [{"person": "nobody", "reason": "not_a_buddy"}]
    second = await ask(owner_client, 1, people=["alex"])
    assert second["skipped"] == [{"person": "alex", "reason": "open"}]
    assert len(mails) == 1


async def test_a_draft_cannot_be_sent(
    owner_client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 4, "alex")
    response = await owner_client.post(f"{ADMIN}/dives/4/sign-requests", json={})
    assert response.status_code == 422
    assert "draft" in response.json()["detail"]
    assert mails == []


async def test_asking_needs_the_owner(client: AsyncClient, store: Store) -> None:
    await add_buddies(store, 1, "alex")
    assert (await client.post(f"{ADMIN}/dives/1/sign-requests", json={})).status_code == 401


async def test_looking_does_not_spend_and_shows_a_private_dive(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 3, "alex")
    await ask(owner_client, 3)
    token = token_of(mails[0])
    assert (await client.get("/api/v1/dive/dives/3")).status_code == 404
    for _ in range(2):
        page = await client.get(f"{SIGN}/{token}")
        assert page.status_code == 200, page.text
        assert page.headers["cache-control"] == "no-store"
    body = page.json()
    assert body["state"] == "open"
    assert body["signer"] == {"slug": "alex", "first_name": "Alex"}
    assert body["note"] is None
    assert body["dive"]["number"] == 3
    assert body["dive"]["private"] is None
    assert body["dive"]["prev_number"] is None and body["dive"]["next_number"] is None
    assert body["dive"]["same_day"] == []


async def test_the_page_dive_is_the_public_dive_without_links(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 2, "alex")
    await ask(owner_client, 2)
    public = (await client.get("/api/v1/dive/dives/2")).json()
    page = (await client.get(f"{SIGN}/{token_of(mails[0])}")).json()["dive"]
    assert public["prev_number"] == 1
    unlinked = {"prev_number", "next_number", "prev_site_name", "next_site_name"}
    unlinked |= {"same_day", "day_index"}
    assert {k: v for k, v in page.items() if k not in unlinked} == {
        k: v for k, v in public.items() if k not in unlinked
    }
    assert page["prev_number"] is None and page["prev_site_name"] is None


async def test_signing_stores_the_note_and_spends_the_link(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    state: AuthState,
    mails: list[Mail],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commits: list[str] = []

    async def commit(message: str) -> bool:
        commits.append(message)
        return True

    monkeypatch.setattr(store.git, "commit", commit)
    await add_buddies(store, 1, "kim_de_boer", "alex")
    await ask(owner_client, 1)
    token = token_of(mails[1])
    strokes = [[[12, 300], [18.4, 290.6]], [[500, 200]]]
    response = await client.post(
        f"{SIGN}/{token}", json={"comment": " Cold feet. ", "strokes": strokes, "public": False}
    )
    assert response.status_code == 200, response.text
    note = response.json()["note"]
    assert note["person"] == "alex"
    assert note["comment"] == "Cold feet."
    assert note["strokes"] == [[[12, 300], [18, 291]], [[500, 200]]]
    assert note["public"] is False
    assert commits[-1] == "Add Alex's note to dive #1"

    meta, _ = read_markdown(store.dive_path(1))
    assert meta["buddy_notes"][0]["person"] == "alex"
    assert meta["buddy_notes"][0]["strokes"] == [[[12, 300], [18, 291]], [[500, 200]]]
    invite = state.sign_invites[auth_service.hash_token(token)]
    assert invite.used_at is not None

    again = await client.post(f"{SIGN}/{token}", json={"comment": "Twice"})
    assert again.status_code == 409
    page = (await client.get(f"{SIGN}/{token}")).json()
    assert page["state"] == "used"
    assert page["note"] == note
    assert page["dive"]["buddy_notes"] == []

    editor = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert states(editor) == [("kim", "open"), ("alex", "signed")]
    assert editor["sign_requests"][1]["signed_at"] == note["signed_at"]


async def test_two_signatures_at_once_store_one_note(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    token = token_of(mails[0])
    calls: list[int] = []
    real_update = store.update_dive

    async def spy(number: int, change: Any, message: str) -> DiveRecord:
        calls.append(number)
        return await real_update(number, change, message)

    store.update_dive = spy  # type: ignore[method-assign]
    first, second = await asyncio.gather(
        client.post(f"{SIGN}/{token}", json={"comment": "One"}),
        client.post(f"{SIGN}/{token}", json={"comment": "Two"}),
    )
    assert sorted([first.status_code, second.status_code]) == [200, 409]
    assert calls == [1]
    assert len(store.dives[1].buddy_notes) == 1


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"comment": "   ", "strokes": []},
        {"comment": "x" * 201},
        {"strokes": [[[1, 1]]] * 61},
        {"strokes": [[[1, 1]] * 4001]},
        {"strokes": [[[1200, 10]]]},
        {"strokes": [[[1, 2, 3]]]},
    ],
)
async def test_a_note_outside_the_limits_is_refused(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    mails: list[Mail],
    body: dict[str, Any],
) -> None:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    token = token_of(mails[0])
    assert (await client.post(f"{SIGN}/{token}", json=body)).status_code == 422
    assert (await client.get(f"{SIGN}/{token}")).json()["state"] == "open"


async def test_a_link_expires_after_seven_days(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    mails: list[Mail],
    clock: list[datetime],
) -> None:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    token = token_of(mails[0])
    clock.append(clock[0] + timedelta(days=7) - timedelta(seconds=1))
    assert (await client.get(f"{SIGN}/{token}")).status_code == 200
    clock.append(clock[0] + timedelta(days=7, seconds=1))
    gone = await client.get(f"{SIGN}/{token}")
    assert gone.status_code == 410
    assert gone.headers["cache-control"] == "no-store"
    assert (await client.post(f"{SIGN}/{token}", json={"comment": "Late"})).status_code == 410
    assert store.dives[1].buddy_notes == []
    result = await ask(owner_client, 1)
    assert states(result) == [("alex", "expired")]


async def test_an_unknown_link_is_gone(client: AsyncClient, mails: list[Mail]) -> None:
    assert (await client.get(f"{SIGN}/nope")).status_code == 410
    assert (await client.post(f"{SIGN}/nope", json={"comment": "Hi"})).status_code == 410


async def test_a_resend_kills_the_old_link(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "kim_de_boer", "alex")
    await ask(owner_client, 1)
    old = token_of(mails[1])
    result = await ask(owner_client, 1, people=["alex"], resend=True)
    assert result["sent"] == ["alex"]
    new = token_of(mails[2])
    assert new != old
    assert (await client.get(f"{SIGN}/{old}")).status_code == 410
    assert (await client.post(f"{SIGN}/{old}", json={"comment": "Old"})).status_code == 410
    assert (await client.get(f"{SIGN}/{new}")).json()["state"] == "open"
    assert len(mails) == 3


async def test_a_buddy_who_signed_is_never_mailed_again(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex", "robin")
    await ask(owner_client, 1)
    await client.post(f"{SIGN}/{token_of(mails[0])}", json={"comment": "Done"})
    result = await ask(owner_client, 1, people=["alex", "robin"], resend=True)
    assert result["sent"] == []
    assert result["skipped"] == [
        {"person": "alex", "reason": "signed"},
        {"person": "robin", "reason": "no_email"},
    ]
    assert len(mails) == 1


async def test_a_resend_names_the_people(owner_client: AsyncClient, store: Store) -> None:
    await add_buddies(store, 1, "alex")
    response = await owner_client.post(f"{ADMIN}/dives/1/sign-requests", json={"resend": True})
    assert response.status_code == 422


async def test_a_buddy_taken_off_the_dive_can_no_longer_sign(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    state: AuthState,
    mails: list[Mail],
) -> None:
    await add_buddies(store, 1, "kim_de_boer", "alex")
    await ask(owner_client, 1)
    token = token_of(mails[1])
    await add_buddies(store, 1, "kim_de_boer")
    assert (await client.get(f"{SIGN}/{token}")).status_code == 410
    assert (await client.post(f"{SIGN}/{token}", json={"comment": "Hi"})).status_code == 410

    dive = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    body = {k: dive[k] for k in ("number", "date", "duration_min", "max_depth_m", "people_ids")}
    saved = (await owner_client.put(f"{ADMIN}/dives/1", json=body)).json()
    assert states(saved) == [("kim", "open")]
    assert [i.person for i in state.sign_invites.values()] == ["kim_de_boer"]


async def test_invites_follow_a_renumbered_dive_and_go_with_a_deleted_one(
    owner_client: AsyncClient,
    client: AsyncClient,
    store: Store,
    state: AuthState,
    mails: list[Mail],
) -> None:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    token = token_of(mails[0])
    dive = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    body = {k: dive[k] for k in ("date", "duration_min", "max_depth_m", "people_ids")}
    moved = await owner_client.put(f"{ADMIN}/dives/1", json=body | {"number": 70})
    assert moved.status_code == 200, moved.text
    assert states(moved.json()) == [("alex", "open")]
    assert (await client.get(f"{SIGN}/{token}")).json()["dive"]["number"] == 70

    assert (await owner_client.delete(f"{ADMIN}/dives/70")).status_code == 204
    assert state.sign_invites == {}
    assert AuthState(state.path).sign_invites == {}
    assert (await client.get(f"{SIGN}/{token}")).status_code == 410


async def test_withdrawing_an_invite(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")
    await ask(owner_client, 1)
    token = token_of(mails[0])
    assert (await owner_client.delete(f"{ADMIN}/dives/1/sign-requests/alex")).status_code == 204
    assert (await client.get(f"{SIGN}/{token}")).status_code == 410
    editor = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert states(editor) == [("alex", "none")]
    assert (await owner_client.delete(f"{ADMIN}/dives/1/sign-requests/alex")).status_code == 404
    assert (await owner_client.delete(f"{ADMIN}/dives/1/sign-requests/kim")).status_code == 404


async def test_a_failed_mail_leaves_no_invite(
    owner_client: AsyncClient, store: Store, state: AuthState, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def broken(to: str, subject: str, text: str) -> None:
        raise OSError("relay down")

    monkeypatch.setattr(signing, "send_mail", broken)
    await add_buddies(store, 1, "alex")
    response = await owner_client.post(f"{ADMIN}/dives/1/sign-requests", json={})
    assert response.status_code == 502
    assert "Alex" in response.json()["detail"]
    assert state.sign_invites == {}


async def test_signing_is_rate_limited_per_address(
    owner_client: AsyncClient, client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")
    codes = []
    for _ in range(6):
        codes.append((await client.post(f"{SIGN}/nope", json={"comment": "x"})).status_code)
    assert codes == [410] * 5 + [429]
    assert auth_service._recent_requests.get("127.0.0.1", []) == []


async def test_a_mail_without_a_site_leaves_the_place_out(
    owner_client: AsyncClient, store: Store, mails: list[Mail]
) -> None:
    await add_buddies(store, 1, "alex")

    def no_site(dive: DiveRecord) -> DiveRecord:
        dive.site = None
        return dive

    await store.update_dive(1, no_site, "No site")
    await ask(owner_client, 1)
    assert "Diver logged a dive with you on 1 January 2024." in mails[0][2]


def test_nothing_mails_without_an_owner_request() -> None:
    """Mail goes out from two places only: the owner's magic link and the owner's request."""
    callers = {
        path.relative_to(PACKAGE).as_posix()
        for path in PACKAGE.rglob("*.py")
        if "send_mail(" in path.read_text(encoding="utf-8")
    }
    assert callers == {"services/email.py", "services/auth.py", "services/signing.py"}
    source = (PACKAGE / "services" / "signing.py").read_text(encoding="utf-8")
    for scheduler in ("asyncio", "create_task", "call_later", "BackgroundTasks"):
        assert scheduler not in source
    users = {
        path.relative_to(PACKAGE).as_posix()
        for path in PACKAGE.rglob("*.py")
        if "request_signatures(" in path.read_text(encoding="utf-8")
    }
    assert users == {"services/signing.py", "api/v1/admin.py"}
