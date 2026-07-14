import { hasCapability, resolveCapabilities } from "../integration/capabilities.js";
import { normalizeCatalogStructureSummary } from "../integration/catalogStructureRead.js";
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

  const dashboard = async ({ signal } = {}) => normalizeDashboardStats(
    await http.request("/api/admin/stats", { signal }),
  );

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

  const mutationActions = (capabilities) => {
    const actions = {};
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

  return Object.freeze({ catalog, catalogStructure, session, dashboard, notifications, orders, returns, mutationActions });
}
