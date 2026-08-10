// screen-pdf.js — "save this page as one tall PDF, exactly as it looks".
//
// Printing a page normally slices it into A4 sheets and swaps in the print
// stylesheet, which is right for paper and wrong for showing somebody the
// website. Add ?pdf=screen to any page and print it instead: the result is a
// single page, the width of the window, as tall as the document, rendered with
// the ordinary screen styles.
//
//     http://localhost:8000/people.html?pdf=screen      then Cmd-P -> Save as PDF
//
// It works in any browser's print dialogue, and scripts/make-pdfs.sh uses the
// same switch to generate the set from the command line.
//
// Inert without the parameter: nothing below runs.

(function () {
	'use strict';

	var params = new URLSearchParams(window.location.search);
	if (params.get('pdf') !== 'screen') return;

	// The print stylesheet exists to paginate nicely. That is exactly what we
	// are avoiding here, so take it out of the print cascade.
	function disablePrintStyles() {
		var sheets = document.querySelectorAll('link[media="print"]');
		Array.prototype.forEach.call(sheets, function (link) {
			link.media = 'not all';
		});
	}

	// One @page as large as the document. Browsers accept a length pair as the
	// page size, so a page 1440 wide and 9000 tall is a legal, if unusual,
	// sheet -- and nothing spills onto a second one.
	// Viewport units are the trap here. Printing re-resolves vh against the
	// page box, and the page box is the height of the document -- so the front
	// page's 100vh hero grew to fill it, which made the document taller, which
	// made the page taller, which made the hero taller. Pin anything sized in
	// vh to the real viewport first, in pixels, and the loop cannot start.
	function pinViewportUnits() {
		var vh = window.innerHeight;
		var style = document.getElementById('screen-pdf-vh') || document.createElement('style');
		style.id = 'screen-pdf-vh';
		style.textContent =
			'.hero-scroll { height: ' + vh + 'px !important }\n' +
			'.hero-sticky { height: ' + vh + 'px !important; position: static !important }';
		if (!style.parentNode) document.head.appendChild(style);
	}

	function sizePage() {
		var doc = document.documentElement;
		var width = Math.ceil(doc.getBoundingClientRect().width);
		var height = Math.ceil(Math.max(
			doc.scrollHeight, doc.offsetHeight,
			document.body.scrollHeight, document.body.offsetHeight
		));

		var style = document.getElementById('screen-pdf-page') || document.createElement('style');
		style.id = 'screen-pdf-page';
		style.textContent =
			'@page { size: ' + width + 'px ' + height + 'px; margin: 0 }\n' +
			// Backgrounds carry most of this site's meaning -- the research
			// tiles are photographs, the theme dots are colour.
			'* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important }\n' +
			// The menu is fixed, so it would otherwise be painted over the top
			// of the page; the hero's sticky stage needs to lie flat.
			'.nav, .cue { display: none !important }\n' +
			'.hero-sticky { position: static !important }\n' +
			'html, body { overflow: visible !important }';
		if (!style.parentNode) document.head.appendChild(style);
		return height;
	}

	// The height is only knowable once the images have their real sizes and the
	// data-driven pages have built their content. Settle before measuring, and
	// keep measuring until it stops changing.
	function whenSettled(done) {
		var last = -1;
		var stableFor = 0;
		var waited = 0;

		(function tick() {
			var h = sizePage();
			if (h === last) stableFor += 1; else { stableFor = 0; last = h; }
			waited += 150;
			// Two matching measurements, or five seconds, whichever comes first.
			if (stableFor >= 2 || waited > 5000) {
				document.documentElement.setAttribute('data-screen-pdf-ready', String(h));
				if (done) done(h);
				return;
			}
			setTimeout(tick, 150);
		})();
	}

	function start() {
		disablePrintStyles();
		pinViewportUnits();
		var images = Array.prototype.slice.call(document.images).filter(function (i) { return !i.complete; });
		var pending = images.length;
		if (!pending) return whenSettled();
		images.forEach(function (img) {
			function next() { if (--pending === 0) whenSettled(); }
			img.addEventListener('load', next, { once: true });
			img.addEventListener('error', next, { once: true });
		});
		// Never wait on an image that never resolves.
		setTimeout(function () { if (pending > 0) { pending = 0; whenSettled(); } }, 6000);
	}

	if (document.readyState === 'complete') start();
	else window.addEventListener('load', start);
})();
