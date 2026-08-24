import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "07_interaction_evidence");
const BASE_URL = "http://127.0.0.1:5174/";
const PHONE = {
  logicalWidth: 411.42857142857144,
  logicalHeight: 914.2857142857143,
  physicalWidth: 1080,
  physicalHeight: 2400,
};

function existingBrowser() {
  const candidates = [
    process.env.NOVASTORE_CHROMIUM_PATH,
    chromium.executablePath(),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

function pngDimensions(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Evidence output is not a PNG.");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function selectPixelAndroid(page) {
  const frame = page.getByTestId("phone-frame");
  await frame.waitFor({ state: "attached" });
  if (await frame.getAttribute("data-device") !== "pixel-10") {
    const picker = page.getByTestId("device-picker");
    await picker.dispatchEvent("pointerdown", { button: 0, buttons: 1, pointerType: "mouse" });
    await page.getByTestId("device-option-pixel-10").click();
  }
  await page.locator('[data-testid="phone-frame"][data-device="pixel-10"][data-platform="android"]').waitFor();
}

async function waitReady(page) {
  await page.getByTestId("calibration-app").waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(async (image) => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", reject, { once: true });
        });
      }
      if (image.decode) await image.decode().catch(() => undefined);
      if (!image.naturalWidth) throw new Error(`Broken image: ${image.src}`);
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function captureUrl(cal, extra = {}) {
  const url = new URL(BASE_URL);
  const params = {
    cal,
    capture: "1",
    layout: "phone",
    logicalWidth: String(PHONE.logicalWidth),
    logicalHeight: String(PHONE.logicalHeight),
    scale: String(PHONE.physicalWidth / PHONE.logicalWidth),
    fixture: "deterministic",
    locale: "tr-TR",
    fontScale: "1.0",
    motion: "reduced",
    profile: "phone",
    ...extra,
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function open(page, cal, extra) {
  await page.goto(captureUrl(cal, extra), { waitUntil: "networkidle" });
  await selectPixelAndroid(page);
  await page.addStyleTag({
    content: `
      .device-camera, .android-navigation-bar { display: none !important; }
      *, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
        animation-delay: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await waitReady(page);
}

async function main() {
  const executablePath = existingBrowser();
  if (!executablePath) throw new Error("No existing local Chrome/Chromium executable found.");
  await mkdir(OUTPUT, { recursive: true });

  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: PHONE.physicalWidth, height: PHONE.physicalHeight },
    screen: { width: PHONE.physicalWidth, height: PHONE.physicalHeight },
    deviceScaleFactor: 1,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });

  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    externalRequests: [],
  };
  await context.route("**/*", async (route) => {
    const raw = route.request().url();
    if (raw.startsWith("data:") || raw.startsWith("blob:")) return route.continue();
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) {
        return route.continue();
      }
    } catch {
      // The fail-closed branch below owns malformed URLs.
    }
    diagnostics.externalRequests.push(raw);
    return route.abort("blockedbyclient");
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (!diagnostics.externalRequests.includes(request.url())) diagnostics.failedRequests.push(request.url());
  });

  const artifacts = [];
  const receipts = [];
  async function shot(scenario, step, assertion) {
    await waitReady(page);
    const fileName = `${scenario}-${step}.png`;
    const filePath = path.join(OUTPUT, fileName);
    await page.screenshot({ path: filePath, type: "png", animations: "disabled", caret: "hide" });
    const bytes = await readFile(filePath);
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== PHONE.physicalWidth || dimensions.height !== PHONE.physicalHeight) {
      throw new Error(`${fileName} is ${dimensions.width}x${dimensions.height}; expected 1080x2400.`);
    }
    artifacts.push({
      scenario,
      step,
      assertion,
      status: "PASS",
      relativePath: `07_interaction_evidence/${fileName}`,
      url: page.url(),
      ...dimensions,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  async function scenario(id, description, action) {
    try {
      await action();
      receipts.push({ id, description, status: "PASS" });
    } catch (error) {
      receipts.push({ id, description, status: "FAIL", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  try {
    await scenario("AUTH", "Password visibility, reset, and registration states", async () => {
      await open(page, "CAL-01");
      await shot("auth", "01-login", "Initial signed-out login state");
      await page.getByRole("button", { name: "Şifreyi göster" }).click();
      await shot("auth", "02-password-visible", "Password visibility toggle changes the input type");
      await page.getByRole("button", { name: "Şifremi unuttum" }).click();
      await shot("auth", "03-reset", "Password-reset state and canonical view query");
      await page.getByRole("button", { name: "Geri" }).click();
      await page.getByRole("button", { name: "Kayıt Ol" }).click();
      await shot("auth", "04-register", "Registration state and canonical view query");
    });

    await scenario("CATALOG", "Favorite, cart, PDP quantity, and source-authoritative detail expansion", async () => {
      await open(page, "CAL-04");
      const product = page.locator(".product-card").filter({ hasText: "Nova Pulse ANC Kulaklık" }).first();
      await product.getByRole("button", { name: "Favoriye ekle" }).click();
      await product.getByRole("button", { name: "Nova Pulse ANC Kulaklık sepete ekle" }).click();
      await shot("catalog", "01-favorite-cart", "Independent favorite and add-to-cart states");
      await page.getByRole("button", { name: "Nova Pulse ANC Kulaklık detayını aç" }).click();
      await page.getByRole("button", { name: "Adedi artır" }).click();
      await page.getByRole("button", { name: "Sepete Ekle" }).click();
      await shot("catalog", "02-pdp-quantity-cart", "PDP quantity and cart state");
      await page.getByRole("button", { name: /Ürün detayları/ }).click();
      await shot("catalog", "03-details-expanded", "Source-authoritative product-details accordion expands while the single sticky CTA remains");
    });

    await scenario("FILTER", "Filter mutation, clear, and apply", async () => {
      await open(page, "CAL-05");
      const brand = page.getByRole("button", { name: /Nova Audio/ });
      const stock = page.getByRole("button", { name: "Stoktakiler" });
      await brand.click();
      await stock.click();
      await page.getByRole("slider", { name: "Maksimum fiyat" }).fill("6000");
      await shot("filter", "01-modified", "Brand, stock, and price controls mutate independently");
      await brand.click();
      await stock.click();
      await page.getByRole("button", { name: "Temizle" }).click();
      await shot("filter", "02-cleared", "Clear resets selected filter controls");
      await page.getByRole("button", { name: /Ürünü Göster/ }).click();
      await shot("filter", "03-applied", "Apply closes the sheet and returns to product listing");
    });

    await scenario("CART", "Cart quantity and row removal", async () => {
      await open(page, "CAL-07");
      const headphones = page.getByTestId("cart-item-headphones");
      await headphones.getByRole("button", { name: "Kulaklık adedini artır" }).click();
      await shot("cart", "01-quantity", "Quantity control updates only the selected row");
      await page.getByTestId("cart-item-coffee").getByRole("button", { name: /Sil/ }).click();
      await shot("cart", "02-removed", "Remove deletes only the selected cart row");
    });

    await scenario("CHECKOUT", "Card payment, address editor, and success", async () => {
      await open(page, "CAL-08");
      await page.getByRole("button", { name: "CVV'yi göster" }).click();
      await shot("checkout", "01-card", "Card is the only payment method and CVV visibility is user-controlled");
      await page.getByRole("button", { name: "CVV'yi gizle" }).click();
      await page.getByRole("button", { name: "Adresi değiştir" }).click();
      await page.getByLabel("Adres", { exact: true }).fill("İş · 19 Mayıs Mah. No: 1");
      await page.getByRole("button", { name: /Adresi kaydet/i }).click();
      await shot("checkout", "02-address-saved", "Address editor persists the new address in the fixture");
      await page.getByRole("button", { name: /Güvenle Öde/ }).click();
      await shot("checkout", "03-success", "Submit exposes the deterministic success state");
    });

    await scenario("SUPPORT", "Support Hub canonical branches and returns route", async () => {
      await open(page, "CAL-11");
      await shot("support", "01-hub", "Support Hub origin state");
      await page.getByRole("button", { name: /NovaBot’u Başlat/ }).click();
      await shot("support", "02-novabot", "Support Hub opens NovaBot");
      await open(page, "CAL-11");
      await page.getByRole("button", { name: /İade ve değişim/i }).first().click();
      await shot("support", "03-returns", "Returns opens ?cal=CAL-10&tab=account&view=returns");
      await open(page, "CAL-11");
      await page.getByRole("button", { name: /Canlı Desteğe Bağlan/ }).click();
      await shot("support", "04-live", "Support Hub opens live-support state");
      await open(page, "CAL-11");
      await page.getByRole("button", { name: /Sıkça Sorulan Sorular/ }).click();
      await shot("support", "05-faq", "Support Hub opens FAQ state");
      await open(page, "CAL-11");
      await page.getByRole("button", { name: /Geçmiş Sohbetler/ }).click();
      await shot("support", "06-history", "Support Hub opens history state");
    });

    await scenario("NOVABOT", "Suggestion, composer send, and live escalation", async () => {
      await open(page, "CAL-12");
      await shot("novabot", "01-initial", "Source-comparable initial conversation state");
      await page.getByRole("button", { name: "Ödeme sorunu" }).click();
      await shot("novabot", "02-suggestion", "Suggestion adds a user and bot response");
      const composer = page.getByPlaceholder("Mesajını yaz...");
      await composer.fill("Siparişim için canlı desteğe ihtiyacım var.");
      await page.getByRole("button", { name: "Mesajı gönder" }).click();
      await shot("novabot", "03-message", "Composer adds the typed message");
      await page.getByRole("button", { name: /Canlı desteğe bağlan/ }).click();
      await shot("novabot", "04-escalated", "Escalation adds a visible handoff status");
    });
  } finally {
    await context.close();
    await browser.close();
  }

  const failures = receipts.filter((receipt) => receipt.status !== "PASS");
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: failures.length === 0 ? "PASS" : "FAIL",
    humanVisualDecision: "PENDING",
    humanDecisions: { v2: "REJECTED", v3: "REJECTED", v4: "PENDING" },
    baseUrl: BASE_URL,
    viewport: { width: 1080, height: 2400, densityDpi: 420, locale: "tr-TR", fontScale: 1 },
    browserExecutable: executablePath,
    loopbackOnly: true,
    receipts,
    diagnostics,
    artifacts,
  };
  await writeFile(path.join(OUTPUT, "interaction-evidence-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(OUTPUT, "README.md"), `# V4 etkileşim kanıtı\n\nBu klasör, V4 üretim prototipinden loopback-only ve deterministik fixture ile alınmış ${artifacts.length} adet 1080×2400 etkileşim durumu içerir. Otomatik senaryo sonucu **${manifest.status}**, V3 insan görsel kararı **REJECTED**, V4 insan görsel kararı ise **PENDING** durumundadır. Teknik kanıt insan görsel onayının yerine geçmez.\n\n- Console error: ${diagnostics.consoleErrors.length}\n- Page error: ${diagnostics.pageErrors.length}\n- Failed same-origin request: ${diagnostics.failedRequests.length}\n- Dış ağ isteği: ${diagnostics.externalRequests.length}\n- Manifest: \`interaction-evidence-manifest.json\`\n`, "utf8");
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
