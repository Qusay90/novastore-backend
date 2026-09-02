const SUMMARY_KEYS = Object.freeze([
  "id",
  "storeName",
  "operationalStatus",
  "sellerStoreId",
  "sellerStoreStatus",
  "sellerOrganizationId",
  "sellerOrganizationName",
  "sellerOrganizationStatus",
  "ownershipVerified",
  "productCount",
  "customerVisibleProductCount",
  "createdAt",
  "updatedAt",
]);
const DETAIL_KEYS = Object.freeze([...SUMMARY_KEYS, "ownerName", "catalogCategories"]);

const assertRecord = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} nesne olmalıdır.`);
  }
  return value;
};

const assertExactKeys = (value, allowedKeys, label) => {
  const record = assertRecord(value, label);
  const unexpected = Object.keys(record).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new TypeError(`${label} izin verilmeyen alan içeriyor.`);
  }
  return record;
};

const positiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${label} geçersiz.`);
  return parsed;
};

const nonNegativeInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError(`${label} geçersiz.`);
  return parsed;
};

const nullableDate = (value, label) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${label} geçersiz.`);
  return parsed;
};

const nullablePositiveInteger = (value, label) => (
  value === null ? null : positiveInteger(value, label)
);

const nullableText = (value, label) => {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} geçersiz.`);
  return value.trim();
};

const normalizeSummary = (value) => {
  const record = assertExactKeys(value, SUMMARY_KEYS, "Mağaza özeti");
  const storeName = String(record.storeName || "").trim();
  if (!storeName) throw new TypeError("Mağaza adı gerekli.");
  if (!["active", "inactive"].includes(record.operationalStatus)) {
    throw new TypeError("Operasyon durumu geçersiz.");
  }
  if (typeof record.ownershipVerified !== "boolean") {
    throw new TypeError("Mağaza sahiplik doğrulaması boolean olmalıdır.");
  }
  const sellerStoreId = nullablePositiveInteger(record.sellerStoreId, "Satıcı mağaza kimliği");
  const sellerStoreStatus = nullableText(record.sellerStoreStatus, "Satıcı mağaza durumu");
  const sellerOrganizationId = nullablePositiveInteger(record.sellerOrganizationId, "Satıcı organizasyon kimliği");
  const sellerOrganizationName = nullableText(record.sellerOrganizationName, "Satıcı organizasyon adı");
  const sellerOrganizationStatus = nullableText(record.sellerOrganizationStatus, "Satıcı organizasyon durumu");
  const entityStatuses = ["active", "suspended", "closed"];
  const sellerTupleEmpty = [
    sellerStoreId,
    sellerStoreStatus,
    sellerOrganizationId,
    sellerOrganizationName,
    sellerOrganizationStatus,
  ].every((value) => value === null);
  const sellerTupleComplete = sellerStoreId !== null
    && entityStatuses.includes(sellerStoreStatus)
    && sellerOrganizationId !== null
    && sellerOrganizationName !== null
    && entityStatuses.includes(sellerOrganizationStatus);
  if ((record.ownershipVerified && !sellerTupleComplete) || (!record.ownershipVerified && !sellerTupleEmpty)) {
    throw new TypeError("Mağaza sahiplik alanları doğrulama durumuyla uyuşmuyor.");
  }
  if (record.operationalStatus === "active" && (
    !record.ownershipVerified
    || sellerStoreStatus !== "active"
    || sellerOrganizationStatus !== "active"
  )) {
    throw new TypeError("Aktif mağaza doğrulanmış aktif satıcı bağlantısı gerektirir.");
  }
  return Object.freeze({
    id: positiveInteger(record.id, "Mağaza kimliği"),
    storeName,
    operationalStatus: record.operationalStatus,
    sellerStoreId,
    sellerStoreStatus,
    sellerOrganizationId,
    sellerOrganizationName,
    sellerOrganizationStatus,
    ownershipVerified: record.ownershipVerified,
    productCount: nonNegativeInteger(record.productCount, "Ürün sayısı"),
    customerVisibleProductCount: nonNegativeInteger(record.customerVisibleProductCount, "Görünür ürün sayısı"),
    createdAt: nullableDate(record.createdAt, "Oluşturma tarihi"),
    updatedAt: nullableDate(record.updatedAt, "Güncelleme tarihi"),
  });
};

export function normalizeAdminStoreSummaryPage(value) {
  const page = assertExactKeys(value, ["items", "limit", "hasMore"], "Mağaza özet sayfası");
  if (!Array.isArray(page.items)) throw new TypeError("Mağaza özetleri dizi olmalıdır.");
  const limit = positiveInteger(page.limit, "Özet limiti");
  if (limit > 100) throw new TypeError("Özet limiti 1–100 aralığında olmalıdır.");
  if (typeof page.hasMore !== "boolean") throw new TypeError("Mağaza hasMore boolean olmalıdır.");
  return Object.freeze({
    items: Object.freeze(page.items.map(normalizeSummary)),
    limit,
    hasMore: page.hasMore,
  });
}

export function normalizeAdminStoreDetail(value) {
  const record = assertExactKeys(value, DETAIL_KEYS, "Mağaza detayı");
  const summary = normalizeSummary(Object.fromEntries(SUMMARY_KEYS.map((key) => [key, record[key]])));
  const ownerName = record.ownerName === null ? null : String(record.ownerName || "").trim();
  if (record.ownerName !== null && !ownerName) throw new TypeError("Mağaza sahibi adı geçersiz.");
  if (!Array.isArray(record.catalogCategories)) throw new TypeError("Katalog kategorileri dizi olmalıdır.");
  const catalogCategories = record.catalogCategories.map((item) => {
    const category = assertExactKeys(item, ["id", "name"], "Katalog kategorisi");
    const name = String(category.name || "").trim();
    if (!name) throw new TypeError("Kategori adı gerekli.");
    return Object.freeze({ id: positiveInteger(category.id, "Kategori kimliği"), name });
  });
  return Object.freeze({ ...summary, ownerName, catalogCategories: Object.freeze(catalogCategories) });
}

export const storeReadContract = Object.freeze({
  detailKeys: DETAIL_KEYS,
  summaryKeys: SUMMARY_KEYS,
});
