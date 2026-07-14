import assert from "node:assert/strict";
import {
  ADMIN_LOGIN_URL,
  ADMIN_TOKEN_KEY,
  createAdminHttp,
  isValidAdminToken,
} from "../admin-commerce-pro/src/integration/adminHttp.js";
import { resolveCapabilities, hasCapability } from "../admin-commerce-pro/src/integration/capabilities.js";
import {
  normalizeAdminSession,
  normalizeDashboardStats,
  normalizeOrderSummaryPage,
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

const session = normalizeAdminSession({
  user: { id: 7, role: "admin" },
  commerceMode: "single_vendor",
  apiVersion: "2026-07-14",
  capabilities: { dashboardRead: true },
});
assert.equal(session.commerceMode, "single_vendor");
assert.throws(() => normalizeAdminSession({ user: { id: 8, role: "customer" } }), /admin/);
assert.throws(() => normalizeAdminSession({ user: { id: 8, role: "admin" }, commerceMode: "multi_vendor" }), /çalışma modu/);

const fixtureHttp = {
  async request(path) {
    if (path === "/api/admin/session") return { user: { id: 7, role: "admin" }, commerceMode: "single_vendor", capabilities: { dashboardRead: true, ordersRead: true } };
    if (path === "/api/admin/stats") return { totalRevenue: "10", totalOrders: 1, totalProducts: 2, totalUsers: 3 };
    if (path === "/api/admin/orders/summary?limit=100") return { items: [{ id: 1, customer_name: "Müşteri", total_amount: "10", status: "Onay Bekliyor", payment_status: "PAID", item_count: 1, created_at: "2026-07-14T10:00:00.000Z" }], limit: 100, hasMore: false };
    throw new Error("unexpected path");
  },
};
const adapter = createSameOriginAdapter(fixtureHttp);
assert.equal((await adapter.session()).capabilities.ordersRead, true);
assert.equal((await adapter.dashboard()).totalRevenue, 10);
assert.equal((await adapter.orders()).items[0].id, "NS-000001");

console.log("admin Commerce Pro HTTP and mapper smoke passed");
