import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAL_IDS = Array.from({ length: 12 }, (_, index) => `CAL-${String(index + 1).padStart(2, "0")}`);
const VIEWPORT = { width: 840, height: 1080 };

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function browserExecutable() {
  return [
    process.env.NOVASTORE_CHROMIUM_PATH,
    chromium.executablePath(),
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean).find((candidate) => existsSync(candidate));
}

function pngDimensions(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Not a PNG file.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function waitForReady(page) {
  await page.waitForLoadState("networkidle");
  await page.getByTestId("calibration-app").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(async (image) => {
      if (!image.complete) await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
      });
      if (image.naturalWidth === 0) throw new Error(`Broken image: ${image.src}`);
    }));
    document.querySelectorAll('[data-testid="mobile-scroll"]').forEach((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function main() {
  const baseUrl = new URL(option("--base-url", "http://127.0.0.1:5174/"));
  if (baseUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(baseUrl.hostname)) {
    throw new Error("Framed capture accepts loopback HTTP only.");
  }
  const outputRoot = path.resolve(option("--output-root", ROOT));
  const outputDirectory = path.join(outputRoot, "04_framed_preview");
  await mkdir(outputDirectory, { recursive: true });

  const executablePath = browserExecutable();
  if (!executablePath) throw new Error("No existing local Chrome/Chromium executable was found.");
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const blocked = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)) return route.continue();
    } catch {
      // Fail closed below.
    }
    blocked.push(url);
    return route.abort("blockedbyclient");
  });

  const page = await context.newPage();
  const files = [];
  try {
    for (const cal of CAL_IDS) {
      const url = new URL(baseUrl);
      url.search = new URLSearchParams({ cal, framed: "1", fixture: "deterministic", locale: "tr-TR" }).toString();
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await waitForReady(page);
      await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
      await page.locator('[data-testid="phone-frame"][data-device="pixel-10"][data-platform="android"]').waitFor({ state: "visible" });
      const metrics = await page.evaluate(() => {
        const app = document.querySelector('[data-testid="mobile-app-viewport"]')?.getBoundingClientRect();
        const top = document.querySelector('[data-testid="app-topbar"]')?.getBoundingClientRect();
        const switcher = document.querySelector('.cal-switcher')?.getBoundingClientRect();
        if (!app || !switcher) throw new Error("Framed viewport or external switcher is missing.");
        const scale = app.width / 411.428571;
        return {
          app: [app.x, app.y, app.width, app.height],
          topbar: top ? [top.x, top.y, top.width, top.height] : null,
          topbarLogicalY: top ? (top.y - app.y) / scale : null,
          switcher: [switcher.x, switcher.y, switcher.width, switcher.height],
        };
      });
      const artifact = path.join(outputDirectory, `${cal}.png`);
      await page.screenshot({ path: artifact, type: "png", animations: "disabled", caret: "hide", scale: "css" });
      const bytes = await readFile(artifact);
      const dimensions = pngDimensions(bytes);
      if (dimensions.width !== VIEWPORT.width || dimensions.height !== VIEWPORT.height) throw new Error(`${cal} framed dimensions are invalid.`);
      files.push({
        calibration: cal,
        relativePath: path.relative(outputRoot, artifact).replaceAll(path.sep, "/"),
        ...dimensions,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        url: url.toString(),
        metrics,
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    profile: "framed-pixel-10-android",
    viewport: VIEWPORT,
    loopbackOnly: true,
    blockedExternalRequestCount: blocked.length,
    blockedExternalRequests: blocked,
    files,
  };
  await writeFile(path.join(outputDirectory, "capture-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Captured ${files.length} framed V4 preview PNGs with ${executablePath}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
