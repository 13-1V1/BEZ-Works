// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Builds the page from programs.json and tools.json.
// Adding a program = adding one entry to programs.json. No changes here.

'use strict';

const $ = (sel, root = document) => root.querySelector(sel);

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

// The published build tucks the JSON inside the page (so the password lock covers it).
// Local preview falls back to fetching the files.
async function loadJSON(path, inlineId) {
  const inline = document.getElementById(inlineId);
  if (inline) return JSON.parse(inline.textContent);
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' → ' + res.status);
  return res.json();
}

/* ---------- Program cards ---------- */

function shotHTML(p) {
  const shots = p.images || [];
  // A looping clip (e.g. ZoomDraw's zoom) plays on the card; the screenshots still open in the lightbox
  if (p.video) {
    const open = shots.length ? `data-open-shots="${esc(p.id)}"` : '';
    const tag = shots.length ? 'button' : 'div';
    return `
    <${tag} class="card-shot" ${open} aria-label="${esc(p.name)} preview">
      <video src="${esc(p.video)}" ${shots[0] ? `poster="${esc(shots[0].thumb || shots[0].full)}"` : ''} autoplay muted loop playsinline preload="metadata"></video>
      ${shots.length ? `<span class="shot-count">${shots.length} shots</span>` : ''}
    </${tag}>`;
  }
  if (!shots.length) {
    return `<div class="card-shot"><div class="shot-placeholder">${esc(p.name)}</div></div>`;
  }
  const main = shots[0];
  const count = shots.length > 1 ? `<span class="shot-count">1 / ${shots.length}</span>` : '';
  return `
    <button class="card-shot" data-open-shots="${esc(p.id)}" aria-label="View ${esc(p.name)} screenshots">
      <img src="${esc(main.thumb || main.full)}" alt="${esc(main.alt || p.name + ' screenshot')}" loading="lazy" decoding="async">
      ${count}
    </button>`;
}

function actionsHTML(p) {
  if (p.status === 'coming-soon') return '<span class="soon-tag">Coming soon</span>';

  const parts = [];
  for (const d of p.downloads || []) {
    const meta = [d.platform, d.version && 'v' + d.version, formatSize(d.sizeBytes)].filter(Boolean).join(' · ');
    parts.push(`
      <a class="btn btn-heat" href="${esc(d.url)}" rel="noopener">
        ${esc(d.label || 'Download')}
        ${meta ? `<small>${esc(meta)}</small>` : ''}
      </a>`);
  }
  if (p.browser) {
    parts.push(`<a class="btn btn-coolant" href="${esc(p.browser)}" target="_blank" rel="noopener">Open in browser</a>`);
  }
  // source: one URL, or a list of { label, url } when there's more than one
  const sources = typeof p.source === 'string' ? [{ label: 'Source', url: p.source }] : p.source || [];
  for (const src of sources) {
    parts.push(`<a class="btn btn-quiet" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label || 'Source')}</a>`);
  }
  return `<div class="card-actions">${parts.join('')}</div>`;
}

function cardHTML(p, catNames) {
  const soon = p.status === 'coming-soon';
  return `
    <li class="program-card${soon ? ' soon' : ''}${p.featured ? ' featured' : ''}" id="${esc(p.id)}" data-category="${esc(p.category)}">
      ${shotHTML(p)}
      <div class="card-body">
        <div class="card-head">
          <h3 class="card-title"><a href="#${esc(p.id)}">${esc(p.name)}</a></h3>
          ${p.version ? `<span class="card-version">v${esc(p.version)}</span>` : ''}
        </div>
        <p class="card-category">${esc(catNames[p.category] || p.category)}</p>
        <p class="card-desc">${esc(p.description)}</p>
        ${p.note ? `<p class="card-note">${esc(p.note)}</p>` : ''}
        ${actionsHTML(p)}
        ${soon ? '' : `<div class="card-foot"><button class="link-btn" data-copy-link="${esc(p.id)}">Copy link</button></div>`}
      </div>
    </li>`;
}

/* ---------- Filters ---------- */

function setFilter(catId) {
  document.querySelectorAll('.filter-btn').forEach((b) => {
    const on = b.dataset.filter === catId;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
  document.querySelectorAll('.program-card').forEach((c) => {
    c.hidden = catId !== 'all' && c.dataset.category !== catId;
  });
}

function renderFilters(categories) {
  const nav = $('[data-filters]');
  const all = [{ id: 'all', name: 'All' }, ...categories];
  nav.innerHTML = all.map((c) =>
    `<button class="filter-btn" data-filter="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`
  ).join('');
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (btn) setFilter(btn.dataset.filter);
  });
  setFilter('all');
}

/* ---------- Lightbox ---------- */

const lb = {
  el: $('[data-lightbox]'),
  img: $('[data-lb-img]'),
  cap: $('[data-lb-caption]'),
  shots: [],
  name: '',
  i: 0,
  opener: null,

  open(program, opener) {
    this.shots = program.images || [];
    if (!this.shots.length) return;
    this.name = program.name;
    this.opener = opener;
    this.i = 0;
    this.show();
    this.el.hidden = false;
    document.body.style.overflow = 'hidden';
    $('[data-lb-close]').focus();
  },
  close() {
    this.el.hidden = true;
    document.body.style.overflow = '';
    if (this.opener) this.opener.focus();
  },
  step(d) {
    this.i = (this.i + d + this.shots.length) % this.shots.length;
    this.show();
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

  document.addEventListener('keydown', (e) => {
    if (lb.el.hidden) return;
    if (e.key === 'Escape') lb.close();
    if (e.key === 'ArrowLeft') lb.step(-1);
    if (e.key === 'ArrowRight') lb.step(1);
  });

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

/* ---------- Deep links (…/BEZ-Works/#musickid) ---------- */

function focusHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const card = document.getElementById(id);
  if (!card || !card.classList.contains('program-card')) return;
  setFilter('all');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('highlight');
  setTimeout(() => card.classList.remove('highlight'), 2500);
}

async function copyLink(id, btn) {
  const url = location.origin + location.pathname + '#' + id;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Link copied';
  } catch {
    prompt('Copy this link:', url);
  }
  setTimeout(() => { btn.textContent = 'Copy link'; }, 1800);
}

/* ---------- Card tilt + glint (mouse only, follows the pointer) ---------- */

function wireTilt(list) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || still) return;
  let active = null;
  list.addEventListener('pointermove', (e) => {
    const card = e.target.closest('.program-card');
    if (active && active !== card) untilt(active);
    if (!card || card.classList.contains('soon')) { active = null; return; }
    active = card;
    const r = card.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    const max = card.classList.contains('featured') ? 3 : 5;
    card.classList.add('tilting');
    card.style.setProperty('--ry', `${(u - 0.5) * max * 2}deg`);
    card.style.setProperty('--rx', `${(0.5 - v) * max * 2}deg`);
    card.style.setProperty('--gx', `${u * 100}%`);
    card.style.setProperty('--gy', `${v * 100}%`);
    card.style.setProperty('--glint', '1');
  });
  list.addEventListener('pointerleave', () => { if (active) untilt(active); active = null; });
  function untilt(card) {
    card.classList.remove('tilting');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    card.style.setProperty('--glint', '0');
  }
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

  try {
    const data = await loadJSON('programs.json', 'data-programs');
    const catNames = Object.fromEntries(data.categories.map((c) => [c.id, c.name]));
    const byId = Object.fromEntries(data.programs.map((p) => [p.id, p]));

    // Ready programs first, Coming soon at the end; otherwise keep file order
    const ordered = [...data.programs].sort((a, b) =>
      (a.status === 'coming-soon') - (b.status === 'coming-soon'));

    const list = $('[data-programs]');
    list.innerHTML = ordered.map((p) => cardHTML(p, catNames)).join('')
      || '<li class="empty">No programs yet.</li>';

    renderFilters(data.categories);
    wireTilt(list);

    list.addEventListener('click', (e) => {
      const shot = e.target.closest('[data-open-shots]');
      if (shot) return lb.open(byId[shot.dataset.openShots], shot);
      const copy = e.target.closest('[data-copy-link]');
      if (copy) copyLink(copy.dataset.copyLink, copy);
    });

    focusHash();
    window.addEventListener('hashchange', focusHash);
  } catch (err) {
    $('[data-programs]').innerHTML = '<li class="empty">Couldn\'t load the program list. Try refreshing.</li>';
    console.error(err);
  }

  try {
    renderTools(await loadJSON('tools.json', 'data-tools'));
  } catch (err) {
    console.error(err);
  }
}

init();
