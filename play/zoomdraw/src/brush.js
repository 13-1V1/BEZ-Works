/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * brush.js — Element rendering: pen/eraser strokes (opacity, dashes, soft
 * edges, and tips: round / flat calligraphy / square / star / spray), geometric
 * shapes, and raster fill images. Exposes ZD.drawStroke, which runs inside
 * whatever transform the caller has set.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var SHAPES = { line: 1, rect: 1, ellipse: 1 };

  function dashPattern(s) {
    var u = s.size;
    if (s.dash === 'dashed') return [u * 2.4, u * 1.8];
    if (s.dash === 'dotted') return [u * 0.001, u * 2.0];
    return null;
  }

  function hexToRgba(hex, a) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

  function drawStroke(ctx, s, ox, oy, cacheOK) {
    ox = ox || 0;
    oy = oy || 0;
    if (s.tool === 'fillimg') {
      if (!s.img) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (s.alpha == null ? 1 : s.alpha);
      ctx.drawImage(s.img, s.rect.x - ox, s.rect.y - oy, s.rect.w, s.rect.h);
      ctx.globalAlpha = 1;
      return;
    }
    var p = s.points;
    if (!p.length) return;
    // Expensive tips (spray/star/soft) are rasterised once and blitted while the
    // zoom holds — but only on the base pass (cacheOK); the loop mirror and GIF
    // run every stroke through many scales, so they always render direct.
    if (cacheOK && ZD.strokeCache && ZD.strokeCache.cacheable(s) &&
        ZD.strokeCache.draw(ctx, s, ox, oy, renderFreehandInto)) return;
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = (s.alpha == null ? 1 : s.alpha);
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.tool === 'eraser' ? '#000' : s.color;
    ctx.setLineDash(dashPattern(s) || []);

    if (SHAPES[s.tool]) drawShape(ctx, s, ox, oy);
    else drawFreehand(ctx, s, ox, oy);

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function drawShape(ctx, s, ox, oy) {
    var p = s.points;
    var a = p[0], b = p[p.length - 1];
    var ax = a.x - ox, ay = a.y - oy, bx = b.x - ox, by = b.y - oy;
    ctx.beginPath();
    if (s.tool === 'line') {
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    } else if (s.tool === 'rect') {
      ctx.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      if (s.fill) ctx.fill();
      ctx.stroke();
    } else {
      var rx = Math.abs(bx - ax) / 2, ry = Math.abs(by - ay) / 2;
      if (rx < 1e-9 || ry < 1e-9) return;
      ctx.ellipse((ax + bx) / 2, (ay + by) / 2, rx, ry, 0, 0, Math.PI * 2);
      if (s.fill) ctx.fill();
      ctx.stroke();
    }
  }

  function buildSmoothPath(ctx, p, ox, oy) {
    ctx.beginPath();
    ctx.moveTo(p[0].x - ox, p[0].y - oy);
    if (p.length === 2) { ctx.lineTo(p[1].x - ox, p[1].y - oy); return; }
    var i;
    for (i = 1; i < p.length - 2; i++) {
      ctx.quadraticCurveTo(p[i].x - ox, p[i].y - oy,
        (p[i].x + p[i + 1].x) / 2 - ox, (p[i].y + p[i + 1].y) / 2 - oy);
    }
    ctx.quadraticCurveTo(p[i].x - ox, p[i].y - oy, p[i + 1].x - ox, p[i + 1].y - oy);
  }

  // Stroke the current path. Hard = one crisp pass. Soft = many overlapping
  // passes from wide+faint to a solid core; the pass count scales with softness
  // so the gradient stays smooth (no visible steps). Widths are world units, so
  // softness scales with zoom.
  // Soft brush: render the stroke opaque into an offscreen buffer, Gaussian-blur
  // it, then composite. This gives a genuinely smooth edge (no stepping). The
  // blur radius is derived from the stroke's on-screen size via the live ctx
  // transform, so softness scales correctly with zoom and works in loop levels.
  function softBlurStroke(ctx, s, ox, oy) {
    var p = s.points, m = ctx.getTransform();
    var A = (s.alpha == null ? 1 : s.alpha), h = (s.hardness == null ? 1 : s.hardness);
    var scale = Math.sqrt(m.a * m.a + m.b * m.b);
    var swDev = s.size * scale;
    // Cap the on-screen blur. Uncapped it grows with zoom until the buffer needed
    // to hold it blows past the size limit and falls back to a crisp stroke — the
    // "soft line turns solid when you zoom in close" bug. Capped, the edge stays
    // soft at any zoom and the buffer stays bounded.
    var blur = Math.min((1 - h) * swDev * 0.6, 160);
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < p.length; i++) {
      var X = m.a * (p[i].x - ox) + m.c * (p[i].y - oy) + m.e;
      var Y = m.b * (p[i].x - ox) + m.d * (p[i].y - oy) + m.f;
      if (X < minX) minX = X; if (Y < minY) minY = Y;
      if (X > maxX) maxX = X; if (Y > maxY) maxY = Y;
    }
    // Two pads: `full` captures the whole stroke (half-width + blur bleed) when it
    // fits; `edge` is all that's needed past a viewport edge (just the blur — the
    // core there is already on-screen). Clamping the inner bound to `edge` keeps
    // the buffer ~viewport-sized even when the stroke is far wider than the view.
    var full = swDev / 2 + blur * 3 + 2, edge = blur * 3 + 2;
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    minX = Math.floor(Math.max(minX - full, -edge)); minY = Math.floor(Math.max(minY - full, -edge));
    maxX = Math.ceil(Math.min(maxX + full, cw + edge)); maxY = Math.ceil(Math.min(maxY + full, ch + edge));
    var bw = maxX - minX, bh = maxY - minY;
    if (bw <= 0 || bh <= 0) return; // entirely off-screen
    if (bw > 8192 || bh > 8192) {   // pathological only: crisp fallback (path built first)
      buildSmoothPath(ctx, p, ox, oy);
      ctx.globalAlpha = A; ctx.lineWidth = s.size; ctx.stroke(); return;
    }
    var off = document.createElement('canvas');
    off.width = bw; off.height = bh;
    var g = off.getContext('2d');
    g.setTransform(m.a, m.b, m.c, m.d, m.e - minX, m.f - minY);
    g.filter = 'blur(' + blur.toFixed(2) + 'px)';
    g.lineCap = (s.tip === 'square') ? 'square' : 'round';
    g.lineJoin = (s.tip === 'square') ? 'miter' : 'round';
    g.lineWidth = s.size;
    g.strokeStyle = s.color;
    buildSmoothPath(g, p, ox, oy);
    g.stroke();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = (s.tool === 'eraser') ? 'destination-out' : 'source-over';
    ctx.globalAlpha = A;
    ctx.drawImage(off, minX, minY);
    ctx.restore();
  }

  // Flat calligraphy nib at s.nibAngle degrees: a filled ribbon offset along a
  // fixed direction, so strokes across the nib are fat and along it are thin.
  function calligraphy(ctx, s, ox, oy) {
    var p = s.points, hw = s.size / 2;
    var ang = (s.nibAngle == null ? -40 : s.nibAngle) * Math.PI / 180;
    var nx = Math.cos(ang) * hw, ny = Math.sin(ang) * hw;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p[0].x - ox + nx, p[0].y - oy + ny);
    for (var i = 1; i < p.length; i++) ctx.lineTo(p[i].x - ox + nx, p[i].y - oy + ny);
    for (var j = p.length - 1; j >= 0; j--) ctx.lineTo(p[j].x - ox - nx, p[j].y - oy - ny);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(s.size * 0.06, 0.0001);
    ctx.stroke();
  }

  function softDot(ctx, s, ox, oy) {
    var x = s.points[0].x - ox, y = s.points[0].y - oy, r = Math.max(s.size / 2, 0.0001);
    var h = (s.hardness == null ? 1 : s.hardness);
    ctx.setLineDash([]);
    if (h < 0.99 && s.tool !== 'eraser') {
      var g = ctx.createRadialGradient(x, y, r * h, x, y, r);
      g.addColorStop(0, s.color);
      g.addColorStop(1, hexToRgba(s.color, 0));
      ctx.fillStyle = g;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clip a segment (in the ctx's coordinate space) to the visible device-pixel
  // rect (+margin) under transform m. Returns [d0, d1] in world units along the
  // segment, or null if fully off-screen. This lets star/spray skip the huge
  // off-screen span a long stroke covers when zoomed in — the old code stamped
  // every dot of it, so zooming in exploded the count into the tens of thousands.
  function visibleDRange(m, X0, Y0, ux, uy, len, cw, ch, mg) {
    var sx = m.a * X0 + m.c * Y0 + m.e, sy = m.b * X0 + m.d * Y0 + m.f;
    var vx = m.a * ux + m.c * uy, vy = m.b * ux + m.d * uy;
    var t0 = 0, t1 = len, P = [-vx, vx, -vy, vy], Q = [sx + mg, cw + mg - sx, sy + mg, ch + mg - sy];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(P[i]) < 1e-12) { if (Q[i] < 0) return null; continue; }
      var r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t0) t0 = r; } else { if (r < t1) t1 = r; }
    }
    return (t1 < t0) ? null : [t0, t1];
  }

  // Stamp a shape at even arc-length intervals along the path (for star/spray).
  // Stamps are indexed by absolute arc length, so each keeps a stable seed even
  // when culling skips the off-screen ones (the pattern doesn't shift as you pan).
  function stampAlong(ctx, s, ox, oy, stampFn) {
    var p = s.points, size = s.size, step = Math.max(size * 0.5, 1e-9);
    ctx.setLineDash([]);
    ctx.globalAlpha = (s.alpha == null ? 1 : s.alpha);
    if (p.length === 1) { stampFn(ctx, p[0].x - ox, p[0].y - oy, size, 0); ctx.globalAlpha = 1; return; }
    var m = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height;
    var mg = size * Math.sqrt(m.a * m.a + m.b * m.b) + 2; // ~one stamp radius of slack
    var L = 0;
    for (var i = 0; i < p.length - 1; i++) {
      var ax = p[i].x, ay = p[i].y, dx = p[i + 1].x - ax, dy = p[i + 1].y - ay;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-12) continue;
      var ux = dx / len, uy = dy / len;
      var rng = visibleDRange(m, ax - ox, ay - oy, ux, uy, len, cw, ch, mg);
      if (rng) {
        var n0 = Math.ceil((L + rng[0]) / step), n1 = Math.floor((L + rng[1]) / step);
        for (var n = n0; n <= n1; n++) {
          var d = n * step - L;
          stampFn(ctx, ax + ux * d - ox, ay + uy * d - oy, size, n);
        }
      }
      L += len;
    }
    ctx.globalAlpha = 1;
  }

  function drawStar(ctx, x, y, size) {
    var R = size / 2, r = R * 0.45, n = 5;
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = (i * Math.PI / n) - Math.PI / 2, rad = (i % 2 === 0) ? R : r;
      var px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawSpray(ctx, x, y, size, seed) {
    var R = size / 2, dotR = Math.max(size * 0.06, 0.0001);
    for (var k = 0; k < 8; k++) {
      var a = hash(seed * 8 + k) * 6.2832, rad = Math.sqrt(hash(seed * 8 + k + 991)) * R;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rad, y + Math.sin(a) * rad, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFreehand(ctx, s, ox, oy) {
    var p = s.points, tip = s.tip || 'round', pen = s.tool !== 'eraser';
    if (tip === 'flat' && pen && p.length >= 2) { calligraphy(ctx, s, ox, oy); return; }
    if (tip === 'star' && pen) { stampAlong(ctx, s, ox, oy, drawStar); return; }
    if (tip === 'spray' && pen) { stampAlong(ctx, s, ox, oy, drawSpray); return; }
    if (p.length === 1) { softDot(ctx, s, ox, oy); return; }
    var h = (s.hardness == null ? 1 : s.hardness);
    if (h < 0.99) { softBlurStroke(ctx, s, ox, oy); return; }
    if (tip === 'square') { ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; }
    buildSmoothPath(ctx, p, ox, oy);
    ctx.globalAlpha = (s.alpha == null ? 1 : s.alpha);
    ctx.lineWidth = s.size;
    ctx.stroke();
  }

  // Paint a freehand stroke into g at g's current transform (absolute world
  // coords). The per-stroke cache (cache.js) calls this to fill a stroke bitmap.
  function renderFreehandInto(g, s) {
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = (s.alpha == null ? 1 : s.alpha);
    g.lineWidth = s.size; g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = s.color; g.fillStyle = s.color; g.setLineDash([]);
    drawFreehand(g, s, 0, 0);
    g.globalAlpha = 1;
  }

  ZD.drawStroke = drawStroke;
  ZD.SHAPES = SHAPES;
})(window.ZoomDraw);
