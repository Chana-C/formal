/* =========================================================
   FORMAL — hero intro: "אחד · שתיים · שלוש · אקשן"
   GSAP timeline driving DOM + fog shader uniforms.
   ========================================================= */
(function () {
  "use strict";

  var hero = document.getElementById("hero");
  if (!hero) return;

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canvas = hero.querySelector(".hero__fog");
  var fog = null;

  if (!reduce && canvas && window.FormalFog) {
    try { fog = window.FormalFog.init(canvas); } catch (e) { fog = null; }
  }
  if (!fog) hero.classList.add("no-webgl");

  var words = Array.prototype.slice.call(hero.querySelectorAll(".hero__word"));
  var action = hero.querySelector(".hero__word--action");
  var after = hero.querySelector(".hero__after");
  var scroll = hero.querySelector(".hero__scroll");
  var replay = hero.querySelector(".hero__replay");
  var clapTop = hero.querySelector(".hero__clap--top");
  var clapBot = hero.querySelector(".hero__clap--bottom");
  var flash = hero.querySelector(".hero__flash");
  var stage = hero.querySelector(".hero__stage");
  var tc = hero.querySelector(".hud__tc");

  // split "אקשן" into letters (keeps RTL order via DOM order)
  function split(el) {
    if (el.dataset.split) return;
    var text = el.textContent;
    el.textContent = "";
    el.setAttribute("aria-label", text);
    Array.from(text).forEach(function (ch) {
      var s = document.createElement("span");
      s.className = "ch";
      s.textContent = ch;
      s.setAttribute("aria-hidden", "true");
      el.appendChild(s);
    });
    el.dataset.split = "1";
  }
  if (action) split(action);

  // running timecode in the HUD
  if (tc) {
    var t0 = performance.now();
    (function tick() {
      var ms = performance.now() - t0;
      var fr = Math.floor((ms / 1000 * 24) % 24);
      var s = Math.floor(ms / 1000) % 60;
      var m = Math.floor(ms / 60000) % 60;
      var h = Math.floor(ms / 3600000);
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      tc.textContent = pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(fr);
      requestAnimationFrame(tick);
    })();
  }

  // ---- fallback: no GSAP or reduced motion -> final state ----
  function finalState() {
    words.forEach(function (w) { w.style.opacity = 0; });
    if (action) {
      action.style.opacity = 1;
      action.style.transform = "translateY(0)";
      action.querySelectorAll(".ch").forEach(function (c) { c.style.opacity = 1; c.style.transform = "none"; c.style.filter = "none"; });
    }
    if (after) { after.style.opacity = 1; after.style.transform = "none"; }
    if (scroll) scroll.style.opacity = 1;
    if (replay) replay.hidden = true;
    if (fog) fog.set("intensity", 1), fog.set("red", 0.6);
  }

  if (reduce || !window.gsap) { finalState(); return; }

  var gsap = window.gsap;
  var fx = fog ? fog.state : { flash: 0, red: 0, burst: 0, intensity: 0 };
  var tl;

  function reset() {
    gsap.set(words, { opacity: 0, y: 0, scale: 1, filter: "blur(0px)", letterSpacing: "-0.02em" });
    if (action) gsap.set(action.querySelectorAll(".ch"), { opacity: 0, y: 0, x: 0, rotate: 0, scale: 1, filter: "blur(0px)" });
    gsap.set([after], { opacity: 0, y: 24 });
    gsap.set([scroll, replay], { opacity: 0 });
    gsap.set([clapTop, clapBot], { scaleX: 0, opacity: 0 });
    gsap.set(flash, { opacity: 0 });
    gsap.set(stage, { x: 0, y: 0 });
    fx.flash = 0; fx.red = 0; fx.burst = 0;
  }

  function countWord(el, dur) {
    var t = gsap.timeline();
    t.fromTo(el,
      { opacity: 0, scale: 1.18, filter: "blur(18px)", y: 10 },
      { opacity: 1, scale: 1, filter: "blur(0px)", y: 0, duration: 0.55, ease: "power3.out" })
     .to(fx, { flash: 0.18, duration: 0.08, ease: "power1.in" }, 0)
     .to(fx, { flash: 0, duration: 0.5, ease: "power2.out" }, 0.08)
     .to(el, { opacity: 0, scale: 0.96, filter: "blur(14px)", y: -24, duration: 0.45, ease: "power2.in" }, dur);
    return t;
  }

  function build() {
    reset();
    tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // fog fades up from black
    tl.to(fx, { intensity: 1, duration: 1.6, ease: "power2.out" }, 0);

    // 1 · 2 · 3
    tl.add(countWord(words[0], 0.95), 0.55);
    tl.add(countWord(words[1], 0.9), "-=0.15");
    tl.add(countWord(words[2], 0.8), "-=0.15");
    tl.to(fx, { red: 0.35, duration: 2.0, ease: "sine.inOut" }, 1.2);

    // tension beat
    tl.to(fx, { burst: 0.5, duration: 0.6, ease: "power2.in" }, "-=0.3");

    // ACTION
    var chars = action.querySelectorAll(".ch");
    tl.addLabel("action", "-=0.05");
    tl.set(action, { opacity: 1 }, "action");
    tl.fromTo(chars,
      { opacity: 0, scale: 2.6, y: function () { return gsap.utils.random(-120, 120); }, x: function () { return gsap.utils.random(-220, 220); }, rotate: function () { return gsap.utils.random(-25, 25); }, filter: "blur(16px)" },
      { opacity: 1, scale: 1, y: 0, x: 0, rotate: 0, filter: "blur(0px)", duration: 0.7, ease: "expo.out", stagger: { each: 0.06, from: "center" } },
      "action");
    // clapperboard snap
    tl.to([clapTop, clapBot], { opacity: 1, scaleX: 1, duration: 0.22, ease: "expo.in" }, "action+=0.28");
    tl.to([clapTop, clapBot], { opacity: 0, duration: 0.35, ease: "power2.out" }, "action+=0.52");
    // flash + burst + shake
    tl.to(flash, { opacity: 0.85, duration: 0.06, ease: "power1.in" }, "action+=0.5");
    tl.to(flash, { opacity: 0, duration: 0.7, ease: "power3.out" }, "action+=0.56");
    tl.to(fx, { flash: 0.9, duration: 0.06 }, "action+=0.5");
    tl.to(fx, { flash: 0, duration: 1.1, ease: "power3.out" }, "action+=0.56");
    tl.to(fx, { burst: 1.3, duration: 0.15, ease: "power2.in" }, "action+=0.5");
    tl.to(fx, { burst: 0, duration: 3.2, ease: "power2.out" }, "action+=0.65");
    tl.to(fx, { red: 1, duration: 0.3 }, "action+=0.5");
    tl.to(fx, { red: 0.6, duration: 3, ease: "sine.out" }, "action+=0.8");
    tl.to(stage, { keyframes: [
      { x: -8, y: 4, duration: 0.05 }, { x: 7, y: -5, duration: 0.05 }, { x: -5, y: 3, duration: 0.05 },
      { x: 3, y: -2, duration: 0.05 }, { x: 0, y: 0, duration: 0.08 } ], ease: "none" }, "action+=0.5");

    // settle: word rises slightly, content appears
    tl.to(action, { y: -14, duration: 1.1, ease: "power3.inOut" }, "action+=1.0");
    tl.to(after, { opacity: 1, y: 0, duration: 1.1, ease: "power3.out" }, "action+=1.15");
    tl.to([scroll, replay], { opacity: 1, duration: 0.9, stagger: 0.15 }, "action+=1.6");

    // idle glow pulse on "אקשן"
    tl.add(function () {
      gsap.to(action, { textShadow: "0 0 46px rgba(225,6,0,0.75), 0 0 110px rgba(225,6,0,0.4)", duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }, "action+=2.2");
  }

  build();

  if (replay) {
    replay.addEventListener("click", function () {
      gsap.killTweensOf(action);
      if (tl) tl.kill();
      build();
    });
  }

  // subtle parallax of the title block with the mouse
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && stage) {
    var qx = gsap.quickTo(stage, "x", { duration: 1.2, ease: "power3.out" });
    var qy = gsap.quickTo(stage, "y", { duration: 1.2, ease: "power3.out" });
    window.addEventListener("mousemove", function (e) {
      if (tl && tl.isActive()) return;
      var dx = (e.clientX / innerWidth - 0.5) * 18, dy = (e.clientY / innerHeight - 0.5) * 12;
      qx(dx); qy(dy);
    }, { passive: true });
  }
})();
