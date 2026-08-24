import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForRequiredFonts } from "./font-readiness";

type Rect = { x: number; y: number; width: number; height: number };

test.use({ locale: "tr-TR" });

async function waitForRender(page: Page) {
  await expect(page.getByTestId("calibration-app")).toBeVisible();
  await waitForRequiredFonts(page);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));

  const broken = await page.locator("img").evaluateAll((images) => images
    .filter((image) => (image as HTMLImageElement).naturalWidth === 0 || (image as HTMLImageElement).naturalHeight === 0)
    .map((image) => image.getAttribute("src")));
  expect(broken, "broken render assets").toEqual([]);
}

async function openFluidPhone(
  page: Page,
  width: number,
  height: number,
  view: "root" | "payments" | "addresses" = "root",
) {
  const params = new URLSearchParams({
    cal: "CAL-10",
    tab: "account",
    capture: "1",
    layout: "phone",
    logicalWidth: String(width),
    logicalHeight: String(height),
    scale: "1",
    motion: "reduced",
  });
  if (view !== "root") params.set("view", view);

  await page.setViewportSize({ width, height });
  await page.goto(`/?${params.toString()}`);
  await waitForRender(page);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-10");
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", view);
}

async function box(locator: Locator): Promise<Rect> {
  const value = await locator.boundingBox();
  expect(value, `missing box for ${await locator.evaluate((element) => element.outerHTML.slice(0, 120))}`).not.toBeNull();
  return value!;
}

test.describe("V4.11 account commerce acceptance", () => {
  test("saved payment methods use a transient secure form, visible brands, and repeatable multi-card flow", async ({ page }) => {
    await openFluidPhone(page, 412, 915, "payments");

    const savedList = page.locator(".saved-payment-list");
    const savedCards = savedList.getByTestId("saved-payment-card");
    await expect(savedCards).toHaveCount(1);
    await expect(savedCards.first().locator(".payment-brand-logo")).toHaveAttribute("aria-label", "Visa");

    const initialCardBox = await box(savedCards.first());
    expect(initialCardBox.width / initialCardBox.height, "saved card aspect ratio").toBeGreaterThanOrEqual(1.55);
    expect(initialCardBox.width / initialCardBox.height, "saved card aspect ratio").toBeLessThanOrEqual(1.62);

    const addCard = page.getByRole("button", { name: "Yeni kart ekle" });
    await expect(addCard).toBeEnabled();
    await addCard.click();

    const sheet = page.getByTestId("bottom-sheet");
    const form = sheet.locator(".payment-add-form");
    await expect(sheet).toBeVisible();
    await expect(form.getByRole("textbox", { name: "Kart adı" })).toHaveAttribute("placeholder", "Nova Kartım");
    await expect(form.getByRole("button", { name: "Kartı Kaydet" })).toBeDisabled();

    const rawPan = "9792000000000003";
    const rawCvv = "123";
    await form.getByRole("textbox", { name: "Kart adı" }).fill("Seyahat Kartım");
    await form.getByRole("textbox", { name: "Kart üzerindeki isim" }).fill("NOVA KULLANICI");
    await form.getByRole("textbox", { name: "Kart numarası" }).fill(rawPan);
    await form.getByRole("textbox", { name: "Son kullanma tarihi" }).fill("0930");
    await form.getByRole("textbox", { name: "CVV" }).fill(rawCvv);

    const preview = form.getByTestId("saved-payment-card");
    await expect(preview).toHaveClass(/brand-troy/);
    await expect(preview.getByLabel("TROY")).toBeVisible();
    await expect(preview.locator(".payment-pan")).toContainText("0003");
    await expect(preview.locator("footer").filter({ hasText: "CVV" })).toContainText("•••");
    await expect(form.getByRole("button", { name: "Kartı Kaydet" })).toBeEnabled();
    await form.getByRole("button", { name: "Kartı Kaydet" }).click();

    await expect(sheet).toHaveCount(0);
    await expect(savedCards).toHaveCount(2);
    const troyItem = savedList.locator(".saved-payment-item").filter({ hasText: "Seyahat Kartım" });
    await expect(troyItem).toHaveCount(1);
    await expect(troyItem.locator(".saved-payment-card")).toHaveClass(/brand-troy/);
    await expect(troyItem.getByLabel("TROY")).toBeVisible();
    await expect(troyItem.locator(".payment-pan")).toContainText("0003");
    await expect(troyItem).not.toContainText(rawPan);
    await expect(troyItem).not.toContainText(rawCvv);

    const sensitiveInputValues = await page.locator("input").evaluateAll((inputs, sensitive) => inputs
      .map((input) => (input as HTMLInputElement).value.replace(/\s/g, ""))
      .filter((value) => value === sensitive.pan || value === sensitive.cvv), { pan: rawPan, cvv: rawCvv });
    expect(sensitiveInputValues, "PAN/CVV survived the closed add-card form").toEqual([]);

    await troyItem.getByRole("button", { name: "Varsayılan yap" }).click();
    await expect(troyItem).toContainText("Varsayılan");
    await expect(savedList.locator(".saved-payment-card footer em")).toHaveCount(1);

    await expect(addCard).toBeEnabled();
    await addCard.click();
    const reopenedForm = page.getByTestId("bottom-sheet").locator(".payment-add-form");
    await expect(reopenedForm.getByRole("textbox", { name: "Kart adı" })).toHaveValue("");
    await expect(reopenedForm.getByRole("textbox", { name: "Kart numarası" })).toHaveValue("");
    await expect(reopenedForm.getByRole("textbox", { name: "CVV" })).toHaveValue("");
    await reopenedForm.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
    await expect(savedCards).toHaveCount(2);
  });

  test("addresses add, edit without duplication, select one default, and delete only after confirmation", async ({ page }) => {
    await openFluidPhone(page, 412, 915, "addresses");

    const addresses = page.locator(".saved-address");
    await expect(addresses).toHaveCount(1);
    await page.getByRole("button", { name: "Yeni adres ekle" }).click();

    let form = page.getByTestId("address-create-form");
    await expect(form.getByRole("heading", { name: "Yeni adres" })).toBeVisible();
    await form.getByRole("textbox", { name: "Adres adı" }).fill("İş");
    await form.getByRole("textbox", { name: "Adres alıcısı" }).fill("Nova Kullanıcı");
    await form.getByRole("textbox", { name: "Açık adres" }).fill("19 Mayıs Mah. No: 1");
    await form.getByRole("textbox", { name: "İl ve ilçe" }).fill("Samsun / İlkadım");
    await form.getByRole("textbox", { name: "Posta kodu" }).fill("55000");
    await form.getByRole("button", { name: "Adresi Kaydet" }).click();

    await expect(form).toHaveCount(0);
    await expect(addresses).toHaveCount(2);
    let workAddress = addresses.filter({ hasText: "İş" });
    await expect(workAddress).toContainText("19 Mayıs Mah. No: 1");

    const defaultSelectorBox = await box(workAddress.getByRole("radio"));
    expect(defaultSelectorBox.width, "default-address selector width").toBeGreaterThanOrEqual(44);
    expect(defaultSelectorBox.height, "default-address selector height").toBeGreaterThanOrEqual(44);
    const actionHeights = await workAddress.locator(":scope > div:last-child button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(actionHeights.every((height) => height >= 44), "address edit/delete touch targets").toBe(true);

    await workAddress.getByRole("button", { name: "Düzenle" }).click();
    form = page.getByTestId("address-create-form");
    await expect(form.getByRole("heading", { name: "Adresi düzenle" })).toBeVisible();
    await expect(form.getByRole("textbox", { name: "Adres adı" })).toHaveValue("İş");
    await expect(form.getByRole("textbox", { name: "Açık adres" })).toHaveValue("19 Mayıs Mah. No: 1");
    await form.getByRole("textbox", { name: "Açık adres" }).fill("19 Mayıs Mah. No: 7 D: 3");
    await form.getByRole("button", { name: "Değişiklikleri Kaydet" }).click();

    await expect(form).toHaveCount(0);
    await expect(addresses).toHaveCount(2);
    workAddress = addresses.filter({ hasText: "İş" });
    await expect(workAddress).toContainText("19 Mayıs Mah. No: 7 D: 3");
    await expect(workAddress).not.toContainText("19 Mayıs Mah. No: 1");

    const workDefault = workAddress.getByRole("radio", { name: "İş adresini varsayılan yap" });
    await expect(workDefault).toHaveAttribute("aria-checked", "false");
    await workDefault.click();
    await expect(workDefault).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radiogroup", { name: "Varsayılan teslimat adresi" }).getByRole("radio", { checked: true })).toHaveCount(1);

    await workAddress.getByRole("button", { name: "Sil" }).click();
    const confirmation = page.getByTestId("bottom-sheet");
    await expect(confirmation.getByRole("heading", { name: "Adresi sil?" })).toBeVisible();
    await expect(workAddress).toHaveCount(1);
    await confirmation.getByRole("button", { name: "Vazgeç" }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(workAddress).toHaveCount(1);

    await workAddress.getByRole("button", { name: "Sil" }).click();
    await page.getByTestId("bottom-sheet").getByRole("button", { name: "Adresi Sil" }).click();
    await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
    await expect(workAddress).toHaveCount(0);
    await expect(addresses).toHaveCount(1);
    await expect(page.getByRole("radio", { name: "Ev adresini varsayılan yap" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radiogroup", { name: "Varsayılan teslimat adresi" }).getByRole("radio", { checked: true })).toHaveCount(1);
  });

  test("Hesabım terminal content stops 12–24px above the visible bottom-nav surface", async ({ page }) => {
    for (const profile of [{ width: 360, height: 800 }, { width: 412, height: 915 }]) {
      await test.step(`${profile.width}x${profile.height}`, async () => {
        await openFluidPhone(page, profile.width, profile.height);

        const scroll = page.getByTestId("mobile-scroll");
        await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        await expect.poll(async () => scroll.evaluate((element) => Math.abs(
          element.scrollTop - Math.max(0, element.scrollHeight - element.clientHeight),
        )), { message: `${profile.width}px account did not reach maximum scroll` }).toBeLessThanOrEqual(1);

        const logout = await box(page.locator(".logout"));
        const navSurface = await box(page.locator(".bottom-nav-surface"));
        const terminalGap = navSurface.y - (logout.y + logout.height);
        expect(terminalGap, `${profile.width}px account-to-nav gap`).toBeGreaterThanOrEqual(12);
        expect(terminalGap, `${profile.width}px account-to-nav gap`).toBeLessThanOrEqual(24);
      });
    }
  });
});
