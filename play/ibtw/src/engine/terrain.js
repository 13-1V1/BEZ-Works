// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// terrain.js -- the "two-picture trick" (how the original Worms did destructible
// ground):
//   1) a VISIBLE canvas the player sees (dirt fill + grass strip), and
//   2) a hidden COLLISION MASK: solid pixel = ground, empty = air.
// Both are the same width/height. All physics reads the mask; the visible layer
// is only ever drawn to (never read), so drawing file:// tile images onto it
// can't taint anything we sample.
//
// Public API:
//   Terrain(w, h) -> instance
//   .generate()               build random hills into both layers
//   .isSolid(x, y)            true if that world pixel is ground
//   .surfaceY(x, fromY)       first solid y at/below fromY (null if none)
//   .solidTop(x, top, bot)    topmost solid y in a band (null if none)
//   .explodeAt(x, y, r)       carve a crater in mask + visible layer
//   .draw(ctx, camera)        blit the visible layer under the camera

(function (G) {
  "use strict";

  var SOLID = 200;   // alpha threshold for "this pixel is ground"

  function Terrain(w, h) {
    this.w = w | 0;
    this.h = h | 0;

    // visible layer (what the player sees)
    this.vis = document.createElement("canvas");
    this.vis.width = this.w; this.vis.height = this.h;
    this.vctx = this.vis.getContext("2d");

    // mask layer -- generated from shapes only (never from cross-origin images),
    // so getImageData stays clean/readable.
    this.mask = document.createElement("canvas");
    this.mask.width = this.w; this.mask.height = this.h;
    this.mctx = this.mask.getContext("2d");

    this.maskData = null; // Uint8ClampedArray RGBA; we read/write the ALPHA channel
  }

  // Build a Worms-style outline with real variety: midpoint displacement
  // (fractal hills) + a per-match map style (rolling / highlands / valley /
  // canyon with sharp cliff steps). Sine-wave hills were too flat.
  Terrain.prototype._heightmap = function () {
    var W = this.w, H = this.h;

    var styles = ["rolling", "highlands", "valley", "canyon"];
    var style = styles[(Math.random() * styles.length) | 0];
    this.style = style;
    var cfg = {
      rolling:   { amp: 0.20, rough: 0.50, base: 0.58 }, // gentle classic hills
      highlands: { amp: 0.33, rough: 0.60, base: 0.52 }, // big jagged peaks
      valley:    { amp: 0.20, rough: 0.52, base: 0.50 }, // high edges, deep middle
      canyon:    { amp: 0.22, rough: 0.55, base: 0.55 }, // hills + sheer cliff steps
    }[style];

    // --- midpoint displacement on 2^k+1 control points ---
    var k = 8, n = (1 << k) + 1;
    var pts = new Float32Array(n);
    pts[0] = Math.random() - 0.5;
    pts[n - 1] = Math.random() - 0.5;
    var step = n - 1, disp = 1;
    while (step > 1) {
      var half = step / 2;
      for (var i = half; i < n; i += step) {
        pts[i] = (pts[i - half] + pts[i + half]) / 2 + (Math.random() * 2 - 1) * disp;
      }
      step = half;
      disp *= cfg.rough; // less displacement at finer scales = natural fractal
    }
    // normalize control points to -1..1
    var mn = Infinity, mx = -Infinity;
    for (var j = 0; j < n; j++) { if (pts[j] < mn) mn = pts[j]; if (pts[j] > mx) mx = pts[j]; }

    // --- resample to one height per world column ---
    var hm = new Float32Array(W);
    for (var x = 0; x < W; x++) {
      var t = x / (W - 1) * (n - 1);
      var i0 = t | 0, f = t - i0;
      var v = pts[i0] * (1 - f) + pts[Math.min(n - 1, i0 + 1)] * f;
      v = (v - mn) / (mx - mn) * 2 - 1;
      hm[x] = H * cfg.base + v * H * cfg.amp;
    }

    // --- style shaping ---
    if (style === "valley") {
      // dish: raise the edges, sink the middle (y grows downward)
      for (var xv = 0; xv < W; xv++) {
        var u = xv / (W - 1) * 2 - 1;
        hm[xv] += (0.5 - u * u) * H * 0.20;
      }
    }
    if (style === "canyon") {
      // 1-2 sharp cliff steps (sigmoid = near-vertical wall ~12px wide)
      var stepsN = 1 + ((Math.random() * 2) | 0);
      for (var s = 0; s < stepsN; s++) {
        var cx = W * (0.25 + Math.random() * 0.5);
        var dh = (Math.random() < 0.5 ? -1 : 1) * H * (0.14 + Math.random() * 0.10);
        for (var xc = 0; xc < W; xc++) {
          hm[xc] += dh / (1 + Math.exp(-(xc - cx) / 6));
        }
      }
    }

    // clamp (headroom above, floor below) + tiny 3-tap smooth to kill 1px spikes
    for (var xm = 0; xm < W; xm++) hm[xm] = Math.max(H * 0.16, Math.min(H * 0.93, hm[xm]));
    var sm = new Float32Array(W);
    for (var xs = 0; xs < W; xs++) {
      var a = hm[Math.max(0, xs - 1)], b = hm[xs], c = hm[Math.min(W - 1, xs + 1)];
      sm[xs] = (a + b * 2 + c) / 4;
    }
    return sm;
  };

  Terrain.prototype.generate = function () {
    var W = this.w, H = this.h;
    var hm = this._heightmap();
    this.heightmap = hm;

    // ---- MASK: fill everything below the outline as solid (opaque) ----
    var m = this.mctx;
    m.clearRect(0, 0, W, H);
    m.fillStyle = "#fff";
    m.beginPath();
    m.moveTo(0, H);
    for (var x = 0; x < W; x++) m.lineTo(x, hm[x]);
    m.lineTo(W, H);
    m.closePath();
    m.fill();
    this.maskData = m.getImageData(0, 0, W, H).data;

    // ---- VISIBLE: forest-floor soil, topped with a grass strip ----
    // Dirt + grass tiles were sliced from Fantasy_Forest_Tileset_v2 (earthy
    // olive-brown soil + mossy grass), so the ground matches the forest bg.
    var v = this.vctx;
    v.clearRect(0, 0, W, H);

    var dirtImg = G.Assets.get("dirt_forest") || G.Assets.get("dirt_tile");
    var fill = "#4a4423";
    if (dirtImg) {
      // shrink the tile so more repeats fit on screen (finer soil texture)
      var ds = 0.6;
      var dc = document.createElement("canvas");
      dc.width = Math.max(1, Math.round(dirtImg.width * ds));
      dc.height = Math.max(1, Math.round(dirtImg.height * ds));
      var dctx = dc.getContext("2d");
      dctx.imageSmoothingEnabled = false;
      dctx.drawImage(dirtImg, 0, 0, dc.width, dc.height);
      fill = v.createPattern(dc, "repeat");
    }
    var grassImg = G.Assets.get("grass_forest");
    var grassPat = grassImg ? v.createPattern(grassImg, "repeat") : null;

    v.save();
    v.beginPath();
    v.moveTo(0, H);
    for (var x2 = 0; x2 < W; x2++) v.lineTo(x2, hm[x2]);
    v.lineTo(W, H);
    v.closePath();
    v.clip();

    // base soil
    v.fillStyle = fill;
    v.fillRect(0, 0, W, H);

    // warm it toward soil-brown (the sliced tile reads a touch olive on its own)
    v.fillStyle = "rgba(74,46,24,0.34)";
    v.fillRect(0, 0, W, H);

    // TEXTURE: dark earth clumps + light pebbles so it isn't a flat repeat
    for (var b = 0; b < (W * H) / 22000; b++) {
      var bx = Math.random() * W, by = H * (0.28 + Math.random() * 0.72);
      var br = 30 + Math.random() * 80;
      v.fillStyle = "rgba(30,20,10,0.30)";
      v.beginPath(); v.ellipse(bx, by, br, br * 0.55, 0, 0, Math.PI * 2); v.fill();
    }
    for (var rk = 0; rk < (W * H) / 40000; rk++) {
      var rx = Math.random() * W, ry = H * (0.25 + Math.random() * 0.72);
      var rr = 4 + Math.random() * 9;
      v.fillStyle = "rgba(16,11,7,0.5)";
      v.beginPath(); v.ellipse(rx, ry, rr, rr * 0.7, 0, 0, Math.PI * 2); v.fill();
      v.fillStyle = "rgba(150,125,85,0.22)";
      v.beginPath(); v.ellipse(rx - rr * 0.3, ry - rr * 0.3, rr * 0.4, rr * 0.3, 0, 0, Math.PI * 2); v.fill();
    }

    // depth gradient (darker deeper down)
    var grad = v.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.52)");
    v.fillStyle = grad;
    v.fillRect(0, 0, W, H);
    v.restore();

    // GRASS STRIP: stroke the surface curve with the mossy grass tile as a
    // pattern, so real grass texture follows the terrain outline.
    v.lineJoin = "round";
    v.lineCap = "round";
    if (grassPat) {
      v.lineWidth = 13;
      v.strokeStyle = grassPat;
      v.beginPath();
      v.moveTo(0, hm[0] - 2);
      for (var x3 = 1; x3 < W; x3++) v.lineTo(x3, hm[x3] - 2);
      v.stroke();
    }
    // bright rim highlight so the top edge reads crisply
    v.lineWidth = 2.5;
    v.strokeStyle = "rgba(120,170,80,0.85)";
    v.beginPath();
    v.moveTo(0, hm[0] - 6);
    for (var x4 = 1; x4 < W; x4++) v.lineTo(x4, hm[x4] - 6);
    v.stroke();

    this._scatterDecorations();
  };

  // Place trees/bushes/grass/flowers along the surface. Stored as {x, name,...};
  // their Y is resolved from the LIVE surface at draw time, so they ride the
  // terrain and simply disappear over ground that's been blown away.
  Terrain.prototype._scatterDecorations = function () {
    this.decorations = [];
    var sc = G.scenery;
    if (!sc) return;
    var W = this.w, H = this.h;
    var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

    var x = 40;
    while (x < W - 40) {
      var surf = this.surfaceY(x, 0);
      if (surf !== null && surf < H * 0.9) {
        // slope check: trees/flowers only on fairly flat spots so they don't float
        var sL = this.surfaceY(x - 10, 0), sR = this.surfaceY(x + 10, 0);
        var steep = (sL === null || sR === null || Math.abs(sL - sR) > 22);
        var roll = Math.random();
        var kind = null;
        if (!steep && roll < 0.09) kind = "tree";
        else if (roll < 0.30) kind = "bush";
        else if (roll < 0.70) kind = "grass";
        else if (!steep && roll < 0.78) kind = "flower";
        if (kind) {
          this.decorations.push({
            kind: kind,
            name: pick(sc.kinds[kind].names),
            x: x,
            flip: Math.random() < 0.5,
            jit: 0.82 + Math.random() * 0.4,
          });
        }
      }
      x += 26 + Math.random() * 64;
    }
  };

  // --- fast pixel query against the mask alpha channel ---
  Terrain.prototype.isSolid = function (x, y) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.maskData[(y * this.w + x) * 4 + 3] >= SOLID;
  };

  // first solid pixel at or below fromY in column x (the ground surface)
  Terrain.prototype.surfaceY = function (x, fromY) {
    x = x | 0;
    if (x < 0 || x >= this.w) return null;
    var start = Math.max(0, fromY | 0);
    var data = this.maskData, W = this.w;
    for (var y = start; y < this.h; y++) {
      if (data[(y * W + x) * 4 + 3] >= SOLID) return y;
    }
    return null;
  };

  // topmost solid pixel in column x within [top, bot] (used for wall detection)
  Terrain.prototype.solidTop = function (x, top, bot) {
    x = x | 0;
    if (x < 0 || x >= this.w) return null;
    top = Math.max(0, top | 0);
    bot = Math.min(this.h - 1, bot | 0);
    var data = this.maskData, W = this.w;
    for (var y = top; y <= bot; y++) {
      if (data[(y * W + x) * 4 + 3] >= SOLID) return y;
    }
    return null;
  };

  // Explosion = two stamps: erase the mask circle + carve the visible crater.
  Terrain.prototype.explodeAt = function (cx, cy, r) {
    cx = cx | 0; cy = cy | 0; r = r | 0;
    if (r <= 0) return;
    var W = this.w, H = this.h, data = this.maskData;

    // 1) MASK: set alpha=0 inside the circle (bounded loop for speed)
    var x0 = Math.max(0, cx - r), x1 = Math.min(W - 1, cx + r);
    var y0 = Math.max(0, cy - r), y1 = Math.min(H - 1, cy + r);
    var r2 = r * r;
    for (var y = y0; y <= y1; y++) {
      var dy = y - cy;
      for (var x = x0; x <= x1; x++) {
        var dx = x - cx;
        if (dx * dx + dy * dy <= r2) data[(y * W + x) * 4 + 3] = 0;
      }
    }

    // 2) VISIBLE: punch a hole, then draw a scorched rim so craters read clearly.
    var v = this.vctx;
    v.save();
    v.globalCompositeOperation = "destination-out";
    v.beginPath(); v.arc(cx, cy, r, 0, Math.PI * 2); v.fill();
    v.restore();

    // scorched rim: "source-atop" only paints where ground pixels remain, so
    // the scorch hugs the crater's dirt edge and NEVER draws circles in the sky.
    if (r > 6) {
      v.save();
      v.globalCompositeOperation = "source-atop";
      v.lineWidth = 4;
      v.strokeStyle = "rgba(25,14,6,0.7)";
      v.beginPath(); v.arc(cx, cy, r + 1, 0, Math.PI * 2); v.stroke();
      v.lineWidth = 2;
      v.strokeStyle = "rgba(50,32,16,0.4)";
      v.beginPath(); v.arc(cx, cy, r + 4, 0, Math.PI * 2); v.stroke();
      v.restore();
    }
  };

  // After an explosion: shave jagged 1-2px spikes and break off small floating
  // islands near the blast. Returns sample points of removed ground so the
  // caller can spawn falling-dirt debris. Region-local, so it stays fast.
  Terrain.prototype.settle = function (cx, cy, R) {
    var W = this.w, H = this.h, data = this.maskData;
    var x0 = Math.max(1, (cx - R) | 0), x1 = Math.min(W - 2, (cx + R) | 0);
    var y0 = Math.max(1, (cy - R) | 0), y1 = Math.min(H - 2, (cy + R) | 0);
    if (x1 - x0 < 3 || y1 - y0 < 3) return [];
    var rw = x1 - x0 + 1;

    function solid(x, y) { return data[(y * W + x) * 4 + 3] >= SOLID; }
    var removed = [];

    // --- pass 1: erode jagged spikes (solid pixels with almost no neighbors) ---
    for (var pass = 0; pass < 2; pass++) {
      var kill = [];
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          if (!solid(x, y)) continue;
          var n = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if ((dx || dy) && solid(x + dx, y + dy)) n++;
            }
          }
          if (n <= 2) kill.push(x, y);
        }
      }
      for (var k = 0; k < kill.length; k += 2) {
        data[(kill[k + 1] * W + kill[k]) * 4 + 3] = 0;
        removed.push(kill[k], kill[k + 1]);
      }
      if (!kill.length) break;
    }

    // --- pass 2: break off floating islands ---
    // Flood-fill components inside the region; anything that never touches the
    // region border is disconnected from the rest of the world -> break it off
    // (up to a size cap so we never delete huge legit overhangs).
    var seen = new Uint8Array(rw * (y1 - y0 + 1));
    var idx = function (x, y) { return (y - y0) * rw + (x - x0); };
    var stack = [];
    for (var yy = y0; yy <= y1; yy++) {
      for (var xx = x0; xx <= x1; xx++) {
        if (!solid(xx, yy) || seen[idx(xx, yy)]) continue;
        var comp = [], anchored = false;
        stack.push(xx, yy);
        seen[idx(xx, yy)] = 1;
        while (stack.length) {
          var py = stack.pop(), px = stack.pop();
          comp.push(px, py);
          if (px === x0 || px === x1 || py === y0 || py === y1) anchored = true;
          if (px > x0 && solid(px - 1, py) && !seen[idx(px - 1, py)]) { seen[idx(px - 1, py)] = 1; stack.push(px - 1, py); }
          if (px < x1 && solid(px + 1, py) && !seen[idx(px + 1, py)]) { seen[idx(px + 1, py)] = 1; stack.push(px + 1, py); }
          if (py > y0 && solid(px, py - 1) && !seen[idx(px, py - 1)]) { seen[idx(px, py - 1)] = 1; stack.push(px, py - 1); }
          if (py < y1 && solid(px, py + 1) && !seen[idx(px, py + 1)]) { seen[idx(px, py + 1)] = 1; stack.push(px, py + 1); }
        }
        if (!anchored && comp.length / 2 < 1600) {
          for (var c = 0; c < comp.length; c += 2) {
            data[(comp[c + 1] * W + comp[c]) * 4 + 3] = 0;
            removed.push(comp[c], comp[c + 1]);
          }
        }
      }
    }

    // --- clear the visible layer where ground was removed ---
    // If the pixel above is air, also wipe a few px upward to catch the grass
    // stroke (it's painted slightly above the mask surface).
    var v = this.vctx;
    v.save();
    v.globalCompositeOperation = "destination-out";
    v.fillStyle = "#000";
    for (var r2 = 0; r2 < removed.length; r2 += 2) {
      var rx = removed[r2], ry = removed[r2 + 1];
      if (ry > 0 && !solid(rx, ry - 1)) v.fillRect(rx, ry - 5, 1, 6);
      else v.fillRect(rx, ry, 1, 1);
    }
    v.restore();

    // --- sample removed pixels as debris spawn points (cap ~14) ---
    var debris = [];
    var stride = Math.max(2, ((removed.length / 2 / 14) | 0) * 2);
    for (var d = 0; d < removed.length; d += stride) {
      debris.push({ x: removed[d], y: removed[d + 1] });
    }
    return debris;
  };

  // Destroy decorations caught in a blast (returns wrecked ones so the caller
  // can spawn foliage debris). Trees/bushes blowing up also clears sightlines.
  Terrain.prototype.blastDecorations = function (cx, cy, r) {
    if (!this.decorations) return [];
    var sc = G.scenery, wrecked = [];
    for (var i = 0; i < this.decorations.length; i++) {
      var d = this.decorations[i];
      if (d.dead) continue;
      var surf = this.surfaceY(d.x, 0);
      var base = surf === null ? cy : surf;
      var kh = (sc && sc.kinds[d.kind] ? sc.kinds[d.kind].height : 20) * (d.jit || 1);
      var top = base - kh;
      var dx = cx - d.x;
      var nearestY = Math.max(top, Math.min(base, cy)); // closest point on the trunk segment
      var dy = cy - nearestY;
      if (dx * dx + dy * dy <= (r + 8) * (r + 8)) {
        d.dead = true;
        wrecked.push({ x: d.x, y: (top + base) / 2, kind: d.kind });
      }
    }
    return wrecked;
  };

  // Draw the whole visible layer in WORLD space (the renderer's camera
  // transform maps + zooms it onto the screen; the GPU clips what's offscreen).
  Terrain.prototype.draw = function (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.vis, 0, 0);
  };

  G.Terrain = Terrain;
})(window.IBTW = window.IBTW || {});
