// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// Single-stroke engraving letters for "BEZ WORKS", turned into a real Fanuc
// G-code program (inches, G20) and a timeline the hero animation plays back.
// Letter cell: 1.000 in tall, origin at the lower-left corner.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const SAFE_Z = 0.1;
  const CUT_Z = -0.02;
  const PLUNGE_F = 10;   // in/min, shown in the program
  const CUT_F = 40;      // in/min, shown in the program

  // Playback speeds for the animation (in/s of screen time, not real feed)
  const SPEED = { cut: 3.0, rapid: 9.0, z: 1.2 };

  // Each glyph = list of strokes. A stroke starts with {m:[x,y]} then
  // {l:[x,y]} lines or {a:[x,y], c:[cx,cy], cw:true|false} arcs.
  const GLYPHS = {
    B: [[{ m: [0, 0] }, { l: [0, 1] }, { l: [0.33, 1] }, { a: [0.33, 0.5], c: [0.33, 0.75], cw: true },
      { l: [0, 0.5] }, { l: [0.36, 0.5] }, { a: [0.36, 0], c: [0.36, 0.25], cw: true }, { l: [0, 0] }]],
    E: [[{ m: [0.6, 1] }, { l: [0, 1] }, { l: [0, 0] }, { l: [0.6, 0] }],
      [{ m: [0, 0.5] }, { l: [0.45, 0.5] }]],
    Z: [[{ m: [0, 1] }, { l: [0.6, 1] }, { l: [0, 0] }, { l: [0.6, 0] }]],
    W: [[{ m: [0, 1] }, { l: [0.17, 0] }, { l: [0.35, 0.62] }, { l: [0.53, 0] }, { l: [0.7, 1] }]],
    O: [[{ m: [0, 0.3] }, { l: [0, 0.7] }, { a: [0.6, 0.7], c: [0.3, 0.7], cw: true },
      { l: [0.6, 0.3] }, { a: [0, 0.3], c: [0.3, 0.3], cw: true }]],
    R: [[{ m: [0, 0] }, { l: [0, 1] }, { l: [0.33, 1] }, { a: [0.33, 0.5], c: [0.33, 0.75], cw: true }, { l: [0, 0.5] }],
      [{ m: [0.3, 0.5] }, { l: [0.6, 0] }]],
    K: [[{ m: [0, 0] }, { l: [0, 1] }], [{ m: [0.6, 1] }, { l: [0, 0.38] }], [{ m: [0.2, 0.58] }, { l: [0.6, 0] }]],
    S: [[{ m: [0.5165, 0.875] }, { a: [0.3, 0.5], c: [0.3, 0.75], cw: false },
      { a: [0.0835, 0.125], c: [0.3, 0.25], cw: true }]],
  };

  // Where each letter sits on the plate (inches)
  const LAYOUT = [['B', 0], ['E', 0.85], ['Z', 1.7], ['W', 2.85], ['O', 3.8], ['R', 4.65], ['K', 5.45], ['S', 6.25]];
  const WIDTH = 6.85;
  const HEIGHT = 1;

  // Fanuc-style number: 0.85 -> "0.85", 2 -> "2.", 0 -> "0."
  function n(v) {
    const s = (Math.round(v * 10000) / 10000).toFixed(4).replace(/0+$/, '');
    return s.endsWith('.') ? s : s;
  }

  function arcInfo(from, to, c, cw) {
    const r = Math.hypot(from[0] - c[0], from[1] - c[1]);
    const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    const a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
    let sweep = cw ? a0 - a1 : a1 - a0;
    sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (sweep < 1e-6) sweep = 2 * Math.PI;
    return { r, a0, sweep, dir: cw ? -1 : 1 };
  }

  function build() {
    const lines = [];       // program text
    const moves = [];       // timeline
    let pos = { x: 0, y: 0, z: 1 };
    const emit = (text) => { lines.push(text); return lines.length - 1; };

    const add = (type, to, extra) => {
      const from = { ...pos };
      const m = { type, from, to: { ...pos, ...to }, ...extra };
      const dx = m.to.x - from.x, dy = m.to.y - from.y, dz = m.to.z - from.z;
      if (type === 'arc') m.len = m.arc.r * m.arc.sweep;
      else m.len = Math.hypot(dx, dy, dz);
      const sp = type === 'rapid' ? SPEED.rapid : (type === 'plunge' || type === 'retract') ? SPEED.z : SPEED.cut;
      m.dur = Math.max(m.len / sp, 0.05);
      moves.push(m);
      pos = { ...m.to };
    };

    emit('%');
    emit('O1013 (BEZ WORKS)');
    emit('(T1 = 1/16 ENGRAVER, INCH)');
    emit('G20 G17 G40 G49 G80 G90');
    emit('T1 M06');
    let li = emit('G00 G54 X0. Y0. S8000 M03');
    add('rapid', { x: 0, y: 0 }, { line: li });
    li = emit(`G43 H01 Z${n(SAFE_Z)} M08`);
    add('retract', { z: SAFE_Z }, { line: li });

    let firstCut = true;
    for (const [ch, ox] of LAYOUT) {
      for (const stroke of GLYPHS[ch]) {
        const start = stroke[0].m;
        const sx = start[0] + ox, sy = start[1];
        if (pos.z < SAFE_Z) { li = emit(`G00 Z${n(SAFE_Z)}`); add('retract', { z: SAFE_Z }, { line: li }); }
        li = emit(`G00 X${n(sx)} Y${n(sy)}`);
        add('rapid', { x: sx, y: sy }, { line: li });
        li = emit(`G01 Z${n(CUT_Z)} F${n(PLUNGE_F)}`);
        add('plunge', { z: CUT_Z }, { line: li });

        let cx = sx, cy = sy;
        for (const op of stroke.slice(1)) {
          const feed = firstCut ? ` F${n(CUT_F)}` : '';
          if (op.l) {
            const tx = op.l[0] + ox, ty = op.l[1];
            li = emit(`G01 X${n(tx)} Y${n(ty)}${feed}`);
            add('line', { x: tx, y: ty }, { line: li });
            cx = tx; cy = ty;
          } else {
            const tx = op.a[0] + ox, ty = op.a[1];
            const ccx = op.c[0] + ox, ccy = op.c[1];
            const i = ccx - cx, j = ccy - cy;
            li = emit(`${op.cw ? 'G02' : 'G03'} X${n(tx)} Y${n(ty)} I${n(i)} J${n(j)}${feed}`);
            add('arc', { x: tx, y: ty }, { line: li, center: { x: ccx, y: ccy }, arc: arcInfo([cx, cy], [tx, ty], [ccx, ccy], op.cw) });
            cx = tx; cy = ty;
          }
          firstCut = false;
        }
      }
    }

    li = emit('G00 Z1. M09');
    add('retract', { z: 1 }, { line: li });
    li = emit('G28 G91 Z0. M05');
    emit('G90 G00 X0. Y0.');
    add('rapid', { x: 0, y: 0 }, { line: li + 1 });
    emit('M30');
    emit('%');

    let t = 0;
    for (const m of moves) { m.t0 = t; t += m.dur; }
    return { lines, moves, duration: t, width: WIDTH, height: HEIGHT, cutZ: CUT_Z };
  }

  // Tool position part-way (u = 0..1) through a move
  function at(m, u) {
    if (m.type === 'arc') {
      const a = m.arc.a0 + m.arc.dir * m.arc.sweep * u;
      return { x: m.center.x + m.arc.r * Math.cos(a), y: m.center.y + m.arc.r * Math.sin(a), z: m.from.z };
    }
    return {
      x: m.from.x + (m.to.x - m.from.x) * u,
      y: m.from.y + (m.to.y - m.from.y) * u,
      z: m.from.z + (m.to.z - m.from.z) * u,
    };
  }

  BEZ.toolpath = { build, at };
})(window.BEZ);
