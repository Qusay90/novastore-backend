import { hasCapability, resolveCapabilities } from "../integration/capabilities.js";
import { normalizeCatalogStructureSummary } from "../integration/catalogStructureRead.js";
import {
  normalizeAdminStoreDetail,
  normalizeAdminStoreSummaryPage,
} from "../integration/storeRead.js";
import {
  buildArchiveCatalogProductMutation,
  buildCatalogProductDetailRequest,
  buildCreateCatalogProductMutation,
  buildUpdateCatalogProductMutation,
  normalizeAdminCatalogProductDetail,
} from "../integration/catalogMutations.js";
import {
  buildCancelOrderMutation,
  buildManualShipmentMutation,
} from "../integration/orderMutations.js";
import {
  normalizeAdminSession,
  normalizeDashboardStats,
  normalizeFirstPartyCatalogPage,
  normalizeNotificationSummaryPage,
  normalizeOrderSummaryPage,
  normalizeReturnSummaryPage,
} from "../integration/legacyMappers.js";
import {
  normalizeCoupons,
  normalizeQuestions,
  normalizeReviewPage,
  normalizeSupportMessages,
  normalizeSupportThreads,
} from "../integration/adminOperations.js";

export function createSameOriginAdapter(http) {
  if (!http || typeof http.request !== "function") throw new TypeError("Geçerli bir HTTP istemcisi gerekir.");

  const session = async ({ signal } = {}) => {
    const normalized = normalizeAdminSession(await http.request("/api/admin/session", { signal }));
    return Object.freeze({
      ...normalized,
      capabilities: resolveCapabilities(normalized.capabilities),
    });
  };

  const dashboard = async ({ signal } = {}) => {
    const payload = await http.request("/api/admin/stats", { signal });
    const normalized = normalizeDashboardStats(payload);
    if (payload?.dataScope !== "local_review_no_finance_order_user_data") return normalized;
    return Object.freeze({
      ...normalized,
      dataScope: payload.dataScope,
      totalRevenue: null,
      totalOrders: null,
      totalUsers: null,
    });
  };

  const orders = async ({ signal } = {}) => normalizeOrderSummaryPage(
    await http.request("/api/admin/orders/summary?limit=100", { signal }),
  );

  const returns = async ({ signal } = {}) => normalizeReturnSummaryPage(
    await http.request("/api/admin/returns/summary?limit=100", { signal }),
  );

  const notifications = async ({ signal } = {}) => normalizeNotificationSummaryPage(
    await http.request("/api/admin/notifications/summary?limit=50", { signal }),
  );

  const catalog = async ({ signal } = {}) => normalizeFirstPartyCatalogPage(
    await http.request("/api/admin/catalog/products/summary?limit=100", { signal }),
  );

  const catalogStructure = async ({ signal } = {}) => normalizeCatalogStructureSummary(
    await http.request("/api/admin/catalog/structure/summary?limit=100", { signal }),
  );

  const stores = async ({ signal } = {}) => normalizeAdminStoreSummaryPage(
    await http.request("/api/admin/stores/summary?limit=100", { signal }),
  );

  const storeDetail = async ({ storeId, signal } = {}) => normalizeAdminStoreDetail(
    await http.request(`/api/admin/stores/${encodeURIComponent(String(storeId))}`, { signal }),
  );

  const reviews = async ({ status = "PENDING", signal } = {}) => normalizeReviewPage(
    await http.request(`/api/reviews/admin/all?status=${encodeURIComponent(status)}&limit=100`, { signal }),
  );

  const questions = async ({ signal } = {}) => normalizeQuestions(
    await http.request("/api/questions/admin/all", { signal }),
  );

  const coupons = async ({ signal } = {}) => normalizeCoupons(
    await http.request("/api/campaigns/coupons", { signal }),
  );

  const supportThreads = async ({ signal } = {}) => normalizeSupportThreads(
    await http.request("/api/messages/users", { signal }),
  );

  const supportHistory = async ({ customerId, signal } = {}) => normalizeSupportMessages(
    await http.request(`/api/messages/history/${encodeURIComponent(String(customerId))}`, { signal }),
  );

  const mutationActions = (capabilities) => {
    const actions = {};
    if (hasCapability(capabilities, "firstPartyCatalogRead")
      && hasCapability(capabilities, "firstPartyCatalogWrite")) {
      actions.getCatalogProduct = async (input = {}) => {
        const request = buildCatalogProductDetailRequest({ productId: input.productId });
        return normalizeAdminCatalogProductDetail(await http.request(request.path, { signal: input.signal }));
      };
      actions.createCatalogProduct = async (input = {}) => {
        const { signal, ...requestInput } = input;
        const request = buildCreateCatalogProductMutation(requestInput);
        return normalizeAdminCatalogProductDetail(await http.request(request.path, {
          method: request.method,
          body: JSON.stringify(request.body),
          signal,
        }));
      };
      actions.updateCatalogProduct = async (input = {}) => {
        const { signal, ...requestInput } = input;
        const request = buildUpdateCatalogProductMutation(requestInput);
        return normalizeAdminCatalogProductDetail(await http.request(request.path, {
          method: request.method,
          body: JSON.stringify(request.body),
          signal,
        }));
      };
      actions.archiveCatalogProduct = async (input = {}) => {
        const { signal, ...requestInput } = input;
        const request = buildArchiveCatalogProductMutation(requestInput);
        return normalizeAdminCatalogProductDetail(await http.request(request.path, {
          method: request.method,
          body: JSON.stringify(request.body),
          signal,
        }));
      };
      actions.registerCatalogMedia = async ({ productId, expectedRevision, mediaUrl, mediaType, isCover = false, signal } = {}) => {
        await http.request(`/api/admin/catalog/products/${encodeURIComponent(String(productId))}/media`, {
          method: "POST",
          body: JSON.stringify({
            expected_revision: expectedRevision,
            media_url: mediaUrl,
            media_type: mediaType,
            is_cover: isCover,
          }),
          signal,
        });
        return actions.getCatalogProduct({ productId, signal });
      };
      actions.reorderCatalogMedia = async ({ productId, expectedRevision, mediaIds, coverMediaId, signal } = {}) => {
        await http.request(`/api/admin/catalog/products/${encodeURIComponent(String(productId))}/media/order`, {
          method: "PUT",
          body: JSON.stringify({
            expected_revision: expectedRevision,
            media_ids: mediaIds,
            cover_media_id: coverMediaId,
          }),
          signal,
        });
        return actions.getCatalogProduct({ productId, signal });
      };
      actions.updateCatalogMediaCardFraming = async ({ productId, mediaId, expectedRevision, cardFraming, signal } = {}) => {
        await http.request(`/api/admin/catalog/products/${encodeURIComponent(String(productId))}/media/${encodeURIComponent(String(mediaId))}/framing`, {
          method: "PATCH",
          body: JSON.stringify({
            expected_revision: expectedRevision,
            card_framing: cardFraming,
          }),
          signal,
        });
        return actions.getCatalogProduct({ productId, signal });
      };
      actions.deleteCatalogMedia = async ({ productId, mediaId, expectedRevision, signal } = {}) => {
        await http.request(`/api/admin/catalog/products/${encodeURIComponent(String(productId))}/media/${encodeURIComponent(String(mediaId))}`, {
          method: "DELETE",
          body: JSON.stringify({ expected_revision: expectedRevision }),
          signal,
        });
        return actions.getCatalogProduct({ productId, signal });
      };
    }
    if (hasCapability(capabilities, "orderCancelWrite")) {
      actions.cancelOrder = async (input = {}) => {
        const request = buildCancelOrderMutation(input);
        return http.request(request.path, {
          method: "POST",
          headers: { "Idempotency-Key": request.idempotencyKey },
          body: JSON.stringify(request.body),
          signal: input.signal,
        });
      };
    }
    if (hasCapability(capabilities, "manualShipmentWrite")) {
      actions.createManualShipment = async (input = {}) => {
        const request = buildManualShipmentMutation(input);
        return http.request(request.path, {
          method: "POST",
          headers: { "Idempotency-Key": request.idempotencyKey },
          body: JSON.stringify(request.body),
          signal: input.signal,
        });
      };
    }
    if (hasCapability(capabilities, "reviewModerationWrite")) {
      actions.moderateReview = ({ reviewId, expectedRevision, status, moderationNote = null, signal } = {}) => http.request(
        `/api/reviews/admin/${encodeURIComponent(String(reviewId))}/moderation`,
        { method: "PATCH", body: JSON.stringify({ expected_revision: expectedRevision, status, moderation_note: moderationNote }), signal },
      );
    }
    if (hasCapability(capabilities, "questionAnswerWrite")) {
      actions.answerQuestion = ({ questionId, expectedRevision, answer, signal } = {}) => http.request(
        `/api/questions/admin/answer/${encodeURIComponent(String(questionId))}`,
        { method: "PATCH", body: JSON.stringify({ expected_revision: expectedRevision, answer }), signal },
      );
    }
    if (hasCapability(capabilities, "couponWrite")) {
      actions.createCoupon = ({ body, signal } = {}) => http.request("/api/campaigns/coupons", { method: "POST", body: JSON.stringify(body), signal });
      actions.updateCoupon = ({ couponId, body, signal } = {}) => http.request(
        `/api/campaigns/coupons/${encodeURIComponent(String(couponId))}`,
        { method: "PUT", body: JSON.stringify(body), signal },
      );
      actions.setCouponStatus = ({ couponId, expectedRevision, active, signal } = {}) => http.request(
        `/api/campaigns/coupons/${encodeURIComponent(String(couponId))}/status`,
        { method: "PATCH", body: JSON.stringify({ expected_revision: expectedRevision, is_active: active }), signal },
      );
    }
    if (hasCapability(capabilities, "supportWrite")) {
      actions.takeoverSupport = ({ threadId, signal } = {}) => http.request(
        `/api/messages/threads/${encodeURIComponent(String(threadId))}/takeover`, { method: "POST", body: "{}", signal },
      );
      actions.setSupportStatus = ({ threadId, status, signal } = {}) => http.request(
        `/api/messages/threads/${encodeURIComponent(String(threadId))}/status`, { method: "PATCH", body: JSON.stringify({ status }), signal },
      );
      actions.sendSupportReply = ({ customerId, message, signal } = {}) => http.request(
        "/api/messages/send", { method: "POST", body: JSON.stringify({ receiver_id: customerId, message }), signal },
      );
    }
    return Object.freeze(actions);
  };

  return Object.freeze({ catalog, catalogStructure, session, dashboard, notifications, orders, returns, stores, storeDetail, reviews, questions, coupons, supportThreads, supportHistory, mutationActions });
}
