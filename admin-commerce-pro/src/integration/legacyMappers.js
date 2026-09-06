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

const assertExactRecord = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} nesne olmalıdır.`);
  }
  const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new TypeError(`${label} alan sözleşmesi geçersiz.`);
  }
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

const toStrictNullableBoundedText = (value, field, maxLength) => {
  if (value === null) return null;
  const text = toRequiredText(value, field);
  if (text.length > maxLength || /[\u0000-\u001F\u007F]/u.test(text)) {
    throw new TypeError(`${field} güvenli metin sınırını aşıyor.`);
  }
  return text;
};

const ORDER_KEYS = Object.freeze([
  "id", "total_amount", "currency", "status", "customer_name", "email", "created_at",
  "updated_at", "payment_status", "refund_status", "shipment_status", "shipment_provider",
  "tracking_no", "estimated_delivery_date", "item_count", "items", "seller_allocations",
  "payment_provider", "payment_ref", "payment_external_ref", "payment_failure_reason",
  "payment_updated_at",
]);
const ORDER_ITEM_KEYS = Object.freeze([
  "product_id", "name", "quantity", "unit_price", "line_total", "store_id",
]);
const SELLER_ALLOCATION_KEYS = Object.freeze([
  "seller_order_id", "organization_id", "organization_name", "store_id", "store_name",
  "status", "currency", "gross_amount",
]);
const SAFE_PAYMENT_FAILURE_REASONS = new Set(["PAYMENT_FAILED"]);

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
  assertExactRecord(row, ORDER_KEYS, "Sipariş özeti");
  const rawId = toInteger(row.id, "order.id");
  if (rawId < 1) throw new TypeError("order.id pozitif olmalıdır.");
  const createdAt = toLegacyNullableDate(row.created_at, "order.created_at");
  const paymentStatus = toLegacyNullableText(row.payment_status, "order.payment_status", "Bilinmiyor");
  const backendStatus = toLegacyNullableText(row.status, "order.status", "Durum Bilinmiyor");
  const pendingPayment = backendStatus === "Ödeme Bekliyor" || paymentStatus === "REQUIRES_ACTION";
  const paymentFailed = paymentStatus === "FAILED";
  const status = pendingPayment ? "Ödeme Bekliyor" : paymentFailed ? "Ödeme Başarısız" : backendStatus;
  if (!Array.isArray(row.items)) throw new TypeError("order.items dizi olmalıdır.");
  const items = row.items.map((item) => {
    assertExactRecord(item, ORDER_ITEM_KEYS, "Sipariş kalemi");
    const quantity = toPositiveInteger(item.quantity, "order.items.quantity");
    const unitPrice = toFiniteNumber(item.unit_price, "order.items.unit_price");
    const lineTotal = toFiniteNumber(item.line_total, "order.items.line_total");
    if (Math.abs((quantity * unitPrice) - lineTotal) > 0.011) {
      throw new TypeError("order.items.line_total kalem toplamıyla uyuşmalıdır.");
    }
    return Object.freeze({
      productId: toStrictNullablePositiveInteger(item.product_id, "order.items.product_id"),
      name: toRequiredText(item.name, "order.items.name"),
      quantity,
      unitPrice,
      lineTotal,
      storeId: toStrictNullablePositiveInteger(item.store_id, "order.items.store_id"),
    });
  });
  if (!Array.isArray(row.seller_allocations)) throw new TypeError("order.seller_allocations dizi olmalıdır.");
  const sellerAllocations = row.seller_allocations.map((allocation) => {
    assertExactRecord(allocation, SELLER_ALLOCATION_KEYS, "Satıcı sipariş tahsisi");
    return Object.freeze({
      sellerOrderId: toPositiveInteger(allocation.seller_order_id, "order.seller_allocations.seller_order_id"),
      organizationId: toPositiveInteger(allocation.organization_id, "order.seller_allocations.organization_id"),
      organizationName: toRequiredText(allocation.organization_name, "order.seller_allocations.organization_name"),
      storeId: toPositiveInteger(allocation.store_id, "order.seller_allocations.store_id"),
      storeName: toRequiredText(allocation.store_name, "order.seller_allocations.store_name"),
      status: toRequiredText(allocation.status, "order.seller_allocations.status"),
      currency: toCurrencyCode(allocation.currency, "order.seller_allocations.currency"),
      grossAmount: toFiniteNumber(allocation.gross_amount, "order.seller_allocations.gross_amount"),
    });
  });
  const itemCount = toInteger(row.item_count, "order.item_count");
  if (itemCount !== items.length) throw new TypeError("order.item_count kalem sayısıyla uyuşmalıdır.");
  const paymentProvider = toStrictNullableBoundedText(row.payment_provider, "order.payment_provider", 40);
  if (paymentProvider !== null && !/^[a-z][a-z0-9_-]*$/u.test(paymentProvider)) {
    throw new TypeError("order.payment_provider geçersiz.");
  }
  const paymentFailureReason = row.payment_failure_reason === null
    ? null
    : toRequiredText(row.payment_failure_reason, "order.payment_failure_reason");
  if (paymentFailureReason !== null && !SAFE_PAYMENT_FAILURE_REASONS.has(paymentFailureReason)) {
    throw new TypeError("order.payment_failure_reason izin verilen listede değil.");
  }

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
    trackingNo: toStrictNullableBoundedText(row.tracking_no, "order.tracking_no", 120),
    estimatedDeliveryAt: toLegacyNullableDate(row.estimated_delivery_date, "order.estimated_delivery_date"),
    carrierConfirmed: false,
    total: toFiniteNumber(row.total_amount, "order.total_amount"),
    currency: toCurrencyCode(row.currency, "order.currency"),
    itemCount,
    items: Object.freeze(items),
    sellerAllocations: Object.freeze(sellerAllocations),
    paymentProvider,
    paymentRef: toStrictNullableBoundedText(row.payment_ref, "order.payment_ref", 120),
    paymentExternalRef: toStrictNullableBoundedText(row.payment_external_ref, "order.payment_external_ref", 120),
    paymentFailureReason,
    paymentUpdatedAt: toStrictNullableDate(row.payment_updated_at, "order.payment_updated_at"),
    createdAt,
    updatedAt: toStrictNullableDate(row.updated_at, "order.updated_at"),
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
    revision: toPositiveInteger(row.revision, "return.revision"),
    decisionNote: row.decision_note == null ? null : toLegacyNullableText(row.decision_note, "return.decision_note", null),
    decidedAt: toLegacyNullableDate(row.decided_at, "return.decided_at"),
    currency: toCurrencyCode(row.currency, "return.currency"),
    orderStatus: toLegacyNullableText(row.order_status, "return.order_status", "Durum Bilinmiyor"),
    refundStatus: toLegacyNullableText(row.refund_status, "return.refund_status", "NONE"),
    paymentStatus: toLegacyNullableText(row.payment_status, "return.payment_status", "Bilinmiyor"),
    createdAt: toLegacyNullableDate(row.created_at, "return.created_at"),
    updatedAt: toLegacyNullableDate(row.updated_at, "return.updated_at"),
  });
}

const canonicalReturnStatuses = new Set([
  "REQUESTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
]);

export function normalizeReturnDetail(row) {
  const requiredFields = [
    "id", "order_id", "reason_code", "note", "status", "refund_amount", "revision",
    "decision_note", "decided_at", "created_at", "updated_at", "order_status",
    "payment_status", "refund_status",
  ];
  if (!row || typeof row !== "object" || Array.isArray(row)
    || requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(row, field))) {
    throw new TypeError("İade detayı alan sözleşmesi geçersiz.");
  }
  const summary = normalizeReturnSummary(row);
  if (!canonicalReturnStatuses.has(summary.status)) {
    throw new TypeError("return.status desteklenen canonical durum olmalıdır.");
  }
  const note = row.note === null
    ? null
    : toStrictNullableBoundedText(row.note, "return.note", 1000);
  return Object.freeze({ ...summary, note });
}

export function normalizeNotificationSummary(row) {
  if (!row || typeof row !== "object") throw new TypeError("Bildirim özeti nesne olmalıdır.");
  const rawId = toInteger(row.id, "notification.id");
  if (rawId < 1) throw new TypeError("notification.id pozitif olmalıdır.");
  const entityType = row.entity_type == null ? null : toLegacyNullableText(row.entity_type, "notification.entity_type", null);
  const entityId = row.entity_id == null ? null : toInteger(row.entity_id, "notification.entity_id");
  const entityKey = row.entity_key == null ? null : toLegacyNullableText(row.entity_key, "notification.entity_key", null);
  const sellerApplicationTarget = entityType === "seller_application" && entityId === null && entityKey !== null;
  const numericTarget = entityType !== null && entityType !== "seller_application" && entityId !== null && entityId > 0 && entityKey === null;
  const emptyTarget = entityType === null && entityId === null && entityKey === null;
  if (!emptyTarget && !sellerApplicationTarget && !numericTarget) {
    throw new TypeError("notification hedef kimliği geçersiz.");
  }
  const targetPage = ({
    order: "orders",
    payment: "orders",
    shipment: "orders",
    product: "catalog",
    product_question: "questions",
    return_request: "returns",
    review: "reviews",
    seller_application: "sellerApplications",
    store: "sellerApplications",
    support_thread: "support",
  })[entityType] || null;
  return Object.freeze({
    id: `NT-${String(rawId).padStart(6, "0")}`,
    rawId,
    type: toLegacyNullableText(row.type, "notification.type", "notification"),
    title: toLegacyNullableText(row.title, "notification.title", "NovaStore bildirimi"),
    message: toLegacyNullableText(row.message, "notification.message", "Bildirim içeriği yok"),
    category: toLegacyNullableText(row.category, "notification.category", "ACCOUNT"),
    priority: toLegacyNullableText(row.priority, "notification.priority", "NORMAL"),
    isRead: toBoolean(row.is_read, "notification.is_read"),
    entityType,
    entityId,
    entityKey,
    targetPage,
    readAt: toLegacyNullableDate(row.read_at, "notification.read_at"),
    createdAt: toLegacyNullableDate(row.created_at, "notification.created_at"),
  });
}

export function normalizeFirstPartyCatalogProduct(row) {
  const requiredFields = [
    "id", "name", "sku", "brand", "product_type", "price", "old_price", "currency", "stock", "publication_status",
    "is_customer_visible", "created_at", "updated_at", "deleted_at", "revision", "primary_category_id",
    "primary_category_name", "primary_category_path", "category_count", "has_media", "store_id",
    "store_name", "store_slug", "store_operational_status", "seller_organization_id",
    "seller_organization_name", "seller_organization_status", "admin_editable",
  ];
  assertExactRecord(row, requiredFields, "Pazaryeri ürün özeti");
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
  if (!["active", "inactive"].includes(row.store_operational_status)) {
    throw new TypeError("product.store_operational_status geçersiz.");
  }
  const sellerOrganizationId = toStrictNullablePositiveInteger(
    row.seller_organization_id,
    "product.seller_organization_id",
  );
  const sellerOrganizationName = toStrictNullableText(
    row.seller_organization_name,
    "product.seller_organization_name",
  );
  const sellerOrganizationStatus = toStrictNullableText(
    row.seller_organization_status,
    "product.seller_organization_status",
  );
  const sellerTupleEmpty = sellerOrganizationId === null
    && sellerOrganizationName === null
    && sellerOrganizationStatus === null;
  const sellerTupleComplete = sellerOrganizationId !== null
    && sellerOrganizationName !== null
    && ["active", "suspended", "closed"].includes(sellerOrganizationStatus);
  if (!sellerTupleEmpty && !sellerTupleComplete) {
    throw new TypeError("product satıcı organizasyonu alanları birlikte bulunmalıdır.");
  }
  const adminEditable = toBoolean(row.admin_editable, "product.admin_editable");
  if (adminEditable && !sellerTupleEmpty) {
    throw new TypeError("Satıcı ürünü birinci taraf mutation kapsamına giremez.");
  }
  const storeId = toStrictNullablePositiveInteger(row.store_id, "product.store_id");
  const storeName = toStrictNullableText(row.store_name, "product.store_name");
  const storeSlug = toStrictNullableText(row.store_slug, "product.store_slug");
  const storeTupleEmpty = storeId === null && storeName === null && storeSlug === null;
  const storeTupleComplete = storeId !== null && storeName !== null && storeSlug !== null;
  if (!storeTupleEmpty && !storeTupleComplete) {
    throw new TypeError("product legacy mağaza alanları birlikte bulunmalıdır.");
  }
  if (storeTupleEmpty && (row.store_operational_status !== "inactive" || adminEditable || !sellerTupleEmpty)) {
    throw new TypeError("Atanmamış ürün mağaza ve satıcı açısından fail-closed olmalıdır.");
  }

  return Object.freeze({
    id: `PR-${String(rawId).padStart(6, "0")}`,
    rawId,
    name: toRequiredText(row.name, "product.name"),
    price: toFiniteNumber(row.price, "product.price"),
    oldPrice: toStrictNullableFiniteNumber(row.old_price, "product.old_price"),
    currency: "TRY",
    stock: toInteger(row.stock, "product.stock"),
    sku: row.sku === undefined ? null : toStrictNullableText(row.sku, "product.sku"),
    brand: row.brand === undefined ? null : toStrictNullableText(row.brand, "product.brand"),
    productType: row.product_type === undefined
      ? null
      : toStrictNullableText(row.product_type, "product.product_type"),
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
    storeId,
    storeName,
    storeSlug,
    storeOperationalStatus: row.store_operational_status,
    sellerOrganizationId,
    sellerOrganizationName,
    sellerOrganizationStatus,
    adminEditable,
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
  const page = normalizeSummaryPage(payload, normalizeReturnSummary, "returns");
  const cursor = payload.nextCursor === undefined && payload.hasMore === false
    ? null
    : payload.nextCursor;
  if ((cursor !== null && (typeof cursor !== "string" || !cursor.trim()))
    || (page.hasMore && cursor === null)
    || (!page.hasMore && cursor !== null)) {
    throw new TypeError("returns.nextCursor sayfalama sözleşmesi geçersiz.");
  }
  return Object.freeze({ ...page, nextCursor: cursor });
}

export function normalizeNotificationSummaryPage(payload) {
  if (payload?.page && Array.isArray(payload?.items)) {
    return normalizeSummaryPage({
      items: payload.items,
      limit: payload.page.limit,
      hasMore: payload.page.hasMore,
    }, normalizeNotificationSummary, "notifications");
  }
  return normalizeSummaryPage(payload, normalizeNotificationSummary, "notifications");
}

export function normalizeFirstPartyCatalogPage(payload) {
  assertExactRecord(payload, ["catalogMode", "mutationScope", "platformStoreAuthority", "items", "limit", "hasMore"], "Katalog özeti");
  if (payload.catalogMode !== "marketplace") {
    throw new TypeError("catalog.catalogMode marketplace olmalıdır.");
  }
  if (payload.mutationScope !== "first_party") {
    throw new TypeError("catalog.mutationScope first_party olmalıdır.");
  }
  assertExactRecord(
    payload.platformStoreAuthority,
    ["storeId", "storeName", "storeSlug", "adminWritable", "reason"],
    "Platform mağazası yazma yetkisi",
  );
  const authority = payload.platformStoreAuthority;
  const storeId = toStrictNullablePositiveInteger(authority.storeId, "catalog.platformStoreAuthority.storeId");
  const storeName = toStrictNullableText(authority.storeName, "catalog.platformStoreAuthority.storeName");
  const storeSlug = toRequiredText(authority.storeSlug, "catalog.platformStoreAuthority.storeSlug");
  const adminWritable = toBoolean(authority.adminWritable, "catalog.platformStoreAuthority.adminWritable");
  if (![null, "seller_bound", "unavailable"].includes(authority.reason)) {
    throw new TypeError("catalog.platformStoreAuthority.reason geçersiz.");
  }
  if (adminWritable !== (authority.reason === null)
    || (authority.reason === "unavailable" && (storeId !== null || storeName !== null))
    || (authority.reason !== "unavailable" && (storeId === null || storeName === null))) {
    throw new TypeError("catalog.platformStoreAuthority durumu tutarsız.");
  }
  const page = normalizeSummaryPage(payload, normalizeFirstPartyCatalogProduct, "catalog");
  return Object.freeze({
    ...page,
    platformStoreAuthority: Object.freeze({
      storeId,
      storeName,
      storeSlug,
      adminWritable,
      reason: authority.reason,
    }),
  });
}

export function normalizeAdminSession(payload) {
  assertExactRecord(payload, ["user", "commerceMode", "paymentProvider", "apiVersion", "capabilities"], "Admin oturumu");
  assertExactRecord(payload.user, ["id", "role"], "Admin kullanıcısı");
  if (payload.user.role !== "admin" || !Number.isInteger(Number(payload.user.id))) {
    throw new TypeError("Sunucu geçerli bir admin oturumu döndürmedi.");
  }
  if (payload.commerceMode !== "marketplace") {
    throw new TypeError("Desteklenmeyen Commerce çalışma modu.");
  }
  const paymentProviderKeys = Object.keys(payload.paymentProvider || {});
  if (!payload.paymentProvider || paymentProviderKeys.some((key) => !["provider", "ready", "state", "testMode"].includes(key))) {
    throw new TypeError("Ödeme sağlayıcısı capability sözleşmesi geçersiz.");
  }
  const providerStates = new Set([
    "provider_not_configured", "credentials_required", "client_ip_config_required",
    "production_test_mode_forbidden", "activation_required", "ready",
  ]);
  if (![null, "paytr"].includes(payload.paymentProvider.provider)
    || typeof payload.paymentProvider.ready !== "boolean"
    || !providerStates.has(payload.paymentProvider.state)
    || (payload.paymentProvider.testMode !== undefined && typeof payload.paymentProvider.testMode !== "boolean")
    || (payload.paymentProvider.ready !== (payload.paymentProvider.state === "ready"))) {
    throw new TypeError("Ödeme sağlayıcısı capability değeri geçersiz.");
  }
  if ((payload.paymentProvider.provider === null) !== (payload.paymentProvider.state === "provider_not_configured")
    || (payload.paymentProvider.state === "ready" && typeof payload.paymentProvider.testMode !== "boolean")
    || (payload.paymentProvider.state !== "ready" && payload.paymentProvider.testMode !== undefined)) {
    throw new TypeError("Ödeme sağlayıcısı capability durumu tutarsız.");
  }
  const paymentProvider = Object.freeze({
    provider: payload.paymentProvider.provider,
    ready: payload.paymentProvider.ready,
    state: payload.paymentProvider.state,
    ...(payload.paymentProvider.testMode === undefined ? {} : { testMode: payload.paymentProvider.testMode }),
  });
  return Object.freeze({
    user: Object.freeze({ id: Number(payload.user.id), role: "admin" }),
    commerceMode: "marketplace",
    paymentProvider,
    apiVersion: String(payload.apiVersion || ""),
    capabilities: payload.capabilities,
  });
}
