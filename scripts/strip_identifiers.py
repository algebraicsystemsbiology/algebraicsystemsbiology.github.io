#!/usr/bin/env python3
"""Remove the source database's row ids from the data about to be published.

group_members.json and publications.json come from Coda, which keys every row
by an opaque id and repeats it in a uuid field. Those ids identify rows in a
private database and have no business being served: they are useful for
building the site, not for reading it.

They cannot simply be blanked, because the id is also the key of the top-level
object. Each file therefore becomes a list of its records. Every consumer reads
these with Object.values(), which gives the same result for a list as for an
object, so nothing on the site needs to know the difference.

Run this on the assembled artifact, after the checks: scripts/check_data.py
relies on the keys to notice a duplicate row id, which is a real fault worth
catching, and that check has to see them.

    python3 scripts/strip_identifiers.py _site/data
"""

import json
import os
import sys

FILES = ("group_members.json", "publications.json")

def strip_record(node):
    """Drop every uuid anywhere beneath this record.

    A row id turns up in more than one shape: on the record itself, on each
    entry of a publication's group_member_authors, and on each entry of a
    member's publications list. Walking the whole structure means a new nested
    reference cannot quietly start being published.
    """
    if isinstance(node, dict):
        node.pop("uuid", None)
        for value in node.values():
            strip_record(value)
    elif isinstance(node, list):
        for entry in node:
            strip_record(entry)
    return node


def main(data_dir):
    if not os.path.isdir(data_dir):
        print(f"strip_identifiers: {data_dir} is not a directory", file=sys.stderr)
        return 1

    for name in FILES:
        path = os.path.join(data_dir, name)
        if not os.path.exists(path):
            print(f"strip_identifiers: {path} not found", file=sys.stderr)
            return 1

        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)

        records = list(data.values()) if isinstance(data, dict) else list(data)
        for record in records:
            if isinstance(record, dict):
                strip_record(record)

        with open(path, "w", encoding="utf-8") as fh:
            json.dump(records, fh, ensure_ascii=False, separators=(",", ":"))

        print(f"strip_identifiers: {name} -> {len(records)} records, ids removed")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "_site/data"))
