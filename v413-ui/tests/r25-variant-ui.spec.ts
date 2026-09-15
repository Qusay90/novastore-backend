import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

const fixturePath = "/tests/r25-native-variant-ui-fixture.html";
const storeSlug = "main6v-nova-teknoloji";
const fixturePng = readFileSync(new URL("../public/calibration-assets/generated/nova-pulse-anc-ivory-v1.png", import.meta.url));
const testOrigin = `http://127.0.0.1:${Number(process.env.MOBILE_RUNTIME_TEST_PORT ?? 4174)}`;
const customerSession = Object.freeze({
  schemaVersion: 1,
  accessToken: "r25-customer-access-token-00000001",
  refreshToken: "r25-customer-refresh-token-0000001",
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  refreshExpiresAt: "2099-02-01T00:00:00.000Z",
  sessionId: 125,
});

const productRows = Object.freeze([
  {
    id: 101, slug: "basit-keten-canta", name: "Basit Keten Çanta", price: 1299,
    old_price: null, stock: 5, is_purchasable: true, image_url: "/media/simple-101.png",
    average_rating: 4.5, review_count: 8, media: [],
  },
  {
    id: 202, slug: "kanonik-telefon", name: "Kanonik Telefon", price: 3499,
    old_price: 4299, stock: 5, is_purchasable: true, image_url: "/media/variant-202.png",
    average_rating: 4.8, review_count: 19, media: [],
  },
]);

const publicProjection = Object.freeze({
  store: {
    slug: storeSlug, name: "R25 Kanonik Mağaza", description: "Kanonik varyant fixture mağazası",
    logo_url: "/media/store-logo.png", banner_url: "/media/store-banner.png", status: "open",
    rating: 4.8, review_count: 41, follower_count: 120, total_units_sold: 88,
    product_count: productRows.length, shipping_summary: "Adres doğrulamasından sonra",
    return_summary: "Sunucu uygunluğu ile",
  },
  products: productRows,
});

const variantSelections = Object.freeze({
  2001: Object.freeze([{ group: "Renk", value: "Siyah" }, { group: "Kapasite", value: "128 GB" }]),
  2002: Object.freeze([{ group: "Renk", value: "Siyah" }, { group: "Kapasite", value: "256 GB" }]),
  2003: Object.freeze([{ group: "Renk", value: "Beyaz" }, { group: "Kapasite", value: "128 GB" }]),
  2004: Object.freeze([
    { group: "Çok uzun seçenek grubu ".repeat(4).slice(0, 96), value: "Çok uzun ve yine okunabilir seçenek değeri ".repeat(3).slice(0, 96) },
    { group: "Güvenlik", value: "<img src=x onerror=globalThis.__r25Injected=true>" },
  ]),
});

function canonicalProduct(productId: number, options: { currentPrice?: number; currentStock?: number } = {}) {
  if (productId === 101) return {
    id: 101, slug: "basit-keten-canta", name: "Basit Keten Çanta", description: "Tek kimlikli basit ürün.",
    category: "Aksesuar", price: "1299.00", old_price: null, stock: 5, is_purchasable: true,
    image_url: "/media/simple-101.png", media: [], average_rating: "4.5", review_count: 8,
    store: { slug: storeSlug, name: "R25 Kanonik Mağaza" },
    attributes: [{ code: "material", name: "Malzeme", type: "text", unit: null, value: "Pamuk" }],
    variant_selection_required: false, variants: null,
  };
  if (productId === 303) return {
    id: 303, slug: "seceneksiz-varyantli-urun", name: "Seçeneksiz Varyantlı Ürün", description: null,
    category: "Test", price: "100.00", old_price: null, stock: 0, is_purchasable: true,
    image_url: "/media/empty-303.png", media: [], average_rating: 0, review_count: 0,
    store: { slug: storeSlug, name: "R25 Kanonik Mağaza" }, attributes: [],
    variant_selection_required: true, variants: [],
  };
  const currentPrice = options.currentPrice ?? 3499;
  const currentStock = options.currentStock ?? 3;
  return {
    id: 202, slug: "kanonik-telefon", name: "Kanonik Telefon", description: "Tam satır seçimi gerektiren ürün.",
    category: "Elektronik", price: "3499.00", old_price: "4299.00", stock: 5, is_purchasable: true,
    image_url: "/media/variant-202.png", media: [], average_rating: "4.8", review_count: 19,
    store: { slug: storeSlug, name: "R25 Kanonik Mağaza" },
    attributes: [
      { code: "r25_malzeme", name: "Malzeme", type: "text", unit: null, value: "Organik pamuk" },
      { code: "r25_agirlik", name: "Ağırlık", type: "number", unit: "g", value: 240 },
      { code: "r25_yikanabilir", name: "Makinede Yıkanabilir", type: "boolean", unit: null, value: true },
      { code: "r25_kalip", name: "Kalıp", type: "option", unit: null, value: { id: 901, value: "regular", label: "Standart Kalıp" } },
      { code: "r25_bakim", name: "Bakım Özellikleri", type: "multi_option", unit: null, value: [{ id: 902, value: "easy_iron", label: "Kolay Ütü" }, { id: 903, value: "color_safe", label: "Renk Koruma" }] },
      { code: "r25_sicaklik", name: "Kullanım Sıcaklığı", type: "range", unit: "°C", value: { min: 10, max: 30 } },
    ],
    variant_selection_required: true,
    variants: [
      { id: 2001, sku: "PHONE-BLK-128", selections: variantSelections[2001], price: currentPrice, availableStock: currentStock, purchasable: currentStock > 0, commerce_revision: 11 },
      { id: 2002, sku: "PHONE-BLK-256", selections: variantSelections[2002], price: 3999, availableStock: 0, purchasable: false, commerce_revision: 12 },
      { id: 2003, sku: "PHONE-WHT-128", selections: variantSelections[2003], price: 3599, availableStock: 2, purchasable: true, commerce_revision: 13 },
      { id: 2004, sku: "PHONE-LONG-SAFE", selections: variantSelections[2004], price: 3699, availableStock: 1, purchasable: true, commerce_revision: 14 },
    ],
  };
}

const addresses = Object.freeze([
  { id: 71, title: "Ev", fullName: "R25 Müşteri", phone: "05550000001", city: "İstanbul", district: "Kadıköy", addressLine: "Kanonik Sokak 1", isDefault: true },
  { id: 72, title: "İş", fullName: "R25 Müşteri", phone: "05550000001", city: "İstanbul", district: "Şişli", addressLine: "Varyant Caddesi 2", isDefault: false },
]);

const historicalOrder = Object.freeze({
  id: 501, status: "Teslim Edildi", display_status: "Teslim Edildi", payment_status: "PAID",
  delivered_at: "2026-09-03T10:00:00.000Z", created_at: "2026-09-01T10:00:00.000Z",
  total_amount: 3399,
  items: [{ id: 202, variant_id: 2001, variant_selections: [{ group: "Renk", value: "Gece Siyahı" }, { group: "Kapasite", value: "128 GB Tarihsel" }], sku: "PHONE-BLK-128-HIST", name: "Kanonik Telefon (Satın Alındığı Gün)", quantity: 1, price: 3399, image: "/media/variant-202.png" }],
});

type AuthorityState = {
  failProductIds?: Set<number>;
  productFailureStatuses?: Map<number, number>;
  offlineProductIds?: Set<number>;
  currentVariantPrice?: number;
  currentVariantStock?: number;
  removedVariantIds?: Set<number>;
  previewRevision?: number;
  initializeConflict?: boolean;
  initializeConflictCode?: "VARIANT_PRICE_CHANGED" | "VARIANT_STOCK_UNAVAILABLE";
  observedInitializeConflictCodes?: string[];
  statusGate?: Promise<void>;
  statusStarted?: number;
  accountRefreshesAfterStatus?: number;
  activeUserId?: number;
  userRequestCount?: number;
  gateReplacementUser?: Promise<void>;
  blockedOutboundAttempts?: string[];
};

function routePath(route: Route) {
  const url = new URL(route.request().url());
  return `${url.pathname}${url.search}`;
}

function quoteItem(item: { product_id: number; variant_id?: number; quantity: number }, revision: number) {
  const variantId = item.variant_id;
  const price = item.product_id === 101 ? 1299 : variantId === 2003 ? 3599 : revision > 0 ? 3799 : 3499;
  return {
    id: item.product_id,
    ...(variantId ? { variant_id: variantId, variant_selections: variantSelections[variantId as keyof typeof variantSelections], sku: variantId === 2001 ? "PHONE-BLK-128" : "PHONE-WHT-128" } : {}),
    name: item.product_id === 101 ? "Basit Keten Çanta" : "Kanonik Telefon",
    quantity: item.quantity, price, line_total: price * item.quantity, image: null,
  };
}

function previewPayload(cartItems: Array<{ product_id: number; variant_id?: number; quantity: number }>, revision = 0) {
  const items = cartItems.map((item) => quoteItem(item, revision));
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  return {
    schemaVersion: "checkout-agreements-v2",
    snapshotSha256: revision > 0 ? "b".repeat(64) : "a".repeat(64),
    documents: [
      { slug: "pre-information", path: "/legal/pre-information", title: "Ön Bilgilendirme Formu", version: revision > 0 ? "2" : "1", text: "Güncel ürün, fiyat ve teslimat bilgileri.", contentSha256: revision > 0 ? "d".repeat(64) : "c".repeat(64) },
      { slug: "distance-sale", path: "/legal/distance-sale", title: "Mesafeli Satış Sözleşmesi", version: revision > 0 ? "2" : "1", text: "Cayma ve iade hakları.", contentSha256: revision > 0 ? "f".repeat(64) : "e".repeat(64) },
    ],
    quote: { items, totals: { subtotal, bundleDiscount: 0, couponDiscount: 0, shippingFee: 0, total: subtotal, currency: "TRY" }, coupon: { applied: false, code: null } },
  };
}

async function serveAuthority(page: Page, state: AuthorityState = {}) {
  state.blockedOutboundAttempts = [];
  await page.route("**/*", (route) => {
    const requested = new URL(route.request().url());
    if (requested.origin === testOrigin) return route.continue();
    state.blockedOutboundAttempts!.push(requested.origin);
    return route.abort("blockedbyclient");
  });
  // The production flag is compile-time owned. Exercise the native branch by
  // changing only Vite's transformed fixture response, never production source.
  await page.route("**/src/Prototype.tsx", async (route) => {
    const response = await route.fetch();
    const transformed = await response.text();
    const marker = 'const NATIVE_SHELL = typeof __NOVASTORE_NATIVE__ !== "undefined" && __NOVASTORE_NATIVE__;';
    if (!transformed.includes(marker)) throw new Error("R25_NATIVE_VITE_TRANSFORM_NOT_APPLIED");
    const nativeTransformed = transformed.replace(
      marker,
      "const NATIVE_SHELL = true;",
    ) + "\nglobalThis.__R25_NATIVE_TRANSFORM_PROOF__ = NATIVE_SHELL;\n";
    await route.fulfill({ response, body: nativeTransformed });
  });
  await page.route("**/media/*.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: fixturePng }));
  await page.route("**/api/**", async (route) => {
    const path = routePath(route);
    const method = route.request().method();
    if (path === `/api/public/stores/${storeSlug}`) return route.fulfill({ json: publicProjection });
    const productMatch = /^\/api\/products\/(\d+)$/u.exec(path);
    if (productMatch) {
      const id = Number(productMatch[1]);
      if (state.offlineProductIds?.has(id)) return route.abort("internetdisconnected");
      const explicitFailure = state.productFailureStatuses?.get(id);
      if (explicitFailure) return route.fulfill({ status: explicitFailure, json: { code: explicitFailure === 401 ? "AUTH_REQUIRED" : "TEMPORARY_UNAVAILABLE" } });
      if (state.failProductIds?.has(id)) return route.fulfill({ status: id === 909 ? 404 : 503, json: { code: id === 909 ? "NOT_FOUND" : "TEMPORARY_UNAVAILABLE" } });
      if (id !== 101 && id !== 202 && id !== 303) return route.fulfill({ status: 404, json: { code: "NOT_FOUND" } });
      const product = canonicalProduct(id, { currentPrice: state.currentVariantPrice, currentStock: state.currentVariantStock });
      const filteredProduct = id === 202 && state.removedVariantIds?.size
        ? { ...product, variants: product.variants.filter((variant) => !state.removedVariantIds!.has(variant.id)) }
        : product;
      return route.fulfill({ json: filteredProduct });
    }
    if (path === "/api/users/me") {
      state.userRequestCount = (state.userRequestCount ?? 0) + 1;
      if (state.userRequestCount > 1 && state.gateReplacementUser) await state.gateReplacementUser;
      if (state.statusStarted) state.accountRefreshesAfterStatus = (state.accountRefreshesAfterStatus ?? 0) + 1;
      const userId = state.activeUserId ?? 17;
      return route.fulfill({ json: { user: { id: userId, fullName: userId === 17 ? "R25 Müşteri" : "B Müşterisi", email: userId === 17 ? "r25@example.test" : "b@example.test", role: "customer" } } });
    }
    if (path === "/api/addresses") return route.fulfill({ json: (state.activeUserId ?? 17) === 17
      ? addresses
      : [{ id: 88, title: "B Evi", fullName: "B Müşterisi", phone: "05550000088", city: "Ankara", district: "Çankaya", addressLine: "B Müşterisi Sokağı 8", isDefault: true }] });
    if (path === "/api/orders/user/17") return route.fulfill({ json: [historicalOrder] });
    if (path === "/api/returns/mine") return route.fulfill({ json: [] });
    if (path === "/api/messages/history/17") return route.fulfill({ json: [] });
    if (path === "/api/users/security-status") return route.fulfill({ json: { email: "r25@example.test", emailVerified: true, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true } });
    if (["/api/campaigns/coupons/active", "/api/questions/user", "/api/store-follows"].includes(path)) return route.fulfill({ json: [] });
    if (path === "/api/reviews/user/17") return route.fulfill({ json: [] });
    if (path === "/api/favorites") return route.fulfill({ json: { productIds: [] } });
    if (path === "/api/notifications?limit=50") return route.fulfill({ json: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: 0 } });
    if (path === "/api/payments/capability") return route.fulfill({ json: { provider: "paytr", ready: true, state: "READY", message: "Fixture sağlayıcısı hazır", requirements: { providerReady: true, businessIdentityReady: true, legalDocumentsReady: true } } });
    if (path === "/api/payments/agreements/preview" && method === "POST") {
      const body = route.request().postDataJSON() as { cartItems: Array<{ product_id: number; variant_id?: number; quantity: number }> };
      return route.fulfill({ json: previewPayload(body.cartItems, state.previewRevision ?? 0) });
    }
    if (path === "/api/payments/initialize" && method === "POST") {
      if (state.initializeConflict) {
        state.initializeConflict = false;
        state.previewRevision = 1;
        const code = state.initializeConflictCode ?? "VARIANT_PRICE_CHANGED";
        (state.observedInitializeConflictCodes ??= []).push(code);
        return route.fulfill({ status: 409, json: { code, message: code === "VARIANT_PRICE_CHANGED" ? "Varyant fiyatı değişti." : "Varyant stoku tükendi." } });
      }
      const body = route.request().postDataJSON() as { idempotency_key: string };
      return route.fulfill({ json: { orderId: 777, paymentRef: "r25-payment-777", paymentStatus: "REQUIRES_ACTION", provider: "paytr", idempotencyKey: body.idempotency_key, totals: { subtotal: 3499, discount: 0, shipping: 0, total: 3499, currency: "TRY" }, paymentAction: { type: "iframe", iframeUrl: "https://www.paytr.com/odeme/guvenli/r25-token" }, message: "Ödeme sayfası hazır." } });
    }
    if (path === "/api/payments/status?paymentRef=r25-payment-777&orderId=777") {
      state.statusStarted = (state.statusStarted ?? 0) + 1;
      if (state.statusGate) await state.statusGate;
      return route.fulfill({ json: { orderId: 777, paymentRef: "r25-payment-777", paymentStatus: "PAID", orderStatus: "Hazırlanıyor", finalized: true, providerFinalized: true, commerceFinalized: true, reconciliationRequired: false, message: "Ödeme kesinleşti.", nextAction: null } });
    }
    return route.fulfill({ status: 404, json: { code: "NOT_FOUND" } });
  });
}

function expectNoOutboundAuthorityBypass(state: AuthorityState) {
  expect(state.blockedOutboundAttempts, "fixture attempted a non-loopback request").toEqual([]);
}

async function openProduct(page: Page, productId: number) {
  await page.goto(`${fixturePath}?cal=CAL-06&tab=home&productId=${productId}&shell=native`);
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __R25_NATIVE_TRANSFORM_PROOF__?: boolean }).__R25_NATIVE_TRANSFORM_PROOF__)).toBe(true);
  await expect(page.getByTestId("product-detail-screen")).toHaveAttribute("data-product-id", String(productId));
}

async function useAuthenticatedSession(page: Page, cart?: unknown) {
  await page.addInitScript(({ session, storedCart }) => {
    localStorage.setItem("novastore.customer.session.v1", JSON.stringify(session));
    if (storedCart) localStorage.setItem("novastore.customer.cart.v1", JSON.stringify(storedCart));
    window.open = () => null;
  }, { session: customerSession, storedCart: cart });
}

function storedVariantCart(quantity = 1) {
  return {
    version: 1,
    lines: [{
      id: "product-202-variant-2001", productId: "202", variantId: 2001,
      variantSelections: variantSelections[2001], quantity,
      snapshot: { id: "202", name: "Kanonik Telefon", store: "R25 Kanonik Mağaza", image: "/media/variant-202.png", price: "₺3.499", amount: 3499, stock: 3, isPublicProjection: true },
    }],
  };
}

async function acceptAllAgreements(page: Page) {
  await expect(page.getByTestId("checkout-legal-consent")).toBeVisible();
  await page.getByTestId("checkout-legal-checkbox-pre-information").check();
  await page.getByTestId("checkout-legal-checkbox-distance-sale").check();
}

test.use({ viewport: { width: 411, height: 914 }, locale: "tr-TR" });

test("R25 simple and variant PDPs render canonical truth, complete attributes, missing selection, and OOS rows", async ({ page }) => {
  const state: AuthorityState = {};
  await serveAuthority(page, state);
  await openProduct(page, 101);
  await expect(page.getByTestId("canonical-variant-selector")).toHaveCount(0);
  await expect(page.locator(".pdp-info .price.large strong")).toHaveText(/1\.299/u);
  await expect(page.locator(".spec-grid")).toContainText("Malzeme");
  await expect(page.locator(".spec-grid")).toContainText("Pamuk");
  await expect.poll(() => page.locator(".pdp-main-media img").first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByTestId("pdp-sticky-footer").getByRole("button", { name: "Sepete Ekle" })).toBeEnabled();

  await openProduct(page, 202);
  const selector = page.getByTestId("canonical-variant-selector");
  await expect(selector).toContainText("Sepete eklemek için bir seçenek belirle.");
  await expect(page.locator(".pdp-stock")).toContainText("Stok bilgisi için seçenek belirle");
  await expect(page.getByTestId("pdp-sticky-footer").getByRole("button", { name: "Ürün şu anda satın alınamaz" })).toBeDisabled();
  await expect(page.getByTestId("canonical-variant-2002")).toBeDisabled();
  await expect(page.getByTestId("canonical-variant-2002")).toContainText("Stokta yok");
  await expect(page.locator(".spec-grid")).toContainText("Organik pamuk");
  await expect(page.locator(".spec-grid")).toContainText("240 g");
  await expect(page.locator(".spec-grid")).toContainText("Evet");
  await expect(page.locator(".spec-grid")).toContainText("Standart Kalıp");
  await expect(page.locator(".spec-grid")).toContainText("Kolay Ütü, Renk Koruma");
  await expect(page.locator(".spec-grid")).toContainText("10–30 °C");
  const longRow = page.getByTestId("canonical-variant-2004");
  await expect(longRow).toContainText("Çok uzun ve yine okunabilir");
  await expect(longRow).toContainText("<img src=x onerror=globalThis.__r25Injected=true>");
  await expect(selector.locator("script, img[src=x]")).toHaveCount(0);
  expect(await longRow.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __r25Injected?: boolean }).__r25Injected ?? false)).toBe(false);

  await page.getByTestId("canonical-variant-2001").click();
  await expect(page.getByTestId("canonical-variant-2001")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".pdp-info .price.large strong")).toHaveText(/3\.499/u);
  await expect(page.locator(".pdp-stock")).toContainText("3 ürün");
  await expect(page.getByTestId("pdp-sticky-footer").getByRole("button", { name: "Sepete Ekle" })).toBeEnabled();
  expectNoOutboundAuthorityBypass(state);
});

test("R25 exact variant identity aggregates same rows, separates siblings, persists selection/cart, and removes one line", async ({ page }) => {
  const state: AuthorityState = {};
  await serveAuthority(page, state);
  await openProduct(page, 202);
  await page.getByTestId("canonical-variant-2001").click();
  const add = page.getByTestId("pdp-sticky-footer").getByRole("button", { name: "Sepete Ekle" });
  await add.click();
  await expect(page.getByTestId("pdp-sticky-footer").getByRole("button", { name: "Sepete eklendi" })).toBeVisible();
  await page.waitForTimeout(1_000);
  await add.click();
  await page.waitForTimeout(1_000);
  await page.getByTestId("canonical-variant-2003").click();
  await add.click();

  const selectedCache = await page.evaluate(() => JSON.parse(localStorage.getItem("novastore.customer.variant-selection.v1") || "null"));
  expect(selectedCache).toEqual({ productId: "202", variantId: 2003 });
  await page.goto(`${fixturePath}?cal=CAL-07&tab=cart&shell=native`);
  const black = page.getByTestId("cart-item-product-202-variant-2001");
  const white = page.getByTestId("cart-item-product-202-variant-2003");
  await expect(black).toHaveAttribute("data-variant-id", "2001");
  await expect(black.locator(".quantity b")).toHaveText("2");
  await expect(black.locator(".cart-variant-label")).toHaveText("Renk: Siyah · Kapasite: 128 GB");
  await expect(white).toHaveAttribute("data-variant-id", "2003");
  await expect(white.locator(".quantity b")).toHaveText("1");

  await page.reload();
  await expect(page.getByTestId("cart-item-product-202-variant-2001")).toBeVisible();
  await expect(page.getByTestId("cart-item-product-202-variant-2003")).toBeVisible();
  await page.getByTestId("cart-item-product-202-variant-2001").getByRole("button", { name: /Sil$/u }).click();
  await expect(page.getByTestId("cart-item-product-202-variant-2001")).toHaveCount(0);
  await expect(page.getByTestId("cart-item-product-202-variant-2003")).toBeVisible();

  await openProduct(page, 202);
  await expect(page.getByTestId("canonical-variant-2003")).toHaveAttribute("aria-checked", "true");
  expectNoOutboundAuthorityBypass(state);
});

test("R25 a variant removed after PDP selection and a later product API failure both fail closed before cart mutation", async ({ page }) => {
  const state: AuthorityState = {};
  await serveAuthority(page, state);
  await openProduct(page, 202);
  await page.getByTestId("canonical-variant-2001").click();
  state.removedVariantIds = new Set([2001]);
  await page.getByTestId("pdp-sticky-footer").getByRole("button", { name: "Sepete Ekle" }).click();
  await expect(page.getByTestId("pdp-purchase-error")).toContainText("yeterli stok yok");
  await expect(page.getByTestId("canonical-variant-2001")).toHaveCount(0);
  await expect(page.getByTestId("canonical-variant-selector")).toContainText("Seçtiğin seçenek artık kullanılamıyor");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("novastore.customer.cart.v1") || "null")?.lines?.length ?? 0)).toBe(0);

  state.removedVariantIds.clear();
  await openProduct(page, 202);
  await page.getByTestId("canonical-variant-2003").click();
  state.failProductIds = new Set([202]);
  await page.getByTestId("pdp-sticky-footer").getByRole("button", { name: "Sepete Ekle" }).click();
  await expect(page.getByTestId("pdp-purchase-error")).toContainText("güncel fiyatı, stoku ve seçenekleri doğrulanamadı");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("novastore.customer.cart.v1") || "null")?.lines?.length ?? 0)).toBe(0);
  expectNoOutboundAuthorityBypass(state);
});

test("R25 uncached deep links distinguish unavailable products from API failures and never render local fallback", async ({ page }) => {
  const state: AuthorityState = { failProductIds: new Set([909, 202]), productFailureStatuses: new Map([[401, 401]]) };
  await serveAuthority(page, state);
  await page.goto(`${fixturePath}?cal=CAL-06&tab=home&productId=909&shell=native`);
  await expect(page.getByTestId("public-product-error")).toHaveAttribute("data-state", "unavailable");
  await expect(page.getByText("Ürün artık mevcut değil")).toBeVisible();
  await expect(page.getByTestId("product-detail-screen")).toHaveCount(0);

  await page.goto(`${fixturePath}?cal=CAL-06&tab=home&productId=202&shell=native`);
  await expect(page.getByTestId("public-product-error")).toHaveAttribute("data-state", "error");
  await expect(page.getByText("Ürün şu anda yüklenemedi")).toBeVisible();
  await expect(page.getByText("Nova Pulse ANC Kulaklık")).toHaveCount(0);

  await page.goto(`${fixturePath}?cal=CAL-06&tab=home&productId=401&shell=native`);
  await expect(page.getByTestId("public-product-error")).toHaveAttribute("data-state", "session-expired");
  await expect(page.getByText("Oturumun sona erdi")).toBeVisible();

  await openProduct(page, 303);
  await expect(page.getByTestId("canonical-variant-selector")).toContainText("Bu ürün için kullanılabilir seçenek yok.");
  await expect(page.getByTestId("canonical-variant-selector").getByRole("radio")).toHaveCount(0);

  state.offlineProductIds = new Set([202]);
  state.failProductIds.delete(202);
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
  await page.goto(`${fixturePath}?cal=CAL-06&tab=home&productId=202&shell=native`);
  await expect(page.getByTestId("public-product-error")).toHaveAttribute("data-state", "offline");
  await expect(page.getByText("İnternet bağlantısı yok")).toBeVisible();
  expectNoOutboundAuthorityBypass(state);
});

test("R25 stale variant price clears legal consent, replaces the quote, and keeps checkout blocked", async ({ page }) => {
  const state: AuthorityState = { initializeConflict: true, initializeConflictCode: "VARIANT_PRICE_CHANGED", previewRevision: 0 };
  await useAuthenticatedSession(page, storedVariantCart());
  await serveAuthority(page, state);
  await page.goto(`${fixturePath}?cal=CAL-08&tab=cart&shell=native`);
  await expect(page.getByTestId("native-authoritative-checkout")).toBeVisible();
  await expect(page.locator('.checkout-summary [data-variant-id="2001"]')).toContainText("Renk: Siyah · Kapasite: 128 GB");
  await expect(page.locator('.checkout-summary [data-variant-id="2001"]')).toContainText(/3\.499/u);
  await acceptAllAgreements(page);
  await page.getByRole("button", { name: /PayTR’a Geç/u }).click();

  await expect(page.getByTestId("checkout-variant-conflict")).toContainText("fiyatı, stoku veya seçenekleri değişti");
  await expect(page.locator('.checkout-summary [data-variant-id="2001"]')).toContainText(/3\.799/u);
  await expect(page.getByTestId("checkout-legal-checkbox-pre-information")).not.toBeChecked();
  await expect(page.getByTestId("checkout-legal-checkbox-distance-sale")).not.toBeChecked();
  await expect(page.getByRole("button", { name: /PayTR’a Geç/u })).toBeDisabled();

  state.initializeConflict = true;
  state.initializeConflictCode = "VARIANT_STOCK_UNAVAILABLE";
  state.previewRevision = 0;
  await page.reload();
  await acceptAllAgreements(page);
  await page.getByRole("button", { name: /PayTR’a Geç/u }).click();
  await expect(page.getByTestId("checkout-variant-conflict")).toContainText("fiyatı, stoku veya seçenekleri değişti");
  await expect(page.getByTestId("checkout-legal-checkbox-pre-information")).not.toBeChecked();
  await expect(page.getByTestId("checkout-legal-checkbox-distance-sale")).not.toBeChecked();
  expect(state.observedInitializeConflictCodes).toEqual(["VARIANT_PRICE_CHANGED", "VARIANT_STOCK_UNAVAILABLE"]);
  expectNoOutboundAuthorityBypass(state);
});

test("R25 a late PAID response cannot clear the cart or show success after address identity changes", async ({ page }) => {
  let releaseStatus!: () => void;
  const state: AuthorityState = { statusGate: new Promise<void>((resolve) => { releaseStatus = resolve; }) };
  await useAuthenticatedSession(page, storedVariantCart());
  await serveAuthority(page, state);
  await page.goto(`${fixturePath}?cal=CAL-08&tab=cart&shell=native`);
  await acceptAllAgreements(page);
  await page.getByRole("button", { name: /PayTR’a Geç/u }).click();
  await expect(page.getByRole("button", { name: "Ödeme Durumunu Kontrol Et" })).toBeVisible();
  await page.getByRole("button", { name: "Ödeme Durumunu Kontrol Et" }).click();
  await expect.poll(() => state.statusStarted ?? 0).toBe(1);

  await page.getByRole("button", { name: "Adresi değiştir" }).click();
  await page.getByRole("radio", { name: /İş/u }).click();
  releaseStatus();
  await expect(page.getByTestId("checkout-legal-consent")).toBeVisible();
  await expect(page.getByText("Ödemen doğrulandı")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("novastore.customer.cart.v1") || "null")?.lines?.length ?? 0)).toBe(1);
  expect(state.accountRefreshesAfterStatus ?? 0).toBe(0);
  expectNoOutboundAuthorityBypass(state);
});

test("R25 same-context PAID confirmation atomically clears the exact cart and refreshes history on navigation", async ({ page }) => {
  const state: AuthorityState = {};
  await useAuthenticatedSession(page, storedVariantCart());
  await serveAuthority(page, state);
  await page.goto(`${fixturePath}?cal=CAL-08&tab=cart&shell=native`);
  await acceptAllAgreements(page);
  await page.getByRole("button", { name: /PayTR’a Geç/u }).click();
  await page.getByRole("button", { name: "Ödeme Durumunu Kontrol Et" }).click();

  await expect(page.getByText("Ödemen doğrulandı")).toBeVisible();
  await expect(page.getByText("Sipariş #777 PC1 sunucu durumu üzerinden kesinleşti.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("novastore.customer.cart.v1") || "null")?.lines?.length ?? -1)).toBe(0);
  expect(state.accountRefreshesAfterStatus ?? 0).toBe(0);

  await page.getByRole("button", { name: "Siparişi Gör" }).click();
  await expect(page.getByTestId("real-order-list")).toBeVisible();
  await expect.poll(() => state.accountRefreshesAfterStatus ?? 0).toBeGreaterThanOrEqual(1);
  expectNoOutboundAuthorityBypass(state);
});

test("R25 direct A-to-B credential replacement clears A addresses while B is being verified", async ({ page }) => {
  let releaseReplacement!: () => void;
  const state: AuthorityState = {};
  await useAuthenticatedSession(page, storedVariantCart());
  await serveAuthority(page, state);
  await page.goto(`${fixturePath}?cal=CAL-08&tab=cart&shell=native`);
  await expect(page.locator(".address-card")).toContainText("Kanonik Sokak 1");

  state.gateReplacementUser = new Promise<void>((resolve) => { releaseReplacement = resolve; });
  state.activeUserId = 88;
  await page.evaluate((session) => {
    localStorage.setItem("novastore.customer.session.v1", JSON.stringify(session));
    window.dispatchEvent(new Event("online"));
  }, { ...customerSession, accessToken: "r25-customer-b-access-token-00000002", refreshToken: "r25-customer-b-refresh-token-0000002", sessionId: 126 });
  await expect.poll(() => state.userRequestCount ?? 0).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Ödeme için giriş yap")).toBeVisible();
  await expect(page.getByText("Kanonik Sokak 1")).toHaveCount(0);

  releaseReplacement();
  await expect(page.locator(".address-card")).toContainText("B Müşterisi Sokağı 8");
  await expect(page.getByText("Kanonik Sokak 1")).toHaveCount(0);
  expectNoOutboundAuthorityBypass(state);
});

test("R25 credential invalidation while PAID status is in flight cannot confirm or clear the persisted cart", async ({ page }) => {
  let releaseStatus!: () => void;
  const state: AuthorityState = { statusGate: new Promise<void>((resolve) => { releaseStatus = resolve; }) };
  await useAuthenticatedSession(page, storedVariantCart());
  await serveAuthority(page, state);
  await page.goto(`${fixturePath}?cal=CAL-08&tab=cart&shell=native`);
  await acceptAllAgreements(page);
  await page.getByRole("button", { name: /PayTR’a Geç/u }).click();
  await page.getByRole("button", { name: "Ödeme Durumunu Kontrol Et" }).click();
  await expect.poll(() => state.statusStarted ?? 0).toBe(1);

  await page.evaluate(() => {
    localStorage.removeItem("novastore.customer.session.v1");
  });
  releaseStatus();
  await expect(page.getByText("Ödemen doğrulandı")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("novastore.customer.cart.v1") || "null")?.lines?.length ?? 0)).toBe(1);
  expectNoOutboundAuthorityBypass(state);
});

test("R25 order detail preserves immutable historical variant labels and the return flow remains reachable", async ({ page }) => {
  const state: AuthorityState = {};
  await useAuthenticatedSession(page);
  await serveAuthority(page, state);
  await page.goto(`${fixturePath}?cal=CAL-09&tab=account&shell=native`);
  await expect(page.getByTestId("real-order-list")).toBeVisible();
  await page.getByRole("button", { name: /Sipariş #501/u }).click();
  const snapshot = page.getByTestId("order-variant-snapshot");
  await expect(snapshot).toHaveAttribute("data-variant-id", "2001");
  await expect(snapshot).toHaveText("Renk: Gece Siyahı · Kapasite: 128 GB Tarihsel · PHONE-BLK-128-HIST");
  await expect(page.getByText("Kanonik Telefon (Satın Alındığı Gün)")).toBeVisible();

  await page.getByRole("button", { name: "İade Talebi Oluştur" }).click();
  await expect(page.getByTestId("returns-view")).toBeVisible();
  await expect(page.getByText("Sipariş #501", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "İade Talebi Oluştur" })).toBeEnabled();
  expectNoOutboundAuthorityBypass(state);
});
