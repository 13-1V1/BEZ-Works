// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Particles: sparks (hot streaks), chips (curled aluminum), coolant (teal
// spray from the nozzle that splashes at the tool). Plus the heat color ramp
// used for fresh cuts: white-hot -> orange -> cooled metal.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const RAMP = [
    [0.0, [255, 255, 250]], [0.12, [255, 228, 160]], [0.35, [255, 150, 60]],
    [0.75, [226, 86, 30]], [1.4, [150, 160, 170]],
  ];

  function heat(age, a = 1) {
    for (let i = 1; i < RAMP.length; i++) {
      if (age <= RAMP[i][0]) {
        const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
        const u = (age - t0) / (t1 - t0);
        const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * u));
        return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      }
    }
    return `rgba(150,160,170,${a})`;
  }

  BEZ.Effects = function ({ lowPower, max = 420 }) {
    let parts = [];
    const keep = () => { if (parts.length > max) parts.splice(0, parts.length - max); };

    return {
      get count() { return parts.length; },
      clear() { parts = []; },

      sparks(x, y, n, speed = 1) {
        n = lowPower ? Math.ceil(n / 2) : n;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, v = (140 + Math.random() * 320) * speed;
          parts.push({ k: 's', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.4, age: 0 });
        }
        keep();
      },

      // chips leave a cutter tangentially; dir = cutting direction angle
      chips(x, y, n, size, dir) {
        n = lowPower ? Math.ceil(n / 2) : n;
        for (let i = 0; i < n; i++) {
          const a = dir + (Math.random() - 0.5) * 1.6, v = 80 + Math.random() * 260;
          parts.push({ k: 'c', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8 + Math.random() * 1.1, age: 0,
            r: size * (0.5 + Math.random() * 0.8), rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 16 });
        }
        keep();
      },

      // coolant: from nozzle (nx, ny) aimed at (tx, ty)
      coolant(nx, ny, tx, ty) {
        const n = lowPower ? 2 : 4;
        const base = Math.atan2(ty - ny, tx - nx), d = Math.hypot(tx - nx, ty - ny);
        for (let i = 0; i < n; i++) {
          const a = base + (Math.random() - 0.5) * 0.12, v = d * (2.2 + Math.random() * 0.6);
          parts.push({ k: 'w', x: nx, y: ny, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.42 + Math.random() * 0.06, age: 0, tx, ty });
        }
        keep();
      },

      step(ctx, dt) {
        const alive = [];
        for (const p of parts) {
          p.age += dt;
          if (p.age >= p.life) continue;
          const fade = 1 - p.age / p.life;
          if (p.k === 's') {
            p.vx *= Math.exp(-2.2 * dt); p.vy *= Math.exp(-2.2 * dt);
            p.x += p.vx * dt; p.y += p.vy * dt;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = heat(p.age * 1.4, fade);
            ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
          } else if (p.k === 'c') {
            p.vx *= Math.exp(-3.2 * dt); p.vy *= Math.exp(-3.2 * dt);
            p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
            ctx.strokeStyle = `rgba(222,230,236,${0.95 * Math.min(1, fade * 2)})`;
            ctx.lineWidth = Math.max(1, p.r * 0.32);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, p.rot, p.rot + 3.8); ctx.stroke();
          } else {
            // coolant drop: flies to the tool, then splashes outward
            if (!p.splashed && Math.hypot(p.tx - p.x, p.ty - p.y) < 14) {
              p.splashed = true;
              const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
              p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
            }
            p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.splashed) { p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt); }
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(73,217,203,${0.5 * fade})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.splashed ? 1.6 : 2.2, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          alive.push(p);
        }
        parts = alive;
      },
    };
  };

  BEZ.heat = heat;
})(window.BEZ);
