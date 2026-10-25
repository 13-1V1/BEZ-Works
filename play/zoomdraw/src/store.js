/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * store.js — Local autosave and the save/load serialisation shared with the
 * file buttons. The drawing is written to localStorage a moment after you stop
 * working (and on unload), so a refresh or a closed tab never loses it. Nothing
 * leaves the browser — same private, file-based spirit as the rest of the app.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var KEY = 'zoomdraw:autosave';
  var DELAY = 1500; // ms of quiet before an autosave is written

  // Static helpers for the mode-select "restore" button (no app instance yet).
  function read() {
    try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }
  function hasSaved() {
    var d = read();
    return !!(d && d.strokes && d.strokes.length);
  }

  function Store(app) {
    this.app = app;
    this._timer = null;
    this._off = false; // set once if storage is full, to stop retrying
  }

  // Build the plain-object snapshot used by both file-save and autosave.
  Store.prototype.serialize = function () {
    var app = this.app;
    return {
      version: 1,
      mode: app.mode,
      loopDepth: app.loop ? app.loop.loopDepth : 8,
      stampScale: app.loop ? app.loop.stampScale : 0.125,
      stamped: app.loop ? app.loop.isStamped() : false,
      bgColor: app.drawing.bgColor,
      camera: app.camera.toJSON(),
      strokes: app.drawing.strokes.map(function (s) {
        if (s.tool !== 'fillimg') return s;
        var d = (s.img && s.img.toDataURL) ? s.img.toDataURL('image/png') : s.imgData;
        return { tool: 'fillimg', rect: s.rect, alpha: s.alpha, imgData: d };
      })
    };
  };

  // Apply a snapshot (from a file or the autosave) to the running app.
  Store.prototype.applyData = function (data) {
    var app = this.app;
    if (!data) return;
    app.drawing.load(data.strokes || []);
    app.camera.load(data.camera);
    if (data.bgColor && app.panel) app.panel.setBg(data.bgColor);
    if (app.loop) {
      var scale = data.stampScale || (data.loopDepth ? 1 / data.loopDepth : app.loop.stampScale);
      app.loop.stampScale = ZD.clamp(scale, 0.02, 0.6);
      app.loop.loopDepth = 1 / app.loop.stampScale;
    }
    if (app.loop && app.mode === 'loop') {
      app.loop.clearStamp();
      if (data.stamped) app.loop.setStamp();
      app.ui._syncStampBtn();
      app.ui._syncLoopControls();
    }
  };

  Store.prototype.saveNow = function () {
    if (this._off) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.serialize()));
    } catch (e) {
      this._off = true; // typically quota exceeded on a huge (fill-heavy) drawing
      if (this.app.ui) this.app.ui.toast('Autosave off — drawing too large for local storage');
    }
  };

  // Coalesce rapid changes into one write shortly after you stop.
  Store.prototype.schedule = function () {
    var self = this;
    clearTimeout(this._timer);
    this._timer = setTimeout(function () { self.saveNow(); }, DELAY);
  };

  Store.prototype.flush = function () { clearTimeout(this._timer); this.saveNow(); };

  Store.prototype.clearSaved = function () {
    this._off = false;
    clearTimeout(this._timer);
    try { localStorage.removeItem(KEY); } catch (e) {}
  };

  ZD.Store = Store;
  ZD.Store.read = read;
  ZD.Store.hasSaved = hasSaved;
})(window.ZoomDraw);
