# Usage instructions 

and notes on why the repo and code are structured like this.

## Repo structure

The website is really about three repositories, each with one job:

| Repository | Visibility | Holds | Necessary to publish? |
|---|---|---|---|
| **`algebraicsystemsbiology.github.io`** (this one) | public | Pages, styles, scripts, and hand-authored content. | Of course |
| **`asb-website-data`** | private | Machine-generated data. | Necessary |
| **`asb-group-images`** | private | Archive of full-resolution originals and unpublished PDFs. | Unnecessary|

The site is plain static HTML/CSS/JS with no build step. On every push to
`main`, a GitHub Actions workflow checks out this repository plus the private
data repository, assembles them into `_site/`, and deploys that as a Pages
artifact.

**Why the data is not in this repository.** The site displays only *current*
group members. If member photos were committed here, a departed member's photo
would remain in this public repository's git history permanently — long after
the site stopped showing them. Keeping generated data in a private repository,
and assembling at deploy time, means it never becomes a public git object at
all.

That data is public once deployed; the point is that its *history* is not.

**Anyone with write access can deploy.** Pushing to `main` triggers a build
that pulls current data automatically — no local scripts
required. 

Membership and publication changes need sync of the machine-generated data.  

## The tools

Everything lives in `scripts/`. Nothing needs installing beyond Python 3 and,
for the PDFs, a browser.

| Command | What it does | Run it |
|---|---|---|
| `python3 -m http.server 8000` | Serves the site for preview at <http://localhost:8000> | whenever you are working |
| `python3 scripts/check_data.py .` | Photos, locations, emails, duplicate publications, theme vocabulary, menu freshness | before pushing |
| `python3 scripts/check_links.py .` | Internal links, assets, runtime paths, `#fragments` | before pushing |
| `python3 scripts/check_links.py . --external` | The above plus every members' site, ORCID, Scholar, GitHub and publication link | after a data sync |
| `python3 scripts/build_nav.py` | Regenerates the menu's section list | after adding or retitling a section |
| `./scripts/make-pdfs.sh` | Both PDF sets into `pdf/` | to send the site to someone |
| `python3 scripts/build_sitemap.py` | Regenerates `sitemap.xml` from the folders that exist | after adding a page |
| `./scripts/fetch-data.sh` | Pulls published data for a preview | if you have no local data |
| `python3 scripts/publication_duplicates.py data/publications.json` | Just the duplicate check, standalone | rarely; `check_data` includes it |

The deploy runs `check_data.py` and `check_links.py --external` against the
assembled site on every push, so anything they catch locally would have
stopped the build anyway.

**After editing anything, the short loop is:**

```sh
python3 scripts/build_nav.py        # only if you touched a section heading
python3 scripts/check_data.py .
python3 scripts/check_links.py .
```

## Previewing the site locally

The site **cannot** be previewed by opening `index.html` in a browser: several
pages load their content at runtime with `fetch()` from `data/*.json`, and
browsers block those requests over `file://`. You need a real local web server.

Because the generated data is not in this repository, fetch a copy of it first:

```sh
./scripts/fetch-data.sh
python3 -m http.server 8000
```

**This needs no credentials.** It reads the *published* site over plain HTTP —
the same files any visitor's browser downloads — so it works without a GitHub
account, without membership of the organisation, and without access to the
private data repo. The private repo is only involved at deploy time.

The one exception is before the site has ever been deployed, when there is
nothing to fetch from. Org members can copy the data directly in that case:

```sh
git clone git@github.com:algebraicsystemsbiology/asb-website-data.git /tmp/asb-data
cp /tmp/asb-data/data/*.json data/ && cp -a /tmp/asb-data/data/photos/. data/photos/
```

### Symlinking to a local data clone

If you also work on the data — running the sync, or editing it directly —
symlink instead of copying, so a preview always reflects your latest pull with
no re-copy step:

```sh
git clone git@github.com:algebraicsystemsbiology/asb-website-data.git ../asb-website-data

rm -rf data/group_members.json data/publications.json data/photos
ln -s ../../asb-website-data/data/group_members.json data/group_members.json
ln -s ../../asb-website-data/data/publications.json  data/publications.json
ln -s ../../asb-website-data/data/photos             data/photos
```

The paths are relative to `data/`, so they assume the two repositories sit
side by side. `python -m http.server` serves through symlinks, and
`.gitignore` covers both the symlink and the real-directory form, so neither
can be committed by accident.

`git pull` in the data clone is then enough to refresh a preview.

Then open <http://localhost:8000>. Stop the server with `Ctrl-C`; if port 8000
is busy, pass a different number.

Without the fetch step the site still loads, but People, Publications and the
network diagrams will be empty.

`data/travels.json` is hand-authored and lives in this repository, so it is
never fetched or overwritten.

### Alternatives

```sh
npx serve .                    # Node
ruby -run -e httpd . -p 8000   # Ruby
php -S localhost:8000          # PHP
```

### Where the pages live, and how paths are written

Each page is a folder with an `index.html`, so the urls have no extensions:

```
index.html            ->  /
research/index.html   ->  /research/
people/index.html     ->  /people/
publications/…        ->  /publications/
engage/…              ->  /engage/
privacy/…             ->  /privacy/
```

**Every path in the site is written from the root** — `/assets/css/main.css`,
`/data/publications.json`, `/research/` — never relative. That is not a style
preference. A relative path resolves against whichever page loaded it, so
`data/photos/x.jpg` in a script became `/people/data/photos/x.jpg` the moment
People moved into a folder, and every member photograph 404'd while the page
still looked perfectly fine. `scripts/check_links.py` fails on any relative
`data/`, `images/` or `partials/` path found in JavaScript for exactly that
reason.

This works because the site is served from the root of a domain
(`<org>.github.io`). A project site served under a subpath would need the
paths rewritten.

### What a search engine sees

Every page carries a `<title>` and a one-sentence `<meta name="description">`;
the description is what appears under the link in search results, so it is
worth writing rather than leaving to Google to invent from the page.

`robots.txt` allows everything except `/Data Viz/`. Those documents are the
diagrams, only ever embedded in a page — on their own in a search result they
are a chart with no explanation around it. `sitemap.xml` lists the six public
urls and is regenerated by `scripts/build_sitemap.py`, which derives the list
from the folders that hold an `index.html`, so a new page appears without
anyone remembering to add it.

**Tap target sizes and "mobile friendliness" are not ranking factors.** Google
retired the Mobile Usability report and the Mobile-Friendly Test at the end of
2023. What counts from page experience is Core Web Vitals — LCP, CLS, INP.
Lighthouse files tap targets under a heading called "SEO", which is where the
belief comes from. Fix them for the reader.

**The real exposure is that the content is rendered by JavaScript.** Before
scripts run, `people/index.html` holds 94 words and `publications/index.html`
holds four: every member, all 108 publications and the footer arrive by
`fetch`. Google does render JavaScript, but on a second, delayed pass. That is
the deliberate cost of keeping member data out of this repository's history —
worth knowing rather than worth undoing.

### Checking links

```sh
python3 scripts/check_links.py .                 # internal only, instant
python3 scripts/check_links.py . --external      # plus every outside link
```

Internal links, assets, the paths fetched at runtime, and `#fragment` targets
all have to resolve, and a failure is always a mistake in this repository.

External links are the group members' own sites, ORCID and Scholar profiles,
GitHub accounts, and every publication link. They are read from the *data*,
not from the pages — those links are rendered at runtime, so scanning the
html would check none of the ones most likely to rot. Only a definite 404,
410 or a hostname that does not resolve counts as broken; a timeout, a rate
limit or a server that refuses automated requests is reported and passed
over, because none of those is a reason to block a deploy.

CI runs `check_links.py _site --external` on every build.

### Regenerating the menu after editing a page

```sh
python3 scripts/build_nav.py
```

The dot-burst menu lists each page's sections beneath its entry, and does so
from *every* page rather than only the page you are on — you rarely need a link
to a section of the page you are already reading. That means the menu has to
know about sections on pages it is not currently displaying, so the list cannot
come from the current document.

Rather than typing that list out, `build_nav.py` derives it from the pages
themselves: any `<section>` with an `id` and an `<h2>` becomes a sub-item,
labelled with that heading. A heading that reads badly in a menu can be
overridden with `data-nav-label` on the section. Commented-out sections are
ignored, exactly as a browser ignores them. The result is written to
`partials/nav-sections.json`, which is committed, and read at runtime by
`assets/js/site-nav.js`.

**Run it after adding, removing or retitling a section**, and commit the
regenerated file with the page. Forgetting cannot ship: `check_data.py` rebuilds
the list from the pages, compares it with the committed one, and fails the
deploy on any difference, naming the page and both versions of its list.

The menu markup itself is `partials/nav-button.html`, shared by every page —
add a *page* to the menu there, not in `build_nav.py`'s `PAGES` list alone
(which sets the order sections are collected in).

### Sending the site to someone who cannot visit it

```sh
python3 -m http.server 8000     # in one terminal
./scripts/make-pdfs.sh          # in another
```

That writes **both shapes**, one PDF per page in each:

| | |
|---|---|
| `pdf/screen/` | A **single page as tall as the document**, 1440px wide, ordinary screen styles. Nothing is sliced; the reader scrolls. This is the set to send when you want somebody to *see the website*. |
| `pdf/print/` | A4, paginated, through `assets/css/print.css`. Research tiles reflow to photo-above-text, the publications filter goes, type comes down to 11pt. This is the set for somebody who will actually put it on paper. |

`--screen` or `--print` limits it to one. Both together take about twenty
seconds.

To do the same by hand in any browser, on any machine, add `?pdf=screen` to
the address and print to PDF:

```
http://localhost:8000/people/?pdf=screen
```

`assets/js/screen-pdf.js` reads that parameter, takes the print stylesheet out
of the cascade, and sets a single `@page` the size of the document.

**No third-party tool is needed** — the script drives whichever Chromium-family
browser is installed (Chrome, Edge, Brave, Chromium) and finds the Mac
application paths automatically. If you have none of them:

```sh
brew install --cask google-chrome
```

Not `--cask chromium`: Homebrew deprecated it for failing the macOS Gatekeeper
check and disables it on 2026-09-01. Avoid `wkhtmltopdf` too, the usual
suggestion for this job — it is archived, and its old WebKit renders neither
the member grid nor the research tiles correctly.

The `?pdf=screen` route above needs none of this: it works in whatever browser
you already have. **From Firefox's print dialogue, open More settings, tick
"Print backgrounds", and set Scale to 100% rather than "Fit to page width".**
With those two it produces the same page Chrome does — checked against Firefox
153, identical page box and rendering. Without "Print backgrounds" the research
tiles print as flat grey rectangles.

The A4 set is worth a word on its own. It drops the root font size from the
template's 18pt to 11pt — 18pt is a screen size, and on paper it read as
large-print and cost sheets. It lays the front page's hero down flat: a
photograph with the logo beneath it, rather than the near-black rectangle the
scroll-driven version printed as. And it keeps member cards, publications,
photographs and research tiles whole across page breaks.

### Checking how it looks on a phone

There is no script for this one; it is done by driving a browser. What the
last pass found, so the same ground is not re-covered:

- **A caption at `opacity: 0` hides everything inside it.** The research tiles
  used to reveal on tap, with the heading set to `opacity: 1` so it would show
  through — it cannot, and the tiles were bare photographs with no text.
- **`min-height` beats an inline `height`.** Both diagram frames are sized by
  the height they report over `postMessage`, and both also had a CSS floor
  taller than the diagram draws on a phone. The floor won, and the difference
  showed as blank space. The floors are now placeholders, 120px and 200px.
- **`max-width` on an inner column can override the template's `max-width:
  100%`.** Privacy scrolled sideways on a phone until it became
  `min(900px, 100%)`.
- Anything below 12px is too small to set text in, and a tap target under
  about 28px square is hard to hit. The menu was failing both.

Worth re-checking at 320, 375 and 768 after layout changes.

### The research themes live in one file

`data/research-themes.json` is the list of the twelve research themes. It is
hand-maintained and tracked in this repository (unlike the generated data), and
each entry carries four things:

```json
{ "name":   "Topological Data Analysis",
  "slug":   "topological-data-analysis",
  "colour": "#8c959f",
  "short":  "TDA" }
```

`name` must match the keyword exactly as it is spelled in Coda, since that is
what the publication and member records are tagged with. `slug` is written out
rather than derived from the name, so `/publications/?theme=…` links cannot
drift from it. `colour` is the theme's colour everywhere it is drawn, and
`short` is the abbreviated label the arc diagram uses.

Everything reads from that file at runtime:

| Reads it | For |
|---|---|
| `assets/js/publications.js` | the filter list on Publications, and `?theme=` links |
| `assets/js/connects.js` | the chord diagram's segments and colours — but see below |
| `Data Viz/research-keyword-arc-diagram.html` | the front page's arc diagram |
| `Data Viz/who-works-on-what.html` | theme colours on the People diagram |

`connects.js` currently draws nothing: `research/index.html` loads it, and
`connects.css`, but contains no `.connects-block` element for it to render
into, so `init()` returns immediately. Either restore the markup or drop the
two `<script>`/`<link>` lines — the script itself works.

The exception is `research/index.html`, whose tiles are hand-written prose and cannot
be generated. `scripts/check_data.py` compares its tile headings and filter
links against the file, and compares both against the keywords in the member
and publication data, so a theme renamed in Coda fails the deploy rather than
quietly emptying a filter.

**To add or rename a theme:** edit `research-themes.json`, add a tile to
`research/index.html`, and make sure the name matches Coda exactly. Nothing else
needs touching.

### Checking the data is consistent

```sh
python3 scripts/check_data.py .
```

Run against the repository root when previewing; CI runs the same check against
the assembled `_site/` and fails the deploy if anything is wrong. It verifies:

- every referenced member photo exists, **case-sensitively**, and no photo is
  orphaned
- no Past member has a published photo
- every member's `location_tag` is one the site knows how to render
- no email addresses have crept into the published JSON
- no publication is present twice — see below
- every travel photo resolves
- the twelve research themes agree everywhere they are written, against
  `data/research-themes.json`
- `partials/nav-sections.json` still matches the pages

### Publications entered twice

`scripts/publication_duplicates.py` finds a paper that reached the data more
than once. It compares five things independently — bibtex citation key,
normalised title, publication or arXiv link, DOI, and arXiv id — because no
single one of them catches every case: two copies can share a citation key yet
link to different sites, or carry different citation keys because one was
generated from an arXiv posting and the other from the journal version.

It runs as part of `check_data.py`, and standalone:

```sh
python3 scripts/publication_duplicates.py data/publications.json
```

A copy also runs in the sync in `asb-website-data`, so the problem surfaces at
download time, in front of whoever can merge the Coda rows — rather than at
deploy time, in front of whoever next pushes to this repository. **Duplicates
must be fixed at the source**; there is nothing to change in this repository.

### Notes

- All asset paths are **relative**, so a local preview matches what Pages
  serves, including under a project subpath.
- `python -m http.server` sends no-cache headers inconsistently and browsers
  cache aggressively. If a CSS or JS edit does not appear, hard-reload
  (`Ctrl-Shift-R`, or `Cmd-Shift-R` on macOS).
- Pages worth checking after a change: `/`, `/people/`, `/research/`,
  `/publications/`, `/engage/`, `/privacy/`, and the arc diagram embedded on
  the front page.
- Filenames are **case-sensitive** on GitHub Pages (and on Linux) but not on
  macOS. A link that works when previewing on a Mac can still 404 once
  published, so match the on-disk capitalisation exactly. `scripts/check_data.py`
  catches this for data files.

## Deployment

The site redeploys automatically on either of:

- **a push to `main` here** — content, styling, or markup changes
- **a push of data to `asb-website-data`** — new members, publications or
  photos. That repository has a workflow which starts this one, so the live
  site is never stale relative to the data, no matter how the data got there:
  the sync script, a hand-edit, or the web UI.

`.github/workflows/deploy.yml` also accepts a manual `workflow_dispatch` and a
`data-updated` `repository_dispatch`, either of which forces a rebuild without
changing anything:

```sh
gh workflow run "Deploy site to Pages" \
  --repo algebraicsystemsbiology/algebraicsystemsbiology.github.io
```

Access to the private data repository goes through an **organisation-owned
GitHub App**, installed on both repositories, with `Contents: read` (to read
the data during the build) and `Actions: write` (so the data repo can start
this workflow). `Actions: write` permits starting and cancelling runs; it does
not permit modifying code. The workflow mints a fresh installation token on
each run, valid for about an hour.

It requires two repository secrets:

| Secret | Value |
|---|---|
| `DATA_APP_ID` | the App's numeric ID, from its settings page |
| `DATA_APP_PRIVATE_KEY` | the full contents of the `.pem` private key |

An App is used rather than a personal access token or a deploy key because:

- **The credential is short-lived.** A leaked log, cached artifact, or
  compromised runner exposes a token that expires within the hour, rather than
  one valid until somebody notices and revokes it.
- **It is owned by the organisation, not a person**, so deploys keep working
  when people leave the group.

This matters more than it might look: the data repository's *history* is what
the repository split exists to keep private, so read access to it
is not a trivial capability.

To rotate: generate a new private key on the App's settings page, update
`DATA_APP_PRIVATE_KEY` (use the interface on github itself to generate a new
private key, download it, and copy into the secrets part of the website repo), 
then delete the old key.