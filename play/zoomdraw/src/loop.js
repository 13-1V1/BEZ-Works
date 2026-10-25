/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * loop.js — Loop mode: the mirror stamp and seamless-GIF export.
 * The stamp is the whole drawing shrunk toward the canvas centre by
 * `stampScale`. It is rendered *procedurally* every frame — the drawing is
 * redrawn at each nesting level, as deep as the current zoom needs — so you can
 * scroll straight into the loop forever without it ever pixelating. Because the
 * stamp is centred, the loop camera is a pure zoom (no pan), so zooming by
 * exactly `loopDepth` returns an identical view. That makes the tunnel seamless
 * both live and in the exported GIF.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var GIF_FRAMES = 120;
  var GIF_MAX_SIDE = 600;
  var MAX_LEVELS = 28;   // safety cap on recursion levels drawn in one frame

  function LoopManager(canvas, camera, drawing, loopDepth) {
    this.canvas = canvas;
    this.camera = camera;
    this.drawing = drawing;
    this.loopDepth = loopDepth || 8;
    this.stampScale = 1 / this.loopDepth; // stamp width as a fraction of the view

    this.stampRect = null;   // world rect { left, top, w, h }; non-null once placed
    this.canvasW = 0;        // the view size the loop is anchored to
    this.canvasH = 0;
    this.showBorder = true;
    this.live = true;        // mirror the live drawing (vs a frozen snapshot)
    this.ghost = false;      // dim the live stamp so you can draw inside it
    this.frozenStrokes = null;
    this._previewing = false;
    this._savedCam = null;
  }

  LoopManager.prototype.isStamped = function () {
    return !!this.stampRect;
  };

  LoopManager.prototype._recomputeRect = function () {
    var W = this.canvasW, H = this.canvasH, s = this.stampScale;
    var sw = W * s, sh = H * s;
    this.stampRect = { left: W / 2 - sw / 2, top: H / 2 - sh / 2, w: sw, h: sh };
  };

  // Stamp size and loop depth are the same knob (depth = 1 / scale). A bigger
  // stamp => a shallower loop. No raster to rebuild — just move the rect.
  LoopManager.prototype.setStampScale = function (scale) {
    this.stampScale = ZD.clamp(scale, 0.02, 0.6);
    this.loopDepth = 1 / this.stampScale;
    if (this.stampRect) this._recomputeRect();
  };

  LoopManager.prototype.setStamp = function () {
    var W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) return;
    this.canvasW = W;
    this.canvasH = H;
    this._recomputeRect();
    if (!this.live) this._snapshot();
  };

  LoopManager.prototype.clearStamp = function () {
    this.stampRect = null;
    this.frozenStrokes = null;
  };

  LoopManager.prototype._snapshot = function () {
    this.frozenStrokes = this.drawing.strokes.slice();
  };

  LoopManager.prototype.toggleBorder = function () {
    this.showBorder = !this.showBorder;
    return this.showBorder;
  };

  LoopManager.prototype.toggleGhost = function () {
    this.ghost = !this.ghost;
    return this.ghost;
  };

  // Live on: the mirror tracks the drawing and updates as you draw. Live off:
  // freeze it to a snapshot of the strokes (still infinitely zoomable).
  LoopManager.prototype.toggleLive = function () {
    this.live = !this.live;
    if (this.live) this.frozenStrokes = null;
    else this._snapshot();
    return this.live;
  };

  LoopManager.prototype._drawSource = function (ctx) {
    if (this.live || !this.frozenStrokes) {
      this.drawing.render(ctx, {});
    } else {
      for (var i = 0; i < this.frozenStrokes.length; i++) {
        ZD.drawStroke(ctx, this.frozenStrokes[i]);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // Draw the Droste recursion: the drawing scaled toward the centre by
  // stampScale^k for each level k. `applyXf` sets the world->view transform;
  // `project` maps a world point to view pixels (for culling); `startK` is the
  // shallowest level to draw (deeper-hidden levels above it are skipped).
  LoopManager.prototype._recurse = function (ctx, applyXf, project, viewW, viewH, startK, bgAlpha) {
    var W = this.canvasW, H = this.canvasH, s = this.stampScale;
    var Cx = W / 2, Cy = H / 2;
    var fa = (bgAlpha == null ? 1 : bgAlpha);
    var drawn = 0;
    for (var k = startK; drawn < MAX_LEVELS; k++) {
      var sk = Math.pow(s, k);
      var a = project(Cx - W * sk / 2, Cy - H * sk / 2);
      var b = project(Cx + W * sk / 2, Cy + H * sk / 2);
      var rl = Math.min(a.x, b.x), rr = Math.max(a.x, b.x);
      var rt = Math.min(a.y, b.y), rb = Math.max(a.y, b.y);
      if (rr - rl < 0.75) break;                                // sub-pixel: nothing deeper shows
      if (rr < 0 || rl > viewW || rb < 0 || rt > viewH) break;  // off-view; deeper levels sit inside
      ctx.save();
      applyXf(ctx);
      ctx.translate(Cx, Cy);
      ctx.scale(sk, sk);
      ctx.translate(-Cx, -Cy);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fa;
      ctx.fillStyle = this.drawing.bgColor || '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      this._drawSource(ctx);
      ctx.restore();
      drawn++;
    }
  };

  // Live display: the base drawing is rendered by the app; here we add the
  // nested mirror levels (k >= 1) on top, as deep as the current zoom needs.
  LoopManager.prototype.renderStamp = function (ctx, camera, cssW, cssH) {
    if (!this.stampRect) return;
    var W = this.canvasW, s = this.stampScale, zoom = camera.zoom;
    // When zoomed into the stamp, skip shallow levels whose white fill is fully
    // hidden behind a deeper level that already covers the viewport.
    var kStart = 1;
    var cover = Math.max(cssW, cssH) * 1.1;
    if (W * s * zoom > cover) {
      kStart = Math.floor(Math.log(cover / (W * zoom)) / Math.log(s)) - 1;
      if (kStart < 1) kStart = 1;
    }
    // Ghost mode dims the mirror's paper so you can see (and draw) the real
    // strokes underneath it. The preview and GIF always use full opacity.
    var bgA = (this.ghost && !this._previewing) ? 0.2 : 1;
    this._recurse(ctx,
      function (c) { camera.applyTransform(c); },
      function (x, y) { return camera.worldToScreen(x, y); },
      cssW, cssH, kStart, bgA);
  };

  // The stamp boundary (screen space, crisp). In draw-in-stamp mode it becomes a
  // solid bright frame with a caption, and shows even if Border is off, so you
  // can see exactly where to paint.
  LoopManager.prototype.renderStampBox = function (ctx) {
    if (!this.stampRect) return;
    var edit = this.ghost && !this._previewing;
    if (!this.showBorder && !edit) return;
    var cam = this.camera;
    var tl = cam.worldToScreen(this.stampRect.left, this.stampRect.top);
    var br = cam.worldToScreen(this.stampRect.left + this.stampRect.w, this.stampRect.top + this.stampRect.h);
    var x = tl.x, y = tl.y, w = br.x - tl.x, h = br.y - tl.y;
    ctx.save();
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = edit ? 'rgba(108,92,231,1)' : 'rgba(108,92,231,0.95)';
    ctx.lineWidth = edit ? 2.5 : 1.5;
    ctx.setLineDash(edit ? [] : [6, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (edit) {
      var txt = '✎ draw here → whole canvas';
      ctx.font = '600 12px system-ui, sans-serif';
      var bw = ctx.measureText(txt).width + 14, bh = 20;
      var bx = x + (w - bw) / 2, by = y - bh - 6;
      if (by < 4) by = y + 6;
      ctx.fillStyle = 'rgba(108,92,231,0.95)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(txt, bx + 7, by + bh / 2 + 0.5);
    }
    ctx.restore();
  };

  // Live preview: drive the real camera through the zoom tunnel continuously,
  // wrapping every cycle, until stopped. Calling it again stops and restores.
  LoopManager.prototype.previewLoop = function () {
    if (!this.stampRect) return;
    if (this._previewing) { this.stopPreview(); return; }
    var self = this;
    var W = this.canvasW, H = this.canvasH, depth = this.loopDepth;
    this._savedCam = { panX: this.camera.panX, panY: this.camera.panY, zoom: this.camera.zoom };
    var dur = 2600, startT = null;
    this._previewing = true;

    function step(now) {
      if (!self._previewing) return; // stopped
      if (startT === null) startT = now;
      var t = ((now - startT) / dur) % 1; // wrap -> loops forever
      var z = Math.pow(depth, t);
      self.camera.zoom = z;
      self.camera.panX = W / 2 - (W / 2) * z;
      self.camera.panY = H / 2 - (H / 2) * z;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  LoopManager.prototype.stopPreview = function () {
    if (!this._previewing) return;
    this._previewing = false;
    if (this._savedCam) {
      this.camera.zoom = this._savedCam.zoom;
      this.camera.panX = this._savedCam.panX;
      this.camera.panY = this._savedCam.panY;
    }
  };

  LoopManager.prototype.isPreviewing = function () {
    return this._previewing;
  };

  // Export a seamless looping GIF. Each frame is rendered procedurally (base +
  // recursion), so the inner levels stay crisp. Frames are added asynchronously
  // to keep the progress bar live, then gif.js encodes in its workers.
  LoopManager.prototype.exportGIF = function (onProgress, onDone, onError) {
    if (!this.stampRect) { if (onError) onError('No stamp set.'); return; }
    if (typeof GIF === 'undefined') { if (onError) onError('gif.js failed to load.'); return; }

    var W = this.canvasW, H = this.canvasH, depth = this.loopDepth;
    var gifW, gifH;
    if (W >= H) { gifW = GIF_MAX_SIDE; gifH = Math.round(GIF_MAX_SIDE * H / W); }
    else { gifH = GIF_MAX_SIDE; gifW = Math.round(GIF_MAX_SIDE * W / H); }
    var s0 = gifW / W; // uniform world->gif base scale

    var off = document.createElement('canvas');
    off.width = gifW;
    off.height = gifH;
    var g = off.getContext('2d');
    var self = this;

    var gif = new GIF({
      workers: 2, quality: 8, width: gifW, height: gifH, workerScript: 'lib/gif.worker.js'
    });
    gif.on('progress', function (p) { if (onProgress) onProgress(0.4 + 0.6 * p); });
    gif.on('finished', function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'zoomdraw-loop.gif';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      if (onDone) onDone();
    });

    var i = 0;
    function addNext() {
      if (i >= GIF_FRAMES) {
        try { gif.render(); } catch (err) { if (onError) onError(String(err)); }
        return;
      }
      var z = Math.pow(depth, i / GIF_FRAMES);
      var scale = s0 * z;
      var panX = gifW / 2 - (W / 2) * scale;
      var panY = gifH / 2 - (H / 2) * scale;

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = self.drawing.bgColor || '#ffffff';
      g.fillRect(0, 0, gifW, gifH);
      self._recurse(g,
        function (c) { c.setTransform(scale, 0, 0, scale, panX, panY); },
        function (x, y) { return { x: x * scale + panX, y: y * scale + panY }; },
        gifW, gifH, 0);

      gif.addFrame(off, { copy: true, delay: 33 });
      i++;
      if (onProgress) onProgress((i / GIF_FRAMES) * 0.4);
      setTimeout(addNext, 0);
    }
    addNext();
  };

  ZD.LoopManager = LoopManager;
})(window.ZoomDraw);
