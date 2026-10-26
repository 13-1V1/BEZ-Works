// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// One aluminum blank as seen from above. Starts as saw-cut stock; the face
// mill reveals a face-milled finish under its cutter; etches are baked into
// layers drawn bottom-up (scribe, groove walls, groove floor) so a new cut
// never paints over an earlier one.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Deterministic little random so every blank looks the same
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Textures are built once per layout and shared by every blank
  BEZ.makeStockTextures = function (wPx, hPx, dpr, S, passes, faceR) {
    const W = Math.ceil(wPx * dpr), H = Math.ceil(hPx * dpr);
    const r = rng(1013);

    // saw-cut stock: matte, darker, straight saw marks, speckle
    const rough = makeCanvas(W, H);
    let g = rough.getContext('2d');
    g.scale(dpr, dpr);
    let grad = g.createLinearGradient(0, 0, wPx, hPx);
    grad.addColorStop(0, '#8b959c'); grad.addColorStop(1, '#737e86');
    g.fillStyle = grad; g.fillRect(0, 0, wPx, hPx);
    g.lineWidth = 1;
    for (let i = 0; i < 160; i++) {
      const y = r() * (hPx + wPx * 0.2) - wPx * 0.1;
      g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.04 + r() * 0.06})`;
      g.beginPath(); g.moveTo(0, y); g.lineTo(wPx, y + wPx * 0.08); g.stroke();
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
      g.fillRect(r() * wPx, r() * hPx, 1 + r(), 1 + r());
    }
    // broad, soft tonal drift like real plate stock
    for (let i = 0; i < 5; i++) {
      const cx = r() * wPx, cy = r() * hPx, rad = (0.3 + r() * 0.4) * wPx;
      const blot = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      blot.addColorStop(0, r() < 0.5 ? 'rgba(40,50,58,0.10)' : 'rgba(255,255,255,0.06)');
      blot.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = blot; g.fillRect(0, 0, wPx, hPx);
    }

    // face-milled finish: bright, with the cutter's sweeping arcs
    const faced = makeCanvas(W, H);
    g = faced.getContext('2d');
    g.scale(dpr, dpr);
    grad = g.createLinearGradient(0, 0, wPx, hPx);
    grad.addColorStop(0, '#d5dde3'); grad.addColorStop(0.55, '#bcc7cf'); grad.addColorStop(1, '#aab6bf');
    g.fillStyle = grad; g.fillRect(0, 0, wPx, hPx);
    g.save();
    g.beginPath(); g.rect(0, 0, wPx, hPx); g.clip();
    const step = Math.max(3, 0.05 * S);
    for (const py of passes) {
      for (let x = -faceR; x < wPx + faceR; x += step) {
        g.strokeStyle = r() < 0.55 ? `rgba(255,255,255,${0.05 + r() * 0.07})` : `rgba(40,55,68,${0.04 + r() * 0.05})`;
        g.lineWidth = 0.8;
        g.beginPath(); g.arc(x, py, faceR * 0.98, -Math.PI / 2, Math.PI / 2); g.stroke();
      }
    }
    g.restore();
    // the step-over seams between passes
    for (let i = 0; i < passes.length - 1; i++) {
      const y = (passes[i] + passes[i + 1]) / 2;
      g.fillStyle = 'rgba(40,55,68,0.06)';
      g.fillRect(0, y - 2, wPx, 4);
    }

    return { rough, faced, W, H };
  };

  BEZ.Stock = function (tex, wPx, hPx, dpr) {
    const layers = {};
    for (const k of ['surface', 'scribe', 'wallDark', 'wallLit', 'floor']) {
      const c = makeCanvas(tex.W, tex.H);
      const x = c.getContext('2d');
      x.scale(dpr, dpr);
      x.lineCap = 'round'; x.lineJoin = 'round';
      layers[k] = { c, x };
    }
    layers.surface.x.drawImage(tex.rough, 0, 0, wPx, hPx);

    return {
      layers, wPx, hPx,
      dx: 0, dy: 0, scale: 1, rot: 0, alpha: 1,   // placement (used when it's pushed off)

      // reveal the faced finish under a circle (cx, cy, r in block px)
      face(cx, cy, r) {
        const g = layers.surface.x;
        g.save();
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
        const x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
        const x1 = Math.min(wPx, cx + r), y1 = Math.min(hPx, cy + r);
        if (x1 > x0 && y1 > y0) {
          g.drawImage(tex.faced, x0 * dpr, y0 * dpr, (x1 - x0) * dpr, (y1 - y0) * dpr, x0, y0, x1 - x0, y1 - y0);
        }
        g.restore();
      },
      faceAll() { layers.surface.x.drawImage(tex.faced, 0, 0, wPx, hPx); },

      // light etch: a fine dark scribe line
      scribe(ax, ay, bx, by, w) {
        const g = layers.scribe.x;
        g.strokeStyle = 'rgba(52,64,74,0.85)';
        g.lineWidth = w;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      },

      // etched groove: shadowed upper-left wall, bright lower-right wall,
      // a darker floor with a faint reflection along it
      groove(ax, ay, bx, by, w) {
        const o = Math.max(0.8, w * 0.2);
        let g = layers.wallDark.x;
        g.strokeStyle = 'rgba(16,24,32,0.92)';
        g.lineWidth = w + o;
        g.beginPath(); g.moveTo(ax - o * 0.6, ay - o * 0.7); g.lineTo(bx - o * 0.6, by - o * 0.7); g.stroke();
        g = layers.wallLit.x;
        g.strokeStyle = '#ffffff';
        g.lineWidth = w + o;
        g.beginPath(); g.moveTo(ax + o * 0.6, ay + o * 0.7); g.lineTo(bx + o * 0.6, by + o * 0.7); g.stroke();
        g = layers.floor.x;
        g.strokeStyle = '#74828e';
        g.lineWidth = w;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.strokeStyle = 'rgba(225,236,244,0.45)';
        g.lineWidth = Math.max(0.6, w * 0.22);
        g.beginPath(); g.moveTo(ax + w * 0.18, ay + w * 0.2); g.lineTo(bx + w * 0.18, by + w * 0.2); g.stroke();
      },

      draw(ctx, x, y) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(x + this.dx + wPx / 2, y + this.dy + hPx / 2);
        ctx.rotate(this.rot);
        ctx.scale(this.scale, this.scale);
        ctx.translate(-wPx / 2, -hPx / 2);
        // drop shadow under the plate
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(4, 6, wPx, hPx);
        for (const k of ['surface', 'scribe', 'wallDark', 'wallLit', 'floor']) {
          ctx.drawImage(layers[k].c, 0, 0, wPx, hPx);
        }
        // broken edge: bright chamfer line on the near edges, dark on the far
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0.5, hPx - 0.5); ctx.lineTo(wPx - 0.5, hPx - 0.5); ctx.lineTo(wPx - 0.5, 0.5); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.moveTo(0.5, hPx - 0.5); ctx.lineTo(0.5, 0.5); ctx.lineTo(wPx - 0.5, 0.5); ctx.stroke();
        ctx.restore();
      },
    };
  };
})(window.BEZ);
