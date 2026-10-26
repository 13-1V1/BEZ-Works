// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Drawing helpers for the machine: the vise, each tool as seen from above
// (face mill with inserts, 90° engraver, end mill in a collet nut), and the
// tool carousel that swings in for a tool change.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const TAU = Math.PI * 2;

  function steel(ctx, x, y, w, h, light) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, light ? '#4f5f6c' : '#34424d');
    g.addColorStop(1, light ? '#2b3640' : '#1d262e');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  // Vise: body under the plate, fixed jaw behind (top), moving jaw in front.
  // open = 0..1 slides the front jaw toward the viewer.
  function drawVise(ctx, b, jaw, open) {
    const bodyX = b.x - b.w * 0.08, bodyW = b.w * 1.16;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bodyX + 8, b.y - jaw * 1.1 + 12, bodyW, b.h + jaw * 2.4 + open * jaw);
    steel(ctx, bodyX, b.y - jaw * 1.1, bodyW, b.h + jaw * 2.4 + open * jaw, false);
    // ground ways
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(bodyX, b.y + b.h * 0.25, bodyW, 3);
    ctx.fillRect(bodyX, b.y + b.h * 0.72, bodyW, 3);
    // fixed jaw
    steel(ctx, b.x - b.w * 0.04, b.y - jaw, b.w * 1.08, jaw, true);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x - b.w * 0.04, b.y - jaw, b.w * 1.08, 1.5);
  }

  function drawFrontJaw(ctx, b, jaw, open) {
    const y = b.y + b.h + open * jaw;
    steel(ctx, b.x - b.w * 0.04, y, b.w * 1.08, jaw, true);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x - b.w * 0.04, y, b.w * 1.08, 1.5);
    // jaw screws
    ctx.fillStyle = '#151c22';
    for (const f of [0.22, 0.78]) {
      ctx.beginPath(); ctx.arc(b.x + b.w * f, y + jaw / 2, jaw * 0.18, 0, TAU); ctx.fill();
    }
  }

  // --- tools (cx, cy = spindle center on screen; scale grows as Z rises) ---

  function shadow(ctx, x, y, r, lift) {
    const off = 5 + lift * 9;
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0.14, 0.4 - lift * 0.1)})`;
    ctx.beginPath(); ctx.arc(x + off, y + off * 0.8, r * (1 + lift * 0.08), 0, TAU); ctx.fill();
  }

  function colletNut(ctx, x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#eef3f6'); g.addColorStop(0.55, '#8d9aa5'); g.addColorStop(1, '#3a4651');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,28,36,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.stroke();
  }

  function faceMill(ctx, x, y, r, spin) {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#9aa8b4'); g.addColorStop(0.7, '#4e5c68'); g.addColorStop(1, '#2a343d');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    // five gold-coated inserts
    for (let k = 0; k < 5; k++) {
      const a = spin + k * TAU / 5;
      const ix = x + Math.cos(a) * r * 0.84, iy = y + Math.sin(a) * r * 0.84;
      ctx.save();
      ctx.translate(ix, iy); ctx.rotate(a + 0.6);
      ctx.fillStyle = '#d9a640';
      ctx.fillRect(-r * 0.11, -r * 0.08, r * 0.22, r * 0.16);
      ctx.fillStyle = 'rgba(255,240,190,0.6)';
      ctx.fillRect(-r * 0.11, -r * 0.08, r * 0.22, r * 0.04);
      ctx.restore();
      // chip gullet
      ctx.fillStyle = 'rgba(15,20,26,0.65)';
      ctx.beginPath(); ctx.arc(x + Math.cos(a - 0.32) * r * 0.74, y + Math.sin(a - 0.32) * r * 0.74, r * 0.1, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#1f2830';
    ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5f6d79';
    ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU); ctx.fill();
  }

  function engraver(ctx, x, y, r, spin) {
    colletNut(ctx, x, y, r);
    // conical tip seen end-on: bright cone with a flat
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.42);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#7c8995');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(25,35,45,0.75)'; ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(spin) * r * 0.42, y + Math.sin(spin) * r * 0.42); ctx.stroke();
  }

  // V-bit seen end-on: a faceted cone that narrows to the tip
  function vbit(ctx, x, y, r, spin) {
    colletNut(ctx, x, y, r);
    const c = r * 0.52;
    for (let k = 0; k < 2; k++) {
      const a = spin + k * Math.PI;
      ctx.fillStyle = k ? '#7b8895' : '#e9eff3';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, c, a, a + Math.PI); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * 0.07), 0, TAU); ctx.fill();
  }

  function endMill(ctx, x, y, r, spin) {
    colletNut(ctx, x, y, r);
    ctx.fillStyle = '#c9d3da';
    ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,30,40,0.85)'; ctx.lineWidth = Math.max(1, r * 0.1);
    for (let k = 0; k < 2; k++) {
      const a = spin + k * Math.PI;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 0.9) * r * 0.3, y + Math.sin(a + 0.9) * r * 0.3, x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42);
      ctx.stroke();
    }
  }

  // tool.kind, screen radius r, lift (inches above the plate, for the shadow)
  function drawTool(ctx, kind, x, y, r, spin, lift, glow) {
    shadow(ctx, x, y, r, lift);
    if (glow) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, `rgba(255,200,120,${0.5 * glow})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 4, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (kind === 'face') faceMill(ctx, x, y, r, spin);
    else if (kind === 'engraver') engraver(ctx, x, y, r, spin);
    else if (kind === 'vbit') vbit(ctx, x, y, r, spin);
    else endMill(ctx, x, y, r, spin);
  }

  // --- tool carousel ---
  // pockets: array of tool kinds (or null) by pocket number 1..n
  // angle: rotation so that pocket p sits at the pickup point (leftmost)
  function drawCarousel(ctx, cx, cy, R, angle, pockets, skip, toolR) {
    const n = pockets.length;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.arc(cx + 10, cy + 12, R * 1.12, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.2, cx, cy, R * 1.12);
    g.addColorStop(0, '#3e4d59'); g.addColorStop(1, '#18212a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(73,217,203,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#121a21';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, TAU); ctx.fill();

    for (let p = 0; p < n; p++) {
      const a = Math.PI + (p * TAU) / n - angle;     // pocket p+1 at the left when angle = p*TAU/n
      const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
      ctx.fillStyle = '#0d1318';
      ctx.beginPath(); ctx.arc(px, py, toolR * 1.25, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(217,225,231,0.55)';
      ctx.font = `${Math.max(9, toolR * 0.55)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p + 1), cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66);
      if (pockets[p] && p !== skip) drawTool(ctx, pockets[p], px, py, toolR, a, 0, 0);
    }
  }

  BEZ.machine = { drawVise, drawFrontJaw, drawTool, drawCarousel };
})(window.BEZ);
