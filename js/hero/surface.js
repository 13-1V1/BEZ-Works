// Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
//
// WebGL fragment shader: a dark-anodized, fly-cut aluminum plate. Each pixel
// works out which cutter arc passed through it, takes the groove direction,
// and lights it anisotropically, so the tool marks catch a moving light like
// real machined metal. Falls back to the CSS background if WebGL is missing.

window.BEZ = window.BEZ || {};

(function (BEZ) {
  'use strict';

  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `
    precision mediump float;
    uniform vec2 uRes;
    uniform vec2 uLight;     // light position, pixels (GL coords, y up)
    uniform float uScale;    // plate pixels per "design" pixel

    float hash(float n) { return fract(sin(n) * 43758.5453); }

    void main() {
      vec2 q = gl_FragCoord.xy / uScale;
      float stepY = 250.0;   // pass spacing (step-over)
      float R = 185.0;       // fly cutter radius
      float feed = 6.0;      // feed per rev -> fine arc spacing

      float row = floor(q.y / stepY);
      float y0 = (row + 0.5) * stepY;
      float dy = q.y - y0;
      float cx = q.x - sqrt(max(R * R - dy * dy, 0.0));   // center of the arc through q

      vec2 radial = normalize(vec2(q.x - cx, dy));
      vec2 tangent = vec2(-radial.y, radial.x);           // groove direction

      vec2 lp = uLight / uScale;
      vec2 toL = lp - q;
      float dist = length(toL);
      vec2 L = toL / max(dist, 1.0);

      float across = sqrt(max(1.0 - pow(dot(tangent, L), 2.0), 0.0));
      float spec = pow(across, 40.0);
      float broad = pow(across, 6.0);
      float fall = exp(-dist / 520.0);

      float ring = floor(cx / feed) + row * 97.0;
      float grain = 0.75 + 0.25 * hash(ring);
      float lines = 0.85 + 0.15 * sin(cx / feed * 6.2831);

      float seam = smoothstep(0.0, 10.0, abs(dy) - (stepY * 0.5 - 10.0));

      vec3 base = vec3(0.043, 0.082, 0.118);
      vec3 sheen = vec3(0.30, 0.45, 0.58);
      vec3 warm = vec3(0.55, 0.42, 0.30);
      vec3 col = base
        + sheen * (spec * 0.55 + broad * 0.10) * fall * grain * lines
        + warm * spec * fall * fall * 0.12;
      col *= 1.0 - seam * 0.14;

      vec2 uv = gl_FragCoord.xy / uRes;
      float vig = smoothstep(1.15, 0.35, length(uv - vec2(0.5, 0.55)));
      col *= 0.55 + 0.45 * vig;
      gl_FragColor = vec4(col, 1.0);
    }`;

  // Machine table: ground cast iron with T-slots running along X.
  // uTable = (slot center y in GL px, slot pitch px, slot width px)
  const FRAG_TABLE = `
    precision mediump float;
    uniform vec2 uRes;
    uniform vec2 uLight;
    uniform float uScale;
    uniform vec3 uTable;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 p = gl_FragCoord.xy;
      vec2 lp = uLight;
      float dist = length(lp - p);
      vec2 L = (lp - p) / max(dist, 1.0);
      float fall = exp(-dist / (620.0 * uScale));

      // Blanchard-ground surface: big overlapping swirl arcs
      vec2 c = vec2(uRes.x * 0.5, -uRes.y * 1.6);
      vec2 radial = normalize(p - c);
      vec2 tangent = vec2(-radial.y, radial.x);
      float ring = length(p - c);
      float across = sqrt(max(1.0 - pow(dot(tangent, L), 2.0), 0.0));
      float swirl = 0.8 + 0.2 * sin(ring * 0.9) * sin(ring * 0.13);
      float grain = 0.85 + 0.3 * (hash(floor(p * 0.7)) - 0.5);

      vec3 iron = vec3(0.105, 0.12, 0.135) * grain;
      vec3 col = iron + vec3(0.32, 0.36, 0.40) * pow(across, 30.0) * fall * swirl * 0.55
                      + vec3(0.18, 0.2, 0.22) * pow(across, 5.0) * fall * 0.12;

      // T-slots
      float pitch = uTable.y, w = uTable.z;
      float d = mod(p.y - uTable.x + pitch * 0.5, pitch) - pitch * 0.5;
      float a = abs(d);
      if (a < w * 0.5) {
        float depth = 1.0 - a / (w * 0.5);
        col = vec3(0.025, 0.03, 0.035) * (1.0 + 0.6 * (1.0 - depth));
        // undercut of the T: darker channel down the middle
        col *= 0.55 + 0.45 * smoothstep(w * 0.18, w * 0.32, a);
        // the far wall catches a little light
        if (d > 0.0) col += vec3(0.05, 0.055, 0.06) * smoothstep(w * 0.5, w * 0.3, a) * fall;
      }
      // machined lips at the slot edges
      float lip = smoothstep(2.5, 0.0, abs(a - w * 0.5));
      col += vec3(0.45, 0.5, 0.55) * lip * (d < 0.0 ? 0.55 : 0.2) * (0.35 + fall);

      vec2 uv = gl_FragCoord.xy / uRes;
      float vig = smoothstep(1.2, 0.3, length(uv - vec2(0.5, 0.52)));
      col *= 0.5 + 0.5 * vig;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  BEZ.Surface = function (canvas, { lowPower, look = 'brushed' }) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, look === 'table' ? FRAG_TABLE : FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uLight = gl.getUniformLocation(prog, 'uLight');
    const uScale = gl.getUniformLocation(prog, 'uScale');
    const uTable = gl.getUniformLocation(prog, 'uTable');

    // Render below full resolution: the sheen is soft, so nobody can tell
    const quality = lowPower ? 0.5 : Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
    let w = 0, h = 0, k = 1;

    return {
      resize(cssW, cssH) {
        w = Math.max(1, Math.round(cssW * quality));
        h = Math.max(1, Math.round(cssH * quality));
        k = w / cssW;
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      },
      // lx, ly in CSS pixels from the top-left of the canvas
      // table = { y, pitch, width } in CSS px (only used by the table look)
      draw(lx, ly, table) {
        gl.uniform2f(uRes, w, h);
        if (uTable && table) gl.uniform3f(uTable, h - table.y * k, table.pitch * k, table.width * k);
        gl.uniform2f(uLight, lx * k, h - ly * k);
        gl.uniform1f(uScale, Math.max(h / 760, 0.45));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  };
})(window.BEZ);
