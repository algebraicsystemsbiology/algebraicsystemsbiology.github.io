// site-logo.js — the one place the logo's hover text is written.
//
// The logo is marked up separately on each page: a bar at the top of every
// page but the front one, which shows it inside the hero instead. Rather than
// repeat the sentence in six files, every logo takes it from here.
//
// It goes on the <img> rather than the surrounding link. The link already has
// an aria-label saying where it leads, and a title on the same element would
// give a screen reader two competing names for one control.
(function () {

	const TITLE = 'The bars show how topological loops emerge and disappear as ' +
	              'points from the letters ASB are connected across different scales';

	document.querySelectorAll('.site-logo img, img.hero-logo').forEach(img => {
		img.title = TITLE;
	});

})();
