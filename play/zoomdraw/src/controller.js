/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * controller.js — Gamepad input, polled once per animation frame.
 * Standard mapping: left stick pans, triggers zoom, face/bumper/d-pad buttons
 * drive the tools. Buttons use edge detection so a hold fires once.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var DEADZONE = 0.12;
  var PAN_SPEED = 650;   // screen px / second at full stick
  var ZOOM_RATE = 2.2;   // e-fold per second at full trigger

  function dz(v) { return Math.abs(v) < DEADZONE ? 0 : v; }

  function GamepadController(app) {
    this.camera = app.camera;
    this.drawing = app.drawing;
    this.tools = app.tools;
    this.ui = app.ui;
    this.canvas = app.canvas;
    this.prev = {};
    this.index = null;

    var self = this;
    window.addEventListener('gamepadconnected', function (e) {
      self.index = e.gamepad.index;
      if (self.ui) self.ui.toast('🎮 Controller connected');
    });
    window.addEventListener('gamepaddisconnected', function (e) {
      if (self.index === e.gamepad.index) self.index = null;
    });
  }

  GamepadController.prototype._edge = function (pad, i, fn) {
    var pressed = !!(pad.buttons[i] && pad.buttons[i].pressed);
    if (pressed && !this.prev[i]) fn();
    this.prev[i] = pressed;
  };

  GamepadController.prototype.update = function (dt) {
    if (!navigator.getGamepads) return;
    var pads = navigator.getGamepads();
    var pad = null;
    if (this.index !== null && pads[this.index]) {
      pad = pads[this.index];
    } else {
      for (var i = 0; i < pads.length; i++) {
        if (pads[i]) { pad = pads[i]; this.index = pads[i].index; break; }
      }
    }
    if (!pad) return;
    dt = Math.min(dt, 0.05);
    var self = this;

    // Left stick -> pan (camera moves with the stick, content moves opposite).
    var lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0);
    if (lx || ly) this.camera.panBy(-lx * PAN_SPEED * dt, -ly * PAN_SPEED * dt);

    // Triggers -> zoom about the screen centre.
    var rt = pad.buttons[7] ? pad.buttons[7].value : 0;
    var lt = pad.buttons[6] ? pad.buttons[6].value : 0;
    var net = rt - lt;
    if (Math.abs(net) > 0.05) {
      var cx = this.canvas.clientWidth / 2;
      var cy = this.canvas.clientHeight / 2;
      this.camera.zoomAt(cx, cy, Math.exp(net * ZOOM_RATE * dt));
    }

    this._edge(pad, 0, function () { self.tools.toggleTool(); });          // A
    this._edge(pad, 1, function () { self.drawing.undo(); });              // B
    this._edge(pad, 5, function () { self.tools.setSize(self.tools.getSize() + 3); }); // RB
    this._edge(pad, 4, function () { self.tools.setSize(self.tools.getSize() - 3); }); // LB
    this._edge(pad, 9, function () { if (self.ui) self.ui.resetZoom(); });  // Start
    this._edge(pad, 12, function () { self.tools.cycleColor(-1); });        // D-pad up
    this._edge(pad, 13, function () { self.tools.cycleColor(1); });         // D-pad down
  };

  ZD.GamepadController = GamepadController;
})(window.ZoomDraw);
