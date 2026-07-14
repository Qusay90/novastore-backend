import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSameOriginAdapter } from "../src/adapters/sameOriginAdapter.js";
import { resolveCapabilities } from "../src/integration/capabilities.js";
import { ADMIN_TOKEN_KEY, createAdminHttp } from "../src/integration/adminHttp.js";
import {
  buildCancelOrderMutation,
  buildManualShipmentMutation,
  createMutationIdempotencyKey,
  ORDER_CANCEL_NOTE_MAX_LENGTH,
  ORDER_CANCEL_REASONS,
} from "../src/integration/orderMutations.js";

const calls = [];
const adapter = createSameOriginAdapter({
  async request(requestPath, init) {
    calls.push({ requestPath, init });
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
