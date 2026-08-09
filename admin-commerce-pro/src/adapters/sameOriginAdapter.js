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
    return Object.freeze(actions);
  };

  return Object.freeze({ catalog, catalogStructure, session, dashboard, notifications, orders, returns, stores, storeDetail, mutationActions });
}
