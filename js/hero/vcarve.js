// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// V-carve CAM for the nameplate. The design is drawn as solid shapes with a
// real font; the toolpath is each shape's centerline (a thinned skeleton),
// and the V-bit's depth at every point is set by how far that point is from
// the edge — so the cone exactly fills the letter, leaving sharp ridges into
// the corners. Also renders the finished carved look (faceted walls) at any
// scale, used to reveal the carving behind the bit.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const PLATE = { w: 8, h: 4 };
  const FONT = '"Big Shoulders Display", "Arial Narrow", sans-serif';

  // ---- the design, drawn at s px per inch (y down, origin top-left) ----
  function ticket(g, s, x0, y0, x1, y1, k) {
    g.beginPath();
    g.moveTo((x0 + k) * s, y0 * s); g.lineTo((x1 - k) * s, y0 * s);
    g.arc(x1 * s, y0 * s, k * s, Math.PI, Math.PI / 2, true);
    g.lineTo(x1 * s, (y1 - k) * s);
    g.arc(x1 * s, y1 * s, k * s, -Math.PI / 2, Math.PI, true);
    g.lineTo((x0 + k) * s, y1 * s);
    g.arc(x0 * s, y1 * s, k * s, 0, -Math.PI / 2, true);
    g.lineTo(x0 * s, (y0 + k) * s);
    g.arc(x0 * s, y0 * s, k * s, Math.PI / 2, 0, true);
    g.closePath();
  }

  // group 'bold' = BEZ + swoosh, 'fine' = WORKS + gems + inner border
  function drawGroup(g, s, group) {
    g.fillStyle = '#000'; g.strokeStyle = '#000';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    if (group === 'bold') {
      g.font = `900 ${1.74 * s}px ${FONT}`;
      g.letterSpacing = `${0.1 * s}px`;
      g.fillText('BEZ', 4.05 * s, 2.17 * s);
      g.letterSpacing = '0px';
      g.lineCap = 'round'; g.lineWidth = 0.12 * s;
      g.beginPath(); g.moveTo(1.27 * s, 2.46 * s); g.quadraticCurveTo(4 * s, 2.7 * s, 6.73 * s, 2.46 * s); g.stroke();
    } else {
      g.font = `800 ${0.62 * s}px ${FONT}`;
      g.letterSpacing = `${0.21 * s}px`;
      g.fillText('WORKS', 4.11 * s, 3.3 * s);
      g.letterSpacing = '0px';
      for (const cx of [4 - 1.68, 4 + 1.68]) {
        g.beginPath();
        g.moveTo(cx * s, 2.95 * s); g.lineTo((cx + 0.13) * s, 3.08 * s);
        g.lineTo(cx * s, 3.21 * s); g.lineTo((cx - 0.13) * s, 3.08 * s); g.closePath(); g.fill();
      }
      g.lineWidth = 0.045 * s;
      ticket(g, s, 0.43, 0.43, 7.57, 3.57, 0.25); g.stroke();
    }
  }

  function maskCanvas(w, h, s, groups) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (const grp of groups) drawGroup(g, s, grp);
    return c;
  }

  // ---- exact Euclidean distance to the nearest background pixel ----
  // (Felzenszwalb & Huttenlocher: 1D squared-distance passes on columns, then rows)
  function edt1(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let sv;
      while (true) {
        const r = v[k];
        sv = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
        if (sv <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
      }
      k++; v[k] = q; z[k] = sv; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      d[q] = (q - r) * (q - r) + f[r];
    }
  }
  function distance(mask, w, h) {
    const INF = 1e12, n = Math.max(w, h);
    const g = new Float64Array(w * h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let i = 0; i < w * h; i++) g[i] = mask[i] ? INF : 0;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = g[y * w + x];
      edt1(f, h, d, v, z);
      for (let y = 0; y < h; y++) g[y * w + x] = d[y];
    }
    const D = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = g[y * w + x];
      edt1(f, w, d, v, z);
      for (let x = 0; x < w; x++) D[y * w + x] = Math.sqrt(d[x]);
    }
    return D;
  }

  function blur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), k = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / k;
        acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / k;
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  // ---- Zhang-Suen thinning: shapes -> 1-pixel centerlines ----
  function thin(mask, w, h) {
    const m = Uint8Array.from(mask);
    const del = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        del.length = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = y * w + x; if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1];
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
          if (A !== 1) continue;
          if (pass === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          del.push(i);
        }
        if (del.length) { changed = true; for (const i of del) m[i] = 0; }
      }
    }
    return m;
  }

  const N8 = (w) => [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];

  // ---- skeleton pixels -> polylines ----
  // A pixel is a junction or an end by its crossing number (0->1 transitions
  // around it), so diagonal stair-steps don't break a stroke into pieces.
  function trace(sk, w, h) {
    const ring = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1];     // clockwise from north
    const four = new Set([-w, 1, w, -1]);
    const cross = (i) => { let c = 0; for (let k = 0; k < 8; k++) if (!sk[i + ring[k]] && sk[i + ring[(k + 1) % 8]]) c++; return c; };
    const C = new Uint8Array(w * h);
    for (let i = w + 1; i < w * (h - 1) - 1; i++) if (sk[i]) C[i] = cross(i);
    const isNode = (i) => C[i] !== 2;
    const seen = new Uint8Array(w * h);
    const chains = [];

    const walk = (start, first) => {
      const path = [start, first];
      let prev = start, cur = first;
      while (!isNode(cur) || cur === start) {
        if (cur === start && path.length > 2) break;
        seen[cur] = 1;
        let next = -1;
        for (const pass of [true, false]) {           // prefer straight neighbors over diagonals
          for (const d of ring) {
            if (four.has(d) !== pass) continue;
            const j = cur + d;
            if (!sk[j] || j === prev || (seen[j] && !isNode(j)) || path[path.length - 3] === j) continue;
            next = j; break;
          }
          if (next >= 0) break;
        }
        if (next < 0) break;
        prev = cur; cur = next; path.push(cur);
      }
      return path;
    };

    for (let i = w + 1; i < w * (h - 1) - 1; i++) {
      if (!sk[i] || !isNode(i)) continue;
      for (const d of ring) {
        const j = i + d;
        if (!sk[j] || (seen[j] && !isNode(j))) continue;
        if (isNode(j) && j < i) continue;              // node-to-node link: take it once
        chains.push(walk(i, j));
      }
      seen[i] = 1;
    }
    for (let i = w + 1; i < w * (h - 1) - 1; i++) {    // closed loops with no junctions (O, border)
      if (!sk[i] || seen[i]) continue;
      const j = ring.map((d) => i + d).find((q) => sk[q]);
      if (j == null) continue;
      const p = walk(i, j);
      p.push(i);
      seen[i] = 1;
      chains.push(p);
    }
    return chains.filter((p) => p.length >= 2).map((p) => p.map((i) => ({ x: i % w, y: (i / w) | 0 })));
  }

  // Ramer-Douglas-Peucker on xy, keeping r
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const A = pts[a], B = pts[b];
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
      let best = -1, bd = 0;
      for (let k = a + 1; k < b; k++) {
        const d = Math.abs((pts[k].x - A.x) * dy - (pts[k].y - A.y) * dx) / L + Math.abs(pts[k].r - (A.r + (B.r - A.r) * ((k - a) / (b - a)))) * 0.6;
        if (d > bd) { bd = d; best = k; }
      }
      if (bd > eps) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    return pts.filter((_, k) => keep[k]);
  }

  // Order chains to keep rapids short, flipping a chain when its far end is closer
  function order(chains) {
    const left = chains.slice(), out = [];
    let at = { x: 0, y: 0 };
    while (left.length) {
      let bi = 0, bd = Infinity, flip = false;
      left.forEach((c, i) => {
        const a = c[0], z = c[c.length - 1];
        const da = Math.hypot(a.x - at.x, a.y - at.y), dz = Math.hypot(z.x - at.x, z.y - at.y);
        if (da < bd) { bd = da; bi = i; flip = false; }
        if (dz < bd) { bd = dz; bi = i; flip = true; }
      });
      let c = left.splice(bi, 1)[0];
      if (flip) c = c.slice().reverse();
      out.push(c);
      at = c[c.length - 1];
    }
    return out;
  }

  // Toolpaths in inches for a group, at RES px/in. tanHalf = tan(half the V angle).
  const RES = 100;
  function toolpaths(group, tanHalf, maxDepth) {
    const w = PLATE.w * RES, h = PLATE.h * RES;
    const c = maskCanvas(w, h, RES, [group]);
    const a = c.getContext('2d').getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = a[i * 4 + 3] > 127 ? 1 : 0;
    const D = distance(mask, w, h);
    const sk = thin(mask, w, h);
    const nb = N8(w);
    const isEnd = (q) => { let n = 0; for (const d of nb) if (sk[q.y * w + q.x + d]) n++; return n <= 1; };
    let chains = trace(sk, w, h)
      // drop tiny spurs: short chains that dead-end (pixel jags, not real corners)
      .filter((p) => p.length >= 6 || !(isEnd(p[0]) || isEnd(p[p.length - 1])))
      .map((p) => p.map((q) => ({ x: q.x, y: q.y, r: D[q.y * w + q.x] })))
      .map((p) => {
        // a closed loop starts and ends on the same pixel: simplify it as two halves
        const a = p[0], z = p[p.length - 1];
        if (p.length > 8 && Math.hypot(a.x - z.x, a.y - z.y) < 2) {
          const mid = p.length >> 1;
          return [...simplify(p.slice(0, mid + 1), 0.6).slice(0, -1), ...simplify(p.slice(mid), 0.6)];
        }
        return simplify(p, 0.6);
      });
    chains = order(chains);
    const toIn = (q) => {
      const r = Math.max(0.004, (q.r - 0.35) / RES);
      return { x: (q.x + 0.5) / RES, y: PLATE.h - (q.y + 0.5) / RES, z: -Math.min(maxDepth, r / tanHalf), r };
    };
    const paths = chains.map((p) => p.map(toIn));
    // the diamonds thin down to a dot, so give them their exact V-carve: four ridges
    // from the center (deepest) out to each tip (zero depth)
    if (group === 'fine') {
      for (const cx of [4 - 1.68, 4 + 1.68]) {
        const cy = PLATE.h - 3.08, d = 0.13, rc = d / Math.SQRT2;
        const pt = (t, ax, ay) => {
          const r = rc * (1 - t);
          return { x: cx + ax * d * t, y: cy + ay * d * t, z: -Math.min(maxDepth, r / tanHalf), r };
        };
        const ridge = (ax, ay) => [0, 0.5, 1].map((t) => pt(t, ax, ay));
        paths.push([...ridge(-1, 0).reverse(), ...ridge(1, 0).slice(1)]);
        paths.push([...ridge(0, 1).reverse(), ...ridge(0, -1).slice(1)]);
      }
    }
    // junctions/corners for the finishing glints
    const glints = [];
    for (const p of paths) glints.push(p[0], p[p.length - 1]);
    return { paths, glints };
  }

  // The finished carved look at s px/in (device pixels), transparent outside the cuts.
  // ss = supersampling (2 smooths the walls of shallow curves; 1 for phones).
  function carvedImage(wPx, hPx, s, ss = 2) {
    const big = carvedAt(Math.ceil(wPx * ss), Math.ceil(hPx * ss), s * ss);
    if (ss === 1) return big;
    const out = document.createElement('canvas');
    out.width = Math.ceil(wPx); out.height = Math.ceil(hPx);
    const og = out.getContext('2d');
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.drawImage(big, 0, 0, out.width, out.height);
    return out;
  }

  function carvedAt(w, h, s) {
    const c = maskCanvas(w, h, s, ['bold', 'fine']);
    const g = c.getContext('2d');
    const img = g.getImageData(0, 0, w, h), A = img.data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = A[i * 4 + 3] > 127 ? 1 : 0;
    const D0 = distance(mask, w, h);
    // smooth the depth field (two box passes ~ a small gaussian) so 1-pixel
    // stair-steps in the shape's edge don't show up as notches in the walls
    const rad = Math.max(1, Math.round(s / 170));
    const D = blur(blur(D0, w, h, rad), w, h, rad);
    const L = [-0.6, -0.62, 0.5];
    const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    // slope over a 5-pixel span (smoother than neighbors only)
    const at = (i) => (D[i] || 0);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (!mask[i]) { A[i * 4 + 3] = 0; continue; }
      const gx = (at(i + 1) - at(i - 1)) * 2 + (at(i + 2) - at(i - 2)) + (at(i + w + 1) - at(i + w - 1)) + (at(i - w + 1) - at(i - w - 1));
      const gy = (at(i + w) - at(i - w)) * 2 + (at(i + 2 * w) - at(i - 2 * w)) + (at(i + w + 1) - at(i - w + 1)) + (at(i + w - 1) - at(i - w - 1));
      const gl = Math.hypot(gx, gy);
      let lum;
      if (gl < 1.6) lum = 0.62;                                // ridge / flat bottom
      else {
        const nx = (-gx / gl) * 0.72, ny = (-gy / gl) * 0.72, nz = 0.69;
        lum = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      }
      const spec = Math.pow(Math.max(0, lum - 0.82), 2) * 2200;
      const base = 58 + 190 * Math.pow(lum, 1.6) + spec;
      // faint tool marks across the wall
      const marks = 1 + 0.018 * Math.sin(D[i] * 1.7);
      const v = Math.min(255, base * marks);
      A[i * 4] = Math.min(255, v * 0.94); A[i * 4 + 1] = Math.min(255, v * 1.0); A[i * 4 + 2] = Math.min(255, v * 1.07);
      A[i * 4 + 3] = 255;
    }
    // soften the outer edge by one pixel
    g.putImageData(img, 0, 0);
    return c;
  }

  BEZ.vcarve = { toolpaths, carvedImage, PLATE };
})(window.BEZ);
