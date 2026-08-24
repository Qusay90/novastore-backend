import { expect, test, type Locator, type Page } from "@playwright/test";

const phoneQuery = "capture=1&logicalWidth=411.428571&logicalHeight=914.285714&scale=1";

async function openPhone(page: Page, cal: string, view = "") {
  await page.goto(`/?cal=${cal}&tab=home${view ? `&view=${view}` : ""}&${phoneQuery}`);
  await expect(page.getByTestId("calibration-app")).toHaveAttribute("data-cal-id", cal);
}

test.use({ locale: "tr-TR" });

test("store follow-up uses a quiet search focus, compact tools, and a lower cover boundary", async ({ page }) => {
  await openPhone(page, "CAL-04", "store");

  const searchShell = page.locator(".store-search-field");
  const search = page.getByLabel("Nova Audio mağazasında ara", { exact: true });
  const initialShell = await searchShell.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderColor,
  }));
  await search.click();
  const focused = await search.evaluate((element) => ({
    outline: getComputedStyle(element).outlineStyle,
    shadow: getComputedStyle(element).boxShadow,
    placeholder: getComputedStyle(element, "::placeholder").color,
    caret: getComputedStyle(element).caretColor,
  }));
  const focusedShell = await searchShell.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderColor,
  }));
  expect(focused.outline).toBe("none");
  expect(focused.shadow).toBe("none");
  expect(focused.placeholder).toBe("rgba(0, 0, 0, 0)");
  expect(focused.caret).toBe("rgb(6, 30, 69)");
  expect(focusedShell).not.toEqual(initialShell);

  await expect(page.locator("#store-name")).toHaveText("Nova Audio Mağazası");
  const coverGeometry = await page.locator(".store-hero").evaluate((hero) => {
    const cover = hero.querySelector(".store-cover")?.getBoundingClientRect();
    const logo = hero.querySelector(".store-logo")?.getBoundingClientRect();
    const identity = hero.querySelector(".store-profile-copy");
    const pseudo = hero.querySelector(".store-cover") ? getComputedStyle(hero.querySelector(".store-cover")!, "::after") : null;
    const identityStyle = identity ? getComputedStyle(identity) : null;
    return cover && logo && pseudo && identityStyle ? {
      coverBottom: cover.bottom,
      logoCenter: logo.top + logo.height / 2,
      waveBottom: pseudo.bottom,
      identityBackground: identityStyle.backgroundColor,
      identityMask: identityStyle.boxShadow,
    } : null;
  });
  expect(coverGeometry).toBeTruthy();
  expect(Math.abs((coverGeometry?.coverBottom ?? 0) - (coverGeometry?.logoCenter ?? 0))).toBeLessThanOrEqual(1.5);
  expect(coverGeometry?.waveBottom).toBe("-7px");
  expect(coverGeometry?.identityBackground).toBe("rgb(255, 255, 255)");
  expect(coverGeometry?.identityMask).toContain("rgb(255, 255, 255)");

  for (const name of ["Filtrele", "Sırala"] as const) {
    const control = page.getByRole("button", { name, exact: true });
    const box = await control.boundingBox();
    expect(box).toBeTruthy();
    expect(box?.width).toBeLessThanOrEqual(44);
    expect(box?.height).toBeLessThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Filtrele", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Mağazada filtrele" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Sırala", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Mağazada sırala" })).toBeVisible();
});

test("PDP wave is continuous, carousel wraps, and the 1x viewer recenters after vertical drag", async ({ page }) => {
  await openPhone(page, "CAL-06");

  const swipePastEnd = async (carousel: Locator) => {
    const box = await carousel.boundingBox();
    expect(box).toBeTruthy();
    const startX = (box?.x ?? 0) + (box?.width ?? 0) * .72;
    const y = (box?.y ?? 0) + (box?.height ?? 0) * .5;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - (box?.width ?? 0) * .55, y, { steps: 8 });
    await page.mouse.up();
  };

  const wave = await page.locator(".pdp-info").evaluate((element) => getComputedStyle(element, "::before").clipPath);
  expect(wave).toContain("shape(");
  expect(wave).not.toContain("polygon(");
  expect(wave).toContain("100% 43%");
  expect(wave).toContain("96% 48%");
  expect(wave).toContain("54% 82%");
  expect(wave).toContain("78% 74%");
  expect(wave).not.toContain("83% 78%");
  expect(wave).not.toContain("94% 34%");

  const geometry = await page.locator(".cal-app").evaluate((app) => {
    app.style.setProperty("--shell-safe-bottom", "24px");
    app.style.setProperty("--shell-sticky-bottom", "calc(8px + 24px)");
    const shell = app.querySelector(".pdp-media-shell")!;
    const carousel = app.querySelector(".pdp-media-carousel")!;
    const image = app.querySelector(".pdp-main-media img")!;
    const info = app.querySelector(".pdp-info")!;
    const footer = app.querySelector(".pdp-footer")!;
    const scrollContent = app.querySelector(".pdp-scroll .mobile-scroll-content")!;
    const appRect = app.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const carouselRect = carousel.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const infoRect = info.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const footerStyle = getComputedStyle(footer);
    const overlapStyle = getComputedStyle(shell, "::after");
    return {
      expectedHeroHeight: appRect.width * .75 + 38,
      shellHeight: shellRect.height,
      carouselHeight: carouselRect.height,
      imageHeight: imageRect.height,
      imageObjectFit: getComputedStyle(image).objectFit,
      imageObjectPosition: getComputedStyle(image).objectPosition,
      infoOverlap: shellRect.bottom - infoRect.top,
      overlapHeight: overlapStyle.height,
      overlapBackground: overlapStyle.backgroundColor,
      shellClipPath: getComputedStyle(shell).clipPath,
      infoBackground: getComputedStyle(info).backgroundImage,
      footerHeight: footerRect.height,
      footerBottom: footerStyle.bottom,
      footerViewportGap: appRect.bottom - footerRect.bottom,
      scrollPaddingBottom: getComputedStyle(scrollContent).paddingBottom,
    };
  });
  expect(Math.abs(geometry.shellHeight - geometry.expectedHeroHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.carouselHeight - geometry.shellHeight)).toBeLessThanOrEqual(.5);
  expect(Math.abs(geometry.imageHeight - geometry.shellHeight)).toBeLessThanOrEqual(.5);
  expect(geometry.imageObjectFit).toBe("contain");
  expect(geometry.imageObjectPosition).toBe("50% 50%");
  expect(geometry.infoOverlap).toBeCloseTo(1, 0);
  expect(geometry.overlapHeight).toBe("16px");
  expect(geometry.overlapBackground).toBe("rgb(246, 240, 235)");
  expect(geometry.shellClipPath).toContain("-16px");
  expect(geometry.infoBackground).toContain("18px");
  expect(geometry.footerHeight).toBe(76);
  expect(geometry.footerBottom).toBe("32px");
  expect(geometry.footerViewportGap).toBeCloseTo(32, 0);
  expect(geometry.scrollPaddingBottom).toBe("118px");

  const pdpCarousel = page.locator(".pdp-media-carousel");
  await page.getByRole("button", { name: "3. görseli göster", exact: true }).click();
  await expect(pdpCarousel).toHaveAttribute("data-page", "2");
  await expect(page.locator(".pdp-gallery-meta > b")).toHaveText("3 / 3");
  await swipePastEnd(pdpCarousel);
  await expect(pdpCarousel).toHaveAttribute("data-page", "0");
  await expect(pdpCarousel).toHaveAttribute("data-target-page", "0");
  await expect(page.locator(".pdp-gallery-meta > b")).toHaveText("1 / 3");

  await page.getByRole("button", { name: "1. görseli tam ekran aç", exact: true }).click();
  const viewerCarousel = page.locator(".viewer-carousel");
  await page.locator(".viewer-dots").getByRole("button", { name: "3. görsel", exact: true }).click();
  await expect(viewerCarousel).toHaveAttribute("data-page", "2");
  await swipePastEnd(viewerCarousel);
  await expect(viewerCarousel).toHaveAttribute("data-page", "0");
  await expect(viewerCarousel).toHaveAttribute("data-target-page", "0");
  await expect(page.locator(".pdp-image-viewer > header b")).toHaveText("1 / 3");
  const activeSlide = page.locator(".viewer-slide:not([data-carousel-clone])").nth(0);
  const transform = activeSlide.locator(".viewer-transform-content");
  const wrapper = activeSlide.locator(".viewer-transform-wrapper");
  await expect(transform).toBeVisible();
  const baseline = await transform.getAttribute("style");
  const box = await wrapper.boundingBox();
  expect(box).toBeTruthy();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  for (const [dx, dy] of [[0, 90], [0, -90], [42, 76]] as const) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(260);
    await expect(transform).toHaveAttribute("style", baseline ?? "");
  }

  await activeSlide.getByRole("button", { name: "Yakınlaştır", exact: true }).click();
  await page.waitForTimeout(650);
  const zoomed = await transform.evaluate((element) => getComputedStyle(element).transform);
  expect(Number.parseFloat(zoomed.split(",")[0].replace("matrix(", ""))).toBeGreaterThan(1);
  await activeSlide.getByRole("button", { name: "Görseli sıfırla", exact: true }).click();
  await page.waitForTimeout(650);
  await expect(transform).toHaveAttribute("style", baseline ?? "");
});
