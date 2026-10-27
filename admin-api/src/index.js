/* =========================================================
   FORMAL · Admin API (Cloudflare Worker)
   ---------------------------------------------------------
   כניסה במייל + סיסמה, ניהול מנהלים, קריאה/כתיבה של קבצי התוכן
   (content/*.json), העלאת מדיה (assets/media) ישירות לריפו בגיטהאב,
   וקבלת פניות מטופס יצירת הקשר (נשלחות למייל של בעלת האתר).
   כל שמירה = קומיט בשם בעלת האתר → GitHub Pages מתעדכן תוך כדקה.

   Secrets (wrangler secret put):  GITHUB_TOKEN, SESSION_SECRET, OWNER_EMAIL, OWNER_PASSWORD,
                                   WEB3FORMS_KEY (אופציונלי – שליחת פניות למייל)
   Vars (wrangler.toml):           GH_OWNER, GH_REPO, GH_BRANCH, ALLOWED_ORIGINS,
                                   COMMIT_NAME, COMMIT_EMAIL, MAX_UPLOAD_MB, ADMIN_URL, SITE_URL
   KV binding:                     ADMIN_KV
   ========================================================= */

const te = new TextEncoder();
const td = new TextDecoder();
const CONTENT_FILES = { site: "content/site.json", works: "content/works.json", testimonials: "content/testimonials.json" };
const MEDIA_DIR = "assets/media";
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif", "svg", "mp4", "webm", "pdf"];
const TOKEN_TTL = 7 * 24 * 3600;
const PBKDF2_ITER = 100000;   // Cloudflare Workers allows at most 100,000 PBKDF2 iterations
const MSG_TTL = 180 * 24 * 3600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env, url);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (err) {
      return json({ error: err.message || "שגיאה לא צפויה" }, err.status || 500, cors);
    }
  }
};

/* ---------------- routing ---------------- */
async function route(request, env, url) {
  const m = request.method;
  const p = url.pathname.replace(/\/+$/, "");
  const seg = p.split("/").filter(Boolean); // ["api", ...]
  if (seg[0] !== "api") return json({ ok: true, service: "formal-admin" });

  if (m === "GET" && p === "/api/health") return json({ ok: true });
  if (m === "POST" && p === "/api/login") return login(request, env);
  if (m === "POST" && p === "/api/forgot") return forgot(request, env);
  if (m === "POST" && p === "/api/reset") return resetPassword(request, env);
  if (m === "POST" && p === "/api/contact") return contact(request, env);

  const admin = await requireAuth(request, env);

  if (m === "GET" && p === "/api/me") return json({ admin: publicAdmin(admin) });
  if (m === "GET" && p === "/api/status") return pagesStatus(env);

  if (seg[1] === "content" && seg[2] && CONTENT_FILES[seg[2]]) {
    if (m === "GET") return getContent(env, seg[2]);
    if (m === "PUT") return putContent(request, env, seg[2], admin);
  }
  if (seg[1] === "media") {
    if (m === "GET" && !seg[2]) return listMedia(env);
    if (m === "POST" && seg[2] === "upload") return upload(request, env, url, admin);
    if (m === "DELETE" && seg[2]) return deleteMedia(env, decodeURIComponent(seg[2]), admin);
  }
  if (seg[1] === "admins") {
    if (m === "GET" && !seg[2]) return listAdmins(env);
    if (m === "POST" && !seg[2]) return addAdmin(request, env, admin);
    if (m === "DELETE" && seg[2]) return removeAdmin(env, decodeURIComponent(seg[2]), admin);
  }
  if (seg[1] === "messages") {
    if (m === "GET" && !seg[2]) return listMessages(env, admin);
    if (m === "DELETE" && seg[2]) return deleteMessage(env, decodeURIComponent(seg[2]), admin);
  }
  if (m === "POST" && p === "/api/password") return changePassword(request, env, admin);

  throw httpError(404, "נתיב לא קיים");
}

/* ---------------- helpers ---------------- */
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const ok = allowed.includes(origin) || isLocal;
  return {
    "Access-Control-Allow-Origin": ok ? origin : (allowed[0] || "null"),
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Filename,X-Encoding",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, "גוף הבקשה אינו JSON תקין"); }
}

function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64decode(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }
function b64url(bytes) { return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDecode(str) { str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "="; return b64decode(str); }
function b64ToUtf8(b64) { return td.decode(b64decode(b64.replace(/\n/g, ""))); }

function normEmail(e) { return String(e || "").trim().toLowerCase(); }
function isEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }
function cleanStr(v, max = 2000) { return v == null ? "" : String(v).trim().slice(0, max); }

async function rateLimit(env, key, max, ttl, message) {
  const n = Number(await env.ADMIN_KV.get(key)) || 0;
  if (n >= max) throw httpError(429, message);
  await env.ADMIN_KV.put(key, String(n + 1), { expirationTtl: ttl });
}

/* ---------------- passwords & tokens ---------------- */
async function hashPassword(password, saltB64, iter) {
  const iterations = Math.min(Number(iter) || PBKDF2_ITER, PBKDF2_ITER);
  const salt = saltB64 ? b64decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return { salt: b64encode(salt), hash: b64encode(new Uint8Array(bits)), iter: iterations };
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmac(env, data) {
  if (!env.SESSION_SECRET) throw httpError(500, "SESSION_SECRET לא הוגדר");
  const key = await crypto.subtle.importKey("raw", te.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(data))));
}
async function issueToken(env, email) {
  const payload = b64url(te.encode(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + TOKEN_TTL })));
  return payload + "." + await hmac(env, payload);
}
async function verifyToken(env, token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expect = await hmac(env, payload);
  if (!timingSafeEqual(sig, expect)) return null;
  try {
    const data = JSON.parse(td.decode(b64urlDecode(payload)));
    if (!data.e || data.x < Date.now() / 1000) return null;
    return data.e;
  } catch { return null; }
}

/* ---------------- admins (KV) ---------------- */
async function getAdmins(env) {
  let admins = await env.ADMIN_KV.get("admins", "json");
  if (!admins || !Object.keys(admins).length) {
    const email = normEmail(env.OWNER_EMAIL);
    if (!isEmail(email) || !env.OWNER_PASSWORD) throw httpError(500, "לא הוגדרו OWNER_EMAIL / OWNER_PASSWORD");
    const { salt, hash, iter } = await hashPassword(env.OWNER_PASSWORD);
    admins = { [email]: { name: "בעלת האתר", role: "owner", salt, hash, iter, created: new Date().toISOString() } };
    await env.ADMIN_KV.put("admins", JSON.stringify(admins));
  }
  return admins;
}
async function saveAdmins(env, admins) { await env.ADMIN_KV.put("admins", JSON.stringify(admins)); }
function publicAdmin(a) { return { email: a.email, name: a.name, role: a.role, created: a.created }; }

async function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const email = await verifyToken(env, token);
  if (!email) throw httpError(401, "נדרשת התחברות");
  const admins = await getAdmins(env);
  const a = admins[email];
  if (!a) throw httpError(401, "המשתמש הוסר");
  return { email, ...a };
}
function requireOwner(admin) { if (admin.role !== "owner") throw httpError(403, "פעולה זו שמורה לבעלת האתר"); }

async function login(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const failKey = "fail:" + ip;
  const fails = Number(await env.ADMIN_KV.get(failKey)) || 0;
  if (fails >= 10) throw httpError(429, "יותר מדי ניסיונות. נסי שוב בעוד 15 דקות");

  const body = await readJson(request);
  const email = normEmail(body.email);
  const password = String(body.password || "");
  const admins = await getAdmins(env);
  const a = admins[email];
  let ok = false;
  if (a) {
    const { hash } = await hashPassword(password, a.salt, a.iter);
    ok = timingSafeEqual(hash, a.hash);
  }
  if (!ok) {
    await env.ADMIN_KV.put(failKey, String(fails + 1), { expirationTtl: 900 });
    throw httpError(401, "מייל או סיסמה לא נכונים");
  }
  await env.ADMIN_KV.delete(failKey);
  const token = await issueToken(env, email);
  return json({ token, admin: publicAdmin({ email, ...a }) });
}

/* ---------------- forgot / reset password ----------------
   The reset link is always e-mailed to the owner's inbox (Web3Forms delivers only there).
   For another admin, the owner receives the link and forwards it. In DEV_MODE (local preview)
   the link is returned on screen instead. */
async function forgot(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  await rateLimit(env, "forgot:" + ip, 5, 3600, "יותר מדי בקשות איפוס. נסי שוב בעוד שעה");
  const body = await readJson(request);
  const email = normEmail(body.email);
  if (!isEmail(email)) throw httpError(400, "כתובת מייל לא תקינה");
  const admins = await getAdmins(env);
  const result = { ok: true, emailEnabled: !!env.WEB3FORMS_KEY, dev: env.DEV_MODE === "1" };
  const a = admins[email];
  if (!a) return json(result);                       // never reveal whether the e-mail exists
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.ADMIN_KV.put("reset:" + token, JSON.stringify({ email, at: Date.now() }), { expirationTtl: 1800 });
  const base = env.ADMIN_URL || "admin.html";
  const link = base + (base.includes("?") ? "&" : "?") + "reset=" + token;
  if (env.DEV_MODE === "1") { result.devLink = link; return json(result); }
  if (env.WEB3FORMS_KEY) {
    const forOther = a.role !== "owner";
    const message = (forOther
      ? "התקבלה בקשה לאיפוס סיסמה עבור המנהל/ת " + email + ".\nאם זה מקובל עלייך, העבירי לו/לה את הקישור הבא (תקף 30 דקות):\n"
      : "התקבלה בקשה לאיפוס הסיסמה שלך לממשק הניהול. הקישור תקף 30 דקות:\n") + link + "\n\nאם לא ביקשת איפוס, התעלמי מההודעה. הסיסמה הנוכחית נשארת בתוקף.";
    try {
      await fetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ access_key: env.WEB3FORMS_KEY, subject: "איפוס סיסמה · ממשק הניהול FORMAL", from_name: "FORMAL · ממשק ניהול", message })
      });
    } catch {}
  }
  return json(result);
}

async function resetPassword(request, env) {
  const body = await readJson(request);
  const token = String(body.token || "");
  const password = String(body.password || "");
  if (!/^[\w-]{20,}$/.test(token)) throw httpError(400, "קישור האיפוס לא תקין");
  if (password.length < 8) throw httpError(400, "סיסמה חייבת להכיל לפחות 8 תווים");
  const rec = await env.ADMIN_KV.get("reset:" + token, "json");
  if (!rec) throw httpError(400, "קישור האיפוס פג תוקף או כבר נוצל. בקשי קישור חדש");
  const admins = await getAdmins(env);
  if (!admins[rec.email]) throw httpError(400, "המשתמש כבר לא קיים");
  const { salt, hash, iter } = await hashPassword(password);
  admins[rec.email] = { ...admins[rec.email], salt, hash, iter };
  await saveAdmins(env, admins);
  await env.ADMIN_KV.delete("reset:" + token);
  await env.ADMIN_KV.delete("fail:" + (request.headers.get("CF-Connecting-IP") || "unknown"));
  return json({ ok: true, email: rec.email });
}

async function listAdmins(env) {
  const admins = await getAdmins(env);
  return json({ admins: Object.entries(admins).map(([email, a]) => publicAdmin({ email, ...a })) });
}
async function addAdmin(request, env, actor) {
  requireOwner(actor);
  const body = await readJson(request);
  const email = normEmail(body.email);
  const name = cleanStr(body.name, 80);
  const password = String(body.password || "");
  if (!isEmail(email)) throw httpError(400, "כתובת מייל לא תקינה");
  if (password.length < 8) throw httpError(400, "סיסמה חייבת להכיל לפחות 8 תווים");
  const admins = await getAdmins(env);
  if (admins[email]) throw httpError(409, "המייל הזה כבר רשום");
  const { salt, hash, iter } = await hashPassword(password);
  admins[email] = { name: name || email, role: "admin", salt, hash, iter, created: new Date().toISOString() };
  await saveAdmins(env, admins);
  return json({ admin: publicAdmin({ email, ...admins[email] }) }, 201);
}
async function removeAdmin(env, email, actor) {
  requireOwner(actor);
  email = normEmail(email);
  const admins = await getAdmins(env);
  if (!admins[email]) throw httpError(404, "לא נמצא");
  if (admins[email].role === "owner") throw httpError(400, "אי אפשר להסיר את בעלת האתר");
  delete admins[email];
  await saveAdmins(env, admins);
  return json({ ok: true });
}
async function changePassword(request, env, actor) {
  const body = await readJson(request);
  const password = String(body.password || "");
  const target = body.email ? normEmail(body.email) : actor.email;
  if (password.length < 8) throw httpError(400, "סיסמה חייבת להכיל לפחות 8 תווים");
  if (target !== actor.email) requireOwner(actor);
  const admins = await getAdmins(env);
  if (!admins[target]) throw httpError(404, "לא נמצא");
  const { salt, hash, iter } = await hashPassword(password);
  admins[target] = { ...admins[target], salt, hash, iter };
  await saveAdmins(env, admins);
  return json({ ok: true });
}

/* ---------------- GitHub ---------------- */
function ghBase(env) { return `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}`; }
async function gh(env, path, opts = {}) {
  if (!env.GITHUB_TOKEN) throw httpError(500, "GITHUB_TOKEN לא הוגדר");
  const body = opts.rawBody != null ? opts.rawBody : (opts.body ? JSON.stringify(opts.body) : undefined);
  const res = await fetch(path.startsWith("http") ? path : ghBase(env) + path, {
    method: opts.method || "GET",
    headers: {
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "formal-admin-worker",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body
  });
  if (res.status === 404 && opts.allow404) return null;
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch {}
    throw httpError(res.status === 401 || res.status === 403 ? 502 : res.status, "GitHub: " + msg);
  }
  return res.status === 204 ? {} : res.json();
}

async function readFile(env, path) {
  const data = await gh(env, `/contents/${path}?ref=${env.GH_BRANCH}`, { allow404: true });
  if (!data) return null;
  return { text: b64ToUtf8(data.content), sha: data.sha };
}

/** commit several files atomically. files: [{path, text} | {path, base64} | {path, delete:true}] */
async function commitFiles(env, files, message, actor) {
  const branch = env.GH_BRANCH || "main";
  const ref = await gh(env, `/git/ref/heads/${branch}`);
  const headSha = ref.object.sha;
  const head = await gh(env, `/git/commits/${headSha}`);
  const tree = [];
  for (const f of files) {
    if (f.delete) { tree.push({ path: f.path, mode: "100644", type: "blob", sha: null }); continue; }
    // base64 is JSON-safe, so the body is assembled by concatenation (no re-encoding of large uploads)
    const blob = f.base64 != null
      ? await gh(env, "/git/blobs", { method: "POST", rawBody: '{"content":"' + f.base64 + '","encoding":"base64"}' })
      : await gh(env, "/git/blobs", { method: "POST", body: { content: f.text, encoding: "utf-8" } });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await gh(env, "/git/trees", { method: "POST", body: { base_tree: head.tree.sha, tree } });
  const author = { name: env.COMMIT_NAME || env.GH_OWNER, email: env.COMMIT_EMAIL || `${env.GH_OWNER}@users.noreply.github.com`, date: new Date().toISOString() };
  const commit = await gh(env, "/git/commits", { method: "POST", body: { message: `${message}\n\nדרך ממשק הניהול · ${actor.email}`, tree: newTree.sha, parents: [headSha], author, committer: author } });
  await gh(env, `/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: commit.sha, force: false } });
  return commit.sha;
}

/* ---------------- content ---------------- */
async function getContent(env, name) {
  const f = await readFile(env, CONTENT_FILES[name]);
  if (!f) return json({ data: name === "site" ? {} : [], sha: null });
  let data; try { data = JSON.parse(f.text); } catch { throw httpError(500, "קובץ התוכן בריפו אינו JSON תקין"); }
  return json({ data, sha: f.sha });
}

function validateWorks(list) {
  if (!Array.isArray(list)) throw httpError(400, "works חייב להיות רשימה");
  const ids = new Set();
  return list.map((w, i) => {
    const item = {
      id: slug(w.id) || slug(w.title) || "work-" + (i + 1),
      title: cleanStr(w.title, 200),
      client: cleanStr(w.client, 200),
      year: w.year ? Number(String(w.year).replace(/\D/g, "")) || "" : "",
      category: cleanStr(w.category, 40),
      type: cleanStr(w.type, 20) || "auto",
      src: cleanStr(w.src, 1000),
      poster: cleanStr(w.poster, 1000),
      featured: !!w.featured,
      description: cleanStr(w.description, 2000)
    };
    if (!item.title) throw httpError(400, `לעבודה מספר ${i + 1} חסר שם`);
    if (!item.src) throw httpError(400, `לעבודה "${item.title}" חסר קישור או קובץ`);
    while (ids.has(item.id)) item.id += "-2";
    ids.add(item.id);
    return item;
  });
}
function validateTestimonials(list) {
  if (!Array.isArray(list)) throw httpError(400, "testimonials חייב להיות רשימה");
  return list.map((t, i) => {
    const item = {
      quote: cleanStr(t.quote, 1500), name: cleanStr(t.name, 120), role: cleanStr(t.role, 120), company: cleanStr(t.company, 160),
      project: cleanStr(t.project, 200), image: cleanStr(t.image, 1000), video: cleanStr(t.video, 1000), featured: !!t.featured
    };
    if (!item.quote || !item.name) throw httpError(400, `להמלצה מספר ${i + 1} חסר ציטוט או שם`);
    return item;
  });
}
function validateSite(obj, current) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw httpError(400, "site חייב להיות אובייקט");
  const cur = current || {};
  const contact = obj.contact || {};
  const owner = obj.owner || {};
  const cats = {};
  Object.entries(obj.categories || {}).forEach(([k, v]) => { const key = slug(k); if (key && cleanStr(v, 60)) cats[key] = cleanStr(v, 60); });
  return {
    brand: cleanStr(obj.brand, 60) || "FORMAL",
    tagline: cleanStr(obj.tagline, 200),
    owner: { name: cleanStr(owner.name, 120), role: cleanStr(owner.role, 120), city: cleanStr(owner.city, 120) },
    contact: {
      phone: cleanStr(contact.phone, 40), email: cleanStr(contact.email, 200), behance: cleanStr(contact.behance, 500)
    },
    categories: cats,
    clients: (Array.isArray(obj.clients) ? obj.clients : []).map(c => cleanStr(c, 120)).filter(Boolean),
    creditRoles: (Array.isArray(obj.creditRoles) ? obj.creditRoles : []).map(c => cleanStr(c, 60)).filter(Boolean),
    showSourceLink: !!obj.showSourceLink,
    adminApi: cur.adminApi || cleanStr(obj.adminApi, 300)   // לא ניתן לשינוי מהממשק
  };
}

async function putContent(request, env, name, actor) {
  const body = await readJson(request);
  let data = body.data;
  const path = CONTENT_FILES[name];
  const labels = { works: "עבודות", testimonials: "המלצות", site: "הגדרות האתר" };
  if (name === "works") data = validateWorks(data);
  else if (name === "testimonials") data = validateTestimonials(data);
  else {
    const cur = await readFile(env, path);
    let curData = {}; try { curData = cur ? JSON.parse(cur.text) : {}; } catch {}
    data = validateSite(data, curData);
  }
  const text = JSON.stringify(data, null, 2) + "\n";
  const sha = await commitFiles(env, [{ path, text }], `עדכון ${labels[name]}`, actor);
  return json({ ok: true, commit: sha, data });
}

/* ---------------- media ---------------- */
async function listMedia(env) {
  const list = await gh(env, `/contents/${MEDIA_DIR}?ref=${env.GH_BRANCH}`, { allow404: true });
  const files = (list || []).filter(f => f.type === "file" && !f.name.startsWith(".")).map(f => ({ name: f.name, path: f.path, size: f.size, sha: f.sha }));
  return json({ files });
}

async function upload(request, env, url, actor) {
  const maxBytes = Number(env.MAX_UPLOAD_MB || 20) * 1024 * 1024;
  const rawName = decodeURIComponent(url.searchParams.get("name") || request.headers.get("X-Filename") || "file");
  const ext = (rawName.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw httpError(400, "סוג קובץ לא נתמך. מותר: " + ALLOWED_EXT.join(", "));
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes * 1.4) throw httpError(413, `הקובץ גדול מדי (מקסימום ${env.MAX_UPLOAD_MB || 20}MB). לסרטונים ארוכים השתמשי ביוטיוב או בדרייב`);

  // the admin UI sends base64 text (cheap for the Worker); raw bytes are also accepted
  let b64, size;
  if ((request.headers.get("X-Encoding") || "").toLowerCase() === "base64") {
    b64 = (await request.text()).replace(/^data:[^;]*;base64,/, "").replace(/[\s"]/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw httpError(400, "קידוד הקובץ לא תקין");
    size = Math.floor(b64.length * 3 / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  } else {
    const bytes = new Uint8Array(await request.arrayBuffer());
    size = bytes.length; b64 = b64encode(bytes);
  }
  if (!size) throw httpError(400, "קובץ ריק");
  if (size > maxBytes) throw httpError(413, `הקובץ גדול מדי (מקסימום ${env.MAX_UPLOAD_MB || 20}MB)`);

  const base = slug(rawName.replace(/\.[^.]+$/, "")) || "file";
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").slice(2);
  const path = `${MEDIA_DIR}/${base}-${stamp}.${ext}`;
  const sha = await commitFiles(env, [{ path, base64: b64 }], `העלאת מדיה: ${base}.${ext}`, actor);
  return json({ ok: true, path, commit: sha, size }, 201);
}

async function deleteMedia(env, name, actor) {
  if (!/^[\w.-]+$/.test(name)) throw httpError(400, "שם קובץ לא תקין");
  const path = `${MEDIA_DIR}/${name}`;
  const exists = await gh(env, `/contents/${path}?ref=${env.GH_BRANCH}`, { allow404: true });
  if (!exists) throw httpError(404, "הקובץ לא נמצא");
  await commitFiles(env, [{ path, delete: true }], `מחיקת מדיה: ${name}`, actor);
  return json({ ok: true });
}

/* ---------------- contact form → owner's inbox ---------------- */
async function contact(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const body = await readJson(request);
  if (body.website) return json({ ok: true });          // honeypot field filled → bot, pretend success
  const name = cleanStr(body.name, 120);
  const phone = cleanStr(body.phone, 40);
  const email = normEmail(body.email);
  const message = cleanStr(body.message, 3000);
  if (!name || !message) throw httpError(400, "חסרים שם או תוכן ההודעה");
  if (!phone && !email) throw httpError(400, "השאירו טלפון או מייל כדי שנוכל לחזור אליכם");
  if (email && !isEmail(email)) throw httpError(400, "כתובת המייל לא תקינה");
  if (!body.consent) throw httpError(400, "יש לאשר את מדיניות הפרטיות");
  await rateLimit(env, "contact:" + ip, 5, 3600, "נשלחו יותר מדי הודעות מהמחשב הזה. נסו שוב בעוד שעה");

  const id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  const msg = { id, name, phone, email, message, at: new Date().toISOString(), page: cleanStr(body.page, 300) };
  await env.ADMIN_KV.put("msg:" + id, JSON.stringify(msg), { expirationTtl: MSG_TTL });

  let emailed = false;
  if (env.WEB3FORMS_KEY) {
    try {
      const r = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          access_key: env.WEB3FORMS_KEY,
          subject: "פנייה חדשה מהאתר FORMAL · " + name,
          from_name: "FORMAL · טופס יצירת קשר",
          name, phone: phone || "-", email: email || "לא נמסר",
          replyto: email || undefined,
          message: message + "\n\n---\nנשלח מהעמוד: " + (msg.page || "-") + "\nזמן: " + msg.at
        })
      });
      emailed = r.ok;
    } catch { emailed = false; }
  }
  return json({ ok: true, emailed });
}

async function listMessages(env, actor) {
  requireOwner(actor);
  const list = await env.ADMIN_KV.list({ prefix: "msg:", limit: 200 });
  const msgs = [];
  for (const k of list.keys) { const v = await env.ADMIN_KV.get(k.name, "json"); if (v) msgs.push(v); }
  msgs.sort((a, b) => (a.at < b.at ? 1 : -1));
  return json({ messages: msgs, emailEnabled: !!env.WEB3FORMS_KEY });
}
async function deleteMessage(env, id, actor) {
  requireOwner(actor);
  if (!/^[\w-]+$/.test(id)) throw httpError(400, "מזהה לא תקין");
  await env.ADMIN_KV.delete("msg:" + id);
  return json({ ok: true });
}

/* ---------------- pages status ---------------- */
async function pagesStatus(env) {
  try {
    const b = await gh(env, "/pages/builds/latest");
    return json({ status: b.status, updated: b.updated_at, url: env.SITE_URL || `https://${String(env.GH_OWNER).toLowerCase()}.github.io/${env.GH_REPO}/` });
  } catch (e) {
    return json({ status: "unknown", error: e.message });
  }
}
