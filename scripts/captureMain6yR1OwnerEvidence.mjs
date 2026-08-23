import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storefrontOrigin = new URL(process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5303").origin;
const adminOrigin = new URL(process.env.NOVASTORE_REVIEW_ADMIN_ORIGIN || "http://127.0.0.1:5304").origin;
const evidenceDirectory = path.resolve(process.env.NOVASTORE_MAIN6Y_R1_EVIDENCE_DIR || "");
const ffmpegPath = path.resolve(process.env.NOVASTORE_MAIN6Y_FFMPEG || "");
const ribbonReference = path.resolve(process.env.NOVASTORE_OWNER_RIBBON_REFERENCE || "");
const framingReference = path.resolve(process.env.NOVASTORE_OWNER_FRAMING_REFERENCE || "");
const requireFromStorefront = createRequire(path.join(root, "storefront-commerce-pro", "package.json"));
const puppeteer = requireFromStorefront("puppeteer-core");
const axe = requireFromStorefront("axe-core");
const timeout = 35_000;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

assert.ok(process.env.NOVASTORE_MAIN6Y_R1_EVIDENCE_DIR, "NOVASTORE_MAIN6Y_R1_EVIDENCE_DIR is required.");
assert.ok(path.relative(root, evidenceDirectory).startsWith(".."), "Owner evidence must remain outside Git.");
for (const filePath of [ffmpegPath, ribbonReference, framingReference]) assert.ok(fs.existsSync(filePath), `${filePath} is required.`);
for (const value of [storefrontOrigin, adminOrigin]) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
}
fs.mkdirSync(evidenceDirectory, { recursive: true });

const chromeCandidates = [
  process.env.NOVASTORE_CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(chromePath, "Google Chrome is required for owner UAT.");

const diagnostics = {
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
  const index = artifacts.findIndex((item) => item.fileName === fileName);
  if (index >= 0) artifacts.splice(index, 1, entry); else artifacts.push(entry);
  return entry;
};

const configurePage = async (page) => {
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("console", (message) => {
    const value = message.text();
    if (message.type() === "error" && !value.includes("404") && !value.includes("ERR_ABORTED")) diagnostics.consoleErrors.push(value);
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
    let url;
    try { url = new URL(request.url()); } catch { return; }
    const loopback = [storefrontOrigin, adminOrigin].includes(url.origin);
    if (!loopback && !/^(?:data|blob|about):/iu.test(request.url())) diagnostics.externalOrigins.add(url.origin);
    if (!loopback && !["GET", "HEAD", "OPTIONS"].includes(request.method())) diagnostics.nonLoopbackMutations.push(`${request.method()} ${request.url()}`);
    if (loopback && request.method() === "PATCH" && /\/framing$/u.test(url.pathname)) diagnostics.adminPatchCount += 1;
  });
};

const capture = async (page, fileName, options = {}, metadata = {}) => {
  await page.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png", ...options });
  return record(fileName, { url: page.url(), viewport: page.viewport(), ...metadata });
};

const captureElement = async (page, selector, fileName, metadata = {}) => {
  await page.waitForSelector(selector, { visible: true, timeout });
  const element = await page.$(selector);
  assert.ok(element, `${selector} is required for ${fileName}.`);
  await element.evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
  await delay(180);
  await element.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png" });
  return record(fileName, { url: page.url(), viewport: page.viewport(), selector, ...metadata });
};

const captureElementTop = async (page, selector, fileName, aspectRatio, metadata = {}) => {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.$eval(selector, (node) => node.scrollIntoView({ block: "center", inline: "center" }));
  await delay(180);
  const bounds = await page.$eval(selector, (node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  });
  const clip = { x: bounds.x, y: bounds.y, width: bounds.width, height: Math.min(bounds.height, bounds.width / aspectRatio) };
  await page.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png", clip, captureBeyondViewport: true });
  return record(fileName, { url: page.url(), viewport: page.viewport(), selector, clip, ...metadata });
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const imageData = (filePath) => `data:image/${path.extname(filePath).slice(1) || "png"};base64,${fs.readFileSync(filePath).toString("base64")}`;

const renderBoard = async (browser, fileName, title, entries, columns = 2) => {
  const page = await browser.newPage();
  await page.setViewport({ width: columns === 2 ? 1600 : 2200, height: 1100, deviceScaleFactor: 1 });
  const figures = entries.map(({ source, label, note = "" }) => `<figure><img src="${imageData(source)}" alt=""><figcaption><strong>${escapeHtml(label)}</strong><span>${escapeHtml(note)}</span></figcaption></figure>`).join("");
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#eef3f6;color:#0b2439;font:14px Inter,"Segoe UI",sans-serif}header{margin-bottom:22px}h1{margin:0 0 6px;font-size:30px}p{margin:0;color:#5f7183}main{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:18px}figure{margin:0;padding:12px;background:#fff;border:1px solid #d7e0e7;border-radius:16px;box-shadow:0 8px 24px #102a4312}img{width:100%;height:430px;object-fit:contain;object-position:center;background:#f8fafb;border-radius:10px}figcaption{display:grid;gap:4px;padding:10px 2px 2px}strong{font-size:14px}span{font-size:12px;color:#607487}</style></head><body><header><h1>${escapeHtml(title)}</h1><p>Owner referansı ve gerçek Google Chrome yerel final runtime kanıtı</p></header><main>${figures}</main></body></html>`, { waitUntil: "load" });
  await capture(page, fileName, { fullPage: true }, { state: "reference-to-runtime comparison" });
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
      fs.rmSync(source);
      record(`${fileBase}.mp4`, { source: "Google Chrome DevTools screencast", codec: "H.264/yuv420p" });
    },
  };
};

const waitForStorefront = async (page, route, selector = "main") => {
  const response = await page.goto(`${storefrontOrigin}${route}`, { waitUntil: "domcontentloaded", timeout });
  if (response) assert.ok(response.status() < 400);
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.evaluate(() => document.fonts.ready);
  await delay(320);
};

const axeReview = async (page, label, target = null) => {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async (targetSelector) => {
    const context = targetSelector ? document.querySelector(targetSelector) : document;
    return window.axe.run(context, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
  }, typeof target === "string" ? target : null);
  const material = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  return { label, violationCount: result.violations.length, seriousCritical: material.length, material: material.map((item) => ({ id: item.id, impact: item.impact, targets: item.nodes.map((node) => node.target) })) };
};

const overlap = (first, second) => Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));

const productResponse = await fetch(`${storefrontOrigin}/api/products`);
assert.ok(productResponse.ok);
const productPayload = await productResponse.json();
const productValues = Array.isArray(productPayload) ? productPayload : productPayload.products || productPayload.data || [];
const karacaProduct = productValues.find((product) => /Karaca Amber Borosilikat/u.test(product.name) && Array.isArray(product.media) && product.media.length >= 3);
const hoverProduct = productValues.find((product) => product.slug === "owner-hover-dort-gorsel");
assert.ok(karacaProduct, "Karaca multi-media public product fixture is required.");
assert.ok(hoverProduct && hoverProduct.media.length === 4, "Deterministic four-media card fixture is required.");
const karacaCardSelector = `.customer-product-card:has(a[href="#/urun/${karacaProduct.slug}"])`;
const hoverCardSelector = `.customer-product-card:has(a[href="#/urun/${hoverProduct.slug}"])`;
const browserDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "novastore-main6y-r1-browser-"));
const uat = { governance: {}, indicators: {}, hover: {}, favorite: {}, pdp: {}, framing: {}, routes: {}, accessibility: {}, privacy: {} };
let browser;

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
  await adminPage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await adminPage.goto(`${adminOrigin}/`, { waitUntil: "domcontentloaded", timeout });
  await adminPage.waitForSelector('[data-testid="live-catalog"]', { visible: true, timeout });
  const adminRecorder = await startRecording(adminPage, "ADMIN-MAIN6Y-R1-DIRECT-CARD-FRAMING");
  await delay(700);
  await adminPage.click(`[data-catalog-operation="media"][data-product-id="${karacaProduct.id}"]`);
  await adminPage.waitForSelector('.catalog-card-framing__preview', { visible: true, timeout });
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing')?.dataset.framingState === "FRAMING_RECOMMENDED", { timeout });
  const initialFraming = await adminPage.evaluate(() => {
    const preview = document.querySelector('.catalog-card-framing__preview');
    const bounds = preview.getBoundingClientRect();
    const measurement = document.querySelector('.catalog-card-framing__measurement');
    return {
      state: document.querySelector('.catalog-card-framing').dataset.framingState,
      pill: document.querySelector('.catalog-card-framing__state').textContent.trim(),
      source: { width: measurement.naturalWidth, height: measurement.naturalHeight, url: measurement.currentSrc },
      viewport: { width: bounds.width, height: bounds.height, radius: getComputedStyle(preview).borderRadius },
      copy: document.querySelector('.catalog-card-framing__copy p').textContent.trim(),
    };
  });
  assert.equal(initialFraming.state, "FRAMING_RECOMMENDED");
  assert.ok(Math.abs(initialFraming.viewport.width / initialFraming.viewport.height - 1) < .01);
  assert.match(initialFraming.copy, /yalnız ürün kartında/u);
  await adminPage.$eval('.catalog-card-framing__workspace', (node) => node.scrollIntoView({ block: "center" }));
  await delay(300);
  await captureElement(adminPage, ".catalog-card-framing", "09-ADMIN-FRAMING-DIRECT-EDITOR.png", { state: initialFraming });

  const preview = await adminPage.$('.catalog-card-framing__preview');
  const previewBox = await preview.boundingBox();
  const beforeDrag = await preview.$eval('img', (image) => ({ objectPosition: image.style.objectPosition, transform: image.style.transform }));
  await adminPage.mouse.move(previewBox.x + previewBox.width * .5, previewBox.y + previewBox.height * .5);
  await adminPage.mouse.down();
  await adminPage.mouse.move(previewBox.x + previewBox.width * .68, previewBox.y + previewBox.height * .37, { steps: 14 });
  await adminPage.mouse.up();
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing')?.dataset.editorStatus === "DRAGGED", { timeout });
  await adminPage.click('button[aria-label="Kart görselini yakınlaştır"]');
  await adminPage.click('button[aria-label="Kart görselini yakınlaştır"]');
  await delay(320);
  const draggedFraming = await preview.$eval('img', (image) => ({ objectPosition: image.style.objectPosition, transform: image.style.transform }));
  assert.notEqual(draggedFraming.objectPosition, beforeDrag.objectPosition);
  assert.match(draggedFraming.transform, /scale\(1\.2\)/u);
  await captureElement(adminPage, ".catalog-card-framing", "10-ADMIN-FRAMING-DRAGGED.png", { state: draggedFraming });
  await adminPage.click('button[aria-label="Kart görselini uzaklaştır"]');
  await delay(350);
  await adminPage.click('.catalog-card-framing__actions .secondary-button');
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing')?.dataset.editorStatus === "RESET", { timeout });
  await adminPage.click('button[aria-label="Kart görselini yakınlaştır"]');
  await adminPage.click('button[aria-label="Kart görselini yakınlaştır"]');
  const resetBox = await preview.boundingBox();
  await adminPage.mouse.move(resetBox.x + resetBox.width * .5, resetBox.y + resetBox.height * .5);
  await adminPage.mouse.down();
  await adminPage.mouse.move(resetBox.x + resetBox.width * .62, resetBox.y + resetBox.height * .42, { steps: 10 });
  await adminPage.mouse.up();
  const finalDraft = await preview.$eval('img', (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  await adminPage.click('.catalog-card-framing__actions .primary-button');
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing')?.dataset.framingState === "CUSTOM_FRAMING_SAVED", { timeout });
  assert.equal(diagnostics.adminPatchCount, 1);
  const savedState = await adminPage.evaluate(() => ({ state: document.querySelector('.catalog-card-framing').dataset.framingState, status: document.querySelector('.catalog-card-framing').dataset.editorStatus, pill: document.querySelector('.catalog-card-framing__state').textContent.trim() }));
  assert.equal(savedState.status, "SAVED");
  const savedDraft = await adminPage.$eval('.catalog-card-framing__preview img', (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  await delay(650);
  await adminPage.click('[data-testid="catalog-media-dialog"] .modal-header .icon-button');
  await adminPage.waitForSelector('[data-testid="catalog-media-dialog"]', { hidden: true, timeout });
  await adminPage.click(`[data-catalog-operation="media"][data-product-id="${karacaProduct.id}"]`);
  await adminPage.waitForFunction(() => document.querySelector('.catalog-card-framing')?.dataset.editorStatus === "RELOADED", { timeout });
  const reloadedDraft = await adminPage.$eval('.catalog-card-framing__preview img', (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  assert.deepEqual(reloadedDraft, savedDraft);

  const classifyMedia = async (label, expectedState) => {
    await adminPage.$$eval('.data-table tbody tr', (rows, requestedLabel) => {
      const row = [...rows].find((candidate) => candidate.innerText.includes(requestedLabel));
      const button = [...row.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === "Kadraj");
      button?.click();
    }, label);
    await adminPage.waitForFunction((state) => document.querySelector('.catalog-card-framing')?.dataset.framingState === state, { timeout }, expectedState);
    return adminPage.evaluate(() => {
      const measurement = document.querySelector('.catalog-card-framing__measurement');
      return { state: document.querySelector('.catalog-card-framing').dataset.framingState, width: measurement.naturalWidth, height: measurement.naturalHeight };
    });
  };
  const squareState = await classifyMedia("Medya #71", "NO_FRAMING_NEEDED");
  const landscapeState = await classifyMedia("Medya #990099", "FRAMING_RECOMMENDED");
  assert.equal(squareState.width, squareState.height);
  assert.ok(landscapeState.width > landscapeState.height);
  const adminAccessibility = await axeReview(adminPage, "ADMIN_FRAMING_DIALOG");
  await adminPage.click('[data-testid="catalog-media-dialog"] .modal-header .icon-button');
  await adminPage.waitForSelector('[data-testid="catalog-media-dialog"]', { hidden: true, timeout });

  await waitForStorefront(adminPage, "/#/kategori/ev-yasam", karacaCardSelector);
  const savedCardStyle = await adminPage.$eval(`${karacaCardSelector} .customer-card-media-stage img.is-active`, (image) => ({ objectFit: image.style.objectFit, objectPosition: image.style.objectPosition, transform: image.style.transform, transformOrigin: image.style.transformOrigin }));
  assert.deepEqual(savedCardStyle, savedDraft);
  await captureElement(adminPage, karacaCardSelector, "11-ADMIN-FRAMING-SAVED-CARD.png", { state: savedCardStyle });
  await waitForStorefront(adminPage, `/#/urun/${karacaProduct.slug}`, ".runtime-product-media-stage img");
  const pdpAfterFraming = await adminPage.$eval('.runtime-product-media-stage img', (image) => ({ objectFit: getComputedStyle(image).objectFit, src: image.currentSrc, transform: getComputedStyle(image).transform, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }));
  assert.equal(pdpAfterFraming.objectFit, "contain");
  assert.equal(pdpAfterFraming.transform, "none");
  await captureElement(adminPage, ".runtime-product-gallery", "12-PDP-AFTER-CARD-FRAMING-FULL-ORIGINAL.png", { state: pdpAfterFraming });
  await delay(800);
  await adminRecorder.stop();
  uat.framing = { initialFraming, beforeDrag, draggedFraming, finalDraft, savedState, savedDraft, reloadedDraft, squareState, landscapeState, savedCardStyle, pdpAfterFraming };

  const cardPage = await browser.newPage();
  await configurePage(cardPage);
  await cardPage.setViewport({ width: 1280, height: 920, deviceScaleFactor: 1 });
  await waitForStorefront(cardPage, "/#/kategori/ev-yasam", hoverCardSelector);
  const hoverCard = await cardPage.$(hoverCardSelector);
  await hoverCard.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await captureElement(cardPage, hoverCardSelector, "01-MULTI-IMAGE-CARD-CLEAN.png", { state: "four-media card without text badge" });
  await captureElement(cardPage, `${hoverCardSelector} .product-card__media`, "02-MULTI-IMAGE-DOT-INDICATOR.png", { state: "compact bottom-center dots with full collision context" });
  await captureElementTop(cardPage, `${hoverCardSelector} .product-card__media`, "03-DISCOUNT-RIBBON-FINAL.png", 2.344, { state: "compact owner ribbon at the supplied reference crop ratio" });
  const indicatorGeometry = await cardPage.$eval(hoverCardSelector, (card) => {
    const rect = (selector) => {
      const bounds = card.querySelector(selector).getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    return {
      dots: card.querySelectorAll('.customer-card-media-zones i').length,
      text: card.querySelector('.customer-card-media-zones').textContent.trim(),
      indicator: rect('.customer-card-media-zones'),
      ribbon: rect('.product-badge.is-discount'),
      favorite: rect('.favorite-button'),
      stage: rect('.customer-card-media-stage'),
    };
  });
  assert.equal(indicatorGeometry.dots, 4);
  assert.equal(indicatorGeometry.text, "");
  assert.equal(overlap(indicatorGeometry.indicator, indicatorGeometry.ribbon), 0);
  assert.equal(overlap(indicatorGeometry.indicator, indicatorGeometry.favorite), 0);
  assert.equal(overlap(indicatorGeometry.ribbon, indicatorGeometry.favorite), 0);
  const cardText = await hoverCard.evaluate((node) => node.innerText);
  assert.doesNotMatch(cardText, /görsel\s*[·-]?\s*otomatik|otomatik\s*görsel/iu);

  const hoverStage = await hoverCard.$('.customer-card-media-stage');
  const hoverBox = await hoverStage.boundingBox();
  const hoverRecorder = await startRecording(cardPage, "CUSTOMER-MAIN6Y-R1-CARD-HOVER-SCRUB-AUTOPLAY");
  await cardPage.mouse.move(10, 10);
  await delay(550);
  await cardPage.mouse.move(hoverBox.x + hoverBox.width * .5, hoverBox.y + hoverBox.height * .5, { steps: 10 });
  await delay(620);
  const hoverSequence = [await hoverStage.evaluate((node) => Number(node.dataset.activeMedia))];
  await delay(1700);
  hoverSequence.push(await hoverStage.evaluate((node) => Number(node.dataset.activeMedia)));
  await cardPage.mouse.move(hoverBox.x + hoverBox.width * .07, hoverBox.y + hoverBox.height * .55, { steps: 8 });
  await delay(180);
  const scrubFirst = await hoverStage.evaluate((node) => Number(node.dataset.activeMedia));
  await cardPage.mouse.move(hoverBox.x + hoverBox.width * .94, hoverBox.y + hoverBox.height * .55, { steps: 12 });
  await delay(180);
  const scrubLast = await hoverStage.evaluate((node) => Number(node.dataset.activeMedia));
  await delay(620);
  const autoplayAfterScrub = await hoverStage.evaluate((node) => Number(node.dataset.activeMedia));
  await delay(1700);
  const autoplayAfterInterval = await hoverStage.evaluate((node) => Number(node.dataset.activeMedia));
  await cardPage.mouse.move(10, 10, { steps: 12 });
  await delay(250);
  const leaveReset = await hoverStage.evaluate((node) => Number(node.dataset.activeMedia));
  await hoverRecorder.stop();
  assert.ok(new Set(hoverSequence).size >= 2);
  assert.equal(scrubFirst, 0);
  assert.equal(scrubLast, 3);
  assert.equal(autoplayAfterScrub, 0);
  assert.equal(autoplayAfterInterval, 1);
  assert.equal(leaveReset, 0);
  uat.indicators = { ...indicatorGeometry, badgeTextOccurrenceCount: 0 };
  uat.hover = { dwellMs: 500, intervalMs: 1650, hoverSequence, scrubFirst, scrubLast, autoplayAfterScrub, autoplayAfterInterval, leaveReset };

  const favoriteRecorder = await startRecording(cardPage, "CUSTOMER-MAIN6Y-R1-FAVORITE-MICROINTERACTION");
  const favoriteButton = await hoverCard.$('.favorite-button');
  const favoriteBox = await favoriteButton.boundingBox();
  await cardPage.mouse.move(10, 10);
  await delay(500);
  await cardPage.mouse.move(favoriteBox.x + favoriteBox.width / 2, favoriteBox.y + favoriteBox.height / 2, { steps: 10 });
  await delay(550);
  await favoriteButton.click();
  await cardPage.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-pressed") === "true", { timeout }, `${hoverCardSelector} .favorite-button`);
  await delay(160);
  const favoriteActive = await favoriteButton.evaluate((button) => ({ ariaPressed: button.getAttribute("aria-pressed"), color: getComputedStyle(button).color, target: [button.getBoundingClientRect().width, button.getBoundingClientRect().height], motionClass: button.className, svgFill: getComputedStyle(button.querySelector('svg')).fill, animation: getComputedStyle(button.querySelector('svg')).animationName }));
  assert.equal(favoriteActive.ariaPressed, "true");
  assert.match(favoriteActive.color, /rgb\((?:220, 38, 38|185, 28, 28)\)/u);
  assert.deepEqual(favoriteActive.target, [44, 44]);
  await captureElement(cardPage, hoverCardSelector, "04-FAVORITE-FINAL-RED.png", { state: favoriteActive });
  await delay(800);
  await favoriteRecorder.stop();

  const reducedPage = await browser.newPage();
  await configurePage(reducedPage);
  await reducedPage.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await waitForStorefront(reducedPage, "/#/kategori/ev-yasam", hoverCardSelector);
  const reducedMotion = await reducedPage.$eval(`${hoverCardSelector} .favorite-button svg`, (icon) => ({ animation: getComputedStyle(icon).animationName, duration: getComputedStyle(icon).animationDuration }));
  assert.equal(reducedMotion.animation, "none");
  await reducedPage.close();
  uat.favorite = { active: favoriteActive, reducedMotion, reviewerJudgment: "YES — polished marketplace fill, elastic pop and restrained glow; no confetti, stars or circle." };

  const pdpPage = await browser.newPage();
  await configurePage(pdpPage);
  await pdpPage.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await waitForStorefront(pdpPage, `/#/urun/${karacaProduct.slug}`, ".runtime-product-media-stage img");
  const mainMedia = await pdpPage.$eval('.runtime-product-media-stage img', (image) => {
    const bounds = image.getBoundingClientRect();
    const stage = image.closest('.runtime-product-media-stage').getBoundingClientRect();
    return { objectFit: getComputedStyle(image).objectFit, transform: getComputedStyle(image).transform, src: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, bounds: { width: bounds.width, height: bounds.height }, stage: { width: stage.width, height: stage.height } };
  });
  assert.equal(mainMedia.objectFit, "contain");
  assert.equal(mainMedia.transform, "none");
  await captureElement(pdpPage, ".runtime-product-gallery", "05-PDP-FULL-ORIGINAL.png", { state: mainMedia });
  await captureElement(pdpPage, ".pdp-store-attribution", "13-PDP-STORE-SECTION.png", { state: "seller store name and canonical route" });

  const pdpRecorder = await startRecording(pdpPage, "CUSTOMER-MAIN6Y-R1-PDP-GALLERY-LIGHTBOX");
  await delay(700);
  const mediaTrigger = await pdpPage.$('.runtime-product-media-stage');
  await mediaTrigger.click();
  await pdpPage.waitForSelector('.runtime-media-lightbox[role="presentation"]', { visible: true, timeout });
  const lightboxDefault = await pdpPage.evaluate(() => {
    const image = document.querySelector('.runtime-media-lightbox__viewport img');
    const dialog = document.querySelector('.runtime-media-lightbox__dialog');
    return { role: dialog.getAttribute('role'), modal: dialog.getAttribute('aria-modal'), percent: document.querySelector('.runtime-media-lightbox__zoom-controls span').textContent.trim(), objectFit: getComputedStyle(image).objectFit, transform: image.style.transform, position: document.querySelector('.runtime-media-lightbox__position').textContent.trim(), rootIsolated: [...document.querySelectorAll('#root > *')].every((node) => node.inert && node.getAttribute('aria-hidden') === 'true') };
  });
  assert.deepEqual({ role: lightboxDefault.role, modal: lightboxDefault.modal, percent: lightboxDefault.percent, objectFit: lightboxDefault.objectFit, rootIsolated: lightboxDefault.rootIsolated }, { role: "dialog", modal: "true", percent: "%100", objectFit: "contain", rootIsolated: true });
  assert.match(lightboxDefault.transform, /scale\(1\)/u);
  await capture(pdpPage, "06-PDP-LIGHTBOX-FULL.png", {}, { state: lightboxDefault });
  await pdpPage.click('button[aria-label="Görseli yakınlaştır"]');
  await pdpPage.click('button[aria-label="Görseli yakınlaştır"]');
  await delay(350);
  const zoomed = await pdpPage.$eval('.runtime-media-lightbox__viewport img', (image) => ({ transform: image.style.transform, percent: document.querySelector('.runtime-media-lightbox__zoom-controls span').textContent.trim() }));
  assert.match(zoomed.transform, /scale\(2\)/u);
  await capture(pdpPage, "07-PDP-LIGHTBOX-ZOOM.png", {}, { state: zoomed });
  await pdpPage.keyboard.press("0");
  await pdpPage.click('button[aria-label="Sonraki medyayı göster"]');
  await delay(350);
  const nextMedia = await pdpPage.evaluate(() => ({ position: document.querySelector('.runtime-media-lightbox__position').textContent.trim(), src: document.querySelector('.runtime-media-lightbox__viewport img').currentSrc, activeThumbnail: document.querySelector('.runtime-product-thumbnails button.is-active')?.getAttribute('aria-label') }));
  assert.equal(nextMedia.position, "2 / 3");
  assert.equal(nextMedia.activeThumbnail, "2. medyayı göster");
  await capture(pdpPage, "08-PDP-LIGHTBOX-NEXT-MEDIA.png", {}, { state: nextMedia });
  await pdpPage.click('button[aria-label="Sonraki medyayı göster"]');
  await delay(500);
  await pdpPage.keyboard.press("ArrowLeft");
  await delay(450);
  await pdpPage.keyboard.press("ArrowRight");
  await delay(450);
  await pdpPage.keyboard.press("+");
  await delay(350);
  const lightboxViewport = await pdpPage.$('.runtime-media-lightbox__viewport');
  const lightboxBox = await lightboxViewport.boundingBox();
  await pdpPage.mouse.move(lightboxBox.x + lightboxBox.width * .5, lightboxBox.y + lightboxBox.height * .5);
  await pdpPage.mouse.down();
  await pdpPage.mouse.move(lightboxBox.x + lightboxBox.width * .62, lightboxBox.y + lightboxBox.height * .42, { steps: 12 });
  await pdpPage.mouse.up();
  const panned = await lightboxViewport.$eval('img', (image) => image.style.transform);
  assert.doesNotMatch(panned, /translate3d\(0px, 0px/u);
  await pdpPage.keyboard.press("-");
  await pdpPage.keyboard.press("0");
  await delay(450);
  const resetLightbox = await lightboxViewport.$eval('img', (image) => image.style.transform);
  assert.equal(resetLightbox, "translate3d(0px, 0px, 0px) scale(1)");
  for (let index = 0; index < 7; index += 1) await pdpPage.keyboard.press("Tab");
  const focusContained = await pdpPage.evaluate(() => document.querySelector('.runtime-media-lightbox__dialog').contains(document.activeElement));
  assert.equal(focusContained, true);
  await pdpPage.keyboard.press("Escape");
  await pdpPage.waitForSelector('.runtime-media-lightbox', { hidden: true, timeout });
  const focusReturned = await pdpPage.evaluate(() => document.activeElement?.classList.contains('runtime-product-media-stage'));
  assert.equal(focusReturned, true);
  await delay(600);
  await pdpRecorder.stop();
  uat.pdp = { mainMedia, lightboxDefault, zoomed, nextMedia, panned, resetLightbox, focusContained, focusReturned, selectedMediaPreserved: await pdpPage.$eval('.runtime-product-thumbnails button.is-active', (button) => button.getAttribute('aria-label')) };

  await waitForStorefront(pdpPage, "/#/yardim", ".help-hero .lucide-life-buoy");
  await captureElement(pdpPage, ".help-hero", "14-HELP-CENTER-LIFEBUOY.png", { state: "canonical Lucide LifeBuoy" });
  await waitForStorefront(pdpPage, "/#/kategori/ev-yasam", ".all-categories-button");
  await pdpPage.click('.all-categories-button');
  await pdpPage.waitForSelector('#category-drawer', { visible: true, timeout });
  const drawerWordmark = await pdpPage.$eval('#category-drawer .brand', (brand) => ({ nova: brand.querySelector('span')?.textContent.trim(), store: brand.querySelector('strong')?.textContent.trim(), overflow: brand.scrollWidth - brand.clientWidth }));
  assert.deepEqual({ nova: drawerWordmark.nova, store: drawerWordmark.store }, { nova: "Nova", store: "Store" });
  await captureElement(pdpPage, "#category-drawer", "15-DRAWER-WORDMARK.png", { state: drawerWordmark });
  await pdpPage.keyboard.press("Escape");

  const routeCases = [
    ["HOME", "/#/", "main"],
    ["CATEGORY", "/#/kategori/ev-yasam", ".customer-product-card"],
    ["SEARCH", "/#/arama?q=owner", "main"],
    ["COLLECTION", "/#/koleksiyon/firsatlar", "main"],
    ["PUBLIC_STORE", `/#/magaza/${karacaProduct.store.slug}`, ".public-store-products"],
    ["PDP", `/#/urun/${karacaProduct.slug}`, ".runtime-product-gallery"],
    ["HELP", "/#/yardim", ".help-hero"],
  ];
  for (const [label, route, selector] of routeCases) {
    await waitForStorefront(pdpPage, route, selector);
    const metrics = await pdpPage.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, main: Boolean(document.querySelector('main')), cards: document.querySelectorAll('.customer-product-card').length }));
    assert.ok(metrics.overflow <= 1, `${label} must not overflow.`);
    assert.equal(metrics.main, true);
    uat.routes[label] = { route, ...metrics };
  }

  const accessibilityPage = await browser.newPage();
  await configurePage(accessibilityPage);
  const axeCases = [
    ["CATEGORY", "/#/kategori/ev-yasam", ".customer-product-card"],
    ["PDP", `/#/urun/${karacaProduct.slug}`, ".runtime-product-gallery"],
    ["PUBLIC_STORE", `/#/magaza/${karacaProduct.store.slug}`, ".public-store-products"],
    ["HELP", "/#/yardim", ".help-hero"],
  ];
  for (const [label, route, selector] of axeCases) {
    await waitForStorefront(accessibilityPage, route, selector);
    uat.accessibility[label] = await axeReview(accessibilityPage, label);
  }
  await waitForStorefront(accessibilityPage, `/#/urun/${karacaProduct.slug}`, ".runtime-product-media-stage");
  await accessibilityPage.click('.runtime-product-media-stage');
  await accessibilityPage.waitForSelector('.runtime-media-lightbox__dialog', { visible: true, timeout });
  uat.accessibility.PDP_LIGHTBOX = await axeReview(accessibilityPage, "PDP_LIGHTBOX");
  uat.accessibility.ADMIN = adminAccessibility;
  const axeMaterialCount = Object.values(uat.accessibility).reduce((sum, result) => sum + result.seriousCritical, 0);
  assert.equal(axeMaterialCount, 0, `Axe serious/critical findings: ${JSON.stringify(uat.accessibility)}`);

  await renderBoard(browser, "DISCOUNT-RIBBON-OWNER-COMPARISON.png", "İndirim etiketi owner karşılaştırması", [
    { source: ribbonReference, label: "Owner görsel yönü", note: "Kompakt turuncu etiket, dikey merkezlenmiş metin" },
    { source: path.join(evidenceDirectory, "03-DISCOUNT-RIBBON-FINAL.png"), label: "NovaStore final", note: "26px masaüstü / 25px dar kart; minimal fotoğraf engeli" },
  ]);
  await renderBoard(browser, "ADMIN-FRAMING-OWNER-COMPARISON.png", "Doğrudan kadraj editörü owner karşılaştırması", [
    { source: framingReference, label: "Owner etkileşim referansı", note: "Sürükle, +/−, belirgin maske, onay" },
    { source: path.join(evidenceDirectory, "09-ADMIN-FRAMING-DIRECT-EDITOR.png"), label: "NovaStore final", note: "Aynı etkileşim modeli; daire yerine gerçek 1:1 kart viewport'u" },
  ]);

  const requiredScreens = [
    ["01-MULTI-IMAGE-CARD-CLEAN.png", "Çok görselli temiz kart"],
    ["02-MULTI-IMAGE-DOT-INDICATOR.png", "Kompakt alt-orta noktalar"],
    ["03-DISCOUNT-RIBBON-FINAL.png", "Kompakt indirim etiketi"],
    ["04-FAVORITE-FINAL-RED.png", "Profesyonel kırmızı favori"],
    ["05-PDP-FULL-ORIGINAL.png", "PDP tam orijinal"],
    ["06-PDP-LIGHTBOX-FULL.png", "Lightbox tam orijinal"],
    ["07-PDP-LIGHTBOX-ZOOM.png", "Lightbox yakınlaştırma"],
    ["08-PDP-LIGHTBOX-NEXT-MEDIA.png", "Lightbox sonraki medya"],
    ["09-ADMIN-FRAMING-DIRECT-EDITOR.png", "Admin doğrudan kadraj"],
    ["10-ADMIN-FRAMING-DRAGGED.png", "Admin sürüklenmiş kadraj"],
    ["11-ADMIN-FRAMING-SAVED-CARD.png", "Kaydedilmiş kart sonucu"],
    ["12-PDP-AFTER-CARD-FRAMING-FULL-ORIGINAL.png", "Kadraj sonrası PDP orijinal"],
    ["13-PDP-STORE-SECTION.png", "PDP mağaza atfı"],
    ["14-HELP-CENTER-LIFEBUOY.png", "Help Center LifeBuoy"],
    ["15-DRAWER-WORDMARK.png", "Drawer wordmark"],
    ["DISCOUNT-RIBBON-OWNER-COMPARISON.png", "Owner ribbon karşılaştırması"],
    ["ADMIN-FRAMING-OWNER-COMPARISON.png", "Owner kadraj karşılaştırması"],
  ];
  await renderBoard(browser, "MAIN6Y-R1-OWNER-CONTACT-SHEET.png", "NovaStore Main-6Y R1 owner kapanış kanıtı", requiredScreens.map(([fileName, label]) => ({ source: path.join(evidenceDirectory, fileName), label })), 4);

  assert.ok([...diagnostics.externalOrigins].every((origin) => origin === "https://res.cloudinary.com"), `Unexpected external origins: ${[...diagnostics.externalOrigins].join(",")}`);
  assert.deepEqual(diagnostics.nonLoopbackMutations, []);
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.deepEqual(diagnostics.consoleErrors, []);
  assert.deepEqual(diagnostics.requestFailures, []);
  assert.deepEqual(diagnostics.responseErrors, []);
  uat.privacy = { livePublicAccess: "GET_HEAD_ONLY", productionAuth: "NOT_USED", productionDatabase: "NOT_USED", productionMutation: 0, staging: "NOT_USED", externalOrigins: [...diagnostics.externalOrigins], nonLoopbackMutations: diagnostics.nonLoopbackMutations };

  const result = {
    result: "PASS",
    browser: { product: "Google Chrome", executable: chromePath, userAgent: await browser.userAgent() },
    storefrontOrigin,
    adminOrigin,
    liveProductSampleCount: productValues.length,
    products: { karaca: { id: karacaProduct.id, slug: karacaProduct.slug, mediaCount: karacaProduct.media.length }, hover: { id: hoverProduct.id, slug: hoverProduct.slug, mediaCount: hoverProduct.media.length } },
    diagnostics: { ...diagnostics, externalOrigins: [...diagnostics.externalOrigins] },
    uat,
    artifacts,
  };
  fs.writeFileSync(path.join(evidenceDirectory, "main6y-r1-browser-uat.json"), `${JSON.stringify(result, null, 2)}\n`);
  record("main6y-r1-browser-uat.json", { state: "real Google Chrome UAT machine-readable result" });
  console.log("MAIN6Y_R1_REAL_GOOGLE_CHROME_UAT=PASS");
  console.log(`ADMIN_PATCH_COUNT=${diagnostics.adminPatchCount}`);
  console.log(`AXE_SERIOUS_CRITICAL=${axeMaterialCount}`);
  console.log(`HOVER_SEQUENCE=${[...hoverSequence, scrubFirst, scrubLast, autoplayAfterScrub, autoplayAfterInterval, leaveReset].join(",")}`);
  console.log(`EVIDENCE_DIRECTORY=${evidenceDirectory}`);
} catch (error) {
  console.error("MAIN6Y_R1_UAT_DIAGNOSTICS", JSON.stringify({ ...diagnostics, externalOrigins: [...diagnostics.externalOrigins] }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
}
