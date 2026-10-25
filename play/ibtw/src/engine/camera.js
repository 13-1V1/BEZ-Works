// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// camera.js -- follows the action, with ZOOM and free-look PAN. The camera is
// defined by a world focus point (fx, fy = what's at screen center) and a zoom
// factor. The renderer turns these into one canvas transform; input maps the
// mouse back to world space through screenToWorld.

(function (G) {
  "use strict";

  var S = G.settings;

  function Camera() {
    this.viewW = S.view.width;
    this.viewH = S.view.height;
    this.fx = 0; this.fy = 0;      // current focus (world center)
    this.tx = 0; this.ty = 0;      // target focus (when following)
    this.zoom = 1; this.tzoom = 1; // current + target zoom
    this.minZoom = 0.42;           // ~whole battlefield in view
    this.maxZoom = 2.4;            // close-up
    this.freeLook = false;         // panning disables auto-follow until recentered
    this.shake = 0; this.ox = 0; this.oy = 0;
  }

  // follow a world point (ignored while the player is free-looking)
  Camera.prototype.follow = function (wx, wy) {
    if (this.freeLook) return;
    this.tx = wx; this.ty = wy;
    this._clampTarget();
  };

  // jump straight to a point and resume following
  Camera.prototype.snap = function (wx, wy) {
    this.freeLook = false;
    this.tx = this.fx = wx;
    this.ty = this.fy = wy;
    this._clamp();
  };

  Camera.prototype.recenter = function () { this.freeLook = false; };

  // drag-pan: dxScreen/dyScreen are mouse deltas in screen pixels
  Camera.prototype.pan = function (dxScreen, dyScreen) {
    this.freeLook = true;
    this.fx -= dxScreen / this.zoom;
    this.fy -= dyScreen / this.zoom;
    this.tx = this.fx; this.ty = this.fy;
    this._clamp();
  };

  // steps > 0 zooms in, < 0 zooms out (multiplicative for smooth feel)
  Camera.prototype.zoomBy = function (steps) {
    this.tzoom = clamp(this.tzoom * Math.pow(1.15, steps), this.minZoom, this.maxZoom);
  };

  Camera.prototype.addShake = function (amount) {
    this.shake = Math.min(S.camera.maxShake, this.shake + amount);
  };

  Camera.prototype.update = function (dt) {
    this.zoom += (this.tzoom - this.zoom) * 0.22;
    this.fx += (this.tx - this.fx) * S.camera.lerp;
    this.fy += (this.ty - this.fy) * S.camera.lerp;
    this._clamp();

    if (this.shake > 0.1) {
      this.ox = (Math.random() * 2 - 1) * this.shake;
      this.oy = (Math.random() * 2 - 1) * this.shake;
      this.shake *= 0.88;
    } else { this.shake = 0; this.ox = 0; this.oy = 0; }
  };

  // keep the focus so the view never shows past the world edges (centers on
  // the axis when the world is smaller than the view at this zoom)
  Camera.prototype._clampFocus = function (fx, fy) {
    var halfW = (this.viewW / this.zoom) / 2, halfH = (this.viewH / this.zoom) / 2;
    var W = S.world.width, H = S.world.height;
    fx = (W <= halfW * 2) ? W / 2 : Math.max(halfW, Math.min(W - halfW, fx));
    fy = (H <= halfH * 2) ? H / 2 : Math.max(halfH, Math.min(H - halfH, fy));
    return { x: fx, y: fy };
  };
  Camera.prototype._clamp = function () {
    var c = this._clampFocus(this.fx, this.fy); this.fx = c.x; this.fy = c.y;
  };
  Camera.prototype._clampTarget = function () {
    var c = this._clampFocus(this.tx, this.ty); this.tx = c.x; this.ty = c.y;
  };

  // set the world->screen transform on a context (world drawing happens inside)
  Camera.prototype.applyTransform = function (ctx) {
    var z = this.zoom;
    ctx.setTransform(z, 0, 0, z,
      this.viewW / 2 - this.fx * z + this.ox,
      this.viewH / 2 - this.fy * z + this.oy);
  };

  Camera.prototype.screenToWorld = function (sx, sy) {
    var z = this.zoom;
    return {
      x: (sx - this.viewW / 2 - this.ox) / z + this.fx,
      y: (sy - this.viewH / 2 - this.oy) / z + this.fy,
    };
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  G.Camera = Camera;
})(window.IBTW = window.IBTW || {});
