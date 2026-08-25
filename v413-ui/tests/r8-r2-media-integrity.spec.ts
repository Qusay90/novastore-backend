import { expect, test, type Locator, type Page } from "@playwright/test";

const storeSlug = "r8-r2-media-fixture";
const phoneQuery = "capture=1&logicalWidth=411.428571&logicalHeight=914.285714&scale=1";
const mediaUrls = [1, 2, 3, 4].map((index) => `/media/r8-r2-${index}.svg`);

const publicProjection = {
  store: {
    slug: storeSlug,
    name: "R8 R2 Medya Mağazası",
    description: "Deterministik medya bütünlüğü mağazası",
    logo_url: "/media/r8-r2-1.svg",
    banner_url: "/media/r8-r2-4.svg",
    status: "open",
    rating: 4.9,
    review_count: 42,
    follower_count: 1200,
    total_units_sold: 900,
    product_count: 4,
    shipping_summary: "Aynı gün kargo",
    return_summary: "14 gün içinde iade",
  },
  products: [1, 2, 3, 4].map((mediaCount, productOffset) => {
    const productId = 301 + productOffset;
    return {
      id: productId,
      slug: `media-${mediaCount}`,
      name: `${mediaCount} Görselli Test Ürünü`,
      price: 1000 + mediaCount,
      old_price: 1200 + mediaCount,
      stock: 8,
      is_purchasable: true,
      image_url: mediaUrls[0],
      average_rating: 4.8,
      review_count: 20 + mediaCount,
      media: mediaUrls.slice(0, mediaCount).map((mediaUrl, mediaIndex) => ({
        id: productId * 10 + mediaIndex,
        product_id: productId,
        media_url: mediaUrl,
        is_main: mediaIndex === 0,
        sort_order: mediaIndex,
        media_type: "image",
        card_framing: {
          focal_x: mediaIndex % 2 ? .2 : .78,
          focal_y: mediaIndex % 2 ? .75 : .28,
          zoom: mediaIndex === 0 ? 2.1 : 1.35,
        },
      })),
    };
  }),
};

test.use({
  viewport: { width: 411, height: 914 },
  locale: "tr-TR",
  hasTouch: true,
  isMobile: true,
});

async function serveMediaFixture(page: Page) {
  await page.route(`**/api/public/stores/${storeSlug}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(publicProjection),
  }));
  await page.route("**/media/r8-r2-*.svg", (route) => {
    const match = route.request().url().match(/r8-r2-(\d)\.svg$/);
    const index = Number(match?.[1] ?? 1);
    const dimensions = [
      [1200, 700],
      [700, 1200],
      [900, 900],
      [1400, 600],
    ][index - 1] ?? [900, 900];
    const colors = ["#e9a66f", "#75a9d8", "#83bd92", "#bd82c7"];
    const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions[0]}" height="${dimensions[1]}" viewBox="0 0 ${dimensions[0]} ${dimensions[1]}"><rect width="100%" height="100%" fill="${colors[index - 1]}"/><circle cx="50%" cy="50%" r="22%" fill="#fff" fill-opacity=".72"/><text x="50%" y="53%" text-anchor="middle" font-family="Arial" font-size="${Math.round(dimensions[1] * .14)}" font-weight="700" fill="#061e45">MEDIA ${index}</text></svg>`;
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body });
  });
}

async function openFixtureStore(page: Page) {
  await serveMediaFixture(page);
  await page.goto(`/?cal=CAL-04&tab=home&view=store&storeSlug=${storeSlug}&mode=customer&publicStore=1&${phoneQuery}`);
  await expect(page.getByTestId("storefront-screen")).toBeVisible();
  await expect(page.locator("#store-name")).toHaveText("R8 R2 Medya Mağazası");
}

async function waitForSettledPage(carousel: Locator, index: number) {
  await expect(carousel).toHaveAttribute("data-page", String(index));
  await expect(carousel).toHaveAttribute("data-target-page", String(index));
  await expect(carousel).toHaveAttribute("data-settling", "false");
}

async function settledGeometry(carousel: Locator, slideSelector: string, activeIndex: number) {
  return carousel.evaluate((viewport, input) => {
    const viewportRect = viewport.getBoundingClientRect();
    const physicalSlides = Array.from(viewport.querySelectorAll<HTMLElement>(input.slideSelector));
    const slides = physicalSlides.filter((slide) => !slide.dataset.carouselClone);
    const slideRects = slides.map((slide) => slide.getBoundingClientRect());
    const physicalRects = physicalSlides.map((slide) => slide.getBoundingClientRect());
    const imageNodes = physicalSlides.map((slide) => slide.querySelector<HTMLImageElement>("img"));
    const hitSlides = new Set<number>();
    for (const xRatio of [.04, .15, .3, .5, .7, .85, .96]) {
      for (const yRatio of [.18, .42, .66]) {
        const x = viewportRect.left + viewportRect.width * xRatio;
        const y = viewportRect.top + viewportRect.height * yRatio;
        for (const element of document.elementsFromPoint(x, y)) {
          const mediaIndex = imageNodes.indexOf(element as HTMLImageElement);
          if (mediaIndex >= 0) hitSlides.add(mediaIndex);
        }
      }
    }
    const active = slideRects[input.activeIndex];
    return {
      clientWidth: (viewport as HTMLElement).clientWidth,
      scrollLeft: (viewport as HTMLElement).scrollLeft,
      viewport: { left: viewportRect.left, right: viewportRect.right, width: viewportRect.width },
      active: active ? { left: active.left, right: active.right, width: active.width } : null,
      slides: slideRects.map((rect, index) => ({
        index,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        overflow: getComputedStyle(slides[index]).overflow,
      })),
      physicalSlides: physicalRects.map((rect, index) => {
        const slide = physicalSlides[index];
        const clone = slide.dataset.carouselClone ?? null;
        const logicalIndex = clone === "leading"
          ? slides.length - 1
          : clone === "trailing"
            ? 0
            : slides.indexOf(slide);
        return {
          logicalIndex,
          clone,
          left: rect.left,
          right: rect.right,
          overlap: Math.max(0, Math.min(rect.right, viewportRect.right) - Math.max(rect.left, viewportRect.left)),
        };
      }),
      hitSlides: [...hitSlides].sort((left, right) => left - right).map((index) => {
        const slide = physicalSlides[index];
        const clone = slide.dataset.carouselClone ?? null;
        return {
          logicalIndex: clone === "leading" ? slides.length - 1 : clone === "trailing" ? 0 : slides.indexOf(slide),
          clone,
        };
      }),
    };
  }, { slideSelector, activeIndex });
}

async function expectOneSettledMedia(carousel: Locator, slideSelector: string, activeIndex: number) {
  const renderingTolerance = 1.1;
  await waitForSettledPage(carousel, activeIndex);
  const geometry = await settledGeometry(carousel, slideSelector, activeIndex);
  expect(geometry.active).toBeTruthy();
  expect(Math.abs((geometry.active?.left ?? 0) - geometry.viewport.left), "active slide left does not match viewport left").toBeLessThanOrEqual(renderingTolerance);
  expect(Math.abs((geometry.active?.width ?? 0) - geometry.viewport.width), "active slide width does not match viewport width").toBeLessThanOrEqual(renderingTolerance);
  for (const slide of geometry.slides) {
    expect(Math.abs(slide.width - geometry.viewport.width), `slide ${slide.index} width differs from viewport`).toBeLessThanOrEqual(renderingTolerance);
    if (slide.index < activeIndex) expect(slide.right, `previous slide ${slide.index} bleeds into viewport`).toBeLessThanOrEqual(geometry.viewport.left + renderingTolerance);
    if (slide.index > activeIndex) expect(slide.left, `next slide ${slide.index} bleeds into viewport`).toBeGreaterThanOrEqual(geometry.viewport.right - renderingTolerance);
  }
  expect(
    geometry.physicalSlides.filter((slide) => slide.overlap > renderingTolerance).map(({ logicalIndex, clone }) => ({ logicalIndex, clone })),
    "settled viewport exposes more than one physical media slide",
  ).toEqual([{ logicalIndex: activeIndex, clone: null }]);
  expect(
    geometry.hitSlides.filter((slide) => slide.logicalIndex !== activeIndex || slide.clone !== null),
    "settled viewport paints adjacent or cloned media",
  ).toEqual([]);
  return geometry;
}

async function mouseSwipe(page: Page, carousel: Locator, direction: "next" | "previous") {
  const box = await carousel.boundingBox();
  expect(box).toBeTruthy();
  const from = direction === "next" ? .78 : .22;
  const to = direction === "next" ? .22 : .78;
  const y = (box?.y ?? 0) + (box?.height ?? 0) * .48;
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) * from, y);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) * to, y, { steps: 8 });
  await page.mouse.up();
}

async function touchSwipe(page: Page, carousel: Locator, direction: "next" | "previous") {
  const box = await carousel.boundingBox();
  expect(box).toBeTruthy();
  const from = direction === "next" ? .78 : .22;
  const to = direction === "next" ? .22 : .78;
  const startX = (box?.x ?? 0) + (box?.width ?? 0) * from;
  const endX = (box?.x ?? 0) + (box?.width ?? 0) * to;
  const y = (box?.y ?? 0) + (box?.height ?? 0) * .48;
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] });
  for (let step = 1; step <= 8; step += 1) {
    const x = startX + (endX - startX) * (step / 8);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

test("1/2/3/4-media product cards settle to one clipped framed slide and keep indicators synchronized", async ({ page }) => {
  test.setTimeout(120_000);
  await openFixtureStore(page);

  for (const mediaCount of [1, 2, 3, 4]) {
    const card = page.getByTestId(`store-product-${mediaCount - 1}`);
    await card.scrollIntoViewIfNeeded();
    const carousel = card.locator(".product-media-carousel");
    const dots = card.locator(".product-media-position button");
    await expect(card.locator(".product-media-slide:not([data-carousel-clone])")).toHaveCount(mediaCount);
    await expect(dots).toHaveCount(mediaCount === 1 ? 0 : mediaCount);
    await expectOneSettledMedia(carousel, ".product-media-slide", 0);
    await expect(card.locator(".product-media-slide:not([data-carousel-clone]) img").first()).toHaveAttribute("data-card-framing", "applied");
    await expect(card.locator(".product-media-slide:not([data-carousel-clone]) img").first()).toHaveCSS("object-fit", "cover");

    if (mediaCount === 1) continue;
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await mouseSwipe(page, carousel, "next");
      await expectOneSettledMedia(carousel, ".product-media-slide", 1);
      await expect(dots.nth(1)).toHaveAttribute("aria-pressed", "true");
      await mouseSwipe(page, carousel, "previous");
      await expectOneSettledMedia(carousel, ".product-media-slide", 0);
      await expect(dots.nth(0)).toHaveAttribute("aria-pressed", "true");
    }
    for (let index = 1; index < mediaCount; index += 1) {
      await mouseSwipe(page, carousel, "next");
      await expectOneSettledMedia(carousel, ".product-media-slide", index);
      await expect(dots.nth(index)).toHaveAttribute("aria-pressed", "true");
    }
    for (let index = mediaCount - 2; index >= 0; index -= 1) {
      await mouseSwipe(page, carousel, "previous");
      await expectOneSettledMedia(carousel, ".product-media-slide", index);
    }
  }
});

test("coarse touch owns exactly one discrete card page and cannot activate a second scrub mechanism", async ({ page }) => {
  await openFixtureStore(page);
  const card = page.getByTestId("store-product-2");
  await card.scrollIntoViewIfNeeded();
  const carousel = card.locator(".product-media-carousel");
  await expect(carousel).toHaveAttribute("data-paged", "true");
  await expect(carousel).toHaveCSS("touch-action", "none");
  await expect(carousel).toHaveCSS("overscroll-behavior-y", "auto");
  await carousel.hover();
  await page.mouse.move((await carousel.boundingBox())!.x + 12, (await carousel.boundingBox())!.y + 12, { steps: 6 });
  await page.waitForTimeout(450);
  await expectOneSettledMedia(carousel, ".product-media-slide", 0);
  await touchSwipe(page, carousel, "next");
  await expectOneSettledMedia(carousel, ".product-media-slide", 1);
  await page.waitForTimeout(450);
  await expectOneSettledMedia(carousel, ".product-media-slide", 1);
});

test("PDP and fullscreen preserve original-media identity, contain fit, clean paging, and zoom reset", async ({ page }) => {
  test.setTimeout(120_000);
  await openFixtureStore(page);
  const card = page.getByTestId("store-product-2");
  const cardSources = await card.locator(".product-media-slide:not([data-carousel-clone]) img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  await card.locator(".product-title-action").click();
  await expect(page.getByTestId("product-detail-screen")).toHaveAttribute("data-product-id", "303");

  const pdpCarousel = page.locator(".pdp-media-carousel");
  const pdpImages = page.locator(".pdp-main-media:not([data-carousel-clone]) img");
  await expect(pdpImages).toHaveCount(3);
  expect(await pdpImages.evaluateAll((images) => images.map((image) => image.getAttribute("src")))).toEqual(cardSources);
  for (let index = 0; index < 3; index += 1) {
    await expect(pdpImages.nth(index)).toHaveCSS("object-fit", "contain");
    await expect(pdpImages.nth(index)).toHaveCSS("transform", "none");
    await expect(pdpImages.nth(index)).not.toHaveAttribute("data-card-framing", /.+/);
  }

  for (let repetition = 0; repetition < 3; repetition += 1) {
    for (const index of [0, 1, 2, 1, 0]) {
      const current = Number(await pdpCarousel.getAttribute("data-page"));
      if (index > current) await mouseSwipe(page, pdpCarousel, "next");
      if (index < current) await mouseSwipe(page, pdpCarousel, "previous");
      await expectOneSettledMedia(pdpCarousel, ".pdp-main-media", index);
      await expect(page.locator(".pdp-gallery-meta > b")).toHaveText(`${index + 1} / 3`);
      await expect(page.locator(".gallery-dots button").nth(index)).toHaveAttribute("aria-pressed", "true");
    }
  }

  await page.getByRole("button", { name: "1. görseli tam ekran aç", exact: true }).click();
  const viewer = page.locator(".pdp-image-viewer");
  const viewerCarousel = viewer.locator(".viewer-carousel");
  const viewerImages = viewer.locator(".viewer-slide:not([data-carousel-clone]) img");
  await expect(viewer).toBeVisible();
  expect(await viewerImages.evaluateAll((images) => images.map((image) => image.getAttribute("src")))).toEqual(cardSources);
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 0);
  await expect(viewerImages.nth(0)).toHaveCSS("object-fit", "contain");

  for (const index of [1, 2, 1, 0]) {
    const current = Number(await viewerCarousel.getAttribute("data-page"));
    await mouseSwipe(page, viewerCarousel, index > current ? "next" : "previous");
    await expectOneSettledMedia(viewerCarousel, ".viewer-slide", index);
    await expect(viewer.locator("header b")).toHaveText(`${index + 1} / 3`);
    await expect(viewer.locator(".viewer-dots button").nth(index)).toHaveAttribute("aria-pressed", "true");
  }

  const firstSlide = viewer.locator(".viewer-slide:not([data-carousel-clone])").first();
  const transform = firstSlide.locator(".viewer-transform-content");
  const firstFitTransform = await transform.evaluate((element) => getComputedStyle(element).transform);
  const secondTransform = viewer.locator(".viewer-slide:not([data-carousel-clone])").nth(1).locator(".viewer-transform-content");
  const secondFitTransform = await secondTransform.evaluate((element) => getComputedStyle(element).transform);
  await firstSlide.getByRole("button", { name: "Yakınlaştır", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-viewer-zoomed", "true");
  await expect.poll(async () => transform.evaluate((element) => getComputedStyle(element).transform)).not.toBe(firstFitTransform);
  await mouseSwipe(page, viewerCarousel, "next");
  await page.waitForTimeout(450);
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 0);
  const wrapperBox = await firstSlide.locator(".viewer-transform-wrapper").boundingBox();
  expect(wrapperBox).toBeTruthy();
  await page.mouse.move((wrapperBox?.x ?? 0) + (wrapperBox?.width ?? 0) * .5, (wrapperBox?.y ?? 0) + (wrapperBox?.height ?? 0) * .5);
  await page.mouse.down();
  await page.mouse.move((wrapperBox?.x ?? 0) + (wrapperBox?.width ?? 0) * .62, (wrapperBox?.y ?? 0) + (wrapperBox?.height ?? 0) * .58, { steps: 5 });
  await page.mouse.up();
  await firstSlide.getByRole("button", { name: "Görseli sıfırla", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-viewer-zoomed", "false");
  await expect.poll(async () => transform.evaluate((element) => getComputedStyle(element).transform)).toBe(firstFitTransform);

  await firstSlide.getByRole("button", { name: "Yakınlaştır", exact: true }).click();
  await expect(viewer).toHaveAttribute("data-viewer-zoomed", "true");
  await viewer.getByRole("button", { name: "Sonraki ürün görseli", exact: true }).click();
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 1);
  await expect(viewer).toHaveAttribute("data-viewer-zoomed", "false");
  await expect.poll(async () => secondTransform.evaluate((element) => getComputedStyle(element).transform)).toBe(secondFitTransform);

  await viewer.getByRole("button", { name: "Görsel görüntüleyiciyi kapat", exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await page.getByRole("button", { name: "2. görseli tam ekran aç", exact: true }).click();
  await expectOneSettledMedia(page.locator(".viewer-carousel"), ".viewer-slide", 1);
});

test("R8-R3 card, PDP, and viewer wrap both boundaries for gestures, arrows, and keyboard", async ({ page }) => {
  test.setTimeout(180_000);
  await openFixtureStore(page);

  const card = page.getByTestId("store-product-2");
  await card.scrollIntoViewIfNeeded();
  const cardCarousel = card.locator(".product-media-carousel");
  const cardDots = card.locator(".product-media-position button");
  await expect(cardCarousel).toHaveAttribute("data-circular", "true");
  await expect(card.locator(".product-media-slide:not([data-carousel-clone])")).toHaveCount(3);
  await expect(card.locator(".product-media-slide[data-carousel-clone]")).toHaveCount(2);

  let expectedPage = 0;
  for (let transition = 0; transition < 10; transition += 1) {
    expectedPage = (expectedPage + 1) % 3;
    await mouseSwipe(page, cardCarousel, "next");
    await expectOneSettledMedia(cardCarousel, ".product-media-slide", expectedPage);
    await expect(cardDots.nth(expectedPage)).toHaveAttribute("aria-pressed", "true");
  }
  for (let transition = 0; transition < 10; transition += 1) {
    expectedPage = (expectedPage + 2) % 3;
    await mouseSwipe(page, cardCarousel, "previous");
    await expectOneSettledMedia(cardCarousel, ".product-media-slide", expectedPage);
  }
  await card.hover();
  await cardDots.nth(2).click();
  await expectOneSettledMedia(cardCarousel, ".product-media-slide", 2);
  await card.getByRole("button", { name: "Sonraki ürün görseli", exact: true }).click();
  await expectOneSettledMedia(cardCarousel, ".product-media-slide", 0);
  await card.getByRole("button", { name: "Önceki ürün görseli", exact: true }).click();
  await expectOneSettledMedia(cardCarousel, ".product-media-slide", 2);

  await card.locator(".product-title-action").click();
  const pdpCarousel = page.locator(".pdp-media-carousel");
  const pdpDots = page.locator(".gallery-dots button");
  expectedPage = 0;
  for (let transition = 0; transition < 10; transition += 1) {
    expectedPage = (expectedPage + 1) % 3;
    await mouseSwipe(page, pdpCarousel, "next");
    await expectOneSettledMedia(pdpCarousel, ".pdp-main-media", expectedPage);
    await expect(page.locator(".pdp-gallery-meta > b")).toHaveText(`${expectedPage + 1} / 3`);
    await expect(pdpDots.nth(expectedPage)).toHaveAttribute("aria-pressed", "true");
  }
  for (let transition = 0; transition < 10; transition += 1) {
    expectedPage = (expectedPage + 2) % 3;
    await mouseSwipe(page, pdpCarousel, "previous");
    await expectOneSettledMedia(pdpCarousel, ".pdp-main-media", expectedPage);
  }
  await pdpDots.nth(2).click();
  await expectOneSettledMedia(pdpCarousel, ".pdp-main-media", 2);
  await page.getByRole("button", { name: "Sonraki görsel", exact: true }).click();
  await expectOneSettledMedia(pdpCarousel, ".pdp-main-media", 0);
  await page.getByRole("button", { name: "Önceki görsel", exact: true }).click();
  await expectOneSettledMedia(pdpCarousel, ".pdp-main-media", 2);
  await pdpDots.nth(0).click();
  await expectOneSettledMedia(pdpCarousel, ".pdp-main-media", 0);

  await page.getByRole("button", { name: "1. görseli tam ekran aç", exact: true }).click();
  const viewer = page.locator(".pdp-image-viewer");
  const viewerCarousel = viewer.locator(".viewer-carousel");
  const viewerDots = viewer.locator(".viewer-dots button");
  expectedPage = 0;
  for (let transition = 0; transition < 10; transition += 1) {
    expectedPage = (expectedPage + 1) % 3;
    await mouseSwipe(page, viewerCarousel, "next");
    await expectOneSettledMedia(viewerCarousel, ".viewer-slide", expectedPage);
    await expect(viewer.locator("header b")).toHaveText(`${expectedPage + 1} / 3`);
    await expect(viewerDots.nth(expectedPage)).toHaveAttribute("aria-pressed", "true");
  }
  for (let transition = 0; transition < 10; transition += 1) {
    expectedPage = (expectedPage + 2) % 3;
    await mouseSwipe(page, viewerCarousel, "previous");
    await expectOneSettledMedia(viewerCarousel, ".viewer-slide", expectedPage);
  }
  await viewerDots.nth(2).click();
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 2);
  await viewer.getByRole("button", { name: "Sonraki ürün görseli", exact: true }).click();
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 0);
  await viewer.getByRole("button", { name: "Önceki ürün görseli", exact: true }).click();
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 2);
  await page.keyboard.press("ArrowRight");
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 0);
  await page.keyboard.press("ArrowLeft");
  await expectOneSettledMedia(viewerCarousel, ".viewer-slide", 2);
});
