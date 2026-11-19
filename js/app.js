// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Builds the page from programs.json and tools.json.
// Adding a program = adding one entry to programs.json. No changes here.
//
// Three screens, each one an address so links and the Back button work:
//   (nothing)      the scroll tour and the category stacks (js/flow.js)
//   #cat-<id>      one category's cards ("#cat-all" for everything)
//   #<program id>  one program expanded: all screenshots, full text, downloads

'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Escape text before putting it into HTML
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
  if (mb >= 10) return Math.round(mb) + ' MB';
  if (mb >= 1) return mb.toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

// The published build tucks the JSON inside the page (saves two fetches).
// Local preview falls back to fetching the files.
async function loadJSON(path, inlineId) {
  const inline = document.getElementById(inlineId);
  if (inline) return JSON.parse(inline.textContent);
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' → ' + res.status);
  return res.json();
}

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const anim = (el, frames, opts) => (REDUCED || !el ? null : el.animate(frames, { easing: EASE, fill: 'backwards', ...opts }));

// "translate + scale" that puts el where rect `from` is. Used to fly a screenshot between screens.
function flyFrom(el, from) {
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return 'none';
  return `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})`;
}

const site = { cats: [], catNames: {}, programs: [], byId: {} };
const view = { cat: null, prog: null };     // what is open right now

/* ---------- Buttons for a program ---------- */

function platformsOf(p) {
  const list = [...new Set((p.downloads || []).map((d) => d.platform).filter(Boolean))];
  if (p.browser) list.push('Browser');
  return list;
}

// compact: one short button per platform (cards). Otherwise full buttons with version and size (expanded view).
function actionsHTML(p, compact) {
  if (p.status === 'coming-soon') return '<span class="soon-tag">Coming soon</span>';
  const parts = [];
  if (compact) {
    // one button per platform. A platform with a single file downloads it; one with a choice (installer or portable) opens the program.
    const all = p.downloads || [];
    for (const platform of [...new Set(all.map((d) => d.platform || ''))]) {
      const files = all.filter((d) => (d.platform || '') === platform);
      const label = all.length === 1 ? files[0].label || 'Download' : platform || 'Download';
      parts.push(files.length === 1
        ? `<a class="act" href="${esc(files[0].url)}" rel="noopener" title="${esc(['Download', formatSize(files[0].sizeBytes)].filter(Boolean).join(' · '))}">${esc(label)}</a>`
        : `<a class="act" href="#${esc(p.id)}" data-pick-file title="${files.length} downloads to pick from">${esc(label)}</a>`);
    }
  }
  for (const d of compact ? [] : p.downloads || []) {
    const meta = [d.platform, d.version && 'v' + d.version, formatSize(d.sizeBytes)].filter(Boolean).join(' · ');
    parts.push(`<a class="act" href="${esc(d.url)}" rel="noopener">${esc(d.label || 'Download')}${meta ? `<small>${esc(meta)}</small>` : ''}</a>`);
  }
  if (p.browser) {
    parts.push(`<a class="act alt" href="${esc(p.browser)}" target="_blank" rel="noopener">${compact ? 'Browser' : 'Open in browser'}</a>`);
  }
  if (!compact) {
    // source: one URL, or a list of { label, url } when there's more than one
    const sources = typeof p.source === 'string' ? [{ label: 'Source', url: p.source }] : p.source || [];
    for (const src of sources) {
      parts.push(`<a class="act quiet" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label || 'Source')}</a>`);
    }
  }
  return parts.join('');
}

// details: the longer write-up, one string or a list of paragraphs. Shown only on the expanded view.
function detailsHTML(p) {
  const paras = [].concat(p.details || []).filter(Boolean);
  return paras.length ? `<div class="info-details">${paras.map((t) => `<p>${esc(t)}</p>`).join('')}</div>` : '';
}

/* ---------- Cards ---------- */

function fanHTML(p) {
  const shots = p.images || [];
  if (!shots.length && !p.video) return `<div class="fan"><div class="shot-placeholder">${esc(p.name)}</div></div>`;
  // up to three screenshots, the first one on top; they fan out on hover
  const pick = shots.slice(0, 3).reverse();
  const layers = pick.map((s, k) => {
    const top = k === pick.length - 1;
    return `<img src="${esc(s.thumb || s.full)}" alt="${top ? esc(s.alt || p.name + ' screenshot') : ''}" loading="lazy" decoding="async">`;
  });
  // a looping clip (e.g. ZoomDraw's zoom) plays on top of the stack
  if (p.video) {
    layers.push(`<video src="${esc(p.video)}" ${shots[0] ? `poster="${esc(shots[0].thumb || shots[0].full)}"` : ''} autoplay muted loop playsinline preload="metadata"></video>`);
  }
  const count = shots.length > 1 ? `<span class="shot-count">${shots.length} shots</span>` : '';
  return `<div class="fan">${layers.join('')}${count}</div>`;
}

function cardHTML(p) {
  const soon = p.status === 'coming-soon';
  const meta = [site.catNames[p.category] || p.category, ...platformsOf(p)].join(' · ');
  return `
    <li class="card${soon ? ' soon' : ''}" data-card="${esc(p.id)}">
      <div class="panel"></div>
      ${fanHTML(p)}
      <div class="card-body">
        <h3 class="card-title"><a href="#${esc(p.id)}" data-open="${esc(p.id)}">${esc(p.name)}</a></h3>
        <p class="card-meta">${esc(meta)}</p>
        <p class="card-desc">${esc(p.description)}</p>
        <div class="card-actions">${actionsHTML(p, true)}<span class="more" aria-hidden="true">Details →</span></div>
      </div>
    </li>`;
}

function wireTilt(list) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine || REDUCED) return;
  let active = null;
  const flat = (c) => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); };
  list.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.card');
    if (active && active !== card) flat(active);
    active = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${((u - 0.5) * 10).toFixed(1)}deg`);
    card.style.setProperty('--rx', `${((0.5 - v) * 8).toFixed(1)}deg`);
    card.style.setProperty('--gx', `${u * 100}%`);
    card.style.setProperty('--gy', `${v * 100}%`);
  });
  list.addEventListener('pointerleave', () => { if (active) flat(active); active = null; });
}

/* ---------- Category screen ---------- */

const grid = {
  el: $('[data-grid]'), cards: $('[data-cards]'), chips: $('[data-chips]'),

  build() {
    this.chips.innerHTML = '<button class="chip back" type="button" data-grid-close>← Categories</button>' +
      site.cats.map((c) => `<button class="chip" type="button" data-cat="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('');
    this.chips.addEventListener('click', (e) => {
      if (e.target.closest('[data-grid-close]')) return up('');
      const b = e.target.closest('[data-cat]');
      if (b && b.dataset.cat !== view.cat) go('cat-' + b.dataset.cat, true);
    });
    this.cards.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions a:not([data-pick-file])')) return;   // a download button: let it download
      const card = e.target.closest('[data-card]');
      if (!card) return;
      e.preventDefault();
      detail.from = $('.fan', card).getBoundingClientRect();
      go(card.dataset.card);
    });
    wireTilt(this.cards);
  },

  // how: 'fly' = screenshots fly in from the tour's windows, 'rise' = cards slide up, 'none'
  fill(id, how) {
    const cat = site.cats.find((c) => c.id === id);
    const list = id === 'all' ? site.programs : site.programs.filter((p) => p.category === id);
    const sources = how === 'fly' ? list.map((p) => BEZ.flow.rect(p.id)) : [];
    $$('[data-cat]', this.chips).forEach((b) => {
      const on = b.dataset.cat === id;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
    $('[data-grid-title]').textContent = cat.name;
    $('[data-grid-count]').textContent = `${list.length} program${list.length === 1 ? '' : 's'}`;
    this.cards.innerHTML = list.map(cardHTML).join('') || '<li class="empty">No programs here yet.</li>';
    this.el.scrollTop = 0;
    if (how === 'none') return;
    anim($('[data-grid-title]'), [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 500 });
    $$('.card', this.cards).forEach((card, k) => {
      const delay = Math.min(k, 12) * 35, src = sources[k], fan = $('.fan', card);
      if (src && k < 16) {
        anim(fan, [{ transform: flyFrom(fan, src) }, { transform: 'none' }], { duration: 750, delay });
        [$('.panel', card), $('.card-body', card)].forEach((x) =>
          anim(x, [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 250 + delay }));
      } else {
        anim(card, [{ opacity: 0, transform: 'translateY(60px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 550, delay });
      }
    });
  },

  open(id) {
    const wasOpen = view.cat !== null;
    this.fill(id, wasOpen ? 'rise' : 'fly');     // read the windows' places before the stage is covered
    view.cat = id;
    this.el.classList.add('open');
    BEZ.flow.cover(true);
  },

  close() {
    view.cat = null;
    BEZ.flow.cover(false);
    // the screenshots on screen fly back to their windows as the screen fades
    $$('.card', this.cards).slice(0, 16).forEach((card) => {
      const dst = BEZ.flow.rect(card.dataset.card), fan = $('.fan', card);
      if (dst) anim(fan, [{ transform: 'none' }, { transform: flyFrom(fan, dst) }], { duration: 450, fill: 'forwards' });
      [$('.panel', card), $('.card-body', card)].forEach((x) => anim(x, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }));
    });
    this.el.classList.remove('open');
  },
};

/* ---------- Expanded program ---------- */

const detail = {
  el: $('[data-detail]'), box: $('[data-detail-in]'),
  from: null,      // where the clicked card's screenshot was, so the big one can fly out of it
  p: null, i: 0, media: [],

  build() {
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el || e.target.closest('[data-detail-close]')) return up(view.cat ? 'cat-' + view.cat : '');
      const th = e.target.closest('[data-gal-thumb]');
      if (th) return this.show(Number(th.dataset.galThumb));
      const step = e.target.closest('[data-gal-step]');
      if (step) return this.step(Number(step.dataset.galStep));
      if (e.target.closest('[data-gal-zoom]')) return this.zoom(e.target.closest('[data-gal-zoom]'));
      const copy = e.target.closest('[data-copy-link]');
      if (copy) copyLink(this.p.id, copy);
    });
    // swipe through the screenshots on phones
    let x0 = null;
    this.el.addEventListener('touchstart', (e) => { x0 = e.target.closest('.gal-main') ? e.touches[0].clientX : null; }, { passive: true });
    this.el.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) this.step(dx < 0 ? 1 : -1);
      x0 = null;
    });
  },

  open(p) {
    const fresh = view.prog === null;
    this.p = p; this.i = 0; view.prog = p.id;
    // the video (if any) comes first, then every screenshot
    this.media = [...(p.video ? [{ video: p.video, poster: p.images?.[0]?.thumb }] : []), ...(p.images || [])];
    const many = this.media.length > 1;
    const soon = p.status === 'coming-soon';
    this.box.innerHTML = `
      <button class="chip back" type="button" data-detail-close>← Back</button>
      <div class="detail-grid">
        <div class="gallery">
          ${this.media.length ? `
          <div class="gal-main">
            <div class="gal-stage" data-gal-stage></div>
            ${many ? `<button class="gal-nav prev" type="button" data-gal-step="-1" aria-label="Previous screenshot">‹</button>
            <button class="gal-nav next" type="button" data-gal-step="1" aria-label="Next screenshot">›</button>` : ''}
          </div>
          <p class="gal-cap" data-gal-cap aria-live="polite"></p>
          ${many ? `<ul class="gal-thumbs">${this.media.map((m, k) => `
            <li><button type="button" data-gal-thumb="${k}" aria-label="${m.video ? 'Video' : 'Screenshot ' + (k + 1)}">
              <img src="${esc(m.video ? m.poster || '' : m.thumb || m.full)}" alt="" loading="lazy" decoding="async">${m.video ? '<span class="play" aria-hidden="true">▶</span>' : ''}
            </button></li>`).join('')}</ul>` : ''}` : `<div class="gal-main"><div class="shot-placeholder">${esc(p.name)}</div></div>`}
        </div>
        <div class="info">
          <p class="info-cat">${esc(site.catNames[p.category] || p.category)}${p.version ? ` <span>v${esc(p.version)}</span>` : ''}</p>
          <h2 class="info-name metal" id="detail-name">${esc(p.name)}</h2>
          <p class="info-desc">${esc(p.description)}</p>
          ${detailsHTML(p)}
          ${p.note ? `<p class="info-note">${esc(p.note)}</p>` : ''}
          <div class="info-actions">${actionsHTML(p, false)}</div>
          ${soon ? '' : '<button class="link-btn" type="button" data-copy-link>Copy link to this program</button>'}
        </div>
      </div>`;
    if (this.media.length) this.show(0, true);
    this.el.scrollTop = 0;
    this.el.classList.add('open');
    if (!fresh) return;
    const main = $('.gal-main', this.box);
    if (this.from && main) anim(main, [{ transform: flyFrom(main, this.from), opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 600 });
    else anim(main, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 450 });
    $$('.info > *, .gal-thumbs, .gal-cap', this.box).forEach((x, k) =>
      anim(x, [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: 120 + k * 45 }));
    this.from = null;
  },

  show(i, quiet) {
    this.i = (i + this.media.length) % this.media.length;
    const m = this.media[this.i], stage = $('[data-gal-stage]', this.box);
    stage.innerHTML = m.video
      ? `<video src="${esc(m.video)}" ${m.poster ? `poster="${esc(m.poster)}"` : ''} autoplay muted loop playsinline controls></video>`
      : `<button type="button" class="gal-zoom" data-gal-zoom aria-label="View full size"><img src="${esc(m.full || m.thumb)}" alt="${esc(m.alt || this.p.name + ' screenshot')}" decoding="async"></button>`;
    const n = this.media.length;
    $('[data-gal-cap]', this.box).textContent = [n > 1 ? `${this.i + 1} / ${n}` : '', m.video ? 'Preview clip' : m.alt || ''].filter(Boolean).join('  ·  ');
    $$('[data-gal-thumb]', this.box).forEach((b, k) => b.classList.toggle('on', k === this.i));
    if (!quiet) anim(stage, [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
  },

  step(d) { if (this.media.length > 1) this.show(this.i + d); },

  zoom(opener) {
    const shots = this.p.images || [];
    lb.open(this.p, opener, Math.max(0, shots.indexOf(this.media[this.i])));
  },

  close() {
    view.prog = null;
    this.el.classList.remove('open');
  },
};

/* ---------- Lightbox: a screenshot at full size ---------- */

const lb = {
  el: $('[data-lightbox]'),
  img: $('[data-lb-img]'),
  cap: $('[data-lb-caption]'),
  shots: [], name: '', i: 0, opener: null,

  open(program, opener, at = 0) {
    this.shots = program.images || [];
    if (!this.shots.length) return;
    this.name = program.name;
    this.opener = opener;
    this.i = at;
    this.show();
    this.el.hidden = false;
    anim(this.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
    $('[data-lb-close]').focus();
  },
  close() {
    this.el.hidden = true;
    if (this.opener && this.opener.isConnected) this.opener.focus();
  },
  step(d) {
    this.i = (this.i + d + this.shots.length) % this.shots.length;
    this.show();
    anim(this.img, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 250 });
  },
  show() {
    const s = this.shots[this.i];
    this.img.src = s.full;
    this.img.alt = s.alt || this.name + ' screenshot';
    const many = this.shots.length > 1;
    this.cap.textContent = this.name + (many ? `  ·  ${this.i + 1} / ${this.shots.length}` : '');
    $('[data-lb-prev]').hidden = !many;
    $('[data-lb-next]').hidden = !many;
  },
};

function wireLightbox() {
  $('[data-lb-close]').addEventListener('click', () => lb.close());
  $('[data-lb-prev]').addEventListener('click', () => lb.step(-1));
  $('[data-lb-next]').addEventListener('click', () => lb.step(1));
  lb.el.addEventListener('click', (e) => { if (e.target === lb.el) lb.close(); });

  // Swipe left/right on phones
  let x0 = null;
  lb.el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) lb.step(dx < 0 ? 1 : -1);
    x0 = null;
  });
}

// Esc backs out one screen at a time; arrows step through screenshots
function wireKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    const side = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!lb.el.hidden) {
      if (e.key === 'Escape') lb.close();
      if (side) lb.step(side);
    } else if (view.prog) {
      if (e.key === 'Escape') up(view.cat ? 'cat-' + view.cat : '');
      if (side) detail.step(side);
    } else if (view.cat && e.key === 'Escape') {
      up('');
    }
  });
}

/* ---------- Addresses: #cat-<id> and #<program id> ---------- */

// Go to a screen. Remembers how deep we are so Back/Esc/close can step out the same way.
function go(hash, replace) {
  const depth = history.state?.d || 0;
  if (replace) history.replaceState({ d: depth }, '', '#' + hash);
  else history.pushState({ d: depth + 1 }, '', '#' + hash);
  route();
}

// Step back out. If we got here by a link from somewhere else, there's nothing to go back to: use the fallback.
function up(fallback) {
  if ((history.state?.d || 0) > 0) return history.back();
  history.replaceState(null, '', fallback ? '#' + fallback : location.pathname + location.search);
  route();
}

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const prog = site.byId[hash] || null;
  const asked = hash.startsWith('cat-') ? hash.slice(4) : null;
  let cat = site.cats.some((c) => c.id === asked) ? asked : null;
  // a program opens over its own category's cards, unless the cards showing already include it
  if (prog) cat = view.cat === 'all' || view.cat === prog.category ? view.cat : prog.category;

  if (cat !== view.cat) { if (cat) grid.open(cat); else grid.close(); }
  if ((prog ? prog.id : null) !== view.prog) { if (prog) detail.open(prog); else detail.close(); }

  // only the top screen can be clicked or tabbed into
  const layer = view.prog ? 2 : view.cat ? 1 : 0;
  document.documentElement.classList.toggle('lock', layer > 0);
  $('[data-track]').inert = layer > 0; $('[data-page]').inert = layer > 0;
  grid.el.inert = layer !== 1; detail.el.inert = layer !== 2;
  if (layer !== route.layer) {
    const focus = layer === 2 ? $('[data-detail-close]') : layer === 1 ? (route.layer === 2 && route.card()) || $('[data-grid-close]') : null;
    if (focus) setTimeout(() => focus.focus({ preventScroll: true }), 60);   // after the screen is showing
  }
  route.layer = layer; route.last = prog ? prog.id : route.last;
}
route.layer = 0;
route.card = () => $(`[data-card="${CSS.escape(route.last || '')}"] [data-open]`);   // back from a program: land on its card

async function copyLink(id, btn) {
  const url = location.origin + location.pathname + '#' + id;
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Link copied';
  } catch {
    prompt('Copy this link:', url);
  }
  setTimeout(() => { btn.textContent = label; }, 1800);
}

/* ---------- Header: search toggle on phones, the title as "home" ---------- */

function wireHeader() {
  const toggle = $('[data-search-toggle]'), top = $('[data-top]'), input = $('[data-search]');
  const set = (on) => { top.classList.toggle('searching', on); toggle.setAttribute('aria-expanded', on); };
  toggle.addEventListener('click', () => {
    const on = !top.classList.contains('searching');
    set(on);
    if (on) input.focus();
  });
  input.addEventListener('focus', () => set(true));
  document.addEventListener('pointerdown', (e) => { if (!top.contains(e.target)) set(false); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  $('[data-search-results]').addEventListener('click', (e) => { if (e.target.closest('[data-result]')) set(false); });   // picked one: fold it away

  $('[data-home]').addEventListener('click', (e) => {
    e.preventDefault();
    if (location.hash) { history.pushState({ d: 0 }, '', location.pathname + location.search); route(); }
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  });

  const day = $('[data-dayname]');
  if (day && window.BEZ.day) day.textContent = `${window.BEZ.day.name} · ${window.BEZ.day.look}`;
}

/* ---------- Tools I've Used ---------- */

function renderTools(data) {
  $('[data-tools]').innerHTML = (data.groups || []).map((g) => `
    <div class="tool-group">
      <h3>${esc(g.name)}</h3>
      <ul class="tool-chips">${g.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>`).join('');
}

/* ---------- Start ---------- */

async function init() {
  wireLightbox();
  wireKeys();
  wireHeader();

  try {
    const data = await loadJSON('programs.json', 'data-programs');
    // Ready programs first, Coming soon at the end; otherwise keep file order
    site.programs = [...data.programs].sort((a, b) => (a.status === 'coming-soon') - (b.status === 'coming-soon'));
    site.cats = [{ id: 'all', name: 'All' }, ...data.categories];
    site.catNames = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));
    site.byId = Object.fromEntries(data.programs.map((p) => [p.id, p]));

    grid.build();
    detail.build();
    BEZ.flow.init({ categories: data.categories, programs: site.programs, onPick: (id) => go('cat-' + id) });
    initSearch(site.programs, site.catNames, (id) => { if (id !== view.prog) go(id); });

    route();
    window.addEventListener('popstate', route);
    window.addEventListener('hashchange', route);
  } catch (err) {
    $('[data-pick]').textContent = "Couldn't load the program list. Try refreshing.";
    $('[data-pick]').style.opacity = 1;
    console.error(err);
  }

  try {
    renderTools(await loadJSON('tools.json', 'data-tools'));
  } catch (err) {
    console.error(err);
  }
}

init();
