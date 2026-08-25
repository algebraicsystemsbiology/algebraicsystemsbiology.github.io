#!/usr/bin/env python3
"""Bake the JavaScript-rendered pages into the published HTML.

Publications, People and Research draw their content in the browser from the
JSON under data/. That keeps each piece of text in exactly one place, which is
what we want for editing -- but it means the HTML that leaves the server carries
containers and no words, and a crawler that does not run JavaScript sees an
empty page.

This loads each page in headless Chromium, lets its own scripts run, and writes
the resulting DOM back over the file. So the artifact carries the full text and
the repository still holds each sentence once.

    python3 scripts/prerender.py _site

The renderer is the site's own JavaScript, not a second copy of the templates in
Python: there is nothing here to drift from what a visitor sees. Re-running the
scripts in the browser is harmless because each one clears its container before
filling it, so the baked markup is replaced rather than doubled.

Run it after scripts/strip_identifiers.py, so that the source-database ids are
already off the data the scripts read and cannot be baked into the HTML.

Every page asserts what it must contain afterwards. A page whose scripts failed
would otherwise be written back empty, which is worse than not baking it at all:
it would replace a container the browser could still fill with nothing at all.
"""

import http.server
import os
import re
import shutil
import subprocess
import sys
import threading

# path under the site root -> what the rendered page must contain, as
# (regex, how many at least, what it is) so a failure says what was missing.
PAGES = {
    "index.html": [
        (r'id="navLinks"', 1, "the menu"),
        (r'class="arc-frame"|arc-diagram', 1, "the arc diagram frame"),
    ],
    "research/index.html": [
        (r'class="theme-card"', 12, "theme cards"),
        (r'class="theme-body"', 12, "theme descriptions"),
    ],
    "publications/index.html": [
        (r'id="pub-', 100, "publication entries"),
        (r'data-theme="', 12, "theme filter buttons"),
    ],
    "people/index.html": [
        # A floor rather than a headcount: people join and leave, and the point
        # is to catch a page that rendered nothing, not to police the roster.
        (r'id="member-', 20, "member cards"),
    ],
}

# The vendor's scroll animation marks a section is-inactive until it scrolls
# into view, and its CSS hides what is inside. Baked in, that would ship the
# text invisible; the class is re-applied by main.js in the browser anyway.
INACTIVE = re.compile(r'(\sclass="[^"]*?)\s*\bis-inactive\b')

CHROMIUM = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]


def browser():
    for name in CHROMIUM:
        found = shutil.which(name)
        if found:
            return found
    print("prerender: no chromium found on PATH (tried " + ", ".join(CHROMIUM) + ")",
          file=sys.stderr)
    return None


def serve(root):
    """A local server for the site, so the pages' absolute /data/... URLs resolve."""

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=root, **kw)

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def render(chrome, url):
    out = subprocess.run(
        [chrome, "--headless", "--disable-gpu", "--no-sandbox",
         "--virtual-time-budget=20000", "--dump-dom", url],
        capture_output=True, text=True, timeout=180)
    if out.returncode != 0:
        raise RuntimeError(f"chromium exited {out.returncode}: {out.stderr.strip()[:300]}")
    return out.stdout


def main(argv):
    root = os.path.abspath(argv[1] if len(argv) > 1 else "_site")
    if not os.path.isdir(root):
        print(f"prerender: {root} is not a directory", file=sys.stderr)
        return 1

    chrome = browser()
    if not chrome:
        return 1
    # Recorded because this is the one step that cannot be tried outside CI:
    # which browser the runner offered is the first thing worth knowing when it
    # behaves differently there.
    print(f"prerender: rendering with {chrome}")

    httpd = serve(root)
    port = httpd.server_address[1]
    problems = []

    try:
        for page, wants in PAGES.items():
            path = os.path.join(root, page)
            if not os.path.exists(path):
                problems.append(f"{page}: not in the site")
                continue

            before = os.path.getsize(path)
            try:
                dom = render(chrome, f"http://127.0.0.1:{port}/{page}")
            except Exception as err:
                problems.append(f"{page}: {err}")
                continue

            short = []
            for pattern, least, what in wants:
                found = len(re.findall(pattern, dom))
                if found < least:
                    short.append(f"{found} {what}, expected {least}")
            if short:
                problems.append(f"{page}: rendered with " + "; ".join(short))
                continue

            dom = INACTIVE.sub(r"\1", dom)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(dom)
            print(f"prerender: {page} {before:,} -> {len(dom.encode()):,} bytes")
    finally:
        httpd.shutdown()

    for problem in problems:
        print(f"prerender: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
