'use strict';

const crypto = require('node:crypto');
const { writeAuditAndOutbox } = require('./sellerAuditOutboxService');

class SellerOfferInventoryError extends Error {
    constructor(code, statusCode = 409) {
        super(code);
        this.name = 'SellerOfferInventoryError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const fail = (code, statusCode) => { throw new SellerOfferInventoryError(code, statusCode); };
const integer = (value, code = 'VALIDATION_FAILED', minimum = 1) => {
    const parsed = typeof value === 'string' && /^-?\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < minimum) fail(code, 400);
    return parsed;
};
const text = (value, max = 160, code = 'VALIDATION_FAILED') => {
    if (typeof value !== 'string') fail(code, 400);
    const normalized = value.trim();
    if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) fail(code, 400);
    return normalized;
};
const currency = (value) => {
    if (typeof value !== 'string' || !/^[A-Z]{3}$/u.test(value)) fail('VALIDATION_FAILED', 400);
    return value;
};
const requireContext = (context) => {
    const organizationId = integer(context?.organizationId, 'RESOURCE_NOT_FOUND');
    const membershipId = integer(context?.membershipId, 'RESOURCE_NOT_FOUND');
    const userId = integer(context?.userId, 'RESOURCE_NOT_FOUND');
    const storeIds = Array.isArray(context?.storeIds) ? context.storeIds.map((value) => integer(value, 'RESOURCE_NOT_FOUND')) : [];
    if (!storeIds.length) fail('RESOURCE_NOT_FOUND', 404);
    return Object.freeze({ organizationId, membershipId, userId, storeIds, sessionId: context.sessionId || null });
};
const activeStoreId = (context) => {
    if (context.storeIds.length !== 1) fail('STORE_SELECTION_REQUIRED', 409);
    return context.storeIds[0];
};
const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
};
const fingerprint = (value) => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
const key = (value) => text(value, 160);

const atomic = async (database, input) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Seller offer/inventory database pool is required.');
    const client = await database.connect();
    let began = false;
    try {
        await client.query('BEGIN');
        began = true;
        const mutationResult = await input.mutation(client);
        const events = await writeAuditAndOutbox(client, input);
        await client.query('COMMIT');
        return Object.freeze({ mutationResult, ...events });
    } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const receipt = async (queryable, organizationId, idempotencyKey, requestFingerprint) => {
    const result = await queryable.query('SELECT request_fingerprint, response_redacted FROM seller_mutation_receipts WHERE organization_id = $1 AND idempotency_key = $2', [organizationId, idempotencyKey]);
    const row = result.rows?.[0];
    if (!row) return null;
    if (row.request_fingerprint !== requestFingerprint) fail('IDEMPOTENCY_KEY_REUSED', 409);
    return Object.freeze(row.response_redacted);
};
const saveReceipt = (client, organizationId, idempotencyKey, requestFingerprint, aggregateType, aggregateId, response) => client.query(
    'INSERT INTO seller_mutation_receipts (organization_id, idempotency_key, request_fingerprint, aggregate_type, aggregate_id, response_redacted) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [organizationId, idempotencyKey, requestFingerprint, aggregateType, String(aggregateId), JSON.stringify(response)]
);

const safeOffer = (row) => Object.freeze({
    id: Number(row.offer_id || row.id),
    product_id: Number(row.product_id),
    store_id: Number(row.store_id),
    status: String(row.status),
    visibility: String(row.visibility),
    revision: Number(row.revision),
    variant: Object.freeze({ id: Number(row.variant_id), seller_sku: String(row.seller_sku), price_minor: Number(row.price_minor), currency: String(row.currency), revision: Number(row.variant_revision) }),
    inventory: Object.freeze({ id: Number(row.inventory_id), quantity: Number(row.quantity), low_stock_threshold: Number(row.low_stock_threshold), revision: Number(row.inventory_revision) })
});
const loadOffer = async (queryable, context, offerId, lock = '') => {
    const safeContext = requireContext(context);
    const result = await queryable.query(
        `SELECT offer.id AS offer_id, offer.product_id, offer.store_id, offer.status, offer.visibility, offer.revision,
                variant.id AS variant_id, variant.seller_sku, variant.price_minor, variant.currency, variant.revision AS variant_revision,
                inventory.id AS inventory_id, inventory.quantity, inventory.low_stock_threshold, inventory.revision AS inventory_revision
           FROM seller_offers offer
           JOIN seller_offer_variants variant ON variant.organization_id = offer.organization_id AND variant.offer_id = offer.id
           JOIN seller_inventory_items inventory ON inventory.organization_id = variant.organization_id AND inventory.variant_id = variant.id
          WHERE offer.organization_id = $1 AND offer.id = $2 AND offer.store_id = ANY($3::bigint[]) ${lock}`,
        [safeContext.organizationId, integer(offerId, 'RESOURCE_NOT_FOUND'), safeContext.storeIds]
    );
    if (!result.rows?.[0]) fail('RESOURCE_NOT_FOUND', 404);
    return safeOffer(result.rows[0]);
};

const validateCreate = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('VALIDATION_FAILED', 400);
    const allowed = new Set(['product_id', 'seller_sku', 'price_minor', 'currency', 'initial_quantity', 'idempotency_key']);
    if (Object.keys(input).some((field) => !allowed.has(field))) fail('VALIDATION_FAILED', 400);
    return Object.freeze({ productId: integer(input.product_id), sellerSku: text(input.seller_sku, 96), priceMinor: integer(input.price_minor, 'VALIDATION_FAILED', 0), currency: currency(input.currency), initialQuantity: integer(input.initial_quantity ?? 0, 'VALIDATION_FAILED', 0), idempotencyKey: key(input.idempotency_key) });
};

const createOffer = async (database, context, input) => {
    const safeContext = requireContext(context);
    const data = validateCreate(input);
    const storeId = activeStoreId(safeContext);
    const requestFingerprint = fingerprint({ storeId, ...data });
    const replay = await receipt(database, safeContext.organizationId, data.idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, offer: replay });
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.offer.created', targetType: 'seller_offer', targetId: 'pending', resultCode: 'success', metadata: { action: 'create', target_class: 'seller_offer' } },
        outbox: { storeId, aggregateType: 'seller_offer', aggregateId: `create:${data.idempotencyKey}`, eventType: 'seller.offer.created', aggregateRevision: 1, idempotencyKey: data.idempotencyKey, payload: { action: 'create', target_class: 'seller_offer' } },
        mutation: async (client) => {
            const product = await client.query('SELECT id FROM products WHERE id = $1', [data.productId]);
            if (!product.rows?.[0]) fail('RESOURCE_NOT_FOUND', 404);
            const offerInsert = await client.query(
                "INSERT INTO seller_offers (organization_id, store_id, product_id) VALUES ($1, $2, $3) RETURNING id",
                [safeContext.organizationId, storeId, data.productId]
            );
            const offerId = Number(offerInsert.rows[0].id);
            const variantInsert = await client.query(
                'INSERT INTO seller_offer_variants (organization_id, store_id, offer_id, seller_sku, price_minor, currency) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [safeContext.organizationId, storeId, offerId, data.sellerSku, data.priceMinor, data.currency]
            );
            await client.query('INSERT INTO seller_inventory_items (organization_id, store_id, variant_id, quantity) VALUES ($1, $2, $3, $4)', [safeContext.organizationId, storeId, Number(variantInsert.rows[0].id), data.initialQuantity]);
            const offer = await loadOffer(client, safeContext, offerId);
            await saveReceipt(client, safeContext.organizationId, data.idempotencyKey, requestFingerprint, 'seller_offer', offerId, offer);
            return Object.freeze({ reused: false, offer });
        }
    });
    return result.mutationResult;
};

const listOffers = async (database, context, query = {}) => {
    const safeContext = requireContext(context);
    const allowed = new Set(['limit', 'status']);
    if (!query || typeof query !== 'object' || Object.keys(query).some((field) => !allowed.has(field))) fail('VALIDATION_FAILED', 400);
    const limit = query.limit === undefined ? 50 : integer(query.limit, 'VALIDATION_FAILED');
    if (limit > 50) fail('VALIDATION_FAILED', 400);
    const status = query.status === undefined ? null : text(query.status, 24);
    if (status !== null && !['draft', 'active', 'inactive', 'archived'].includes(status)) fail('VALIDATION_FAILED', 400);
    const result = await database.query(
        `SELECT offer.id AS offer_id, offer.product_id, offer.store_id, offer.status, offer.visibility, offer.revision,
                variant.id AS variant_id, variant.seller_sku, variant.price_minor, variant.currency, variant.revision AS variant_revision,
                inventory.id AS inventory_id, inventory.quantity, inventory.low_stock_threshold, inventory.revision AS inventory_revision
           FROM seller_offers offer JOIN seller_offer_variants variant ON variant.organization_id = offer.organization_id AND variant.offer_id = offer.id
           JOIN seller_inventory_items inventory ON inventory.organization_id = variant.organization_id AND inventory.variant_id = variant.id
          WHERE offer.organization_id = $1 AND offer.store_id = ANY($2::bigint[]) AND ($3::varchar IS NULL OR offer.status = $3)
          ORDER BY offer.id ASC LIMIT $4`,
        [safeContext.organizationId, safeContext.storeIds, status, limit]
    );
    return Object.freeze((result.rows || []).map(safeOffer));
};

const updateOffer = async (database, context, offerId, input) => {
    const safeContext = requireContext(context);
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('VALIDATION_FAILED', 400);
    const allowed = new Set(['seller_sku', 'price_minor', 'visibility', 'revision', 'idempotency_key']);
    if (Object.keys(input).some((field) => !allowed.has(field))) fail('VALIDATION_FAILED', 400);
    const changes = {};
    if (Object.hasOwn(input, 'seller_sku')) changes.sellerSku = text(input.seller_sku, 96);
    if (Object.hasOwn(input, 'price_minor')) changes.priceMinor = integer(input.price_minor, 'VALIDATION_FAILED', 0);
    if (Object.hasOwn(input, 'visibility')) {
        if (!['private', 'seller_visible'].includes(input.visibility)) fail('VALIDATION_FAILED', 400);
        changes.visibility = input.visibility;
    }
    if (!Object.keys(changes).length) fail('VALIDATION_FAILED', 400);
    const revision = integer(input.revision, 'PRECONDITION_REQUIRED');
    const idempotencyKey = key(input.idempotency_key);
    const requestFingerprint = fingerprint({ offerId: integer(offerId), changes, revision });
    await loadOffer(database, safeContext, offerId);
    const replay = await receipt(database, safeContext.organizationId, idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, offer: replay });
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId: null, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.offer.updated', targetType: 'seller_offer', targetId: String(offerId), resultCode: 'success', metadata: { action: 'update', target_class: 'seller_offer' } },
        outbox: { storeId: null, aggregateType: 'seller_offer', aggregateId: String(offerId), eventType: 'seller.offer.updated', aggregateRevision: revision + 1, idempotencyKey, payload: { action: 'update', target_class: 'seller_offer' } },
        mutation: async (client) => {
            const current = await loadOffer(client, safeContext, offerId, 'FOR UPDATE');
            if (current.revision !== revision) fail('REVISION_CONFLICT', 409);
            const updated = await client.query('UPDATE seller_offers SET visibility = COALESCE($1, visibility), revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3 AND revision = $4 RETURNING id', [changes.visibility ?? null, safeContext.organizationId, Number(offerId), revision]);
            if (!updated.rows?.[0]) fail('REVISION_CONFLICT', 409);
            if (changes.sellerSku !== undefined || changes.priceMinor !== undefined) await client.query('UPDATE seller_offer_variants SET seller_sku = COALESCE($1, seller_sku), price_minor = COALESCE($2, price_minor), revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $3 AND id = $4', [changes.sellerSku ?? null, changes.priceMinor ?? null, safeContext.organizationId, current.variant.id]);
            const offer = await loadOffer(client, safeContext, offerId);
            await saveReceipt(client, safeContext.organizationId, idempotencyKey, requestFingerprint, 'seller_offer', offerId, offer);
            return Object.freeze({ reused: false, offer });
        }
    });
    return result.mutationResult;
};

const offerCommand = async (database, context, offerId, input) => {
    const safeContext = requireContext(context);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((field) => !['command', 'revision', 'idempotency_key'].includes(field))) fail('VALIDATION_FAILED', 400);
    const command = text(input.command, 24);
    const transitions = { publish: ['draft', 'active'], unpublish: ['active', 'inactive'], archive: ['draft', 'active', 'inactive'] };
    if (!transitions[command]) fail('VALIDATION_FAILED', 400);
    const revision = integer(input.revision, 'PRECONDITION_REQUIRED');
    const idempotencyKey = key(input.idempotency_key);
    const requestFingerprint = fingerprint({ offerId: integer(offerId), command, revision });
    const preflight = await loadOffer(database, safeContext, offerId);
    const replay = await receipt(database, safeContext.organizationId, idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, offer: replay });
    if (!transitions[command].includes(preflight.status)) fail('INVALID_STATE_TRANSITION', 409);
    const next = command === 'publish' ? 'active' : command === 'unpublish' ? 'inactive' : 'archived';
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId: preflight.store_id, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.offer.command_applied', targetType: 'seller_offer', targetId: String(offerId), resultCode: 'success', metadata: { action: command, target_class: 'seller_offer' } },
        outbox: { storeId: preflight.store_id, aggregateType: 'seller_offer', aggregateId: String(offerId), eventType: 'seller.offer.command_applied', aggregateRevision: revision + 1, idempotencyKey, payload: { action: command, target_class: 'seller_offer' } },
        mutation: async (client) => {
            const current = await loadOffer(client, safeContext, offerId, 'FOR UPDATE');
            if (current.revision !== revision) fail('REVISION_CONFLICT', 409);
            if (!transitions[command].includes(current.status)) fail('INVALID_STATE_TRANSITION', 409);
            await client.query("UPDATE seller_offers SET status = $1::varchar, archived_at = CASE WHEN $1::varchar = 'archived' THEN CURRENT_TIMESTAMP ELSE archived_at END, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3", [next, safeContext.organizationId, Number(offerId)]);
            const offer = await loadOffer(client, safeContext, offerId);
            await saveReceipt(client, safeContext.organizationId, idempotencyKey, requestFingerprint, 'seller_offer', offerId, offer);
            return Object.freeze({ reused: false, offer });
        }
    });
    return result.mutationResult;
};

const readInventory = async (database, context, query = {}) => {
    const safeContext = requireContext(context);
    if (!query || typeof query !== 'object' || Object.keys(query).some((field) => !['limit', 'low_stock'].includes(field))) fail('VALIDATION_FAILED', 400);
    const limit = query.limit === undefined ? 100 : integer(query.limit, 'VALIDATION_FAILED');
    if (limit > 100 || (query.low_stock !== undefined && typeof query.low_stock !== 'boolean')) fail('VALIDATION_FAILED', 400);
    const result = await database.query(
        `SELECT inventory.id, inventory.store_id, inventory.variant_id, inventory.quantity, inventory.low_stock_threshold, inventory.revision, variant.seller_sku, variant.price_minor, variant.currency
           FROM seller_inventory_items inventory JOIN seller_offer_variants variant ON variant.organization_id = inventory.organization_id AND variant.id = inventory.variant_id
          WHERE inventory.organization_id = $1 AND inventory.store_id = ANY($2::bigint[]) AND ($3::boolean = FALSE OR inventory.quantity <= inventory.low_stock_threshold)
          ORDER BY inventory.id ASC LIMIT $4`,
        [safeContext.organizationId, safeContext.storeIds, query.low_stock === true, limit]
    );
    return Object.freeze((result.rows || []).map((row) => Object.freeze({ id: Number(row.id), store_id: Number(row.store_id), variant_id: Number(row.variant_id), seller_sku: String(row.seller_sku), price_minor: Number(row.price_minor), currency: String(row.currency), quantity: Number(row.quantity), low_stock_threshold: Number(row.low_stock_threshold), revision: Number(row.revision) })));
};

const adjustInventory = async (database, context, input) => {
    const safeContext = requireContext(context);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((field) => !['items', 'idempotency_key'].includes(field))) fail('VALIDATION_FAILED', 400);
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) fail('VALIDATION_FAILED', 400);
    const items = input.items.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((field) => !['inventory_item_id', 'delta', 'reason_code', 'revision'].includes(field))) fail('VALIDATION_FAILED', 400);
        const delta = integer(item.delta, 'VALIDATION_FAILED', -2147483648);
        if (delta === 0) fail('VALIDATION_FAILED', 400);
        return Object.freeze({ inventoryItemId: integer(item.inventory_item_id), delta, reasonCode: text(item.reason_code, 64), revision: integer(item.revision, 'PRECONDITION_REQUIRED') });
    }).sort((left, right) => left.inventoryItemId - right.inventoryItemId);
    if (new Set(items.map((item) => item.inventoryItemId)).size !== items.length) fail('VALIDATION_FAILED', 400);
    const idempotencyKey = key(input.idempotency_key);
    const requestFingerprint = fingerprint({ items });
    const scopedItems = await database.query(
        'SELECT id FROM seller_inventory_items WHERE organization_id = $1 AND id = ANY($2::bigint[]) AND store_id = ANY($3::bigint[])',
        [safeContext.organizationId, items.map((item) => item.inventoryItemId), safeContext.storeIds]
    );
    if ((scopedItems.rows || []).length !== items.length) fail('RESOURCE_NOT_FOUND', 404);
    const replay = await receipt(database, safeContext.organizationId, idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, inventory: replay });
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId: null, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.inventory.adjusted', targetType: 'inventory_batch', targetId: idempotencyKey, resultCode: 'success', metadata: { action: 'adjust', target_class: 'inventory_batch' } },
        outbox: { storeId: null, aggregateType: 'inventory_batch', aggregateId: idempotencyKey, eventType: 'seller.inventory.adjusted', aggregateRevision: 1, idempotencyKey, payload: { action: 'adjust', target_class: 'inventory_batch' } },
        mutation: async (client) => {
            const changed = [];
            for (const item of items) {
                const loaded = await client.query('SELECT id, store_id, quantity, revision FROM seller_inventory_items WHERE organization_id = $1 AND id = $2 AND store_id = ANY($3::bigint[]) FOR UPDATE', [safeContext.organizationId, item.inventoryItemId, safeContext.storeIds]);
                const current = loaded.rows?.[0];
                if (!current) fail('RESOURCE_NOT_FOUND', 404);
                if (Number(current.revision) !== item.revision) fail('REVISION_CONFLICT', 409);
                const nextQuantity = Number(current.quantity) + item.delta;
                if (nextQuantity < 0) fail('NEGATIVE_STOCK_FORBIDDEN', 409);
                const updated = await client.query('UPDATE seller_inventory_items SET quantity = $1, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3 AND revision = $4 RETURNING revision', [nextQuantity, safeContext.organizationId, item.inventoryItemId, item.revision]);
                if (!updated.rows?.[0]) fail('REVISION_CONFLICT', 409);
                await client.query('INSERT INTO seller_inventory_movements (organization_id, store_id, inventory_item_id, delta, quantity_before, quantity_after, reason_code) VALUES ($1, $2, $3, $4, $5, $6, $7)', [safeContext.organizationId, Number(current.store_id), item.inventoryItemId, item.delta, Number(current.quantity), nextQuantity, item.reasonCode]);
                changed.push(Object.freeze({ id: item.inventoryItemId, quantity: nextQuantity, revision: Number(updated.rows[0].revision) }));
            }
            await saveReceipt(client, safeContext.organizationId, idempotencyKey, requestFingerprint, 'inventory_batch', idempotencyKey, { items: changed });
            return Object.freeze({ reused: false, inventory: Object.freeze(changed) });
        }
    });
    return result.mutationResult;
};

const updateThreshold = async (database, context, inventoryItemId, input) => {
    const safeContext = requireContext(context);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((field) => !['threshold', 'revision', 'idempotency_key'].includes(field))) fail('VALIDATION_FAILED', 400);
    const threshold = integer(input.threshold, 'VALIDATION_FAILED', 0);
    const revision = integer(input.revision, 'PRECONDITION_REQUIRED');
    const idempotencyKey = key(input.idempotency_key);
    const requestFingerprint = fingerprint({ inventoryItemId: integer(inventoryItemId), threshold, revision });
    const scopedItem = await database.query(
        'SELECT id FROM seller_inventory_items WHERE organization_id = $1 AND id = $2 AND store_id = ANY($3::bigint[])',
        [safeContext.organizationId, integer(inventoryItemId), safeContext.storeIds]
    );
    if (!scopedItem.rows?.[0]) fail('RESOURCE_NOT_FOUND', 404);
    const replay = await receipt(database, safeContext.organizationId, idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, inventory: replay });
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId: null, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.inventory.threshold_changed', targetType: 'inventory_item', targetId: String(inventoryItemId), resultCode: 'success', metadata: { action: 'threshold', target_class: 'inventory_item' } },
        outbox: { storeId: null, aggregateType: 'inventory_item', aggregateId: String(inventoryItemId), eventType: 'seller.inventory.threshold_changed', aggregateRevision: revision + 1, idempotencyKey, payload: { action: 'threshold', target_class: 'inventory_item' } },
        mutation: async (client) => {
            const loaded = await client.query('SELECT id, quantity, revision, store_id FROM seller_inventory_items WHERE organization_id = $1 AND id = $2 AND store_id = ANY($3::bigint[]) FOR UPDATE', [safeContext.organizationId, integer(inventoryItemId), safeContext.storeIds]);
            if (!loaded.rows?.[0]) fail('RESOURCE_NOT_FOUND', 404);
            if (Number(loaded.rows[0].revision) !== revision) fail('REVISION_CONFLICT', 409);
            const updated = await client.query('UPDATE seller_inventory_items SET low_stock_threshold = $1, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3 AND revision = $4 RETURNING id, quantity, low_stock_threshold, revision', [threshold, safeContext.organizationId, integer(inventoryItemId), revision]);
            if (!updated.rows?.[0]) fail('REVISION_CONFLICT', 409);
            const inventory = Object.freeze({ id: Number(updated.rows[0].id), quantity: Number(updated.rows[0].quantity), low_stock_threshold: Number(updated.rows[0].low_stock_threshold), revision: Number(updated.rows[0].revision) });
            await saveReceipt(client, safeContext.organizationId, idempotencyKey, requestFingerprint, 'inventory_item', inventoryItemId, inventory);
            return Object.freeze({ reused: false, inventory });
        }
    });
    return result.mutationResult;
};

module.exports = Object.freeze({
    SellerOfferInventoryError,
    createOffer,
    listOffers,
    loadOffer,
    updateOffer,
    offerCommand,
    readInventory,
    adjustInventory,
    updateThreshold
});
