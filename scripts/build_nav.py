#!/usr/bin/env python3
"""Regenerate partials/nav-sections.json from the pages themselves.

The menu shows each page's sections as sub-items, from every page rather than
only the one you are on -- which is when you least need them. That means the
menu has to know about sections on pages it is not currently displaying.

Rather than type that list out, it is derived from the pages: any <section>
with an id and an <h2> becomes a sub-item, labelled with that heading, or with
data-nav-label if the heading is unsuitable for a menu.

The research page is the exception: its sections carry neither an id nor a
heading in the markup, because assets/js/research.js draws them from
data/research-areas.json. A <section data-area="..."> takes both from that file,
which is where an area is described.

Run this after adding, removing or retitling a section:

    python3 scripts/build_nav.py

scripts/check_data.py fails the deploy if the committed file does not match the
pages, so a forgotten regeneration cannot ship.
"""

import json
import os
import sys
from html.parser import HTMLParser

# The order the menu presents them in; mirrors partials/nav-button.html.
# url -> file. The site serves directory urls (/research/, not /research.html),
# so the menu's links and this manifest are keyed by the url a visitor sees,
# while the sections are read out of that page's index.html.
PAGES = {
    "/": "index.html",
    "/research/": "research/index.html",
    "/people/": "people/index.html",
    "/publications/": "publications/index.html",
    "/engage/": "engage/index.html",
}

OUTPUT = os.path.join("partials", "nav-sections.json")


class Sections(HTMLParser):
    """Collect (id, label) for every <section id> containing an <h2>.

    Comments are ignored, exactly as a browser ignores them, so a commented-out
    section does not appear in the menu.
    """

    def __init__(self):
        super().__init__()
        self.found = []
        self._cur = None
        self._in_h2 = False
        self._buf = ""

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "section" and (d.get("id") or d.get("data-area")):
            self._cur = {"id": d.get("id"), "label": d.get("data-nav-label"),
                         "area": d.get("data-area"), "h2": None}
        if tag == "h2" and self._cur is not None and self._cur["h2"] is None:
            self._in_h2 = True
            self._buf = ""

    def handle_data(self, data):
        if self._in_h2:
            self._buf += data

    def handle_endtag(self, tag):
        if tag == "h2" and self._in_h2:
            self._in_h2 = False
            # Drop the collapsible caret glyphs and collapse whitespace.
            text = self._buf
            for caret in "▾▴▼▲":
                text = text.replace(caret, "")
            self._cur["h2"] = " ".join(text.split())
        if tag == "section" and self._cur is not None:
            label = self._cur["label"] or self._cur["h2"]
            # An area's label is not in the markup to be found; collect() fills
            # it in from the data.
            if label or self._cur["area"]:
                self.found.append({"id": self._cur["id"], "label": label,
                                   "area": self._cur["area"]})
            self._cur = None


def areas(root):
    """id -> heading, for the sections whose words live in the data."""
    path = os.path.join(root, "data", "research-areas.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return {a["id"]: a.get("heading") for a in json.load(fh)}


def collect(root="."):
    headings = areas(root)
    out = {}
    for url, page in PAGES.items():
        path = os.path.join(root, page)
        if not os.path.exists(path):
            continue
        parser = Sections()
        with open(path, encoding="utf-8") as fh:
            parser.feed(fh.read())
        items = []
        for found in parser.found:
            # An area section carries neither: both its anchor id and its
            # heading are the area's own, from data/research-areas.json.
            sid = found["id"] or found["area"]
            label = found["label"] or headings.get(found["area"])
            if sid and label:
                items.append({"id": sid, "label": label})
        out[url] = items
    return out


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    data = collect(root)
    path = os.path.join(root, OUTPUT)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    total = sum(len(v) for v in data.values())
    print(f"wrote {path}: {len(data)} pages, {total} sub-items")
    for page, items in data.items():
        print(f"  {page:20s} {', '.join(i['label'][:28] for i in items) or '(none)'}")


if __name__ == "__main__":
    main()
