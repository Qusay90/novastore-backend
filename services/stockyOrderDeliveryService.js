'use strict';

const crypto = require('node:crypto');
const {
    EVENT_PATH,
    STATUS_PATH_PREFIX,
    StockySystemConnectorError,
    createSafeStockyTransport,
    sha256Hex,
    signStockyRequest,
    stableStringify,
    verifyStockyResponse
} = require('./stockySystemConnectorService');
const { ORDER_STATUS, PAYMENT_STATUS, SHIPMENT_STATUS } = require('../constants/orderStatus');

const STOCKY_OUTBOX_EVENT = 'stocky.order.created';
const STOCKY_WIRE_EVENT = 'order.created';
const STOCKY_RESULT_EVENT = 'order.processing_result';
const STOCKY_CONTRACT_VERSION = 'r21.v1';
const STOCKY_RESULT_CONTRACT_VERSION = 'v1';
const TERMINAL_RESULT_STATUSES = new Set(['committed', 'manual_required', 'stale']);
const NONTERMINAL_RESULT_STATUSES = new Set(['received', 'processing', 'failed_retryable']);
const ORDER_STATUSES = new Set(Object.values(ORDER_STATUS));
const PAYMENT_STATUSES = new Set(Object.values(PAYMENT_STATUS));
const FULFILLMENT_STATUSES = new Set(Object.values(SHIPMENT_STATUS));
const RESULT_KEYS = new Set([
    'contract_version', 'event_type', 'result_id', 'result_revision', 'source_event_id',
    'store_id', 'order_id', 'processing_status', 'reason_code', 'stocky_sale_ref',
    'processed_at', 'replayed', 'attempt_count', 'receipt_status', 'acknowledged_at'
]);

class StockyOrderDeliveryError extends Error {
    constructor(code, statusCode = 409, details = null) {
        super(code);
        this.name = 'StockyOrderDeliveryError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

const positiveInteger = (value, code = 'STOCKY_ORDER_INPUT_INVALID') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new StockyOrderDeliveryError(code, 400);
    return parsed;
};
const nonnegativeInteger = (value, code = 'STOCKY_ORDER_INPUT_INVALID') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new StockyOrderDeliveryError(code, 400);
    return parsed;
};
const isoTimestamp = (value, code = 'STOCKY_ORDER_TIMESTAMP_INVALID') => {
    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new StockyOrderDeliveryError(code, 409);
    return parsed.toISOString();
};
const parseJsonObject = (value, code) => {
    let parsed = value;
    if (typeof value === 'string') {
        try { parsed = JSON.parse(value); } catch (_) { throw new StockyOrderDeliveryError(code, 502); }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new StockyOrderDeliveryError(code, 502);
    }
    return parsed;
};
const decimalFromMinor = (value) => {
    const minor = nonnegativeInteger(value, 'STOCKY_ORDER_MONEY_INVALID');
    const whole = Math.floor(minor / 100);
    return `${whole}.${String(minor % 100).padStart(2, '0')}`;
};
const minorFromMajor = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new StockyOrderDeliveryError('STOCKY_ORDER_MONEY_INVALID', 409);
    const minor = Math.round((number + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(minor)) throw new StockyOrderDeliveryError('STOCKY_ORDER_MONEY_INVALID', 409);
    return minor;
};
const normalizeSku = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const sku = String(value);
    if (sku.length > 191) throw new StockyOrderDeliveryError('STOCKY_ORDER_SKU_INVALID', 409);
    return sku;
};
const hasExactKeys = (value, expected) => (
    value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key))
);
const validateFrozenEnvelope = (envelope) => {
    const topKeys = new Set(['contract_version', 'event_id', 'event_type', 'event_version', 'occurred_at', 'store_id', 'order']);
    const orderKeys = new Set([
        'id', 'number', 'currency', 'created_at', 'grand_total', 'order_status',
        'payment_status', 'fulfillment_status', 'lines'
    ]);
    const lineKeys = new Set([
        'line_id', 'remote_product_id', 'remote_offer_id', 'remote_variant_id',
        'sku', 'quantity', 'unit_price', 'total'
    ]);
    const order = envelope?.order;
    const decimal = /^\d+(?:\.\d{1,3})?$/u;
    const positiveDecimal = /^(?!0(?:\.0{1,3})?$)\d+(?:\.\d{1,3})?$/u;
    const identifier = /^\d+$/u;
    const timestampHasZone = /(?:Z|[+-]\d{2}:\d{2})$/u;
    if (!hasExactKeys(envelope, topKeys)
        || !hasExactKeys(order, orderKeys)
        || envelope.contract_version !== STOCKY_CONTRACT_VERSION
        || envelope.event_type !== STOCKY_WIRE_EVENT
        || envelope.event_version !== 1
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(String(envelope.event_id || ''))
        || typeof envelope.store_id !== 'string' || envelope.store_id.trim() !== envelope.store_id
        || envelope.store_id.length < 1 || envelope.store_id.length > 191 || /[\x00-\x1f\x7f]/u.test(envelope.store_id)
        || !identifier.test(String(order?.id || '')) || String(order?.number) !== String(order?.id)
        || order.currency !== 'TRY' || !decimal.test(String(order.grand_total || ''))
        || !ORDER_STATUSES.has(order.order_status)
        || !PAYMENT_STATUSES.has(order.payment_status)
        || !FULFILLMENT_STATUSES.has(order.fulfillment_status)
        || !timestampHasZone.test(String(envelope.occurred_at || ''))
        || !timestampHasZone.test(String(order.created_at || ''))
        || !Number.isFinite(new Date(envelope.occurred_at).getTime())
        || !Number.isFinite(new Date(order.created_at).getTime())
        || !Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > 500) {
        throw new StockyOrderDeliveryError('STOCKY_ORDER_OUTBOX_PAYLOAD_INVALID', 409);
    }
    const lineIds = new Set();
    for (const line of order.lines) {
        if (!hasExactKeys(line, lineKeys)
            || typeof line.line_id !== 'string' || line.line_id.length < 1 || line.line_id.length > 191
            || lineIds.has(line.line_id)
            || !identifier.test(String(line.remote_product_id || ''))
            || !identifier.test(String(line.remote_offer_id || ''))
            || !(line.remote_variant_id === null || identifier.test(String(line.remote_variant_id || '')))
            || !(line.sku === null || (typeof line.sku === 'string' && line.sku.length <= 191 && !/[\x00-\x1f\x7f]/u.test(line.sku)))
            || !positiveDecimal.test(String(line.quantity || ''))
            || !decimal.test(String(line.unit_price || ''))
            || !decimal.test(String(line.total || ''))) {
            throw new StockyOrderDeliveryError('STOCKY_ORDER_OUTBOX_PAYLOAD_INVALID', 409);
        }
        lineIds.add(line.line_id);
    }
    return envelope;
};

const buildStockyOrderEnvelope = ({ eventId, occurredAt, connection, canonicalOrder, sellerOrder, allocation }) => {
    const orderId = positiveInteger(canonicalOrder?.id);
    positiveInteger(sellerOrder?.id);
    if (!ORDER_STATUSES.has(canonicalOrder?.status)
        || !PAYMENT_STATUSES.has(canonicalOrder?.payment_status)
        || !FULFILLMENT_STATUSES.has(canonicalOrder?.shipment_status)) {
        throw new StockyOrderDeliveryError('STOCKY_ORDER_STATUS_INVALID', 409);
    }
    const snapshotItems = Array.isArray(canonicalOrder.items)
        ? canonicalOrder.items
        : parseJsonObject({ items: canonicalOrder.items }, 'STOCKY_ORDER_SNAPSHOT_INVALID').items;
    if (!Array.isArray(snapshotItems)) throw new StockyOrderDeliveryError('STOCKY_ORDER_SNAPSHOT_INVALID', 409);
    const allocationItems = Array.isArray(allocation?.items) ? allocation.items : [];
    if (allocationItems.length === 0 || allocationItems.length > 500) {
        throw new StockyOrderDeliveryError('STOCKY_ORDER_ALLOCATION_EMPTY', 409);
    }

    let computedGrossMinor = 0;
    const lines = allocationItems.map((item) => {
        const sourceItemIndex = Number(item.sourceItemIndex);
        if (!Number.isSafeInteger(sourceItemIndex) || sourceItemIndex < 0 || sourceItemIndex >= snapshotItems.length) {
            throw new StockyOrderDeliveryError('STOCKY_ORDER_LINE_IDENTITY_INVALID', 409);
        }
        const snapshot = snapshotItems[sourceItemIndex];
        const productId = positiveInteger(item.productId);
        const offerId = positiveInteger(item.offerId);
        const sellerVariantId = positiveInteger(item.variantId);
        const quantity = positiveInteger(item.quantity);
        const unitPriceMinor = nonnegativeInteger(Number(item.unitPriceMinor), 'STOCKY_ORDER_MONEY_INVALID');
        if (Number(snapshot?.id) !== productId
            || Number(snapshot?.quantity) !== quantity
            || minorFromMajor(snapshot?.price) !== unitPriceMinor) {
            throw new StockyOrderDeliveryError('STOCKY_ORDER_SNAPSHOT_MISMATCH', 409);
        }
        const snapshotVariantId = snapshot?.variant_id === null || snapshot?.variant_id === undefined
            ? null
            : positiveInteger(snapshot.variant_id, 'STOCKY_ORDER_VARIANT_INVALID');
        if (snapshotVariantId !== null && snapshotVariantId !== sellerVariantId) {
            throw new StockyOrderDeliveryError('STOCKY_ORDER_VARIANT_MISMATCH', 409);
        }
        const totalMinor = unitPriceMinor * quantity;
        if (!Number.isSafeInteger(totalMinor)) throw new StockyOrderDeliveryError('STOCKY_ORDER_MONEY_INVALID', 409);
        computedGrossMinor += totalMinor;
        if (!Number.isSafeInteger(computedGrossMinor)) throw new StockyOrderDeliveryError('STOCKY_ORDER_MONEY_INVALID', 409);
        return Object.freeze({
            line_id: `${orderId}:${sourceItemIndex}`,
            remote_product_id: String(productId),
            remote_offer_id: String(offerId),
            remote_variant_id: snapshotVariantId === null ? null : String(snapshotVariantId),
            // The accepted order snapshot records product SKU even on a
            // selected variant. Do not mislabel that as the canonical variant
            // SKU; exact remote_variant_id remains the R19 authority.
            sku: snapshotVariantId === null ? normalizeSku(snapshot?.sku) : null,
            quantity: String(quantity),
            unit_price: decimalFromMinor(unitPriceMinor),
            total: decimalFromMinor(totalMinor)
        });
    });
    const grossMinor = nonnegativeInteger(Number(allocation?.grossMinor), 'STOCKY_ORDER_MONEY_INVALID');
    if (grossMinor !== computedGrossMinor
        || String(allocation?.currency || '') !== 'TRY'
        || String(canonicalOrder?.currency || '') !== 'TRY') {
        throw new StockyOrderDeliveryError('STOCKY_ORDER_TOTAL_MISMATCH', 409);
    }

    return Object.freeze({
        contract_version: STOCKY_CONTRACT_VERSION,
        event_id: String(eventId),
        event_type: STOCKY_WIRE_EVENT,
        event_version: 1,
        occurred_at: isoTimestamp(occurredAt),
        store_id: String(connection.remote_store_id),
        order: Object.freeze({
            id: String(orderId),
            number: String(orderId),
            currency: 'TRY',
            created_at: isoTimestamp(canonicalOrder.created_at),
            grand_total: decimalFromMinor(grossMinor),
            order_status: canonicalOrder.status,
            payment_status: canonicalOrder.payment_status,
            fulfillment_status: canonicalOrder.shipment_status,
            lines: Object.freeze(lines)
        })
    });
};

const enqueueStockyOrderCreated = async (client, input, { runtime } = {}) => {
    if (!runtime?.enabled) return Object.freeze({ enqueued: false, reason: 'STOCKY_SYSTEM_COMMERCE_DISABLED' });
    if (!client || typeof client.query !== 'function') throw new TypeError('Stocky order producer queryable is required.');
    const organizationId = positiveInteger(input?.organizationId);
    const storeId = positiveInteger(input?.storeId);
    const sellerOrderId = positiveInteger(input?.sellerOrderId);
    const canonicalOrderId = positiveInteger(input?.canonicalOrderId);
    const sellerOrderRevision = positiveInteger(input?.sellerOrderRevision || 1);

    const existing = await client.query(
            `SELECT id, payload_redacted
         FROM seller_outbox_events
         WHERE organization_id = $1 AND store_id = $2
           AND aggregate_type = 'seller_order' AND aggregate_id = $3
           AND aggregate_revision = $4 AND event_type = $5`,
        [organizationId, storeId, String(canonicalOrderId), sellerOrderRevision, STOCKY_OUTBOX_EVENT]
    );
    if (existing.rows?.[0]) {
        const replay = await loadEvent(client, existing.rows[0].id);
        if (Number(replay.row.organization_id) !== organizationId
            || Number(replay.row.store_id) !== storeId
            || Number(replay.row.aggregate_revision) !== sellerOrderRevision
            || String(replay.envelope.order.id) !== String(canonicalOrderId)) {
            throw new StockyOrderDeliveryError('STOCKY_ORDER_OUTBOX_CONFLICT', 409);
        }
        return Object.freeze({ enqueued: true, reused: true, eventId: String(existing.rows[0].id) });
    }

    const [connectionResult, orderResult] = await Promise.all([
        client.query(
            `SELECT id, organization_id, store_id, remote_store_id, endpoint_origin, key_id, secret_ref, status, revision
             FROM stocky_connector_connections
             WHERE organization_id = $1 AND store_id = $2 AND status = 'active'`,
            [organizationId, storeId]
        ),
        client.query(
            `SELECT id, status, payment_status, shipment_status, currency, created_at, items
             FROM orders WHERE id = $1`,
            [canonicalOrderId]
        )
    ]);
    const connection = connectionResult.rows?.[0];
    const canonicalOrder = orderResult.rows?.[0];
    if (!connection) {
        return Object.freeze({ enqueued: false, reason: 'STOCKY_CONNECTOR_BINDING_NOT_CONFIGURED' });
    }
    if (!canonicalOrder) throw new StockyOrderDeliveryError('STOCKY_CANONICAL_ORDER_NOT_FOUND', 404);
    if (Number(connection.organization_id) !== organizationId || Number(connection.store_id) !== storeId) {
        throw new StockyOrderDeliveryError('STOCKY_CONNECTOR_BINDING_MISMATCH', 409);
    }

    const eventId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const envelope = buildStockyOrderEnvelope({
        eventId,
        occurredAt,
        connection,
        canonicalOrder: { ...canonicalOrder, items: typeof canonicalOrder.items === 'string' ? JSON.parse(canonicalOrder.items) : canonicalOrder.items },
        sellerOrder: { id: sellerOrderId, revision: sellerOrderRevision },
        allocation: input.allocation
    });
    const body = stableStringify(envelope);
    const payload = Object.freeze({
        connection_id: String(connection.id),
        canonical_order_id: canonicalOrderId,
        request_body_sha256: sha256Hex(body),
        envelope
    });
    const inserted = await client.query(
        `INSERT INTO seller_outbox_events
            (id, organization_id, store_id, aggregate_type, aggregate_id, event_type,
             aggregate_revision, idempotency_key, payload_redacted, created_at)
         VALUES ($1, $2, $3, 'seller_order', $4, $5, $6, $7, $8::jsonb, $9)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
            eventId, organizationId, storeId, String(canonicalOrderId), STOCKY_OUTBOX_EVENT,
            sellerOrderRevision, `stocky:order.created:${organizationId}:${storeId}:${canonicalOrderId}:r${sellerOrderRevision}`,
            JSON.stringify(payload), occurredAt
        ]
    );
    if (!inserted.rows?.[0]) {
        const replay = await client.query(
            `SELECT id FROM seller_outbox_events
             WHERE organization_id = $1 AND store_id = $2
               AND aggregate_type = 'seller_order' AND aggregate_id = $3
               AND aggregate_revision = $4 AND event_type = $5`,
            [organizationId, storeId, String(canonicalOrderId), sellerOrderRevision, STOCKY_OUTBOX_EVENT]
        );
        if (!replay.rows?.[0]) throw new StockyOrderDeliveryError('STOCKY_ORDER_OUTBOX_CONFLICT', 409);
        await loadEvent(client, replay.rows[0].id);
        return Object.freeze({ enqueued: true, reused: true, eventId: String(replay.rows[0].id) });
    }
    await client.query(
        `INSERT INTO seller_audit_events
            (organization_id, store_id, event_type, target_type, target_id, result_code, metadata_redacted)
         VALUES ($1, $2, $3, 'seller_order', $4, 'success', $5::jsonb)`,
        [organizationId, storeId, STOCKY_OUTBOX_EVENT, String(sellerOrderId), JSON.stringify({ source: 'system', action: 'enqueue', target_class: 'seller_order' })]
    );
    return Object.freeze({ enqueued: true, reused: false, eventId });
};

const withTransaction = async (database, callback) => {
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const loadEvent = async (queryable, eventId, { lock = false } = {}) => {
    const result = await queryable.query(
        `SELECT event.id, event.organization_id, event.store_id, event.aggregate_id,
                event.aggregate_revision, event.payload_redacted, event.created_at,
                connection.id AS connection_id, connection.remote_store_id,
                connection.endpoint_origin, connection.key_id, connection.secret_ref,
                connection.status AS connection_status
         FROM seller_outbox_events event
         JOIN stocky_connector_connections connection
           ON connection.id = (event.payload_redacted->>'connection_id')::uuid
          AND connection.organization_id = event.organization_id
          AND connection.store_id = event.store_id
         JOIN seller_stores seller_store
           ON seller_store.organization_id = event.organization_id
          AND seller_store.id = event.store_id
          AND seller_store.status = 'active'
          AND seller_store.closed_at IS NULL
         JOIN seller_organizations organization
           ON organization.id = event.organization_id
          AND organization.status = 'active'
          AND organization.closed_at IS NULL
         WHERE event.id = $1 AND event.event_type = $2
         ${lock ? 'FOR UPDATE OF event' : ''}`,
        [eventId, STOCKY_OUTBOX_EVENT]
    );
    const row = result.rows?.[0];
    if (!row) throw new StockyOrderDeliveryError('STOCKY_ORDER_EVENT_NOT_FOUND', 404);
    if (row.connection_status !== 'active') throw new StockyOrderDeliveryError('STOCKY_CONNECTOR_BINDING_DISABLED', 409);
    const payload = parseJsonObject(row.payload_redacted, 'STOCKY_ORDER_OUTBOX_PAYLOAD_INVALID');
    const envelope = parseJsonObject(payload.envelope, 'STOCKY_ORDER_OUTBOX_PAYLOAD_INVALID');
    validateFrozenEnvelope(envelope);
    const body = stableStringify(envelope);
    if (payload.connection_id !== String(row.connection_id)
        || Number(payload.canonical_order_id) !== Number(envelope.order?.id)
        || payload.request_body_sha256 !== sha256Hex(body)
        || String(envelope.event_id) !== String(row.id)
        || String(envelope.store_id) !== String(row.remote_store_id)) {
        throw new StockyOrderDeliveryError('STOCKY_ORDER_OUTBOX_PAYLOAD_INVALID', 409);
    }
    return Object.freeze({
        row,
        body,
        bodySha256: payload.request_body_sha256,
        envelope,
        connection: Object.freeze({
            id: String(row.connection_id),
            remote_store_id: String(row.remote_store_id),
            endpoint_origin: String(row.endpoint_origin),
            key_id: String(row.key_id),
            secret_ref: String(row.secret_ref)
        })
    });
};

const beginAttempt = async (database, event, operation, signed) => withTransaction(database, async (client) => {
    await loadEvent(client, event.row.id, { lock: true });
    const active = await client.query(
        `SELECT 1 FROM seller_outbox_delivery_attempts lease
         WHERE lease.outbox_event_id = $1 AND lease.outcome = 'leased'
           AND lease.lease_expires_at > CURRENT_TIMESTAMP
           AND NOT EXISTS (
               SELECT 1 FROM seller_outbox_delivery_attempts finished
               WHERE finished.outbox_event_id = lease.outbox_event_id
                 AND finished.attempt_number = lease.attempt_number
                 AND finished.outcome IN ('delivered', 'failed', 'dead_letter')
           ) LIMIT 1`,
        [event.row.id]
    );
    if (active.rows?.[0]) return null;
    const next = await client.query(
        'SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS attempt_number FROM seller_outbox_delivery_attempts WHERE outbox_event_id = $1',
        [event.row.id]
    );
    const attemptNumber = Number(next.rows[0].attempt_number);
    await client.query(
        `INSERT INTO seller_outbox_delivery_attempts
            (id, outbox_event_id, attempt_number, outcome, lease_expires_at,
             stocky_connection_id, operation, request_nonce, request_body_sha256)
         VALUES ($1, $2, $3, 'leased', CURRENT_TIMESTAMP + INTERVAL '30 seconds', $4, $5, $6, $7)`,
        [crypto.randomUUID(), event.row.id, attemptNumber, event.connection.id, operation, signed.nonce, signed.bodySha256]
    );
    return attemptNumber;
});

const finishAttempt = async (database, eventId, attemptNumber, operation, outcome, response = {}, errorCode = null) => {
    await database.query(
        `INSERT INTO seller_outbox_delivery_attempts
            (id, outbox_event_id, attempt_number, outcome, retry_after_at,
             operation, response_body_sha256, http_status, error_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            crypto.randomUUID(), eventId, attemptNumber, outcome,
            outcome === 'failed' && response.retryAfter !== false
                ? new Date(Date.now() + 1000).toISOString()
                : null,
            operation, response.bodySha256 || null, response.statusCode || null,
            errorCode ? String(errorCode).slice(0, 80) : null
        ]
    );
};

const normalizeResult = (rawBody, event, responseVerification) => {
    const parsed = parseJsonObject(rawBody, 'STOCKY_RESULT_RESPONSE_INVALID');
    if (parsed.success !== true) throw new StockyOrderDeliveryError('STOCKY_RESULT_RESPONSE_INVALID', 502);
    const data = parseJsonObject(parsed.data, 'STOCKY_RESULT_RESPONSE_INVALID');
    if (Object.keys(data).some((key) => !RESULT_KEYS.has(key))) throw new StockyOrderDeliveryError('STOCKY_RESULT_RESPONSE_INVALID', 502);
    const status = String(data.processing_status || '').trim();
    if (data.contract_version !== STOCKY_RESULT_CONTRACT_VERSION
        || data.event_type !== STOCKY_RESULT_EVENT
        || String(data.source_event_id) !== String(event.row.id)
        || String(data.store_id) !== String(event.connection.remote_store_id)
        || String(data.order_id) !== String(event.envelope.order.id)) {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_BINDING_INVALID', 502);
    }
    if (data.attempt_count !== undefined) nonnegativeInteger(data.attempt_count, 'STOCKY_RESULT_ATTEMPT_COUNT_INVALID');
    if (data.replayed !== undefined && typeof data.replayed !== 'boolean') {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_REPLAY_INVALID', 502);
    }
    if (NONTERMINAL_RESULT_STATUSES.has(status)) return Object.freeze({ terminal: false, status });
    if (!TERMINAL_RESULT_STATUSES.has(status)
        || !/^[0-9a-f]{64}$/u.test(String(data.result_id || ''))
        || !Number.isSafeInteger(Number(data.result_revision))
        || Number(data.result_revision) < 1
        || !['awaiting_ack', 'acknowledged'].includes(String(data.receipt_status || ''))) {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_BINDING_INVALID', 502);
    }
    const reasonCode = data.reason_code === null ? null : String(data.reason_code || '');
    if (reasonCode !== null && !/^[A-Za-z0-9._:-]{1,80}$/u.test(reasonCode)) {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_REASON_INVALID', 502);
    }
    const saleRef = data.stocky_sale_ref === null ? null : String(data.stocky_sale_ref || '');
    if (saleRef !== null && (saleRef.length < 1 || saleRef.length > 191)) {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_REFERENCE_INVALID', 502);
    }
    if ((data.receipt_status === 'awaiting_ack' && data.acknowledged_at !== null)
        || (data.receipt_status === 'acknowledged'
            && (data.acknowledged_at === null
                || !Number.isFinite(new Date(data.acknowledged_at).getTime())))) {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_RECEIPT_INVALID', 502);
    }
    return Object.freeze({
        terminal: true,
        resultId: String(data.result_id),
        resultRevision: Number(data.result_revision),
        sourceEventId: String(data.source_event_id),
        processingStatus: status,
        reasonCode,
        stockySaleRef: saleRef,
        processedAt: isoTimestamp(data.processed_at, 'STOCKY_RESULT_TIMESTAMP_INVALID'),
        requestNonce: responseVerification.nonce,
        responseBodySha256: responseVerification.bodySha256,
        raw: data
    });
};

const persistTerminalResult = async (database, event, result) => withTransaction(database, async (client) => {
    await loadEvent(client, event.row.id, { lock: true });
    const existing = await client.query(
        `SELECT id, result_id, result_revision, processing_status, reason_code,
                stocky_sale_ref, processed_at, response_body_sha256
         FROM stocky_connector_event_results
         WHERE outbox_event_id = $1
         ORDER BY result_revision DESC, created_at DESC, id DESC`,
        [event.row.id]
    );
    const same = existing.rows.find((row) => Number(row.result_revision) === result.resultRevision);
    if (same) {
        if (same.result_id !== result.resultId
            || same.processing_status !== result.processingStatus
            || (same.reason_code || null) !== result.reasonCode
            || (same.stocky_sale_ref || null) !== result.stockySaleRef
            || isoTimestamp(same.processed_at, 'STOCKY_RESULT_TIMESTAMP_INVALID') !== result.processedAt) {
            throw new StockyOrderDeliveryError('STOCKY_RESULT_REVISION_CONFLICT', 409);
        }
        return Object.freeze({ id: String(same.id), reused: true, ...result });
    }
    const latest = existing.rows[0];
    if (latest && result.resultRevision <= Number(latest.result_revision)) {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_REVISION_STALE', 409);
    }
    if (latest && !(
        latest.processing_status === 'manual_required'
        && result.processingStatus === 'committed'
    )) {
        throw new StockyOrderDeliveryError('STOCKY_RESULT_TRANSITION_INVALID', 409);
    }
    const id = crypto.randomUUID();
    await client.query(
        `INSERT INTO stocky_connector_event_results
            (id, outbox_event_id, connection_id, organization_id, store_id,
             canonical_order_id, source_event_id, result_id, result_revision, remote_store_id,
             request_nonce, request_body_sha256, response_body_sha256, processing_status,
             reason_code, stocky_sale_ref, processed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $2, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
            id, event.row.id, event.connection.id, Number(event.row.organization_id), Number(event.row.store_id),
            Number(event.envelope.order.id), result.resultId, result.resultRevision,
            event.connection.remote_store_id, result.requestNonce, event.bodySha256,
            result.responseBodySha256, result.processingStatus, result.reasonCode,
            result.stockySaleRef, result.processedAt
        ]
    );
    return Object.freeze({ id, reused: false, ...result });
});

const performSignedRequest = async ({ database, event, method, path, body, operation, runtime, transport }) => {
    const signed = signStockyRequest({ method, path, body, connection: event.connection, runtime });
    const attemptNumber = await beginAttempt(database, event, operation, signed);
    if (attemptNumber === null) return Object.freeze({ skipped: 'ACTIVE_LEASE' });
    let response;
    try {
        response = await transport({ url: signed.url, method, headers: signed.headers, body, runtime });
        if (response.statusCode < 200 || response.statusCode >= 300) {
            const responseBodySha256 = response.rawBody === undefined ? null : sha256Hex(response.rawBody);
            let verification = null;
            if (response.statusCode >= 400 && response.statusCode < 500) {
                verification = verifyStockyResponse({
                    statusCode: response.statusCode,
                    path,
                    rawBody: response.rawBody,
                    headers: response.headers,
                    connection: event.connection,
                    runtime,
                    expectedNonce: signed.nonce,
                    expectedTimestamp: signed.timestamp
                });
            }
            const retryableClientStatus = (operation === 'get_status' && response.statusCode === 404)
                || (operation === 'ack_result' && response.statusCode === 409);
            const outcome = response.statusCode >= 400 && response.statusCode < 500 && !retryableClientStatus
                ? 'dead_letter'
                : 'failed';
            await finishAttempt(database, event.row.id, attemptNumber, operation, outcome, {
                statusCode: response.statusCode,
                bodySha256: responseBodySha256
            }, `HTTP_${response.statusCode}`);
            return Object.freeze({
                response,
                verification,
                signed,
                attemptNumber,
                finished: true,
                permanent: outcome === 'dead_letter'
            });
        }
        const verification = verifyStockyResponse({
            statusCode: response.statusCode,
            path,
            rawBody: response.rawBody,
            headers: response.headers,
            connection: event.connection,
            runtime,
            expectedNonce: signed.nonce,
            expectedTimestamp: signed.timestamp
        });
        return Object.freeze({ response, verification, signed, attemptNumber });
    } catch (error) {
        await finishAttempt(database, event.row.id, attemptNumber, operation, 'failed', {
            statusCode: response?.statusCode || null,
            bodySha256: response?.rawBody === undefined ? null : sha256Hex(response.rawBody)
        }, error?.code || 'STOCKY_CONNECTOR_REQUEST_FAILED').catch(() => {});
        throw error;
    }
};

const appendAckAttempt = async (database, resultId, input) => withTransaction(database, async (client) => {
    // Serialize the append-only per-result counter without holding a database
    // transaction open during the network request.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [String(resultId)]);
    await client.query(
        `INSERT INTO stocky_connector_result_ack_attempts
            (id, result_id, attempt_number, outcome, request_nonce, request_body_sha256,
             response_body_sha256, http_status, error_code, retry_after_at)
         VALUES ($1, $2, COALESCE((SELECT MAX(attempt_number) + 1 FROM stocky_connector_result_ack_attempts WHERE result_id = $2), 1),
                 $3, $4, $5, $6, $7, $8, $9)`,
        [
            crypto.randomUUID(), resultId, input.outcome, input.nonce, input.requestBodySha256,
            input.responseBodySha256 || null, input.httpStatus || null,
            input.errorCode
                ? String(input.errorCode).toUpperCase().replace(/[^A-Z0-9._:-]/gu, '_').slice(0, 80)
                : null,
            input.outcome === 'failed' ? new Date(Date.now() + 1000).toISOString() : null
        ]
    );
});

const acknowledgeResult = async ({ database, event, result, runtime, transport }) => {
    const path = `${STATUS_PATH_PREFIX}${encodeURIComponent(event.row.id)}/receipt`;
    const body = JSON.stringify({ result_id: result.resultId });
    const signed = signStockyRequest({ method: 'POST', path, body, connection: event.connection, runtime });
    let response;
    let verification;
    let authenticatedClientError = false;
    try {
        response = await transport({ url: signed.url, method: 'POST', headers: signed.headers, body, runtime });
        if (response.statusCode < 200 || response.statusCode >= 300) {
            if (response.statusCode >= 400 && response.statusCode < 500) {
                verifyStockyResponse({
                    statusCode: response.statusCode,
                    path,
                    rawBody: response.rawBody,
                    headers: response.headers,
                    connection: event.connection,
                    runtime,
                    expectedNonce: signed.nonce,
                    expectedTimestamp: signed.timestamp
                });
                authenticatedClientError = true;
            }
            throw new StockyOrderDeliveryError('STOCKY_RESULT_ACK_REJECTED', 502, { httpStatus: response.statusCode });
        }
        verification = verifyStockyResponse({
            statusCode: response.statusCode,
            path,
            rawBody: response.rawBody,
            headers: response.headers,
            connection: event.connection,
            runtime,
            expectedNonce: signed.nonce,
            expectedTimestamp: signed.timestamp
        });
        const parsed = parseJsonObject(response.rawBody, 'STOCKY_RESULT_ACK_INVALID');
        if (parsed.success !== true) throw new StockyOrderDeliveryError('STOCKY_RESULT_ACK_INVALID', 502);
        const data = parseJsonObject(parsed.data, 'STOCKY_RESULT_ACK_INVALID');
        if (String(data.source_event_id) !== String(event.row.id)
            || String(data.order_id) !== String(event.envelope.order.id)
            || String(data.result_id) !== result.resultId
            || data.receipt_status !== 'acknowledged') {
            throw new StockyOrderDeliveryError('STOCKY_RESULT_ACK_BINDING_INVALID', 502);
        }
        await appendAckAttempt(database, result.id, {
            outcome: 'acknowledged',
            nonce: signed.nonce,
            requestBodySha256: signed.bodySha256,
            responseBodySha256: verification.bodySha256,
            httpStatus: response.statusCode
        });
    } catch (error) {
        const httpStatus = Number(error?.details?.httpStatus || response?.statusCode || 0) || null;
        const permanent = authenticatedClientError
            && httpStatus >= 400
            && httpStatus < 500
            && httpStatus !== 409;
        await appendAckAttempt(database, result.id, {
            outcome: permanent ? 'dead_letter' : 'failed',
            nonce: signed.nonce,
            requestBodySha256: signed.bodySha256,
            responseBodySha256: response?.rawBody === undefined ? null : sha256Hex(response.rawBody),
            httpStatus,
            errorCode: error?.code || 'STOCKY_RESULT_ACK_FAILED'
        }).catch(() => {});
        throw error;
    }
    return Object.freeze({
        acknowledged: true,
        businessComplete: result.processingStatus === 'committed',
        processingStatus: result.processingStatus,
        result
    });
};

const handleResultResponse = async ({ database, event, operation, runtime, transport }) => {
    if (operation.skipped) return operation;
    if (operation.response.statusCode < 200 || operation.response.statusCode >= 300) {
        return Object.freeze({
            retryable: operation.permanent !== true,
            deadLettered: operation.permanent === true,
            httpStatus: operation.response.statusCode
        });
    }
    let result;
    try {
        result = normalizeResult(operation.response.rawBody, event, operation.verification);
    } catch (error) {
        await finishAttempt(database, event.row.id, operation.attemptNumber, operation.signed.url.endsWith(EVENT_PATH) ? 'post_event' : 'get_status', 'failed', {
            statusCode: operation.response.statusCode,
            bodySha256: operation.verification.bodySha256
        }, error.code || 'STOCKY_RESULT_RESPONSE_INVALID');
        throw error;
    }
    const operationName = operation.signed.url.endsWith(EVENT_PATH) ? 'post_event' : 'get_status';
    if (!result.terminal) {
        await finishAttempt(database, event.row.id, operation.attemptNumber, operationName, 'failed', {
            statusCode: operation.response.statusCode,
            bodySha256: operation.verification.bodySha256
        }, `STOCKY_RESULT_${String(result.status).toUpperCase()}`);
        return Object.freeze({ retryable: true, processingStatus: result.status });
    }
    await finishAttempt(database, event.row.id, operation.attemptNumber, operationName,
        result.processingStatus === 'committed' ? 'delivered' : 'failed', {
            statusCode: operation.response.statusCode,
            bodySha256: operation.verification.bodySha256,
            retryAfter: result.processingStatus === 'committed' ? undefined : false
        }, result.processingStatus === 'committed' ? null : `BUSINESS_${result.processingStatus.toUpperCase()}`);
    const persisted = await persistTerminalResult(database, event, result);
    return acknowledgeResult({ database, event, result: persisted, runtime, transport });
};

const latestResult = async (database, eventId) => (
    await database.query(
        `SELECT result.*, EXISTS (
             SELECT 1 FROM stocky_connector_result_ack_attempts ack
             WHERE ack.result_id = result.id AND ack.outcome = 'acknowledged'
         ) AS acknowledged
         FROM stocky_connector_event_results result
         WHERE result.outbox_event_id = $1
         ORDER BY result.result_revision DESC, result.created_at DESC, result.id DESC
         LIMIT 1`,
        [eventId]
    )
).rows?.[0] || null;

const reconcileStockyOrderEvent = async ({ database, eventId, runtime, transport = createSafeStockyTransport() }) => {
    if (!runtime?.enabled) throw new StockyOrderDeliveryError('STOCKY_SYSTEM_COMMERCE_DISABLED', 503);
    const event = await loadEvent(database, eventId);
    try {
        const persisted = await latestResult(database, eventId);
        if (persisted && persisted.acknowledged !== true) {
            try {
                return await acknowledgeResult({
                    database,
                    event,
                    result: Object.freeze({
                        id: String(persisted.id),
                        resultId: String(persisted.result_id),
                        resultRevision: Number(persisted.result_revision),
                        processingStatus: String(persisted.processing_status)
                    }),
                    runtime,
                    transport
                });
            } catch (error) {
                // A manual result can be superseded after an independently
                // authorized Stocky replay. Its old result id then receives a
                // signed 409; fetch the latest signed revision below.
                if (!(error instanceof StockyOrderDeliveryError
                    && error.code === 'STOCKY_RESULT_ACK_REJECTED'
                    && error.details?.httpStatus === 409)) {
                    const permanent = error instanceof StockyOrderDeliveryError
                        && error.code === 'STOCKY_RESULT_ACK_REJECTED'
                        && Number(error.details?.httpStatus) >= 400
                        && Number(error.details?.httpStatus) < 500;
                    return Object.freeze({
                        retryable: !permanent,
                        deadLettered: permanent,
                        processingStatus: persisted.processing_status
                    });
                }
            }
        }
        const previous = await database.query(
            `SELECT operation FROM seller_outbox_delivery_attempts
             WHERE outbox_event_id = $1 AND outcome = 'leased' AND operation IN ('post_event', 'get_status')
             ORDER BY created_at DESC, id DESC LIMIT 1`,
            [eventId]
        );
        const shouldReadStatus = Boolean(persisted) || previous.rows?.[0]?.operation === 'post_event';
        if (shouldReadStatus) {
            const path = `${STATUS_PATH_PREFIX}${encodeURIComponent(event.row.id)}`;
            const statusOperation = await performSignedRequest({ database, event, method: 'GET', path, body: '', operation: 'get_status', runtime, transport });
            if (statusOperation.skipped) return statusOperation;
            if (statusOperation.response.statusCode !== 404) {
                return await handleResultResponse({ database, event, operation: statusOperation, runtime, transport });
            }
        }
        const postOperation = await performSignedRequest({
            database,
            event,
            method: 'POST',
            path: EVENT_PATH,
            body: event.body,
            operation: 'post_event',
            runtime,
            transport
        });
        return await handleResultResponse({ database, event, operation: postOperation, runtime, transport });
    } catch (error) {
        if (error instanceof StockySystemConnectorError || error instanceof StockyOrderDeliveryError || error?.code) {
            const permanent = error instanceof StockyOrderDeliveryError
                && error.code === 'STOCKY_RESULT_ACK_REJECTED'
                && Number(error.details?.httpStatus) >= 400
                && Number(error.details?.httpStatus) < 500
                && Number(error.details?.httpStatus) !== 409;
            return Object.freeze({
                retryable: !permanent,
                deadLettered: permanent,
                errorCode: String(error.code || 'STOCKY_DELIVERY_FAILED')
            });
        }
        throw error;
    }
};

const deliverStockyOrderEvent = async ({ database, eventId, runtime, transport = createSafeStockyTransport() }) => {
    if (!runtime?.enabled) throw new StockyOrderDeliveryError('STOCKY_SYSTEM_COMMERCE_DISABLED', 503);
    const event = await loadEvent(database, eventId);
    const persisted = await latestResult(database, eventId);
    if (persisted && persisted.acknowledged === true && persisted.processing_status === 'manual_required') {
        return reconcileStockyOrderEvent({ database, eventId, runtime, transport });
    }
    if (persisted && persisted.acknowledged === true) {
        return Object.freeze({
            acknowledged: true,
            reused: true,
            businessComplete: persisted.processing_status === 'committed',
            processingStatus: persisted.processing_status
        });
    }
    if (persisted) return reconcileStockyOrderEvent({ database, eventId, runtime, transport });

    const previous = await database.query(
        `SELECT operation FROM seller_outbox_delivery_attempts
         WHERE outbox_event_id = $1 AND outcome = 'leased' AND operation IN ('post_event', 'get_status')
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [eventId]
    );
    if (previous.rows?.[0]?.operation === 'post_event') {
        return reconcileStockyOrderEvent({ database, eventId, runtime, transport });
    }
    const operation = await performSignedRequest({
        database,
        event,
        method: 'POST',
        path: EVENT_PATH,
        body: event.body,
        operation: 'post_event',
        runtime,
        transport
    });
    return handleResultResponse({ database, event, operation, runtime, transport });
};

const deliverNextStockyOrderEvent = async ({ database, runtime, transport = createSafeStockyTransport() }) => {
    if (!runtime?.enabled) return Object.freeze({ processed: false, reason: 'STOCKY_SYSTEM_COMMERCE_DISABLED' });
    const result = await database.query(
        `SELECT event.id
         FROM seller_outbox_events event
         JOIN stocky_connector_connections active_connection
           ON active_connection.id = (event.payload_redacted->>'connection_id')::uuid
          AND active_connection.organization_id = event.organization_id
          AND active_connection.store_id = event.store_id
          AND active_connection.status = 'active'
         JOIN seller_stores active_store
           ON active_store.organization_id = event.organization_id
          AND active_store.id = event.store_id
          AND active_store.status = 'active'
          AND active_store.closed_at IS NULL
         JOIN seller_organizations active_organization
           ON active_organization.id = event.organization_id
          AND active_organization.status = 'active'
          AND active_organization.closed_at IS NULL
         WHERE event.event_type = $1
           AND NOT EXISTS (
               SELECT 1 FROM seller_outbox_delivery_attempts terminal_attempt
               WHERE terminal_attempt.outbox_event_id = event.id
                 AND terminal_attempt.outcome = 'dead_letter'
                 AND terminal_attempt.operation IN ('post_event', 'get_status')
           )
           AND NOT EXISTS (
               SELECT 1 FROM seller_outbox_delivery_attempts active_lease
               WHERE active_lease.outbox_event_id = event.id
                 AND active_lease.outcome = 'leased'
                 AND active_lease.lease_expires_at > CURRENT_TIMESTAMP
                 AND NOT EXISTS (
                     SELECT 1 FROM seller_outbox_delivery_attempts completed_lease
                     WHERE completed_lease.outbox_event_id = active_lease.outbox_event_id
                       AND completed_lease.attempt_number = active_lease.attempt_number
                       AND completed_lease.outcome IN ('delivered', 'failed', 'dead_letter')
                 )
           )
           AND NOT EXISTS (
               SELECT 1 FROM seller_outbox_delivery_attempts delayed_attempt
               WHERE delayed_attempt.outbox_event_id = event.id
                 AND delayed_attempt.outcome = 'failed'
                 AND delayed_attempt.retry_after_at > CURRENT_TIMESTAMP
                 AND NOT EXISTS (
                     SELECT 1 FROM seller_outbox_delivery_attempts newer_attempt
                     WHERE newer_attempt.outbox_event_id = delayed_attempt.outbox_event_id
                       AND newer_attempt.attempt_number > delayed_attempt.attempt_number
                 )
           )
           AND NOT EXISTS (
               SELECT 1
               FROM stocky_connector_event_results result
               JOIN stocky_connector_result_ack_attempts ack ON ack.result_id = result.id
               WHERE result.outbox_event_id = event.id
                 AND result.processing_status IN ('committed', 'stale')
                 AND ack.outcome = 'acknowledged'
                 AND NOT EXISTS (
                     SELECT 1 FROM stocky_connector_event_results newer
                     WHERE newer.outbox_event_id = result.outbox_event_id
                       AND newer.result_revision > result.result_revision
                 )
           )
           AND NOT EXISTS (
               SELECT 1
               FROM stocky_connector_event_results result
               JOIN stocky_connector_result_ack_attempts ack ON ack.result_id = result.id
               WHERE result.outbox_event_id = event.id
                 AND result.processing_status = 'manual_required'
                 AND ack.outcome = 'acknowledged'
                 AND NOT EXISTS (
                     SELECT 1 FROM stocky_connector_event_results newer
                     WHERE newer.outbox_event_id = result.outbox_event_id
                       AND newer.result_revision > result.result_revision
                 )
                 AND EXISTS (
                     SELECT 1 FROM seller_outbox_delivery_attempts recent_poll
                     WHERE recent_poll.outbox_event_id = event.id
                       AND recent_poll.operation = 'get_status'
                       AND recent_poll.created_at > CURRENT_TIMESTAMP - ($2::bigint * INTERVAL '1 millisecond')
                 )
           )
           AND NOT EXISTS (
               SELECT 1
               FROM stocky_connector_event_results result
               JOIN stocky_connector_result_ack_attempts ack ON ack.result_id = result.id
               WHERE result.outbox_event_id = event.id
                 AND ack.outcome = 'dead_letter'
                 AND NOT EXISTS (
                     SELECT 1 FROM stocky_connector_event_results newer
                     WHERE newer.outbox_event_id = result.outbox_event_id
                       AND newer.result_revision > result.result_revision
                 )
           )
           AND NOT EXISTS (
               SELECT 1
               FROM stocky_connector_event_results result
               JOIN stocky_connector_result_ack_attempts ack ON ack.result_id = result.id
               WHERE result.outbox_event_id = event.id
                 AND ack.outcome = 'failed'
                 AND ack.retry_after_at > CURRENT_TIMESTAMP
                 AND NOT EXISTS (
                     SELECT 1 FROM stocky_connector_result_ack_attempts newer_ack
                     WHERE newer_ack.result_id = ack.result_id
                       AND newer_ack.attempt_number > ack.attempt_number
                 )
                 AND NOT EXISTS (
                     SELECT 1 FROM stocky_connector_event_results newer
                     WHERE newer.outbox_event_id = result.outbox_event_id
                       AND newer.result_revision > result.result_revision
                 )
           )
         ORDER BY CASE WHEN EXISTS (
             SELECT 1 FROM stocky_connector_event_results manual_result
             WHERE manual_result.outbox_event_id = event.id
               AND manual_result.processing_status = 'manual_required'
         ) THEN 1 ELSE 0 END,
         event.created_at ASC, event.id ASC
         LIMIT 1`,
        [STOCKY_OUTBOX_EVENT, runtime.manualResultPollIntervalMs || 300000]
    );
    const eventId = result.rows?.[0]?.id;
    if (!eventId) return Object.freeze({ processed: false });
    const delivery = await deliverStockyOrderEvent({ database, eventId, runtime, transport });
    return Object.freeze({ processed: true, eventId: String(eventId), delivery });
};

module.exports = Object.freeze({
    STOCKY_CONTRACT_VERSION,
    STOCKY_OUTBOX_EVENT,
    STOCKY_RESULT_EVENT,
    STOCKY_WIRE_EVENT,
    StockyOrderDeliveryError,
    acknowledgeResult,
    buildStockyOrderEnvelope,
    decimalFromMinor,
    deliverNextStockyOrderEvent,
    deliverStockyOrderEvent,
    enqueueStockyOrderCreated,
    normalizeResult,
    persistTerminalResult,
    reconcileStockyOrderEvent,
    validateFrozenEnvelope
});
