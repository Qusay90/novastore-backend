import { expect, test, type Page } from "@playwright/test";
import { waitForRequiredFonts } from "./font-readiness";

type CalId =
  | "CAL-01"
  | "CAL-02"
  | "CAL-03"
  | "CAL-04"
  | "CAL-05"
  | "CAL-06"
  | "CAL-07"
  | "CAL-08"
  | "CAL-09"
  | "CAL-10"
  | "CAL-11"
  | "CAL-12";

type RuntimeDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  failedAssets: string[];
  externalRequests: string[];
};

const CAL_IDS: CalId[] = [
  "CAL-01",
  "CAL-02",
  "CAL-03",
  "CAL-04",
  "CAL-05",
  "CAL-06",
  "CAL-07",
  "CAL-08",
  "CAL-09",
  "CAL-10",
  "CAL-11",
  "CAL-12",
];

const NAV_SELECTION: Partial<Record<CalId, string>> = {
  "CAL-02": "Ana Sayfa",
  "CAL-03": "Kategoriler",
  "CAL-04": "Ana Sayfa",
  "CAL-05": "Ana Sayfa",
  "CAL-07": "Sepetim",
  "CAL-08": "Sepetim",
  "CAL-09": "Hesabım",
  "CAL-10": "Hesabım",
  "CAL-11": "Destek",
  "CAL-12": "Destek",
};

test.use({ locale: "tr-TR" });

function monitorRuntime(page: Page): RuntimeDiagnostics {
  const diagnostics: RuntimeDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    failedAssets: [],
    externalRequests: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      diagnostics.externalRequests.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).origin === new URL(page.url()).origin) {
      diagnostics.failedRequests.push(`${request.resourceType()}: ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    if (
      ["font", "image", "script", "stylesheet"].includes(request.resourceType()) &&
      response.status() >= 400 &&
      new URL(response.url()).origin === new URL(page.url()).origin
    ) {
      diagnostics.failedAssets.push(`${response.status()} ${response.url()}`);
    }
  });

  return diagnostics;
}

function expectCleanRuntime(diagnostics: RuntimeDiagnostics) {
  expect(diagnostics.consoleErrors, "browser console errors").toEqual([]);
  expect(diagnostics.pageErrors, "uncaught page errors").toEqual([]);
  expect(diagnostics.failedRequests, "failed same-origin requests").toEqual([]);
  expect(diagnostics.failedAssets, "HTTP failures for render assets").toEqual([]);
  expect(diagnostics.externalRequests, "non-loopback network requests").toEqual([]);
}

async function waitForRender(page: Page) {
  await expect(page.getByTestId("calibration-app")).toBeVisible();
  await waitForRequiredFonts(page);
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete),
  );

  const brokenImages = await page.locator("img").evaluateAll((images) =>
    images
      .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
      .map((image) => image.getAttribute("src") ?? "<missing src>"),
  );
  expect(brokenImages, "broken images after render-ready").toEqual([]);
}

async function openCal(
  page: Page,
  cal: CalId,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({ cal, ...extra });
  await page.goto(`/?${params.toString()}`);
  await waitForRender(page);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", cal);
}

function navButton(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Müşteri alt navigasyonu" })
    .getByRole("button")
    .filter({ hasText: name });
}

test.describe("V3 canonical routing and shared shell", () => {
  test("every CAL route survives a direct load and reload without asset/runtime errors", async ({ page }) => {
    test.setTimeout(90_000);
    const diagnostics = monitorRuntime(page);

    for (const cal of CAL_IDS) {
      await test.step(`${cal} direct route`, async () => {
        await openCal(page, cal);
        expect(new URL(page.url()).searchParams.get("cal")).toBe(cal);
      });

      await test.step(`${cal} reload`, async () => {
        await page.reload();
        await waitForRender(page);
        await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", cal);
        expect(new URL(page.url()).searchParams.get("cal")).toBe(cal);
      });
    }

    expectCleanRuntime(diagnostics);
  });

  test("the accepted six-tab shell is present on every applicable screen, including checkout", async ({ page }) => {
    test.setTimeout(60_000);

    for (const [cal, selectedLabel] of Object.entries(NAV_SELECTION) as Array<[CalId, string]>) {
      await test.step(`${cal} selects ${selectedLabel}`, async () => {
        await openCal(page, cal);
        const nav = page.getByRole("navigation", { name: "Müşteri alt navigasyonu" });
        await expect(nav).toBeVisible();
        await expect(nav.getByRole("button")).toHaveCount(6);
        await expect(navButton(page, selectedLabel)).toHaveAttribute("aria-current", "page");
      });
    }

    for (const cal of ["CAL-01", "CAL-06"] as const) {
      await openCal(page, cal);
      await expect(page.getByRole("navigation", { name: "Müşteri alt navigasyonu" })).toHaveCount(0);
    }

    await openCal(page, "CAL-08");
    await expect(navButton(page, "Sepetim")).toHaveAttribute("aria-current", "page");
  });

  test("in-app navigation writes canonical URLs and follows browser back/forward history", async ({ page }) => {
    await openCal(page, "CAL-02");

    await navButton(page, "Kategoriler").click();
    await expect(page).toHaveURL(/\?cal=CAL-03(?:&|$)/);
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-03");

    await navButton(page, "Sepetim").click();
    await expect(page).toHaveURL(/\?cal=CAL-07(?:&|$)/);
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-07");

    await page.goBack();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-03");
    await expect(navButton(page, "Kategoriler")).toHaveAttribute("aria-current", "page");

    await page.goBack();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-02");
    await expect(navButton(page, "Ana Sayfa")).toHaveAttribute("aria-current", "page");

    await page.goForward();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-03");
  });
});

test.describe("V3 required interactions", () => {
  test("auth supports password visibility, reset, and registration states", async ({ page }) => {
    await openCal(page, "CAL-01");
    const password = page.getByLabel("Şifre", { exact: true });

    await expect(page.locator('[data-auth-view="login"]')).toBeVisible();
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Şifreyi göster" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Şifreyi gizle" }).click();
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Şifremi unuttum" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("forgot");
    await expect(page.locator('[data-auth-view="forgot"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: /Şifre(?:yi|ni) sıfırla/i })).toBeVisible();

    await page.getByRole("button", { name: "Geri" }).click();
    await expect(page.locator('[data-auth-view="login"]')).toBeVisible();
    await page.getByRole("button", { name: "Kayıt Ol" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("register");
    await expect(page.locator('[data-auth-view="register"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: /Hesap oluştur|Kayıt ol/i })).toBeVisible();
  });

  test("product cards and the V4.4 PDP expose shared, transient commerce state", async ({ page }) => {
    await openCal(page, "CAL-04");
    const product = page.locator(".product-card").filter({ hasText: "Nova Pulse ANC Kulaklık" }).first();
    const favorite = product.getByRole("button", { name: "Favoriye ekle" });
    const addToCart = product.locator(".add-cart");

    await expect(product).toHaveAttribute("data-card-wave", "css");
    await expect(product).toHaveAttribute("data-card-cutout", "gray-recess");
    await expect(product.getByRole("img", { name: "Nova Pulse ANC Kulaklık", exact: true })).toHaveAttribute("src", /\/generated\//);
    await expect(addToCart.locator("img")).toHaveCount(0);
    await expect(product).not.toContainText(/Kargo bilgisi|Ücretsiz Kargo/i);
    await expect(favorite).toHaveAttribute("aria-pressed", "false");
    await favorite.click();
    const savedFavorite = product.getByRole("button", { name: "Favoriden çıkar" });
    await expect(savedFavorite).toHaveAttribute("aria-pressed", "true");
    await expect(savedFavorite).toHaveClass(/favorite-active/);

    await expect(page.locator(".cart-badge")).toHaveText("3");
    const idleRect = await addToCart.boundingBox();
    expect(idleRect, "missing idle product-card cart control").not.toBeNull();
    const idleOrbPaint = await addToCart.locator(".add-cart-visual").evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      shadow: getComputedStyle(element).boxShadow,
    }));
    expect(idleOrbPaint.background).toBe("rgb(6, 30, 69)");
    expect(idleOrbPaint.shadow, "product-card cart control has a white halo").not.toMatch(/rgba?\(255,\s*255,\s*255/i);
    await expect(addToCart.locator(".cart-resting-icon")).toHaveCount(1);
    await expect(addToCart.locator(".cart-state-mark")).toHaveCount(1);
    await expect(addToCart.locator(".cart-state-mark")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(addToCart.locator(".cart-state-mark")).toHaveCSS("color", "rgb(6, 30, 69)");
    await expect(addToCart.locator(".cart-confirm-check")).toHaveCSS("opacity", "0");
    await addToCart.click();
    await expect(addToCart).toHaveAttribute("aria-label", "Nova Pulse ANC Kulaklık sepete eklendi");
    await expect(addToCart).toHaveAttribute("aria-pressed", "true");
    await expect(addToCart).toHaveAttribute("data-state", "confirmed");
    await expect(addToCart).toHaveAttribute("aria-disabled", "true");
    const confirmingRect = await addToCart.boundingBox();
    expect(confirmingRect, "missing confirming product-card cart control").not.toBeNull();
    expect(Math.abs(confirmingRect!.x - idleRect!.x), "cart confirmation moved horizontally").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect!.y - idleRect!.y), "cart confirmation moved vertically").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect!.width - idleRect!.width), "cart confirmation changed width").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect!.height - idleRect!.height), "cart confirmation changed height").toBeLessThanOrEqual(.5);
    expect(
      await addToCart.locator(".add-cart-visual").evaluate((element) => getComputedStyle(element).backgroundColor),
      "navy cart orb changed during confirmation",
    ).toBe(idleOrbPaint.background);
    await expect(addToCart.locator(".cart-idle-glyph")).toHaveCSS("animation-name", "cart-fold-into-check");
    await expect(addToCart.locator(".cart-confirm-check")).toHaveCSS("animation-name", "cart-check-morph");
    await page.waitForTimeout(660);
    await expect(addToCart.locator(".cart-confirm-check")).toHaveCSS("color", "rgb(53, 210, 117)");
    await expect(product.locator(".cart-feedback-label")).toHaveCount(0);
    await expect(product.locator(".product-copy").getByRole("status")).toHaveText("Nova Pulse ANC Kulaklık sepete eklendi");
    await expect(page.locator(".cart-badge")).toHaveText("4");
    await expect(addToCart).toHaveAttribute("aria-pressed", "false", { timeout: 1_500 });
    await expect(addToCart).toHaveAttribute("data-state", "idle");
    await expect(addToCart.locator(".cart-resting-icon")).toHaveCount(1);
    await expect(addToCart.locator(".cart-state-mark")).toHaveCount(1);
    await expect(addToCart.locator(".cart-confirm-check")).toHaveCSS("opacity", "0");
    await expect(product).not.toContainText("Sepete eklendi");

    await navButton(page, "Favoriler").click();
    await expect(page).toHaveURL(/\?cal=CAL-04&tab=favorites(?:&|$)/);
    await expect(page.locator(".favorites-heading").getByRole("heading", { name: "Favorilerim" })).toBeVisible();
    await expect(page.locator(".favorites-heading")).toContainText("1 ürün kaydedildi");
    const favoriteProduct = page.locator(".plp-products .product-card").filter({ hasText: "Nova Pulse ANC Kulaklık" });
    await expect(favoriteProduct).toHaveCount(1);
    await expect(favoriteProduct.getByRole("button", { name: "Favoriden çıkar" })).toHaveAttribute("aria-pressed", "true");

    await favoriteProduct.getByRole("button", { name: "Nova Pulse ANC Kulaklık detayını aç" }).click();
    await expect(page).toHaveURL(/\?cal=CAL-06(?:&|$)/);
    await expect(page.getByRole("heading", { name: "NovaStore" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Paylaş" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Favoriden çıkar" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".gallery-dots button")).toHaveCount(3);
    await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
    expect(await page.locator(".pdp-main-media img").evaluateAll((images) => images.every((image) => /\/generated\//.test(image.getAttribute("src") ?? "")))).toBe(true);
    await expect(page.getByRole("button", { name: "Kırık Beyaz" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Gece Mavisi" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".pdp-seller-panel")).toContainText("Nova Audio Mağazası");
    await expect(page.locator(".pdp-stock")).toContainText("Stokta · Son 7 ürün");
    await expect(page.locator(".pdp-delivery-band")).toHaveCount(0);
    await expect(page.locator(".fulfillment-note, .shipping-pill")).toHaveCount(0);
    await expect(page.locator(".product-detail-layout")).not.toContainText(/Kargo bilgisi|Yarın kargoda|Ücretsiz (?:kargo|teslimat)/i);
    await expect(page.getByRole("heading", { name: "Ürün ve satış bilgileri" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Benzer ürünler" })).toBeVisible();
    const description = page.locator(".pdp-description-copy");
    const details = page.locator(".pdp-description-toggle");
    await expect(description).toBeVisible();
    await expect(description).toContainText("Adaptif aktif gürültü engelleme");
    await expect(page.locator(".pdp-description-section .spec-grid")).toBeVisible();
    await expect(page.locator(".spec-grid")).toContainText("Bluetooth 5.3");
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(details).toContainText("Devamını gör");
    const collapsedDescription = await description.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(collapsedDescription.scrollHeight, "long description is not visually clamped").toBeGreaterThan(collapsedDescription.clientHeight);
    await details.click();
    await expect(details).toHaveAttribute("aria-expanded", "true");
    await expect(details).toContainText("Daha az göster");
    const expandedDescription = await description.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(expandedDescription.clientHeight, "description did not expand").toBeGreaterThan(collapsedDescription.clientHeight);
    await expect.poll(async () => description.evaluate((element) => element.scrollHeight - element.clientHeight), {
      message: "expanded description is still clipped",
    }).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Adedi artır" }).click();
    await expect(page.locator(".pdp-footer .quantity b")).toHaveText("2");
    const pdpCart = page.locator(".pdp-add-to-cart");
    const pdpRestingPaint = await pdpCart.evaluate((element) => `${getComputedStyle(element).backgroundColor} ${getComputedStyle(element).backgroundImage}`);
    await pdpCart.click();
    await expect(pdpCart).toHaveAttribute("aria-label", "Sepete eklendi");
    await expect(pdpCart).toHaveAttribute("aria-pressed", "true");
    expect(await pdpCart.evaluate((element) => `${getComputedStyle(element).backgroundColor} ${getComputedStyle(element).backgroundImage}`)).toBe(pdpRestingPaint);
    await expect(pdpCart.locator(".pdp-confirm-check")).toHaveCSS("color", "rgb(53, 210, 117)");
    await expect(pdpCart).toHaveAttribute("aria-pressed", "false", { timeout: 1_500 });
    await expect(page.getByRole("button", { name: "Hemen Al" })).toHaveCount(1);
    await expect(page.locator(".pdp-footer > button")).toHaveCount(2);
    await page.getByRole("button", { name: "Hemen Al" }).click();
    await expect(page).toHaveURL(/\?cal=CAL-08(?:&|$)/);
  });

  test("verified-purchase reviews publish immediately, private questions stay owner-scoped, and recommended-product actions share local state", async ({ page }) => {
    await openCal(page, "CAL-06");

    const reviewCard = page.locator(".pdp-review-card");
    await expect(reviewCard.getByRole("button", { name: "Değerlendir" })).toBeVisible();
    await reviewCard.getByRole("button", { name: "Değerlendir" }).click();
    await expect(reviewCard.getByRole("heading", { name: "Ürünü değerlendir" })).toBeVisible();
    await reviewCard.getByRole("button", { name: "4 yıldız" }).click();
    await expect(reviewCard.getByRole("button", { name: "4 yıldız" })).toHaveAttribute("aria-pressed", "true");
    await reviewCard.getByRole("textbox", { name: "Değerlendirmen" }).fill("Ses kalitesi güçlü ve uzun kullanımda rahat.");
    await reviewCard.getByRole("button", { name: "Gönder" }).click();
    const publishedReview = reviewCard.locator(".review-preview").filter({ hasText: "Ses kalitesi güçlü ve uzun kullanımda rahat." });
    await expect(publishedReview).toHaveCount(1);
    await expect(publishedReview).toContainText("Ku***");
    await expect(publishedReview).toContainText("Doğrulanmış alışveriş");
    await expect(publishedReview.locator(".review-avatar")).toBeVisible();
    await expect(publishedReview.locator("header b")).toHaveCSS("color", "rgb(6, 30, 69)");
    await expect(publishedReview.locator("header em")).toHaveCSS("color", "rgb(21, 148, 71)");
    await expect(reviewCard).toContainText("327 doğrulanmış değerlendirme");
    await expect(reviewCard.getByText(/incelemeye alındı/i)).toHaveCount(0);
    await expect(reviewCard.getByRole("button", { name: "Değerlendir" })).toHaveCount(0);

    const questionCard = page.locator(".pdp-question-card");
    const publicThread = questionCard.locator('.question-thread[data-status="answered"]');
    await expect(publicThread).toContainText("ANC açıkken pil ömrü yaklaşık kaç saat?");
    await expect(publicThread).toContainText("Satıcı yanıtı");
    await expect(publicThread).toContainText("yaklaşık 36 saate kadar");
    await expect(questionCard.getByText("Bu bekleyen soru başka müşteriye ait.")).toHaveCount(0);
    await questionCard.getByRole("button", { name: "Soru Sor" }).click();
    await questionCard.getByRole("textbox", { name: "Ürün hakkında sorun" }).fill("Aynı anda iki cihaza bağlanıyor mu?");
    await questionCard.getByRole("button", { name: "Satıcıya Gönder" }).click();
    const privateThread = questionCard.locator('.question-thread[data-status="pending"]').filter({ hasText: "Aynı anda iki cihaza bağlanıyor mu?" });
    await expect(privateThread).toHaveCount(1);
    await expect(privateThread).toContainText("Soru · Ku***");
    await expect(privateThread.getByRole("status")).toContainText("Satıcı yanıtı bekleniyor · yalnızca sen görebilirsin");
    await expect(privateThread.locator(".answer-block")).toHaveCount(0);

    await page.getByRole("button", { name: "Geri" }).click();
    const pulseCard = page.locator('.product-card[data-product-id="pulse-anc"]').first();
    await pulseCard.locator(".product-title-action").click();
    await expect(page.locator(".product-detail-layout")).toHaveAttribute("data-product-id", "pulse-anc");
    await expect(page.locator(".pdp-review-card").getByText("Ses kalitesi güçlü ve uzun kullanımda rahat.")).toBeVisible();
    await expect(page.locator(".pdp-review-card").getByRole("button", { name: "Değerlendir" })).toHaveCount(0);
    await expect(page.locator('.question-thread[data-status="pending"]').filter({ hasText: "Aynı anda iki cihaza bağlanıyor mu?" })).toBeVisible();

    const recommendation = page.locator('.recommendations .product-card[data-product-id="sound-n1"]');
    const recommendationFavorite = recommendation.getByRole("button", { name: "Favoriye ekle" });
    await recommendationFavorite.click();
    await expect(recommendation.getByRole("button", { name: "Favoriden çıkar" })).toHaveAttribute("aria-pressed", "true");

    const recommendationCart = recommendation.locator(".add-cart");
    await expect(recommendationCart).toHaveAttribute("aria-label", "NovaSound N1 Kulaklık sepete ekle");
    await recommendationCart.click();
    await expect(recommendationCart).toHaveAttribute("aria-label", "NovaSound N1 Kulaklık sepete eklendi");
    await expect(recommendationCart).toHaveAttribute("aria-pressed", "true");
    await expect(recommendation.locator(".cart-confirm-check")).toHaveCSS("color", "rgb(53, 210, 117)");
    await expect(recommendationCart).toHaveAttribute("aria-pressed", "false", { timeout: 1_500 });

    await recommendation.locator(".product-title-action").click();
    await expect(page.locator(".product-detail-layout")).toHaveAttribute("data-product-id", "sound-n1");
    await expect(page.locator(".pdp-info").getByRole("heading", { name: "NovaSound N1 Kulaklık" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Favoriden çıkar" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".pdp-review-card").getByRole("button", { name: "Değerlendir" })).toHaveCount(0);
    await expect(page.locator(".review-eligibility-note")).toContainText("satın aldıktan sonra değerlendirebilirsin");

    await page.getByRole("button", { name: "Geri" }).click();
    await expect(page.locator(".cart-badge")).toHaveText("4");
  });

  test("home address and notification routes persist add, read, and preference state", async ({ page }) => {
    await openCal(page, "CAL-02");

    await page.getByTestId("app-topbar").getByRole("button", { name: "Konum seç" }).click();
    await expect(page).toHaveURL(/\?cal=CAL-10&tab=account&view=addresses$/);
    await expect(page.getByTestId("address-book-screen")).toBeVisible();
    await page.getByRole("button", { name: "Yeni adres ekle" }).click();
    const form = page.getByTestId("address-create-form");
    await form.getByRole("textbox", { name: "Adres adı" }).fill("İş");
    await form.getByRole("textbox", { name: "Adres alıcısı" }).fill("Nova Kullanıcı");
    await form.getByRole("textbox", { name: "Açık adres" }).fill("19 Mayıs Mah. No: 1");
    await form.getByRole("textbox", { name: "İl ve ilçe" }).fill("Samsun / İlkadım");
    await form.getByRole("textbox", { name: "Posta kodu" }).fill("55000");
    await form.getByRole("button", { name: "Adresi Kaydet" }).click();
    await expect(form).toHaveCount(0);
    const workAddress = page.locator(".saved-address").filter({ hasText: "İş" });
    await expect(workAddress).toContainText("19 Mayıs Mah. No: 1");
    await workAddress.getByRole("radio", { name: "İş adresini varsayılan yap" }).click();
    await expect(workAddress).toContainText("Varsayılan");

    await navButton(page, "Ana Sayfa").click();
    await page.getByTestId("app-topbar").getByRole("button", { name: "Konum seç" }).click();
    await expect(page.locator(".saved-address").filter({ hasText: "İş" })).toContainText("Varsayılan");

    await navButton(page, "Ana Sayfa").click();
    await page.getByTestId("app-topbar").getByRole("button", { name: "Bildirimler" }).click();
    await expect(page).toHaveURL(/\?cal=CAL-10&tab=account&view=notifications$/);
    await expect(page.getByTestId("notification-center-screen")).toBeVisible();
    await expect(page.locator(".notification-heading")).toContainText("3 okunmamış bildirim");
    const orderNotification = page.getByRole("button", { name: "Siparişin hazırlanıyor okunmadı" });
    await orderNotification.click();
    await expect(page).toHaveURL(/\?cal=CAL-09&tab=account(?:&|$)/);
    await expect(page.getByRole("heading", { name: "Sipariş #NS1234567" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("button", { name: "Siparişin hazırlanıyor okundu" })).toBeVisible();
    await expect(page.locator(".notification-heading")).toContainText("2 okunmamış bildirim");
    const campaigns = page.getByRole("switch", { name: "Kampanya ve fiyat fırsatları" });
    await expect(campaigns).toHaveAttribute("aria-checked", "false");
    await campaigns.click();
    await expect(campaigns).toHaveAttribute("aria-checked", "true");

    await navButton(page, "Ana Sayfa").click();
    await page.getByTestId("app-topbar").getByRole("button", { name: "Bildirimler" }).click();
    await expect(page.getByRole("button", { name: "Siparişin hazırlanıyor okundu" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Kampanya ve fiyat fırsatları" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Tümünü okundu işaretle" }).click();
    await expect(page.locator(".notification-heading")).toContainText("0 okunmamış bildirim");
  });

  test("filter controls can change and clear their values", async ({ page }) => {
    await openCal(page, "CAL-05");
    const brand = page.getByRole("button", { name: /Nova Audio/ });
    const inStock = page.getByRole("button", { name: "Stoktakiler" });
    const minimum = page.getByRole("textbox", { name: "En düşük fiyat" });
    const maximum = page.getByRole("textbox", { name: "En yüksek fiyat" });

    await expect(page.getByRole("slider")).toHaveCount(0);
    await expect(minimum).toHaveAttribute("inputmode", "numeric");
    await expect(maximum).toHaveAttribute("inputmode", "numeric");
    await expect(brand).toHaveAttribute("aria-pressed", "false");
    await brand.click();
    await expect(brand).toHaveAttribute("aria-pressed", "true");
    await expect(inStock).toHaveAttribute("aria-pressed", "false");
    await inStock.click();
    await expect(inStock).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Temizle" }).click();
    await minimum.fill("3000");
    await maximum.fill("5000");
    await expect(page.getByRole("button", { name: /Ürünü Göster/ })).toContainText("5 Ürünü Göster");

    await minimum.fill("6000");
    await expect(page.getByRole("alert")).toContainText("En düşük fiyat, en yüksek fiyattan büyük olamaz");
    await expect(minimum).toHaveAttribute("aria-invalid", "true");
    await expect(maximum).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: /Ürünü Göster/ })).toBeDisabled();

    await page.getByRole("button", { name: "Temizle" }).click();
    await expect(brand).toHaveAttribute("aria-pressed", "false");
    await expect(inStock).toHaveAttribute("aria-pressed", "false");
    await expect(minimum).toHaveValue("");
    await expect(maximum).toHaveValue("");
    await expect(page.getByRole("button", { name: /Ürünü Göster/ })).toContainText("12 Ürünü Göster");
    await page.getByRole("button", { name: /Ürünü Göster/ }).click();
    await expect(page).toHaveURL(/\?cal=CAL-04(?:&|$)/);
  });

  test("cart quantity and removal actions update their own rows", async ({ page }) => {
    await openCal(page, "CAL-07");
    const headphones = page.getByTestId("cart-item-headphones");
    const coffee = page.getByTestId("cart-item-coffee");

    await headphones.getByRole("button", { name: "Kulaklık adedini artır" }).click();
    await expect(headphones.locator(".quantity b")).toHaveText("2");
    await headphones.getByRole("button", { name: "Kulaklık adedini azalt" }).click();
    await expect(headphones.locator(".quantity b")).toHaveText("1");

    await coffee.getByRole("button", { name: "Sil" }).click();
    await expect(coffee).toHaveCount(0);
    await expect(page.getByText("1 ürün", { exact: true })).toBeVisible();
  });

  test("checkout keeps a single card method, aligned icons, CVV visibility, address, and deterministic submit states", async ({ page }) => {
    await openCal(page, "CAL-08");
    const cardMethod = page.getByRole("button", { name: "Kartla ödeme" });
    await expect(cardMethod).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".payment-methods button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Havale / EFT" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Kapıda Ödeme" })).toHaveCount(0);
    await expect(cardMethod).toHaveCSS("box-shadow", "none");

    const cvv = page.locator(".card-form label").filter({ hasText: "CVV" }).locator("input");
    await expect(cvv).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "CVV'yi göster" }).click();
    await expect(cvv).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "CVV'yi gizle" }).click();
    await expect(cvv).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Adresi değiştir" }).click();
    await expect(page.getByTestId("checkout-address-editor")).toBeVisible();
    await page.getByLabel("Adres", { exact: true }).fill("İş · 19 Mayıs Mah. No: 1");
    await page.getByRole("button", { name: /Adresi kaydet/i }).click();
    await expect(page.getByTestId("checkout-address-editor")).toHaveCount(0);
    await expect(page.locator(".address-card p")).toContainText("İş · 19 Mayıs Mah. No: 1");

    await page.getByRole("button", { name: /Güvenle Öde/ }).click();
    await expect(page.getByRole("status")).toContainText(/Siparişin alındı|Ödeme hazır/i);
  });

  test("Support Hub routes to NovaBot and the canonical returns state with the official asset", async ({ page }) => {
    await openCal(page, "CAL-11");
    const officialAsset = "/calibration-assets/official/support_novastore.png";
    await expect(page.getByRole("img", { name: "NovaBot" })).toHaveAttribute("src", officialAsset);

    await page.getByRole("button", { name: /NovaBot’u Başlat/ }).click();
    await expect(page).toHaveURL(/\?cal=CAL-12(?:&|$)/);
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-12");
    await expect(page.getByRole("img", { name: "NovaBot" })).toHaveAttribute("src", officialAsset);

    await page.goBack();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-11");
    await page.getByRole("button", { name: "İade ve Değişim" }).click();
    await expect(page).toHaveURL(/\?cal=CAL-10&tab=account&view=returns$/);
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-10");
    await expect(page.getByRole("heading", { name: "İade ve Değişim" })).toBeVisible();
  });

  test("NovaBot suggestions, send, and escalation remain functional", async ({ page }) => {
    await openCal(page, "CAL-12");
    const input = page.getByPlaceholder("Mesajını yaz...");

    await page.getByRole("button", { name: "Ödeme sorunu" }).click();
    await expect(page.locator(".message.user p", { hasText: "Ödeme sorunu" })).toBeVisible();
    await input.fill("Siparişim için canlı desteğe ihtiyacım var.");
    await page.getByRole("button", { name: "Mesajı gönder" }).click();
    await expect(page.getByText("Siparişim için canlı desteğe ihtiyacım var.", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Canlı desteğe bağlan/ }).click();
    await expect(page.getByRole("status")).toContainText(/destek|aktar/i);
  });
});

test.describe("V3 responsive containment", () => {
  for (const profile of [
    { name: "phone", width: 411, height: 914 },
    { name: "tablet", width: 800, height: 1280 },
  ] as const) {
    test(`${profile.name} routes do not overflow horizontally and can reach their bottom`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: profile.width, height: profile.height });

      for (const cal of CAL_IDS) {
        await test.step(`${cal} ${profile.name} containment`, async () => {
          await openCal(page, cal, {
            capture: "1",
            layout: profile.name,
            logicalWidth: String(profile.width),
            logicalHeight: String(profile.height),
            scale: "1",
          });

          const app = page.getByTestId("calibration-app");
          const horizontal = await app.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }));
          expect(
            horizontal.scrollWidth,
            `${cal} ${profile.name} horizontal overflow`,
          ).toBeLessThanOrEqual(horizontal.clientWidth + 1);

          const scroll = page.getByTestId("mobile-scroll");
          const bottomReach = await scroll.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
            return {
              actual: element.scrollTop,
              expected: Math.max(0, element.scrollHeight - element.clientHeight),
            };
          });
          expect(
            Math.abs(bottomReach.actual - bottomReach.expected),
            `${cal} ${profile.name} scroll-to-bottom gap`,
          ).toBeLessThanOrEqual(1);

          const nav = page.getByRole("navigation", { name: "Müşteri alt navigasyonu" });
          if (await nav.count()) {
            const [appBox, navBox] = await Promise.all([app.boundingBox(), nav.boundingBox()]);
            expect(appBox, "app box").not.toBeNull();
            expect(navBox, "nav box").not.toBeNull();
            expect(navBox!.x).toBeGreaterThanOrEqual(appBox!.x - 1);
            expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(appBox!.x + appBox!.width + 1);
            expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(appBox!.y + appBox!.height + 1);
          }
        });
      }
    });
  }
});
