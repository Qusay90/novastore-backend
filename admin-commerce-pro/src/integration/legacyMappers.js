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

const toNullableFiniteNumber = (value, field) => (
  value === null || value === undefined || value === "" ? null : toFiniteNumber(value, field)
);

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

const toBoolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} boolean olmalıdır.`);
  return value;
};

const toCurrencyCode = (value, field) => {
  const code = toLegacyNullableText(value, field, "TRY").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new TypeError(`${field} üç harfli para birimi kodu olmalıdır.`);
  return code;
};

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
    backendStatus,
    statusNote: pendingPayment
      ? "Ödeme tamamlanmadan kesin siparişe dönüşmez."
      : paymentFailed
        ? "Ödeme tamamlanmadığı için sipariş kesinleşmedi."
        : "",
    paymentStatus,
    refundStatus: String(row.refund_status || "NONE"),
    shipmentStatus: toLegacyNullableText(row.shipment_status, "order.shipment_status", "NONE"),
    shipmentProvider: toLegacyNullableText(row.shipment_provider, "order.shipment_provider", ""),
    estimatedDeliveryAt: toLegacyNullableDate(row.estimated_delivery_date, "order.estimated_delivery_date"),
    carrierConfirmed: false,
    total: toFiniteNumber(row.total_amount, "order.total_amount"),
    currency: toCurrencyCode(row.currency, "order.currency"),
    itemCount: toInteger(row.item_count, "order.item_count"),
    createdAt,
    pendingPayment,
    paymentFailed,
  });
}

export function normalizeReturnSummary(row) {
  if (!row || typeof row !== "object") throw new TypeError("İade özeti nesne olmalıdır.");
  const rawId = toInteger(row.id, "return.id");
  const rawOrderId = toInteger(row.order_id, "return.order_id");
  if (rawId < 1 || rawOrderId < 1) throw new TypeError("İade ve sipariş kimlikleri pozitif olmalıdır.");
  return Object.freeze({
    id: `RT-${String(rawId).padStart(6, "0")}`,
    rawId,
    orderId: `NS-${String(rawOrderId).padStart(6, "0")}`,
    rawOrderId,
    customerName: toLegacyNullableText(row.customer_name, "return.customer_name", "Müşteri bilgisi yok"),
    reasonCode: toLegacyNullableText(row.reason_code, "return.reason_code", "Neden belirtilmedi"),
    status: toLegacyNullableText(row.status, "return.status", "UNKNOWN"),
    refundAmount: toNullableFiniteNumber(row.refund_amount, "return.refund_amount"),
    currency: toCurrencyCode(row.currency, "return.currency"),
    orderStatus: toLegacyNullableText(row.order_status, "return.order_status", "Durum Bilinmiyor"),
    refundStatus: toLegacyNullableText(row.refund_status, "return.refund_status", "NONE"),
    paymentStatus: toLegacyNullableText(row.payment_status, "return.payment_status", "Bilinmiyor"),
    createdAt: toLegacyNullableDate(row.created_at, "return.created_at"),
    updatedAt: toLegacyNullableDate(row.updated_at, "return.updated_at"),
  });
}

export function normalizeNotificationSummary(row) {
  if (!row || typeof row !== "object") throw new TypeError("Bildirim özeti nesne olmalıdır.");
  const rawId = toInteger(row.id, "notification.id");
  if (rawId < 1) throw new TypeError("notification.id pozitif olmalıdır.");
  return Object.freeze({
    id: `NT-${String(rawId).padStart(6, "0")}`,
    rawId,
    type: toLegacyNullableText(row.type, "notification.type", "notification"),
    message: toLegacyNullableText(row.message, "notification.message", "Bildirim içeriği yok"),
    isRead: toBoolean(row.is_read, "notification.is_read"),
    createdAt: toLegacyNullableDate(row.created_at, "notification.created_at"),
  });
}

const normalizeSummaryPage = (payload, itemNormalizer, label) => {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) {
    throw new TypeError(`${label} yanıtı items dizisi içermelidir.`);
  }
  const limit = toInteger(payload.limit, `${label}.limit`);
  if (limit < 1 || limit > 100) throw new TypeError(`${label}.limit 1–100 aralığında olmalıdır.`);
  if (typeof payload.hasMore !== "boolean") throw new TypeError(`${label}.hasMore boolean olmalıdır.`);
  return Object.freeze({
    items: payload.items.map(itemNormalizer),
    limit,
    hasMore: payload.hasMore,
  });
};

export function normalizeOrderSummaryPage(payload) {
  return normalizeSummaryPage(payload, normalizeOrder, "orders");
}

export function normalizeReturnSummaryPage(payload) {
  return normalizeSummaryPage(payload, normalizeReturnSummary, "returns");
}

export function normalizeNotificationSummaryPage(payload) {
  return normalizeSummaryPage(payload, normalizeNotificationSummary, "notifications");
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
