'use strict';

const STORE_PUBLIC_KEYS = Object.freeze([
    'slug',
    'name',
    'description',
    'logo_url',
    'banner_url',
    'status',
    'rating',
    'review_count',
    'shipping_summary',
    'return_summary'
]);
const PRODUCT_PUBLIC_KEYS = Object.freeze([
    'id',
    'slug',
    'name',
    'price',
    'old_price',
    'stock',
    'is_purchasable',
    'image_url',
    'media',
    'average_rating',
    'review_count'
]);
const MEDIA_PUBLIC_KEYS = Object.freeze([
    'id',
    'media_url',
    'media_type',
    'is_main',
    'sort_order'
]);
const CLOUDINARY_HOST = 'res.cloudinary.com';
const LOCAL_PRODUCT_MEDIA_PATTERN = /^\/uploads\/local-products\/[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;

class PublicStoreError extends Error {
    constructor(code = 'STORE_NOT_FOUND', statusCode = 404) {
        super(code);
        this.name = 'PublicStoreError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const failNotFound = (code = 'STORE_NOT_FOUND') => {
    throw new PublicStoreError(code, 404);
};

const normalizeStoreSlug = (value) => {
    const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US');
    if (
        normalized.length < 1 ||
        normalized.length > 160 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized)
    ) {
        failNotFound();
    }
    return normalized;
};

const positiveInteger = (value, code = 'RESOURCE_NOT_FOUND') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) failNotFound(code);
    return parsed;
};

const customerText = (value, maxLength) => String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/[<>]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);

const customerMediaUrl = (value, env = process.env) => {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized.length > 2048 || /[\u0000-\u001f\u007f\\]/u.test(normalized)) return null;
    if (LOCAL_PRODUCT_MEDIA_PATTERN.test(normalized)) return normalized;
    try {
        const parsed = new URL(normalized);
        if (
            parsed.protocol !== 'https:' ||
            parsed.hostname !== CLOUDINARY_HOST ||
            parsed.port ||
            parsed.username ||
            parsed.password ||
            parsed.search ||
            parsed.hash
        ) return null;
        let pathname;
        try {
            pathname = decodeURIComponent(parsed.pathname);
        } catch (_) {
            return null;
        }
        if (pathname.includes('..') || pathname.includes('\\') || /[\u0000-\u001f\u007f]/u.test(pathname)) return null;
        const match = pathname.match(/^\/([^/]+)\/image\/upload\/(.+)$/u);
        const configuredCloudName = String(env?.CLOUDINARY_CLOUD_NAME || '').trim();
        if (
            !match ||
            !match[2] ||
            match[2].endsWith('/') ||
            !/^[A-Za-z0-9_-]{1,255}$/u.test(configuredCloudName) ||
            match[1] !== configuredCloudName
        ) return null;
        return parsed.href;
    } catch (_) {
        return null;
    }
};

const nonNegativeInteger = (value) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const moneyValue = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const ratingValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(5, Math.max(0, parsed)) : 0;
};

const toPublicMedia = (row) => {
    const mediaUrl = customerMediaUrl(row?.media_url);
    if (!mediaUrl) return null;
    return Object.freeze({
        id: positiveInteger(row.id),
        media_url: mediaUrl,
        media_type: 'image',
        is_main: row.is_main === true,
        sort_order: nonNegativeInteger(row.sort_order)
    });
};

const toPublicProduct = (row, mediaRows = []) => {
    const id = positiveInteger(row.id);
    const stock = nonNegativeInteger(row.stock);
    const price = moneyValue(row.price);
    const oldPrice = row.old_price === null || row.old_price === undefined
        ? null
        : moneyValue(row.old_price, null);
    const media = mediaRows.map(toPublicMedia).filter(Boolean);
    const mainMedia = media.find((item) => item.is_main) || media[0] || null;
    return Object.freeze({
        id,
        slug: String(id),
        name: customerText(row.name, 255),
        price,
        old_price: Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null,
        stock,
        is_purchasable: stock > 0,
        image_url: customerMediaUrl(row.image_url) || mainMedia?.media_url || null,
        media: Object.freeze(media),
        average_rating: ratingValue(row.average_rating),
        review_count: nonNegativeInteger(row.review_count)
    });
};

const serializePublicStore = ({ storeRow, productRows = [], mediaRows = [] } = {}) => {
    if (!storeRow || typeof storeRow !== 'object') failNotFound();
    const mediaByProduct = new Map();
    for (const media of mediaRows) {
        const productId = positiveInteger(media.product_id);
        if (!mediaByProduct.has(productId)) mediaByProduct.set(productId, []);
        mediaByProduct.get(productId).push(media);
    }
    return Object.freeze({
        store: Object.freeze({
            slug: normalizeStoreSlug(storeRow.slug),
            name: customerText(storeRow.display_name, 160),
            description: customerText(storeRow.description, 2000),
            logo_url: null,
            banner_url: null,
            status: 'open',
            rating: null,
            review_count: 0,
            shipping_summary: customerText(storeRow.shipping_policy, 2000),
            return_summary: customerText(storeRow.return_policy, 2000)
        }),
        products: Object.freeze(productRows.map((row) => (
            toPublicProduct(row, mediaByProduct.get(Number(row.id)) || [])
        )))
    });
};

const requireQueryable = (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Public store database is required.');
    }
    return queryable;
};

const loadProducts = async (queryable, platformStoreId) => {
    const productsResult = await queryable.query(
        `SELECT product.id, product.name, product.price, product.old_price, product.stock, product.image_url,
                ROUND(COALESCE(AVG(review.rating), 0), 1) AS average_rating,
                COUNT(review.id)::INTEGER AS review_count
           FROM products product
      LEFT JOIN reviews review
             ON review.product_id = product.id
            AND review.status = 'PUBLISHED'
          WHERE product.store_id = $1
            AND product.publication_status = 'active'
            AND product.is_customer_visible = TRUE
            AND product.deleted_at IS NULL
       GROUP BY product.id
       ORDER BY CASE WHEN product.stock > 0 THEN 0 ELSE 1 END, product.created_at DESC, product.id DESC`,
        [platformStoreId]
    );
    const mediaResult = await queryable.query(
        `SELECT media.id, media.product_id, media.media_url, media.media_type, media.is_main, media.sort_order
           FROM product_media media
     INNER JOIN products product
             ON product.id = media.product_id
            AND product.store_id = $1
            AND product.publication_status = 'active'
            AND product.is_customer_visible = TRUE
            AND product.deleted_at IS NULL
          WHERE COALESCE(media.media_type, 'image') = 'image'
       ORDER BY media.product_id ASC, media.is_main DESC, media.sort_order ASC, media.id ASC`,
        [platformStoreId]
    );
    return Object.freeze({ productRows: productsResult.rows || [], mediaRows: mediaResult.rows || [] });
};

const loadProjection = async (queryable, storeRows) => {
    if (!Array.isArray(storeRows) || storeRows.length !== 1) failNotFound();
    const storeRow = storeRows[0];
    const platformStoreId = positiveInteger(storeRow.platform_store_id);
    const products = await loadProducts(queryable, platformStoreId);
    return serializePublicStore({ storeRow, ...products });
};

const loadPublicStoreBySlug = async (storeSlug, { queryable = null } = {}) => {
    const database = requireQueryable(queryable || require('../config/db'));
    const slug = normalizeStoreSlug(storeSlug);
    const storeResult = await database.query(
        `SELECT platform_store.id AS platform_store_id, platform_store.slug,
                seller_store.display_name,
                COALESCE(profile.description, '') AS description,
                COALESCE(profile.shipping_policy, '') AS shipping_policy,
                COALESCE(profile.return_policy, '') AS return_policy
           FROM stores platform_store
     INNER JOIN seller_stores seller_store
             ON seller_store.legacy_store_id = platform_store.id
            AND seller_store.status = 'active'
            AND seller_store.closed_at IS NULL
      LEFT JOIN seller_store_profiles profile
             ON profile.organization_id = seller_store.organization_id
            AND profile.store_id = seller_store.id
          WHERE LOWER(platform_store.slug) = LOWER($1)
            AND platform_store.is_active = TRUE
            AND platform_store.deleted_at IS NULL
            AND COALESCE(profile.operational_status, 'open') = 'open'
          LIMIT 2`,
        [slug]
    );
    return loadProjection(database, storeResult.rows || []);
};

const loadSellerPublicPreview = async (queryable, context, sellerStoreId) => {
    const database = requireQueryable(queryable);
    const organizationId = positiveInteger(context?.organizationId);
    const targetStoreId = positiveInteger(sellerStoreId);
    const allowedStoreIds = Array.isArray(context?.storeIds)
        ? context.storeIds.map((value) => positiveInteger(value))
        : [];
    if (!allowedStoreIds.includes(targetStoreId)) failNotFound('RESOURCE_NOT_FOUND');
    const storeResult = await database.query(
        `SELECT platform_store.id AS platform_store_id, platform_store.slug,
                seller_store.display_name,
                COALESCE(profile.description, '') AS description,
                COALESCE(profile.shipping_policy, '') AS shipping_policy,
                COALESCE(profile.return_policy, '') AS return_policy
           FROM seller_stores seller_store
     INNER JOIN stores platform_store
             ON platform_store.id = seller_store.legacy_store_id
            AND platform_store.is_active = TRUE
            AND platform_store.deleted_at IS NULL
      LEFT JOIN seller_store_profiles profile
             ON profile.organization_id = seller_store.organization_id
            AND profile.store_id = seller_store.id
          WHERE seller_store.organization_id = $1
            AND seller_store.id = $2
            AND seller_store.status = 'active'
            AND seller_store.closed_at IS NULL
            AND COALESCE(profile.operational_status, 'open') = 'open'
          LIMIT 2`,
        [organizationId, targetStoreId]
    );
    try {
        return await loadProjection(database, storeResult.rows || []);
    } catch (error) {
        if (error instanceof PublicStoreError && error.statusCode === 404) {
            failNotFound('RESOURCE_NOT_FOUND');
        }
        throw error;
    }
};

module.exports = Object.freeze({
    MEDIA_PUBLIC_KEYS,
    PRODUCT_PUBLIC_KEYS,
    STORE_PUBLIC_KEYS,
    PublicStoreError,
    customerMediaUrl,
    customerText,
    loadPublicStoreBySlug,
    loadSellerPublicPreview,
    normalizeStoreSlug,
    serializePublicStore,
    toPublicProduct
});
