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

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  BEZ.Surface = function (canvas, { lowPower }) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
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
      draw(lx, ly) {
        gl.uniform2f(uRes, w, h);
        gl.uniform2f(uLight, lx * k, h - ly * k);
        gl.uniform1f(uScale, Math.max(h / 760, 0.45));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  };
})(window.BEZ);
