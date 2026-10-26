// Created by: Brennan Meyer with use of Codex 09/17/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
(function () {
  'use strict';
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  let serial = 0;
  function dimensions(w, h) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 2048 || h > 2048) throw new Error('Tile dimensions must be whole pixels from 1 to 2048.');
  }
  function createCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function copy(c) { const result = createCanvas(c.width, c.height); result.getContext('2d').drawImage(c, 0, 0); return result; }
  function rgba(color) {
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Choose a valid six-digit hex color.');
    return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  }
  class TileDocument {
    constructor(width, height, background = 'white') {
      dimensions(width, height);
      this.width = width; this.height = height; this.layers = []; this.activeId = null;
      this._composite = createCanvas(width, height); this._undo = []; this._redo = []; this._stroke = null;
      const layer = this.addLayer('Background');
      if (background && background !== 'transparent') { const ctx = layer.canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
    }
    get active() { return this.layers.find(l => l.id === this.activeId) || this.layers[this.layers.length - 1]; }
    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }
    addLayer(name = 'Layer ' + (this.layers.length + 1)) {
      if (this.layers.length >= 8) throw new Error('A project can contain up to 8 layers.');
      let id;
      do { serial = (serial + 1) % Number.MAX_SAFE_INTEGER; id = 'layer-' + serial; } while (this.layers.some(l => l.id === id));
      const layer = { id, name: String(name).slice(0, 100), visible: true, opacity: 1, canvas: createCanvas(this.width, this.height) };
      this.layers.push(layer); this.activeId = layer.id; return layer;
    }
    removeLayer(id) { if (this.layers.length < 2) return false; const i = this.layers.findIndex(l => l.id === id); if (i < 0) return false; this.layers.splice(i, 1); if (this.activeId === id) this.activeId = this.layers[Math.min(i, this.layers.length - 1)].id; return true; }
    moveLayer(id, delta) { const i = this.layers.findIndex(l => l.id === id); const j = clamp(i + delta, 0, this.layers.length - 1); if (i < 0 || i === j) return false; this.layers.splice(j, 0, this.layers.splice(i, 1)[0]); return true; }
    composite() {
      const ctx = this._composite.getContext('2d'); ctx.clearRect(0, 0, this.width, this.height);
      for (const l of this.layers) if (l.visible) { ctx.globalAlpha = clamp(l.opacity, 0, 1); ctx.drawImage(l.canvas, 0, 0); }
      ctx.globalAlpha = 1; return this._composite;
    }
    snapshot() { return { width: this.width, height: this.height, activeId: this.activeId, layers: this.layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, image: l.canvas.getContext('2d').getImageData(0, 0, this.width, this.height) })) }; }
    restore(s) {
      dimensions(s.width, s.height); this._stroke = null; this.width = s.width; this.height = s.height;
      this._composite = createCanvas(this.width, this.height);
      this.layers = s.layers.map(l => { const canvas = createCanvas(this.width, this.height); canvas.getContext('2d').putImageData(l.image, 0, 0); return { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, canvas }; }); this.activeId = s.activeId;
    }
    _trimHistory() {
      const bytes = s => s.layers.reduce((n, l) => n + l.image.data.byteLength, 0);
      let total = [...this._undo, ...this._redo].reduce((n, entry) => n + bytes(entry.state), 0);
      while (this._undo.length + this._redo.length > 30 || total > 128 * 1024 * 1024) {
        const queue = this._undo.length ? this._undo : this._redo; if (!queue.length) break; total -= bytes(queue.shift().state);
      }
    }
    checkpoint(label = 'Edit') { this._redo = []; this._undo.push({ label, state: this.snapshot() }); this._trimHistory(); }
    undo() { if (!this.canUndo) return false; const entry = this._undo.pop(); this._redo.push({ label: entry.label, state: this.snapshot() }); this.restore(entry.state); this._trimHistory(); return true; }
    redo() { if (!this.canRedo) return false; const entry = this._redo.pop(); this._undo.push({ label: entry.label, state: this.snapshot() }); this.restore(entry.state); this._trimHistory(); return true; }
    beginStroke(options, point) {
      if (this._stroke) this.cancelStroke();
      rgba(options.color || '#000000');
      const opts = { tool: 'brush', color: '#000000', size: 12, opacity: 1, filled: false, ...options };
      opts.size = clamp(Number(opts.size) || 1, 1, Math.min(512, 2 * Math.hypot(this.width, this.height))); opts.opacity = clamp(Number(opts.opacity) || 0, 0, 1);
      if (!['brush', 'pencil', 'eraser', 'line', 'rectangle', 'ellipse'].includes(opts.tool)) throw new Error('Unknown drawing tool.');
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const start = { x: mod(point.x, this.width), y: mod(point.y, this.height) };
      this._stroke = { opts, layer: this.active, base: copy(this.active.canvas), coverage: createCanvas(this.width, this.height), start, lastRaw: { ...point }, origin: { x: point.x - start.x, y: point.y - start.y } };
      this._draw(start, start); this._applyStroke();
    }
    strokeTo(point) {
      const s = this._stroke; if (!s || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const shape = ['line', 'rectangle', 'ellipse'].includes(s.opts.tool);
      if (shape) {
        s.coverage.getContext('2d').clearRect(0, 0, this.width, this.height);
        const p = { x: point.x - s.origin.x, y: point.y - s.origin.y };
        if (s.opts.tool === 'line') this._segment(s.start, p);
        else {
          // Bound pathological programmatic inputs. Ordinary canvas drags retain their full extent.
          const copies = (Math.abs(p.x - s.start.x) / this.width + 4) * (Math.abs(p.y - s.start.y) / this.height + 4);
          if (copies <= 65536) this._draw(s.start, p);
        }
      } else this._segment(s.lastRaw, point);
      s.lastRaw = { ...point }; this._applyStroke();
    }
    _segment(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      // Rebase every short segment instead of clamping the full stroke to its starting tile.
      // A 16,384-pixel single event guard bounds malformed input without limiting stroke length.
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 16384) return;
      const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx) / this.width, Math.abs(dy) / this.height)));
      for (let i = 0; i < count; i++) {
        const x = a.x + dx * i / count, y = a.y + dy * i / count;
        const start = { x: mod(x, this.width), y: mod(y, this.height) };
        const endX = i + 1 === count ? b.x : a.x + dx * (i + 1) / count;
        const endY = i + 1 === count ? b.y : a.y + dy * (i + 1) / count;
        this._draw(start, { x: endX - Math.floor(x / this.width) * this.width, y: endY - Math.floor(y / this.height) * this.height });
      }
    }
    _draw(a, b) {
      const s = this._stroke, o = s.opts, ctx = s.coverage.getContext('2d');
      const radius = o.size / 2 + 2, w = this.width, h = this.height;
      // More distant periodic copies cannot improve coverage over a nearer copy along that axis.
      const padX = Math.min(radius, w), padY = Math.min(radius, h);
      const minX = Math.ceil((-Math.max(a.x, b.x) - padX) / w), maxX = Math.floor((w - Math.min(a.x, b.x) + padX) / w);
      const minY = Math.ceil((-Math.max(a.y, b.y) - padY) / h), maxY = Math.floor((h - Math.min(a.y, b.y) + padY) / h);
      ctx.fillStyle = o.color; ctx.strokeStyle = o.color; ctx.lineWidth = o.size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // Large tips on tiny tiles cover the whole tile; avoid thousands of redundant copies.
      if (['brush', 'eraser', 'pencil'].includes(o.tool) && o.size >= Math.hypot(w, h) * 2) { ctx.fillRect(0, 0, w, h); return; }
      for (let ix = minX; ix <= maxX; ix++) for (let iy = minY; iy <= maxY; iy++) {
        const ax = a.x + ix * w, ay = a.y + iy * h, bx = b.x + ix * w, by = b.y + iy * h;
        if (o.tool === 'pencil') {
          const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
          const size = Math.max(1, Math.round(o.size));
          for (let i = 0; i <= steps; i++) { const t = steps ? i / steps : 0; ctx.fillRect(Math.floor(ax + (bx - ax) * t) - Math.floor(size / 2), Math.floor(ay + (by - ay) * t) - Math.floor(size / 2), size, size); }
        } else if (o.tool === 'rectangle') {
          const x = Math.min(ax, bx), y = Math.min(ay, by), rw = Math.abs(bx - ax), rh = Math.abs(by - ay);
          if (o.filled) ctx.fillRect(x, y, rw, rh); else ctx.strokeRect(x, y, rw, rh);
        } else if (o.tool === 'ellipse') {
          ctx.beginPath(); ctx.ellipse((ax + bx) / 2, (ay + by) / 2, Math.abs(bx - ax) / 2, Math.abs(by - ay) / 2, 0, 0, Math.PI * 2); if (o.filled) ctx.fill(); else ctx.stroke();
        } else { ctx.beginPath(); if (ax === bx && ay === by) { ctx.arc(ax, ay, o.size / 2, 0, Math.PI * 2); ctx.fill(); } else { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); } }
      }
    }
    _applyStroke() { const s = this._stroke, ctx = s.layer.canvas.getContext('2d'); ctx.clearRect(0, 0, this.width, this.height); ctx.drawImage(s.base, 0, 0); ctx.save(); ctx.globalAlpha = s.opts.opacity; ctx.globalCompositeOperation = s.opts.tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.drawImage(s.coverage, 0, 0); ctx.restore(); }
    endStroke() { const changed = !!this._stroke; this._stroke = null; return changed; }
    cancelStroke() { const s = this._stroke; if (!s) return; const ctx = s.layer.canvas.getContext('2d'); ctx.clearRect(0, 0, this.width, this.height); ctx.drawImage(s.base, 0, 0); this._stroke = null; }
    fill(x, y, color, opacity = 1, tolerance = 0) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(opacity)) return;
      const rgb = rgba(color), w = this.width, h = this.height, ctx = this.active.canvas.getContext('2d'), image = ctx.getImageData(0, 0, w, h), data = image.data;
      const first = Math.floor(mod(y, h)) * w + Math.floor(mod(x, w)), target = [...data.slice(first * 4, first * 4 + 4)];
      const seen = new Uint8Array(w * h), queue = new Int32Array(w * h); let head = 0, tail = 1; queue[0] = first; seen[first] = 1; opacity = clamp(opacity, 0, 1);
      while (head < tail) {
        const pixel = queue[head++], i = pixel * 4;
        if (Math.max(...target.map((v, c) => Math.abs(v - data[i + c]))) > tolerance) continue;
        const oldAlpha = data[i + 3] / 255, newAlpha = opacity + oldAlpha * (1 - opacity);
        for (let c = 0; c < 3; c++) data[i + c] = newAlpha ? Math.round((rgb[c] * opacity + data[i + c] * oldAlpha * (1 - opacity)) / newAlpha) : 0;
        data[i + 3] = Math.round(newAlpha * 255);
        const px = pixel % w, py = Math.floor(pixel / w);
        const neighbors = [py * w + mod(px - 1, w), py * w + mod(px + 1, w), mod(py - 1, h) * w + px, mod(py + 1, h) * w + px];
        for (const n of neighbors) if (!seen[n]) { seen[n] = 1; queue[tail++] = n; }
      }
    ctx.putImageData(image, 0, 0);
    }
    pick(x, y) { return [...this.composite().getContext('2d').getImageData(Math.floor(mod(x, this.width)), Math.floor(mod(y, this.height)), 1, 1).data]; }
    async toProject(name = 'Untitled') { return { format: 'tilesmith', version: 1, name: String(name).slice(0, 100), width: this.width, height: this.height, activeId: this.activeId, layers: this.layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, png: l.canvas.toDataURL('image/png') })) }; }
    static async fromProject(data) {
      if (!data || data.format !== 'tilesmith' || data.version !== 1) throw new Error('This is not a supported TileSmith project.');
      dimensions(data.width, data.height);
      if (!Array.isArray(data.layers) || data.layers.length < 1 || data.layers.length > 8) throw new Error('Project must contain 1 to 8 layers.');
      const ids = new Set();
      for (const l of data.layers) {
        if (!l || typeof l.id !== 'string' || l.id.length > 100 || ids.has(l.id) || typeof l.name !== 'string' || l.name.length > 100 || typeof l.visible !== 'boolean' || !Number.isFinite(l.opacity) || l.opacity < 0 || l.opacity > 1 || typeof l.png !== 'string' || !l.png.startsWith('data:image/png;base64,') || l.png.length > 24 * 1024 * 1024) throw new Error('Project contains an invalid layer.');
        ids.add(l.id);
      }
      if (!ids.has(data.activeId)) throw new Error('Project active layer is invalid.');
      const result = new TileDocument(data.width, data.height, 'transparent'); result.layers = [];
      for (const l of data.layers) {
        // Check dimensions before image decoding so a forged tiny project cannot decode an enormous PNG.
        let header;
        try { header = Uint8Array.from(atob(l.png.slice(22, 66)), c => c.charCodeAt(0)); } catch { throw new Error('A layer has an invalid PNG header.'); }
        if (header.length < 24 || [137, 80, 78, 71, 13, 10, 26, 10].some((v, i) => header[i] !== v)) throw new Error('A layer has an invalid PNG header.');
        const view = new DataView(header.buffer);
        if (view.getUint32(16) !== data.width || view.getUint32(20) !== data.height) throw new Error('Layer dimensions do not match the project.');
        const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('A layer image could not be read.')); img.src = l.png; });
        if (image.width !== data.width || image.height !== data.height) throw new Error('Layer dimensions do not match the project.');
        const canvas = createCanvas(data.width, data.height); canvas.getContext('2d').drawImage(image, 0, 0);
        result.layers.push({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, canvas });
      }
      result.activeId = data.activeId;
      for (const id of ids) { const match = /^layer-(\d+)$/.exec(id); if (match && Number.isSafeInteger(Number(match[1]))) serial = Math.max(serial, Number(match[1])); }
      return { document: result, name: typeof data.name === 'string' ? data.name.slice(0, 100) : 'Untitled' };
    }
  }
  window.TileEngine = { Document: TileDocument, createCanvas, mod };
})();
