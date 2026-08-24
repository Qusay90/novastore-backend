import { expect, test, type Page } from "@playwright/test";

const storeSlug = "main6v-nova-teknoloji";
const publicProjection = {
  store: {
    slug: storeSlug,
    name: "Main6V Nova Teknoloji",
    description: "Public mağaza açıklaması",
    logo_url: "/media/store-logo.png",
    banner_url: "/media/store-banner.png",
    status: "open",
    rating: 4.7,
    review_count: 88,
    follower_count: 1234,
    total_units_sold: 567,
    product_count: 2,
    shipping_summary: "Aynı gün kargo",
    return_summary: "14 gün içinde iade",
  },
  products: [
    {
      id: 201,
      slug: "square-framed-product",
      name: "Public Kare Ürün",
      price: 4299,
      old_price: 5199,
      stock: 7,
      is_purchasable: true,
      image_url: "/media/product-fallback.png",
      average_rating: 4.9,
      review_count: 42,
      media: [
        { id: 1, product_id: 201, media_url: "/media/product-main.png", is_main: true, sort_order: 1, media_type: "image", card_framing: { focal_x: 0.2, focal_y: 0.7, zoom: 1.6 } },
        { id: 2, product_id: 201, media_url: "/media/product-side.png", is_main: false, sort_order: 2, media_type: "image", card_framing: null },
      ],
    },
    {
      id: 202,
      slug: "second-product",
      name: "Public İkinci Ürün",
      price: 2199,
      old_price: null,
      stock: 0,
      is_purchasable: false,
      image_url: "/media/second.png",
      average_rating: 4.6,
      review_count: 12,
      media: [],
    },
  ],
};

async function servePublicStore(page: Page) {
  const methods: string[] = [];
  await page.route(`**/api/public/stores/${storeSlug}`, async (route) => {
    methods.push(route.request().method());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(publicProjection) });
  });
  return methods;
}

async function openPublicStore(page: Page, mode: "customer" | "preview") {
  await page.goto(`/?cal=CAL-04&tab=home&view=store&storeSlug=${storeSlug}&mode=${mode}&publicStore=1`);
  await expect(page.getByTestId("storefront-screen")).toBeVisible();
  await expect(page.locator("#store-name")).toHaveText("Main6V Nova Teknoloji");
}

test.use({ viewport: { width: 411, height: 914 }, locale: "tr-TR" });

test("preview consumes only the public projection and locks every mutation surface", async ({ page }) => {
  const methods = await servePublicStore(page);
  await openPublicStore(page, "preview");

  await expect(page.getByTestId("store-preview-read-only")).toBeVisible();
  await expect(page.getByRole("button", { name: /Takip et · önizlemede kapalı/ })).toBeDisabled();
  const firstCard = page.getByTestId("store-product-0");
  await expect(firstCard).toHaveAttribute("data-product-id", "201");
  await expect(firstCard.getByRole("button", { name: /favoriye ekle/i })).toBeDisabled();
  await expect(firstCard.getByRole("button", { name: /sepete ekle · önizlemede kapalı/i })).toBeDisabled();
  await expect(page.getByText("1.234")).toBeVisible();
  expect(methods.length).toBeGreaterThanOrEqual(1);
  expect(new Set(methods)).toEqual(new Set(["GET"]));
});

test("new-theme cards apply framing while PDP and viewer keep original media", async ({ page }) => {
  await servePublicStore(page);
  await openPublicStore(page, "preview");

  const framedImage = page.getByTestId("store-product-0").locator(".product-open-media:not([data-carousel-clone]) img").first();
  await expect(framedImage).toHaveAttribute("data-card-framing", "applied");
  await expect(framedImage).toHaveAttribute("data-card-focal-x", "0.2");
  await expect(framedImage).toHaveAttribute("data-card-focal-y", "0.7");
  await expect(framedImage).toHaveAttribute("data-card-zoom", "1.6");
  await expect(framedImage).toHaveCSS("object-position", "20% 70%");
  await expect(framedImage).toHaveCSS("transform", /matrix\(1\.6/);

  await page.getByTestId("store-product-0").locator(".product-title-action").click();
  await expect(page.getByTestId("product-detail-screen")).toHaveAttribute("data-product-source", "public-store");
  const route = new URL(page.url()).searchParams;
  expect(route.get("storeSlug")).toBe(storeSlug);
  expect(route.get("productId")).toBe("201");
  expect(route.get("mode")).toBe("preview");
  await expect(page.getByTestId("pdp-preview-read-only-bar")).toBeVisible();
  const pdpImage = page.locator(".pdp-main-media:not([data-carousel-clone]) img").first();
  await expect(pdpImage).toHaveAttribute("src", /\/media\/product-main\.png$/);
  await expect(pdpImage).toHaveCSS("object-fit", "contain");
  await expect(pdpImage).toHaveCSS("transform", "none");
  await expect(page.locator(".pdp-main-media:not([data-carousel-clone]) img")).toHaveCount(3);
});

test("customer mode preserves new-theme commerce controls without remote mutation", async ({ page }) => {
  const methods = await servePublicStore(page);
  await openPublicStore(page, "customer");

  const firstCard = page.getByTestId("store-product-0");
  const add = firstCard.getByRole("button", { name: "Public Kare Ürün sepete ekle" });
  await expect(add).toBeEnabled();
  await add.click();
  await expect(add).toHaveAttribute("data-state", "confirmed");
  await expect(page.getByTestId("store-product-1").getByRole("button", { name: /satın alınamaz/i })).toBeDisabled();
  expect(methods.length).toBeGreaterThanOrEqual(1);
  expect(new Set(methods)).toEqual(new Set(["GET"]));
});

test("a closed public store preserves published stock but disables purchasing", async ({ page }) => {
  const closedProjection = {
    ...structuredClone(publicProjection),
    store: { ...structuredClone(publicProjection.store), status: "closed" },
  };
  await page.route(`**/api/public/stores/${storeSlug}`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(closedProjection),
  }));
  await openPublicStore(page, "customer");

  await expect(page.getByTestId("store-product-0")).toContainText("Public Kare Ürün");
  await expect(page.getByTestId("store-product-0").getByRole("button", { name: /satın alınamaz/i })).toBeDisabled();
});

test("public store failure never falls back to fixture seller or fixture products", async ({ page }) => {
  await page.route(`**/api/public/stores/${storeSlug}`, (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto(`/?cal=CAL-04&tab=home&view=store&storeSlug=${storeSlug}&mode=preview&publicStore=1`);

  await expect(page.getByTestId("public-store-error")).toBeVisible();
  await expect(page.getByText("Nova Audio Mağazası")).toHaveCount(0);
  await expect(page.getByText("Nova Pulse ANC Kulaklık")).toHaveCount(0);
});
