// research.js — draws the Research page from the data.
//
// The three areas the twelve themes fall into come from
// data/research-areas.json, and the themes themselves from
// data/research-themes.json: a heading, an intro and a card per theme, with the
// theme's own description inside it.
//
// The page's markup holds none of those words. They exist once, in the JSON,
// which is the only place they are edited -- and the deploy bakes what this
// draws into the published HTML (scripts/prerender.py) so the text is in the
// source a crawler reads.
//
// Each card's gradient is derived from the single colour a theme carries. The
// two ends are derived rather than stored, so a theme needs no second and third
// colour maintained beside the first. The derivation is done in OKLCH, where
// raising lightness leaves the hue alone: mixing toward white in sRGB drains
// chroma at the same time, which turned the twelve into near-identical pastels.
(function () {

	// Lift lightness, keep a fifth of the chroma; the bottom edge travels a
	// fifth of the way back toward the colour itself. Measured off the palette
	// sheet these came from.
	const LIFT = 0.19;
	const TOP_CHROMA = 0.22;
	const BOTTOM = 0.20;

	const srgb = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
	const linear = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

	function toOklch(hex) {
		const n = parseInt(hex.replace('#', ''), 16);
		const r = linear(((n >> 16) & 255) / 255),
		      g = linear(((n >> 8) & 255) / 255),
		      b = linear((n & 255) / 255);
		const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
		      m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
		      s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
		const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		      A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		      B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
		return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
	}

	// Returns null when the requested chroma falls outside sRGB, so the caller
	// can step it down rather than clip a channel and shift the hue.
	function toHex(L, C, h) {
		const a = C * Math.cos(h), b = C * Math.sin(h);
		const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3),
		      m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3),
		      s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
		const rgb = [
			 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
			-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
			-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
		];
		if (rgb.some(v => v < -0.001 || v > 1.001)) return null;
		return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, srgb(v))) * 255)
			.toString(16).padStart(2, '0')).join('');
	}

	function fit(L, C, h) {
		for (let c = C; c > 0.004; c -= 0.004) {
			const hex = toHex(L, c, h);
			if (hex) return hex;
		}
		return toHex(L, 0, h);
	}

	async function get(url) {
		const res = await fetch(url, { cache: 'no-cache' });
		if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
		return res.json();
	}

	function paint(card, colour) {
		const { L, C, h } = toOklch(colour);
		card.style.setProperty('--theme-top', fit(Math.min(0.97, L + LIFT), C * TOP_CHROMA, h));
		card.style.setProperty('--theme-bottom',
			fit(Math.min(0.97, L + LIFT * (1 - BOTTOM)),
			    C * (TOP_CHROMA + (1 - TOP_CHROMA) * BOTTOM), h));
	}

	// Built as elements with textContent rather than as a string of HTML, so a
	// theme's name and description need no escaping and cannot break the page.
	function cardFor(theme) {
		const card = document.createElement('details');
		card.className = 'theme-card';
		card.dataset.theme = theme.slug;

		const summary = document.createElement('summary');
		const name = document.createElement('span');
		name.className = 'theme-name';
		name.textContent = theme.name;
		const caret = document.createElement('span');
		caret.className = 'theme-caret';
		caret.setAttribute('aria-hidden', 'true');
		summary.append(name, caret);

		const body = document.createElement('div');
		body.className = 'theme-body';
		const text = document.createElement('p');
		text.textContent = theme.description || '';
		const link = document.createElement('a');
		link.className = 'button small';
		link.href = '/publications/?theme=' + encodeURIComponent(theme.slug) +
		            '&label=' + encodeURIComponent(theme.name);
		link.setAttribute('aria-label', 'Publications on ' + theme.name);
		link.textContent = 'Publications';
		body.append(text, link);

		card.append(summary, body);
		if (theme.colour) paint(card, theme.colour);
		return card;
	}

	// Each <section> on the page names the area it shows with data-area. That
	// attribute and the section's id are the only things about an area the
	// markup knows; every word comes from the data.
	async function draw() {
		const sections = document.querySelectorAll('section[data-area]');
		if (!sections.length) return;

		const [areas, themes] = await Promise.all([
			get('/data/research-areas.json'),
			get('/data/research-themes.json')
		]);
		const byId = Object.fromEntries(areas.map(a => [a.id, a]));

		sections.forEach(section => {
			const area = byId[section.dataset.area];
			const inner = section.querySelector('.inner');
			if (!area || !inner) return;

			// The anchor id is the area's id: one identifier per area, used here
			// and as the menu's link target, rather than a second one written
			// into the markup.
			section.id = area.id;

			const heading = document.createElement('h2');
			heading.textContent = area.heading;
			const intro = document.createElement('p');
			intro.textContent = area.intro;

			const cards = document.createElement('div');
			cards.className = 'theme-cards';
			themes.filter(t => t.area === area.id).forEach(t => cards.append(cardFor(t)));

			// Replaced rather than appended, so running over markup the deploy
			// already baked in leaves one copy and not two.
			inner.replaceChildren(heading, intro, cards);
		});
	}

	// Printing must carry every description: a printed copy with twelve headings
	// and no text would be useless. print.css opens the cards through
	// ::details-content where that is supported; this covers the rest, and
	// restores whatever was open once the dialog closes.
	function openForPrint() {
		document.querySelectorAll('.theme-card:not([open])').forEach(card => {
			card.dataset.wasClosed = '1';
			card.open = true;
		});
	}

	function restoreAfterPrint() {
		document.querySelectorAll('.theme-card[data-was-closed]').forEach(card => {
			card.open = false;
			delete card.dataset.wasClosed;
		});
	}

	window.addEventListener('beforeprint', openForPrint);
	window.addEventListener('afterprint', restoreAfterPrint);

	// A link to /research/#bridge from another page arrives before the sections
	// carry their ids, so the browser finds nothing and stays at the top. The
	// deploy bakes the ids in, which covers the published site; this covers a
	// local preview, and a hash changed while the page is open.
	function scrollToHash() {
		const id = decodeURIComponent(window.location.hash.slice(1));
		const target = id && document.getElementById(id);
		if (target) target.scrollIntoView({ block: 'start', behavior: 'auto' });
	}

	window.addEventListener('hashchange', scrollToHash);
	// Again once everything has settled: the first pass runs the moment the
	// cards exist, and images and fonts loading after it move the target.
	window.addEventListener('load', scrollToHash);

	draw().then(scrollToHash).catch(err => console.error('research:', err));

})();
