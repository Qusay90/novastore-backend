import { resolveCapabilities } from "../integration/capabilities.js";
import {
  normalizeAdminSession,
  normalizeDashboardStats,
  normalizeOrderSummaryPage,
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

  return Object.freeze({ session, dashboard, orders });
}
