import assert from "node:assert/strict";
import {
  normalizeCoupons,
  normalizeQuestions,
  normalizeReviewPage,
  normalizeSupportMessages,
  normalizeSupportThreads,
} from "../admin-commerce-pro/src/integration/adminOperations.js";
import { createSameOriginAdapter } from "../admin-commerce-pro/src/adapters/sameOriginAdapter.js";

const timestamp = "2026-08-13T10:00:00.000Z";
assert.equal(normalizeReviewPage({ reviews: [{
  id: 1, product_id: 2, product_name: "Ürün", user_id: 3, user_name: "Müşteri",
  rating: 5, comment: "İyi", status: "PENDING", revision: 1, created_at: timestamp,
  moderated_by: null, moderated_at: null, moderation_note: null,
}], count: 1 }).items[0].status, "PENDING");
assert.throws(() => normalizeReviewPage({ reviews: [{
  id: 1, product_id: 2, product_name: "Ürün", user_id: 3, user_name: "Müşteri",
  rating: 5, comment: "kötü\u0007", status: "PENDING", revision: 1, created_at: timestamp,
}], count: 1 }), /geçersiz metin/);

assert.equal(normalizeQuestions([{
  id: 4, product_id: 2, product_name: "Ürün", user_name: "Müşteri",
  question: "Stok var mı?", answer: null, revision: 1, created_at: timestamp, answered_at: null,
}])[0].answer, null);
assert.equal(normalizeCoupons({ items: [{
  id: 5, code: "LOCAL10", discount_type: "PERCENT", discount_value: 10,
  min_order_amount: 0, max_discount_amount: null, usage_limit: null, used_count: 0,
  is_active: false, starts_at: null, ends_at: null, revision: 1,
  operational_status: "disabled", created_at: timestamp, updated_at: timestamp,
}] })[0].operationalStatus, "disabled");
assert.equal(normalizeSupportThreads([{
  id: 6, support_thread_id: 7, name: "Müşteri", email: "customer@local.invalid",
  status: "OPEN", assigned_admin_id: null, source: "DIRECT", last_message_at: timestamp,
  ai_handoff_count: 0,
}])[0].threadId, 7);
assert.equal(normalizeSupportMessages([{
  id: 8, sender_id: 6, receiver_id: 9, support_thread_id: 7,
  message: "Destek", created_at: timestamp, is_ai_handoff: false,
}])[0].message, "Destek");

const requests = [];
const responseFor = (pathname) => {
  if (pathname.startsWith("/api/reviews/admin/all")) return { reviews: [], count: 0 };
  if (pathname === "/api/questions/admin/all") return [];
  if (pathname === "/api/campaigns/coupons") return { items: [] };
  if (pathname === "/api/messages/users" || pathname.startsWith("/api/messages/history/")) return [];
  if (pathname.startsWith("/api/admin/catalog/products/") && !pathname.endsWith("/media") && !pathname.includes("/media/")) {
    return { catalogMode: "first_party", product: {
      id: 2, name: "Ürün", description: "", price: 10, old_price: null, currency: "TRY", stock: 1,
      sku: null, brand: null, product_type: null, vat_rate: null, vat_rate_source: null,
      weight_grams: null, desi: null, publication_status: "active", is_customer_visible: true,
      deleted_at: null, created_at: timestamp, updated_at: timestamp, revision: 2, has_media: false,
      media: [], category_ids: [], primary_category_id: null, categories: [], attributes: [],
    } };
  }
  return { thread: { id: 7, status: "TAKEN_OVER" } };
};
const http = {
  async request(pathname, options = {}) {
    requests.push({ pathname, options });
    return responseFor(pathname);
  },
};
const adapter = createSameOriginAdapter(http);
await adapter.reviews({ status: "PENDING" });
await adapter.questions();
await adapter.coupons();
await adapter.supportThreads();
await adapter.supportHistory({ customerId: 6 });
assert.deepEqual(requests.slice(0, 5).map((entry) => entry.pathname), [
  "/api/reviews/admin/all?status=PENDING&limit=100",
  "/api/questions/admin/all",
  "/api/campaigns/coupons",
  "/api/messages/users",
  "/api/messages/history/6",
]);

const actions = adapter.mutationActions({
  firstPartyCatalogRead: true,
  firstPartyCatalogWrite: true,
  reviewModerationWrite: true,
  questionAnswerWrite: true,
  couponWrite: true,
  supportWrite: true,
});
await actions.moderateReview({ reviewId: 1, expectedRevision: 1, status: "PUBLISHED" });
await actions.answerQuestion({ questionId: 4, expectedRevision: 1, answer: "Evet." });
await actions.createCoupon({ body: { code: "LOCAL10" } });
await actions.setCouponStatus({ couponId: 5, expectedRevision: 1, active: true });
await actions.takeoverSupport({ threadId: 7 });
await actions.setSupportStatus({ threadId: 7, status: "CLOSED" });
await actions.sendSupportReply({ customerId: 6, message: "Yanıt" });
await actions.registerCatalogMedia({
  productId: 2,
  expectedRevision: 1,
  mediaUrl: "https://res.cloudinary.com/demo/image/upload/item.webp",
  mediaType: "image",
});

const mutationRequests = requests.slice(5);
assert.deepEqual(mutationRequests.map((entry) => [entry.options.method, entry.pathname]), [
  ["PATCH", "/api/reviews/admin/1/moderation"],
  ["PATCH", "/api/questions/admin/answer/4"],
  ["POST", "/api/campaigns/coupons"],
  ["PATCH", "/api/campaigns/coupons/5/status"],
  ["POST", "/api/messages/threads/7/takeover"],
  ["PATCH", "/api/messages/threads/7/status"],
  ["POST", "/api/messages/send"],
  ["POST", "/api/admin/catalog/products/2/media"],
  [undefined, "/api/admin/catalog/products/2"],
]);
assert.equal(Object.keys(adapter.mutationActions({})).length, 0);
console.log("adminOperationsContractSmoke: OK");
