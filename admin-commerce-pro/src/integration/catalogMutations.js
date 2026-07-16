export const CATALOG_PRODUCT_PUBLICATION_STATUSES = Object.freeze([
  "draft",
  "pending_approval",
  "active",
  "inactive",
  "rejected",
  "archived",
]);

export class CatalogMutationInputError extends TypeError {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "CatalogMutationInputError";
    this.code = "CATALOG_PRODUCT_INPUT_INVALID";
  }
}

const withCatalogInputError = (callback) => {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CatalogMutationInputError) throw error;
    if (error instanceof TypeError) throw new CatalogMutationInputError(error.message, error);
    throw error;
  }
};

const publicationStatuses = new Set(CATALOG_PRODUCT_PUBLICATION_STATUSES);
const mutablePublicationStatuses = new Set(CATALOG_PRODUCT_PUBLICATION_STATUSES.filter((status) => status !== "archived"));
const productResponseFields = new Set([
  "id",
  "name",
  "description",
  "price",
  "old_price",
  "currency",
  "stock",
  "sku",
  "brand",
  "product_type",
  "vat_rate",
  "vat_rate_source",
  "weight_grams",
  "desi",
  "publication_status",
  "is_customer_visible",
  "deleted_at",
  "created_at",
  "updated_at",
  "revision",
  "has_media",
  "category_ids",
  "primary_category_id",
  "categories",
  "attributes",
]);
const categoryResponseFields = new Set(["id", "name", "path", "is_primary"]);
const attributeResponseFields = new Set([
  "attribute_id",
  "code",
  "name",
  "type",
  "unit",
  "is_required",
  "is_filterable",
  "is_variant_relevant",
  "value",
]);
const createInputFields = new Set([
  "name",
  "description",
  "price",
  "oldPrice",
  "stock",
  "sku",
  "brand",
  "productType",
  "vatRate",
  "vatRateSource",
  "weightGrams",
  "desi",
  "publicationStatus",
  "customerVisible",
  "categoryIds",
  "primaryCategoryId",
  "attributes",
]);
const updateInputFields = new Set(createInputFields);
const attributeTypes = new Set(["text", "number", "boolean", "option", "multi_option", "range"]);

const isRecord = (value) => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const requireRecord = (value, field) => {
  if (!isRecord(value)) throw new TypeError(`${field} düz bir JSON nesnesi olmalıdır.`);
  return value;
};

const rejectUnknownFields = (value, allowed, field) => {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new TypeError(`${field} desteklenmeyen alan içeriyor: ${unknown.join(", ")}.`);
};

const requireExactFields = (value, allowed, field) => {
  rejectUnknownFields(value, allowed, field);
  const missing = [...allowed].filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) throw new TypeError(`${field} eksik alan içeriyor: ${missing.join(", ")}.`);
};

const requirePositiveInteger = (value, field) => {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} pozitif tam sayı olmalıdır.`);
  return value;
};

const requireNonNegativeInteger = (value, field) => {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new TypeError(`${field} 0–2147483647 aralığında tam sayı olmalıdır.`);
  }
  return value;
};

const requireMoney = (value, field, { nullable = false } = {}) => {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 99999999.99) {
    throw new TypeError(`${field} 0–99999999.99 aralığında sonlu bir sayı olmalıdır.`);
  }
  const scaled = value * 100;
  if (Math.abs(Math.round(scaled) - scaled) > 1e-7) throw new TypeError(`${field} en fazla iki ondalık basamak içermelidir.`);
  return value;
};

const requireSku = (value, field, { nullable = false } = {}) => {
  if (nullable && value === null) return null;
  const sku = requireText(value, field, { max: 120 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._/ -]{0,119}$/.test(sku)) {
    throw new TypeError(`${field} desteklenmeyen karakter içeriyor.`);
  }
  return sku;
};

const requireVatRate = (value, field, { nullable = false } = {}) => {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(`${field} 0–100 aralığında sonlu bir sayı olmalıdır.`);
  }
  const scaled = value * 100;
  if (Math.abs(Math.round(scaled) - scaled) > 1e-7) {
    throw new TypeError(`${field} en fazla iki ondalık basamak içermelidir.`);
  }
  return value;
};

const requireVatRateSource = (value, field, { nullable = false } = {}) => {
  if (nullable && value === null) return null;
  if (value !== "USER_SUPPLIED_TAX_VALUE") {
    throw new TypeError(`${field} yalnız USER_SUPPLIED_TAX_VALUE olabilir.`);
  }
  return value;
};

const requireNullablePositiveInteger = (value, field) => {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new TypeError(`${field} null veya pozitif tam sayı olmalıdır.`);
  }
  return value;
};

const requireDesi = (value, field, { nullable = false } = {}) => {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 9999999.999) {
    throw new TypeError(`${field} pozitif ve en fazla 9999999.999 olmalıdır.`);
  }
  const scaled = value * 1000;
  if (Math.abs(Math.round(scaled) - scaled) > 1e-7) {
    throw new TypeError(`${field} en fazla üç ondalık basamak içermelidir.`);
  }
  return value;
};

const requireBoolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} boolean olmalıdır.`);
  return value;
};

const requireText = (value, field, { min = 1, max = 5000, nullable = false } = {}) => {
  if (nullable && value === null) return null;
  if (typeof value !== "string") throw new TypeError(`${field} metin olmalıdır.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new TypeError(`${field} ${min}–${max} karakter aralığında güvenli metin olmalıdır.`);
  }
  return normalized;
};

const requireNullableDate = (value, field) => {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new TypeError(`${field} geçerli tarih metni veya null olmalıdır.`);
  return new Date(value);
};

const requirePublicationStatus = (value, field) => {
  if (typeof value !== "string" || !publicationStatuses.has(value)) {
    throw new TypeError(`${field} desteklenen bir ürün yayın durumu olmalıdır.`);
  }
  return value;
};

const requireMutablePublicationStatus = (value, field) => {
  if (typeof value !== "string" || !mutablePublicationStatuses.has(value)) {
    throw new TypeError(`${field} arşiv dışındaki desteklenen bir ürün yayın durumu olmalıdır.`);
  }
  return value;
};

const requireCategoryIds = (value, field) => {
  if (!Array.isArray(value) || value.length > 50) throw new TypeError(`${field} en fazla 50 kimlik içeren bir dizi olmalıdır.`);
  const ids = value.map((id, index) => requirePositiveInteger(id, `${field}[${index}]`));
  if (new Set(ids).size !== ids.length) throw new TypeError(`${field} yinelenen kimlik içeremez.`);
  return ids;
};

const requirePrimaryCategoryId = (value, categoryIds, field) => {
  if (value === null) return null;
  const id = requirePositiveInteger(value, field);
  if (!categoryIds.includes(id)) throw new TypeError(`${field}, categoryIds içinde bulunmalıdır.`);
  return id;
};

const normalizeOptionValue = (value, field) => {
  const option = requireRecord(value, field);
  const allowed = new Set(["id", "value", "label"]);
  requireExactFields(option, allowed, field);
  return Object.freeze({
    id: requirePositiveInteger(option.id, `${field}.id`),
    value: requireText(option.value, `${field}.value`, { max: 200 }),
    label: requireText(option.label, `${field}.label`, { max: 200 }),
  });
};

const normalizeAttributeValue = (type, value, field) => {
  if (value === null) return null;
  if (type === "text") return requireText(value, field, { max: 2000 });
  if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${field} sonlu sayı olmalıdır.`);
    return value;
  }
  if (type === "boolean") return requireBoolean(value, field);
  if (type === "option") return normalizeOptionValue(value, field);
  if (type === "multi_option") {
    if (!Array.isArray(value) || value.length > 100) throw new TypeError(`${field} option dizisi olmalıdır.`);
    const options = value.map((option, index) => normalizeOptionValue(option, `${field}[${index}]`));
    if (new Set(options.map((option) => option.id)).size !== options.length) {
      throw new TypeError(`${field} yinelenen option kimliği içeremez.`);
    }
    return Object.freeze(options);
  }
  if (type === "range") {
    const range = requireRecord(value, field);
    const allowed = new Set(["min", "max"]);
    requireExactFields(range, allowed, field);
    if (typeof range.min !== "number" || !Number.isFinite(range.min)
      || typeof range.max !== "number" || !Number.isFinite(range.max)
      || range.min > range.max) {
      throw new TypeError(`${field} sonlu ve min ≤ max olan bir aralık olmalıdır.`);
    }
    return Object.freeze({ min: range.min, max: range.max });
  }
  throw new TypeError(`${field} desteklenmeyen attribute türü içeriyor.`);
};

const normalizeCategory = (value, index) => {
  const field = `product.categories[${index}]`;
  const category = requireRecord(value, field);
  requireExactFields(category, categoryResponseFields, field);
  return Object.freeze({
    id: requirePositiveInteger(category.id, `${field}.id`),
    name: requireText(category.name, `${field}.name`, { max: 200 }),
    path: requireText(category.path, `${field}.path`, { max: 1000 }),
    isPrimary: requireBoolean(category.is_primary, `${field}.is_primary`),
  });
};

const normalizeAttribute = (value, index) => {
  const field = `product.attributes[${index}]`;
  const attribute = requireRecord(value, field);
  requireExactFields(attribute, attributeResponseFields, field);
  const type = requireText(attribute.type, `${field}.type`, { max: 40 });
  if (!attributeTypes.has(type)) throw new TypeError(`${field}.type desteklenmiyor.`);
  const unit = attribute.unit === null
    ? null
    : requireText(attribute.unit, `${field}.unit`, { max: 80 });
  return Object.freeze({
    attributeId: requirePositiveInteger(attribute.attribute_id, `${field}.attribute_id`),
    code: requireText(attribute.code, `${field}.code`, { max: 80 }),
    name: requireText(attribute.name, `${field}.name`, { max: 200 }),
    type,
    unit,
    required: requireBoolean(attribute.is_required, `${field}.is_required`),
    filterable: requireBoolean(attribute.is_filterable, `${field}.is_filterable`),
    variantRelevant: requireBoolean(attribute.is_variant_relevant, `${field}.is_variant_relevant`),
    value: normalizeAttributeValue(type, attribute.value, `${field}.value`),
  });
};

export function normalizeAdminCatalogProductDetail(payload) {
  const envelope = requireRecord(payload, "Katalog ürün yanıtı");
  const envelopeFields = new Set(["catalogMode", "product"]);
  requireExactFields(envelope, envelopeFields, "Katalog ürün yanıtı");
  if (envelope.catalogMode !== "first_party") throw new TypeError("Katalog ürün yanıtı first_party modunda olmalıdır.");
  const product = requireRecord(envelope.product, "product");
  requireExactFields(product, productResponseFields, "product");
  if (product.currency !== "TRY") throw new TypeError("product.currency TRY olmalıdır.");

  const categoryIds = requireCategoryIds(product.category_ids, "product.category_ids");
  const primaryCategoryId = requirePrimaryCategoryId(product.primary_category_id, categoryIds, "product.primary_category_id");
  if (!Array.isArray(product.categories)) throw new TypeError("product.categories dizi olmalıdır.");
  const categories = product.categories.map(normalizeCategory);
  const categoryEntryIds = categories.map((category) => category.id);
  if (new Set(categoryEntryIds).size !== categoryEntryIds.length
    || categoryIds.length !== categoryEntryIds.length
    || categoryIds.some((id) => !categoryEntryIds.includes(id))) {
    throw new TypeError("product.categories ile product.category_ids aynı benzersiz kayıtları içermelidir.");
  }
  const primaryEntries = categories.filter((category) => category.isPrimary);
  if ((primaryCategoryId === null && primaryEntries.length !== 0)
    || (primaryCategoryId !== null && (primaryEntries.length !== 1 || primaryEntries[0].id !== primaryCategoryId))) {
    throw new TypeError("product birincil kategori alanları birbiriyle tutarlı olmalıdır.");
  }

  if (!Array.isArray(product.attributes)) throw new TypeError("product.attributes dizi olmalıdır.");
  const attributes = product.attributes.map(normalizeAttribute);
  if (new Set(attributes.map((attribute) => attribute.attributeId)).size !== attributes.length
    || new Set(attributes.map((attribute) => attribute.code)).size !== attributes.length) {
    throw new TypeError("product.attributes yinelenen kimlik veya kod içeremez.");
  }

  const rawId = requirePositiveInteger(product.id, "product.id");
  const vatRate = requireVatRate(product.vat_rate, "product.vat_rate", { nullable: true });
  const vatRateSource = requireVatRateSource(
    product.vat_rate_source,
    "product.vat_rate_source",
    { nullable: true },
  );
  if ((vatRate === null) !== (vatRateSource === null)) {
    throw new TypeError("product.vat_rate ve product.vat_rate_source birlikte null veya dolu olmalıdır.");
  }
  return Object.freeze({
    id: `PR-${String(rawId).padStart(6, "0")}`,
    rawId,
    name: requireText(product.name, "product.name", { max: 255 }),
    description: requireText(product.description, "product.description", { min: 0, max: 20000 }),
    price: requireMoney(product.price, "product.price"),
    oldPrice: requireMoney(product.old_price, "product.old_price", { nullable: true }),
    currency: "TRY",
    stock: requireNonNegativeInteger(product.stock, "product.stock"),
    sku: requireSku(product.sku, "product.sku", { nullable: true }),
    brand: requireText(product.brand, "product.brand", { max: 160, nullable: true }),
    productType: requireText(product.product_type, "product.product_type", { max: 160, nullable: true }),
    vatRate,
    vatRateSource,
    weightGrams: requireNullablePositiveInteger(product.weight_grams, "product.weight_grams"),
    desi: requireDesi(product.desi, "product.desi", { nullable: true }),
    publicationStatus: requirePublicationStatus(product.publication_status, "product.publication_status"),
    customerVisible: requireBoolean(product.is_customer_visible, "product.is_customer_visible"),
    deletedAt: requireNullableDate(product.deleted_at, "product.deleted_at"),
    createdAt: requireNullableDate(product.created_at, "product.created_at"),
    updatedAt: requireNullableDate(product.updated_at, "product.updated_at"),
    revision: requirePositiveInteger(product.revision, "product.revision"),
    hasMedia: requireBoolean(product.has_media, "product.has_media"),
    categoryIds: Object.freeze(categoryIds),
    primaryCategoryId,
    categories: Object.freeze(categories),
    attributes: Object.freeze(attributes),
  });
}

export function catalogAttributesToMutationMap(attributes) {
  if (!Array.isArray(attributes)) throw new TypeError("Ürün özellikleri dizi olmalıdır.");
  return Object.freeze(Object.fromEntries(attributes.map((attribute, index) => {
    const field = `attributes[${index}]`;
    if (!attribute || typeof attribute.code !== "string" || !attributeTypes.has(attribute.type)) {
      throw new TypeError(`${field} geçerli normalleştirilmiş bir özellik olmalıdır.`);
    }
    let value = attribute.value;
    if (attribute.type === "option") value = value === null ? null : value.id;
    if (attribute.type === "multi_option") value = value === null ? null : value.map((option) => option.id);
    if (attribute.type === "range" && value !== null) value = { min: value.min, max: value.max };
    return [attribute.code, value];
  })));
}

const requireAttributeMutationMap = (value, field) => {
  const source = requireRecord(value, field);
  const entries = Object.entries(source);
  if (entries.length > 80) throw new TypeError(`${field} en fazla 80 özellik içerebilir.`);
  const normalized = {};
  for (const [code, rawValue] of entries) {
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(code)) throw new TypeError(`${field} geçersiz özellik kodu içeriyor.`);
    if (rawValue === null || typeof rawValue === "boolean") {
      normalized[code] = rawValue;
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      normalized[code] = rawValue;
    } else if (typeof rawValue === "string") {
      normalized[code] = requireText(rawValue, `${field}.${code}`, { max: 2000 });
    } else if (Array.isArray(rawValue)) {
      const ids = rawValue.map((id, index) => requirePositiveInteger(id, `${field}.${code}[${index}]`));
      if (new Set(ids).size !== ids.length) throw new TypeError(`${field}.${code} yinelenen option kimliği içeremez.`);
      normalized[code] = ids;
    } else if (isRecord(rawValue)) {
      const range = rawValue;
      requireExactFields(range, new Set(["min", "max"]), `${field}.${code}`);
      if (typeof range.min !== "number" || !Number.isFinite(range.min)
        || typeof range.max !== "number" || !Number.isFinite(range.max)
        || range.min > range.max) {
        throw new TypeError(`${field}.${code} geçerli bir min/max aralığı olmalıdır.`);
      }
      normalized[code] = { min: range.min, max: range.max };
    } else {
      throw new TypeError(`${field}.${code} desteklenmeyen JSON değeri içeriyor.`);
    }
  }
  return normalized;
};

const normalizeProductInputFields = (source, { partial }) => {
  const result = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);
  const put = (inputKey, outputKey, normalize) => {
    if (has(inputKey)) result[outputKey] = normalize(source[inputKey]);
    else if (!partial) throw new TypeError(`${inputKey} alanı zorunludur.`);
  };

  put("name", "name", (value) => requireText(value, "name", { max: 255 }));
  put("description", "description", (value) => requireText(value, "description", { min: 0, max: 20000 }));
  put("price", "price", (value) => requireMoney(value, "price"));
  put("oldPrice", "old_price", (value) => requireMoney(value, "oldPrice", { nullable: true }));
  put("stock", "stock", (value) => requireNonNegativeInteger(value, "stock"));
  if (has("sku")) result.sku = requireSku(source.sku, "sku", { nullable: true });
  if (has("brand")) result.brand = requireText(source.brand, "brand", { max: 160, nullable: true });
  if (has("productType")) {
    result.product_type = requireText(source.productType, "productType", { max: 160, nullable: true });
  }
  const hasVatRate = has("vatRate");
  const hasVatRateSource = has("vatRateSource");
  if (hasVatRate !== hasVatRateSource) {
    throw new TypeError("vatRate ve vatRateSource birlikte gönderilmelidir.");
  }
  if (hasVatRate) {
    result.vat_rate = requireVatRate(source.vatRate, "vatRate", { nullable: true });
    result.vat_rate_source = requireVatRateSource(source.vatRateSource, "vatRateSource", { nullable: true });
    if ((result.vat_rate === null) !== (result.vat_rate_source === null)) {
      throw new TypeError("vatRate ve vatRateSource birlikte null veya dolu olmalıdır.");
    }
  }
  if (has("weightGrams")) {
    result.weight_grams = requireNullablePositiveInteger(source.weightGrams, "weightGrams");
  }
  if (has("desi")) result.desi = requireDesi(source.desi, "desi", { nullable: true });
  put("publicationStatus", "publication_status", (value) => requireMutablePublicationStatus(value, "publicationStatus"));
  put("customerVisible", "is_customer_visible", (value) => requireBoolean(value, "customerVisible"));

  let categoryIds;
  if (has("categoryIds")) {
    categoryIds = requireCategoryIds(source.categoryIds, "categoryIds");
    result.category_ids = categoryIds;
  } else if (!partial) {
    throw new TypeError("categoryIds alanı zorunludur.");
  }
  if (has("primaryCategoryId")) {
    if (!categoryIds) throw new TypeError("primaryCategoryId değişikliği categoryIds ile birlikte gönderilmelidir.");
    result.primary_category_id = requirePrimaryCategoryId(source.primaryCategoryId, categoryIds, "primaryCategoryId");
  } else if (!partial) {
    throw new TypeError("primaryCategoryId alanı zorunludur.");
  }
  put("attributes", "attributes", (value) => requireAttributeMutationMap(value, "attributes"));
  return result;
};

export function buildCatalogProductDetailRequest(input) {
  return withCatalogInputError(() => {
    const source = requireRecord(input, "Ürün detay isteği");
    rejectUnknownFields(source, new Set(["productId"]), "Ürün detay isteği");
    const productId = requirePositiveInteger(source.productId, "productId");
    return Object.freeze({ path: `/api/admin/catalog/products/${productId}` });
  });
}

export function buildCreateCatalogProductMutation(input) {
  return withCatalogInputError(() => {
    const source = requireRecord(input, "Ürün oluşturma isteği");
    rejectUnknownFields(source, createInputFields, "Ürün oluşturma isteği");
    return Object.freeze({
      path: "/api/admin/catalog/products",
      method: "POST",
      body: Object.freeze(normalizeProductInputFields(source, { partial: false })),
    });
  });
}

export function buildUpdateCatalogProductMutation(input) {
  return withCatalogInputError(() => {
    const source = requireRecord(input, "Ürün güncelleme isteği");
    rejectUnknownFields(source, new Set(["productId", "expectedRevision", "changes"]), "Ürün güncelleme isteği");
    const productId = requirePositiveInteger(source.productId, "productId");
    const expectedRevision = requirePositiveInteger(source.expectedRevision, "expectedRevision");
    const changes = requireRecord(source.changes, "changes");
    rejectUnknownFields(changes, updateInputFields, "changes");
    if (Object.keys(changes).length === 0) throw new TypeError("Güncellenecek en az bir ürün alanı gerekir.");
    return Object.freeze({
      path: `/api/admin/catalog/products/${productId}`,
      method: "PATCH",
      body: Object.freeze({
        expected_revision: expectedRevision,
        ...normalizeProductInputFields(changes, { partial: true }),
      }),
    });
  });
}

export function buildArchiveCatalogProductMutation(input) {
  return withCatalogInputError(() => {
    const source = requireRecord(input, "Ürün arşivleme isteği");
    rejectUnknownFields(source, new Set(["productId", "expectedRevision"]), "Ürün arşivleme isteği");
    const productId = requirePositiveInteger(source.productId, "productId");
    const expectedRevision = requirePositiveInteger(source.expectedRevision, "expectedRevision");
    return Object.freeze({
      path: `/api/admin/catalog/products/${productId}/archive`,
      method: "PATCH",
      body: Object.freeze({ expected_revision: expectedRevision }),
    });
  });
}
