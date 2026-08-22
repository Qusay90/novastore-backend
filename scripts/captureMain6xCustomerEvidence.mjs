import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = new URL(process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5273").origin;
const baselineOrigin = new URL(process.env.NOVASTORE_MAIN6X_BASELINE_ORIGIN || "http://127.0.0.1:5276").origin;
const evidenceDirectory = path.resolve(process.env.NOVASTORE_MAIN6X_EVIDENCE_DIR || "");
const requireFromStorefront = createRequire(path.join(root, "storefront-commerce-pro", "package.json"));
const puppeteer = requireFromStorefront("puppeteer-core");
const axe = requireFromStorefront("axe-core");
const timeout = 35_000;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(process.env.NOVASTORE_MAIN6X_EVIDENCE_DIR, "NOVASTORE_MAIN6X_EVIDENCE_DIR is required.");
assert.ok(path.relative(root, evidenceDirectory).startsWith(".."), "Main6X evidence must remain outside Git.");
for (const candidate of [origin, baselineOrigin]) {
  const url = new URL(candidate);
  assert.equal(url.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
}
fs.mkdirSync(evidenceDirectory, { recursive: true });

const findChromeExecutable = () => {
  const candidates = [
    process.env.NOVASTORE_CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executable, "Google Chrome is required for Main6X browser UAT.");
  return executable;
};

const records = [];
const record = (fileName, metadata = {}) => {
  const bytes = fs.readFileSync(path.join(evidenceDirectory, fileName));
  const value = { fileName, sha256: sha256(bytes), bytes: bytes.length, ...metadata };
  const index = records.findIndex((item) => item.fileName === fileName);
  if (index >= 0) records.splice(index, 1, value);
  else records.push(value);
  return value;
};

const capture = async (page, fileName, metadata = {}, options = {}) => {
  await page.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png", ...options });
  return record(fileName, { url: page.url(), viewport: page.viewport(), ...metadata });
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const renderContactSheet = async (browser, { fileName, title, subtitle, entries, columns = 2, imageHeight = 460, metadata = {} }) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1100, deviceScaleFactor: 1 });
  const figures = entries.map((entry) => {
    const bytes = entry.buffer || fs.readFileSync(path.join(evidenceDirectory, entry.fileName));
    return `<figure><img src="data:image/png;base64,${bytes.toString("base64")}" alt=""><figcaption><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.caption || "")}</span></figcaption></figure>`;
  }).join("");
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:40px;background:#eef2f5;color:#102a43;font-family:Inter,"Segoe UI",sans-serif}header{margin-bottom:24px}h1{margin:0 0 8px;font-size:34px;letter-spacing:-.025em}p{margin:0;color:#526579;font-size:15px}main{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:20px}figure{margin:0;padding:12px;border:1px solid #d3dce5;border-radius:16px;background:#fff;box-shadow:0 12px 30px rgba(16,42,67,.08)}img{display:block;width:100%;height:${imageHeight}px;object-fit:contain;object-position:top;background:#f8fafc;border-radius:10px}figcaption{display:grid;gap:4px;padding:10px 3px 2px}strong{font-size:15px}span{color:#62758a;font-size:12px;overflow-wrap:anywhere}</style></head><body><header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></header><main>${figures}</main></body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png", fullPage: true });
  await page.close();
  return record(fileName, metadata);
};

const diagnostics = {
  requests: 0,
  externalRequests: [],
  nonGetRequests: [],
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  responseErrors: [],
};

const configureRuntimePage = async (page) => {
  const allowedOrigins = new Set([origin, baselineOrigin]);
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") diagnostics.consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    if (!failure.includes("ERR_ABORTED")) diagnostics.requestFailures.push(`${request.method()} ${request.url()} :: ${failure}`);
  });
  page.on("response", (response) => { if (response.status() >= 500) diagnostics.responseErrors.push(`${response.status()} ${response.url()}`); });
  page.on("request", (request) => {
    diagnostics.requests += 1;
    const method = request.method().toUpperCase();
    if (!["GET", "HEAD"].includes(method)) {
      diagnostics.nonGetRequests.push(`${method} ${request.url()}`);
      return request.abort("blockedbyclient").catch(() => {});
    }
    const url = request.url();
    if (/^(?:data|blob|about):/i.test(url)) return request.continue().catch(() => {});
    let parsed;
    try { parsed = new URL(url); } catch { parsed = null; }
    if (!parsed || !allowedOrigins.has(parsed.origin)) {
      diagnostics.externalRequests.push(`${method} ${url}`);
      return request.abort("blockedbyclient").catch(() => {});
    }
    return request.continue().catch(() => {});
  });
};

const gotoCards = async (page, targetOrigin, route = "/#/kategori/elektronik") => {
  const response = await page.goto(`${targetOrigin}${route}`, { waitUntil: "domcontentloaded", timeout });
  if (response) assert.ok(response.status() < 400);
  await page.waitForSelector(".customer-product-card, .product-card", { visible: true, timeout });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.querySelectorAll(".product-card__media img")].every((image) => image.complete && image.naturalWidth > 0), { timeout });
  await delay(180);
};

const scrollCardsIntoView = (page) => page.evaluate(() => {
  const mobile = innerWidth <= 430;
  document.querySelector(mobile ? ".plp-results .product-grid, .product-grid, .home-products" : ".plp-results, .product-grid, .home-products")?.scrollIntoView({ block: "start" });
  window.scrollBy(0, mobile ? -160 : -180);
});

const readAlignment = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll(".customer-product-card")].slice(0, 4);
  const rect = (node) => node?.getBoundingClientRect();
  const values = cards.map((card) => {
    const cardRect = rect(card);
    const media = card.querySelector(".customer-card-media-stage");
    const body = card.querySelector(".product-card__body");
    const title = card.querySelector("h3");
    const price = card.querySelector(".product-price-row");
    const actions = card.querySelector(".product-card__actions");
    const image = card.querySelector(".customer-card-media-stage img.is-active");
    const mediaRect = rect(media);
    return {
      width: Math.round(cardRect.width * 10) / 10,
      cardTop: Math.round(cardRect.top),
      cardBottom: Math.round(cardRect.bottom * 10) / 10,
      mediaRatio: Math.round((mediaRect.width / mediaRect.height) * 1000) / 1000,
      bodyLeft: Math.round(rect(body).left),
      contentLeft: Math.round(rect(card.querySelector(".product-brand")).left),
      titleLeft: Math.round(rect(title).left),
      priceLeft: Math.round(rect(price).left),
      actionsLeft: Math.round(rect(actions).left),
      actionBottom: Math.round(rect(actions).bottom * 10) / 10,
      objectFit: image ? getComputedStyle(image).objectFit : null,
      imageLoaded: Boolean(image?.complete && image?.naturalWidth > 0),
    };
  });
  const rowSpreads = [...new Set(values.map((item) => item.cardTop))].map((top) => {
    const row = values.filter((item) => Math.abs(item.cardTop - top) <= 1);
    return row.length > 1 ? Math.max(...row.map((item) => item.actionBottom)) - Math.min(...row.map((item) => item.actionBottom)) : 0;
  });
  return {
    viewport: { width: innerWidth, height: innerHeight },
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cards: values,
    cardBottomSpread: values.length ? Math.max(...values.map((item) => item.cardBottom)) - Math.min(...values.map((item) => item.cardBottom)) : null,
    actionBottomSpread: values.length ? Math.max(...values.map((item) => item.actionBottom)) - Math.min(...values.map((item) => item.actionBottom)) : null,
    maxRowActionBottomSpread: rowSpreads.length ? Math.max(...rowSpreads) : 0,
  };
});

const cardForIphone = async (page) => {
  const handles = await page.$$(".customer-product-card");
  for (const handle of handles) {
    const matches = await handle.evaluate((node) => Boolean(node.querySelector('a[href="#/urun/apple-iphone-15-128-gb"]')));
    if (matches) return handle;
  }
  throw new Error("Main6X multi-image iPhone card was not found.");
};

const required = [
  "CUSTOMER-CARD-LIVE-DESKTOP-1440.png",
  "CUSTOMER-CARD-LIVE-MOBILE-390.png",
  "CUSTOMER-CARD-LIVE-MOBILE-320.png",
  "CUSTOMER-CARD-ALIGNMENT-BEFORE-AFTER.png",
  "CUSTOMER-CARD-MULTI-IMAGE-HOVER-CONTACT-SHEET.png",
  "CUSTOMER-LUCIDE-ICON-SYSTEM-CONTACT-SHEET.png",
  "CUSTOMER-LUCIDE-ICON-HOVER-STATES.png",
  "CUSTOMER-DISCOUNT-HIERARCHY-CONTACT-SHEET.png",
  "CUSTOMER-MAIN6X-OWNER-CONTACT-SHEET.png",
];

const browserDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "novastore-main6x-browser-"));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: "new",
    userDataDir: browserDirectory,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync", "--disable-default-apps"],
  });

  const baselinePage = await browser.newPage();
  await configureRuntimePage(baselinePage);
  await baselinePage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await gotoCards(baselinePage, baselineOrigin);
  await scrollCardsIntoView(baselinePage);
  await delay(100);
  const baselineBuffer = Buffer.from(await baselinePage.screenshot({ type: "png" }));
  await baselinePage.close();

  const page = await browser.newPage();
  await configureRuntimePage(page);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await gotoCards(page, origin);
  await scrollCardsIntoView(page);
  await delay(100);
  await capture(page, "CUSTOMER-CARD-LIVE-DESKTOP-1440.png", { state: "category cards", width: 1440 });
  const currentDesktopBuffer = fs.readFileSync(path.join(evidenceDirectory, "CUSTOMER-CARD-LIVE-DESKTOP-1440.png"));

  await renderContactSheet(browser, {
    fileName: "CUSTOMER-CARD-ALIGNMENT-BEFORE-AFTER.png",
    title: "Ürün kartı hizalama · 6W / 6X",
    subtitle: "Aynı rota, 1440 px, resmî yerel runtime; 6X ortak kartta medya–içerik–fiyat–CTA ekseni",
    entries: [
      { label: "Önce · kabul edilmiş 6W", caption: "dağınık iç eksenler ve eski kart geometrisi", buffer: baselineBuffer },
      { label: "Sonra · Main6X", caption: "tek ortak kart, sabit iç ritim ve CTA tabanı", buffer: currentDesktopBuffer },
    ],
    metadata: { baselineOrigin, origin },
  });

  const responsive = [];
  for (const width of [1440, 1280, 1024, 768, 430, 390, 375, 360, 320]) {
    const mobile = width <= 430;
    await page.setViewport({ width, height: mobile ? 844 : 1000, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.reload({ waitUntil: "domcontentloaded", timeout });
    await page.waitForSelector(".customer-product-card", { visible: true, timeout });
    await scrollCardsIntoView(page);
    await delay(90);
    const measurements = await readAlignment(page);
    assert.ok(measurements.overflow <= 1, `${width}px must not overflow.`);
    measurements.cards.forEach((card) => {
      assert.ok(Math.abs(card.mediaRatio - 1) <= 0.01, `${width}px media stage must remain square.`);
      assert.equal(card.objectFit, "contain");
      assert.equal(card.imageLoaded, true);
      assert.ok(Math.abs(card.contentLeft - card.titleLeft) <= 1);
      assert.ok(Math.abs(card.contentLeft - card.priceLeft) <= 1);
      assert.ok(Math.abs(card.contentLeft - card.actionsLeft) <= 1);
    });
    if (measurements.cards.length > 1) assert.ok(measurements.maxRowActionBottomSpread <= 1.5, `${width}px same-row CTA bottoms must align.`);
    responsive.push(measurements);
    if (width === 390) await capture(page, "CUSTOMER-CARD-LIVE-MOBILE-390.png", { state: "category cards", width });
    if (width === 320) await capture(page, "CUSTOMER-CARD-LIVE-MOBILE-320.png", { state: "category cards", width });
  }

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/#/`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".customer-product-card", { visible: true, timeout });
  await page.evaluate(() => document.fonts.ready);
  const iphoneCard = await cardForIphone(page);
  await iphoneCard.evaluate((node) => { node.scrollIntoView({ block: "center" }); window.scrollBy(0, -90); });
  const initialCard = Buffer.from(await iphoneCard.screenshot({ type: "png" }));
  const initialGeometry = await iphoneCard.evaluate((node) => {
    const stage = node.querySelector(".customer-card-media-stage");
    const rect = node.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return { card: [rect.x, rect.y, rect.width, rect.height], stage: [stageRect.x, stageRect.y, stageRect.width, stageRect.height], hash: location.hash, imageCount: stage.querySelectorAll(".customer-card-media-zones i").length };
  });
  assert.ok(initialGeometry.imageCount >= 3);
  const hoverFrames = [];
  for (const [label, fraction, expected] of [["Sol bölge", 0.12, 0], ["Orta bölge", 0.5, 2], ["Sağ bölge", 0.88, 3]]) {
    const box = await iphoneCard.$eval(".customer-card-media-stage", (node) => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; });
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height * 0.5);
    await delay(110);
    const state = await iphoneCard.$eval(".customer-card-media-stage", (node) => ({ active: Number(node.dataset.activeMedia), cue: getComputedStyle(node.querySelector(".customer-card-media-cue")).opacity, loaded: [...node.querySelectorAll("img")].every((image) => image.complete && image.naturalWidth > 0), hash: location.hash }));
    assert.equal(state.active, expected);
    assert.equal(state.loaded, true);
    assert.equal(state.hash, initialGeometry.hash);
    assert.ok(Number(state.cue) > 0);
    hoverFrames.push({ label, caption: `aktif medya ${state.active + 1}/${initialGeometry.imageCount}`, buffer: Buffer.from(await iphoneCard.screenshot({ type: "png" })) });
  }
  const finalGeometry = await iphoneCard.evaluate((node) => { const rect = node.getBoundingClientRect(); const stage = node.querySelector(".customer-card-media-stage").getBoundingClientRect(); return { card: [rect.x, rect.y, rect.width, rect.height], stage: [stage.x, stage.y, stage.width, stage.height] }; });
  for (const key of ["card", "stage"]) {
    assert.ok(Math.abs(finalGeometry[key][0] - initialGeometry[key][0]) <= 0.5);
    assert.ok(Math.abs(finalGeometry[key][1] - initialGeometry[key][1]) <= 4);
    assert.ok(Math.abs(finalGeometry[key][2] - initialGeometry[key][2]) <= 0.5);
    assert.ok(Math.abs(finalGeometry[key][3] - initialGeometry[key][3]) <= 0.5);
  }
  await page.mouse.move(2, 2);
  await delay(80);
  assert.equal(await iphoneCard.$eval(".customer-card-media-stage", (node) => Number(node.dataset.activeMedia)), 0);
  await renderContactSheet(browser, {
    fileName: "CUSTOMER-CARD-MULTI-IMAGE-HOVER-CONTACT-SHEET.png",
    title: "Çoklu görsel yatay hover bölgeleri",
    subtitle: `${initialGeometry.imageCount} medya · işaretçi niyeti sonrası sınırlı ön yükleme · tıklama/navigasyon yok · geometri sabit · ayrılınca kapak sıfırlanıyor`,
    entries: [{ label: "Başlangıç / kapak", caption: "aktif medya 1", buffer: initialCard }, ...hoverFrames],
    metadata: { imageCount: initialGeometry.imageCount, initialGeometry, finalGeometry },
  });

  const desktopDiscount = Buffer.from(await iphoneCard.screenshot({ type: "png" }));
  const discountStyles = await iphoneCard.evaluate((node) => {
    const read = (selector) => { const element = node.querySelector(selector); const style = getComputedStyle(element); return { text: element.textContent.trim(), fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, backgroundColor: style.backgroundColor }; };
    return { badge: read(".product-badge.is-discount"), oldPrice: read(".price-block del"), percent: read(".price-block b"), currentPrice: read(".price-block strong") };
  });
  assert.ok(Number.parseFloat(discountStyles.currentPrice.fontSize) > Number.parseFloat(discountStyles.oldPrice.fontSize));
  assert.ok(Number(discountStyles.currentPrice.fontWeight) >= 700);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".customer-product-card", { visible: true, timeout });
  const mobileIphone = await cardForIphone(page);
  await mobileIphone.evaluate((node) => { node.scrollIntoView({ block: "center" }); window.scrollBy(0, -70); });
  const mobileState = await mobileIphone.$eval(".customer-card-media-stage", (node) => ({ active: Number(node.dataset.activeMedia), cueDisplay: getComputedStyle(node.querySelector(".customer-card-media-cue")).display, zonesDisplay: getComputedStyle(node.querySelector(".customer-card-media-zones")).display }));
  assert.deepEqual(mobileState, { active: 0, cueDisplay: "none", zonesDisplay: "none" });
  const mobileDiscount = Buffer.from(await mobileIphone.screenshot({ type: "png" }));
  await renderContactSheet(browser, {
    fileName: "CUSTOMER-DISCOUNT-HIERARCHY-CONTACT-SHEET.png",
    title: "İndirim hiyerarşisi",
    subtitle: `${discountStyles.badge.text} · eski fiyat + yüzde ikincil · güncel fiyat baskın`,
    entries: [
      { label: "Masaüstü", caption: `${discountStyles.currentPrice.text} baskın güncel fiyat`, buffer: desktopDiscount },
      { label: "Mobil", caption: "aynı semantik hiyerarşi, taşma yok", buffer: mobileDiscount },
    ],
    metadata: { styles: discountStyles, mobileState },
  });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await gotoCards(page, origin);
  const cardGridBuffer = Buffer.from(await page.screenshot({ type: "png" }));
  const iconRuntime = await page.evaluate(() => ({
    lucideCount: document.querySelectorAll("svg.lucide").length,
    nonLucideInlineSvg: [...document.querySelectorAll("button svg, a svg")].filter((icon) => !icon.classList.contains("lucide")).length,
    emojiCount: (document.body.innerText.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length,
    strokes: [...document.querySelectorAll("svg.lucide")].map((icon) => icon.getAttribute("stroke-width")).filter(Boolean),
  }));
  assert.ok(iconRuntime.lucideCount >= 10);
  assert.equal(iconRuntime.nonLucideInlineSvg, 0);
  assert.equal(iconRuntime.emojiCount, 0);
  assert.ok(iconRuntime.strokes.every((stroke) => ["2", "2.25"].includes(stroke)));

  const iconButton = await page.$(".customer-product-card .favorite-button");
  const iconDefault = Buffer.from(await iconButton.screenshot({ type: "png" }));
  await iconButton.hover();
  await delay(100);
  const iconHover = Buffer.from(await iconButton.screenshot({ type: "png" }));
  await iconButton.focus();
  const iconFocus = Buffer.from(await iconButton.screenshot({ type: "png" }));
  const targetSize = await iconButton.evaluate((node) => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height, outline: getComputedStyle(node).outlineStyle }; });
  assert.ok(targetSize.width >= 44 && targetSize.height >= 44);
  assert.notEqual(targetSize.outline, "none");
  await renderContactSheet(browser, {
    fileName: "CUSTOMER-LUCIDE-ICON-HOVER-STATES.png",
    title: "Lucide ikon etkileşim durumları",
    subtitle: "44 px hedef · varsayılan / hover / klavye odağı · 2 px yuvarlak stroke",
    entries: [
      { label: "Varsayılan", buffer: iconDefault },
      { label: "Hover", buffer: iconHover },
      { label: "Klavye odağı", buffer: iconFocus },
    ],
    columns: 3,
    imageHeight: 220,
    metadata: { targetSize },
  });

  await page.goto(`${origin}/#/yardim`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".help-grid", { visible: true, timeout });
  const helpBuffer = Buffer.from(await page.screenshot({ type: "png" }));
  await page.goto(`${origin}/#/urun/apple-iphone-15-128-gb`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".runtime-product-gallery", { visible: true, timeout });
  const pdpBuffer = Buffer.from(await page.screenshot({ type: "png" }));
  await page.goto(`${origin}/__review/customer`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".account-content", { visible: true, timeout });
  const accountBuffer = Buffer.from(await page.screenshot({ type: "png" }));
  await renderContactSheet(browser, {
    fileName: "CUSTOMER-LUCIDE-ICON-SYSTEM-CONTACT-SHEET.png",
    title: "Müşteri Lucide ikon sistemi",
    subtitle: `${iconRuntime.lucideCount}+ aktif Lucide örneği · merkezi semantik map · generic emoji/ikinci ikon ailesi yok`,
    entries: [
      { label: "Kategori + kartlar", caption: "header, favori, karşılaştırma, sepet", buffer: cardGridBuffer },
      { label: "Yardım", caption: "servis ve geri bildirim semantiği", buffer: helpBuffer },
      { label: "Ürün detayı", caption: "galeri ve satın alma eylemleri", buffer: pdpBuffer },
      { label: "Hesap", caption: "hesap ve navigasyon semantiği", buffer: accountBuffer },
    ],
    metadata: { iconRuntime },
  });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await gotoCards(page, origin);
  await page.addScriptTag({ content: axe.source });
  const axeDesktop = await page.evaluate(async () => globalThis.axe.run(document.querySelector(".plp-results") || document.querySelector("main"), { resultTypes: ["violations"], rules: { region: { enabled: false } } }));
  const severeDesktop = axeDesktop.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  assert.deepEqual(severeDesktop.map((violation) => violation.id), []);
  const reducedMotion = await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]).then(() => page.$eval(".customer-card-media-stage img", (node) => ({ transitionDuration: getComputedStyle(node).transitionDuration, animationDuration: getComputedStyle(node).animationDuration })));
  assert.ok(Number.parseFloat(reducedMotion.transitionDuration) <= 0.01, `Reduced-motion transition must be near-zero: ${JSON.stringify(reducedMotion)}`);
  await page.emulateMediaFeatures([]);

  assert.deepEqual(diagnostics.externalRequests, []);
  assert.deepEqual(diagnostics.nonGetRequests, []);
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.responseErrors, []);

  await renderContactSheet(browser, {
    fileName: "CUSTOMER-MAIN6X-OWNER-CONTACT-SHEET.png",
    title: "NovaStore Main6X · owner visual gate",
    subtitle: "tek ortak kart · hizalı CTA · contain medya · yatay hover · Lucide · indirim hiyerarşisi · 320–1440 px",
    entries: [
      { label: "Masaüstü 1440", fileName: "CUSTOMER-CARD-LIVE-DESKTOP-1440.png" },
      { label: "Mobil 390", fileName: "CUSTOMER-CARD-LIVE-MOBILE-390.png" },
      { label: "Mobil 320", fileName: "CUSTOMER-CARD-LIVE-MOBILE-320.png" },
      { label: "6W / 6X", fileName: "CUSTOMER-CARD-ALIGNMENT-BEFORE-AFTER.png" },
      { label: "Çoklu medya hover", fileName: "CUSTOMER-CARD-MULTI-IMAGE-HOVER-CONTACT-SHEET.png" },
      { label: "Lucide sistem", fileName: "CUSTOMER-LUCIDE-ICON-SYSTEM-CONTACT-SHEET.png" },
      { label: "Lucide durumları", fileName: "CUSTOMER-LUCIDE-ICON-HOVER-STATES.png" },
      { label: "İndirim hiyerarşisi", fileName: "CUSTOMER-DISCOUNT-HIERARCHY-CONTACT-SHEET.png" },
    ],
    columns: 2,
    imageHeight: 400,
    metadata: { responsiveCount: responsive.length, axeViolations: axeDesktop.violations.length },
  });

  required.forEach((fileName) => assert.equal(fs.existsSync(path.join(evidenceDirectory, fileName)), true, `${fileName} must exist.`));
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    origins: { current: origin, baseline: baselineOrigin },
    responsive,
    hover: { initialGeometry, finalGeometry, mediaCount: initialGeometry.imageCount, resetIndex: 0 },
    discountStyles,
    iconRuntime,
    accessibility: { desktopViolationCount: axeDesktop.violations.length, violations: axeDesktop.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodeCount: nodes.length })), targetSize, reducedMotion },
    diagnostics,
    screenshots: records,
  };
  fs.writeFileSync(path.join(evidenceDirectory, "main6x-browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log("MAIN6X_REAL_CHROME_UAT=PASS");
  console.log(`RESPONSIVE_WIDTHS=${responsive.map((item) => item.viewport.width).join(",")}`);
  console.log(`HOVER_MEDIA_COUNT=${initialGeometry.imageCount}`);
  console.log(`LUCIDE_RUNTIME_COUNT=${iconRuntime.lucideCount}`);
  console.log(`AXE_DESKTOP_VIOLATIONS=${axeDesktop.violations.length}`);
  console.log(`SCREENSHOTS=${records.length}`);
} finally {
  if (diagnostics.pageErrors.length || diagnostics.consoleErrors.length || diagnostics.requestFailures.length || diagnostics.responseErrors.length) {
    console.error("MAIN6X_BROWSER_DIAGNOSTICS", JSON.stringify(diagnostics));
  }
  if (browser) await browser.close();
  const resolved = path.resolve(browserDirectory);
  assert.equal(path.resolve(path.dirname(resolved)).toLocaleLowerCase("en-US"), path.resolve(os.tmpdir()).toLocaleLowerCase("en-US"));
  assert.match(path.basename(resolved), /^novastore-main6x-browser-[A-Za-z0-9_-]+$/);
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
}
