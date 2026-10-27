/* =========================================================
   FORMAL — cinematic stage-smoke engine (WebGL fragment shader)
   Billowing smoke over a wet stage floor, lit by a red neon tube,
   a cool white neon tube and a warm fresnel lamp; floor reflections,
   film grain, vignette, mouse parallax.
   API: FormalFog.init(canvas) -> { state, set(key, value), pause(), resume(), destroy() }
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
    "float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    "float noise(vec2 p){",
    "  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0; float a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8);",
    "  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.0 + vec2(1.7, 9.2); a *= 0.5; }",
    "  return v;",
    "}",
    "float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }",
    "",
    "// stage lights: red neon tube (left), cool neon tube (right), warm fresnel lamp (far right)",
    "void lights(vec2 p, float hw, float blur, out vec3 fill, out vec3 cores){",
    "  vec2 rA = vec2(-0.62 * hw, -0.26), rB = vec2(-0.62 * hw, 0.30);",
    "  vec2 wA = vec2( 0.70 * hw, -0.26), wB = vec2( 0.70 * hw, 0.34);",
    "  vec2 L  = vec2( 1.02 * hw, 0.24);",
    "  float dR = segDist(p, rA, rB), dW = segDist(p, wA, wB), dL = length(p - L);",
    "  float glowR = exp(-dR * (3.2 / blur));",
    "  float glowW = exp(-dW * (3.6 / blur));",
    "  float spot  = exp(-dL * (2.0 / blur));",
    "  vec2 dir = normalize(vec2(-1.0, -0.42)); vec2 v = p - L;",
    "  float along = dot(v, dir); float perp = abs(dot(v, vec2(-dir.y, dir.x)));",
    "  float beam = smoothstep(0.42, 0.0, perp - along * 0.38) * smoothstep(0.0, 0.25, along) * exp(-along * 1.1);",
    "  fill  = vec3(1.0, 0.12, 0.07) * glowR * (1.3 + uRed * 1.1)",
    "        + vec3(0.72, 0.86, 1.0) * glowW * 1.25",
    "        + vec3(1.0, 0.62, 0.30) * (spot * 0.9 + beam * 0.85);",
    "  cores = vec3(1.0, 0.30, 0.22) * smoothstep(0.011 * blur, 0.0, dR) * 1.6",
    "        + vec3(0.92, 0.96, 1.0) * smoothstep(0.009 * blur, 0.0, dW) * 1.6",
    "        + vec3(1.0, 0.72, 0.42) * smoothstep(0.075 * blur, 0.0, dL) * 1.3;",
    "}",
    "",
    "void main(){",
    "  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;",
    "  float hw = 0.5 * uRes.x / uRes.y;",
    "  float t = uTime * 0.05;",
    "  vec2 par = uMouse * 0.05;",
    "  float floorY = -0.30;",
    "",
    "  // billowing smoke: warped fbm + finer detail, dense near the floor",
    "  vec2 sp = p + par;",
    "  vec2 q = vec2(fbm(sp * 1.4 + vec2(t * 0.9, -t * 0.3)), fbm(sp * 1.4 + vec2(-t * 0.5, t * 0.6) + 3.1));",
    "  float warp = 0.7 + uBurst * 1.1;",
    "  float f  = fbm(sp * 2.0 + warp * q + vec2(t * 0.6, t * 0.15));",
    "  float f2 = fbm(sp * 4.6 + q * 0.9 - vec2(t * 0.35, t * 0.5));",
    "  float dens = smoothstep(0.28, 0.92, f * 0.78 + f2 * 0.34);",
    "  dens *= 0.18 + 1.25 * smoothstep(0.55, floorY - 0.05, p.y);",
    "  dens *= 1.0 - 0.55 * smoothstep(floorY + 0.02, floorY - 0.12, p.y);",
    "",
    "  vec3 fill, cores; lights(p, hw, 1.0, fill, cores);",
    "  vec3 col = vec3(0.012, 0.011, 0.014);",
    "  col += fill * (dens * 1.15 + 0.07) + vec3(0.55, 0.56, 0.62) * dens * 0.16;   // lit smoke + neutral haze",
    "  col += cores * (1.0 - 0.35 * dens);",
    "",
    "  // wet floor: mirrored, blurred, attenuated lights + a little smoke haze",
    "  float fm = smoothstep(floorY + 0.015, floorY - 0.015, p.y);",
    "  if (fm > 0.0) {",
    "    vec2 pr = vec2(p.x, 2.0 * floorY - p.y);",
    "    float depth = (floorY - p.y);",
    "    vec3 rf, rc; lights(pr + vec2(0.0, depth * 0.3), hw, 1.0 + depth * 7.0, rf, rc);",
    "    float ripple = 0.85 + 0.15 * noise(vec2(p.x * 40.0, p.y * 120.0 + t * 6.0));",
    "    vec3 refl = (rf * 0.26 + rc * 0.55) * exp(-depth * 4.5) * ripple;",
    "    col = mix(col, vec3(0.008) + refl + fill * dens * 0.25, fm);",
    "  }",
    "",
    "  col += vec3(1.0) * uFlash * (0.45 + 0.55 * dens);",
    "  float vig = smoothstep(1.35, 0.35, length(p * vec2(0.8, 1.15)));",
    "  col *= mix(0.45, 1.0, vig);",
    "  float g = hash(gl_FragCoord.xy + fract(uTime) * vec2(17.0, 91.0)) - 0.5;",
    "  col += g * 0.045;",
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
