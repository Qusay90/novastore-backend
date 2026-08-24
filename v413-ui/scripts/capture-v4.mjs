import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_BASE_URL = "http://127.0.0.1:5174/";
const CALIBRATIONS = Array.from({ length: 12 }, (_, index) => `CAL-${String(index + 1).padStart(2, "0")}`);

const PROFILES = {
  phone: {
    directory: "02_phone_1080x2400",
    logical: { width: 411.42857142857144, height: 914.2857142857143 },
    physical: { width: 1080, height: 2400 },
    densityDpi: 420,
  },
  tablet: {
    directory: "03_tablet_1600x2560",
    logical: { width: 800, height: 1280 },
    physical: { width: 1600, height: 2560 },
    densityDpi: 320,
  },
};

function usage() {
  return `Usage: node scripts/capture-v4.mjs [options]

Captures the V4 recovery candidate from an already-running loopback preview.

Options:
  --base-url URL       Loopback preview URL (default: ${DEFAULT_BASE_URL})
  --output-root PATH   Artifact root (default: project root)
  --profiles LIST      phone, tablet, or comma-separated list (default: both)
  --cal LIST           Calibration ids, for example CAL-02,CAL-11 (default: CAL-01..CAL-12)
  --executable PATH    Existing Chrome/Chromium executable; never downloads a browser
  --headed             Run the browser headed (headless is the default)
  --help               Show this help

The script blocks non-loopback requests, uses tr-TR/light/reduced-motion
conditions, waits for fonts, images, network idle, and stable animation frames,
then verifies every PNG's exact physical dimensions and SHA-256.`;
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outputRoot: PROJECT_ROOT,
    profiles: Object.keys(PROFILES),
    calibrations: [...CALIBRATIONS],
    executable: undefined,
    headless: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
      index += 1;
      return value;
    };

    if (argument === "--help") {
      options.help = true;
    } else if (argument === "--base-url") {
      options.baseUrl = next();
    } else if (argument === "--output-root") {
      options.outputRoot = path.resolve(next());
    } else if (argument === "--profiles") {
      options.profiles = next().split(",").map((value) => value.trim()).filter(Boolean);
    } else if (argument === "--cal") {
      options.calibrations = next().split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
    } else if (argument === "--executable") {
      options.executable = path.resolve(next());
    } else if (argument === "--headed") {
      options.headless = false;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  for (const profile of options.profiles) {
    if (!(profile in PROFILES)) throw new Error(`Unknown profile '${profile}'. Expected phone or tablet.`);
  }
  for (const calibration of options.calibrations) {
    if (!CALIBRATIONS.includes(calibration)) throw new Error(`Unknown calibration '${calibration}'.`);
  }

  const parsedUrl = new URL(options.baseUrl);
  if (parsedUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
    throw new Error("--base-url must be an http://127.0.0.1 or http://localhost URL.");
  }

  options.baseUrl = parsedUrl.toString();
  return options;
}

function existingBrowserExecutable(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.NOVASTORE_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

function pngDimensions(buffer) {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature || buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("Captured artifact is not a valid PNG with an IHDR header.");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function selectPixelAndroidRuntime(page) {
  const phoneFrame = page.getByTestId("phone-frame");
  await phoneFrame.waitFor({ state: "attached" });

  const currentDevice = await phoneFrame.getAttribute("data-device");
  const currentPlatform = await phoneFrame.getAttribute("data-platform");
  if (currentDevice !== "pixel-10" || currentPlatform !== "android") {
    const picker = page.getByTestId("device-picker");
    await picker.waitFor({ state: "attached" });

    // Capture mode intentionally hides the picker. Dispatch the same local UI
    // event used by Radix without making any device chrome visible in the PNG.
    await picker.dispatchEvent("pointerdown", {
      button: 0,
      buttons: 1,
      ctrlKey: false,
      pointerType: "mouse",
    });
    const pixelOption = page.getByTestId("device-option-pixel-10");
    await pixelOption.waitFor({ state: "visible" });
    await pixelOption.click();
  }

  await page.locator('[data-testid="phone-frame"][data-device="pixel-10"][data-platform="android"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="device-screen"][data-device="pixel-10"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="mobile-app-viewport"][data-platform="android"]').waitFor({ state: "visible" });

  const selectedRuntime = await phoneFrame.evaluate((element) => ({
    device: element.getAttribute("data-device"),
    platform: element.getAttribute("data-platform"),
  }));
  if (selectedRuntime.device !== "pixel-10" || selectedRuntime.platform !== "android") {
    throw new Error(`Capture runtime is ${JSON.stringify(selectedRuntime)}; expected Pixel 10 / Android.`);
  }
}

async function installDeterministicCaptureStyle(page, profile) {
  const scale = profile.physical.width / profile.logical.width;
  if (Math.abs(profile.logical.height * scale - profile.physical.height) > 0.0001) {
    throw new Error("Capture profile logical and physical aspect ratios must match exactly.");
  }

  await page.addStyleTag({
    content: `
      .device-camera,
      .android-navigation-bar {
        display: none !important;
      }
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

async function assertAuthoritativeCaptureMode(page, profile) {
  const app = page.getByTestId("calibration-app");
  await app.waitFor({ state: "visible" });

  const appClasses = await app.getAttribute("class");
  if (!appClasses?.split(/\s+/).includes("capture-mode")) {
    throw new Error("The prototype did not enter its authoritative capture-mode surface.");
  }

  const appBox = await app.boundingBox();
  const cssPixelQuantizationTolerance = 0.1;
  if (!appBox
    || Math.abs(appBox.x) > cssPixelQuantizationTolerance
    || Math.abs(appBox.y) > cssPixelQuantizationTolerance
    || Math.abs(appBox.width - profile.physical.width) > cssPixelQuantizationTolerance
    || Math.abs(appBox.height - profile.physical.height) > cssPixelQuantizationTolerance) {
    throw new Error(`Capture surface bounds are ${JSON.stringify(appBox)}; expected 0,0 ${profile.physical.width}x${profile.physical.height}.`);
  }

  const forbiddenSelectors = [
    ".device-menu-bar",
    ".phone-bezel",
    ".device-camera",
    ".status-bar",
    ".home-indicator-svg",
    ".android-navigation-bar",
    ".keyboard-dock",
    ".mobile-cursor",
    ".cal-switcher",
  ];
  const visibleForbidden = await page.evaluate((selectors) => selectors.filter((selector) => (
    Array.from(document.querySelectorAll(selector)).some((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    })
  )), forbiddenSelectors);
  if (visibleForbidden.length > 0) {
    throw new Error(`Forbidden prototype chrome remains visible in capture mode: ${visibleForbidden.join(", ")}.`);
  }
}

async function waitForRenderReady(page) {
  await page.waitForLoadState("networkidle");
  await page.locator('[data-testid="device-screen"]').waitFor({ state: "visible" });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;

    const images = Array.from(document.images);
    await Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", () => reject(new Error(`Image failed: ${image.currentSrc || image.src}`)), { once: true });
        });
      }
      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch {
          if (!image.complete || image.naturalWidth === 0) throw new Error(`Image decode failed: ${image.currentSrc || image.src}`);
        }
      }
      if (image.naturalWidth === 0) throw new Error(`Image has no decoded pixels: ${image.currentSrc || image.src}`);
    }));

    const declaredReady = globalThis.__NOVASTORE_RENDER_READY__;
    if (declaredReady && typeof declaredReady.then === "function") await declaredReady;

    document.querySelectorAll('[data-testid="mobile-scroll"]').forEach((element) => {
      element.scrollTop = 0;
      element.scrollLeft = 0;
    });

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function measureCalibrationComponents(page, calibration) {
  if (calibration !== "CAL-04") return {};
  const selector = ".plp-products .product-card:first-of-type";
  const card = page.locator(selector);
  await card.waitFor({ state: "visible" });
  const box = await card.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error(`Unable to measure ${selector} for ${calibration}.`);
  }
  return {
    productCardFirst: {
      selector,
      boundingBoxXywh: [box.x, box.y, box.width, box.height],
      coordinateSpace: "authoritative physical capture pixels",
    },
  };
}

async function captureProfile(browser, options, profileName) {
  const profile = PROFILES[profileName];
  const outputDirectory = path.join(options.outputRoot, profile.directory);
  await mkdir(outputDirectory, { recursive: true });

  const context = await browser.newContext({
    viewport: { ...profile.physical },
    screen: { ...profile.physical },
    deviceScaleFactor: 1,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });

  const blockedRequests = [];
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) {
      await route.continue();
      return;
    }
    try {
      const parsed = new URL(requestUrl);
      if (parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)) {
        await route.continue();
        return;
      }
    } catch {
      // Fall through to the fail-closed branch.
    }
    blockedRequests.push(requestUrl);
    await route.abort("blockedbyclient");
  });

  const page = await context.newPage();
  const files = [];
  try {
    for (const calibration of options.calibrations) {
      const captureUrl = new URL(options.baseUrl);
      captureUrl.search = "";
      captureUrl.searchParams.set("cal", calibration);
      captureUrl.searchParams.set("capture", "1");
      captureUrl.searchParams.set("layout", profileName);
      captureUrl.searchParams.set("logicalWidth", String(profile.logical.width));
      captureUrl.searchParams.set("logicalHeight", String(profile.logical.height));
      captureUrl.searchParams.set("scale", String(profile.physical.width / profile.logical.width));
      captureUrl.searchParams.set("segmentOffset", "0");
      captureUrl.searchParams.set("segmentX", "0");
      captureUrl.searchParams.set("fixture", "deterministic");
      captureUrl.searchParams.set("locale", "tr-TR");
      captureUrl.searchParams.set("fontScale", "1.0");
      captureUrl.searchParams.set("motion", "reduced");
      captureUrl.searchParams.set("profile", profileName);

      await page.goto(captureUrl.toString(), { waitUntil: "domcontentloaded" });
      await selectPixelAndroidRuntime(page);
      await installDeterministicCaptureStyle(page, profile);
      await waitForRenderReady(page);
      await assertAuthoritativeCaptureMode(page, profile);
      const componentMeasurements = await measureCalibrationComponents(page, calibration);

      const artifactPath = path.join(outputDirectory, `${calibration}.png`);
      await page.screenshot({
        path: artifactPath,
        type: "png",
        fullPage: false,
        animations: "disabled",
        caret: "hide",
        scale: "css",
      });

      const bytes = await readFile(artifactPath);
      const dimensions = pngDimensions(bytes);
      if (dimensions.width !== profile.physical.width || dimensions.height !== profile.physical.height) {
        throw new Error(`${artifactPath} is ${dimensions.width}x${dimensions.height}; expected ${profile.physical.width}x${profile.physical.height}.`);
      }
      files.push({
        calibration,
        relativePath: path.relative(options.outputRoot, artifactPath).replaceAll(path.sep, "/"),
        width: dimensions.width,
        height: dimensions.height,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        url: captureUrl.toString(),
        componentMeasurements,
      });
    }
  } finally {
    await context.close();
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    profile: profileName,
    logicalViewport: profile.logical,
    physicalViewport: profile.physical,
    densityDpi: profile.densityDpi,
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    fontScale: 1,
    reducedMotion: true,
    runtimeDevice: "pixel-10",
    runtimePlatform: "android",
    loopbackOnly: true,
    blockedExternalRequestCount: blockedRequests.length,
    blockedExternalRequests: blockedRequests,
    files,
  };
  await writeFile(path.join(outputDirectory, "capture-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const executablePath = existingBrowserExecutable(options.executable);
  if (!executablePath) {
    throw new Error("No existing Playwright Chromium or Chrome executable was found. No browser download was attempted.");
  }

  const browser = await chromium.launch({ executablePath, headless: options.headless });
  try {
    const manifests = [];
    for (const profileName of options.profiles) {
      manifests.push(await captureProfile(browser, options, profileName));
    }
    const total = manifests.reduce((sum, manifest) => sum + manifest.files.length, 0);
    process.stdout.write(`Captured ${total} deterministic PNG artifact(s) with ${executablePath}.\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
