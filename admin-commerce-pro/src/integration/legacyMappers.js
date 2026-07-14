const toFiniteNumber = (value, field) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new TypeError(`${field} alanı zorunludur.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new TypeError(`${field} geçerli, negatif olmayan bir sayı olmalıdır.`);
  return parsed;
};

const toInteger = (value, field) => {
  const parsed = toFiniteNumber(value, field);
  if (!Number.isInteger(parsed)) throw new TypeError(`${field} tam sayı olmalıdır.`);
  return parsed;
};

const toLegacyNullableText = (value, field, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") throw new TypeError(`${field} metin veya null olmalıdır.`);
  return value.trim() || fallback;
};

const toDateValue = (value, field) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${field} geçerli bir tarih olmalıdır.`);
  return parsed;
};

const toLegacyNullableDate = (value, field) => (
  value === null || value === undefined || value === "" ? null : toDateValue(value, field)
);

export function normalizeDashboardStats(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Dashboard istatistik yanıtı nesne olmalıdır.");
  }
  return Object.freeze({
    totalRevenue: toFiniteNumber(payload.totalRevenue, "totalRevenue"),
    totalOrders: toInteger(payload.totalOrders, "totalOrders"),
    totalProducts: toInteger(payload.totalProducts, "totalProducts"),
    totalUsers: toInteger(payload.totalUsers, "totalUsers"),
  });
}

export function normalizeOrder(row) {
  if (!row || typeof row !== "object") throw new TypeError("Sipariş özeti nesne olmalıdır.");
  const rawId = toInteger(row.id, "order.id");
  if (rawId < 1) throw new TypeError("order.id pozitif olmalıdır.");
  const createdAt = toLegacyNullableDate(row.created_at, "order.created_at");
  const paymentStatus = toLegacyNullableText(row.payment_status, "order.payment_status", "Bilinmiyor");
  const backendStatus = toLegacyNullableText(row.status, "order.status", "Durum Bilinmiyor");
  const pendingPayment = backendStatus === "Ödeme Bekliyor" || paymentStatus === "REQUIRES_ACTION";
  const paymentFailed = paymentStatus === "FAILED";
  const status = pendingPayment ? "Ödeme Bekliyor" : paymentFailed ? "Ödeme Başarısız" : backendStatus;

  return Object.freeze({
    id: `NS-${String(rawId).padStart(6, "0")}`,
    rawId,
    customerName: toLegacyNullableText(row.customer_name, "order.customer_name", "Müşteri bilgisi yok"),
    email: String(row.email || ""),
    status,
    statusNote: pendingPayment
      ? "Ödeme tamamlanmadan kesin siparişe dönüşmez."
      : paymentFailed
        ? "Ödeme tamamlanmadığı için sipariş kesinleşmedi."
        : "",
    paymentStatus,
    refundStatus: String(row.refund_status || "NONE"),
    total: toFiniteNumber(row.total_amount, "order.total_amount"),
    itemCount: toInteger(row.item_count, "order.item_count"),
    createdAt,
    pendingPayment,
    paymentFailed,
  });
}

export function normalizeOrderSummaryPage(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) {
    throw new TypeError("Sipariş özet yanıtı items dizisi içermelidir.");
  }
  const limit = toInteger(payload.limit, "orders.limit");
  if (limit < 1 || limit > 100) throw new TypeError("orders.limit 1–100 aralığında olmalıdır.");
  if (typeof payload.hasMore !== "boolean") throw new TypeError("orders.hasMore boolean olmalıdır.");
  return Object.freeze({
    items: payload.items.map(normalizeOrder),
    limit,
    hasMore: payload.hasMore,
  });
}

export function normalizeAdminSession(payload) {
  if (!payload || payload.user?.role !== "admin" || !Number.isInteger(Number(payload.user?.id))) {
    throw new TypeError("Sunucu geçerli bir admin oturumu döndürmedi.");
  }
  if (payload.commerceMode !== "single_vendor") {
    throw new TypeError("Desteklenmeyen Commerce çalışma modu.");
  }
  return Object.freeze({
    user: Object.freeze({ id: Number(payload.user.id), role: "admin" }),
    commerceMode: "single_vendor",
    apiVersion: String(payload.apiVersion || ""),
    capabilities: payload.capabilities,
  });
}
