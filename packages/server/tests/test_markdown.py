from divelog_server.services.markdown import render


def test_none_and_blank() -> None:
    assert render(None) is None
    assert render("") == ""
    assert render("  \n") == ""


def test_script_tag_is_escaped() -> None:
    html = render("<script>alert(1)</script>") or ""
    assert "<script" not in html
    assert "&lt;script&gt;" in html


def test_raw_html_is_escaped() -> None:
    html = render('Hello <b onclick="x()">bold</b> <img src=x onerror=alert(1)>') or ""
    assert "<b" not in html
    assert "<img" not in html
    assert "&lt;b onclick" in html


def test_javascript_links_are_dropped() -> None:
    html = render("[click](javascript:alert(1)) ![pic](javascript:alert(1))") or ""
    assert "javascript:" not in html.replace("(javascript:", "")
    assert "href=" not in html
    assert "<img" not in html


def test_headings_shift_one_level() -> None:
    assert render("# Title") == "<h2>Title</h2>"
    assert render("### Deep") == "<h4>Deep</h4>"
    assert render("###### Deepest") == "<h6>Deepest</h6>"


def test_common_blocks_render() -> None:
    html = render(
        "Some *em* and **strong** and `code`.\n\n- one\n- two\n\n1. first\n\n> quote\n\n"
        "```\nx < y\n```\n\n[site](https://example.com) [mail](mailto:a@b.nl) [rel](/dive/1)\n\n"
        "![photo](/media/a.jpg) ~~gone~~"
    )
    assert html is not None
    for fragment in (
        "<em>em</em>",
        "<strong>strong</strong>",
        "<code>code</code>",
        "<ul>\n<li>one</li>",
        "<ol>\n<li>first</li>",
        "<blockquote>",
        "<pre><code>x &lt; y\n</code></pre>",
        '<a href="https://example.com" rel="noopener">site</a>',
        '<a href="mailto:a@b.nl" rel="noopener">mail</a>',
        '<a href="/dive/1" rel="noopener">rel</a>',
        '<img src="/media/a.jpg" alt="photo">',
        "<s>gone</s>",
    ):
        assert fragment in html, fragment


def test_tables_render() -> None:
    html = render("| a | b |\n|:--|--:|\n| 1 | 2 |") or ""
    assert "<table>" in html
    assert "<td>2</td>" in html
    assert "style" not in html
