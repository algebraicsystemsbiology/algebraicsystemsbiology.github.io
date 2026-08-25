#!/usr/bin/env python3
"""Verify the assembled site's data is internally consistent.

Run against an assembled site directory (the CI does this against _site/), or
against the repo root when previewing locally:

    python3 scripts/check_data.py _site
    python3 scripts/check_data.py .

Exits non-zero on any problem, so a broken data pull fails the deploy loudly
rather than shipping blank member cards.
"""

import json
import os
import re
import sys
import urllib.parse

MEMBER_EMAIL_DOMAINS = ("maths.ox", "mpi-cbg", "mpipz", "gmail", "ludwig", "balliol", "stcatz")

# Locations the site knows how to label and colour. An unrecognised value is a
# data-quality problem at the source, so fail the deploy rather than publish a
# member card with an unstyled or wrongly-worded tag.
#
# Keep in step with LOCATION_LABELS / LOCATION_CLASSES in
# assets/js/who-we-are.js.
KNOWN_LOCATIONS = {"CBG Maths", "Oxford"}

# Finding a paper entered twice is shared with the sync in asb-website-data,
# which runs the same check at download time. See the header of that file.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from publication_duplicates import duplicate_publications  # noqa: E402


def theme_vocabularies(root):
    """Collect the research-theme names from every place they are written.

    data/research-themes.json is the canonical list. The names also appear in
    the member and publication keywords, which come from the group database,
    and twice on the research page -- as a card name, and as the label in
    the link to the publications filter. Those are written by hand and can
    drift, so they are compared here.

    The network diagram and publications.js are not checked: they read
    research-themes.json at runtime rather than holding their own copies.
    """
    import html as _html
    import urllib.parse as _url

    vocab = {}

    def norm(x):
        return " ".join(_html.unescape(x).split())

    with open(os.path.join(root, "data", "group_members.json"), encoding="utf-8") as fh:
        vocab["member keywords"] = {
            norm(k) for r in json.load(fh).values() for k in (r.get("keywords") or [])
        }

    with open(os.path.join(root, "data", "publications.json"), encoding="utf-8") as fh:
        vocab["publication keywords"] = {
            norm(k) for p in json.load(fh).values() for k in (p.get("keywords") or [])
        }

    research = os.path.join(root, "research", "index.html")
    if os.path.exists(research):
        with open(research, encoding="utf-8") as fh:
            text = fh.read()
        # Each theme is a card whose summary carries the name; the section
        # headings above them are <h2> and are not theme names.
        vocab["research card names"] = {
            norm(re.sub(r"<[^>]+>", "", t))
            for t in re.findall(r'<span class="theme-name">(.*?)</span>', text, re.S)
        }
        vocab["research filter labels"] = {
            norm(_url.unquote(m.group(1)))
            # The page moved from publications.html to /publications/; match
            # either, so this does not have to be edited again if it moves.
            for m in re.finditer(r"publications(?:\.html|/)\?theme=[^&\"]*&(?:amp;)?label=([^\"]+)", text)
        }

    return vocab


def fail(problems):
    for p in problems:
        print(f"  FAIL  {p}")
    print(f"\n{len(problems)} problem(s) found.")
    sys.exit(1)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    data = os.path.join(root, "data")
    problems = []

    required = ["group_members.json", "publications.json", "travels.json"]
    for name in required:
        if not os.path.exists(os.path.join(data, name)):
            problems.append(f"missing {name} -- did the data checkout run?")
    if problems:
        fail(problems)

    with open(os.path.join(data, "group_members.json"), encoding="utf-8") as fh:
        members = json.load(fh)
    with open(os.path.join(data, "publications.json"), encoding="utf-8") as fh:
        pubs = json.load(fh)
    with open(os.path.join(data, "travels.json"), encoding="utf-8") as fh:
        travels = json.load(fh)

    # Every referenced member photo must exist, case-sensitively. macOS is
    # case-insensitive and GitHub Pages is not, so a mismatch authored on a Mac
    # only surfaces once published.
    photo_dir = os.path.join(data, "photos")
    on_disk = set(os.listdir(photo_dir)) if os.path.isdir(photo_dir) else set()
    referenced = set()
    for member in members.values():
        name = (member.get("photo") or {}).get("filename", "")
        if not name:
            continue
        referenced.add(name)
        if name not in on_disk:
            problems.append(f"photo referenced but not present: {name} ({member.get('name_full')})")

    for orphan in sorted(on_disk - referenced):
        problems.append(f"photo present but unreferenced: {orphan}")

    # Only Current/Future members should have photos published.
    for member in members.values():
        if (member.get("photo") or {}).get("filename") and member.get("temporal_tag") == "Past":
            problems.append(f"Past member has a published photo: {member.get('name_full')}")

    # Every member needs a location, and it must be one the site can render.
    for member in members.values():
        name = member.get("name_full") or "(unnamed)"
        raw = member.get("location_tag")
        tags = raw if isinstance(raw, list) else ([raw] if raw else [])
        tags = [t for t in tags if t]
        if not tags:
            problems.append(f"no location_tag: {name}")
            continue
        for tag in tags:
            if tag not in KNOWN_LOCATIONS:
                problems.append(
                    f"unrecognised location_tag {tag!r} for {name} "
                    f"-- known: {sorted(KNOWN_LOCATIONS)}. Fix it at the source, or add it "
                    f"to KNOWN_LOCATIONS here and to LOCATION_LABELS/LOCATION_CLASSES in "
                    f"assets/js/who-we-are.js"
                )


    # Theme names must agree everywhere they are written, against the single
    # list in data/themes.json.
    themes_path = os.path.join(data, "research-themes.json")
    if not os.path.exists(themes_path):
        problems.append("missing data/research-themes.json")
    else:
        with open(themes_path, encoding="utf-8") as fh:
            themes = json.load(fh)
        canonical = {t["name"] for t in themes}
        slugs = [t["slug"] for t in themes]
        if len(set(slugs)) != len(slugs):
            problems.append("research-themes.json has duplicate slugs")
        for t in themes:
            if not t.get("colour", "").startswith("#"):
                problems.append(f"theme {t['name']!r} has no colour in research-themes.json")
            # The arc diagram labels its nodes with the short form; without one
            # a new theme would push the full name into a space sized for
            # "TDA".
            if not (t.get("short") or "").strip():
                problems.append(f"theme {t['name']!r} has no short label in research-themes.json")

        research = os.path.join(root, "research", "index.html")
        if os.path.exists(research):
            with open(research, encoding="utf-8") as fh:
                text = fh.read()
            linked = {urllib.parse.unquote(m.group(1))
                      for m in re.finditer(r"publications(?:\.html|/)\?theme=([^&\"]*)", text)}
            # A card names its theme by slug too, which is what
            # assets/js/theme-cards.js looks up in order to colour it.
            linked |= set(re.findall(r'<details class="theme-card" data-theme="([^"]+)"', text))
            known = {t["slug"] for t in themes}
            for bad in sorted(linked - known):
                problems.append(
                    f"research.html links ?theme={bad!r}, which is not a slug in research-themes.json"
                )

        for source, names in sorted(theme_vocabularies(root).items()):
            for missing in sorted(canonical - names):
                problems.append(f"theme {missing!r} is in research-themes.json but missing from {source}")
            for extra in sorted(names - canonical):
                problems.append(f"theme {extra!r} appears in {source} but is not in research-themes.json")

    # The menu's sub-items are generated from the pages by
    # scripts/build_nav.py. Verify the committed manifest still matches, so a
    # renamed or added section cannot leave the menu quietly out of date.
    nav_manifest = os.path.join(root, "partials", "nav-sections.json")
    if not os.path.exists(nav_manifest):
        problems.append("missing partials/nav-sections.json -- run scripts/build_nav.py")
    else:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
        try:
            import build_nav
        except ImportError:
            build_nav = None
        if build_nav is not None:
            with open(nav_manifest, encoding="utf-8") as fh:
                committed = json.load(fh)
            fresh = build_nav.collect(root)
            if committed != fresh:
                for page in sorted(set(committed) | set(fresh)):
                    was = [i["label"] for i in committed.get(page, [])]
                    now = [i["label"] for i in fresh.get(page, [])]
                    if was != now:
                        problems.append(
                            f"nav-sections.json is stale for {page}: has {was}, pages have {now} "
                            f"-- run scripts/build_nav.py"
                        )

    # Emails must never reach the published site.
    blob = json.dumps(members) + json.dumps(pubs)
    for domain in MEMBER_EMAIL_DOMAINS:
        if f"@{domain}" in blob:
            problems.append(f"email address for @{domain} present in published data")

    # The same paper entered under two row ids is a different fault: nothing
    # is dropped, both are published, and the page lists the paper twice.
    problems.extend(duplicate_publications(pubs))

    # Duplicate Coda row ids silently drop a record on json.load.
    for path, label in ((os.path.join(data, "group_members.json"), "group_members"),
                        (os.path.join(data, "publications.json"), "publications")):
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        parsed = json.loads(text)
        literal = text.count('\n    "')
        if literal and literal != len(parsed):
            problems.append(
                f"{label}.json has {literal} record blocks but parses to {len(parsed)} "
                "-- duplicate row id silently dropping a record"
            )

    # Hand-authored travel photos live in the site repo, not the data repo.
    travel_dir = os.path.join(root, "images", "Travels")
    for trip in travels:
        for photo in trip.get("photos", []):
            name = photo.get("file", "")
            if name and not os.path.exists(os.path.join(travel_dir, name)):
                problems.append(f"travel photo missing: images/Travels/{name} (trip {trip.get('id')})")

    if problems:
        fail(problems)

    locs = sorted({t for m in members.values() for t in (m.get("location_tag") or []) if t})
    print(f"OK  {len(members)} members ({len(referenced)} photos, locations: {", ".join(locs)}), "
          f"{len(pubs)} publications, "
          f"{sum(len(t.get('photos', [])) for t in travels)} travel photos")


if __name__ == "__main__":
    main()
