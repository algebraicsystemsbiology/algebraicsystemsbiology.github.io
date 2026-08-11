#!/usr/bin/env python3
"""Check that every link on the site resolves.

Two kinds, and they fail differently.

**Internal** -- pages, assets, images, partials, and the fragments the menu
points at. A broken one is a mistake in this repository and always fails.

**External** -- the group members' own sites, ORCID and Scholar profiles,
GitHub accounts, and every publication link. These live on other people's
servers: they rot, and they are the reason this script exists. But they also
fail for reasons that are nobody's fault -- a timeout, a rate limit, a server
that refuses anything that looks automated -- so only a definite 404, 410 or
a hostname that does not resolve counts as broken. Everything else is
reported and passed over.

    python3 scripts/check_links.py .                  # internal only, fast
    python3 scripts/check_links.py . --external       # and the outside world
    python3 scripts/check_links.py _site --external   # what CI runs

Exits non-zero if anything is broken.
"""

import argparse
import concurrent.futures
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

# Pretending to be a browser is not politeness, it is necessity: a plain
# urllib user-agent is refused outright by several publishers.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
TIMEOUT = 20
WORKERS = 12

SKIP_SCHEMES = ("mailto:", "tel:", "javascript:", "data:")


class Links(HTMLParser):
    """Every href/src in a page, with the ids it defines."""

    def __init__(self):
        super().__init__()
        self.refs = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.add(d["id"])
        for attr in ("href", "src"):
            value = d.get(attr)
            if value:
                self.refs.append((tag, attr, value.strip()))


def html_files(root):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in (".git", ".github", "scripts", "node_modules", "_site", "pdf")]
        for name in files:
            if name.endswith(".html"):
                yield os.path.join(base, name)


def parse(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        parser = Links()
        parser.feed(fh.read())
        return parser


def resolve(root, page, ref):
    """Where a reference points on disk, or None if it leaves the site."""
    ref = ref.split("?")[0]
    if ref.startswith("/"):
        target = os.path.join(root, ref.lstrip("/"))
    else:
        target = os.path.join(os.path.dirname(page), ref)
    return os.path.normpath(target)


# Paths that only exist inside JavaScript: the data and partials each page
# fetches at runtime. No scan of the html would see them, and they are exactly
# what a reorganisation breaks -- the pages still load, and the content simply
# never arrives.
FETCHED = re.compile(r"""['"](/(?:data|partials|assets|images)/[^'"]+)['"]""")


# The same paths written *without* a leading slash. In a page that would be
# harmless; in JavaScript it is a trap, because the path resolves against
# whichever page loaded the script -- so `data/photos/x.jpg` became
# /people/data/photos/x.jpg the moment People moved into a folder, and every
# member photograph 404'd while the page still looked fine.
RELATIVE = re.compile(r"""['"`](?:\./)?((?:data|partials|images)/[^'"`\s]*)""")


def check_relative_in_js(root):
    problems = []
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in (".git", ".github", "node_modules", "_site", "pdf")]
        for name in files:
            if not name.endswith(".js"):
                continue
            source = os.path.join(base, name)
            with open(source, encoding="utf-8", errors="replace") as fh:
                for number, line in enumerate(fh, 1):
                    if line.lstrip().startswith(("//", "*")):
                        continue
                    for ref in RELATIVE.findall(line):
                        problems.append(
                            f"{os.path.relpath(source, root)}:{number}: \"{ref}\" is relative, so it "
                            f"resolves against whatever page loads this script -- write /{ref}"
                        )
    return problems


def check_fetched(root):
    problems = []
    checked = 0
    sources = []
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in (".git", ".github", "node_modules", "_site", "pdf")]
        for name in files:
            if name.endswith((".js", ".html")):
                sources.append(os.path.join(base, name))

    for source in sources:
        with open(source, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        for ref in set(FETCHED.findall(text)):
            # A url built by concatenation is not a literal path.
            if any(c in ref for c in "${+"):
                continue
            checked += 1
            target = os.path.join(root, ref.lstrip("/").split("?")[0])
            if not os.path.exists(target):
                problems.append(f"{os.path.relpath(source, root)}: fetches {ref}, which is not there")
    return problems, checked


def check_internal(root):
    problems = []
    pages = sorted(html_files(root))
    ids = {}          # file -> ids it defines
    parsed = {}

    for page in pages:
        parsed[page] = parse(page)
        ids[os.path.normpath(page)] = parsed[page].ids

    for page in pages:
        where = os.path.relpath(page, root)
        for tag, attr, ref in parsed[page].refs:
            if not ref or ref.startswith(SKIP_SCHEMES) or "://" in ref:
                continue

            # A bare fragment points into this page.
            if ref.startswith("#"):
                if ref[1:] and ref[1:] not in parsed[page].ids:
                    problems.append(f"{where}: #{ref[1:]} is linked but no element has that id")
                continue

            path, _, fragment = ref.partition("#")
            target = resolve(root, page, path)

            # A directory url is served by its index.html.
            if os.path.isdir(target):
                target = os.path.join(target, "index.html")

            if not os.path.exists(target):
                problems.append(f"{where}: <{tag} {attr}=\"{ref}\"> -> {os.path.relpath(target, root)} does not exist")
                continue

            if fragment and target.endswith(".html"):
                target_ids = ids.get(os.path.normpath(target))
                if target_ids is None:
                    target_ids = parse(target).ids
                    ids[os.path.normpath(target)] = target_ids
                if fragment not in target_ids:
                    problems.append(f"{where}: {ref} -> no element with id \"{fragment}\"")

    return problems, len(pages)


def external_urls(root):
    """Every url that leaves the site: from the pages, and from the data.

    The data matters most. Member and publication links are never written in
    the html -- they are fetched and rendered at runtime -- so a scan of the
    pages alone would check none of the links most likely to rot.
    """
    found = {}

    for page in html_files(root):
        where = os.path.relpath(page, root)
        for _, _, ref in parse(page).refs:
            if ref.startswith("http://") or ref.startswith("https://"):
                found.setdefault(ref, set()).add(where)

    data = os.path.join(root, "data")

    members = os.path.join(data, "group_members.json")
    if os.path.exists(members):
        with open(members, encoding="utf-8") as fh:
            for person in json.load(fh).values():
                who = person.get("name_full") or "(unnamed)"
                for key, value in person.items():
                    if key.startswith("link_") and isinstance(value, str) and value.startswith("http"):
                        found.setdefault(value, set()).add(f"{who} ({key[5:]})")

    pubs = os.path.join(data, "publications.json")
    if os.path.exists(pubs):
        with open(pubs, encoding="utf-8") as fh:
            for pub in json.load(fh).values():
                title = (pub.get("publication_title") or "(untitled)")[:48]
                for key in ("link_publication", "link_arxiv"):
                    value = pub.get(key)
                    if value:
                        found.setdefault(value, set()).add(f"{title} ({key[5:]})")

    return found


def fetch(url):
    """(verdict, detail). verdict is 'ok', 'broken' or 'unverified'."""
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return "ok", response.status
    except urllib.error.HTTPError as e:
        # Plenty of servers refuse HEAD but answer GET.
        if e.code in (403, 405, 501):
            try:
                get = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(get, timeout=TIMEOUT) as response:
                    return "ok", response.status
            except urllib.error.HTTPError as e2:
                if e2.code in (404, 410):
                    return "broken", f"HTTP {e2.code}"
                return "unverified", f"HTTP {e2.code}"
            except Exception as e2:
                return "unverified", type(e2).__name__
        if e.code in (404, 410):
            return "broken", f"HTTP {e.code}"
        return "unverified", f"HTTP {e.code}"
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        if isinstance(reason, socket.gaierror):
            return "broken", "host does not resolve"
        return "unverified", str(reason)[:60]
    except Exception as e:
        return "unverified", type(e).__name__


def check_external(root):
    urls = external_urls(root)
    broken, unverified = [], []

    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for url, (verdict, detail) in zip(urls, pool.map(fetch, urls)):
            if verdict == "broken":
                broken.append(f"{url}  [{detail}]  -- from: {', '.join(sorted(urls[url])[:3])}")
            elif verdict == "unverified":
                unverified.append(f"{url}  [{detail}]")

    return broken, unverified, len(urls)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", nargs="?", default=".", help="site directory (default: .)")
    ap.add_argument("--external", action="store_true", help="also check links that leave the site")
    args = ap.parse_args()
    root = os.path.normpath(args.root)

    problems, page_count = check_internal(root)

    fetched, fetch_count = check_fetched(root)
    problems += fetched
    problems += check_relative_in_js(root)

    print(f"internal: {page_count} pages, {fetch_count} runtime paths checked")
    for p in problems:
        print(f"  BROKEN  {p}")

    failed = bool(problems)

    if args.external:
        broken, unverified, total = check_external(root)
        print(f"\nexternal: {total} links checked "
              f"({len(broken)} broken, {len(unverified)} could not be verified)")
        for b in broken:
            print(f"  BROKEN  {b}")
        if unverified:
            print("\n  Not proof of anything -- a timeout, a rate limit, or a server that")
            print("  refuses automated requests. Worth an eye, not a build failure:")
            for u in unverified:
                print(f"    ?  {u}")
        failed = failed or bool(broken)

    if failed:
        print("\nBroken links found.")
        return 1

    print("\nAll links resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
