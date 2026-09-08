// Disposable R19-contract HTTP fixture and the real production-mode Customer Web bundle.
// Consumer proof only: this does not run PC1, providers, production configuration, or production writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "../artifacts/r20-variant-consumer");
const hash = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const sources = [...(await fs.readdir(path.join(root, "src"), { recursive: true })).filter((file) => /\.(?:js|jsx|css)$/.test(file)).map((file) => `src/${file.replaceAll("\\", "/")}`), "vite.integration.config.mjs", "integrated.html", "scripts/verify-variant-consumer.mjs", "../frontend/shared-state-sync.js", "../frontend/favorites-sync.js"];
const captureSources = async () => Object.fromEntries(await Promise.all(sources.map(async (file) => [file, hash(await fs.readFile(path.join(root, file)))])));
const sourceSha256 = await captureSources();
await fs.mkdir(out, { recursive: true });
await fs.rm(path.join(out, "runtime-result.json"), { force: true });
await build({ root, configFile: path.join(root, "vite.integration.config.mjs"), define: { __NOVASTORE_LOCAL_REVIEW_RUNTIME__: "false" }, build: { outDir: path.join(out, "browser-build"), emptyOutDir: true, rollupOptions: { input: path.join(root, "integrated.html") } } });
const html = await fs.readFile(path.join(out, "browser-build/integrated.html"));
const bridges = new Map(await Promise.all(["shared-state-sync.js", "favorites-sync.js"].map(async (name) => [`/${name}`, await fs.readFile(path.join(root, "../frontend", name))])));
const user = { id: 1, fullName: "Variant Fixture Customer", email: "variant@example.invalid", phone: "05555555555", role: "customer" };
const address = { id: 7, user_id: 1, title: "Sentetik adres", fullName: user.fullName, phone: user.phone, addressLine: "Fixture sokak 7", district: "Kadıköy", city: "İstanbul", isDefault: true };
const initialVariants = [
  { id: 123, sku: "FIX-RED-M", selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }], price: 100, availableStock: 4, purchasable: true, commerce_revision: 2 },
  { id: 124, sku: "FIX-RED-L", selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "L" }], price: 150.75, availableStock: 3, purchasable: true, commerce_revision: 3 },
  { id: 125, sku: "FIX-BLUE-L", selections: [{ group: "Renk", value: "Mavi" }, { group: "Beden", value: "L" }], price: 180, availableStock: 0, purchasable: false, commerce_revision: 4 },
];
const state = { variants: structuredClone(initialVariants), cart: { version: 1, items: [] }, checkout: {}, favorites: [], calls: [], initializeError: null, accepted: [], rejected: [], unknown: [], returns: [], held: [] };
const product = (id) => ({ id, slug: id === 42 ? "fixture-varyant" : "fixture-basit", name: id === 42 ? "Fixture Kanonik Tişört" : "Fixture Basit Ürün", brand: "Fixture", price: id === 42 ? 100 : 80, stock: id === 42 ? 7 : 20, categoryIds: [1], primaryCategoryId: 1, is_active: true, description: "Yalnız yerel HTTP sözleşme testi.", image_url: "/fixture-product.svg", variant_selection_required: id === 42, variants: id === 42 ? state.variants.filter((row) => !row.hidden).map(({ hidden, ...row }) => row) : [], attributes: id === 42 ? [{ code: "renk", name: "Renk", value: "Kırmızı, Mavi" }, { code: "kapasite", name: "Kapasite", value: "M, L, XL" }] : [] });
const order = { id: 31, user_id: 1, status: "Teslim Edildi", payment_status: "PAID", refund_status: "NONE", currency: "TRY", total_amount: 250.75, delivered_at: new Date().toISOString(), created_at: new Date().toISOString(), address: "Sentetik adres", items: initialVariants.slice(0, 2).map((row) => ({ id: 42, variant_id: row.id, name: "Sipariş anındaki tişört", sku: row.sku, variant_selections: structuredClone(row.selections), price: row.price, quantity: 1 })) };
const definitions = [
  { slug: "pre-information", path: "/on-bilgilendirme-formu", title: "Ön Bilgilendirme Formu", status: "published", version: "fixture-v1" },
  { slug: "distance-sale", path: "/mesafeli-satis-sozlesmesi", title: "Mesafeli Satış Sözleşmesi", status: "published", version: "fixture-v1" },
];
const contractError = (code, message, status = 409) => Object.assign(new Error(message), { code, status });
function quote(body) {
  assert.ok(Array.isArray(body.cartItems) && body.cartItems.length, "fixture purchase requires cartItems");
  const items = body.cartItems.map((line) => {
    const id = line.product_id, variantId = line.variant_id;
    if (!Number.isInteger(id) || ![41, 42].includes(id)) throw contractError("PRODUCT_NOT_PURCHASABLE", "Ürün satın alınamıyor.");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw contractError("QUANTITY_INVALID", "Ürün adedi geçersiz.", 400);
    if (id === 42 && variantId == null) throw contractError("VARIANT_REQUIRED", "Bu ürün için seçenek seçmelisin.", 400);
    if (variantId != null && (!Number.isInteger(variantId) || variantId < 1 || variantId > 2147483647)) throw contractError("VARIANT_ID_INVALID", "Seçenek kimliği geçersiz.", 400);
    if (id === 41 && variantId != null) throw contractError("VARIANT_NOT_ALLOWED", "Bu ürün seçenek kabul etmiyor.", 400);
    const variant = id === 42 ? state.variants.find((row) => row.id === variantId && !row.hidden) : null;
    if (id === 42 && !variant) throw contractError("VARIANT_NOT_PURCHASABLE", "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.");
    if (variant && (!variant.purchasable || variant.availableStock < line.quantity)) throw contractError("VARIANT_STOCK_UNAVAILABLE", "Seçilen seçeneğin güncel stoğu yeterli değil.");
    const unitPrice = variant?.price ?? 80;
    return { id, ...(variant ? { variant_id: variant.id, variant_selections: structuredClone(variant.selections) } : {}), name: product(id).name, sku: variant?.sku ?? "FIX-SIMPLE", store_id: 9, price: unitPrice, quantity: line.quantity, line_total: unitPrice * line.quantity };
  });
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  return { items, totals: { currency: "TRY", subtotal, bundleDiscount: 0, couponDiscount: 0, shippingFee: 0, total: subtotal }, campaigns: {}, coupon: { applied: false } };
}
function preview(body) {
  const currentQuote = quote(body);
  const context = { addressId: body.addressId, items: currentQuote.items, totals: currentQuote.totals };
  const documents = definitions.map((definition) => ({ ...definition, text: `YEREL TEST BELGESİ. ${definition.title}. ${JSON.stringify(context)}`, sourceContentSha256: hash(definition), contentSha256: hash({ definition, context }) }));
  return { schemaVersion: "checkout-agreements-v2", snapshotSha256: hash({ context, documents }), contextSha256: hash(context), documents, quote: currentQuote, context };
}
const bodyOf = async (req) => { let data = ""; for await (const chunk of req) data += chunk; return data ? JSON.parse(data) : {}; };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
  try {
    if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(html); }
    if (bridges.has(url.pathname)) { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(bridges.get(url.pathname)); }
    if (url.pathname === "/fixture-product.svg") { res.writeHead(200, { "Content-Type": "image/svg+xml" }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#eee"/><path d="M50 40 L80 25 Q100 45 120 25 L150 40 L175 85 L145 100 L140 180 L60 180 L55 100 L25 85Z" fill="#b73848"/></svg>'); }
    if (!url.pathname.startsWith("/api/")) { res.writeHead(204); return res.end(); }
    const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await bodyOf(req) : null;
    const call = { method: req.method, path: url.pathname, ...(body ? { body } : {}) };
    state.calls.push(call);
    if (url.pathname === "/api/users/login") return json({ token: "fixture-only-token", sessionId: "fixture-session", user });
    if (url.pathname === "/api/public/categories") return json([{ id: 1, name: "Giyim", slug: "giyim", path: "giyim", parent_id: null, children: [] }]);
    if (url.pathname === "/api/products") return json([product(42), product(41)].map(({ variants, ...summary }) => summary));
    if (/^\/api\/products\/\d+$/.test(url.pathname)) return json(product(Number(url.pathname.split("/").at(-1))));
    if (url.pathname === "/api/public/navigation/main") return json({ code: "main", items: [] });
    if (url.pathname === "/api/public/collections") return json([]);
    if (url.pathname === "/api/public/business-identity") return json({ status: "pending_owner_company_formation", identity: null });
    if (url.pathname === "/api/assistant/capability") return json({ contractVersion: "novabot-modes-v1", available: true, defaultModeId: "friendly", provider: { ready: true }, advancedModesAvailable: true, modeSelectionAvailable: true, modes: [{ id: "friendly", label: "Samimi", description: "Yerel fixture" }, { id: "concise", label: "Kısa", description: "Kısa fixture yanıtı" }] });
    if (url.pathname === "/api/payments/capability") return json({ provider: "paytr", ready: true, testMode: true, state: "ready", message: "Yalnız yerel HTTP fixture; sağlayıcı çağrısı yok.", requirements: { businessIdentityReady: true, legalDocumentsReady: true }, agreements: definitions });
    if (url.pathname === "/api/campaigns/quote") {
      const result = quote(body); state.accepted.push(call);
      if (body.couponCode === "HOLD") { state.held.push(() => json(result)); return; }
      return json(result);
    }
    if (req.headers.authorization !== "Bearer fixture-only-token") return json({ code: "AUTH_REQUIRED", error: "Authentication required." }, 401);
    if (url.pathname === "/api/users/me") return json({ user });
    if (url.pathname === "/api/shared-state/cart") { if (body) state.cart = body.payload; return json({ exists: true, payload: state.cart }); }
    if (url.pathname === "/api/shared-state/checkout") { if (body) state.checkout = body.payload; return json({ exists: true, payload: state.checkout }); }
    if (url.pathname === "/api/favorites" || url.pathname === "/api/favorites/sync" || /^\/api\/favorites\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").at(-1));
      if (req.method === "POST" && id) state.favorites = [...new Set([...state.favorites, id])];
      if (req.method === "DELETE") state.favorites = state.favorites.filter((value) => value !== id);
      return json({ productIds: state.favorites });
    }
    if (url.pathname === "/api/addresses") return json([address]);
    if (url.pathname === "/api/payments/agreements/preview") { const result = preview(body); state.accepted.push(call); return json(result); }
    if (url.pathname === "/api/payments/initialize") {
      if (state.initializeError) throw contractError(state.initializeError.code, state.initializeError.message);
      const current = preview(body);
      if (body.agreementSnapshotSha256 !== current.snapshotSha256 || definitions.some((def) => !body.agreementAcceptances?.some((item) => item.slug === def.slug && item.version === def.version && item.accepted === true))) throw contractError("CHECKOUT_AGREEMENT_SNAPSHOT_STALE", "Sözleşme yenilendi; tekrar onaylamalısın.");
      state.accepted.push(call);
      // Deliberate local stopping boundary, never issue a provider token or payment handoff.
      return json({ code: "PAYMENT_PROVIDER_NOT_CONFIGURED", error: "Fixture doğrulaması tamamlandı; sağlayıcı çağrısı yapılmadı." }, 503);
    }
    if (url.pathname === "/api/orders/user/1") return json([{ ...order, return_id: state.returns.at(-1)?.id, return_status: state.returns.at(-1)?.status }]);
    if (url.pathname === "/api/returns" && req.method === "POST") {
      assert.equal(body.order_id, order.id);
      assert.deepEqual(Object.keys(body).sort(), ["note", "order_id", "reason_code"]);
      const row = { id: 701, user_id: 1, order_id: 31, reason_code: body.reason_code, note: body.note, status: "REQUESTED", refund_amount: 250.75, revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), decision_note: null };
      state.returns = [row]; return json({ reused: false, return: row }, 201);
    }
    if (url.pathname === "/api/returns/mine") return json(state.returns);
    if (url.pathname === "/api/returns/701") return json({ ...state.returns[0], order_status: order.status, payment_status: order.payment_status, refund_status: "REQUESTED" });
    if (url.pathname.startsWith("/api/notifications")) return json(url.pathname.endsWith("unread-count") ? { unreadCount: 0 } : { items: [] });
    if (/\/reviews|\/questions|\/permission|\/rating|\/rating-summary|\/review-permission/.test(url.pathname)) return json([]);
    state.unknown.push(call); return json([]);
  } catch (error) {
    state.rejected.push({ path: url.pathname, code: error.code || "FIXTURE_ASSERTION", message: error.message });
    json({ code: error.code || "FIXTURE_ASSERTION", error: error.code?.startsWith("VARIANT_") ? error.code : error.message }, error.status || 500);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.NOVASTORE_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-first-run", "--disable-background-networking"] });
const page = await browser.newPage();
const failures = [], checks = [], requests = [], blockedNetwork = [], screenshots = [], negative = {};
page.on("pageerror", (error) => failures.push(error.message));
await page.setRequestInterception(true);
page.on("request", (req) => { requests.push(req.url()); if (req.url().startsWith(base) || req.url().startsWith("data:") || req.url().startsWith("blob:")) req.continue(); else { blockedNetwork.push(req.url()); req.abort(); } });
const has = async (text) => page.waitForFunction((text) => document.querySelector("#main-content")?.innerText.includes(text), { timeout: 15000 }, text);
const navigate = async (route) => { await page.evaluate((route) => { location.hash = route; }, route); };
const check = (name, value = true) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const clickText = async (selector, text) => {
  await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some((el) => el.textContent.trim() === text && !el.disabled), {}, selector, text);
  await page.evaluate((selector, text) => [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text && !el.disabled).click(), selector, text);
};
const settle = async () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
const cartRows = async () => page.$$eval(".cart-page-line", (rows) => rows.map((row) => ({ key: row.dataset.cartLineKey, text: row.innerText })));
const sidecar = async () => page.evaluate(() => JSON.parse(localStorage.getItem("novastore_variant_cart_1") || "[]"));
const variantPage = async () => { await navigate("#/urun/fixture-varyant"); await page.waitForSelector('[data-variant-id="123"]'); };
const selectVariant = async (id) => {
  await page.waitForSelector(`[data-variant-id="${id}"]:not([disabled])`);
  await page.$eval(`[data-variant-id="${id}"]`, (el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await settle();
  await page.click(`[data-variant-id="${id}"]`);
  await page.waitForFunction((id) => document.querySelector(`[data-variant-id="${id}"]`)?.getAttribute("aria-pressed") === "true", {}, id);
};
const addSelected = async () => { await page.click(".purchase-row .primary-button"); await settle(); };
const paymentStep = async () => { await navigate("#/odeme/odeme"); await page.waitForSelector('.exact-agreement input[type="checkbox"]'); };
const acceptAndReview = async () => {
  await paymentStep();
  await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.forEach((input) => { if (!input.checked) input.click(); }));
  await clickText(".checkout-navigation button", "Siparişi kontrol et"); await page.waitForSelector(".review-products");
};
const screenshot = async (label, width) => {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await settle();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`${label} overflow ${width}`, overflow <= 1);
  const filename = `${label}-${width}.png`;
  await page.screenshot({ path: path.join(out, filename), fullPage: true });
  screenshots.push({ file: filename, width, overflow });
  if (label === "variant-detail") {
    const controls = `variant-controls-${width}.png`;
    await (await page.$(".product-summary")).screenshot({ path: path.join(out, controls) });
    screenshots.push({ file: controls, width, scope: "PDP selector price stock and purchase controls" });
  }
};
const initializeCount = () => state.calls.filter((call) => call.path === "/api/payments/initialize").length;
try {
  await page.setViewport({ width: 1440, height: 1000 }); await page.goto(`${base}/#/giris`);
  await page.waitForSelector('input[name="email"]'); await page.type('input[name="email"]', user.email); await page.type('input[name="password"]', "FixtureOnly123!");
  await page.click('.auth-card form button[type="submit"]'); await page.waitForFunction(() => localStorage.nova_user_token && (location.hash === "#/" || location.hash === ""));
  check("real login and auth adapters against isolated HTTP fixture");
  await variantPage();
  check("only complete canonical server rows are selector choices", JSON.stringify(await page.$$eval("[data-variant-id]", (els) => els.map((el) => Number(el.dataset.variantId)).sort())) === JSON.stringify([123, 124, 125]));
  check("descriptive attributes do not generate combinations", await page.$$(".storage-options button").then((rows) => rows.length === 0));
  check("no required variant automatically selected", await page.$$eval("[data-variant-id]", (els) => els.every((el) => el.getAttribute("aria-pressed") !== "true")));
  check("required selection gates add and buy now", await page.$$eval(".purchase-row .primary-button, .buy-now-button", (els) => els.length >= 2 && els.every((el) => el.disabled)));
  check("zero-stock combination visible and disabled", await page.$eval('[data-variant-id="125"]', (el) => el.disabled));
  negative.MISSING_REQUIRED_VARIANT_ACCEPTED = (await sidecar()).filter((row) => row.productId === 42 && !row.variantId).length;
  await selectVariant(124);
  check("variant L displays server price including cents", await page.$eval(".detail-price strong", (el) => /150[,.]75/.test(el.innerText)));
  check("selected L stock comes from exact server row", await page.$eval(".stock-line", (el) => /3 adet/.test(el.innerText)));
  await page.click('.purchase-row button[aria-label="Adedi artır"]'); await page.click('.purchase-row button[aria-label="Adedi artır"]');
  check("quantity upper bound uses selected L stock", await page.$eval('.purchase-row button[aria-label="Adedi artır"]', (el) => el.disabled));
  await page.click('.purchase-row button[aria-label="Adedi azalt"]'); await page.click('.purchase-row button[aria-label="Adedi azalt"]');
  await addSelected(); await selectVariant(123); await addSelected(); await addSelected();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("novastore_variant_cart_1") || "[]").find((row) => row.variantId === 123)?.quantity === 2);
  check("canonical local sidecar contains only IDs and quantity", (await sidecar()).every((row) => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(["productId", "quantity", "variantId"])));
  await navigate("#/sepet"); await page.waitForSelector(".cart-page-line");
  const firstCart = await cartRows();
  negative.VARIANT_CART_COLLISION_COUNT = firstCart.length === 2 && new Set(firstCart.map((row) => row.key)).size === 2 ? 0 : 1;
  check("same product M and L remain separate with same-M aggregation", firstCart.some((row) => row.key === "42:123" && /200[,.]00/.test(row.text)) && firstCart.some((row) => row.key === "42:124" && /150[,.]75/.test(row.text)) && negative.VARIANT_CART_COLLISION_COUNT === 0);
  await page.reload(); await page.waitForSelector(".cart-page-line");
  check("cart reload retains variant IDs and quantities", (await cartRows()).length === 2 && (await sidecar()).find((row) => row.variantId === 123)?.quantity === 2);
  check("actual legacy bridge never receives variant rows", state.calls.filter((call) => call.path === "/api/shared-state/cart" && call.body).every((call) => call.body.payload.items.every((item) => Number(item.productId ?? item.id) !== 42)));
  // Tampered cached price and stock are discarded; detail and quote remain server-owned.
  await page.evaluate(() => { const key = "novastore_variant_cart_1"; localStorage.setItem(key, JSON.stringify(JSON.parse(localStorage.getItem(key)).map((row) => ({ ...row, price: 0.01, stock: 99999, availableStock: 99999, store_id: 999, sku: "FORGED" })))); });
  await page.reload(); await page.waitForSelector(".cart-page-line");
  const verifiedCart = await cartRows();
  negative.CLIENT_VARIANT_PRICE_AUTHORITY = verifiedCart.some((row) => /0[,.]0[12]/.test(row.text)) ? 1 : 0;
  check("forged cached price ignored after reload", negative.CLIENT_VARIANT_PRICE_AUTHORITY === 0 && verifiedCart.some((row) => row.key === "42:123" && /200[,.]00/.test(row.text)));
  await paymentStep();
  check("two independent legal documents initially unaccepted", await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.length === 2 && inputs.every((input) => !input.checked)));
  check("review forward disabled without legal acceptance", await page.$eval(".checkout-navigation .primary-button", (button) => button.disabled));
  await page.click('.exact-agreement input[type="checkbox"]');
  check("one document cannot authorize review", await page.$eval(".checkout-navigation .primary-button", (button) => button.disabled));
  await acceptAndReview();
  check("review preserves both selected variants and server quote total", await page.$$eval(".review-products > div", (rows) => rows.length === 2 && rows.some((row) => /200[,.]00/.test(row.innerText)) && rows.some((row) => /150[,.]75/.test(row.innerText))));
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewport({ width, height: 1000 });
    await variantPage(); await selectVariant(124); await screenshot("variant-detail", width);
    await navigate("#/sepet"); await page.waitForSelector(".cart-page-line"); await screenshot("variant-cart", width);
    await acceptAndReview(); await screenshot("variant-review", width);
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç");
  await has("Fixture doğrulaması tamamlandı; sağlayıcı çağrısı yapılmadı.");
  check("initialize body captured after both exact legal acceptances", initializeCount() === 1);
  const purchaseCalls = state.calls.filter((call) => ["/api/campaigns/quote", "/api/payments/agreements/preview", "/api/payments/initialize"].includes(call.path));
  check("quote preview initialize send minimal canonical variant line shape", purchaseCalls.length > 3 && purchaseCalls.every((call) => call.body.cartItems.every((line) => JSON.stringify(Object.keys(line).sort()) === JSON.stringify(["product_id", "quantity", "variant_id"]))));
  check("initialize agreement binds both canonical variants", state.calls.find((call) => call.path === "/api/payments/initialize").body.agreementAcceptances.every((item) => item.accepted === true));
  // Hold a coupon response for M+L, mutate the mounted checkout through its drawer, then release it.
  await page.reload(); await paymentStep();
  await page.type("#connected-coupon", "HOLD");
  const heldRequest = page.waitForRequest((req) => req.url().endsWith("/api/campaigns/quote") && req.postData()?.includes('"HOLD"'));
  await page.click('.connected-coupon-form button[type="submit"]'); await heldRequest;
  await page.click(".cart-header-action"); await page.waitForSelector('#cart-drawer [data-cart-line-key="42:123"]');
  await page.locator('#cart-drawer [data-cart-line-key="42:123"] > button').click(); await page.locator('#cart-drawer button[aria-label="Sepeti kapat"]').click();
  await page.waitForFunction(() => document.querySelector(".checkout-summary .order-total")?.innerText.match(/150[,.]75/) && document.querySelectorAll('.exact-agreement input[type="checkbox"]').length === 2);
  check("cart mutation requotes remaining L before old coupon response", (await sidecar()).length === 1 && (await sidecar())[0].variantId === 124);
  const heldResponse = page.waitForResponse((res) => res.url().endsWith("/api/campaigns/quote") && res.request().postData()?.includes('"HOLD"'));
  state.held.splice(0).forEach((release) => release()); await heldResponse; await settle();
  check("late M+L coupon cannot overwrite current L total or acceptances", await page.$eval(".checkout-summary .order-total", (el) => /150[,.]75/.test(el.innerText)) && await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.every((input) => !input.checked)));
  await acceptAndReview();
  check("late quote does not resurrect removed variant in review", await page.$$eval(".review-products > div", (rows) => rows.length === 1 && rows[0].innerText.includes("FIX-RED-L")));
  await page.evaluate(() => localStorage.setItem("novastore_variant_cart_1", JSON.stringify([{ productId: 42, variantId: 124, quantity: 1 }, { productId: 42, variantId: 123, quantity: 2 }])));
  // Change after legal acceptance, before initialize: the server rejects and the consumer must invalidate consent.
  for (const scenario of [
    { name: "stale-price", code: "VARIANT_PRICE_CHANGED", message: "Seçenek fiyatı değişti. Güncel fiyatı yeniden onaylamalısın.", mutate: () => { state.variants[0].price = 125; } },
    { name: "disabled", code: "VARIANT_NOT_PURCHASABLE", message: "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.", mutate: () => { state.variants[0].hidden = true; } },
    { name: "deleted", code: "VARIANT_NOT_PURCHASABLE", message: "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.", mutate: () => { state.variants = state.variants.filter((row) => row.id !== 123); } },
    { name: "out-of-stock", code: "VARIANT_STOCK_UNAVAILABLE", message: "Seçilen seçeneğin güncel stoğu yeterli değil.", mutate: () => { state.variants[0].availableStock = 0; state.variants[0].purchasable = false; } },
  ]) {
    state.variants = structuredClone(initialVariants); state.initializeError = null;
    await page.reload(); await acceptAndReview();
    scenario.mutate(); state.initializeError = { code: scenario.code, message: scenario.message };
    const countBefore = initializeCount(); await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç"); await has(scenario.message);
    await page.waitForFunction(() => !document.querySelector(".review-products"));
    check(`${scenario.name} error truthful and checkout consent invalidated`, initializeCount() === countBefore + 1 && await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.every((input) => !input.checked)));
    if (scenario.name === "disabled") negative.DISABLED_VARIANT_ACCEPTED = state.accepted.filter((call) => call.path === "/api/payments/initialize").length - 1;
    if (scenario.name === "out-of-stock") negative.CLIENT_VARIANT_STOCK_AUTHORITY = state.accepted.filter((call) => call.path === "/api/payments/initialize").length - 1;
    await screenshot(`error-${scenario.name}`, 1440);
  }
  state.variants = structuredClone(initialVariants); state.initializeError = null;
  // Persist a foreign canonical-looking ID: never silently coerce it into product-only checkout.
  await page.evaluate(() => localStorage.setItem("novastore_variant_cart_1", JSON.stringify([{ productId: 42, variantId: 999, quantity: 1 }])));
  const acceptedBefore = state.accepted.length;
  await page.reload(); await navigate("#/sepet"); await has("Fixture Kanonik Tişört");
  check("foreign persisted variant remains a visible invalid line", (await sidecar()).some((row) => row.variantId === 999));
  await navigate("#/odeme/odeme"); await has("Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.");
  negative.FOREIGN_VARIANT_ACCEPTED = state.accepted.slice(acceptedBefore).filter((call) => call.body?.cartItems?.some((line) => line.variant_id === 999)).length;
  check("foreign persisted variant cannot enter review", !(await page.$(".review-products")) && negative.FOREIGN_VARIANT_ACCEPTED === 0);
  // An old product-only cart row for a now-required product stays blocked, rather than choosing a row.
  await page.evaluate(() => localStorage.setItem("novastore_variant_cart_1", JSON.stringify([{ productId: 42, quantity: 1 }])));
  const missingBefore = state.accepted.length;
  await page.reload(); await navigate("#/odeme/odeme"); await has("Bu ürün için bir seçenek seçmelisin.");
  negative.MISSING_REQUIRED_VARIANT_ACCEPTED += state.accepted.slice(missingBefore).filter((call) => call.body?.cartItems?.some((line) => line.product_id === 42 && line.variant_id == null)).length;
  check("missing required variant never becomes a product-only purchase", negative.MISSING_REQUIRED_VARIANT_ACCEPTED === 0 && !(await page.$(".review-products")));
  // Simple flow retains the actual legacy bridge and product-only purchase contract.
  await page.evaluate(() => localStorage.removeItem("novastore_variant_cart_1")); await page.reload();
  await navigate("#/urun/fixture-basit"); await has("Fixture Basit Ürün"); await page.waitForSelector(".purchase-row .primary-button:not([disabled])");
  check("simple PDP has no variant selector", !(await page.$("[data-variant-id]")));
  await addSelected(); await navigate("#/sepet"); await page.waitForSelector(".cart-page-line");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("novastore_cart_1") || "[]").some((row) => row.productId === 41));
  check("simple product uses unchanged bridge persistence", state.cart.items.some((row) => row.productId === 41) && (await sidecar()).length === 0);
  await acceptAndReview();
  const simpleCalls = state.calls.filter((call) => call.body?.cartItems?.some((line) => line.product_id === 41));
  check("simple quote and preview omit variant ID and hints", simpleCalls.length >= 2 && simpleCalls.every((call) => call.body.cartItems.every((line) => JSON.stringify(Object.keys(line).sort()) === JSON.stringify(["product_id", "quantity"]))));
  // Historical order labels and canonical SKU must come from the order snapshot.
  state.variants = state.variants.map((row) => ({ ...row, sku: "CURRENT-CATALOG-SKU", selections: [{ group: "Yeni etiket", value: "CURRENT-CATALOG-LABEL" }] }));
  await navigate("#/hesabim/siparisler/31"); await has("Sipariş #31"); await has("FIX-RED-M"); await has("FIX-RED-L");
  check("order snapshots survive later SKU and label catalog changes", await page.$eval("#main-content", (el) => el.innerText.includes("Kırmızı") && !el.innerText.includes("CURRENT-CATALOG")));
  await clickText("button", "İade talebi oluştur"); await page.select('select[name="reasonCode"]', "DAMAGED"); await page.type('textarea[name="note"]', "Fixture sipariş düzeyinde iade."); await clickText('button[type="submit"]', "Talebi gönder"); await has("Talep #701 detayını aç");
  await navigate("#/hesabim/iadeler/701"); await has("Açıklaman"); await page.reload(); await has("Açıklaman");
  check("variant order retains order-level return creation and exact history reload", state.returns.length === 1 && state.calls.some((call) => call.path === "/api/returns/701"));
  // Existing customer entry points remain usable with variant products in the live catalog.
  state.variants = structuredClone(initialVariants);
  await variantPage(); await page.click('.product-gallery .customer-favorite-button');
  await page.waitForFunction(() => document.querySelector('.product-gallery .customer-favorite-button')?.getAttribute("aria-pressed") === "true");
  await navigate("#/favoriler"); await has("Fixture Kanonik Tişört"); await page.reload(); await has("Fixture Kanonik Tişört");
  check("favorites retain product identity and real bridge after reload", state.favorites.includes(42));
  await navigate("#/kategori/giyim"); await page.waitForSelector(".customer-product-card .compare-button");
  const compareButtons = await page.$$(".customer-product-card .compare-button");
  assert.equal(compareButtons.length, 2); await compareButtons[0].click(); await compareButtons[1].click();
  await page.locator(".comparison-open").click(); await page.waitForSelector(".comparison-dialog");
  check("compare preserves both product entries", await page.$eval(".comparison-dialog", (el) => el.innerText.includes("Fixture Kanonik Tişört") && el.innerText.includes("Fixture Basit Ürün")));
  await page.click('button[aria-label="Karşılaştırmayı kapat"]'); await page.click('button[aria-label="Karşılaştırma listesini temizle"]');
  await page.waitForSelector(".comparison-tray", { hidden: true }); check("compare clear removes tray");
  check("seller recruitment retains accepted destination", await page.$eval(".seller-recruitment-action", (el) => el.href === "https://novastore-stage.com/"));
  await page.setViewport({ width: 390, height: 900 }); await page.locator('.mobile-bottom-nav a[href="#/favoriler"]').click(); await has("Favorilerim");
  check("mobile navigation opens favorites", await page.evaluate(() => location.hash === "#/favoriler"));
  await page.locator('.mobile-bottom-nav a[href="#/sepet"]').click(); await has("Sepetim");
  check("mobile navigation retains simple cart", (await cartRows()).some((row) => row.key === "41"));
  await page.click(".assistant-fab"); await page.waitForSelector(".assistant-mode__trigger"); await page.click(".assistant-mode__trigger");
  await clickText('#novabot-mode-listbox button strong', "Kısa");
  check("NovaBot keeps server-provided mode selection", await page.$eval(".assistant-mode__trigger", (el) => el.innerText.includes("Kısa")));
  await page.click('#novabot-dialog button[aria-label="NovaBot penceresini kapat"]');
  for (const [key, value] of Object.entries(negative)) check(`${key}: 0`, value === 0);
  check("all API traffic remains the isolated same-origin loopback", requests.filter((url) => url.includes("/api/")).every((url) => url.startsWith(`${base}/api/`)));
  check("no provider request or navigation", !requests.some((url) => /paytr\.com|\/paytr-checkout\.html/.test(url)));
  check("browser uncaught errors zero", failures.length === 0);
  const sourceSha256After = await captureSources();
  check("runtime and proof source hashes unchanged from build start", JSON.stringify(sourceSha256After) === JSON.stringify(sourceSha256));
  await fs.writeFile(path.join(out, "runtime-result.json"), JSON.stringify({ proofScope: "DISPOSABLE_HTTP_CONTRACT_FIXTURE_CONSUMER_ONLY", convergedPc1E2E: "NOT_RUN", productionWrites: 0, providerCalls: 0, browser: await browser.version(), checks, negative, failures, screenshots, requests: state.calls, rejected: state.rejected, blockedNetwork, unknownFixtureRoutes: state.unknown, sourceSha256, sourceSha256After, bundleSha256: hash(html) }, null, 2));
  await fs.rm(path.join(out, "runtime-failure.txt"), { force: true });
  await fs.rm(path.join(out, "failure.png"), { force: true });
} catch (error) {
  await fs.writeFile(path.join(out, "runtime-failure.txt"), `${error.stack}\n${failures.join("\n")}\n${JSON.stringify({ checks, negative, recentCalls: state.calls.slice(-25) }, null, 2)}\n${await page.content()}`);
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally { state.held.splice(0).forEach((release) => release()); await browser.close(); await new Promise((resolve) => server.close(resolve)); }
