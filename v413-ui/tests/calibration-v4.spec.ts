import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForRequiredFonts } from "./font-readiness";

const LOGICAL_PHONE = { width: 411.428571, height: 914.285714 };
const FLUID_PHONE_PROFILES = [
  { width: 320, height: 711 },
  { width: 360, height: 800 },
  { width: 393, height: 873 },
  { width: 411, height: 914 },
  { width: 427, height: 952 },
  { width: 480, height: 1067 },
] as const;
const CAL_IDS = Array.from({ length: 12 }, (_, index) => `CAL-${String(index + 1).padStart(2, "0")}`);
const CANONICAL_CAPTURE_PROFILES = {
  phone: {
    logical: LOGICAL_PHONE,
    physical: { width: 1080, height: 2400 },
    scale: 2.625,
  },
  tablet: {
    logical: { width: 800, height: 1280 },
    physical: { width: 1600, height: 2560 },
    scale: 2,
  },
} as const;

type CaptureProfile = keyof typeof CANONICAL_CAPTURE_PROFILES;
type Rect = { x: number; y: number; width: number; height: number };

test.use({ locale: "tr-TR" });

async function waitForRender(page: Page) {
  await expect(page.getByTestId("calibration-app")).toBeVisible();
  await waitForRequiredFonts(page);
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));
  const broken = await page.locator("img").evaluateAll((images) => images
    .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
    .map((image) => image.getAttribute("src")));
  expect(broken, "broken render assets").toEqual([]);
}

async function openCal(page: Page, cal: string, layout?: "phone" | "tablet") {
  const params = new URLSearchParams({ cal });
  if (layout) {
    const dimensions = layout === "phone" ? LOGICAL_PHONE : { width: 800, height: 1280 };
    params.set("capture", "1");
    params.set("layout", layout);
    params.set("logicalWidth", String(dimensions.width));
    params.set("logicalHeight", String(dimensions.height));
    params.set("scale", "1");
    await page.setViewportSize({ width: Math.ceil(dimensions.width), height: Math.ceil(dimensions.height) });
  }
  await page.goto(`/?${params.toString()}`);
  await waitForRender(page);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", cal);
}

async function openFluidPhone(
  page: Page,
  cal: string,
  width: number,
  height: number,
  route: { tab?: string; view?: string } = {},
) {
  const params = new URLSearchParams({
    cal,
    capture: "1",
    layout: "phone",
    logicalWidth: String(width),
    logicalHeight: String(height),
    scale: "1",
    motion: "reduced",
  });
  if (route.tab) params.set("tab", route.tab);
  if (route.view) params.set("view", route.view);
  await page.setViewportSize({ width, height });
  await page.goto(`/?${params.toString()}`);
  await waitForRender(page);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", cal);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", route.view || "root");
}

async function openCanonicalCapture(page: Page, cal: string, profileName: CaptureProfile) {
  const profile = CANONICAL_CAPTURE_PROFILES[profileName];
  const params = new URLSearchParams({
    cal,
    capture: "1",
    layout: profileName,
    logicalWidth: String(profile.logical.width),
    logicalHeight: String(profile.logical.height),
    scale: String(profile.scale),
    fixture: "deterministic",
    locale: "tr-TR",
    fontScale: "1.0",
    motion: "reduced",
    profile: profileName,
  });
  await page.setViewportSize(profile.physical);
  await page.goto(`/?${params.toString()}`);
  await waitForRender(page);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", cal);

  const app = page.getByTestId("calibration-app");
  const rendered = await box(app);
  expect(rendered.x, `${profileName} capture app x`).toBeCloseTo(0, 3);
  expect(rendered.y, `${profileName} capture app y`).toBeCloseTo(0, 3);
  expect(rendered.width, `${profileName} capture physical width`).toBeCloseTo(profile.physical.width, 3);
  expect(rendered.height, `${profileName} capture physical height`).toBeCloseTo(profile.physical.height, 3);

  const density = await app.evaluate((element) => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return {
      logicalWidth: element.clientWidth,
      logicalHeight: element.clientHeight,
      scaleX: matrix.a,
      scaleY: matrix.d,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
  expect(density.logicalWidth, `${profileName} logical width`).toBeCloseTo(profile.logical.width, 3);
  expect(density.logicalHeight, `${profileName} logical height`).toBeCloseTo(profile.logical.height, 3);
  expect(density.scaleX, `${profileName} logical-to-physical scale x`).toBeCloseTo(profile.scale, 3);
  expect(density.scaleY, `${profileName} logical-to-physical scale y`).toBeCloseTo(profile.scale, 3);
  // The capture pipeline intentionally rasterizes the logical canvas through
  // CSS scaling; this guards that contract rather than claiming device DPR.
  expect(density.devicePixelRatio, `${profileName} deterministic capture DPR`).toBe(1);
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value, `missing box for ${await locator.evaluate((element) => element.outerHTML.slice(0, 120))}`).not.toBeNull();
  return value!;
}

function expectInside(inner: Rect, outer: Rect, label: string, clearance = 0) {
  expect(inner.x, `${label}: left edge`).toBeGreaterThanOrEqual(outer.x + clearance);
  expect(inner.y, `${label}: top edge`).toBeGreaterThanOrEqual(outer.y + clearance);
  expect(inner.x + inner.width, `${label}: right edge`).toBeLessThanOrEqual(outer.x + outer.width - clearance);
  expect(inner.y + inner.height, `${label}: bottom edge`).toBeLessThanOrEqual(outer.y + outer.height - clearance);
}

function expectDisjoint(first: Rect, second: Rect, label: string, clearance = 0) {
  const horizontalGap = Math.max(first.x - (second.x + second.width), second.x - (first.x + first.width));
  const verticalGap = Math.max(first.y - (second.y + second.height), second.y - (first.y + first.height));
  // Rectangles are disjoint if they separate on either axis. Requiring the
  // requested clearance avoids passing on a single-pixel edge collision.
  expect(Math.max(horizontalGap, verticalGap), label).toBeGreaterThanOrEqual(clearance);
}

async function gridColumnCount(locator: Locator) {
  return locator.evaluate((element) => {
    const columns = getComputedStyle(element).gridTemplateColumns.trim();
    return columns === "none" ? 0 : columns.split(/\s+/).filter(Boolean).length;
  });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const dimensions = await page.getByTestId("calibration-app").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `${label} horizontal overflow`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectAppFixedTopbar(page: Page, label: string) {
  const app = page.getByTestId("calibration-app");
  const scroll = page.getByTestId("mobile-scroll");
  const header = app.getByTestId("app-topbar");

  await expect(header, `${label} has one visible app top bar`).toHaveCount(1);
  await expect(header, `${label} app top bar is visible`).toBeVisible();
  await expect(scroll, `${label} has one app-local scroll surface`).toHaveCount(1);
  await expect(
    scroll.locator('[data-testid="app-topbar"]'),
    `${label} app top bar is nested in MobileScroll`,
  ).toHaveCount(0);

  const anchor = await header.evaluate((element, appTestId) => {
    let current: HTMLElement | null = element as HTMLElement;
    while (current && current.dataset.testid !== appTestId) {
      const position = getComputedStyle(current).position;
      if (position === "absolute" || position === "fixed" || position === "sticky") {
        return { className: current.className, position };
      }
      current = current.parentElement;
    }
    return null;
  }, "calibration-app");
  expect(anchor, `${label} top bar has no app-fixed positioning anchor`).not.toBeNull();

  const before = await box(header);
  expectInside(before, await box(app), `${label} top bar is clipped by the app viewport`);
  const scrollState = await scroll.evaluate((element) => {
    const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = Math.min(360, maximum);
    return { maximum, applied: element.scrollTop };
  });
  if (scrollState.maximum > 1) {
    expect(scrollState.applied, `${label} content did not accept a scroll offset`).toBeGreaterThan(0);
  }
  await expect.poll(async () => Math.abs((await box(header)).y - before.y), {
    message: `${label} top bar moved with MobileScroll content`,
  }).toBeLessThanOrEqual(1);
}

test.describe("V4.10 unified shell, catalog, route reset, and refresh contract", () => {
  test("framed and capture modes resolve the same app-local top-bar anchor", async ({ page }) => {
    await openCal(page, "CAL-02");
    const framedApp = await box(page.getByTestId("mobile-app-viewport"));
    const framedTop = await box(page.getByTestId("app-topbar"));
    const framedScale = framedApp.width / LOGICAL_PHONE.width;
    const framedLogicalY = (framedTop.y - framedApp.y) / framedScale;

    await openCal(page, "CAL-02", "phone");
    const captureApp = await box(page.getByTestId("mobile-app-viewport"));
    const captureTop = await box(page.getByTestId("app-topbar"));
    const captureScale = captureApp.width / LOGICAL_PHONE.width;
    const captureLogicalY = (captureTop.y - captureApp.y) / captureScale;

    expect(Math.abs(framedLogicalY - captureLogicalY), "framed/capture top-bar anchor drift").toBeLessThanOrEqual(1);
  });

  test("framed top bar clears camera and status chrome and the switcher stays outside the app", async ({ page }) => {
    await openCal(page, "CAL-02");
    const top = await box(page.getByTestId("app-topbar"));
    const statusTime = await box(page.getByTestId("status-time"));
    const indicators = await box(page.getByTestId("status-indicators"));
    const camera = await box(page.getByTestId("device-camera"));
    expectDisjoint(top, statusTime, "top bar intersects status time");
    expectDisjoint(top, indicators, "top bar intersects status indicators");
    expectDisjoint(top, camera, "top bar intersects camera");

    const app = await box(page.getByTestId("mobile-app-viewport"));
    const switcher = await box(page.locator(".cal-switcher"));
    expectDisjoint(switcher, app, "debug switcher intersects app pixels");
    await expect(page.getByTestId("mobile-app-viewport").locator(".cal-switcher")).toHaveCount(0);
  });

  for (const cal of ["CAL-02", "CAL-03", "CAL-04", "CAL-05", "CAL-07", "CAL-08", "CAL-09", "CAL-10", "CAL-11", "CAL-12"]) {
    test(`${cal} bottom navigation is one SVG surface without a rectangular glass slab`, async ({ page }) => {
      await openCal(page, cal, "phone");
      const nav = page.getByTestId("customer-bottom-nav");
      await expect(nav).toHaveAttribute("data-surface-model", "single-svg-path");
      await expect(nav.locator(":scope > svg.bottom-nav-surface")).toHaveCount(1);
      await expect(nav.locator(".bottom-nav-backdrop, .bottom-nav-stroke, [class*='slab']")).toHaveCount(0);
      const paint = await nav.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, backdrop: style.backdropFilter };
      });
      expect(paint.background).toBe("rgba(0, 0, 0, 0)");
      expect(["none", ""]).toContain(paint.backdrop);
      expectInside(await box(nav), await box(page.getByTestId("mobile-app-viewport")), `${cal} navigation is clipped by app viewport`);
    });
  }

  test("home and account selection cores use the exact equal-column button center", async ({ page }) => {
    for (const [cal, label] of [["CAL-02", "Ana Sayfa"], ["CAL-10", "Hesabım"]] as const) {
      await openCal(page, cal, "phone");
      const nav = page.getByTestId("customer-bottom-nav");
      const selected = nav.getByRole("button", { name: label });
      const core = nav.locator(".selection-core");

      await expect.poll(async () => {
        const [buttonRect, coreRect] = await Promise.all([box(selected), box(core)]);
        return Math.abs(
          buttonRect.x + buttonRect.width / 2 - (coreRect.x + coreRect.width / 2),
        );
      }, { message: `${label} selection-core center drift` }).toBeLessThanOrEqual(0.75);
    }
  });

  test("location and address actions use a map pin and category rail items have semantic icons", async ({ page }) => {
    await openCal(page, "CAL-02", "phone");
    await expect(page.getByRole("button", { name: "Konum seç" }).locator('[data-icon="location-pin"]')).toHaveCount(1);

    await openCal(page, "CAL-10", "phone");
    await expect(page.locator(".account-tiles button", { hasText: "Adreslerim" }).locator('[data-icon="location-pin"]')).toHaveCount(1);

    await openCal(page, "CAL-03", "phone");
    const categories = page.locator(".category-rail button");
    await expect(categories).toHaveCount(6);
    for (const label of ["Elektronik", "Moda", "Ev & Yaşam", "Kozmetik", "Spor", "Süpermarket"]) {
      await expect(categories.filter({ hasText: label }).locator("svg, img")).toHaveCount(1);
    }
  });

  test("category selection keeps one focus-safe orange indicator and swaps the matching panel", async ({ page }) => {
    await openFluidPhone(page, "CAL-03", 411, 914);
    const tabs = page.getByRole("tab");
    const panel = page.getByRole("tabpanel");
    const cases = [
      ["Elektronik", "electronics", "Teknoloji Dünyası", "sub-tech.png"],
      ["Moda", "fashion", "Yeni Sezon", "cat-fashion.png"],
      ["Ev & Yaşam", "living", "Evini Yenile", "cat-living.png"],
      ["Kozmetik", "beauty", "Güzellik Dünyası", "cat-beauty.png"],
      ["Spor", "sport", "Aktif Yaşam", "cat-sport.png"],
      ["Süpermarket", "market", "Haftanın Fırsatları", "cat-market.png"],
    ];

    for (const [label, id, firstItem, image] of cases) {
      const tab = page.getByRole("tab", { name: label });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page.locator('.category-rail [role="tab"][aria-selected="true"]')).toHaveCount(1);
      await expect(panel).toHaveAttribute("data-category-id", id);
      await expect(panel.getByRole("heading", { name: label })).toBeVisible();
      await expect(panel.getByRole("button", { name: firstItem })).toBeVisible();
      await expect(panel.getByRole("button", { name: firstItem }).locator("img")).toHaveAttribute("src", new RegExp(image.replace(".", "\\.")));
      await expect.poll(
        () => tab.evaluate((element) => getComputedStyle(element, "::after").opacity),
        { message: `${label} indicator disappeared while focused` },
      ).toBe("1");
      expect(await page.locator('.category-rail [role="tab"][aria-selected="false"]').evaluateAll((elements) => elements.every((element) => getComputedStyle(element, "::after").opacity === "0"))).toBe(true);
    }

    const app = page.getByTestId("calibration-app");
    const beforeRefresh = Number(await app.getAttribute("data-refresh-id"));
    await page.getByTestId("customer-bottom-nav").getByRole("button", { name: "Kategoriler" }).click();
    await expect(app).toHaveAttribute("data-refresh-id", String(beforeRefresh + 1));
    await expect(page.getByRole("tab", { name: "Süpermarket" })).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute("data-category-id", "market");
  });

  test("home category and subcategory navigation carry catalog context into the PLP", async ({ page }) => {
    await openFluidPhone(page, "CAL-02", 411, 914);
    await page.locator(".category-mosaic").getByRole("button", { name: /Moda/ }).click();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-03");
    await expect(page.getByRole("tab", { name: "Moda" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveAttribute("data-category-id", "fashion");
    await page.getByRole("tabpanel").getByRole("button", { name: "Kadın Giyim" }).click();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-04");
    await expect(page.locator(".breadcrumb")).toContainText("Moda");
    await expect(page.locator(".breadcrumb")).toContainText("Kadın Giyim");
    await expect(page.locator(".plp-heading h1")).toHaveText("Kadın Giyim");
  });

  test("centered search expands into a distinct keyboard-aware suggestion overlay and results view", async ({ page }) => {
    await openCal(page, "CAL-02", "phone");
    const topbar = page.getByTestId("app-topbar");
    const searchAction = topbar.getByRole("button", { name: "Ara" });
    const [topbarRect, searchRect] = await Promise.all([box(topbar), box(searchAction)]);
    expect(
      Math.abs(searchRect.x + searchRect.width / 2 - (topbarRect.x + topbarRect.width / 2)),
      "collapsed search action center drift",
    ).toBeLessThanOrEqual(0.75);

    await searchAction.click();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", "search");
    await expect(page.getByTestId("search-screen")).toBeVisible();
    const input = page.getByRole("textbox", { name: "Ürün ara" });
    await expect(input).toBeEditable();
    await expect(page.getByTestId("search-suggestion-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Son aramalar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Önerilen aramalar" })).toBeVisible();

    await input.fill("Nova Pulse ANC");
    await expect(page.getByRole("heading", { name: "Arama sonuçları" })).toBeVisible();
    await expect(page.locator(".search-results .product-card")).toHaveCount(1);
    await expect(page.locator(".search-results")).toContainText("Nova Pulse ANC Kulaklık");
  });

  test("sticky search suggestions dismiss on meaningful scroll, reopen without a jump, and never reserve layout space", async ({ page }) => {
    await openFluidPhone(page, "CAL-02", 411, 914, { view: "search" });
    const panel = page.getByTestId("search-suggestion-panel");
    const scroll = page.getByTestId("mobile-scroll");
    const topbar = page.getByTestId("app-topbar");
    const discovery = page.locator(".search-discovery");

    await expect(panel).toBeVisible();
    await expect(discovery).toBeVisible();
    const discoveryOffsetWithPanel = await discovery.evaluate((element) => (element as HTMLElement).offsetTop);
    const topbarBefore = await box(topbar);

    const deleteHistory = page.getByRole("button", { name: "kablosuz kulaklık aramasını sil" });
    const deleteBox = await box(deleteHistory);
    expect(deleteBox.width, "history delete touch width").toBeGreaterThanOrEqual(44);
    expect(deleteBox.height, "history delete touch height").toBeGreaterThanOrEqual(44);
    await deleteHistory.click();
    await expect(page.getByRole("button", { name: "kablosuz kulaklık aramasını sil" })).toHaveCount(0);

    await scroll.evaluate((element) => { element.scrollTop = 12; });
    await expect(panel).toBeHidden();
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(8);
    expect(await discovery.evaluate((element) => (element as HTMLElement).offsetTop), "overlay close shifted discovery layout").toBe(discoveryOffsetWithPanel);
    const topbarAfterScroll = await box(topbar);
    expect(Math.abs(topbarAfterScroll.y - topbarBefore.y), "search top bar moved with results").toBeLessThanOrEqual(.25);

    const scrollBeforeReopen = await scroll.evaluate((element) => element.scrollTop);
    await page.getByRole("textbox", { name: "Ürün ara" }).click();
    await expect(panel).toBeVisible();
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeCloseTo(scrollBeforeReopen, 0);
    expect(await discovery.evaluate((element) => (element as HTMLElement).offsetTop), "overlay reopen shifted discovery layout").toBe(discoveryOffsetWithPanel);
    await expect(page.getByRole("button", { name: "kablosuz kulaklık aramasını sil" })).toHaveCount(0);

    await panel.getByRole("button", { name: "Valiz", exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Ürün ara" })).toHaveValue("Valiz");
    await expect(page.locator(".search-results .product-card")).toHaveCount(1);
    await expect(page.locator(".search-results")).toContainText("Nova Seyahat Valizi");
  });

  test("pointer taps stay transparent and never paint a sharp focus rectangle", async ({ page }) => {
    const assertRoundedCompositeFocus = async (input: Locator, shell: Locator) => {
      await shell.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      if (await input.getAttribute("autofocus") !== null) {
        await expect(input).toBeFocused();
        await expect(page.getByTestId("mobile-app-viewport")).toHaveAttribute("data-keyboard-visible", "true");
      }
      const before = await box(shell);
      await input.click();
      await expect(input).toBeFocused();
      const paint = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
      });
      expect(paint.outlineWidth).toBe("0px");
      expect(paint.boxShadow).toBe("none");
      expect(await page.getByTestId("calibration-app").getAttribute("data-focus-modality")).toBe("pointer");
      const after = await box(shell);
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(.1);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(.1);
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(.1);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(.1);
    };

    await openFluidPhone(page, "CAL-02", 411, 914, { view: "search" });
    const productSearch = page.getByRole("textbox", { name: "Ürün ara" });
    await assertRoundedCompositeFocus(productSearch, page.locator(".search-field"));
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(productSearch).toBeFocused();
    expect(await page.locator(".search-field").evaluate((element) => getComputedStyle(element).boxShadow)).toContain("rgb(6, 30, 69)");

    await openFluidPhone(page, "CAL-11", 411, 914);
    await assertRoundedCompositeFocus(page.getByRole("textbox", { name: "Destekte ara" }), page.locator(".support-search"));

    await openFluidPhone(page, "CAL-12", 411, 914);
    await assertRoundedCompositeFocus(page.getByPlaceholder("Mesajını yaz..."), page.locator(".composer"));

    await openFluidPhone(page, "CAL-06", 411, 914);
    const pointerTargets = [
      page.getByRole("button", { name: "Paylaş" }),
      page.locator(".recommendations .product-open-media:not([data-carousel-clone])").first(),
    ];
    for (const target of pointerTargets) {
      await expect(target).toBeVisible();
      const tapHighlight = await target.evaluate((element) => getComputedStyle(element)
        .getPropertyValue("-webkit-tap-highlight-color")
        .replaceAll(" ", ""));
      expect(tapHighlight).toBe("rgba(0,0,0,0)");
    }

    const share = pointerTargets[0];
    await share.click();
    const sharePaint = await share.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        focusVisible: element.matches(":focus-visible"),
      };
    });
    expect(sharePaint).toEqual({ outlineWidth: "0px", boxShadow: "none", focusVisible: false });
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-focus-modality", "pointer");
  });

  test("editable min/max price filters validate, update the real result count, and replace the broken slider", async ({ page }) => {
    await openFluidPhone(page, "CAL-05", 411, 914);
    const minimum = page.getByRole("textbox", { name: "En düşük fiyat" });
    const maximum = page.getByRole("textbox", { name: "En yüksek fiyat" });
    await expect(page.getByRole("slider")).toHaveCount(0);
    await expect(minimum).toHaveAttribute("inputmode", "numeric");
    await expect(maximum).toHaveAttribute("inputmode", "numeric");

    await minimum.fill("3000");
    await expect(page.getByRole("button", { name: /Ürünü Göster/ })).toContainText("8 Ürünü Göster");
    await maximum.fill("5000");
    await expect(page.getByRole("button", { name: /Ürünü Göster/ })).toContainText("5 Ürünü Göster");
    await page.getByRole("button", { name: /Ürünü Göster/ }).click();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-04");
    const filteredCards = page.locator(".plp-products .product-card");
    await expect(filteredCards).toHaveCount(5);
    const filteredPrices = await filteredCards.evaluateAll((cards) => cards.map((card) => Number(card.querySelector(".price strong")?.textContent?.replace(/\D/g, "") || 0)));
    expect(filteredPrices.every((price) => price >= 3000 && price <= 5000), `prices escaped applied range: ${filteredPrices.join(", ")}`).toBe(true);

    await page.getByRole("button", { name: /Filtrele/ }).click();
    await expect(minimum).toHaveValue("3000");
    await expect(maximum).toHaveValue("5000");
    await minimum.fill("6000");
    await expect(page.getByRole("alert")).toContainText("En düşük fiyat, en yüksek fiyattan büyük olamaz");
    await expect(minimum).toHaveAttribute("aria-invalid", "true");
    await expect(maximum).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: /Ürünü Göster/ })).toBeDisabled();

    await page.getByRole("button", { name: "Temizle" }).click();
    await expect(minimum).toHaveValue("");
    await expect(maximum).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ürünü Göster/ })).toContainText("12 Ürünü Göster");
    await page.getByRole("button", { name: /Ürünü Göster/ }).click();
    await expect(page.locator(".plp-products .product-card")).toHaveCount(12);
  });

  test("sort sheet offers one checked choice, applies real stable price order, and survives a filter round trip", async ({ page }) => {
    await openFluidPhone(page, "CAL-04", 411, 914);
    const sortButton = page.getByRole("button", { name: /Sırala:/ });
    const cards = page.locator(".plp-products .product-card");
    const readPrices = () => cards.evaluateAll((items) => items.map((card) => Number(card.querySelector(".price strong")?.textContent?.replace(/\D/g, "") || 0)));

    await expect(sortButton).toContainText("Önerilen / Öne çıkan");
    await sortButton.click();
    const dialog = page.getByRole("dialog", { name: "Sırala" });
    await expect(dialog).toBeVisible();
    const sortGroup = dialog.getByRole("radiogroup", { name: "Ürün sıralaması" });
    await expect(sortGroup.getByRole("radio")).toHaveCount(8);
    await expect(sortGroup.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(sortGroup.getByRole("radio", { name: "Önerilen / Öne çıkan" })).toHaveAttribute("aria-checked", "true");

    await sortGroup.getByRole("radio", { name: "Fiyat: düşükten yükseğe" }).click();
    await expect(dialog).toBeHidden();
    await expect(sortButton).toContainText("Fiyat: düşükten yükseğe");
    const ascending = await readPrices();
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    await page.getByRole("button", { name: /Filtrele/ }).click();
    await page.getByRole("button", { name: /Ürünü Göster/ }).click();
    await expect(sortButton).toContainText("Fiyat: düşükten yükseğe");
    const afterFilterRoundTrip = await readPrices();
    expect(afterFilterRoundTrip).toEqual([...afterFilterRoundTrip].sort((a, b) => a - b));

    await sortButton.click();
    const reopenedGroup = page.getByRole("dialog", { name: "Sırala" }).getByRole("radiogroup", { name: "Ürün sıralaması" });
    await expect(reopenedGroup.getByRole("radio", { name: "Fiyat: düşükten yükseğe" })).toHaveAttribute("aria-checked", "true");
    await reopenedGroup.getByRole("radio", { name: "Fiyat: yüksekten düşüğe" }).click();
    await expect(sortButton).toContainText("Fiyat: yüksekten düşüğe");
    const descending = await readPrices();
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
  });

  test("cart badge, rows, totals, and checkout all share one live cart", async ({ page }) => {
    await openFluidPhone(page, "CAL-04", 411, 914);
    const pulseCard = page.locator('.product-card[data-product-id="pulse-anc"]').first();
    await pulseCard.locator(".add-cart").click();
    await expect(page.locator(".cart-badge")).toHaveText("4");
    await page.getByTestId("customer-bottom-nav").getByRole("button", { name: "Sepetim" }).click();
    const headphones = page.getByTestId("cart-item-headphones");
    await expect(headphones.locator(".quantity b")).toHaveText("2");
    await expect(page.locator(".cart-title")).toContainText("4 ürün");
    await page.getByTestId("cart-item-coffee").getByRole("button", { name: "Sil" }).click();
    await expect(page.locator(".cart-badge")).toHaveText("2");
    await expect(page.locator(".cart-title")).toContainText("2 ürün");
    const cartTotal = await page.locator(".summary-rows .total b").textContent();
    await page.getByRole("button", { name: /Ödemeye Geç/ }).click();
    await expect(page.locator(".checkout-summary-card > .muted")).toHaveText("2 ürün");
    await expect(page.locator('.checkout-summary [data-product-id="pulse-anc"]')).toContainText("2 ×");
    await expect(page.locator(".checkout-summary .summary-rows .total b")).toHaveText(cartTotal ?? "");
  });

  test("every root-screen top bar stays app-fixed outside MobileScroll", async ({ page }) => {
    test.setTimeout(120_000);
    for (const cal of CAL_IDS) {
      await openFluidPhone(page, cal, 411, 914);
      await expectAppFixedTopbar(page, cal);
    }
  });

  test("search, checkout, account, and support subview top bars stay app-fixed", async ({ page }) => {
    test.setTimeout(120_000);
    const routes = [
      { cal: "CAL-02", tab: "home", view: "search" },
      { cal: "CAL-08", tab: "cart", view: "address" },
      { cal: "CAL-08", tab: "cart", view: "success" },
      { cal: "CAL-10", tab: "account", view: "addresses" },
      { cal: "CAL-10", tab: "account", view: "notifications" },
      { cal: "CAL-10", tab: "account", view: "returns" },
      { cal: "CAL-10", tab: "account", view: "faq" },
      { cal: "CAL-10", tab: "account", view: "history" },
      { cal: "CAL-11", tab: "support", view: "faq" },
      { cal: "CAL-11", tab: "support", view: "history" },
      { cal: "CAL-11", tab: "support", view: "live" },
    ] as const;

    for (const route of routes) {
      const label = `${route.cal}/${route.view}`;
      await openFluidPhone(page, route.cal, 411, 914, route);
      await expectAppFixedTopbar(page, label);
    }
  });

  test("new address and notification routes start at the top instead of inheriting the previous page scroll", async ({ page }) => {
    for (const [action, view] of [["Konum seç", "addresses"], ["Bildirimler", "notifications"]] as const) {
      await openFluidPhone(page, "CAL-02", 411, 914);
      const scroll = page.getByTestId("mobile-scroll");
      const applied = await scroll.evaluate((element) => {
        element.scrollTop = Math.min(420, element.scrollHeight - element.clientHeight);
        return element.scrollTop;
      });
      expect(applied, `${action} precondition did not scroll home`).toBeGreaterThan(100);

      const firstCommittedScroll = page.evaluate((expectedView) => new Promise<number>((resolve) => {
        const app = document.querySelector<HTMLElement>('[data-testid="calibration-app"]')!;
        const observer = new MutationObserver(() => {
          if (app.dataset.view !== expectedView) return;
          observer.disconnect();
          resolve(document.querySelector<HTMLElement>('[data-testid="mobile-scroll"]')?.scrollTop ?? -1);
        });
        observer.observe(app, { attributes: true, attributeFilter: ["data-view"] });
      }), view);

      await page.getByTestId("app-topbar").getByRole("button", { name: action }).click();
      expect(await firstCommittedScroll, `${action} route inherited a stale scroll offset`).toBe(0);
      await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", view);
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
      if (view === "addresses") {
        const refreshId = await page.getByTestId("calibration-app").getAttribute("data-refresh-id");
        await page.getByTestId("customer-bottom-nav").getByRole("button", { name: "Hesabım" }).click();
        await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-view", "root");
        await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-refresh-id", refreshId ?? "0");
      }
    }
  });

  test("every bell-bearing route opens the shared Notifications screen instead of a local status", async ({ page }) => {
    test.setTimeout(120_000);
    const routes = [
      { cal: "CAL-02" },
      { cal: "CAL-03" },
      { cal: "CAL-04" },
      { cal: "CAL-04", tab: "favorites" },
      { cal: "CAL-05" },
      { cal: "CAL-07" },
      { cal: "CAL-08" },
      { cal: "CAL-08", tab: "cart", view: "address" },
      { cal: "CAL-11" },
      { cal: "CAL-12" },
    ] as const;

    for (const route of routes) {
      await test.step(`${route.cal}/${route.view || route.tab || "root"}`, async () => {
        const params = new URLSearchParams({ cal: route.cal });
        if (route.tab) params.set("tab", route.tab);
        if (route.view) params.set("view", route.view);
        await page.goto(`/?${params.toString()}`);
        await waitForRender(page);

        const app = page.getByTestId("calibration-app");
        await expect(app).toHaveAttribute("data-cal-id", route.cal);
        await expect(app).toHaveAttribute("data-view", route.view || "root");
        const bell = page.getByTestId("app-topbar").getByRole("button", { name: "Bildirimler" });
        await expect(bell, `${route.cal} must expose exactly one notification action`).toHaveCount(1);

        await bell.click();
        await expect(app).toHaveAttribute("data-cal-id", "CAL-10");
        await expect(app).toHaveAttribute("data-view", "notifications");
        await expect(page.getByTestId("notification-center-screen")).toBeVisible();
        await expect.poll(() => page.getByTestId("mobile-scroll").evaluate((element) => element.scrollTop)).toBe(0);
        await expect(page.locator(".top-action-status")).toHaveCount(0);

        const destination = new URL(page.url());
        expect(destination.searchParams.get("cal")).toBe("CAL-10");
        expect(destination.searchParams.get("tab")).toBe("account");
        expect(destination.searchParams.get("view")).toBe("notifications");
      });
    }
  });

  test("browser back navigation also restores the destination at the top", async ({ page }) => {
    await openCal(page, "CAL-02");
    const scroll = page.getByTestId("mobile-scroll");
    await scroll.evaluate((element) => { element.scrollTop = Math.min(420, element.scrollHeight - element.clientHeight); });
    await page.getByTestId("customer-bottom-nav").getByRole("button", { name: "Hesabım" }).click();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-10");
    await scroll.evaluate((element) => { element.scrollTop = Math.min(260, element.scrollHeight - element.clientHeight); });
    await page.goBack();
    await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", "CAL-02");
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  });

  test("reselecting Home, Favorites, and Account refreshes at top without adding history", async ({ page }) => {
    await openCal(page, "CAL-02");
    const app = page.getByTestId("calibration-app");
    const scroll = page.getByTestId("mobile-scroll");
    const initialHistory = await page.evaluate(() => window.history.length);

    for (const [label, route] of [["Ana Sayfa", { cal: "CAL-02", tab: "home" }], ["Favoriler", { cal: "CAL-04", tab: "favorites" }], ["Hesabım", { cal: "CAL-10", tab: "account" }]] as const) {
      const navButton = page.getByTestId("customer-bottom-nav").getByRole("button", { name: label });
      if (await app.getAttribute("data-cal-id") !== route.cal || await page.getByTestId("customer-bottom-nav").getByRole("button", { name: label }).getAttribute("aria-current") !== "page") {
        await navButton.click();
        await expect(app).toHaveAttribute("data-cal-id", route.cal);
      }
      const beforeRefresh = Number(await app.getAttribute("data-refresh-id"));
      await scroll.evaluate((element) => { element.scrollTop = Math.min(280, element.scrollHeight - element.clientHeight); });
      await page.getByTestId("customer-bottom-nav").getByRole("button", { name: label }).click();
      await expect(app).toHaveAttribute("data-refresh-id", String(beforeRefresh + 1));
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
      await expect(page.getByTestId("refreshable-route-stage")).toHaveAttribute("aria-busy", "true");
    }

    expect(await page.evaluate(() => window.history.length), "same-tab refresh added a browser history entry").toBe(initialHistory + 2);
  });

  test("pull-to-refresh cancels below the filled threshold and refreshes after an armed release", async ({ page }) => {
    await openFluidPhone(page, "CAL-02", 411, 914);
    const app = page.getByTestId("calibration-app");
    const stage = page.getByTestId("refreshable-route-stage");
    const indicator = page.getByTestId("pull-refresh-indicator");
    const stageRect = await box(stage);
    const x = stageRect.x + stageRect.width / 2;
    const y = stageRect.y + 180;

    await page.getByTestId("mobile-scroll").evaluate((element) => { element.scrollTop = 180; });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 145, { steps: 8 });
    await page.mouse.up();
    await expect(stage).toHaveAttribute("data-refresh-state", "idle");
    await expect(app).toHaveAttribute("data-refresh-id", "0");
    await page.getByTestId("mobile-scroll").evaluate((element) => { element.scrollTop = 0; });

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 70, { steps: 6 });
    await expect(stage).toHaveAttribute("data-refresh-state", "pulling");
    expect(Number(await stage.getAttribute("data-refresh-progress"))).toBeGreaterThan(0);
    expect(Number(await stage.getAttribute("data-refresh-progress"))).toBeLessThan(1);
    await expect(indicator.locator(".pull-refresh-ring")).toHaveCount(0);
    const arrow = page.getByTestId("pull-refresh-arrow");
    await expect(arrow).toHaveCSS("background-image", "none");
    const partialArrowTransform = await arrow.locator("svg").evaluate((element) => getComputedStyle(element).transform);
    await page.mouse.up();
    await expect(stage).toHaveAttribute("data-refresh-state", "idle");
    await expect(app).toHaveAttribute("data-refresh-id", "0");

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 145, { steps: 8 });
    await expect(stage).toHaveAttribute("data-refresh-state", "armed");
    await page.mouse.move(x, y + 24, { steps: 5 });
    await expect(stage).toHaveAttribute("data-refresh-state", "pulling");
    await page.mouse.up();
    await expect(stage).toHaveAttribute("data-refresh-state", "idle");
    await expect(app).toHaveAttribute("data-refresh-id", "0");

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 145, { steps: 10 });
    await expect(stage).toHaveAttribute("data-refresh-state", "armed");
    await expect(stage).toHaveAttribute("data-refresh-progress", "1.00");
    const armedArrowTransform = await arrow.locator("svg").evaluate((element) => getComputedStyle(element).transform);
    expect(armedArrowTransform, "refresh arrow did not travel around its circular path").not.toBe(partialArrowTransform);
    await expect(indicator).toContainText("Bırakınca yenile");
    await page.mouse.up();
    await expect(app).toHaveAttribute("data-refresh-id", "1");
    await expect(stage).toHaveAttribute("data-refresh-state", "refreshing");
    await expect(stage).toHaveAttribute("aria-busy", "true");
    await expect(indicator).toContainText("Yenileniyor");
    await expect(stage).toHaveAttribute("data-refresh-state", "complete", { timeout: 1_200 });
    await expect(indicator).toContainText("Güncel");
    await expect(stage).toHaveAttribute("data-refresh-state", "idle", { timeout: 700 });
  });

  test("short Favorites content follows the pull and still refreshes without an inner scrollbar", async ({ page }) => {
    await openFluidPhone(page, "CAL-04", 411, 914, { tab: "favorites" });
    const app = page.getByTestId("calibration-app");
    const stage = page.getByTestId("refreshable-route-stage");
    const scroll = page.getByTestId("mobile-scroll");
    expect(await scroll.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(2);
    const stageRect = await box(stage);
    const x = stageRect.x + stageRect.width / 2;
    const y = stageRect.y + 180;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 145, { steps: 10 });
    await expect(stage).toHaveAttribute("data-fallback-pull", "true");
    await expect(stage).toHaveAttribute("data-refresh-state", "armed");
    await page.waitForTimeout(180);
    expect(await page.getByTestId("mobile-scroll-content").evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).f)).toBeGreaterThan(45);
    await page.mouse.move(x, stageRect.y + stageRect.height - 4, { steps: 4 });
    await page.mouse.up();

    await expect(app).toHaveAttribute("data-refresh-id", "1");
    await expect(stage).toHaveAttribute("data-refresh-state", "refreshing");
    await expect.poll(() => page.getByTestId("mobile-scroll-content").evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).f)).toBeLessThan(1);
  });
});

test.describe("V4.4 screen-specific acceptance guards", () => {
  test("CAL-04 keeps its heading visible and uses compact source-authoritative cards", async ({ page }) => {
    await openCal(page, "CAL-04", "phone");
    const heading = await box(page.getByRole("heading", { name: "Kablosuz Kulaklık" }));
    const card = await box(page.locator(".plp-products .product-card").first());
    expect(card.y).toBeGreaterThan(heading.y + heading.height);
    expect(card.width / card.height, "first product-card width/height ratio").toBeGreaterThan(0.48);
    expect(card.width / card.height, "first product-card width/height ratio").toBeLessThan(0.78);
    await expect(page.locator(".plp-products .product-card")).toHaveCount(12);
  });

  test("CAL-06 exposes visible details, transient icon-only feedback, Buy Now, and no uncomputed delivery promise", async ({ page }) => {
    await openCal(page, "CAL-06", "phone");
    const footer = page.getByTestId("pdp-sticky-footer");
    await expect(footer).toBeVisible();
    await expect(footer.locator(".quantity")).toHaveCount(1);
    await expect(footer.getByRole("button", { name: "Sepete Ekle" })).toHaveCount(1);
    await expect(footer.getByRole("button", { name: "Hemen Al" })).toHaveCount(1);
    await expect(footer.locator(":scope > button")).toHaveCount(2);
    await expect(page.getByTestId("customer-bottom-nav")).toHaveCount(0);
    await expect(page.locator(".pdp-delivery-band")).toHaveCount(0);
    await expect(page.locator(".fulfillment-note, .shipping-pill")).toHaveCount(0);
    await expect(page.locator(".product-detail-layout")).not.toContainText(/Kargo bilgisi|Yarın kargoda|Ücretsiz (?:kargo|teslimat)/i);
    await expect(page.locator(".pdp-seller-panel")).toContainText("Nova Audio Mağazası");
    await expect(page.getByRole("heading", { name: "Ürün ve satış bilgileri" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Benzer ürünler" })).toBeVisible();
    await expect(page.locator(".pdp-description-copy")).toBeVisible();
    await expect(page.locator(".pdp-description-section .spec-grid")).toBeVisible();
    await expect(page.locator(".pdp-description-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".pdp-description-toggle")).toContainText("Devamını gör");

    const cart = footer.locator(".pdp-add-to-cart");
    const restingPaint = await cart.evaluate((element) => `${getComputedStyle(element).backgroundColor} ${getComputedStyle(element).backgroundImage}`);
    const restingRect = await box(cart);
    await cart.click();
    const confirmingCart = footer.locator(".pdp-add-to-cart");
    await expect(confirmingCart).toHaveAttribute("aria-label", "Sepete eklendi");
    await expect(confirmingCart).toHaveAttribute("aria-pressed", "true");
    expect(await confirmingCart.evaluate((element) => `${getComputedStyle(element).backgroundColor} ${getComputedStyle(element).backgroundImage}`)).toBe(restingPaint);
    await expect(confirmingCart.locator(".pdp-confirm-check")).toHaveCSS("color", "rgb(53, 210, 117)");
    const confirmingRect = await box(confirmingCart);
    expect(Math.abs(confirmingRect.x - restingRect.x), "PDP confirmation moved horizontally").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect.y - restingRect.y), "PDP confirmation moved vertically").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect.width - restingRect.width), "PDP confirmation changed width").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect.height - restingRect.height), "PDP confirmation changed height").toBeLessThanOrEqual(.5);
    await expect(confirmingCart).toHaveAttribute("aria-pressed", "false", { timeout: 1_500 });
    expectInside(await box(footer), await box(page.getByTestId("mobile-app-viewport")), "CAL-06 sticky footer is clipped by app viewport");
  });

  test("product photos stay independent while cards render an asymmetric wave, gray recess, and halo-free cart", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openCal(page, "CAL-04", "phone");
    const card = page.locator(".plp-products .product-card").first();
    await expect(card).toHaveAttribute("data-card-wave", "css");
    await expect(card).toHaveAttribute("data-card-cutout", "gray-recess");
    await expect(card).toHaveAttribute("data-card-cutout-fit", "equal-top-left");
    const cardImages = card.locator(".product-media-slide:not([data-carousel-clone]) img");
    await expect(cardImages).toHaveCount(3);
    expect(await cardImages.evaluateAll((images) => images.every((image) => /\/generated\//.test(image.getAttribute("src") ?? "")))).toBe(true);
    await expect(card.locator(".product-media-position button")).toHaveCount(3);
    await expect(card.locator(".product-media-position button").first()).toHaveAttribute("aria-pressed", "true");
    const indicatorPaint = await card.locator(".product-media-position button").evaluateAll((buttons) => buttons.map((button) => {
      const dot = getComputedStyle(button, "::after");
      return { width: Number.parseFloat(dot.width), height: Number.parseFloat(dot.height), opacity: dot.backgroundColor };
    }));
    expect(indicatorPaint[0].width).toBeGreaterThan(indicatorPaint[1].width);
    expect(indicatorPaint[0].height).toBeGreaterThan(indicatorPaint[1].height);
    expect(indicatorPaint[0].width / indicatorPaint[0].height, "selected media indicator reads as a thin line").toBeLessThan(1.9);
    await expect(card.locator(".product-media .visually-hidden[role=status]")).toHaveText("Görsel 1 / 3");
    await expect(card.locator(".product-gallery-arrows button")).toHaveCount(2);
    await expect(card.locator(".add-cart img")).toHaveCount(0);
    await expect(card).toHaveCSS("background-color", "rgb(233, 232, 241)");
    await expect(card.locator(".product-copy")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(card).not.toContainText(/Kargo bilgisi|Ücretsiz Kargo/i);
    await expect(page.locator(".chip-row")).not.toContainText("Ücretsiz Kargo");
    const [cardRect, mediaRect, copyLeadRect, cartRect, priceRect] = await Promise.all([
      box(card),
      box(card.locator(".product-media")),
      box(card.locator(".bestseller")),
      box(card.locator(".add-cart-visual")),
      box(card.locator(".price")),
    ]);
    expect(cartRect.width / cardRect.width, "cart control is too large for the card").toBeLessThanOrEqual(.245);
    expect(cartRect.width / cardRect.width, "cart control is too small for the card").toBeGreaterThanOrEqual(.18);
    expect((await box(card.locator(".add-cart"))).width, "cart touch target is below 48px").toBeGreaterThanOrEqual(48);
    const shape = await card.evaluate((element) => {
      const media = element.querySelector<HTMLElement>(".product-media")!;
      const copy = element.querySelector<HTMLElement>(".product-copy")!;
      const orb = element.querySelector<HTMLElement>(".add-cart-visual")!;
      const plus = element.querySelector<HTMLElement>(".cart-state-mark")!;
      const cutoutShadowMask = element.querySelector<HTMLElement>(".cart-cutout-shadow")!;
      const cutoutShadowSurface = element.querySelector<HTMLElement>(".cart-cutout-shadow > i")!;
      const mediaStyle = getComputedStyle(media);
      const copySurface = getComputedStyle(copy, "::before");
      const rightLiftMatch = mediaStyle.clipPath.match(/line to 100% calc\(100% - ([\d.]+)px\)/);
      const leftLiftMatch = mediaStyle.clipPath.match(/curve to 0(?:px)? calc\(100% - ([\d.]+)px\)/);
      return {
        mediaClip: mediaStyle.clipPath,
        copyClip: copySurface.clipPath,
        copySurfaceBackground: copySurface.backgroundColor,
        copyShadowClip: getComputedStyle(cutoutShadowMask).clipPath,
        copyShadowMask: getComputedStyle(cutoutShadowMask).maskImage,
        copyShadowFilter: getComputedStyle(cutoutShadowSurface).filter,
        copyPaddingTop: Number.parseFloat(getComputedStyle(copy).paddingTop),
        copyPaddingLeft: Number.parseFloat(getComputedStyle(copy).paddingLeft),
        rightLift: Number(rightLiftMatch?.[1] ?? 0),
        leftLift: Number(leftLiftMatch?.[1] ?? 0),
        orbBackground: getComputedStyle(orb).backgroundColor,
        orbShadow: getComputedStyle(orb).boxShadow,
        plusBackground: getComputedStyle(plus).backgroundColor,
        plusColor: getComputedStyle(plus).color,
        plusShadow: getComputedStyle(plus).boxShadow,
        plusRadius: getComputedStyle(plus).borderRadius,
      };
    });
    expect(shape.mediaClip, "product-media seam is not a smooth responsive shape").toContain("shape(");
    expect(shape.mediaClip, "wave trough is not right of center").toContain("curve to 65.4% 100%");
    expect(shape.rightLift, "wave right edge is not raised above the left edge").toBeGreaterThan(shape.leftLift);
    expect(shape.copyClip, "cart recess is not a smooth responsive shape").toContain("shape(");
    expect(shape.copySurfaceBackground).toBe("rgb(255, 255, 255)");
    expect(shape.copyShadowClip, "recess shadow is not localized to the slanted left boundary").toContain("shape(");
    expect(shape.copyShadowMask, "recess shadow fade is not tied to the cart center").toContain("linear-gradient");
    expect(shape.copyShadowFilter, "recess boundary is missing its peeled-surface shadow").not.toBe("none");
    expect(shape.copyPaddingTop, "product information lost its wave clearance").toBeGreaterThan(shape.rightLift + 7);
    expect(shape.copyPaddingLeft, "product information is too close to the card edge").toBeGreaterThanOrEqual(9);
    expect(copyLeadRect.y - (mediaRect.y + mediaRect.height), "wave overlaps the first product-information row").toBeGreaterThanOrEqual(7);
    expect(copyLeadRect.x - cardRect.x, "product information is flush against the card edge").toBeGreaterThanOrEqual(9);
    expect(shape.orbBackground).toBe("rgb(6, 30, 69)");
    expect(shape.orbShadow, "cart orb has a white halo").not.toMatch(/rgba?\(255,\s*255,\s*255/i);
    expect(shape.plusBackground).toBe("rgb(255, 255, 255)");
    expect(shape.plusColor).toBe("rgb(6, 30, 69)");
    expect(shape.plusShadow).not.toBe("none");
    expect(shape.plusRadius).not.toBe("0px");
    expect(shape.leftLift, "wave is too deep").toBeLessThanOrEqual(mediaRect.height * .11);
    expect(shape.leftLift, "wave is visually flat").toBeGreaterThanOrEqual(mediaRect.height * .06);
    expect(shape.rightLift, "wave right edge is too flat").toBeGreaterThanOrEqual(mediaRect.height * .09);
    expect(shape.rightLift, "wave right edge is too deep").toBeLessThanOrEqual(mediaRect.height * .16);
    expectDisjoint(cartRect, priceRect, "cart cradle covers the price", 3);
    const cartRightInset = cardRect.x + cardRect.width - cartRect.x - cartRect.width;
    const cartBottomInset = cardRect.y + cardRect.height - cartRect.y - cartRect.height;
    expect(cartRightInset, "cart control is too far from the right corner").toBeLessThanOrEqual(8);
    expect(cartBottomInset, "cart control is too far from the bottom corner").toBeLessThanOrEqual(8);
    expect(Math.abs(cartRightInset - cartBottomInset), "cart corner insets are not balanced").toBeLessThanOrEqual(1.5);

    const favorite = card.locator(".product-media > .icon-button");
    await expect(favorite).toHaveAttribute("aria-label", "Favoriye ekle");
    await favorite.click();
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
    await expect(favorite).toHaveClass(/favorite-motion-add/);
    await expect(favorite.locator("svg")).toHaveCSS("animation-name", "favorite-heart-add");

    await page.getByTestId("customer-bottom-nav").getByRole("button", { name: "Favoriler" }).click();
    const savedCard = page.locator(".plp-products .product-card").filter({ hasText: "Nova Pulse ANC Kulaklık" });
    const removeFavorite = savedCard.getByRole("button", { name: "Favoriden çıkar" });
    await removeFavorite.click();
    await expect(removeFavorite).toHaveClass(/favorite-motion-remove/);
    await expect(removeFavorite.locator("svg")).toHaveCSS("animation-name", "favorite-heart-remove");
    await expect(savedCard).toHaveCount(1);
    await expect(savedCard).toHaveCount(0, { timeout: 900 });

    await page.goto("/?cal=CAL-04&capture=1&layout=phone&logicalWidth=411.428571&logicalHeight=914.285714&scale=1");
    await waitForRender(page);
    const restoredCard = page.locator(".plp-products .product-card").first();

    const carousel = restoredCard.locator(".product-media-carousel");
    const carouselRect = await box(carousel);
    await page.mouse.move(carouselRect.x + carouselRect.width * .84, carouselRect.y + carouselRect.height * .55);
    await page.mouse.down();
    await page.mouse.move(carouselRect.x + carouselRect.width * .12, carouselRect.y + carouselRect.height * .55, { steps: 2 });
    await page.mouse.up();
    await expect(restoredCard.locator(".product-media .visually-hidden[role=status]")).toHaveText("Görsel 2 / 3");
    await page.waitForTimeout(1_100);
    await expect(carousel).toHaveAttribute("data-page", "1");
    expect(await carousel.evaluate((element) => {
      const target = element.querySelectorAll<HTMLElement>(".product-media-slide:not([data-carousel-clone])")[1];
      return Math.abs(target.getBoundingClientRect().left - element.getBoundingClientRect().left);
    }), "one swipe did not settle exactly on the second photograph").toBeLessThanOrEqual(1.1);
    expect(Number(await restoredCard.getByRole("button", { name: "Sonraki ürün görseli" }).evaluate((element) => getComputedStyle(element).opacity))).toBeGreaterThan(0);
    await restoredCard.getByRole("button", { name: "Önceki ürün görseli" }).click();
    await expect(restoredCard.locator(".product-media .visually-hidden[role=status]")).toHaveText("Görsel 1 / 3");
    await restoredCard.getByRole("button", { name: "Sonraki ürün görseli" }).click();
    await expect(restoredCard.locator(".product-media .visually-hidden[role=status]")).toHaveText("Görsel 2 / 3");
    await expect(page).toHaveURL(/cal=CAL-04/);
    await restoredCard.getByRole("button", { name: "3. görseli göster" }).click();
    await expect(restoredCard.locator(".product-media .visually-hidden[role=status]")).toHaveText("Görsel 3 / 3");
    await expect(page).toHaveURL(/cal=CAL-04/);

    const addToCart = restoredCard.locator(".add-cart");
    const restingRect = await box(addToCart);
    const animationState = await addToCart.evaluate(async (element) => {
      element.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return {
        state: element.dataset.state,
        idle: getComputedStyle(element.querySelector<HTMLElement>(".cart-idle-glyph")!).animationName,
        check: getComputedStyle(element.querySelector<HTMLElement>(".cart-confirm-check")!).animationName,
      };
    });
    expect(animationState.state).toBe("confirmed");
    expect(animationState.idle).toBe("cart-fold-into-check");
    expect(animationState.check).toBe("cart-check-morph");
    await expect(addToCart).toHaveCSS("opacity", "1");
    await expect.poll(async () => Number(await addToCart.locator(".cart-confirm-check").evaluate((element) => getComputedStyle(element).opacity)), { timeout: 350 }).toBeGreaterThan(.95);
    await expect(addToCart.locator(".cart-confirm-check")).toHaveCSS("color", "rgb(53, 210, 117)");
    expect(await addToCart.locator(".add-cart-visual").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(shape.orbBackground);
    const confirmingRect = await box(addToCart);
    expect(Math.abs(confirmingRect.x - restingRect.x), "card confirmation moved horizontally").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect.y - restingRect.y), "card confirmation moved vertically").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect.width - restingRect.width), "card confirmation changed width").toBeLessThanOrEqual(.5);
    expect(Math.abs(confirmingRect.height - restingRect.height), "card confirmation changed height").toBeLessThanOrEqual(.5);
    await expect(addToCart).toHaveAttribute("data-state", "idle", { timeout: 1_500 });

    await restoredCard.getByRole("button", { name: "Nova Pulse ANC Kulaklık detayını aç" }).click();
    const pdpImages = page.locator(".pdp-main-media:not([data-carousel-clone]) img");
    await expect(pdpImages).toHaveCount(3);
    expect(await pdpImages.evaluateAll((images) => images.every((image) => /\/generated\//.test(image.getAttribute("src") ?? "")))).toBe(true);
    await expect(page.locator(".gallery-dots button")).toHaveCount(3);
  });

  test("key shopping screens reflow without clipping across 320–480 px phone widths", async ({ page }) => {
    test.setTimeout(120_000);
    for (const profile of FLUID_PHONE_PROFILES) {
      await test.step(`${profile.width}px home`, async () => {
        await openFluidPhone(page, "CAL-02", profile.width, profile.height);
        await expectNoHorizontalOverflow(page, `${profile.width}px CAL-02`);
        expectInside(
          await box(page.getByTestId("app-topbar")),
          await box(page.getByTestId("calibration-app")),
          `${profile.width}px home header clipped`,
        );
        expectInside(
          await box(page.getByTestId("customer-bottom-nav")),
          await box(page.getByTestId("calibration-app")),
          `${profile.width}px home navigation clipped`,
        );
      });

      await test.step(`${profile.width}px product listing`, async () => {
        await openFluidPhone(page, "CAL-04", profile.width, profile.height);
        await expectNoHorizontalOverflow(page, `${profile.width}px CAL-04`);
        const firstCardLocator = page.locator(".plp-products .product-card").first();
        const firstCard = await box(firstCardLocator);
        const firstMedia = await box(firstCardLocator.locator(".product-media"));
        const firstCopyLead = await box(firstCardLocator.locator(".bestseller"));
        expectInside(firstCard, await box(page.getByTestId("calibration-app")), `${profile.width}px product card clipped`);
        await expect(firstCardLocator).toHaveAttribute("data-card-cutout", "gray-recess");
        await expect(firstCardLocator).not.toContainText(/Kargo bilgisi|Ücretsiz Kargo/i);
        expect(firstCopyLead.y - (firstMedia.y + firstMedia.height), `${profile.width}px wave overlaps product information`).toBeGreaterThanOrEqual(7);
        expect(firstCopyLead.x - firstCard.x, `${profile.width}px product information is flush against the card edge`).toBeGreaterThanOrEqual(9);
        expect(
          await firstCardLocator.locator(".price").evaluate((element) => element.scrollWidth - element.clientWidth),
          `${profile.width}px price content overflows its reserved area`,
        ).toBeLessThanOrEqual(1);
        expectDisjoint(
          await box(firstCardLocator.locator(".add-cart-visual")),
          await box(firstCardLocator.locator(".price")),
          `${profile.width}px cart control covers price`,
          2,
        );
      });

      await test.step(`${profile.width}px product detail`, async () => {
        await openFluidPhone(page, "CAL-06", profile.width, profile.height);
        await expectNoHorizontalOverflow(page, `${profile.width}px CAL-06`);
        await expect(page.locator(".fulfillment-note, .pdp-delivery-band, .shipping-pill")).toHaveCount(0);
        await expect(page.locator(".pdp-description-copy")).toBeVisible();
        await expect(page.locator(".pdp-description-section .spec-grid")).toBeVisible();
        expectInside(
          await box(page.getByTestId("pdp-sticky-footer")),
          await box(page.getByTestId("calibration-app")),
          `${profile.width}px PDP footer clipped`,
        );
      });

      await test.step(`${profile.width}px address book`, async () => {
        await openFluidPhone(page, "CAL-10", profile.width, profile.height);
        await page.locator(".account-tiles button", { hasText: "Adreslerim" }).click();
        await expect(page.getByTestId("address-book-screen")).toBeVisible();
        await expectNoHorizontalOverflow(page, `${profile.width}px address book`);
      });

      await test.step(`${profile.width}px notification center`, async () => {
        await openFluidPhone(page, "CAL-02", profile.width, profile.height);
        await page.getByTestId("app-topbar").getByRole("button", { name: "Bildirimler" }).click();
        await expect(page.getByTestId("notification-center-screen")).toBeVisible();
        await expectNoHorizontalOverflow(page, `${profile.width}px notification center`);
      });
    }
  });

  test("CAL-08 payment CTA and security copy remain fully above the shared navigation", async ({ page }) => {
    await openCal(page, "CAL-08", "phone");
    const nav = await box(page.getByTestId("customer-bottom-nav"));
    const cta = await box(page.getByRole("button", { name: /Güvenle Öde/ }));
    const security = await box(page.locator(".checkout-summary > .secure-copy"));
    expectDisjoint(cta, nav, "CAL-08 payment CTA overlaps bottom navigation", 2);
    expectDisjoint(security, nav, "CAL-08 security copy overlaps bottom navigation", 2);
    expectInside(cta, await box(page.getByTestId("mobile-app-viewport")), "CAL-08 payment CTA is clipped");
  });

  test("CAL-10 opens with header and profile visible before the account navigation", async ({ page }) => {
    await openCal(page, "CAL-10", "phone");
    const header = await box(page.getByTestId("app-topbar"));
    const profile = await box(page.locator(".profile-card"));
    const nav = await box(page.getByTestId("customer-bottom-nav"));
    expect(header.y).toBeLessThan(profile.y);
    expectDisjoint(profile, nav, "CAL-10 profile overlaps bottom navigation", 2);
  });

  test("CAL-12 composer is visible, usable, and above navigation on first render", async ({ page }) => {
    await openCal(page, "CAL-12", "phone");
    const composer = await box(page.locator(".composer"));
    const nav = await box(page.getByTestId("customer-bottom-nav"));
    expectDisjoint(composer, nav, "CAL-12 composer overlaps bottom navigation", 2);
    expectInside(composer, await box(page.getByTestId("mobile-app-viewport")), "CAL-12 composer is clipped");
    await expect(page.getByPlaceholder("Mesajını yaz...")).toBeEditable();
    await expect(page.getByRole("button", { name: "Mesajı gönder" })).toBeVisible();
  });

  const tabletTerminalSelectors: Record<string, string> = {
    "CAL-01": ".legal-links",
    "CAL-02": ".product-grid",
    "CAL-03": ".subcategory-grid button:last-child",
    "CAL-04": ".plp-products .product-card:nth-child(8)",
    "CAL-05": ".filter-sheet",
    "CAL-06": ".pdp-footer",
    "CAL-07": ".delivery-note",
    "CAL-08": ".checkout-summary > .secure-copy",
    "CAL-09": ".order-total",
    "CAL-10": ".logout",
    "CAL-11": ".support-links",
    "CAL-12": ".composer",
  };
  const tabletAdaptiveGrids: Partial<Record<string, { selector: string; minimumColumns: number }>> = {
    "CAL-01": { selector: ".login-layout", minimumColumns: 2 },
    "CAL-02": { selector: ".product-grid", minimumColumns: 4 },
    "CAL-03": { selector: ".category-browser", minimumColumns: 2 },
    "CAL-04": { selector: ".plp-products", minimumColumns: 4 },
    "CAL-05": { selector: ".filter-columns", minimumColumns: 2 },
    "CAL-06": { selector: ".pdp-grid", minimumColumns: 2 },
    "CAL-07": { selector: ".cart-grid", minimumColumns: 2 },
    "CAL-08": { selector: ".checkout-grid", minimumColumns: 2 },
    "CAL-09": { selector: ".order-grid", minimumColumns: 2 },
    "CAL-10": { selector: ".account-layout", minimumColumns: 2 },
    "CAL-11": { selector: ".support-layout", minimumColumns: 2 },
  };

  for (const cal of CAL_IDS) {
    test(`tablet ${cal} consumes a meaningful first-view area without centering a phone card`, async ({ page }) => {
      await openCanonicalCapture(page, cal, "tablet");
      const app = await box(page.getByTestId("calibration-app"));
      const screen = await box(page.locator(".cal-screen"));
      expect(screen.width, `${cal} tablet screen width`).toBeGreaterThanOrEqual(app.width * 0.85);
      expect(screen.x, `${cal} tablet screen is centered/narrow`).toBeLessThanOrEqual(app.x + app.width * 0.075);
      const terminal = await box(page.locator(tabletTerminalSelectors[cal]));
      const consumed = (terminal.y + terminal.height - app.y) / app.height;
      expect(consumed, `${cal} tablet meaningful-area ratio`).toBeGreaterThanOrEqual(0.48);
      const horizontal = await page.getByTestId("calibration-app").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(horizontal.scrollWidth, `${cal} tablet horizontal overflow`).toBeLessThanOrEqual(horizontal.clientWidth + 1);

      const adaptive = tabletAdaptiveGrids[cal];
      if (adaptive) {
        expect(
          await gridColumnCount(page.locator(adaptive.selector)),
          `${cal} tablet ${adaptive.selector} column count`,
        ).toBeGreaterThanOrEqual(adaptive.minimumColumns);
      }
    });
  }
});

test.describe("V4.10 local support interaction guards", () => {
  test("support search filters real articles, expands an answer, and exposes a zero-result state", async ({ page }) => {
    await openCal(page, "CAL-11", "phone");
    const search = page.getByRole("textbox", { name: "Destekte ara" });
    const results = page.getByTestId("support-search-results");

    await search.fill("fatura");
    await expect(results).toBeVisible();
    await expect(results.locator("header")).toContainText("1 sonuç");
    const invoice = results.getByRole("button", { name: /Faturamı nasıl görüntülerim/ });
    await invoice.click();
    await expect(invoice).toHaveAttribute("aria-expanded", "true");
    await expect(results.getByRole("region", { name: /Faturamı nasıl görüntülerim\? ayrıntısı/ })).toContainText("e-arşiv fatura önizlemesine");

    await search.fill("bulunmayan zümrüt modem");
    await expect(page.getByTestId("support-search-empty")).toContainText("Sonuç bulunamadı");
    await expect(results.locator(".expandable-local-list > article")).toHaveCount(0);
  });

  test("account FAQ and history rows reveal deterministic local detail", async ({ page }) => {
    await openFluidPhone(page, "CAL-10", 411, 914, { tab: "account", view: "faq" });
    const faq = page.getByRole("button", { name: /Siparişimi nasıl takip ederim/ });
    await faq.click();
    await expect(faq).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: /Siparişimi nasıl takip ederim\? ayrıntısı/ })).toContainText("Hesabım");

    await openFluidPhone(page, "CAL-10", 411, 914, { tab: "account", view: "history" });
    const history = page.getByRole("button", { name: /Teslimat adresi güncellendi/ });
    await history.click();
    await expect(history).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: /Teslimat adresi güncellendi ayrıntısı/ })).toContainText("prototip oturumunda");
  });

  test("support FAQ, history, and live demo controls expose their own details and connection state", async ({ page }) => {
    await openFluidPhone(page, "CAL-11", 411, 914, { tab: "support", view: "faq" });
    const faq = page.getByRole("button", { name: /İade ve değişim nasıl yapılır/ });
    await faq.click();
    await expect(page.getByRole("region", { name: /İade ve değişim nasıl yapılır\? ayrıntısı/ })).toContainText("gerçek bir kargo kodu üretmez");

    await openFluidPhone(page, "CAL-11", 411, 914, { tab: "support", view: "history" });
    const history = page.getByRole("button", { name: /Sipariş #NS1234567/ });
    await history.click();
    await expect(page.getByRole("region", { name: /Sipariş #NS1234567 ayrıntısı/ })).toContainText("Kargo hareketleri");

    await openFluidPhone(page, "CAL-11", 411, 914, { tab: "support", view: "live" });
    const state = page.getByTestId("live-support-state");
    await expect(state).toHaveAttribute("data-state", "queued");
    await page.getByRole("button", { name: /Bağlantı durumunu yenile/ }).click();
    await expect(state).toHaveAttribute("data-state", "ready");
    await page.getByRole("button", { name: /Görüşmeyi başlat/ }).click();
    await expect(state).toHaveAttribute("data-state", "connected");
    await expect(state).toContainText("gerçek bir temsilciye");
  });

  test("NovaBot adds, removes, and sends a session-only mock attachment", async ({ page }) => {
    await openCal(page, "CAL-12", "phone");
    const addAttachment = page.getByRole("button", { name: "Dosya ekle" });
    await expect(addAttachment).toHaveAttribute("aria-pressed", "false");
    await addAttachment.click();
    const attachment = page.getByTestId("composer-attachment");
    await expect(attachment).toContainText("siparis-ekrani.png");
    await expect(addAttachment).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "siparis-ekrani.png ekini kaldır" }).click();
    await expect(attachment).toHaveCount(0);

    await addAttachment.click();
    await page.getByPlaceholder("Mesajını yaz...").fill("Sipariş ekranını inceler misin?");
    await page.getByRole("button", { name: "Mesajı gönder" }).click();
    const sent = page.locator(".message.user").last();
    await expect(sent).toContainText("Sipariş ekranını inceler misin?");
    await expect(sent).toContainText("Ek: siparis-ekrani.png");
    await expect(page.getByTestId("composer-attachment")).toHaveCount(0);
  });
});
