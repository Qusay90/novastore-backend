import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSameOriginAdapter } from "../src/adapters/sameOriginAdapter.js";
import { resolveCapabilities } from "../src/integration/capabilities.js";
import {
  buildArchiveCatalogProductMutation,
  buildCatalogProductDetailRequest,
  buildCreateCatalogProductMutation,
  buildUpdateCatalogProductMutation,
  catalogAttributesToMutationMap,
  normalizeAdminCatalogProductDetail,
} from "../src/integration/catalogMutations.js";
import { ADMIN_TOKEN_KEY, createAdminHttp } from "../src/integration/adminHttp.js";
import {
  buildCancelOrderMutation,
  buildManualShipmentMutation,
  createMutationIdempotencyKey,
  ORDER_CANCEL_NOTE_MAX_LENGTH,
  ORDER_CANCEL_REASONS,
} from "../src/integration/orderMutations.js";

const catalogDetailPayload = {
  catalogMode: "first_party",
  product: {
    id: 12,
    name: "Nova Kulaklık",
    description: "Aktif gürültü engelleme",
    price: 1299.9,
    old_price: 1499.9,
    currency: "TRY",
    stock: 8,
    sku: "NV-KULAKLIK-12",
    brand: "Nova",
    product_type: "Kulaklık",
    vat_rate: 20,
    vat_rate_source: "USER_SUPPLIED_TAX_VALUE",
    weight_grams: 280,
    desi: 0.4,
    publication_status: "draft",
    is_customer_visible: false,
    deleted_at: null,
    created_at: "2026-07-14T10:00:00.000Z",
    updated_at: null,
    revision: 4,
    has_media: true,
    category_ids: [4],
    primary_category_id: 4,
    categories: [{ id: 4, name: "Kulaklık", path: "Elektronik / Ses / Kulaklık", is_primary: true }],
    attributes: [
      { attribute_id: 2, code: "renk", name: "Renk", type: "option", unit: null, is_required: true, is_filterable: true, is_variant_relevant: true, value: { id: 21, value: "siyah", label: "Siyah" } },
      { attribute_id: 3, code: "uyumlu_platformlar", name: "Uyumlu platformlar", type: "multi_option", unit: null, is_required: false, is_filterable: true, is_variant_relevant: false, value: [{ id: 31, value: "ios", label: "iOS" }, { id: 32, value: "android", label: "Android" }] },
      { attribute_id: 4, code: "frekans_araligi", name: "Frekans aralığı", type: "range", unit: "Hz", is_required: false, is_filterable: true, is_variant_relevant: false, value: { min: 20, max: 20000 } },
    ],
  },
};

const calls = [];
const adapter = createSameOriginAdapter({
  async request(requestPath, init) {
    calls.push({ requestPath, init });
    if (requestPath.startsWith("/api/admin/catalog/products")) return catalogDetailPayload;
    return { reused: calls.length > 1 };
  },
});

const disabled = adapter.mutationActions(resolveCapabilities({
  orderCancelWrite: "true",
  manualShipmentWrite: 1,
}));
assert.equal("cancelOrder" in disabled, false, "boolean olmayan iptal capability'si fail-closed olmalı");
assert.equal("createManualShipment" in disabled, false, "boolean olmayan kargo capability'si fail-closed olmalı");

const cancelOnly = adapter.mutationActions(resolveCapabilities({ orderCancelWrite: true }));
assert.equal(typeof cancelOnly.cancelOrder, "function");
assert.equal("createManualShipment" in cancelOnly, false, "kapalı kargo capability'si adapter mutation'ı sunmamalı");
assert.equal("createCatalogProduct" in adapter.mutationActions(resolveCapabilities({ firstPartyCatalogWrite: true })), false, "katalog read olmadan yazma action'ı sunulmamalı");
assert.equal("createCatalogProduct" in adapter.mutationActions(resolveCapabilities({ firstPartyCatalogRead: true })), false, "katalog write olmadan yazma action'ı sunulmamalı");

const operations = adapter.mutationActions(resolveCapabilities({
  orderCancelWrite: true,
  manualShipmentWrite: true,
}));
const cancelKey = "commerce-pro-cancel-12345678";
await operations.cancelOrder({
  orderId: 42,
  expectedStatus: "Hazırlanıyor",
  reasonCode: "CUSTOMER_REQUEST",
  note: "Müşteri destek kaydı doğrulandı.",
  idempotencyKey: cancelKey,
});
assert.equal(calls[0].requestPath, "/api/orders/42/cancel");
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.headers["Idempotency-Key"], cancelKey);
assert.deepEqual(JSON.parse(calls[0].init.body), {
  expected_status: "Hazırlanıyor",
  reason_code: "CUSTOMER_REQUEST",
  note: "Müşteri destek kaydı doğrulandı.",
});

const shipmentKey = "commerce-pro-shipment-12345678";
await operations.createManualShipment({
  orderId: 42,
  expectedStatus: "Hazırlanıyor",
  provider: "Yurtiçi Kargo",
  trackingNo: "YK-123456",
  handoffConfirmed: true,
  idempotencyKey: shipmentKey,
});
assert.equal(calls[1].requestPath, "/api/shipments/42/manual");
assert.equal(calls[1].init.headers["Idempotency-Key"], shipmentKey);
assert.deepEqual(JSON.parse(calls[1].init.body), {
  expected_status: "Hazırlanıyor",
  provider: "Yurtiçi Kargo",
  tracking_no: "YK-123456",
  handoff_confirmed: true,
});

const normalizedCatalogProduct = normalizeAdminCatalogProductDetail(catalogDetailPayload);
assert.equal(normalizedCatalogProduct.id, "PR-000012");
assert.equal(normalizedCatalogProduct.revision, 4);
assert.equal(normalizedCatalogProduct.sku, "NV-KULAKLIK-12");
assert.equal(normalizedCatalogProduct.vatRateSource, "USER_SUPPLIED_TAX_VALUE");
assert.deepEqual(catalogAttributesToMutationMap(normalizedCatalogProduct.attributes), {
  renk: 21,
  uyumlu_platformlar: [31, 32],
  frekans_araligi: { min: 20, max: 20000 },
});
assert.throws(
  () => normalizeAdminCatalogProductDetail({
    ...catalogDetailPayload,
    product: { ...catalogDetailPayload.product, image_url: "https://cdn.example/image.jpg" },
  }),
  /desteklenmeyen alan.*image_url/,
  "detail DTO medya alanını fail-closed reddetmeli",
);

assert.deepEqual(buildCatalogProductDetailRequest({ productId: 12 }), {
  path: "/api/admin/catalog/products/12",
});
const createCatalogRequest = buildCreateCatalogProductMutation({
  name: "Nova Kulaklık",
  description: "Yeni ürün",
  price: 1299.9,
  oldPrice: null,
  stock: 8,
  sku: "NV-KULAKLIK-12",
  brand: "Nova",
  productType: "Kulaklık",
  vatRate: 20,
  vatRateSource: "USER_SUPPLIED_TAX_VALUE",
  weightGrams: 280,
  desi: 0.4,
  publicationStatus: "draft",
  customerVisible: false,
  categoryIds: [4],
  primaryCategoryId: 4,
  attributes: { renk: 21 },
});
assert.equal(createCatalogRequest.path, "/api/admin/catalog/products");
assert.equal(createCatalogRequest.method, "POST");
assert.deepEqual(createCatalogRequest.body, {
  name: "Nova Kulaklık",
  description: "Yeni ürün",
  price: 1299.9,
  old_price: null,
  stock: 8,
  sku: "NV-KULAKLIK-12",
  brand: "Nova",
  product_type: "Kulaklık",
  vat_rate: 20,
  vat_rate_source: "USER_SUPPLIED_TAX_VALUE",
  weight_grams: 280,
  desi: 0.4,
  publication_status: "draft",
  is_customer_visible: false,
  category_ids: [4],
  primary_category_id: 4,
  attributes: { renk: 21 },
});
const updateCatalogRequest = buildUpdateCatalogProductMutation({
  productId: 12,
  expectedRevision: 4,
  changes: { stock: 7, categoryIds: [4], primaryCategoryId: 4 },
});
assert.equal(updateCatalogRequest.path, "/api/admin/catalog/products/12");
assert.equal(updateCatalogRequest.method, "PATCH");
assert.deepEqual(updateCatalogRequest.body, {
  expected_revision: 4,
  stock: 7,
  category_ids: [4],
  primary_category_id: 4,
});
assert.deepEqual(buildArchiveCatalogProductMutation({ productId: 12, expectedRevision: 4 }), {
  path: "/api/admin/catalog/products/12/archive",
  method: "PATCH",
  body: { expected_revision: 4 },
});
assert.throws(() => buildCreateCatalogProductMutation({
  ...{
    name: "Nova Kulaklık", description: "Yeni ürün", price: 10, oldPrice: null, stock: 1,
    publicationStatus: "archived", customerVisible: false, categoryIds: [], primaryCategoryId: null, attributes: {},
  },
}), /arşiv dışındaki/);
assert.throws(() => buildUpdateCatalogProductMutation({ productId: 12, expectedRevision: 4, changes: { imageUrl: "https://cdn.example/image.jpg" } }), /desteklenmeyen alan.*imageUrl/);
assert.throws(() => buildUpdateCatalogProductMutation({ productId: 12, expectedRevision: 4, changes: { primaryCategoryId: 4 } }), /categoryIds ile birlikte/);

const catalogOperations = adapter.mutationActions(resolveCapabilities({
  firstPartyCatalogRead: true,
  firstPartyCatalogWrite: true,
}));
assert.equal(typeof catalogOperations.getCatalogProduct, "function");
assert.equal(typeof catalogOperations.createCatalogProduct, "function");
assert.equal(typeof catalogOperations.updateCatalogProduct, "function");
assert.equal(typeof catalogOperations.archiveCatalogProduct, "function");
assert.equal((await catalogOperations.getCatalogProduct({ productId: 12 })).id, "PR-000012");
await catalogOperations.createCatalogProduct({
  name: "Nova Kulaklık", description: "Yeni ürün", price: 10, oldPrice: null, stock: 1,
  publicationStatus: "draft", customerVisible: false, categoryIds: [], primaryCategoryId: null, attributes: {},
});
await catalogOperations.updateCatalogProduct({ productId: 12, expectedRevision: 4, changes: { stock: 7 } });
await catalogOperations.archiveCatalogProduct({ productId: 12, expectedRevision: 4 });
const catalogCalls = calls.slice(2);
assert.deepEqual(catalogCalls.map((call) => [call.requestPath, call.init?.method || "GET"]), [
  ["/api/admin/catalog/products/12", "GET"],
  ["/api/admin/catalog/products", "POST"],
  ["/api/admin/catalog/products/12", "PATCH"],
  ["/api/admin/catalog/products/12/archive", "PATCH"],
]);
assert.equal(catalogCalls.some((call) => call.init?.body instanceof FormData), false, "katalog yazmaları FormData kullanmamalı");

assert.deepEqual(ORDER_CANCEL_REASONS.map(({ code }) => code), [
  "CUSTOMER_REQUEST",
  "DUPLICATE_ORDER",
  "INVENTORY_UNAVAILABLE",
  "DELIVERY_ADDRESS_UNRESOLVED",
  "POLICY_OR_FRAUD_REVIEW",
]);
assert.equal(ORDER_CANCEL_NOTE_MAX_LENGTH, 300);
assert.throws(() => buildCancelOrderMutation({
  orderId: 42,
  expectedStatus: "Hazırlanıyor",
  reasonCode: "ADMIN_REQUEST",
  idempotencyKey: cancelKey,
}), /izin verilen/);
assert.throws(() => buildCancelOrderMutation({
  orderId: 42,
  expectedStatus: "Hazırlanıyor",
  reasonCode: "POLICY_OR_FRAUD_REVIEW",
  note: "",
  idempotencyKey: cancelKey,
}), /açıklama zorunludur/);
assert.throws(() => buildManualShipmentMutation({
  orderId: 42,
  expectedStatus: "Hazırlanıyor",
  provider: "Kargo",
  trackingNo: "ABC123",
  handoffConfirmed: false,
  idempotencyKey: shipmentKey,
}), /Fiziksel kargo devrini/);
assert.throws(() => buildManualShipmentMutation({
  orderId: 42,
  expectedStatus: "Hazırlanıyor",
  provider: "Kargo & Co",
  trackingNo: "ABC123",
  handoffConfirmed: true,
  idempotencyKey: shipmentKey,
}), /sağlayıcısı desteklenmeyen karakter/);
assert.throws(() => buildManualShipmentMutation({
  orderId: 42,
  expectedStatus: "Hazırlanıyor",
  provider: "Kargo",
  trackingNo: "ABC 123",
  handoffConfirmed: true,
  idempotencyKey: shipmentKey,
}), /Takip numarası desteklenmeyen karakter/);

assert.equal(
  createMutationIdempotencyKey("cancel", { randomUUID: () => "00000000-0000-4000-8000-000000000000" }),
  "commerce-pro-cancel-00000000-0000-4000-8000-000000000000",
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "src", "IntegratedApp.jsx"), "utf8");
assert.match(appSource, /requestError\?\.status === 409[\s\S]{0,120}onConflict/);
assert.match(appSource, /idempotencyKey: createMutationIdempotencyKey\(kind\)/);
assert.match(appSource, /Sağlayıcı refund'u otomatik çalıştırılmadı/);
assert.match(appSource, /Taşıyıcı API\/etiket işlemi yapılmadı/);
assert.match(appSource, /typeof mutationActions\.cancelOrder === "function"/);
assert.match(appSource, /typeof mutationActions\.createManualShipment === "function"/);
assert.match(appSource, /requestError\?\.details\?\.refetchRequired === true/);
assert.match(appSource, /setSuppressedMutationActions\(mutationActions\)/);
assert.match(appSource, /İşlem güvenlik kontrolünde durduruldu/);
assert.match(appSource, /typeof mutationActions\.createCatalogProduct === "function"/);
assert.match(appSource, /getCatalogProduct\(\{ productId: summary\.rawId \}\)/, "edit/archive öncesi tam detail DTO çekilmeli");
assert.match(appSource, /requestError\?\.status === 428/);
assert.match(appSource, /requestError\?\.status === 403 \|\| requestError\?\.status === 503/);
assert.match(appSource, /if \(!writesBlocked \|\| !operation\) return;/, "açık katalog modalı stale veya capability kaybında kapanmalı");
assert.doesNotMatch(appSource, /<input[^>]+type=["']file|FormData|image_url|imageUrl/i, "canlı katalog formu medya alanı taşımamalı");

const now = Date.UTC(2026, 6, 14, 12, 0, 0);
const token = `header.${Buffer.from(JSON.stringify({ id: 7, role: "admin", exp: Math.floor(now / 1000) + 3600 })).toString("base64url")}.signature`;
const storage = {
  getItem(key) { return key === ADMIN_TOKEN_KEY ? token : null; },
  removeItem() {},
};
const decodeBase64 = (value) => Buffer.from(value, "base64").toString("utf8");
const conflictHttp = createAdminHttp({
  storage,
  now: () => now,
  decodeBase64,
  fetchImpl: async () => new Response(JSON.stringify({
    code: "ORDER_STATUS_CONFLICT",
    error: "Güncel kayıt gerekli.",
    details: { refetchRequired: true },
  }), { status: 409 }),
});
await assert.rejects(
  () => conflictHttp.request("/api/orders/42/cancel"),
  (error) => error.status === 409
    && error.code === "ORDER_STATUS_CONFLICT"
    && error.details?.refetchRequired === true,
  "sunucunun güvenli hata kodu 409/refetch kararı için korunmalı",
);

console.log("admin Commerce Pro controlled order mutations smoke passed");
