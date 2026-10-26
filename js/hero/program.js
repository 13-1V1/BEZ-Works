// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// The BEZ WORKS nameplate job: a real Fanuc-style G-code program (inches) and
// the timeline the hero plays back. 8.0 x 4.0 6061 plate, four tools:
//   T1 2.0 face mill        -> face the top .010
//   T4 1/8 90 deg engraver  -> scribe the outer border .005
//   T2 1/2 90 deg V-bit     -> V-carve BEZ and the swoosh
//   T3 1/4 60 deg V-bit     -> V-carve WORKS, the gems and the inner border
// The V-carve toolpaths come from vcarve.js (centerlines with depth), so those
// moves are true 3-axis G01 X Y Z.
// Work zero: X0 Y0 = lower-left corner of the plate, Z0 = top of the plate.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const PLATE = { w: 8, h: 4 };
  const HOME_Z = 2;          // where G28 Z sends the spindle (for the picture)
  const CLEAR_Z = 0.1;
  const LAST_TOOL = 3;       // the last cycle ended holding T3

  const TOOLS = {
    1: { name: '2.0 FACE MILL', kind: 'face', dia: 2.0, s: 6000 },
    2: { name: '1/2 90° V-BIT', kind: 'vbit', dia: 0.5, tanHalf: 1, s: 12000 },
    3: { name: '1/4 60° V-BIT', kind: 'vbit', dia: 0.25, tanHalf: Math.tan(Math.PI / 6), s: 15000 },
    4: { name: '1/8 90° ENGRAVER', kind: 'engraver', dia: 0.125, s: 10000 },
  };

  // screen-time speeds (in/s) — the picture, not the real feed
  const SPEED = { rapid: 20, z: 9, face: 8, scribe: 12, vbold: 3.4, vfine: 6 };
  const EVENT = { load: 2.4, change: 2.3 };

  // outer border: rounded rectangle, scribed
  const FRAME = [
    { m: [0.6, 0.24] }, { l: [7.4, 0.24] }, { a: [7.76, 0.6], c: [7.4, 0.6], cw: false },
    { l: [7.76, 3.4] }, { a: [7.4, 3.76], c: [7.4, 3.4], cw: false },
    { l: [0.6, 3.76] }, { a: [0.24, 3.4], c: [0.6, 3.4], cw: false },
    { l: [0.24, 0.6] }, { a: [0.6, 0.24], c: [0.6, 0.6], cw: false },
  ];

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

  // carve = { bold: [[{x,y,z}...]...], fine: [...] } from BEZ.vcarve.toolpaths
  function build(carve) {
    const lines = [];
    const moves = [];
    let pos = { x: PLATE.w + 1.2, y: PLATE.h / 2, z: HOME_Z };
    let tool = LAST_TOOL;
    let op = null, spindle = 0, feed = 0, emitFeed = false;

    const emit = (t) => { lines.push(t); return lines.length - 1; };
    const push = (type, to, line, extra = {}) => {
      const m = { type, line, from: { ...pos }, to: { ...pos, ...to }, tool, op, spindle, feed, ...extra };
      if (type === 'arc') m.len = m.arc.r * m.arc.sweep;
      else m.len = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y, m.to.z - m.from.z);
      const sp = type === 'rapid' ? SPEED.rapid : type === 'z' ? SPEED.z : SPEED[op] || SPEED.scribe;
      m.dur = extra.dur || Math.max(m.len / sp, type === 'z' ? 0.035 : 0.03);
      moves.push(m);
      pos = { ...m.to };
      return m;
    };

    const toolChange = (t) => {
      push('change', {}, emit(`T${t} M06`), { fromTool: tool, toTool: t, dur: EVENT.change });
      tool = t;
      moves[moves.length - 1].tool = t;
    };
    const startTool = (t, x, y) => {
      spindle = TOOLS[t].s;
      push('rapid', { x, y }, emit(`G00 G54 X${n(x)} Y${n(y)} S${TOOLS[t].s} M03`), { fromTC: true });
      push('z', { z: CLEAR_Z }, emit(`G43 H0${t} Z${n(CLEAR_Z)}`));
    };
    const endTool = () => {
      push('z', { z: 1 }, emit('G00 Z1.'));
      push('z', { z: HOME_Z }, emit('G28 G91 Z0. M05'));
      spindle = 0; feed = 0;
      emit('G90');
    };

    // 2D strokes at one depth (lines + arcs)
    const scribe = (strokes, depth, plungeF, cutF) => {
      for (const st of strokes) {
        const [sx, sy] = st[0].m;
        if (pos.z < CLEAR_Z - 1e-6) push('z', { z: CLEAR_Z }, emit(`G00 Z${n(CLEAR_Z)}`));
        push('rapid', { x: sx, y: sy }, emit(`G00 X${n(sx)} Y${n(sy)}`));
        feed = plungeF;
        push('z', { z: depth }, emit(`G01 Z${n(depth)} F${n(plungeF)}`), { plunge: true });
        let cx = sx, cy = sy, first = true;
        for (const o of st.slice(1)) {
          const f = first ? ` F${n(cutF)}` : '';
          feed = cutF; first = false;
          if (o.l) {
            push('cut', { x: o.l[0], y: o.l[1] }, emit(`G01 X${n(o.l[0])} Y${n(o.l[1])}${f}`));
            [cx, cy] = o.l;
          } else {
            const [tx, ty] = o.a, [ccx, ccy] = o.c;
            push('arc', { x: tx, y: ty }, emit(`${o.cw ? 'G02' : 'G03'} X${n(tx)} Y${n(ty)} I${n(ccx - cx)} J${n(ccy - cy)}${f}`),
              { center: { x: ccx, y: ccy }, arc: arcInfo([cx, cy], [tx, ty], [ccx, ccy], o.cw) });
            [cx, cy] = [tx, ty];
          }
        }
      }
    };

    // V-carve: 3-axis centerline paths; touching paths are linked without lifting
    const vcarve = (paths, plungeF, cutF) => {
      let cutting = false;
      for (const p of paths) {
        const a = p[0];
        const near = cutting && Math.hypot(a.x - pos.x, a.y - pos.y) < 0.03;
        if (!near) {
          if (pos.z < CLEAR_Z - 1e-6) push('z', { z: CLEAR_Z }, emit(`G00 Z${n(CLEAR_Z)}`));
          push('rapid', { x: a.x, y: a.y }, emit(`G00 X${n(a.x)} Y${n(a.y)}`));
          feed = plungeF;
          push('z', { z: a.z }, emit(`G01 Z${n(a.z)} F${n(plungeF)}`), { plunge: true });
          feed = cutF;
          emitFeed = true;
        } else {
          push('cut', { x: a.x, y: a.y, z: a.z }, emit(`G01 X${n(a.x)} Y${n(a.y)} Z${n(a.z)}`));
        }
        for (const q of p.slice(1)) {
          const f = emitFeed ? ` F${n(cutF)}` : '';
          emitFeed = false;
          push('cut', { x: q.x, y: q.y, z: q.z }, emit(`G01 X${n(q.x)} Y${n(q.y)} Z${n(q.z)}${f}`));
        }
        cutting = true;
      }
    };

    emit('%');
    emit('O1013 (BEZ WORKS NAMEPLATE)');
    emit('(6061 PLATE 8.0 X 4.0 X 0.5)');
    emit('(T1 2.0 FACE MILL)');
    emit('(T2 1/2 90 DEG V-BIT)');
    emit('(T3 1/4 60 DEG V-BIT)');
    emit('(T4 1/8 90 DEG ENGRAVER)');
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

    // --- scribe the outer border ---
    emit('(SCRIBE BORDER .005)');
    toolChange(4);
    op = 'scribe';
    startTool(4, FRAME[0].m[0], FRAME[0].m[1]);
    scribe([FRAME], -0.005, 10, 40);
    endTool();

    // --- V-carve BEZ and the swoosh ---
    emit('(V-CARVE BEZ)');
    toolChange(2);
    op = 'vbold';
    startTool(2, carve.bold[0][0].x, carve.bold[0][0].y);
    vcarve(carve.bold, 10, 30);
    endTool();

    // --- V-carve WORKS, gems and inner border ---
    emit('(V-CARVE WORKS AND BORDER)');
    toolChange(3);
    op = 'vfine';
    startTool(3, carve.fine[0][0].x, carve.fine[0][0].y);
    vcarve(carve.fine, 10, 25);
    endTool();
    op = null;

    push('rapid', {}, emit('G28 G91 X0. Y0. (PARK)'), { toTC: true, dur: 0.8 });
    emit('G90');
    emit('M30');
    emit('%');

    let t = 0;
    for (const m of moves) { m.t0 = t; t += m.dur; }
    return { lines, moves, duration: t, tools: TOOLS, plate: PLATE, homeZ: HOME_Z, lastTool: LAST_TOOL };
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

  BEZ.program = { build, at, arcInfo, TOOLS };
})(window.BEZ);
