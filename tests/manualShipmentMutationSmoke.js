const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_category_v2_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_category_v2_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';

const pool = require('../config/db');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    SHIPMENT_STATUS
} = require('../constants/orderStatus');
const {
    createManualShipment,
    createShipment,
    getShipment,
    notifyManualShipmentSafely
} = require('../controllers/shipmentController');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');

const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;
const originalFlag = process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(value) {
        this.payload = value;
        return this;
    }
});

const clone = (value) => (value ? { ...value } : value);

const createState = ({ order = {}, payment = {} } = {}) => ({
    order: {
        id: 7001,
        user_id: null,
        status: ORDER_STATUS.HAZIRLANIYOR,
        payment_status: PAYMENT_STATUS.PAID,
        payment_ref: 'PAY-7001',
        refund_status: REFUND_STATUS.NONE,
        shipment_status: SHIPMENT_STATUS.NONE,
        shipment_provider: null,
        tracking_no: null,
        ...order
    },
    payments: [{
        id: 5001,
        provider: 'paytr',
        payment_ref: 'PAY-7001',
        status: PAYMENT_STATUS.PAID,
        raw_request: JSON.stringify({ stockReserved: true, finalizesOnWebhook: true }),
        raw_response: '{}',
        created_at: '2026-07-14T10:00:00.000Z',
        updated_at: '2026-07-14T10:00:00.000Z',
        ...payment
    }],
    shipment: null,
    calls: [],
    shipmentInserts: 0,
    orderUpdates: 0,
    orderEvents: 0,
    eventPayload: null,
    released: false
});

const createClient = (state) => ({
    async query(sql, params = []) {
        const text = String(sql).trim();
        state.calls.push({ sql: text, params });

        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/FROM orders\s+WHERE id = \$1\s+FOR UPDATE/i.test(text)) {
            return { rows: state.order ? [clone(state.order)] : [] };
        }
        if (/FROM shipments\s+WHERE order_id = \$1\s+FOR UPDATE/i.test(text)) {
            return { rows: state.shipment ? [clone(state.shipment)] : [] };
        }
        if (/FROM payments\s+WHERE order_id = \$1[\s\S]*FOR UPDATE/i.test(text)) {
            return { rows: state.payments.map(clone) };
        }
        if (/INSERT INTO shipments/i.test(text)) {
            state.shipmentInserts += 1;
            state.shipment = {
                id: 8801,
                order_id: Number(params[0]),
                provider: params[1],
                tracking_no: params[2],
                tracking_url: null,
                shipment_status: params[3],
                eta_date: null,
                label_url: null,
                raw_payload: params[4],
                created_at: '2026-07-14T12:00:00.000Z',
                updated_at: '2026-07-14T12:00:00.000Z'
            };
            return { rows: [clone(state.shipment)], rowCount: 1 };
        }
        if (/UPDATE orders\s+SET status/i.test(text)) {
            state.orderUpdates += 1;
            state.order = {
                ...state.order,
                status: params[0],
                shipment_status: params[1],
                shipment_provider: params[2],
                tracking_no: params[3]
            };
            return { rows: [clone(state.order)], rowCount: 1 };
        }
        if (/INSERT INTO order_events/i.test(text)) {
            state.orderEvents += 1;
            state.eventPayload = JSON.parse(params[3]);
            return { rows: [{ id: state.orderEvents }], rowCount: 1 };
        }
        throw new Error(`Unexpected manual shipment fake query: ${text}`);
    },
    release() {
        state.released = true;
    }
});

const baseRequest = ({
    idempotencyKey = 'shipment-7001-attempt-1',
    body = {},
    actor = { id: 17, role: 'admin' }
} = {}) => ({
    params: { orderId: '7001' },
    headers: { 'idempotency-key': idempotencyKey },
    body: {
        expected_status: ORDER_STATUS.HAZIRLANIYOR,
        handoff_confirmed: true,
        provider: 'Yurtiçi Kargo',
        tracking_no: 'YK-2026-000123',
        ...body
    },
    user: actor,
    currentAdmin: actor
});

const runMutation = async (state, requestOptions = {}, dependencies = undefined) => {
    pool.connect = async () => createClient(state);
    const response = createResponse();
    await createManualShipment(baseRequest(requestOptions), response, dependencies);
    return response;
};

(async () => {
    try {
        let disabledDbCalls = 0;
        pool.connect = async () => {
            disabledDbCalls += 1;
            throw new Error('disabled capability must not connect');
        };
        pool.query = async () => {
            disabledDbCalls += 1;
            throw new Error('disabled capability must not query');
        };
        delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;

        const disabledResponse = createResponse();
        await createManualShipment(baseRequest(), disabledResponse);
        assert.equal(disabledResponse.statusCode, 503);
        assert.equal(disabledResponse.payload.code, 'MANUAL_FULFILLMENT_DISABLED');
        assert.equal(disabledDbCalls, 0);

        const middlewareResponse = createResponse();
        let disabledNextCalls = 0;
        requireAdminCommerceCapability('manualShipmentWrite')(
            { user: { id: 17, role: 'admin' } },
            middlewareResponse,
            () => { disabledNextCalls += 1; }
        );
        assert.equal(middlewareResponse.statusCode, 503);
        assert.equal(middlewareResponse.payload.code, 'MANUAL_FULFILLMENT_DISABLED');
        assert.equal(disabledNextCalls, 0);
        assert.equal(disabledDbCalls, 0);

        const disabledLegacyResponse = createResponse();
        await createShipment(baseRequest(), disabledLegacyResponse);
        assert.equal(disabledLegacyResponse.statusCode, 410);
        assert.equal(disabledLegacyResponse.payload.code, 'SHIPMENT_CREATE_DISABLED');
        assert.equal(disabledDbCalls, 0);

        process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = 'true';

        let validationConnects = 0;
        pool.connect = async () => {
            validationConnects += 1;
            throw new Error('invalid carrier fields must not connect');
        };
        const rejectedCarrierResponse = createResponse();
        await createManualShipment(baseRequest({
            body: { tracking_url: 'https://untrusted.example/track' }
        }), rejectedCarrierResponse);
        assert.equal(rejectedCarrierResponse.statusCode, 400);
        assert.equal(rejectedCarrierResponse.payload.code, 'MANUAL_SHIPMENT_CARRIER_FIELDS_REJECTED');
        assert.equal(validationConnects, 0);

        const state = createState();
        const firstResponse = await runMutation(state);
        assert.equal(firstResponse.statusCode, 201);
        assert.equal(firstResponse.payload.reused, false);
        assert.equal(firstResponse.payload.order.status, ORDER_STATUS.KARGOYA_VERILDI);
        assert.equal(firstResponse.payload.order.shipmentStatus, SHIPMENT_STATUS.IN_TRANSIT);
        assert.equal(firstResponse.payload.shipment.orderId, 7001);
        assert.equal(firstResponse.payload.shipment.provider, 'Yurtiçi Kargo');
        assert.equal(firstResponse.payload.shipment.trackingNo, 'YK-2026-000123');
        assert.equal(firstResponse.payload.shipment.trackingUrl, null);
        assert.equal(firstResponse.payload.shipment.shipmentStatus, SHIPMENT_STATUS.IN_TRANSIT);
        assert.equal(firstResponse.payload.shipment.carrierApiExecuted, false);
        assert.equal(firstResponse.payload.shipment.carrierConfirmed, false);
        assert.equal(firstResponse.payload.shipment.labelGenerated, false);
        assert.equal(firstResponse.payload.shipment.labelUrl, null);
        assert.equal(state.shipmentInserts, 1);
        assert.equal(state.orderUpdates, 1);
        assert.equal(state.orderEvents, 1);
        assert.equal(state.released, true);

        const firstOrderLock = state.calls.findIndex(({ sql }) => /FROM orders\s+WHERE id = \$1\s+FOR UPDATE/i.test(sql));
        const firstShipmentLock = state.calls.findIndex(({ sql }) => /FROM shipments\s+WHERE order_id = \$1\s+FOR UPDATE/i.test(sql));
        const firstPaymentsLock = state.calls.findIndex(({ sql }) => /FROM payments\s+WHERE order_id = \$1[\s\S]*FOR UPDATE/i.test(sql));
        const firstShipmentWrite = state.calls.findIndex(({ sql }) => /INSERT INTO shipments/i.test(sql));
        const firstOrderWrite = state.calls.findIndex(({ sql }) => /UPDATE orders/i.test(sql));
        const firstEventWrite = state.calls.findIndex(({ sql }) => /INSERT INTO order_events/i.test(sql));
        const firstCommit = state.calls.findIndex(({ sql }) => sql === 'COMMIT');
        assert(firstOrderLock > 0, 'order must be locked after BEGIN');
        assert(firstShipmentLock > firstOrderLock, 'shipment lock follows order lock');
        assert(firstPaymentsLock > firstShipmentLock, 'all payments lock follows shipment lock');
        assert(firstShipmentWrite > firstPaymentsLock, 'shipment write follows every proof lock');
        assert(firstOrderWrite > firstShipmentWrite, 'order update follows shipment insert');
        assert(firstEventWrite > firstOrderWrite, 'audit event follows order update');
        assert(firstCommit > firstEventWrite, 'commit follows every atomic write');

        const rawMetadata = JSON.parse(state.shipment.raw_payload);
        assert.equal(rawMetadata.source, 'admin_manual_fulfillment');
        assert.equal(rawMetadata.idempotencyKey, 'shipment-7001-attempt-1');
        assert.equal(rawMetadata.actor.id, 17);
        assert.equal(rawMetadata.actor.role, 'admin');
        assert.match(rawMetadata.requestFingerprint, /^[a-f0-9]{64}$/);
        assert.equal(rawMetadata.carrierApiExecuted, false);
        assert.equal(rawMetadata.carrierConfirmed, false);
        assert.equal(rawMetadata.labelGenerated, false);
        assert.equal(state.eventPayload.beforeStatus, ORDER_STATUS.HAZIRLANIYOR);
        assert.equal(state.eventPayload.afterStatus, ORDER_STATUS.KARGOYA_VERILDI);
        assert.equal(state.eventPayload.actor.id, 17);
        assert.equal(state.eventPayload.reasonCode, 'MANUAL_HANDOFF_CONFIRMED');
        assert.equal(state.eventPayload.trackingLast4, '0123');
        assert.match(state.eventPayload.trackingHash, /^[a-f0-9]{64}$/);

        const callsBeforeReplay = state.calls.length;
        const replayResponse = await runMutation(state);
        assert.equal(replayResponse.statusCode, 200);
        assert.equal(replayResponse.payload.reused, true);
        assert.equal(state.shipmentInserts, 1);
        assert.equal(state.orderUpdates, 1);
        assert.equal(state.orderEvents, 1);
        const replayCalls = state.calls.slice(callsBeforeReplay);
        assert.match(replayCalls.find(({ sql }) => /FROM orders/i.test(sql)).sql, /FOR UPDATE/i);
        assert.match(replayCalls.find(({ sql }) => /FROM shipments/i.test(sql)).sql, /FOR UPDATE/i);
        assert.match(replayCalls.find(({ sql }) => /FROM payments/i.test(sql)).sql, /FOR UPDATE/i);
        assert.deepEqual(
            replayCalls.filter(({ sql }) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)).map(({ sql }) => sql),
            ['BEGIN', 'COMMIT']
        );
        assert.equal(replayCalls.some(({ sql }) => /^(INSERT|UPDATE|DELETE)\b/i.test(sql)), false);

        const sameKeyConflictResponse = await runMutation(state, {
            body: { tracking_no: 'YK-2026-DIFFERENT' }
        });
        assert.equal(sameKeyConflictResponse.statusCode, 409);
        assert.equal(sameKeyConflictResponse.payload.code, 'MANUAL_SHIPMENT_IDEMPOTENCY_CONFLICT');
        assert.equal(state.shipmentInserts, 1);
        assert.equal(state.orderUpdates, 1);
        assert.equal(state.orderEvents, 1);
        assert.equal(state.calls.at(-1).sql, 'ROLLBACK');

        const differentKeyConflictResponse = await runMutation(state, {
            idempotencyKey: 'shipment-7001-attempt-2'
        });
        assert.equal(differentKeyConflictResponse.statusCode, 409);
        assert.equal(differentKeyConflictResponse.payload.code, 'MANUAL_SHIPMENT_ALREADY_EXISTS');
        assert.equal(state.shipmentInserts, 1);
        assert.equal(state.orderUpdates, 1);
        assert.equal(state.orderEvents, 1);
        assert.equal(state.calls.at(-1).sql, 'ROLLBACK');

        const reconciliationState = createState({
            payment: {
                raw_request: JSON.stringify({
                    stockReserved: true,
                    reconciliationRequired: true,
                    reconciliationTask: { status: 'OPEN' }
                })
            }
        });
        const reconciliationResponse = await runMutation(reconciliationState);
        assert.equal(reconciliationResponse.statusCode, 409);
        assert.equal(reconciliationResponse.payload.code, 'MANUAL_SHIPMENT_RECONCILIATION_OPEN');
        assert.equal(reconciliationState.shipmentInserts, 0);
        assert.equal(reconciliationState.orderUpdates, 0);
        assert.equal(reconciliationState.orderEvents, 0);
        assert.equal(reconciliationState.calls.at(-1).sql, 'ROLLBACK');

        const notificationState = createState({ order: { user_id: 44 } });
        let notificationAttempts = 0;
        let notificationLogCalls = 0;
        const notificationFailureResponse = await runMutation(
            notificationState,
            {},
            {
                notificationDependencies: {
                    createNotificationFn: async () => {
                        notificationAttempts += 1;
                        assert.equal(notificationState.calls.at(-1).sql, 'COMMIT');
                        throw new Error('simulated post-commit notification failure');
                    },
                    getIoFn: () => ({ simulated: true }),
                    logErrorFn: (message) => {
                        notificationLogCalls += 1;
                        assert.equal(message, 'Manuel kargo kaydı sonrası bildirim hazırlanamadı.');
                    }
                }
            }
        );
        assert.equal(notificationFailureResponse.statusCode, 201);
        assert.equal(notificationFailureResponse.payload.reused, false);
        assert.equal(notificationFailureResponse.payload.order.status, ORDER_STATUS.KARGOYA_VERILDI);
        assert.equal(notificationAttempts, 1);
        assert.equal(notificationLogCalls, 1);
        assert.equal(notificationState.shipmentInserts, 1);
        assert.equal(notificationState.orderUpdates, 1);
        assert.equal(notificationState.orderEvents, 1);
        assert.equal(notificationState.calls.some(({ sql }) => sql === 'ROLLBACK'), false);

        let directNotificationLogs = 0;
        const directNotificationResult = await notifyManualShipmentSafely(
            { orderId: 7001, userId: 44 },
            {
                createNotificationFn: async () => { throw new Error('simulated rejection'); },
                getIoFn: () => ({}),
                logErrorFn: () => { directNotificationLogs += 1; }
            }
        );
        assert.equal(directNotificationResult, false);
        assert.equal(directNotificationLogs, 1);

        let nullNotificationLogs = 0;
        const nullNotificationResult = await notifyManualShipmentSafely(
            { orderId: 7001, userId: 44 },
            {
                createNotificationFn: async () => null,
                getIoFn: () => ({}),
                logErrorFn: () => { nullNotificationLogs += 1; }
            }
        );
        assert.equal(nullNotificationResult, false);
        assert.equal(nullNotificationLogs, 1);

        pool.query = async () => ({
            rows: [{
                id: 7001,
                user_id: 44,
                order_status: ORDER_STATUS.KARGOYA_VERILDI,
                provider: 'Bilinmeyen Taşıyıcı',
                tracking_no: 'NO-LINK-123',
                tracking_url: null,
                shipment_status: SHIPMENT_STATUS.IN_TRANSIT,
                eta_date: null,
                estimated_delivery_date: null
            }]
        });
        const getResponse = createResponse();
        await getShipment({
            params: { orderId: '7001' },
            user: { id: 44, role: 'customer' }
        }, getResponse);
        assert.equal(getResponse.statusCode, 200);
        assert.equal(getResponse.payload.trackingNo, 'NO-LINK-123');
        assert.equal(getResponse.payload.trackingUrl, null, 'server must not invent a Google/default tracking URL');

        const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'shipmentRoutes.js'), 'utf8');
        assert.match(
            routeSource,
            /router\.post\(\s*'\/:orderId\/manual',\s*authenticate,\s*requireAdmin,\s*requireAdminCommerceCapability\('manualShipmentWrite'\),\s*requireCurrentAdmin,\s*createManualShipment\s*\)/
        );
        assert.match(
            routeSource,
            /router\.post\('\/:orderId\/create',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*createShipment\)/
        );

        const profileSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'profile.html'), 'utf8');
        assert.match(profileSource, /escapeHtml\(order\.tracking_no\)/);
        assert.match(profileSource, /\['http:', 'https:'\]\.includes\(parsedTrackingUrl\.protocol\)/);
        assert.match(profileSource, /trackUrl = escapeHtml\(parsedTrackingUrl\.href\)/);
        assert.match(profileSource, /Taşıyıcı takip bağlantısı doğrulanmadı\./);
        assert.match(profileSource, /trackUrl\s*\?\s*`<a href=/);
        assert.doesNotMatch(profileSource, /let trackUrl = '#'/);
        assert.doesNotMatch(profileSource, /<strong>\$\{order\.tracking_no\}<\/strong>/);

        console.log('manual shipment mutation smoke passed');
    } finally {
        pool.connect = originalPoolConnect;
        pool.query = originalPoolQuery;
        if (originalFlag === undefined) {
            delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
        } else {
            process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = originalFlag;
        }
        await pool.end().catch(() => {});
    }
})().catch((error) => {
    pool.connect = originalPoolConnect;
    pool.query = originalPoolQuery;
    if (originalFlag === undefined) {
        delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
    } else {
        process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = originalFlag;
    }
    console.error(error);
    process.exitCode = 1;
});
