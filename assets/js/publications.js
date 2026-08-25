let allPublications = [];
let activeTheme = 'All';

// The research themes -- their canonical names and url slugs -- come from
// data/research-themes.json, the one place they are written. They used to be
// hardcoded here as THEME_CONFIG as well as in the research page's tiles and
// the network diagram's colour map, and those copies had drifted. The spelling
// patch that used to sit in normalizeText ("mathematical modelling" ->
// "modeling") existed only to paper over that drift.
let THEMES = [];

// The pseudo-theme the filter list leads with. It carried a label of "All
// Publications" for the subtitle, which is no longer shown when nothing is
// filtered on.
const ALL = { name: 'All', slug: 'all' };

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function loadThemes() {
  const res = await fetch('/data/research-themes.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load research-themes.json: ${res.status}`);
  THEMES = await res.json();
}

function getThemeConfigByLabel(label) {
  if (label === 'All') return ALL;
  return THEMES.find(t => t.name === label) || null;
}

function slugify(text) {
  return (text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60);
}

function getThemeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('theme') || '';
  const label = params.get('label') || '';

  // The slug is the reliable key: it is stored explicitly in
  // research-themes.json rather than derived from the name, so the two cannot
  // drift apart.
  if (slug) {
    const bySlug = THEMES.find(t => t.slug === slug);
    if (bySlug) return bySlug;
  }

  // A label is matched loosely, so an older link whose punctuation differs
  // still lands on the right theme.
  if (label) {
    const wanted = normalizeText(label);
    const byLabel = THEMES.find(t => normalizeText(t.name) === wanted);
    if (byLabel) return byLabel;
  }

  return null;
}

async function loadPublications() {
  const response = await fetch('/data/publications.json');
  if (!response.ok) {
    throw new Error(`Failed to load publications.json: ${response.status}`);
  }

  const publications = await response.json();
  allPublications = Object.values(publications);
}

function parseYear(pub) {
  const text = pub.bibtex || '';
  const match = text.match(/year\s*=\s*\{([^}]+)\}/i);
  if (!match) return 0;

  const raw = match[1].trim();
  const year = parseInt(raw, 10);
  return Number.isFinite(year) ? year : 0;
}

function parseField(pub, fieldName) {
  const text = pub.bibtex || '';
  const regex = new RegExp(`${fieldName}\\s*=\\s*\\{([^}]+)\\}`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function decodeLatexAccents(text) {
  return text
    .replace(/\\i\b/g, 'i')
    .replace(/\\j\b/g, 'j')
    .replace(/\\['`^"~=.uvHc]\{?([A-Za-z])\}?/g, '$1')
    .replace(/\\ss/g, 'ß')
    .replace(/\\ae/g, 'æ')
    .replace(/\\AE/g, 'Æ')
    .replace(/\\oe/g, 'œ')
    .replace(/\\OE/g, 'Œ')
    .replace(/\\aa/g, 'å')
    .replace(/\\AA/g, 'Å')
    .replace(/[{}]/g, '');
}

function formatAuthor(name) {
  const clean = decodeLatexAccents((name || '').trim());
  if (!clean) return '';

  if (clean.includes(',')) {
    const [last, first] = clean.split(',').map(s => s.trim());
    return `${first} ${last}`.replace(/\s+/g, ' ').trim();
  }

  return clean.replace(/\s+/g, ' ').trim();
}

function getAuthorsFromBibtex(pub) {
  const text = pub.bibtex || '';
  const match = text.match(/author\s*=\s*\{([\s\S]*?)\}\s*,/i);
  if (!match) return '';

  const authors = match[1]
    .replace(/\s+/g, ' ')
    .split(/\s+and\s+/i)
    .map(formatAuthor)
    .filter(Boolean);

  return authors.join(', ');
}

function getCitationLine(pub) {
  const journal = parseField(pub, 'journal') || parseField(pub, 'booktitle');
  const volume = parseField(pub, 'volume');
  const issue = parseField(pub, 'number');
  const year = parseYear(pub);

  const parts = [];

  if (journal) parts.push(journal);

  if (volume) {
    parts.push(issue ? `${volume}(${issue})` : volume);
  } else if (issue) {
    parts.push(`(${issue})`);
  }

  if (year) parts.push(String(year));

  return parts.length ? `${parts.join(', ')}.` : '';
}

// Each label says what the reader will land on, and the field it came from is
// what knows that: link_publication points at the published version,
// link_arxiv at a preprint. The host is not consulted -- the 21 links in that
// field today are arXiv, bioRxiv and HAL, one of them via a doi.org DOI that
// resolves to bioRxiv, and a host list would need editing every time someone
// posts to a server we have not seen.
//
// Both are offered when both exist, published version first: the preprint is
// worth keeping alongside it, being the copy a reader without a subscription
// can actually open.
function getLinks(pub) {
  const links = [];
  if (pub.link_publication) links.push({ href: pub.link_publication, label: 'Full article' });
  if (pub.link_arxiv) links.push({ href: pub.link_arxiv, label: 'Preprint' });
  return links;
}

function themeMatchesPublication(pub, theme) {
  if (theme === 'All') return true;
  return Array.isArray(pub.keywords) && pub.keywords.includes(theme);
}

function updateThemeHeader() {
  const titleEl = document.getElementById('theme-title');
  const editorialEl = document.getElementById('theme-editorial');
  const countEl = document.getElementById('publication-count');

  const config = getThemeConfigByLabel(activeTheme);

  if (titleEl) {
    // Nothing under the heading when no theme is chosen. The line only ever
    // said "All", which the heading above it already implies; it is a subtitle
    // for the filtered views, naming the theme you are looking at.
    //
    // Emptied rather than hidden: the line keeps its height either way (see
    // #theme-title in publications.html), so choosing a theme does not shift
    // the filter list and the publications below it.
    titleEl.textContent = activeTheme === 'All' ? '' : config?.label || activeTheme;
  }

  if (editorialEl) {
    const editorial = config?.editorial?.trim() || '';
    if (editorial) {
      editorialEl.textContent = editorial;
      editorialEl.hidden = false;
    } else {
      editorialEl.textContent = '';
      editorialEl.hidden = true;
    }
  }

  if (countEl) {
    const filteredCount = allPublications.filter(pub => themeMatchesPublication(pub, activeTheme)).length;
    countEl.textContent = `${filteredCount} publication${filteredCount === 1 ? '' : 's'}`;
  }
}

function setActiveTheme(theme) {
  activeTheme = theme || 'All';

  document.querySelectorAll('.theme-filter').forEach(button => {
    button.classList.toggle('is-active', (button.dataset.theme || 'All') === activeTheme);
  });

  updateThemeHeader();
  renderPublications();
}

// The filter list is built from THEMES rather than written into
// publications.html. The hand-written copy had drifted from
// research-themes.json in three ways at once, each of them invisible until you
// clicked something:
//
//   - "From Coral to Contagions" had no button at all, so its 26 publications
//     could be reached only by url
//   - the modelling theme was spelled "Modelling" in the page and "Modeling"
//     in the data, so that button matched none of its 66 publications
//   - every accent colour differed from the one in research-themes.json that
//     the network diagram draws the same theme with
//
// None of that can recur: adding a theme to research-themes.json adds the
// button, and there is no second spelling to keep in step.
function renderThemeFilters() {
  const list = document.getElementById('theme-filter-list');
  if (!list) return;

  list.innerHTML = '';
  [ALL, ...THEMES].forEach(theme => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-filter';
    button.dataset.theme = theme.name;
    button.textContent = theme.name;
    // Only the dot is tinted. The active label keeps the site's link colour:
    // several theme colours are pale by design, chosen to read as circles on
    // the network diagram, and would be close to invisible as text.
    if (theme.colour) button.style.setProperty('--theme-dot', theme.colour);
    item.appendChild(button);
    list.appendChild(item);
  });
}

function setupThemeFilters() {
  const buttons = document.querySelectorAll('.theme-filter');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      setActiveTheme(button.dataset.theme || 'All');
    });
  });
}

function renderPublications() {
  const container = document.getElementById('publications-list');
  if (!container) return;

  container.innerHTML = '';

  const filtered = allPublications.filter(pub => themeMatchesPublication(pub, activeTheme));

  const sorted = filtered.sort((a, b) => {
    return parseYear(b) - parseYear(a) ||
      (a.publication_title || '').localeCompare(b.publication_title || '');
  });

  const years = [...new Set(sorted.map(pub => parseYear(pub)).filter(Boolean))];

  if (!sorted.length) {
    container.innerHTML = '<p>No publications found for this theme yet.</p>';
    return;
  }

  years.forEach(year => {
    const yearHeader = document.createElement('section');
    yearHeader.className = 'publication-year-group';
    yearHeader.innerHTML = `<h3>${year}</h3>`;
    container.appendChild(yearHeader);

    sorted
      .filter(pub => parseYear(pub) === year)
      .forEach(pub => {
        const authors = getAuthorsFromBibtex(pub);
        const citationLine = getCitationLine(pub);
        const links = getLinks(pub);

        const card = document.createElement('section');
        card.className = 'publication-entry';
        // A slug of the title, not the source database's row id: those are
        // stripped before the data is published, and a title is a better
        // anchor for a human to land on anyway.
        card.id = `pub-${slugify(pub.publication_title)}`;

        card.innerHTML = `
          <p class="publication-title"><em>${pub.publication_title}</em></p>
          <p class="publication-citation">
            ${authors ? `<span class="publication-authors">${authors}.</span>` : ''}
            ${citationLine ? `<span class="publication-meta">${citationLine}</span>` : ''}
          </p>
          <div class="publication-links">
            ${links.map(link => `
              <a href="${link.href}" target="_blank" rel="noopener noreferrer">${link.label}</a>
            `).join('')}
            ${pub.bibtex ? `
              <details class="publication-bibtex">
                <summary>BibTeX</summary>
                <pre><code>${pub.bibtex}</code></pre>
              </details>
            ` : ''}
          </div>
        `;

        container.appendChild(card);
      });
  });
}

// The cards do not exist when the browser first looks for the anchor, so a
// link to /publications/#pub-... lands at the top of the page and stays there.
// This runs once the list is built, and again if the hash changes while the
// page is open. The card is marked briefly so it is obvious which one was
// meant: an entry in a long list is otherwise hard to pick out even when it is
// scrolled to.
function revealFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  const card = document.getElementById(id);
  if (!card) return;

  card.scrollIntoView({ block: 'center', behavior: 'auto' });
  card.classList.add('is-target');
  setTimeout(() => card.classList.remove('is-target'), 2600);
}

window.addEventListener('hashchange', revealFromHash);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await Promise.all([loadThemes(), loadPublications()]);
    renderThemeFilters();
    setupThemeFilters();

    const themeFromUrl = getThemeFromUrl();
    if (themeFromUrl) {
      activeTheme = themeFromUrl.name || themeFromUrl.label;
    }

    setActiveTheme(activeTheme);
    revealFromHash();
  } catch (error) {
    console.error(error);
    const container = document.getElementById('publications-list');
    if (container) {
      container.innerHTML = '<p>Sorry — the publications could not be loaded.</p>';
    }
  }
});