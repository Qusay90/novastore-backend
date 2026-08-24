import { expect, test, type Page } from "@playwright/test";

const phoneQuery = "capture=1&logicalWidth=411.428571&logicalHeight=914.285714&scale=1";

async function openPhone(page: Page, cal: string, view = "") {
  await page.goto(`/?cal=${cal}&tab=${cal === "CAL-08" ? "cart" : "home"}${view ? `&view=${view}` : ""}&${phoneQuery}`);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", cal);
}

test.use({ locale: "tr-TR" });

test("PDP media, wave seam, seller card, reading toggle, and Q&A answer follow V4.12", async ({ page }) => {
  await openPhone(page, "CAL-06");

  const media = page.locator(".pdp-media-shell");
  const info = page.locator(".pdp-info");
  const meta = page.locator(".pdp-gallery-meta");
  const [mediaBox, infoBox, metaBox] = await Promise.all([media.boundingBox(), info.boundingBox(), meta.boundingBox()]);
  expect(mediaBox && infoBox && metaBox).toBeTruthy();
  expect(Math.abs((infoBox?.x ?? 0) - (mediaBox?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((infoBox?.width ?? 0) - (mediaBox?.width ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((infoBox?.y ?? 0) - ((mediaBox?.y ?? 0) + (mediaBox?.height ?? 0)))).toBeLessThanOrEqual(1.5);
  expect((metaBox?.y ?? 0) + (metaBox?.height ?? 0)).toBeLessThanOrEqual((mediaBox?.y ?? 0) + (mediaBox?.height ?? 0));
  await expect(page.locator(".gallery-dots button")).toHaveCount(3);

  await expect(page.locator(".pdp-seller-panel")).toContainText("Satıcı Bilgisi");
  await expect(page.locator(".seller-store-preview")).toHaveCount(0);

  const copy = page.locator(".pdp-description-copy");
  const initialSize = Number.parseFloat(await copy.evaluate((element) => getComputedStyle(element).fontSize));
  await page.getByRole("button", { name: "Yazıları büyüt" }).click();
  const readableSize = Number.parseFloat(await copy.evaluate((element) => getComputedStyle(element).fontSize));
  expect(readableSize).toBeGreaterThanOrEqual(initialSize + 3);
  await expect(page.getByRole("button", { name: "Yazıları küçült" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Yazıları küçült" }).click();
  await expect(copy).toHaveCSS("font-size", `${initialSize}px`);

  const question = page.locator(".question-block");
  const answer = page.locator(".answer-block");
  const [questionBox, answerBox] = await Promise.all([question.boundingBox(), answer.boundingBox()]);
  expect((answerBox?.x ?? 0) - (questionBox?.x ?? 0)).toBeGreaterThanOrEqual(18);
  const answerLine = await answer.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { width: Number.parseFloat(style.width), color: style.backgroundColor };
  });
  expect(answerLine.width).toBeGreaterThanOrEqual(2);
  expect(answerLine.color).toBe("rgb(6, 30, 69)");
});

test("PDP store CTA opens a separate searchable, filterable, sortable storefront", async ({ page }) => {
  await openPhone(page, "CAL-06");
  await page.getByRole("button", { name: "Mağazaya Git" }).click();
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-04");
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", "store");
  await expect(page.getByTestId("storefront-screen")).toBeVisible();
  await expect(page.locator(".store-products-grid .product-card")).toHaveCount(3);
  await expect(page.locator(".store-products-grid .product-card")).toContainText(["Nova Audio Mağazası", "Nova Audio Mağazası", "Nova Audio Mağazası"]);

  await page.getByLabel("Nova Audio mağazasında ara").fill("Office");
  await expect(page.locator(".store-products-grid .product-card")).toHaveCount(1);
  await expect(page.locator(".store-products-grid .product-card")).toHaveAttribute("data-product-id", "pulse-office");
  await page.getByLabel("Nova Audio mağazasında ara").fill("");

  await page.getByRole("button", { name: "Sırala", exact: true }).click();
  await page.getByRole("radio", { name: "Fiyat: düşükten yükseğe" }).click();
  await expect(page.locator(".store-products-grid .product-card").first()).toHaveAttribute("data-product-id", "pulse-studio");

  await page.getByRole("button", { name: "Filtrele", exact: true }).click();
  await page.getByRole("checkbox", { name: /4,8 yıldız ve üzeri/ }).click();
  await page.getByRole("button", { name: /ürünü göster/ }).click();
  await expect(page.locator(".store-quick-filters button").filter({ hasText: "4,8★ ve üzeri" })).toHaveAttribute("aria-pressed", "true");
});

test("checkout exposes only card payment with neutral selection and a working CVV eye", async ({ page }) => {
  await openPhone(page, "CAL-08");
  const method = page.getByRole("button", { name: "Kartla ödeme" });
  await expect(method).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".payment-methods button")).toHaveCount(1);
  await expect(page.getByText("Havale / EFT", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kapıda Ödeme", { exact: true })).toHaveCount(0);
  const methodVisual = await method.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    shadow: getComputedStyle(element).boxShadow,
    border: getComputedStyle(element).borderColor,
  }));
  expect(methodVisual.background).toBe("rgb(234, 240, 246)");
  expect(methodVisual.shadow).toBe("none");
  expect(methodVisual.border).not.toBe("rgb(254, 90, 2)");

  await expect(method.locator('[data-icon="payment-card"]')).toHaveCount(1);
  await expect(page.locator(".card-form label").filter({ hasText: "Kart Numarası" }).locator('[data-icon="payment-card"]')).toHaveCount(1);
  await expect(page.locator(".card-form label").filter({ hasText: "Son Kullanma" }).locator('[data-icon="expiry-calendar"]')).toHaveCount(1);
  const cvv = page.locator(".card-form label").filter({ hasText: "CVV" }).locator("input");
  await expect(cvv).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "CVV'yi göster" }).click();
  await expect(cvv).toHaveAttribute("type", "text");
  await expect(cvv).toHaveValue("123");
  await page.getByRole("button", { name: "CVV'yi gizle" }).click();
  await expect(cvv).toHaveAttribute("type", "password");

  const centers = await page.locator(".card-form label").filter({ hasText: "CVV" }).evaluate((label) => {
    const input = label.querySelector("input")?.getBoundingClientRect();
    const button = label.querySelector("button")?.getBoundingClientRect();
    return input && button ? { input: input.top + input.height / 2, button: button.top + button.height / 2 } : null;
  });
  expect(centers).toBeTruthy();
  expect(Math.abs((centers?.input ?? 0) - (centers?.button ?? 0))).toBeLessThanOrEqual(1);

  for (const label of ["Kart Numarası", "Son Kullanma"] as const) {
    const aligned = await page.locator(".card-form label").filter({ hasText: label }).evaluate((field) => {
      const input = field.querySelector("input")?.getBoundingClientRect();
      const icon = field.querySelector(".input-icon > svg")?.getBoundingClientRect();
      return input && icon ? { input: input.top + input.height / 2, icon: icon.top + icon.height / 2 } : null;
    });
    expect(aligned).toBeTruthy();
    expect(Math.abs((aligned?.input ?? 0) - (aligned?.icon ?? 0))).toBeLessThanOrEqual(1);
  }

  await openPhone(page, "CAL-10");
  await expect(page.getByRole("button", { name: "Ödeme Yöntemlerim" }).locator('[data-icon="payment-card"]')).toHaveCount(1);
  await openPhone(page, "CAL-09");
  await expect(page.locator(".info-row").filter({ hasText: "Ödeme" }).locator('[data-icon="payment-card"]')).toHaveCount(1);
  await openPhone(page, "CAL-11");
  await expect(page.getByRole("button", { name: /Ödeme Sorunları/ }).locator('[data-icon="payment-card"]')).toHaveCount(1);
});

test("app top bars no longer paint the white outer glow", async ({ page }) => {
  for (const [cal, view] of [["CAL-02", ""], ["CAL-04", "store"], ["CAL-06", ""], ["CAL-08", ""]] as const) {
    await openPhone(page, cal, view);
    const visual = await page.getByTestId("app-topbar").evaluate((element) => ({
      shadow: getComputedStyle(element).boxShadow,
      highlight: getComputedStyle(element, "::after").content,
    }));
    expect(visual.shadow).not.toContain("255, 255, 255, 0.72");
    expect(visual.shadow).not.toContain("0px 13px 22px");
    expect(["none", "normal"]).toContain(visual.highlight);
  }
});

test("A-Z local correctness keeps modal backgrounds inert and preserves navigation identity", async ({ page }) => {
  await openPhone(page, "CAL-05");
  await expect(page.locator(".filter-backdrop")).toHaveAttribute("inert", "");
  await expect(page.locator(".filter-backdrop")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".filter-backdrop")).toHaveCSS("pointer-events", "none");

  await openPhone(page, "CAL-09");
  await page.getByRole("button", { name: /Ürüne Git/ }).click();
  await expect(page.locator(".product-detail-layout")).toHaveAttribute("data-product-id", "sound-n1");
  await expect(page.locator(".pdp-info h1")).toHaveText("NovaSound N1 Kulaklık");

  await openPhone(page, "CAL-11");
  await page.getByRole("button", { name: /Ödeme Sorunları/ }).click();
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-11");
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", "faq");
  await openPhone(page, "CAL-11");
  await page.getByRole("button", { name: /Hesap ve Güvenlik/ }).click();
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-10");
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", "security");

  await openPhone(page, "CAL-12");
  await expect(page.getByRole("textbox", { name: "NovaBot mesajı" })).toBeVisible();
});
