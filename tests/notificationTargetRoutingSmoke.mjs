import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeCustomerNotification,
  resolveCustomerNotificationTarget,
} from "../storefront-commerce-pro/src/adapters/customerAccountAdapter.js";
import { normalizeNotificationSummary } from "../admin-commerce-pro/src/integration/legacyMappers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
  ["order", 71, "#/hesabim/siparisler/71", "orders"],
  ["product", 72, "#/urun-id/72", "catalog"],
  ["product_question", 73, "#/hesabim", "questions"],
  ["return_request", 74, "#/hesabim/siparisler", "returns"],
  ["review", 75, "#/hesabim", "reviews"],
  ["support_thread", 76, "#/iletisim", "support"],
];

for (const [entityType, entityId, customerTarget, adminTarget] of cases) {
  const raw = {
    id: entityId,
    type: "operation_update",
    message: "Güvenli hedef",
    is_read: false,
    entity_type: entityType,
    entity_id: entityId,
    created_at: "2026-08-13T00:00:00.000Z",
  };
  assert.equal(resolveCustomerNotificationTarget(raw), customerTarget);
  assert.equal(normalizeCustomerNotification(raw).target, customerTarget);
  assert.equal(normalizeNotificationSummary(raw).targetPage, adminTarget);
}

assert.equal(resolveCustomerNotificationTarget({ entity_type: "https://evil.example", entity_id: 1 }), null);
assert.equal(resolveCustomerNotificationTarget({ entity_type: "order", entity_id: "../admin" }), null);
assert.equal(normalizeCustomerNotification({
  id: 1,
  message: "Hedefsiz",
  entity_type: null,
  entity_id: null,
}).target, null);
assert.throws(
  () => normalizeNotificationSummary({ id: 1, message: "Eksik", is_read: false, entity_type: "order" }),
  /hedef kimliği/
);

const targetService = fs.readFileSync(path.join(root, "services", "notificationTargetService.js"), "utf8");
const customerUi = fs.readFileSync(path.join(root, "storefront-commerce-pro", "src", "ConnectedCustomerPages.jsx"), "utf8");
const adminUi = fs.readFileSync(path.join(root, "admin-commerce-pro", "src", "IntegratedApp.jsx"), "utf8");
assert.match(targetService, /ALLOWED_TARGET_FIELDS = new Set\(\['entityType', 'entityId', 'entity_type', 'entity_id'\]\)/);
assert.doesNotMatch(targetService, /redirect|https?:|targetUrl|target_url/i);
assert.match(customerUi, /window\.location\.hash = item\.target\.slice\(1\)/);
assert.match(adminUi, /onOpenTarget\(item\.targetPage\)/);
console.log("notificationTargetRoutingSmoke: OK");
