/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * ui.js — Toolbar DOM binding, zoom counter, cursor feedback, save/load,
 * PNG export, help overlay and the loop-mode controls.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var zoomFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

  function $(id) { return document.getElementById(id); }
  // Toggle a button's active class and its aria-pressed state together.
  function press(el, on) { if (el) { el.classList.toggle('active', on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); } }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function UI(app) {
    this.app = app;               // { canvas, camera, drawing, tools, loop, mode, loopDepth }
    this.canvas = app.canvas;
    this.camera = app.camera;
    this.drawing = app.drawing;
    this.tools = app.tools;
    this.loop = app.loop;
    this.lastHover = null;
  }

  UI.prototype.init = function () {
    var self = this;
    var t = this.tools;

    $('colorPicker').addEventListener('input', function (e) { t.setColor(e.target.value); });
    $('sizeSlider').addEventListener('input', function (e) { t.setSize(parseInt(e.target.value, 10)); });
    // Tool-selection buttons (pen/eraser/shapes) are wired by ToolPanel.
    $('undoBtn').addEventListener('click', function () { self.drawing.undo(); });
    $('redoBtn').addEventListener('click', function () { self.drawing.redo(); });
    $('resetBtn').addEventListener('click', function () { self.resetZoom(); });
    $('clearBtn').addEventListener('click', function () { self.clearCanvas(); });
    $('saveBtn').addEventListener('click', function () { self.save(); });
    $('pngBtn').addEventListener('click', function () { self.exportPNG(); });

    $('loadBtn').addEventListener('click', function () { $('loadInput').click(); });
    $('loadInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) self.loadFile(e.target.files[0]);
      e.target.value = '';
    });

    if (this.app.mode === 'loop') {
      $('loopGroup').classList.remove('hidden');
      $('stampBtn').addEventListener('click', function () { self.toggleStamp(); });
      $('previewBtn').addEventListener('click', function () { self.loop.previewLoop(); self._syncLoopControls(); });
      $('ghostBtn').addEventListener('click', function () { self.toast(self.loop.toggleGhost() ? 'Draw in Stamp on — paint inside the box to fill the whole canvas' : 'Draw in Stamp off'); self._syncLoopControls(); });
      $('gifBtn').addEventListener('click', function () { self.exportGIF(); });
      $('stampSize').addEventListener('input', function (e) { self.setStampSize(parseInt(e.target.value, 10)); });
      $('borderBtn').addEventListener('click', function () { self.loop.toggleBorder(); self._syncLoopControls(); });
      $('liveBtn').addEventListener('click', function () { self.loop.toggleLive(); self._syncLoopControls(); });
    }

    $('help').addEventListener('click', function () { self.toggleHelp(false); });
    $('helpBtn').addEventListener('click', function () { self.toggleHelp(); });

    // Drag & drop a save file anywhere onto the canvas.
    var app = $('app');
    app.addEventListener('dragover', function (e) { e.preventDefault(); });
    app.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) self.loadFile(e.dataTransfer.files[0]);
    });

    this.tools.onHover = function (x, y) { self.onHover(x, y); };

    this._bindKeys();
    this.syncControls();
  };

  UI.prototype.syncControls = function () {
    var t = this.tools;
    $('colorPicker').value = t.color;
    $('sizeSlider').value = t.getSize();
    $('sizeVal').textContent = t.getSize();
    this.canvas.style.cursor = t.tool === 'eraser' ? 'none' : 'crosshair';
    this.refreshCursor();
  };

  UI.prototype.updateZoom = function (zoom) {
    var s;
    if (zoom >= 1) s = zoomFmt.format(Math.round(zoom));
    else s = zoom.toFixed(2);
    $('zoomVal').textContent = '🔍 ' + s + '×';
  };

  // Eraser cursor: a circle sized to the real (screen-space) brush footprint.
  UI.prototype.onHover = function (x, y) {
    this.lastHover = { x: x, y: y };
    this.refreshCursor();
  };

  UI.prototype.refreshCursor = function () {
    var el = $('eraserCursor');
    if (!el) return;
    if (this.tools.tool !== 'eraser' || !this.lastHover) {
      el.style.display = 'none';
      return;
    }
    var d = ZD.clamp(this.tools.eraserSize, 4, 400);
    el.style.display = 'block';
    el.style.width = d + 'px';
    el.style.height = d + 'px';
    el.style.left = this.lastHover.x + 'px';
    el.style.top = this.lastHover.y + 'px';
  };

  UI.prototype.resetZoom = function () {
    var cam = this.camera;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cam.zoom = 1; cam.panX = 0; cam.panY = 0; return; // no fly-back animation
    }
    var s = { panX: cam.panX, panY: cam.panY, zoom: cam.zoom };
    var dur = 320, start = null;
    function ease(t) { return 1 - Math.pow(1 - t, 3); }
    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      var k = ease(t);
      cam.panX = s.panX + (0 - s.panX) * k;
      cam.panY = s.panY + (0 - s.panY) * k;
      cam.zoom = s.zoom * Math.pow(1 / s.zoom, k); // interpolate zoom in log space
      if (t < 1) requestAnimationFrame(step);
      else { cam.zoom = 1; cam.panX = 0; cam.panY = 0; }
    }
    requestAnimationFrame(step);
  };

  UI.prototype.toggleStamp = function () {
    if (this.loop.isStamped()) {
      this.loop.clearStamp();
    } else {
      this.loop.setStamp();
    }
    this._syncStampBtn();
  };

  UI.prototype._syncStampBtn = function () {
    var btn = $('stampBtn');
    if (!btn) return;
    var on = this.loop.isStamped();
    btn.textContent = on ? 'Clear Stamp' : 'Stamp Loop';
    btn.classList.toggle('active', on);
    $('previewBtn').disabled = !on;
    $('gifBtn').disabled = !on;
  };

  UI.prototype.setStampSize = function (pct) { this.loop.setStampScale(pct / 100); this._syncLoopControls(); };

  UI.prototype._syncLoopControls = function () {
    if (this.app.mode !== 'loop') return;
    var depth = this.loop.loopDepth;
    $('stampSize').value = Math.round(this.loop.stampScale * 100);
    $('stampDepthVal').textContent = (depth >= 10 ? depth.toFixed(0) : depth.toFixed(1)) + '×';
    press($('borderBtn'), this.loop.showBorder);
    press($('liveBtn'), this.loop.live);
    press($('ghostBtn'), this.loop.ghost);
    var pv = $('previewBtn');
    pv.textContent = this.loop._previewing ? 'Stop' : 'Preview';
    press(pv, this.loop._previewing);
  };

  UI.prototype.save = function () {
    var blob = new Blob([JSON.stringify(this.app.store.serialize())], { type: 'application/json' });
    downloadBlob(blob, 'zoomdraw-save.json');
    this.toast('Saved zoomdraw-save.json');
  };

  UI.prototype.clearCanvas = function () {
    if (this.drawing.strokes.length &&
        !window.confirm('Clear the whole drawing? This cannot be undone.')) return;
    this.drawing.clear();
    if (this.app.store) this.app.store.clearSaved();
    this.toast('Canvas cleared');
  };

  UI.prototype.loadFile = function (file) {
    if (this.drawing.strokes.length &&
        !window.confirm('Load "' + file.name + '"? Your current drawing will be replaced.')) return;
    var self = this;
    var reader = new FileReader();
    reader.onload = function () {
      try { self.app.store.applyData(JSON.parse(reader.result)); self.toast('Loaded ' + file.name); }
      catch (err) { self.toast('Could not read that file.'); }
    };
    reader.readAsText(file);
  };

  UI.prototype.exportPNG = function () {
    var cv = document.createElement('canvas');
    cv.width = this.canvas.width;
    cv.height = this.canvas.height;
    var g = cv.getContext('2d');
    g.fillStyle = this.drawing.bgColor || '#ffffff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(this.canvas, 0, 0);
    cv.toBlob(function (b) { if (b) downloadBlob(b, 'zoomdraw-view.png'); });
    this.toast('Exported PNG');
  };

  UI.prototype.exportGIF = function () {
    var self = this;
    if (!this.loop.isStamped()) { this.toast('Set a loop stamp first.'); return; }
    if (location.protocol === 'file:') {
      this.toast('GIF export needs a local server (see README).');
    }
    this.showProgress(0);
    this.loop.exportGIF(
      function (p) { self.showProgress(p); },
      function () { self.hideProgress(); self.toast('Saved zoomdraw-loop.gif'); },
      function (msg) { self.hideProgress(); self.toast('GIF failed: ' + msg); }
    );
  };

  UI.prototype.showProgress = function (p) {
    $('gifProgress').classList.remove('hidden');
    $('gifBar').style.width = Math.round(p * 100) + '%';
    $('gifText').textContent = 'Rendering GIF … ' + Math.round(p * 100) + '%';
  };

  UI.prototype.hideProgress = function () { $('gifProgress').classList.add('hidden'); };

  UI.prototype.toggleHelp = function (force) {
    var el = $('help');
    var show = (force === undefined) ? el.classList.contains('hidden') : force;
    el.classList.toggle('hidden', !show);
    if (show) {
      this._helpReturn = document.activeElement;      // remember focus to restore on close
      var panel = el.querySelector('.help-panel');
      if (panel) panel.focus();
    } else if (this._helpReturn && this._helpReturn.focus) {
      this._helpReturn.focus();
      this._helpReturn = null;
    }
  };

  UI.prototype._toastTimer = null;
  UI.prototype.toast = function (msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  };

  UI.prototype._bindKeys = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); if (e.shiftKey) self.exportPNG(); else self.save(); return; }
      if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); if (k === 'y' || e.shiftKey) self.drawing.redo(); else self.drawing.undo(); return; }
      if (mod) return;

      switch (e.key) {
        case '?': self.toggleHelp(); break;
        case 'p': case 'P': self.tools.setTool('pen'); break;
        case 'e': case 'E': self.tools.setTool('eraser'); break;
        case 'r': case 'R': self.resetZoom(); break;
        case '[': self.tools.setSize(self.tools.getSize() - 2); break;
        case ']': self.tools.setSize(self.tools.getSize() + 2); break;
        case 'Escape': self.toggleHelp(false); break;
      }
    });
  };

  ZD.UI = UI;
})(window.ZoomDraw);
