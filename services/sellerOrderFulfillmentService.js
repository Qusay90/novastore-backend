'use strict';

const crypto = require('node:crypto');
const { writeAuditAndOutbox } = require('./sellerAuditOutboxService');
const { appendOrderEvent } = require('./orderService');
const { enqueueNotificationEvent } = require('./notificationOutboxService');
const { ORDER_STATUS, PAYMENT_STATUS, SHIPMENT_STATUS } = require('../constants/orderStatus');

class SellerOrderFulfillmentError extends Error {
    constructor(code, statusCode = 409) {
        super(code);
        this.name = 'SellerOrderFulfillmentError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const fail = (code, statusCode) => { throw new SellerOrderFulfillmentError(code, statusCode); };
const integer = (value, code = 'VALIDATION_FAILED', minimum = 1) => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < minimum) fail(code, 400);
    return parsed;
};
const text = (value, max = 160) => {
    if (typeof value !== 'string') fail('VALIDATION_FAILED', 400);
    const normalized = value.trim();
    if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) fail('VALIDATION_FAILED', 400);
    return normalized;
};
const context = (value) => {
    const storeIds = Array.isArray(value?.storeIds) ? value.storeIds.map((id) => integer(id, 'RESOURCE_NOT_FOUND')) : [];
    if (!storeIds.length) fail('RESOURCE_NOT_FOUND', 404);
    return Object.freeze({ organizationId: integer(value?.organizationId, 'RESOURCE_NOT_FOUND'), membershipId: integer(value?.membershipId, 'RESOURCE_NOT_FOUND'), userId: integer(value?.userId, 'RESOURCE_NOT_FOUND'), storeIds, sessionId: value.sessionId || null });
};
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const fingerprint = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex');

const receipt = async (queryable, organizationId, idempotencyKey, requestFingerprint) => {
    const found = await queryable.query('SELECT request_fingerprint, response_redacted FROM seller_mutation_receipts WHERE organization_id = $1 AND idempotency_key = $2', [organizationId, idempotencyKey]);
    const row = found.rows?.[0];
    if (!row) return null;
    if (row.request_fingerprint !== requestFingerprint) fail('IDEMPOTENCY_KEY_REUSED', 409);
    return Object.freeze(row.response_redacted);
};
const saveReceipt = (client, organizationId, idempotencyKey, requestFingerprint, aggregateId, value) => client.query('INSERT INTO seller_mutation_receipts (organization_id, idempotency_key, request_fingerprint, aggregate_type, aggregate_id, response_redacted) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [organizationId, idempotencyKey, requestFingerprint, 'seller_order', String(aggregateId), JSON.stringify(value)]);
const atomic = async (database, input) => {
    const client = await database.connect();
    let began = false;
    try {
        await client.query('BEGIN'); began = true;
        const mutationResult = await input.mutation(client);
        await writeAuditAndOutbox(client, input);
        await client.query('COMMIT');
        return mutationResult;
    } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
};

const safeOrder = (row) => Object.freeze({
    id: Number(row.id), canonical_order_id: Number(row.canonical_order_id), store_id: Number(row.store_id), status: String(row.status), currency: String(row.currency), gross_minor: Number(row.gross_minor), revision: Number(row.revision),
    items: Object.freeze((row.items || []).map((item) => Object.freeze({ id: Number(item.id), product_id: Number(item.product_id), quantity: Number(item.quantity), unit_price_minor: Number(item.unit_price_minor) }))),
    packages: Object.freeze((row.packages || []).map((item) => Object.freeze({ id: Number(item.id), status: String(item.status), carrier_name: item.carrier_name || null, tracking_number: item.tracking_number || null, revision: Number(item.revision) })))
});
const loadOrder = async (queryable, rawContext, orderId, lock = '') => {
    const safeContext = context(rawContext);
    const result = await queryable.query(`SELECT id, canonical_order_id, store_id, status, currency, gross_minor, revision FROM seller_orders WHERE organization_id = $1 AND id = $2 AND store_id = ANY($3::bigint[]) ${lock}`, [safeContext.organizationId, integer(orderId, 'RESOURCE_NOT_FOUND'), safeContext.storeIds]);
    const row = result.rows?.[0];
    if (!row) fail('RESOURCE_NOT_FOUND', 404);
    const [items, packages] = await Promise.all([
        queryable.query('SELECT id, product_id, quantity, unit_price_minor FROM seller_order_items WHERE organization_id = $1 AND seller_order_id = $2 ORDER BY id', [safeContext.organizationId, Number(row.id)]),
        queryable.query('SELECT id, status, carrier_name, tracking_number, revision FROM seller_fulfillment_packages WHERE organization_id = $1 AND seller_order_id = $2 ORDER BY id', [safeContext.organizationId, Number(row.id)])
    ]);
    return safeOrder({ ...row, items: items.rows || [], packages: packages.rows || [] });
};

const propagateSingleSellerShipment = async (client, sellerOrder, carrierName, trackingNumber) => {
    const allocationCount = await client.query(
        'SELECT COUNT(*)::int AS count FROM seller_orders WHERE canonical_order_id = $1',
        [sellerOrder.canonical_order_id]
    );
    if (Number(allocationCount.rows?.[0]?.count) !== 1) {
        return Object.freeze({ propagated: false, reason: 'MULTI_SELLER_REQUIRES_CONVERGENCE' });
    }

    const canonicalResult = await client.query(
        `SELECT id, user_id, status, payment_status, shipment_status, shipment_provider, tracking_no
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [sellerOrder.canonical_order_id]
    );
    const canonicalOrder = canonicalResult.rows?.[0];
    if (!canonicalOrder) fail('CANONICAL_ORDER_NOT_FOUND', 409);
    if (canonicalOrder.payment_status !== PAYMENT_STATUS.PAID) fail('CANONICAL_ORDER_NOT_PAID', 409);
    if (![ORDER_STATUS.HAZIRLANIYOR, ORDER_STATUS.KARGOYA_VERILDI].includes(canonicalOrder.status)) {
        fail('CANONICAL_ORDER_STATE_CONFLICT', 409);
    }

    const shipmentResult = await client.query(
        'SELECT id, provider, tracking_no FROM shipments WHERE order_id = $1 FOR UPDATE',
        [sellerOrder.canonical_order_id]
    );
    const existing = shipmentResult.rows?.[0];
    if (existing && (existing.provider !== carrierName || existing.tracking_no !== trackingNumber)) {
        fail('CANONICAL_SHIPMENT_CONFLICT', 409);
    }
    if (!existing) {
        await client.query(
            `INSERT INTO shipments
                (order_id, provider, tracking_no, tracking_url, shipment_status, raw_payload)
             VALUES ($1, $2, $3, NULL, $4, $5::jsonb)`,
            [
                sellerOrder.canonical_order_id,
                carrierName,
                trackingNumber,
                SHIPMENT_STATUS.IN_TRANSIT,
                JSON.stringify({ source: 'seller_order_command', carrierApiExecuted: false })
            ]
        );
    }

    await client.query(
        `UPDATE orders
         SET status = $1,
             shipment_status = $2,
             shipment_provider = $3,
             tracking_no = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [
            ORDER_STATUS.KARGOYA_VERILDI,
            SHIPMENT_STATUS.IN_TRANSIT,
            carrierName,
            trackingNumber,
            sellerOrder.canonical_order_id
        ]
    );
    await appendOrderEvent(
        client,
        sellerOrder.canonical_order_id,
        'SELLER_SHIPMENT_RECORDED',
        'Satıcı kargo devri müşteri siparişine yansıtıldı.',
        {
            sellerOrderId: sellerOrder.id,
            carrierApiExecuted: false,
            trackingLast4: trackingNumber.slice(-4)
        }
    );
    await enqueueNotificationEvent(client, {
        eventType: 'SHIPMENT_CREATED',
        aggregateType: 'order',
        aggregateId: sellerOrder.canonical_order_id,
        aggregateRevision: Number(sellerOrder.revision) + 1,
        sourceEventKey: `seller-shipment-recorded:order:${sellerOrder.canonical_order_id}:r${Number(sellerOrder.revision) + 1}`,
        payload: {
            reasonCode: 'SELLER_SHIPMENT_RECORDED',
            carrierApiExecuted: false
        }
    });
    return Object.freeze({ propagated: true, canonicalOrderId: sellerOrder.canonical_order_id });
};

const listOrders = async (database, rawContext, query = {}) => {
    const safeContext = context(rawContext);
    if (!query || typeof query !== 'object' || Object.keys(query).some((key) => !['limit', 'status'].includes(key))) fail('VALIDATION_FAILED', 400);
    const limit = query.limit === undefined ? 50 : integer(query.limit);
    if (limit > 50) fail('VALIDATION_FAILED', 400);
    const status = query.status === undefined ? null : text(query.status, 32);
    const result = await database.query('SELECT id FROM seller_orders WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) AND ($3::varchar IS NULL OR status = $3) ORDER BY id LIMIT $4', [safeContext.organizationId, safeContext.storeIds, status, limit]);
    return Object.freeze(await Promise.all((result.rows || []).map((row) => loadOrder(database, safeContext, row.id))));
};
const readOrder = (database, rawContext, orderId) => loadOrder(database, rawContext, orderId);

const orderCommand = async (database, rawContext, orderId, input) => {
    const safeContext = context(rawContext);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['command', 'package_id', 'carrier_name', 'tracking_number', 'revision', 'idempotency_key'].includes(key))) fail('VALIDATION_FAILED', 400);
    const command = text(input.command, 48);
    if (!['prepare', 'ship', 'cancel_request'].includes(command)) fail('VALIDATION_FAILED', 400);
    const revision = integer(input.revision, 'PRECONDITION_REQUIRED');
    const idempotencyKey = text(input.idempotency_key, 160);
    const packageId = input.package_id === undefined ? null : integer(input.package_id);
    if ((command === 'prepare' || command === 'ship') && packageId === null) fail('VALIDATION_FAILED', 400);
    if (command === 'ship' && (!input.carrier_name || !input.tracking_number)) fail('VALIDATION_FAILED', 400);
    if (command !== 'ship' && (input.carrier_name !== undefined || input.tracking_number !== undefined)) fail('VALIDATION_FAILED', 400);
    const carrierName = command === 'ship' ? text(input.carrier_name, 80) : null;
    const trackingNumber = command === 'ship' ? text(input.tracking_number, 120) : null;
    if (trackingNumber && /:\/\//u.test(trackingNumber)) fail('VALIDATION_FAILED', 400);
    const requestFingerprint = fingerprint({ orderId: integer(orderId), command, packageId, carrierName, trackingNumber, revision });
    const preflight = await loadOrder(database, safeContext, orderId);
    const replay = await receipt(database, safeContext.organizationId, idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, order: replay });
    const nextOrderStatus = command === 'prepare' ? 'preparing' : command === 'ship' ? 'shipped' : 'cancellation_requested';
    const permitted = command === 'prepare' ? ['new'] : command === 'ship' ? ['preparing'] : ['new', 'preparing'];
    if (!permitted.includes(preflight.status)) fail('INVALID_STATE_TRANSITION', 409);
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId: preflight.store_id, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.order.command_applied', targetType: 'seller_order', targetId: String(orderId), resultCode: 'success', metadata: { action: command, target_class: 'seller_order' } },
        outbox: { storeId: preflight.store_id, aggregateType: 'seller_order', aggregateId: String(orderId), eventType: 'seller.order.command_applied', aggregateRevision: revision + 1, idempotencyKey, payload: { action: command, target_class: 'seller_order' } },
        mutation: async (client) => {
            const current = await loadOrder(client, safeContext, orderId, 'FOR UPDATE');
            if (current.revision !== revision) fail('REVISION_CONFLICT', 409);
            if (!permitted.includes(current.status)) fail('INVALID_STATE_TRANSITION', 409);
            let fromStatus = current.status;
            let packageStatus = null;
            if (packageId !== null) {
                const pkg = current.packages.find((entry) => entry.id === packageId);
                if (!pkg) fail('RESOURCE_NOT_FOUND', 404);
                if (command === 'prepare' && pkg.status !== 'pending') fail('INVALID_STATE_TRANSITION', 409);
                if (command === 'ship' && pkg.status !== 'prepared') fail('INVALID_STATE_TRANSITION', 409);
                packageStatus = command === 'prepare' ? 'prepared' : 'shipped';
                await client.query('UPDATE seller_fulfillment_packages SET status = $1, carrier_name = COALESCE($2, carrier_name), tracking_number = COALESCE($3, tracking_number), revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $4 AND id = $5', [packageStatus, carrierName, trackingNumber, safeContext.organizationId, packageId]);
            }
            const updated = await client.query('UPDATE seller_orders SET status = $1, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3 AND revision = $4 RETURNING revision', [nextOrderStatus, safeContext.organizationId, integer(orderId), revision]);
            if (!updated.rows?.[0]) fail('REVISION_CONFLICT', 409);
            await client.query('INSERT INTO seller_order_transitions (organization_id, store_id, seller_order_id, package_id, from_status, to_status, command) VALUES ($1, $2, $3, $4, $5, $6, $7)', [safeContext.organizationId, current.store_id, integer(orderId), packageId, fromStatus, nextOrderStatus, command]);
            if (command === 'ship') {
                await propagateSingleSellerShipment(client, current, carrierName, trackingNumber);
            }
            const order = await loadOrder(client, safeContext, orderId);
            await saveReceipt(client, safeContext.organizationId, idempotencyKey, requestFingerprint, orderId, order);
            return Object.freeze({ reused: false, order });
        }
    });
    return result;
};

const listReturns = async (database, rawContext, query = {}) => {
    const safeContext = context(rawContext);
    if (!query || typeof query !== 'object' || Object.keys(query).some((key) => !['limit', 'status'].includes(key))) fail('VALIDATION_FAILED', 400);
    const limit = query.limit === undefined ? 50 : integer(query.limit);
    if (limit > 50) fail('VALIDATION_FAILED', 400);
    const status = query.status === undefined ? null : text(query.status, 32);
    const result = await database.query('SELECT id, seller_order_id, status, revision, created_at FROM seller_returns WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) AND ($3::varchar IS NULL OR status = $3) ORDER BY id LIMIT $4', [safeContext.organizationId, safeContext.storeIds, status, limit]);
    return Object.freeze((result.rows || []).map((row) => Object.freeze({ id: Number(row.id), seller_order_id: Number(row.seller_order_id), status: String(row.status), revision: Number(row.revision), created_at: row.created_at })));
};

module.exports = Object.freeze({ SellerOrderFulfillmentError, listOrders, readOrder, orderCommand, listReturns, loadOrder, propagateSingleSellerShipment });
