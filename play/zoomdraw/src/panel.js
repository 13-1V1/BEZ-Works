/*
 * Created by: Brennan Meyer with use of Claude Code [2026-07-24] Santa Clarita, CA
 * brennanmmeyer@gmail.com
 */

/*
 * panel.js — Tool selection (pen/eraser/line/rect/ellipse) and the extended
 * tool options: opacity, shape fill, line style, background color, and brush
 * presets. Kept separate from ui.js so each stays focused and small.
 */
window.ZoomDraw = window.ZoomDraw || {};
(function (ZD) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function ToolPanel(app) {
    this.tools = app.tools;
    this.drawing = app.drawing;
    this.canvas = app.canvas;
  }

  ToolPanel.prototype.init = function () {
    var self = this, t = this.tools;

    // Tool buttons are marked with data-tool so one handler covers them all.
    var btns = document.querySelectorAll('[data-tool]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () { t.setTool(b.getAttribute('data-tool')); });
    });

    $('opacitySlider').addEventListener('input', function (e) {
      t.setAlpha(parseInt(e.target.value, 10) / 100);
    });
    $('hardnessSlider').addEventListener('input', function (e) {
      t.setHardness(parseInt(e.target.value, 10) / 100);
    });
    $('tipSel').addEventListener('change', function (e) { t.setTip(e.target.value); });
    $('nibSlider').addEventListener('input', function (e) { t.setNibAngle(parseInt(e.target.value, 10)); });
    $('fillBtn').addEventListener('click', function () { t.toggleFill(); });
    $('dashSel').addEventListener('change', function (e) { t.setDash(e.target.value); });
    $('presetSel').addEventListener('change', function (e) {
      if (e.target.value) { t.applyPreset(e.target.value); e.target.value = ''; }
    });
    $('bgPicker').addEventListener('input', function (e) { self.setBg(e.target.value); });

    this.setBg(this.drawing.bgColor || '#ffffff');
    this.sync();
  };

  ToolPanel.prototype.setBg = function (color) {
    this.drawing.bgColor = color;
    this.canvas.style.background = color; // eraser reveals this; PNG/GIF fill with it
    $('bgPicker').value = color;
  };

  ToolPanel.prototype.sync = function () {
    var t = this.tools;
    var btns = document.querySelectorAll('[data-tool]');
    Array.prototype.forEach.call(btns, function (b) {
      var on = b.getAttribute('data-tool') === t.tool;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('opacitySlider').value = Math.round(t.alpha * 100);
    $('opacityVal').textContent = Math.round(t.alpha * 100);
    $('hardnessSlider').value = Math.round(t.hardness * 100);
    $('tipSel').value = t.tip;
    $('nibSlider').value = t.nibAngle;
    var fb = $('fillBtn');
    fb.classList.toggle('active', t.fillShape);
    fb.setAttribute('aria-pressed', t.fillShape ? 'true' : 'false');
    $('dashSel').value = t.dash;
    this._syncContext(t);
  };

  // Show only the option groups the active tool actually uses.
  ToolPanel.prototype._syncContext = function (t) {
    var isPen = (t.tool === 'pen' || t.tool === 'eraser');
    var isShape = (t.tool === 'line' || t.tool === 'rect' || t.tool === 'ellipse');
    var show = {
      size: t.tool !== 'bucket',
      opacity: true,
      brush: isPen,                                        // edge, tip, preset
      angle: isPen && t.tip === 'flat',
      shape: isShape,                                      // fill
      dash: (isPen && t.tip !== 'star' && t.tip !== 'spray') || isShape
    };
    Object.keys(show).forEach(function (ctx) {
      var els = document.querySelectorAll('[data-ctx="' + ctx + '"]');
      Array.prototype.forEach.call(els, function (el) { el.classList.toggle('hidden', !show[ctx]); });
    });
  };

  ZD.ToolPanel = ToolPanel;
})(window.ZoomDraw);
