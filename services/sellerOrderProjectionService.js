'use strict';

const { appendOrderEvent } = require('./orderService');
const {
    assertApprovedSellerPublicLegalIdentity
} = require('./sellerPublicLegalIdentityService');

const PLATFORM_STORE_SLUG = 'novastore-platform';

class SellerOrderProjectionError extends Error {
    constructor(code, details = null, publicMessage = code) {
        super(publicMessage);
        this.name = 'SellerOrderProjectionError';
        this.code = code;
        this.statusCode = 409;
        this.details = details;
        this.publicMessage = publicMessage;
    }
}

const CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED = 'CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED';

const assertSingleFulfillmentSalesParty = (projection = {}) => {
    const sellerProjection = projection?.sellerProjection;
    const platformAllocation = projection?.platformAllocation;
    const sellerAllocations = Array.isArray(sellerProjection) ? sellerProjection : [];
    const hasPlatformAllocation = platformAllocation !== null && platformAllocation !== undefined;
    const sellerStoreKeys = new Set();
    let projectionShapeValid = Array.isArray(sellerProjection);

    for (const allocation of sellerAllocations) {
        const organizationId = Number(allocation?.organizationId);
        const storeId = Number(allocation?.storeId);
        if (
            !Number.isSafeInteger(organizationId)
            || organizationId <= 0
            || !Number.isSafeInteger(storeId)
            || storeId <= 0
        ) {
            projectionShapeValid = false;
            continue;
        }
        sellerStoreKeys.add(`${organizationId}:${storeId}`);
    }

    if (
        hasPlatformAllocation
        && (
            !Number.isSafeInteger(Number(platformAllocation?.storeId))
            || Number(platformAllocation.storeId) <= 0
        )
    ) {
        projectionShapeValid = false;
    }

    const sellerStoreCount = sellerStoreKeys.size;
    const fulfillmentSalesPartyCount = (hasPlatformAllocation ? 1 : 0) + sellerStoreCount;
    const hasDuplicateSellerAllocation = sellerAllocations.length !== sellerStoreCount;
    if (
        !projectionShapeValid
        || hasDuplicateSellerAllocation
        || fulfillmentSalesPartyCount !== 1
    ) {
        throw new SellerOrderProjectionError(
            CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED,
            {
                hasPlatformAllocation,
                sellerStoreCount,
                fulfillmentSalesPartyCount,
                projectionShapeValid,
                hasDuplicateSellerAllocation
            },
            'Sepette birden fazla gönderim tarafına ait ürün bulunuyor. Bu sepet henüz tek ödemede tamamlanamaz.'
        );
    }

    return Object.freeze({
        kind: hasPlatformAllocation ? 'platform' : 'seller',
        fulfillmentSalesPartyCount,
        sellerStoreCount
    });
};

const moneyToMinor = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new SellerOrderProjectionError('SELLER_ORDER_PRICE_INVALID');
    }
    return Math.round((number + Number.EPSILON) * 100);
};

const throwProjectionUnavailable = (productId, reason, details = {}) => {
    throw new SellerOrderProjectionError('SELLER_ORDER_PROJECTION_UNAVAILABLE', {
        productId,
        reason,
        ...details
    });
};

const buildCheckoutSalesPartyProjection = async (client, pricedItems) => {
    if (!Array.isArray(pricedItems) || pricedItems.length === 0) {
        return Object.freeze({
            sellerProjection: Object.freeze([]),
            platformAllocation: null
        });
    }
    const productIds = pricedItems.map((item) => Number(item.id));
    if (
        productIds.some((productId) => !Number.isSafeInteger(productId) || productId <= 0)
        || new Set(productIds).size !== productIds.length
    ) {
        throwProjectionUnavailable(null, 'PRICED_PRODUCT_IDS_INVALID');
    }
    const result = await client.query(
        `SELECT product.id AS product_id,
                product.store_id AS product_store_id,
                legacy_store.id AS legacy_store_id,
                legacy_store.slug AS legacy_store_slug,
                legacy_store.is_active AS legacy_store_is_active,
                legacy_store.deleted_at AS legacy_store_deleted_at,
                seller_store.id AS seller_store_id,
                seller_store.organization_id,
                seller_store.display_name AS seller_store_display_name,
                seller_store.status AS seller_store_status,
                seller_store.closed_at AS seller_store_closed_at,
                seller_organization.display_name AS seller_organization_display_name,
                seller_organization.status AS seller_organization_status,
                seller_organization.closed_at AS seller_organization_closed_at,
                legal_identity.id AS seller_legal_identity_id,
                legal_identity.version AS seller_legal_identity_version,
                legal_identity.public_legal_name,
                legal_identity.public_trade_name,
                legal_identity.public_disclosure_text,
                legal_identity.content_sha256 AS seller_legal_identity_content_sha256,
                legal_identity.status AS seller_legal_identity_status,
                legal_identity.approved_at AS seller_legal_identity_approved_at,
                offer.id AS offer_id,
                offer.status AS offer_status,
                variant.id AS variant_id,
                variant.status AS variant_status
         FROM products product
         LEFT JOIN stores legacy_store
           ON legacy_store.id = product.store_id
         LEFT JOIN seller_stores seller_store
           ON seller_store.legacy_store_id = product.store_id
         LEFT JOIN seller_organizations seller_organization
           ON seller_organization.id = seller_store.organization_id
         LEFT JOIN seller_public_legal_identities legal_identity
           ON legal_identity.organization_id = seller_organization.id
          AND legal_identity.status = 'approved'
         LEFT JOIN seller_offers offer
           ON offer.organization_id = seller_store.organization_id
          AND offer.store_id = seller_store.id
          AND offer.product_id = product.id
          AND offer.archived_at IS NULL
         LEFT JOIN seller_offer_variants variant
           ON variant.organization_id = offer.organization_id
          AND variant.store_id = offer.store_id
          AND variant.offer_id = offer.id
          AND variant.status = 'active'
         WHERE product.id = ANY($1::int[])
         ORDER BY product.id, seller_store.id, offer.id, variant.id`,
        [productIds]
    );

    const rowsByProduct = new Map();
    for (const row of result.rows || []) {
        const productId = Number(row.product_id);
        if (!rowsByProduct.has(productId)) rowsByProduct.set(productId, []);
        rowsByProduct.get(productId).push(row);
    }

    const groups = new Map();
    let platform = null;
    pricedItems.forEach((item, sourceItemIndex) => {
        const productId = Number(item.id);
        const rows = rowsByProduct.get(productId) || [];
        if (rows.length === 0) throwProjectionUnavailable(productId, 'PRODUCT_NOT_RESOLVED');
        const legacyStoreIds = new Set(rows.map((row) => Number(row.legacy_store_id)));
        const activeLegacyStore = rows.every((row) => (
            Number.isSafeInteger(Number(row.legacy_store_id))
            && Number(row.legacy_store_id) > 0
            && row.legacy_store_is_active === true
            && row.legacy_store_deleted_at === null
        )) && legacyStoreIds.size === 1;
        if (!activeLegacyStore) {
            throwProjectionUnavailable(productId, 'LEGACY_STORE_UNAVAILABLE');
        }
        const legacyStoreId = Number(rows[0].legacy_store_id);
        const legacyStoreSlug = String(rows[0].legacy_store_slug || '').trim().toLowerCase();
        const sellerRows = rows.filter((row) => row.seller_store_id !== null && row.seller_store_id !== undefined);
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
            throwProjectionUnavailable(productId, 'PRODUCT_QUANTITY_INVALID');
        }
        const unitPriceMinor = moneyToMinor(item.price);
        const grossMinor = unitPriceMinor * quantity;
        if (!Number.isSafeInteger(grossMinor)) {
            throwProjectionUnavailable(productId, 'PRODUCT_GROSS_INVALID');
        }
        if (sellerRows.length === 0) {
            if (legacyStoreSlug !== PLATFORM_STORE_SLUG) {
                throwProjectionUnavailable(productId, 'SALES_PARTY_UNRESOLVED');
            }
            if (platform && platform.storeId !== legacyStoreId) {
                throwProjectionUnavailable(productId, 'PLATFORM_STORE_AMBIGUOUS');
            }
            if (!platform) {
                platform = {
                    storeId: legacyStoreId,
                    storeSlug: PLATFORM_STORE_SLUG,
                    currency: 'TRY',
                    grossMinor: 0,
                    items: []
                };
            }
            platform.grossMinor += grossMinor;
            if (!Number.isSafeInteger(platform.grossMinor)) {
                throwProjectionUnavailable(productId, 'PLATFORM_GROSS_INVALID');
            }
            platform.items.push({
                sourceItemIndex,
                productId,
                quantity,
                unitPriceMinor
            });
            return;
        }
        const candidates = sellerRows.filter((row) => (
            row.seller_store_status === 'active'
            && row.seller_store_closed_at === null
            && row.seller_organization_status === 'active'
            && row.seller_organization_closed_at === null
            && row.offer_status === 'active'
            && row.variant_id !== null
            && row.variant_id !== undefined
            && row.variant_status === 'active'
        ));
        if (candidates.length !== 1) {
            throwProjectionUnavailable(productId, 'SELLER_MAPPING_AMBIGUOUS', {
                activeCandidateCount: candidates.length
            });
        }
        const mapping = candidates[0];
        const organizationId = Number(mapping.organization_id);
        const storeId = Number(mapping.seller_store_id);
        const offerId = Number(mapping.offer_id);
        const variantId = Number(mapping.variant_id);
        if ([organizationId, storeId, offerId, variantId].some((value) => (
            !Number.isSafeInteger(value) || value <= 0
        ))) {
            throwProjectionUnavailable(productId, 'SELLER_MAPPING_INVALID');
        }
        const legalIdentity = assertApprovedSellerPublicLegalIdentity(mapping, {
            productId,
            organizationId,
            storeId
        });
        const groupKey = `${organizationId}:${storeId}`;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                organizationId,
                organizationDisplayName: String(mapping.seller_organization_display_name || '').trim(),
                storeId,
                storeDisplayName: String(mapping.seller_store_display_name || '').trim(),
                legalIdentity,
                currency: 'TRY',
                grossMinor: 0,
                items: []
            });
        }
        const group = groups.get(groupKey);
        group.grossMinor += grossMinor;
        if (!Number.isSafeInteger(group.grossMinor)) {
            throwProjectionUnavailable(productId, 'SELLER_GROSS_INVALID');
        }
        group.items.push({
            sourceItemIndex,
            offerId,
            variantId,
            productId,
            quantity,
            unitPriceMinor
        });
    });

    const sellerProjection = Object.freeze([...groups.values()].map((group) => Object.freeze({
        ...group,
        productIds: Object.freeze(group.items.map((item) => item.productId)),
        items: Object.freeze(group.items.map((item) => Object.freeze(item)))
    })));
    const platformAllocation = platform
        ? Object.freeze({
            ...platform,
            productIds: Object.freeze(platform.items.map((item) => item.productId)),
            items: Object.freeze(platform.items.map((item) => Object.freeze(item)))
        })
        : null;
    return Object.freeze({ sellerProjection, platformAllocation });
};

const buildSellerOrderProjection = async (client, pricedItems) => (
    await buildCheckoutSalesPartyProjection(client, pricedItems)
).sellerProjection;

const materializeSellerOrderProjection = async (client, canonicalOrderId, projection) => {
    if (!Array.isArray(projection) || projection.length === 0) {
        return Object.freeze({ sellerOrderIds: Object.freeze([]) });
    }
    const sellerOrderIds = [];
    for (const allocation of projection) {
        const insert = await client.query(
            `INSERT INTO seller_orders
                (organization_id, store_id, canonical_order_id, status, currency, gross_minor)
             VALUES ($1, $2, $3, 'new', $4, $5)
             ON CONFLICT (canonical_order_id, store_id) DO NOTHING
             RETURNING id`,
            [
                allocation.organizationId,
                allocation.storeId,
                canonicalOrderId,
                allocation.currency,
                allocation.grossMinor
            ]
        );
        let sellerOrderId = Number(insert.rows?.[0]?.id);
        if (!Number.isSafeInteger(sellerOrderId)) {
            const existing = await client.query(
                `SELECT id
                 FROM seller_orders
                 WHERE canonical_order_id = $1
                   AND organization_id = $2
                   AND store_id = $3`,
                [canonicalOrderId, allocation.organizationId, allocation.storeId]
            );
            sellerOrderId = Number(existing.rows?.[0]?.id);
        }
        if (!Number.isSafeInteger(sellerOrderId)) {
            throw new SellerOrderProjectionError('SELLER_ORDER_PROJECTION_WRITE_FAILED');
        }
        sellerOrderIds.push(sellerOrderId);
        for (const item of allocation.items || []) {
            await client.query(
                `INSERT INTO seller_order_items
                    (organization_id, seller_order_id, offer_id, variant_id, product_id,
                     quantity, unit_price_minor, source_item_index)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (organization_id, seller_order_id, source_item_index)
                 WHERE source_item_index IS NOT NULL
                 DO NOTHING`,
                [
                    allocation.organizationId,
                    sellerOrderId,
                    item.offerId,
                    item.variantId,
                    item.productId,
                    item.quantity,
                    item.unitPriceMinor,
                    item.sourceItemIndex
                ]
            );
        }
        await client.query(
            `INSERT INTO seller_fulfillment_packages
                (organization_id, store_id, seller_order_id)
             SELECT $1, $2, $3
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM seller_fulfillment_packages
                 WHERE organization_id = $1 AND seller_order_id = $3
             )`,
            [allocation.organizationId, allocation.storeId, sellerOrderId]
        );
    }
    await appendOrderEvent(
        client,
        canonicalOrderId,
        'SELLER_ORDER_PROJECTED',
        'Siparişin satıcı operasyon görünümü oluşturuldu.',
        { sellerOrderIds }
    );
    return Object.freeze({ sellerOrderIds: Object.freeze(sellerOrderIds) });
};

module.exports = Object.freeze({
    CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED,
    SellerOrderProjectionError,
    assertSingleFulfillmentSalesParty,
    buildCheckoutSalesPartyProjection,
    buildSellerOrderProjection,
    materializeSellerOrderProjection,
    moneyToMinor,
    PLATFORM_STORE_SLUG
});
