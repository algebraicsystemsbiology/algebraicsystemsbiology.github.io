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
# It drives whichever Chromium-family browser is installed -- Chrome, Edge,
# Brave, Chromium -- and finds the Mac application paths automatically.
#
# If you have none of them, install Chrome:  brew install --cask google-chrome
# Not the chromium cask: Homebrew deprecated it because it fails the macOS
# Gatekeeper check, and disables it on 2026-09-01.
#
# Nothing else is needed, and no third-party tool. wkhtmltopdf, the usual
# suggestion, is archived and ships an old WebKit that renders this site
# wrongly -- the member grid and the research tiles both rely on CSS it does
# not have.
#
# You do not need this script at all to save one page: open it with
# ?pdf=screen on the end of the address and print to PDF from the browser you
# already have, Safari and Firefox included.

set -euo pipefail

BASE="${BASE:-http://localhost:8000}"
OUT="pdf"
WIDTH=1440
MODE="screen"
LIMIT=60          # seconds any single render may take
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
	"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
	"/Applications/Chromium.app/Contents/MacOS/Chromium" \
	"$(command -v google-chrome || true)" \
	"$(command -v chromium || true)" \
	"$(command -v chromium-browser || true)"
do
	if [ -n "$candidate" ] && [ -x "$candidate" ]; then CHROME="$candidate"; break; fi
done

if [ -z "$CHROME" ]; then
	echo "No Chromium-family browser found (Chrome, Edge, Brave, Chromium)." >&2
	echo >&2
	echo "  macOS:  brew install --cask google-chrome" >&2
	echo "          not --cask chromium: Homebrew deprecated it for failing the" >&2
	echo "          macOS Gatekeeper check, and disables it on 2026-09-01." >&2
	echo "  Linux:  sudo apt install chromium   (or snap install chromium)" >&2
	echo >&2
	echo "Or skip this script: open a page with ?pdf=screen on the end of the" >&2
	echo "address and print to PDF from any browser, Safari and Firefox included." >&2
	exit 1
fi

if ! curl -sf -o /dev/null "$BASE/index.html"; then
	echo "Nothing is serving $BASE." >&2
	echo "Start the preview server first:  python3 -m http.server 8000" >&2
	exit 1
fi

# Run the browser, but never wait on it forever. A page that wedges -- and one
# did, through a loop in screen-pdf.js -- leaves the browser running with
# nothing to print, and the script simply stopped. macOS has no timeout(1)
# unless coreutils is installed, so this is done by hand.
render() {
	"$CHROME" "$@" >/dev/null 2>&1 &
	local pid=$!
	local waited=0
	while kill -0 "$pid" 2>/dev/null; do
		if [ "$waited" -ge "$LIMIT" ]; then
			kill -9 "$pid" 2>/dev/null || true
			echo "    (gave up after ${LIMIT}s)" >&2
			return 1
		fi
		sleep 1
		waited=$(( waited + 1 ))
	done
	wait "$pid" 2>/dev/null || true
	return 0
}

# Reads a PDF's page count and page height in CSS pixels. Kept in a variable
# so the loop below stays readable.
PDFSTAT='
import re, sys
d = open(sys.argv[1], "rb").read()
c = re.findall(b"/Type\\s*/Pages.*?/Count\\s+([0-9]+)", d, re.S)
b = re.findall(b"/MediaBox\\s*\\[([^]]*)]", d)
print(int(c[0]) if c else 1, round(float(b[0].split()[3]) / 0.75) if b else 0)
'

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

	render \
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
		"$url" || true

	rm -rf "$profile"

	# The page height has to be estimated from inside the page, and the print
	# pass lays out a little taller than that estimate -- enough, on the longest
	# pages, to spill a second almost-empty sheet. Rather than guess harder, look
	# at what came out: if it is more than one page, print again with a height
	# that certainly fits. Counting pages afterwards is the one measurement that
	# cannot be wrong.
	retried=""
	if [ "$MODE" = "screen" ] && [ -s "$target" ]; then
		read -r pagecount boxheight < <(python3 -c "$PDFSTAT" "$target")
		# Step up rather than leap. The content is somewhere between the height
		# that failed and that height times the number of pages it spilled to,
		# so try modest increases first: a page half a screen too tall is a
		# band of white the reader scrolls through for no reason.
		for pct in 105 115 140 200; do
			[ "${pagecount:-1}" -gt 1 ] || break
			needed=$(( boxheight * pct / 100 ))
			profile="$(mktemp -d)"
			render \
				--headless --disable-gpu --no-sandbox --hide-scrollbars \
				--user-data-dir="$profile" --disk-cache-dir=/dev/null \
				--virtual-time-budget=15000 --run-all-compositor-stages-before-draw \
				--no-pdf-header-footer --print-to-pdf-no-header \
				"${extra[@]}" --print-to-pdf="$target" \
				"$BASE/$page?pdf=screen&height=$needed" || true
			rm -rf "$profile"
			read -r pagecount _ < <(python3 -c "$PDFSTAT" "$target")
			retried="  (fitted at ${needed}px)"
		done
	fi

	if [ -s "$target" ]; then
		size=$(du -h "$target" | cut -f1)
		printf '  %-22s %s%s\n' "$name.pdf" "$size" "$retried"
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
