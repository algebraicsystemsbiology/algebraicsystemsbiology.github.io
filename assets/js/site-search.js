// site-search.js — the menu's search field.
//
// Searches the three things the site knows as data: publications, current
// members, and research themes. Everything happens in the browser, against
// files the site already serves; nothing is sent anywhere.
//
// The data is fetched the first time the field is used rather than on page
// load, because publications.json and group_members.json come to about 200KB
// between them and most visits never search.
(function () {
	'use strict';

	var MAX_RESULTS = 8;

	var input, status, results, form;
	var index = null, loading = null, active = -1;

	// Must match slugify() in assets/js/publications.js and in who-we-are.js:
	// these slugs are what a result links to, and a card that spells its id
	// differently cannot be found. The 60-character cut is part of that.
	function slug(name) {
		return (name || '')
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
			.slice(0, 60);
	}

	// Folded for comparison: case and accents removed, so "Perez" finds "Pérez".
	function fold(s) {
		return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	}

	function year(pub) {
		var m = (pub.bibtex || '').match(/year\s*=\s*\{([^}]+)\}/i);
		var n = m ? parseInt(m[1].replace(/\D/g, ''), 10) : NaN;
		return Number.isFinite(n) ? n : null;
	}

	function get(url) {
		return fetch(url, { cache: 'no-cache' }).then(function (r) {
			if (!r.ok) throw new Error(url + ': ' + r.status);
			return r.json();
		});
	}

	function build(themes, members, pubs) {
		var out = [];

		// A theme's description is worth searching as well as showing: it is how
		// "cancer" finds Oncology and "shape" finds Topological Data Analysis,
		// neither of which says so in its name.
		themes.forEach(function (t) {
			out.push({
				kind: 'Theme',
				label: t.name,
				sub: t.description || '',
				href: '/publications/?theme=' + encodeURIComponent(t.slug) +
				      '&label=' + encodeURIComponent(t.name),
				hay: fold([t.name, t.short, t.description].join(' '))
			});
		});

		Object.values(members)
			.filter(function (m) { return m && m.temporal_tag === 'Current' && m.name_full; })
			.forEach(function (m) {
				out.push({
					kind: 'Person',
					label: m.name_full,
					sub: (m.internal_roles && m.internal_roles[0]) || m.title || '',
					href: '/people/#member-' + slug(m.name_full),
					hay: fold([m.name_full, m.title, (m.internal_roles || []).join(' '),
					           m.bio_short, (m.keywords || []).join(' ')].join(' '))
				});
			});

		Object.values(pubs).forEach(function (p) {
			if (!p || !p.publication_title) return;
			var authors = (p.group_member_authors || []).map(function (a) { return a.name; });
			var y = year(p);
			out.push({
				kind: 'Paper',
				label: p.publication_title,
				sub: [authors.join(', '), y].filter(Boolean).join(' · '),
				// To the paper's place in the list, not to the publisher: a search
				// result should leave you on the site, where the citation, the
				// BibTeX and the links to the paper all are.
				href: '/publications/#pub-' + slug(p.publication_title),
				hay: fold([p.publication_title, authors.join(' '),
				           (p.keywords || []).join(' '), y].join(' '))
			});
		});

		return out;
	}

	function load() {
		if (loading) return loading;
		// Deliberately silent: the fetch is quick and a flash of "Loading" under
		// the field is more distracting than the wait it describes.
		loading = Promise.all([
			get('/data/research-themes.json'),
			get('/data/group_members.json'),
			get('/data/publications.json')
		]).then(function (r) {
			index = build(r[0], r[1], r[2]);
		}).catch(function (err) {
			console.error('site-search:', err);
			status.textContent = 'Search is unavailable right now.';
			index = [];
		});
		return loading;
	}

	// A hit at the start of a field beats one in the middle of it, and a theme
	// beats a person beats a paper when both match equally well.
	var RANK = { Theme: 0, Person: 1, Paper: 2 };

	function search(q) {
		var needle = fold(q);
		return index
			.map(function (e) {
				var at = e.hay.indexOf(needle);
				if (at < 0) return null;
				return { e: e, score: (at === 0 ? 0 : 1) * 10 + RANK[e.kind] };
			})
			.filter(Boolean)
			.sort(function (a, b) { return a.score - b.score || a.e.label.localeCompare(b.e.label); })
			.slice(0, MAX_RESULTS)
			.map(function (r) { return r.e; });
	}

	function render(list, q) {
		results.innerHTML = '';
		active = -1;
		if (!q) { status.textContent = ''; return; }
		if (!list.length) {
			status.textContent = 'Nothing found for “' + q + '”.';
			return;
		}
		status.textContent = list.length === MAX_RESULTS
			? 'First ' + MAX_RESULTS + ' matches.'
			: list.length + (list.length === 1 ? ' match.' : ' matches.');

		list.forEach(function (e) {
			var li = document.createElement('li');
			var a = document.createElement('a');
			a.href = e.href;
			a.innerHTML = '<span class="r-kind">' + e.kind + '</span>' +
			              '<span class="r-label"></span>' +
			              (e.sub ? '<span class="r-sub"></span>' : '');
			a.querySelector('.r-label').textContent = e.label;
			if (e.sub) a.querySelector('.r-sub').textContent = e.sub;
			li.appendChild(a);
			results.appendChild(li);
		});
	}

	function move(step) {
		var links = results.querySelectorAll('a');
		if (!links.length) return;
		active = (active + step + links.length) % links.length;
		links.forEach(function (a, i) { a.classList.toggle('is-active', i === active); });
		links[active].focus();
	}

	function run() {
		var q = input.value.trim();
		if (!q) { render([], ''); return; }
		load().then(function () { render(search(q), q); });
	}

	function init() {
		form = document.querySelector('.nav-search');
		if (!form) return;
		input = form.querySelector('#siteSearch');
		status = form.querySelector('#siteSearchStatus');
		results = form.querySelector('#siteSearchResults');

		input.addEventListener('focus', load, { once: true });

		var timer;
		input.addEventListener('input', function () {
			clearTimeout(timer);
			timer = setTimeout(run, 140);
		});

		form.addEventListener('keydown', function (ev) {
			if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
			else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
			else if (ev.key === 'Escape') {
				if (input.value) { input.value = ''; render([], ''); input.focus(); }
			} else if (ev.key === 'Enter' && ev.target === input) {
				ev.preventDefault();
				var first = results.querySelector('a');
				if (first) first.click();
			}
		});
	}

	// The menu is injected by site-nav.js, so the field may not exist yet.
	if (document.querySelector('.nav-search')) init();
	else {
		var tries = 0;
		var wait = setInterval(function () {
			if (document.querySelector('.nav-search') || ++tries > 60) {
				clearInterval(wait);
				init();
			}
		}, 50);
	}

})();
