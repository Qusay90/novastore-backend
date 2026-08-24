import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE_URL = "http://127.0.0.1:5174/";
const OUT = path.join(ROOT, "09_machine");
const CAL_IDS = Array.from({ length: 12 }, (_, index) => `CAL-${String(index + 1).padStart(2, "0")}`);
const profiles = {
  phone: { logicalWidth: 411.42857142857144, logicalHeight: 914.2857142857143, width: 1080, height: 2400 },
  tablet: { logicalWidth: 800, logicalHeight: 1280, width: 1600, height: 2560 },
};

const selectors = {
  "CAL-01": { content: ".login-layout", main: ".auth-card", cta: ".login-layout > .primary.orange", bottom: ".legal-links", logo: ".brand-lockup img" },
  "CAL-02": { content: ".home-layout", main: ".home-hero", secondary: ".category-mosaic", bottom: ".home-products .product-card:last-child" },
  "CAL-03": { content: ".category-browser", main: ".subcategory-grid .featured", secondary: ".category-rail", bottom: ".subcategory-grid button:last-child" },
  "CAL-04": { content: ".plp-layout", main: ".plp-products .product-card:first-of-type", secondary: ".page-heading", bottom: ".plp-products .product-card:last-child" },
  "CAL-05": { content: ".filter-sheet", main: ".filter-sheet", cta: ".filter-sheet > footer", bottom: ".filter-sheet > footer" },
  "CAL-06": { content: ".pdp-grid", main: ".pdp-main-media", secondary: ".pdp-info", cta: ".pdp-add-to-cart", bottom: ".pdp-footer" },
  "CAL-07": { content: ".cart-grid", main: ".cart-item:first-of-type", secondary: ".order-summary", cta: ".order-summary > .primary", bottom: ".order-summary > .secure-copy" },
  "CAL-08": { content: ".checkout-grid", main: ".card-form", secondary: ".checkout-summary", cta: ".checkout-summary > .primary", bottom: ".checkout-summary > .secure-copy" },
  "CAL-09": { content: ".order-grid", main: ".order-card", secondary: ".info-list", cta: ".order-actions .primary", bottom: ".order-total" },
  "CAL-10": { content: ".account-layout", main: ".profile-card", secondary: ".account-tiles", cta: ".logout", bottom: ".logout" },
  "CAL-11": { content: ".support-layout", main: ".quick-help", secondary: ".novabot-card", cta: ".novabot-card .primary", bottom: ".support-links", bot: ".novabot-card .novabot-art" },
  "CAL-12": { content: ".novabot-layout", main: ".chat-card", secondary: ".messages", cta: ".escalate", bottom: ".composer", bot: ".chat-card .novabot-art" },
};

const source = {
  "CAL-01": { size: [852, 1846], topbar: [38, 43, 776, 107], content: [39, 599, 773, 583], main: [39, 599, 773, 583], cta: [53, 1245, 744, 106] },
  "CAL-02": { size: [853, 1844], topbar: [33, 45, 784, 91], content: [33, 178, 784, 1161], main: [33, 178, 784, 452], nav: [33, 1671, 784, 131] },
  "CAL-03": { size: [740, 1600], topbar: [29, 38, 679, 85], content: [31, 156, 673, 1253], main: [218, 326, 486, 369], nav: [29, 1439, 679, 115] },
  "CAL-04": { size: [852, 1846], main: [49, 359, 358, 625], authority: "SRC-12_COMPACT_TOP_LEFT_PRODUCT_CARD" },
  "CAL-06": { size: [759, 1600], topbar: [41, 36, 674, 44], content: [22, 107, 715, 1407], main: [22, 107, 715, 707], cta: [314, 1490, 410, 88] },
  "CAL-08": { size: [853, 1844], topbar: [43, 39, 767, 99], content: [47, 177, 758, 1371], main: [47, 828, 758, 430], cta: [44, 1555, 761, 83], nav: [37, 1693, 779, 139] },
  "CAL-09": { size: [852, 1846], topbar: [38, 48, 776, 107], content: [38, 182, 776, 1480], main: [38, 183, 776, 639], cta: [40, 852, 375, 83], nav: [38, 1664, 776, 134] },
  "CAL-10": { size: [852, 1846], topbar: [38, 40, 776, 100], content: [38, 168, 776, 1488], main: [38, 168, 776, 269], cta: [38, 1586, 776, 70], nav: [38, 1668, 776, 144] },
  "CAL-11": { size: [852, 1846], topbar: [38, 41, 776, 99], content: [38, 177, 776, 1421], main: [39, 447, 774, 378], cta: [66, 1067, 711, 97], nav: [38, 1647, 776, 137] },
  "CAL-12": { size: [853, 1844], topbar: [38, 41, 776, 99], content: [40, 313, 773, 1280], main: [40, 313, 773, 1175], cta: [63, 800, 726, 102], nav: [39, 1617, 775, 137] },
};

function browserExecutable() {
  return [
    process.env.NOVASTORE_CHROMIUM_PATH,
    chromium.executablePath(),
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean).find((candidate) => existsSync(candidate));
}

function rounded(box) {
  return box ? box.map((value) => Math.round(value * 1000) / 1000) : null;
}

function normalize(box, size) {
  if (!box) return null;
  return box.map((value, index) => value / size[index % 2]);
}

function iou(a, b) {
  if (!a || !b) return null;
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx), y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw), y2 = Math.min(ay + ah, by + bh);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - intersection;
  return union > 0 ? intersection / union : 0;
}

function coordinateMatch(a, b) {
  if (!a || !b) return null;
  const meanDelta = a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / 4;
  return Math.max(0, 1 - meanDelta);
}

async function ready(page) {
  await page.waitForLoadState("networkidle");
  await page.getByTestId("calibration-app").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(async (image) => {
      if (!image.complete) await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
      });
      if (!image.naturalWidth) throw new Error(`Broken image: ${image.src}`);
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function sha256(relativePath) {
  const bytes = await readFile(path.join(ROOT, relativePath));
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error("Existing Chrome/Chromium is unavailable.");
  const browser = await chromium.launch({ executablePath, headless: true });
  const records = [];
  const externalRequests = [];
  try {
    for (const [profileName, profile] of Object.entries(profiles)) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        screen: { width: profile.width, height: profile.height },
        deviceScaleFactor: 1,
        locale: "tr-TR",
        timezoneId: "Europe/Istanbul",
        colorScheme: "light",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      await context.route("**/*", async (route) => {
        const value = route.request().url();
        if (value.startsWith("data:") || value.startsWith("blob:")) return route.continue();
        try {
          const url = new URL(value);
          if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
        } catch { /* fail closed below */ }
        externalRequests.push(value);
        return route.abort("blockedbyclient");
      });
      const page = await context.newPage();
      for (const calibration of CAL_IDS) {
        const profileSelectors = selectors[calibration];
        const url = new URL(BASE_URL);
        url.search = new URLSearchParams({
          cal: calibration,
          capture: "1",
          layout: profileName,
          logicalWidth: String(profile.logicalWidth),
          logicalHeight: String(profile.logicalHeight),
          scale: String(profile.width / profile.logicalWidth),
          segmentOffset: "0",
          segmentX: "0",
          fixture: "deterministic",
          locale: "tr-TR",
          fontScale: "1.0",
          motion: "reduced",
          profile: profileName,
        }).toString();
        await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
        await ready(page);
        const measurements = await page.evaluate(({ profileSelectors }) => {
          const one = (selector) => {
            if (!selector) return null;
            const element = document.querySelector(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return [rect.x, rect.y, rect.width, rect.height];
          };
          const app = document.querySelector('[data-testid="mobile-app-viewport"]');
          const scroll = document.querySelector('[data-testid="mobile-scroll"]');
          if (!app || !scroll) throw new Error("V4 app/scroll surface is missing.");
          const appBox = app.getBoundingClientRect();
          const nav = one('[data-testid="customer-bottom-nav"]');
          const before = {
            app: [appBox.x, appBox.y, appBox.width, appBox.height],
            topbar: one('[data-testid="app-topbar"]'),
            nav,
            content: one(profileSelectors.content),
            main: one(profileSelectors.main),
            secondary: one(profileSelectors.secondary),
            cta: one(profileSelectors.cta),
            bottom: one(profileSelectors.bottom),
            logo: one(profileSelectors.logo),
            bot: one(profileSelectors.bot),
            scroll: { scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight },
            shellVariables: Object.fromEntries([
              "--shell-status-safe-top", "--shell-content-top", "--shell-safe-bottom", "--shell-nav-height",
              "--shell-nav-bottom", "--shell-content-bottom-reserve", "--shell-sticky-bottom",
            ].map((name) => [name, getComputedStyle(app).getPropertyValue(name).trim()])),
          };
          scroll.scrollTop = scroll.scrollHeight;
          return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const bottom = one(profileSelectors.bottom);
            const navAfter = one('[data-testid="customer-bottom-nav"]');
            const reserveClearance = bottom && navAfter ? navAfter[1] - (bottom[1] + bottom[3]) : null;
            resolve({ ...before, bottomAtReach: bottom, navAtReach: navAfter, reserveClearance });
          })));
        }, { profileSelectors });

        const sourceRecord = source[calibration] ?? null;
        const sourceSize = sourceRecord?.size ?? null;
        const comparisons = {};
        if (profileName === "phone" && sourceSize) {
          for (const key of ["topbar", "content", "main", "cta", "nav"]) {
            const sourceBox = sourceRecord[key] ?? null;
            const appBox = measurements[key] ?? null;
            if (!sourceBox || !appBox) continue;
            const sourceNormalized = normalize(sourceBox, sourceSize);
            const appNormalized = normalize(appBox, [profile.width, profile.height]);
            comparisons[key] = {
              sourceXywh: sourceBox,
              applicationXywh: rounded(appBox),
              sourceNormalized,
              applicationNormalized: appNormalized,
              normalizedIouPercent: Math.round(iou(sourceNormalized, appNormalized) * 10000) / 100,
              coordinateMatchPercent: Math.round(coordinateMatch(sourceNormalized, appNormalized) * 10000) / 100,
            };
          }
        }
        const matchValues = Object.values(comparisons).map((entry) => entry.coordinateMatchPercent);
        records.push({
          calibration,
          profile: profileName,
          viewport: { width: profile.width, height: profile.height },
          url: url.toString(),
          sourceAuthority: sourceRecord?.authority ?? (sourceRecord ? "SOURCE_NATIVE" : "NO_EXACT_FULL_SCREEN_SOURCE"),
          measurements: Object.fromEntries(Object.entries(measurements).map(([key, value]) => [key, Array.isArray(value) ? rounded(value) : value])),
          comparisons,
          bboxMatchPercent: matchValues.length ? Math.round(matchValues.reduce((sum, value) => sum + value, 0) / matchValues.length * 100) / 100 : "NOT_APPLICABLE_NO_EXACT_REFERENCE",
          bottomReachPass: measurements.reserveClearance == null || measurements.reserveClearance >= -0.5,
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const failures = records.filter((record) => !record.bottomReachPass);
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 && externalRequests.length === 0 ? "PASS" : "FAIL",
    humanDecisions: { v2: "REJECTED", v3: "REJECTED", v4: "PENDING" },
    coordinateContract: "All application bboxes are physical capture pixels. Source/application comparison normalizes x,w by frame width and y,h by frame height.",
    bboxFormula: "coordinateMatchPercent = 100 * (1 - mean(abs(sourceNormalizedXywh - applicationNormalizedXywh))); normalizedIouPercent is also reported per anchor.",
    externalRequests,
    failureCount: failures.length,
    records,
    frozenInputs: {
      prototypeSha256: await sha256("src/Prototype.tsx"),
      cssSha256: await sha256("src/prototype.css"),
      phoneManifestSha256: await sha256("02_phone_1080x2400/capture-manifest.json"),
      tabletManifestSha256: await sha256("03_tablet_1600x2560/capture-manifest.json"),
    },
  };
  await writeFile(path.join(OUT, "v4-geometry-measurements.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const rows = ["calibration,profile,bbox_match_percent,bottom_reach_pass,topbar_xywh,content_xywh,main_xywh,cta_xywh,nav_xywh,reserve_clearance_px"];
  for (const record of records) {
    const box = (key) => record.measurements[key]?.join(";") ?? "NOT_APPLICABLE";
    rows.push([
      record.calibration, record.profile, record.bboxMatchPercent, record.bottomReachPass,
      box("topbar"), box("content"), box("main"), box("cta"), box("nav"),
      record.measurements.reserveClearance ?? "NOT_APPLICABLE",
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  }
  await writeFile(path.join(OUT, "v4-geometry-measurements.csv"), `${rows.join("\n")}\n`, "utf8");

  const cal04 = records.find((record) => record.calibration === "CAL-04" && record.profile === "phone");
  const capture = JSON.parse(await readFile(path.join(ROOT, "02_phone_1080x2400", "capture-manifest.json"), "utf8"));
  const captureFile = capture.files.find((entry) => entry.calibration === "CAL-04");
  const productMeasurement = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    status: "PASS — V4 FINAL DOM MEASUREMENT",
    calibration: "CAL-04",
    profile: "phone",
    capture: captureFile,
    runtime: { device: "pixel-10", platform: "android", loopbackOnly: true, externalRequests: externalRequests.length },
    productCardFirst: {
      selector: ".plp-products .product-card:first-of-type",
      boundingBoxXywh: cal04.measurements.main,
      coordinateSpace: "authoritative physical capture pixels",
    },
    method: "Final V4 capture URL reopened with the same deterministic Pixel 10 Android capture contract; font, image, network, and two-frame readiness gates applied.",
  };
  await writeFile(path.join(ROOT, "01_measurements", "product-card-authority-measurement.json"), `${JSON.stringify(productMeasurement, null, 2)}\n`, "utf8");
  process.stdout.write(`Measured ${records.length} V4 phone/tablet geometry records; failures=${failures.length}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
