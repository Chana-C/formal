/* =========================================================
   FORMAL · Admin API (Cloudflare Worker)
   ---------------------------------------------------------
   כניסה במייל + סיסמה, ניהול מנהלים, קריאה/כתיבה של קבצי התוכן
   (content/*.json) והעלאת מדיה (assets/media) ישירות לריפו בגיטהאב.
   כל שמירה = קומיט בשם בעלת האתר → GitHub Pages מתעדכן תוך כדקה.

   Secrets (wrangler secret put):  GITHUB_TOKEN, SESSION_SECRET, OWNER_EMAIL, OWNER_PASSWORD
   Vars (wrangler.toml):           GH_OWNER, GH_REPO, GH_BRANCH, ALLOWED_ORIGINS,
                                   COMMIT_NAME, COMMIT_EMAIL, MAX_UPLOAD_MB
   KV binding:                     ADMIN_KV
   ========================================================= */

const te = new TextEncoder();
const td = new TextDecoder();
const CONTENT_FILES = { site: "content/site.json", works: "content/works.json", testimonials: "content/testimonials.json" };
const MEDIA_DIR = "assets/media";
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif", "svg", "mp4", "webm", "pdf"];
const TOKEN_TTL = 7 * 24 * 3600;

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

  if (m === "POST" && p === "/api/login") return login(request, env);
  if (m === "GET" && p === "/api/health") return json({ ok: true });

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
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Filename",
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
function utf8ToB64(str) { return b64encode(te.encode(str)); }
function b64ToUtf8(b64) { return td.decode(b64decode(b64.replace(/\n/g, ""))); }

function normEmail(e) { return String(e || "").trim().toLowerCase(); }
function isEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60); }

/* ---------------- passwords & tokens ---------------- */
async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64decode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256);
  return { salt: b64encode(salt), hash: b64encode(new Uint8Array(bits)) };
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
    // bootstrap: the owner from secrets
    const email = normEmail(env.OWNER_EMAIL);
    if (!isEmail(email) || !env.OWNER_PASSWORD) throw httpError(500, "לא הוגדרו OWNER_EMAIL / OWNER_PASSWORD");
    const { salt, hash } = await hashPassword(env.OWNER_PASSWORD);
    admins = { [email]: { name: "בעלת האתר", role: "owner", salt, hash, created: new Date().toISOString() } };
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
    const { hash } = await hashPassword(password, a.salt);
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

async function listAdmins(env) {
  const admins = await getAdmins(env);
  return json({ admins: Object.entries(admins).map(([email, a]) => publicAdmin({ email, ...a })) });
}
async function addAdmin(request, env, actor) {
  requireOwner(actor);
  const body = await readJson(request);
  const email = normEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 80);
  const password = String(body.password || "");
  if (!isEmail(email)) throw httpError(400, "כתובת מייל לא תקינה");
  if (password.length < 8) throw httpError(400, "סיסמה חייבת להכיל לפחות 8 תווים");
  const admins = await getAdmins(env);
  if (admins[email]) throw httpError(409, "המייל הזה כבר רשום");
  const { salt, hash } = await hashPassword(password);
  admins[email] = { name: name || email, role: "admin", salt, hash, created: new Date().toISOString() };
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
  const { salt, hash } = await hashPassword(password);
  admins[target] = { ...admins[target], salt, hash };
  await saveAdmins(env, admins);
  return json({ ok: true });
}

/* ---------------- GitHub ---------------- */
function ghBase(env) { return `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}`; }
async function gh(env, path, opts = {}) {
  if (!env.GITHUB_TOKEN) throw httpError(500, "GITHUB_TOKEN לא הוגדר");
  const res = await fetch(path.startsWith("http") ? path : ghBase(env) + path, {
    method: opts.method || "GET",
    headers: {
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "formal-admin-worker",
      ...(opts.body ? { "Content-Type": "application/json" } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
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
    const blob = await gh(env, "/git/blobs", { method: "POST", body: f.base64 != null ? { content: f.base64, encoding: "base64" } : { content: f.text, encoding: "utf-8" } });
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

function cleanStr(v, max = 2000) { return v == null ? "" : String(v).trim().slice(0, max); }

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
      phone: cleanStr(contact.phone, 40), whatsapp: cleanStr(contact.whatsapp, 40).replace(/[^\d]/g, ""),
      email: cleanStr(contact.email, 200), instagram: cleanStr(contact.instagram, 500), behance: cleanStr(contact.behance, 500)
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
  const maxMb = Number(env.MAX_UPLOAD_MB || 20);
  const rawName = decodeURIComponent(url.searchParams.get("name") || request.headers.get("X-Filename") || "file");
  const ext = (rawName.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw httpError(400, "סוג קובץ לא נתמך. מותר: " + ALLOWED_EXT.join(", "));
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > maxMb * 1024 * 1024) throw httpError(413, `הקובץ גדול מדי (מקסימום ${maxMb}MB). לסרטונים ארוכים השתמשי ביוטיוב או בדרייב`);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) throw httpError(400, "קובץ ריק");
  if (bytes.length > maxMb * 1024 * 1024) throw httpError(413, `הקובץ גדול מדי (מקסימום ${maxMb}MB)`);
  const base = slug(rawName.replace(/\.[^.]+$/, "")) || "file";
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").slice(2);
  const path = `${MEDIA_DIR}/${base}-${stamp}.${ext}`;
  const sha = await commitFiles(env, [{ path, base64: b64encode(bytes) }], `העלאת מדיה: ${base}.${ext}`, actor);
  return json({ ok: true, path, commit: sha, size: bytes.length }, 201);
}

async function deleteMedia(env, name, actor) {
  if (!/^[\w.-]+$/.test(name)) throw httpError(400, "שם קובץ לא תקין");
  const path = `${MEDIA_DIR}/${name}`;
  const exists = await gh(env, `/contents/${path}?ref=${env.GH_BRANCH}`, { allow404: true });
  if (!exists) throw httpError(404, "הקובץ לא נמצא");
  await commitFiles(env, [{ path, delete: true }], `מחיקת מדיה: ${name}`, actor);
  return json({ ok: true });
}

/* ---------------- pages status ---------------- */
async function pagesStatus(env) {
  try {
    const b = await gh(env, "/pages/builds/latest");
    return json({ status: b.status, updated: b.updated_at, url: `https://${String(env.GH_OWNER).toLowerCase()}.github.io/${env.GH_REPO}/` });
  } catch (e) {
    return json({ status: "unknown", error: e.message });
  }
}
