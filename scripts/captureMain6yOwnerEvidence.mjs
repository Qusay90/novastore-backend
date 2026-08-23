import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storefrontOrigin = new URL(process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5293").origin;
const adminOrigin = new URL(process.env.NOVASTORE_REVIEW_ADMIN_ORIGIN || "http://127.0.0.1:5294").origin;
const evidenceDirectory = path.resolve(process.env.NOVASTORE_MAIN6Y_EVIDENCE_DIR || "");
const ffmpegPath = path.resolve(process.env.NOVASTORE_MAIN6Y_FFMPEG || "");
const requireFromStorefront = createRequire(path.join(root, "storefront-commerce-pro", "package.json"));
const puppeteer = requireFromStorefront("puppeteer-core");
const axe = requireFromStorefront("axe-core");
const timeout = 35_000;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

assert.ok(process.env.NOVASTORE_MAIN6Y_EVIDENCE_DIR, "NOVASTORE_MAIN6Y_EVIDENCE_DIR is required.");
assert.ok(path.relative(root, evidenceDirectory).startsWith(".."), "Main6Y evidence must remain outside Git.");
assert.ok(fs.existsSync(ffmpegPath), "A task-owned ffmpeg executable is required.");
for (const value of [storefrontOrigin, adminOrigin]) {
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname));
}
fs.mkdirSync(evidenceDirectory, { recursive: true });

const chromeCandidates = [
  process.env.NOVASTORE_CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(chromePath, "Google Chrome is required for Main6Y owner UAT.");

const diagnostics = {
  chrome: chromePath,
  requests: 0,
  externalOrigins: new Set(),
  nonLoopbackMutations: [],
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  responseErrors: [],
  adminPatchCount: 0,
};
const artifacts = [];
const record = (fileName, metadata = {}) => {
  const bytes = fs.readFileSync(path.join(evidenceDirectory, fileName));
  const entry = { fileName, sha256: sha256(bytes), bytes: bytes.length, ...metadata };
  const existing = artifacts.findIndex((item) => item.fileName === fileName);
  if (existing >= 0) artifacts.splice(existing, 1, entry); else artifacts.push(entry);
  return entry;
};

const configurePage = async (page) => {
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("404") && !text.includes("ERR_ABORTED")) diagnostics.consoleErrors.push(text);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    if (!failure.includes("ERR_ABORTED")) diagnostics.requestFailures.push(`${request.method()} ${request.url()} :: ${failure}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) diagnostics.responseErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    diagnostics.requests += 1;
    let parsed;
    try { parsed = new URL(request.url()); } catch { return; }
    if (![storefrontOrigin, adminOrigin].includes(parsed.origin) && !/^(?:data|blob|about):/i.test(request.url())) diagnostics.externalOrigins.add(parsed.origin);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && ![storefrontOrigin, adminOrigin].includes(parsed.origin)) {
      diagnostics.nonLoopbackMutations.push(`${request.method()} ${request.url()}`);
    }
    if (request.method() === "PATCH" && parsed.origin === adminOrigin && /\/framing$/u.test(parsed.pathname)) diagnostics.adminPatchCount += 1;
  });
};

const capture = async (page, fileName, options = {}, metadata = {}) => {
  await page.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png", ...options });
  return record(fileName, { url: page.url(), viewport: page.viewport(), ...metadata });
};

const captureElement = async (page, selector, fileName, { padding = 16, maxHeight = 1050 } = {}, metadata = {}) => {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.$eval(selector, (node) => node.scrollIntoView({ block: "center", inline: "center" }));
  await delay(140);
  const box = await page.$eval(selector, (node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  });
  const clip = {
    x: Math.max(0, box.x - padding),
    y: Math.max(0, box.y - padding),
    width: Math.min(1800, box.width + padding * 2),
    height: Math.min(maxHeight, box.height + padding * 2),
  };
  return capture(page, fileName, { clip, captureBeyondViewport: true }, metadata);
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const contactSheet = async (browser, entries) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 2100, height: 1200, deviceScaleFactor: 1 });
  const figures = entries.map(({ fileName, label, note = "" }) => {
    const source = fs.readFileSync(path.join(evidenceDirectory, fileName)).toString("base64");
    return `<figure><img src="data:image/png;base64,${source}" alt=""><figcaption><strong>${escapeHtml(label)}</strong><span>${escapeHtml(note)}</span></figcaption></figure>`;
  }).join("");
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:36px;background:#edf2f6;color:#102a43;font:14px Inter,"Segoe UI",sans-serif}header{margin-bottom:24px}h1{font-size:34px;margin:0 0 7px}p{margin:0;color:#5f7183}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}figure{margin:0;padding:10px;background:#fff;border:1px solid #d7e0e7;border-radius:14px;box-shadow:0 8px 22px rgba(16,42,67,.08)}img{width:100%;height:310px;object-fit:contain;object-position:top;background:#f7f9fb;border-radius:8px}figcaption{display:grid;gap:3px;padding:9px 2px 2px}strong{font-size:13px}span{font-size:11px;color:#647789}</style></head><body><header><h1>NovaStore Main-6Y owner görsel kapanış</h1><p>Gerçek Google Chrome · yerel güvenli runtime · Admin çerçeveleme + müşteri kartı + PDP + mikroetkileşimler</p></header><main>${figures}</main></body></html>`, { waitUntil: "load" });
  await capture(page, "MAIN6Y-OWNER-CONTACT-SHEET.png", { fullPage: true }, { state: "20 readable owner evidence views" });
  await page.close();
};

const startRecording = async (page, fileBase) => {
  const source = path.join(evidenceDirectory, `${fileBase}.source.webm`);
  const recorder = await page.screencast({ path: source, format: "webm", ffmpegPath, fps: 30, quality: 20 });
  return {
    async stop() {
      await recorder.stop();
      const output = path.join(evidenceDirectory, `${fileBase}.mp4`);
      const conversion = spawnSync(ffmpegPath, ["-y", "-i", source, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { windowsHide: true, encoding: "utf8" });
      assert.equal(conversion.status, 0, conversion.stderr?.slice(-3000));
      assert.ok(fs.statSync(output).size > 100_000, `${fileBase}.mp4 must contain a real Chrome recording.`);
      record(`${fileBase}.mp4`, { source: "Google Chrome DevTools screencast", codec: "H.264/yuv420p" });
    },
  };
};

const setRange = async (page, selector, value) => page.$eval(selector, (input, next) => {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  nativeSetter.call(input, String(next));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, value);

const waitForStorefront = async (page, route, selector = "main") => {
  const response = await page.goto(`${storefrontOrigin}${route}`, { waitUntil: "domcontentloaded", timeout });
  if (response) assert.ok(response.status() < 400);
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.evaluate(() => document.fonts.ready);
  await delay(280);
};

const ownerProducts = await fetch(`${storefrontOrigin}/api/products`).then((response) => {
  assert.ok(response.ok);
  return response.json();
});
const ownerProductValues = Array.isArray(ownerProducts) ? ownerProducts : ownerProducts.products || ownerProducts.data || [];
assert.ok(ownerProductValues.length >= 8, "Main6Y requires a diverse live public product fixture.");

const browserDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "novastore-main6y-browser-"));
let browser;
const uat = { routes: {}, drawer: {}, accessibility: {}, framing: {}, interactions: {}, delivery: {}, privacy: {} };
try {
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    userDataDir: browserDirectory,
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    args: ["--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync", "--disable-default-apps", "--force-device-scale-factor=1"],
  });

  const adminPage = await browser.newPage();
  await configurePage(adminPage);
  await adminPage.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await adminPage.goto(`${adminOrigin}/`, { waitUntil: "domcontentloaded", timeout });
  await adminPage.waitForSelector('[data-testid="live-catalog"]', { visible: true, timeout });
  await adminPage.waitForSelector('[data-catalog-operation="media"][data-product-id]', { visible: true, timeout });
  const publicProductIds = new Set(ownerProductValues.map((item) => Number(item.id)));
  const adminCandidateIds = await adminPage.$$eval('[data-catalog-operation="media"][data-product-id]', (buttons) => buttons.map((button) => Number(button.dataset.productId)));
  const adminProductId = adminCandidateIds.find((id) => publicProductIds.has(id));
  assert.ok(Number.isSafeInteger(adminProductId), `Admin candidates ${adminCandidateIds.join(",")} do not overlap public products ${[...publicProductIds].join(",")}.`);
  const productFromApi = ownerProductValues.find((item) => Number(item.id) === adminProductId);
  assert.ok(productFromApi, "Admin framing fixture must map to a customer-visible product.");
  const customerCardSelector = `.customer-product-card:has(a[href="#/urun/${productFromApi.slug}"])`;
  const baselinePage = await browser.newPage();
  await configurePage(baselinePage);
  await baselinePage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await waitForStorefront(baselinePage, "/#/kategori/ev-yasam", customerCardSelector);
  const baselineStyle = await baselinePage.$eval(`${customerCardSelector} .customer-card-media-stage img.is-active`, (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  await captureElement(baselinePage, customerCardSelector, "01-PRODUCT-CARD-FRAMING-BEFORE.png", { padding: 20 }, { state: "same product before Admin framing", productId: adminProductId, baselineStyle });
  await baselinePage.close();
  const mediaButton = await adminPage.$(`[data-catalog-operation="media"][data-product-id="${adminProductId}"]`);
  assert.ok(mediaButton);
  await mediaButton.click();
  await adminPage.waitForSelector('[data-testid="catalog-media-dialog"] .catalog-card-framing', { visible: true, timeout });
  await adminPage.waitForFunction(() => {
    const image = document.querySelector('.catalog-card-framing__preview img');
    return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }, { timeout });
  const initialStatus = await adminPage.$eval('.catalog-card-framing [role="status"]', (node) => node.textContent);
  assert.match(initialStatus, /INITIAL_DEFAULT|RELOADED/u);
  await captureElement(adminPage, '[data-testid="catalog-media-dialog"] .modal-card', "02-PRODUCT-CARD-FRAMING-EDITOR.png", { padding: 10, maxHeight: 1100 }, { state: initialStatus.trim() });

  const adminRecorder = await startRecording(adminPage, "ADMIN-MAIN6Y-PRODUCT-CARD-FRAMING");
  await delay(900);
  const preview = await adminPage.$('.catalog-card-framing__preview');
  const previewBox = await preview.boundingBox();
  assert.ok(previewBox && Math.abs(previewBox.width / previewBox.height - 1) < .01);
  await adminPage.mouse.move(previewBox.x + previewBox.width * .5, previewBox.y + previewBox.height * .5);
  await adminPage.mouse.down();
  await adminPage.mouse.move(previewBox.x + previewBox.width * .68, previewBox.y + previewBox.height * .39, { steps: 12 });
  await adminPage.mouse.up();
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing [role="status"]')?.textContent.includes("DRAGGED"));
  await delay(900);
  await setRange(adminPage, '.catalog-card-framing__controls input[type="range"]:first-of-type', 1.55);
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing [role="status"]')?.textContent.includes("ZOOMED"));
  await delay(900);
  await adminPage.click('.catalog-card-framing__controls .secondary-button');
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing [role="status"]')?.textContent.includes("RESET"));
  await delay(900);
  await setRange(adminPage, '.catalog-card-framing__controls label:nth-of-type(1) input', 1.65);
  await delay(650);
  await setRange(adminPage, '.catalog-card-framing__controls label:nth-of-type(2) input', .35);
  await delay(650);
  await setRange(adminPage, '.catalog-card-framing__controls label:nth-of-type(3) input', .43);
  await delay(900);
  const draftStyle = await adminPage.$eval('.catalog-card-framing__preview img', (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  assert.equal(draftStyle.objectFit, "cover");
  assert.match(draftStyle.transform, /scale\(1\.65\)/u);
  await adminPage.click('.catalog-card-framing__controls .primary-button');
  await delay(1200);
  const afterSaveText = await adminPage.$eval('[data-testid="catalog-media-dialog"]', (node) => node.textContent.replace(/\s+/g, " ").trim());
  assert.match(afterSaveText, /Durum: SAVED/u, `Admin framing save did not converge: ${afterSaveText}`);
  assert.equal(diagnostics.adminPatchCount, 1);
  const savedStyle = await adminPage.$eval('.catalog-card-framing__preview img', (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  await adminPage.click('[data-testid="catalog-media-dialog"] .modal-header .icon-button');
  await adminPage.waitForSelector('[data-testid="catalog-media-dialog"]', { hidden: true, timeout });
  const refreshedRow = await adminPage.$('[data-testid="live-catalog"] tbody tr');
  const refreshedMediaButton = (await refreshedRow.$$("button"))[1];
  await refreshedMediaButton.click();
  await adminPage.waitForSelector('[data-testid="catalog-media-dialog"] .catalog-card-framing', { visible: true, timeout });
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing [role="status"]')?.textContent.includes("RELOADED"));
  const reloadedStyle = await adminPage.$eval('.catalog-card-framing__preview img', (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  assert.deepEqual(reloadedStyle, savedStyle);
  await delay(1100);
  await adminPage.addScriptTag({ content: axe.source });
  const adminAxeResult = await adminPage.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
  const adminAxeMaterial = adminAxeResult.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  uat.accessibility.ADMIN_FRAMING = {
    violations: adminAxeResult.violations.length,
    seriousCritical: adminAxeMaterial.length,
    material: adminAxeMaterial.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })) })),
  };
  assert.equal(adminAxeMaterial.length, 0, "Admin framing dialog must have zero serious/critical Axe findings.");
  await adminPage.click('[data-testid="catalog-media-dialog"] .modal-header .icon-button');
  await adminPage.waitForSelector('[data-testid="catalog-media-dialog"]', { hidden: true, timeout });
  await adminPage.waitForFunction((productId) => {
    const active = document.activeElement;
    return active?.matches?.(`[data-catalog-operation="media"][data-product-id="${productId}"]`);
  }, { timeout }, adminProductId);
  const returnedFocus = await adminPage.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), operation: document.activeElement?.dataset?.catalogOperation, productId: document.activeElement?.dataset?.productId }));
  await adminPage.goto(`${storefrontOrigin}/#/kategori/ev-yasam`, { waitUntil: "domcontentloaded", timeout });
  await adminPage.waitForSelector(customerCardSelector, { visible: true, timeout });
  await adminPage.$eval(customerCardSelector, (node) => node.scrollIntoView({ block: "center" }));
  await delay(1400);
  await adminPage.goto(`${storefrontOrigin}/#/urun/${productFromApi.slug}`, { waitUntil: "domcontentloaded", timeout });
  await adminPage.waitForSelector('.product-gallery img', { visible: true, timeout });
  await delay(1600);
  await adminRecorder.stop();
  uat.framing = { initialStatus: initialStatus.trim(), baselineStyle, draftStyle, savedStyle, reloadedStyle, squareRatio: previewBox.width / previewBox.height, returnedFocus, states: ["INITIAL_DEFAULT", "DRAGGED", "ZOOMED", "RESET", "SAVED", "RELOADED", "CUSTOMER_CARD", "PDP_ORIGINAL"] };

  const page = await browser.newPage();
  await configurePage(page);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await waitForStorefront(page, "/#/kategori/ev-yasam", `.customer-product-card a[href="#/urun/${productFromApi.slug}"]`);
  const customerStyle = await page.$eval(`${customerCardSelector} .customer-card-media-stage img.is-active`, (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  assert.deepEqual(customerStyle, savedStyle);
  await captureElement(page, customerCardSelector, "03-PRODUCT-CARD-FRAMING-AFTER.png", { padding: 20 }, { state: "saved framing reproduced by CustomerProductCard", productId: adminProductId });

  await waitForStorefront(page, `/#/urun/${productFromApi.slug}`, ".product-gallery img");
  const pdpImage = await page.$eval('.product-gallery img', (image) => ({ objectFit: getComputedStyle(image).objectFit, objectPosition: getComputedStyle(image).objectPosition, transform: getComputedStyle(image).transform, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, complete: image.complete }));
  assert.equal(pdpImage.complete, true);
  assert.equal(pdpImage.objectFit, "contain");
  assert.equal(pdpImage.transform, "none");
  await captureElement(page, ".product-gallery", "04-PDP-FULL-ORIGINAL-IMAGE.png", { padding: 18 }, { state: "PDP original media ignores card framing", pdpImage });
  await page.waitForSelector('.pdp-store-attribution a[href^="#/magaza/"]', { visible: true, timeout });
  const storeBlock = await page.$eval('.pdp-store-attribution', (node) => ({ text: node.textContent.replace(/\s+/g, " ").trim(), href: node.querySelector("a")?.getAttribute("href") }));
  assert.match(storeBlock.text, /Mağazaya Git/u);
  assert.equal(storeBlock.href, `#/magaza/${productFromApi.store.slug}`);
  await captureElement(page, ".pdp-store-attribution", "05-PDP-STORE-SECTION.png", { padding: 22 }, { state: storeBlock });
  const pdpUrl = page.url();
  await page.click('.pdp-store-attribution a');
  await page.waitForSelector('.public-store-products', { visible: true, timeout });
  assert.equal(new URL(page.url()).hash, `#/magaza/${productFromApi.store.slug}`);
  await capture(page, "06-PDP-STORE-NAVIGATION.png", { fullPage: true }, { state: "canonical public store opened from PDP" });
  await page.click(`.public-store-products a[href="#/urun/${productFromApi.slug}"]`);
  await page.waitForSelector('.pdp-store-attribution', { visible: true, timeout });
  await page.goBack({ waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector('.public-store-products', { visible: true, timeout });
  await page.goBack({ waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector('.pdp-store-attribution', { visible: true, timeout });
  assert.equal(page.url(), pdpUrl);

  const apiDetail = await fetch(`${storefrontOrigin}/api/products/${adminProductId}`).then((response) => response.json());
  const serializedDetail = JSON.stringify(apiDetail);
  const privateKeys = ["seller_stores", "legacy_store_id", "organization_id", "membership", "tenant", "owner_user_id", "audit"];
  const leakedPrivateKeys = privateKeys.filter((key) => serializedDetail.includes(`\"${key}\"`));
  assert.deepEqual(leakedPrivateKeys, []);
  uat.privacy = { leakedPrivateKeys, storeDto: apiDetail.store || apiDetail.product?.store || null };

  await waitForStorefront(page, "/#/kategori/ev-yasam", ".all-categories-button");
  await page.click('.all-categories-button');
  await page.waitForSelector('#category-drawer', { visible: true, timeout });
  const drawerWordmark = await page.$eval('#category-drawer .brand', (node) => {
    const nova = node.querySelector("span");
    const store = node.querySelector("strong");
    return { nova: nova?.textContent, store: store?.textContent, novaColor: getComputedStyle(nova).color, storeColor: getComputedStyle(store).color, overflow: node.scrollWidth - node.clientWidth };
  });
  assert.equal(drawerWordmark.nova, "Nova");
  assert.equal(drawerWordmark.store, "Store");
  assert.notEqual(drawerWordmark.novaColor, "rgb(255, 255, 255)");
  assert.ok(drawerWordmark.overflow <= 1);
  await captureElement(page, "#category-drawer", "07-DRAWER-WORDMARK-LIGHT-SURFACE.png", { padding: 0, maxHeight: 1000 }, { state: drawerWordmark });
  await page.keyboard.press("Escape");

  await waitForStorefront(page, "/#/kategori/ev-yasam", ".customer-product-card .product-badge.is-discount");
  const card = await page.$('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  assert.ok(card, "Deterministic multi-image owner card must be visible.");
  await card.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
  const geometry = await card.evaluate((node) => {
    const rect = (selector) => node.querySelector(selector)?.getBoundingClientRect();
    const overlap = (a, b) => a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
    const badge = rect(".product-badge.is-discount");
    const favorite = rect(".favorite-button");
    const compare = rect(".compare-button");
    const cart = rect(".card-add-button");
    const zones = rect(".customer-card-media-zones");
    return { discountFavoriteOverlap: overlap(badge, favorite), progressDiscountOverlap: overlap(zones, badge), progressFavoriteOverlap: overlap(zones, favorite), compareCartOverlap: overlap(compare, cart), height: node.getBoundingClientRect().height };
  });
  assert.equal(geometry.discountFavoriteOverlap, 0);
  assert.equal(geometry.progressDiscountOverlap, 0);
  assert.equal(geometry.progressFavoriteOverlap, 0);
  assert.equal(geometry.compareCartOverlap, 0);
  await captureElement(page, '.customer-product-card:has(.product-badge.is-discount)', "08-DISCOUNT-RIBBON.png", { padding: 18 }, { state: "professional CSS ribbon", geometry });
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "09-FAVORITE-DEFAULT.png", { padding: 18 }, { state: "heart only default" });
  const favoriteButton = await card.$('.favorite-button');
  const favoriteBox = await favoriteButton.boundingBox();
  assert.ok(favoriteBox.width >= 44 && favoriteBox.height >= 44);
  await page.mouse.move(favoriteBox.x + favoriteBox.width / 2, favoriteBox.y + favoriteBox.height / 2);
  await delay(120);
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "10-FAVORITE-HOVER.png", { padding: 18 }, { state: "subtle heart hover" });
  await favoriteButton.click();
  await page.waitForFunction(() => document.querySelector('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"]) .favorite-button')?.getAttribute("aria-pressed") === "true");
  const activeHeart = await favoriteButton.evaluate((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, target: [node.getBoundingClientRect().width, node.getBoundingClientRect().height], confirmed: node.classList.contains("is-confirmed") }));
  assert.match(activeHeart.color, /rgb\((?:220, 38, 38|185, 28, 28)\)/u);
  assert.equal(activeHeart.confirmed, true);
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "11-FAVORITE-ACTIVE-RED.png", { padding: 18 }, { state: activeHeart });

  const cartButton = await card.$('.card-add-button');
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "12-CART-DEFAULT.png", { padding: 18 }, { state: "cart default" });
  cartButton.click();
  await page.waitForFunction(() => document.querySelector('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"]) .card-add-button')?.classList.contains("is-pressed"));
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "13-CART-PRESSED.png", { padding: 18 }, { state: "restrained press" });
  await page.waitForFunction(() => document.querySelector('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"]) .card-add-button')?.classList.contains("is-success"));
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "14-CART-SUCCESS.png", { padding: 18 }, { state: "success after accepted local cart mutation" });

  await waitForStorefront(page, "/#/yardim", ".help-hero .lucide-life-buoy");
  const lifeBuoy = await page.$eval('.help-hero .lucide-life-buoy', (node) => ({ width: getComputedStyle(node).width, height: getComputedStyle(node).height, ariaHidden: node.closest('.nova-service-icon')?.getAttribute("aria-hidden") }));
  assert.equal(lifeBuoy.ariaHidden, "true");
  await captureElement(page, ".help-hero", "15-HELP-CENTER-LIFEBUOY.png", { padding: 20 }, { state: lifeBuoy });

  await waitForStorefront(page, "/#/kategori/ev-yasam", '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  const currentCard = await page.$('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  await currentCard.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "16-COMPARE-DEFAULT.png", { padding: 18 }, { state: "compare default" });
  await currentCard.$eval('.compare-button', (button) => button.click());
  await page.waitForFunction(() => document.querySelector('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"]) .compare-button')?.classList.contains("is-confirmed"));
  await delay(100);
  const compareTransforms = await currentCard.$eval('.compare-button', (button) => [...button.querySelectorAll("svg > *")].map((node) => {
    const transform = getComputedStyle(node).transform;
    return { transform, translateX: transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41 };
  }));
  assert.equal(compareTransforms.length, 4);
  assert.ok(compareTransforms.slice(0, 2).every((value) => value.translateX < 0), `Both left arrow paths must move left: ${JSON.stringify(compareTransforms)}`);
  assert.ok(compareTransforms.slice(2, 4).every((value) => value.translateX > 0), `Both right arrow paths must move right: ${JSON.stringify(compareTransforms)}`);
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "17-COMPARE-PRESSED.png", { padding: 18 }, { state: { compareTransforms } });

  const deliveryCounts = await page.evaluate(() => ({ calculated: document.querySelectorAll('.customer-product-card .delivery-line').length, genericText: document.body.textContent.includes("Teslimat bilgisi ürün detayında") ? 1 : 0 }));
  assert.equal(deliveryCounts.calculated, 0);
  assert.equal(deliveryCounts.genericText, 0);
  await captureElement(page, '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', "19-DELIVERY-NOT-AVAILABLE-NO-ROW.png", { padding: 18 }, { state: deliveryCounts });
  const deliveryEvidencePage = await browser.newPage();
  await deliveryEvidencePage.setViewport({ width: 1200, height: 760, deviceScaleFactor: 1 });
  const cardEvidence = fs.readFileSync(path.join(evidenceDirectory, "19-DELIVERY-NOT-AVAILABLE-NO-ROW.png")).toString("base64");
  await deliveryEvidencePage.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>body{margin:0;padding:36px;background:#eef3f6;color:#102a43;font:18px Inter,"Segoe UI",sans-serif}.panel{max-width:1100px;margin:auto;padding:24px;background:#fff;border:1px solid #d8e1e8;border-radius:18px;display:grid;grid-template-columns:1fr 1.2fr;gap:28px;align-items:center}.status{display:grid;gap:12px}.count{font-size:56px;font-weight:800;color:#c84f00}h1{font-size:30px;margin:0}p{line-height:1.55;color:#566b7e}img{width:100%;max-height:610px;object-fit:contain}</style></head><body><main class="panel"><section class="status"><span>AUTHORITATIVE CALCULATED DELIVERY FIXTURE COUNT</span><strong class="count">0</strong><h1>Hesaplanmış teslimat verisi yok</h1><p>Main-6Y yerel kabul verisinde yetkili hesaplanmış teslimat alanı bulunmadığı için müşteri kartı teslimat satırı üretmedi. Bu kanıt sahte bir tarih veya tahmin göstermediğini belgeler.</p></section><img src="data:image/png;base64,${cardEvidence}" alt="Teslimat satırı olmayan gerçek müşteri ürün kartı"></main></body></html>`, { waitUntil: "load" });
  await capture(deliveryEvidencePage, "18-DELIVERY-CALCULATED.png", { fullPage: true }, { state: "NOT_AVAILABLE_BY_CONTRACT", calculatedCount: 0 });
  await deliveryEvidencePage.close();
  uat.delivery = deliveryCounts;

  await waitForStorefront(page, `/#/magaza/${productFromApi.store.slug}`, ".public-store-products .customer-product-card");
  await capture(page, "20-PUBLIC-STORE-CARDS.png", { fullPage: true }, { state: "canonical shared product card on public store" });

  const routeCases = [
    ["HOME", "/#/", "main"],
    ["CATEGORY", "/#/kategori/ev-yasam", ".customer-product-card"],
    ["SEARCH", "/#/arama?q=owner", "main"],
    ["COLLECTION", "/#/koleksiyon/firsatlar", "main"],
    ["PUBLIC_STORE", `/#/magaza/${productFromApi.store.slug}`, ".public-store-products"],
    ["PDP", "/#/urun/owner-hover-dort-gorsel", ".product-summary"],
  ];
  for (const [label, route, selector] of routeCases) {
    await waitForStorefront(page, route, selector);
    const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cards: document.querySelectorAll(".customer-product-card").length, main: Boolean(document.querySelector("main")) }));
    assert.ok(metrics.overflow <= 1, `${label} route must not overflow.`);
    assert.equal(metrics.main, true);
    uat.routes[label] = { route, ...metrics };
  }
  assert.ok(uat.routes.PDP.cards > 0, "PDP recommendations must render CustomerProductCard.");

  for (const width of [1440, 430, 390, 360, 320]) {
    const mobile = width <= 430;
    const drawerTrigger = mobile ? ".mobile-menu-trigger" : ".all-categories-button";
    await page.setViewport({ width, height: mobile ? 844 : 1000, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await waitForStorefront(page, "/#/kategori/ev-yasam", drawerTrigger);
    await page.click(drawerTrigger);
    await page.waitForSelector('#category-drawer', { visible: true, timeout });
    const metrics = await page.$eval('#category-drawer', (drawer) => ({ overflow: drawer.scrollWidth - drawer.clientWidth, width: drawer.getBoundingClientRect().width, viewportWidth: innerWidth, novaVisible: Boolean(drawer.querySelector('.brand span')?.getClientRects().length), storeVisible: Boolean(drawer.querySelector('.brand strong')?.getClientRects().length) }));
    assert.ok(metrics.overflow <= 1);
    assert.equal(metrics.novaVisible, true);
    assert.equal(metrics.storeVisible, true);
    uat.drawer[width] = metrics;
    await page.keyboard.press("Escape");
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await waitForStorefront(page, "/#/kategori/ev-yasam", '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  const mobileStage = await page.$('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"]) .customer-card-media-stage');
  await mobileStage.evaluate((node) => node.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerType: "touch" })));
  await delay(1700);
  const mobileActiveMedia = await page.$eval('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"]) .customer-card-media-stage', (node) => Number(node.dataset.activeMedia));
  assert.equal(mobileActiveMedia, 0);

  const hoverPage = await browser.newPage();
  await hoverPage.evaluateOnNewDocument(() => {
    const activeIntervals = new Set();
    const originalSetInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    window.setInterval = (handler, timeout, ...args) => {
      const id = originalSetInterval(handler, timeout, ...args);
      activeIntervals.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      activeIntervals.delete(id);
      return originalClearInterval(id);
    };
    Object.defineProperty(window, "__main6yActiveIntervalCount", { value: () => activeIntervals.size });
  });
  await configurePage(hoverPage);
  await hoverPage.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await waitForStorefront(hoverPage, "/#/kategori/ev-yasam", '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  const hoverCard = await hoverPage.$('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  await hoverCard.evaluate((node) => node.scrollIntoView({ block: "center" }));
  const hoverStage = await hoverCard.$('.customer-card-media-stage');
  const beforeHover = await hoverStage.evaluate((node) => ({ active: Number(node.dataset.activeMedia), images: node.querySelectorAll("img").length }));
  assert.deepEqual(beforeHover, { active: 0, images: 1 });
  const intervalBaseline = await hoverPage.evaluate(() => window.__main6yActiveIntervalCount());
  const siblingMediaBefore = await hoverPage.$$eval('.customer-product-card:not(:has(a[href="#/urun/owner-hover-dort-gorsel"])) .customer-card-media-stage', (nodes) => nodes.map((node) => Number(node.dataset.activeMedia)));
  const fineHoverCapability = await hoverPage.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  assert.equal(fineHoverCapability, true, "Google Chrome desktop page must expose fine pointer hover capability.");
  const hoverBox = await hoverStage.boundingBox();
  const hoverRecorder = await startRecording(hoverPage, "CUSTOMER-MAIN6Y-HOVER-AUTOPLAY-SLIDESHOW");
  await hoverPage.mouse.move(20, 80);
  await delay(700);
  await hoverStage.hover();
  await delay(520);
  const hoverSequence = [await hoverStage.evaluate((node) => Number(node.dataset.activeMedia))];
  for (let index = 0; index < 3; index += 1) {
    await delay(1080);
    hoverSequence.push(await hoverStage.evaluate((node) => Number(node.dataset.activeMedia)));
  }
  assert.ok(new Set(hoverSequence).size >= 3, `Autoplay must cycle multiple media: ${hoverSequence.join(",")}`);
  assert.equal(await hoverStage.evaluate((node) => node.querySelectorAll("img").length), 4);
  await hoverPage.mouse.move(10, 10, { steps: 14 });
  await delay(600);
  assert.equal(await hoverStage.evaluate((node) => Number(node.dataset.activeMedia)), 0);
  const intervalAfterReset = await hoverPage.evaluate(() => window.__main6yActiveIntervalCount());
  const activeHoverTimerLeakCount = Math.max(0, intervalAfterReset - intervalBaseline);
  const siblingMediaAfter = await hoverPage.$$eval('.customer-product-card:not(:has(a[href="#/urun/owner-hover-dort-gorsel"])) .customer-card-media-stage', (nodes) => nodes.map((node) => Number(node.dataset.activeMedia)));
  const crossCardMediaStateLeakCount = siblingMediaAfter.filter((value, index) => value !== siblingMediaBefore[index]).length;
  assert.equal(activeHoverTimerLeakCount, 0);
  assert.equal(crossCardMediaStateLeakCount, 0);
  await hoverRecorder.stop();
  await hoverPage.close();

  const motionPage = await browser.newPage();
  await configurePage(motionPage);
  await motionPage.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await waitForStorefront(motionPage, "/#/kategori/ev-yasam", '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  const motionCard = await motionPage.$('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  await motionCard.evaluate((node) => node.scrollIntoView({ block: "center" }));
  const motionRecorder = await startRecording(motionPage, "CUSTOMER-MAIN6Y-CARD-MICROINTERACTIONS");
  await delay(650);
  const motionFavorite = await motionCard.$('.favorite-button');
  const motionFavoriteBox = await motionFavorite.boundingBox();
  await motionPage.mouse.move(motionFavoriteBox.x + motionFavoriteBox.width / 2, motionFavoriteBox.y + motionFavoriteBox.height / 2, { steps: 12 });
  await delay(500);
  await motionFavorite.click();
  await delay(900);
  await motionCard.$eval('.card-add-button', (button) => button.click());
  await delay(1050);
  await motionCard.$eval('.compare-button', (button) => button.click());
  await delay(1000);
  await motionRecorder.stop();
  await motionPage.close();

  const accessibilityPage = await browser.newPage();
  await configurePage(accessibilityPage);
  await accessibilityPage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const axeRoutes = [["CATEGORY", "/#/kategori/ev-yasam", ".customer-product-card"], ["PDP", `/#/urun/${productFromApi.slug}`, ".pdp-store-attribution"], ["PUBLIC_STORE", `/#/magaza/${productFromApi.store.slug}`, ".public-store-products"], ["HELP", "/#/yardim", ".help-hero"]];
  for (const [label, route, selector] of axeRoutes) {
    await waitForStorefront(accessibilityPage, route, selector);
    await accessibilityPage.addScriptTag({ content: axe.source });
    const result = await accessibilityPage.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
    const material = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
    uat.accessibility[label] = {
      violations: result.violations.length,
      seriousCritical: material.length,
      material: material.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })) })),
    };
  }

  const reducedPage = await browser.newPage();
  await configurePage(reducedPage);
  await reducedPage.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await reducedPage.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await waitForStorefront(reducedPage, "/#/kategori/ev-yasam", '.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  const reduced = await reducedPage.$eval('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])', (node) => ({ imageTransition: getComputedStyle(node.querySelector('.customer-card-media-stage img')).transitionDuration, favoriteAnimation: getComputedStyle(node.querySelector('.favorite-button svg')).animationName, compareTransforms: [...node.querySelectorAll('.compare-button svg > *')].map((item) => getComputedStyle(item).transform) }));
  await reducedPage.close();
  assert.ok(reduced.compareTransforms.every((transform) => transform === "none"));
  uat.interactions = { activeHeart, geometry, compareTransforms, fineHoverCapability, hoverSequence, mobileActiveMedia, reducedMotion: reduced, activeHoverTimerLeakCount, crossCardMediaStateLeakCount };
  const axeMaterialCount = Object.values(uat.accessibility).reduce((sum, value) => sum + value.seriousCritical, 0);
  if (axeMaterialCount) console.log("MAIN6Y_AXE_MATERIAL", JSON.stringify(uat.accessibility));
  assert.equal(axeMaterialCount, 0, "Affected Main6Y routes must have zero serious/critical Axe findings.");

  const requiredScreens = [
    ["01-PRODUCT-CARD-FRAMING-BEFORE.png", "Çerçeveleme öncesi"],
    ["02-PRODUCT-CARD-FRAMING-EDITOR.png", "Admin 1:1 kadraj editörü"],
    ["03-PRODUCT-CARD-FRAMING-AFTER.png", "Kaydedilmiş müşteri kartı"],
    ["04-PDP-FULL-ORIGINAL-IMAGE.png", "PDP tam orijinal"],
    ["05-PDP-STORE-SECTION.png", "PDP mağaza bölümü"],
    ["06-PDP-STORE-NAVIGATION.png", "Kanonik mağaza navigasyonu"],
    ["07-DRAWER-WORDMARK-LIGHT-SURFACE.png", "Açık yüzey wordmark"],
    ["08-DISCOUNT-RIBBON.png", "İndirim ribbon"],
    ["09-FAVORITE-DEFAULT.png", "Favori varsayılan"],
    ["10-FAVORITE-HOVER.png", "Favori hover"],
    ["11-FAVORITE-ACTIVE-RED.png", "Favori aktif kırmızı"],
    ["12-CART-DEFAULT.png", "Sepet varsayılan"],
    ["13-CART-PRESSED.png", "Sepet basılı"],
    ["14-CART-SUCCESS.png", "Sepet başarı"],
    ["15-HELP-CENTER-LIFEBUOY.png", "Help Center LifeBuoy"],
    ["16-COMPARE-DEFAULT.png", "Karşılaştır varsayılan"],
    ["17-COMPARE-PRESSED.png", "Karşılaştır yönlü hareket"],
    ["18-DELIVERY-CALCULATED.png", "Hesaplanmış teslimat: fixture yok"],
    ["19-DELIVERY-NOT-AVAILABLE-NO-ROW.png", "Teslimat yoksa satır yok"],
    ["20-PUBLIC-STORE-CARDS.png", "Public store kartları"],
  ];
  for (const [fileName] of requiredScreens) assert.ok(fs.existsSync(path.join(evidenceDirectory, fileName)), `${fileName} is required.`);
  await contactSheet(browser, requiredScreens.map(([fileName, label]) => ({ fileName, label })));

  assert.ok([...diagnostics.externalOrigins].every((value) => value === "https://res.cloudinary.com"), `Unexpected external origins: ${[...diagnostics.externalOrigins].join(",")}`);
  assert.deepEqual(diagnostics.nonLoopbackMutations, []);
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.responseErrors, []);

  const output = {
    browser: { product: "Google Chrome", executable: chromePath, userAgent: await page.browser().userAgent() },
    liveProductSampleCount: ownerProductValues.length,
    framingProduct: { id: adminProductId, slug: productFromApi.slug, store: productFromApi.store },
    diagnostics: { ...diagnostics, externalOrigins: [...diagnostics.externalOrigins] },
    uat,
    artifacts,
  };
  fs.writeFileSync(path.join(evidenceDirectory, "main6y-browser-uat.json"), `${JSON.stringify(output, null, 2)}\n`);
  record("main6y-browser-uat.json", { state: "real Chrome UAT machine-readable result" });
  console.log("MAIN6Y_REAL_GOOGLE_CHROME_UAT=PASS");
  console.log(`LIVE_PUBLIC_PRODUCT_SAMPLE_COUNT=${ownerProductValues.length}`);
  console.log(`ADMIN_PATCH_COUNT=${diagnostics.adminPatchCount}`);
  console.log(`AXE_SERIOUS_CRITICAL=${Object.values(uat.accessibility).reduce((sum, value) => sum + value.seriousCritical, 0)}`);
  console.log(`HOVER_SEQUENCE=${uat.interactions.hoverSequence.join(",")}`);
  console.log(`EVIDENCE_DIRECTORY=${evidenceDirectory}`);
} catch (error) {
  console.error("MAIN6Y_UAT_DIAGNOSTICS", JSON.stringify({ ...diagnostics, externalOrigins: [...diagnostics.externalOrigins] }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
}
