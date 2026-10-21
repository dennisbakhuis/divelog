"""Buddy notes in the dive file: validation, round trip, who sees them, and the form's edits."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from pydantic import ValidationError

from divelog_server.cli import openapi_document
from divelog_server.store.files import read_markdown, write_markdown
from divelog_server.store.log_repo import frontmatter
from divelog_server.store.models import BuddyNoteRecord, DiveRecord, PersonRecord
from divelog_server.store.store import Store

ADMIN = "/api/v1/admin"
SIGNED = datetime(2026, 10, 27, 17, 40, tzinfo=UTC)
SCRIBBLE = [[(12, 300), (18, 290), (30, 284)], [(400, 200)]]


def note(person: str, **fields: Any) -> BuddyNoteRecord:
    values: dict[str, Any] = {"person": person, "comment": "Great vis", "signed_at": SIGNED}
    return BuddyNoteRecord.model_validate(values | fields)


async def with_notes(store: Store, number: int, *notes: BuddyNoteRecord) -> DiveRecord:
    """Put alex, kim and the hidden ghost on dive ``number`` with ``notes``."""
    if "alex" not in store.people:
        alex = PersonRecord(id="alex", slug="alex", first_name="Alex", email="alex@example.com")
        await store.save_person(alex, "Add Alex")

    def change(dive: DiveRecord) -> DiveRecord:
        dive.people = ["kim_de_boer", "alex", "ghost"]
        dive.buddy_notes = list(notes)
        return dive

    return await store.update_dive(number, change, "Sign")


async def form_body(client: AsyncClient, number: int, **changes: Any) -> dict[str, Any]:
    dive = (await client.get(f"{ADMIN}/dives/{number}")).json()
    keys = ("number", "date", "duration_min", "max_depth_m", "title", "visibility", "people_ids")
    return {k: dive[k] for k in keys} | {"site_id": dive["site_id"]} | changes


def test_a_note_needs_a_comment_or_strokes() -> None:
    with pytest.raises(ValidationError, match="comment, strokes or both"):
        note("alex", comment="  ")
    assert note("alex", comment=None, strokes=SCRIBBLE).strokes == SCRIBBLE


@pytest.mark.parametrize(
    ("fields", "problem"),
    [
        ({"comment": "x" * 201}, "at most 200 characters"),
        ({"strokes": [[(1, 1)]] * 61}, "at most 60 strokes"),
        ({"strokes": [[(1, 1)] * 2001, [(2, 2)] * 2000]}, "at most 4000 points"),
        ({"strokes": [[(1001, 10)]]}, "outside the 1000 x 400 box"),
        ({"strokes": [[(10, -1)]]}, "outside the 1000 x 400 box"),
        ({"strokes": [[]]}, "at least one point"),
        ({"strokes": [[(1.5, 2)]]}, "valid integer"),
    ],
)
def test_note_limits(fields: dict[str, Any], problem: str) -> None:
    with pytest.raises(ValidationError, match=problem):
        note("alex", **fields)


def test_the_largest_note_fits() -> None:
    strokes = [[(1000, 400)] * 66] * 60
    assert sum(len(s) for s in strokes) <= 4000
    assert note("alex", comment="x" * 200, strokes=strokes).strokes


def test_one_note_per_person() -> None:
    with pytest.raises(ValidationError, match="one buddy note per person"):
        DiveRecord(number=9, date="2026-10-25", duration_min=40, buddy_notes=[note("a"), note("a")])


def test_old_dive_files_have_no_notes_key(store: Store) -> None:
    for dive in store.dives.values():
        assert dive.buddy_notes == []
        assert "buddy_notes" not in frontmatter(dive)


async def test_notes_round_trip_through_the_file(store: Store) -> None:
    drawn_only = note("kim_de_boer", comment=None, strokes=SCRIBBLE)
    await with_notes(store, 1, note("alex", strokes=SCRIBBLE), drawn_only)
    meta, _ = read_markdown(store.dive_path(1))
    assert meta["buddy_notes"] == [
        {
            "person": "alex",
            "comment": "Great vis",
            "strokes": [[[12, 300], [18, 290], [30, 284]], [[400, 200]]],
            "signed_at": "2026-10-27T17:40:00Z",
            "public": True,
        },
        {
            "person": "kim_de_boer",
            "strokes": [[[12, 300], [18, 290], [30, 284]], [[400, 200]]],
            "signed_at": "2026-10-27T17:40:00Z",
            "public": True,
        },
    ]
    await store.reload()
    assert store.dives[1].buddy_notes == [
        note("alex", strokes=SCRIBBLE),
        note("kim_de_boer", comment=None, strokes=SCRIBBLE),
    ]


async def test_the_public_page_shows_public_notes_of_shown_buddies(
    client: AsyncClient, store: Store
) -> None:
    await with_notes(
        store,
        1,
        note("alex", strokes=SCRIBBLE),
        note("kim_de_boer", public=False),
        note("ghost"),
    )
    dive = (await client.get("/api/v1/dive/dives/1")).json()
    assert dive["buddy_notes"] == [
        {
            "person": "alex",
            "comment": "Great vis",
            "strokes": [[[12, 300], [18, 290], [30, 284]], [[400, 200]]],
            "signed_at": "2026-10-27T17:40:00Z",
            "public": True,
        }
    ]


async def test_a_private_dive_keeps_its_notes_private(
    client: AsyncClient, owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 3, note("alex"))
    assert (await client.get("/api/v1/dive/dives/3")).status_code == 404
    owner_view = (await owner_client.get("/api/v1/dive/dives/3")).json()
    assert [n["person"] for n in owner_view["buddy_notes"]] == ["alex"]


async def test_the_editor_sees_every_note_and_each_request(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex"), note("kim_de_boer", public=False))
    dive = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert [(n["person"], n["public"]) for n in dive["buddy_notes"]] == [
        ("alex", True),
        ("kim", False),
    ]
    assert dive["sign_requests"] == [
        {
            "person": "kim",
            "state": "signed",
            "sent_at": None,
            "expires_at": None,
            "signed_at": "2026-10-27T17:40:00Z",
        },
        {
            "person": "alex",
            "state": "signed",
            "sent_at": None,
            "expires_at": None,
            "signed_at": "2026-10-27T17:40:00Z",
        },
        {
            "person": "ghost",
            "state": "no_email",
            "sent_at": None,
            "expires_at": None,
            "signed_at": None,
        },
    ]


async def test_a_buddy_with_an_email_and_no_note_was_not_asked(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1)
    states = (await owner_client.get(f"{ADMIN}/dives/1")).json()["sign_requests"]
    assert [(r["person"], r["state"]) for r in states] == [
        ("kim", "none"),
        ("alex", "none"),
        ("ghost", "no_email"),
    ]


async def test_a_save_without_buddy_notes_keeps_them(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex"))
    body = await form_body(owner_client, 1, title="Edited")
    saved = await owner_client.put(f"{ADMIN}/dives/1", json=body)
    assert saved.status_code == 200, saved.text
    assert store.dives[1].buddy_notes == [note("alex")]


async def test_the_form_sets_public_and_deletes_by_leaving_out(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex"), note("kim_de_boer"))
    edits = [{"person": "kim", "public": False}]
    body = await form_body(owner_client, 1, buddy_notes=edits)
    saved = (await owner_client.put(f"{ADMIN}/dives/1", json=body)).json()
    assert [(n["person"], n["public"]) for n in saved["buddy_notes"]] == [("kim", False)]
    assert store.dives[1].buddy_notes == [note("kim_de_boer", public=False)]

    body = await form_body(owner_client, 1, buddy_notes=[])
    await owner_client.put(f"{ADMIN}/dives/1", json=body)
    meta, _ = read_markdown(store.dive_path(1))
    assert "buddy_notes" not in meta


async def test_the_form_cannot_write_a_note(owner_client: AsyncClient, store: Store) -> None:
    await with_notes(store, 1, note("alex"))
    edits = [
        {"person": "alex", "public": False, "comment": "forged", "signed_at": "2020-01-01T00:00Z"},
        {"person": "kim", "public": True, "comment": "forged"},
    ]
    body = await form_body(owner_client, 1, buddy_notes=edits)
    assert (await owner_client.put(f"{ADMIN}/dives/1", json=body)).status_code == 200
    assert store.dives[1].buddy_notes == [note("alex", public=False)]


async def test_a_person_named_twice_is_refused(owner_client: AsyncClient, store: Store) -> None:
    await with_notes(store, 1, note("alex"))
    twice = [{"person": "alex", "public": True}, {"person": "alex", "public": False}]
    body = await form_body(owner_client, 1, buddy_notes=twice)
    assert (await owner_client.put(f"{ADMIN}/dives/1", json=body)).status_code == 422


async def test_a_buddy_taken_off_the_dive_takes_the_note_along(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex"), note("kim_de_boer"))
    body = await form_body(owner_client, 1, people_ids=["kim_de_boer"])
    saved = (await owner_client.put(f"{ADMIN}/dives/1", json=body)).json()
    assert [n["person"] for n in saved["buddy_notes"]] == ["kim"]
    assert [r["person"] for r in saved["sign_requests"]] == ["kim"]


async def test_a_new_dive_starts_without_notes(owner_client: AsyncClient, store: Store) -> None:
    body = {"number": 50, "date": "2026-10-10", "duration_min": 40, "max_depth_m": 12}
    created = await owner_client.post(f"{ADMIN}/dives", json=body | {"buddy_notes": []})
    assert created.status_code == 201, created.text
    assert created.json()["buddy_notes"] == []
    assert created.json()["sign_requests"] == []


def test_the_api_change_is_additive() -> None:
    schemas = openapi_document()["components"]["schemas"]
    note_fields = {"person", "comment", "strokes", "signed_at", "public"}
    assert set(schemas["BuddyNoteOut"]["properties"]) == note_fields
    assert "buddy_notes" in schemas["DiveOut"]["properties"]
    assert "buddy_notes" not in schemas["DiveIn"].get("required", [])
    admin = schemas["DiveAdminOut"]["properties"]
    assert {"buddy_notes", "sign_requests"} <= set(admin)
    request_fields = {"person", "state", "sent_at", "expires_at", "signed_at"}
    assert set(schemas["SignRequestOut"]["properties"]) == request_fields


def test_the_dive_schema_carries_buddy_notes() -> None:
    schema_file = Path(__file__).resolve().parents[3] / "schema" / "v1" / "dive.json"
    schema = json.loads(schema_file.read_text())
    assert "buddy_notes" in schema["properties"]
    assert "BuddyNoteRecord" in schema["$defs"]


async def test_the_new_dive_template_does_not_copy_notes(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 4, note("alex"))
    template = (await owner_client.get(f"{ADMIN}/dives/template?date=2026-10-25")).json()
    assert template["previous"]["number"] == 4
    assert template["previous"]["buddy_notes"] is None


async def test_the_form_names_a_note_by_slug_or_id_and_keeps_what_the_buddy_wrote(
    owner_client: AsyncClient, store: Store
) -> None:
    drawn = note("kim_de_boer", comment="Cold", strokes=SCRIBBLE, public=True)
    await with_notes(store, 1, drawn, note("alex"))
    edits = [{"person": "kim_de_boer", "public": False}, {"person": "alex", "public": True}]
    body = await form_body(owner_client, 1, buddy_notes=edits)
    assert (await owner_client.put(f"{ADMIN}/dives/1", json=body)).status_code == 200
    assert store.dives[1].buddy_notes == [
        drawn.model_copy(update={"public": False}),
        note("alex"),
    ]


async def test_the_form_cannot_create_a_note_for_a_buddy_who_has_none(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex"))
    edits = [
        {"person": "alex", "public": True},
        {"person": "kim", "public": True},
        {"person": "nobody", "public": True},
    ]
    body = await form_body(owner_client, 1, buddy_notes=edits)
    assert (await owner_client.put(f"{ADMIN}/dives/1", json=body)).status_code == 200
    assert store.dives[1].buddy_notes == [note("alex")]


async def test_saving_the_same_notes_twice_changes_nothing(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex", strokes=SCRIBBLE))
    edits = [{"person": "alex", "public": False}]
    body = await form_body(owner_client, 1, buddy_notes=edits)
    first = (await owner_client.put(f"{ADMIN}/dives/1", json=body)).json()
    second = (await owner_client.put(f"{ADMIN}/dives/1", json=body)).json()
    assert first["buddy_notes"] == second["buddy_notes"]
    assert len(store.dives[1].buddy_notes) == 1


async def test_an_empty_list_deletes_every_note_and_no_list_keeps_them(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex"), note("kim_de_boer"))
    await owner_client.put(f"{ADMIN}/dives/1", json=await form_body(owner_client, 1))
    assert len(store.dives[1].buddy_notes) == 2
    body = await form_body(owner_client, 1, buddy_notes=[])
    await owner_client.put(f"{ADMIN}/dives/1", json=body)
    assert store.dives[1].buddy_notes == []


async def test_a_patch_keeps_the_notes_and_the_requests(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex"))
    patched = await owner_client.patch(f"{ADMIN}/dives/1", json={"cover_attachment_id": None})
    assert patched.status_code == 200, patched.text
    assert [n["person"] for n in patched.json()["buddy_notes"]] == ["alex"]
    assert [r["state"] for r in patched.json()["sign_requests"]] == ["none", "signed", "no_email"]


async def test_the_public_page_never_shows_a_private_note_to_the_owner_either(
    owner_client: AsyncClient, store: Store
) -> None:
    await with_notes(store, 1, note("alex", public=False), note("kim_de_boer"))
    public = (await owner_client.get("/api/v1/dive/dives/1")).json()
    assert [n["person"] for n in public["buddy_notes"]] == ["kim"]
    editor = (await owner_client.get(f"{ADMIN}/dives/1")).json()
    assert sorted(n["person"] for n in editor["buddy_notes"]) == ["alex", "kim"]


async def test_a_dive_file_with_two_notes_for_one_person_is_reported_not_loaded(
    store: Store,
) -> None:
    await with_notes(store, 1, note("alex"))
    path = store.dive_path(1)
    meta, body = read_markdown(path)
    meta["buddy_notes"] = [meta["buddy_notes"][0], meta["buddy_notes"][0]]
    write_markdown(path, meta, body)
    await store.reload()
    assert 1 not in store.dives
    assert store.errors
