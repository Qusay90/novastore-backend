import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const normalizeLoopbackReviewOrigin = (value) => {
  const message = "NOVASTORE_REVIEW_STOREFRONT_ORIGIN must be an explicit loopback HTTP origin with no credentials, path, query or fragment.";
  let candidate;
  try {
    candidate = new URL(value);
  } catch {
    throw new Error(message);
  }
  if (
    candidate.protocol !== "http:"
    || !["127.0.0.1", "localhost"].includes(candidate.hostname)
    || candidate.username
    || candidate.password
    || candidate.pathname !== "/"
    || candidate.search
    || candidate.hash
  ) throw new Error(message);
  return candidate.origin;
};
const origin = normalizeLoopbackReviewOrigin(process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5273");
const evidenceDirectory = path.resolve(process.env.NOVASTORE_R5_EVIDENCE_DIR || "");
const requireFromStorefront = createRequire(path.join(root, "storefront-commerce-pro", "package.json"));
const puppeteer = requireFromStorefront("puppeteer-core");
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const timeout = 35_000;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const localStorefrontArtifactSha256 = sha256(fs.readFileSync(path.join(root, "frontend", "commerce-pro", "index.html")));

assert.ok(process.env.NOVASTORE_R5_EVIDENCE_DIR, "NOVASTORE_R5_EVIDENCE_DIR is required.");
const relativeEvidencePath = path.relative(root, evidenceDirectory);
assert.ok(relativeEvidencePath.startsWith("..") && !path.isAbsolute(relativeEvidencePath), "R5 evidence must be outside the repository.");
fs.mkdirSync(evidenceDirectory, { recursive: true });

const requiredScreenshots = Object.freeze([
  "typography-before-after-contact-sheet.png",
  "help-icons-contact-sheet.png",
  "cart-drawer-desktop.png",
  "cart-drawer-mobile.png",
  "multi-media-pdp-desktop.png",
  "multi-media-pdp-mobile.png",
  "authenticated-account-review.png",
  "authenticated-orders-review.png",
  "r5-pre-exhaustive-audit-contact-sheet.png",
]);

const allowedDisposableMutations = new Set([
  "PUT /api/shared-state/cart",
  "PUT /api/shared-state/checkout",
  "POST /api/campaigns/quote",
  "POST /api/favorites/sync",
  "POST /api/users/logout",
  "POST /api/messages/send",
]);

const findChromeExecutable = () => {
  const candidates = [
    process.env.NOVASTORE_CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executablePath, "Google Chrome is required for R5 browser evidence.");
  return executablePath;
};

const readMeta = async () => {
  const response = await fetch(`${origin}/__review/meta`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200, "Official storefront review metadata must be reachable.");
  const meta = await response.json();
  assert.equal(meta.mode, "INTEGRATED_COMMERCE_PRO");
  assert.match(meta.artifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(meta.artifactSha256, localStorefrontArtifactSha256, "Official runtime metadata must match the current local storefront artifact bytes.");
  assert.deepEqual(meta.counters, { external: 0, mutation: 0, database: 0 });
  const artifactResponse = await fetch(`${origin}/`, { method: "HEAD", signal: AbortSignal.timeout(5_000) });
  assert.equal(artifactResponse.status, 200, "Official storefront artifact must be reachable.");
  assert.equal(artifactResponse.headers.get("x-novastore-artifact-sha256"), localStorefrontArtifactSha256, "Served artifact header must match the current local storefront artifact bytes.");
  return meta;
};

const configurePage = async (page) => {
  const network = {
    requests: 0,
    localReads: 0,
    allowedMutations: [],
    deniedMutations: [],
    externalRequests: [],
    paymentRequests: [],
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    responseErrors: [],
  };
  const allowedOrigin = new URL(origin).origin;
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("pageerror", (error) => network.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") network.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    if (!failure.includes("ERR_ABORTED")) network.requestFailures.push(`${request.method()} ${request.url()} :: ${failure}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) network.responseErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  page.on("request", (request) => {
    network.requests += 1;
    const method = request.method().toUpperCase();
    const url = request.url();
    const settle = (operation) => operation.catch(() => {});
    if (/^(?:data|blob|about):/i.test(url)) return settle(request.continue());
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      network.externalRequests.push(`${method} ${url}`);
      return settle(request.abort("blockedbyclient"));
    }
    if (parsed.origin !== allowedOrigin) {
      network.externalRequests.push(`${method} ${url}`);
      return settle(request.abort("blockedbyclient"));
    }
    if (/paytr|iyzico|payments\/initialize|checkout\/submit/i.test(parsed.pathname)) {
      network.paymentRequests.push(`${method} ${parsed.pathname}`);
      return settle(request.abort("blockedbyclient"));
    }
    if (["GET", "HEAD"].includes(method)) {
      network.localReads += 1;
      return settle(request.continue());
    }
    const methodKey = `${method} ${parsed.pathname}`;
    const allowedFavorite = ["POST", "DELETE"].includes(method) && /^\/api\/favorites\/\d+$/.test(parsed.pathname);
    if (allowedDisposableMutations.has(methodKey) || allowedFavorite) {
      network.allowedMutations.push(methodKey);
      return settle(request.continue());
    }
    network.deniedMutations.push(methodKey);
    return settle(request.abort("blockedbyclient"));
  });
  return network;
};

const waitForFonts = (page) => page.evaluate(() => document.fonts.ready);
const waitForText = (page, selector, text) => page.waitForFunction(
  (candidate, expected) => [...document.querySelectorAll(candidate)].some((node) => node.textContent.includes(expected)),
  { timeout },
  selector,
  text,
);
const waitForImages = (page, selector) => page.waitForFunction(
  (candidate) => {
    const images = [...document.querySelectorAll(candidate)];
    return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
  },
  { timeout },
  selector,
);

const records = [];
const recordFile = (fileName, metadata = {}) => {
  const absolutePath = path.join(evidenceDirectory, fileName);
  const bytes = fs.readFileSync(absolutePath);
  const record = { fileName, sha256: sha256(bytes), bytes: bytes.length, gitHead, ...metadata };
  const existingIndex = records.findIndex((item) => item.fileName === fileName);
  if (existingIndex >= 0) records.splice(existingIndex, 1, record);
  else records.push(record);
  return record;
};

const capture = async (page, fileName, metadata = {}, options = {}) => {
  const absolutePath = path.join(evidenceDirectory, fileName);
  await page.screenshot({ path: absolutePath, type: "png", ...options });
  return recordFile(fileName, { url: page.url(), viewport: page.viewport(), ...metadata });
};

const screenshotBuffer = async (page, options = {}) => Buffer.from(await page.screenshot({ type: "png", ...options }));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const renderContactSheet = async (browser, { fileName, title, subtitle, entries, metadata = {} }) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1100, deviceScaleFactor: 1 });
  const cards = entries.map((entry) => {
    const bytes = entry.buffer || fs.readFileSync(path.join(evidenceDirectory, entry.fileName));
    return `<figure><img src="data:image/png;base64,${bytes.toString("base64")}" alt=""><figcaption><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.caption || "")}</span></figcaption></figure>`;
  }).join("");
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:42px;background:#eef2f5;color:#102a43;font-family:Inter,"Segoe UI",sans-serif}header{margin-bottom:26px}h1{margin:0 0 8px;font-size:34px;letter-spacing:-.025em}p{margin:0;color:#526579;font-size:15px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}figure{margin:0;padding:13px;border:1px solid #d3dce5;border-radius:16px;background:#fff;box-shadow:0 12px 30px rgba(16,42,67,.08)}img{display:block;width:100%;height:470px;object-fit:contain;object-position:top;background:#f8fafc;border-radius:10px}figcaption{display:grid;gap:5px;padding:11px 3px 2px}figcaption strong{font-size:15px}figcaption span{overflow-wrap:anywhere;color:#62758a;font-size:12px}</style></head><body><header><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></header><main>${cards}</main></body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(evidenceDirectory, fileName), type: "png", fullPage: true });
  await page.close();
  return recordFile(fileName, metadata);
};

const renderTypographySheet = async (browser, screenshot, styles, meta) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1040, deviceScaleFactor: 1 });
  const rows = styles.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.selector)}</td><td>${escapeHtml(item.before)}</td><td><strong>${escapeHtml(item.fontWeight)}</strong><br>${escapeHtml(item.fontSize)} / ${escapeHtml(item.lineHeight)}</td></tr>`).join("");
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:40px;background:#edf2f6;color:#102a43;font-family:Inter,"Segoe UI",sans-serif}h1{margin:0;font-size:33px}header p{margin:8px 0 24px;color:#5d7085}.layout{display:grid;grid-template-columns:1.15fr .85fr;gap:22px;align-items:start}.visual,.measurements{padding:14px;border:1px solid #d1dae3;border-radius:16px;background:#fff;box-shadow:0 12px 30px rgba(16,42,67,.08)}img{display:block;width:100%;height:700px;object-fit:contain;object-position:top;background:#f8fafc;border-radius:10px}.badge{display:inline-flex;margin-bottom:12px;padding:7px 10px;border-radius:999px;background:#e9f7ef;color:#11754e;font-size:12px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:13px 10px;border-bottom:1px solid #e2e8ee;text-align:left;vertical-align:top}th{color:#53677b;font-size:11px;text-transform:uppercase}td:nth-child(3){color:#9b4a31}td:nth-child(4){color:#116a4a}code{font-size:11px;overflow-wrap:anywhere}</style></head><body><header><h1>Tipografi önce / sonra doğrulaması</h1><p>“Önce” sütunu reddedilen yaygın 700–900 ağırlık sınıfını; “Şimdi” sütunu yalnızca resmî entegre runtime’dan okunan computed style değerlerini gösterir.</p></header><div class="layout"><section class="visual"><span class="badge">Şimdi · gerçek runtime · ${escapeHtml(meta.artifactSha256.slice(0, 16))}</span><img src="data:image/png;base64,${screenshot.toString("base64")}" alt=""></section><section class="measurements"><table><thead><tr><th>Yüzey</th><th>Selector</th><th>Önce</th><th>Şimdi</th></tr></thead><tbody>${rows}</tbody></table></section></div></body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(evidenceDirectory, "typography-before-after-contact-sheet.png"), type: "png", fullPage: true });
  await page.close();
  return recordFile("typography-before-after-contact-sheet.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, source: "computed styles from current integrated runtime" });
};

const gotoRoute = async (page, route, selector, text = null) => {
  const response = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded", timeout });
  if (response) assert.ok(response.status() < 400, `${route} must return a successful document response.`);
  assert.equal(new URL(page.url()).origin, new URL(origin).origin, `${route} must remain on the official loopback origin.`);
  await page.waitForSelector(selector, { visible: true, timeout });
  if (text) await waitForText(page, selector, text);
  await waitForFonts(page);
  await delay(120);
  const state = await page.evaluate(() => ({
    title: document.title,
    hash: location.hash,
    notFound: Boolean(document.querySelector(".not-found")) || document.body.textContent.includes("Bu sayfayı bulamadık"),
    mainText: document.querySelector("#main-content")?.textContent.trim().slice(0, 180) || "",
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.equal(state.notFound, false, `${route} must not resolve to the not-found surface.`);
  assert.ok(state.mainText.length > 0, `${route} must render meaningful main content.`);
  assert.ok(state.overflow <= 1, `${route} must not overflow horizontally.`);
  return state;
};

const touch = async (page, selector) => {
  const center = await page.$eval(selector, (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.tap(center.x, center.y);
};

const meta = await readMeta();
const browserDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "novastore-r5-review-browser-"));
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: "new",
    userDataDir: browserDirectory,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync", "--disable-default-apps"],
  });
  const page = await browser.newPage();
  const network = await configurePage(page);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // Establish one isolated, short-lived synthetic customer session in the clean browser profile.
  const bootstrapResponse = await page.goto(`${origin}/__review/customer`, { waitUntil: "domcontentloaded", timeout });
  assert.equal(bootstrapResponse.status(), 200);
  await page.waitForSelector(".account-content", { visible: true, timeout });
  await waitForText(page, ".account-content", "hesabın hazır");
  const authSession = await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem("nova_user_info") || "null");
    return {
      token: localStorage.getItem("nova_user_token") || "",
      userId: Number(user?.id),
      email: user?.email || "",
      expiresAt: Number(localStorage.getItem("novastore_review_expires_at")),
      cartKey: user?.id ? `novastore_cart_${user.id}` : "",
      favoriteKey: user?.id ? `novastore_favs_${user.id}` : "",
      hash: location.hash,
    };
  });
  assert.match(authSession.token, /^local-review-[A-Za-z0-9_-]{40,}$/);
  assert.ok(Number.isSafeInteger(authSession.userId) && authSession.userId >= 1_900_000_000);
  assert.equal(authSession.email, "review.customer@local.invalid");
  assert.ok(authSession.expiresAt > Date.now() && authSession.expiresAt <= Date.now() + 31 * 60 * 1000);
  assert.equal(authSession.hash, "#/hesabim");
  const isolatedKeys = await page.evaluate(({ cartKey, favoriteKey }) => ({
    cart: localStorage.getItem(cartKey),
    favorites: localStorage.getItem(favoriteKey),
  }), authSession);
  assert.equal(isolatedKeys.cart, "[]");
  assert.equal(isolatedKeys.favorites, "[]");

  await waitForImages(page, ".account-content img");
  await capture(page, "authenticated-account-review.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, authenticatedUserId: authSession.userId }, { fullPage: true });
  await gotoRoute(page, "/#/hesabim/siparisler", ".order-list", "Sipariş No: 7002");
  await waitForImages(page, ".order-list img");
  await capture(page, "authenticated-orders-review.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, authenticatedUserId: authSession.userId }, { fullPage: true });

  // Typography is validated from computed styles; no source-only inference is accepted.
  await gotoRoute(page, "/#/", ".home-hero");
  await page.waitForSelector(".product-card", { visible: true, timeout });
  const typography = await page.evaluate(() => {
    const read = (label, selector, before) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      return { label, selector, before, fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontSize: style.fontSize, lineHeight: style.lineHeight };
    };
    return [
      read("Gövde", "body", "700–900 yaygın"),
      read("Açıklama", ".home-hero__copy p", "700 yaygın"),
      read("Navigasyon", ".category-navigation a", "700–800 yaygın"),
      read("Ürün adı", ".product-card h3", "700–800 yaygın"),
      read("Buton", ".product-card .card-add-button", "800–900 yaygın"),
      read("Ana başlık", ".home-hero h1", "800–900 yaygın"),
      read("Fiyat", ".product-card .price-block strong", "800–900 yaygın"),
    ].filter(Boolean);
  });
  assert.equal(typography.length, 7);
  typography.forEach((style) => assert.match(style.fontFamily, /Inter/i, `${style.selector} must use Inter.`));
  const typographyByLabel = Object.fromEntries(typography.map((style) => [style.label, style]));
  assert.equal(Number(typographyByLabel["Gövde"].fontWeight), 400);
  assert.equal(Number(typographyByLabel["Açıklama"].fontWeight), 400);
  assert.equal(Number(typographyByLabel["Navigasyon"].fontWeight), 500);
  assert.equal(Number(typographyByLabel["Ürün adı"].fontWeight), 500);
  assert.equal(Number(typographyByLabel["Buton"].fontWeight), 600);
  assert.equal(Number(typographyByLabel["Ana başlık"].fontWeight), 700);
  assert.equal(Number(typographyByLabel["Fiyat"].fontWeight), 700);
  assert.ok(Number.parseFloat(typographyByLabel["Gövde"].lineHeight) / Number.parseFloat(typographyByLabel["Gövde"].fontSize) >= 1.4);
  const typographyScreenshot = await screenshotBuffer(page);
  await renderTypographySheet(browser, typographyScreenshot, typography, meta);

  // Coherent local service icon family: inline vectors, distinct glyphs, no emoji or remote image dependency.
  await gotoRoute(page, "/#/yardim", ".help-grid", "Siparişler");
  const helpIcons = await page.evaluate(() => {
    const icons = [...document.querySelectorAll(".nova-service-icon")];
    const signatures = icons.map((node) => node.querySelector(".nova-service-icon__glyph")?.innerHTML || "");
    const text = document.querySelector(".help-page")?.textContent || "";
    return {
      count: icons.length,
      uniqueGlyphs: new Set(signatures).size,
      allInlineSvg: icons.every((node) => node.querySelectorAll("svg").length === 2 && !node.querySelector("img, use[href^='http']")),
      emojiCount: (text.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length,
      heroIcon: Boolean(document.querySelector(".help-hero > .nova-service-icon")),
      topicIcons: document.querySelectorAll(".help-grid .nova-service-icon").length,
      botIcon: Boolean(document.querySelector(".assistant-fab .nova-service-icon.is-compact")),
    };
  });
  assert.ok(helpIcons.count >= 6);
  assert.ok(helpIcons.uniqueGlyphs >= 6);
  assert.equal(helpIcons.allInlineSvg, true);
  assert.equal(helpIcons.emojiCount, 0);
  assert.equal(helpIcons.heroIcon, true);
  assert.equal(helpIcons.topicIcons, 4);
  assert.equal(helpIcons.botIcon, true);
  const helpBuffer = await screenshotBuffer(page);
  await gotoRoute(page, "/#/iade-degisim", ".return-exchange-hero", "İade veya değişim");
  const returnBuffer = await screenshotBuffer(page);
  await gotoRoute(page, "/#/siparis-takibi", ".connected-tracking-form", "Sipariş numarası");
  const trackingBuffer = await screenshotBuffer(page);
  await gotoRoute(page, "/#/iletisim", ".support-panel", "Destek mesajları");
  const contactBuffer = await screenshotBuffer(page);
  await renderContactSheet(browser, {
    fileName: "help-icons-contact-sheet.png",
    title: "NovaStore yardım simge ailesi",
    subtitle: `${helpIcons.count} inline servis simgesi · ${helpIcons.uniqueGlyphs} farklı glyph · emoji ve uzak asset yok`,
    entries: [
      { label: "Yardım merkezi", caption: "yardım + sipariş + teslimat + ödeme + iade + NovaBot", buffer: helpBuffer },
      { label: "İade & değişim", caption: "aynı birleşik servis simgesi dili", buffer: returnBuffer },
      { label: "Sipariş takibi", caption: "teslimat glyph'i · doğrulanmış müşteri rotası", buffer: trackingBuffer },
      { label: "İletişim", caption: "destek glyph'i · yerel mesaj sözleşmesi", buffer: contactBuffer },
    ],
    metadata: { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, assertions: helpIcons },
  });

  // PDP: four local media, selection state, image load, modal lock/focus/escape.
  const productRoute = "/#/urun/apple-iphone-15-128-gb";
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await gotoRoute(page, productRoute, ".runtime-product-thumbnails");
  await waitForImages(page, ".runtime-product-gallery img");
  const desktopMediaBefore = await page.evaluate(() => ({
    count: document.querySelectorAll(".runtime-product-thumbnails > button").length,
    sources: [...document.querySelectorAll(".runtime-product-thumbnails img")].map((image) => image.currentSrc || image.src),
    loaded: [...document.querySelectorAll(".runtime-product-gallery img")].every((image) => image.complete && image.naturalWidth > 0),
    active: [...document.querySelectorAll(".runtime-product-thumbnails > button")].findIndex((node) => node.getAttribute("aria-pressed") === "true"),
  }));
  assert.equal(desktopMediaBefore.count, 4);
  assert.equal(new Set(desktopMediaBefore.sources).size, 4);
  assert.equal(desktopMediaBefore.loaded, true);
  await page.click('.runtime-product-thumbnails > button[aria-label="3. medyayı göster"]');
  await page.waitForFunction(() => document.querySelector('.runtime-product-thumbnails > button[aria-label="3. medyayı göster"]')?.getAttribute("aria-pressed") === "true", { timeout });
  const desktopSelectedSrc = await page.$eval(".runtime-product-media-stage img", (image) => image.currentSrc || image.src);
  assert.equal(desktopSelectedSrc, desktopMediaBefore.sources[2]);
  await capture(page, "multi-media-pdp-desktop.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, mediaCount: desktopMediaBefore.count, selectedIndex: 2 });
  await page.click(".runtime-product-media-stage");
  await page.waitForSelector(".runtime-media-lightbox__dialog", { visible: true, timeout });
  const desktopLightbox = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains("is-locked"),
    focusInside: Boolean(document.activeElement?.closest(".runtime-media-lightbox__dialog")),
    imageLoaded: (() => { const image = document.querySelector(".runtime-media-lightbox__dialog img"); return Boolean(image?.complete && image.naturalWidth > 0); })(),
  }));
  assert.deepEqual(desktopLightbox, { bodyLocked: true, focusInside: true, imageLoaded: true });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".runtime-media-lightbox", { hidden: true, timeout });
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-locked")), false);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".runtime-product-thumbnails", { visible: true, timeout });
  await waitForImages(page, ".runtime-product-gallery img");
  await touch(page, '.runtime-product-thumbnails > button[aria-label="4. medyayı göster"]');
  await page.waitForFunction(() => document.querySelector('.runtime-product-thumbnails > button[aria-label="4. medyayı göster"]')?.getAttribute("aria-pressed") === "true", { timeout });
  const mobileMedia = await page.evaluate(() => ({
    count: document.querySelectorAll(".runtime-product-thumbnails > button").length,
    active: [...document.querySelectorAll(".runtime-product-thumbnails > button")].findIndex((node) => node.getAttribute("aria-pressed") === "true"),
    loaded: [...document.querySelectorAll(".runtime-product-gallery img")].every((image) => image.complete && image.naturalWidth > 0),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.deepEqual(mobileMedia, { count: 4, active: 3, loaded: true, overflow: 0 });
  await capture(page, "multi-media-pdp-mobile.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, mediaCount: 4, selectedIndex: 3 });
  await touch(page, ".runtime-product-media-stage");
  await page.waitForSelector(".runtime-media-lightbox__dialog", { visible: true, timeout });
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-locked")), true);
  await touch(page, ".runtime-media-lightbox__close");
  await page.waitForSelector(".runtime-media-lightbox", { hidden: true, timeout });

  // Start cart behavior from the authenticated session's empty state.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(".purchase-row .primary-button", { visible: true, timeout });
  await page.click(".purchase-row .primary-button");
  await page.waitForFunction(() => document.querySelector('.header-actions .header-action:last-child')?.getAttribute("aria-label")?.includes("1 ürün"), { timeout });
  await delay(150);
  const cartTrigger = ".header-actions .header-action:last-child";
  await page.click(cartTrigger);
  await page.waitForSelector(".cart-drawer", { visible: true, timeout });
  await delay(320);
  const cartOpened = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains("is-locked"),
    focusOnClose: document.activeElement?.getAttribute("aria-label") === "Sepeti kapat",
    productLink: document.querySelector(".cart-line__product-link")?.getAttribute("href"),
    quantity: document.querySelector(".cart-line .quantity-control span")?.textContent.trim(),
    hasRemove: Boolean(document.querySelector('.cart-line > button[aria-label*="sepetten çıkar"]')),
    checkoutText: document.querySelector(".cart-drawer__footer .primary-button")?.textContent.trim(),
  }));
  assert.equal(cartOpened.bodyLocked, true);
  assert.equal(cartOpened.focusOnClose, true);
  assert.equal(cartOpened.productLink, "#/urun/apple-iphone-15-128-gb");
  assert.equal(cartOpened.quantity, "1");
  assert.equal(cartOpened.hasRemove, true);
  assert.match(cartOpened.checkoutText, /Sepete git/);
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
  const trappedAfterReverseTab = await page.evaluate(() => Boolean(document.activeElement?.closest(".cart-drawer")));
  assert.equal(trappedAfterReverseTab, true);
  for (let index = 0; index < 12; index += 1) await page.keyboard.press("Tab");
  const trappedAfterForwardTabs = await page.evaluate(() => Boolean(document.activeElement?.closest(".cart-drawer")));
  assert.equal(trappedAfterForwardTabs, true);
  await page.click('.cart-line .quantity-control button[aria-label="Adedi artır"]');
  await page.waitForFunction(() => document.querySelector(".cart-line .quantity-control span")?.textContent.trim() === "2", { timeout });
  await capture(page, "cart-drawer-desktop.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, quantity: 2, inputMode: "keyboard+pointer" });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".cart-drawer", { hidden: true, timeout });
  await delay(80);
  const afterEscape = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains("is-locked"),
    focusReturned: document.activeElement === document.querySelector(".header-actions .header-action:last-child"),
  }));
  assert.deepEqual(afterEscape, { bodyLocked: false, focusReturned: true });
  await page.click(cartTrigger);
  await page.waitForSelector(".cart-drawer", { visible: true, timeout });
  await delay(320);
  await page.mouse.click(12, 450);
  await page.waitForSelector(".cart-drawer", { hidden: true, timeout });
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-locked")), false);
  await page.click(cartTrigger);
  await page.waitForSelector(".cart-drawer", { visible: true, timeout });
  await delay(320);
  await page.click('.cart-line > button[aria-label*="sepetten çıkar"]');
  await page.waitForSelector(".cart-empty", { visible: true, timeout });
  await page.click('.drawer-head button[aria-label="Sepeti kapat"]');
  await page.waitForSelector(".cart-drawer", { hidden: true, timeout });

  // Re-add and verify drawer CTA navigation, then re-add once more for mobile/touch and checkout routes.
  await page.click(".purchase-row .primary-button");
  await page.waitForFunction(() => document.querySelector('.header-actions .header-action:last-child')?.getAttribute("aria-label")?.includes("1 ürün"), { timeout });
  await page.click(cartTrigger);
  await page.waitForSelector(".cart-drawer", { visible: true, timeout });
  await delay(320);
  await page.click(".cart-drawer__footer .primary-button");
  await page.waitForFunction(() => location.hash === "#/sepet", { timeout });
  await page.waitForSelector(".cart-page-grid", { visible: true, timeout });
  assert.equal(await page.$(".cart-drawer"), null);
  const secureCheckoutControl = await page.$eval(".checkout-button", (node) => ({ tagName: node.tagName, disabled: node.disabled, text: node.textContent.trim() }));
  assert.deepEqual(secureCheckoutControl, { tagName: "BUTTON", disabled: false, text: "Güvenli ödemeye geç" });
  await page.click(".checkout-button");
  await page.waitForFunction(() => location.hash === "#/odeme/teslimat", { timeout });
  await page.waitForSelector(".checkout-layout", { visible: true, timeout });
  await waitForText(page, ".checkout-layout", "Sipariş Özeti");
  const persistedCartBeforeMobile = await page.evaluate(async () => {
    const response = await fetch("/api/shared-state/cart", { headers: { Authorization: `Bearer ${localStorage.getItem("nova_user_token")}` } });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(persistedCartBeforeMobile.status, 200);
  assert.equal(persistedCartBeforeMobile.body?.payload?.items?.length, 1, `Checkout handoff must preserve one disposable cart line: ${JSON.stringify(persistedCartBeforeMobile.body)}`);

  await gotoRoute(page, productRoute, ".purchase-row .primary-button");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded", timeout });
  await page.waitForSelector(cartTrigger, { visible: true, timeout });
  await delay(1_000);
  const mobileHydration = await page.evaluate(async () => {
    const token = localStorage.getItem("nova_user_token");
    const response = await fetch("/api/shared-state/cart", { headers: { Authorization: `Bearer ${token}` } });
    return {
      ariaLabel: document.querySelector('.header-actions .header-action:last-child')?.getAttribute("aria-label") || "",
      localCart: localStorage.getItem(`novastore_cart_${JSON.parse(localStorage.getItem("nova_user_info") || "null")?.id}`),
      serverStatus: response.status,
      serverBody: await response.json(),
    };
  });
  assert.match(mobileHydration.ariaLabel, /[1-9]\d* ürün/, `Authenticated cart must hydrate after a clean mobile reload: ${JSON.stringify(mobileHydration)}`);
  await page.evaluate(() => { window.__r5TouchStarts = 0; document.addEventListener("touchstart", () => { window.__r5TouchStarts += 1; }, { capture: true }); });
  await touch(page, cartTrigger);
  await page.waitForSelector(".cart-drawer", { visible: true, timeout });
  await delay(320);
  const mobileDrawerInitialQuantity = Number(await page.$eval(".cart-line .quantity-control span", (node) => node.textContent.trim()));
  await touch(page, '.cart-line .quantity-control button[aria-label="Adedi artır"]');
  await page.waitForFunction((initial) => Number(document.querySelector(".cart-line .quantity-control span")?.textContent) === initial + 1, { timeout }, mobileDrawerInitialQuantity);
  const mobileCart = await page.evaluate(() => ({
    touchStarts: window.__r5TouchStarts,
    bodyLocked: document.body.classList.contains("is-locked"),
    focusInside: Boolean(document.activeElement?.closest(".cart-drawer")),
    quantity: Number(document.querySelector(".cart-line .quantity-control span")?.textContent),
    drawerRight: Math.round(document.querySelector(".cart-drawer").getBoundingClientRect().right),
    viewportWidth: innerWidth,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  assert.ok(mobileCart.touchStarts >= 2);
  assert.equal(mobileCart.bodyLocked, true);
  assert.equal(mobileCart.focusInside, true);
  assert.equal(mobileCart.quantity, mobileDrawerInitialQuantity + 1);
  assert.equal(mobileCart.drawerRight, mobileCart.viewportWidth);
  assert.equal(mobileCart.overflow, 0);
  await capture(page, "cart-drawer-mobile.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, quantity: mobileCart.quantity, inputMode: "touch" });
  await touch(page, '.cart-line > button[aria-label*="sepetten çıkar"]');
  await page.waitForSelector(".cart-empty", { visible: true, timeout });
  await touch(page, '.drawer-head button[aria-label="Sepeti kapat"]');
  await page.waitForSelector(".cart-drawer", { hidden: true, timeout });
  assert.equal(await page.evaluate(() => document.body.classList.contains("is-locked")), false);
  await touch(page, ".mobile-purchase-bar button");
  await page.waitForFunction(() => document.querySelector('.header-actions .header-action:last-child')?.getAttribute("aria-label")?.includes("1 ürün"), { timeout });
  await delay(180);

  // Exercise the owner-authored route map from the actual runtime. Bootstrap was exercised above.
  const routeMarkdown = fs.readFileSync(path.join(root, "OWNER-MANUAL-REVIEW-ROUTES.md"), "utf8");
  const declaredRoutes = [...routeMarkdown.matchAll(/^\| `([^`]+)`/gm)].map((match) => match[1]);
  assert.equal(declaredRoutes.length, 18, "The owner route map must declare exactly 18 review routes.");
  assert.equal(new Set(declaredRoutes).size, declaredRoutes.length, "The owner route map must not contain duplicate routes.");
  assert.ok(declaredRoutes.includes("/__review/customer"));
  const routeChecks = new Map([
    ["/#/", [".home-hero", null]],
    ["/#/kategori/elektronik", [".plp-results .product-card", null]],
    [productRoute, [".runtime-product-thumbnails", null]],
    ["/#/sepet", ["#main-content h1", "Sepetim"]],
    ["/#/yardim", [".help-hero", "Nasıl yardımcı olabiliriz?"]],
    ["/#/iade-degisim", [".return-exchange-hero", "İade veya değişim"]],
    ["/#/hesabim", [".account-content", "hesabın hazır"]],
    ["/#/hesabim/adresler", [".account-content h1", "Adreslerim"]],
    ["/#/hesabim/siparisler", [".order-list", "Sipariş No: 7002"]],
    ["/#/hesabim/siparisler/7002", [".account-content h1", "Sipariş #7002"]],
    ["/#/favoriler", [".favorites-page", "Favorilerim"]],
    ["/#/hesabim/kuponlar", [".connected-coupon-grid", "LOCAL10"]],
    ["/#/hesabim/bildirimler", [".connected-notifications", "kargoya verildi"]],
    ["/#/hesabim/guvenlik", [".security-form", "Mevcut şifre"]],
    ["/#/siparis-takibi", [".connected-tracking-form", "Sipariş numarası"]],
    ["/#/iletisim", [".support-panel", "Destek mesajları"]],
    ["/#/odeme/teslimat", [".checkout-layout", "Sipariş Özeti"]],
  ]);
  assert.equal(routeChecks.size + 1, declaredRoutes.length);
  const routeResultsByRoute = new Map([["/__review/customer", { route: "/__review/customer", status: "PASS", finalHash: authSession.hash, bootstrap: true }]]);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  for (const route of declaredRoutes) {
    if (route === "/__review/customer") continue;
    const check = routeChecks.get(route);
    assert.ok(check, `No browser route assertion is defined for ${route}.`);
    const state = await gotoRoute(page, route, check[0], check[1]);
    routeResultsByRoute.set(route, { route, status: "PASS", finalHash: state.hash, selector: check[0], text: check[1], overflow: state.overflow });
  }
  const routeResults = declaredRoutes.map((route) => routeResultsByRoute.get(route));
  assert.deepEqual(routeResults.map((item) => item.route), declaredRoutes);

  // Final browser and runtime fail-closed assertions.
  await delay(250);
  assert.deepEqual(network.externalRequests, []);
  assert.deepEqual(network.deniedMutations, []);
  assert.deepEqual(network.paymentRequests, []);
  assert.deepEqual(network.pageErrors, []);
  assert.deepEqual(network.consoleErrors, []);
  assert.deepEqual(network.requestFailures, []);
  assert.deepEqual(network.responseErrors, []);
  assert.ok(network.allowedMutations.includes("PUT /api/shared-state/cart"));
  assert.ok(network.allowedMutations.includes("POST /api/campaigns/quote"));
  assert.ok(network.allowedMutations.every((entry) => allowedDisposableMutations.has(entry) || /^(?:POST|DELETE) \/api\/favorites\/\d+$/.test(entry)));
  const finalMeta = await readMeta();
  assert.equal(finalMeta.artifactSha256, meta.artifactSha256, "Runtime artifact must not change during evidence capture.");
  assert.deepEqual(finalMeta.counters, { external: 0, mutation: 0, database: 0 });

  await renderContactSheet(browser, {
    fileName: "r5-pre-exhaustive-audit-contact-sheet.png",
    title: "NovaStore R5R · pre-exhaustive audit kanıt paketi",
    subtitle: `Resmî entegre artifact ${meta.artifactSha256.slice(0, 16)} · ${declaredRoutes.length}/${declaredRoutes.length} rota · uzak ağ/DB 0`,
    entries: [
      { label: "Tipografi", caption: "runtime computed styles", fileName: "typography-before-after-contact-sheet.png" },
      { label: "Yardım ikonları", caption: "inline ve tutarlı servis ailesi", fileName: "help-icons-contact-sheet.png" },
      { label: "Sepet drawer · masaüstü", caption: "klavye, focus trap, adet, kapatma", fileName: "cart-drawer-desktop.png" },
      { label: "Sepet drawer · mobil", caption: "touch, adet, kaldırma, yeniden etkileşim", fileName: "cart-drawer-mobile.png" },
      { label: "PDP · masaüstü", caption: "4 yerel medya, seçim, lightbox", fileName: "multi-media-pdp-desktop.png" },
      { label: "PDP · mobil", caption: "4 yerel medya, touch, lightbox", fileName: "multi-media-pdp-mobile.png" },
      { label: "Girişli hesap", caption: `izole sentetik müşteri ${authSession.userId}`, fileName: "authenticated-account-review.png" },
      { label: "Girişli siparişler", caption: "sipariş 7002", fileName: "authenticated-orders-review.png" },
    ],
    metadata: { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, routePass: `${routeResults.length}/${declaredRoutes.length}` },
  });

  requiredScreenshots.forEach((fileName) => assert.equal(fs.existsSync(path.join(evidenceDirectory, fileName)), true, `${fileName} must exist.`));
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitHead,
    origin,
    runtime: meta,
    assertions: {
      authSession: {
        userId: authSession.userId,
        email: authSession.email,
        expiresAt: authSession.expiresAt,
        cartKey: authSession.cartKey,
        favoriteKey: authSession.favoriteKey,
        hash: authSession.hash,
        tokenScheme: "local-review-random",
        tokenBytes: Buffer.byteLength(authSession.token),
      },
      isolatedKeys,
      typography,
      helpIcons,
      desktopMedia: { ...desktopMediaBefore, selectedSrc: desktopSelectedSrc, lightbox: desktopLightbox },
      mobileMedia,
      cart: { cartOpened, trappedAfterReverseTab, trappedAfterForwardTabs, afterEscape, mobileCart },
      routes: routeResults,
      routePass: `${routeResults.length}/${declaredRoutes.length}`,
      network: {
        requests: network.requests,
        localReads: network.localReads,
        allowedMutationCount: network.allowedMutations.length,
        allowedMutations: network.allowedMutations,
        externalRequests: network.externalRequests.length,
        deniedMutations: network.deniedMutations.length,
        paymentRequests: network.paymentRequests.length,
        pageErrors: network.pageErrors.length,
        consoleErrors: network.consoleErrors.length,
        requestFailures: network.requestFailures.length,
        responseErrors: network.responseErrors.length,
        databaseConnections: finalMeta.counters.database,
      },
    },
    screenshots: records,
  };
  fs.writeFileSync(path.join(evidenceDirectory, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);

  console.log("R5_OFFICIAL_RUNTIME_BROWSER_EVIDENCE=PASS");
  console.log(`EVIDENCE_DIRECTORY=${evidenceDirectory}`);
  console.log(`ARTIFACT_SHA256=${meta.artifactSha256}`);
  console.log(`ROUTES=${routeResults.length}/${declaredRoutes.length}`);
  console.log(`SCREENSHOTS=${records.length}`);
  console.log(`NETWORK_REQUESTS=${network.requests}`);
  console.log(`LOCAL_READS=${network.localReads}`);
  console.log(`ALLOWED_DISPOSABLE_MUTATIONS=${network.allowedMutations.length}`);
  console.log(`EXTERNAL_REQUESTS=${network.externalRequests.length}`);
  console.log(`DENIED_MUTATIONS=${network.deniedMutations.length}`);
  console.log(`PAYMENT_REQUESTS=${network.paymentRequests.length}`);
  console.log(`DATABASE_CONNECTIONS=${finalMeta.counters.database}`);
  for (const record of records) console.log(`EVIDENCE_SHA256 ${record.fileName} ${record.sha256}`);
} finally {
  if (browser) await browser.close();
  const resolvedBrowserDirectory = path.resolve(browserDirectory);
  const resolvedTempRoot = path.resolve(os.tmpdir());
  const normalize = (value) => process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value;
  assert.equal(normalize(path.dirname(resolvedBrowserDirectory)), normalize(resolvedTempRoot));
  assert.match(path.basename(resolvedBrowserDirectory), /^novastore-r5-review-browser-[A-Za-z0-9_-]+$/);
  if (fs.existsSync(resolvedBrowserDirectory)) fs.rmSync(resolvedBrowserDirectory, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
  assert.equal(fs.existsSync(resolvedBrowserDirectory), false);
}
