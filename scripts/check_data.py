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
import sys
import urllib.parse

MEMBER_EMAIL_DOMAINS = ("maths.ox", "mpi-cbg", "mpipz", "gmail", "ludwig", "balliol", "stcatz")


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

    # Emails must never reach the published site.
    blob = json.dumps(members) + json.dumps(pubs)
    for domain in MEMBER_EMAIL_DOMAINS:
        if f"@{domain}" in blob:
            problems.append(f"email address for @{domain} present in published data")

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

    print(f"OK  {len(members)} members ({len(referenced)} photos), "
          f"{len(pubs)} publications, "
          f"{sum(len(t.get('photos', [])) for t in travels)} travel photos")


if __name__ == "__main__":
    main()
