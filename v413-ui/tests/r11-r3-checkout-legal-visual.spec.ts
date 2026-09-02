import { expect, test, type Locator, type Page } from "@playwright/test";

const profiles = [
  { name: "720x1600", width: 360, height: 800, deviceScaleFactor: 2 },
  { name: "1080x2400", width: 405, height: 900, deviceScaleFactor: 8 / 3 },
] as const;

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

function expectDisjoint(upper: Awaited<ReturnType<typeof box>>, lower: Awaited<ReturnType<typeof box>>, message: string) {
  expect(upper.y, `${message}: item is above the visible viewport`).toBeGreaterThanOrEqual(0);
  expect(upper.y, `${message}: item is below the visible viewport`).toBeLessThan(lower.y);
  expect(upper.y + upper.height, message).toBeLessThanOrEqual(lower.y);
}

async function openFixture(page: Page) {
  await page.goto("/tests/r11-r3-checkout-legal-fixture.html?layout=phone");
  await expect(page.getByTestId("checkout-legal-consent")).toBeVisible();
}

for (const profile of profiles) {
  test(`${profile.name} legal consent hierarchy, bindings, accessibility and geometry`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
    });
    const page = await context.newPage();
    await openFixture(page);

    const consent = page.getByTestId("checkout-legal-consent");
    await expect(consent.getByRole("heading", { name: "Sözleşmeler ve Onaylar" })).toBeVisible();
    await expect(consent).not.toContainText("r11-uat-test-v1");
    await expect(consent).not.toContainText("FormuSürüm");
    await expect(consent).not.toContainText("SözleşmesiSürüm");

    const firstCard = page.getByTestId("checkout-legal-document-pre-information");
    const secondCard = page.getByTestId("checkout-legal-document-distance-sale");
    await expect(firstCard).toHaveAttribute("data-document-version", "r11-uat-test-v1");
    await expect(firstCard).toHaveAttribute("data-document-content-sha256", "a".repeat(64));

    const firstCheckbox = page.getByRole("checkbox", { name: "Ön Bilgilendirme Formu sözleşmesini kabul et" });
    const secondCheckbox = page.getByRole("checkbox", { name: "Mesafeli Satış Sözleşmesi sözleşmesini kabul et" });
    await expect(firstCheckbox).not.toBeChecked();
    await expect(secondCheckbox).not.toBeChecked();
    await firstCheckbox.check();
    await secondCheckbox.check();
    await expect(firstCheckbox).toBeChecked();
    await expect(secondCheckbox).toBeChecked();
    await expect(firstCard).toHaveAttribute("data-accepted", "true");
    await expect(secondCard).toHaveAttribute("data-accepted", "true");

    const firstAction = page.getByTestId("checkout-legal-action-pre-information");
    const secondAction = page.getByTestId("checkout-legal-action-distance-sale");
    expect((await box(firstAction)).height).toBeGreaterThanOrEqual(44);
    expect((await box(secondAction)).height).toBeGreaterThanOrEqual(44);
    await firstAction.focus();
    await page.keyboard.press("Enter");
    await expect(firstCard.locator("details")).toHaveAttribute("open", "");
    const firstText = page.getByTestId("checkout-legal-text-pre-information");
    await expect(firstText).toContainText("yetkili sözleşme metni");
    await expect(firstText).toHaveAttribute("role", "region");
    await expect(firstText).toHaveAttribute("aria-label", "Ön Bilgilendirme Formu metni");
    await firstText.focus();
    await expect(firstText).toBeFocused();
    await firstText.evaluate((element) => { element.scrollTop = 0; });
    await page.keyboard.press("PageDown");
    await expect.poll(() => firstText.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await secondAction.click();
    await expect(secondCard.locator("details")).toHaveAttribute("open", "");
    await expect(page.getByTestId("checkout-legal-text-distance-sale")).toContainText("cayma ve iade hakları");

    const horizontalOverflow = await page.evaluate(() => {
      const rootOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const fixture = document.querySelector<HTMLElement>("[data-testid='fixture-scroll']");
      const fixtureOverflow = fixture ? fixture.scrollWidth - fixture.clientWidth : Number.POSITIVE_INFINITY;
      const viewportWidth = document.documentElement.clientWidth;
      const geometryOverflow = [...document.querySelectorAll<HTMLElement>("body *")].reduce((maximum, element) => {
        const rect = element.getBoundingClientRect();
        return Math.max(maximum, -rect.left, rect.right - viewportWidth);
      }, 0);
      return Math.max(rootOverflow, fixtureOverflow, geometryOverflow);
    });
    expect(horizontalOverflow).toBeLessThanOrEqual(1);

    const scroll = page.getByTestId("fixture-scroll");
    const overlapTargets = [secondAction, page.locator(".checkout-summary > .primary"), page.locator(".checkout-payment-gate"), page.locator(".checkout-summary > .secure-copy")];
    for (const locator of overlapTargets) {
      await locator.scrollIntoViewIfNeeded();
      await locator.evaluate((element) => {
        const scrollElement = document.querySelector<HTMLElement>("[data-testid='fixture-scroll']");
        const navElement = document.querySelector<HTMLElement>("[data-testid='fixture-bottom-nav']");
        if (!scrollElement || !navElement) throw new Error("Checkout geometry fixture is incomplete.");
        const contentBottom = element.getBoundingClientRect().bottom;
        const navTop = navElement.getBoundingClientRect().top;
        scrollElement.scrollTop += Math.max(0, contentBottom - navTop + 1);
      });
      const navBox = await box(page.getByTestId("fixture-bottom-nav"));
      expectDisjoint(await box(locator), navBox, `${profile.name} checkout content overlaps bottom navigation`);
    }
    await context.close();
  });
}
