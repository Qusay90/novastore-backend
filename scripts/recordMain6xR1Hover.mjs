import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromStorefront = createRequire(path.join(root, "storefront-commerce-pro", "package.json"));
const puppeteer = requireFromStorefront("puppeteer-core");
const origin = new URL(process.env.NOVASTORE_REVIEW_STOREFRONT_ORIGIN || "http://127.0.0.1:5283").origin;
const output = path.resolve(process.env.NOVASTORE_MAIN6X_R1_HOVER_VIDEO || "");
const ffmpegPath = path.resolve(process.env.NOVASTORE_MAIN6X_R1_FFMPEG || "");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(process.env.NOVASTORE_MAIN6X_R1_HOVER_VIDEO, "Hover video output is required.");
assert.ok(fs.existsSync(ffmpegPath), "A task-owned ffmpeg executable is required.");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
fs.mkdirSync(path.dirname(output), { recursive: true });
const sourceWebm = output.replace(/\.mp4$/i, ".source.webm");

const chromeCandidates = [
  process.env.NOVASTORE_CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
  process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(chromePath, "Google Chrome is required.");

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    args: [
      "--window-position=0,0",
      "--window-size=1280,1000",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--disable-default-apps",
    ],
  });
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await page.goto(`${origin}/#/kategori/ev-yasam`, { waitUntil: "domcontentloaded", timeout: 35_000 });
  await page.waitForSelector('.customer-product-card a[href="#/urun/owner-hover-dort-gorsel"]', { visible: true, timeout: 35_000 });
  const card = await page.$('.customer-product-card:has(a[href="#/urun/owner-hover-dort-gorsel"])');
  assert.ok(card, "Deterministic owner hover card was not found.");
  await card.evaluate((node) => { node.scrollIntoView({ block: "center", inline: "center" }); });
  await delay(900);
  const metrics = await card.$eval(".customer-card-media-stage", (node) => {
    const rect = node.getBoundingClientRect();
    const chromeLeft = window.screenX + Math.max(0, (window.outerWidth - window.innerWidth) / 2);
    const chromeTop = window.screenY + Math.max(0, window.outerHeight - window.innerHeight);
    return {
      clientLeft: rect.left,
      clientTop: rect.top,
      left: chromeLeft + rect.left,
      top: chromeTop + rect.top,
      width: rect.width,
      height: rect.height,
      count: node.querySelectorAll(".customer-card-media-zones i").length,
    };
  });
  assert.equal(metrics.count, 4);
  await page.evaluate(() => {
    const pointer = document.createElement("span");
    pointer.id = "owner-review-pointer";
    pointer.setAttribute("aria-hidden", "true");
    Object.assign(pointer.style, {
      position: "fixed", zIndex: "2147483647", left: "0", top: "0", width: "18px", height: "18px",
      border: "3px solid #f27a0a", borderRadius: "50%", background: "rgba(255,255,255,.92)",
      boxShadow: "0 2px 8px rgba(0,0,0,.35)", pointerEvents: "none", transform: "translate(-50%,-50%)",
    });
    document.body.append(pointer);
    addEventListener("pointermove", (event) => { pointer.style.left = `${event.clientX}px`; pointer.style.top = `${event.clientY}px`; }, { passive: true });
  });
  await page.mouse.move(20, 80);
  const recorder = await page.screencast({ path: sourceWebm, format: "webm", ffmpegPath, fps: 30, quality: 20 });
  await delay(1200);

  const samples = [["left", .10, 0], ["middle", .55, 2], ["right", .90, 3]];
  for (const [label, fraction, expected] of samples) {
    await page.mouse.move(metrics.clientLeft + metrics.width * fraction, metrics.clientTop + metrics.height * .52, { steps: 16 });
    await delay(1700);
    const active = await card.$eval(".customer-card-media-stage", (node) => Number(node.dataset.activeMedia));
    assert.equal(active, expected, `${label} pointer zone must activate media ${expected + 1}.`);
  }
  await page.mouse.move(5, 5, { steps: 16 });
  await delay(1700);
  assert.equal(await card.$eval(".customer-card-media-stage", (node) => Number(node.dataset.activeMedia)), 0);
  await recorder.stop();
  const conversion = spawnSync(ffmpegPath, ["-y", "-i", sourceWebm, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { windowsHide: true, encoding: "utf8" });
  assert.equal(conversion.status, 0, conversion.stderr?.slice(-2_000));
  assert.ok(fs.statSync(output).size > 100_000, "Hover MP4 must contain an actual Chrome recording.");
  console.log("MAIN6X_R1_REAL_POINTER_HOVER_VIDEO=PASS");
  console.log(`HOVER_VIDEO=${output}`);
  console.log(`HOVER_VIDEO_BYTES=${fs.statSync(output).size}`);
} finally {
  if (browser) await browser.close();
}
