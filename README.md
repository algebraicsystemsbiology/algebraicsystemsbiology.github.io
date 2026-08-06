The source for the Algebraic Systems Biology website, for Heather Harrington

## Previewing the site locally

The site is plain static HTML/CSS/JS — there is no build step. But it **cannot**
be previewed by opening `index.html` in a browser: several pages load their
content at runtime with `fetch()` from `data/*.json`, and browsers block those
requests over `file://`. You need a real local web server.

Any static server works. From the repository root:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Stop the server with `Ctrl-C`. If port 8000 is busy, pass a different number.

### Alternatives

```sh
npx serve .                    # Node
ruby -run -e httpd . -p 8000   # Ruby
php -S localhost:8000          # PHP
```

### Using the micromamba environment

This repo has a micromamba environment named `asb-website` for its tooling.
To create it and serve without activating it:

```sh
micromamba create -y -n asb-website -c conda-forge python=3.12
micromamba run -n asb-website python -m http.server 8000
```

### Notes

- All asset paths in the site are **relative**, so what you see locally matches
  what GitHub Pages serves, including when the site is published under a
  project subpath such as `/asb-group-website/`.
- `python -m http.server` sends no-cache headers inconsistently and browsers
  cache aggressively. If an edit to a CSS or JS file does not show up,
  hard-reload (`Ctrl-Shift-R`, or `Cmd-Shift-R` on macOS).
- Pages worth checking after a change: `/`, `people.html`, `research.html`,
  `publications.html`, `engage.html`, `network.html`, `privacy.html`, and
  `Data Viz/network.html`.
- Filenames are **case-sensitive** on GitHub Pages (and on Linux) but not on
  macOS. A link that works when previewing on a Mac can still 404 once
  published, so match the on-disk capitalisation exactly.
