// Disposable HTTP fixture + real production-mode Customer Web bundle.
// Does not load backend configuration, contact providers, or write production data.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "../artifacts/r13-return-tracking");
await fs.mkdir(out, { recursive: true });
await build({ root, configFile: path.join(root, "vite.integration.config.mjs"), define: { __NOVASTORE_LOCAL_REVIEW_RUNTIME__: "false" }, build: { outDir: path.join(out, "browser-build"), emptyOutDir: true, rollupOptions: { input: path.join(root, "integrated.html") } } });
const html = await fs.readFile(path.join(out, "browser-build/integrated.html"));
const users = { A: { id: 1, fullName: "Test Customer A", email: "a@example.invalid", phone: "05555555555", role: "customer" }, B: { id: 2, fullName: "Test Customer B", email: "b@example.invalid", phone: "05555555556", role: "customer" } };
const state = { returns: [], nextId: 701, calls: [], revoked: new Set(), listError: 0, detailError: 0, failOrdersAfterCreate: false, orderError: false, delayDetail: false, held: [], postCount: 0 };
const order = { id: 31, user_id: 1, status: "Teslim Edildi", payment_status: "PAID", refund_status: "NONE", currency: "TRY", total_amount: 120, delivered_at: new Date().toISOString(), created_at: new Date().toISOString(), items: [{ id: 1, name: "Yerel test ürünü", quantity: 1, price: 120 }], address: "Sentetik adres" };
const bodyOf = async (req) => { let data = ""; for await (const chunk of req) data += chunk; return data ? JSON.parse(data) : {}; };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
  try {
    if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(html); }
    // Only unrelated cart/favorites owners are synthetic. Returns/auth use the real adapters and fetch.
    if (url.pathname === "/shared-state-sync.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end('globalThis.NovaStoreSharedState={isAuthenticated:()=>!!localStorage.nova_user_token,hydrateCart:async()=>[],saveCart:async()=>{},saveCheckout:async()=>{},writeCartLocal:x=>x,normalizeCartItems:x=>x,reportError:()=>{}};'); }
    if (url.pathname === "/favorites-sync.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end('globalThis.NovaStoreFavorites={loadFavoriteIds:async()=>[],setFavorite:async()=>{},reportError:()=>{}};'); }
    if (!url.pathname.startsWith("/api/")) { res.writeHead(204); return res.end(); }
    const token = String(req.headers.authorization || "").replace("Bearer ", "");
    const owner = !state.revoked.has(token) ? ({ "fixture-A": users.A, "fixture-B": users.B })[token] : null;
    state.calls.push({ method: req.method, path: url.pathname, owner: owner?.id || null });
    if (url.pathname === "/api/users/login") { const body = await bodyOf(req); const key = body.email === users.A.email ? "A" : "B"; state.revoked.delete(`fixture-${key}`); return json({ token: `fixture-${key}`, sessionId: `session-${key}`, user: users[key] }); }
    if (url.pathname === "/api/public/categories") return json([{ id: 1, name: "Elektronik", slug: "elektronik", path: "elektronik", parent_id: null, children: [] }]);
    if (url.pathname === "/api/products") return json([{ id: 1, name: "Yerel test ürünü", categoryIds: [1], primaryCategoryId: 1, price: 120, stock: 10, is_active: true }]);
    if (url.pathname === "/api/public/navigation/main") return json({ code: "main", items: [] });
    if (url.pathname === "/api/public/collections") return json([]);
    if (url.pathname === "/api/public/business-identity") return json({ status: "pending_owner_company_formation", identity: null });
    if (url.pathname === "/api/assistant/capability") return json({ contractVersion: "novabot-modes-v1", available: true, defaultModeId: "friendly", modes: [{ id: "friendly", label: "Samimi", description: "Yerel test" }] });
    if (!owner) return json({ error: "Authentication required." }, 401);
    if (url.pathname === "/api/users/me") return json({ user: owner });
    if (url.pathname === "/api/users/logout") { state.revoked.add(token); res.writeHead(204); return res.end(); }
    if (url.pathname.startsWith("/api/notifications")) return json(url.pathname.endsWith("unread-count") ? { unreadCount: 0 } : url.pathname === "/api/notifications" ? { items: [{ id: 1, message: "İade güncellendi", entity_type: "return_request", entity_id: 701 }], nextCursor: null } : {});
    if (url.pathname.startsWith("/api/orders/user/")) {
      if (Number(url.pathname.split("/").at(-1)) !== owner.id) return json({ error: "Access denied." }, 403);
      if (state.orderError) return json({ error: "Siparişler getirilemedi." }, 503);
      const latest = state.returns.at(-1);
      return json(owner.id === 1 ? [{ ...order, return_id: latest?.id, return_status: latest?.status, return_revision: latest?.revision, return_decision_note: latest?.decision_note }] : []);
    }
    if (url.pathname === "/api/returns" && req.method === "POST") {
      state.postCount++;
      const body = await bodyOf(req);
      if (owner.id !== order.user_id || body.order_id !== order.id) return json({ code: "RETURN_ORDER_NOT_FOUND", error: "Sipariş bulunamadı." }, 404);
      const existing = state.returns.find((r) => ["REQUESTED", "IN_REVIEW", "APPROVED"].includes(r.status));
      if (existing) return json({ reused: true, return: existing });
      const row = { id: state.nextId++, user_id: owner.id, order_id: order.id, reason_code: body.reason_code, note: body.note, status: "REQUESTED", refund_amount: 120, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), decision_note: null };
      state.returns.push(row); order.refund_status = "REQUESTED";
      if (state.failOrdersAfterCreate) state.orderError = true;
      return json({ reused: false, return: row }, 201);
    }
    if (url.pathname === "/api/returns/mine") return state.listError ? json({ error: "Liste alınamadı." }, state.listError) : json([...state.returns].reverse().filter((r) => r.user_id === owner.id));
    if (/^\/api\/returns\/\d+$/.test(url.pathname)) {
      const row = state.returns.find((r) => r.id === Number(url.pathname.split("/").at(-1)) && r.user_id === owner.id);
      if (!row) return json({ error: "İade talebi bulunamadı." }, 404);
      const reply = () => state.detailError ? json({ error: "Detay alınamadı." }, state.detailError) : json({ ...row, order_status: order.status, payment_status: order.payment_status, refund_status: order.refund_status });
      if (state.delayDetail) state.held.push(reply); else reply();
      return;
    }
    if (url.pathname === "/api/payments/capability") return json({ available: false });
    return json([]);
  } catch (error) { json({ error: "Fixture error" }, 500); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.NOVASTORE_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-first-run", "--disable-background-networking"] });
const page = await browser.newPage();
const failures = [], checks = [];
page.on("pageerror", (error) => failures.push(error.message));
await page.setRequestInterception(true);
page.on("request", (req) => req.url().startsWith(base) || req.url().startsWith("data:") ? req.continue() : req.abort());
const has = async (text) => page.waitForFunction((text) => document.querySelector("#main-content")?.innerText.includes(text), { timeout: 15000 }, text);
const clickText = async (selector, text) => { await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some((el) => el.textContent.trim() === text), {}, selector, text); await page.evaluate((selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text).click(), selector, text); };
const navigate = async (hash) => { await page.evaluate((hash) => { location.hash = hash; }, hash); };
const check = (name, value = true) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const login = async (key) => {
  await navigate("#/giris"); await page.waitForSelector('input[name="email"]');
  await page.type('input[name="email"]', users[key].email); await page.type('input[name="password"]', "FixtureOnly123!");
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForFunction(() => localStorage.nova_user_token);
  await page.waitForFunction(() => location.hash === "#/" || location.hash === "");
};
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/#/giris`); await login("A"); check("login lands home");
  await navigate("#/hesabim/siparisler/31"); await has("Sipariş #31");
  await clickText("button", "İade talebi oluştur"); await page.select('select[name="reasonCode"]', "DAMAGED"); await page.type('textarea[name="note"]', "Ürün hasarlı ulaştı. " + "Uzun-not-".repeat(45));
  state.failOrdersAfterCreate = true;
  await clickText('button[type="submit"]', "Talebi gönder"); await has("Talep #701 detayını aç"); await has("Siparişler getirilemedi.");
  check("create survives failed order refetch", state.postCount === 1);
  state.orderError = false; state.failOrdersAfterCreate = false;
  await clickText("button", "Yeniden dene"); await has("Sipariş #31");
  check("read retry does not repeat POST", state.postCount === 1);
  await navigate("#/hesabim"); await clickText(".connected-account-sidebar a", "İade Taleplerim"); await has("Talep #701");
  await clickText(".customer-return-list a", "Talep #701"); await has("Açıklaman");
  check("exact detail fetched", state.calls.some((c) => c.path === "/api/returns/701"));
  await page.reload(); await has("Açıklaman"); check("exact detail persists after browser reload");
  state.returns[0].status = "IN_REVIEW"; state.returns[0].revision++; order.refund_status = "IN_REVIEW";
  await clickText(".customer-returns button", "Yenile"); await has("İnceleniyor"); check("server transition refetched");
  state.returns[0].status = "APPROVED"; order.refund_status = "PENDING";
  await clickText(".customer-returns button", "Yenile"); await has("İade talebi onaylandı"); await has("Geri ödeme bekliyor"); check("approved and pending shown independently");
  for (const [status, text] of [["FAILED", "Geri ödeme işlemi başarısız"], ["COMPLETED", "Geri ödeme tamamlandı"]]) {
    order.refund_status = status; await clickText(".customer-returns button", "Yenile"); await has(text); await has("İade talebi onaylandı"); check(`independent refund ${status}`);
  }
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewport({ width, height: 1000 });
    for (const [route, label] of [["#/hesabim/iadeler", "history"], ["#/hesabim/iadeler/701", "detail"]]) {
      await navigate(route); await has(label === "history" ? "Talep #701" : "Açıklaman");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(`${label} horizontal overflow ${width}`, overflow <= 1);
      await page.screenshot({ path: path.join(out, `${label}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewport({ width: 1440, height: 1000 }); await navigate("#/hesabim/iadeler"); await has("Talep #701");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  await page.focus('.customer-return-list a');
  await page.waitForFunction(() => document.activeElement.matches('.customer-return-list a'));
  await page.keyboard.press("Enter"); await has("Açıklaman"); check("keyboard history to exact detail");
  await navigate("#/hesabim/bildirimler"); await page.waitForSelector(".connected-notifications button");
  await page.click(".connected-notifications button"); await has("Açıklaman");
  check("typed notification opens canonical detail", await page.evaluate(() => location.hash === "#/hesabim/iadeler/701"));
  await page.setViewport({ width: 360, height: 800 }); await navigate("#/hesabim");
  await page.waitForSelector(".return-history-entry"); await page.click(".return-history-entry"); await has("Talep #701");
  check("mobile overview permanently exposes return history");
  state.returns[0].status = "REJECTED"; order.refund_status = "REJECTED";
  await navigate("#/hesabim/iadeler"); await clickText(".customer-returns button", "Yenile"); await has("İade talebi reddedildi"); check("rejected historical request discoverable");
  await navigate("#/hesabim/siparisler/31"); await has("Sipariş #31"); await clickText("button", "İade talebi oluştur"); await clickText('button[type="submit"]', "Talebi gönder"); await has("Talep #702 detayını aç"); check("later eligible request not blocked", state.postCount === 2);
  await navigate("#/hesabim/iadeler"); await has("Talep #701"); await has("Talep #702");
  check("all history keeps authoritative order", (await page.$$eval('.customer-return-list h2', (els) => els.map((el) => el.textContent))).join() === "Talep #702,Talep #701");
  for (const status of [400, 404, 409, 503]) {
    state.detailError = status; await navigate("#/hesabim/iadeler/701"); await page.waitForSelector('.customer-returns [role="alert"]');
    check(`detail error ${status} not stale or empty`, !(await page.$('.customer-return-detail'))); await navigate("#/hesabim/iadeler"); await has("Talep #701");
  }
  state.detailError = 0; state.listError = 503; await page.reload(); await page.waitForSelector('.customer-returns [role="alert"]');
  check("list error is not empty history", !(await page.$('.customer-returns .connected-empty')));
  state.listError = 0; await clickText(".customer-returns button", "Yeniden dene"); await has("Talep #701");
  state.delayDetail = true; await navigate("#/hesabim/iadeler/701"); await page.waitForSelector('.customer-returns [role="status"]');
  await Promise.all([new Promise((resolve) => page.once("domcontentloaded", resolve)), clickText(".account-logout", "Güvenli çıkış")]); await login("B");
  state.delayDetail = false; state.held.splice(0).forEach((reply) => reply());
  await navigate("#/hesabim/iadeler"); await has("Henüz iade talebin yok");
  check("A rows and late detail absent after logout to B", !(await page.$('.customer-return-list')) && !(await page.$('.customer-return-detail')));
  await navigate("#/hesabim/iadeler/701"); await has("İade talebi bulunamadı veya bu hesapla erişilemiyor."); check("B cannot open A exact ID");
  state.listError = 401; await navigate("#/hesabim/iadeler"); await page.waitForSelector('.auth-card form');
  check("expired session returns to login without return data", !(await page.$(".customer-return-list")));
  check("browser uncaught errors zero", failures.length === 0);
  await fs.writeFile(path.join(out, "runtime-result.json"), JSON.stringify({ checks, failures, requests: state.calls, postCount: state.postCount, providerCalls: 0, dataSource: "disposable HTTP fixture; real Web bundle/adapters/transport" }, null, 2));
} catch (error) {
  await fs.writeFile(path.join(out, "runtime-failure.txt"), `${error.stack}\n${failures.join("\n")}\n${await page.content()}`);
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
