// site-footer.js
// Injects the shared footer from partials/footer.html.
//
// The footer used to be pasted into every page, and had already drifted into
// three versions: publications.html had lost its social icons and carried
// different copyright wording, and engage.html was reformatted. Editing it
// meant editing it everywhere, which is how that happened.
//
// Pages carry an empty <footer class="wrapper style1 align-center"
// id="site-footer"></footer>; the partial supplies its inner content. Keeping
// the <footer> element in the page rather than injecting it wholesale means
// the existing CSS — which selects #wrapper > footer.wrapper > .inner — keeps
// matching, and the page reserves the right shape before the fetch resolves.
//
// This site already requires JavaScript for its main content (People and
// Publications fetch their data at runtime), so a fetched footer adds no new
// dependency. It does mean the footer will not appear over file://, but the
// site does not work that way regardless — see documentation/usage_instructions.md.

(function () {
	'use strict';

	function init() {
		var slot = document.getElementById('site-footer');
		if (!slot) return;

		fetch('/partials/footer.html', { cache: 'no-cache' })
			.then(function (res) {
				if (!res.ok) throw new Error('HTTP ' + res.status);
				return res.text();
			})
			.then(function (html) {
				slot.innerHTML = html;
			})
			.catch(function (err) {
				// Leave the empty footer rather than injecting a broken one; a
				// missing footer is less alarming than a half-rendered one.
				console.warn('site-footer.js: could not load partials/footer.html —', err.message);
			});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
