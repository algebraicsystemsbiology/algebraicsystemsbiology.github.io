#!/usr/bin/env bash
# make-pdfs.sh — save the site as PDFs, for sending to somebody who cannot
# visit it. Two shapes, because they answer different questions:
#
#   screen  (default)  one tall page per html page, exactly as it looks in a
#                      browser. Nothing is sliced; the reader scrolls. This is
#                      the one to send when you want somebody to *see the
#                      website*.
#   print              A4, paginated, through assets/css/print.css. This is the
#                      one to send when somebody will actually print it.
#
# Usage, with the preview server already running (python3 -m http.server 8000):
#
#     ./scripts/make-pdfs.sh                    # screen shape, into pdf/
#     ./scripts/make-pdfs.sh --print            # A4 pages instead
#     ./scripts/make-pdfs.sh --width 1200       # narrower screen shape
#     ./scripts/make-pdfs.sh --out ~/Desktop/asb
#
# It drives whichever Chrome or Chromium is installed. On a Mac, Chrome is
# found automatically if you have it; otherwise:  brew install --cask chromium
#
# There is no third-party tool involved and nothing to install beyond a
# browser. wkhtmltopdf, the usual suggestion, is archived and ships an old
# WebKit that renders this site wrongly -- the member grid and the research
# tiles both rely on CSS it does not have.

set -euo pipefail

BASE="${BASE:-http://localhost:8000}"
OUT="pdf"
WIDTH=1440
MODE="screen"
PAGES=(index.html research.html people.html publications.html engage.html privacy.html)

while [ $# -gt 0 ]; do
	case "$1" in
		--print)  MODE="print"; shift ;;
		--screen) MODE="screen"; shift ;;
		--width)  WIDTH="$2"; shift 2 ;;
		--out)    OUT="$2"; shift 2 ;;
		--base)   BASE="$2"; shift 2 ;;
		-h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done

# Find a browser. The Mac paths first, since that is where this gets used.
CHROME=""
for candidate in \
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
	"/Applications/Chromium.app/Contents/MacOS/Chromium" \
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
	"$(command -v google-chrome || true)" \
	"$(command -v chromium || true)" \
	"$(command -v chromium-browser || true)"
do
	if [ -n "$candidate" ] && [ -x "$candidate" ]; then CHROME="$candidate"; break; fi
done

if [ -z "$CHROME" ]; then
	echo "No Chrome or Chromium found." >&2
	echo "  macOS:  brew install --cask chromium" >&2
	echo "  Linux:  sudo apt install chromium   (or snap install chromium)" >&2
	exit 1
fi

if ! curl -sf -o /dev/null "$BASE/index.html"; then
	echo "Nothing is serving $BASE." >&2
	echo "Start the preview server first:  python3 -m http.server 8000" >&2
	exit 1
fi

mkdir -p "$OUT"
echo "browser : $CHROME"
echo "shape   : $MODE"
echo "output  : $OUT/"
echo

for page in "${PAGES[@]}"; do
	name="${page%.html}"
	target="$OUT/$name.pdf"
	# A fresh profile each time: a stale disk cache is the classic reason a
	# just-edited stylesheet does not show up in the output.
	profile="$(mktemp -d)"

	if [ "$MODE" = "screen" ]; then
		url="$BASE/$page?pdf=screen"
		# assets/js/screen-pdf.js sets an @page as tall as the document, so
		# --print-to-pdf emits a single page rather than a stack of sheets.
		# The window width is what the layout is built against, so it is also
		# the page width.
		extra=(--window-size="$WIDTH,900")
	else
		url="$BASE/$page"
		extra=(--window-size="$WIDTH,900")
	fi

	"$CHROME" \
		--headless \
		--disable-gpu \
		--no-sandbox \
		--hide-scrollbars \
		--user-data-dir="$profile" \
		--disk-cache-dir=/dev/null \
		--virtual-time-budget=15000 \
		--run-all-compositor-stages-before-draw \
		--no-pdf-header-footer \
		--print-to-pdf-no-header \
		"${extra[@]}" \
		--print-to-pdf="$target" \
		"$url" >/dev/null 2>&1 || true

	rm -rf "$profile"

	if [ -s "$target" ]; then
		size=$(du -h "$target" | cut -f1)
		printf '  %-22s %s\n' "$name.pdf" "$size"
	else
		printf '  %-22s FAILED\n' "$name.pdf"
	fi
done

echo
echo "Done. $OUT/ holds one PDF per page."
if [ "$MODE" = "screen" ]; then
	echo "These are single tall pages -- the reader scrolls, nothing is cut."
	echo "To do the same by hand in any browser: open the page with ?pdf=screen"
	echo "on the end of the address, then Print -> Save as PDF."
fi
