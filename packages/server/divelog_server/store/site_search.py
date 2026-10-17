"""Find sites by the words someone types: every word has to match, small typos allowed.

A query is split into words, ignoring case, accents and punctuation. A word matches a site
when it equals a token of one of the site's searchable fields (name, full name, short name,
aliases, area), starts one, occurs anywhere in one, or is a near miss of one: an optimal
string alignment similarity of at least :data:`FUZZY_CUTOFF`, which is one typo (a wrong,
missing, extra or swapped letter) per five letters of the longer of the two. So "tortuge" finds
"Tortuga" while "cenote" does not find "center" (two edits in six letters) and four-letter
words need to be spelled right. A site matches when every word matches some field, not
necessarily the same one, so "blue hole dahab" finds Blue Hole in the area Dahab.

Hits rank by how well their worst word matched (exact, prefix, substring, then near misses by
similarity), then by the sum over all words; a query that is a whole name or alias comes
first. :class:`SiteIndex` holds the tokens of a set of sites, built once per store load.
"""

import re
import unicodedata
from collections.abc import Collection, Iterable
from dataclasses import dataclass
from typing import Literal

from rapidfuzz import process
from rapidfuzz.distance import OSA

from divelog_server.store.models import SiteRecord

FUZZY_CUTOFF = 0.8
_PREFILTER = FUZZY_CUTOFF - 0.05

EXACT = 3.0
PREFIX = 2.0
SUBSTRING = 1.0

FieldKind = Literal["name", "alias", "area"]
ALL_KINDS: frozenset[FieldKind] = frozenset({"name", "alias", "area"})
NAME_KINDS: frozenset[FieldKind] = frozenset({"name", "alias"})

_WORD = re.compile(r"[^\W_]+")


def normalize(text: str) -> str:
    """Case-folded text without accents: ``"Tortúga"`` becomes ``"tortuga"``."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def words(text: str) -> tuple[str, ...]:
    """The normalised words of ``text``; punctuation separates words."""
    return tuple(_WORD.findall(normalize(text)))


@dataclass(frozen=True)
class SearchField:
    """One searchable text of a site, as tokens and as the tokens run together."""

    kind: FieldKind
    tokens: tuple[str, ...]
    compact: str

    @classmethod
    def of(cls, kind: FieldKind, text: str) -> "SearchField":
        """The field for ``text``."""
        tokens = words(text)
        return cls(kind, tokens, "".join(tokens))


@dataclass(frozen=True)
class SearchEntry:
    """The searchable fields of one site."""

    site_id: str
    fields: tuple[SearchField, ...]

    @classmethod
    def of(cls, site: SiteRecord) -> "SearchEntry":
        """The entry for a site record."""
        texts: list[tuple[FieldKind, str | None]] = [
            ("name", site.name),
            ("name", site.full_name),
            ("name", site.short_name),
            *(("alias", a) for a in site.aliases),
            ("area", site.area),
        ]
        fields = (SearchField.of(kind, text) for kind, text in texts if text)
        return cls(site.site_id, tuple(f for f in fields if f.tokens))


class SiteIndex:
    """The search entries of a set of sites and the vocabulary of their tokens.

    Parameters
    ----------
    entries
        One entry per site.
    """

    def __init__(self, entries: Iterable[SearchEntry]) -> None:
        self.entries: dict[str, SearchEntry] = {e.site_id: e for e in entries}
        self.vocabulary: list[str] = sorted(
            {t for e in self.entries.values() for f in e.fields for t in f.tokens}
        )

    @classmethod
    def of(cls, sites: Iterable[SiteRecord]) -> "SiteIndex":
        """The index over site records."""
        return cls(SearchEntry.of(s) for s in sites)


@dataclass(frozen=True)
class SearchScore:
    """How a site matched a query.

    Attributes
    ----------
    site_id
        The site.
    whole
        The query's words are exactly the words of one name or alias.
    worst
        The quality of the weakest word: 3 exact token, 2 prefix, 1 substring, below 0 a near
        miss (similarity minus one).
    total
        The qualities of all words added up.
    by_name
        Every word matched a name field (name, full name or short name), not only an alias or
        the area.
    """

    site_id: str
    whole: bool
    worst: float
    total: float
    by_name: bool

    @property
    def rank(self) -> tuple[bool, float, float]:
        """Sort key, best first."""
        return (not self.whole, -self.worst, -self.total)


def _near_misses(word: str, vocabulary: list[str]) -> dict[str, float]:
    found = process.extract(
        word,
        vocabulary,
        scorer=OSA.normalized_similarity,
        # rapidfuzz rounds its cutoff into a distance and drops a similarity of exactly 0.8,
        # so it only prefilters and the cutoff itself is applied here.
        score_cutoff=_PREFILTER,
        limit=None,
    )
    return {token: score for token, score, _ in found if score >= FUZZY_CUTOFF}


def _quality(word: str, near: dict[str, float], field: SearchField) -> float | None:
    if word in field.tokens:
        return EXACT
    if any(t.startswith(word) for t in field.tokens):
        return PREFIX
    if word in field.compact:
        return SUBSTRING
    best = max((near[t] for t in field.tokens if t in near), default=None)
    return best - 1.0 if best is not None else None


def _score(
    entry: SearchEntry,
    terms: tuple[str, ...],
    near: list[dict[str, float]],
    kinds: Collection[FieldKind],
) -> SearchScore | None:
    fields = [f for f in entry.fields if f.kind in kinds]
    qualities: list[float] = []
    by_name = True
    for word, misses in zip(terms, near, strict=True):
        best: float | None = None
        named = False
        for f in fields:
            quality = _quality(word, misses, f)
            if quality is None:
                continue
            named = named or f.kind == "name"
            if best is None or quality > best:
                best = quality
        if best is None:
            return None
        qualities.append(best)
        by_name = by_name and named
    whole = any(f.tokens == terms for f in fields if f.kind != "area")
    return SearchScore(entry.site_id, whole, min(qualities), sum(qualities), by_name)


def match(
    query: str, index: SiteIndex, kinds: Collection[FieldKind] = ALL_KINDS
) -> dict[str, SearchScore]:
    """Every site of ``index`` that matches all words of ``query``.

    Parameters
    ----------
    query
        What was typed; an empty query (no words) matches nothing.
    index
        The sites to look through.
    kinds
        The kinds of field a word may match: names, aliases and the area by default.

    Returns
    -------
    dict[str, SearchScore]
        The matching sites by id; sort by :attr:`SearchScore.rank` for the best first.
    """
    terms = words(query)
    if not terms:
        return {}
    near = [_near_misses(t, index.vocabulary) for t in terms]
    found: dict[str, SearchScore] = {}
    for entry in index.entries.values():
        score = _score(entry, terms, near, kinds)
        if score is not None:
            found[entry.site_id] = score
    return found


def rank(query: str, index: SiteIndex, kinds: Collection[FieldKind] = ALL_KINDS) -> list[str]:
    """The ids of the sites matching ``query``, best match first, then by site id."""
    found = match(query, index, kinds)
    return sorted(found, key=lambda sid: (found[sid].rank, sid))
