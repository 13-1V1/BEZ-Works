// Created by: Brennan Meyer with use of Claude Code 11/11/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
// BEST offline cache (service worker). The file list + version come from precache.json, written by `node tools/build_web.js`.
// Page (HTML) = network-first so updates land; everything else = cache-first. Registered by BEST.html only when hosted (not file://, not localhost).
const PREFIX = 'best-'; const BUILD = 'a0ac0df3ff47';   // stamped by build_web.js
const manifest = () => fetch('precache.json', { cache: 'no-store' }).then(r => r.json());

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const m = await manifest();
    const c = await caches.open(PREFIX + m.version);
    await c.addAll(m.files);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    let keep = null;
    try { keep = PREFIX + (await manifest()).version; } catch (err) { /* offline: keep every cache */ }
    if (keep) for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== keep) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {   // network-first for the page
    e.respondWith(fetch(req).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  // cache-first for assets. A media Range request gets the full cached file, which audio elements accept.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
