import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storefrontOrigin = process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5273";
const adminOrigin = process.env.NOVASTORE_REVIEW_ADMIN_ORIGIN || "http://127.0.0.1:5274";
const evidenceDirectory = path.resolve(process.env.NOVASTORE_REVIEW_EVIDENCE_DIR || "");
const timeout = 30_000;
const requireFromStorefront = createRequire(path.join(root, "storefront-commerce-pro", "package.json"));
const puppeteer = requireFromStorefront("puppeteer-core");
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(process.env.NOVASTORE_REVIEW_EVIDENCE_DIR, "NOVASTORE_REVIEW_EVIDENCE_DIR is required.");
const relativeEvidencePath = path.relative(root, evidenceDirectory);
assert.ok(
  relativeEvidencePath.startsWith("..") && !path.isAbsolute(relativeEvidencePath),
  "Review evidence must be written outside the repository.",
);
fs.mkdirSync(evidenceDirectory, { recursive: true });

const expectedScreenshots = Object.freeze([
  "actual-storefront-listing-1440.png",
  "actual-storefront-pdp-buy-now-1440.png",
  "actual-storefront-comparison-1440.png",
  "actual-storefront-header-footer.png",
  "actual-storefront-mobile-390.png",
  "actual-admin-pointer-focus-before-after.png",
  "actual-admin-seller-summary.png",
  "actual-admin-seller-detail.png",
  "actual-admin-mobile-390.png",
  "storefront-human-review-contact-sheet.png",
  "admin-human-review-contact-sheet.png",
]);

const findChromeExecutable = () => {
  const candidates = [
    process.env.NOVASTORE_CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executablePath, "Google Chrome is required for official runtime evidence capture.");
  return executablePath;
};

const readMeta = async (origin, expectedMode) => {
  const response = await fetch(`${origin}/__review/meta`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200, `${expectedMode} review metadata must be available.`);
  const meta = await response.json();
  assert.equal(meta.mode, expectedMode);
  assert.match(meta.artifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(meta.counters.database, 0);
  assert.equal(meta.counters.external, 0);
  assert.equal(meta.counters.mutation, 0);
  return meta;
};

const configurePage = async (page, origin, label) => {
  const evidence = {
    label,
    requests: [],
    responses: [],
    externalRequests: [],
    mutationRequests: [],
    paymentRequests: [],
    consoleErrors: [],
    pageErrors: [],
  };
  const allowedOrigin = new URL(origin).origin;
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const request = response.request();
    evidence.responses.push({ method: request.method(), url: response.url(), status: response.status() });
  });
  page.on("request", (request) => {
    const requestUrl = request.url();
    const method = request.method().toUpperCase();
    const finish = (operation) => operation.catch(() => {});
    if (/^(?:data|blob|about):/i.test(requestUrl)) {
      finish(request.continue());
      return;
    }
    let parsed;
    try {
      parsed = new URL(requestUrl);
    } catch (_) {
      evidence.externalRequests.push(`${method} ${requestUrl}`);
      finish(request.abort("blockedbyclient"));
      return;
    }
    if (parsed.origin !== allowedOrigin) {
      evidence.externalRequests.push(`${method} ${requestUrl}`);
      finish(request.abort("blockedbyclient"));
      return;
    }
    if (!["GET", "HEAD"].includes(method)) {
      evidence.mutationRequests.push(`${method} ${parsed.pathname}`);
      finish(request.abort("blockedbyclient"));
      return;
    }
    if (/paytr|iyzico|payment|checkout\/submit/i.test(parsed.pathname)) {
      evidence.paymentRequests.push(`${method} ${parsed.pathname}`);
      finish(request.abort("blockedbyclient"));
      return;
    }
    evidence.requests.push({ method, url: requestUrl });
    finish(request.continue());
  });
  return evidence;
};

const assertCleanRuntime = async (page, requestEvidence, label) => {
  const browserState = await page.evaluate(async () => ({
    serviceWorkerController: Boolean(navigator.serviceWorker?.controller),
    serviceWorkerRegistrations: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    cacheKeys: typeof caches === "undefined" ? [] : await caches.keys(),
  }));
  assert.deepEqual(requestEvidence.externalRequests, [], `${label} must not contact another origin.`);
  assert.deepEqual(requestEvidence.mutationRequests, [], `${label} must not issue a mutation request.`);
  assert.deepEqual(requestEvidence.paymentRequests, [], `${label} must not contact a payment path.`);
  assert.deepEqual(requestEvidence.pageErrors, [], `${label} must not raise a page error.`);
  assert.deepEqual(requestEvidence.consoleErrors, [], `${label} must not emit a console error.`);
  assert.equal(browserState.serviceWorkerController, false, `${label} must not be service-worker controlled.`);
  assert.equal(browserState.serviceWorkerRegistrations, 0, `${label} must not register a service worker.`);
  assert.deepEqual(browserState.cacheKeys, [], `${label} must not populate CacheStorage.`);
  const failingResponses = requestEvidence.responses.filter((item) => item.status >= 400);
  assert.deepEqual(failingResponses, [], `${label} must not receive a failing HTTP response.`);
  return browserState;
};

const waitForText = (page, selector, text) => page.waitForFunction(
  (candidateSelector, expectedText) => [...document.querySelectorAll(candidateSelector)]
    .some((node) => node.textContent.trim().includes(expectedText)),
  { timeout },
  selector,
  text,
);

const clickButtonByText = async (page, text) => {
  const handle = await page.evaluateHandle((expectedText) => (
    [...document.querySelectorAll("button")].find((button) => button.textContent.trim().includes(expectedText)) || null
  ), text);
  const element = handle.asElement();
  assert.ok(element, `Visible button containing '${text}' must exist.`);
  await element.click();
  await handle.dispose();
};

const readFocusStyle = (page, selector) => page.$eval(selector, (node) => {
  const style = getComputedStyle(node);
  return {
    tag: node.tagName,
    className: node.className,
    focusVisible: node.matches(":focus-visible"),
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineColor: style.outlineColor,
    outlineOffset: style.outlineOffset,
    boxShadow: style.boxShadow,
    modality: document.documentElement.dataset.inputModality,
  };
});

const records = [];
const recordFile = (fileName, metadata) => {
  const absolutePath = path.join(evidenceDirectory, fileName);
  const bytes = fs.readFileSync(absolutePath);
  const record = {
    fileName,
    absolutePath,
    sha256: sha256(bytes),
    bytes: bytes.length,
    gitHead,
    ...metadata,
  };
  records.push(record);
  return record;
};

const capture = async (page, fileName, metadata, options = {}) => {
  const absolutePath = path.join(evidenceDirectory, fileName);
  await page.screenshot({ path: absolutePath, type: "png", ...options });
  return recordFile(fileName, {
    url: page.url(),
    viewport: page.viewport(),
    ...metadata,
  });
};

const renderSheet = async (browser, { title, subtitle, entries, fileName, metadata }) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1100, deviceScaleFactor: 1 });
  const figures = entries.map((entry) => {
    const bytes = entry.buffer || fs.readFileSync(path.join(evidenceDirectory, entry.fileName));
    return `<figure><img src="data:image/png;base64,${Buffer.from(bytes).toString("base64")}" alt=""><figcaption><strong>${entry.label}</strong><span>${entry.caption || ""}</span></figcaption></figure>`;
  }).join("");
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#132238;font-family:Inter,Segoe UI,sans-serif;padding:44px}
    header{margin:0 0 28px}h1{font-size:34px;margin:0 0 8px}header p{margin:0;color:#526174;font-size:16px}
    main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px;align-items:start}
    figure{margin:0;background:white;border:1px solid #cfd6df;border-radius:16px;padding:14px;box-shadow:0 10px 30px rgba(19,34,56,.08)}
    img{display:block;width:100%;height:560px;object-fit:contain;object-position:top;background:#f8fafc;border:1px solid #e4e8ee;border-radius:10px}
    figcaption{display:grid;gap:5px;padding:12px 4px 2px}figcaption strong{font-size:17px}figcaption span{color:#627085;font-size:13px;overflow-wrap:anywhere}
  </style></head><body><header><h1>${title}</h1><p>${subtitle}</p></header><main>${figures}</main></body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png", fullPage: true });
  await page.close();
  return recordFile(fileName, metadata);
};

const storefrontMeta = await readMeta(storefrontOrigin, "INTEGRATED_COMMERCE_PRO");
const adminMeta = await readMeta(adminOrigin, "INTEGRATED_COMMERCE_PRO_ADMIN");
const browserDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "novastore-official-review-browser-"));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: "new",
    userDataDir: browserDirectory,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--disable-features=MediaRouter,OptimizationHints,Translate",
    ],
  });

  const storefrontPage = await browser.newPage();
  await storefrontPage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const storefrontNetwork = await configurePage(storefrontPage, storefrontOrigin, "storefront");
  const listingUrl = `${storefrontOrigin}/#/kategori/elektronik/telefon/cep-telefonu`;
  const listingResponse = await storefrontPage.goto(listingUrl, { waitUntil: "networkidle0", timeout });
  assert.ok(listingResponse, "Storefront listing must load the official document.");
  assert.equal(listingResponse.status(), 200);
  assert.equal(listingResponse.headers()["x-novastore-runtime-mode"], storefrontMeta.mode);
  assert.equal(listingResponse.headers()["x-novastore-artifact-sha256"], storefrontMeta.artifactSha256);
  await storefrontPage.waitForSelector(".product-grid .product-card", { visible: true, timeout });
  await storefrontPage.evaluate(() => document.fonts.ready);
  await delay(250);

  const storefrontVisual = await storefrontPage.evaluate(() => {
    const fontSelectors = [
      ".site-header .brand",
      ".site-header .search-box input",
      ".category-navigation button",
      ".product-card h3",
      ".product-card .price-block strong",
      ".site-footer",
    ];
    const fonts = fontSelectors.map((selector) => {
      const node = document.querySelector(selector);
      return { selector, exists: Boolean(node), fontFamily: node ? getComputedStyle(node).fontFamily : "" };
    });
    const visibleBarlowCondensed = [...document.querySelectorAll("body *")].filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).fontFamily.toLocaleLowerCase("en-US").includes("barlow condensed");
    }).length;
    return {
      fonts,
      visibleBarlowCondensed,
      headerBrandStarCount: document.querySelectorAll(".site-header .brand-mark, .site-header a.brand svg").length,
      footerBrandStarCount: document.querySelectorAll(".site-footer .brand-mark, .site-footer a.brand svg").length,
      rootChildren: document.querySelector("#root")?.children.length || 0,
    };
  });
  storefrontVisual.fonts.forEach((item) => {
    assert.equal(item.exists, true, `${item.selector} must exist in the official Storefront.`);
    assert.match(item.fontFamily, /^Inter\b/i, `${item.selector} must resolve to Inter first.`);
  });
  assert.equal(storefrontVisual.visibleBarlowCondensed, 0, "Visible Storefront text must not use Barlow Condensed.");
  assert.equal(storefrontVisual.headerBrandStarCount, 0, "Storefront header brand star must be removed.");
  assert.equal(storefrontVisual.footerBrandStarCount, 0, "Storefront footer brand star must be removed.");
  assert.ok(storefrontVisual.rootChildren > 0, "Official Storefront root must render.");

  const storefrontFocusSelectors = [
    ".search-box input",
    ".results-toolbar select",
    ".view-buttons button",
    ".breadcrumbs a",
    ".category-navigation button",
    ".check-option input",
  ];
  const storefrontPointerStyles = [];
  for (const selector of storefrontFocusSelectors) {
    await storefrontPage.$eval(selector, (node) => {
      node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
      node.focus();
    });
    const style = await readFocusStyle(storefrontPage, selector);
    assert.equal(style.modality, "pointer", `${selector} must enter pointer modality.`);
    assert.ok(style.outlineStyle === "none" || style.outlineWidth === "0px", `${selector} must not render a pointer outline.`);
    assert.equal(style.boxShadow, "none", `${selector} must not replace the pointer outline with a shadow ring.`);
    storefrontPointerStyles.push({ selector, ...style });
  }
  await storefrontPage.keyboard.press("Tab");
  const storefrontKeyboardStyles = [];
  for (const selector of storefrontFocusSelectors) {
    await storefrontPage.$eval(selector, (node) => node.focus());
    const style = await readFocusStyle(storefrontPage, selector);
    assert.equal(style.modality, "keyboard", `${selector} must retain keyboard modality.`);
    assert.equal(style.focusVisible, true, `${selector} must expose a keyboard focus indicator.`);
    assert.equal(style.outlineStyle, "solid", `${selector} must have a solid keyboard outline.`);
    assert.ok(Number.parseFloat(style.outlineWidth) >= 3, `${selector} must have at least a 3px keyboard outline.`);
    storefrontKeyboardStyles.push({ selector, ...style });
  }

  await capture(storefrontPage, "actual-storefront-listing-1440.png", {
    runtimeMode: storefrontMeta.mode,
    artifactSha256: storefrontMeta.artifactSha256,
    sourceEntry: storefrontMeta.sourceEntry,
    localData: storefrontMeta.localData,
  });
  await capture(storefrontPage, "actual-storefront-header-footer.png", {
    runtimeMode: storefrontMeta.mode,
    artifactSha256: storefrontMeta.artifactSha256,
    sourceEntry: storefrontMeta.sourceEntry,
    localData: storefrontMeta.localData,
  }, { fullPage: true });

  const watchUrl = `${storefrontOrigin}/#/urun/apple-watch-series-9-gps-45-mm`;
  await storefrontPage.goto(watchUrl, { waitUntil: "networkidle0", timeout });
  await waitForText(storefrontPage, "h1", "Apple Watch Series 9 GPS 45 mm");
  await waitForText(storefrontPage, "button", "Hemen Al");
  const watchActions = await storefrontPage.evaluate(() => ({
    h1: document.querySelector("h1")?.textContent.trim(),
    buyNowCount: [...document.querySelectorAll("button")].filter((node) => node.textContent.includes("Hemen Al") && !node.disabled).length,
    addToCartCount: [...document.querySelectorAll("button")].filter((node) => node.textContent.includes("Sepete ekle") && !node.disabled).length,
  }));
  assert.equal(watchActions.h1, "Apple Watch Series 9 GPS 45 mm");
  assert.ok(watchActions.buyNowCount >= 1, "Apple Watch must expose an enabled Hemen Al action.");
  assert.ok(watchActions.addToCartCount >= 1, "Apple Watch must keep Sepete ekle.");
  await capture(storefrontPage, "actual-storefront-pdp-buy-now-1440.png", {
    runtimeMode: storefrontMeta.mode,
    artifactSha256: storefrontMeta.artifactSha256,
    sourceEntry: storefrontMeta.sourceEntry,
    localData: storefrontMeta.localData,
  });
  await storefrontPage.click(".runtime-product-media-stage");
  await storefrontPage.waitForSelector(".runtime-media-lightbox__dialog", { visible: true, timeout });
  await storefrontPage.click(".runtime-media-lightbox__close");
  await storefrontPage.waitForSelector(".runtime-media-lightbox__dialog", { hidden: true, timeout });
  await clickButtonByText(storefrontPage, "Hemen Al");
  await storefrontPage.waitForFunction(() => location.hash === "#/odeme/teslimat", { timeout });

  await storefrontPage.goto(`${storefrontOrigin}/#/urun/apple-iphone-15-128-gb-siyah`, { waitUntil: "networkidle0", timeout });
  await waitForText(storefrontPage, "h1", "Apple iPhone 15 128 GB");
  await waitForText(storefrontPage, "button", "Hemen Al");

  await storefrontPage.goto(listingUrl, { waitUntil: "networkidle0", timeout });
  await storefrontPage.waitForSelector(".product-grid .product-card", { visible: true, timeout });
  const comparisonButtons = await storefrontPage.$$(".product-card .compare-button:not([disabled])");
  assert.ok(comparisonButtons.length >= 2, "Listing must expose at least two comparable products.");
  await comparisonButtons[0].click();
  await comparisonButtons[1].click();
  await storefrontPage.waitForSelector(".comparison-tray .comparison-open:not([disabled])", { visible: true, timeout });
  await storefrontPage.click(".comparison-tray .comparison-open");
  await storefrontPage.waitForSelector(".comparison-dialog[role=dialog]", { visible: true, timeout });
  const comparisonState = await storefrontPage.evaluate(() => ({
    selected: document.querySelectorAll(".compare-button[aria-pressed=true]").length,
    products: document.querySelectorAll(".comparison-product-row article").length,
    factRows: document.querySelectorAll(".comparison-fact-row").length,
  }));
  assert.equal(comparisonState.selected, 2);
  assert.equal(comparisonState.products, 2);
  assert.ok(comparisonState.factRows >= 3, "Comparison dialog must render real comparison rows.");
  await capture(storefrontPage, "actual-storefront-comparison-1440.png", {
    runtimeMode: storefrontMeta.mode,
    artifactSha256: storefrontMeta.artifactSha256,
    sourceEntry: storefrontMeta.sourceEntry,
    localData: storefrontMeta.localData,
  });
  await storefrontPage.click(".comparison-product-row article:first-of-type > button:first-child");
  await storefrontPage.waitForFunction(() => document.querySelectorAll(".compare-button[aria-pressed=true]").length === 1, { timeout });
  await storefrontPage.click('button[aria-label="Karşılaştırmayı kapat"]');
  await storefrontPage.waitForSelector(".comparison-dialog", { hidden: true, timeout });
  await storefrontPage.click(".comparison-clear");
  await storefrontPage.waitForFunction(() => !document.querySelector(".comparison-tray") && document.querySelectorAll(".compare-button[aria-pressed=true]").length === 0, { timeout });

  await storefrontPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await storefrontPage.goto(`${storefrontOrigin}/#/urun/apple-watch-series-9-gps-45-mm`, { waitUntil: "networkidle0", timeout });
  await waitForText(storefrontPage, "button", "Hemen Al");
  await capture(storefrontPage, "actual-storefront-mobile-390.png", {
    runtimeMode: storefrontMeta.mode,
    artifactSha256: storefrontMeta.artifactSha256,
    sourceEntry: storefrontMeta.sourceEntry,
    localData: storefrontMeta.localData,
  }, { fullPage: true });
  const storefrontBrowserState = await assertCleanRuntime(storefrontPage, storefrontNetwork, "Official Storefront");
  await storefrontPage.close();

  const adminPage = await browser.newPage();
  await adminPage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const adminNetwork = await configurePage(adminPage, adminOrigin, "admin");
  await adminPage.goto(`${adminOrigin}/`, { waitUntil: "domcontentloaded", timeout });
  await adminPage.waitForSelector('[data-testid="seller-application-summary"]', { visible: true, timeout });
  await adminPage.waitForFunction(() => document.querySelectorAll(".store-summary-table tbody tr").length === 2, { timeout });
  await adminPage.evaluate(() => document.fonts.ready);
  await delay(250);
  assert.equal(new URL(adminPage.url()).pathname, "/admin-commerce-pro-live.html");
  assert.equal(new URL(adminPage.url()).hash, "#/sellerApplications");

  const summaryPayload = await adminPage.evaluate(async () => {
    const token = localStorage.getItem("nova_admin_token");
    const response = await fetch("/api/admin/stores/summary?limit=100", { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(summaryPayload.status, 200);
  assert.deepEqual(Object.keys(summaryPayload.body).sort(), ["hasMore", "items", "limit"]);
  const exactSummaryKeys = ["createdAt", "customerVisibleProductCount", "id", "operationalStatus", "productCount", "storeName", "updatedAt"];
  summaryPayload.body.items.forEach((item) => assert.deepEqual(Object.keys(item).sort(), exactSummaryKeys));
  const privateCanaries = ["Elif Kaya", "Elektronik", "Giyilebilir Teknoloji", "Mert Aydın", "Ev ve Yaşam"];
  const summaryText = await adminPage.$eval('[data-testid="seller-application-summary"]', (node) => node.textContent);
  privateCanaries.forEach((canary) => assert.equal(summaryText.includes(canary), false, `Summary DOM must exclude ${canary}.`));
  assert.equal(summaryText.toLocaleLowerCase("tr-TR").includes("komisyon"), false);
  assert.equal(summaryText.toLocaleLowerCase("tr-TR").includes("ciro"), false);
  assert.equal(summaryText.toLocaleLowerCase("tr-TR").includes("gmv"), false);

  await capture(adminPage, "actual-admin-seller-summary.png", {
    runtimeMode: adminMeta.mode,
    artifactSha256: adminMeta.artifactSha256,
    sourceEntry: adminMeta.sourceEntry,
    localData: adminMeta.localData,
  }, { fullPage: true });

  const focusStyle = (selector) => readFocusStyle(adminPage, selector);
  const focusToolbar = await adminPage.$(".live-filter-toolbar");
  assert.ok(focusToolbar, "Admin filter toolbar must exist.");
  await adminPage.click(".heading-select select");
  await adminPage.keyboard.press("Escape");
  const pointerSelect = await focusStyle(".heading-select select");
  assert.equal(pointerSelect.modality, "pointer");
  assert.ok(pointerSelect.outlineStyle === "none" || pointerSelect.outlineWidth === "0px");
  assert.equal(pointerSelect.boxShadow, "none");
  const pointerFocusBuffer = Buffer.from(await focusToolbar.screenshot({ type: "png" }));

  await adminPage.click(".table-search input");
  await adminPage.keyboard.press("Tab");
  const keyboardSelect = await focusStyle(".heading-select select");
  assert.equal(keyboardSelect.modality, "keyboard");
  assert.equal(keyboardSelect.focusVisible, true);
  assert.equal(keyboardSelect.outlineStyle, "solid");
  assert.ok(Number.parseFloat(keyboardSelect.outlineWidth) >= 3);
  const keyboardFocusBuffer = Buffer.from(await focusToolbar.screenshot({ type: "png" }));

  const keyboardControlSelectors = [
    "a.skip-link",
    ".rail-nav button.active",
    ".table-search input",
    ".heading-select select",
    ".store-detail-trigger",
    ".workspace-heading button",
  ];
  const keyboardControlStyles = [];
  for (const selector of keyboardControlSelectors) {
    await adminPage.$eval(selector, (node) => node.focus());
    const style = await focusStyle(selector);
    assert.equal(style.modality, "keyboard", `${selector} must retain keyboard modality.`);
    assert.equal(style.focusVisible, true, `${selector} must expose a keyboard focus indicator.`);
    assert.equal(style.outlineStyle, "solid", `${selector} must have a solid keyboard outline.`);
    assert.ok(Number.parseFloat(style.outlineWidth) >= 3, `${selector} must have at least a 3px keyboard outline.`);
    keyboardControlStyles.push({ selector, ...style });
  }

  await renderSheet(browser, {
    title: "Admin odak görünürlüğü",
    subtitle: `Pointer: halka yok · Klavye: 3px görünür halka · ${gitHead.slice(0, 12)}`,
    entries: [
      { label: "Pointer ile filtre seçimi", caption: `${pointerSelect.outlineStyle} ${pointerSelect.outlineWidth} · ${pointerSelect.boxShadow}`, buffer: pointerFocusBuffer },
      { label: "Tab ile filtre seçimi", caption: `${keyboardSelect.outlineWidth} ${keyboardSelect.outlineStyle} ${keyboardSelect.outlineColor}`, buffer: keyboardFocusBuffer },
    ],
    fileName: "actual-admin-pointer-focus-before-after.png",
    metadata: {
      url: adminPage.url(),
      viewport: adminPage.viewport(),
      runtimeMode: adminMeta.mode,
      artifactSha256: adminMeta.artifactSha256,
      sourceEntry: adminMeta.sourceEntry,
      localData: adminMeta.localData,
    },
  });

  await adminPage.click(".store-detail-trigger");
  await adminPage.waitForSelector('[data-testid="seller-application-detail"][open]', { visible: true, timeout });
  await waitForText(adminPage, '[data-testid="seller-application-detail"]', "Elif Kaya");
  const detailText = await adminPage.$eval('[data-testid="seller-application-detail"]', (node) => node.textContent);
  assert.ok(detailText.includes("Elif Kaya"));
  assert.ok(detailText.includes("Elektronik"));
  assert.ok(detailText.includes("Giyilebilir Teknoloji"));
  await capture(adminPage, "actual-admin-seller-detail.png", {
    runtimeMode: adminMeta.mode,
    artifactSha256: adminMeta.artifactSha256,
    sourceEntry: adminMeta.sourceEntry,
    localData: adminMeta.localData,
  });
  await adminPage.click('button[aria-label="Pencereyi kapat"]');
  await adminPage.waitForSelector('[data-testid="seller-application-detail"]', { hidden: true, timeout });
  const postCloseText = await adminPage.$eval('[data-testid="seller-application-summary"]', (node) => node.textContent);
  privateCanaries.forEach((canary) => assert.equal(postCloseText.includes(canary), false, `Closed summary DOM must exclude ${canary}.`));

  await adminPage.click('.rail-nav button[title="Pano"]');
  await adminPage.waitForSelector('[data-testid="live-dashboard"]', { visible: true, timeout });
  const dashboardState = await adminPage.$eval('[data-testid="live-dashboard"]', (node) => ({
    verified: node.textContent.trim().length > 0,
    unavailableCount: [...node.querySelectorAll(".kpi-card")]
      .filter((card) => card.textContent.includes("Kullanılamıyor")).length,
    showsSyntheticZeroRevenue: node.textContent.includes("₺0"),
  }));
  assert.equal(dashboardState.verified, true, "Official Admin dashboard must render from its real read contract.");
  assert.equal(dashboardState.unavailableCount, 3, "Local review must label unavailable finance, order, and account metrics.");
  assert.equal(dashboardState.showsSyntheticZeroRevenue, false, "Local review must not present a fabricated zero revenue metric.");
  await adminPage.click('.rail-nav button[title="Satıcı mağazaları"]');
  await adminPage.waitForSelector('[data-testid="seller-application-summary"]', { visible: true, timeout });

  await adminPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await delay(250);
  await capture(adminPage, "actual-admin-mobile-390.png", {
    runtimeMode: adminMeta.mode,
    artifactSha256: adminMeta.artifactSha256,
    sourceEntry: adminMeta.sourceEntry,
    localData: adminMeta.localData,
  }, { fullPage: true });
  const adminBrowserState = await assertCleanRuntime(adminPage, adminNetwork, "Official Admin");
  await adminPage.close();

  await renderSheet(browser, {
    title: "NovaStore Storefront insan inceleme paketi",
    subtitle: `Resmî entegre artifact · ${storefrontMeta.artifactSha256.slice(0, 16)} · yerel salt-okunur veri`,
    entries: [
      { label: "Liste · 1440", caption: listingUrl, fileName: "actual-storefront-listing-1440.png" },
      { label: "PDP · Hemen Al", caption: watchUrl, fileName: "actual-storefront-pdp-buy-now-1440.png" },
      { label: "Gerçek karşılaştırma", caption: "2 ürün · satır bazlı karşılaştırma", fileName: "actual-storefront-comparison-1440.png" },
      { label: "Header + footer", caption: "Yıldız yok · Inter", fileName: "actual-storefront-header-footer.png" },
      { label: "Mobil · 390", caption: watchUrl, fileName: "actual-storefront-mobile-390.png" },
    ],
    fileName: "storefront-human-review-contact-sheet.png",
    metadata: {
      url: listingUrl,
      viewport: { width: 1800, height: 1100, deviceScaleFactor: 1 },
      runtimeMode: storefrontMeta.mode,
      artifactSha256: storefrontMeta.artifactSha256,
      sourceEntry: storefrontMeta.sourceEntry,
      localData: storefrontMeta.localData,
    },
  });
  await renderSheet(browser, {
    title: "NovaStore Admin insan inceleme paketi",
    subtitle: `Resmî entegre artifact · ${adminMeta.artifactSha256.slice(0, 16)} · özet/detay mahremiyet ayrımı`,
    entries: [
      { label: "Mağaza özeti", caption: "Kişi/kategori/finans alanı yok", fileName: "actual-admin-seller-summary.png" },
      { label: "Açık detay isteği", caption: "Sahip ve katalog kategorileri yalnız dialog içinde", fileName: "actual-admin-seller-detail.png" },
      { label: "Pointer / klavye odağı", caption: "Pointer halka yok · Tab 3px görünür", fileName: "actual-admin-pointer-focus-before-after.png" },
      { label: "Mobil · 390", caption: `${adminOrigin}/admin-commerce-pro-live.html#/sellerApplications`, fileName: "actual-admin-mobile-390.png" },
    ],
    fileName: "admin-human-review-contact-sheet.png",
    metadata: {
      url: `${adminOrigin}/admin-commerce-pro-live.html#/sellerApplications`,
      viewport: { width: 1800, height: 1100, deviceScaleFactor: 1 },
      runtimeMode: adminMeta.mode,
      artifactSha256: adminMeta.artifactSha256,
      sourceEntry: adminMeta.sourceEntry,
      localData: adminMeta.localData,
    },
  });

  expectedScreenshots.forEach((fileName) => assert.equal(fs.existsSync(path.join(evidenceDirectory, fileName)), true, `${fileName} must exist.`));
  const finalMeta = await Promise.all([
    readMeta(storefrontOrigin, "INTEGRATED_COMMERCE_PRO"),
    readMeta(adminOrigin, "INTEGRATED_COMMERCE_PRO_ADMIN"),
  ]);
  finalMeta.forEach((meta) => {
    assert.equal(meta.counters.database, 0);
    assert.equal(meta.counters.external, 0);
    assert.equal(meta.counters.mutation, 0);
  });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitHead,
    origins: { storefront: storefrontOrigin, admin: adminOrigin },
    runtime: { storefront: storefrontMeta, admin: adminMeta },
    assertions: {
      storefrontVisual,
      storefrontPointerStyles,
      storefrontKeyboardStyles,
      watchActions,
      comparisonState,
      storefrontBrowserState,
      summaryPayloadKeys: Object.keys(summaryPayload.body).sort(),
      summaryItemKeys: exactSummaryKeys,
      pointerSelect,
      keyboardSelect,
      keyboardControlStyles,
      dashboardVerified: dashboardState.verified,
      dashboardState,
      adminBrowserState,
      remoteRequests: storefrontNetwork.externalRequests.length + adminNetwork.externalRequests.length,
      mutationRequests: storefrontNetwork.mutationRequests.length + adminNetwork.mutationRequests.length,
      paymentRequests: storefrontNetwork.paymentRequests.length + adminNetwork.paymentRequests.length,
      pageErrors: storefrontNetwork.pageErrors.length + adminNetwork.pageErrors.length,
      consoleErrors: storefrontNetwork.consoleErrors.length + adminNetwork.consoleErrors.length,
      databaseConnections: finalMeta[0].counters.database + finalMeta[1].counters.database,
    },
    screenshots: records,
  };
  fs.writeFileSync(path.join(evidenceDirectory, "evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDirectory, "EVIDENCE.md"), [
    "# PC1 Macro Wave 3R3 official runtime evidence",
    "",
    `- Git HEAD at capture: \`${gitHead}\``,
    `- Storefront: \`${storefrontOrigin}/\` · \`${storefrontMeta.artifactSha256}\``,
    `- Admin: \`${adminOrigin}/admin-commerce-pro-live.html#/sellerApplications\` · \`${adminMeta.artifactSha256}\``,
    "- Remote requests: `0`",
    "- Mutation/payment requests: `0`",
    "- Remote database connections: `0`",
    "- Browser page/console errors: `0`",
    "",
    ...records.map((record) => `- \`${record.fileName}\` · \`${record.sha256}\``),
    "",
  ].join("\n"));

  console.log(`OFFICIAL_RUNTIME_BROWSER_EVIDENCE=PASS`);
  console.log(`EVIDENCE_DIRECTORY=${evidenceDirectory}`);
  console.log(`STOREFRONT_ARTIFACT_SHA256=${storefrontMeta.artifactSha256}`);
  console.log(`ADMIN_ARTIFACT_SHA256=${adminMeta.artifactSha256}`);
  console.log(`SCREENSHOTS=${records.length}`);
  console.log(`REMOTE_REQUESTS=${report.assertions.remoteRequests}`);
  console.log(`MUTATION_REQUESTS=${report.assertions.mutationRequests}`);
  console.log(`PAYMENT_REQUESTS=${report.assertions.paymentRequests}`);
  console.log(`DATABASE_CONNECTIONS=${report.assertions.databaseConnections}`);
} finally {
  if (browser) await browser.close();
  const resolvedBrowserDirectory = path.resolve(browserDirectory);
  const resolvedTempRoot = path.resolve(os.tmpdir());
  const normalize = (value) => process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value;
  assert.equal(normalize(path.dirname(resolvedBrowserDirectory)), normalize(resolvedTempRoot));
  assert.match(path.basename(resolvedBrowserDirectory), /^novastore-official-review-browser-[A-Za-z0-9_-]+$/);
  if (fs.existsSync(resolvedBrowserDirectory)) {
    fs.rmSync(resolvedBrowserDirectory, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
  }
  assert.equal(fs.existsSync(resolvedBrowserDirectory), false);
}
