// gallery-arrows.js
// Hide a gallery's scroll arrow when there is nothing further to scroll to.
//
// main.js injects .forward / .backward into every .gallery and reveals both on
// hover, whatever the scroll position — so the page offers a left arrow while
// already at the left edge, and a right arrow at the right edge. Worse, a
// gallery whose items all fit shows both arrows despite having nothing to
// scroll.
//
// This marks each gallery with at-start / at-end / no-scroll; gallery-arrows
// rules in main.css hide the arrows accordingly. Nothing here moves the
// gallery — scrolling stays main.js's job.

(function () {
	'use strict';

	var EPSILON = 2;   // scrollLeft is fractional at some zoom levels

	function inner(gallery) {
		for (var i = 0; i < gallery.children.length; i++) {
			if (gallery.children[i].classList.contains('inner')) return gallery.children[i];
		}
		return null;
	}

	function update(gallery) {
		var box = inner(gallery);
		if (!box) return;

		var max = box.scrollWidth - box.clientWidth;
		var x = box.scrollLeft;

		gallery.classList.toggle('no-scroll', max <= EPSILON);
		gallery.classList.toggle('at-start', x <= EPSILON);
		gallery.classList.toggle('at-end', x >= max - EPSILON);
	}

	function init() {
		var galleries = document.querySelectorAll('.gallery');
		if (!galleries.length) return;

		Array.prototype.forEach.call(galleries, function (gallery) {
			var box = inner(gallery);
			if (!box) return;

			update(gallery);

			// main.js scrolls by setting scrollLeft on an interval while the
			// pointer is over an arrow, which fires scroll events.
			box.addEventListener('scroll', function () { update(gallery); }, { passive: true });

			// Arrow width and item wrapping both change with the viewport.
			window.addEventListener('resize', function () { update(gallery); }, { passive: true });

			// Images load after this runs and change scrollWidth.
			Array.prototype.forEach.call(gallery.querySelectorAll('img'), function (img) {
				if (!img.complete) img.addEventListener('load', function () { update(gallery); });
			});
		});
	}

	// main.js builds the arrows on DOM ready; wait for load so they exist.
	if (document.readyState === 'complete') init();
	else window.addEventListener('load', init);
})();
