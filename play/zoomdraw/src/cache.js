/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * cache.js — Per-stroke raster cache for the expensive tips (spray / star / soft
 * edges). Re-rasterising those from vectors on every frame is what made a canvas
 * full of them chug when panned. Once committed, a stroke is rendered to a small
 * world-anchored bitmap and blitted thereafter, so panning is just drawImage. The
 * bitmap is re-rendered only when the zoom drifts far enough to matter, so it
 * never noticeably softens. Used ONLY on the base drawing pass — never the loop
 * mirror or GIF, which run every stroke through many scales.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var CAP = 512;          // max simultaneous cached strokes
  var MAX_AREA = 1500000; // ~1225x1225 device px; bigger strokes render direct
  var list = [];          // strokes currently holding a bitmap
  var frame = 0;          // bumped once per base pass; marks which caches are "hot"

  // A new base render pass starts. Caches touched since the last call are "hot"
  // and won't be evicted this frame (so a full-viewport scene never thrashes).
  function beginFrame() { frame++; }

  // Which strokes are worth caching. Erasers are excluded — they composite with
  // destination-out and a blitted bitmap would paint instead of erase.
  function cacheable(s) {
    if (s.tool !== 'pen') return false;
    if (s.tip === 'spray' || s.tip === 'star') return s.points.length >= 1;
    return s.hardness != null && s.hardness < 0.99 && s.points.length >= 2; // soft
  }

  // Make room for one more bitmap. Evicts the oldest cache NOT used this frame;
  // returns false if every cache is hot (caller then renders direct, no thrash).
  function makeRoom() {
    if (list.length < CAP) return true;
    for (var i = 0; i < list.length; i++) {
      if (list[i]._cf !== frame) { list.splice(i, 1)[0]._cache = null; return true; }
    }
    return false;
  }

  // Build (or rebuild) the bitmap for s at the given device-px scale. renderInto
  // (from brush.js) paints the stroke into it at absolute world coords. Returns
  // false if the stroke can't be cached (too big, or cache full of hot strokes).
  function build(s, scale, renderInto) {
    var p = s.points, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i;
    for (i = 0; i < p.length; i++) {
      if (p[i].x < minX) minX = p[i].x; if (p[i].y < minY) minY = p[i].y;
      if (p[i].x > maxX) maxX = p[i].x; if (p[i].y > maxY) maxY = p[i].y;
    }
    var soft = s.tip !== 'spray' && s.tip !== 'star';
    var blurDev = soft ? Math.min((1 - s.hardness) * s.size * scale * 0.6, 160) : 0;
    var padW = s.size / 2 + (blurDev * 3 + 2) / scale;         // pad in world units
    minX -= padW; minY -= padW; maxX += padW; maxY += padW;
    var bw = Math.ceil((maxX - minX) * scale), bh = Math.ceil((maxY - minY) * scale);
    if (bw <= 0 || bh <= 0 || bw * bh > MAX_AREA) return false;
    if (!s._cache && !makeRoom()) return false;
    var off = document.createElement('canvas');
    off.width = bw; off.height = bh;
    var g = off.getContext('2d');
    g.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
    renderInto(g, s);
    if (!s._cache) list.push(s);
    s._cache = off; s._cs = scale; s._wx = minX; s._wy = minY;
    return true;
  }

  // Draw s via its cache under ctx's current transform. Returns true if handled,
  // false to tell the caller to render it directly instead.
  function draw(ctx, s, ox, oy, renderInto) {
    var m = ctx.getTransform();
    var scale = Math.sqrt(m.a * m.a + m.b * m.b);
    if (!scale || !isFinite(scale)) return false;
    var k = s._cache ? scale / s._cs : 0;
    if (!s._cache || k < 0.8 || k > 1.25) {                    // missing / zoom drifted
      if (!build(s, scale, renderInto)) return false;
      k = 1;
    }
    s._cf = frame;                                             // mark hot
    var c = s._cache;
    var sx = m.a * (s._wx - ox) + m.c * (s._wy - oy) + m.e;    // origin cancels out
    var sy = m.b * (s._wx - ox) + m.d * (s._wy - oy) + m.f;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;                                       // alpha is baked in
    if (k > 0.999 && k < 1.001) {
      ctx.imageSmoothingEnabled = false;                      // exact 1:1 copy (no dot fattening)
      ctx.drawImage(c, Math.round(sx), Math.round(sy));
    } else {
      ctx.drawImage(c, sx, sy, c.width * k, c.height * k);
    }
    ctx.restore();
    return true;
  }

  ZD.strokeCache = { cacheable: cacheable, draw: draw, beginFrame: beginFrame };
})(window.ZoomDraw);
