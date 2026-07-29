/* hero.js — spinning-icon menu + scroll-driven hero
   ASB Group site */

(function () {

	/* ---------- spinning-icon menu ---------- */

	var nav = document.getElementById('asbNav'),
	    btn = document.getElementById('asbNavToggle');

	if (nav && btn) {

		var setOpen = function (open) {
			nav.classList.toggle('open', open);
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
			btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
		};

		btn.addEventListener('click', function () {
			setOpen(!nav.classList.contains('open'));
		});

		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') setOpen(false);
		});

		// close the menu after jumping to a section
		Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) {
			a.addEventListener('click', function () { setOpen(false); });
		});

	}

	/* ---------- scroll-driven hero ---------- */

	var stage  = document.getElementById('heroScroll'),
	    sticky = document.getElementById('heroSticky');

	if (stage && sticky) {

		var ticking = false;

		var update = function () {
			var rect   = stage.getBoundingClientRect(),
			    travel = stage.offsetHeight - window.innerHeight,
			    p      = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 1;

			// phase one  (0   -> 0.5): scrim rises, text fades up and seats
			// phase two  (0.5 -> 1  ): text travels to the top, scrim deepens
			var a = Math.min(1, p / 0.5),
			    q = Math.max(0, (p - 0.5) / 0.5);

			sticky.style.setProperty('--p', a.toFixed(4));
			sticky.style.setProperty('--q', q.toFixed(4));

			ticking = false;
		};

		var onScroll = function () {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(update);
			}
		};

		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);
		update();

	}

})();
