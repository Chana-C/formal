/* =========================================================
   FORMAL — site app
   nav · cursor · transitions · reveal · works · player modal ·
   testimonials · marquee · credits · contact form
   Content is loaded from /content/*.json (edited via admin.html)
   ========================================================= */
(function () {
  "use strict";

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };

  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

  /* ---------------- media source parsing (shared with admin.js) ---------------- */
  function parseSource(item) {
    var src = String(item.src || "").trim();
    var type = (item.type || "").toLowerCase();
    var m;
    if (!type || type === "auto" || type === "video" || type === "youtube" || type === "drive" || type === "vimeo") {
      if (/youtu\.be\/|youtube\.com|youtube-nocookie\.com/.test(src)) type = "youtube";
      else if (/drive\.google\.com|docs\.google\.com/.test(src)) type = "drive";
      else if (/vimeo\.com/.test(src)) type = "vimeo";
      else if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(src)) type = "file";
      else if (/\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(src)) type = "image";
      else if (type === "youtube" && /^[\w-]{11}$/.test(src)) type = "youtube";
      else if (type === "drive" && /^[\w-]{20,}$/.test(src)) type = "drive";
      else if (type === "vimeo" && /^\d+$/.test(src)) type = "vimeo";
    }
    var id = src;
    if (type === "youtube") { m = src.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/); id = m ? m[1] : src; }
    else if (type === "drive") { m = src.match(/\/d\/([\w-]+)/) || src.match(/[?&]id=([\w-]+)/); id = m ? m[1] : src; }
    else if (type === "vimeo") { m = src.match(/vimeo\.com\/(?:video\/)?(\d+)/); id = m ? m[1] : src; }

    var poster = item.poster || "";
    if (!poster) {
      if (type === "youtube") poster = "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
      else if (type === "drive") poster = "https://lh3.googleusercontent.com/d/" + id + "=w1600";
      else if (type === "image") poster = src;
    }
    if (type === "image" && /drive\.google\.com/.test(src)) {
      m = src.match(/\/d\/([\w-]+)/) || src.match(/[?&]id=([\w-]+)/);
      if (m) { src = "https://lh3.googleusercontent.com/d/" + m[1] + "=w2000"; poster = poster || src; }
    }
    var sourceUrl = "";
    if (type === "youtube") sourceUrl = "https://www.youtube.com/watch?v=" + id;
    else if (type === "vimeo") sourceUrl = "https://vimeo.com/" + id;
    else if (type === "drive") sourceUrl = "https://drive.google.com/file/d/" + id + "/view";
    return { type: type || "image", id: id, src: src, poster: poster, isVideo: type !== "image", sourceUrl: sourceUrl };
  }
  window.FORMAL_parseSource = parseSource;

  function embedHTML(info) {
    var shield = '<span class="shield" aria-hidden="true"></span>';
    switch (info.type) {
      case "youtube":
        return '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(info.id) + '?autoplay=1&rel=0&modestbranding=1&color=white&playsinline=1&iv_load_policy=3" title="נגן וידאו" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      case "drive":
        return '<iframe src="https://drive.google.com/file/d/' + esc(info.id) + '/preview" title="נגן וידאו" allow="autoplay; fullscreen" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>';
      case "vimeo":
        return '<iframe src="https://player.vimeo.com/video/' + esc(info.id) + '?autoplay=1&title=0&byline=0&portrait=0&color=e10600&dnt=1" title="נגן וידאו" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
      case "file":
        return '<video src="' + esc(info.src) + '" controls autoplay playsinline controlsList="nodownload noremoteplayback noplaybackrate" disablePictureInPicture oncontextmenu="return false" preload="metadata"' + (info.poster ? ' poster="' + esc(info.poster) + '"' : "") + '></video>';
      default:
        return '<img src="' + esc(info.src) + '" alt="" draggable="false">' + shield;
    }
  }

  /* ================= content-independent UI ================= */

  /* boot curtain / page transitions */
  var curtain = $(".curtain");
  if (curtain) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { curtain.classList.remove("is-boot"); }); });
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (!a || reduce) return;
      var href = a.getAttribute("href");
      if (!href || href[0] === "#" || a.target === "_blank" || /^(mailto|tel|https?|whatsapp):/i.test(href) && !a.href.startsWith(location.origin)) return;
      if (a.hasAttribute("download") || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (a.href.split("#")[0] === location.href.split("#")[0]) return;
      e.preventDefault();
      document.body.classList.add("is-transitioning");
      curtain.classList.add("is-on");
      setTimeout(function () { location.href = a.href; }, 420);
    });
    window.addEventListener("pageshow", function (e) { if (e.persisted) { curtain.classList.remove("is-on"); document.body.classList.remove("is-transitioning"); } });
  }

  /* header */
  var header = $(".header");
  if (header) {
    var lastY = scrollY;
    var onScroll = function () {
      var y = scrollY;
      header.classList.toggle("is-scrolled", y > 24);
      header.classList.toggle("is-hidden", y > 400 && y > lastY && !document.body.classList.contains("menu-open"));
      lastY = y;
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    var burger = $(".burger");
    if (burger) {
      burger.addEventListener("click", function () {
        var open = document.body.classList.toggle("menu-open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      $$(".nav a").forEach(function (a) { a.addEventListener("click", function () { document.body.classList.remove("menu-open"); }); });
    }
    var page = location.pathname.split("/").pop() || "index.html";
    $$(".nav__link").forEach(function (a) {
      var h = a.getAttribute("href");
      if (h === page || (page === "" && h === "index.html")) a.classList.add("is-active");
    });
  }

  /* custom cursor: the "o" play mark from the logo (desktop only, not in the admin) */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reduce && !document.body.classList.contains("admin-body")) {
    var cur = document.createElement("div"); cur.className = "cursor"; cur.setAttribute("aria-hidden", "true");
    var curImg = document.createElement("img"); curImg.src = "assets/img/cursor.png"; curImg.alt = ""; curImg.draggable = false;
    cur.appendChild(curImg); document.body.appendChild(cur);
    document.body.classList.add("has-cursor", "cursor-hidden");
    var cx = innerWidth / 2, cy = innerHeight / 2, px = cx, py = cy;
    addEventListener("mousemove", function (e) {
      cx = e.clientX; cy = e.clientY;
      document.body.classList.remove("cursor-hidden");
      var t = e.target;
      var media = t.closest && t.closest(".work__media, .testimonial__media[data-play]");
      var hover = t.closest && t.closest("a, button, .filter, [data-cursor]");
      var text = t.closest && t.closest("input, textarea, select");
      document.body.classList.toggle("cursor-media", !!media);
      document.body.classList.toggle("cursor-hover", !!hover && !media);
      document.body.classList.toggle("cursor-text", !!text);
    }, { passive: true });
    document.addEventListener("mouseleave", function () { document.body.classList.add("cursor-hidden"); });
    (function loop() {
      px += (cx - px) * 0.4; py += (cy - py) * 0.4;
      cur.style.transform = "translate(" + px + "px," + py + "px)";
      requestAnimationFrame(loop);
    })();
  }

  /* scroll reveal */
  function observeReveal(els) {
    if (!els.length) return;
    if ("IntersectionObserver" in window && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
      els.forEach(function (el) { io.observe(el); });
    } else els.forEach(function (el) { el.classList.add("is-in"); });
  }
  observeReveal($$(".reveal"));
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* protected media: no context menu / drag */
  document.addEventListener("contextmenu", function (e) { if (e.target.closest(".protected")) e.preventDefault(); });
  document.addEventListener("dragstart", function (e) { if (e.target.closest(".protected")) e.preventDefault(); });

  /* ================= content loading ================= */
  function loadJSON(name) {
    return fetch("content/" + name + ".json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(name); return r.json(); });
  }
  Promise.all([loadJSON("site"), loadJSON("works"), loadJSON("testimonials")])
    .then(function (res) { init(res[0] || {}, res[1] || [], res[2] || []); })
    .catch(function () { init(window.FORMAL_SITE || {}, window.FORMAL_WORKS || [], window.FORMAL_TESTIMONIALS || []); });

  /* ================= content-dependent UI ================= */
  function init(SITE, WORKS, TESTIMONIALS) {
    var CATS = SITE.categories || {};
    function catLabel(c) { return CATS[c] || c || ""; }

    /* site-wide text */
    $$("[data-site]").forEach(function (el) {
      var path = el.dataset.site.split(".");
      var v = SITE; path.forEach(function (k) { v = v && v[k]; });
      if (v == null || v === "") return;
      if (el.tagName === "A") {
        if (/^tel/.test(el.dataset.siteHref || "")) el.href = "tel:" + String(v).replace(/[^\d+]/g, "");
        else if (el.dataset.siteHref === "mailto") el.href = "mailto:" + v;
        else if (el.dataset.siteHref === "wa") el.href = "https://wa.me/" + String(SITE.contact && SITE.contact.whatsapp || v).replace(/\D/g, "");
        else if (el.dataset.siteHref === "url") el.href = v;
        if (!el.dataset.siteKeep) el.textContent = v;
      } else el.textContent = v;
    });

    /* works */
    function workCard(item, i) {
      var info = parseSource(item);
      var kind = info.isVideo ? "וידאו" : "תמונה";
      return '<article class="work ' + (info.isVideo ? "work--video" : "work--image") + ' reveal" style="--d:' + ((i % 3) * 0.08) + 's" data-id="' + esc(item.id) + '">' +
        '<button class="work__media protected" type="button" data-open="' + esc(item.id) + '" aria-label="' + esc((info.isVideo ? "הפעלת " : "צפייה ב") + item.title) + '">' +
          '<img src="' + esc(info.poster) + '" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.style.opacity=0">' +
          '<span class="work__tag">' + esc(kind) + '</span>' +
          '<span class="work__play" aria-hidden="true">' + ICON_PLAY + '</span>' +
          '<span class="shield" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="work__meta">' +
          '<span class="work__num">' + pad2(i + 1) + '</span>' +
          '<h3 class="work__title">' + esc(item.title) + '</h3>' +
          '<p class="work__sub">' + (item.client ? '<span>' + esc(item.client) + '</span>' : "") + (item.category ? '<span>' + esc(catLabel(item.category)) + '</span>' : "") + (item.year ? '<span>' + esc(item.year) + '</span>' : "") + '</p>' +
        '</div></article>';
    }

    var currentList = WORKS;
    function renderWorks(container, list) {
      currentList = list;
      if (!list.length) { container.innerHTML = '<p class="empty">עדיין אין פריטים כאן.</p>'; return; }
      container.innerHTML = list.map(workCard).join("");
      observeReveal($$(".reveal", container));
    }

    var featuredGrid = $("[data-works-featured]");
    if (featuredGrid) {
      var feat = WORKS.filter(function (w) { return w.featured; });
      if (!feat.length) feat = WORKS.slice(0, 4);
      renderWorks(featuredGrid, feat.slice(0, 4));
    }

    var allGrid = $("[data-works-all]");
    if (allGrid) {
      var filters = $("[data-filters]");
      var cats = [];
      WORKS.forEach(function (w) { if (w.category && cats.indexOf(w.category) < 0) cats.push(w.category); });
      if (filters) {
        filters.innerHTML = '<button class="filter is-active" data-cat="all" aria-pressed="true">הכול<span class="filter__count">' + WORKS.length + '</span></button>' +
          cats.map(function (c) {
            var n = WORKS.filter(function (w) { return w.category === c; }).length;
            return '<button class="filter" data-cat="' + esc(c) + '" aria-pressed="false">' + esc(catLabel(c)) + '<span class="filter__count">' + n + '</span></button>';
          }).join("");
        filters.addEventListener("click", function (e) {
          var b = e.target.closest(".filter"); if (!b) return;
          $$(".filter", filters).forEach(function (f) { f.classList.remove("is-active"); f.setAttribute("aria-pressed", "false"); });
          b.classList.add("is-active"); b.setAttribute("aria-pressed", "true");
          var c = b.dataset.cat;
          renderWorks(allGrid, c === "all" ? WORKS : WORKS.filter(function (w) { return w.category === c; }));
          history.replaceState(null, "", c === "all" ? location.pathname : "#cat=" + encodeURIComponent(c));
        });
        var mcat = location.hash.match(/#cat=([^&]+)/);
        var fb = mcat ? $$(".filter", filters).filter(function (f) { return f.dataset.cat === decodeURIComponent(mcat[1]); })[0] : null;
        if (fb) fb.click(); else renderWorks(allGrid, WORKS);
      } else renderWorks(allGrid, WORKS);
    }

    /* player modal */
    var modal = $("#modal");
    var openIndex = -1, lastFocus = null, hideTimer = 0;
    if (modal) {
      var mMedia = $(".modal__media", modal), mTitle = $(".modal__title", modal), mSub = $(".modal__sub", modal), mDesc = $(".modal__desc", modal);
      var mPrev = $("[data-prev]", modal), mNext = $("[data-next]", modal);
      if (mPrev) mPrev.innerHTML = ICON_PREV;
      if (mNext) mNext.innerHTML = ICON_NEXT;
      var mSource = document.createElement("p");
      mSource.className = "modal__source";
      mDesc.parentNode.appendChild(mSource);
      var pageRegions = function () { return $$("header, main, footer"); };

      function findItem(id) {
        var lists = [currentList, WORKS];
        for (var l = 0; l < lists.length; l++) for (var i = 0; i < lists[l].length; i++) if (String(lists[l][i].id) === String(id)) return { item: lists[l][i], index: i, list: lists[l] };
        return null;
      }
      function show(item, list, index) {
        var info = parseSource(item);
        mMedia.className = "modal__media protected" + (info.isVideo ? "" : " modal__media--image");
        mMedia.innerHTML = '<div class="modal__loading">LOADING</div>';
        requestAnimationFrame(function () { mMedia.innerHTML = embedHTML(info); });
        mTitle.textContent = item.title || "";
        mSub.textContent = [item.client, catLabel(item.category), item.year].filter(Boolean).join(" · ");
        mDesc.textContent = item.description || "";
        mDesc.hidden = !item.description;
        var labels = { youtube: "YouTube", vimeo: "Vimeo", drive: "Google Drive" };
        if (SITE.showSourceLink && info.sourceUrl) {
          mSource.innerHTML = '<a href="' + esc(info.sourceUrl) + '" target="_blank" rel="noopener noreferrer">לצפייה ב-' + labels[info.type] + ' <span class="arrow">↗</span></a>';
          mSource.hidden = false;
        } else mSource.hidden = true;
        openIndex = index; currentList = list;
        var multi = list.length > 1;
        if (mPrev) mPrev.hidden = !multi; if (mNext) mNext.hidden = !multi;
        if (item.id) history.replaceState(null, "", "#work=" + encodeURIComponent(item.id));
      }
      function openModal(id) {
        var f = findItem(id); if (!f) return;
        clearTimeout(hideTimer);
        lastFocus = document.activeElement;
        modal.hidden = false;
        document.body.style.overflow = "hidden";
        pageRegions().forEach(function (el) { el.inert = true; });
        show(f.item, f.list, f.index);
        requestAnimationFrame(function () { requestAnimationFrame(function () { modal.classList.add("is-open"); }); });
        var closeBtn = $(".modal__close", modal); if (closeBtn) closeBtn.focus();
      }
      function closeModal() {
        modal.classList.remove("is-open");
        document.body.style.overflow = "";
        pageRegions().forEach(function (el) { el.inert = false; });
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () { modal.hidden = true; mMedia.innerHTML = ""; }, 420);
        if (/#work=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }
      function step(d) {
        if (!currentList.length) return;
        var i = (openIndex + d + currentList.length) % currentList.length;
        show(currentList[i], currentList, i);
      }
      document.addEventListener("click", function (e) {
        var o = e.target.closest("[data-open]"); if (o) { e.preventDefault(); openModal(o.dataset.open); return; }
        if (e.target.closest("[data-close]")) { closeModal(); return; }
        if (e.target.closest("[data-prev]")) { step(-1); return; }
        if (e.target.closest("[data-next]")) { step(1); return; }
      });
      document.addEventListener("keydown", function (e) {
        if (modal.hidden) return;
        if (e.key === "Escape") closeModal();
        else if (e.key === "ArrowRight") step(-1);
        else if (e.key === "ArrowLeft") step(1);
      });
      var mw = location.hash.match(/#work=([^&]+)/);
      if (mw) setTimeout(function () { openModal(decodeURIComponent(mw[1])); }, 500);
    }

    /* testimonials */
    var tWrap = $("[data-testimonials]");
    if (tWrap) {
      var tItems = TESTIMONIALS.map(function (t, i) {
        var vid = t.video ? { id: "t-" + i, title: t.name, client: t.company, description: t.quote, src: t.video, type: "auto", poster: t.image || "" } : null;
        if (vid) WORKS.push(vid);
        return { t: t, vid: vid };
      });
      tWrap.innerHTML = tItems.map(function (o, i) {
        var t = o.t, media;
        if (o.vid) {
          var info = parseSource(o.vid);
          media = '<button class="testimonial__media protected" type="button" data-open="' + esc(o.vid.id) + '" data-play aria-label="הפעלת המלצת וידאו של ' + esc(t.name) + '">' +
            '<img src="' + esc(info.poster) + '" alt="" loading="lazy" draggable="false"><span class="work__play" aria-hidden="true">' + ICON_PLAY + '</span><span class="shield"></span></button>';
        } else if (t.image) {
          media = '<div class="testimonial__media protected"><img src="' + esc(t.image) + '" alt="' + esc(t.name) + '" loading="lazy" draggable="false"><span class="shield"></span></div>';
        } else {
          media = '<div class="testimonial__media testimonial__media--placeholder"><span class="testimonial__initial">' + esc(Array.from(String(t.name || "F"))[0]) + '</span></div>';
        }
        return '<figure class="testimonial reveal">' +
          '<figcaption class="testimonial__body">' +
            '<div class="testimonial__index">' + pad2(i + 1) + '</div>' +
            '<blockquote class="testimonial__quote">' + esc(t.quote) + '</blockquote>' +
            '<div class="testimonial__who"><span class="testimonial__name">' + esc(t.name) + '</span><span class="testimonial__role">' + esc([t.role, t.company].filter(Boolean).join(" · ")) + '</span>' +
            (t.project ? '<span class="testimonial__project">PROJECT <b>' + esc(t.project) + '</b></span>' : "") + '</div>' +
          '</figcaption>' + media + '</figure>';
      }).join("");
      observeReveal($$(".reveal", tWrap));
    }

    var q = $("[data-quote]");
    if (q && TESTIMONIALS.length) {
      var t0 = TESTIMONIALS.filter(function (t) { return t.featured; })[0] || TESTIMONIALS[0];
      q.innerHTML = '<blockquote>' + esc(t0.quote) + '</blockquote><figcaption><b>' + esc(t0.name) + '</b>' + (t0.role || t0.company ? ' · ' + esc([t0.role, t0.company].filter(Boolean).join(", ")) : "") + '</figcaption>';
    }

    /* marquee + credits */
    var clients = SITE.clients || [];
    var mq = $("[data-marquee]");
    if (mq && clients.length) {
      var items = clients.map(function (c) { return '<span class="marquee__item">' + esc(c) + '</span>'; }).join("");
      mq.innerHTML = '<div class="marquee__track">' + items + items + '</div>';
    }
    var cr = $("[data-credits]");
    if (cr) {
      var roles = SITE.creditRoles && SITE.creditRoles.length ? SITE.creditRoles : ["לקוח"];
      var list = clients.map(function (c, i) { return '<div class="credits__item"><span class="credits__role">' + esc(roles[i % roles.length]) + '</span><span class="credits__name">' + esc(c) + '</span></div>'; }).join("");
      cr.innerHTML = '<div class="credits__track">' + list + list + '</div>';
    }

    /* contact form -> owner's inbox (via admin API); WhatsApp fallback when no API is configured */
    var form = $("[data-contact-form]");
    if (form) {
      var apiBase = String(SITE.adminApi || "").replace(/\/+$/, "");
      var note = $("[data-form-note]", form);
      var showNote = function (text, isErr) { if (!note) return; note.textContent = text; note.hidden = false; note.classList.toggle("form__note--error", !!isErr); };
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var wa = (SITE.contact && SITE.contact.whatsapp || "").replace(/\D/g, "");
        var waText = "היי, הגעתי דרך האתר FORMAL.\nשם: " + (fd.get("name") || "") + "\nטלפון: " + (fd.get("phone") || "") + "\nפרויקט: " + (fd.get("message") || "");
        if (!apiBase) {
          if (wa) window.open("https://wa.me/" + wa + "?text=" + encodeURIComponent(waText), "_blank", "noopener");
          else if (SITE.contact && SITE.contact.email) location.href = "mailto:" + SITE.contact.email + "?subject=" + encodeURIComponent("פנייה מהאתר") + "&body=" + encodeURIComponent(waText);
          return;
        }
        var btn = $("button[type=submit]", form); btn.disabled = true; var label = btn.textContent; btn.textContent = "שולח…";
        try {
          var res = await fetch(apiBase + "/api/contact", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email"), message: fd.get("message"), consent: !!fd.get("consent"), website: fd.get("website"), page: location.href }) });
          var data = null; try { data = await res.json(); } catch (x) {}
          if (!res.ok) throw new Error((data && data.error) || "השליחה נכשלה");
          form.reset();
          showNote("תודה! ההודעה נשלחה אליי, ואחזור אלייך בהקדם.", false);
        } catch (err) {
          showNote(err.message + (wa ? " אפשר גם לכתוב לי בוואטסאפ דרך הקישור בפרטים." : ""), true);
        }
        btn.disabled = false; btn.textContent = label;
      });
    }

    /* discreet admin link, shown only in a browser that has logged in to the admin before */
    try {
      if (localStorage.getItem("formal_admin_token")) {
        var fb = $(".footer__bottom");
        if (fb && !$(".footer__admin")) { var a = document.createElement("a"); a.className = "footer__admin"; a.href = "admin.html"; a.textContent = "ניהול ✎"; fb.appendChild(a); }
      }
    } catch (e) {}
  }
})();
