// who-we-are.js
// Renders current members (with institution tags) and alumni on who-we-are.html.

(function () {

  // Same shape of slug the rest of the site uses: lowercased, runs of anything
  // that is not a letter or digit collapsed to a single dash.
  function slugify(name) {
    return (name || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }


  // Locations come from each member's location_tag, set explicitly in the
  // group database. They used to be inferred from the email domain, which
  // stopped working once emails were removed from the published data — and
  // was never reliable, since it only recognised two domains and silently
  // showed nothing for anyone else.

  // Public-facing wording, and the pill colour class, for each known location.
  //
  // An unrecognised location is a data-quality problem and is caught by
  // scripts/check_data.py, which fails the deploy. Keep these tables in step
  // with KNOWN_LOCATIONS there. Rendering still degrades gracefully rather
  // than throwing, so a bad tag never blanks the page in a browser.
  const LOCATION_LABELS = {
    'CBG Maths': 'MPI Dresden',
    'Oxford': 'Oxford',
  };

  const LOCATION_CLASSES = {
    'CBG Maths': 'mpi',
    'Oxford': 'oxford',
  };

  // ─────────────────────────────────────────────────────────────────
  //  To change the order people appear in, reorder this list. Nothing
  //  else needs editing. To change who is shown without a photograph,
  //  edit ROLES_WITHOUT_PHOTO just below.
  // ─────────────────────────────────────────────────────────────────
  //
  // Current members are grouped by role in this order, then alphabetically by
  // surname within each group. Keyed on the role rather than on a name, so the
  // Director sorts first without being special-cased as a person. A role not
  // listed here sorts after all the listed ones, so nobody disappears if the
  // group database gains a role this file has not seen.
  const ROLE_ORDER = [
    'Director',
    'PhD Student',
    'Postdoc',
    'Research Fellow',
    'Staff Scientist',
    'Research Manager',
    'Intern',
  ];

  // Interns are listed without a photograph.
  const ROLES_WITHOUT_PHOTO = ['Intern'];

  function roleRank(member) {
    const roles = member.internal_roles || [];
    let best = ROLE_ORDER.length;
    for (const r of roles) {
      const i = ROLE_ORDER.indexOf(r);
      if (i !== -1 && i < best) best = i;
    }
    return best;
  }

  function locationSlug(tag) {
    return LOCATION_CLASSES[tag]
      || String(tag).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function locationTags(member) {
    const tags = Array.isArray(member.location_tag)
      ? member.location_tag
      : (member.location_tag ? [member.location_tag] : []);
    return tags
      .filter(Boolean)
      .map(tag => {
        if (!(tag in LOCATION_LABELS)) {
          console.warn(
            `who-we-are.js: unrecognised location_tag ${JSON.stringify(tag)} ` +
            `for ${member.name_full}. Add it to LOCATION_LABELS/LOCATION_CLASSES here ` +
            `and to KNOWN_LOCATIONS in scripts/check_data.py.`
          );
        }
        const label = LOCATION_LABELS[tag] || tag;
        return `<span class="member-institution ${locationSlug(tag)}">${escapeHtml(label)}</span>`;
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function safeUrl(url) {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://${url}`;
  }

  function truncateWords(text, maxWords = 50) {
    if (!text) return '';
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(0, maxWords).join(' ') + '…';
  }

  function iconLink(href, label, iconClass, isBrand = false) {
    const kindClass = isBrand ? 'brands' : 'solid';
    return `<a class="member-link" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${label}" title="${label}">
      <span class="icon ${kindClass} ${iconClass}" aria-hidden="true"></span>
    </a>`;
  }

  function primaryRole(roles) {
    if (!roles || !roles.length) return '';
    const priority = ['Director', 'Staff Scientist', 'Research Fellow', 'Postdoc', 'PhD Student', 'Long Term Visitor', 'Intern'];
    for (const p of priority) {
      if (roles.includes(p)) return p;
    }
    return roles.filter(r => r !== 'Alumnus')[0] || '';
  }

  // ── Render current members ────────────────────────────────────────

  function renderCurrentMembers(members) {
    const container = document.getElementById('members-grid');
    if (!container) return;
    container.innerHTML = '';

    const surname = m => (m.name_last || (m.name_full || '').split(' ').pop() || '');
    const current = Object.values(members)
      .filter(m => m.temporal_tag === 'Current' && m.name_full)
      .sort((a, b) => roleRank(a) - roleRank(b) || surname(a).localeCompare(surname(b)));

    const buildCard = m => {
      const card = document.createElement('section');
      card.className = 'member-card';
      // Lets a search result, or any link, land on one person.
      card.id = 'member-' + slugify(m.name_full);

      const roles = m.internal_roles || [];
      const showPhoto = !roles.some(r => ROLES_WITHOUT_PHOTO.includes(r));
      const photoFilename = m?.photo?.filename || '';
      const photoSrc = photoFilename
        ? `/data/photos/${encodeURI(photoFilename)}`
        : '/images/pic01.jpg';

      const titleText = m.title ? `${m.title} ` : '';
      const roleText = Array.isArray(m.internal_roles)
        ? m.internal_roles.filter(r => r !== 'Alumnus').join(', ')
        : '';
      const bioText = truncateWords(m.bio_short || '', 50);

      const instTag = locationTags(m);

      const links = [];
      if (m.link_github)         links.push(iconLink(m.link_github, 'GitHub', 'fa-github', true));
      if (m.link_website)        links.push(iconLink(safeUrl(m.link_website), 'Website', 'fa-globe'));
      if (m.link_orcid)          links.push(iconLink(m.link_orcid, 'ORCID', 'fa-id-badge'));
      if (m.link_google_scholar) links.push(iconLink(m.link_google_scholar, 'Google Scholar', 'fa-graduation-cap'));

      card.innerHTML = `
        ${showPhoto
          ? `<img class="member-photo" src="${photoSrc}" alt="${m.name_full}"
             onerror="this.onerror=null;this.src='/images/pic01.jpg';">`
          : '<div class="member-photo member-photo-blank" aria-hidden="true"></div>'}
        <h3>${titleText}${m.name_full}</h3>
        ${roleText ? `<p class="member-role">${roleText}</p>` : ''}
        ${instTag}
        <div class="member-links">${links.join('')}</div>
        ${bioText ? `<p class="member-bio">${bioText}</p>` : ''}
      `;

      return card;
    };

    current.forEach(m => container.appendChild(buildCard(m)));

    layoutGrid(container);
    window.addEventListener('resize', () => layoutGrid(container), { passive: true });
  }

  // Both passes measure the rendered layout, and the first changes the heights
  // the second would read, so the order matters: collapse first, then pad.
  function layoutGrid(container) {
    collapseBlankRows(container);
    padFinalRow(container);
  }

  // A card without a photograph holds the space one would take so that names
  // line up across a row. A row where nobody has a photograph has nothing to
  // line up with, and the reserved boxes read as a band of empty space above
  // the names, so the reservation is dropped for those rows.
  //
  // Rows are read from the rendered layout by offsetTop, as padFinalRow reads
  // them: the number of cards per row changes with the viewport. Measured with
  // the marks cleared, so what is measured is always the same layout.
  function collapseBlankRows(container) {
    const cards = Array.prototype.slice.call(container.children)
      .filter(c => !c.classList.contains('is-filler'));

    cards.forEach(c => c.classList.remove('no-photo-row'));

    const rows = new Map();
    cards.forEach(c => {
      const top = c.offsetTop;
      if (!rows.has(top)) rows.set(top, []);
      rows.get(top).push(c);
    });

    rows.forEach(row => {
      const allBlank = row.every(c => c.querySelector('.member-photo-blank'));
      if (allBlank) row.forEach(c => c.classList.add('no-photo-row'));
    });
  }

  // The grid draws its horizontal rules as a border-top on each card, so a
  // final row that is not full leaves a rule spanning only part of the width.
  // Filling the row with empty cards restores it.
  //
  // The number of cards per row changes with the viewport (the template sets
  // 3, then 2, then 1), so it is measured from the rendered layout rather than
  // assumed, and remeasured on resize.
  function padFinalRow(container) {
    Array.prototype.slice.call(container.querySelectorAll('.is-filler'))
      .forEach(node => node.remove());

    const cards = Array.prototype.slice.call(container.children);
    if (cards.length < 2) return;

    const firstTop = cards[0].offsetTop;
    const lastTop = cards[cards.length - 1].offsetTop;
    if (lastTop === firstTop) return;            // single row: nothing to pad

    const perRow = cards.filter(c => c.offsetTop === firstTop).length;
    const inLastRow = cards.filter(c => c.offsetTop === lastTop).length;
    const missing = (perRow - inLastRow) % perRow;
    if (!missing) return;

    // A single trailing card is centred; anything else stays left-aligned, so
    // two of three sit in the first two columns.
    const before = (inLastRow === 1 && perRow >= 3) ? Math.floor((perRow - 1) / 2) : 0;
    const firstOfLastRow = cards[cards.length - inLastRow];

    const makeFiller = () => {
      const filler = document.createElement('section');
      filler.className = 'member-card is-filler';
      filler.setAttribute('aria-hidden', 'true');
      return filler;
    };

    for (let i = 0; i < before; i++) {
      container.insertBefore(makeFiller(), firstOfLastRow);
    }
    for (let i = 0; i < missing - before; i++) {
      container.appendChild(makeFiller());
    }
  }

  // ── Render alumni ─────────────────────────────────────────────────

  function renderAlumni(members) {
    const grid = document.getElementById('alumni-grid');
    if (!grid) return;

    const alumni = Object.values(members)
      .filter(m => m.temporal_tag === 'Past' && m.name_full)
      .sort((a, b) => {
        const dateA = (a.dates_active || '').split('-').pop().trim();
        const dateB = (b.dates_active || '').split('-').pop().trim();
        return (dateB || '0').localeCompare(dateA || '0');
      });

    grid.innerHTML = '';

    alumni.forEach(m => {
      const card = document.createElement('div');
      card.className = 'alumni-card';

      // No photograph. Photo consent is collected for current members only, so
      // every alumni card fell back to the same placeholder image -- thirty
      // identical silhouettes that carried no information.
      const titleText = m.title ? `${m.title} ` : '';
      const role = primaryRole(m.internal_roles);
      const dates = m.dates_active || '';

      // Same globe icon the member cards use. Alumni without a website get
      // nothing at all, rather than greyed-out text promising a link that
      // does not exist.
      const nowHtml = m.link_website
        ? `<div class="member-links">${iconLink(safeUrl(m.link_website), 'Where they are now', 'fa-globe')}</div>`
        : '';

      card.innerHTML = `
        <h3>${titleText}${m.name_full}</h3>
        ${role  ? `<p class="alumni-role">${role}</p>`   : ''}
        ${dates ? `<p class="alumni-dates">${dates}</p>` : ''}
        ${nowHtml}
      `;

      grid.appendChild(card);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────

  async function init() {
    try {
      const res = await fetch('/data/group_members.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const members = await res.json();

      renderCurrentMembers(members);
      renderAlumni(members);
    } catch (err) {
      console.error(err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
