let allPublications = [];
let activeTheme = 'All';

const THEME_CONFIG = {
  All: {
    label: 'All Publications',
    editorial: ''
  },
  'Applied Algebraic Geometry & Tensors': {
    label: 'Applied Algebraic Geometry & Tensors',
    editorial: ''
  },
  'Topological Data Analysis': {
    label: 'Topological Data Analysis',
    editorial: ''
  },
  'Software & Computational Mathematics': {
    label: 'Software & Computational Mathematics',
    editorial: ''
  },
  'Identifiability, Statistics, & AI': {
    label: 'Identifiability, Statistics, & AI',
    editorial: ''
  },
  'Dynamical Systems & Mathematical Modeling': {
    label: 'Dynamical Systems & Mathematical Modeling',
    editorial: ''
  },
  'Biological Networks': {
    label: 'Biological Networks',
    editorial: ''
  },
  'Morphology & Spatial Biology': {
    label: 'Morphology & Spatial Biology',
    editorial: ''
  },
  'Omics': {
    label: 'Omics',
    editorial: ''
  },
  'Oncology': {
    label: 'Oncology',
    editorial: ''
  },
  'Immunology': {
    label: 'Immunology',
    editorial: ''
  },
  'Neuroscience': {
    label: 'Neuroscience',
    editorial: ''
  }
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/mathematical\s+modelling/g, 'mathematical modeling')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugifyTheme(theme) {
  return String(theme || '')
    .trim()
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getThemeConfigByLabel(label) {
  if (label === 'All') return THEME_CONFIG.All;

  return Object.values(THEME_CONFIG).find(config => config.label === label) || null;
}

function getThemeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const themeSlug = params.get('theme') || '';
  const labelParam = params.get('label') || '';

  if (themeSlug) {
    const match = Object.entries(THEME_CONFIG).find(([, config]) => slugifyTheme(config.label) === themeSlug);
    if (match) {
      return match[1];
    }
  }

  if (labelParam) {
    const normalizedLabel = normalizeText(labelParam);
    const match = Object.values(THEME_CONFIG).find(config => normalizeText(config.label) === normalizedLabel);
    if (match) {
      return match;
    }
  }

  return null;
}

async function loadPublications() {
  const response = await fetch('./data/publications.json');
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

function getPrimaryLink(pub) {
  return pub.link_publication || pub.link_arxiv || '';
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
    titleEl.textContent = activeTheme === 'All' ? 'All Publications' : config?.label || activeTheme;
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
        const primaryLink = getPrimaryLink(pub);

        const card = document.createElement('section');
        card.className = 'publication-entry';
        card.id = `pub-${pub.uuid}`;

        card.innerHTML = `
          <p class="publication-title"><em>${pub.publication_title}</em></p>
          <p class="publication-citation">
            ${authors ? `<span class="publication-authors">${authors}.</span>` : ''}
            ${citationLine ? `<span class="publication-meta">${citationLine}</span>` : ''}
          </p>
          <div class="publication-links">
            ${primaryLink ? `
              <a href="${primaryLink}" target="_blank" rel="noopener noreferrer">Full article</a>
            ` : ''}
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

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadPublications();
    setupThemeFilters();

    const themeFromUrl = getThemeFromUrl();
    if (themeFromUrl) {
      activeTheme = themeFromUrl.label;
    }

    setActiveTheme(activeTheme);
  } catch (error) {
    console.error(error);
    const container = document.getElementById('publications-list');
    if (container) {
      container.innerHTML = '<p>Sorry — the publications could not be loaded.</p>';
    }
  }
});