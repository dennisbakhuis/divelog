"""The admin site search: every word must match a field, typos allowed, best matches first."""

import pytest

from divelog_server.importers.site_match import nearby
from divelog_server.store.models import SiteRecord
from divelog_server.store.site_search import NAME_KINDS, SiteIndex, match, rank, words
from divelog_server.store.store import Store

SITES = [
    SiteRecord(site_id="mex-tortuga", name="Tortuga", area="Tulum", lat=20.2, lon=-87.4),
    SiteRecord(site_id="mex-las-tortugas", name="Las Tortugas", area="Cozumel"),
    SiteRecord(
        site_id="mex-dos-ojos",
        name="Dos Ojos",
        full_name="Cenote Dos Ojos",
        area="Tulum",
        lat=20.3,
        lon=-87.4,
    ),
    SiteRecord(site_id="mex-dive-center", name="Dive Center Reef", area="Akumal"),
    SiteRecord(site_id="egy-blue-hole", name="Blue Hole", area="Dahab"),
    SiteRecord(site_id="egy-canyon", name="The Canyon", area="Dahab", aliases=["Canyon Dahab"]),
    SiteRecord(site_id="blz-great-blue-hole", name="Great Blue Hole", area="Lighthouse Reef"),
    SiteRecord(site_id="phl-coral-garden", name="Coral Garden", area="Anilao"),
    SiteRecord(site_id="phl-coralia", name="Coralia", area="Anilao"),
    SiteRecord(site_id="phl-corel-garden", name="Corel Garden", area="Moalboal"),
    SiteRecord(site_id="mlt-um-el-faroud", name="Um El Faroud", aliases=["Faroud wreck"]),
]


@pytest.fixture(scope="module")
def index() -> SiteIndex:
    """The search index over the fixture sites."""
    return SiteIndex.of(SITES)


def test_words_ignore_case_accents_and_punctuation() -> None:
    assert words("  Tortúga, BLUE-hole!") == ("tortuga", "blue", "hole")
    assert words(" - ") == ()


def test_every_word_must_match_some_field(index: SiteIndex) -> None:
    assert rank("blue hole dahab", index) == ["egy-blue-hole"]
    assert rank("blue hole", index) == ["egy-blue-hole", "blz-great-blue-hole"]
    assert rank("tulum cenote", index) == ["mex-dos-ojos"]
    assert rank("blue tulum", index) == []


def test_a_typo_still_finds_the_site(index: SiteIndex) -> None:
    assert rank("tortuge", index) == ["mex-tortuga"]
    assert rank("dahb canyon", index) == ["egy-canyon"]
    assert rank("graet blue hole", index) == ["blz-great-blue-hole"]


def test_near_misses_stay_out(index: SiteIndex) -> None:
    assert rank("cenote", index) == ["mex-dos-ojos"]
    assert "mex-dive-center" not in match("cenote", index)
    assert rank("hold", index) == []


def test_exact_and_prefix_rank_above_substring_and_fuzzy(index: SiteIndex) -> None:
    assert rank("coral", index) == ["phl-coral-garden", "phl-coralia", "phl-corel-garden"]
    found = match("coral", index)
    assert found["phl-coral-garden"].worst > found["phl-coralia"].worst
    assert found["phl-coralia"].worst > 0 > found["phl-corel-garden"].worst
    assert rank("tortuga", index) == ["mex-tortuga", "mex-las-tortugas"]
    assert rank("ojo", index) == ["mex-dos-ojos"]
    assert match("sojo", index)["mex-dos-ojos"].worst == 1.0


def test_a_whole_name_comes_first(index: SiteIndex) -> None:
    assert rank("coral garden", index)[0] == "phl-coral-garden"
    assert rank("canyon dahab", index)[0] == "egy-canyon"
    assert match("canyon dahab", index)["egy-canyon"].whole


def test_names_and_aliases_only(index: SiteIndex) -> None:
    assert rank("dahab", index, NAME_KINDS) == ["egy-canyon"]
    assert not match("dahab", index, NAME_KINDS)["egy-canyon"].by_name
    assert match("canyon", index, NAME_KINDS)["egy-canyon"].by_name
    assert match("faroud wrek", index, NAME_KINDS)["mlt-um-el-faroud"].by_name is False


def test_an_empty_query_matches_nothing(index: SiteIndex) -> None:
    assert match("", index) == {}
    assert match(" , ", index) == {}


def test_nearby_keeps_distance_first_and_ranks_the_unplaced(index: SiteIndex) -> None:
    found = nearby("tortuge", 20.3, -87.4, SITES)
    assert [(m.site_id, m.matched_by) for m in found] == [
        ("mex-dos-ojos", "distance"),
        ("mex-tortuga", "name"),
    ]
    unplaced = nearby("coral", None, None, SITES, index=index)
    assert [m.site_id for m in unplaced] == [
        "phl-coral-garden",
        "phl-coralia",
        "phl-corel-garden",
    ]
    assert [m.matched_by for m in nearby("faroud wreck", None, None, SITES)] == ["alias"]


def test_a_few_thousand_sites_are_quick() -> None:
    sites = [
        SiteRecord(site_id=f"xxx-site-{n}", name=f"Reef {n} Wall", area=f"Area {n % 50}")
        for n in range(3000)
    ]
    index = SiteIndex.of(sites)
    assert len(rank("reef wal", index)) == 3000


def test_the_commons_index_is_built_once_per_load(commons_store: Store) -> None:
    index = commons_store.commons_index()
    assert commons_store.commons is not None
    assert set(index.entries) == set(commons_store.commons.sites)
    assert commons_store.commons_index() is index
    commons_store.load()
    assert commons_store.commons_index() is not index
