from pathlib import Path

from divelog_server.store.files import read_markdown, write_markdown
from divelog_server.store.models import DiveRecord
from divelog_server.store.store import Store, frontmatter, profile_depths, spark_depths


def test_store_loads_fixture_tree(store: Store) -> None:
    assert sorted(store.dives) == [1, 2, 3, 4]
    assert set(store.sites) == {"zeelandbrug", "ressel", "secret"}
    assert store.people["kim_de_boer"].public_name == "Kim"
    assert store.people["ghost"].public_name is None
    assert store.dives_by_site["zeelandbrug"] == [1, 3, 4]
    assert store.dives_by_person["kim_de_boer"] == [1]
    assert store.person_by_slug["kim"] == "kim_de_boer"
    assert store.reference_maps[0].public is False
    assert store.errors == []


def test_bad_file_is_reported_not_fatal(store: Store) -> None:
    (store.root / "dives" / "00009.md").write_text("---\nnumber: nine\ndate: 2024-01-01\n---\n")
    store.load()
    assert 9 not in store.dives
    assert any("00009.md" in e for e in store.errors)
    assert len(store.dives) == 4


def test_reference_map_marked_public_is_forced_private(store: Store) -> None:
    index = store.root / "maps" / "reference" / "index.json"
    index.write_text(index.read_text().replace('"public": false', '"public": true'))
    store.load()
    assert store.reference_maps[0].public is False
    assert any("forced private" in e for e in store.errors)


def test_markdown_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "x.md"
    meta = {"name": "'t Koepeltje", "summary": '"Quoted" — dash', "list": ["a", "b"]}
    write_markdown(path, meta, "Body **text**\n")
    assert not list(tmp_path.glob(".*.tmp"))
    back, body = read_markdown(path)
    assert back == meta
    assert body == "Body **text**\n"


def test_frontmatter_drops_empty_values() -> None:
    record = DiveRecord(number=1, date="2024-01-01", duration_min=10, body_md="x")  # type: ignore[arg-type]
    meta = frontmatter(record)
    assert "body_md" not in meta
    assert "people" not in meta
    assert meta["gas"] == "air"


async def test_save_dive_writes_file_and_reindexes(store: Store) -> None:
    dive = store.dives[1].model_copy(update={"site": "ressel"})
    await store.save_dive(dive, "move")
    assert store.dives_by_site["ressel"] == [1, 2]
    meta, _ = read_markdown(store.dive_path(1))
    assert meta["site"] == "ressel"
    await store.delete_dive(1, "gone")
    assert not store.dive_path(1).exists()
    assert 1 not in store.dives_by_site["ressel"]


def test_profile_samples_from_columnar_file(store: Store) -> None:
    rows = store.profile_samples(store.dives[2])
    assert rows is not None
    assert rows[1] == {"t": 600, "d": 40.0, "temp": 13, "ndl": 5}
    assert store.profile_samples(store.dives[1]) is None


def test_sparkline_from_profile(store: Store) -> None:
    assert store.sparkline(store.dives[2]) == [0, 400, 0]
    assert store.sparkline(store.dives[1]) is None


def test_spark_depths_keeps_the_deepest_of_each_slice() -> None:
    depths = [0.0] * 100
    depths[37] = 44.2
    spark = spark_depths(depths)
    assert spark is not None
    assert len(spark) == 24
    assert max(spark) == 442
    assert spark_depths([]) is None
    assert spark_depths([1.26, 2.0]) == [13, 20]


def test_profile_depths_reads_both_formats() -> None:
    assert profile_depths({"t_s": [0, 60], "depth_m": [0, 12.5]}) == [0.0, 12.5]
    assert profile_depths({"samples": [{"t": 0, "d": 3}, {"t": 60}]}) == [3.0]


def test_person_by_name_matches_former_names(store: Store) -> None:
    person = store.person_by_name("kim jansen")
    assert person is not None and person.id == "kim_de_boer"
    assert store.person_by_name("Nobody") is None
