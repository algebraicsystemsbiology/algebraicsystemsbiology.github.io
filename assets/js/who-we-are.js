// who-we-are.js
// Renders both current members (with institution tags) and alumni on who-we-are.html.

(function () {

  function institutionFromEmail(email) {
    if (!email) return null;
    const domain = (email.split('@')[1] || '').toLowerCase();
    if (domain.includes('mpi-cbg.de')) return 'mpi';
    if (domain.includes('ox.ac.uk'))   return 'oxford';
    return null;
  }

  function institutionLabel(code) {
    if (code === 'mpi')    return 'MPI Dresden';
    if (code === 'oxford') return 'Oxford';
    return '';
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

    const current = Object.values(members)
      .filter(m => m.temporal_tag === 'Current' && m.name_full)
      .sort((a, b) => (a.name_full || '').localeCompare(b.name_full || ''));

    current.forEach(m => {
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

      const inst = institutionFromEmail(m.email);
      const instTag = inst
        ? `<span class="member-institution ${inst}">${institutionLabel(inst)}</span>`
        : '';

      const links = [];
      if (m.link_github)         links.push(iconLink(m.link_github, 'GitHub', 'fa-github', true));
      if (m.link_website)        links.push(iconLink(safeUrl(m.link_website), 'Website', 'fa-globe'));
      if (m.link_orcid)          links.push(iconLink(m.link_orcid, 'ORCID', 'fa-id-badge'));
      if (m.link_google_scholar) links.push(iconLink(m.link_google_scholar, 'Google Scholar', 'fa-graduation-cap'));
      if (m.email)               links.push(iconLink(`mailto:${m.email}`, 'Email', 'fa-envelope'));

      card.innerHTML = `
        <img class="member-photo" src="${photoSrc}" alt="${m.name_full}"
             onerror="this.onerror=null;this.src='images/pic01.jpg';">
        <h3>${titleText}${m.name_full}</h3>
        ${roleText ? `<p class="member-role">${roleText}</p>` : ''}
        ${instTag}
        <div class="member-links">${links.join('')}</div>
        ${bioText ? `<p class="member-bio">${bioText}</p>` : ''}
      `;

      container.appendChild(card);
    });
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

      const photoFilename = m?.photo?.filename || '';
      const photoSrc = photoFilename
        ? `data/photos/${encodeURI(photoFilename)}`
        : 'images/pic01.jpg';

      const titleText = m.title ? `${m.title} ` : '';
      const role = primaryRole(m.internal_roles);
      const dates = m.dates_active || '';

      const nowHtml = m.link_website
        ? `<p class="alumni-now"><a href="${safeUrl(m.link_website)}" target="_blank" rel="noopener">Where they are now →</a></p>`
        : `<p class="alumni-now placeholder">Where they are now</p>`;

      card.innerHTML = `
        <img src="${photoSrc}" alt="${m.name_full}"
             onerror="this.onerror=null;this.src='images/pic01.jpg';">
        <h3>${titleText}${m.name_full}</h3>
        ${role  ? `<p class="alumni-role">${role}</p>`   : ''}
        ${dates ? `<p class="alumni-dates">${dates}</p>` : ''}
        ${nowHtml}
      `;

      grid.appendChild(card);
    });
  }

  // ── Collapsible: Current Members ──────────────────────────────────
  // Uses is-collapsed on #members section (matching main.css rule)

  function wireCurrentMembersToggle() {
    const section = document.getElementById('members');
    const heading = document.getElementById('members-heading');
    if (!section || !heading) return;

    function toggle() {
      const collapsed = section.classList.toggle('is-collapsed');
      heading.setAttribute('aria-expanded', String(!collapsed));
    }

    heading.addEventListener('click', toggle);
    heading.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }

  // ── Collapsible: Alumni ───────────────────────────────────────────
  // Uses is-hidden on #alumni-content div

  function wireAlumniToggle() {
    const heading = document.getElementById('alumni-heading');
    const content = document.getElementById('alumni-content');
    if (!heading || !content) return;

    function toggle() {
      const isHidden = content.classList.toggle('is-hidden');
      heading.setAttribute('aria-expanded', String(!isHidden));
      const caret = heading.querySelector('.members-caret');
      if (caret) caret.style.transform = isHidden ? '' : 'rotate(180deg)';
    }

    heading.addEventListener('click', toggle);
    heading.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
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
      wireCurrentMembersToggle();
      wireAlumniToggle();
    } catch (err) {
      console.error(err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
