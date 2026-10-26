// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Chips: curled aluminum thrown off a cutting edge along its path of travel.
// They fly fast, tumble, slow down, land, sit a moment and fade.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  BEZ.Effects = function ({ lowPower, max = 420 }) {
    let parts = [];

    return {
      get count() { return parts.length; },
      clear() { parts = []; },

      // one chip at (x, y) leaving along angle dir; size in px
      chip(x, y, dir, size, speed = 1) {
        if (lowPower && Math.random() < 0.5) return;
        const a = dir + (Math.random() - 0.5) * 0.35;
        const v = (220 + Math.random() * 320) * speed;
        parts.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: size * (0.55 + Math.random() * 0.7), rot: Math.random() * 6.28,
          vr: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 14),
          curl: 2.6 + Math.random() * 1.6, shade: 0.75 + Math.random() * 0.25,
          age: 0, rest: 0.5 + Math.random() * 0.6,
        });
        if (parts.length > max) parts.splice(0, parts.length - max);
      },

      step(ctx, dt) {
        const alive = [];
        for (const p of parts) {
          p.age += dt;
          const drag = Math.exp(-4.2 * dt);
          p.vx *= drag; p.vy *= drag; p.vr *= drag;
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          const moving = Math.hypot(p.vx, p.vy) > 12;
          if (!moving) p.rest -= dt;
          if (p.rest < -0.6) continue;              // landed, sat, faded
          const a = p.rest < 0 ? 1 + p.rest / 0.6 : 1;
          const c = Math.round(205 * p.shade + 40);
          ctx.strokeStyle = `rgba(${c},${c + 8},${c + 14},${0.95 * a})`;
          ctx.lineWidth = Math.max(1, p.r * 0.34);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, p.rot, p.rot + p.curl); ctx.stroke();
          // bright edge where the chip catches the light
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`;
          ctx.lineWidth = Math.max(0.6, p.r * 0.12);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, p.rot + 0.3, p.rot + p.curl * 0.55); ctx.stroke();
          alive.push(p);
        }
        parts = alive;
      },
    };
  };
})(window.BEZ);
