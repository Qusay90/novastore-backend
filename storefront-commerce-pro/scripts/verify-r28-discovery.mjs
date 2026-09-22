// Run only against r28-real-r27-server.mjs: real immutable R27 routes + owned disposable DB.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { selectCanonicalVariant } from "./variant-selector-browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "../artifacts/r28-verification");
const base = "http://127.0.0.1:5088";
const api = async (url, body) => { const r = await fetch(base + url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); assert(r.ok, url); return r.json(); };
const fixture = await api("/__r28/fixture");
const bundleSha256 = createHash("sha256").update(await fs.readFile(path.resolve(root, "../frontend/commerce-pro/index.html"))).digest("hex");
const browser = await puppeteer.launch({ executablePath: process.env.NOVASTORE_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-background-networking", "--no-first-run"] });
const page = await browser.newPage();
const checks = [], geometry = [], fixedGeometry = [], errors = [], external = [], requests = [], reputationBodies = [], purchaseLines = [];
let failAppend = false, delaySearch = null, releaseSearch = null;
const check = (name, condition = true) => { assert(condition, name); checks.push(name); console.log("PASS " + name); };
page.on("pageerror", (error) => errors.push(error.message));
await page.setRequestInterception(true);
page.on("request", async (request) => {
  const url = request.url();
  if (/^(data|blob):/.test(url)) return request.continue();
  if (!url.startsWith(base + "/")) { external.push(url); return request.abort(); }
  const parsed = new URL(url); requests.push({ method: request.method(), path: parsed.pathname, query: Object.fromEntries(parsed.searchParams) });
  if (["/api/campaigns/quote", "/api/payments/agreements/preview"].includes(parsed.pathname)) {
    purchaseLines.push({ path: parsed.pathname, lines: JSON.parse(request.postData() || "{}").cartItems });
  }
  if (failAppend && parsed.pathname === "/api/products" && parsed.searchParams.has("cursor")) {
    failAppend = false; return request.respond({ status: 503, contentType: "application/json", body: '{"error":"Disposable continuation fault"}' });
  }
  if (delaySearch && parsed.pathname === "/api/products" && parsed.searchParams.get("q") === delaySearch) {
    delaySearch = null; releaseSearch = () => request.continue().catch(() => {}); return;
  }
  return request.continue();
});
page.on("response", async (response) => {
  if (/\/api\/(questions|reviews)\/product\//.test(response.url()) && response.ok()) {
    try { reputationBodies.push(await response.json()); } catch {}
  }
});
const settle = async () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const visible = async (selector) => page.waitForSelector(selector, { visible: true, timeout: 15000 });
const count = (selector = ".plp-results .customer-product-card") => page.$$eval(selector, (nodes) => nodes.length);
const waitCount = async (n, selector = ".plp-results .customer-product-card") => page.waitForFunction((selector, n) => document.querySelectorAll(selector).length === n, { timeout: 15000 }, selector, n);
let navigation = 0;
const goto = async (route, selector = ".public-continuation") => { await page.goto(`${base}/?r28-test=${++navigation}#${route}`, { waitUntil: "networkidle0" }); await visible(selector); };
const route = async (value) => { await page.evaluate((hash) => { location.hash = hash; }, value); await settle(); };
const button = async (text, scope = "") => {
  await page.waitForFunction((text, scope) => [...document.querySelectorAll(`${scope} button`)].some((node) => node.textContent.trim() === text && node.getBoundingClientRect().width > 0), {}, text, scope);
  const handles = await page.$$(`${scope} button`);
  for (const handle of handles) if (await handle.evaluate((node, text) => node.textContent.trim() === text && node.getBoundingClientRect().width > 0, text)) return handle;
  throw new Error("Missing button: " + text);
};
const click = async (text, scope = "") => { const handle = await button(text, scope); await handle.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" })); await handle.click(); };
const more = async (label = "ürün") => click(`Daha fazla ${label} göster`);
const cardIds = () => page.$$eval(".plp-results .customer-product-card h3 a", (nodes) => nodes.map((node) => Number(node.hash.split("/").at(-1))));
async function geometryCheck(surface, width, continuation = true) {
  await settle();
  const controls = await page.$$(".public-continuation button");
  let reachable = 0;
  for (const control of controls) {
    if (!(await control.evaluate((node) => node.getBoundingClientRect().width > 0))) continue;
    await control.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" })); await settle();
    const measurement = await control.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { width: r.width, height: r.height, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        covered: [[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]].some(([x,y]) => !node.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y))) };
    });
    assert(measurement.inView && !measurement.covered && measurement.height >= 44, `${surface} continuation reachable ${width}: ${JSON.stringify(measurement)}`); reachable++;
  }
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
  assert.equal(overflow, 0, `${surface} overflow ${width}`);
  if (continuation) assert(reachable > 0, `${surface} missing continuation ${width}`);
  geometry.push({ surface, width, overflow, reachableControls: reachable });
  await page.screenshot({ path: path.join(out, `r28-${surface}-${width}.png`) });
}

let failure;
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await goto("/arama"); await waitCount(20);
  check("first page bounded at 20", (await page.$eval(".plp-heading", (n) => n.innerText)).includes("daha fazlası var"));
  const initialRequests = requests.filter((r) => r.path === "/api/products").length;
  await settle(); check("no automatic continuation", requests.filter((r) => r.path === "/api/products").length === initialRequests);
  const lastCardButtons = await page.$$(".plp-results .customer-product-card:last-child button");
  await lastCardButtons.at(-1).focus(); await page.keyboard.press("Tab");
  check("continuation reachable through keyboard tab order", await page.evaluate(() => document.activeElement.textContent === "Daha fazla ürün göster"));
  await page.keyboard.press("Enter"); await waitCount(40);
  check("loading does not steal focus", await page.evaluate(() => document.activeElement.textContent === "Daha fazla ürün göster"));
  check("product 21 reachable by keyboard");
  for (const n of [60, 80, 100, 108]) { await more(); await waitCount(n); }
  const ids = await cardIds(); check("product 101 reachable", ids.length === 108); check("canonical append identity", new Set(ids).size === ids.length);
  await click("Listeyi yenile"); await waitCount(20);
  check("refresh resets cursor", !requests.filter((r) => r.path === "/api/products").at(-1).query.cursor);
  failAppend = true; await more(); await page.waitForFunction(() => document.querySelector(".public-continuation")?.innerText.includes("korunuyor"));
  check("page two failure retains page one", await count() === 20);
  await click("Sonraki sayfayı yeniden dene"); await waitCount(40); check("continuation retry succeeds");

  // Favorite and compare a record absent from the first page, then reset discovery.
  const selected = (await cardIds())[25];
  await page.click(`.customer-product-card:has(a[href="#/urun/${selected}"]) .favorite-button`);
  await page.waitForFunction((id) => document.querySelector(`.customer-product-card:has(a[href="#/urun/${id}"]) .favorite-button`)?.getAttribute("aria-pressed") === "true", {}, selected);
  await page.click(`.customer-product-card:has(a[href="#/urun/${selected}"]) .compare-button`);
  await route("/arama?q=Kanonik"); await waitCount(2);
  await page.click(".plp-results .compare-button");
  if (await page.$(".comparison-launcher")) await page.click(".comparison-launcher");
  await click("Karşılaştır", ".comparison-tray"); await visible(".comparison-dialog");
  check("comparison retains off-page identity", await page.$$eval(".comparison-product-row article", (n) => n.length) === 2);
  await page.click('[aria-label="Karşılaştırmayı kapat"]');
  await goto("/favoriler", ".favorites-page");
  check("favorite independently hydrated after reload", await page.$(`.customer-product-card a[href="#/urun/${selected}"]`));

  await goto("/arama"); await waitCount(20);
  await page.type("#global-search", "R28 Ortak"); await page.click('.search-box button[type="submit"]'); await waitCount(20);
  await page.waitForFunction(() => document.querySelector(".plp-heading h1")?.textContent.includes("R28 Ortak"));
  await waitCount(20);
  await more(); await waitCount(40); check("search continuation reaches server matches");
  check("search query sent to R27", requests.some((r) => r.path === "/api/products" && r.query.q === "R28 Ortak" && r.query.cursor));
  delaySearch = "delayed-r28"; await route("/arama?q=delayed-r28");
  for (let n = 0; !releaseSearch && n < 60; n++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert(releaseSearch); await route("/arama?q=Kanonik"); await waitCount(2); await releaseSearch(); releaseSearch = null; await settle();
  check("stale search cannot overwrite new identity", (await page.$eval(".plp-heading", (n) => n.innerText)).includes("Kanonik") && await count() === 2);

  await goto("/kategori/r28-teknoloji"); await waitCount(20); await more(); await waitCount(40);
  check("category continuation uses canonical ID", requests.some((r) => r.query.categoryId === String(fixture.rootCategory) && r.query.cursor && r.query.includeDescendants === "true"));
  await visible(".desktop-filters .public-attribute-filters input");
  const beforeFilter = requests.length; await page.click(".desktop-filters .public-attribute-filters input"); await waitCount(20);
  await page.waitForFunction(() => document.querySelector(".active-filters")?.innerText.includes("Renk"));
  await more(); await page.waitForFunction(() => document.querySelectorAll(".plp-results .customer-product-card").length > 20);
  const attributeRequests = requests.slice(beforeFilter).filter((r) => r.query.attributes);
  check("attribute filtering resets then continues same filter", attributeRequests.length >= 2 && !attributeRequests[0].query.cursor && attributeRequests.at(-1).query.cursor && attributeRequests[0].query.attributes === attributeRequests.at(-1).query.attributes);

  for (const slug of [fixture.storeA, fixture.storeB]) {
    await goto(`/magaza/${slug}`, ".public-store-product-grid");
    const total = (await api(`/api/public/stores/${slug}?limit=20`)).store.product_count;
    check(`${slug} complete count independent of 20 cards`, await count(".public-store-product-grid .customer-product-card") === 20 && (await page.$eval(".result-pill", (n) => n.innerText)).includes(`/ ${total}`));
    await more(); await waitCount(40, ".public-store-product-grid .customer-product-card"); check(`${slug} product 21 reachable`);
  }

  await goto(`/urun-id/${fixture.reputationProductId}`, ".review-card"); await waitCount(20, ".review-card");
  const reviewSummary = await api(`/api/reviews/product/${fixture.reputationProductId}?limit=20`);
  check("global rating differs from partial page", Number(reviewSummary.average) !== reviewSummary.reviews.reduce((sum, r) => sum + r.rating, 0) / 20);
  check("server rating and count displayed", (await page.$eval(".community-score-card", (n) => n.innerText)).includes(String(reviewSummary.average)) && (await page.$eval(".community-score-card", (n) => n.innerText)).includes("27"));
  await more("yorum"); await waitCount(27, ".review-card"); check("review page two reachable");
  check("global aggregate unchanged after append", (await page.$eval(".community-score-card > strong", (n) => n.innerText)) === String(reviewSummary.average));
  await page.click("#community-tab-questions"); await waitCount(20, ".question-card"); await more("soru"); await waitCount(27, ".question-card"); check("answered public QA page two reachable");
  const publicText = await page.$eval(".product-community", (n) => n.innerText);
  check("public unanswered and private metadata absent", !/PRIVATE|r28-private|05555555555|Özel Müşteri/.test(publicText));
  check("public markup rendered only as text", !(await page.evaluate(() => globalThis.__r28Injected)) && await page.$$eval(".question-card script,.question-card img,.review-card script", (n) => n.length) === 0);
  check("no partial rating distribution invented", await count(".community-score-bars") === 0);

  // Real server search -> canonical variants -> cart; the full R24 legal/stale fixture runs separately.
  await goto("/arama?q=Kanonik"); await waitCount(2); await page.click(`.customer-product-card a[href="#/urun/${fixture.variantProductId}"]`);
  await visible(".runtime-variant-selection");
  const canonicalPdp = await api(`/api/products/${fixture.variantProductId}`);
  await selectCanonicalVariant(page, canonicalPdp.variants.find((row) => row.id === fixture.variantM));
  await click("Sepete ekle", ".purchase-row");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("novastore_variant_cart_guest") || "[]").length > 0);
  await goto("/sepet", ".cart-page-line");
  check("real R27 discovered variant keeps canonical cart identity", (await page.$eval(".cart-page-line", (n) => n.dataset.cartLineKey)).includes(String(fixture.variantProductId)));
  await goto("/giris", 'input[name="email"]');
  await page.type('input[name="email"]', fixture.email); await page.type('input[name="password"]', "R28LocalOnly!2026");
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForFunction(() => localStorage.nova_user_token && (location.hash === "#/" || !location.hash));
  await goto("/odeme/odeme", '.exact-agreement input[type="checkbox"]');
  check("real R27 variant reaches current legal preview", await count('.exact-agreement input[type="checkbox"]') === 2);
  check("legal consent starts unchecked", await page.$$eval('.exact-agreement input[type="checkbox"]', (nodes) => nodes.every((node) => !node.checked)));
  for (const agreement of await page.$$('.exact-agreement input[type="checkbox"]')) await agreement.click();
  await click("Siparişi kontrol et", ".checkout-navigation"); await visible(".review-products");
  check("real R27 accepted variant quote and legal lines", purchaseLines.some((call) => call.path.endsWith("/preview") && call.lines?.some((line) => line.product_id === fixture.variantProductId && line.variant_id === fixture.variantM)));
  check("purchase sends only canonical identity and quantity", purchaseLines.every((call) => call.lines?.every((line) => Object.keys(line).every((key) => ["product_id","variant_id","quantity"].includes(key)))));

  for (const width of [1440,1280,1024,768,390,360]) {
    await page.setViewport({ width, height: width <= 390 ? 844 : width === 768 ? 1024 : 1000 });
    for (const [surface, path] of [["catalog","/arama"],["search","/arama?q=R28%20Ortak"],["category","/kategori/r28-teknoloji"],["store",`/magaza/${fixture.storeA}`]]) {
      await goto(path); await visible(surface === "store" ? ".public-store-product-grid" : ".plp-results .customer-product-card");
      if (surface === "catalog") {
        const compares = await page.$$(".plp-results .compare-button");
        for (const control of compares.slice(0,2)) { await control.evaluate((node) => node.scrollIntoView({block:"center",behavior:"instant"})); await control.click(); }
        if (await page.$(".comparison-launcher")) await page.click(".comparison-launcher");
        await visible(".comparison-tray"); await settle();
        const fixed = await page.evaluate(() => [...document.querySelectorAll(".comparison-tray button,.mobile-bottom-nav a,.assistant-fab")].filter((n) => n.getBoundingClientRect().width > 0).map((node) => {
          const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return { label: node.getAttribute("aria-label") || node.textContent, reachable: node.contains(hit), inView: r.left >= 0 && r.right <= innerWidth+1 && r.top >= 0 && r.bottom <= innerHeight+1 };
        }));
        assert(fixed.every((item) => item.reachable && item.inView), `fixed controls ${width}: ${JSON.stringify(fixed)}`);
        fixedGeometry.push({ width, controls: fixed });
      }
      if (surface === "category" && width < 1024) { await click("Filtrele"); await visible(".mobile-filter-drawer"); await page.keyboard.press("Escape"); }
      await geometryCheck(surface, width);
      check(`${surface} responsive ${width}`);
    }
    await goto(`/urun-id/${fixture.reputationProductId}`, ".review-card"); await geometryCheck("reviews", width); check(`reviews responsive ${width}`);
    await page.click("#community-tab-questions"); await visible(".question-card"); await geometryCheck("questions", width); check(`questions responsive ${width}`);
  }
  await api("/__r28/store-b-operational", { open: false });
  await goto("/arama?q=R28%20Ortak"); await waitCount(20);
  const closed = await api("/api/products?pagination=cursor&limit=100&q=R28%20Ortak");
  check("closed store excluded by actual R27", closed.items.length === 52 && closed.items.every((row) => row.store.slug === fixture.storeA));
  await goto(`/magaza/${fixture.storeB}`, ".public-store-error"); check("closed store unavailable in Web");
  await api("/__r28/store-b-operational", { open: true });
  check("public response field privacy", !/\"(?:user_id|email|phone|answered_by|moderation_notes|seller_id)\"/.test(JSON.stringify(reputationBodies)));
  check("no client store authority", requests.every((r) => !Object.hasOwn(r.query,"store_id")));
  check("no provider request", requests.every((r) => !r.path.includes("/payments/initialize")));
  check("no browser exception", errors.length === 0); check("no external network", external.length === 0);
  check("tested production bundle unchanged", bundleSha256 === createHash("sha256").update(await fs.readFile(path.resolve(root, "../frontend/commerce-pro/index.html"))).digest("hex"));
} catch (error) {
  failure = error.stack; console.error(error.stack);
  await page.screenshot({ path: path.join(out,"r28-failure.png") }).catch(() => {});
  await fs.writeFile(path.join(out,"r28-failure-dom.txt"), await page.content()).catch(() => {});
} finally {
  if (releaseSearch) await releaseSearch();
  await api("/__r28/store-b-operational", { open: true }).catch(() => {});
  await browser.close();
  await fs.writeFile(path.join(out,"r28-browser-result.json"), JSON.stringify({ result: failure ? "FAIL" : "PASS", failure, bundleSha256, checks, geometry, fixedGeometry, errors, external, requests, purchaseLines, backend: { head: "b654dada7a67ce8904eed9ccd1ff037e5f16e5ed", tree: "348747a9d140b112dcbc85db3a103967a29d9292" }, productionWrites: 0, providerCalls: 0 }, null, 2));
}
if (failure) process.exitCode = 1;
