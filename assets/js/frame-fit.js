/* frame-fit.js — sizing a framed diagram to its contents.
 *
 * Both halves of one mechanism live here: a framed document reports how tall
 * its content is, and the page framing it sets the frame to that height. It is
 * one file because it used to be four -- a reporter and a listener for each of
 * the two diagrams -- and the copies had already drifted apart. The home page
 * ended up with two listeners for the same message, disagreeing about the
 * minimum height, and neither of them was where you would look for it.
 *
 * In a framed document, name the element that holds the content:
 *
 *   <script src="/assets/js/frame-fit.js" data-content=".wrap"></script>
 *
 * In the page that frames it, mark the iframe:
 *
 *   <iframe src="..." data-frame-fit scrolling="no"></iframe>
 *   <script src="/assets/js/frame-fit.js"></script>
 *
 * The same file does the right thing in either position: it reports if it was
 * given a selector and is inside a frame, and it listens if the page it is on
 * has any frame to size. Load it at the end of <body>, so the iframes it
 * looks for exist by the time it runs.
 *
 * There is no minimum height here on purpose. A frame's floor belongs in the
 * stylesheet next to the rest of its appearance, as `min-height`, which wins
 * over the height set below -- so it is a floor without needing to be one
 * here as well. A floor in both places is how the home page came to reserve
 * 240px for a diagram that draws 155.
 */
(function () {
	'use strict';

	var MESSAGE = 'asb-frame-fit';

	// A few pixels of slack. Rounding can otherwise leave the content a pixel
	// taller than the frame, which brings a scrollbar back in Firefox even
	// with scrolling="no".
	var HEADROOM = 4;

	// ── The framed document's half ───────────────────────────────────────
	function startReporting(selector) {
		var last = 0;

		function report() {
			// The content's height, not the document's. documentElement
			// .scrollHeight can never be less than the viewport, and the
			// viewport here is the frame being sized from this number -- so
			// reporting it feeds straight back: the parent sets the frame to
			// content + 4, the next measurement reads content + 4, and the
			// frame grows by four pixels for as long as the page is open.
			var el = document.querySelector(selector);
			if (!el) return;

			var h = Math.ceil(el.getBoundingClientRect().height);
			if (!h || Math.abs(h - last) < 2) return;
			last = h;
			window.parent.postMessage({ type: MESSAGE, height: h }, '*');
		}

		// For a diagram that redraws itself and knows its own height changed.
		window.frameFit = { report: report };

		window.addEventListener('load', report);
		window.addEventListener('resize', report, { passive: true });

		// The drawing is built after its data arrives, so watch for it rather
		// than measuring once and trusting the answer.
		//
		// Watch the content element, not the body. One of these documents sets
		// html, body { height: 100% }, which makes the body exactly as tall as
		// the frame -- so observing it watches this script's own output and
		// never notices the drawing it is supposed to be measuring.
		if (window.ResizeObserver) {
			new ResizeObserver(report).observe(document.querySelector(selector) || document.body);
		} else {
			setInterval(report, 500);
		}

		report();
	}

	// ── The framing page's half ──────────────────────────────────────────
	function startFitting() {
		var frames = document.querySelectorAll('iframe[data-frame-fit]');
		if (!frames.length) return;

		window.addEventListener('message', function (event) {
			var data = event.data;
			if (!data || data.type !== MESSAGE) return;

			// Only from a frame on this page, and only the one that sent it:
			// any document can post to this window.
			for (var i = 0; i < frames.length; i++) {
				if (event.source !== frames[i].contentWindow) continue;
				var h = Math.ceil(data.height);
				if (h > 0) frames[i].style.height = (h + HEADROOM) + 'px';
				return;
			}
		});
	}

	var tag = document.currentScript;
	var content = tag && tag.getAttribute('data-content');

	if (content && window.parent !== window) startReporting(content);
	startFitting();
})();
