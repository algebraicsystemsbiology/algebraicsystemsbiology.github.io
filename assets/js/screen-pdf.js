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

	// The page is capped rather than taking the window's width. A browser
	// maximised on a large display would otherwise produce a PDF two and a half
	// thousand points wide, which opens as a wall of tiny text. 1440 is the
	// width the layout is designed around; ?pdf=screen&width=1200 overrides it.
	var CAP = parseInt(params.get('width'), 10) || 1440;
	// ?pdf=screen&height=NNNN forces the page height instead of measuring it.
	// scripts/make-pdfs.sh uses this to correct itself: it prints once, and if
	// the result ran to more than one page it prints again with a height it
	// knows is sufficient. Measuring from inside the page can only ever
	// estimate what the print pass will do; counting the pages afterwards is
	// the one measurement that cannot be wrong.
	var FORCED = parseInt(params.get('height'), 10) || 0;

	function capWidth() {
		var width = Math.min(window.innerWidth, CAP);
		var style = document.getElementById('screen-pdf-width') || document.createElement('style');
		style.id = 'screen-pdf-width';
		style.textContent =
			'html { width: ' + width + 'px !important; margin: 0 auto !important;' +
			'       overflow-x: clip !important }\n' +
			// Elements sized in vw measure the window, not the capped page, so
			// they would hang off both edges. The front page's diagram shell is
			// the one that matters; it is 100vw with a centring translate.
			'.themes-shell { width: 100% !important; left: auto !important;' +
			'                transform: none !important }';
		if (!style.parentNode) document.head.appendChild(style);
		return width;
	}

	// Never shrink. Measurements taken while the page is still assembling can
	// come back smaller than an earlier one -- a diagram frame between sizes, a
	// grid mid-reflow -- and whichever measurement happens to land last is the
	// one that becomes the page. Taking the tallest seen makes it monotonic, so
	// a late arrival can only ever add.
	var tallestSeen = 0;

	function sizePage() {
		var doc = document.documentElement;
		var width = capWidth();
		var height = Math.ceil(Math.max(
			doc.scrollHeight, doc.offsetHeight,
			document.body.scrollHeight, document.body.offsetHeight
		));

		// Round up to a multiple of 4. A PDF page is measured in points and a
		// CSS pixel is 0.75 of one, so a height that is not a multiple of 4
		// cannot be expressed exactly: 3951px is 2963.25pt, the box gets
		// 2963pt, and the quarter point of content left over spills onto a
		// second, otherwise empty, page.
		// Plus slack, and this is a judgement rather than a calculation. The
		// print pass lays out a little taller than the measurement does -- on
		// the front page, by about 64px out of 2936 -- and a box even a pixel
		// short spills a second, almost empty sheet. Bisecting found the true
		// height each time within 3% of the measured one, so 3% (never less
		// than 96px) covers it. The cost is a thin band of white at the foot;
		// the alternative cost is a blank page, which is the fault being fixed.
		height = height + Math.max(96, Math.ceil(height * 0.03));
		// A CSS pixel is 0.75pt, so a height off a multiple of 4 cannot be
		// expressed exactly in the page box.
		tallestSeen = Math.max(tallestSeen, height);
		height = Math.ceil((FORCED || tallestSeen) / 4) * 4;

		var style = document.getElementById('screen-pdf-page') || document.createElement('style');
		style.id = 'screen-pdf-page';
		style.textContent =
			'@page { size: ' + width + 'px ' + height + 'px; margin: 0 }\n' +
			// Backgrounds carry most of this site's meaning -- the research
			// tiles are photographs, the theme dots are colour.
			'* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important }\n' +
			// The menu stays: it is part of what the page looks like, and this
			// shape is one page, so a fixed element paints once, at the top,
			// where it sits on screen. (The paginated stylesheet does hide it,
			// because there it would repeat on all thirteen sheets.)
			//
			// The scroll cue goes: it is an animated arrow inviting a gesture,
			// and it sits over the hero.
			'.cue { display: none !important }\n' +
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
				makeScreenRulesApplyToPrint();
				freezeFrames();
				h = sizePage();
				document.documentElement.setAttribute('data-screen-pdf-ready', String(h));
				if (done) done(h);
				return;
			}
			setTimeout(tick, 150);
		})();
	}

	// Last word before the sheet is cut. Everything above settles the layout
	// and measures it, but a late-loading image or a script that reflows can
	// still leave the document taller than the @page that was written -- and
	// the overflow becomes a second, nearly empty page. Measuring again here,
	// once, catches whatever moved. Browsers fire this for "Save as PDF" too.
	window.addEventListener('beforeprint', function () {
		pinViewportUnits();
		freezeFrames();
		sizePage();
	});

	// The template writes its responsive rules as `@media screen and (...)`.
	// 110 of them in main.css alone. None of those match when printing -- print
	// is not screen -- so the whole cascade falls back to its base, and the base
	// is the widest one: an 18pt root instead of 14pt, 7rem section padding
	// instead of 5rem. The document laid out for print was a third taller than
	// the document I had measured, which is where the second, half-empty page
	// came from.
	//
	// Rewriting the conditions from `screen` to `all` makes print see exactly
	// what the screen sees. Width conditions then evaluate against the page
	// box, which is the same width, so the same rules match.
	function rewriteSheets(doc) {
		Array.prototype.forEach.call(doc.styleSheets, function (sheet) {
			var rules;
			try { rules = sheet.cssRules; } catch (e) { return; }   // cross-origin
			if (!rules) return;
			Array.prototype.forEach.call(rules, function (rule) {
				if (!rule.media || !rule.media.mediaText) return;
				var text = rule.media.mediaText;
				if (!/\bscreen\b/.test(text)) return;
				try { rule.media.mediaText = text.replace(/\bscreen\b/g, 'all'); } catch (e) {}
			});
		});
	}

	function makeScreenRulesApplyToPrint() {
		rewriteSheets(document);
		// The two diagrams are same-origin iframes with stylesheets of their
		// own. Left alone they reflow when the parent prints, then report a new
		// height, and the frame grows after the page size has been settled --
		// which is why exactly the two pages carrying a diagram, and no others,
		// kept spilling onto a second sheet.
		Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
			try {
				if (frame.contentDocument) rewriteSheets(frame.contentDocument);
			} catch (e) { /* cross-origin */ }
		});
	}

	// Whatever height the frames have settled at on screen is the height they
	// keep. Nothing in the print pass gets to move them.
	function freezeFrames() {
		Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
			var h = Math.ceil(frame.getBoundingClientRect().height);
			if (h > 0) frame.style.setProperty('height', h + 'px', 'important');
		});
	}

	// People and the front page build themselves from fetched data -- member
	// cards, the two diagrams -- so the document is still growing well after
	// load, and a settled measurement taken too early leaves the tail on a
	// second page. Rather than guess how long that takes, keep the @page in
	// step with the document for as long as the document keeps changing.
	function trackGrowth() {
		if (!window.ResizeObserver) return;
		new ResizeObserver(function () { sizePage(); }).observe(document.body);
	}

	function start() {
		disablePrintStyles();
		makeScreenRulesApplyToPrint();
		pinViewportUnits();
		trackGrowth();
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
