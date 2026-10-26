// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Hero conductor. Plays the nameplate program: a new blank pushes the last
// plate out of the vise, T1 faces the top, the carousel swaps to T2 for a
// light etch, then T3 for the final etch. The listing, position readout and
// tool table follow along. "Cycle start" runs it again; "Feed" overrides speed.
// Reduced motion shows the finished plate and nothing moves.

(function (BEZ) {
  'use strict';

  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;

  const surfaceCanvas = hero.querySelector('[data-surface]');
  const canvas = hero.querySelector('[data-cut]');
  const ctx = canvas.getContext('2d');
  const control = hero.querySelector('.control');
  const copy = hero.querySelector('.hero-copy');
  const listing = hero.querySelector('[data-gcode]');
  const nowLine = hero.querySelector('[data-now]');
  const toolRows = [...hero.querySelectorAll('[data-tool]')];
  const dro = Object.fromEntries(['x', 'y', 'z', 'f', 's', 't'].map((k) => [k, hero.querySelector(`[data-${k}]`)]));
  const cycleBtn = hero.querySelector('[data-cycle]');
  const feedBtn = hero.querySelector('[data-feed]');

  const P = BEZ.program;
  const program = P.build();
  const TOOLS = program.tools;
  const HOME = program.homeZ;
  const POCKETS = ['face', 'engraver', 'endmill', 'endmill', null, 'engraver', 'endmill', null];
  const TAU = Math.PI * 2;
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const clamp01 = (u) => Math.max(0, Math.min(1, u));
  const seg = (u, a, b) => clamp01((u - a) / (b - a));

  let surface = null;
  try { surface = BEZ.Surface(surfaceCanvas, { lowPower }); } catch (e) { console.warn('surface shader off:', e); }
  if (!surface) hero.classList.add('no-webgl');
  const fx = BEZ.Effects({ lowPower });

  // ---------- listing ----------
  listing.innerHTML = program.lines.map((l) => `<li>${l}</li>`).join('');
  const lineEls = [...listing.children];
  let litLine = -1;
  function lightLine(i) {
    if (i === litLine || i == null) return;
    if (lineEls[litLine]) lineEls[litLine].classList.remove('on');
    litLine = i;
    const el = lineEls[i];
    if (!el) return;
    el.classList.add('on');
    listing.style.setProperty('--shift', `${-(el.offsetTop - listing.clientHeight * 0.45)}px`);
    if (nowLine) nowLine.textContent = program.lines[i];
  }

  // ---------- layout ----------
  let dpr = 1, W = 0, H = 0, S = 1, jaw = 10;
  const b = { x: 0, y: 0, w: 0, h: 0 };
  let tex = null, stock = null, old = null;
  let faceR = 1, lineW = 1, grooveW = 2, nutR = 6, carR = 80, tc = { x: 0, y: 0 }, tcIn = { x: 0, y: 0 };
  let nozzle = { x: 0, y: 0 };

  const sx = (x) => b.x + x * S;
  const sy = (y) => b.y + b.h - y * S;
  const lx = (x) => x * S;                 // plate-local px
  const ly = (y) => b.h - y * S;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hr = hero.getBoundingClientRect();
    W = hr.width; H = hr.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (surface) surface.resize(W, H);

    const top = control.getBoundingClientRect().bottom - hr.top + 10;
    const bottom = copy.getBoundingClientRect().top - hr.top - 14;
    const tall = 4 + 0.42 * 2.6;                     // plate + both jaws
    S = Math.min((W - 32) / 9.5, Math.max(60, bottom - top) / tall, 128);
    jaw = 0.42 * S;
    b.w = 8 * S; b.h = 4 * S;
    b.x = (W - b.w) / 2;
    b.y = top + jaw * 1.15 + Math.max(0, (bottom - top - tall * S) / 2);

    faceR = 1.0 * S;
    lineW = Math.max(1.3, 0.016 * S);
    grooveW = Math.max(2.6, 0.094 * S);
    nutR = Math.max(7, 0.2 * S);
    carR = Math.max(62, Math.min(150, 1.3 * S));
    tc = { x: Math.min(b.x + b.w + carR * 0.45, W - 28), y: b.y + b.h * 0.5 };
    tcIn = { x: (tc.x - b.x) / S, y: (b.y + b.h - tc.y) / S };
    nozzle = { x: b.x - b.w * 0.08 - 0.15 * S, y: b.y + b.h * 0.12 };

    for (const m of program.moves) {
      if (m.fromTC) m.from = { x: tcIn.x, y: tcIn.y, z: HOME };
      if (m.type === 'change' || m.toTC) m.to = { x: tcIn.x, y: tcIn.y, z: HOME };
      if (m.toTC) m.len = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
    }

    tex = BEZ.makeStockTextures(b.w, b.h, dpr, S, [3.3, 2, 0.7].map(ly), faceR);
    stock = BEZ.Stock(tex, b.w, b.h, dpr);
    old = null;
  }

  // Draw the finished plate straight away (first load, resize, reduced motion)
  function finishPlate(st) {
    st.faceAll();
    for (const m of program.moves) {
      if ((m.type !== 'cut' && m.type !== 'arc') || m.from.z >= 0) continue;
      if (m.op !== 'light' && m.op !== 'final') continue;
      const steps = Math.max(2, Math.ceil((m.len * S) / 3));
      let p = P.at(m, 0);
      for (let i = 1; i <= steps; i++) {
        const q = P.at(m, i / steps);
        if (m.op === 'light') st.scribe(lx(p.x), ly(p.y), lx(q.x), ly(q.y), lineW);
        else st.groove(lx(p.x), ly(p.y), lx(q.x), ly(q.y), grooveW);
        p = q;
      }
    }
  }

  // ---------- state ----------
  let clock = 0, running = false, override = 1;
  let pos = { x: 0, y: 0, z: HOME }, tool = 3, cur = null;
  let lastCut = null, lastFace = null, hot = [];
  let spin = 0, now = 0;

  function moveAt(t) {
    const ms = program.moves;
    let lo = 0, hi = ms.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ms[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    return ms[lo];
  }

  function startCycle() {
    if (running) return;
    clock = 0; running = true; hot = []; lastCut = null; lastFace = null; cur = null;
    fx.clear();
    cycleBtn.disabled = true;
    wake();
  }

  const STEP = 1 / 240;
  function advance(dt) {
    const target = Math.min(clock + dt, program.duration);
    while (clock < target) {
      const prevMove = cur;
      clock = Math.min(clock + STEP, target);
      const m = moveAt(clock);
      cur = m;
      const u = clamp01((clock - m.t0) / m.dur);

      if (m !== prevMove && m.type === 'load') { old = stock; stock = BEZ.Stock(tex, b.w, b.h, dpr); stock.dx = -(b.x + b.w + 40); }
      if (m.type === 'load' || m.type === 'change') {
        if (m.type === 'change' && u > 0.62) tool = m.toTool;
        lastCut = null; lastFace = null;
        continue;
      }
      tool = m.tool;
      const p = P.at(m, u);
      pos = p;
      const cutting = (m.type === 'cut' || m.type === 'arc') && p.z < 0;

      if (cutting && m.op === 'face') {
        const cx = lx(p.x), cy = ly(p.y);
        if (!lastFace || Math.hypot(cx - lastFace.x, cy - lastFace.y) > 2) { stock.face(cx, cy, faceR); lastFace = { x: cx, y: cy }; }
        if (Math.random() < 0.7) {
          const th = Math.random() * TAU;
          fx.chips(sx(p.x) + Math.cos(th) * faceR * 0.95, sy(p.y) + Math.sin(th) * faceR * 0.95, 1, Math.max(2, 0.04 * S), th + Math.PI / 2);
        }
      } else if (cutting) {
        const q = { x: lx(p.x), y: ly(p.y) };
        if (lastCut) hot.push({ ax: lastCut.x, ay: lastCut.y, bx: q.x, by: q.y, t: now, op: m.op });
        lastCut = q;
        if (m.op === 'final' && Math.random() < 0.3) fx.sparks(sx(p.x), sy(p.y), 3);
        if (Math.random() < (m.op === 'final' ? 0.25 : 0.1)) fx.chips(sx(p.x), sy(p.y), 1, Math.max(1.5, 0.025 * S), Math.random() * TAU);
      } else {
        lastCut = null;
        if (m.type !== 'cut') lastFace = null;
      }
    }
    if (clock >= program.duration) cur = null;
    return cur;
  }

  // ---------- drawing ----------
  const HOT = { light: 0.5, final: 1.4 };

  function drawHot() {
    const keep = [];
    for (const s of hot) {
      const age = (now - s.t) / 1000;
      if (age >= HOT[s.op]) {
        if (s.op === 'light') stock.scribe(s.ax, s.ay, s.bx, s.by, lineW);
        else stock.groove(s.ax, s.ay, s.bx, s.by, grooveW);
      } else keep.push(s);
    }
    hot = keep;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (const s of hot) {
      const age = (now - s.t) / 1000, life = HOT[s.op];
      const glow = Math.max(0, 1 - age / (life * 0.7));
      if (glow <= 0) continue;
      ctx.strokeStyle = BEZ.heat(age * (1.4 / life), (s.op === 'final' ? 0.25 : 0.18) * glow);
      ctx.lineWidth = (s.op === 'final' ? grooveW : lineW * 2.5) * 3;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const s of hot) {
      const age = (now - s.t) / 1000, life = HOT[s.op];
      ctx.strokeStyle = BEZ.heat(age * (1.4 / life));
      ctx.lineWidth = s.op === 'final' ? grooveW : lineW * 1.4;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
    }
    ctx.restore();
  }

  function drawSheen(lxp, lyp) {
    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    const g = ctx.createRadialGradient(lxp, lyp, 0, lxp, lyp, b.w * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  function drawNozzle(on) {
    // Loc-Line style coolant hose from the back-left corner
    const pts = [];
    const x0 = nozzle.x - 0.55 * S, y0 = nozzle.y + b.h * 0.55;
    const r0 = Math.max(4, 0.09 * S);
    const n = Math.max(8, Math.ceil(Math.hypot(nozzle.x - x0, nozzle.y - y0) / (r0 * 1.2)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push({ x: x0 + (nozzle.x - x0) * u - Math.sin(u * Math.PI) * 0.35 * S, y: y0 + (nozzle.y - y0) * u });
    }
    const r = r0;
    for (const p of pts) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(p.x + 4, p.y + 5, r, 0, TAU); ctx.fill();
    }
    for (const p of pts) {
      const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
      g.addColorStop(0, '#6ea6e0'); g.addColorStop(1, '#1f4f86');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = on ? '#49d9cb' : '#2a6a66';
    ctx.beginPath(); ctx.arc(nozzle.x, nozzle.y, r * 0.55, 0, TAU); ctx.fill();
  }

  function toolRadius(kind) { return kind === 'face' ? faceR : nutR; }

  function drawLoadEvent(u) {
    // jaw opens, new blank slides in pushing the old plate, old plate drops away
    const open = u < 0.15 ? ease(seg(u, 0, 0.15)) : u > 0.86 ? 1 - ease(seg(u, 0.86, 1)) : 1;
    const slide = ease(seg(u, 0.15, 0.72));
    const start = -(b.x + b.w + 40);
    stock.dx = start * (1 - slide);
    if (old) {
      old.dx = Math.max(0, stock.dx + b.w + 4);
      const fall = ease(seg(u, 0.66, 0.92));
      old.scale = 1 - fall * 0.35;
      old.rot = fall * 0.35;
      old.dy = fall * b.h * 0.9;
      old.alpha = 1 - fall;
      if (fall >= 1) old = null;
    }
    return open;
  }

  function drawCarouselEvent(m, u) {
    const inU = ease(seg(u, 0, 0.18)), outU = ease(seg(u, 0.75, 1));
    const cx = tc.x + carR + (1 - inU + outU) * (W - tc.x + carR * 0.5);
    const cy = tc.y;
    const pFrom = m.fromTool - 1, pTo = m.toTool - 1, n = POCKETS.length;
    let dA = ((pTo - pFrom) % n + n) % n;
    if (dA > n / 2) dA -= n;
    const angle = (pFrom + dA * ease(seg(u, 0.32, 0.6))) * TAU / n;
    const skip = u < 0.3 ? pFrom : u > 0.62 ? pTo : -1;
    BEZ.machine.drawCarousel(ctx, cx, cy, carR, angle, POCKETS, skip, carR * 0.2);

    // spindle: travel to the pickup point, drop the tool, take the new one
    const homeScale = 1 + HOME * 0.12;
    const fromXY = { x: sx(m.from.x), y: sy(m.from.y) };
    const tr = ease(seg(u, 0, 0.18));
    const x = fromXY.x + (tc.x - fromXY.x) * tr, y = fromXY.y + (tc.y - fromXY.y) * tr;
    const pocketR = carR * 0.2;
    if (u < 0.3) {
      const k = TOOLS[m.fromTool].kind, d = ease(seg(u, 0.18, 0.3));
      const r = toolRadius(k) * homeScale * (1 - d) + pocketR * d;
      BEZ.machine.drawTool(ctx, k, x, y, r, spin, HOME * (1 - d), 0);
    } else if (u > 0.62) {
      const k = TOOLS[m.toTool].kind, d = ease(seg(u, 0.62, 0.75));
      const r = pocketR * (1 - d) + toolRadius(k) * homeScale * d;
      BEZ.machine.drawTool(ctx, k, tc.x, tc.y, r, spin, HOME * d, 0);
    } else {
      // empty spindle nose waiting at the pickup point
      ctx.strokeStyle = 'rgba(217,225,231,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tc.x, tc.y, pocketR * 1.35, 0, TAU); ctx.stroke();
    }
  }

  function render(dt, lightX, lightY) {
    ctx.clearRect(0, 0, W, H);
    const m = running ? cur : null;
    let open = 0;
    if (m && m.type === 'load') open = drawLoadEvent(clamp01((clock - m.t0) / m.dur));

    BEZ.machine.drawVise(ctx, b, jaw, open);
    if (old) old.draw(ctx, b.x, b.y);
    stock.draw(ctx, b.x, b.y);
    drawSheen(lightX, lightY);
    drawHot();
    BEZ.machine.drawFrontJaw(ctx, b, jaw, open);

    const coolOn = !!(m && m.coolant && pos.z < 1);
    drawNozzle(coolOn);
    if (coolOn && !reduceMotion) fx.coolant(nozzle.x, nozzle.y, sx(pos.x), sy(pos.y));
    fx.step(ctx, dt);

    if (m && m.type === 'change') {
      drawCarouselEvent(m, clamp01((clock - m.t0) / m.dur));
    } else {
      const kind = TOOLS[tool].kind;
      const z = pos.z;
      const scale = 1 + Math.max(0, z) * 0.12;
      const cutting = m && (m.type === 'cut' || m.type === 'arc') && z < 0;
      const glow = cutting ? (m.op === 'final' ? 1 : m.op === 'light' ? 0.45 : 0) : 0;
      if (m && m.type === 'rapid') {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(73,217,203,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx(pos.x), sy(pos.y)); ctx.lineTo(sx(m.to.x), sy(m.to.y)); ctx.stroke();
        ctx.setLineDash([]);
      }
      BEZ.machine.drawTool(ctx, kind, sx(pos.x), sy(pos.y), toolRadius(kind) * scale, spin, Math.max(0, z), glow);
    }
  }

  function updateReadouts(m) {
    const f = (v) => (v < 0 ? '-' : ' ') + Math.abs(v).toFixed(4);
    const p = m && m.type === 'change' ? { x: tcIn.x, y: tcIn.y, z: HOME } : pos;
    dro.x.textContent = f(p.x); dro.y.textContent = f(p.y); dro.z.textContent = f(p.z);
    dro.f.textContent = !m ? '0.' : m.type === 'rapid' ? 'RAPID' : m.feed ? `${m.feed}.` : '0.';
    dro.s.textContent = m ? String(m.spindle || 0) : '0';
    dro.t.textContent = String(tool);
    toolRows.forEach((el) => el.classList.toggle('on', Number(el.dataset.tool) === tool));
    if (m) lightLine(m.line);
  }

  // ---------- light ----------
  const light = { x: 0, y: 0, tx: 0, ty: 0, user: false };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    light.tx = e.clientX - r.left; light.ty = e.clientY - r.top; light.user = true;
  });
  hero.addEventListener('pointerleave', () => { light.user = false; });
  hero.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a,button')) return;
    const r = hero.getBoundingClientRect();
    if (!reduceMotion) fx.sparks(e.clientX - r.left, e.clientY - r.top, 30, 1.2);
    wake();
  });

  // ---------- loop ----------
  let raf = 0, visible = true, prevT = 0;
  function frame(t) {
    raf = 0;
    now = t;
    const dt = Math.min(0.05, prevT ? (t - prevT) / 1000 : 0.016);
    prevT = t;

    if (!light.user) {
      const a = t / 5200;
      light.tx = W * (0.5 + 0.32 * Math.cos(a)); light.ty = H * (0.45 + 0.22 * Math.sin(a * 1.3));
    }
    light.x += (light.tx - light.x) * Math.min(1, dt * 6);
    light.y += (light.ty - light.y) * Math.min(1, dt * 6);
    if (surface) surface.draw(light.x, light.y);

    let m = null;
    if (running) {
      m = advance(dt * override);
      const k = m && TOOLS[m.tool] ? TOOLS[m.tool].kind : null;
      spin += dt * (m && m.spindle ? (k === 'face' ? 14 : 30) : 0);
    }
    render(dt, light.x, light.y);
    updateReadouts(m);

    if (running && clock >= program.duration && !hot.length) {
      running = false;
      cycleBtn.disabled = false;
      lightLine(program.lines.length - 2);
    }
    if (visible && !document.hidden && !reduceMotion) raf = requestAnimationFrame(frame);
  }
  function wake() { if (stock && !raf && visible && !document.hidden && !reduceMotion) { prevT = 0; raf = requestAnimationFrame(frame); } }

  cycleBtn.addEventListener('click', startCycle);
  const OVERRIDES = [1, 2, 4, 0.5];
  feedBtn.addEventListener('click', () => {
    override = OVERRIDES[(OVERRIDES.indexOf(override) + 1) % OVERRIDES.length];
    feedBtn.textContent = `Feed ${Math.round(override * 100)}%`;
  });

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) wake();
  }, { threshold: 0.02 }).observe(hero);
  document.addEventListener('visibilitychange', wake);

  function settle() {
    // the finished plate in the vise, T3 parked at the tool-change spot
    layout();
    finishPlate(stock);
    running = false; cur = null; hot = []; fx.clear();
    tool = 3; pos = { x: tcIn.x, y: tcIn.y, z: HOME };
    cycleBtn.disabled = false;
    lightLine(program.lines.length - 2);
  }

  function still() {
    if (surface) surface.draw(W * 0.62, H * 0.32);
    render(0, W * 0.62, H * 0.35);
    updateReadouts(null);
  }

  let resizeTimer = 0, lastW = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = hero.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 2 && running) return;   // phone toolbars hiding: ignore
      lastW = w;
      settle();
      if (reduceMotion) still(); else wake();
    }, 180);
  });

  // fonts change the control band's height, so lay out once they're in
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    settle();
    lastW = W;
    light.x = light.tx = W * 0.65; light.y = light.ty = H * 0.35;
    if (reduceMotion) {
      cycleBtn.hidden = true; feedBtn.hidden = true;
      still();
    } else {
      wake();
      setTimeout(startCycle, 1400);
    }
  };
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(begin);
    setTimeout(begin, 2500);    // don't wait forever on a slow font
  } else begin();
})(window.BEZ);
