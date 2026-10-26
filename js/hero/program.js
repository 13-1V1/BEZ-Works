// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// The BEZ WORKS nameplate job: a real Fanuc-style G-code program (inches) and
// the timeline the hero plays back. 8.0 x 4.0 6061 plate, three tools:
//   T1 2.0 face mill   -> face the top .010
//   T2 1/8 90 deg engraver -> light etch .005 (border, letters, swoosh)
//   T3 3/32 end mill   -> final etch .020 (letters, swoosh)
// Work zero: X0 Y0 = lower-left corner of the plate, Z0 = top of the plate.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const PLATE = { w: 8, h: 4 };
  const HOME_Z = 2;          // where G28 Z sends the spindle (for the picture)
  const CLEAR_Z = 0.1;

  const TOOLS = {
    1: { name: '2.0 FACE MILL', kind: 'face', dia: 2.0, s: 6000, f: 60 },
    2: { name: '1/8 90° ENGRAVER', kind: 'engraver', dia: 0.125, s: 10000, f: 30 },
    3: { name: '3/32 END MILL', kind: 'endmill', dia: 0.094, s: 9000, f: 20 },
  };

  // screen-time speeds (in/s) — the picture, not the real feed
  const SPEED = { rapid: 14, z: 6, face: 7, light: 9, final: 4.2 };
  const EVENT = { load: 2.4, change: 2.6 };

  // ---- single-stroke glyphs, 1.0 tall, origin lower-left ----
  const GLYPHS = {
    B: [[{ m: [0, 0] }, { l: [0, 1] }, { l: [0.33, 1] }, { a: [0.33, 0.5], c: [0.33, 0.75], cw: true },
      { l: [0, 0.5] }, { l: [0.36, 0.5] }, { a: [0.36, 0], c: [0.36, 0.25], cw: true }, { l: [0, 0] }]],
    E: [[{ m: [0.6, 1] }, { l: [0, 1] }, { l: [0, 0] }, { l: [0.6, 0] }], [{ m: [0, 0.5] }, { l: [0.45, 0.5] }]],
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
  const ADVANCE = { B: 0.62, E: 0.6, Z: 0.6, W: 0.7, O: 0.6, R: 0.6, K: 0.6, S: 0.6 };

  // A word as strokes, placed at (x, y) with height h and gap g between letters
  function word(text, x, y, h, g) {
    const out = [];
    let cx = x;
    for (const ch of text) {
      for (const st of GLYPHS[ch]) {
        out.push(st.map((op) => {
          if (op.m) return { m: [cx + op.m[0] * h, y + op.m[1] * h] };
          if (op.l) return { l: [cx + op.l[0] * h, y + op.l[1] * h] };
          return { a: [cx + op.a[0] * h, y + op.a[1] * h], c: [cx + op.c[0] * h, y + op.c[1] * h], cw: op.cw };
        }));
      }
      cx += ADVANCE[ch] * h + g;
    }
    return out;
  }
  function wordWidth(text, h, g) {
    let w = 0;
    for (const ch of text) w += ADVANCE[ch] * h;
    // last letter's advance overshoots its ink a little; trim to look centered
    return w + g * (text.length - 1) - 0.02 * h;
  }

  // ---- the nameplate design ----
  function design() {
    const midX = PLATE.w / 2;

    const frame = [[
      { m: [0.6, 0.3] }, { l: [7.4, 0.3] }, { a: [7.7, 0.6], c: [7.4, 0.6], cw: false },
      { l: [7.7, 3.4] }, { a: [7.4, 3.7], c: [7.4, 3.4], cw: false },
      { l: [0.6, 3.7] }, { a: [0.3, 3.4], c: [0.6, 3.4], cw: false },
      { l: [0.3, 0.6] }, { a: [0.6, 0.3], c: [0.6, 0.6], cw: false },
    ]];

    const bezH = 1.35, bezG = 0.32;
    const bez = word('BEZ', midX - wordWidth('BEZ', bezH, bezG) / 2, 1.95, bezH, bezG);

    // swoosh: a long, shallow smile between the words (one G03)
    const sx0 = 1.1, sx1 = 6.9, sy = 1.62, sag = 0.14;
    const half = (sx1 - sx0) / 2;
    const r = (half * half + sag * sag) / (2 * sag);
    const swoosh = [[{ m: [sx0, sy] }, { a: [sx1, sy], c: [midX, sy - sag + r], cw: false }]];

    const wH = 0.6, wG = 0.2;
    const wW = wordWidth('WORKS', wH, wG);
    const works = word('WORKS', midX - wW / 2, 0.75, wH, wG);

    const dia = (cx, cy, d) => [{ m: [cx, cy + d] }, { l: [cx + d, cy] }, { l: [cx, cy - d] }, { l: [cx - d, cy] }, { l: [cx, cy + d] }];
    const gems = [dia(midX - wW / 2 - 0.34, 1.05, 0.1), dia(midX + wW / 2 + 0.34, 1.05, 0.1)];

    return {
      light: [...frame, ...bez, ...swoosh, ...works, ...gems],
      final: [...bez, ...swoosh, ...works, ...gems],
    };
  }

  // Fanuc-style numbers: 2 -> "2.", 0.25 -> "0.25", -0.005 -> "-0.005"
  function n(v) {
    const s = (Math.round(v * 10000) / 10000).toFixed(4).replace(/0+$/, '');
    return s === '-0.' ? '0.' : s;
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
    const lines = [];
    const moves = [];
    let pos = { x: PLATE.w + 1.2, y: PLATE.h / 2, z: HOME_Z };
    let tool = 3;            // the last cycle ended holding T3
    let op = null, coolant = false, spindle = 0, feed = 0;

    const emit = (t) => { lines.push(t); return lines.length - 1; };
    const push = (type, to, line, extra = {}) => {
      const m = { type, line, from: { ...pos }, to: { ...pos, ...to }, tool, op, coolant, spindle, feed, ...extra };
      if (type === 'arc') m.len = m.arc.r * m.arc.sweep;
      else m.len = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y, m.to.z - m.from.z);
      const sp = type === 'rapid' ? SPEED.rapid : type === 'z' ? SPEED.z : SPEED[op] || SPEED.light;
      m.dur = extra.dur || Math.max(m.len / sp, 0.06);
      moves.push(m);
      pos = { ...m.to };
      return m;
    };

    const toolChange = (t) => {
      const li = emit(`T${t} M06`);
      push('change', {}, li, { fromTool: tool, toTool: t, dur: EVENT.change });
      tool = t;
      moves[moves.length - 1].tool = t;
    };

    const cutStrokes = (strokes, depth, plungeF, cutF) => {
      let first = true;
      for (const st of strokes) {
        const [sx, sy] = st[0].m;
        if (pos.z < CLEAR_Z - 1e-6) push('z', { z: CLEAR_Z }, emit(`G00 Z${n(CLEAR_Z)}`));
        push('rapid', { x: sx, y: sy }, emit(`G00 X${n(sx)} Y${n(sy)}`));
        feed = plungeF;
        push('z', { z: depth }, emit(`G01 Z${n(depth)} F${n(plungeF)}`), { plunge: true });
        let cx = sx, cy = sy;
        for (const o of st.slice(1)) {
          const f = first ? ` F${n(cutF)}` : '';
          feed = cutF;
          if (o.l) {
            push('cut', { x: o.l[0], y: o.l[1] }, emit(`G01 X${n(o.l[0])} Y${n(o.l[1])}${f}`));
            [cx, cy] = o.l;
          } else {
            const [tx, ty] = o.a, [ccx, ccy] = o.c;
            push('arc', { x: tx, y: ty }, emit(`${o.cw ? 'G02' : 'G03'} X${n(tx)} Y${n(ty)} I${n(ccx - cx)} J${n(ccy - cy)}${f}`),
              { center: { x: ccx, y: ccy }, arc: arcInfo([cx, cy], [tx, ty], [ccx, ccy], o.cw) });
            [cx, cy] = [tx, ty];
          }
          first = false;
        }
      }
    };

    const startTool = (t, x, y) => {
      spindle = TOOLS[t].s;
      push('rapid', { x, y }, emit(`G00 G54 X${n(x)} Y${n(y)} S${TOOLS[t].s} M03`), { fromTC: true });
      coolant = true;
      push('z', { z: CLEAR_Z }, emit(`G43 H0${t} Z${n(CLEAR_Z)} M08`));
    };

    const endTool = () => {
      push('z', { z: 1 }, emit('G00 Z1. M09'));
      coolant = false;
      push('z', { z: HOME_Z }, emit('G28 G91 Z0. M05'));
      spindle = 0; feed = 0;
      emit('G90');
    };

    const d = design();

    emit('%');
    emit('O1013 (BEZ WORKS NAMEPLATE)');
    emit('(6061 PLATE 8.0 X 4.0 X 0.5)');
    emit('(T1 2.0 FACE MILL)');
    emit('(T2 1/8 90 DEG ENGRAVER)');
    emit('(T3 3/32 END MILL)');
    emit('G20 G17 G40 G49 G80 G90');
    push('load', {}, emit('M60 (LOAD NEW BLANK)'), { dur: EVENT.load });

    // --- face the top: three zigzag passes, 65% step-over ---
    emit('(FACE TOP .010)');
    toolChange(1);
    op = 'face';
    startTool(1, -1.2, 3.3);
    feed = 20;
    push('z', { z: -0.01 }, emit('G01 Z-0.01 F20.'), { plunge: true });
    feed = 60;
    push('cut', { x: 9.2 }, emit('G01 X9.2 F60.'));
    push('cut', { y: 2 }, emit('G01 Y2.'));
    push('cut', { x: -1.2 }, emit('G01 X-1.2'));
    push('cut', { y: 0.7 }, emit('G01 Y0.7'));
    push('cut', { x: 9.2 }, emit('G01 X9.2'));
    endTool();

    // --- light etch: everything, .005 deep ---
    emit('(LIGHT ETCH .005)');
    toolChange(2);
    op = 'light';
    startTool(2, d.light[0][0].m[0], d.light[0][0].m[1]);
    cutStrokes(d.light, -0.005, 10, 30);
    endTool();

    // --- final etch: letters, swoosh, gems, .020 deep ---
    emit('(FINAL ETCH .020)');
    toolChange(3);
    op = 'final';
    startTool(3, d.final[0][0].m[0], d.final[0][0].m[1]);
    cutStrokes(d.final, -0.02, 8, 20);
    endTool();
    op = null;
    push('rapid', {}, emit('G28 G91 X0. Y0. (PARK)'), { toTC: true, dur: 0.8 });
    emit('G90');

    emit('M30');
    emit('%');

    let t = 0;
    for (const m of moves) { m.t0 = t; t += m.dur; }
    return { lines, moves, duration: t, tools: TOOLS, plate: PLATE, homeZ: HOME_Z, design: d };
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

  BEZ.program = { build, at, arcInfo };
})(window.BEZ);
