import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const app = read("admin-commerce-pro/src/IntegratedApp.jsx");
const styles = read("admin-commerce-pro/src/integrated.css");
const login = read("frontend/admin-login.html");
const legacyAdmin = read("frontend/admin.html");

for (const state of [
  "provider_not_configured",
  "credentials_required",
  "client_ip_config_required",
  "production_test_mode_forbidden",
  "activation_required",
  "ready",
]) {
  assert.match(app, new RegExp(`\\b${state}\\b`), `provider durumu görünür label matrisinde olmalı: ${state}`);
}
assert.match(app, /Ödeme sağlayıcısı durumu doğrulanamadı/);
assert.match(app, /const ready = state === "ready" && paymentProvider\?\.ready === true/);
assert.match(app, /data-payment-provider-state=\{state \|\| "unknown"\}/);
assert.match(app, /<PaymentProviderStatus paymentProvider=\{paymentProvider\}/);

for (const field of [
  "sellerAllocations",
  "sellerOrderId",
  "organizationName",
  "items",
  "productId",
  "quantity",
  "lineTotal",
  "trackingNo",
  "paymentProvider",
  "paymentRef",
  "paymentExternalRef",
  "paymentFailureReason",
  "paymentUpdatedAt",
  "refundStatus",
]) {
  assert.match(app, new RegExp(`\\b${field}\\b`), `sipariş gerçeği UI alanı eksik: ${field}`);
}
assert.match(app, /Refund durumu yerel kayıttır; sağlayıcı para hareketi ayrıca doğrulanmalıdır/);
assert.match(app, /Satıcı \/ mağaza/);
assert.match(app, /Kalem \/ adet/);
assert.match(app, /const orderMayBeHandedOff = \(order\) => order\.backendStatus === MANUAL_SHIPMENT_EXPECTED_STATUS[\s\S]*?Array\.isArray\(order\.sellerAllocations\)[\s\S]*?order\.sellerAllocations\.length === 0/);
assert.match(app, /Seller sahipli siparişte kargo devri Seller fulfillment otoritesindedir/);
assert.match(app, /title=\{orderMayBeHandedOff\(order\) \? "Manuel kargo devrini doğrula" : manualShipmentUnavailableReason\(order\)\}/);
assert.match(app, /aria-label=\{orderMayBeHandedOff\(order\)[\s\S]*?manualShipmentUnavailableReason\(order\)\}/);
assert.match(app, /const orderMayBeDelivered = \(order\) => order\.backendStatus === MANUAL_DELIVERY_EXPECTED_STATUS[\s\S]*?order\.shipmentStatus === MANUAL_DELIVERY_EXPECTED_SHIPMENT_STATUS[\s\S]*?Boolean\(order\.trackingNo\)/);
assert.match(app, /order\.sellerAllocations\.length <= 1/);
assert.match(app, /deliveryEnabled && orderMayBeDelivered\(order\) && \(/);
assert.match(app, /typeof mutationActions\.confirmManualDelivery === "function"/);
assert.match(app, /testId="manual-delivery-dialog"/);
assert.match(app, /Siparişin bu takip numarasıyla fiziksel olarak müşteriye teslim edildiğini doğruluyorum/);

const openProductOperation = app.match(/const openExactProductOperation = async[\s\S]*?const handleComplete/)?.[0] || "";
assert.ok(openProductOperation, "ürün mutation giriş kapısı bulunmalı");
assert.match(openProductOperation, /summary\.adminEditable !== true[\s\S]*?return;[\s\S]*?setOpeningProductId/);
assert.match(app, /product\.adminEditable !== true \? <span className="live-seller-readonly-lock"/);
assert.match(app, /Seller ürünü · salt okunur/);
assert.match(app, /Detay mutation, medya ve arşivleme Admin'de açılmaz/);
assert.match(app, /const catalogProductOwnershipUnresolved = \(product\) => product\.adminEditable !== true[\s\S]*?!product\.sellerOrganizationId[\s\S]*?catalogProductStoreTupleMissing\(product\)/);
assert.match(app, /Sahiplik\/store bağı doğrulanamadı · salt okunur/);
assert.match(app, /storeTupleMissing \? "Atanmamış mağaza" : product\.storeName \|\| `Mağaza #\$\{product\.storeId\}`/);
assert.match(app, /storeTupleMissing \? "Mağaza kimliği eksik"/);
assert.match(app, /ownershipUnresolved \? "Sahiplik\/store bağı doğrulanamadı"/);
assert.match(app, /sellerOrganizationName/);
assert.match(app, /storeOperationalStatus/);

for (const field of [
  "sellerStoreId",
  "sellerStoreStatus",
  "sellerOrganizationId",
  "sellerOrganizationName",
  "sellerOrganizationStatus",
  "ownershipVerified",
]) {
  assert.match(app, new RegExp(`\\b${field}\\b`), `Seller mağaza bağ alanı eksik: ${field}`);
}
assert.match(app, /Seller sahiplik bağı doğrulanamadı/);
assert.match(app, /ownershipVerified === true \? "Doğrulandı" : "Doğrulanamadı"/);

assert.match(login, /return ADMIN_LOGIN_TARGETS\.has\(requested\) \? requested : 'admin-commerce-pro-live\.html'/);
assert.match(legacyAdmin, /href="admin-commerce-pro-live\.html"/);
assert.match(legacyAdmin, /Commerce Pro Operasyon/);
assert.doesNotMatch(legacyAdmin, /Commerce Pro tasarım önizlemesini yeni sekmede aç/);

assert.match(styles, /\.live-payment-provider-banner\.is-ready/);
assert.match(styles, /\.live-payment-provider-banner\.is-blocked/);
assert.match(styles, /\.live-seller-readonly-lock/);
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.live-payment-provider-banner/);

console.log("Admin Commerce Pro first-sale UI contract smoke passed");
