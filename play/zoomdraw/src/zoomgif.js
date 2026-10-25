/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * zoomgif.js — GIF export for Infinite Zoom mode. A PNG only captures one zoom
 * level, so this animates the camera and encodes the frames as a GIF that dives
 * into the detail. Two modes: Center (dolly from 1x into the middle of your
 * view, up to your current zoom) and Path (fly through camera nodes you place —
 * node 1 is the centre at 1x, then add as many more as you like; drag any marker
 * to reposition it). Frame count scales with the zoom distance so the dive rate
 * is constant at any depth (Slow / Normal / Fast). Playback loops, or ping-pongs
 * forward then reverse for a seamless there-and-back. Owns its own bottom bar.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var DELAY = 40, MAX_FRAMES = 300, GIF_MAX_SIDE = 600, MIN_SEG = 20, PAN_DIV = 12;
  var SPEEDS = { slow: 52, normal: 32, fast: 18 };            // frames per octave (per zoom doubling)
  var SPEED_ORDER = ['slow', 'normal', 'fast'];

  function $(id) { return document.getElementById(id); }
  function press(el, on) { if (el) { el.classList.toggle('active', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); } }

  function ZoomGif(app) {
    this.app = app;
    this.mode = 'center';    // 'center' | 'path'
    this.playback = 'loop';  // 'loop' | 'pingpong'
    this.speed = 'normal';   // key into SPEEDS
    this.nodes = [];         // path nodes: { x, y, zoom } (world centre + zoom)
    this._rev = 0;           // bumps on any node change (add/move/clear) for repaint
    this._previewing = false;
    this._saved = null;
  }

  ZoomGif.prototype._center = function () {
    var c = this.app.canvas, cam = this.app.camera;
    return cam.screenToWorld(c.clientWidth / 2, c.clientHeight / 2);
  };

  // Node 1 is always the current view centre at 1x — the wide establishing shot.
  ZoomGif.prototype.seedFirst = function () {
    if (!this.nodes.length) { var o = this._center(); this.nodes.push({ x: o.x, y: o.y, zoom: 1 }); this._rev++; }
  };
  ZoomGif.prototype.addNode = function () {
    this.seedFirst();
    var o = this._center();
    this.nodes.push({ x: o.x, y: o.y, zoom: this.app.camera.zoom });
    this._rev++;
    return this.nodes.length;
  };
  ZoomGif.prototype.clearNodes = function () { this.nodes = []; this._rev++; };

  // Screen-space hit test for grabbing a node marker (returns index or -1).
  ZoomGif.prototype.nodeAt = function (sx, sy) {
    if (this.mode !== 'path' || this._previewing) return -1;
    var cam = this.app.camera;
    for (var i = this.nodes.length - 1; i >= 0; i--) {         // topmost first
      var p = cam.worldToScreen(this.nodes[i].x, this.nodes[i].y);
      var dx = p.x - sx, dy = p.y - sy;
      if (dx * dx + dy * dy <= 225) return i;                  // 15px grab radius
    }
    return -1;
  };
  ZoomGif.prototype.moveNode = function (i, w) {
    var n = this.nodes[i]; if (!n) return;
    n.x = w.x; n.y = w.y; this._rev++;
  };
  ZoomGif.prototype.removeNode = function (i) {
    if (i < 0 || i >= this.nodes.length) return;
    this.nodes.splice(i, 1);
    this._rev++;
    this.syncUI();
  };
  ZoomGif.prototype.cycleSpeed = function () {
    this.speed = SPEED_ORDER[(SPEED_ORDER.indexOf(this.speed) + 1) % SPEED_ORDER.length];
  };

  // The node list actually animated, per mode. Center is a 2-node dolly-in.
  ZoomGif.prototype._path = function () {
    if (this.mode === 'path') return this.nodes;
    var o = this._center();
    return [{ x: o.x, y: o.y, zoom: 1 }, { x: o.x, y: o.y, zoom: Math.max(this.app.camera.zoom, 1.5) }];
  };
  ZoomGif.prototype.ready = function () { return this._path().length >= 2; };

  // Interpolate a camera state within a segment (linear centre, geometric zoom).
  function lerp(a, b, t) {
    return { cx: a.x + (b.x - a.x) * t, cy: a.y + (b.y - a.y) * t, zoom: a.zoom * Math.pow(b.zoom / a.zoom, t) };
  }

  // The camera states to render, one per frame. Frames per segment scale with the
  // zoom distance (octaves) and pan distance, so the dive RATE is constant no
  // matter how deep — that is what keeps a deep zoom from blurring past. Pingpong
  // appends the reverse; a long path is downsampled to cap the file size.
  ZoomGif.prototype._states = function () {
    var path = this._path();
    if (path.length < 2) return [];
    var fpo = SPEEDS[this.speed] || SPEEDS.normal, out = [], i, k, a, b;
    for (i = 0; i < path.length - 1; i++) {
      a = path[i]; b = path[i + 1];
      var oct = Math.abs(Math.log(b.zoom / a.zoom) / Math.LN2);
      var pan = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)) * Math.sqrt(a.zoom * b.zoom) / PAN_DIV;
      var fr = Math.max(MIN_SEG, Math.round(fpo * oct + pan));
      for (k = 0; k < fr; k++) out.push(lerp(a, b, k / fr));
    }
    b = path[path.length - 1];
    out.push({ cx: b.x, cy: b.y, zoom: b.zoom });
    if (out.length > MAX_FRAMES) {
      var ds = [], n = out.length;
      for (i = 0; i < MAX_FRAMES; i++) ds.push(out[Math.round(i * (n - 1) / (MAX_FRAMES - 1))]);
      out = ds;
    }
    if (this.playback === 'pingpong') for (i = out.length - 2; i >= 1; i--) out.push(out[i]);
    return out;
  };

  // --- live preview: drive the real camera along the path until stopped ---
  ZoomGif.prototype.preview = function () {
    if (this._previewing) { this.stopPreview(); return; }
    var states = this._states(); if (states.length < 2) return;
    var cam = this.app.camera, c = this.app.canvas, self = this;
    var vw = c.clientWidth, vh = c.clientHeight;
    this._saved = { panX: cam.panX, panY: cam.panY, zoom: cam.zoom };
    var dur = states.length * DELAY, start = null;
    this._previewing = true;
    function step(now) {
      if (!self._previewing) return;
      if (start === null) start = now;
      var g = (((now - start) / dur) % 1) * (states.length - 1);
      var i = Math.floor(g), t = g - i, a = states[i], b = states[Math.min(i + 1, states.length - 1)];
      var z = a.zoom * Math.pow(b.zoom / a.zoom, t);
      cam.zoom = z;
      cam.panX = vw / 2 - (a.cx + (b.cx - a.cx) * t) * z;
      cam.panY = vh / 2 - (a.cy + (b.cy - a.cy) * t) * z;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
  ZoomGif.prototype.stopPreview = function () {
    if (!this._previewing) return;
    this._previewing = false;
    var s = this._saved, cam = this.app.camera;
    if (s) { cam.zoom = s.zoom; cam.panX = s.panX; cam.panY = s.panY; }
  };

  // --- numbered node markers on the canvas (path mode) ---
  ZoomGif.prototype.renderNodes = function (ctx, cam, w, h) {
    if (this.mode !== 'path' || !this.nodes.length || this._previewing) return;
    ctx.save();
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < this.nodes.length; i++) {
      var p = cam.worldToScreen(this.nodes[i].x, this.nodes[i].y);
      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(108,92,231,0.9)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), p.x, p.y + 0.5);
    }
    ctx.restore();
  };

  // --- GIF export ---
  ZoomGif.prototype.exportGIF = function (onProgress, onDone, onError) {
    var states = this._states();
    if (states.length < 2) { if (onError) onError('Add at least 2 nodes.'); return; }
    if (typeof GIF === 'undefined') { if (onError) onError('gif.js failed to load.'); return; }
    var c = this.app.canvas, drawing = this.app.drawing;
    var vw = c.clientWidth, vh = c.clientHeight, gifW, gifH;
    if (vw >= vh) { gifW = GIF_MAX_SIDE; gifH = Math.round(GIF_MAX_SIDE * vh / vw); }
    else { gifH = GIF_MAX_SIDE; gifW = Math.round(GIF_MAX_SIDE * vw / vh); }
    var s0 = gifW / vw; // world->gif scale at zoom 1 (matches the app's framing)
    var off = document.createElement('canvas'); off.width = gifW; off.height = gifH;
    var g = off.getContext('2d');
    var gif = new GIF({ workers: 2, quality: 8, width: gifW, height: gifH, workerScript: 'lib/gif.worker.js' });
    gif.on('progress', function (p) { if (onProgress) onProgress(0.4 + 0.6 * p); });
    gif.on('finished', function (blob) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'zoomdraw-zoom.gif';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      if (onDone) onDone();
    });
    var i = 0;
    function addNext() {
      if (i >= states.length) { try { gif.render(); } catch (e) { if (onError) onError(String(e)); } return; }
      var s = states[i], gs = s.zoom * s0;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = drawing.bgColor || '#ffffff';
      g.fillRect(0, 0, gifW, gifH);
      var hw = (gifW / 2) / gs, hh = (gifH / 2) / gs;
      g.setTransform(gs, 0, 0, gs, gifW / 2, gifH / 2);
      drawing.render(g, { originX: s.cx, originY: s.cy,
        visibleRect: { left: s.cx - hw, top: s.cy - hh, right: s.cx + hw, bottom: s.cy + hh } });
      g.setTransform(1, 0, 0, 1, 0, 0);
      gif.addFrame(off, { copy: true, delay: DELAY });
      i++;
      if (onProgress) onProgress((i / states.length) * 0.4);
      setTimeout(addNext, 0);
    }
    addNext();
  };

  // --- bottom-bar UI (bound once, from the bootstrap) ---
  ZoomGif.prototype.bindUI = function () {
    var self = this, ui = this.app.ui;
    $('zgCenterBtn').addEventListener('click', function () { self.mode = 'center'; self.syncUI(); });
    $('zgPathBtn').addEventListener('click', function () { self.mode = 'path'; self.seedFirst(); self.syncUI(); });
    $('zgAddBtn').addEventListener('click', function () { self.addNode(); ui.toast(self.nodes.length + ' nodes — drag to move, right-click to remove'); self.syncUI(); });
    $('zgClearBtn').addEventListener('click', function () { self.clearNodes(); self.syncUI(); });
    $('zgLoopBtn').addEventListener('click', function () { self.playback = 'loop'; self.syncUI(); });
    $('zgPongBtn').addEventListener('click', function () { self.playback = 'pingpong'; self.syncUI(); });
    $('zgSpeedBtn').addEventListener('click', function () { self.cycleSpeed(); self.syncUI(); });
    $('zgPreviewBtn').addEventListener('click', function () { self.preview(); self.syncUI(); });
    $('zgExportBtn').addEventListener('click', function () { self.doExport(); });
    this.syncUI();
  };

  ZoomGif.prototype.syncUI = function () {
    var path = this.mode === 'path';
    press($('zgCenterBtn'), !path); press($('zgPathBtn'), path);
    press($('zgLoopBtn'), this.playback === 'loop'); press($('zgPongBtn'), this.playback === 'pingpong');
    $('zgSpeedBtn').textContent = 'Speed: ' + this.speed.charAt(0).toUpperCase() + this.speed.slice(1);
    var pv = $('zgPreviewBtn');
    pv.textContent = this._previewing ? 'Stop' : 'Preview';
    press(pv, this._previewing);
    var els = document.querySelectorAll('.optg-path');
    Array.prototype.forEach.call(els, function (el) { el.classList.toggle('hidden', !path); });
    $('zgCount').textContent = this.nodes.length + (this.nodes.length === 1 ? ' node' : ' nodes');
    $('zgExportBtn').disabled = !this.ready();
  };

  ZoomGif.prototype.doExport = function () {
    var ui = this.app.ui;
    if (!this.ready()) { ui.toast('Add at least one more node (2 minimum).'); return; }
    if (this.mode === 'center' && this.app.camera.zoom < 1.2) ui.toast('Tip: zoom in on some detail first for a center-zoom.');
    if (location.protocol === 'file:') ui.toast('GIF export needs a local server (see README).');
    ui.showProgress(0);
    this.exportGIF(
      function (p) { ui.showProgress(p); },
      function () { ui.hideProgress(); ui.toast('Saved zoomdraw-zoom.gif'); },
      function (msg) { ui.hideProgress(); ui.toast('GIF failed: ' + msg); }
    );
  };

  ZD.ZoomGif = ZoomGif;
})(window.ZoomDraw);
