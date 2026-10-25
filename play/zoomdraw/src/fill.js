/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * fill.js — Raster flood fill for the bucket tool. Split out of tools.js.
 * Because it works on pixels of the current view, the result is a raster image
 * positioned in world space; it pixelates if you later zoom in far.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  var TOL = 32 * 32 * 3; // squared colour distance that still counts as a match

  // Flood-fill the connected region at (sx, sy) screen px in the current view.
  // Composites the live canvas onto the paper colour, fills matching pixels with
  // colorHex, and returns { img, rect } positioned in world space (or null).
  ZD.computeFill = function (canvas, cam, bgColor, colorHex, sx, sy) {
    var W = canvas.width, H = canvas.height; // device pixels
    var x0 = Math.round(sx * cam.dpr), y0 = Math.round(sy * cam.dpr);
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return null;

    var tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    var g = tmp.getContext('2d');
    g.fillStyle = bgColor || '#ffffff';
    g.fillRect(0, 0, W, H);
    g.drawImage(canvas, 0, 0);
    var data = g.getImageData(0, 0, W, H).data;

    var start = y0 * W + x0;
    var tr = data[start * 4], tg = data[start * 4 + 1], tb = data[start * 4 + 2];
    var mask = new Uint8Array(W * H);
    var stack = [start];
    mask[start] = 1;
    function pushIf(ok, ni) {
      if (!ok || mask[ni]) return;
      var q = ni * 4, dr = data[q] - tr, dg = data[q + 1] - tg, db = data[q + 2] - tb;
      if (dr * dr + dg * dg + db * db <= TOL) { mask[ni] = 1; stack.push(ni); }
    }
    while (stack.length) {
      var idx = stack.pop();
      var x = idx % W, y = (idx - x) / W;
      pushIf(x + 1 < W, idx + 1);
      pushIf(x - 1 >= 0, idx - 1);
      pushIf(y + 1 < H, idx + W);
      pushIf(y - 1 >= 0, idx - W);
    }

    var fc = document.createElement('canvas');
    fc.width = W; fc.height = H;
    var fctx = fc.getContext('2d');
    var out = fctx.createImageData(W, H);
    var col = parseInt(colorHex.replace('#', ''), 16);
    var cr = (col >> 16) & 255, cg = (col >> 8) & 255, cb = col & 255;
    for (var m = 0; m < mask.length; m++) {
      if (mask[m]) {
        var o = m * 4;
        out.data[o] = cr; out.data[o + 1] = cg; out.data[o + 2] = cb; out.data[o + 3] = 255;
      }
    }
    fctx.putImageData(out, 0, 0);

    var tl = cam.screenToWorld(0, 0);
    var br = cam.screenToWorld(canvas.clientWidth, canvas.clientHeight);
    return { img: fc, rect: { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y } };
  };
})(window.ZoomDraw);
