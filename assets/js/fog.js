/* =========================================================
   FORMAL — cinematic fog engine (WebGL fragment shader)
   Smoke / fog with volumetric white key light and red fill,
   film grain, vignette, mouse parallax.
   API: FormalFog.init(canvas) -> { set(key, value), pause(), resume(), destroy() }
   ========================================================= */
(function (global) {
  "use strict";

  var VERT = [
    "attribute vec2 aPos;",
    "void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "uniform vec2 uMouse;",
    "uniform float uFlash;",
    "uniform float uRed;",
    "uniform float uBurst;",
    "uniform float uIntensity;",
    "",
    "float hash(vec2 p){",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",
    "float noise(vec2 p){",
    "  vec2 i = floor(p); vec2 f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0; float a = 0.5;",
    "  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);",
    "  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.0 + vec2(1.7, 9.2); a *= 0.5; }",
    "  return v;",
    "}",
    "void main(){",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",
    "  float t = uTime * 0.055;",
    "  vec2 par = uMouse * 0.05;",
    "",
    "  // domain-warped smoke",
    "  vec2 q = vec2(fbm(p * 1.5 + vec2(t * 0.9, -t * 0.35) + par), fbm(p * 1.5 + vec2(-t * 0.5, t * 0.7) + 3.1));",
    "  float warp = 0.65 + uBurst * 1.1;",
    "  float f = fbm(p * 2.1 + warp * q + vec2(t * 0.55, t * 0.18));",
    "  f = smoothstep(0.18, 0.9, f);",
    "  f *= mix(1.2, 0.5, uv.y);",
    "  float dens = f * 1.0 + 0.09;",
    "",
    "  // key light: white, upper-left",
    "  vec2 L1 = vec2(-0.62 + par.x, 0.78);",
    "  vec2 d1 = p - L1;",
    "  float ang1 = abs(atan(d1.x, -d1.y));",
    "  float cone1 = smoothstep(0.62, 0.0, ang1);",
    "  float key = cone1 * exp(-length(d1) * 1.1) * 2.3;",
    "  key += cone1 * 0.14 * noise(vec2(ang1 * 28.0, t * 4.0));",
    "",
    "  // red light: upper-right",
    "  vec2 L2 = vec2(0.66 - par.x, 0.82);",
    "  vec2 d2 = p - L2;",
    "  float ang2 = abs(atan(d2.x, -d2.y));",
    "  float cone2 = smoothstep(0.75, 0.0, ang2);",
    "  float red = cone2 * exp(-length(d2) * 0.95) * (1.25 + uRed * 1.8);",
    "",
    "  // low red rim glow",
    "  float rim = exp(-length(p - vec2(0.0, -0.8)) * 2.0) * 0.55 * (0.6 + uRed);",
    "",
    "  vec3 col = vec3(0.016, 0.015, 0.017);",
    "  vec3 white = vec3(0.93, 0.91, 0.88);",
    "  vec3 redc = vec3(0.88, 0.03, 0.02);",
    "  col += white * key * dens;",
    "  col += redc * (red * dens + rim * dens);",
    "  col += vec3(1.0) * uFlash * (0.4 + 0.6 * dens);",
    "",
    "  // vignette",
    "  float vig = smoothstep(1.3, 0.3, length(p * vec2(0.85, 1.1)));",
    "  col *= mix(0.5, 1.0, vig);",
    "",
    "  // grain",
    "  float g = hash(gl_FragCoord.xy + fract(uTime) * vec2(17.0, 91.0)) - 0.5;",
    "  col += g * 0.05;",
    "",
    "  col *= uIntensity;",
    "  col = pow(max(col, 0.0), vec3(0.95));",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("Shader compile error: " + log);
    }
    return s;
  }

  function init(canvas) {
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "high-performance" })
      || canvas.getContext("experimental-webgl");
    if (!gl) return null;

    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      console.warn("[FORMAL fog] " + e.message);
      return null;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ["uRes", "uTime", "uMouse", "uFlash", "uRed", "uBurst", "uIntensity"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var state = { flash: 0, red: 0, burst: 0, intensity: 0 };
    var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    var running = true, visible = true, raf = 0, start = performance.now();
    var isMobile = matchMedia("(max-width: 760px)").matches;
    var scale = isMobile ? 0.55 : 0.8;
    var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.2 : 1.5);

    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      var cw = Math.max(1, Math.floor(w * dpr * scale)), ch = Math.max(1, Math.floor(h * dpr * scale));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw; canvas.height = ch;
        gl.viewport(0, 0, cw, ch);
      }
    }

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      resize();
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, (now - start) / 1000);
      gl.uniform2f(U.uMouse, mouse.x, mouse.y);
      gl.uniform1f(U.uFlash, state.flash);
      gl.uniform1f(U.uRed, state.red);
      gl.uniform1f(U.uBurst, state.burst);
      gl.uniform1f(U.uIntensity, state.intensity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function onMove(e) {
      var pt = e.touches ? e.touches[0] : e;
      mouse.tx = (pt.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = -((pt.clientY / window.innerHeight) * 2 - 1);
    }
    window.addEventListener("mousemove", onMove, { passive: true });

    var io = null, inView = true;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; visible = inView && !document.hidden; }, { threshold: 0 });
      io.observe(canvas);
    }
    function onVis() { visible = inView && !document.hidden; }
    document.addEventListener("visibilitychange", onVis);

    raf = requestAnimationFrame(frame);

    return {
      state: state,
      set: function (k, v) { state[k] = v; },
      pause: function () { running = false; cancelAnimationFrame(raf); },
      resume: function () { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
      destroy: function () {
        running = false; cancelAnimationFrame(raf);
        window.removeEventListener("mousemove", onMove);
        document.removeEventListener("visibilitychange", onVis);
        if (io) io.disconnect();
      }
    };
  }

  global.FormalFog = { init: init };
})(window);
