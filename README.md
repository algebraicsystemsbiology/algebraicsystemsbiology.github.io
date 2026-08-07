The source for the Algebraic Systems Biology website, for Heather Harrington

## How this site is put together

Three repositories, each with one job:

| Repository | Visibility | Holds |
|---|---|---|
| **`algebraicsystemsbiology.github.io`** (this one) | public | Pages, styles, scripts, and hand-authored content |
| **`asb-website-data`** | private | Machine-generated data from Coda: members, publications, member photos |
| **`asb-group-images`** | private | Cold archive of full-resolution originals and unpublished PDFs |

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
that pulls current data automatically — no Coda access and no local scripts
required. Only membership changes need the sync, which lives in
`asb-website-data`.

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
cp /tmp/asb-data/*.json data/ && cp -a /tmp/asb-data/photos/. data/photos/
```

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

### Using the micromamba environment

This repo has a micromamba environment named `asb-website` for its tooling:

```sh
micromamba create -y -n asb-website -c conda-forge python=3.12
micromamba run -n asb-website python -m http.server 8000
```

### Checking your data is consistent

```sh
python3 scripts/check_data.py .
```

Verifies that every referenced photo exists (case-sensitively), that no photo
is orphaned, that no Past member has a published photo, that no email
addresses have crept into the published JSON, and that every travel photo
resolves. CI runs the same check against the assembled site and fails the
deploy if anything is wrong.

### Notes

- All asset paths are **relative**, so a local preview matches what Pages
  serves, including under a project subpath.
- `python -m http.server` sends no-cache headers inconsistently and browsers
  cache aggressively. If a CSS or JS edit does not appear, hard-reload
  (`Ctrl-Shift-R`, or `Cmd-Shift-R` on macOS).
- Pages worth checking after a change: `/`, `people.html`, `research.html`,
  `publications.html`, `engage.html`, `network.html`, `privacy.html`, and
  `Data Viz/network.html`.
- Filenames are **case-sensitive** on GitHub Pages (and on Linux) but not on
  macOS. A link that works when previewing on a Mac can still 404 once
  published, so match the on-disk capitalisation exactly. `scripts/check_data.py`
  catches this for data files.

## Deployment

`.github/workflows/deploy.yml` runs on pushes to `main`, on manual dispatch,
and on a `data-updated` repository dispatch that `asb-website-data` can send
after a sync.

Access to the private data repository goes through an **organisation-owned
GitHub App** with `Contents: read-only`, installed only on `asb-website-data`.
The workflow mints a fresh installation token on each run, valid for about an
hour.

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
- **It needs no org-wide policy change.** Deploy keys remain disabled
  org-wide (`deploy_keys_enabled_for_repositories: false`), which is the safer
  default and stays that way.

This matters more than it might look: the data repository's *history* is what
the whole three-repository split exists to keep private, so read access to it
is not a trivial capability.

GitHub does not expose secrets to workflows triggered by forked pull requests.

To rotate: generate a new private key on the App's settings page, update
`DATA_APP_PRIVATE_KEY`, then delete the old key.
