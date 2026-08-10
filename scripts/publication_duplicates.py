#!/usr/bin/env python3
"""Find publications entered more than once.

The same paper entered twice renders twice on the publications page, and the
two rows rarely agree: in the data as it stands every duplicated pair carries a
different keyword set, so a duplicate also silently changes which theme filters
the paper appears under.

Run it directly against a publications file:

    python3 publication_duplicates.py data/publications.json

or import duplicate_publications() and pass the parsed dict.

A copy of this file lives in the private asb-website-data repository, as
sync/publication_duplicates.py, so the sync can run the same check while the
person who can fix the Coda rows is still at the keyboard. Neither repository
can import from the other -- that one is private, and this repository's
scripts/ is never published -- so it is copied. Improve one, copy it across.
"""

import json
import re
import sys
import urllib.parse

CITATION_KEY_RE = re.compile(r"@\s*\w+\s*\{\s*([^,\s]+)\s*,")
# A DOI as it appears in a url or a bibtex field. The closing brace and comma
# are excluded so `DOI = {10.1371/journal.pcbi.1013460},` yields just the DOI.
DOI_RE = re.compile(r"\b10\.\d{4,9}/[^\s\"{},)>]+", re.I)
# An arXiv id from a link, from bibtex `eprint = {2504.15442}`, or from the
# `arXiv:2504.15442` that ends up in a journal field. Both the modern
# 2504.15442 form and the old math.AG/0601001 form.
ARXIV_RE = re.compile(
    r"(?:arxiv\.org/(?:abs|pdf)/|arxiv[:\s]\s*|eprint\s*=\s*[{\"])\s*"
    r"([0-9]{4}\.[0-9]{4,5}|[a-z-]+(?:\.[A-Z]{2})?/[0-9]{7})",
    re.I,
)


def normalise_title(title):
    """Fold a title to letters, digits and single spaces.

    Punctuation and case are what differ between two hand-entered copies of the
    same title, so neither should defeat the comparison.
    """
    import html

    text = html.unescape(title or "").lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def normalise_link(url):
    """Identify the document a url points at, ignoring how it was written.

    The scheme, a www. or dx. prefix and a trailing slash all vary between
    copies of the same link. The query string is kept: PLOS and Google Books
    put the article's identity there, so dropping it collapses unrelated papers
    onto one value -- five distinct PLOS papers, in this data.
    """
    if not (url or "").strip():
        return None
    parts = urllib.parse.urlsplit(url.strip())
    host = re.sub(r"^(www|dx)\.", "", parts.netloc.lower())
    path = parts.path.rstrip("/")
    return f"{host}{path}?{parts.query}" if parts.query else f"{host}{path}"


def publication_signals(pub):
    """Values that, shared by two records, mean they are the same paper.

    Each is checked independently, because each catches duplicates the others
    miss:

      citation key  the two copies of "Reduction of dimension for nonlinear
                    dynamical systems" share one, but link to different sites
                    (PubMed and Springer) and so match on nothing else
      title         the two copies of "Topological model selection" have
                    different citation keys, one generated from the arXiv
                    posting and one from the journal version
      link, DOI     catch a copy whose title was retyped or corrected
      arXiv id      links the arXiv posting of a paper to its journal version,
                    which cite the same eprint from different fields
    """
    signals = {}

    match = CITATION_KEY_RE.search(pub.get("bibtex") or "")
    if match:
        signals["citation key"] = {match.group(1).lower()}

    title = normalise_title(pub.get("publication_title"))
    if title:
        signals["title"] = {title}

    links = {normalise_link(pub.get(f)) for f in ("link_publication", "link_arxiv")}
    links.discard(None)
    if links:
        signals["link"] = links

    everywhere = [pub.get(f) or "" for f in ("link_publication", "link_arxiv", "bibtex")]

    dois = {m.group(0).lower().rstrip(".") for text in everywhere for m in DOI_RE.finditer(text)}
    if dois:
        signals["DOI"] = dois

    eprints = {m.group(1).lower() for text in everywhere for m in ARXIV_RE.finditer(text)}
    if eprints:
        signals["arXiv id"] = eprints

    return signals


def duplicate_publications(pubs):
    """Report records that any signal says are the same paper.

    Records are grouped transitively -- if A and B share a DOI and B and C
    share a title, all three are one duplicate -- so a paper entered three ways
    is reported once rather than as three overlapping pairs.

    Returns a sorted list of human-readable problems, empty if all is well.
    """
    rows = list(pubs.items())
    parent = list(range(len(rows)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        a, b = find(i), find(j)
        if a != b:
            parent[max(a, b)] = min(a, b)

    # Why each pair was joined, so the report names the evidence.
    reasons = {}
    seen = {}
    for index, (_, pub) in enumerate(rows):
        for kind, values in publication_signals(pub).items():
            for value in values:
                first = seen.setdefault((kind, value), index)
                if first != index:
                    union(first, index)
                    reasons.setdefault(frozenset((first, index)), set()).add(kind)

    groups = {}
    for index in range(len(rows)):
        groups.setdefault(find(index), []).append(index)

    problems = []
    for members in groups.values():
        if len(members) < 2:
            continue
        why = set()
        for pair, kinds in reasons.items():
            if pair <= set(members):
                why |= kinds
        title = rows[members[0]][1].get("publication_title") or "(untitled)"
        ids = ", ".join(rows[i][0] for i in members)
        problems.append(
            f"duplicate publication, {len(members)} copies of {title[:70]!r} "
            f"(same {' and '.join(sorted(why))}) -- rows {ids}. "
            f"Merge them at the source; the copies' keywords usually differ, so "
            f"check which themes the paper should appear under before deleting either."
        )
    return sorted(problems)


def main():
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} path/to/publications.json", file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as fh:
        pubs = json.load(fh)
    problems = duplicate_publications(pubs)
    for problem in problems:
        print(f"  {problem}")
    print(f"{len(problems)} duplicate(s) among {len(pubs)} publications.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
