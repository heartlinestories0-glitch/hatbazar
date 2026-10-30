"use strict";
var ICONS = {
  "ইলেকট্রনিক্স": '<rect x="38" y="18" width="44" height="84" rx="8"/><circle cx="60" cy="88" r="4"/><line x1="52" y1="30" x2="68" y2="30"/>',
  "ফ্যাশন": '<path d="M40 26 22 42 32 56 42 50V98H78V50L88 56 98 42 80 26C76 36 44 36 40 26Z"/>',
  "ঘর ও রান্না": '<path d="M22 60 60 28 98 60"/><path d="M34 54V98H86V54"/><rect x="52" y="70" width="16" height="28"/>',
  "বই": '<path d="M60 36C48 28 32 28 20 32V90C32 86 48 86 60 94 72 86 88 86 100 90V32C88 28 72 28 60 36Z"/><line x1="60" y1="36" x2="60" y2="94"/>',
  "মুদি": '<path d="M30 42H90L96 98H24Z"/><path d="M46 52V40a14 14 0 0 1 28 0V52"/>',
  "সৌন্দর্য": '<rect x="44" y="46" width="32" height="54" rx="6"/><rect x="52" y="28" width="16" height="18" rx="3"/><line x1="52" y1="68" x2="68" y2="68"/>'
};
var STATUS_BN = { pending: "অপেক্ষমাণ", confirmed: "নিশ্চিত", shipped: "পাঠানো হয়েছে", delivered: "পৌঁছেছে", cancelled: "বাতিল" };
var ALL = "সব বিভাগ";
var bn = new Intl.NumberFormat("bn-BD");
var S = { cfg: { cats: [], districts: [], statuses: [], freeShipFrom: 1500, shipFee: 60, bkash: "" }, products: [], user: null,
  cat: ALL, q: "", sort: "rec", cart: {}, drawer: false, adminTab: "overview", edit: null };
try { var saved = JSON.parse(localStorage.getItem("hatbazar-cart") || "{}"); if (saved && typeof saved === "object") S.cart = saved; } catch (e) {}

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function money(v) { return "৳" + bn.format(v); }
function stars(r) { var f = Math.round(r); return "★★★★★".slice(0, f) + "☆☆☆☆☆".slice(0, 5 - f); }
function when(t) { return new Date(t).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" }); }
function persist() { try { localStorage.setItem("hatbazar-cart", JSON.stringify(S.cart)); } catch (e) {} }
function byId(id) { return S.products.filter(function (p) { return p.id === +id; })[0]; }
function hueOf(cat) { var i = S.cfg.cats.indexOf(cat); return "hue" + (i < 0 ? 0 : i); }

function api(method, url, body) {
  return fetch(url, { method: method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "সমস্যা হয়েছে"); return d; }); });
}
var toastTimer;
function toast(msg) {
  $("toastBox").innerHTML = '<div class="toast">' + esc(msg) + "</div>";
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { $("toastBox").innerHTML = ""; }, 2000);
}
function tile(p, extra) {
  return '<div class="tile ' + hueOf(p.cat) + '"><svg viewBox="0 0 120 120" aria-hidden="true">' + (ICONS[p.cat] || "") + "</svg>" +
    (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" referrerpolicy="no-referrer">' : "") + (extra || "") + "</div>";
}
function disc(p) { return Math.round((1 - p.price / p.old) * 100); }

// ---------- হেডার ----------
function renderHeader() {
  $("catSel").innerHTML = [ALL].concat(S.cfg.cats).map(function (c) { return "<option" + (c === S.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");
  var u = S.user;
  $("acct").innerHTML = u
    ? (u.role === "admin" ? '<a href="#/admin">অ্যাডমিন</a>' : "") + '<a href="#/orders">আমার অর্ডার</a><button type="button" data-act="logout">' + esc(u.name.split(" ")[0]) + " · বের হোন</button>"
    : '<a href="#/login">লগইন</a><a href="#/register">নতুন অ্যাকাউন্ট</a>';
  var cnt = 0; Object.keys(S.cart).forEach(function (id) { if (byId(id)) cnt += S.cart[id]; });
  $("count").textContent = bn.format(cnt);
}

// ---------- দোকান ----------
function filtered() {
  var q = S.q.trim().toLowerCase();
  var list = S.products.filter(function (p) { return (S.cat === ALL || p.cat === S.cat) && (!q || p.name.toLowerCase().indexOf(q) > -1 || p.cat.indexOf(q) > -1); });
  var s = S.sort;
  list.sort(function (a, b) { return s === "low" ? a.price - b.price : s === "high" ? b.price - a.price : s === "rate" ? b.rate - a.rate : s === "disc" ? disc(b) - disc(a) : b.n - a.n; });
  return list;
}
function viewShop() {
  var list = filtered();
  var title = (S.q.trim() ? "“" + S.q.trim() + "” এর ফলাফল" : S.cat === ALL ? "সব পণ্য" : S.cat) + " (" + bn.format(list.length) + "টি)";
  $("view").innerHTML =
    '<div class="chips" role="group" aria-label="বিভাগ">' + [ALL].concat(S.cfg.cats).map(function (c) { return '<button class="chip" type="button" data-cat="' + esc(c) + '" aria-pressed="' + (S.cat === c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
    '<div class="strip"><span><strong>ফ্রি ডেলিভারি</strong> ' + money(S.cfg.freeShipFrom) + ' এর বেশি অর্ডারে</span><span><strong>ক্যাশ অন ডেলিভারি</strong> সারা বাংলাদেশে</span><span><strong>বিকাশে পেমেন্ট</strong> সুবিধা আছে</span></div>' +
    '<div class="bar"><h1>' + esc(title) + '</h1><label for="sort">সাজান <select id="sort">' +
    [["rec", "জনপ্রিয়তা"], ["low", "দাম: কম থেকে বেশি"], ["high", "দাম: বেশি থেকে কম"], ["rate", "রেটিং"], ["disc", "বেশি ছাড়"]].map(function (o) { return '<option value="' + o[0] + '"' + (S.sort === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label></div>" +
    '<div class="grid">' + (list.length ? list.map(function (p) {
      var out = p.stock <= 0;
      return '<article class="card">' + tile(p, disc(p) > 0 ? '<span class="badge">-' + bn.format(disc(p)) + "%</span>" : "") +
        '<div class="info"><div class="name">' + esc(p.name) + "</div>" +
        '<div class="meta"><span class="stars" aria-hidden="true">' + stars(p.rate) + "</span> " + bn.format(p.rate) + " (" + bn.format(p.n) + ")</div>" +
        '<div class="price"><b>' + money(p.price) + "</b>" + (p.old > p.price ? "<s>" + money(p.old) + "</s>" : "") + "</div>" +
        (!out && p.stock <= 5 ? '<div class="low">মাত্র ' + bn.format(p.stock) + "টি বাকি</div>" : "") +
        '<button class="add" type="button" data-add="' + p.id + '"' + (out ? " disabled" : "") + ">" + (out ? "স্টক শেষ" : "কার্টে যোগ করুন") + "</button></div></article>";
    }).join("") : '<div class="empty">কোনো পণ্য পাওয়া যায়নি। অন্য শব্দ বা বিভাগ চেষ্টা করুন।</div>') + "</div>" +
    "<footer>© হাটবাজার · ক্যাশ অন ডেলিভারি ও বিকাশে পেমেন্ট · অর্ডার নিয়ে সমস্যা হলে 'আমার অর্ডার' পেজ দেখুন।</footer>";
}

// ---------- কার্ট ----------
function totals() {
  var sub = 0;
  Object.keys(S.cart).forEach(function (id) { var p = byId(id); if (p) sub += p.price * S.cart[id]; });
  var ship = sub === 0 ? 0 : sub >= S.cfg.freeShipFrom ? 0 : S.cfg.shipFee;
  return { sub: sub, ship: ship, total: sub + ship };
}
function cartIds() { return Object.keys(S.cart).filter(function (id) { return byId(id); }); }
function renderDrawer() {
  renderHeader();
  var layer = $("layer");
  if (!S.drawer) { layer.innerHTML = ""; return; }
  var t = totals(), ids = cartIds();
  var lines = ids.length ? ids.map(function (id) {
    var p = byId(id), q = S.cart[id];
    return '<div class="line">' + tile(p) + '<div><div class="n">' + esc(p.name) + '</div><div class="qty"><button type="button" data-dec="' + id + '" aria-label="কমান">−</button><span>' + bn.format(q) + '</span><button type="button" data-inc="' + id + '" aria-label="বাড়ান">+</button><button type="button" class="rm" data-rm="' + id + '">সরান</button><span class="lp">' + money(p.price * q) + "</span></div></div></div>";
  }).join("") : '<p class="meta" style="padding:24px 0;text-align:center">আপনার কার্ট খালি। পছন্দের পণ্য যোগ করুন।</p>';
  var left = S.cfg.freeShipFrom - t.sub;
  layer.innerHTML = '<div class="veil" data-close="1"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="কার্ট"><div class="dh"><h2>আপনার কার্ট</h2><button class="x" type="button" data-close="1" aria-label="বন্ধ করুন">×</button></div><div class="lines">' + lines + "</div>" +
    (ids.length ? '<div class="sum"><div class="sumrow"><span>সাবটোটাল</span><span>' + money(t.sub) + '</span></div><div class="sumrow"><span>ডেলিভারি</span><span>' + (t.ship ? money(t.ship) : "ফ্রি") + "</span></div>" +
      (left > 0 ? '<div class="meta">আর ' + money(left) + " কিনলে ডেলিভারি ফ্রি</div>" : "") +
      '<div class="sumrow tot"><span>মোট</span><span>' + money(t.total) + '</span></div><button class="btn" type="button" data-checkout="1">চেকআউটে যান</button></div>' : "") + "</aside>";
}
function setQty(id, q) {
  var p = byId(id);
  if (q <= 0) delete S.cart[id]; else if (p && q > p.stock) { toast("স্টকে আছে মাত্র " + bn.format(p.stock) + "টি"); return; } else S.cart[id] = q;
  persist(); renderDrawer();
}

// ---------- অ্যাকাউন্ট ----------
function viewAuth(mode) {
  var reg = mode === "register";
  $("view").innerHTML = '<div class="page"><h1>' + (reg ? "নতুন অ্যাকাউন্ট খুলুন" : "লগইন করুন") + '</h1><form class="panel form" id="authForm" novalidate>' +
    (reg ? '<label for="a-name">আপনার নাম<input id="a-name" name="name" type="text" autocomplete="name" required></label>' : "") +
    '<label for="a-email">ইমেইল<input id="a-email" name="email" type="email" autocomplete="email" required></label>' +
    (reg ? '<label for="a-phone">মোবাইল নম্বর (ঐচ্ছিক)<input id="a-phone" name="phone" type="tel" autocomplete="tel" placeholder="01712345678"></label>' : "") +
    '<label for="a-pass">পাসওয়ার্ড' + (reg ? " (কমপক্ষে ৮ অক্ষর)" : "") + '<input id="a-pass" name="password" type="password" autocomplete="' + (reg ? "new-password" : "current-password") + '" required></label>' +
    '<div class="err" id="err" role="alert"></div><button class="btn" type="submit">' + (reg ? "অ্যাকাউন্ট খুলুন" : "লগইন") + "</button>" +
    '<div class="meta">' + (reg ? 'আগে থেকে অ্যাকাউন্ট আছে? <a href="#/login">লগইন করুন</a>' : 'নতুন? <a href="#/register">অ্যাকাউন্ট খুলুন</a>') + "</div></form></div>";
  $("authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, body = { email: f.email.value, password: f.password.value };
    if (reg) { body.name = f.name.value; body.phone = f.phone.value; }
    api("POST", reg ? "/api/register" : "/api/login", body).then(function (d) {
      S.user = d.user; renderHeader(); location.hash = S.next || "#/"; S.next = null; toast("স্বাগতম, " + d.user.name);
    }).catch(function (er) { $("err").textContent = er.message; });
  });
}

// ---------- চেকআউট ----------
function viewCheckout() {
  var ids = cartIds();
  if (!ids.length) { $("view").innerHTML = '<div class="page"><div class="panel">আপনার কার্ট খালি। <a href="#/">কেনাকাটা শুরু করুন</a></div></div>'; return; }
  if (!S.user) { S.next = "#/checkout"; location.hash = "#/login"; toast("অর্ডার করতে আগে লগইন করুন"); return; }
  var t = totals(), u = S.user;
  $("view").innerHTML = '<div class="page"><h1>চেকআউট</h1><div class="panel"><h2>আপনার অর্ডার</h2>' +
    ids.map(function (id) { var p = byId(id); return '<div class="sumrow"><span>' + esc(p.name) + " × " + bn.format(S.cart[id]) + "</span><span>" + money(p.price * S.cart[id]) + "</span></div>"; }).join("") +
    '<div class="sumrow"><span>ডেলিভারি</span><span>' + (t.ship ? money(t.ship) : "ফ্রি") + '</span></div><div class="sumrow tot"><span>মোট</span><span>' + money(t.total) + "</span></div></div>" +
    '<form class="panel form" id="coForm" novalidate><h2>ডেলিভারির তথ্য</h2>' +
    '<div class="row2"><label for="c-name">নাম<input id="c-name" name="name" type="text" value="' + esc(u.name) + '" autocomplete="name" required></label>' +
    '<label for="c-phone">মোবাইল নম্বর<input id="c-phone" name="phone" type="tel" value="' + esc(u.phone || "") + '" placeholder="01712345678" autocomplete="tel" required></label></div>' +
    '<label for="c-dist">জেলা<select id="c-dist" name="district">' + S.cfg.districts.map(function (d) { return "<option>" + esc(d) + "</option>"; }).join("") + "</select></label>" +
    '<label for="c-addr">পুরো ঠিকানা<textarea id="c-addr" name="address" rows="3" autocomplete="street-address" required></textarea></label>' +
    '<div class="pay" role="radiogroup" aria-label="পেমেন্ট"><label><input type="radio" name="payment" value="cod" checked><span><b>ক্যাশ অন ডেলিভারি</b><br><span class="meta">পণ্য হাতে পেয়ে টাকা দিন</span></span></label>' +
    (S.cfg.bkash ? '<label><input type="radio" name="payment" value="bkash"><span><b>বিকাশ</b><br><span class="meta">' + esc(S.cfg.bkash) + " নম্বরে Send Money করে ট্রানজেকশন আইডি দিন</span></span></label>" : "") + "</div>" +
    '<label for="c-trx" id="trxWrap" hidden>বিকাশ ট্রানজেকশন আইডি<input id="c-trx" name="trx" type="text" autocomplete="off"></label>' +
    '<div class="err" id="err" role="alert"></div><button class="btn" type="submit" id="placeBtn">অর্ডার নিশ্চিত করুন · ' + money(t.total) + "</button></form></div>";
  var form = $("coForm");
  form.addEventListener("change", function () { $("trxWrap").hidden = form.payment.value !== "bkash"; });
  form.addEventListener("submit", function (e) {
    e.preventDefault(); $("placeBtn").disabled = true;
    api("POST", "/api/orders", { name: form.name.value, phone: form.phone.value, district: form.district.value, address: form.address.value, payment: form.payment.value, trx: form.trx.value,
      items: cartIds().map(function (id) { return { id: +id, qty: S.cart[id] }; }) })
      .then(function (d) { S.cart = {}; persist(); renderHeader(); loadProducts(); viewDone(d); })
      .catch(function (er) { $("err").textContent = er.message; $("placeBtn").disabled = false; });
  });
}
function viewDone(d) {
  $("view").innerHTML = '<div class="page"><div class="panel"><h1>অর্ডার হয়েছে</h1><p>আপনার অর্ডার নম্বর <b>#' + bn.format(d.id) + "</b>। মোট " + money(d.total) + (d.payment === "bkash" ? "। আমরা বিকাশ পেমেন্ট যাচাই করে অর্ডার নিশ্চিত করব।" : "। পণ্য হাতে পেয়ে টাকা দিন।") +
    '</p><div class="actions"><a class="btn" href="#/orders">আমার অর্ডার দেখুন</a> <a class="btn alt" href="#/">আরও কিনুন</a></div></div></div>';
}

function orderCard(o, admin) {
  return '<div class="order"><header><b>অর্ডার #' + bn.format(o.id) + '</b><span class="meta">' + esc(when(o.created)) + "</span>" +
    (admin ? '<select data-status="' + o.id + '" aria-label="স্ট্যাটাস">' + S.cfg.statuses.map(function (s) { return '<option value="' + s + '"' + (o.status === s ? " selected" : "") + ">" + STATUS_BN[s] + "</option>"; }).join("") + "</select>" : '<span class="pill ' + o.status + '">' + STATUS_BN[o.status] + "</span>") + "</header>" +
    o.items.map(function (l) { return '<div class="sumrow"><span>' + esc(l.name) + " × " + bn.format(l.qty) + "</span><span>" + money(l.price * l.qty) + "</span></div>"; }).join("") +
    '<div class="sumrow tot"><span>মোট (' + (o.payment === "bkash" ? "বিকাশ" : "ক্যাশ অন ডেলিভারি") + ")</span><span>" + money(o.total) + "</span></div>" +
    (admin ? '<div class="meta">' + esc(o.name) + " · " + esc(o.phone) + " · " + esc(o.district) + " · " + esc(o.address) + (o.trx ? " · TrxID: " + esc(o.trx) : "") + "</div>" : "") + "</div>";
}
function viewOrders() {
  if (!S.user) { S.next = "#/orders"; location.hash = "#/login"; return; }
  $("view").innerHTML = '<div class="page"><h1>আমার অর্ডার</h1><div id="ol" class="meta" style="margin-top:14px">লোড হচ্ছে...</div></div>';
  api("GET", "/api/orders").then(function (list) {
    $("ol").outerHTML = list.length ? "<div>" + list.map(function (o) { return orderCard(o, false); }).join("") + "</div>" : '<div class="panel">এখনো কোনো অর্ডার নেই। <a href="#/">কেনাকাটা শুরু করুন</a></div>';
  }).catch(function (e) { $("ol").textContent = e.message; });
}

// ---------- অ্যাডমিন ----------
function viewAdmin() {
  if (!S.user || S.user.role !== "admin") { $("view").innerHTML = '<div class="page"><div class="panel">এই পেজ শুধু অ্যাডমিনের জন্য। <a href="#/login">লগইন করুন</a></div></div>'; return; }
  var tabs = [["overview", "সারসংক্ষেপ"], ["orders", "অর্ডার"], ["products", "পণ্য"]];
  $("view").innerHTML = '<div class="page wide"><h1>অ্যাডমিন প্যানেল</h1><div class="tabs">' + tabs.map(function (t) { return '<button class="btn' + (S.adminTab === t[0] ? "" : " alt") + '" type="button" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + '</div><div id="adm">লোড হচ্ছে...</div></div>';
  var box = $("adm");
  if (S.adminTab === "overview") api("GET", "/api/admin/stats").then(function (s) {
    box.innerHTML = '<div class="stats">' + [["মোট অর্ডার", bn.format(s.orders)], ["অপেক্ষমাণ", bn.format(s.pending)], ["বিক্রি (বাতিল বাদে)", money(s.revenue)], ["কম স্টকের পণ্য", bn.format(s.lowStock)], ["গ্রাহক", bn.format(s.customers)]].map(function (x) { return '<div class="stat"><b>' + x[1] + "</b><span>" + x[0] + "</span></div>"; }).join("") + "</div>";
  }).catch(adminErr);
  if (S.adminTab === "orders") api("GET", "/api/admin/orders").then(function (l) { box.innerHTML = l.length ? l.map(function (o) { return orderCard(o, true); }).join("") : '<div class="panel">এখনো কোনো অর্ডার আসেনি।</div>'; }).catch(adminErr);
  if (S.adminTab === "products") api("GET", "/api/admin/products").then(function (l) {
    var e = S.edit, f = e || { name: "", cat: S.cfg.cats[0], price: "", old: "", stock: "", image: "", active: true };
    box.innerHTML = '<form class="panel form" id="pForm" novalidate><h2>' + (e ? "পণ্য সম্পাদনা" : "নতুন পণ্য যোগ করুন") + "</h2>" +
      '<label for="p-name">নাম<input id="p-name" name="name" type="text" value="' + esc(f.name) + '" required></label>' +
      '<div class="row2"><label for="p-cat">বিভাগ<select id="p-cat" name="cat">' + S.cfg.cats.map(function (c) { return "<option" + (c === f.cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") + "</select></label>" +
      '<label for="p-stock">স্টক<input id="p-stock" name="stock" type="number" min="0" value="' + esc(f.stock) + '" required></label></div>' +
      '<div class="row2"><label for="p-price">বর্তমান দাম (৳)<input id="p-price" name="price" type="number" min="1" value="' + esc(f.price) + '" required></label>' +
      '<label for="p-old">আগের দাম (৳, ঐচ্ছিক)<input id="p-old" name="old" type="number" min="1" value="' + esc(f.old === f.price ? "" : f.old) + '"></label></div>' +
      '<label for="p-img">ছবির লিংক (https://..., ঐচ্ছিক)<input id="p-img" name="image" type="url" value="' + esc(f.image) + '"></label>' +
      '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" style="width:auto"' + (f.active ? " checked" : "") + "> দোকানে দেখান</label>" +
      '<div class="err" id="err" role="alert"></div><div class="actions"><button class="btn" type="submit">' + (e ? "সংরক্ষণ করুন" : "যোগ করুন") + "</button>" + (e ? '<button class="btn alt" type="button" data-tab="products" data-cancel="1">বাতিল</button>' : "") + "</div></form>" +
      '<div class="panel scroll"><table><thead><tr><th>নাম</th><th>বিভাগ</th><th>দাম</th><th>স্টক</th><th>অবস্থা</th><th></th></tr></thead><tbody>' +
      l.map(function (p) { return "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.cat) + "</td><td>" + money(p.price) + "</td><td>" + bn.format(p.stock) + "</td><td>" + (p.active ? "চালু" : "লুকানো") + '</td><td><div class="actions"><button class="btn alt" type="button" data-edit="' + p.id + '">সম্পাদনা</button>' + (p.active ? '<button class="btn danger" type="button" data-hide="' + p.id + '">লুকান</button>' : "") + "</div></td></tr>"; }).join("") + "</tbody></table></div>";
    S.adminList = l;
    $("pForm").addEventListener("submit", function (ev) {
      ev.preventDefault(); var x = ev.target;
      var body = { name: x.name.value, cat: x.cat.value, price: x.price.value, old: x.old.value, stock: x.stock.value, image: x.image.value, active: x.active.checked };
      api(e ? "PUT" : "POST", "/api/admin/products" + (e ? "/" + e.id : ""), body).then(function () { S.edit = null; toast("সংরক্ষণ হয়েছে"); loadProducts(); viewAdmin(); }).catch(function (er) { $("err").textContent = er.message; });
    });
  }).catch(adminErr);
}
function adminErr(e) { $("adm").innerHTML = '<div class="panel err">' + esc(e.message) + "</div>"; }

// ---------- রাউটার ও ইভেন্ট ----------
function route() {
  var h = location.hash.replace(/^#/, "") || "/";
  window.scrollTo(0, 0);
  if (h === "/login") viewAuth("login");
  else if (h === "/register") viewAuth("register");
  else if (h === "/checkout") viewCheckout();
  else if (h === "/orders") viewOrders();
  else if (h === "/admin") viewAdmin();
  else viewShop();
}
function loadProducts() { return api("GET", "/api/products").then(function (l) { S.products = l; renderDrawer(); if ((location.hash || "#/") === "#/" || location.hash === "") viewShop(); }); }

document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-add],[data-cat],[data-inc],[data-dec],[data-rm],[data-close],[data-checkout],[data-act],[data-tab],[data-edit],[data-hide]");
  if (!el) return;
  var d = el.dataset;
  if (d.add) { var p = byId(d.add), cur = S.cart[d.add] || 0; if (cur + 1 > p.stock) return toast("স্টকে আছে মাত্র " + bn.format(p.stock) + "টি"); S.cart[d.add] = cur + 1; persist(); renderDrawer(); toast("কার্টে যোগ হয়েছে"); }
  else if (d.cat) { S.cat = d.cat; location.hash === "#/" || !location.hash ? (renderHeader(), viewShop()) : (location.hash = "#/"); }
  else if (d.inc) setQty(d.inc, S.cart[d.inc] + 1);
  else if (d.dec) setQty(d.dec, S.cart[d.dec] - 1);
  else if (d.rm) setQty(d.rm, 0);
  else if (d.checkout) { var was = location.hash; S.drawer = false; renderDrawer(); location.hash = "#/checkout"; if (was === "#/checkout") route(); }
  else if (d.close) { S.drawer = false; renderDrawer(); }
  else if (d.act === "logout") api("POST", "/api/logout").then(function () { S.user = null; renderHeader(); location.hash = "#/"; route(); toast("লগআউট হয়েছে"); });
  else if (d.tab) { S.adminTab = d.tab; if (d.cancel || d.tab !== "products") S.edit = null; viewAdmin(); }
  else if (d.edit) { S.edit = S.adminList.filter(function (x) { return x.id === +d.edit; })[0]; viewAdmin(); window.scrollTo(0, 0); }
  else if (d.hide) api("DELETE", "/api/admin/products/" + d.hide).then(function () { toast("পণ্য লুকানো হয়েছে"); loadProducts(); viewAdmin(); }).catch(function (er) { toast(er.message); });
});
document.addEventListener("change", function (e) {
  var t = e.target;
  if (t.id === "sort") { S.sort = t.value; viewShop(); }
  if (t.dataset && t.dataset.status) api("PATCH", "/api/admin/orders/" + t.dataset.status, { status: t.value }).then(function () { toast("স্ট্যাটাস বদলেছে"); loadProducts(); }).catch(function (er) { toast(er.message); viewAdmin(); });
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.drawer) { S.drawer = false; renderDrawer(); } });
$("openCart").addEventListener("click", function () { S.drawer = true; renderDrawer(); });
$("catSel").addEventListener("change", function (e) { S.cat = e.target.value; if (location.hash && location.hash !== "#/") location.hash = "#/"; else viewShop(); });
$("q").addEventListener("input", function (e) { S.q = e.target.value; if (location.hash && location.hash !== "#/") location.hash = "#/"; else viewShop(); });
$("searchForm").addEventListener("submit", function (e) { e.preventDefault(); S.q = $("q").value; if (location.hash && location.hash !== "#/") location.hash = "#/"; else viewShop(); });
window.addEventListener("hashchange", route);

Promise.all([api("GET", "/api/config"), api("GET", "/api/products"), api("GET", "/api/me")]).then(function (r) {
  S.cfg = r[0]; S.products = r[1]; S.user = r[2].user;
  renderHeader(); route();
}).catch(function () { $("view").innerHTML = '<div class="page"><div class="panel err">সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।</div></div>'; });
