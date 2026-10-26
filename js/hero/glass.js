// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Machine-enclosure look: you're watching through the door window. A painted
// steel frame with a rubber gasket, a faint tint, reflections that shift a
// little with the pointer, and a few drips running down the glass.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  BEZ.Glass = function () {
    let W = 0, H = 0, drops = [], runs = [];
    const rnd = (a, b) => a + Math.random() * (b - a);

    function resize(w, h) {
      W = w; H = h;
      drops = Array.from({ length: Math.round((W * H) / 16000) }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.2, 3.6) }));
      runs = Array.from({ length: 5 }, () => newRun(true));
    }

    function newRun(anywhere) {
      return { x: rnd(W * 0.05, W * 0.95), y: anywhere ? rnd(0, H) : -10, v: rnd(18, 55), r: rnd(2.2, 3.6), trail: [], wob: rnd(0, 6) };
    }

    function drop(ctx, x, y, r) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.45, r, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.4, 'rgba(200,225,235,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0.03)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    function draw(ctx, dt, lx, ly) {
      // tint
      ctx.fillStyle = 'rgba(120,170,185,0.05)';
      ctx.fillRect(0, 0, W, H);

      // reflections: broad soft streak + a thin sharp one, drifting against the pointer
      const px = (lx / W - 0.5) * -40, py = (ly / H - 0.5) * -20;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const [x0, wid, a] of [[0.18, 0.22, 0.07], [0.46, 0.035, 0.12], [0.52, 0.012, 0.16]]) {
        const cx = W * x0 + px;
        const g = ctx.createLinearGradient(cx - W * wid, 0, cx + W * wid, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(220,240,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - W * wid + H * 0.35 + py, 0); ctx.lineTo(cx + W * wid + H * 0.35 + py, 0);
        ctx.lineTo(cx + W * wid - H * 0.35 + py, H); ctx.lineTo(cx - W * wid - H * 0.35 + py, H);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // still droplets
      for (const d of drops) drop(ctx, d.x, d.y, d.r);

      // running drips with wet trails
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        r.y += r.v * dt;
        r.x += Math.sin(r.y * 0.03 + r.wob) * 0.15;
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 140) r.trail.shift();
        ctx.strokeStyle = 'rgba(210,235,245,0.08)';
        ctx.lineWidth = r.r * 1.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        r.trail.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        drop(ctx, r.x, r.y, r.r);
        if (r.y > H + 20) runs[i] = newRun(false);
      }

      // door frame: painted steel, rubber gasket, rounded window opening
      const t = Math.max(14, Math.min(W, H) * 0.028), rad = t * 1.6;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.roundRect(t, t, W - t * 2, H - t * 2, rad);
      ctx.fillStyle = '#1b2833';
      ctx.fill('evenodd');
      ctx.strokeStyle = '#05080b'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(t, t, W - t * 2, H - t * 2, rad); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(t - 3, t - 3, W - t * 2 + 6, H - t * 2 + 6, rad + 3); ctx.stroke();
      ctx.fillStyle = '#0b1117';
      for (const [x, y] of [[t / 2, t / 2], [W - t / 2, t / 2], [t / 2, H - t / 2], [W - t / 2, H - t / 2]]) {
        ctx.beginPath(); ctx.arc(x, y, t * 0.18, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    return { resize, draw };
  };
})(window.BEZ);
