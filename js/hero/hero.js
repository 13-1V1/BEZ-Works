// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Hero conductor. A raw blank waits in the vise; nothing happens until
// "Cycle start". Then: T1 faces the top, the carousel swaps to T2 for a light
// etch, T3 cuts the bold etch, T4 the fine etch, and a flare of light runs
// across the finished plate. Running it again loads a fresh blank, which
// pushes the finished plate out. "Feed" overrides the speed.
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
  const LAST_TOOL = 4;
  const POCKETS = ['face', 'engraver', 'endmill', 'endmill', null, 'engraver', 'endmill', null];
  const TAU = Math.PI * 2;
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const clamp01 = (u) => Math.max(0, Math.min(1, u));
  const seg = (u, a, b) => clamp01((u - a) / (b - a));
  const loadMove = program.moves.find((m) => m.type === 'load');

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
  let faceR = 1, nutR = 6, carR = 80, tc = { x: 0, y: 0 }, tcIn = { x: 0, y: 0 };
  const width = { light: 1, bold: 3, fine: 2 };
  let glints = [];

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
    width.light = Math.max(1.3, 0.016 * S);
    width.bold = Math.max(3.2, 0.125 * S);
    width.fine = Math.max(1.8, 0.0625 * S);
    nutR = Math.max(7, 0.2 * S);
    carR = Math.max(62, Math.min(150, 1.3 * S));
    tc = { x: Math.min(b.x + b.w + carR * 0.45, W - 28), y: b.y + b.h * 0.5 };
    tcIn = { x: (tc.x - b.x) / S, y: (b.y + b.h - tc.y) / S };

    for (const m of program.moves) {
      if (m.fromTC) m.from = { x: tcIn.x, y: tcIn.y, z: HOME };
      if (m.type === 'change' || m.toTC) m.to = { x: tcIn.x, y: tcIn.y, z: HOME };
    }

    // where the finishing flare catches an edge: corners across all the etched work
    glints = [];
    for (const st of [...program.design.bold, ...program.design.fine]) {
      for (const op of st) {
        const pt = op.m || op.l || op.a;
        glints.push({ x: lx(pt[0]), y: ly(pt[1]) });
      }
    }
    glints = glints.filter((_, i) => i % 2 === 0);

    tex = BEZ.makeStockTextures(b.w, b.h, dpr, S, [3.3, 2, 0.7].map(ly), faceR);
    stock = BEZ.Stock(tex, b.w, b.h, dpr);
    stock.fresh = true;
    old = null;
  }

  function etch(st, op, ax, ay, bx, by) {
    if (op === 'light') st.scribe(ax, ay, bx, by, width.light);
    else st.groove(ax, ay, bx, by, width[op]);
  }

  // Draw the finished plate straight away (reduced motion, resize after a cycle)
  function finishPlate(st) {
    st.faceAll();
    for (const m of program.moves) {
      if ((m.type !== 'cut' && m.type !== 'arc') || m.from.z >= 0 || m.op === 'face' || !m.op) continue;
      const steps = Math.max(2, Math.ceil((m.len * S) / 3));
      let p = P.at(m, 0);
      for (let i = 1; i <= steps; i++) {
        const q = P.at(m, i / steps);
        etch(st, m.op, lx(p.x), ly(p.y), lx(q.x), ly(q.y));
        p = q;
      }
    }
    st.fresh = false;
  }

  // ---------- state ----------
  let clock = 0, running = false, override = 1;
  let pos = { x: 0, y: 0, z: HOME }, tool = LAST_TOOL, cur = null;
  let lastCut = null, lastFace = null;
  let spin = 0, now = 0, flareStart = -1;

  function moveAt(t) {
    const ms = program.moves;
    let lo = 0, hi = ms.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ms[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    return ms[lo];
  }

  function startCycle() {
    if (running) return;
    // a raw blank already in the vise gets cut as-is; otherwise load a new one
    clock = stock.fresh ? loadMove.t0 + loadMove.dur : 0;
    running = true; lastCut = null; lastFace = null; cur = null; flareStart = -1;
    fx.clear();
    cycleBtn.disabled = true;
    cycleBtn.classList.remove('ready');
    wake();
  }

  // chips leave a cutting edge along its direction of travel (spindle CW
  // seen from above), only from edges that are in the metal on the leading side
  function throwChips(m, p, kind) {
    const fdx = (m.to.x - m.from.x), fdy = -(m.to.y - m.from.y);
    const fl = Math.hypot(fdx, fdy) || 1;
    const fxn = fdx / fl, fyn = fdy / fl;
    const cx = sx(p.x), cy = sy(p.y);
    const edges = kind === 'face' ? 5 : 2;
    const r = kind === 'face' ? faceR * 0.93 : Math.max(2, TOOLS[m.tool].dia * 0.5 * S);
    const chance = kind === 'face' ? 0.16 : kind === 'engraver' ? 0.05 : 0.14;
    for (let k = 0; k < edges; k++) {
      if (Math.random() > chance) continue;
      const a = spin + (k * TAU) / edges + (Math.random() - 0.5) * 0.3;
      const ux = Math.cos(a), uy = Math.sin(a);
      if (ux * fxn + uy * fyn < 0.05) continue;              // trailing side: already cut
      const ex = cx + ux * r, ey = cy + uy * r;
      if (ex < b.x || ex > b.x + b.w || ey < b.y || ey > b.y + b.h) continue;   // edge is in the air
      const size = kind === 'face' ? Math.max(2.4, 0.05 * S) : kind === 'engraver' ? Math.max(1, 0.012 * S) : Math.max(1.4, TOOLS[m.tool].dia * 0.3 * S);
      fx.chip(ex, ey, a + Math.PI / 2 - 0.2, size, kind === 'face' ? 1 : 0.6);
    }
  }

  function arcTangent(m, u) {
    const a = m.arc.a0 + m.arc.dir * m.arc.sweep * u;
    return { tool: m.tool, from: { x: 0, y: 0 }, to: { x: -Math.sin(a) * m.arc.dir, y: Math.cos(a) * m.arc.dir } };
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

      if (m !== prevMove && m.type === 'load') {
        old = stock;
        stock = BEZ.Stock(tex, b.w, b.h, dpr);
        stock.fresh = true;
        stock.dx = -(b.x + b.w + 40);
      }
      if (m.type === 'load' || m.type === 'change') {
        if (m.type === 'change' && u > 0.62) tool = m.toTool;
        lastCut = null; lastFace = null;
        continue;
      }
      tool = m.tool;
      const p = P.at(m, u);
      pos = p;
      const cutting = (m.type === 'cut' || m.type === 'arc') && p.z < 0;
      if (!cutting) { lastCut = null; lastFace = null; continue; }
      stock.fresh = false;

      if (m.op === 'face') {
        const cx = lx(p.x), cy = ly(p.y);
        if (!lastFace || Math.hypot(cx - lastFace.x, cy - lastFace.y) > 2) { stock.face(cx, cy, faceR); lastFace = { x: cx, y: cy }; }
        throwChips(m, p, 'face');
      } else {
        const q = { x: lx(p.x), y: ly(p.y) };
        if (lastCut) etch(stock, m.op, lastCut.x, lastCut.y, q.x, q.y);
        lastCut = q;
        throwChips(m.type === 'arc' ? arcTangent(m, u) : m, p, TOOLS[m.tool].kind);
      }
    }
    if (clock >= program.duration) cur = null;
    return cur;
  }

  // ---------- drawing ----------
  function drawSheen(lxp, lyp) {
    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    const g = ctx.createRadialGradient(lxp, lyp, 0, lxp, lyp, b.w * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,0.26)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  // a band of light runs corner to corner across the plate; edges flash as it passes
  const FLARE = 2.2;
  function drawFlare() {
    if (flareStart < 0) return;
    const t = (now - flareStart) / 1000 / FLARE;
    if (t >= 1) { flareStart = -1; return; }
    const p = -0.15 + ease(t) * 1.3;
    const st = (v) => Math.max(0, Math.min(1, v));
    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(st(p - 0.1), 'rgba(255,255,255,0)');
    g.addColorStop(st(p - 0.02), 'rgba(235,246,255,0.5)');
    g.addColorStop(st(p), 'rgba(255,255,255,0.75)');
    g.addColorStop(st(p + 0.02), 'rgba(235,246,255,0.5)');
    g.addColorStop(st(p + 0.1), 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const diag = b.w * b.w + b.h * b.h;
    for (const gp of glints) {
      const u = (gp.x * b.w + gp.y * b.h) / diag;
      const k = Math.exp(-Math.pow((u - p) / 0.045, 2));
      if (k < 0.02) continue;
      const x = b.x + gp.x, y = b.y + gp.y, L = 0.55 * S * k;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const lg = ctx.createLinearGradient(x - dx * L, y - dy * L, x + dx * L, y + dy * L);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${0.9 * k})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = lg; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - dx * L, y - dy * L); ctx.lineTo(x + dx * L, y + dy * L); ctx.stroke();
      }
      const rg = ctx.createRadialGradient(x, y, 0, x, y, 0.16 * S);
      rg.addColorStop(0, `rgba(255,255,255,${0.8 * k})`); rg.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(x, y, 0.16 * S, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function toolRadius(kind) { return kind === 'face' ? faceR : nutR; }

  function drawLoadEvent(u) {
    // jaw opens, new blank slides in pushing the old plate, old plate drops away
    const open = u < 0.15 ? ease(seg(u, 0, 0.15)) : u > 0.86 ? 1 - ease(seg(u, 0.86, 1)) : 1;
    const slide = ease(seg(u, 0.15, 0.72));
    stock.dx = -(b.x + b.w + 40) * (1 - slide);
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
    drawFlare();
    BEZ.machine.drawFrontJaw(ctx, b, jaw, open);
    fx.step(ctx, dt);

    if (m && m.type === 'change') {
      drawCarouselEvent(m, clamp01((clock - m.t0) / m.dur));
    } else {
      const kind = TOOLS[tool].kind;
      const z = pos.z;
      if (m && m.type === 'rapid') {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(73,217,203,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx(pos.x), sy(pos.y)); ctx.lineTo(sx(m.to.x), sy(m.to.y)); ctx.stroke();
        ctx.setLineDash([]);
      }
      BEZ.machine.drawTool(ctx, kind, sx(pos.x), sy(pos.y), toolRadius(kind) * (1 + Math.max(0, z) * 0.12), spin, Math.max(0, z), 0);
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
      const k = cur && TOOLS[cur.tool] ? TOOLS[cur.tool].kind : null;
      spin += dt * override * (cur && cur.spindle ? (k === 'face' ? 14 : 30) : 0);
      m = advance(dt * override);
    }
    render(dt, light.x, light.y);
    updateReadouts(m);

    if (running && clock >= program.duration) {
      running = false;
      cycleBtn.disabled = false;
      lightLine(program.lines.length - 2);
      flareStart = now;
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

  function idle(finished) {
    // a raw blank in the vise (or the finished plate), last tool parked
    layout();
    if (finished) finishPlate(stock);
    running = false; cur = null; fx.clear(); flareStart = -1;
    tool = LAST_TOOL; pos = { x: tcIn.x, y: tcIn.y, z: HOME };
    cycleBtn.disabled = false;
    lightLine(0);
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
      if (Math.abs(w - lastW) < 2) return;   // phone toolbars hiding: ignore
      lastW = w;
      const wasDone = stock && !stock.fresh;
      idle(reduceMotion || wasDone);
      if (reduceMotion) still(); else wake();
    }, 180);
  });

  // fonts change the control band's height, so lay out once they're in
  let begun = false;
  const begin = () => {
    if (begun) return;
    begun = true;
    idle(reduceMotion);
    lastW = W;
    light.x = light.tx = W * 0.65; light.y = light.ty = H * 0.35;
    if (reduceMotion) {
      cycleBtn.hidden = true; feedBtn.hidden = true;
      still();
    } else {
      cycleBtn.classList.add('ready');
      wake();
    }
  };
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(begin);
    setTimeout(begin, 2500);    // don't wait forever on a slow font
  } else begin();
})(window.BEZ);
