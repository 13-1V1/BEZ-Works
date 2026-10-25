// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Hero: plays the BEZ WORKS engraving program. A spinning tool follows the
// real G-code toolpath, the fresh cut glows white-hot and cools to bright
// aluminum, sparks and chips fly, the position readout and program listing
// track the tool, and a fly-cut plate underneath catches the light.
// "Cycle start" runs it again. Reduced motion = finished plate, no animation.

(function (BEZ) {
  'use strict';

  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;

  const surfaceCanvas = hero.querySelector('[data-surface]');
  const cutCanvas = hero.querySelector('[data-cut]');
  const ctx = cutCanvas.getContext('2d');
  const listing = hero.querySelector('[data-gcode]');
  const dro = {
    x: hero.querySelector('[data-x]'), y: hero.querySelector('[data-y]'),
    z: hero.querySelector('[data-z]'), f: hero.querySelector('[data-f]'),
  };
  const cycleBtn = hero.querySelector('[data-cycle]');

  const program = BEZ.toolpath.build();

  let surface = null;
  try { surface = BEZ.Surface(surfaceCanvas, { lowPower }); } catch (e) { console.warn('surface shader off:', e); }
  if (!surface) hero.classList.add('no-webgl');

  // ---------- program listing ----------
  listing.innerHTML = program.lines.map((l) => `<li>${l}</li>`).join('');
  const lineEls = [...listing.children];
  let litLine = -1;
  function lightLine(i) {
    if (i === litLine) return;
    if (lineEls[litLine]) lineEls[litLine].classList.remove('on');
    litLine = i;
    const el = lineEls[i];
    if (!el) return;
    el.classList.add('on');
    listing.style.setProperty('--shift', `${-(el.offsetTop - listing.clientHeight * 0.45)}px`);
  }

  // ---------- geometry ----------
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0, S = 1, X0 = 0, Y0 = 0, toolW = 6;
  // cooled engraving lives on three layers so each new bit of cut
  // never paints its shadow over metal that's already there
  const layers = ['shadow', 'metal', 'shine'].map(() => {
    const c = document.createElement('canvas');
    return { c, x: c.getContext('2d') };
  });
  const [shadowL, metalL, shineL] = layers;

  function layout() {
    const r = hero.getBoundingClientRect();
    W = r.width; H = r.height;
    cutCanvas.width = Math.round(W * dpr); cutCanvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const l of layers) {
      l.c.width = cutCanvas.width; l.c.height = cutCanvas.height;
      l.x.setTransform(dpr, 0, 0, dpr, 0, 0);
      l.x.lineCap = 'round';
    }
    const narrow = W < 700;
    S = Math.min((W * (narrow ? 0.88 : 0.74)) / program.width, H * 0.3);
    X0 = (W - program.width * S) / 2;
    Y0 = H * (narrow ? 0.34 : 0.44) + (program.height * S) / 2;
    toolW = Math.max(3, S * 0.065);
    if (surface) surface.resize(W, H);
  }
  const sx = (x) => X0 + x * S;
  const sy = (y) => Y0 - y * S;

  // ---------- heat colors: white-hot -> orange -> cooled aluminum ----------
  const RAMP = [
    [0.0, [255, 255, 250]], [0.12, [255, 228, 160]], [0.35, [255, 150, 60]],
    [0.75, [226, 86, 30]], [1.4, [205, 215, 224]],
  ];
  const HEAT_LIFE = 1.4;
  function heatColor(age, a = 1) {
    for (let i = 1; i < RAMP.length; i++) {
      if (age <= RAMP[i][0]) {
        const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
        const u = (age - t0) / (t1 - t0);
        const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * u));
        return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      }
    }
    return `rgba(205,215,224,${a})`;
  }

  // ---------- engraved look for cooled cuts ----------
  function bakeSeg(ax, ay, bx, by) {
    const sh = shadowL.x, me = metalL.x, hi = shineL.x;
    sh.strokeStyle = 'rgba(0,0,0,0.6)';
    sh.lineWidth = toolW + 2.5;
    sh.beginPath(); sh.moveTo(ax + 1.2, ay + 1.6); sh.lineTo(bx + 1.2, by + 1.6); sh.stroke();
    me.strokeStyle = '#c3ced8';
    me.lineWidth = toolW;
    me.beginPath(); me.moveTo(ax, ay); me.lineTo(bx, by); me.stroke();
    hi.strokeStyle = 'rgba(255,255,255,0.5)';
    hi.lineWidth = Math.max(1, toolW * 0.26);
    hi.beginPath(); hi.moveTo(ax - 0.7, ay - 0.9); hi.lineTo(bx - 0.7, by - 0.9); hi.stroke();
  }
  function clearBaked() { for (const l of layers) l.x.clearRect(0, 0, W, H); }

  // ---------- state ----------
  let hot = [];        // fresh cut segments {ax,ay,bx,by,t}
  let parts = [];      // sparks and chips
  let clock = 0;       // program time, seconds
  let running = false;
  let done = false;
  let last = null;     // last tool position in inches {x,y,z}
  let spin = 0;
  let now = 0;

  function reset() {
    hot = []; parts = []; clock = 0; last = null; done = false; litLine = -1;
    lineEls.forEach((el) => el.classList.remove('on'));
    clearBaked();
  }

  // Draw the whole program straight onto the plate (reduced motion / resize)
  function bakeAll() {
    clearBaked();
    for (const m of program.moves) {
      if (m.type !== 'line' && m.type !== 'arc') continue;
      const steps = Math.max(2, Math.ceil(m.len * 40));
      let p = BEZ.toolpath.at(m, 0);
      for (let i = 1; i <= steps; i++) {
        const q = BEZ.toolpath.at(m, i / steps);
        bakeSeg(sx(p.x), sy(p.y), sx(q.x), sy(q.y));
        p = q;
      }
    }
  }

  function moveAt(t) {
    const ms = program.moves;
    let lo = 0, hi = ms.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ms[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    return ms[lo];
  }

  function emit(x, y, cutting) {
    if (!cutting || reduceMotion) return;
    const n = lowPower ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 140 + Math.random() * 320;
      parts.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.4, age: 0 });
    }
    if (Math.random() < (lowPower ? 0.25 : 0.5)) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 140;
      parts.push({ k: 'chip', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9 + Math.random() * 0.8, age: 0,
        r: toolW * (0.5 + Math.random() * 0.7), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14 });
    }
    if (parts.length > 360) parts.splice(0, parts.length - 360);
  }

  function burst(x, y) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 520;
      parts.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.6, age: 0 });
    }
  }

  // Advance the program by dt seconds, laying down hot cut segments
  function advance(dt) {
    if (done) return null;
    const target = Math.min(clock + dt, program.duration);
    const step = 1 / 120;
    let pos = last;
    while (clock < target) {
      clock = Math.min(clock + step, target);
      const m = moveAt(clock);
      const u = Math.min(1, (clock - m.t0) / m.dur);
      const p = BEZ.toolpath.at(m, u);
      const cutting = (m.type === 'line' || m.type === 'arc');
      if (cutting && pos) hot.push({ ax: sx(pos.x), ay: sy(pos.y), bx: sx(p.x), by: sy(p.y), t: now });
      pos = p;
      lightLine(m.line);
      if (cutting && Math.random() < 0.35) emit(sx(p.x), sy(p.y), true);
    }
    last = pos;
    if (clock >= program.duration) done = true;
    return moveAt(clock);
  }

  function drawTool(p, m) {
    const x = sx(p.x), y = sy(p.y);
    const lift = Math.max(0, p.z - program.cutZ);               // inches above the cut
    const cutting = m && (m.type === 'line' || m.type === 'arc');
    const r = toolW * 1.6;

    // shadow drifts away as the tool rises
    const off = 6 + lift * 40;
    ctx.fillStyle = `rgba(0,0,0,${0.45 - Math.min(lift, 1) * 0.25})`;
    ctx.beginPath(); ctx.ellipse(x + off, y + off * 0.8, r * (1 + lift * 0.6), r * (1 + lift * 0.6), 0, 0, Math.PI * 2); ctx.fill();

    if (cutting) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.5);
      g.addColorStop(0, 'rgba(255,200,120,0.55)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    const body = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    body.addColorStop(0, '#f2f6f9');
    body.addColorStop(0.6, '#8b99a6');
    body.addColorStop(1, '#3b4852');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(20,30,40,0.85)';
    ctx.lineWidth = Math.max(1, r * 0.16);
    for (let k = 0; k < 2; k++) {
      const a = spin + k * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 0.9) * r * 0.7, y + Math.sin(a + 0.9) * r * 0.7, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }
  }

  function render(dt) {
    ctx.clearRect(0, 0, W, H);
    for (const l of layers) ctx.drawImage(l.c, 0, 0, W, H);

    // hot cut: glow + core, baked once it has cooled
    ctx.lineCap = 'round';
    const keep = [];
    for (const s of hot) {
      const age = (now - s.t) / 1000;
      if (age >= HEAT_LIFE) { bakeSeg(s.ax, s.ay, s.bx, s.by); continue; }
      keep.push(s);
    }
    hot = keep;
    ctx.globalCompositeOperation = 'lighter';
    for (const s of hot) {
      const age = (now - s.t) / 1000;
      const glow = Math.max(0, 1 - age / 0.9);
      if (glow > 0) {
        ctx.strokeStyle = heatColor(age, 0.22 * glow);
        ctx.lineWidth = toolW * 3.2;
        ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const s of hot) {
      const age = (now - s.t) / 1000;
      ctx.strokeStyle = heatColor(age);
      ctx.lineWidth = toolW;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
    }

    // sparks + chips
    const alive = [];
    for (const p of parts) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = p.k === 'spark' ? 2.2 : 3.5;
      p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      alive.push(p);
      const fade = 1 - p.age / p.life;
      if (p.k === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = heatColor(p.age * 1.4, fade);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        p.rot += p.vr * dt;
        ctx.strokeStyle = `rgba(210,220,228,${0.9 * fade})`;
        ctx.lineWidth = Math.max(1, toolW * 0.22);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, p.rot, p.rot + 3.6); ctx.stroke();
      }
    }
    parts = alive;

    // tool
    if (last && !done) {
      const m = moveAt(clock);
      if (m.type === 'rapid') {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(73,217,203,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx(last.x), sy(last.y)); ctx.lineTo(sx(m.to.x), sy(m.to.y)); ctx.stroke();
        ctx.setLineDash([]);
      }
      drawTool(last, m);
    }
  }

  function updateDro(m) {
    const p = last || { x: 0, y: 0, z: 1 };
    const f = (v) => (v < 0 ? '-' : ' ') + Math.abs(v).toFixed(4);
    dro.x.textContent = f(p.x);
    dro.y.textContent = f(p.y);
    dro.z.textContent = f(p.z);
    dro.f.textContent = !m || done ? '0.' : m.type === 'rapid' ? 'RAPID' : m.type === 'plunge' ? '10.' : '40.';
  }

  // ---------- light: follows the pointer, drifts when idle ----------
  const light = { x: 0, y: 0, tx: 0, ty: 0, user: false };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    light.tx = e.clientX - r.left; light.ty = e.clientY - r.top; light.user = true;
  });
  hero.addEventListener('pointerleave', () => { light.user = false; });
  hero.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a,button')) return;
    const r = hero.getBoundingClientRect();
    if (!reduceMotion) burst(e.clientX - r.left, e.clientY - r.top);
    wake();
  });

  // ---------- loop ----------
  let raf = 0, visible = true, prevT = 0, idleFrames = 0;
  function frame(t) {
    raf = 0;
    now = t;
    const dt = Math.min(0.05, prevT ? (t - prevT) / 1000 : 0.016);
    prevT = t;

    if (!light.user) {
      const a = t / 5200;
      light.tx = W * (0.5 + 0.32 * Math.cos(a)); light.ty = H * (0.42 + 0.22 * Math.sin(a * 1.3));
    }
    light.x += (light.tx - light.x) * Math.min(1, dt * 6);
    light.y += (light.ty - light.y) * Math.min(1, dt * 6);
    if (surface) surface.draw(light.x, light.y);

    spin += dt * 38;
    let m = null;
    if (running) m = advance(dt);
    render(dt);
    updateDro(m);

    if (done && running && !hot.length) {
      running = false;
      cycleBtn.disabled = false;
      lightLine(program.lines.length - 2);
    }
    idleFrames = (!running && !hot.length && !parts.length) ? idleFrames + 1 : 0;
    // keep the light moving while visible; stop entirely when off screen
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && visible && !document.hidden) { prevT = 0; raf = requestAnimationFrame(frame); } }

  function start() {
    reset();
    running = true;
    cycleBtn.disabled = true;
    wake();
  }

  cycleBtn.addEventListener('click', start);

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) wake();
  }, { threshold: 0.02 }).observe(hero);
  document.addEventListener('visibilitychange', wake);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const wasRunning = running;
      layout();
      if (!wasRunning) { bakeAll(); done = true; } else { start(); }
      if (reduceMotion && surface) surface.draw(W * 0.6, H * 0.3);
      wake();
    }, 150);
  });

  layout();
  light.x = light.tx = W * 0.65; light.y = light.ty = H * 0.3;
  if (reduceMotion) {
    bakeAll();
    done = true;
    last = { x: 0, y: 0, z: 1 };
    lightLine(program.lines.length - 2);
    if (surface) surface.draw(W * 0.62, H * 0.32);
    render(0);
    updateDro(null);
    cycleBtn.hidden = true;
  } else {
    setTimeout(start, 350);
  }
})(window.BEZ);
