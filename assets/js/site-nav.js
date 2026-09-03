// site-nav.js
// Builds the dot-burst menu from partials/nav-button.html and
// partials/nav-sections.json, and wires up its behaviour.
//
// The markup and the toggle script used to be pasted into every page and had
// diverged: publications was labelled PAPERS on two pages and PUBLICATIONS on
// three, and index's copy of the toggle lacked the click-outside-to-close
// handler the other five had.
//
// Sub-items are shown for every page, not only the page you are on. They used
// to be read from the current document's own sections, which meant they
// appeared exactly when they were least useful -- you do not need a link to a
// section of the page you are already reading. nav-sections.json is generated
// from the pages by scripts/build_nav.py, so the list stays derived rather
// than typed, and scripts/check_data.py fails the deploy if it goes stale.
//
// Each entry with sub-items becomes a disclosure, opened only by its toggle
// button. Neither hover nor focus opens it: hover was disorienting, and
// :focus-within actively broke the toggle, since clicking it focuses it and
// the group then stayed open regardless of state. The toggle is a real
// <button> with aria-expanded, so the keyboard already works. The entry for
// the current page starts open. The menu itself starts open on the home
// page only.

(function () {
	'use strict';

	// The site serves directory urls, so a page is identified by its folder --
	// "/research/" -- and that is what partials/nav-sections.json is keyed by
	// and what the menu links to. Anything ending in index.html, which is what
	// some servers and a local file open will give you, is folded onto the
	// same value, and a missing trailing slash is added.
	function currentPage() {
		var path = window.location.pathname.replace(/index\.html$/, '');
		if (path.charAt(path.length - 1) !== '/') path += '/';
		return path;
	}

	function buildGroups(nav, sections) {
		var here = currentPage();
		var links = nav.querySelectorAll('#navLinks > a');

		Array.prototype.forEach.call(links, function (link) {
			var page = link.getAttribute('href');
			var items = sections[page] || [];
			if (link.getAttribute('href') === here) link.setAttribute('aria-current', 'page');
			if (!items.length) return;

			// Wrap the entry and its sub-items so hover and focus apply to both.
			var group = document.createElement('div');
			group.className = 'nav-group';
			link.parentNode.insertBefore(group, link);

			var row = document.createElement('div');
			row.className = 'nav-row';
			group.appendChild(row);
			row.appendChild(link);

			var listId = 'nav-sub-' + page.replace(/[^a-z0-9]+/gi, '-');
			var toggle = document.createElement('button');
			toggle.type = 'button';
			toggle.className = 'nav-sub-toggle';
			toggle.setAttribute('aria-controls', listId);
			toggle.setAttribute('aria-label', 'Show sections of ' + link.textContent.trim());
			toggle.title = 'Show sections';
			toggle.innerHTML = '<span aria-hidden="true">▾</span>';
			row.appendChild(toggle);

			var list = document.createElement('div');
			list.className = 'nav-sub';
			list.id = listId;
			items.forEach(function (item) {
				var a = document.createElement('a');
				a.className = 'sub';
				// Same-page sections stay as bare fragments so the browser does
				// not reload the document to scroll within it.
				a.href = (page === here ? '' : page) + '#' + item.id;
				a.textContent = item.label;
				list.appendChild(a);
			});
			group.appendChild(list);

			var open = page === here;
			function setOpen(state) {
				open = state;
				group.classList.toggle('is-open', state);
				toggle.setAttribute('aria-expanded', state ? 'true' : 'false');
			}
			setOpen(open);
			toggle.addEventListener('click', function (e) {
				e.preventDefault();
				e.stopPropagation();
				setOpen(!open);
			});
		});
	}

	function wireToggle(nav) {
		var btn = nav.querySelector('#navToggle');
		if (!btn) return;

		function setOpen(open) {
			nav.classList.toggle('open', open);
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
			btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
		}

		// Closed on every page, home included. It used to open itself on the
		// home page so that a first-time visitor could see where the site
		// went -- but that said "this is a menu" once, at the cost of sitting
		// over the page from then on, through every scroll and every reload.
		// The button now carries the word "Menu", which says it always and
		// covers nothing.
		setOpen(false);

		btn.addEventListener('click', function () {
			setOpen(!nav.classList.contains('open'));
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') setOpen(false);
		});
		document.addEventListener('click', function (e) {
			if (!nav.contains(e.target)) setOpen(false);
		});
	}

	// The button wears a white chip at the top of a page and sheds it as you
	// scroll: prominent enough to be spotted on arrival, out of the way for the
	// rest of the page. This sets --chip, between 1 and 0; the CSS draws the
	// chip's ground and shadow from it.
	//
	// No flag is stored anywhere. Scroll position is state the page already
	// has, so this needs nothing from the visitor's browser -- and it resets
	// itself at the top of every page, which is where someone who has lost the
	// menu looks first.
	function wireScrollFade(nav) {
		// The chip is whole until FROM, gone by TO, and somewhere in between for
		// the stretch of scrolling between them. FROM is deep enough not to
		// react to the small bounce a trackpad makes at the top of a page; TO
		// is about the point where the first heading has gone.
		var FROM = 40;
		var TO = 200;
		var pending = false;

		function apply() {
			pending = false;

			// 1 at the top, 0 once past TO, and a straight ramp between: the
			// fade follows the scroll rather than happening all at once when it
			// crosses a line.
			var t = (window.scrollY - FROM) / (TO - FROM);
			var chip = 1 - Math.min(1, Math.max(0, t));

			nav.style.setProperty('--chip', chip.toFixed(3));
		}

		window.addEventListener('scroll', function () {
			// One class change per frame at most; scroll fires far faster than
			// anything can be drawn.
			if (pending) return;
			pending = true;
			window.requestAnimationFrame(apply);
		}, { passive: true });

		// A page restored mid-scroll, or opened at an anchor, starts where it
		// starts rather than assuming the top.
		apply();
	}

	function init() {
		var nav = document.getElementById('nav');
		if (!nav) return;

		Promise.all([
			fetch('/partials/nav-button.html', { cache: 'no-cache' }).then(function (r) {
				if (!r.ok) throw new Error('nav-button.html: HTTP ' + r.status);
				return r.text();
			}),
			fetch('/partials/nav-sections.json', { cache: 'no-cache' })
				.then(function (r) { return r.ok ? r.json() : {}; })
				// Sub-items are an enhancement: if the manifest is missing the
				// menu should still list the pages.
				.catch(function () { return {}; })
		]).then(function (results) {
			nav.innerHTML = results[0];
			buildGroups(nav, results[1]);
			wireScrollFade(nav);
			wireToggle(nav);
		}).catch(function (err) {
			console.warn('site-nav.js: could not build the menu —', err.message);
		});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
