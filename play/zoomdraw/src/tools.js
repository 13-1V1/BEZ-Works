/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * tools.js — Canvas interaction state machine.
 * Owns the single stream of pointer/wheel/touch input and routes it to either
 * drawing (pen/eraser) or the camera (pan/zoom/pinch). Screen coordinates are
 * converted to world space the instant they arrive, before storage.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var PRESET_COLORS = [
    '#111111', '#ffffff', '#e74c3c', '#e67e22', '#f1c40f',
    '#2ecc71', '#1abc9c', '#3498db', '#6c5ce7', '#e84393'
  ];

  var TOOLS = { pen: 1, eraser: 1, line: 1, rect: 1, ellipse: 1, bucket: 1 };

  var PRESETS = {
    pencil: { size: 3, alpha: 1, dash: 'solid' },
    pen: { size: 6, alpha: 1, dash: 'solid' },
    marker: { size: 16, alpha: 1, dash: 'solid' },
    highlighter: { size: 30, alpha: 0.3, dash: 'solid' }
  };

  var TIPS = { round: 1, flat: 1, square: 1, star: 1, spray: 1 };

  function Tools(canvas, camera, drawing) {
    this.canvas = canvas;
    this.camera = camera;
    this.drawing = drawing;

    this.tool = 'pen';       // pen | eraser | line | rect | ellipse
    this.color = '#111111';
    this.penSize = 4;
    this.eraserSize = 28;
    this.alpha = 1;          // opacity 0..1
    this.dash = 'solid';     // solid | dashed | dotted
    this.fillShape = false;  // shapes: filled vs outline
    this.hardness = 1;       // 1 = crisp edge, lower = soft/feathered
    this.tip = 'round';      // round | flat | square | star | spray
    this.nibAngle = -40;     // flat-tip calligraphy nib angle (degrees)
    this.onFill = null;      // fired after a bucket fill (for a one-time note)
    this.loop = null;        // LoopManager (set by the app) for draw-in-stamp
    this.zoomgif = null;     // ZoomGif (set by the app) for dragging path nodes

    this.pointers = new Map(); // pointerId -> { x, y, type }
    this.mode = 'idle';        // idle | draw | pan | gesture | nodedrag
    this.drawId = null;
    this.panLast = null;
    this.gesture = null;
    this._portal = false;      // this stroke started inside the (ghosted) stamp
    this._dragNode = null;     // index of the zoom-path node being dragged

    this.onChange = null; // fired when tool/color/size change (UI sync)
    this.onHover = null;  // fired on move: (screenX, screenY) for cursor feedback

    this._bind();
  }

  Tools.prototype.getSize = function () { return this.tool === 'eraser' ? this.eraserSize : this.penSize; };
  Tools.prototype.setSize = function (v) {
    v = ZD.clamp(v, 1, 80);
    if (this.tool === 'eraser') this.eraserSize = v; else this.penSize = v;
    this._changed();
  };
  Tools.prototype.setTool = function (t) { this.tool = TOOLS[t] ? t : 'pen'; this._changed(); };
  Tools.prototype._isShape = function () { return this.tool === 'line' || this.tool === 'rect' || this.tool === 'ellipse'; };
  Tools.prototype.setAlpha = function (a) { this.alpha = ZD.clamp(a, 0.02, 1); this._changed(); };
  Tools.prototype.setDash = function (d) { this.dash = d; this._changed(); };
  Tools.prototype.toggleFill = function () { this.fillShape = !this.fillShape; this._changed(); return this.fillShape; };
  Tools.prototype.toggleTool = function () { this.setTool(this.tool === 'pen' ? 'eraser' : 'pen'); };
  Tools.prototype.setColor = function (c) {
    this.color = c;
    if (this.tool === 'eraser') this.setTool('pen'); // picking a color implies drawing
    this._changed();
  };

  // Presets bundle a size + opacity + line style, and drop you back on the pen.
  Tools.prototype.applyPreset = function (name) {
    var pr = PRESETS[name];
    if (!pr) return;
    this.tool = 'pen'; this.penSize = pr.size; this.alpha = pr.alpha; this.dash = pr.dash;
    this._changed();
  };

  Tools.prototype.cycleColor = function (dir) {
    var idx = PRESET_COLORS.indexOf(this.color);
    if (idx < 0) idx = 0;
    idx = (idx + dir + PRESET_COLORS.length) % PRESET_COLORS.length;
    this.setColor(PRESET_COLORS[idx]);
  };

  Tools.prototype._changed = function () {
    if (this.onChange) this.onChange();
  };

  Tools.prototype._style = function () {
    // The slider is a SCREEN-pixel width. Divide by the current zoom to store a
    // world-space width, so the brush always feels the same size on screen at
    // any zoom — and zooming in lets you lay down progressively finer detail.
    return {
      color: this.color, size: this.getSize() / this.camera.zoom, tool: this.tool,
      alpha: this.alpha, dash: this.dash, fill: this.fillShape,
      hardness: this.hardness, tip: this.tip, nibAngle: this.nibAngle
    };
  };

  Tools.prototype.setHardness = function (h) { this.hardness = ZD.clamp(h, 0.02, 1); this._changed(); };
  Tools.prototype.setTip = function (t) { this.tip = TIPS[t] ? t : 'round'; this._changed(); };
  Tools.prototype.setNibAngle = function (deg) { this.nibAngle = deg; this._changed(); };

  Tools.prototype._pos = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  Tools.prototype._touchList = function () {
    var a = [];
    this.pointers.forEach(function (p) { if (p.type === 'touch') a.push(p); });
    return a;
  };

  Tools.prototype._portalActive = function (wp) {
    var lp = this.loop;
    if (!lp || !lp.ghost || !lp.stampRect) return false;
    var r = lp.stampRect;
    return wp.x >= r.left && wp.x <= r.left + r.w && wp.y >= r.top && wp.y <= r.top + r.h;
  };

  // Map a point inside the stamp window to the full drawing. The stamp shows the
  // whole canvas at 1/loopDepth, so drawing inside it edits the full-scale
  // drawing (which then mirrors back into the stamp — bidirectional editing).
  Tools.prototype._portalMap = function (wp) {
    var r = this.loop.stampRect, s = this.loop.stampScale;
    return { x: (wp.x - r.left) / s, y: (wp.y - r.top) / s };
  };

  Tools.prototype._startDraw = function (pos) {
    var wp = this.camera.screenToWorld(pos.x, pos.y);
    var style = this._style();
    this._portal = this._portalActive(wp);
    if (this._portal) {
      wp = this._portalMap(wp);
      style.size *= (1 / this.loop.stampScale); // widen to match the up-scaled position
    }
    this.drawing.begin(wp, style);
  };

  Tools.prototype._drawMove = function (pos) {
    var wp = this.camera.screenToWorld(pos.x, pos.y);
    if (this._portal) wp = this._portalMap(wp);
    if (this._isShape()) this.drawing.dragTo(wp);
    else this.drawing.extend(wp);
  };

  Tools.prototype._bind = function () {
    var self = this;
    var c = this.canvas;

    c.addEventListener('pointerdown', function (e) { self._down(e); });
    c.addEventListener('pointermove', function (e) { self._move(e); });
    window.addEventListener('pointerup', function (e) { self._up(e); });
    window.addEventListener('pointercancel', function (e) { self._up(e); });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    c.addEventListener('wheel', function (e) { self._wheel(e); }, { passive: false });
  };

  // In zoom mode, grabbing a path-node marker starts a drag instead of a stroke.
  Tools.prototype._tryGrabNode = function (pos, id) {
    var zg = this.zoomgif;
    if (!zg) return false;
    var ni = zg.nodeAt(pos.x, pos.y);
    if (ni < 0) return false;
    this.mode = 'nodedrag'; this._dragNode = ni; this.drawId = id;
    try { this.canvas.setPointerCapture(id); } catch (_) {}
    return true;
  };

  Tools.prototype._down = function (e) {
    var pos = this._pos(e);
    this.pointers.set(e.pointerId, { x: pos.x, y: pos.y, type: e.pointerType });

    if (e.pointerType === 'touch') {
      var touches = this._touchList();
      if (touches.length >= 2) {
        // Second finger down -> pan/pinch. Abandon any stroke the first
        // finger started so it doesn't leave a stray mark.
        if (this.mode === 'draw') { this.drawing.cancel(); this.drawId = null; }
        this.mode = 'gesture';
        this._startGesture(touches);
        return;
      }
      if (this.tool === 'bucket') { this.bucketFill(pos.x, pos.y); return; }
      if (this._tryGrabNode(pos, e.pointerId)) return;
      this.mode = 'draw';
      this.drawId = e.pointerId;
      this._startDraw(pos);
      return;
    }

    // Mouse / stylus. Right-click a path node removes it (else middle/right = pan).
    if (e.button === 2 && this.zoomgif) {
      var rn = this.zoomgif.nodeAt(pos.x, pos.y);
      if (rn >= 0) { this.zoomgif.removeNode(rn); e.preventDefault(); return; }
    }
    if (e.button === 1 || e.button === 2) {
      this.mode = 'pan';
      this.panLast = pos;
      e.preventDefault();
      return;
    }
    if (e.button === 0) {
      if (this.tool === 'bucket') { this.bucketFill(pos.x, pos.y); return; }
      if (this._tryGrabNode(pos, e.pointerId)) return;
      this.mode = 'draw';
      this.drawId = e.pointerId;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this._startDraw(pos);
    }
  };

  // Raster flood fill of the clicked region (delegates the pixel work to
  // fill.js), stored as a world-positioned image element.
  Tools.prototype.bucketFill = function (sx, sy) {
    var f = ZD.computeFill(this.canvas, this.camera, this.drawing.bgColor, this.color, sx, sy);
    if (!f) return;
    var r = f.rect;
    this.drawing.addElement({
      tool: 'fillimg', img: f.img, rect: r, alpha: this.alpha,
      bbox: { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h }
    });
    if (this.onFill) this.onFill();
  };

  Tools.prototype._move = function (e) {
    var pos = this._pos(e);
    var rec = this.pointers.get(e.pointerId);
    if (rec) { rec.x = pos.x; rec.y = pos.y; }
    if (this.onHover) this.onHover(pos.x, pos.y);

    if (this.mode === 'nodedrag' && e.pointerId === this.drawId) {
      this.zoomgif.moveNode(this._dragNode, this.camera.screenToWorld(pos.x, pos.y));
      return;
    }
    if (this.zoomgif && this.zoomgif.mode === 'path' && this.mode === 'idle') {
      this.canvas.style.cursor = this.zoomgif.nodeAt(pos.x, pos.y) >= 0 ? 'grab' : 'crosshair';
    }

    if (this.mode === 'gesture' && e.pointerType === 'touch') {
      this._updateGesture(this._touchList());
      return;
    }
    if (this.mode === 'draw' && e.pointerId === this.drawId) {
      this._drawMove(pos);
      return;
    }
    if (this.mode === 'pan' && this.panLast) {
      this.camera.panBy(pos.x - this.panLast.x, pos.y - this.panLast.y);
      this.panLast = pos;
    }
  };

  Tools.prototype._up = function (e) {
    var wasDraw = (this.mode === 'draw' && e.pointerId === this.drawId);
    this.pointers.delete(e.pointerId);

    if (wasDraw) {
      this.drawing.end();
      this.drawId = null;
      this.mode = 'idle';
      this._portal = false;
    } else if (this.mode === 'pan' && e.pointerType !== 'touch') {
      this.mode = 'idle';
      this.panLast = null;
    } else if (this.mode === 'gesture') {
      if (this._touchList().length < 2) {
        this.mode = 'idle';
        this.gesture = null;
      }
    } else if (this.mode === 'nodedrag' && e.pointerId === this.drawId) {
      this.mode = 'idle';
      this.drawId = null;
      this._dragNode = null;
    }
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  Tools.prototype._wheel = function (e) {
    e.preventDefault();
    var pos = this._pos(e);
    var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.camera.zoomAt(pos.x, pos.y, factor);
  };

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  Tools.prototype._startGesture = function (touches) {
    this.gesture = {
      dist: dist(touches[0], touches[1]),
      cx: (touches[0].x + touches[1].x) / 2,
      cy: (touches[0].y + touches[1].y) / 2
    };
  };

  Tools.prototype._updateGesture = function (touches) {
    if (touches.length < 2 || !this.gesture) return;
    var nd = dist(touches[0], touches[1]);
    var ncx = (touches[0].x + touches[1].x) / 2;
    var ncy = (touches[0].y + touches[1].y) / 2;
    this.camera.panBy(ncx - this.gesture.cx, ncy - this.gesture.cy);
    if (this.gesture.dist > 0) {
      this.camera.zoomAt(ncx, ncy, nd / this.gesture.dist);
    }
    this.gesture = { dist: nd, cx: ncx, cy: ncy };
  };

  ZD.Tools = Tools;
  ZD.PRESET_COLORS = PRESET_COLORS;
  ZD.PRESET_NAMES = ['pencil', 'pen', 'marker', 'highlighter'];
})(window.ZoomDraw);
