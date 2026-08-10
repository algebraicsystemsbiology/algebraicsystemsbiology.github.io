// site-nav.js
// Injects the shared dot-burst menu from partials/nav-button.html and wires it up.
//
// The menu was pasted into every page and had already diverged: publications
// was labelled PAPERS on two pages and PUBLICATIONS on three, and index's copy
// of the toggle script was missing the click-outside-to-close handler the
// other five had. One copy removes both classes of drift.
//
// Pages keep an empty <nav class="nav" id="nav" aria-label="Primary"></nav>.
//
// Sub-links are generated from the page's own sections, so they cannot drift
// from the page and every page gets them on the same terms -- Research used to
// have none while Engage did, purely because nobody had written them out.

(function () {
	'use strict';

	function currentPage() {
		var path = window.location.pathname;
		var file = path.substring(path.lastIndexOf('/') + 1);
		return file || 'index.html';
	}

	// Sub-links are generated from the page's own sections rather than listed
	// by hand, so they cannot fall out of step with the page and every page
	// gets them on the same terms. A section qualifies if it has an id and an
	// <h2>; the h2's text becomes the label.
	//
	// A section may carry data-nav-label to override the heading text, for a
	// heading too long or too specific to serve as a menu entry. No page needs
	// it at present: Research's headings are full sentences and are used as
	// they are, with .nav-links a.sub allowed to wrap.
	//
	// Sections titled by an <h1> are skipped: that is the page's own title, so
	// a sub-link would just repeat the entry above it.
	function sectionLinks() {
		var out = [];
		var sections = document.querySelectorAll('section[id]');
		Array.prototype.forEach.call(sections, function (sec) {
			var override = sec.getAttribute('data-nav-label');
			var label = override;
			if (!label) {
				var h2 = sec.querySelector('h2');
				if (!h2) return;
				// Drop the collapsible caret and collapse whitespace.
				label = h2.textContent.replace(/[\u25be\u25b4\u25bc\u25b2]/g, '').trim();
				label = label.replace(/\s+/g, ' ');
			}
			if (label) out.push({ id: sec.id, label: label });
		});
		return out;
	}

	function addSubLinks(nav) {
		var links = sectionLinks();
		if (!links.length) return;

		var anchor = nav.querySelector('#navLinks a[href="' + currentPage() + '"]');
		if (!anchor) return;

		var frag = document.createDocumentFragment();
		links.forEach(function (item) {
			var a = document.createElement('a');
			a.className = 'sub';
			a.href = '#' + item.id;
			a.textContent = item.label;
			frag.appendChild(a);
		});
		anchor.parentNode.insertBefore(frag, anchor.nextSibling);
	}

	function markCurrent(nav) {
		var here = currentPage();
		var link = nav.querySelector('#navLinks a[href="' + here + '"]');
		if (link) link.setAttribute('aria-current', 'page');
	}

	function wireToggle(nav) {
		var btn = nav.querySelector('#navToggle');
		if (!btn) return;

		function setOpen(open) {
			nav.classList.toggle('open', open);
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
			btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
		}

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

	function init() {
		var nav = document.getElementById('nav');
		if (!nav) return;

		fetch('partials/nav-button.html', { cache: 'no-cache' })
			.then(function (res) {
				if (!res.ok) throw new Error('HTTP ' + res.status);
				return res.text();
			})
			.then(function (html) {
				nav.innerHTML = html;
				addSubLinks(nav);
				markCurrent(nav);
				wireToggle(nav);
			})
			.catch(function (err) {
				console.warn('site-nav.js: could not load partials/nav-button.html —', err.message);
			});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
