import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5273";
const evidenceDirectory = path.resolve(process.env.NOVASTORE_R4_EVIDENCE_DIR || "");
const requireFromStorefront = createRequire(path.join(root, "storefront-commerce-pro", "package.json"));
const puppeteer = requireFromStorefront("puppeteer-core");
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const timeout = 30_000;

assert.ok(process.env.NOVASTORE_R4_EVIDENCE_DIR, "NOVASTORE_R4_EVIDENCE_DIR is required.");
assert.ok(path.relative(root, evidenceDirectory).startsWith(".."), "Evidence must be outside the repository.");
fs.mkdirSync(evidenceDirectory, { recursive: true });

const findChromeExecutable = () => {
  const candidates = [
    process.env.NOVASTORE_CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(executable, "Google Chrome is required for R4 browser evidence.");
  return executable;
};

const readMeta = async () => {
  const response = await fetch(`${origin}/__review/meta`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(response.status, 200);
  const meta = await response.json();
  assert.equal(meta.mode, "INTEGRATED_COMMERCE_PRO");
  assert.match(meta.artifactSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(meta.counters, { external: 0, mutation: 0, database: 0 });
  return meta;
};

const configurePage = async (page) => {
  const evidence = { external: [], mutation: [], payment: [], pageErrors: [], consoleErrors: [] };
  const allowedOrigin = new URL(origin).origin;
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") evidence.consoleErrors.push(message.text()); });
  page.on("request", (request) => {
    const method = request.method().toUpperCase();
    const url = request.url();
    const settle = (operation) => operation.catch(() => {});
    if (/^(?:data|blob|about):/i.test(url)) return settle(request.continue());
    let parsed;
    try { parsed = new URL(url); } catch { evidence.external.push(`${method} ${url}`); return settle(request.abort("blockedbyclient")); }
    if (parsed.origin !== allowedOrigin) { evidence.external.push(`${method} ${url}`); return settle(request.abort("blockedbyclient")); }
    if (!["GET", "HEAD"].includes(method)) { evidence.mutation.push(`${method} ${parsed.pathname}`); return settle(request.abort("blockedbyclient")); }
    if (/paytr|iyzico|payment|checkout\/submit/i.test(parsed.pathname)) { evidence.payment.push(`${method} ${parsed.pathname}`); return settle(request.abort("blockedbyclient")); }
    settle(request.continue());
  });
  return evidence;
};

const waitForText = (page, selector, text) => page.waitForFunction(
  (candidate, expected) => [...document.querySelectorAll(candidate)].some((node) => node.textContent.includes(expected)),
  { timeout }, selector, text,
);

const records = [];
const capture = async (page, name, metadata, options = {}) => {
  const absolutePath = path.join(evidenceDirectory, name);
  await page.screenshot({ path: absolutePath, type: "png", ...options });
  const bytes = fs.readFileSync(absolutePath);
  records.push({ fileName: name, absolutePath, sha256: sha256(bytes), bytes: bytes.length, gitHead, url: page.url(), viewport: page.viewport(), ...metadata });
};

const comparisonBottom = async (page) => page.evaluate(() => {
  const scroll = document.querySelector(".comparison-scroll");
  const rows = [...document.querySelectorAll(".comparison-fact-row")];
  const finalRow = rows.at(-1);
  if (!scroll || !finalRow) return null;
  scroll.scrollTop = scroll.scrollHeight;
  const container = scroll.getBoundingClientRect();
  const row = finalRow.getBoundingClientRect();
  const clippedText = [...finalRow.querySelectorAll("strong, span")].filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.top < container.top - .5 || rect.bottom > container.bottom + .5 || node.scrollWidth > node.clientWidth + 1;
  }).length;
  return {
    scrollTop: scroll.scrollTop,
    maxScrollTop: scroll.scrollHeight - scroll.clientHeight,
    finalRowTop: row.top,
    finalRowBottom: row.bottom,
    containerTop: container.top,
    containerBottom: container.bottom,
    fullyVisible: row.top >= container.top - .5 && row.bottom <= container.bottom + .5,
    clippedText,
  };
});

const openComparison = async (page) => {
  await page.goto(`${origin}/#/kategori/elektronik/telefon/cep-telefonu`, { waitUntil: "networkidle0", timeout });
  await page.waitForSelector(".product-card .compare-button:not([disabled])", { visible: true, timeout });
  const available = await page.$$(".product-card .compare-button:not([disabled])");
  assert.ok(available.length >= 2, "At least two comparison controls are required.");
  await page.evaluate(() => [...document.querySelectorAll(".product-card .compare-button")].find((node) => !node.disabled && node.getAttribute("aria-pressed") === "false")?.click());
  await page.waitForFunction(() => document.querySelectorAll(".compare-button[aria-pressed=true]").length === 1, { timeout });
  await page.evaluate(() => [...document.querySelectorAll(".product-card .compare-button")].find((node) => !node.disabled && node.getAttribute("aria-pressed") === "false")?.click());
  await page.waitForFunction(() => document.querySelectorAll(".compare-button[aria-pressed=true]").length === 2, { timeout });
  await page.waitForSelector(".comparison-open:not([disabled])", { visible: true, timeout });
  await page.click(".comparison-open");
  await page.waitForSelector(".comparison-dialog", { visible: true, timeout });
};

const closeComparison = async (page) => {
  await page.click(".comparison-dialog header .icon-button");
  await page.waitForSelector(".comparison-dialog", { hidden: true, timeout });
  if (await page.$(".comparison-clear")) {
    await page.$eval(".comparison-clear", (node) => node.click());
    await page.waitForSelector(".comparison-tray", { hidden: true, timeout });
  }
};

const renderSheet = async (browser, meta) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1100, deviceScaleFactor: 1 });
  const items = records.map((record) => `<figure><img src="data:image/png;base64,${fs.readFileSync(path.join(evidenceDirectory, record.fileName)).toString("base64")}" alt=""><figcaption><strong>${record.fileName.replace(/\.png$/, "")}</strong><span>${record.url}</span></figcaption></figure>`).join("");
  await page.setContent(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:42px;background:#eef1f5;color:#132238;font-family:Inter,Segoe UI,sans-serif}h1{margin:0;font-size:34px}p{color:#526174}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}figure{margin:0;padding:13px;border:1px solid #d4dce5;border-radius:16px;background:#fff}img{display:block;width:100%;height:480px;object-fit:contain;object-position:top;background:#f8fafc;border-radius:10px}figcaption{display:grid;gap:4px;padding:10px 3px 2px}span{overflow-wrap:anywhere;color:#627085;font-size:12px}</style></head><body><h1>NovaStore Storefront R4 insan inceleme paketi</h1><p>Resmî entegre artifact · ${meta.artifactSha256.slice(0, 16)} · ${gitHead.slice(0, 12)}</p><main>${items}</main></body></html>`, { waitUntil: "load" });
  await page.screenshot({ path: path.join(evidenceDirectory, "storefront-r4-human-review-contact-sheet.png"), type: "png", fullPage: true });
  const bytes = fs.readFileSync(path.join(evidenceDirectory, "storefront-r4-human-review-contact-sheet.png"));
  records.push({ fileName: "storefront-r4-human-review-contact-sheet.png", absolutePath: path.join(evidenceDirectory, "storefront-r4-human-review-contact-sheet.png"), sha256: sha256(bytes), bytes: bytes.length, gitHead, url: `${origin}/`, viewport: page.viewport(), runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
  await page.close();
};

const meta = await readMeta();
const browserDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "novastore-r4-review-browser-"));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: findChromeExecutable(), headless: "new", userDataDir: browserDirectory, args: ["--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--disable-sync"] });
  const page = await browser.newPage();
  const network = await configurePage(page);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await openComparison(page);
  await capture(page, "comparison-desktop-top.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
  const desktopBottom = await comparisonBottom(page);
  assert.ok(desktopBottom?.fullyVisible, "Desktop final comparison row must be fully visible at scroll end.");
  assert.equal(desktopBottom.clippedText, 0, "Desktop final comparison row text must not clip.");
  await capture(page, "comparison-desktop-bottom.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
  await closeComparison(page);

  for (const viewport of [{ width: 1024, height: 768, deviceScaleFactor: 1 }, { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, { width: 360, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true }]) {
    await page.setViewport(viewport);
    await openComparison(page);
    const bottom = await comparisonBottom(page);
    assert.ok(bottom?.fullyVisible, `${viewport.width}px final comparison row must be fully visible at scroll end.`);
    assert.equal(bottom.clippedText, 0, `${viewport.width}px final comparison row text must not clip.`);
    if (viewport.width === 390) await capture(page, "comparison-mobile-bottom.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
    await closeComparison(page);
  }

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/#/yardim`, { waitUntil: "networkidle0", timeout });
  await waitForText(page, ".help-hero h1", "Nasıl yardımcı olabiliriz?");
  const checkHelp = async () => page.$eval(".help-hero h1", (heading) => {
    const rect = heading.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  const helpDesktop = await checkHelp();
  assert.ok(helpDesktop.left >= 0 && helpDesktop.right <= helpDesktop.viewport, "Desktop Help heading must fit the viewport.");
  assert.equal(helpDesktop.overflow, 0, "Desktop Help page must not overflow horizontally.");
  await capture(page, "help-center-1440.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
  for (const viewport of [{ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }, { width: 360, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true }]) {
    await page.setViewport(viewport);
    await page.reload({ waitUntil: "networkidle0", timeout });
    const help = await checkHelp();
    assert.ok(help.left >= 0 && help.right <= help.viewport, `${viewport.width}px Help heading must fit the viewport.`);
    assert.equal(help.overflow, 0, `${viewport.width}px Help page must not overflow horizontally.`);
    await capture(page, `help-center-${viewport.width}.png`, { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
  }

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/#/iade-degisim`, { waitUntil: "networkidle0", timeout });
  await waitForText(page, ".return-exchange-page h1", "İade veya değişim sürecini netleştir");
  const returnRoute = await page.evaluate(() => ({ footerHref: [...document.querySelectorAll(".site-footer a")].find((node) => node.textContent.trim() === "İade & değişim")?.getAttribute("href"), hasWorkflowDisclaimer: document.body.textContent.includes("tam backend akışı") }));
  assert.equal(returnRoute.footerHref, "#/iade-degisim");
  assert.equal(returnRoute.hasWorkflowDisclaimer, true);
  await capture(page, "return-exchange-page.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry }, { fullPage: true });
  const footer = await page.$(".site-footer");
  assert.ok(footer);
  await footer.screenshot({ path: path.join(evidenceDirectory, "footer-return-exchange-link.png"), type: "png" });
  const footerBytes = fs.readFileSync(path.join(evidenceDirectory, "footer-return-exchange-link.png"));
  records.push({ fileName: "footer-return-exchange-link.png", absolutePath: path.join(evidenceDirectory, "footer-return-exchange-link.png"), sha256: sha256(footerBytes), bytes: footerBytes.length, gitHead, url: page.url(), viewport: page.viewport(), runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });

  await page.goto(`${origin}/#/yardim`, { waitUntil: "networkidle0", timeout });
  await page.waitForSelector(".assistant-fab .novabot-mark svg", { visible: true, timeout });
  const novaBot = await page.$eval(".assistant-fab", (node) => ({ label: node.getAttribute("aria-label"), focusable: node.tabIndex >= 0, hasVector: Boolean(node.querySelector(".novabot-mark svg")) }));
  assert.equal(novaBot.label, "NovaBot alışveriş asistanını aç");
  assert.equal(novaBot.focusable, true);
  assert.equal(novaBot.hasVector, true);
  await capture(page, "novabot-icon-desktop.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "networkidle0", timeout });
  await capture(page, "novabot-icon-mobile.png", { runtimeMode: meta.mode, artifactSha256: meta.artifactSha256, sourceEntry: meta.sourceEntry });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const reducedMotion = await page.$eval(".assistant-fab", (node) => getComputedStyle(node).transitionDuration);
  assert.ok(Number.parseFloat(reducedMotion) <= 0.001, `Reduced-motion transition must be effectively zero, received ${reducedMotion}.`);

  assert.deepEqual(network.external, []);
  assert.deepEqual(network.mutation, []);
  assert.deepEqual(network.payment, []);
  assert.deepEqual(network.pageErrors, []);
  assert.deepEqual(network.consoleErrors, []);
  const finalMeta = await readMeta();
  assert.deepEqual(finalMeta.counters, { external: 0, mutation: 0, database: 0 });
  await renderSheet(browser, meta);
  fs.writeFileSync(path.join(evidenceDirectory, "evidence.json"), `${JSON.stringify({ schemaVersion: 1, gitHead, origin, runtime: meta, assertions: { desktopBottom, helpDesktop, returnRoute, novaBot, reducedMotion, remoteHttpRequests: 0, remoteDatabaseConnections: 0 }, screenshots: records }, null, 2)}\n`);
  console.log("COMPARISON_BOTTOM_ROW_FULLY_VISIBLE=YES");
  console.log("COMPARISON_CLIPPED_TEXT_COUNT=0");
  console.log("COMPARISON_SCROLL_END_BROWSER_SMOKE=PASS");
  console.log("HELP_HERO_DESKTOP_390_360_BROWSER_SMOKE=PASS");
  console.log("FOOTER_RETURN_EXCHANGE_ROUTE_BROWSER_SMOKE=PASS");
  console.log("NOVABOT_ICON_BROWSER_SMOKE=PASS");
  console.log(`EVIDENCE_DIRECTORY=${evidenceDirectory}`);
} finally {
  if (browser) await browser.close();
  const resolved = path.resolve(browserDirectory);
  const tempRoot = path.resolve(os.tmpdir());
  assert.equal(path.dirname(resolved).toLocaleLowerCase("en-US"), tempRoot.toLocaleLowerCase("en-US"));
  assert.match(path.basename(resolved), /^novastore-r4-review-browser-[A-Za-z0-9_-]+$/);
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
}
