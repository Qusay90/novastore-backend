'use strict';

const { syncCategoryStatsForProducts } = require('./categoryStatsService');
const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { code, statusCode }); };

// A Seller store ID is not a public products.store_id. Resolve the accepted
// binding on the server and lock the actual purchasable row before any write.
const loadProduct = async (db, context, productId, storeId, lock = false) => {
    const result = await db.query(`SELECT product.id, product.price, product.stock, product.revision
        FROM products product
        JOIN seller_stores seller_store ON seller_store.legacy_store_id = product.store_id
        JOIN stores public_store ON public_store.id = product.store_id
        WHERE product.id = $1 AND seller_store.organization_id = $2
          AND seller_store.id = $3 AND seller_store.id = ANY($4::bigint[])
          AND seller_store.status = 'active' AND seller_store.closed_at IS NULL
          AND public_store.is_active = TRUE AND public_store.deleted_at IS NULL
          AND product.deleted_at IS NULL ${lock ? 'FOR UPDATE OF product' : ''}`,
    [productId, context.organizationId, storeId, context.storeIds]);
    if (!result.rows[0]) fail('RESOURCE_NOT_FOUND', 404);
    return result.rows[0];
};

const projectOffer = async (db, context, offer, lock = false) => {
    const product = await loadProduct(db, context, offer.product_id, offer.store_id, lock);
    const variants = await db.query('SELECT id FROM seller_offer_variants WHERE organization_id = $1 AND offer_id = $2', [context.organizationId, offer.id]);
    if (variants.rows.length !== 1) fail('PURCHASABLE_VARIANT_WAVE_REQUIRED');
    return Object.freeze({ ...offer, commerce_revision: Number(product.revision),
        variant: Object.freeze({ ...offer.variant, price_minor: Math.round(Number(product.price) * 100), currency: 'TRY' }),
        inventory: Object.freeze({ ...offer.inventory, quantity: Number(product.stock), commerce_revision: Number(product.revision) }) });
};

const productForInventory = async (db, context, inventoryId, lock = false) => {
    const result = await db.query(`SELECT offer.product_id, offer.store_id, offer.id
        FROM seller_inventory_items inventory
        JOIN seller_offer_variants variant ON variant.organization_id = inventory.organization_id AND variant.id = inventory.variant_id
        JOIN seller_offers offer ON offer.organization_id = variant.organization_id AND offer.id = variant.offer_id
        WHERE inventory.organization_id = $1 AND inventory.id = $2
          AND inventory.store_id = offer.store_id AND variant.store_id = offer.store_id
          AND offer.store_id = ANY($3::bigint[])`, [context.organizationId, inventoryId, context.storeIds]);
    if (!result.rows[0]) fail('RESOURCE_NOT_FOUND', 404);
    const offer = result.rows[0];
    const projected = await projectOffer(db, context, { id: Number(offer.id), product_id: Number(offer.product_id), store_id: Number(offer.store_id), variant: {}, inventory: {} }, lock);
    return { id: Number(offer.product_id), stock: projected.inventory.quantity, revision: projected.commerce_revision, price: projected.variant.price_minor / 100 };
};

const writeProduct = async (db, product, expectedRevision, { priceMinor, quantity } = {}) => {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) fail('COMMERCE_PRECONDITION_REQUIRED', 400);
    if (Number(product.revision) !== expectedRevision) fail('COMMERCE_REVISION_CONFLICT');
    if (priceMinor !== undefined && (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || priceMinor > 9999999999)) fail('VALIDATION_FAILED', 400);
    if (quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647)) fail('NEGATIVE_OR_INVALID_STOCK_FORBIDDEN');
    const result = await db.query(`UPDATE products SET price = COALESCE($1, price), stock = COALESCE($2, stock),
        revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND revision = $4
        RETURNING id, price, stock, revision`, [priceMinor === undefined ? null : priceMinor / 100, quantity ?? null, product.id, expectedRevision]);
    if (!result.rows[0]) fail('COMMERCE_REVISION_CONFLICT');
    await syncCategoryStatsForProducts(db, [product.id]);
    return result.rows[0];
};

module.exports = { loadProduct, projectOffer, productForInventory, writeProduct };
