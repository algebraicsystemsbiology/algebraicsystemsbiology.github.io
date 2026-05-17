async function loadMembers() {
  try {
    const response = await fetch('./data/group_members.json');
    if (!response.ok) {
      throw new Error(`Failed to load group_members.json: ${response.status}`);
    }
    const members = await response.json();
    renderMembers(members);
  } catch (error) {
    console.error(error);
  }
}

function truncateWords(text, maxWords = 50) {
  if (!text) return '';
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ') + '…';
}

function safeUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

function iconLink(href, label, iconClass, isBrand = false) {
  const kindClass = isBrand ? 'brands' : 'solid';

  return `
    <a class="member-link"
       href="${href}"
       target="_blank"
       rel="noopener noreferrer"
       aria-label="${label}"
       title="${label}">
      <span class="icon ${kindClass} ${iconClass}" aria-hidden="true"></span>
    </a>
  `;
}

function renderMembers(members) {
  const container = document.getElementById('members-grid');
  if (!container) return;

  container.innerHTML = '';

  const currentMembers = Object.values(members)
    .filter(member => member.temporal_tag === 'Current')
    .sort((a, b) => (a.name_full || '').localeCompare(b.name_full || ''));

  currentMembers.forEach(member => {
    const card = document.createElement('section');
    card.className = 'member-card';

    const photoFilename = member?.photo?.filename || '';
    const photoSrc = photoFilename
      ? `data/photos/${encodeURI(photoFilename)}`
      : 'images/pic01.jpg';

    const titleText = member.title ? `${member.title} ` : '';
    const roleText = Array.isArray(member.internal_roles)
      ? member.internal_roles.join(', ')
      : '';

    const bioText = truncateWords(member.bio_short || '', 50);

    const links = [];
    if (member.link_github) {
      links.push(iconLink(member.link_github, 'GitHub', 'fa-github', true));
    }
    if (member.link_website) {
      links.push(iconLink(safeUrl(member.link_website), 'Website', 'fa-globe'));
    }
    if (member.link_orcid) {
      links.push(iconLink(member.link_orcid, 'ORCID', 'fa-id-badge'));
    }
    if (member.link_google_scholar) {
      links.push(iconLink(member.link_google_scholar, 'Google Scholar', 'fa-graduation-cap'));
    }
    if (member.email) {
      links.push(iconLink(`mailto:${member.email}`, 'Email', 'fa-envelope'));
    }

    card.innerHTML = `
      <img
        class="member-photo"
        src="${photoSrc}"
        alt="${member.name_full}"
        onerror="this.onerror=null;this.src='images/pic01.jpg';"
      >

      <h3>${titleText}${member.name_full}</h3>

      ${roleText ? `<p class="member-role">${roleText}</p>` : ''}

      <div class="member-links">
        ${links.join('')}
      </div>

      ${bioText ? `<p class="member-bio">${bioText}</p>` : ''}
    `;

    container.appendChild(card);
  });
}

function themeToSlug(theme) {
  return String(theme || '')
    .trim()
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function goToPublicationsForTheme(theme) {
  if (!theme) return;

  const slug = themeToSlug(theme);
  const url = `publications.html?theme=${encodeURIComponent(slug)}&label=${encodeURIComponent(theme)}`;
  window.location.href = url;
}

function wireThemeButtons() {
  document.querySelectorAll('.theme-details').forEach(button => {
    button.addEventListener('click', () => {
      goToPublicationsForTheme(button.dataset.theme);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadMembers();
  wireThemeButtons();
});

document.addEventListener('DOMContentLoaded', function () {
  const section = document.getElementById('members');
  const heading = document.getElementById('members-heading');

  if (!section || !heading) return;

  function toggleMembers() {
    const collapsed = section.classList.toggle('is-collapsed');
    heading.setAttribute('aria-expanded', String(!collapsed));
  }

  heading.addEventListener('click', toggleMembers);

  heading.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleMembers();
    }
  });
});