// Created by: Brennan Meyer with use of Claude Code 10/26/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Visitor counter: a "VISITORS" readout in the hero's control band, like a
// machine's parts counter. Counts through Tally (tally.yuki.sh), a free no-signup
// hit counter. Every page load adds a visit; the number shown is UNIQUE visitors
// (Tally counts distinct IPs), so reloading doesn't inflate it.
// If the service is down or slow, the readout simply stays hidden.

(function () {
  'use strict';

  const URL = 'https://tally.yuki.sh/hits/bez-works/site';
  const box = document.querySelector('[data-visits]');
  if (!box) return;
  const out = box.querySelector('[data-visits-count]');

  const fmt = (n) => n.toLocaleString('en-US');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Count up from 0 like a counter rolling over, quick enough not to be a wait.
  function rollTo(n) {
    if (still || n < 2) { out.textContent = fmt(n); return; }
    const t0 = performance.now();
    const dur = Math.min(1600, 500 + n * 2);
    (function step(now) {
      const u = Math.min(1, (now - t0) / dur);
      out.textContent = fmt(Math.round(n * (1 - Math.pow(1 - u, 3))));
      if (u < 1) requestAnimationFrame(step);
    })(t0);
  }

  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 6000);
  fetch(URL, { signal: ctrl.signal, cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d) => {
      const n = Number(d && d.visitor);
      if (!Number.isFinite(n) || n < 1) return;
      box.hidden = false;
      rollTo(n);
    })
    .catch(() => {});
})();
