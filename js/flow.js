// Created by: Brennan Meyer with use of Claude Code 11/19/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// The scroll tour at the top of the page. Every program's screenshot is a small
// window. Scrolling drifts them past in three depth layers, one category at a
// time, with the category's name passing through. At the end the windows deal
// into one stack per category ("All" first). A stack or a category name opens
// that category's cards (js/app.js does that part).
//
//   BEZ.flow.init({ categories, programs, onPick })   build it
//   BEZ.flow.rect(programId)    where that program's window is now, or null if off-screen
//   BEZ.flow.cover(bool)        true while an overlay hides the stage: pause it, keep the title docked
//   BEZ.flow.toEnd()            scroll to the category stacks

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hsh = (i, k) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  const SCALE = [0.5, 0.75, 1.05];     // far, mid, near layer: window size
  const SPEED = [0.6, 0.85, 1.15];     // how fast each layer moves with the scroll
  const DIM = [0.4, 0.7, 1];           // layer opacity
  const HERO = [[0.02, 0.06, 0], [0.72, 0.04, 1], [-0.06, 0.68, 1], [0.76, 0.7, 2], [0.36, 0.84, 0]];   // start-screen windows, clear of the title
  const G0 = 0.66;                     // scroll point where the stacks start to build
  const STACK = 5;                     // windows that show in a stack

  let covered = false, track, stage;
  const wins = [], tiles = {};

  function init({ categories, programs, onPick }) {
    track = document.querySelector('[data-track]');
    stage = document.querySelector('[data-stage]');
    const title = document.querySelector('[data-title]');
    const titleLink = title.querySelector('a');
    const sub = stage.querySelector('[data-sub]');
    const pick = stage.querySelector('[data-pick]');
    const skip = stage.querySelector('[data-skip]');
    const shown = programs.filter((p) => p.images && p.images.length);
    const cats = [{ id: 'all', name: 'All' }, ...categories];

    const addWin = (p, cat, img) => {
      const el = document.createElement('div');
      el.className = 'win';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `<i></i><img src="${img.thumb || img.full}" alt="" decoding="async">`;
      stage.appendChild(el);
      wins.push({ el, p, cat, i: wins.length });
    };
    shown.forEach((p) => addWin(p, p.category, p.images[0]));
    shown.filter((p) => p.images.length > 1).slice(0, HERO.length).forEach((p) => addWin(p, 'all', p.images[1]));

    cats.forEach((c, k) => {
      const list = wins.filter((w) => w.cat === c.id);
      list.forEach((w, j) => { w.j = j; w.n = list.length; });
      const count = c.id === 'all' ? programs.length : programs.filter((p) => p.category === c.id).length;
      const b = document.createElement('button');
      b.className = 'tile';
      b.type = 'button';
      b.innerHTML = `<span>${c.name} <em>${count}</em></span>`;
      b.addEventListener('click', () => onPick(c.id, b));
      stage.appendChild(b);
      const t = tiles[c.id] = { b, k, hover: 0, hv: 0 };
      const on = () => { t.hover = 1; }, off = () => { t.hover = 0; };
      b.addEventListener('pointerenter', on); b.addEventListener('focus', on);
      b.addEventListener('pointerleave', off); b.addEventListener('blur', off);
    });

    // the category names that pass through during the tour
    const words = categories.map((c, ci) => {
      const el = document.createElement('div');
      el.className = 'word';
      const count = programs.filter((p) => p.category === c.id).length;
      el.innerHTML = `<button type="button"><b class="metal">${c.name}</b><small>${count} program${count === 1 ? '' : 's'} · open →</small></button>`;
      const btn = el.querySelector('button');
      btn.addEventListener('click', () => onPick(c.id, btn));
      stage.appendChild(el);
      return { el, btn, ci };
    });

    skip.addEventListener('click', toEnd);

    // ---- layout: world positions for the tour, tile positions for the stacks ----
    let W, H, w0, wh, ts, CH, cam0, cam1, titleH, titleW, narrow;
    function layout() {
      W = stage.clientWidth; H = stage.clientHeight;
      narrow = W < 620;
      CH = H * 0.85; cam0 = -H * 0.1; cam1 = CH * 7.3;
      w0 = Math.min(360, Math.max(170, W * 0.26)); wh = w0 * 0.625 + 20;
      titleH = titleLink.offsetHeight || 1; titleW = titleLink.offsetWidth;
      for (const w of wins) {
        w.el.style.width = w0 + 'px';
        if (w.cat === 'all') {
          const a = HERO[w.j % HERO.length];
          w.layer = a[2]; w.x = a[0] * W; w.wy = cam0 + (a[1] * H - H * 0.5) / SPEED[a[2]];
        } else {
          const ci = categories.findIndex((c) => c.id === w.cat);
          w.layer = w.j % 3;
          w.x = ((w.j * 0.37 + ci * 0.21) % 1) * (W - w0 * 0.7) - w0 * 0.15;
          w.wy = (ci + 1) * CH + (w.n > 1 ? w.j / (w.n - 1) - 0.5 : 0) * CH * 0.95;
        }
      }
      const cols = W < 700 ? 2 : 4, gap = W < 700 ? 14 : 30, rows = Math.ceil(cats.length / cols);
      const tw = Math.min((W - 32 - (cols - 1) * gap) / cols, 250, ((H - 200) / rows - 64) / 0.625);
      const th = tw * 0.625, rowH = th + 64;
      const top = Math.max(150, (H - rows * rowH) / 2 + 60);
      ts = tw * 0.92 / w0;
      pick.style.top = (top - 74) + 'px';
      cats.forEach((c, k) => {
        const r = Math.floor(k / cols), inRow = Math.min(cols, cats.length - r * cols), col = k - r * cols;
        const left = (W - (inRow * tw + (inRow - 1) * gap)) / 2, t = tiles[c.id];
        t.cx = left + col * (tw + gap) + tw / 2; t.cy = top + r * rowH + th / 2;
        t.b.style.left = (t.cx - tw / 2) + 'px'; t.b.style.top = (t.cy - th / 2 - 10) + 'px';
        t.b.style.width = tw + 'px'; t.b.style.height = (rowH - 6) + 'px';
      });
    }
    window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    layout();

    // ---- draw loop ----
    let ps = REDUCED ? 1 : 0, dk = REDUCED ? 1 : 0, last = 0, onScreen = true;
    new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; }).observe(track);

    function frame(ms) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (ms - last) / 1000); last = ms;
      const r = track.getBoundingClientRect();
      const pt = REDUCED ? 1 : Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - stage.offsetHeight)));
      ps += (pt - ps) * (1 - Math.exp(-dt * 5));

      // the title: big and clear at the start, then docked as the page header
      const want = covered || !onScreen ? 1 : ss(ps / 0.07);
      dk += (want - dk) * (REDUCED ? 1 : 1 - Math.exp(-dt * 9));
      const sd = (narrow ? 34 : 48) / titleH;
      const dockX = narrow ? -(W / 2 - 14 - titleW * sd / 2) : 0;
      title.style.transform = `translate(${dockX * dk}px,${lerp(H * 0.5 - titleH * 0.56, narrow ? 12 : 8, dk)}px) scale(${lerp(1, sd, dk)})`;
      title.classList.toggle('docked', dk > 0.9);

      if (covered || !onScreen) return;
      const time = REDUCED ? 0 : ms / 1000, cam = lerp(cam0, cam1, ps / 0.7);
      sub.style.opacity = 1 - ss(ps / 0.03);
      sub.style.visibility = ps > 0.04 ? 'hidden' : 'visible';
      const atEnd = ps > 0.93;
      skip.style.opacity = atEnd ? 0 : 1; skip.style.visibility = atEnd ? 'hidden' : 'visible';
      const lastTile = ss((ps - (G0 + cats.length * 0.025 + 0.1)) / 0.06);
      pick.style.opacity = lastTile; pick.style.transform = `translateY(${(1 - lastTile) * 30}px)`;

      for (const id in tiles) {
        const t = tiles[id], lab = ss((ps - (G0 + t.k * 0.025 + 0.1)) / 0.06);
        t.hv += (t.hover - t.hv) * (1 - Math.exp(-dt * 10));
        t.b.style.opacity = lab; t.b.style.visibility = lab > 0.5 ? 'visible' : 'hidden';
      }
      for (const w of words) {
        const y = H * 0.5 + ((w.ci + 1) * CH - cam) * 0.7;
        const op = Math.max(0, Math.min(1, (1.25 - Math.abs(y - H * 0.5) / (H * 0.55)) * 1.6));
        w.el.style.transform = `translateY(${y}px) translateY(-50%)`;
        w.el.style.opacity = op; w.el.style.visibility = op > 0.02 ? 'visible' : 'hidden';
      }
      for (const w of wins) {
        const L = w.layer, i = w.i, t = tiles[w.cat], j = w.j, fan = 1 + t.hv * 1.7, side = j % 2 ? 1 : -1, step = Math.ceil(j / 2);
        const e = ss((ps - G0 - t.k * 0.025 - Math.min(j, 6) * 0.006) / 0.12);
        let fx = w.x + Math.sin(time * 0.5 + i) * 12 * SCALE[L];
        let fy = H * 0.5 + (w.wy - cam) * SPEED[L] - wh / 2 + Math.cos(time * 0.4 + i * 2.3) * 8 * SCALE[L];
        if (e === 0) w.below = fy < -wh * 1.3;      // already scrolled off the top: it comes back in from the bottom
        if (w.below) { fy = H + wh * (0.3 + hsh(i, 3)); fx = lerp(fx, t.cx - w0 / 2, 0.5); }
        const fr = Math.sin(time * 0.4 + i * 1.7) * 3;
        const sx = t.cx - w0 / 2 + (j ? side * step * 15 * fan : 0), sy = t.cy - wh / 2 - j * 7 * fan, sr = j ? side * step * 4 * fan : 0;
        w.el.style.transform = `translate3d(${lerp(fx, sx, e)}px,${lerp(fy, sy, e)}px,0) rotate(${lerp(fr, sr, e)}deg) scale(${lerp(SCALE[L], ts * (1 - j * 0.04), e)})`;
        w.el.style.opacity = lerp(DIM[L], j < STACK ? Math.max(0.35, 1 - j * 0.16) : 0, e);
        w.el.classList.toggle('soft', L === 0 && e < 0.05);
        w.el.style.zIndex = e > 0.5 ? 500 - j : L * 100 + (i % 90);
      }
    }
    requestAnimationFrame(frame);
  }

  function rect(programId) {
    if (covered || !stage) return null;
    const w = wins.find((x) => x.p.id === programId && x.cat !== 'all');
    if (!w || Number(w.el.style.opacity) < 0.05) return null;
    const r = w.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
    return r;
  }

  function cover(on) {
    covered = on;
    if (stage) stage.classList.toggle('gone', on);
  }

  function toEnd() {
    window.scrollTo({ top: track.offsetTop + track.offsetHeight - stage.offsetHeight, behavior: REDUCED ? 'auto' : 'smooth' });
  }

  BEZ.flow = { init, rect, cover, toEnd };
})(window.BEZ);
