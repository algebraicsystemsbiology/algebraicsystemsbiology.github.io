#!/usr/bin/env bash
# Download the generated data (members, publications, member photos) from the
# live site into ./data, so the site can be previewed locally.
#
# These files are not in this repository: they are built from the private
# asb-website-data repo at deploy time, which keeps member photos out of this
# repository's public history.
#
# NO CREDENTIALS ARE NEEDED. This reads the *published* website over plain
# HTTP -- the same files any visitor's browser downloads to render People and
# Publications. You do not need a GitHub account, membership of the
# algebraicsystemsbiology organisation, or access to the private data repo.
# The only requirement is that the site is deployed and reachable.
#
#   ./scripts/fetch-data.sh                      # from the live site
#   ./scripts/fetch-data.sh https://example.org  # from somewhere else
#
# Note: data/travels.json is hand-authored and lives in this repo, so it is
# never fetched or overwritten.

set -euo pipefail

BASE="${1:-https://algebraicsystemsbiology.github.io}"
BASE="${BASE%/}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/data"

command -v curl >/dev/null || { echo "error: curl is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "error: python3 is required" >&2; exit 1; }

mkdir -p "$DATA/photos"

fetch () { # url dest
  # curl already prints 000 on a connection failure, so do not append another.
  local code
  code=$(curl -sS -w '%{http_code}' -o "$2.part" "$1") || true
  if [ "$code" != "200" ]; then
    rm -f "$2.part"
    echo "  HTTP $code  $1" >&2
    return 1
  fi
  mv "$2.part" "$2"
}

echo "Fetching generated data from $BASE"

for f in group_members.json publications.json; do
  if fetch "$BASE/data/$f" "$DATA/$f"; then
    echo "  ok  data/$f"
  else
    echo >&2
    echo "Could not fetch $BASE/data/$f" >&2
    echo >&2
    echo "This needs no credentials -- it reads the published site over plain HTTP." >&2
    echo "A failure here usually means one of:" >&2
    echo "  * the site is not deployed yet" >&2
    echo "  * you are offline, or behind a proxy blocking the request" >&2
    echo "  * the site lives at a different URL -- pass it as an argument:" >&2
    echo "        ./scripts/fetch-data.sh https://example.org" >&2
    echo >&2
    echo "If the site genuinely is not deployed yet, org members can copy the" >&2
    echo "data from the private repo instead:" >&2
    echo "  git clone git@github.com:algebraicsystemsbiology/asb-website-data.git /tmp/asb-data" >&2
    echo "  cp /tmp/asb-data/*.json data/ && cp -a /tmp/asb-data/photos/. data/photos/" >&2
    exit 1
  fi
done

# Photo filenames come from the JSON, so this stays correct as membership changes.
mapfile -t PHOTOS < <(python3 -c '
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
for r in d.values():
    n = (r.get("photo") or {}).get("filename", "")
    if n:
        print(n)
' "$DATA/group_members.json")

echo "  fetching ${#PHOTOS[@]} member photos"
missing=0
for p in "${PHOTOS[@]}"; do
  enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$p")
  fetch "$BASE/data/photos/$enc" "$DATA/photos/$p" || missing=$((missing + 1))
done

# Drop photos of members who are no longer current, so local previews match
# what the site actually publishes.
python3 - "$DATA" <<'PY'
import json, os, sys
data = sys.argv[1]
keep = {
    (r.get("photo") or {}).get("filename", "")
    for r in json.load(open(os.path.join(data, "group_members.json"), encoding="utf-8")).values()
}
removed = 0
for f in os.listdir(os.path.join(data, "photos")):
    if f not in keep:
        os.remove(os.path.join(data, "photos", f))
        removed += 1
if removed:
    print(f"  removed {removed} stale local photo(s)")
PY

if [ "$missing" -gt 0 ]; then
  echo "  warning: $missing photo(s) could not be fetched" >&2
fi

echo
echo "Done. Preview with:  python3 -m http.server 8000"
