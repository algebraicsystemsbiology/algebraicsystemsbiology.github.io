// who-we-are.js
// Renders current members (with institution tags) and alumni on who-we-are.html.

(function () {

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

  // Whoever holds this internal role is shown above the members grid, on a row
  // of their own. Keyed on the role rather than a name so it follows the post
  // rather than the person.
  const LEAD_ROLE = 'Director';

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

    const lead = document.getElementById('lead-member');
    if (lead) lead.innerHTML = '';

    const surname = m => (m.name_last || (m.name_full || '').split(' ').pop() || '');
    const all = Object.values(members)
      .filter(m => m.temporal_tag === 'Current' && m.name_full)
      .sort((a, b) => surname(a).localeCompare(surname(b)));

    // Whoever holds LEAD_ROLE is shown above the grid, on a row of their own.
    // Keyed on the role rather than a name, so it survives the post changing
    // hands. If nobody holds it, everyone simply appears in the grid.
    const isLead = m => (m.internal_roles || []).includes(LEAD_ROLE);
    const leads = all.filter(isLead);
    const current = all.filter(m => !isLead(m));

    const buildCard = m => {
      const card = document.createElement('section');
      card.className = 'member-card';

      const photoFilename = m?.photo?.filename || '';
      const photoSrc = photoFilename
        ? `data/photos/${encodeURI(photoFilename)}`
        : 'images/pic01.jpg';

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
        <img class="member-photo" src="${photoSrc}" alt="${m.name_full}"
             onerror="this.onerror=null;this.src='images/pic01.jpg';">
        <h3>${titleText}${m.name_full}</h3>
        ${roleText ? `<p class="member-role">${roleText}</p>` : ''}
        ${instTag}
        <div class="member-links">${links.join('')}</div>
        ${bioText ? `<p class="member-bio">${bioText}</p>` : ''}
      `;

      return card;
    };

    if (lead) leads.forEach(m => lead.appendChild(buildCard(m)));
    current.forEach(m => container.appendChild(buildCard(m)));
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

  // ── Collapsible sections — same mechanism as we-connect ───────────
  // Uses is-hidden on content div + aria-expanded on heading
  // CSS handles caret rotation via [aria-expanded] attribute selector

  function wireToggle(headingId, contentId) {
    const h = document.getElementById(headingId);
    const c = document.getElementById(contentId);
    if (!h || !c) return;
    h.addEventListener('click', () => {
      const hidden = c.classList.toggle('is-hidden');
      h.setAttribute('aria-expanded', String(!hidden));
    });
  }

  // ── Init ──────────────────────────────────────────────────────────

  async function init() {
    try {
      const res = await fetch('./data/group_members.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const members = await res.json();

      renderCurrentMembers(members);
      renderAlumni(members);
      wireToggle('members-heading', 'members-content');
      wireToggle('alumni-heading', 'alumni-content');
    } catch (err) {
      console.error(err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
