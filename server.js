"use strict";
// হাটবাজার সার্ভার: Node 22+ এর বিল্ট-ইন http ও sqlite, কোনো npm প্যাকেজ লাগে না।
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC = __dirname;
const STATIC_FILES = new Set(["/index.html", "/style.css", "/app.js"]);
const FREE_SHIP_FROM = 1500;
const SHIP_FEE = 60;
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "shop.db"));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT,
  pass TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL, price INTEGER NOT NULL,
  old_price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, image TEXT NOT NULL DEFAULT '',
  rating REAL NOT NULL DEFAULT 4.5, reviews INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
  district TEXT NOT NULL, payment TEXT NOT NULL, trx_id TEXT NOT NULL DEFAULT '', items TEXT NOT NULL,
  subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL, total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL);
`);

const now = () => Date.now();
const getSetting = (k) => db.prepare("SELECT v FROM settings WHERE k=?").get(k)?.v;
const setSetting = (k, v) => db.prepare("INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, v);

let SECRET = process.env.SESSION_SECRET || getSetting("secret");
if (!SECRET) { SECRET = crypto.randomBytes(32).toString("hex"); setSetting("secret", SECRET); }

// ---------- পাসওয়ার্ড ও সেশন ----------
function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString("hex") + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function checkPass(pw, stored) {
  const [s, h] = stored.split(":");
  const a = crypto.scryptSync(pw, Buffer.from(s, "hex"), 64), b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp > now() ? p : null; } catch { return null; }
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((c) => { const i = c.indexOf("="); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function currentUser(req) {
  const p = verify(cookies(req).session);
  if (!p) return null;
  return db.prepare("SELECT id,name,email,phone,role FROM users WHERE id=?").get(p.uid) || null;
}
function setSession(res, user) {
  const days = 14;
  const token = sign({ uid: user.id, exp: now() + days * 864e5 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${days * 86400}${secure}`);
}

// ---------- অ্যাডমিন ও নমুনা পণ্য ----------
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me-now";
const adminRow = db.prepare("SELECT id FROM users WHERE email=?").get(ADMIN_EMAIL);
if (!adminRow) db.prepare("INSERT INTO users(name,email,pass,role,created) VALUES(?,?,?,?,?)").run("অ্যাডমিন", ADMIN_EMAIL, hashPass(ADMIN_PASSWORD), "admin", now());
else if (process.env.ADMIN_PASSWORD) db.prepare("UPDATE users SET pass=?, role='admin' WHERE id=?").run(hashPass(ADMIN_PASSWORD), adminRow.id);
if (!process.env.ADMIN_PASSWORD) console.warn("সতর্কতা: ADMIN_PASSWORD সেট করা নেই। ডিফল্ট পাসওয়ার্ড দিয়ে সাইট পাবলিশ করবেন না।");

if (db.prepare("SELECT COUNT(*) c FROM products").get().c === 0) {
  const seed = [
    ["ওয়্যারলেস ইয়ারবাড (ব্লুটুথ ৫.৩)", "ইলেকট্রনিক্স", 1850, 2490, 40, 4.4, 1260],
    ["পাওয়ার ব্যাংক ১০০০০ mAh", "ইলেকট্রনিক্স", 1450, 1790, 60, 4.5, 980],
    ["স্মার্ট ওয়াচ (AMOLED ডিসপ্লে)", "ইলেকট্রনিক্স", 3200, 4500, 25, 4.2, 534],
    ["পোর্টেবল ব্লুটুথ স্পিকার", "ইলেকট্রনিক্স", 2100, 2600, 30, 4.3, 412],
    ["পুরুষের সুতি পাঞ্জাবি", "ফ্যাশন", 1650, 1950, 50, 4.6, 741],
    ["হাতে বোনা জামদানি শাড়ি", "ফ্যাশন", 4800, 6200, 12, 4.8, 205],
    ["হালকা ওজনের স্নিকার জুতা", "ফ্যাশন", 2300, 2900, 35, 4.1, 388],
    ["ইলেকট্রিক কেটলি ১.৭ লিটার", "ঘর ও রান্না", 1350, 1650, 45, 4.4, 622],
    ["কটন বেডশিট সেট (কিং সাইজ)", "ঘর ও রান্না", 1200, 1500, 40, 4.3, 509],
    ["রাইস কুকার ২.৮ লিটার", "ঘর ও রান্না", 3400, 3900, 20, 4.5, 317],
    ["বাংলা উপন্যাস সংকলন (৫টি বই)", "বই", 990, 1250, 70, 4.7, 271],
    ["শিশুদের ছবির গল্পের বই (সেট)", "বই", 640, 800, 80, 4.6, 350],
    ["নাজিরশাইল চাল ৫ কেজি", "মুদি", 450, 490, 200, 4.5, 1840],
    ["খাঁটি সরিষার তেল ২ লিটার", "মুদি", 520, 580, 150, 4.4, 1325],
    ["সিলেটি চা পাতা ৫০০ গ্রাম", "মুদি", 380, 420, 120, 4.6, 902],
    ["সুন্দরবনের খাঁটি মধু ৫০০ গ্রাম", "মুদি", 750, 900, 90, 4.5, 688],
    ["নিম ফেস ওয়াশ ১০০ মিলি", "সৌন্দর্য", 320, 380, 100, 4.2, 455],
    ["কোল্ড প্রেসড নারকেল তেল ৫০০ মিলি", "সৌন্দর্য", 280, 350, 110, 4.4, 610],
  ];
  const ins = db.prepare("INSERT INTO products(name,cat,price,old_price,stock,rating,reviews,created) VALUES(?,?,?,?,?,?,?,?)");
  seed.forEach((r) => ins.run(...r, now()));
}

const CATS = ["ইলেকট্রনিক্স", "ফ্যাশন", "ঘর ও রান্না", "বই", "মুদি", "সৌন্দর্য"];
const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const DISTRICTS = ["ঢাকা", "চট্টগ্রাম", "সিলেট", "রাজশাহী", "খুলনা", "বরিশাল", "রংপুর", "ময়মনসিংহ", "অন্যান্য"];

// ---------- হেল্পার ----------
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (msg) => new HttpError(400, msg);
function send(res, code, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(body);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 100_000) { reject(new HttpError(413, "অনুরোধ অনেক বড়")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(bad("JSON ঠিক নেই")); } });
    req.on("error", reject);
  });
}
const str = (v, max, name) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw bad(`${name} দিন`);
  if (s.length > max) throw bad(`${name} অনেক বড়`);
  return s;
};
const intIn = (v, min, max, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} ঠিক নয়`);
  return n;
};
const normPhone = (v) => {
  const bnd = "০১২৩৪৫৬৭৮৯";
  const s = String(v || "").replace(/[০-৯]/g, (d) => bnd.indexOf(d)).replace(/[\s-]/g, "");
  const m = s.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  if (!m) throw bad("সঠিক মোবাইল নম্বর দিন (যেমন 01712345678)");
  return m[1];
};
const normImage = (v) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  if (!/^https:\/\/[^\s"'<>]{1,500}$/.test(s)) throw bad("ছবির লিংক https:// দিয়ে শুরু হতে হবে");
  return s;
};
const publicProduct = (p) => ({ id: p.id, name: p.name, cat: p.cat, price: p.price, old: p.old_price, stock: p.stock, image: p.image, rate: p.rating, n: p.reviews });
const requireUser = (u) => { if (!u) throw new HttpError(401, "আগে লগইন করুন"); return u; };
const requireAdmin = (u) => { requireUser(u); if (u.role !== "admin") throw new HttpError(403, "অনুমতি নেই"); return u; };

const attempts = new Map();
function throttle(key, limit = 10, windowMs = 15 * 60e3) {
  const t = now(); const rec = (attempts.get(key) || []).filter((x) => t - x < windowMs);
  if (rec.length >= limit) throw new HttpError(429, "অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন");
  rec.push(t); attempts.set(key, rec);
}
const ipOf = (req) => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

function productInput(b) {
  const name = str(b.name, 160, "পণ্যের নাম");
  if (!CATS.includes(b.cat)) throw bad("বিভাগ ঠিক নয়");
  const price = intIn(b.price, 1, 10_000_000, "দাম");
  const old = b.old === "" || b.old == null ? price : intIn(b.old, price, 10_000_000, "আগের দাম");
  return { name, cat: b.cat, price, old, stock: intIn(b.stock, 0, 1_000_000, "স্টক"), image: normImage(b.image), active: b.active === false ? 0 : 1 };
}
const orderOut = (o) => ({ id: o.id, name: o.name, phone: o.phone, address: o.address, district: o.district, payment: o.payment, trx: o.trx_id, items: JSON.parse(o.items), subtotal: o.subtotal, shipping: o.shipping, total: o.total, status: o.status, created: o.created });


// ---------- টেলিগ্রাম নোটিফিকেশন (ঐচ্ছিক) ----------
// TELEGRAM_BOT_TOKEN ও TELEGRAM_CHAT_ID সেট থাকলে প্রতিটি নতুন অর্ডার টেলিগ্রামে চলে যায়।
function notifyOrder(o) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const api = process.env.TELEGRAM_API || "https://api.telegram.org";
  const text = [
    `নতুন অর্ডার #${o.id}`,
    `${o.name} · ${o.phone}`,
    `${o.district}, ${o.address}`,
    "",
    ...o.lines.map((l) => `${l.name} × ${l.qty} = ৳${l.price * l.qty}`),
    "",
    `ডেলিভারি: ${o.shipping ? "৳" + o.shipping : "ফ্রি"}`,
    `মোট: ৳${o.total}`,
    o.payment === "bkash" ? `বিকাশ, TrxID: ${o.trx}` : "ক্যাশ অন ডেলিভারি",
  ].join("\n").slice(0, 3500);
  fetch(`${api}/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }), signal: AbortSignal.timeout(8000) })
    .then((r) => { if (!r.ok) console.error("টেলিগ্রামে পাঠানো যায়নি, কোড:", r.status); })
    .catch((e) => console.error("টেলিগ্রামে পাঠানো যায়নি:", e.name));
}

// ---------- API ----------
async function api(req, res, url) {
  const m = req.method, p = url.pathname, user = currentUser(req);
  if (m !== "GET" && m !== "HEAD") {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, "অনুরোধ গ্রহণযোগ্য নয়");
  }

  if (p === "/api/config" && m === "GET") return send(res, 200, { cats: CATS, districts: DISTRICTS, freeShipFrom: FREE_SHIP_FROM, shipFee: SHIP_FEE, bkash: process.env.BKASH_NUMBER || "", statuses: STATUSES });

  if (p === "/api/products" && m === "GET") {
    const rows = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY reviews DESC").all();
    return send(res, 200, rows.map(publicProduct));
  }
  if (p === "/api/me" && m === "GET") return send(res, 200, { user });

  if (p === "/api/register" && m === "POST") {
    throttle("reg:" + ipOf(req), 10);
    const b = await readJson(req);
    const name = str(b.name, 80, "নাম"), email = str(b.email, 120, "ইমেইল").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("সঠিক ইমেইল দিন");
    const pw = str(b.password, 200, "পাসওয়ার্ড"); if (pw.length < 8) throw bad("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে");
    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) throw new HttpError(409, "এই ইমেইলে আগেই অ্যাকাউন্ট আছে");
    const phone = b.phone ? normPhone(b.phone) : null;
    const id = Number(db.prepare("INSERT INTO users(name,email,phone,pass,created) VALUES(?,?,?,?,?)").run(name, email, phone, hashPass(pw), now()).lastInsertRowid);
    setSession(res, { id });
    return send(res, 201, { user: { id, name, email, phone, role: "customer" } });
  }
  if (p === "/api/login" && m === "POST") {
    throttle("login:" + ipOf(req), 10);
    const b = await readJson(req);
    const row = db.prepare("SELECT * FROM users WHERE email=?").get(String(b.email || "").trim().toLowerCase());
    if (!row || !checkPass(String(b.password || ""), row.pass)) throw new HttpError(401, "ইমেইল বা পাসওয়ার্ড ঠিক নয়");
    setSession(res, row);
    return send(res, 200, { user: { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role } });
  }
  if (p === "/api/logout" && m === "POST") {
    return send(res, 200, { ok: true }, { "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (p === "/api/orders" && m === "POST") {
    requireUser(user);
    throttle("order:" + user.id, 20);
    const b = await readJson(req);
    const name = str(b.name, 80, "নাম"), address = str(b.address, 300, "ঠিকানা"), phone = normPhone(b.phone);
    if (!DISTRICTS.includes(b.district)) throw bad("জেলা বাছাই করুন");
    const payment = b.payment === "bkash" ? "bkash" : "cod";
    const trx = payment === "bkash" ? str(b.trx, 40, "বিকাশ ট্রানজেকশন আইডি") : "";
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) throw bad("কার্ট খালি");
    const merged = new Map();
    for (const it of b.items) { const id = intIn(it.id, 1, 1e9, "পণ্য"), q = intIn(it.qty, 1, 50, "পরিমাণ"); merged.set(id, (merged.get(id) || 0) + q); }
    const lines = []; let subtotal = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [id, qty] of merged) {
        const pr = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(id);
        if (!pr) throw bad("একটি পণ্য আর পাওয়া যাচ্ছে না");
        if (pr.stock < qty) throw bad(`"${pr.name}" এর স্টক আছে মাত্র ${pr.stock}টি`);
        db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(qty, id);
        lines.push({ id, name: pr.name, price: pr.price, qty }); subtotal += pr.price * qty;
      }
      const shipping = subtotal >= FREE_SHIP_FROM ? 0 : SHIP_FEE, total = subtotal + shipping;
      const id = Number(db.prepare("INSERT INTO orders(user_id,name,phone,address,district,payment,trx_id,items,subtotal,shipping,total,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(user.id, name, phone, address, b.district, payment, trx, JSON.stringify(lines), subtotal, shipping, total, now()).lastInsertRowid);
      db.exec("COMMIT");
      notifyOrder({ id, name, phone, district: b.district, address, lines, shipping, total, payment, trx });
      return send(res, 201, { id, total, shipping, payment });
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
  if (p === "/api/orders" && m === "GET") {
    requireUser(user);
    return send(res, 200, db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC").all(user.id).map(orderOut));
  }

  // অ্যাডমিন
  if (p.startsWith("/api/admin/")) {
    requireAdmin(user);
    if (p === "/api/admin/stats" && m === "GET") {
      const o = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN status!='cancelled' THEN total END),0) rev, SUM(status='pending') pend FROM orders").get();
      const low = db.prepare("SELECT COUNT(*) c FROM products WHERE stock<=5 AND active=1").get().c;
      return send(res, 200, { orders: o.n, revenue: o.rev, pending: o.pend || 0, lowStock: low, customers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'").get().c });
    }
    if (p === "/api/admin/orders" && m === "GET") return send(res, 200, db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 200").all().map(orderOut));
    let mm;
    if ((mm = p.match(/^\/api\/admin\/orders\/(\d+)$/)) && m === "PATCH") {
      const b = await readJson(req);
      if (!STATUSES.includes(b.status)) throw bad("স্ট্যাটাস ঠিক নয়");
      const row = db.prepare("SELECT * FROM orders WHERE id=?").get(+mm[1]);
      if (!row) throw new HttpError(404, "অর্ডার পাওয়া যায়নি");
      if (b.status === "cancelled" && row.status !== "cancelled") for (const l of JSON.parse(row.items)) db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(l.qty, l.id);
      if (row.status === "cancelled" && b.status !== "cancelled") throw bad("বাতিল অর্ডার আবার চালু করা যায় না");
      db.prepare("UPDATE orders SET status=? WHERE id=?").run(b.status, row.id);
      return send(res, 200, { ok: true });
    }
    if (p === "/api/admin/products" && m === "GET") return send(res, 200, db.prepare("SELECT * FROM products ORDER BY id DESC").all().map((r) => ({ ...publicProduct(r), active: !!r.active })));
    if (p === "/api/admin/products" && m === "POST") {
      const i = productInput(await readJson(req));
      const id = Number(db.prepare("INSERT INTO products(name,cat,price,old_price,stock,image,active,created) VALUES(?,?,?,?,?,?,?,?)").run(i.name, i.cat, i.price, i.old, i.stock, i.image, i.active, now()).lastInsertRowid);
      return send(res, 201, { id });
    }
    if ((mm = p.match(/^\/api\/admin\/products\/(\d+)$/))) {
      const id = +mm[1];
      if (!db.prepare("SELECT 1 FROM products WHERE id=?").get(id)) throw new HttpError(404, "পণ্য পাওয়া যায়নি");
      if (m === "PUT") {
        const i = productInput(await readJson(req));
        db.prepare("UPDATE products SET name=?,cat=?,price=?,old_price=?,stock=?,image=?,active=? WHERE id=?").run(i.name, i.cat, i.price, i.old, i.stock, i.image, i.active, id);
        return send(res, 200, { ok: true });
      }
      if (m === "DELETE") { db.prepare("UPDATE products SET active=0 WHERE id=?").run(id); return send(res, 200, { ok: true }); }
    }
  }
  throw new HttpError(404, "পাওয়া যায়নি");
}

// ---------- স্ট্যাটিক ফাইল ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!STATIC_FILES.has(rel) || !file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("পেজ পাওয়া যায়নি"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": rel.endsWith(".html") ? "no-cache" : "public, max-age=300" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; frame-ancestors 'none'");
  try {
    const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
    else throw new HttpError(405, "অনুমোদিত নয়");
  } catch (e) {
    if (e instanceof HttpError) send(res, e.code, { error: e.message });
    else { console.error(e); send(res, 500, { error: "সার্ভারে সমস্যা হয়েছে" }); }
  }
});

if (require.main === module) server.listen(PORT, () => console.log(`হাটবাজার চলছে: http://localhost:${PORT}`));
module.exports = { server, db };
