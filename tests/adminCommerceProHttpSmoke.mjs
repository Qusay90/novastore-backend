import assert from "node:assert/strict";
import {
  ADMIN_LOGIN_URL,
  ADMIN_TOKEN_KEY,
  createAdminHttp,
  isValidAdminToken,
} from "../admin-commerce-pro/src/integration/adminHttp.js";
import { resolveCapabilities, hasCapability } from "../admin-commerce-pro/src/integration/capabilities.js";
import {
  filterFirstPartyCatalogProducts,
  isCatalogProductEffectivelyVisible,
  resolveCatalogPublicationStatus,
} from "../admin-commerce-pro/src/integration/catalogRead.js";
import {
  filterCatalogStructureItems,
  isCatalogStructureItemActive,
  normalizeCatalogStructureSummary,
} from "../admin-commerce-pro/src/integration/catalogStructureRead.js";
import {
  buildArchiveCatalogProductMutation,
  buildUpdateCatalogProductMutation,
} from "../admin-commerce-pro/src/integration/catalogMutations.js";
import {
  normalizeAdminSession,
  normalizeDashboardStats,
  normalizeFirstPartyCatalogPage,
  normalizeNotificationSummaryPage,
  normalizeOrderSummaryPage,
  normalizeReturnSummaryPage,
} from "../admin-commerce-pro/src/integration/legacyMappers.js";
import { createSameOriginAdapter } from "../admin-commerce-pro/src/adapters/sameOriginAdapter.js";
import { currentErrorMayPreserveData } from "../admin-commerce-pro/src/integration/useResource.js";

class FakeStorage {
  constructor(token = "") { this.values = new Map([[ADMIN_TOKEN_KEY, token]]); }
  getItem(key) { return this.values.get(key) || null; }
  removeItem(key) { this.values.delete(key); }
}

const tokenFor = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
const decodeBase64 = (value) => Buffer.from(value, "base64").toString("utf8");
const now = Date.UTC(2026, 6, 14, 12, 0, 0);
const validToken = tokenFor({ id: 7, role: "admin", exp: Math.floor(now / 1000) + 3600 });

assert.equal(isValidAdminToken(validToken, now, decodeBase64), true);
assert.equal(isValidAdminToken(tokenFor({ id: 7, role: "customer", exp: Math.floor(now / 1000) + 3600 }), now, decodeBase64), false);
assert.equal(isValidAdminToken(tokenFor({ id: 7, role: "admin", exp: Math.floor(now / 1000) - 1 }), now, decodeBase64), false);

const requests = [];
const storage = new FakeStorage(validToken);
const location = { href: "admin-commerce-pro-live.html" };
const http = createAdminHttp({
  storage,
  location,
  now: () => now,
  decodeBase64,
  fetchImpl: async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req-ok" },
    });
  },
});

assert.deepEqual(await http.request("/api/admin/session", { headers: { Authorization: "Bearer untrusted-override" } }), { ok: true });
assert.equal(requests.length, 1);
assert.equal(requests[0].input, "/api/admin/session");
assert.equal(requests[0].init.credentials, "same-origin");
assert.equal(requests[0].init.headers.get("Authorization"), `Bearer ${validToken}`);

for (const invalidPath of [
  "https://evil.example/api/orders",
  "//evil.example/api/orders",
  "admin/api/orders",
  "/orders",
  "/api/../admin",
  "/api/%2e%2e/admin",
  "/api\\orders",
  "/api/orders#private",
  "/api/orders\n",
]) {
  await assert.rejects(() => http.request(invalidPath), (error) => error.code === "INVALID_API_PATH");
}
assert.equal(requests.length, 1, "geçersiz yol ağ isteği üretmemeli");

const forbiddenStorage = new FakeStorage(validToken);
const forbiddenLocation = { href: "admin-commerce-pro-live.html" };
const forbiddenHttp = createAdminHttp({
  storage: forbiddenStorage,
  location: forbiddenLocation,
  now: () => now,
  decodeBase64,
  fetchImpl: async () => new Response(JSON.stringify({ error: "Yetki reddedildi" }), { status: 403 }),
});
await assert.rejects(
  () => forbiddenHttp.request("/api/orders"),
  (error) => error.status === 403 && error.code === "ADMIN_FORBIDDEN" && error.message === "Yetki reddedildi",
);
assert.equal(forbiddenStorage.getItem(ADMIN_TOKEN_KEY), validToken, "403 oturumu silmemeli");
assert.equal(forbiddenLocation.href, "admin-commerce-pro-live.html", "403 login yönlendirmesi yapmamalı");

const rejectedStorage = new FakeStorage(validToken);
const rejectedLocation = { href: "admin-commerce-pro-live.html" };
const rejectedHttp = createAdminHttp({
  storage: rejectedStorage,
  location: rejectedLocation,
  now: () => now,
  decodeBase64,
  fetchImpl: async () => new Response(JSON.stringify({ error: "expired" }), { status: 401 }),
});
await assert.rejects(() => rejectedHttp.request("/api/orders"), (error) => error.code === "ADMIN_SESSION_EXPIRED");
assert.equal(rejectedStorage.getItem(ADMIN_TOKEN_KEY), null);
assert.equal(rejectedLocation.href, ADMIN_LOGIN_URL);

const expiredStorage = new FakeStorage(tokenFor({ id: 7, role: "admin", exp: Math.floor(now / 1000) - 1 }));
let expiredFetchCount = 0;
const expiredHttp = createAdminHttp({
  storage: expiredStorage,
  location: { href: "admin-commerce-pro-live.html" },
  now: () => now,
  decodeBase64,
  fetchImpl: async () => { expiredFetchCount += 1; },
});
await assert.rejects(() => expiredHttp.request("/api/orders"), (error) => error.status === 401);
assert.equal(expiredFetchCount, 0, "süresi dolmuş token ağ isteğinden önce durmalı");

const capabilities = resolveCapabilities({ dashboardRead: true, sellerAdmin: "true", unknown: true });
assert.equal(hasCapability(capabilities, "dashboardRead"), true);
assert.equal(hasCapability(capabilities, "sellerAdmin"), false, "boolean olmayan yetki fail-closed olmalı");
assert.equal(hasCapability(capabilities, "unknown"), false, "bilinmeyen yetki fail-closed olmalı");
assert.equal(hasCapability(resolveCapabilities({ catalogStructureRead: true }), "catalogStructureRead"), true);
assert.equal(hasCapability(resolveCapabilities({ catalogStructureRead: "true" }), "catalogStructureRead"), false);
assert.equal(hasCapability(resolveCapabilities({ firstPartyCatalogWrite: true }), "firstPartyCatalogWrite"), true);
assert.equal(hasCapability(resolveCapabilities({ firstPartyCatalogWrite: "true" }), "firstPartyCatalogWrite"), false);
assert.equal(hasCapability(resolveCapabilities({ catalogStructureWrite: true }), "catalogStructureWrite"), true);
assert.deepEqual(buildArchiveCatalogProductMutation({ productId: 12, expectedRevision: 4 }), {
  path: "/api/admin/catalog/products/12/archive",
  method: "PATCH",
  body: { expected_revision: 4 },
});
assert.throws(
  () => buildUpdateCatalogProductMutation({ productId: 12, expectedRevision: 4, changes: { imageUrl: "https://cdn.example/image.jpg" } }),
  (error) => error.code === "CATALOG_PRODUCT_INPUT_INVALID" && /imageUrl/.test(error.message),
  "katalog mutation builder medya alanını ağ isteğinden önce reddetmeli",
);
assert.equal(currentErrorMayPreserveData({ status: 403 }), false, "403 sonrası hassas stale veri korunmamalı");
assert.equal(currentErrorMayPreserveData({ status: 401 }), false, "401 sonrası hassas stale veri korunmamalı");
assert.equal(currentErrorMayPreserveData({ status: 500 }), true, "geçici sunucu hatasında son başarılı veri korunabilmeli");

assert.deepEqual(normalizeDashboardStats({ totalRevenue: "123.45", totalOrders: "4", totalProducts: 5, totalUsers: 6 }), {
  totalRevenue: 123.45,
  totalOrders: 4,
  totalProducts: 5,
  totalUsers: 6,
});
assert.throws(() => normalizeDashboardStats([]), /nesne/);
assert.throws(() => normalizeDashboardStats({ totalRevenue: null, totalOrders: 0, totalProducts: 0, totalUsers: 0 }), /totalRevenue/);
assert.throws(() => normalizeDashboardStats({ totalRevenue: 0, totalOrders: "1.2", totalProducts: 0, totalUsers: 0 }), /tam sayı/);

const normalizedOrderPage = normalizeOrderSummaryPage({
  items: [{
    id: 42,
    customer_name: "Gerçek Müşteri",
    email: "customer@example.test",
    total_amount: "499.90",
    status: "Hazırlanıyor",
    payment_status: "REQUIRES_ACTION",
    item_count: 2,
    created_at: "2026-07-14T10:00:00.000Z",
  }],
  limit: 100,
  hasMore: false,
});
const normalizedOrder = normalizedOrderPage.items[0];
assert.equal(normalizedOrder.id, "NS-000042");
assert.equal(normalizedOrder.rawId, 42);
assert.equal(normalizedOrder.status, "Ödeme Bekliyor");
assert.equal(normalizedOrder.itemCount, 2);
assert.equal(normalizedOrder.pendingPayment, true);
assert.equal(normalizedOrder.shipmentStatus, "NONE");
assert.equal(normalizedOrder.carrierConfirmed, false);
assert.equal(normalizedOrder.currency, "TRY");
assert.equal("sellerId" in normalizedOrder, false, "tek-satıcı siparişe sahte satıcı eklenmemeli");
assert.throws(() => normalizeOrderSummaryPage({ rows: [] }), /items/);
assert.throws(() => normalizeOrderSummaryPage({ items: [{ id: 1 }], limit: 100, hasMore: false }), /created_at|payment_status|total_amount/);
assert.throws(() => normalizeOrderSummaryPage({ items: [], limit: 101, hasMore: false }), /1–100/);
const nullableLegacyOrder = normalizeOrderSummaryPage({
  items: [{ id: 9, customer_name: null, total_amount: "0", status: null, payment_status: null, item_count: 0, created_at: null }],
  limit: 100,
  hasMore: false,
}).items[0];
assert.equal(nullableLegacyOrder.customerName, "Müşteri bilgisi yok");
assert.equal(nullableLegacyOrder.status, "Durum Bilinmiyor");
assert.equal(nullableLegacyOrder.paymentStatus, "Bilinmiyor");
assert.equal(nullableLegacyOrder.createdAt, null);
assert.throws(
  () => normalizeOrderSummaryPage({ items: [{ id: 9, customer_name: {}, total_amount: "0", status: "Bekliyor", payment_status: "PENDING", item_count: 0, created_at: null }], limit: 100, hasMore: false }),
  /customer_name/,
);

const returnPage = normalizeReturnSummaryPage({
  items: [{ id: 3, order_id: 42, customer_name: "Müşteri", reason_code: "HASARLI", status: "REQUESTED", refund_amount: "149.90", currency: "try", order_status: "Teslim Edildi", refund_status: "REQUESTED", payment_status: "PAID", created_at: null, updated_at: null }],
  limit: 100,
  hasMore: false,
});
assert.equal(returnPage.items[0].id, "RT-000003");
assert.equal(returnPage.items[0].orderId, "NS-000042");
assert.equal(returnPage.items[0].refundAmount, 149.9);
assert.equal(returnPage.items[0].currency, "TRY");
assert.throws(() => normalizeReturnSummaryPage({ items: [{ id: 1, order_id: 2, refund_amount: -1 }], limit: 100, hasMore: false }), /refund_amount/);

const notificationPage = normalizeNotificationSummaryPage({
  items: [{ id: 5, type: "new_order", message: "Yeni sipariş", is_read: false, created_at: "2026-07-14T10:00:00.000Z" }],
  limit: 50,
  hasMore: false,
});
assert.equal(notificationPage.items[0].id, "NT-000005");
assert.equal(notificationPage.items[0].isRead, false);
assert.throws(() => normalizeNotificationSummaryPage({ items: [{ id: 5, is_read: 0 }], limit: 50, hasMore: false }), /boolean/);

const catalogPage = normalizeFirstPartyCatalogPage({
  catalogMode: "first_party",
  items: [{
    id: 12,
    name: "Nova Kulaklık",
    price: "1299.90",
    old_price: "1499.90",
    currency: "TRY",
    stock: "8",
    publication_status: "active",
    is_customer_visible: true,
    created_at: "2026-07-10T09:00:00.000Z",
    updated_at: null,
    revision: 4,
    deleted_at: null,
    primary_category_id: "4",
    primary_category_name: "Kulaklık",
    primary_category_path: "Elektronik / Ses / Kulaklık",
    category_count: "2",
    has_media: true,
  }],
  limit: 100,
  hasMore: true,
});
assert.equal(catalogPage.items[0].id, "PR-000012");
assert.equal(catalogPage.items[0].price, 1299.9);
assert.equal(catalogPage.items[0].oldPrice, 1499.9);
assert.equal(catalogPage.items[0].stock, 8);
assert.equal(catalogPage.items[0].primaryCategoryId, 4);
assert.equal(catalogPage.items[0].categoryCount, 2);
assert.equal(catalogPage.items[0].hasMedia, true);
assert.equal(catalogPage.items[0].deletedAt, null);
assert.equal("sellerId" in catalogPage.items[0], false, "birinci taraf ürüne sahte satıcı eklenmemeli");
assert.equal("risk" in catalogPage.items[0], false, "ürün özetine uydurma risk eklenmemeli");
assert.equal("approvalAction" in catalogPage.items[0], false, "ürün özetine manuel onay aksiyonu eklenmemeli");
const deletedCatalogProduct = normalizeFirstPartyCatalogPage({
  catalogMode: "first_party",
  items: [{
    id: 13, name: "Arşiv Kayıt", price: 10, old_price: null, currency: "TRY", stock: 0,
    publication_status: "active", is_customer_visible: true, created_at: null, updated_at: null, revision: 2,
    deleted_at: "2026-07-14T10:00:00.000Z", primary_category_id: null,
    primary_category_name: null, primary_category_path: null, category_count: 0, has_media: false,
  }],
  limit: 100,
  hasMore: false,
}).items[0];
assert.equal(deletedCatalogProduct.deletedAt instanceof Date, true, "silinmiş kayıt bilgisi UI fail-closed görünürlüğü için korunmalı");
assert.equal(deletedCatalogProduct.publicationStatus, "active", "mapper backend yayın durumunu uydurma bir değere çevirmemeli");
assert.equal(resolveCatalogPublicationStatus(deletedCatalogProduct), "deleted", "silinmiş kayıt etkin yayın durumunda arşivli sayılmalı");
assert.equal(isCatalogProductEffectivelyVisible(deletedCatalogProduct), false, "silinmiş kayıt ham görünürlük bayrağı açık olsa da görünmemeli");
assert.deepEqual(
  filterFirstPartyCatalogProducts([catalogPage.items[0], deletedCatalogProduct], { visibility: "visible" }).map((item) => item.rawId),
  [12],
  "etkin görünürlük filtresi silinmiş kaydı fail-closed dışarıda bırakmalı",
);
assert.deepEqual(
  filterFirstPartyCatalogProducts([catalogPage.items[0], deletedCatalogProduct], { publication: "deleted", stock: "out_of_stock", query: "arşiv" }).map((item) => item.rawId),
  [13],
  "yayın, stok ve Türkçe arama filtreleri birlikte çalışmalı",
);
assert.throws(() => normalizeFirstPartyCatalogPage({ catalogMode: "marketplace", items: [], limit: 100, hasMore: false }), /first_party/);
assert.throws(() => normalizeFirstPartyCatalogPage({ catalogMode: "first_party", items: [], limit: 100, hasMore: "false" }), /boolean/);
assert.throws(() => normalizeFirstPartyCatalogPage({
  catalogMode: "first_party",
  items: [{ id: 1 }],
  limit: 100,
  hasMore: false,
}), /eksik alan/);
assert.throws(() => normalizeFirstPartyCatalogPage({
  catalogMode: "first_party",
  items: [{
    id: 1, name: "Ürün", price: 10, old_price: null, currency: "TRY", stock: 0,
    publication_status: "seller_pending", is_customer_visible: true, created_at: null,
    updated_at: null, deleted_at: null, revision: 1, primary_category_id: null, primary_category_name: null,
    primary_category_path: null, category_count: 0, has_media: false,
  }],
  limit: 100,
  hasMore: false,
}), /yayın durumu/);
assert.throws(() => normalizeFirstPartyCatalogPage({
  catalogMode: "first_party",
  items: [{
    id: 1, name: "Ürün", price: 10, old_price: null, currency: "TRY", stock: 0,
    publication_status: "archived", is_customer_visible: false, created_at: null,
    updated_at: null, deleted_at: "2026-07-14T10:00:00.000Z", revision: 1, primary_category_id: null,
    primary_category_name: null, primary_category_path: "Yetim yol", category_count: 0, has_media: false,
  }],
  limit: 100,
  hasMore: false,
}), /kategori yolu/);

const catalogStructurePayload = {
  catalogMode: "first_party",
  structureScope: "shared_catalog",
  categories: { items: [{
    id: 1, name: "Elektronik", slug: "elektronik", path: "elektronik", depth: 0, parent_id: null,
    sort_order: 0, is_active: true, is_customer_visible: true, show_in_menu: true, show_on_home: false,
    hide_when_empty: true, deleted_at: null, revision: 3, child_count: 2, first_party_product_count: 8,
    attribute_template_count: 1,
  }], limit: 100, hasMore: false },
  attributeDefinitions: { items: [{
    id: 2, code: "renk", name: "Renk", type: "option", unit: null, is_filterable: true,
    is_required: false, is_variant_relevant: true, sort_order: 0, is_active: true, revision: 2, option_count: 4,
    template_count: 1, first_party_value_count: 5,
  }], limit: 100, hasMore: false },
  attributeTemplates: { items: [{
    id: 3, name: "Telefon özellikleri", category_id: 1, category_name: "Elektronik",
    category_path: "elektronik", sort_order: 0, is_active: true, revision: 2, attribute_count: 4,
    required_count: 2, filterable_count: 3,
  }], limit: 100, hasMore: false },
  collections: { items: [{
    id: 4, name: "Yeni gelenler", slug: "yeni-gelenler", collection_type: "dynamic",
    rule_code: "new_arrivals", sort_order: 0, is_active: true, show_on_home: true, deleted_at: null, revision: 2,
    rule_count: 1, first_party_manual_product_count: 0,
  }], limit: 100, hasMore: false },
  menus: { items: [{
    id: 5, code: "main", name: "Ana menü", is_active: true, revision: 2, item_count: 2,
    active_item_count: 2, root_item_count: 1,
  }], limit: 100, hasMore: false },
  menuItems: { items: [{
    id: 6, menu_id: 5, menu_code: "main", parent_id: null, title: "Elektronik",
    target_type: "category", category_id: 1, collection_id: null, has_internal_url: false,
    sort_order: 0, is_active: true, revision: 2,
  }], limit: 100, hasMore: false },
};
const catalogStructure = normalizeCatalogStructureSummary(catalogStructurePayload);
assert.equal(catalogStructure.categories.items[0].firstPartyProductCount, 8);
assert.equal(catalogStructure.attributeDefinitions.items[0].variantRelevant, true);
assert.equal(catalogStructure.attributeTemplates.items[0].requiredCount, 2);
assert.equal(catalogStructure.collections.items[0].ruleCode, "new_arrivals");
assert.equal(catalogStructure.menuItems.items[0].categoryId, 1);
assert.equal(isCatalogStructureItemActive(catalogStructure.categories.items[0]), true);
assert.deepEqual(
  filterCatalogStructureItems(catalogStructure.attributeDefinitions.items, "RENK", ["name", "code"]).map((item) => item.id),
  [2],
);
assert.throws(() => normalizeCatalogStructureSummary({ ...catalogStructurePayload, catalogMode: "marketplace" }), /first_party/);
assert.throws(() => normalizeCatalogStructureSummary({ ...catalogStructurePayload, structureScope: "seller" }), /shared_catalog/);
assert.throws(() => normalizeCatalogStructureSummary({
  ...catalogStructurePayload,
  collections: { ...catalogStructurePayload.collections, items: [{ ...catalogStructurePayload.collections.items[0], collection_type: "manual" }] },
}), /tutarsız/);
assert.throws(() => normalizeCatalogStructureSummary({
  ...catalogStructurePayload,
  attributeTemplates: { ...catalogStructurePayload.attributeTemplates, items: [{ ...catalogStructurePayload.attributeTemplates.items[0], required_count: 5 }] },
}), /sayaçları/);
assert.throws(() => normalizeCatalogStructureSummary({
  ...catalogStructurePayload,
  menuItems: { ...catalogStructurePayload.menuItems, items: [{ ...catalogStructurePayload.menuItems.items[0], has_internal_url: true }] },
}), /hedef alanları/);

const session = normalizeAdminSession({
  user: { id: 7, role: "admin" },
  commerceMode: "single_vendor",
  apiVersion: "2026-07-14",
  capabilities: { dashboardRead: true },
});
assert.equal(session.commerceMode, "single_vendor");
assert.throws(() => normalizeAdminSession({ user: { id: 8, role: "customer" } }), /admin/);
assert.throws(() => normalizeAdminSession({ user: { id: 8, role: "admin" }, commerceMode: "multi_vendor" }), /çalışma modu/);

const fixtureRequests = [];
const fixtureHttp = {
  async request(path) {
    fixtureRequests.push(path);
    if (path === "/api/admin/session") return { user: { id: 7, role: "admin" }, commerceMode: "single_vendor", capabilities: { dashboardRead: true, ordersRead: true, returnsRead: true, notificationsRead: true, firstPartyCatalogRead: true, catalogStructureRead: true } };
    if (path === "/api/admin/stats") return { totalRevenue: "10", totalOrders: 1, totalProducts: 2, totalUsers: 3 };
    if (path === "/api/admin/orders/summary?limit=100") return { items: [{ id: 1, customer_name: "Müşteri", total_amount: "10", status: "Onay Bekliyor", payment_status: "PAID", item_count: 1, created_at: "2026-07-14T10:00:00.000Z" }], limit: 100, hasMore: false };
    if (path === "/api/admin/returns/summary?limit=100") return { items: [{ id: 1, order_id: 1, reason_code: "DİĞER", status: "REQUESTED", refund_amount: "10", currency: "TRY", payment_status: "PAID" }], limit: 100, hasMore: false };
    if (path === "/api/admin/notifications/summary?limit=50") return { items: [{ id: 1, type: "new_order", message: "Yeni sipariş", is_read: false }], limit: 50, hasMore: false };
    if (path === "/api/admin/catalog/products/summary?limit=100") return {
      catalogMode: "first_party",
      items: [{
        id: 1, name: "Ürün", price: "10", old_price: null, currency: "TRY", stock: 1,
        publication_status: "active", is_customer_visible: true, created_at: null, updated_at: null, revision: 1,
        deleted_at: null, primary_category_id: null, primary_category_name: null,
        primary_category_path: null, category_count: 0, has_media: false,
      }],
      limit: 100,
      hasMore: false,
    };
    if (path === "/api/admin/catalog/structure/summary?limit=100") return catalogStructurePayload;
    throw new Error("unexpected path");
  },
};
const adapter = createSameOriginAdapter(fixtureHttp);
assert.equal((await adapter.session()).capabilities.ordersRead, true);
assert.equal((await adapter.dashboard()).totalRevenue, 10);
assert.equal((await adapter.orders()).items[0].id, "NS-000001");
assert.equal((await adapter.returns()).items[0].id, "RT-000001");
assert.equal((await adapter.notifications()).items[0].id, "NT-000001");
assert.equal((await adapter.catalog()).items[0].id, "PR-000001");
assert.equal((await adapter.catalogStructure()).categories.items[0].id, 1);
assert.equal(fixtureRequests.at(-1), "/api/admin/catalog/structure/summary?limit=100");
assert.equal(fixtureRequests.some((path) => /^https?:|^\/\//.test(path)), false, "adapter yalnız same-origin mutlak API yolu kullanmalı");

console.log("admin Commerce Pro HTTP and mapper smoke passed");
