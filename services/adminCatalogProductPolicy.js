const { AdminCatalogMutationError, normalizeCatalogRevision } = require('./adminCatalogMutationPolicy');

const PRODUCT_MUTABLE_FIELDS = Object.freeze([
    'name',
    'description',
    'price',
    'old_price',
    'stock',
    'sku',
    'brand',
    'product_type',
    'vat_rate',
    'vat_rate_source',
    'weight_grams',
    'desi',
    'publication_status',
    'is_customer_visible',
    'category_ids',
    'primary_category_id',
    'attributes'
]);
const PRODUCT_CREATE_FIELDS = new Set(PRODUCT_MUTABLE_FIELDS);
const PRODUCT_ARCHIVE_FIELDS = new Set(['expected_revision']);
const PRODUCT_UPDATE_ENVELOPE_FIELDS = new Set([...PRODUCT_MUTABLE_FIELDS, 'expected_revision']);
const PRODUCT_PUBLICATION_STATUSES = new Set([
    'draft',
    'pending_approval',
    'active',
    'inactive',
    'rejected'
]);
const ATTRIBUTE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/ -]{0,119}$/;
const VAT_RATE_SOURCE = 'USER_SUPPLIED_TAX_VALUE';

const productPolicyError = (message, code, statusCode = 400, details) =>
    new AdminCatalogMutationError(message, { code, statusCode, details });

const assertPlainObject = (value, code = 'ADMIN_CATALOG_PRODUCT_BODY_INVALID') => {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw productPolicyError('İstek gövdesi JSON nesnesi olmalıdır.', code);
    }
    return value;
};

const assertAllowedFields = (body, allowed) => {
    assertPlainObject(body);
    const unknownFields = Object.keys(body).filter((field) => !allowed.has(field)).sort();
    if (unknownFields.length) {
        throw productPolicyError(
            'İstek izin verilmeyen ürün alanları içeriyor.',
            'ADMIN_CATALOG_PRODUCT_FIELD_NOT_ALLOWED',
            400,
            Object.freeze({ unknown_fields: Object.freeze(unknownFields) })
        );
    }
};

const normalizeProductId = (value) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw productPolicyError(
            'Ürün kimliği pozitif güvenli tam sayı olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_ID_INVALID'
        );
    }
    return id;
};

const normalizeName = (value, { required = true } = {}) => {
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string') {
        throw productPolicyError('name metin olmalıdır.', 'ADMIN_CATALOG_PRODUCT_NAME_INVALID');
    }
    const name = value.trim();
    if (!name || name.length > 255) {
        throw productPolicyError(
            'name 1 ile 255 karakter arasında olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_NAME_INVALID'
        );
    }
    return name;
};

const normalizeDescription = (value) => {
    if (value === null) return null;
    if (typeof value !== 'string' || value.length > 20000) {
        throw productPolicyError(
            'description null veya en fazla 20000 karakterlik metin olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_DESCRIPTION_INVALID'
        );
    }
    return value.trim() || null;
};

const normalizePrice = (value, field) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw productPolicyError(
            `${field} sonlu bir JSON sayısı olmalıdır.`,
            'ADMIN_CATALOG_PRODUCT_PRICE_INVALID',
            400,
            Object.freeze({ field })
        );
    }
    const serialized = String(value);
    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(serialized) || value > 99999999.99) {
        throw productPolicyError(
            `${field} 0 ile 99999999.99 arasında ve en fazla iki ondalıklı olmalıdır.`,
            'ADMIN_CATALOG_PRODUCT_PRICE_INVALID',
            400,
            Object.freeze({ field })
        );
    }
    return value;
};

const normalizeOldPrice = (value) => value === null ? null : normalizePrice(value, 'old_price');

const normalizeStock = (value) => {
    if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
        throw productPolicyError(
            'stock 0 ile 2147483647 arasında bir JSON tam sayısı olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_STOCK_INVALID'
        );
    }
    return value;
};

const normalizeSku = (value) => {
    if (value === null) return Object.freeze({ sku: null, normalized_sku: null });
    if (typeof value !== 'string') {
        throw productPolicyError('sku null veya metin olmalıdır.', 'ADMIN_CATALOG_PRODUCT_SKU_INVALID');
    }
    const sku = value.trim();
    if (!SKU_PATTERN.test(sku)) {
        throw productPolicyError(
            'sku 1 ile 120 karakter arasında olmalı ve yalnız harf, rakam, boşluk, nokta, tire, alt çizgi veya eğik çizgi içermelidir.',
            'ADMIN_CATALOG_PRODUCT_SKU_INVALID'
        );
    }
    return Object.freeze({
        sku,
        normalized_sku: sku.replace(/ /g, '').toUpperCase()
    });
};

const normalizeNullableText = (value, field, maxLength) => {
    if (value === null) return null;
    if (typeof value !== 'string') {
        throw productPolicyError(
            `${field} null veya metin olmalıdır.`,
            'ADMIN_CATALOG_PRODUCT_COMMERCE_TEXT_INVALID',
            400,
            Object.freeze({ field })
        );
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
        throw productPolicyError(
            `${field} null veya 1 ile ${maxLength} karakter arasında metin olmalıdır.`,
            'ADMIN_CATALOG_PRODUCT_COMMERCE_TEXT_INVALID',
            400,
            Object.freeze({ field })
        );
    }
    return normalized;
};

const normalizeVatRate = (value) => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)
        || value < 0 || value > 100 || !/^\d{1,3}(?:\.\d{1,2})?$/.test(String(value))) {
        throw productPolicyError(
            'vat_rate null veya 0 ile 100 arasında, en fazla iki ondalıklı JSON sayısı olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_VAT_RATE_INVALID'
        );
    }
    return value;
};

const normalizeVatRateSource = (value) => {
    if (value === null) return null;
    if (value !== VAT_RATE_SOURCE) {
        throw productPolicyError(
            `vat_rate_source yalnız ${VAT_RATE_SOURCE} olabilir.`,
            'ADMIN_CATALOG_PRODUCT_VAT_SOURCE_INVALID'
        );
    }
    return value;
};

const normalizeVatPair = (body) => {
    const hasRate = Object.prototype.hasOwnProperty.call(body, 'vat_rate');
    const hasSource = Object.prototype.hasOwnProperty.call(body, 'vat_rate_source');
    if (!hasRate && !hasSource) return null;
    if (!hasRate || !hasSource) {
        throw productPolicyError(
            'vat_rate ve vat_rate_source birlikte gönderilmelidir.',
            'ADMIN_CATALOG_PRODUCT_VAT_PAIR_INVALID'
        );
    }
    const vatRate = normalizeVatRate(body.vat_rate);
    const vatRateSource = normalizeVatRateSource(body.vat_rate_source);
    if ((vatRate === null) !== (vatRateSource === null)) {
        throw productPolicyError(
            'vat_rate ve vat_rate_source birlikte null veya birlikte dolu olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_VAT_PAIR_INVALID'
        );
    }
    return Object.freeze({ vat_rate: vatRate, vat_rate_source: vatRateSource });
};

const normalizeWeightGrams = (value) => {
    if (value === null) return null;
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
        throw productPolicyError(
            'weight_grams null veya pozitif JSON tam sayısı olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_WEIGHT_INVALID'
        );
    }
    return value;
};

const normalizeDesi = (value) => {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)
        || value <= 0 || value > 9999999.999
        || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,3})?$/.test(String(value))) {
        throw productPolicyError(
            'desi null veya 0 ile 9999999.999 arasında, en fazla üç ondalıklı pozitif JSON sayısı olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_DESI_INVALID'
        );
    }
    return value;
};

const normalizePublicationStatus = (value) => {
    if (typeof value !== 'string' || !PRODUCT_PUBLICATION_STATUSES.has(value)) {
        throw productPolicyError(
            'publication_status desteklenen bir durum olmalıdır; archived yalnızca arşiv işlemiyle atanabilir.',
            'ADMIN_CATALOG_PRODUCT_STATUS_INVALID'
        );
    }
    return value;
};

const normalizeStrictBoolean = (value, field) => {
    if (typeof value !== 'boolean') {
        throw productPolicyError(
            `${field} JSON boolean olmalıdır.`,
            'ADMIN_CATALOG_PRODUCT_BOOLEAN_INVALID',
            400,
            Object.freeze({ field })
        );
    }
    return value;
};

const normalizeCategoryIds = (value) => {
    if (!Array.isArray(value) || value.length > 50) {
        throw productPolicyError(
            'category_ids en fazla 50 kimlik içeren bir dizi olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_CATEGORIES_INVALID'
        );
    }
    const ids = value.map((item) => {
        if (!Number.isSafeInteger(item) || item < 1) {
            throw productPolicyError(
                'category_ids yalnızca pozitif güvenli JSON tam sayıları içermelidir.',
                'ADMIN_CATALOG_PRODUCT_CATEGORIES_INVALID'
            );
        }
        return item;
    });
    if (new Set(ids).size !== ids.length) {
        throw productPolicyError(
            'category_ids tekrar eden kimlik içeremez.',
            'ADMIN_CATALOG_PRODUCT_CATEGORIES_INVALID'
        );
    }
    return Object.freeze([...ids]);
};

const normalizeCategoryPair = (body, { required = false } = {}) => {
    const hasIds = Object.prototype.hasOwnProperty.call(body, 'category_ids');
    const hasPrimary = Object.prototype.hasOwnProperty.call(body, 'primary_category_id');
    if (!hasIds && !hasPrimary && !required) return null;
    if (!hasIds || !hasPrimary) {
        throw productPolicyError(
            'category_ids ve primary_category_id birlikte gönderilmelidir.',
            'ADMIN_CATALOG_PRODUCT_CATEGORIES_INVALID'
        );
    }
    const categoryIds = normalizeCategoryIds(body.category_ids);
    if (!categoryIds.length) {
        if (body.primary_category_id !== null) {
            throw productPolicyError(
                'Boş category_ids için primary_category_id null olmalıdır.',
                'ADMIN_CATALOG_PRODUCT_CATEGORIES_INVALID'
            );
        }
        return Object.freeze({ category_ids: categoryIds, primary_category_id: null });
    }
    const primaryCategoryId = body.primary_category_id;
    if (!Number.isSafeInteger(primaryCategoryId) || primaryCategoryId < 1
        || !categoryIds.includes(primaryCategoryId)) {
        throw productPolicyError(
            'primary_category_id pozitif olmalı ve category_ids içinde bulunmalıdır.',
            'ADMIN_CATALOG_PRODUCT_CATEGORIES_INVALID'
        );
    }
    return Object.freeze({
        category_ids: categoryIds,
        primary_category_id: primaryCategoryId
    });
};

const normalizeAttributes = (value) => {
    assertPlainObject(value, 'ADMIN_CATALOG_PRODUCT_ATTRIBUTES_INVALID');
    const codes = Object.keys(value);
    if (codes.length > 80 || codes.some((code) => !ATTRIBUTE_CODE_PATTERN.test(code))) {
        throw productPolicyError(
            'attributes geçerli code anahtarları içeren en fazla 80 alanlı bir nesne olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_ATTRIBUTES_INVALID'
        );
    }
    let serialized;
    try {
        serialized = JSON.stringify(value);
    } catch (_) {
        throw productPolicyError(
            'attributes geçerli JSON olmalıdır.',
            'ADMIN_CATALOG_PRODUCT_ATTRIBUTES_INVALID'
        );
    }
    if (serialized.length > 65536) {
        throw productPolicyError(
            'attributes boyut sınırını aşıyor.',
            'ADMIN_CATALOG_PRODUCT_ATTRIBUTES_INVALID'
        );
    }
    return Object.freeze(JSON.parse(serialized));
};

const normalizeCreateProductPayload = (body = {}) => {
    assertAllowedFields(body, PRODUCT_CREATE_FIELDS);
    const categoryPair = normalizeCategoryPair(body);
    const skuPair = body.sku === undefined
        ? Object.freeze({ sku: null, normalized_sku: null })
        : normalizeSku(body.sku);
    const vatPair = normalizeVatPair(body) || Object.freeze({ vat_rate: null, vat_rate_source: null });
    const normalized = {
        name: normalizeName(body.name),
        description: body.description === undefined ? null : normalizeDescription(body.description),
        price: normalizePrice(body.price, 'price'),
        old_price: body.old_price === undefined ? null : normalizeOldPrice(body.old_price),
        stock: normalizeStock(body.stock),
        ...skuPair,
        brand: body.brand === undefined ? null : normalizeNullableText(body.brand, 'brand', 160),
        product_type: body.product_type === undefined
            ? null
            : normalizeNullableText(body.product_type, 'product_type', 160),
        ...vatPair,
        weight_grams: body.weight_grams === undefined ? null : normalizeWeightGrams(body.weight_grams),
        desi: body.desi === undefined ? null : normalizeDesi(body.desi),
        publication_status: body.publication_status === undefined
            ? 'draft'
            : normalizePublicationStatus(body.publication_status),
        is_customer_visible: body.is_customer_visible === undefined
            ? false
            : normalizeStrictBoolean(body.is_customer_visible, 'is_customer_visible'),
        category_ids: categoryPair?.category_ids || Object.freeze([]),
        primary_category_id: categoryPair?.primary_category_id ?? null,
        attributes: body.attributes === undefined ? Object.freeze({}) : normalizeAttributes(body.attributes)
    };
    return Object.freeze(normalized);
};

const normalizeUpdateProductPayload = (body = {}) => {
    assertAllowedFields(body, PRODUCT_UPDATE_ENVELOPE_FIELDS);
    const changedFields = Object.keys(body).filter((field) => field !== 'expected_revision');
    if (!changedFields.length) {
        throw productPolicyError(
            'Güncelleme en az bir değiştirilebilir ürün alanı içermelidir.',
            'ADMIN_CATALOG_PRODUCT_UPDATE_EMPTY'
        );
    }
    const categoryPair = normalizeCategoryPair(body);
    const vatPair = normalizeVatPair(body);
    const changes = {};
    if (Object.prototype.hasOwnProperty.call(body, 'name')) changes.name = normalizeName(body.name);
    if (Object.prototype.hasOwnProperty.call(body, 'description')) changes.description = normalizeDescription(body.description);
    if (Object.prototype.hasOwnProperty.call(body, 'price')) changes.price = normalizePrice(body.price, 'price');
    if (Object.prototype.hasOwnProperty.call(body, 'old_price')) changes.old_price = normalizeOldPrice(body.old_price);
    if (Object.prototype.hasOwnProperty.call(body, 'stock')) changes.stock = normalizeStock(body.stock);
    if (Object.prototype.hasOwnProperty.call(body, 'sku')) Object.assign(changes, normalizeSku(body.sku));
    if (Object.prototype.hasOwnProperty.call(body, 'brand')) {
        changes.brand = normalizeNullableText(body.brand, 'brand', 160);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'product_type')) {
        changes.product_type = normalizeNullableText(body.product_type, 'product_type', 160);
    }
    if (vatPair) Object.assign(changes, vatPair);
    if (Object.prototype.hasOwnProperty.call(body, 'weight_grams')) {
        changes.weight_grams = normalizeWeightGrams(body.weight_grams);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'desi')) changes.desi = normalizeDesi(body.desi);
    if (Object.prototype.hasOwnProperty.call(body, 'publication_status')) {
        changes.publication_status = normalizePublicationStatus(body.publication_status);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'is_customer_visible')) {
        changes.is_customer_visible = normalizeStrictBoolean(body.is_customer_visible, 'is_customer_visible');
    }
    if (categoryPair) {
        changes.category_ids = categoryPair.category_ids;
        changes.primary_category_id = categoryPair.primary_category_id;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'attributes')) {
        changes.attributes = normalizeAttributes(body.attributes);
    }
    return Object.freeze({
        expected_revision: normalizeCatalogRevision(body.expected_revision),
        changes: Object.freeze(changes),
        changed_fields: Object.freeze(changedFields.sort())
    });
};

const normalizeArchiveProductPayload = (body = {}) => {
    assertAllowedFields(body, PRODUCT_ARCHIVE_FIELDS);
    return Object.freeze({
        expected_revision: normalizeCatalogRevision(body.expected_revision)
    });
};

module.exports = {
    PRODUCT_MUTABLE_FIELDS,
    PRODUCT_PUBLICATION_STATUSES,
    normalizeProductId,
    normalizeCreateProductPayload,
    normalizeUpdateProductPayload,
    normalizeArchiveProductPayload
};
