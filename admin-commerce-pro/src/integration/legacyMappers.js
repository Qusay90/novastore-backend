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

const toPositiveInteger = (value, field) => {
  const parsed = toInteger(value, field);
  if (parsed < 1) throw new TypeError(`${field} pozitif olmalıdır.`);
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

const productPublicationStatuses = new Set([
  "draft",
  "pending_approval",
  "active",
  "inactive",
  "rejected",
  "archived",
]);

const toRequiredText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} boş olmayan bir metin olmalıdır.`);
  return value.trim();
};

const toStrictNullableText = (value, field) => {
  if (value === null) return null;
  return toRequiredText(value, field);
};

const toStrictNullablePositiveInteger = (value, field) => {
  if (value === null) return null;
  const parsed = toInteger(value, field);
  if (parsed < 1) throw new TypeError(`${field} pozitif olmalıdır.`);
  return parsed;
};

const toStrictNullableFiniteNumber = (value, field) => (
  value === null ? null : toFiniteNumber(value, field)
);

const toStrictNullableDate = (value, field) => (
  value === null ? null : toDateValue(value, field)
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

export function normalizeFirstPartyCatalogProduct(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("Birinci taraf ürün özeti nesne olmalıdır.");
  }
  const requiredFields = [
    "id", "name", "price", "old_price", "currency", "stock", "publication_status",
    "is_customer_visible", "created_at", "updated_at", "deleted_at", "revision", "primary_category_id",
    "primary_category_name", "primary_category_path", "category_count", "has_media",
  ];
  if (requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(row, field))) {
    throw new TypeError("Birinci taraf ürün özeti eksik alan içeriyor.");
  }
  const rawId = toInteger(row.id, "product.id");
  if (rawId < 1) throw new TypeError("product.id pozitif olmalıdır.");
  const publicationStatus = toRequiredText(row.publication_status, "product.publication_status");
  if (!productPublicationStatuses.has(publicationStatus)) {
    throw new TypeError("product.publication_status desteklenen bir yayın durumu olmalıdır.");
  }
  if (row.currency !== "TRY") throw new TypeError("product.currency TRY olmalıdır.");

  const primaryCategoryId = toStrictNullablePositiveInteger(row.primary_category_id, "product.primary_category_id");
  const primaryCategoryName = toStrictNullableText(row.primary_category_name, "product.primary_category_name");
  if ((primaryCategoryId === null) !== (primaryCategoryName === null)) {
    throw new TypeError("product birincil kategori kimliği ve adı birlikte bulunmalıdır.");
  }
  if (primaryCategoryId === null && row.primary_category_path !== null) {
    throw new TypeError("product birincil kategori yolu kategori bağlantısı olmadan gelemez.");
  }

  return Object.freeze({
    id: `PR-${String(rawId).padStart(6, "0")}`,
    rawId,
    name: toRequiredText(row.name, "product.name"),
    price: toFiniteNumber(row.price, "product.price"),
    oldPrice: toStrictNullableFiniteNumber(row.old_price, "product.old_price"),
    currency: "TRY",
    stock: toInteger(row.stock, "product.stock"),
    publicationStatus,
    customerVisible: toBoolean(row.is_customer_visible, "product.is_customer_visible"),
    createdAt: toStrictNullableDate(row.created_at, "product.created_at"),
    updatedAt: toStrictNullableDate(row.updated_at, "product.updated_at"),
    revision: toPositiveInteger(row.revision, "product.revision"),
    deletedAt: toStrictNullableDate(row.deleted_at, "product.deleted_at"),
    primaryCategoryId,
    primaryCategoryName,
    primaryCategoryPath: toStrictNullableText(row.primary_category_path, "product.primary_category_path"),
    categoryCount: toInteger(row.category_count, "product.category_count"),
    hasMedia: toBoolean(row.has_media, "product.has_media"),
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

export function normalizeFirstPartyCatalogPage(payload) {
  if (payload?.catalogMode !== "first_party") {
    throw new TypeError("catalog.catalogMode first_party olmalıdır.");
  }
  return normalizeSummaryPage(payload, normalizeFirstPartyCatalogProduct, "catalog");
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
