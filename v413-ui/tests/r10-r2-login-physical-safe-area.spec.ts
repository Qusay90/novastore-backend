import { expect, test, type Page } from "@playwright/test";

const profiles = [
  { name: "gesture 360x800", viewport: { width: 360, height: 800 }, logical: { width: 360, height: 800 }, scale: 1, inset: 24 },
  { name: "three-button 411x914", viewport: { width: 411, height: 914 }, logical: { width: 411, height: 914 }, scale: 1, inset: 48 },
  { name: "1080x2400 reference", viewport: { width: 1080, height: 2400 }, logical: { width: 411.428571, height: 914.285714 }, scale: 2.625, inset: 48 },
] as const;

test.use({ locale: "tr-TR" });

async function openLogin(page: Page, profile: typeof profiles[number]) {
  await page.setViewportSize(profile.viewport);
  const params = new URLSearchParams({
    cal: "CAL-01",
    tab: "account",
    view: "login",
    capture: "1",
    layout: "phone",
    logicalWidth: String(profile.logical.width),
    logicalHeight: String(profile.logical.height),
    scale: String(profile.scale),
    motion: "reduced",
  });
  await page.goto(`/?${params.toString()}`);
  const app = page.getByTestId("calibration-app");
  await expect(app).toHaveAttribute("data-cal-id", "CAL-01");
  await app.evaluate((element, inset) => {
    (element as HTMLElement).style.setProperty("--shell-safe-bottom", `${inset}px`);
  }, profile.inset);
  return app;
}

for (const profile of profiles) {
  test(`login legal controls reserve the ${profile.name} bottom inset`, async ({ page }) => {
    const app = await openLogin(page, profile);
    const scroll = page.getByTestId("mobile-scroll");
    const footer = page.locator(".legal-links");

    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await footer.scrollIntoViewIfNeeded();

    const metrics = await footer.evaluate((element, inset) => {
      const appElement = document.querySelector<HTMLElement>("[data-testid=calibration-app]")!;
      const scrollElement = element.closest<HTMLElement>("[data-testid=mobile-scroll]")!;
      const appRect = appElement.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      const footerRect = element.getBoundingClientRect();
      const form = element.closest<HTMLElement>(".login-layout")!;
      return {
        appClientWidth: appElement.clientWidth,
        appScrollWidth: appElement.scrollWidth,
        clearance: scrollRect.bottom - footerRect.bottom,
        formPaddingBottom: Number.parseFloat(getComputedStyle(form).paddingBottom),
        scale: appRect.width / appElement.clientWidth,
        buttonHeights: Array.from(element.querySelectorAll("button"), (button) => button.getBoundingClientRect().height),
        expectedInset: inset,
      };
    }, profile.inset);

    expect(metrics.appScrollWidth, `${profile.name} horizontal overflow`).toBeLessThanOrEqual(metrics.appClientWidth + 1);
    expect(metrics.formPaddingBottom).toBeGreaterThanOrEqual(profile.inset);
    expect(metrics.clearance).toBeGreaterThanOrEqual(profile.inset * metrics.scale - 1);
    for (const height of metrics.buttonHeights) expect(height).toBeGreaterThanOrEqual(48 * metrics.scale - 1);
    await expect(footer).toBeVisible();
  });
}

test("login privacy and terms controls expose an explicit non-fabricated publication status", async ({ page }) => {
  await openLogin(page, profiles[1]);
  const scroll = page.getByTestId("mobile-scroll");
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });

  await page.getByRole("button", { name: "Gizlilik Politikası" }).click();
  const privacy = page.getByRole("dialog", { name: "Gizlilik Politikası" });
  await expect(privacy).toBeVisible();
  await expect(privacy).toContainText("içerik sahibi onayı bekleniyor");
  await privacy.getByRole("button", { name: "Giriş ekranına dön" }).click();
  await expect(privacy).toBeHidden();

  await page.getByRole("button", { name: "Kullanım Koşulları" }).click();
  const terms = page.getByRole("dialog", { name: "Kullanım Koşulları" });
  await expect(terms).toBeVisible();
  await expect(terms).toContainText("içerik sahibi onayı bekleniyor");
});
