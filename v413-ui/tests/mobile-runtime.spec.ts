import { expect, test, type Locator, type Page } from "@playwright/test";

async function drag(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY: number,
  steps = 8,
  startOffsetY?: number,
) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Drag target has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + (startOffsetY ?? box.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      startX + (deltaX * step) / steps,
      startY + (deltaY * step) / steps,
    );
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
}

async function expectPhysicalPageAligned(carousel: Locator, physicalPage: number) {
  await expect.poll(() => carousel.evaluate((element, targetPage) => {
    const target = element.firstElementChild?.children[targetPage];
    if (!(target instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
    return Math.abs(target.getBoundingClientRect().left - element.getBoundingClientRect().left);
  }, physicalPage)).toBeLessThanOrEqual(.55);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html");
});

test("horizontal intent stays in Carousel and cannot create parent momentum", async ({ page }) => {
  const carousel = page.locator(".fixture-carousel");
  const card = page.locator(".carousel-card").nth(1);
  const parent = page.getByTestId("mobile-scroll");

  await expect(carousel).not.toHaveAttribute("data-scroll-drag", "ignore");
  await expect(carousel).toHaveCSS("touch-action", "none");
  await expect(carousel).toHaveCSS("overscroll-behavior-y", "auto");
  await drag(page, card, -130, 14, 5);

  const afterRelease = await carousel.evaluate((element) => element.scrollLeft);
  expect(afterRelease).toBeGreaterThan(40);
  expect(await parent.evaluate((element) => element.scrollTop)).toBe(0);

  await page.waitForTimeout(250);
  expect(await parent.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.getByTestId("tap-count").textContent()).toBe("0");
});

test("vertical intent over a carousel is handed to MobileScroll in both directions", async ({ page }) => {
  const card = page.locator(".carousel-card").nth(1);
  const carousel = page.locator(".fixture-carousel");
  const parent = page.getByTestId("mobile-scroll");

  await drag(page, card, 4, -150);
  expect(await parent.evaluate((element) => element.scrollTop)).toBeGreaterThan(60);
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBe(0);

  await parent.evaluate((element) => {
    element.scrollTop = 80;
  });
  await drag(page, card, -3, 110);
  expect(await parent.evaluate((element) => element.scrollTop)).toBeLessThan(80);
});

test("initial horizontal finger wobble cannot steal a vertical carousel drag", async ({ page }) => {
  const card = page.locator(".carousel-card").nth(1);
  const carousel = page.locator(".fixture-carousel");
  const parent = page.getByTestId("mobile-scroll");
  const box = await card.boundingBox();
  if (!box) throw new Error("Card has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Reproduce a real finger path: a short 2:1 horizontal opening wobble that
  // used to let Carousel capture before the intended vertical list swipe.
  await page.mouse.move(startX + 20, startY - 10);
  await page.waitForTimeout(8);
  await page.mouse.move(startX + 22, startY - 120, { steps: 5 });
  await page.mouse.up();

  expect(await parent.evaluate((element) => element.scrollTop)).toBeGreaterThan(40);
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBe(0);
});

test("an undecided opening wobble can still resolve to a horizontal carousel drag", async ({ page }) => {
  const card = page.locator(".carousel-card").nth(1);
  const carousel = page.locator(".fixture-carousel");
  const parent = page.getByTestId("mobile-scroll");
  const box = await card.boundingBox();
  if (!box) throw new Error("Card has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 20, startY + 10);
  await page.waitForTimeout(8);
  await page.mouse.move(startX - 120, startY + 14, { steps: 5 });
  await page.mouse.up();

  expect(await carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(40);
  expect(await parent.evaluate((element) => element.scrollTop)).toBe(0);
});

test("tap activates a card but a completed drag does not", async ({ page }) => {
  const firstCard = page.locator(".carousel-card").first();
  await firstCard.click();
  await expect(page.getByTestId("tap-count")).toHaveText("1");

  await drag(page, firstCard, -100, 6);
  await expect(page.getByTestId("tap-count")).toHaveText("1");
});

test("Carousel preserves momentum and edge rubber-banding", async ({ page }) => {
  const carousel = page.locator(".fixture-carousel");
  const card = page.locator(".carousel-card").nth(1);

  await expect(carousel).toHaveAttribute("data-paged", "false");

  await drag(page, card, -100, 5, 3);
  const releasedOffset = await carousel.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(120);
  expect(await carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(releasedOffset);

  await carousel.evaluate((element) => {
    element.scrollLeft = 0;
  });
  const box = await card.boundingBox();
  if (!box) throw new Error("Card has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 4 });
  expect(Number(await carousel.getAttribute("data-overscroll"))).toBeGreaterThan(0);
  await page.mouse.up();
  await page.waitForTimeout(900);
  expect(Math.abs(Number(await carousel.getAttribute("data-overscroll")))).toBeLessThan(1);
});

test("paged Carousel advances one neighbor and uses one bounded settle", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=paged-carousel");
  const carousel = page.locator(".fixture-paged-carousel");
  const reportedPage = page.getByTestId("paged-page");

  await expect(carousel).toHaveAttribute("data-paged", "true");
  await expect(reportedPage).toHaveText("1");
  await expect(carousel).toHaveAttribute("data-page", "1");
  await expect(carousel).toHaveAttribute("data-settling", "false");
  await expectPhysicalPageAligned(carousel, 1);

  const beginTrajectory = async () => {
    await carousel.evaluate((element) => {
      const target = window as typeof window & { __pagedOffsets?: number[] };
      target.__pagedOffsets = [element.scrollLeft];
      element.addEventListener("scroll", () => target.__pagedOffsets?.push(element.scrollLeft), { once: false });
    });
  };
  const readTrajectory = async () => carousel.evaluate((element) => {
    const target = window as typeof window & { __pagedOffsets?: number[] };
    return target.__pagedOffsets ?? [];
  });
  const physicalOffset = async (physicalPage: number) => carousel.evaluate((element, targetPage) => {
    const target = element.firstElementChild?.children[targetPage];
    return target instanceof HTMLElement ? target.offsetLeft : Number.NaN;
  }, physicalPage);
  const expectMonotonic = (values: number[], direction: "forward" | "backward") => {
    for (let index = 1; index < values.length; index += 1) {
      const delta = values[index] - values[index - 1];
      if (direction === "forward") expect(delta).toBeGreaterThanOrEqual(-0.002);
      else expect(delta).toBeLessThanOrEqual(0.002);
    }
  };

  await beginTrajectory();
  await drag(page, carousel, -90, 2, 6);
  await expect(reportedPage).toHaveText("2");
  await expect(carousel).toHaveAttribute("data-page", "2");
  await expect(carousel).toHaveAttribute("data-settling", "false");
  const forward = await readTrajectory();
  expect(Math.max(...forward), "paged swipe overshot its next neighbor").toBeLessThanOrEqual(await physicalOffset(2) + .55);
  expect(Math.min(...forward), "paged swipe moved behind its starting page").toBeGreaterThanOrEqual(await physicalOffset(1) - .55);
  expectMonotonic(forward, "forward");
  expect(Number(await carousel.getAttribute("data-overscroll"))).toBe(0);

  await beginTrajectory();
  await drag(page, carousel, 90, -2, 6);
  await expect(reportedPage).toHaveText("1");
  await expect(carousel).toHaveAttribute("data-page", "1");
  await expect(carousel).toHaveAttribute("data-settling", "false");
  const backward = await readTrajectory();
  expect(Math.min(...backward), "paged swipe overshot its previous neighbor").toBeGreaterThanOrEqual(await physicalOffset(1) - .55);
  expect(Math.max(...backward), "paged swipe moved beyond its starting page").toBeLessThanOrEqual(await physicalOffset(2) + .55);
  expectMonotonic(backward, "backward");

  await beginTrajectory();
  await page.getByRole("button", { name: "Show page 4" }).click();
  await expect(reportedPage).toHaveText("3");
  await expect(carousel).toHaveAttribute("data-page", "3");
  await expect(carousel).toHaveAttribute("data-settling", "false");
  const programmed = await readTrajectory();
  expect(Math.max(...programmed), "programmed page change overshot its target").toBeLessThanOrEqual(await physicalOffset(3) + .55);
  expect(Math.min(...programmed), "programmed page change reversed before settling").toBeGreaterThanOrEqual(await physicalOffset(1) - .55);
  expectMonotonic(programmed, "forward");
  await expectPhysicalPageAligned(carousel, 3);
});

test("circular paged Carousel wraps both edges with logical state and no rubber-band", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=circular-carousel");
  const carousel = page.locator(".fixture-circular-carousel");
  const reportedPage = page.getByTestId("paged-page");

  const waitForPage = async (logicalPage: number, physicalPage: number) => {
    await expect(reportedPage).toHaveText(String(logicalPage));
    await expect(carousel).toHaveAttribute("data-page", String(logicalPage));
    await expect(carousel).toHaveAttribute("data-target-page", String(logicalPage));
    await expect(carousel).toHaveAttribute("data-physical-page", String(physicalPage));
    await expect(carousel).toHaveAttribute("data-settling", "false");
    await expect(carousel).toHaveAttribute("data-overscroll", "0.00");
    await expectPhysicalPageAligned(carousel, physicalPage);
  };

  await expect(carousel).toHaveAttribute("data-circular", "true");
  await expect(carousel.locator('[data-carousel-clone="leading"]')).toHaveCount(1);
  await expect(carousel.locator('[data-carousel-clone="trailing"]')).toHaveCount(1);
  await expect(carousel.locator('[data-carousel-clone]').first()).toHaveAttribute("aria-hidden", "true");
  await expect(carousel.locator('[data-carousel-clone]').last()).toHaveAttribute("aria-hidden", "true");
  await waitForPage(0, 1);

  await drag(page, carousel, 90, 1, 6);
  await waitForPage(2, 3);
  await drag(page, carousel, -90, -1, 6);
  await waitForPage(0, 1);

  for (let transition = 0; transition < 10; transition += 1) {
    await drag(page, carousel, -90, 1, 6);
    const logicalPage = (transition + 1) % 3;
    await waitForPage(logicalPage, logicalPage + 1);
  }

  await page.getByRole("button", { name: "Previous page" }).click();
  await waitForPage(0, 1);
  await page.getByRole("button", { name: "Previous page" }).click();
  await waitForPage(2, 3);
  await page.getByRole("button", { name: "Next page" }).click();
  await waitForPage(0, 1);
});

test("BottomSheet remains mounted while its default exit animation plays", async ({ page }) => {
  await page.locator(".sheet-trigger").click();
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();

  await page.getByTestId("sheet-overlay").click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("bottom-sheet")).toHaveCount(0);
});

test("keyboard and its attached footer dismiss on the same transition", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=keyboard");
  const input = page.getByLabel("Message");
  const footer = page.getByTestId("flow-fixed-footer");
  const keyboard = page.getByTestId("keyboard-dock");

  await input.click();
  await expect(keyboard).toHaveAttribute("data-visible", "true");
  await expect.poll(async () => footer.evaluate((element) => {
    const keyboardElement = document.querySelector<HTMLElement>('[data-testid="keyboard-dock"]')!;
    const appViewport = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;
    const appScale = appViewport.getBoundingClientRect().width / 411.428571;
    return Math.abs(
      Number.parseFloat(getComputedStyle(element).bottom) * appScale -
      Number.parseFloat(keyboardElement.style.height),
    );
  })).toBeLessThan(1);
  // Start in the footer's non-interactive top padding. Its center is occupied by
  // the KeyboardInput, which intentionally ignores dismiss-drag pointer starts.
  await drag(page, footer, 0, 120, 5, 6);
  await expect(keyboard).toHaveAttribute("data-visible", "false");

  await page.waitForTimeout(100);
  const progress = await page.evaluate(() => {
    const footerElement = document.querySelector<HTMLElement>('[data-testid="flow-fixed-footer"]')!;
    const keyboardElement = document.querySelector<HTMLElement>('[data-testid="keyboard-dock"]')!;
    const appViewport = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;
    const appScale = appViewport.getBoundingClientRect().width / 411.428571;
    const fullHeight = Number.parseFloat(keyboardElement.style.height);
    const footerRemaining = Number.parseFloat(getComputedStyle(footerElement).bottom) * appScale;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(keyboardElement).transform);
    return {
      footer: footerRemaining / fullHeight,
      keyboard: 1 - matrix.m42 / fullHeight,
    };
  });
  expect(Math.abs(progress.footer - progress.keyboard)).toBeLessThan(0.18);

  await page.waitForTimeout(300);
  const platform = await page.getByTestId("mobile-app-viewport").getAttribute("data-platform");
  const restingBottom = await footer.evaluate((element) => getComputedStyle(element).bottom);
  if (platform === "android") {
    expect(restingBottom).toBe("0px");
  } else {
    const safeArea = await page.getByTestId("device-screen").evaluate((element) =>
      getComputedStyle(element).getPropertyValue("--device-safe-area-bottom").trim(),
    );
    expect(restingBottom).toBe(safeArea);
  }
});

test("switching to Pixel keeps the composer above Android navigation", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=keyboard");
  const input = page.getByLabel("Message");
  await input.evaluate((element: HTMLInputElement) => {
    element.value = "Draft message";
  });

  await page.getByTestId("device-picker").click();
  await page.getByTestId("device-option-pixel-10").click();

  const frame = page.getByTestId("phone-frame");
  const screen = page.getByTestId("device-screen");
  const statusIndicators = page.getByTestId("status-indicators");
  const navigation = page.getByTestId("android-navigation-bar");
  const footer = page.getByTestId("flow-fixed-footer");

  await expect(frame).toHaveAttribute("data-device", "pixel-10");
  await expect(screen).toHaveAttribute("data-device", "pixel-10");
  await expect(page.locator(".phone-bezel")).toHaveAttribute(
    "src",
    "/assets/android/Pixel10.png",
  );
  await expect(statusIndicators).toHaveAttribute("data-platform", "android");
  await expect(statusIndicators).toHaveAttribute(
    "src",
    "/assets/status/status-icons.svg",
  );
  await expect(navigation).toBeVisible();
  await expect(page.getByTestId("home-indicator")).toHaveCount(0);
  await expect(input).toHaveValue("Draft message");
  await page.waitForTimeout(300);

  const layout = await page.evaluate(() => {
    const footerElement = document.querySelector<HTMLElement>(
      '[data-testid="flow-fixed-footer"]',
    )!;
    const navigationElement = document.querySelector<HTMLElement>(
      '[data-testid="android-navigation-bar"]',
    )!;
    const appViewportElement = document.querySelector<HTMLElement>(
      '[data-testid="mobile-app-viewport"]',
    )!;
    return {
      footerBottom: footerElement.getBoundingClientRect().bottom,
      appViewportBottom: appViewportElement.getBoundingClientRect().bottom,
      navigationTop: navigationElement.getBoundingClientRect().top,
      navigationHeight: Number.parseFloat(getComputedStyle(navigationElement).height),
      safeAreaBottom: Number.parseFloat(
        getComputedStyle(document.querySelector<HTMLElement>('[data-testid="device-screen"]')!).getPropertyValue(
          "--device-safe-area-bottom",
        ),
      ),
    };
  });

  expect(layout.safeAreaBottom).toBe(layout.navigationHeight);
  expect(Math.abs(layout.appViewportBottom - layout.navigationTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(layout.footerBottom - layout.navigationTop)).toBeLessThanOrEqual(1);

  await input.click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");
  await expect(navigation).toHaveCount(0);
  await page.waitForTimeout(300);

  const keyboardLayout = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]')!;
    const viewport = document.querySelector<HTMLElement>('[data-testid="mobile-app-viewport"]')!;
    const scroll = document.querySelector<HTMLElement>('[data-testid="mobile-scroll"]')!;
    const footerElement = document.querySelector<HTMLElement>('[data-testid="flow-fixed-footer"]')!;
    const keyboard = document.querySelector<HTMLElement>('[data-testid="keyboard-dock"]')!;

    return {
      screenBottom: screen.getBoundingClientRect().bottom,
      viewportBottom: viewport.getBoundingClientRect().bottom,
      scrollBottom: scroll.getBoundingClientRect().bottom,
      footerBottom: footerElement.getBoundingClientRect().bottom,
      keyboardTop: keyboard.getBoundingClientRect().top,
      keyboardBottom: keyboard.getBoundingClientRect().bottom,
    };
  });

  expect(keyboardLayout.viewportBottom).toBeCloseTo(keyboardLayout.screenBottom, 0);
  expect(Math.abs(keyboardLayout.keyboardBottom - keyboardLayout.screenBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(keyboardLayout.scrollBottom - keyboardLayout.keyboardTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(keyboardLayout.footerBottom - keyboardLayout.keyboardTop)).toBeLessThanOrEqual(1);
});

test("FlowStack pushes and pops screens while dismissing the keyboard", async ({ page }) => {
  await page.goto("/tests/runtime-fixture.html?fixture=flow");
  await page.getByLabel("Flow message").click();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "true");

  await page.getByRole("button", { name: "Push level 2" }).click();
  await expect(page.getByRole("heading", { name: "Screen stacking works" })).toBeVisible();
  await expect(page.getByTestId("keyboard-dock")).toHaveAttribute("data-visible", "false");
  const safeHeaderPlacement = await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>('[data-testid="device-screen"]')!;
    const toolbar = document.querySelector<HTMLElement>(".flow-fixture-header")!;
    return toolbar.getBoundingClientRect().top - screen.getBoundingClientRect().top;
  });
  expect(safeHeaderPlacement).toBeGreaterThanOrEqual(54);

  await page.getByRole("button", { name: "Push level 3" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 3" })).toBeVisible();
  await page.getByRole("button", { name: "Push level 4" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 4" })).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Nested view level 3" })).toBeVisible();
  await page.getByRole("button", { name: "‹ Back" }).click();
  await expect(page.getByRole("heading", { name: "Screen stacking works" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Flow root" })).toBeVisible();
});
