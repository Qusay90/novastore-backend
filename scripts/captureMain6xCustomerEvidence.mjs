import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = new URL(process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5283").origin;
const baselineOrigin = new URL(process.env.NOVASTORE_MAIN6X_BASELINE_ORIGIN || origin).origin;
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
  expectedOfflineFailures: [],
  responseErrors: [],
};

const configureRuntimePage = async (page) => {
  const allowedOrigins = new Set([origin, baselineOrigin, "https://res.cloudinary.com", "https://novastore.tr", "https://www.novastore.tr"]);
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error"
      && !message.text().startsWith("Failed to load resource: the server responded with a status of 404")
      && !message.text().includes("net::ERR_INTERNET_DISCONNECTED")) {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    const pathname = (() => { try { return new URL(request.url()).pathname; } catch { return ""; } })();
    if (page.__novastoreBlockedPaths?.has(pathname)) diagnostics.expectedOfflineFailures.push(`${request.method()} ${request.url()} :: ${failure}`);
    else if (!failure.includes("ERR_ABORTED")) diagnostics.requestFailures.push(`${request.method()} ${request.url()} :: ${failure}`);
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
    if (parsed && page.__novastoreBlockedPaths?.has(parsed.pathname)) return request.abort("internetdisconnected").catch(() => {});
    if (!parsed || !allowedOrigins.has(parsed.origin)) {
      diagnostics.externalRequests.push(`${method} ${url}`);
      return request.abort("blockedbyclient").catch(() => {});
    }
    return request.continue().catch(() => {});
  });
};

const gotoCards = async (page, targetOrigin, route = "/#/kategori/ev-yasam") => {
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
    const matches = await handle.evaluate((node) => Boolean(node.querySelector('a[href="#/urun/owner-hover-dort-gorsel"]')));
    if (matches) return handle;
  }
  throw new Error("Main6X deterministic four-image owner card was not found.");
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
  "01-HEADER-DESKTOP.png",
  "02-HEADER-MOBILE.png",
  "03-HELP-CENTER.png",
  "04-RETURNS.png",
  "05-SUPPORT.png",
  "06-ACCOUNT.png",
  "07-CHECKOUT.png",
  "08-PUBLIC-STORE-DESKTOP.png",
  "09-PUBLIC-STORE-MOBILE.png",
  "10-PUBLIC-STORE-PREVIEW.png",
  "11-LIVE-PRODUCTS-CATEGORY-DESKTOP.png",
  "12-LIVE-PRODUCTS-CATEGORY-MOBILE.png",
  "13-MULTI-IMAGE-PRODUCT-COVER.png",
  "14-MULTI-IMAGE-PRODUCT-HOVER-MIDDLE.png",
  "15-MULTI-IMAGE-PRODUCT-HOVER-END.png",
  "MAIN6X-R1-OWNER-CONTACT-SHEET.png",
  "MAIN6X-R1-REAL-LIVE-PRODUCT-CARDS.png",
  "MAIN6X-R1-PUBLIC-STORE-CARD-PARITY.png",
  "MAIN6X-R1-LUCIDE-FULL-ROUTE-SHEET.png",
];

const ownerRoutes = Object.freeze([
  ["HOME", "/#/"], ["CATEGORY", "/#/kategori/ev-yasam"], ["SEARCH", "/#/arama?q=ürün"],
  ["COLLECTION_DEALS", "/#/koleksiyon/firsatlar"], ["PDP", "/#/urun/owner-hover-dort-gorsel"],
  ["PUBLIC_STORE", "/#/magaza/owner-main6x-r1"], ["PUBLIC_STORE_PREVIEW", "/#/magaza/owner-main6x-r1?mode=preview"],
  ["CART", "/#/sepet"], ["ACCOUNT_UNAUTHORIZED", "/#/hesabim"],
  ["ORDERS", "/#/hesabim/siparisler"], ["ORDER_DETAIL", "/#/hesabim/siparisler/7002"],
  ["CHECKOUT", "/#/odeme/teslimat"], ["HELP_CENTER", "/#/yardim"], ["RETURNS_EXCHANGE", "/#/iade-degisim"],
  ["SUPPORT", "/#/iletisim"], ["NOTIFICATIONS", "/#/hesabim/bildirimler"], ["FAVORITES_EMPTY", "/#/favoriler"],
  ["TRACKING", "/#/siparis-takibi"], ["AUTH_LOGIN", "/#/giris"], ["AUTH_REGISTER", "/#/kayit"],
  ["PASSWORD_RECOVERY", "/#/sifremi-unuttum"], ["NOT_FOUND_ERROR", "/#/owner-bilinmeyen-rota"],
]);

const auditRouteIcons = async (page) => {
  const matrix = [];
  const inspect = async (routeName) => matrix.push(await page.evaluate((name) => {
      const icons = [...document.querySelectorAll("svg")].filter((icon) => icon.closest("main, .site-header, .site-footer, .mobile-bottom-nav, [role=dialog]"));
      const generic = icons.filter((icon) => !icon.closest(".product-rating, [data-rating], .public-store-metrics li:last-child"));
      const lucide = generic.filter((icon) => icon.classList.contains("lucide"));
      const oversized = generic.filter((icon) => {
        const style = getComputedStyle(icon);
        const visibleWidth = icon.getBoundingClientRect().width - (Number.parseFloat(style.paddingLeft) || 0) - (Number.parseFloat(style.paddingRight) || 0);
        const visibleHeight = icon.getBoundingClientRect().height - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0);
        return Math.max(visibleWidth, visibleHeight) > 24.5;
      });
      const decorative = generic.filter((icon) => /sparkle|sparkles|star-four/i.test(icon.getAttribute("data-lucide") || icon.outerHTML));
      return {
        route: name,
        url: location.href,
        genericIconCount: generic.length,
        lucideCount: lucide.length,
        nonLucideCount: generic.length - lucide.length,
        oversizedIconCount: oversized.length,
        oversizedIcons: oversized.map((icon) => {
          const style = getComputedStyle(icon);
          return {
            className: icon.getAttribute("class"),
            parentClass: icon.parentElement?.getAttribute("class") || icon.parentElement?.tagName,
            width: icon.getBoundingClientRect().width,
            height: icon.getBoundingClientRect().height,
            padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
          };
        }),
        decorativeStarCount: decorative.length,
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        pass: generic.length === lucide.length && oversized.length === 0 && decorative.length === 0,
      };
    }, routeName));
  for (const [route, hash] of ownerRoutes) {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${origin}${hash}`, { waitUntil: "domcontentloaded", timeout });
    await page.waitForSelector("main", { visible: true, timeout });
    await delay(80);
    await inspect(route);
  }

  await page.goto(`${origin}/__review/customer`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".account-content", { visible: true, timeout });
  await inspect("ACCOUNT_AUTHENTICATED");
  for (const [route, hash] of [
    ["ACCOUNT_ADDRESSES", "#/hesabim/adresler"], ["ACCOUNT_COUPONS", "#/hesabim/kuponlar"],
    ["ACCOUNT_SECURITY", "#/hesabim/guvenlik"], ["ACCOUNT_NOTIFICATIONS", "#/hesabim/bildirimler"],
  ]) {
    await page.evaluate((nextHash) => { location.hash = nextHash; }, hash);
    await page.waitForSelector(".account-content", { visible: true, timeout });
    await delay(80);
    await inspect(route);
  }

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/#/kategori/ev-yasam`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".customer-product-card", { visible: true, timeout });
  await page.click('[aria-controls="cart-drawer"]');
  await page.waitForSelector("#cart-drawer", { visible: true, timeout });
  await inspect("CART_DRAWER");
  await page.keyboard.press("Escape");

  const compareButtons = await page.$$(".customer-product-card .compare-button");
  assert.ok(compareButtons.length >= 2, "Comparison audit requires two product cards.");
  await compareButtons[0].click();
  await compareButtons[1].click();
  await page.waitForSelector(".comparison-open:not([disabled])", { visible: true, timeout });
  await page.click(".comparison-open");
  await page.waitForSelector(".comparison-dialog", { visible: true, timeout });
  await inspect("COMPARISON_MODAL");
  await page.keyboard.press("Escape");

  await page.goto(`${origin}/#/yardim`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".assistant-fab", { visible: true, timeout });
  await page.click(".assistant-fab");
  await page.waitForSelector(".assistant-widget.is-open", { visible: true, timeout });
  await inspect("NOVABOT_DIALOG");

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${origin}/#/kategori/ev-yasam`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".mobile-bottom-nav", { visible: true, timeout });
  await inspect("MOBILE_NAVIGATION");
  await page.click(".mobile-menu-trigger");
  await page.waitForSelector("#category-drawer", { visible: true, timeout });
  await inspect("MOBILE_CATEGORY_DRAWER");
  await page.keyboard.press("Escape");

  page.__novastoreBlockedPaths = new Set(["/api/products", "/api/public/categories", "/api/public/navigation/main"]);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/#/kategori/ev-yasam`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector("main", { visible: true, timeout });
  await delay(250);
  await inspect("OFFLINE_ERROR");
  page.__novastoreBlockedPaths = new Set();
  return matrix;
};

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

  const ownerCapture = async (fileName, hash, width, height, waitFor = "main") => {
    const mobile = width <= 430;
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.goto(`${origin}${hash}`, { waitUntil: "domcontentloaded", timeout });
    await page.waitForSelector(waitFor, { visible: true, timeout });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      const step = Math.max(420, Math.floor(innerHeight * .7));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 35));
      }
      scrollTo(0, 0);
    });
    await delay(700);
    await capture(page, fileName, { ownerRoute: hash, width }, { fullPage: true });
  };

  const readableCrop = async (route, selector, { width = 1440, height = 1000, maxHeight = 760, padding = 0, hideChrome = false, fixed = false } = {}) => {
    const mobile = width <= 430;
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
    await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout });
    await page.evaluate(() => document.querySelectorAll(".site-header, .mobile-bottom-nav").forEach((node) => { node.style.visibility = ""; }));
    await page.waitForSelector(selector, { visible: true, timeout });
    await page.evaluate(() => document.fonts.ready);
    if (fixed) await page.evaluate(() => scrollTo(0, 0));
    else await page.$eval(selector, (node) => node.scrollIntoView({ block: "center" }));
    await page.waitForFunction((scope) => [...document.querySelectorAll(`${scope} img`)].every((image) => image.complete && image.naturalWidth > 0), { timeout }, selector);
    if (hideChrome) await page.evaluate(() => document.querySelectorAll(".site-header, .mobile-bottom-nav").forEach((node) => { node.style.visibility = "hidden"; }));
    await delay(220);
    if (fixed) {
      const fixedBox = await page.$eval(selector, (node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      assert.ok(fixedBox.width > 0 && fixedBox.height > 0, `Fixed readable evidence element is unavailable for ${selector}.`);
      return Buffer.from(await page.screenshot({ type: "png", clip: fixedBox }));
    }
    const box = await page.$eval(selector, (node, useViewportCoordinates) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x + (useViewportCoordinates ? 0 : scrollX), y: rect.y + (useViewportCoordinates ? 0 : scrollY), width: rect.width, height: rect.height };
    }, fixed);
    assert.ok(box.width > 0 && box.height > 0, `Readable evidence crop is unavailable for ${selector}.`);
    const x = Math.max(0, box.x - padding);
    const y = Math.max(0, box.y - padding);
    const clip = {
      x,
      y,
      width: Math.min(width - x, box.width + padding * 2),
      height: Math.min(maxHeight, box.height + padding * 2),
    };
    return Buffer.from(await page.screenshot({ type: "png", clip, captureBeyondViewport: true }));
  };

  await ownerCapture("01-HEADER-DESKTOP.png", "/#/", 1440, 1000, ".site-header");
  await ownerCapture("02-HEADER-MOBILE.png", "/#/", 390, 844, ".site-header");
  await ownerCapture("03-HELP-CENTER.png", "/#/yardim", 1440, 1000, ".help-hero");
  await ownerCapture("04-RETURNS.png", "/#/iade-degisim", 1440, 1000, ".return-exchange-hero");
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/__review/customer`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".account-content", { visible: true, timeout });
  await delay(120);
  await capture(page, "06-ACCOUNT.png", { ownerRoute: "/#/hesabim", width: 1440 }, { fullPage: true });
  await ownerCapture("05-SUPPORT.png", "/#/iletisim", 1440, 1000, "main");
  await ownerCapture("07-CHECKOUT.png", "/#/odeme/teslimat", 1440, 1000, "main");
  await ownerCapture("08-PUBLIC-STORE-DESKTOP.png", "/#/magaza/owner-main6x-r1", 1440, 1000, ".public-store-products");
  await ownerCapture("09-PUBLIC-STORE-MOBILE.png", "/#/magaza/owner-main6x-r1", 390, 844, ".public-store-products");
  await ownerCapture("10-PUBLIC-STORE-PREVIEW.png", "/#/magaza/owner-main6x-r1?mode=preview", 1440, 1000, ".public-store-preview-banner");
  await ownerCapture("11-LIVE-PRODUCTS-CATEGORY-DESKTOP.png", "/#/kategori/ev-yasam", 1440, 1000, ".customer-product-card");
  await ownerCapture("12-LIVE-PRODUCTS-CATEGORY-MOBILE.png", "/#/kategori/ev-yasam", 390, 844, ".customer-product-card");

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
    await page.waitForFunction(() => [...document.querySelectorAll(".customer-product-card .customer-card-media-stage img.is-active")].slice(0, 4).every((image) => image.complete && image.naturalWidth > 0), { timeout });
    await delay(120);
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
  await page.goto(`${origin}/#/kategori/ev-yasam`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".customer-product-card", { visible: true, timeout });
  await page.evaluate(() => document.fonts.ready);
  const iphoneCard = await cardForIphone(page);
  await iphoneCard.evaluate((node) => { node.scrollIntoView({ block: "center" }); window.scrollBy(0, -90); });
  const initialCard = Buffer.from(await iphoneCard.screenshot({ type: "png" }));
  fs.writeFileSync(path.join(evidenceDirectory, "13-MULTI-IMAGE-PRODUCT-COVER.png"), initialCard);
  record("13-MULTI-IMAGE-PRODUCT-COVER.png", { state: "cover", product: "owner-hover-dort-gorsel" });
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
  fs.writeFileSync(path.join(evidenceDirectory, "14-MULTI-IMAGE-PRODUCT-HOVER-MIDDLE.png"), hoverFrames[1].buffer);
  record("14-MULTI-IMAGE-PRODUCT-HOVER-MIDDLE.png", { state: "hover-middle", product: "owner-hover-dort-gorsel" });
  fs.writeFileSync(path.join(evidenceDirectory, "15-MULTI-IMAGE-PRODUCT-HOVER-END.png"), hoverFrames[2].buffer);
  record("15-MULTI-IMAGE-PRODUCT-HOVER-END.png", { state: "hover-end", product: "owner-hover-dort-gorsel" });
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
  await page.goto(`${origin}/#/urun/owner-hover-dort-gorsel`, { waitUntil: "domcontentloaded", timeout });
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

  const routeIconMatrix = await auditRouteIcons(page);
  assert.deepEqual(routeIconMatrix.filter((entry) => entry.nonLucideCount > 0), []);
  assert.deepEqual(routeIconMatrix.filter((entry) => entry.oversizedIconCount > 0), []);
  assert.deepEqual(routeIconMatrix.filter((entry) => entry.decorativeStarCount > 0), []);
  assert.deepEqual(routeIconMatrix.filter((entry) => entry.overflow > 1), []);

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

  await page.goto(`${origin}/#/`, { waitUntil: "domcontentloaded", timeout });
  await page.evaluate(() => localStorage.clear());
  const readable = {
    headerDesktop: await readableCrop("/#/", ".site-header", { maxHeight: 260 }),
    headerMobile: await readableCrop("/#/", ".site-header", { width: 390, height: 844, maxHeight: 220 }),
    help: await readableCrop("/#/yardim", ".help-hero", { maxHeight: 520 }),
    returns: await readableCrop("/#/iade-degisim", ".return-exchange-hero", { maxHeight: 520 }),
    checkout: await readableCrop("/#/odeme/teslimat", ".auth-layout", { maxHeight: 700 }),
    checkoutHead: await readableCrop("/#/odeme/teslimat", ".auth-hero", { maxHeight: 420, padding: 12 }),
    account: await readableCrop("/__review/customer", ".account-content", { maxHeight: 700 }),
    accountNav: await readableCrop("/__review/customer", ".account-sidebar", { maxHeight: 700 }),
    support: await readableCrop("/#/iletisim", ".help-hero", { maxHeight: 520 }),
    publicStoreHero: await readableCrop("/#/magaza/owner-main6x-r1", ".public-store-hero__content", { maxHeight: 520 }),
    publicStoreGrid: await readableCrop("/#/magaza/owner-main6x-r1", ".public-store-product-grid", { maxHeight: 760, hideChrome: true }),
    publicStoreCard: await readableCrop("/#/magaza/owner-main6x-r1", '.public-store-product-card:has(a[href="#/urun/karaca-amber-borosilikat-cam-caydanlik-takimi"])', { maxHeight: 760, hideChrome: true }),
    categoryGrid: await readableCrop("/#/kategori/ev-yasam", ".plp-results .product-grid", { maxHeight: 760, hideChrome: true }),
    categoryCard: await readableCrop("/#/kategori/ev-yasam", '.plp-results .customer-product-card:has(a[href="#/urun/karaca-amber-borosilikat-cam-caydanlik-takimi"])', { maxHeight: 760, hideChrome: true }),
    categoryMobile: await readableCrop("/#/kategori/ev-yasam", '.plp-results .customer-product-card:has(a[href="#/urun/karaca-amber-borosilikat-cam-caydanlik-takimi"])', { width: 390, height: 844, maxHeight: 760, hideChrome: true }),
    mobileNav: await readableCrop("/#/kategori/ev-yasam", ".mobile-bottom-nav", { width: 390, height: 844, maxHeight: 130, fixed: true }),
  };

  await renderContactSheet(browser, {
    fileName: "MAIN6X-R1-OWNER-CONTACT-SHEET.png",
    title: "NovaStore Main6X R1 · owner visual closure",
    subtitle: "Dengeli 18–24 px Lucide glifleri · 44 px hedefler · gerçek ürünler · public mağaza · mobil ve masaüstü",
    entries: [
      { label: "Header masaüstü", caption: "20 px navigasyon glifi · 44 px etkileşim hedefi", buffer: readable.headerDesktop },
      { label: "Header mobil", caption: "20 px menü glifi · alt mobil navigasyonla optik denge", buffer: readable.headerMobile },
      { label: "Yardım Merkezi", caption: "Lucide CircleHelp · dekoratif parıltı yok", buffer: readable.help },
      { label: "İade & değişim", caption: "Lucide RotateCcw semantiği", buffer: readable.returns },
      { label: "Destek", caption: "Lucide MessagesCircle semantiği", buffer: readable.support },
      { label: "Hesap", caption: "Merkezi Lucide hesap navigasyonu", buffer: readable.account },
      { label: "Checkout", caption: "Yetkisiz durumda güvenli hesap kapısı · 24 px ShieldCheck", buffer: readable.checkout },
      { label: "Public mağaza", caption: "Canonical hero ve ilk gerçek ürün satırı", buffer: readable.publicStoreGrid },
      { label: "Canlı ürünler", caption: "Sekiz güncel public ürünün okunabilir kartları", buffer: readable.categoryGrid },
      { label: "Hover orta", fileName: "14-MULTI-IMAGE-PRODUCT-HOVER-MIDDLE.png" },
    ],
    columns: 2,
    imageHeight: 520,
    metadata: { routeCount: routeIconMatrix.length },
  });

  await renderContactSheet(browser, {
    fileName: "MAIN6X-R1-REAL-LIVE-PRODUCT-CARDS.png",
    title: "Güncel novastore.tr ürünleri · ortak kart",
    subtitle: "Sekiz anonim public ürün · gerçek adlar ve görseller · contain medya · fiyat/indirim/CTA hiyerarşisi",
    entries: [
      { label: "Masaüstü · gerçek ürün kartları", caption: "Ad, görsel, fiyat, indirim, puan ve CTA okunur yakın plan", buffer: readable.categoryGrid },
      { label: "Mobil · gerçek ürün kartları", caption: "Dar görünümde aynı canonical ProductCard", buffer: readable.categoryMobile },
    ],
    columns: 1,
    imageHeight: 980,
  });

  await renderContactSheet(browser, {
    fileName: "MAIN6X-R1-PUBLIC-STORE-CARD-PARITY.png",
    title: "Kategori / public mağaza ortak kart paritesi",
    subtitle: "Aynı gerçek ürün DTO'ları · aynı CustomerProductCard · aynı medya, hizalama, indirim ve hover davranışı",
    entries: [
      { label: "Kategori · CustomerProductCard", caption: "Gerçek Karaca ürünü, ortak medya ve CTA yapısı", buffer: readable.categoryCard },
      { label: "Public mağaza · CustomerProductCard", caption: "Aynı bileşen, aynı ürün, aynı hizalama ve hover", buffer: readable.publicStoreCard },
    ],
    columns: 2,
    imageHeight: 820,
  });

  await renderContactSheet(browser, {
    fileName: "MAIN6X-R1-LUCIDE-FULL-ROUTE-SHEET.png",
    title: "Tam rota Lucide ikon sistemi",
    subtitle: "Header · Yardım · Destek · İade · Hesap · Checkout · Public mağaza · mobil navigasyon; dekoratif yıldız yok",
    entries: [
      { label: "Header", caption: "Menu, Search, UserRound, Heart, ShoppingCart", buffer: readable.headerDesktop },
      { label: "Yardım", caption: "CircleHelp · 24 px visible glyph", buffer: readable.help },
      { label: "İade", caption: "RotateCcw · 24 px visible glyph", buffer: readable.returns },
      { label: "Destek", caption: "MessagesCircle · 24 px visible glyph", buffer: readable.support },
      { label: "Hesap", caption: "UserRound, MapPin, Receipt, Ticket, Bell, Shield", buffer: readable.accountNav },
      { label: "Checkout", caption: "ShieldCheck ile güvenli yetkilendirme kapısı", buffer: readable.checkoutHead },
      { label: "Public mağaza", caption: "Store, metrics ve takip eylemi", buffer: readable.publicStoreHero },
      { label: "Mobil navigasyon", caption: "20 px glifler, büyük dokunma hedefleri", buffer: readable.mobileNav },
    ],
    columns: 2,
    imageHeight: 420,
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
    routeIconMatrix,
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
