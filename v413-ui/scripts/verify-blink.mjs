import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = "http://127.0.0.1:5173/05_comparisons/blink.html";
const ids = Array.from({ length: 12 }, (_, index) => `CAL-${String(index + 1).padStart(2, "0")}`);

function browserExecutable() {
  const candidates = [
    process.env.NOVASTORE_CHROMIUM_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright", "chromium-1217", "chrome-win64", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function main() {
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error("No existing local Chrome/Chromium executable found.");
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, locale: "tr-TR", serviceWorkers: "block" });
  const externalRequests = [];
  await context.route("**/*", async (route) => {
    const raw = route.request().url();
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    } catch {
      // Fail closed below.
    }
    externalRequests.push(raw);
    return route.abort("blockedbyclient");
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); });

  const cases = [];
  try {
    for (const calibration of ids) {
      await page.goto(`${BASE}?cal=${calibration}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0));
      const title = await page.locator("#title").textContent();
      const sourceDimensions = await page.locator("#sourceImage").evaluate((image) => [image.naturalWidth, image.naturalHeight]);
      const v3Dimensions = await page.locator("#v3Image").evaluate((image) => [image.naturalWidth, image.naturalHeight]);
      await page.locator("#v3").click();
      const v3Visible = await page.locator("#v3Image").isVisible();
      const sourceHidden = await page.locator("#sourceImage").isHidden();
      await page.locator("#source").click();
      const sourceVisible = await page.locator("#sourceImage").isVisible();
      const pass = title?.startsWith(calibration)
        && sourceDimensions[0] === 1080 && sourceDimensions[1] === 2400
        && v3Dimensions[0] === 1080 && v3Dimensions[1] === 2400
        && v3Visible && sourceHidden && sourceVisible;
      cases.push({ calibration, status: pass ? "PASS" : "FAIL", title, sourceDimensions, v3Dimensions, manualToggle: pass });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const pass = cases.every((entry) => entry.status === "PASS")
    && consoleErrors.length === 0 && pageErrors.length === 0
    && failedResponses.length === 0 && externalRequests.length === 0;
  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: pass ? "PASS — 12/12 RAPID SOURCE/V3 SWITCH" : "FAIL — RAPID SOURCE/V3 SWITCH",
    humanVisualDecision: "PENDING",
    surface: "05_comparisons/blink.html?cal=CAL-01..CAL-12",
    automaticIntervalMs: 650,
    manualToggle: true,
    loopbackOnly: true,
    executablePath,
    cases,
    diagnostics: { consoleErrors, pageErrors, failedResponses, externalRequests },
  };
  await writeFile(path.join(ROOT, "09_machine", "blink-comparison-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
