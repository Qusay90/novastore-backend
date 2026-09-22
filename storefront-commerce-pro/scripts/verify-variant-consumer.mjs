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
import { selectCanonicalVariant } from "./variant-selector-browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "../artifacts/r24-variant-consumer-fixture");
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
const state = { variants: structuredClone(initialVariants), cart: { version: 1, items: [] }, checkout: {}, favorites: [], calls: [], initializeError: null, accepted: [], rejected: [], unknown: [], returns: [], held: [], providerBoundaries: [] };
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
    if (variant && !variant.purchasable && variant.availableStock > 0) throw contractError("VARIANT_NOT_PURCHASABLE", "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.");
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
    if (url.pathname === "/api/campaigns/coupons/active") return json([]);
    if (url.pathname === "/api/public/business-identity" || url.pathname === "/api/business-identity") return json({ status: "pending_owner_company_formation", identity: null });
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
      state.providerBoundaries.push(call);
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
const failures = [], checks = [], requests = [], requestLog = [], blockedNetwork = [], screenshots = [], geometry = [], negative = {};
const viewportMatrix = Object.freeze([
  { width: 1440, height: 1000 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
]);
for (const counter of [
  "DOCUMENT_HORIZONTAL_OVERFLOW",
  "UNREACHABLE_VARIANT_CONTROL_COUNT",
  "UNREACHABLE_FIXED_SURFACE_CONTROL_COUNT",
  "FIXED_SURFACE_CONTROL_CLIPPING_COUNT",
  "MISSING_REQUIRED_FIXED_SURFACE_COUNT",
  "VARIANT_CONTROL_CLIPPING_COUNT",
  "UNREACHABLE_COMMERCE_CONTROL_COUNT",
  "COMMERCE_CONTROL_CLIPPING_COUNT",
  "PERSISTENT_COMMERCE_FIXED_OVERLAP_COUNT",
  "MISSING_REQUIRED_COMMERCE_CONTROL_COUNT",
  "VARIANT_FIXED_SURFACE_OVERLAP_COUNT",
  "MOBILE_NAV_NOVABOT_COMPARE_OVERLAP_COUNT",
  "MALFORMED_VARIANT_ACCEPTED",
  "MISSING_REQUIRED_VARIANT_ACCEPTED",
  "FOREIGN_VARIANT_ACCEPTED",
  "DISABLED_VARIANT_ACCEPTED",
  "DELETED_VARIANT_ACCEPTED",
  "OUT_OF_STOCK_VARIANT_ACCEPTED",
  "PDP_TO_CART_REMOVAL_FALSE_SUCCESS",
  "CART_TO_CHECKOUT_REMOVAL_FALSE_SUCCESS",
  "STALE_VARIANT_PRICE_FALSE_SUCCESS",
  "STALE_VARIANT_STOCK_FALSE_SUCCESS",
  "VARIANT_CART_COLLISION_COUNT",
  "CLIENT_VARIANT_PRICE_AUTHORITY",
  "CLIENT_VARIANT_STOCK_AUTHORITY",
  "CLIENT_SELECTED_STORE_AUTHORITY",
  "VARIANT_ID_TAMPER_FALSE_SUCCESS",
  "LEGAL_BYPASS_COUNT",
]) negative[counter] = 0;
page.on("pageerror", (error) => failures.push(error.message));
await page.setRequestInterception(true);
page.on("request", (req) => { const url = req.url(), inline = url.startsWith("data:") || url.startsWith("blob:"); if (!inline) { requests.push(url); requestLog.push({ method: req.method(), url }); } if (url.startsWith(base) || inline) req.continue(); else { blockedNetwork.push(url); req.abort(); } });
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
const setSidecar = async (rows) => page.evaluate((value) => localStorage.setItem("novastore_variant_cart_1", JSON.stringify(value)), rows);
const resetVariants = () => { state.variants = structuredClone(initialVariants); state.initializeError = null; };
const purchaseCallsSince = (index) => state.accepted.slice(index).filter((call) => ["/api/campaigns/quote", "/api/payments/agreements/preview", "/api/payments/initialize"].includes(call.path));
const badVariantAcceptedSince = (index, predicate) => purchaseCallsSince(index).filter((call) => call.body?.cartItems?.some(predicate)).length;
const variantPage = async () => { await navigate("#/urun/fixture-varyant"); await page.waitForSelector('[data-variant-option="M"]'); };
const selectVariant = async (id) => selectCanonicalVariant(page, state.variants.find((row) => row.id === id));
const addSelected = async () => { await page.$eval(".purchase-row .primary-button", (el) => el.click()); await settle(); };
const paymentStep = async () => { await navigate("#/odeme/odeme"); await page.waitForSelector('.exact-agreement input[type="checkbox"]'); };
const acceptAndReview = async () => {
  await paymentStep();
  await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.forEach((input) => { if (!input.checked) input.click(); }));
  await clickText(".checkout-navigation button", "Siparişi kontrol et"); await page.waitForSelector(".review-products");
};
const payToFixtureBoundary = async () => {
  const before = state.providerBoundaries.length;
  await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç");
  await has("Fixture doğrulaması tamamlandı; sağlayıcı çağrısı yapılmadı.");
  check(`initialize reaches fixture-only provider boundary ${before + 1}`, state.providerBoundaries.length === before + 1);
};
const tabTo = async (selector, limit = 80) => {
  await page.evaluate(() => document.activeElement?.blur());
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate((candidate) => document.activeElement?.matches(candidate), selector)) return index + 1;
  }
  throw new Error(`Keyboard Tab could not reach ${selector}`);
};
const intersectionArea = (a, b) => {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
};
const inspectCommerceControls = async (surface, viewport, selectors, expectedMinimum) => {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" })); await settle();
  const candidates = await page.$$eval(selectors.join(","), (elements) => elements.filter((el) => {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }).map((el, index) => ({ index, tag: el.tagName, label: el.getAttribute("aria-label") || el.textContent.trim() || el.getAttribute("placeholder") || el.id })));
  negative.MISSING_REQUIRED_COMMERCE_CONTROL_COUNT += candidates.length >= expectedMinimum ? 0 : 1;
  check(`${surface} required commerce controls present ${viewport.width}x${viewport.height}`, candidates.length >= expectedMinimum);
  const controls = [];
  for (let index = 0; index < candidates.length; index += 1) {
    await page.$$eval(selectors.join(","), (elements, offset) => {
      const visible = elements.filter((el) => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      visible[offset]?.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    }, index);
    await settle();
    controls.push(await page.$$eval(selectors.join(","), (elements, offset) => {
      const visible = elements.filter((el) => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      const el = visible[offset], rect = el.getBoundingClientRect();
      const rectOf = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const insetX = Math.min(6, Math.max(2, rect.width / 4)), insetY = Math.min(6, Math.max(2, rect.height / 4));
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + insetX, rect.top + insetY], [rect.right - insetX, rect.top + insetY],
        [rect.left + insetX, rect.bottom - insetY], [rect.right - insetX, rect.bottom - insetY],
      ].map(([x, y]) => {
        const inViewport = x >= 0 && x < innerWidth && y >= 0 && y < innerHeight;
        const hit = inViewport ? document.elementFromPoint(x, y) : null;
        return { x, y, inViewport, reachable: Boolean(hit && (hit === el || el.contains(hit))), hit: hit?.className || hit?.tagName || null };
      });
      const overlays = [...document.querySelectorAll(".mobile-bottom-nav, .assistant-fab, .comparison-tray, .mobile-purchase-bar, .mobile-checkout-bar")].filter((overlay) => {
        const style = getComputedStyle(overlay), r = overlay.getBoundingClientRect();
        return !overlay.contains(el) && style.display !== "none" && style.visibility !== "hidden" && r.width > 0 && r.height > 0;
      }).map((overlay) => ({ name: overlay.className, rect: rectOf(overlay) }));
      return {
        tag: el.tagName,
        label: el.getAttribute("aria-label") || el.textContent.trim() || el.getAttribute("placeholder") || el.id,
        rect: rectOf(el),
        clipped: rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1,
        points,
        fixedOverlaps: overlays.filter((overlay) => Math.max(0, Math.min(rect.right, overlay.rect.right) - Math.max(rect.left, overlay.rect.left)) * Math.max(0, Math.min(rect.bottom, overlay.rect.bottom) - Math.max(rect.top, overlay.rect.top)) > 1),
      };
    }, index));
  }
  negative.UNREACHABLE_COMMERCE_CONTROL_COUNT += controls.filter((control) => control.points.some((point) => !point.reachable)).length;
  negative.COMMERCE_CONTROL_CLIPPING_COUNT += controls.filter((control) => control.clipped).length;
  negative.PERSISTENT_COMMERCE_FIXED_OVERLAP_COUNT += controls.filter((control) => control.fixedOverlaps.length > 0).length;
  geometry.push({ surface: `${surface}-controls`, ...viewport, controls });
};
const inspectVariantGeometry = async (viewport) => {
  const rows = [];
  for (const el of await page.$$("[data-variant-option]")) {
    await el.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    await settle();
    rows.push(await el.evaluate((el) => {
      const rectOf = (node) => node ? (() => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })() : null;
      const rect = rectOf(el), options = el.closest(".runtime-variant-options"), optionRect = rectOf(options);
      const centerX = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
      const centerY = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(centerX, centerY);
      return {
        group: el.closest("[data-variant-group]").dataset.variantGroup, value: el.dataset.variantOption,
        rect,
        optionRect,
        reachable: Boolean(hit && (hit === el || el.contains(hit))),
        clipped: rect.width <= 0 || rect.height <= 0 || rect.left < -1 || rect.right > innerWidth + 1 || rect.left < optionRect.left - 1 || rect.right > optionRect.right + 1 || options.scrollWidth > options.clientWidth + 1,
        nav: rectOf(document.querySelector(".mobile-bottom-nav")),
        fab: rectOf(document.querySelector(".assistant-fab")),
      };
    }));
  }
  const documentOverflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
  negative.DOCUMENT_HORIZONTAL_OVERFLOW += documentOverflow > 1 ? 1 : 0;
  negative.UNREACHABLE_VARIANT_CONTROL_COUNT += rows.filter((row) => !row.reachable).length;
  negative.VARIANT_CONTROL_CLIPPING_COUNT += rows.filter((row) => row.clipped).length;
  for (const row of rows) negative.VARIANT_FIXED_SURFACE_OVERLAP_COUNT += [row.nav, row.fab].filter((fixed) => intersectionArea(row.rect, fixed) > 1).length;
  geometry.push({ surface: "variant-detail", ...viewport, documentOverflow, controls: rows });
};
const inspectFixedSurfaceGeometry = async (viewport) => {
  await navigate("#/kategori/giyim"); await page.waitForSelector(".customer-product-card .compare-button"); await settle();
  // Route transitions can deliberately close the comparison surface. Rebuild its
  // fixture state at each viewport so the geometry assertion observes all three
  // fixed surfaces together instead of depending on state from the prior route.
  const compareCount = await page.$$eval(".customer-product-card .compare-button", (buttons) => buttons.length);
  for (let index = 0; index < compareCount; index += 1) {
    if (await page.$$eval(".customer-product-card .compare-button", (buttons, offset) => buttons[offset]?.getAttribute("aria-pressed") === "true", index)) {
      await page.$$eval(".customer-product-card .compare-button", (buttons, offset) => buttons[offset]?.click(), index); await settle();
    }
  }
  for (let index = 0; index < compareCount; index += 1) {
    await page.$$eval(".customer-product-card .compare-button", (buttons, offset) => buttons[offset]?.click(), index); await settle();
  }
  await page.waitForSelector(".comparison-tray .comparison-open:not([disabled])");
  const result = await page.evaluate(() => {
    const rectOf = (selector) => { const node = document.querySelector(selector); if (!node) return null; const style = getComputedStyle(node), r = node.getBoundingClientRect(); if (style.display === "none" || style.visibility === "hidden" || r.width <= 0 || r.height <= 0) return null; return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const interactive = [...document.querySelectorAll(".comparison-tray button, .mobile-bottom-nav a, .assistant-fab")].filter((el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0).map((el) => {
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2)), Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2)));
      return { surface: el.closest(".comparison-tray") ? "comparison" : el.closest(".mobile-bottom-nav") ? "mobile-navigation" : "novabot", label: el.getAttribute("aria-label") || el.textContent.trim(), reachable: Boolean(hit && (hit === el || el.contains(hit))), clipped: r.width <= 0 || r.height <= 0 || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
    });
    return { documentOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), tray: rectOf(".comparison-tray"), nav: rectOf(".mobile-bottom-nav"), fab: rectOf(".assistant-fab"), interactive };
  });
  negative.DOCUMENT_HORIZONTAL_OVERFLOW += result.documentOverflow > 1 ? 1 : 0;
  negative.UNREACHABLE_FIXED_SURFACE_CONTROL_COUNT += result.interactive.filter((item) => !item.reachable).length;
  negative.FIXED_SURFACE_CONTROL_CLIPPING_COUNT += result.interactive.filter((item) => item.clipped).length;
  const expectedMobileNav = viewport.width <= 620;
  const comparisonControls = result.interactive.filter((item) => item.surface === "comparison").length;
  const mobileNavigationControls = result.interactive.filter((item) => item.surface === "mobile-navigation").length;
  const novaBotControls = result.interactive.filter((item) => item.surface === "novabot").length;
  const requiredSurfacesPresent = Boolean(result.tray?.width > 0 && result.fab?.width > 0 && comparisonControls >= 5 && novaBotControls === 1 && (expectedMobileNav ? result.nav?.width > 0 && mobileNavigationControls === 5 : !result.nav && mobileNavigationControls === 0));
  negative.MISSING_REQUIRED_FIXED_SURFACE_COUNT += requiredSurfacesPresent ? 0 : 1;
  check(`required compare NovaBot and mobile-navigation surfaces ${viewport.width}x${viewport.height}`, requiredSurfacesPresent);
  negative.MOBILE_NAV_NOVABOT_COMPARE_OVERLAP_COUNT += intersectionArea(result.tray, result.nav) > 1 ? 1 : 0;
  negative.MOBILE_NAV_NOVABOT_COMPARE_OVERLAP_COUNT += intersectionArea(result.tray, result.fab) > 1 ? 1 : 0;
  negative.MOBILE_NAV_NOVABOT_COMPARE_OVERLAP_COUNT += intersectionArea(result.nav, result.fab) > 1 ? 1 : 0;
  geometry.push({ surface: "comparison-navigation-novabot", ...viewport, ...result });
};
const screenshot = async (label, viewport) => {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  await settle();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  negative.DOCUMENT_HORIZONTAL_OVERFLOW += overflow > 1 ? 1 : 0;
  check(`${label} overflow ${viewport.width}x${viewport.height}`, overflow <= 1);
  const filename = `${label}-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(out, filename), fullPage: true });
  screenshots.push({ file: filename, ...viewport, overflow });
  if (label === "variant-detail") {
    const controls = `variant-controls-${viewport.width}x${viewport.height}.png`;
    await (await page.$(".product-summary")).screenshot({ path: path.join(out, controls) });
    screenshots.push({ file: controls, ...viewport, scope: "PDP selector price stock and purchase controls" });
  }
};
const initializeCount = () => state.calls.filter((call) => call.path === "/api/payments/initialize").length;
try {
  await page.setViewport({ width: 1440, height: 1000 }); await page.goto(`${base}/#/giris`);
  await page.waitForSelector('input[name="email"]'); await page.type('input[name="email"]', user.email); await page.type('input[name="password"]', "FixtureOnly123!");
  await page.click('.auth-card form button[type="submit"]'); await page.waitForFunction(() => localStorage.nova_user_token && (location.hash === "#/" || location.hash === ""));
  check("real login and auth adapters against isolated HTTP fixture");
  await has("Fixture Kanonik Tişört");
  check("Home renders the canonical fixture catalog", await page.$eval("#main-content", (el) => el.innerText.includes("Fixture Kanonik Tişört") && el.innerText.includes("Fixture Basit Ürün")));
  await page.type("#global-search", "Fixture Kanonik"); await page.waitForSelector(".search-suggestions button");
  await page.$eval(".search-suggestions button", (button) => button.click()); await page.waitForSelector('[data-variant-option="M"]');
  check("global Search suggestion opens the selected canonical PDP", await page.evaluate(() => location.hash === "#/urun/fixture-varyant" && document.querySelector("#main-content")?.innerText.includes("Fixture Kanonik Tişört")));
  await variantPage();
  check("only canonical server option values are selector choices", JSON.stringify(await page.$$eval("[data-variant-option]", (els) => els.map((el) => el.dataset.variantOption))) === JSON.stringify(["Kırmızı", "Mavi", "M", "L"]));
  check("descriptive attributes do not generate combinations", await page.$$(".storage-options button").then((rows) => rows.length === 0));
  check("no required variant automatically selected", await page.$$eval("[data-variant-option]", (els) => els.every((el) => el.getAttribute("aria-pressed") !== "true")));
  check("required selection gates add and buy now", await page.$$eval(".purchase-row .primary-button, .buy-now-button", (els) => els.length >= 2 && els.every((el) => el.disabled)));
  check("zero-stock combination visible and disabled", await page.$eval('[data-variant-option="Mavi"]', (el) => el.getAttribute("aria-disabled") === "true" && el.dataset.optionState === "OUT_OF_STOCK"));
  await tabTo('[data-variant-option="Kırmızı"]');
  check("keyboard Tab reaches a labeled native variant button with visible focus", await page.$eval('[data-variant-option="Kırmızı"]', (el) => {
    const style = getComputedStyle(el);
    return document.activeElement === el && el.matches(":focus-visible") && el.tagName === "BUTTON" && el.closest("fieldset")?.querySelector("legend")?.textContent.trim() === "Renk" && el.innerText.includes("Kırmızı") && style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2;
  }));
  await page.keyboard.press("Enter");
  await tabTo('[data-variant-option="M"]'); await page.keyboard.press("Enter");
  await page.waitForSelector('[data-resolved-variant-id="123"]');
  check("keyboard Enter explicitly completes one canonical variant with non-color cues", await page.$$eval("[data-variant-option]", (buttons) => {
    const selected = buttons.filter((button) => button.getAttribute("aria-pressed") === "true");
    return selected.length === 2 && selected.every((el) => el.querySelector('.runtime-variant-selected')?.innerText === "✓");
  }));
  await tabTo('[data-variant-option="L"]'); await page.keyboard.press("Space"); await page.waitForSelector('[data-resolved-variant-id="124"]');
  check("keyboard Space changes deterministic selection and visible cue", await page.$$eval("[data-variant-option]", (buttons) => buttons.filter((button) => button.getAttribute("aria-pressed") === "true" && button.querySelector(".runtime-variant-selected")?.innerText === "✓").map((button) => button.dataset.variantOption).join() === "Kırmızı,L"));
  negative.MISSING_REQUIRED_VARIANT_ACCEPTED = (await sidecar()).filter((row) => row.productId === 42 && !row.variantId).length;
  check("variant L displays server price including cents", await page.$eval(".detail-price strong", (el) => /150[,.]75/.test(el.innerText)));
  check("selected L stock comes from exact server row", await page.$eval(".stock-line", (el) => /3 adet/.test(el.innerText)));
  await page.$eval('.purchase-row button[aria-label="Adedi artır"]', (el) => el.click()); await page.waitForFunction(() => document.querySelector(".quantity-control span")?.textContent === "2");
  await page.$eval('.purchase-row button[aria-label="Adedi artır"]', (el) => el.click());
  await page.waitForFunction(() => document.querySelector('.purchase-row button[aria-label="Adedi artır"]')?.disabled === true);
  check("quantity upper bound uses selected L stock", await page.$eval('.purchase-row button[aria-label="Adedi artır"]', (el) => el.disabled));
  await page.$eval('.purchase-row button[aria-label="Adedi azalt"]', (el) => el.click()); await page.waitForFunction(() => document.querySelector(".quantity-control span")?.textContent === "2");
  await page.$eval('.purchase-row button[aria-label="Adedi azalt"]', (el) => el.click()); await page.waitForFunction(() => document.querySelector(".quantity-control span")?.textContent === "1");
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
  await variantPage(); await selectVariant(124);
  await page.$eval('.purchase-row button[aria-label="Adedi artır"]', (el) => el.click()); await page.waitForFunction(() => document.querySelector(".quantity-control span")?.textContent === "2");
  await page.$eval('.purchase-row button[aria-label="Adedi artır"]', (el) => el.click()); await page.waitForFunction(() => document.querySelector(".quantity-control span")?.textContent === "3");
  const canonicalStockEnforced = await page.$eval('.purchase-row button[aria-label="Adedi artır"]', (el) => el.disabled) && await page.$eval(".stock-line", (el) => /3 adet/.test(el.innerText) && !/99999/.test(el.innerText));
  negative.CLIENT_VARIANT_STOCK_AUTHORITY += canonicalStockEnforced ? 0 : 1;
  check("forged cached stock ignored and canonical quantity bound enforced", canonicalStockEnforced);
  await paymentStep();
  const legalBlockedInitializeAt = initializeCount();
  check("two independent legal documents initially unaccepted", await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.length === 2 && inputs.every((input) => !input.checked)));
  check("review forward disabled without legal acceptance", await page.$eval(".checkout-navigation .primary-button", (button) => button.disabled));
  await page.click('.exact-agreement input[type="checkbox"]');
  check("one document cannot authorize review or initialize", await page.$eval(".checkout-navigation .primary-button", (button) => button.disabled) && initializeCount() === legalBlockedInitializeAt);
  await acceptAndReview();
  check("review preserves both selected variants and server quote total", await page.$$eval(".review-products > div", (rows) => rows.length === 2 && rows.some((row) => /200[,.]00/.test(row.innerText)) && rows.some((row) => /150[,.]75/.test(row.innerText))));
  for (const viewport of viewportMatrix) {
    await page.setViewport(viewport);
    await variantPage(); await selectVariant(124); await inspectVariantGeometry(viewport);
    await inspectCommerceControls("variant-detail", viewport, [".purchase-row .quantity-control button", ".purchase-row .buy-now-button", ".purchase-row .primary-button", ".mobile-purchase-bar button"], viewport.width <= 620 ? 5 : 4); await screenshot("variant-detail", viewport);
    await navigate("#/sepet"); await page.waitForSelector(".cart-page-line");
    await inspectCommerceControls("variant-cart", viewport, [".cart-page-line__copy > button", ".cart-page-line__end .quantity-control button", ".cart-page-grid .order-summary .checkout-button"], 7); await screenshot("variant-cart", viewport);
    await acceptAndReview();
    await inspectCommerceControls("variant-review", viewport, [".connected-coupon-form input", ".connected-coupon-form button", ".checkout-navigation button", ".mobile-checkout-bar button"], viewport.width <= 620 ? 5 : 4); await screenshot("variant-review", viewport);
    await inspectFixedSurfaceGeometry(viewport); await screenshot("fixed-surfaces", viewport);
  }
  await page.click('button[aria-label="Karşılaştırma listesini temizle"]');
  await page.waitForSelector(".comparison-tray", { hidden: true });
  await page.setViewport({ width: 1440, height: 1000 });
  await acceptAndReview();
  await payToFixtureBoundary();
  check("initialize body captured after both exact legal acceptances", initializeCount() === 1);
  const purchaseCalls = state.calls.filter((call) => ["/api/campaigns/quote", "/api/payments/agreements/preview", "/api/payments/initialize"].includes(call.path));
  check("quote preview initialize send minimal canonical variant line shape", purchaseCalls.length > 3 && purchaseCalls.every((call) => call.body.cartItems.every((line) => JSON.stringify(Object.keys(line).sort()) === JSON.stringify(["product_id", "quantity", "variant_id"]))));
  const firstInitialize = state.calls.find((call) => call.path === "/api/payments/initialize");
  const initializedLines = firstInitialize.body.cartItems.map((line) => `${line.product_id}:${line.variant_id}:${line.quantity}`).sort();
  check("initialize binds the exact M quantity-two and L quantity-one cart without collision", JSON.stringify(initializedLines) === JSON.stringify(["42:123:2", "42:124:1"]));
  check("initialize legal snapshot binds that exact canonical cart", firstInitialize.body.agreementAcceptances.every((item) => item.accepted === true) && firstInitialize.body.agreementSnapshotSha256 === preview(firstInitialize.body).snapshotSha256);
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
  // Stale price P1 -> P2: reject the old acceptance, show P2, require a new preview/reaccept, then stop at the fixture provider boundary.
  resetVariants(); await setSidecar([{ productId: 42, variantId: 123, quantity: 1 }]); await page.reload(); await acceptAndReview();
  check("stale-price setup shows canonical P1", await page.$eval(".review-products", (el) => /100[,.]00/.test(el.innerText)));
  const stalePriceAcceptedAt = state.accepted.length;
  const stalePriceInitializeAt = initializeCount();
  const stalePricePreviewAt = state.calls.filter((call) => call.path === "/api/payments/agreements/preview").length;
  state.variants[0].price = 125;
  state.initializeError = { code: "VARIANT_PRICE_CHANGED", message: "Seçenek fiyatı değişti. Güncel fiyatı yeniden onaylamalısın." };
  await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç"); await has(state.initializeError.message);
  await page.waitForFunction(() => !document.querySelector(".review-products"));
  await page.waitForFunction(() => document.querySelectorAll('.exact-agreement input[type="checkbox"]').length === 2 && [...document.querySelectorAll('.exact-agreement input[type="checkbox"]')].every((input) => !input.checked) && /125[,.]00/.test(document.querySelector(".checkout-summary .order-total")?.innerText || ""));
  negative.STALE_VARIANT_PRICE_FALSE_SUCCESS += state.accepted.slice(stalePriceAcceptedAt).filter((call) => call.path === "/api/payments/initialize").length;
  check("stale price rejects old legal acceptance and refreshes canonical P2", initializeCount() === stalePriceInitializeAt + 1 && await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.length === 2 && inputs.every((input) => !input.checked)) && await page.$eval(".checkout-summary .order-total", (el) => /125[,.]00/.test(el.innerText)));
  const stalePriceBody = state.calls.filter((call) => call.path === "/api/payments/initialize").at(-1).body;
  state.initializeError = null;
  await acceptAndReview();
  check("stale price recovery requires new preview and explicit reacceptance", state.calls.filter((call) => call.path === "/api/payments/agreements/preview").length > stalePricePreviewAt && await page.$eval(".review-products", (el) => /125[,.]00/.test(el.innerText)));
  await payToFixtureBoundary();
  const freshPriceBody = state.providerBoundaries.at(-1).body;
  check("P2 legal snapshot replaces P1 snapshot before initialize", stalePriceBody.agreementSnapshotSha256 !== freshPriceBody.agreementSnapshotSha256 && freshPriceBody.agreementAcceptances.every((item) => item.accepted === true));
  await screenshot("error-stale-price-recovered", { width: 1440, height: 1000 });

  // Stale stock: reject old acceptance, recover stock, refetch/repreview/reaccept, then stop at the provider boundary.
  resetVariants(); await setSidecar([{ productId: 42, variantId: 123, quantity: 1 }]); await page.reload(); await paymentStep(); await acceptAndReview();
  const staleStockAcceptedAt = state.accepted.length;
  const staleStockInitializeAt = initializeCount();
  const staleStockBoundaryAt = state.providerBoundaries.length;
  const staleStockPreviewAt = state.calls.filter((call) => call.path === "/api/payments/agreements/preview").length;
  state.variants[0].availableStock = 0; state.variants[0].purchasable = false;
  state.initializeError = { code: "VARIANT_STOCK_UNAVAILABLE", message: "Seçilen seçeneğin güncel stoğu yeterli değil." };
  await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç"); await has(state.initializeError.message);
  await page.waitForFunction(() => !document.querySelector(".review-products"));
  negative.STALE_VARIANT_STOCK_FALSE_SUCCESS += state.accepted.slice(staleStockAcceptedAt).filter((call) => call.path === "/api/payments/initialize").length;
  const staleStockLegalBlocked = await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.length === 0 || (inputs.length === 2 && inputs.every((input) => !input.checked)));
  check("stale stock rejects old legal acceptance before provider boundary", initializeCount() === staleStockInitializeAt + 1 && state.providerBoundaries.length === staleStockBoundaryAt && staleStockLegalBlocked);
  state.variants[0].availableStock = 2; state.variants[0].purchasable = true; state.initializeError = null;
  await page.reload(); await paymentStep(); await acceptAndReview();
  check("stock recovery performs a new legal preview and explicit reacceptance", state.calls.filter((call) => call.path === "/api/payments/agreements/preview").length > staleStockPreviewAt && await page.$$eval(".review-products > div", (rows) => rows.length === 1 && rows[0].innerText.includes("FIX-RED-M")));
  await payToFixtureBoundary();
  await screenshot("error-stale-stock-recovered", { width: 1440, height: 1000 });

  // Persisted negative matrix: malformed, missing, foreign, disabled, deleted, and out-of-stock identities.
  for (const scenario of [
    { name: "malformed", counter: "MALFORMED_VARIANT_ACCEPTED", row: { productId: 42, variantId: "malformed", quantity: 1 }, message: "Ürün veya varyant kimliği geçersiz; seçimi yeniden yapın.", mutate: () => {} },
    { name: "missing", counter: "MISSING_REQUIRED_VARIANT_ACCEPTED", row: { productId: 42, quantity: 1 }, message: "Bu ürün için bir seçenek seçmelisin.", mutate: () => {} },
    { name: "foreign", counter: "FOREIGN_VARIANT_ACCEPTED", row: { productId: 42, variantId: 999, quantity: 1 }, message: "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.", mutate: () => {} },
    { name: "disabled", counter: "DISABLED_VARIANT_ACCEPTED", row: { productId: 42, variantId: 123, quantity: 1 }, message: "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.", mutate: () => { state.variants[0].purchasable = false; state.variants[0].availableStock = 4; } },
    { name: "deleted", counter: "DELETED_VARIANT_ACCEPTED", row: { productId: 42, variantId: 123, quantity: 1 }, message: "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.", mutate: () => { state.variants = state.variants.filter((row) => row.id !== 123); } },
    { name: "out-of-stock", counter: "OUT_OF_STOCK_VARIANT_ACCEPTED", row: { productId: 42, variantId: 123, quantity: 1 }, message: "Seçilen seçeneğin güncel stoğu yeterli değil.", mutate: () => { state.variants[0].purchasable = false; state.variants[0].availableStock = 0; } },
  ]) {
    resetVariants(); scenario.mutate(); await setSidecar([scenario.row]);
    const acceptedAt = state.accepted.length;
    await page.reload(); await navigate("#/odeme/odeme"); await has(scenario.message);
    const variantId = scenario.row.variantId;
    negative[scenario.counter] += badVariantAcceptedSince(acceptedAt, (line) => line.product_id === 42 && (variantId == null ? line.variant_id == null : line.variant_id === variantId));
    if (scenario.name === "malformed") negative.VARIANT_ID_TAMPER_FALSE_SUCCESS += negative[scenario.counter];
    check(`${scenario.name} variant is blocked before review`, !(await page.$(".review-products")) && negative[scenario.counter] === 0);
    await screenshot(`error-${scenario.name}`, { width: 1440, height: 1000 });
    if (scenario.name === "malformed") {
      await setSidecar([]); await page.reload(); await navigate("#/"); await has("Fixture Kanonik Tişört");
      check("clearing malformed local variant identity recovers the storefront", await page.$eval("#main-content", (el) => el.innerText.includes("Fixture Kanonik Tişört")));
    }
  }

  // Variant removed after PDP add, before cart refresh.
  resetVariants(); await setSidecar([]); await page.reload(); await variantPage(); await selectVariant(123); await addSelected();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("novastore_variant_cart_1") || "[]").some((row) => row.variantId === 123));
  state.variants = state.variants.filter((row) => row.id !== 123);
  let acceptedAt = state.accepted.length;
  await navigate("#/sepet"); await has("Bu seçenek artık satışta değil. Üründen yeniden seçim yap.");
  await navigate("#/odeme/odeme"); await has("Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.");
  negative.PDP_TO_CART_REMOVAL_FALSE_SUCCESS += badVariantAcceptedSince(acceptedAt, (line) => line.product_id === 42 && line.variant_id === 123);
  check("variant removed between PDP and cart remains visible-invalid and cannot reach review", (await sidecar()).some((row) => row.variantId === 123) && !(await page.$(".review-products")) && negative.PDP_TO_CART_REMOVAL_FALSE_SUCCESS === 0);

  // Variant removed after a valid cart render, before checkout.
  resetVariants(); await setSidecar([{ productId: 42, variantId: 124, quantity: 1 }]); await page.reload(); await navigate("#/sepet"); await page.waitForSelector('[data-cart-line-key="42:124"]');
  state.variants = state.variants.filter((row) => row.id !== 124); acceptedAt = state.accepted.length;
  await navigate("#/odeme/odeme"); await has("Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.");
  negative.CART_TO_CHECKOUT_REMOVAL_FALSE_SUCCESS += badVariantAcceptedSince(acceptedAt, (line) => line.product_id === 42 && line.variant_id === 124);
  check("variant removed between cart and checkout cannot reach review", !(await page.$(".review-products")) && negative.CART_TO_CHECKOUT_REMOVAL_FALSE_SUCCESS === 0);

  resetVariants();
  // Simple flow retains the actual legacy bridge and product-only purchase contract.
  await page.evaluate(() => localStorage.removeItem("novastore_variant_cart_1")); await page.reload();
  await navigate("#/urun/fixture-basit"); await has("Fixture Basit Ürün"); await page.waitForSelector(".purchase-row .primary-button:not([disabled])");
  check("simple PDP has no variant selector", !(await page.$(".runtime-variant-selection")));
  await addSelected(); await navigate("#/sepet"); await page.waitForSelector(".cart-page-line");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("novastore_cart_1") || "[]").some((row) => row.productId === 41));
  check("simple product uses unchanged bridge persistence", state.cart.items.some((row) => row.productId === 41) && (await sidecar()).length === 0);
  await acceptAndReview();
  await payToFixtureBoundary();
  const simpleCalls = state.calls.filter((call) => ["/api/campaigns/quote", "/api/payments/agreements/preview", "/api/payments/initialize"].includes(call.path) && call.body?.cartItems?.some((line) => line.product_id === 41));
  check("simple quote preview and initialize omit variant ID and authority hints", simpleCalls.some((call) => call.path === "/api/payments/initialize") && simpleCalls.length >= 3 && simpleCalls.every((call) => call.body.cartItems.every((line) => JSON.stringify(Object.keys(line).sort()) === JSON.stringify(["product_id", "quantity"]))));
  // Historical order labels and canonical SKU must come from the order snapshot.
  state.variants = state.variants.map((row) => ({ ...row, sku: "CURRENT-CATALOG-SKU", selections: [{ group: "Yeni etiket", value: "CURRENT-CATALOG-LABEL" }] }));
  await navigate("#/hesabim/siparisler"); await has("Siparişlerim"); await has("Sipariş No: 31");
  check("order history explicitly lists the canonical historical order", await page.$eval("#main-content", (el) => el.innerText.includes("Sipariş No: 31")));
  await navigate("#/hesabim/siparisler/31"); await has("Sipariş #31"); await has("FIX-RED-M"); await has("FIX-RED-L");
  check("order snapshots survive later SKU and label catalog changes", await page.$eval("#main-content", (el) => el.innerText.includes("Kırmızı") && !el.innerText.includes("CURRENT-CATALOG")));
  await clickText("button", "İade talebi oluştur"); await page.select('select[name="reasonCode"]', "DAMAGED"); await page.type('textarea[name="note"]', "Fixture sipariş düzeyinde iade."); await clickText('button[type="submit"]', "Talebi gönder"); await has("Talep #701 detayını aç");
  await navigate("#/hesabim/iadeler"); await has("İade Taleplerim"); await has("Talep #701");
  check("return history explicitly lists the created order-level return", await page.$eval("#main-content", (el) => el.innerText.includes("Talep #701") && el.innerText.includes("Talep alındı")));
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
  const allPurchaseCalls = state.calls.filter((call) => ["/api/campaigns/quote", "/api/payments/agreements/preview", "/api/payments/initialize"].includes(call.path) && Array.isArray(call.body?.cartItems));
  negative.CLIENT_SELECTED_STORE_AUTHORITY += allPurchaseCalls.filter((call) => call.body.cartItems.some((line) => ["store", "store_id", "seller", "seller_id"].some((key) => Object.hasOwn(line, key)))).length;
  negative.LEGAL_BYPASS_COUNT += state.calls.filter((call) => call.path === "/api/payments/initialize" && definitions.some((definition) => !call.body.agreementAcceptances?.some((item) => item.slug === definition.slug && item.version === definition.version && item.accepted === true))).length;
  const requiredGeometrySurfaces = ["variant-detail", "variant-detail-controls", "variant-cart-controls", "variant-review-controls", "comparison-navigation-novabot"];
  check("geometry proof contains every required surface for every exact viewport", geometry.length === viewportMatrix.length * requiredGeometrySurfaces.length && viewportMatrix.every((viewport) => requiredGeometrySurfaces.every((surface) => geometry.some((entry) => entry.width === viewport.width && entry.height === viewport.height && entry.surface === surface))));
  for (const [key, value] of Object.entries(negative)) check(`${key}: 0`, value === 0);
  check("all API traffic remains the isolated same-origin loopback", requests.filter((url) => url.includes("/api/")).every((url) => url.startsWith(`${base}/api/`)));
  const providerRequests = requests.filter((url) => /paytr\.com|\/paytr-checkout\.html/.test(url));
  const externalWriteRequests = requestLog.filter((request) => ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !request.url.startsWith(base));
  check("no provider request or navigation", providerRequests.length === 0);
  console.log(`NETWORK_AUDIT ${JSON.stringify({ blockedNetwork, unknownFixtureRoutes: state.unknown })}`);
  check("no blocked external network or unknown fixture API routes", blockedNetwork.length === 0 && state.unknown.length === 0);
  check("browser uncaught errors zero", failures.length === 0);
  const sourceSha256After = await captureSources();
  check("runtime and proof source hashes unchanged from build start", JSON.stringify(sourceSha256After) === JSON.stringify(sourceSha256));
  await fs.writeFile(path.join(out, "runtime-result.json"), JSON.stringify({ proofScope: "DISPOSABLE_HTTP_CONTRACT_FIXTURE_CONSUMER_ONLY", convergedPc1E2E: "NOT_RUN", productionWrites: externalWriteRequests.length, providerCalls: providerRequests.length, providerBoundaryCount: state.providerBoundaries.length, viewportMatrix, browser: await browser.version(), checks, negative, failures, screenshots, geometry, browserRequests: requestLog, fixtureRequests: state.calls, rejected: state.rejected, blockedNetwork, unknownFixtureRoutes: state.unknown, sourceSha256, sourceSha256After, bundleSha256: hash(html) }, null, 2));
  await fs.rm(path.join(out, "runtime-failure.txt"), { force: true });
  await fs.rm(path.join(out, "failure.png"), { force: true });
} catch (error) {
  await fs.writeFile(path.join(out, "runtime-failure.txt"), `${error.stack}\n${failures.join("\n")}\n${JSON.stringify({ checks, negative, blockedNetwork, unknownFixtureRoutes: state.unknown, recentCalls: state.calls.slice(-25) }, null, 2)}\n${await page.content()}`);
  await page.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally { state.held.splice(0).forEach((release) => release()); await browser.close(); await new Promise((resolve) => server.close(resolve)); }
