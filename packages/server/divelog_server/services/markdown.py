"""Owner-written Markdown rendered to sanitised HTML for the ``*_html`` fields of the API.

``markdown-it-py`` with raw HTML disabled does the rendering; ``nh3`` then removes everything
outside a small allowlist, so no text an author types can inject markup or script. Headings are
shifted one level down (``#`` becomes ``h2``) because the page title is the only ``h1``.
"""

import nh3
from markdown_it import MarkdownIt
from markdown_it.rules_core import StateCore

MAX_HEADING = 6

TAGS = {
    "p",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "em",
    "strong",
    "s",
    "del",
    "code",
    "pre",
    "blockquote",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "br",
}
ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title"},
    "ol": {"start"},
}
URL_SCHEMES = {"http", "https", "mailto"}


def _shift_headings(state: StateCore) -> None:
    for token in state.tokens:
        if token.type in ("heading_open", "heading_close"):
            level = min(int(token.tag[1]) + 1, MAX_HEADING)
            token.tag = f"h{level}"


def _image_scheme_filter(element: str, attribute: str, value: str) -> str | None:
    if element == "img" and attribute == "src" and value.lower().startswith("mailto:"):
        return None
    return value


_md = MarkdownIt("commonmark", {"html": False}).enable(["table", "strikethrough"])
_md.core.ruler.push("shift_headings", _shift_headings)


def render(text: str | None) -> str | None:
    """Render Markdown to sanitised HTML.

    Parameters
    ----------
    text
        Markdown source; raw HTML in it is escaped, not passed through.

    Returns
    -------
    str or None
        The HTML, an empty string for blank input, or None when ``text`` is None.
    """
    if text is None:
        return None
    if not text.strip():
        return ""
    return nh3.clean(
        _md.render(text),
        tags=TAGS,
        attributes=ATTRIBUTES,
        url_schemes=URL_SCHEMES,
        link_rel="noopener",
        attribute_filter=_image_scheme_filter,
    ).strip()
