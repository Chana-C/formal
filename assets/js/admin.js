/* =========================================================
   FORMAL — admin UI (admin.html)
   Talks to the Cloudflare Worker in /admin-api. Every save = a commit
   to the GitHub repo → GitHub Pages republishes within ~1 minute.
   ========================================================= */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var parseSource = window.FORMAL_parseSource;
  var TYPE_LABELS = { youtube: "YouTube", drive: "Google Drive", vimeo: "Vimeo", file: "קובץ וידאו", image: "תמונה" };
  var IMG_RE = /\.(jpe?g|png|webp|gif|svg|avif)$/i;

  var API = "";
  var token = localStorage.getItem("formal_admin_token") || "";
  var me = null;
  var state = { site: null, works: [], testimonials: [], media: [], admins: [] };
  var dirty = { works: false, testimonials: false };
  var lastBuild = null;

  /* ---------------- api ---------------- */
  async function resolveApi() {
    var q = new URLSearchParams(location.search).get("api");
    if (q) { localStorage.setItem("formal_admin_api", q.replace(/\/+$/, "")); history.replaceState(null, "", location.pathname); }
    var o = localStorage.getItem("formal_admin_api");
    if (o) return o;
    try { var s = await (await fetch("content/site.json", { cache: "no-cache" })).json(); return String(s.adminApi || "").replace(/\/+$/, ""); } catch (e) { return ""; }
  }

  async function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    if (token) headers.Authorization = "Bearer " + token;
    var body = opts.body;
    if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
    var res;
    try { res = await fetch(API + path, { method: opts.method || "GET", headers: headers, body: body }); }
    catch (e) { throw new Error("אין חיבור לשרת הניהול"); }
    var data = null; try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && path !== "/api/login") { logout(false); throw new Error("ההתחברות פגה, היכנסי שוב"); }
    if (!res.ok) throw new Error((data && data.error) || ("שגיאה " + res.status));
    return data;
  }

  /* ---------------- ui helpers ---------------- */
  var toastTimer;
  function toast(msg, isErr) {
    var t = $("#toast");
    t.textContent = msg; t.className = "toast" + (isErr ? " toast--error" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, isErr ? 6000 : 3500);
  }
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function setStatus(cls, text) { var el = $("#status"); el.className = "topbar__status" + (cls ? " " + cls : ""); $("span", el).textContent = text; }

  var statusTimer;
  function watchBuild() {
    var before = lastBuild;
    setStatus("is-building", "מפרסם…");
    clearInterval(statusTimer);
    var tries = 0;
    statusTimer = setInterval(async function () {
      tries++;
      try {
        var s = await api("/api/status");
        if (s.status === "built" && s.updated !== before) { lastBuild = s.updated; setStatus("is-built", "פורסם ✓"); clearInterval(statusTimer); }
        else if (s.status === "errored") { setStatus("", "שגיאת פרסום"); clearInterval(statusTimer); }
      } catch (e) {}
      if (tries > 20) { clearInterval(statusTimer); setStatus("", "מחובר"); }
    }, 7000);
  }

  function showDirtyBar() {
    var bar = $("#savebar");
    if (!bar) {
      bar = document.createElement("div"); bar.id = "savebar"; bar.className = "toast"; bar.style.display = "flex"; bar.style.gap = "14px"; bar.style.alignItems = "center";
      bar.innerHTML = '<span>יש שינויים שעדיין לא פורסמו</span><button class="btn btn--red btn--sm" type="button" id="savebar-btn">שמירה ופרסום</button>';
      document.body.appendChild(bar);
      $("#savebar-btn").addEventListener("click", saveDirty);
    }
    bar.hidden = !(dirty.works || dirty.testimonials);
  }
  async function saveDirty() {
    try {
      if (dirty.works) { await saveContent("works"); }
      if (dirty.testimonials) { await saveContent("testimonials"); }
    } catch (e) { toast(e.message, true); }
  }
  async function saveContent(name) {
    var res = await api("/api/content/" + name, { method: "PUT", json: { data: state[name] } });
    state[name] = res.data; dirty[name] = false; showDirtyBar();
    if (name === "works") renderWorks(); else if (name === "testimonials") renderTestimonials();
    toast("נשמר ופורסם. האתר מתעדכן תוך כדקה.");
    watchBuild();
  }

  /* ---------------- email suffix suggestions ---------------- */
  var EMAIL_DOMAINS = ["gmail.com", "walla.co.il", "walla.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com", "012.net.il", "bezeqint.net", "netvision.net.il", "me.com"];
  function attachEmailSuggest(input) {
    if (!input || input.dataset.suggest) return;
    var list = document.createElement("datalist");
    list.id = "emails-" + Math.random().toString(36).slice(2, 8);
    document.body.appendChild(list);
    input.setAttribute("list", list.id);
    input.setAttribute("autocapitalize", "off");
    input.dataset.suggest = "1";
    input.addEventListener("input", function () {
      var v = input.value.trim(), at = v.indexOf("@");
      if (at < 1) { list.innerHTML = ""; return; }
      var local = v.slice(0, at), typed = v.slice(at + 1).toLowerCase();
      list.innerHTML = EMAIL_DOMAINS.filter(function (d) { return d.indexOf(typed) === 0; }).slice(0, 8)
        .map(function (d) { return '<option value="' + esc(local + "@" + d) + '">'; }).join("");
    });
  }
  attachEmailSuggest($('#login-form input[name="email"]'));
  attachEmailSuggest($('#admin-add input[name="email"]'));

  /* ---------------- auth ---------------- */
  function showLogin(noApi) {
    $("#app").hidden = true; $("#login").hidden = false;
    $("#login-noapi").hidden = !noApi;
    $("#login-form").hidden = !!noApi;
  }
  function logout(reload) {
    token = ""; localStorage.removeItem("formal_admin_token");
    if (reload !== false) location.reload(); else showLogin(false);
  }
  $("#login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target), err = $("#login-error");
    err.hidden = true;
    var btn = $("button", e.target); btn.disabled = true;
    try {
      var r = await api("/api/login", { method: "POST", json: { email: fd.get("email"), password: fd.get("password") } });
      token = r.token; localStorage.setItem("formal_admin_token", token); me = r.admin;
      await enterApp();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    btn.disabled = false;
  });
  $("#logout").addEventListener("click", function () { logout(true); });

  async function boot() {
    API = await resolveApi();
    if (!API) return showLogin(true);
    if (token) {
      try { me = (await api("/api/me")).admin; return enterApp(); } catch (e) { token = ""; }
    }
    showLogin(false);
  }

  /* ---------------- app ---------------- */
  async function enterApp() {
    $("#login").hidden = true; $("#app").hidden = false;
    $("#who").textContent = me.name || me.email;
    try {
      var r = await Promise.all([api("/api/content/site"), api("/api/content/works"), api("/api/content/testimonials")]);
      state.site = r[0].data || {}; state.works = r[1].data || []; state.testimonials = r[2].data || [];
    } catch (e) { toast(e.message, true); return; }
    renderWorks(); renderTestimonials(); renderSettings();
    loadMedia(); loadAdmins();
    $("#tab-messages").hidden = me.role !== "owner";
    if (me.role === "owner") loadMessages();
    api("/api/status").then(function (s) { lastBuild = s.updated; setStatus(s.status === "built" ? "is-built" : "", s.status === "built" ? "האתר מעודכן" : "מחובר"); }).catch(function () {});
    var last = localStorage.getItem("formal_admin_tab");
    if (last) switchTab(last);
  }

  /* tabs */
  function switchTab(name) {
    if (!$('.tab[data-tab="' + name + '"]')) name = "works";
    $$(".tab").forEach(function (t) { var on = t.dataset.tab === name; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on ? "true" : "false"); });
    $$(".pane").forEach(function (p) { p.hidden = p.dataset.pane !== name; });
    localStorage.setItem("formal_admin_tab", name);
  }
  $(".tabs").addEventListener("click", function (e) { var t = e.target.closest(".tab"); if (t) switchTab(t.dataset.tab); });

  /* ---------------- works / testimonials lists ---------------- */
  function rowActions(featured) {
    return '<div class="row__actions">' +
      '<button class="ibtn ibtn--star' + (featured ? " is-on" : "") + '" type="button" title="הצגה בדף הבית" data-act="star">★</button>' +
      '<button class="ibtn" type="button" title="למעלה" data-act="up">↑</button>' +
      '<button class="ibtn" type="button" title="למטה" data-act="down">↓</button>' +
      '<button class="ibtn" type="button" title="עריכה" data-act="edit">✎</button>' +
      '<button class="ibtn ibtn--danger" type="button" title="מחיקה" data-act="del">✕</button>' +
      '<span class="drag" title="גרירה לסידור">⋮⋮</span>' +
    '</div>';
  }
  function renderWorks() {
    var el = $("#works-list"), cats = (state.site && state.site.categories) || {};
    if (!state.works.length) { el.innerHTML = '<div class="empty-state">עדיין אין עבודות. לחצי על "+ עבודה חדשה".</div>'; return; }
    el.innerHTML = state.works.map(function (w, i) {
      var info = parseSource(w);
      return '<div class="row" draggable="true" data-i="' + i + '">' +
        '<div class="row__thumb protected">' + (info.poster ? '<img src="' + esc(info.poster) + '" alt="" loading="lazy" draggable="false" onerror="this.remove()">' : esc(info.type.toUpperCase())) + '</div>' +
        '<div><div class="row__title">' + esc(w.title) + ' <span class="badge' + (info.isVideo ? " badge--red" : "") + '">' + esc(TYPE_LABELS[info.type] || info.type) + '</span>' + (w.featured ? '<span class="badge">דף הבית</span>' : "") + '</div>' +
        '<div class="row__meta">' + esc([w.client, cats[w.category] || w.category, w.year].filter(Boolean).join(" · ")) + '</div></div>' +
        rowActions(w.featured) + '</div>';
    }).join("");
  }
  function renderTestimonials() {
    var el = $("#testimonials-list");
    if (!state.testimonials.length) { el.innerHTML = '<div class="empty-state">עדיין אין המלצות. לחצי על "+ המלצה חדשה".</div>'; return; }
    el.innerHTML = state.testimonials.map(function (t, i) {
      var thumb = t.image ? '<img src="' + esc(t.image) + '" alt="" loading="lazy" draggable="false" onerror="this.remove()">' : (t.video ? "VIDEO" : esc(Array.from(String(t.name || "F"))[0]));
      return '<div class="row" draggable="true" data-i="' + i + '">' +
        '<div class="row__thumb protected">' + thumb + '</div>' +
        '<div><div class="row__title">' + esc(t.name) + (t.video ? '<span class="badge badge--red">וידאו</span>' : "") + (t.featured ? '<span class="badge">דף הבית</span>' : "") + '</div>' +
        '<div class="row__meta">' + esc([t.role, t.company, t.project].filter(Boolean).join(" · ")) + '</div>' +
        '<div class="row__quote">' + esc(t.quote) + '</div></div>' +
        rowActions(t.featured) + '</div>';
    }).join("");
  }

  function bindList(listId, name) {
    var el = $("#" + listId);
    var rerender = function () { name === "works" ? renderWorks() : renderTestimonials(); };
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var i = Number(b.closest(".row").dataset.i), arr = state[name], act = b.dataset.act;
      if (act === "edit") return openEditor(name, i);
      if (act === "del") {
        var label = name === "works" ? arr[i].title : arr[i].name;
        if (!confirm('למחוק את "' + label + '"?')) return;
        arr.splice(i, 1);
      } else if (act === "star") {
        if (name === "works" && !arr[i].featured && arr.filter(function (w) { return w.featured; }).length >= 4) return toast("בדף הבית מוצגות עד 4 עבודות. הסירי ★ מאחת קודם.", true);
        arr[i].featured = !arr[i].featured;
      } else if (act === "up" && i > 0) { arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
      else if (act === "down" && i < arr.length - 1) { arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
      else return;
      dirty[name] = true; showDirtyBar(); rerender();
    });
    var dragI = null;
    el.addEventListener("dragstart", function (e) { var r = e.target.closest(".row"); if (!r) return; dragI = Number(r.dataset.i); r.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move"; });
    el.addEventListener("dragover", function (e) { e.preventDefault(); var r = e.target.closest(".row"); $$(".row", el).forEach(function (x) { x.classList.toggle("is-over", x === r); }); });
    el.addEventListener("drop", function (e) {
      e.preventDefault(); var r = e.target.closest(".row"); if (!r || dragI === null) return;
      var to = Number(r.dataset.i), arr = state[name];
      if (to !== dragI) { arr.splice(to, 0, arr.splice(dragI, 1)[0]); dirty[name] = true; showDirtyBar(); }
      dragI = null; rerender();
    });
    el.addEventListener("dragend", function () { $$(".row", el).forEach(function (x) { x.classList.remove("is-dragging", "is-over"); }); });
  }
  bindList("works-list", "works");
  bindList("testimonials-list", "testimonials");
  $$("[data-new]").forEach(function (b) { b.addEventListener("click", function () { openEditor(b.dataset.new === "work" ? "works" : "testimonials", -1); }); });

  /* ---------------- editor ---------------- */
  var editor = $("#editor"), editorForm = $("#editor-form"), editorPreview = $("#editor-preview");
  var editing = { name: null, index: -1 };

  function field(label, name, type, value, extra) {
    extra = extra || {};
    var inner;
    if (type === "textarea") inner = '<textarea name="' + name + '" rows="' + (extra.rows || 3) + '"' + (extra.required ? " required" : "") + '>' + esc(value) + '</textarea>';
    else if (type === "select") inner = '<select name="' + name + '">' + extra.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") + '</select>';
    else inner = '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '"' + (extra.placeholder ? ' placeholder="' + esc(extra.placeholder) + '"' : "") + (extra.ltr ? ' dir="ltr"' : "") + (extra.required ? " required" : "") + '>';
    if (extra.withPicker) {
      return '<div class="field field--with-btn"><span>' + label + '</span>' + inner +
        '<button class="btn btn--ghost btn--sm" type="button" data-pick="' + name + '">בחירה מהקבצים</button>' +
        '<label class="btn btn--ghost btn--sm upload-btn">העלאה<input type="file" data-upload-to="' + name + '" accept="' + (extra.accept || "image/*") + '"></label></div>';
    }
    return '<label class="field"><span>' + label + '</span>' + inner + '</label>';
  }

  function openEditor(name, index) {
    editing = { name: name, index: index };
    var item = index >= 0 ? state[name][index] : {};
    var cats = Object.entries((state.site && state.site.categories) || {});
    $("#editor-title").textContent = (index >= 0 ? "עריכת " : "הוספת ") + (name === "works" ? "עבודה" : "המלצה");
    if (name === "works") {
      editorForm.innerHTML =
        field("סוג", "type", "select", item.type || "auto", { options: [["auto", "זיהוי אוטומטי לפי הקישור"], ["youtube", "YouTube"], ["drive", "Google Drive (וידאו)"], ["vimeo", "Vimeo"], ["file", "קובץ וידאו שהועלה לאתר"], ["image", "תמונה"]] }) +
        field("קישור לסרטון, או נתיב לקובץ/תמונה שהעלית", "src", "text", item.src || "", { ltr: true, required: true, withPicker: true, accept: "image/*,video/mp4,video/webm", placeholder: "https://youtu.be/… או assets/media/…" }) +
        '<p class="detect" id="detect"></p>' +
        '<div class="form__row">' + field("שם העבודה", "title", "text", item.title || "", { required: true }) + field("לקוח", "client", "text", item.client || "") + '</div>' +
        '<div class="form__row">' + field("שנה", "year", "number", item.year || "", { ltr: true }) + field("קטגוריה", "category", "select", item.category || (cats[0] ? cats[0][0] : ""), { options: cats.length ? cats : [["", "—"]] }) + '</div>' +
        field("תמונה מקדימה (אופציונלי, ליוטיוב נלקחת אוטומטית)", "poster", "text", item.poster || "", { ltr: true, withPicker: true }) +
        field("תיאור קצר (מוצג בנגן)", "description", "textarea", item.description || "", { rows: 2 }) +
        '<label class="check"><input type="checkbox" name="featured"' + (item.featured ? " checked" : "") + '> להציג בדף הבית (עד 4 עבודות)</label>';
    } else {
      editorForm.innerHTML =
        field("הציטוט", "quote", "textarea", item.quote || "", { rows: 3, required: true }) +
        '<div class="form__row">' + field("שם", "name", "text", item.name || "", { required: true }) + field("תפקיד", "role", "text", item.role || "", { placeholder: "מנכ״לית" }) + '</div>' +
        '<div class="form__row">' + field("חברה / ארגון", "company", "text", item.company || "") + field("הפרויקט", "project", "text", item.project || "") + '</div>' +
        field("תמונה (אופציונלי)", "image", "text", item.image || "", { ltr: true, withPicker: true }) +
        field("המלצת וידאו (אופציונלי): קישור YouTube / Drive / Vimeo", "video", "text", item.video || "", { ltr: true, placeholder: "https://youtu.be/…" }) +
        '<label class="check"><input type="checkbox" name="featured"' + (item.featured ? " checked" : "") + '> להציג בדף הבית</label>';
    }
    updatePreview();
    editor.hidden = false;
    var first = editorForm.querySelector("input, textarea, select"); if (first) first.focus();
  }
  function closeEditor() { editor.hidden = true; editorPreview.innerHTML = ""; editorPreview.hidden = true; }
  $$("[data-editor-close]").forEach(function (b) { b.addEventListener("click", closeEditor); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (!$("#picker").hidden) closePicker(); else if (!editor.hidden) closeEditor(); } });

  function formValues(form) {
    var o = {}; new FormData(form).forEach(function (v, k) { o[k] = v; });
    $$("input[type=checkbox]", form).forEach(function (c) { o[c.name] = c.checked; });
    return o;
  }

  function updatePreview() {
    var detect = $("#detect"); if (!detect) { editorPreview.hidden = true; return; }
    var v = formValues(editorForm);
    if (!v.src) { detect.textContent = ""; editorPreview.hidden = true; return; }
    var info = parseSource({ src: v.src, type: v.type, poster: v.poster });
    var needsId = ["youtube", "drive", "vimeo"].indexOf(info.type) >= 0;
    if (needsId && (!info.id || info.id === info.src)) { detect.className = "detect detect--bad"; detect.textContent = "לא זיהיתי מזהה בקישור. בדקי שהקישור מלא."; editorPreview.hidden = true; return; }
    detect.className = "detect detect--ok"; detect.textContent = "זוהה: " + (TYPE_LABELS[info.type] || info.type) + (needsId ? " · " + info.id : "");
    editorPreview.hidden = false;
    if (info.type === "youtube") editorPreview.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(info.id) + '?rel=0&modestbranding=1&color=white" allowfullscreen></iframe>';
    else if (info.type === "drive") editorPreview.innerHTML = '<iframe src="https://drive.google.com/file/d/' + esc(info.id) + '/preview" allowfullscreen></iframe>';
    else if (info.type === "vimeo") editorPreview.innerHTML = '<iframe src="https://player.vimeo.com/video/' + esc(info.id) + '?title=0&byline=0&portrait=0" allowfullscreen></iframe>';
    else if (info.type === "file") editorPreview.innerHTML = '<video src="' + esc(info.src) + '" controls controlsList="nodownload"></video>';
    else editorPreview.innerHTML = '<img src="' + esc(info.src) + '" alt="" draggable="false">';
  }
  editorForm.addEventListener("input", function (e) { if (["src", "type", "poster"].indexOf(e.target.name) >= 0) updatePreview(); });

  editorForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var v = formValues(editorForm), name = editing.name, arr = state[name];
    var item = name === "works"
      ? { id: editing.index >= 0 ? arr[editing.index].id : "", title: v.title, client: v.client, year: v.year, category: v.category, type: v.type, src: v.src, poster: v.poster, featured: !!v.featured, description: v.description }
      : { quote: v.quote, name: v.name, role: v.role, company: v.company, project: v.project, image: v.image, video: v.video, featured: !!v.featured };
    if (name === "works" && item.featured) {
      var others = arr.filter(function (w, i) { return w.featured && i !== editing.index; }).length;
      if (others >= 4) return toast("בדף הבית מוצגות עד 4 עבודות. הסירי ★ מאחת קודם.", true);
    }
    var backup = arr.slice();
    if (editing.index >= 0) arr[editing.index] = item; else arr.unshift(item);
    var btn = $(".editor__foot .btn--red"); btn.disabled = true; btn.textContent = "שומר…";
    try { await saveContent(name); closeEditor(); }
    catch (ex) { state[name] = backup; toast(ex.message, true); }
    btn.disabled = false; btn.textContent = "שמירה ופרסום";
  });

  /* picker + inline upload inside the editor */
  var pickTarget = null;
  function openPicker(targetName) {
    pickTarget = targetName;
    var grid = $("#picker-grid");
    var files = state.media.filter(function (f) { return IMG_RE.test(f.name) || /\.(mp4|webm)$/i.test(f.name); });
    grid.innerHTML = files.length ? files.map(mediaCard.bind(null, true)).join("") : '<div class="empty-state" style="grid-column:1/-1">עדיין אין קבצים. העלי קודם בלשונית "תמונות וקבצים".</div>';
    $("#picker").hidden = false;
  }
  function closePicker() { $("#picker").hidden = true; pickTarget = null; }
  $$("[data-picker-close]").forEach(function (b) { b.addEventListener("click", closePicker); });
  $("#picker-grid").addEventListener("click", function (e) {
    var c = e.target.closest(".media"); if (!c || !pickTarget) return;
    var input = editorForm.querySelector('[name="' + pickTarget + '"]');
    if (input) { input.value = c.dataset.path; input.dispatchEvent(new Event("input", { bubbles: true })); }
    closePicker();
  });
  editorForm.addEventListener("click", function (e) { var b = e.target.closest("[data-pick]"); if (b) openPicker(b.dataset.pick); });
  editorForm.addEventListener("change", async function (e) {
    var inp = e.target.closest("input[type=file][data-upload-to]"); if (!inp || !inp.files[0]) return;
    var target = editorForm.querySelector('[name="' + inp.dataset.uploadTo + '"]');
    toast("מעלה את " + inp.files[0].name + "…");
    try {
      var path = await uploadFile(inp.files[0]);
      target.value = path; target.dispatchEvent(new Event("input", { bubbles: true }));
      toast("הקובץ הועלה");
    } catch (ex) { toast(ex.message, true); }
    inp.value = "";
  });

  /* ---------------- media ---------------- */
  function mediaCard(picker, f) {
    var isImg = IMG_RE.test(f.name);
    return '<div class="media" data-path="' + esc(f.path) + '" data-name="' + esc(f.name) + '">' +
      '<div class="media__img protected">' + (isImg ? '<img src="' + esc(f.path) + '" alt="" loading="lazy" draggable="false">' : esc((f.name.split(".").pop() || "").toUpperCase())) + '</div>' +
      '<div class="media__name" title="' + esc(f.path) + '">' + esc(f.name) + '</div>' +
      '<div class="media__size">' + fmtSize(f.size || 0) + '</div>' +
      (picker ? "" : '<div class="media__actions"><button type="button" data-copy>העתקת נתיב</button><button type="button" data-delete>מחיקה</button></div>') +
    '</div>';
  }
  async function loadMedia() {
    try { state.media = (await api("/api/media")).files; } catch (e) { state.media = []; }
    renderMedia();
  }
  function renderMedia() {
    var g = $("#media-grid");
    g.innerHTML = state.media.length ? state.media.map(mediaCard.bind(null, false)).join("") : '<div class="empty-state" style="grid-column:1/-1">עדיין אין קבצים. לחצי "+ העלאת קבצים".</div>';
  }
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1] || ""); };
      fr.onerror = function () { reject(new Error("לא הצלחתי לקרוא את הקובץ")); };
      fr.readAsDataURL(file);
    });
  }
  async function uploadFile(file) {
    var maxMb = 20;
    if (file.size > maxMb * 1024 * 1024) throw new Error("הקובץ גדול מ-" + maxMb + "MB. לסרטונים השתמשי ביוטיוב או בדרייב.");
    // the browser encodes; the Worker just forwards (keeps it fast on Cloudflare's free plan)
    var b64 = await fileToBase64(file);
    var r = await api("/api/media/upload?name=" + encodeURIComponent(file.name), { method: "POST", headers: { "Content-Type": "text/plain", "X-Encoding": "base64" }, body: b64 });
    state.media.unshift({ name: r.path.split("/").pop(), path: r.path, size: r.size });
    renderMedia(); watchBuild();
    return r.path;
  }
  $("#media-upload").addEventListener("change", async function (e) {
    var files = Array.from(e.target.files || []); e.target.value = "";
    for (var i = 0; i < files.length; i++) {
      toast("מעלה " + (i + 1) + "/" + files.length + ": " + files[i].name);
      try { await uploadFile(files[i]); } catch (ex) { toast(ex.message, true); }
    }
    if (files.length) toast("ההעלאה הסתיימה. הקבצים יהיו זמינים באתר תוך כדקה.");
  });
  $("#media-grid").addEventListener("click", async function (e) {
    var card = e.target.closest(".media"); if (!card) return;
    if (e.target.closest("[data-copy]") || e.target.closest(".media__img")) {
      try { await navigator.clipboard.writeText(card.dataset.path); toast("הנתיב הועתק: " + card.dataset.path); } catch (ex) { prompt("העתיקי את הנתיב:", card.dataset.path); }
    } else if (e.target.closest("[data-delete]")) {
      if (!confirm('למחוק את הקובץ "' + card.dataset.name + '" מהאתר?')) return;
      try { await api("/api/media/" + encodeURIComponent(card.dataset.name), { method: "DELETE" }); state.media = state.media.filter(function (f) { return f.name !== card.dataset.name; }); renderMedia(); toast("נמחק"); watchBuild(); }
      catch (ex) { toast(ex.message, true); }
    }
  });

  /* ---------------- settings ---------------- */
  var sform = $("#settings-form");
  function get(o, path) { return path.split(".").reduce(function (a, k) { return a && a[k]; }, o); }
  function renderSettings() {
    var s = state.site || {};
    $$("input[name], textarea[name]", sform).forEach(function (el) {
      if (el.type === "checkbox") { el.checked = !!get(s, el.name); return; }
      var v = get(s, el.name);
      if (el.name === "clients") v = (s.clients || []).join("\n");
      if (el.name === "creditRoles") v = (s.creditRoles || []).join(", ");
      el.value = v == null ? "" : v;
    });
    $("#cats").innerHTML = "";
    Object.entries(s.categories || {}).forEach(function (kv) { addCatRow(kv[0], kv[1]); });
  }
  function addCatRow(key, label) {
    var row = document.createElement("div"); row.className = "cat-row";
    row.innerHTML = '<label class="field"><span>שם להצגה</span><input data-cat-label value="' + esc(label || "") + '" placeholder="וידאו והפקה"></label>' +
      '<label class="field"><span>מזהה באנגלית</span><input data-cat-key dir="ltr" value="' + esc(key || "") + '" placeholder="video"></label>' +
      '<button class="ibtn ibtn--danger" type="button" title="הסרה" data-cat-del>✕</button>';
    $("#cats").appendChild(row);
  }
  $("#cat-add").addEventListener("click", function () { addCatRow("", ""); });
  $("#cats").addEventListener("click", function (e) { if (e.target.closest("[data-cat-del]")) e.target.closest(".cat-row").remove(); });
  $("#cats").addEventListener("input", function (e) {
    if (!e.target.hasAttribute("data-cat-label")) return;
    var keyInput = e.target.closest(".cat-row").querySelector("[data-cat-key]");
    if (!keyInput.value || keyInput.dataset.auto === "1") { keyInput.value = translit(e.target.value); keyInput.dataset.auto = "1"; }
  });
  function translit(s) {
    var map = { "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "ch", "ט": "t", "י": "y", "כ": "k", "ך": "k", "ל": "l", "מ": "m", "ם": "m", "נ": "n", "ן": "n", "ס": "s", "ע": "a", "פ": "p", "ף": "f", "צ": "ts", "ץ": "ts", "ק": "k", "ר": "r", "ש": "sh", "ת": "t" };
    return String(s).toLowerCase().split("").map(function (c) { return map[c] || c; }).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  }
  sform.addEventListener("submit", async function (e) {
    e.preventDefault();
    var v = formValues(sform), s = state.site || {};
    var cats = {};
    $$(".cat-row", sform).forEach(function (r) { var k = r.querySelector("[data-cat-key]").value.trim(), l = r.querySelector("[data-cat-label]").value.trim(); if (k && l) cats[k] = l; });
    var data = {
      brand: s.brand || "FORMAL", tagline: v.tagline,
      owner: { name: v["owner.name"], role: v["owner.role"], city: v["owner.city"] },
      contact: { phone: v["contact.phone"], email: v["contact.email"], behance: v["contact.behance"] },
      categories: cats,
      clients: String(v.clients || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean),
      creditRoles: String(v.creditRoles || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
      showSourceLink: !!v.showSourceLink, adminApi: s.adminApi || ""
    };
    var btn = $("button[type=submit]", sform); btn.disabled = true;
    try { var r = await api("/api/content/site", { method: "PUT", json: { data: data } }); state.site = r.data; renderSettings(); toast("ההגדרות נשמרו ופורסמו."); watchBuild(); }
    catch (ex) { toast(ex.message, true); }
    btn.disabled = false;
  });

  /* ---------------- admins ---------------- */
  async function loadAdmins() {
    try { state.admins = (await api("/api/admins")).admins; } catch (e) { state.admins = []; }
    renderAdmins();
  }
  function renderAdmins() {
    var el = $("#admins-list"), isOwner = me && me.role === "owner";
    el.innerHTML = state.admins.map(function (a) {
      return '<div class="row" style="grid-template-columns:1fr auto"><div><div class="row__title">' + esc(a.name) + ' <span class="badge' + (a.role === "owner" ? " badge--red" : "") + '">' + (a.role === "owner" ? "בעלת האתר" : "מנהל/ת") + '</span>' + (a.email === me.email ? '<span class="badge">את</span>' : "") + '</div>' +
        '<div class="row__meta" dir="ltr" style="text-align:right">' + esc(a.email) + '</div></div>' +
        '<div class="row__actions">' + (isOwner && a.role !== "owner" ? '<button class="ibtn" type="button" title="איפוס סיסמה" data-reset="' + esc(a.email) + '">🔑</button><button class="ibtn ibtn--danger" type="button" title="הסרה" data-remove="' + esc(a.email) + '">✕</button>' : "") + '</div></div>';
    }).join("");
    $("#admin-add").hidden = !isOwner;
  }
  $("#admins-list").addEventListener("click", async function (e) {
    var rm = e.target.closest("[data-remove]"), rs = e.target.closest("[data-reset]");
    try {
      if (rm) { if (!confirm("להסיר את " + rm.dataset.remove + "?")) return; await api("/api/admins/" + encodeURIComponent(rm.dataset.remove), { method: "DELETE" }); toast("הוסר/ה"); loadAdmins(); }
      if (rs) { var pw = prompt("סיסמה חדשה עבור " + rs.dataset.reset + " (לפחות 8 תווים):"); if (!pw) return; await api("/api/password", { method: "POST", json: { email: rs.dataset.reset, password: pw } }); toast("הסיסמה אופסה. מסרי אותה בנפרד."); }
    } catch (ex) { toast(ex.message, true); }
  });
  $("#admin-add").addEventListener("submit", async function (e) {
    e.preventDefault();
    var v = formValues(e.target);
    try { await api("/api/admins", { method: "POST", json: v }); toast("נוסף/ה. מסרי את הסיסמה בנפרד."); e.target.reset(); loadAdmins(); }
    catch (ex) { toast(ex.message, true); }
  });
  /* ---------------- messages (owner only) ---------------- */
  async function loadMessages() {
    var el = $("#messages-list");
    try {
      var r = await api("/api/messages");
      state.messages = r.messages || [];
      $("#messages-sub").textContent = r.emailEnabled
        ? "כל פנייה נשלחת למייל שלך וגם נשמרת כאן כגיבוי עד 180 יום. רואה אותן רק בעלת האתר."
        : "שליחה למייל עדיין לא הופעלה (הריצי שוב את deploy-admin.sh עם מפתח Web3Forms). בינתיים הפניות נשמרות כאן בלבד, עד 180 יום.";
      var cnt = $("#messages-count"); cnt.textContent = state.messages.length; cnt.hidden = !state.messages.length;
      el.innerHTML = state.messages.length ? state.messages.map(function (m) {
        var when = new Date(m.at).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" });
        return '<div class="row row--msg" data-id="' + esc(m.id) + '"><div>' +
          '<div class="row__title">' + esc(m.name) + ' <span class="badge">' + esc(when) + '</span></div>' +
          '<div class="row__meta" dir="ltr" style="text-align:right">' +
            (m.phone ? '<a href="tel:' + esc(m.phone.replace(/[^\d+]/g, "")) + '">' + esc(m.phone) + '</a>' : "") +
            (m.phone && m.email ? " · " : "") +
            (m.email ? '<a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>' : "") + '</div>' +
          '<p class="row__msg">' + esc(m.message) + '</p>' +
          (m.page ? '<div class="row__meta">נשלח מ: ' + esc(m.page) + '</div>' : "") +
          '</div><div class="row__actions">' +
          '<button class="ibtn ibtn--danger" type="button" title="מחיקה" data-msg-del>✕</button></div></div>';
      }).join("") : '<div class="empty-state">עדיין לא התקבלו פניות.</div>';
    } catch (e) { el.innerHTML = '<div class="empty-state">' + esc(e.message) + '</div>'; }
  }
  $("#messages-refresh").addEventListener("click", loadMessages);
  $("#messages-list").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-msg-del]"); if (!b) return;
    var id = b.closest(".row").dataset.id;
    if (!confirm("למחוק את הפנייה הזו?")) return;
    try { await api("/api/messages/" + encodeURIComponent(id), { method: "DELETE" }); toast("נמחק"); loadMessages(); }
    catch (ex) { toast(ex.message, true); }
  });

  $("#pw-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var v = formValues(e.target);
    try { await api("/api/password", { method: "POST", json: { password: v.password } }); toast("הסיסמה עודכנה"); e.target.reset(); }
    catch (ex) { toast(ex.message, true); }
  });

  boot();
})();
