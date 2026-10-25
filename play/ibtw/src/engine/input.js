// Created by: Brennan Meyer  2026  Santa Clarita, CA  brennanmmeyer@gmail.com
//
// input.js -- turns raw keyboard/mouse/GAMEPAD into simple intents the game
// reads. Mouse position is mapped from screen pixels into the canvas's LOGICAL
// coordinate space (the canvas is scaled to fit the window via CSS).
//
// Controller (standard mapping, e.g. Xbox):
//   left stick / d-pad   walk
//   right stick          aim
//   A                    jump
//   RT (or X)            hold = charge power, release = fire
//   LB / RB              previous / next weapon
//   Back/Select          hold = show scores
//   Start                restart (on game over)
//
// Aiming uses a sticky "aimMode": moving the mouse takes over aim, moving the
// right stick takes over aim; whichever acted last wins, so both inputs coexist.

(function (G) {
  "use strict";

  var Input = {
    keys: {},                 // raw key state by code
    mouse: { x: 0, y: 0 },    // logical canvas coords
    mouseDown: false,

    // one-shot flags (poll then clear each frame)
    firePressed: false,
    fireReleased: false,
    jumpPressed: false,
    weaponPick: null,         // 0-based index requested via number keys
    weaponScroll: 0,          // -1 / +1 from Q/E or bumpers
    restartPressed: false,

    // camera intents
    zoomDelta: 0,             // + zoom in / - zoom out (wheel, +/- keys, d-pad)
    panDX: 0, panDY: 0,       // free-look pan (right-drag), screen px this frame
    recenterPressed: false,   // C / stick-click: snap back to the action
    panning: false,

    showScores: false,        // Tab (or Back button) held

    // gamepad state
    aimMode: "mouse",         // "mouse" | "pad" -- whichever aimed last wins
    padAimAngle: 0,           // last right-stick aim angle (radians)
    padWalk: 0,               // -1..1 from left stick / d-pad
    padFireHeld: false,       // RT/X currently held (charging)
    padConnected: false,
    _padPrev: {},             // previous button states for edge detection
  };

  Input.init = function (canvas) {
    this.canvas = canvas;

    window.addEventListener("keydown", function (e) {
      // avoid page scrolling on space / arrows / tab
      if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"].indexOf(e.key) >= 0) {
        e.preventDefault();
      }
      if (!Input.keys[e.code]) {
        // rising edge
        if (e.code === "KeyW" || e.code === "Space" || e.code === "ArrowUp") Input.jumpPressed = true;
        if (e.code === "KeyR") Input.restartPressed = true;
        if (e.code === "KeyQ") Input.weaponScroll -= 1; // prev weapon
        if (e.code === "KeyE") Input.weaponScroll += 1; // next weapon
        if (e.code === "KeyC") Input.recenterPressed = true;
        if (e.code === "Equal" || e.code === "NumpadAdd") Input.zoomDelta += 1;
        if (e.code === "Minus" || e.code === "NumpadSubtract") Input.zoomDelta -= 1;
        var n = numberFromCode(e.code);
        if (n !== null) Input.weaponPick = n;
      }
      if (e.code === "Tab") Input.showScores = true;
      Input.keys[e.code] = true;
    });

    window.addEventListener("keyup", function (e) {
      Input.keys[e.code] = false;
      if (e.code === "Tab") Input.showScores = false;
    });

    var lastPanX = 0, lastPanY = 0;
    canvas.addEventListener("mousemove", function (e) {
      updateMouse(e);
      if (Input.panning) {
        // accumulate screen-space drag delta for the camera
        Input.panDX += (Input.mouse.x - lastPanX);
        Input.panDY += (Input.mouse.y - lastPanY);
      } else {
        Input.aimMode = "mouse"; // moving the mouse (not panning) takes aim back
      }
      lastPanX = Input.mouse.x; lastPanY = Input.mouse.y;
    });
    canvas.addEventListener("mousedown", function (e) {
      updateMouse(e);
      lastPanX = Input.mouse.x; lastPanY = Input.mouse.y;
      if (e.button === 2 || e.button === 1) {
        Input.panning = true;        // right / middle button = free-look pan
      } else if (e.button === 0) {
        Input.mouseDown = true;      // left button = aim/charge
        Input.firePressed = true;
      }
    });
    window.addEventListener("mouseup", function (e) {
      if (e.button === 2 || e.button === 1) { Input.panning = false; return; }
      if (Input.mouseDown) Input.fireReleased = true;
      Input.mouseDown = false;
    });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      Input.zoomDelta += (e.deltaY < 0 ? 1 : -1); // wheel up = zoom in
    }, { passive: false });
    // don't let the browser show its context menu on right-click
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    function updateMouse(e) {
      var r = canvas.getBoundingClientRect();
      Input.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      Input.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    }
  };

  // ---- gamepad polling: call once per frame BEFORE reading intents ----
  var DEADZONE = 0.25;

  Input.pollGamepads = function () {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = null;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    }
    this.padConnected = !!gp;
    if (!gp) { this.padWalk = 0; this.padFireHeld = false; this._padPrev = {}; return; }

    var b = gp.buttons, ax = gp.axes;
    var prev = this._padPrev;
    function down(idx) { return !!(b[idx] && (b[idx].pressed || b[idx].value > 0.5)); }
    function edge(idx) { return down(idx) && !prev[idx]; } // rising edge this frame

    // walk: left stick x (axes[0]) or d-pad left/right (buttons 14/15)
    var walk = Math.abs(ax[0]) > DEADZONE ? ax[0] : 0;
    if (down(14)) walk = -1;
    if (down(15)) walk = 1;
    this.padWalk = walk;

    // aim: right stick (axes[2], axes[3]); stick motion takes aim control
    var rx = ax[2] || 0, ry = ax[3] || 0;
    if (Math.hypot(rx, ry) > DEADZONE) {
      this.padAimAngle = Math.atan2(ry, rx);
      this.aimMode = "pad";
    }

    // jump: A (0)
    if (edge(0)) this.jumpPressed = true;

    // fire/charge: RT (7) or X (2) -- hold to charge, release to fire
    var fireNow = down(7) || down(2);
    if (fireNow && !this.padFireHeld) this.firePressed = true;
    if (!fireNow && this.padFireHeld) this.fireReleased = true;
    this.padFireHeld = fireNow;

    // weapon cycle: LB (4) / RB (5)
    if (edge(4)) this.weaponScroll -= 1;
    if (edge(5)) this.weaponScroll += 1;

    // zoom: d-pad up (12) / down (13); recenter: right-stick click (11)
    if (edge(12)) this.zoomDelta += 1;
    if (edge(13)) this.zoomDelta -= 1;
    if (edge(11)) this.recenterPressed = true;

    // scores: Back/Select (8) held; restart: Start (9)
    if (down(8)) this.showScores = true;
    else if (!this.keys.Tab) this.showScores = false;
    if (edge(9)) this.restartPressed = true;

    // remember button states for next frame's edge detection
    var np = {};
    for (var k = 0; k < b.length; k++) np[k] = down(k);
    this._padPrev = np;
  };

  // convenience intent getters
  Input.walkDir = function () {
    var l = this.keys.KeyA || this.keys.ArrowLeft;
    var r = this.keys.KeyD || this.keys.ArrowRight;
    var kb = (r ? 1 : 0) - (l ? 1 : 0);
    if (kb !== 0) return kb;
    // analog stick: return the sign (walk speed itself stays constant)
    return this.padWalk > DEADZONE ? 1 : this.padWalk < -DEADZONE ? -1 : 0;
  };

  // true while the player is holding the charge input (mouse button or trigger)
  Input.fireHeld = function () {
    return this.mouseDown || this.padFireHeld;
  };

  // clear one-shot flags at end of frame
  Input.endFrame = function () {
    this.firePressed = false;
    this.fireReleased = false;
    this.jumpPressed = false;
    this.weaponPick = null;
    this.weaponScroll = 0;
    this.restartPressed = false;
    this.zoomDelta = 0;
    this.panDX = 0; this.panDY = 0;
    this.recenterPressed = false;
  };

  function numberFromCode(code) {
    if (code.indexOf("Digit") === 0) {
      var d = parseInt(code.slice(5), 10);
      if (d >= 1 && d <= 9) return d - 1;
    }
    return null;
  }

  G.Input = Input;
})(window.IBTW = window.IBTW || {});
