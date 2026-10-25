/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * engine.js — Camera: zoom, pan and world<->screen coordinate math.
 * All app code shares the global `window.ZoomDraw` namespace so the app runs
 * from a plain file:// open with no build step and no ES-module CORS issues.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var MIN_ZOOM = 0.01;
  var MAX_ZOOM = 1e13;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  // The camera maps world coordinates to on-screen CSS pixels:
  //   screenX = worldX * zoom + panX
  //   worldX  = (screenX - panX) / zoom
  // Rendering additionally multiplies by devicePixelRatio for crispness on
  // high-DPI displays, but every value the app reasons about (pan, cursor,
  // stored points) stays in CSS-pixel / world space. Coordinate purity.
  function Camera() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.dpr = window.devicePixelRatio || 1;
  }

  Camera.prototype.screenToWorld = function (sx, sy) {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  };

  Camera.prototype.worldToScreen = function (wx, wy) {
    return { x: wx * this.zoom + this.panX, y: wy * this.zoom + this.panY };
  };

  // Set the canvas transform for a render pass. Includes the DPR scale so the
  // backing store (sized w*dpr x h*dpr) is filled edge to edge.
  Camera.prototype.applyTransform = function (ctx) {
    var d = this.dpr;
    ctx.setTransform(this.zoom * d, 0, 0, this.zoom * d, this.panX * d, this.panY * d);
  };

  // Precision-preserving transform. The canvas does its coordinate math in
  // 32-bit floats, so at extreme zoom `worldX * zoom` overflows ~1.6e7 and
  // rounds to whole pixels (visible jitter/resolution loss around 1e5x). By
  // rendering points relative to a world origin (ox, oy) near the screen
  // centre, the values the canvas sees stay small at ANY zoom. The translation
  // (device position of the origin) is computed here in 64-bit JS, precisely.
  Camera.prototype.applyTransformO = function (ctx, ox, oy) {
    var d = this.dpr;
    var ex = (ox * this.zoom + this.panX) * d;
    var ey = (oy * this.zoom + this.panY) * d;
    ctx.setTransform(this.zoom * d, 0, 0, this.zoom * d, ex, ey);
  };

  // Zoom by `factor` while keeping the world point under (sx, sy) fixed on
  // screen. Clamps zoom to the allowed range and re-derives the effective
  // factor so the anchor never drifts when we hit a limit.
  Camera.prototype.zoomAt = function (sx, sy, factor) {
    var nz = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    var ef = nz / this.zoom;
    this.panX = sx - (sx - this.panX) * ef;
    this.panY = sy - (sy - this.panY) * ef;
    this.zoom = nz;
  };

  Camera.prototype.panBy = function (dx, dy) {
    this.panX += dx;
    this.panY += dy;
  };

  // World-space rectangle currently visible in a CSS w x h viewport.
  Camera.prototype.visibleRect = function (w, h) {
    return {
      left: (0 - this.panX) / this.zoom,
      top: (0 - this.panY) / this.zoom,
      right: (w - this.panX) / this.zoom,
      bottom: (h - this.panY) / this.zoom
    };
  };

  Camera.prototype.toJSON = function () {
    return { panX: this.panX, panY: this.panY, zoom: this.zoom };
  };

  Camera.prototype.load = function (s) {
    if (!s) return;
    this.panX = s.panX || 0;
    this.panY = s.panY || 0;
    this.zoom = clamp(s.zoom || 1, MIN_ZOOM, MAX_ZOOM);
  };

  ZD.Camera = Camera;
  ZD.MIN_ZOOM = MIN_ZOOM;
  ZD.MAX_ZOOM = MAX_ZOOM;
  ZD.clamp = clamp;
})(window.ZoomDraw);
