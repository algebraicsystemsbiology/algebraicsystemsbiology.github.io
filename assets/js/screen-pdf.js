// screen-pdf.js — "save this page as one tall PDF, exactly as it looks".
//
// Printing a page normally slices it into A4 sheets and swaps in the print
// stylesheet, which is right for paper and wrong for showing somebody the
// website. Add ?pdf=screen to any page and print it instead: the result is a
// single page, as wide as the layout and as tall as the document, rendered
// with the ordinary screen styles.
//
//     http://localhost:8000/people.html?pdf=screen     then Print -> Save as PDF
//
// scripts/make-pdfs.sh uses the same switch to generate the set from the
// command line.
//
// Parameters:
//     ?pdf=screen              on
//     &width=1200              page width, default 1440
//     &height=9000             force the page height instead of measuring it
//
// Printing by hand from Firefox: in its print dialogue open More settings,
// tick "Print backgrounds", and set Scale to 100% rather than "Fit to page
// width". With those two, Firefox produces the same page Chrome does --
// verified against Firefox 153, identical page box, same rendering.
//
// Inert without the parameter: nothing below runs.

(function () {
	'use strict';

	var params = new URLSearchParams(window.location.search);
	if (params.get('pdf') !== 'screen') return;

	// The page is capped rather than taking the window's width. A browser
	// maximised on a large display would otherwise produce a PDF two and a half
	// thousand points wide, which opens as a wall of tiny text. 1440 is the
	// width the layout is designed around.
	var CAP = parseInt(params.get('width'), 10) || 1440;

	// A height passed in wins over anything measured here. make-pdfs.sh uses it
	// to correct itself: it prints once, and if the result ran to more than one
	// page it prints again with a height it knows is sufficient. Measuring from
	// inside the page can only estimate what the print pass will do; counting
	// the pages afterwards cannot be wrong.
	var FORCED = parseInt(params.get('height'), 10) || 0;

	// ── Writing styles safely ───────────────────────────────────────────────
	//
	// Every style written below goes through here, and only when the text has
	// actually changed. This matters more than it looks. Rewriting a stylesheet
	// invalidates layout; a layout change fires the ResizeObserver at the foot
	// of this file; and that observer calls back in here. Writing
	// unconditionally made those three a loop -- and a page stuck in a loop
	// never goes idle, so Chrome's virtual clock never advances, the print
	// never happens, and the browser never exits. The run appeared to hang,
	// with the front page's diagram frame left half-built.

	function setStyle(id, css) {
		var style = document.getElementById(id);
		if (style && style.textContent === css) return false;
		if (!style) {
			style = document.createElement('style');
			style.id = id;
			document.head.appendChild(style);
		}
		style.textContent = css;
		return true;
	}

	// ── Making print look like the screen ───────────────────────────────────

	// The print stylesheet exists to paginate onto A4. That is exactly what is
	// being avoided here, so take it out of the print cascade.
	function disablePrintStyles() {
		Array.prototype.forEach.call(document.querySelectorAll('link[media="print"]'), function (link) {
			link.media = 'not all';
		});
	}

	// Every media rule is frozen to the answer the screen gives it: 'all' if it
	// applies here and now, 'not all' if it does not. Nothing is left for the
	// print pass to re-decide.
	function rewriteSheets(doc) {
		var view = doc.defaultView || window;
		Array.prototype.forEach.call(doc.styleSheets, function (sheet) {
			var rules;
			try { rules = sheet.cssRules; } catch (e) { return; }   // cross-origin
			if (!rules) return;
			Array.prototype.forEach.call(rules, function (rule) {
				if (!rule.media || !rule.media.mediaText) return;
				var text = rule.media.mediaText;
				if (text === 'all' || text === 'not all') return;
				var applies;
				try { applies = view.matchMedia(text).matches; } catch (e) { return; }
				try { rule.media.mediaText = applies ? 'all' : 'not all'; } catch (e) {}
			});
		});
	}

	// The template writes its responsive rules as `@media screen and (...)` --
	// 110 of them in main.css alone -- and none of those match when printing,
	// because print is not screen. The cascade then falls back to its widest
	// base: an 18pt root instead of 14pt, 7rem of section padding instead of
	// 5rem. The document laid out for print came out a third taller than the
	// one measured, and the tail of it landed on a second page.
	//
	// Turning `screen` into `all` is not enough on its own, because the width
	// conditions are then evaluated by the print pass -- and print does not
	// measure the page box this script sets. It measures the printer's paper.
	// Probed: with @page sized 1440px wide, print still answered a max-width
	// query as though it were 794px, A4's width. People's member grid dropped
	// from three columns to two, the document laid out about twice as tall as
	// the measurement, and every page of it spilled.
	//
	// So each rule is frozen to the answer the screen gives, rather than being
	// left in a form print can re-interpret.
	function makeScreenRulesApplyToPrint() {
		rewriteSheets(document);
		// The diagrams are same-origin frames with stylesheets of their own,
		// and the same fallback made them reflow and report a new height after
		// the page size had been settled.
		Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
			try {
				if (frame.contentDocument) rewriteSheets(frame.contentDocument);
			} catch (e) { /* cross-origin */ }
		});
	}

	// Viewport units are the other trap. Print re-resolves vh against the page
	// box, and here the page box is the height of the document -- so the front
	// page's 100vh hero grew to fill it, which lengthened the document, which
	// grew the page, which grew the hero. Pinning it to the real viewport in
	// pixels stops that before it starts.
	function pinViewportUnits() {
		var vh = window.innerHeight;
		setStyle('screen-pdf-vh',
			'.hero-scroll { height: ' + vh + 'px !important }\n' +
			'.hero-sticky { height: ' + vh + 'px !important; position: static !important }');
	}

	function capWidth() {
		var width = Math.min(window.innerWidth, CAP);
		setStyle('screen-pdf-width',
			'html { width: ' + width + 'px !important; margin: 0 auto !important;' +
			'       overflow-x: clip !important }\n' +
			// Elements sized in vw measure the window, not the capped page, so
			// they would hang off both edges. The front page's diagram shell is
			// the one that matters: 100vw with a centring translate.
			'.themes-shell { width: 100% !important; left: auto !important;' +
			'                transform: none !important }');
		return width;
	}

	// The template reveals things as you scroll to them: sections carry
	// is-inactive until they come into view, and the gallery holds each tile's
	// photograph at opacity 0 behind a transition. A PDF never scrolls, so the
	// research tiles printed as flat grey blocks -- in Chrome and Firefox
	// alike, which is what made it look like a browser problem.
	function revealScrollAnimations() {
		document.body.classList.remove('is-preload');
		Array.prototype.forEach.call(document.querySelectorAll('.is-inactive'), function (el) {
			el.classList.remove('is-inactive');
		});
		setStyle('screen-pdf-reveal',
			'.gallery article .image img, .banner .image img, .spotlight .image img {' +
			'  opacity: 1 !important; transform: none !important;' +
			'  transition: none !important; transition-delay: 0s !important }\n' +
			'.is-inactive, [class*="onscroll-"], [class*="onload-"] {' +
			'  opacity: 1 !important; transform: none !important }');
	}

	// A research card is a <details>, closed until somebody opens it, which is
	// right on screen and useless in a PDF: the page would export as twelve
	// headings and no text. print.css opens them for paper through
	// ::details-content; this is the same intent for the screen-shaped export.
	//
	// Only the cards. The BibTeX blocks on the publications page are <details>
	// too, and print.css deliberately leaves those closed -- a hundred and eight
	// expanded BibTeX records is not what anybody wants to be sent.
	//
	// It matters that this runs before the page is measured. Opening a card by
	// hand after the height has been settled grows the document past its page
	// box, and the overflow lands on a second sheet cut through whichever card
	// was open.
	function openDisclosures() {
		Array.prototype.forEach.call(document.querySelectorAll('.theme-card:not([open])'), function (d) {
			d.open = true;
		});
	}

	// Whatever height the diagram frames have settled at on screen is the
	// height they keep. Nothing in the print pass gets to move them.
	function freezeFrames() {
		Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
			var h = Math.ceil(frame.getBoundingClientRect().height);
			if (h > 0 && frame.style.height !== h + 'px') {
				frame.style.setProperty('height', h + 'px', 'important');
			}
		});
	}

	// ── The page itself ─────────────────────────────────────────────────────

	// Never shrink. A measurement taken while the page is still assembling can
	// come back smaller than an earlier one -- a diagram frame between sizes, a
	// grid mid-reflow -- and whichever landed last would become the page.
	// Taking the tallest seen makes it monotonic, so a late arrival can only
	// ever add.
	var tallestSeen = 0;

	function sizePage() {
		var doc = document.documentElement;
		var width = capWidth();
		var measured = Math.ceil(Math.max(
			doc.scrollHeight, doc.offsetHeight,
			document.body.scrollHeight, document.body.offsetHeight
		));

		tallestSeen = Math.max(tallestSeen, measured);

		var height = FORCED || tallestSeen;
		if (!FORCED) {
			// Slack, and this is a judgement rather than a calculation. The
			// print pass lays out a little taller than the measurement -- on
			// the front page by about 64px in 2936 -- and a box even a pixel
			// short spills a second, almost empty sheet.
			height += Math.max(96, Math.ceil(height * 0.03));
		}
		// A CSS pixel is 0.75pt, so a height off a multiple of 4 cannot be
		// expressed exactly in the page box.
		height = Math.ceil(height / 4) * 4;

		setStyle('screen-pdf-page',
			'@page { size: ' + width + 'px ' + height + 'px; margin: 0 }\n' +
			// Backgrounds carry most of this site's meaning: the research tiles
			// are photographs, the theme dots are colour.
			'* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important }\n' +
			'html, body { overflow-y: visible !important }');

		return height;
	}

	// ── Waiting for the page to stop moving ─────────────────────────────────

	// People and the front page build themselves from fetched data -- member
	// cards, the two diagrams -- so the document is still growing well after
	// load. Watch it, but on a strict budget: callbacks are capped, the
	// observer disconnects once the height has held still, and disconnects
	// unconditionally after a few seconds. An observer that can run forever is
	// what wedged the browser before.
	function trackGrowth() {
		if (!window.ResizeObserver) return;

		var lastHeight = -1;
		var unchanged = 0;
		var calls = 0;
		var observer = new ResizeObserver(function () {
			if (++calls > 200) return observer.disconnect();
			var h = sizePage();
			if (h === lastHeight) {
				if (++unchanged >= 3) observer.disconnect();
			} else {
				unchanged = 0;
				lastHeight = h;
			}
		});
		observer.observe(document.body);
		setTimeout(function () { observer.disconnect(); }, 6000);
	}

	function whenSettled() {
		var last = -1;
		var stable = 0;
		var waited = 0;

		(function tick() {
			var h = sizePage();
			if (h === last) stable += 1; else { stable = 0; last = h; }
			waited += 150;
			if (stable >= 2 || waited > 5000) {
				revealScrollAnimations();
				openDisclosures();
				makeScreenRulesApplyToPrint();
				freezeFrames();
				h = sizePage();
				document.documentElement.setAttribute('data-screen-pdf-ready', String(h));
				return;
			}
			setTimeout(tick, 150);
		})();
	}

	// Last word before the sheet is cut, and free: browsers fire this for
	// "Save as PDF" too.
	window.addEventListener('beforeprint', function () {
		revealScrollAnimations();
		openDisclosures();
		pinViewportUnits();
		freezeFrames();
		sizePage();
	});

	function start() {
		disablePrintStyles();
		makeScreenRulesApplyToPrint();
		pinViewportUnits();
		revealScrollAnimations();
		openDisclosures();
		trackGrowth();

		var pending = Array.prototype.slice.call(document.images)
			.filter(function (i) { return !i.complete; });
		if (!pending.length) return whenSettled();

		var left = pending.length;
		pending.forEach(function (img) {
			function next() { if (--left === 0) whenSettled(); }
			img.addEventListener('load', next, { once: true });
			img.addEventListener('error', next, { once: true });
		});
		// Never wait on an image that never resolves.
		setTimeout(function () { if (left > 0) { left = 0; whenSettled(); } }, 6000);
	}

	if (document.readyState === 'complete') start();
	else window.addEventListener('load', start);
})();
