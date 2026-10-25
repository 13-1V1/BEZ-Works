/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * drawing.js — Stroke storage, undo/redo stack, and the render pass.
 * Every point stored here is in WORLD space. Screen->world conversion happens
 * at the input boundary (tools.js) before anything reaches this module.
 * Element rendering itself lives in brush.js (ZD.drawStroke).
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  function computeBBox(stroke) {
    var p = stroke.points;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < p.length; i++) {
      if (p[i].x < minX) minX = p[i].x;
      if (p[i].y < minY) minY = p[i].y;
      if (p[i].x > maxX) maxX = p[i].x;
      if (p[i].y > maxY) maxY = p[i].y;
    }
    var pad = stroke.size / 2 + 1;
    stroke.bbox = { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  function intersects(b, r) {
    // r is a visibleRect (may be inverted if flipped, so normalize)
    var rl = Math.min(r.left, r.right), rr = Math.max(r.left, r.right);
    var rt = Math.min(r.top, r.bottom), rb = Math.max(r.top, r.bottom);
    return !(b.maxX < rl || b.minX > rr || b.maxY < rt || b.minY > rb);
  }

  function Drawing() {
    this.strokes = [];   // committed strokes (this array IS the undo stack)
    this.redoStack = []; // strokes removed by undo, awaiting redo
    this.active = null;  // in-progress stroke, not yet committed
    this.revision = 0;   // bumps on every change; loop mode watches this for live stamping
    this.bgColor = '#ffffff'; // paper color (applied as the canvas CSS background)
  }

  Drawing.prototype.begin = function (worldPt, style) {
    this.active = {
      points: [{ x: worldPt.x, y: worldPt.y }],
      color: style.color,
      size: style.size,
      tool: style.tool,
      alpha: style.alpha == null ? 1 : style.alpha,
      dash: style.dash || 'solid',
      fill: !!style.fill,
      hardness: style.hardness == null ? 1 : style.hardness,
      tip: style.tip || 'round',
      nibAngle: style.nibAngle == null ? -40 : style.nibAngle
    };
    this.redoStack.length = 0; // a new stroke invalidates the redo history
    this.revision++;
  };

  // Add a pre-built element (used by the bucket tool for its raster fill image).
  Drawing.prototype.addElement = function (el) {
    this.strokes.push(el);
    this.redoStack.length = 0;
    this.revision++;
  };

  // Shape tools drag a single second point rather than appending a trail.
  Drawing.prototype.dragTo = function (worldPt) {
    if (!this.active) return;
    this.active.points[1] = { x: worldPt.x, y: worldPt.y };
    this.revision++;
  };

  Drawing.prototype.extend = function (worldPt) {
    if (!this.active) return;
    var pts = this.active.points;
    var last = pts[pts.length - 1];
    // Skip near-duplicate points (in world units relative to brush) to keep
    // paths light without visibly changing the line.
    var dx = worldPt.x - last.x, dy = worldPt.y - last.y;
    var minStep = this.active.size * 0.05;
    if (dx * dx + dy * dy < minStep * minStep) return;
    pts.push({ x: worldPt.x, y: worldPt.y });
    this.revision++;
  };

  Drawing.prototype.end = function () {
    if (!this.active) return;
    if (this.active.points.length) {
      computeBBox(this.active);
      this.strokes.push(this.active);
    }
    this.active = null;
    this.revision++;
  };

  Drawing.prototype.cancel = function () {
    this.active = null;
    this.revision++;
  };

  Drawing.prototype.undo = function () {
    if (this.active) { this.active = null; this.revision++; return true; }
    if (this.strokes.length) {
      this.redoStack.push(this.strokes.pop());
      this.revision++;
      return true;
    }
    return false;
  };

  Drawing.prototype.redo = function () {
    if (this.redoStack.length) {
      this.strokes.push(this.redoStack.pop());
      this.revision++;
      return true;
    }
    return false;
  };

  Drawing.prototype.clear = function () {
    this.strokes.length = 0;
    this.redoStack.length = 0;
    this.active = null;
    this.revision++;
  };

  // Render all committed elements (plus the active one) in chronological order.
  // Ordering matters: an eraser only removes strokes drawn before it, so you
  // can erase a mistake and draw over the cleared area afterwards.
  Drawing.prototype.render = function (ctx, opts) {
    opts = opts || {};
    var vr = opts.visibleRect;
    var ox = opts.originX || 0, oy = opts.originY || 0;
    var cache = !!opts.cache;
    if (cache && ZD.strokeCache) ZD.strokeCache.beginFrame();
    for (var i = 0; i < this.strokes.length; i++) {
      var s = this.strokes[i];
      if (vr && s.bbox && !intersects(s.bbox, vr)) continue;
      ZD.drawStroke(ctx, s, ox, oy, cache);
    }
    if (this.active) ZD.drawStroke(ctx, this.active, ox, oy, false); // in-progress: never cache
    ctx.globalCompositeOperation = 'source-over';
  };

  Drawing.prototype.load = function (strokes) {
    var self = this;
    this.clear();
    if (!strokes) return;
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i];
      if (s && s.tool === 'fillimg' && s.imgData && s.rect) {
        var el = {
          tool: 'fillimg', rect: s.rect, alpha: s.alpha == null ? 1 : s.alpha, img: null,
          imgData: s.imgData, // kept so the fill survives a re-save
          bbox: { minX: s.rect.x, minY: s.rect.y, maxX: s.rect.x + s.rect.w, maxY: s.rect.y + s.rect.h }
        };
        (function (elem) {
          var im = new Image();
          im.onload = function () { elem.img = im; self.revision++; };
          im.src = s.imgData;
        })(el);
        this.strokes.push(el);
        continue;
      }
      if (!s || !s.points || !s.points.length) continue;
      var stroke = {
        points: s.points,
        color: s.color || '#111111',
        size: s.size || 4,
        tool: ZD.SHAPES[s.tool] || s.tool === 'eraser' ? s.tool : 'pen',
        alpha: s.alpha == null ? 1 : s.alpha,
        dash: s.dash || 'solid',
        fill: !!s.fill,
        hardness: s.hardness == null ? 1 : s.hardness,
        tip: s.tip || 'round',
        nibAngle: s.nibAngle == null ? -40 : s.nibAngle
      };
      computeBBox(stroke);
      this.strokes.push(stroke);
    }
    this.revision++;
  };

  ZD.Drawing = Drawing;
})(window.ZoomDraw);
