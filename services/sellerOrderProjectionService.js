'use strict';

const { appendOrderEvent } = require('./orderService');

class SellerOrderProjectionError extends Error {
    constructor(code, details = null) {
        super(code);
        this.name = 'SellerOrderProjectionError';
        this.code = code;
        this.statusCode = 409;
        this.details = details;
    }
}

const moneyToMinor = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new SellerOrderProjectionError('SELLER_ORDER_PRICE_INVALID');
    }
    return Math.round((number + Number.EPSILON) * 100);
};

const buildSellerOrderProjection = async (client, pricedItems) => {
    if (!Array.isArray(pricedItems) || pricedItems.length === 0) return Object.freeze([]);
    const productIds = [...new Set(pricedItems.map((item) => Number(item.id)))];
    const result = await client.query(
        `SELECT product.id AS product_id,
                product.store_id AS legacy_store_id,
                seller_store.id AS seller_store_id,
                seller_store.organization_id,
                seller_store.status AS seller_store_status,
                offer.id AS offer_id,
                offer.status AS offer_status,
                variant.id AS variant_id,
                variant.status AS variant_status
         FROM products product
         LEFT JOIN seller_stores seller_store
           ON seller_store.legacy_store_id = product.store_id
          AND seller_store.closed_at IS NULL
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
    pricedItems.forEach((item, sourceItemIndex) => {
        const productId = Number(item.id);
        const rows = rowsByProduct.get(productId) || [];
        const sellerRows = rows.filter((row) => row.seller_store_id !== null && row.seller_store_id !== undefined);
        if (sellerRows.length === 0) return;
        const candidates = sellerRows.filter((row) => (
            row.seller_store_status === 'active'
            && row.offer_status === 'active'
            && row.variant_id !== null
            && row.variant_id !== undefined
        ));
        if (candidates.length !== 1) {
            throw new SellerOrderProjectionError('SELLER_ORDER_PROJECTION_UNAVAILABLE', {
                productId,
                activeCandidateCount: candidates.length
            });
        }
        const mapping = candidates[0];
        const groupKey = `${mapping.organization_id}:${mapping.seller_store_id}`;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                organizationId: Number(mapping.organization_id),
                storeId: Number(mapping.seller_store_id),
                currency: 'TRY',
                grossMinor: 0,
                items: []
            });
        }
        const group = groups.get(groupKey);
        const quantity = Number(item.quantity);
        const unitPriceMinor = moneyToMinor(item.price);
        group.grossMinor += unitPriceMinor * quantity;
        group.items.push({
            sourceItemIndex,
            offerId: Number(mapping.offer_id),
            variantId: Number(mapping.variant_id),
            productId,
            quantity,
            unitPriceMinor
        });
    });

    return Object.freeze([...groups.values()].map((group) => Object.freeze({
        ...group,
        items: Object.freeze(group.items.map((item) => Object.freeze(item)))
    })));
};

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
    SellerOrderProjectionError,
    buildSellerOrderProjection,
    materializeSellerOrderProjection,
    moneyToMinor
});
