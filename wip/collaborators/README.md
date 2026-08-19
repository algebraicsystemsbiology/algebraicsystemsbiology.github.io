# Collaborators bubble diagram

Work in progress. Nothing here is deployed: `wip/` is excluded from the rsync in
`.github/workflows/deploy.yml`, and the build fails if it reaches the artifact.

A bubble diagram of the institutions the group has published with, each sized by
the number of shared publications, with a hover tooltip listing the people.

## Files

| File | Goes to |
|---|---|
| `section.html` | a `<section>` inside `#wrapper` on the page that hosts it |
| `collab-viz.css` | `assets/css/collab-viz.css`, linked after `main.css` |
| `collaborators.js` | `assets/js/collaborators.js`, loaded after d3 |

## To re-enable

1. Copy `collab-viz.css` to `assets/css/` and add to the host page:
   `<link rel="stylesheet" href="/assets/css/collab-viz.css" />`
2. Copy `collaborators.js` to `assets/js/` and add, at the end of the body:
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
   <script src="/assets/js/collaborators.js"></script>
   ```
   d3 is needed only by this diagram. No other script on Engage uses it.
3. Paste `section.html` into the page.
4. Run `python3 scripts/build_nav.py` if the section should appear in the menu.

## What it reads

`collaborators.js` derives everything from `data/publications.json`, which is
generated into `data/` at deploy time from the private `asb-website-data`
repository. For a local preview run `./scripts/fetch-data.sh` first.

## Known gap

`scripts/check_links.py` and `scripts/check_data.py` do not see this directory,
so nothing here is validated by CI while it sits in `wip/`.
