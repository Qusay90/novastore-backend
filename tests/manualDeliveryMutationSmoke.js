'use strict';

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
process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = 'true';

const pool = require('../config/db');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    SHIPMENT_STATUS
} = require('../constants/orderStatus');
const { confirmManualDelivery } = require('../controllers/shipmentController');
const { loadRegistry } = require('../scripts/staging-migrations/registry');

const originalPoolConnect = pool.connect;
const originalFlag = process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
const clone = (row) => (row ? { ...row } : row);

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
});

const createState = ({
    order = {},
    shipment = {},
    sellerOrders = [],
    packages = [],
    outboxFailure = false
} = {}) => ({
    order: {
        id: 7001,
        user_id: 44,
        status: ORDER_STATUS.KARGOYA_VERILDI,
        payment_status: PAYMENT_STATUS.PAID,
        refund_status: REFUND_STATUS.NONE,
        shipment_status: SHIPMENT_STATUS.IN_TRANSIT,
        shipment_provider: 'Yurtiçi Kargo',
        tracking_no: 'YK-2026-000123',
        delivered_at: null,
        ...order
    },
    shipment: {
        id: 8801,
        order_id: 7001,
        provider: 'Yurtiçi Kargo',
        tracking_no: 'YK-2026-000123',
        tracking_url: null,
        shipment_status: SHIPMENT_STATUS.IN_TRANSIT,
        eta_date: null,
        label_url: null,
        raw_payload: '{}',
        created_at: '2026-09-02T10:00:00.000Z',
        updated_at: '2026-09-02T10:00:00.000Z',
        ...shipment
    },
    sellerOrders: sellerOrders.map(clone),
    packages: packages.map(clone),
    calls: [],
    shipmentUpdates: 0,
    sellerPackageUpdates: 0,
    sellerOrderUpdates: 0,
    sellerTransitions: 0,
    sellerTransitionPayload: null,
    orderUpdates: 0,
    orderEvents: 0,
    outboxInserts: 0,
    outboxFailure,
    eventPayload: null,
    released: false
});

const createClient = (state) => ({
    async query(sql, params = []) {
        const text = String(sql).trim();
        state.calls.push({ sql: text, params });
        if (text === 'BEGIN') {
            state.transactionSnapshot = {
                order: clone(state.order),
                shipment: clone(state.shipment),
                sellerOrders: state.sellerOrders.map(clone),
                packages: state.packages.map(clone),
                shipmentUpdates: state.shipmentUpdates,
                sellerPackageUpdates: state.sellerPackageUpdates,
                sellerOrderUpdates: state.sellerOrderUpdates,
                sellerTransitions: state.sellerTransitions,
                sellerTransitionPayload: clone(state.sellerTransitionPayload),
                orderUpdates: state.orderUpdates,
                orderEvents: state.orderEvents,
                outboxInserts: state.outboxInserts,
                eventPayload: clone(state.eventPayload)
            };
            return { rows: [] };
        }
        if (text === 'COMMIT') {
            state.transactionSnapshot = null;
            return { rows: [] };
        }
        if (text === 'ROLLBACK') {
            if (state.transactionSnapshot) Object.assign(state, state.transactionSnapshot);
            state.transactionSnapshot = null;
            return { rows: [] };
        }
        if (/FROM orders\s+WHERE id = \$1\s+FOR UPDATE/i.test(text)) {
            return { rows: state.order ? [clone(state.order)] : [] };
        }
        if (/FROM shipments\s+WHERE order_id = \$1\s+FOR UPDATE/i.test(text)) {
            return { rows: state.shipment ? [clone(state.shipment)] : [] };
        }
        if (/FROM seller_orders[\s\S]*WHERE canonical_order_id = \$1[\s\S]*FOR UPDATE NOWAIT/i.test(text)) {
            return { rows: state.sellerOrders.map(clone) };
        }
        if (/FROM seller_fulfillment_packages[\s\S]*FOR UPDATE NOWAIT/i.test(text)) {
            return {
                rows: state.packages.filter((pkg) => (
                    String(pkg.organization_id) === String(params[0])
                    && String(pkg.seller_order_id) === String(params[1])
                )).map(clone)
            };
        }
        if (/SELECT payload[\s\S]*event_type = 'MANUAL_DELIVERY_CONFIRMED'/i.test(text)) {
            return { rows: state.eventPayload ? [{ payload: clone(state.eventPayload) }] : [] };
        }
        if (/UPDATE shipments[\s\S]*SET shipment_status/i.test(text)) {
            const [nextStatus, shipmentId, orderId, expectedStatus, provider, trackingNo] = params;
            if (
                !state.shipment
                || Number(state.shipment.id) !== Number(shipmentId)
                || Number(state.shipment.order_id) !== Number(orderId)
                || state.shipment.shipment_status !== expectedStatus
                || state.shipment.provider !== provider
                || state.shipment.tracking_no !== trackingNo
            ) return { rows: [], rowCount: 0 };
            state.shipment.shipment_status = nextStatus;
            state.shipment.updated_at = '2026-09-02T11:00:00.000Z';
            state.shipmentUpdates += 1;
            return { rows: [clone(state.shipment)], rowCount: 1 };
        }
        if (/UPDATE seller_fulfillment_packages[\s\S]*SET status = 'delivered'/i.test(text)) {
            const [organizationId, sellerOrderId, provider, trackingNo] = params;
            const matches = state.packages.filter((pkg) => (
                String(pkg.organization_id) === String(organizationId)
                && String(pkg.seller_order_id) === String(sellerOrderId)
                && pkg.status === 'shipped'
                && pkg.carrier_name === provider
                && pkg.tracking_number === trackingNo
            ));
            for (const pkg of matches) {
                pkg.status = 'delivered';
                pkg.revision = Number(pkg.revision) + 1;
            }
            state.sellerPackageUpdates += matches.length;
            return { rows: matches.map(({ id }) => ({ id })), rowCount: matches.length };
        }
        if (/UPDATE seller_orders[\s\S]*SET status = 'delivered'/i.test(text)) {
            const [orderId, organizationId, sellerOrderId, revision] = params;
            const row = state.sellerOrders.find((entry) => (
                Number(entry.canonical_order_id) === Number(orderId)
                && String(entry.organization_id) === String(organizationId)
                && String(entry.id) === String(sellerOrderId)
                && Number(entry.revision) === Number(revision)
                && entry.status === 'shipped'
            ));
            if (!row) return { rows: [], rowCount: 0 };
            row.status = 'delivered';
            row.revision = Number(row.revision) + 1;
            state.sellerOrderUpdates += 1;
            return { rows: [{ revision: row.revision }], rowCount: 1 };
        }
        if (/INSERT INTO seller_order_transitions/i.test(text)) {
            state.sellerTransitions += 1;
            state.sellerTransitionPayload = {
                organizationId: params[0],
                storeId: params[1],
                sellerOrderId: params[2],
                packageId: params[3],
                idempotencyKey: params[4]
            };
            return { rows: [{ id: state.sellerTransitions }], rowCount: 1 };
        }
        if (/UPDATE orders[\s\S]*SET status = \$1[\s\S]*delivered_at/i.test(text)) {
            const [nextStatus, nextShipmentStatus, orderId, expectedStatus, expectedShipmentStatus,
                expectedPaymentStatus, expectedRefundStatus, provider, trackingNo] = params;
            if (
                Number(state.order.id) !== Number(orderId)
                || state.order.status !== expectedStatus
                || state.order.shipment_status !== expectedShipmentStatus
                || state.order.payment_status !== expectedPaymentStatus
                || state.order.refund_status !== expectedRefundStatus
                || state.order.shipment_provider !== provider
                || state.order.tracking_no !== trackingNo
            ) return { rows: [], rowCount: 0 };
            state.order.status = nextStatus;
            state.order.shipment_status = nextShipmentStatus;
            state.order.delivered_at = '2026-09-02T11:00:00.000Z';
            state.orderUpdates += 1;
            return { rows: [clone(state.order)], rowCount: 1 };
        }
        if (/INSERT INTO order_events/i.test(text)) {
            state.orderEvents += 1;
            state.eventPayload = JSON.parse(params[3]);
            return { rows: [{ id: state.orderEvents }], rowCount: 1 };
        }
        if (/INSERT INTO notification_outbox_events/i.test(text)) {
            state.outboxInserts += 1;
            if (state.outboxFailure) throw new Error('simulated delivery notification outbox failure');
            return { rows: [{ id: params[0], inserted: true }], rowCount: 1 };
        }
        throw new Error(`Unexpected manual delivery fake query: ${text}`);
    },
    release() { state.released = true; }
});

const request = ({ idempotencyKey = 'delivery-7001-attempt-1', body = {} } = {}) => ({
    params: { orderId: '7001' },
    headers: { 'idempotency-key': idempotencyKey },
    body: {
        expected_status: ORDER_STATUS.KARGOYA_VERILDI,
        expected_shipment_status: SHIPMENT_STATUS.IN_TRANSIT,
        delivery_confirmed: true,
        provider: 'Yurtiçi Kargo',
        tracking_no: 'YK-2026-000123',
        ...body
    },
    user: { id: 17, role: 'admin', principal: 'admin' },
    currentAdmin: { id: 17, role: 'admin', principal: 'admin' }
});

const run = async (state, options = {}) => {
    pool.connect = async () => createClient(state);
    const response = createResponse();
    await confirmManualDelivery(request(options), response);
    return response;
};

(async () => {
    try {
        delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
        let disabledConnects = 0;
        pool.connect = async () => { disabledConnects += 1; throw new Error('disabled must not connect'); };
        const disabledResponse = createResponse();
        await confirmManualDelivery(request(), disabledResponse);
        assert.equal(disabledResponse.statusCode, 503);
        assert.equal(disabledResponse.payload.code, 'MANUAL_FULFILLMENT_DISABLED');
        assert.equal(disabledConnects, 0);
        process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = 'true';

        let validationConnects = 0;
        pool.connect = async () => { validationConnects += 1; throw new Error('invalid must not connect'); };
        for (const [body, code] of [
            [{ expected_status: ORDER_STATUS.TESLIM_EDILDI }, 'MANUAL_DELIVERY_EXPECTED_STATUS_INVALID'],
            [{ expected_shipment_status: SHIPMENT_STATUS.DELIVERED }, 'MANUAL_DELIVERY_EXPECTED_SHIPMENT_STATUS_INVALID'],
            [{ delivery_confirmed: false }, 'MANUAL_DELIVERY_CONFIRMATION_REQUIRED'],
            [{ arbitrary_status: 'anything' }, 'MANUAL_DELIVERY_UNSUPPORTED_FIELD']
        ]) {
            const response = createResponse();
            await confirmManualDelivery(request({ body }), response);
            assert.equal(response.statusCode, 400);
            assert.equal(response.payload.code, code);
        }
        assert.equal(validationConnects, 0);

        const platformState = createState();
        const platformResponse = await run(platformState);
        assert.equal(platformResponse.statusCode, 200);
        assert.equal(platformResponse.payload.reused, false);
        assert.equal(platformResponse.payload.order.status, ORDER_STATUS.TESLIM_EDILDI);
        assert.equal(platformResponse.payload.order.shipmentStatus, SHIPMENT_STATUS.DELIVERED);
        assert.equal(platformResponse.payload.shipment.shipmentStatus, SHIPMENT_STATUS.DELIVERED);
        assert.equal(platformResponse.payload.order.deliveredAt, '2026-09-02T11:00:00.000Z');
        assert.deepEqual(platformResponse.payload.sellerProjection, {
            matchedCount: 0,
            packageCount: 0,
            consistent: true,
            changed: false
        });
        assert.equal(platformState.shipmentUpdates, 1);
        assert.equal(platformState.orderUpdates, 1);
        assert.equal(platformState.orderEvents, 1);
        assert.equal(platformState.outboxInserts, 1);
        assert.equal(platformState.released, true);
        assert.equal(platformState.eventPayload.command, 'delivery_confirm');
        assert.equal(platformState.eventPayload.idempotencyKey, 'delivery-7001-attempt-1');
        assert.match(platformState.eventPayload.requestFingerprint, /^[a-f0-9]{64}$/u);
        assert.equal(platformState.eventPayload.trackingLast4, '0123');
        assert.match(platformState.eventPayload.trackingHash, /^[a-f0-9]{64}$/u);

        const orderLock = platformState.calls.findIndex(({ sql }) => /FROM orders[\s\S]*FOR UPDATE/i.test(sql));
        const shipmentLock = platformState.calls.findIndex(({ sql }) => /FROM shipments[\s\S]*FOR UPDATE/i.test(sql));
        const sellerLock = platformState.calls.findIndex(({ sql }) => /FROM seller_orders[\s\S]*FOR UPDATE NOWAIT/i.test(sql));
        const shipmentWrite = platformState.calls.findIndex(({ sql }) => /UPDATE shipments/i.test(sql));
        const orderWrite = platformState.calls.findIndex(({ sql }) => /UPDATE orders/i.test(sql));
        const eventWrite = platformState.calls.findIndex(({ sql }) => /INSERT INTO order_events/i.test(sql));
        const outboxWrite = platformState.calls.findIndex(({ sql }) => /INSERT INTO notification_outbox_events/i.test(sql));
        const commit = platformState.calls.findIndex(({ sql }) => sql === 'COMMIT');
        assert(orderLock > 0);
        assert(shipmentLock > orderLock);
        assert(sellerLock > shipmentLock);
        assert(shipmentWrite > sellerLock);
        assert(orderWrite > shipmentWrite);
        assert(eventWrite > orderWrite);
        assert(outboxWrite > eventWrite);
        assert(commit > outboxWrite);

        const writesBeforeReplay = {
            shipment: platformState.shipmentUpdates,
            order: platformState.orderUpdates,
            events: platformState.orderEvents,
            outbox: platformState.outboxInserts
        };
        const replayResponse = await run(platformState);
        assert.equal(replayResponse.statusCode, 200);
        assert.equal(replayResponse.payload.reused, true);
        assert.deepEqual({
            shipment: platformState.shipmentUpdates,
            order: platformState.orderUpdates,
            events: platformState.orderEvents,
            outbox: platformState.outboxInserts
        }, writesBeforeReplay);
        const conflictResponse = await run(platformState, { idempotencyKey: 'delivery-7001-attempt-2' });
        assert.equal(conflictResponse.statusCode, 409);
        assert.equal(conflictResponse.payload.code, 'MANUAL_DELIVERY_IDEMPOTENCY_CONFLICT');
        assert.equal(platformState.calls.at(-1).sql, 'ROLLBACK');

        const sellerState = createState({
            sellerOrders: [{
                id: 9101,
                canonical_order_id: 7001,
                organization_id: 9201,
                store_id: 9301,
                status: 'shipped',
                revision: 4
            }],
            packages: [{
                id: 9401,
                organization_id: 9201,
                store_id: 9301,
                seller_order_id: 9101,
                status: 'shipped',
                carrier_name: 'Yurtiçi Kargo',
                tracking_number: 'YK-2026-000123',
                revision: 3
            }]
        });
        const sellerResponse = await run(sellerState);
        assert.equal(sellerResponse.statusCode, 200);
        assert.equal(sellerResponse.payload.reused, false);
        assert.deepEqual(sellerResponse.payload.sellerProjection, {
            matchedCount: 1,
            packageCount: 1,
            consistent: true,
            changed: true
        });
        assert.equal(sellerState.sellerOrders[0].status, 'delivered');
        assert.equal(sellerState.packages[0].status, 'delivered');
        assert.equal(sellerState.sellerOrderUpdates, 1);
        assert.equal(sellerState.sellerPackageUpdates, 1);
        assert.equal(sellerState.sellerTransitions, 1);

        const rollbackState = createState({
            sellerOrders: [{
                id: 9111,
                canonical_order_id: 7001,
                organization_id: 9211,
                store_id: 9311,
                status: 'shipped',
                revision: 2
            }],
            packages: [{
                id: 9411,
                organization_id: 9211,
                store_id: 9311,
                seller_order_id: 9111,
                status: 'shipped',
                carrier_name: 'Yurtiçi Kargo',
                tracking_number: 'YK-2026-000123',
                revision: 2
            }],
            outboxFailure: true
        });
        const rollbackResponse = await run(rollbackState);
        assert.equal(rollbackResponse.statusCode, 500);
        assert.equal(rollbackResponse.payload.code, 'MANUAL_DELIVERY_FAILED');
        assert.equal(rollbackState.order.status, ORDER_STATUS.KARGOYA_VERILDI);
        assert.equal(rollbackState.order.shipment_status, SHIPMENT_STATUS.IN_TRANSIT);
        assert.equal(rollbackState.shipment.shipment_status, SHIPMENT_STATUS.IN_TRANSIT);
        assert.equal(rollbackState.sellerOrders[0].status, 'shipped');
        assert.equal(rollbackState.packages[0].status, 'shipped');
        assert.equal(rollbackState.sellerTransitions, 0);
        assert.equal(rollbackState.orderEvents, 0);
        assert.equal(rollbackState.outboxInserts, 0);
        assert.equal(rollbackState.calls.at(-1).sql, 'ROLLBACK');
        assert.equal(rollbackState.calls.some(({ sql }) => sql === 'COMMIT'), false);
        assert.deepEqual(sellerState.sellerTransitionPayload, {
            organizationId: 9201,
            storeId: 9301,
            sellerOrderId: 9101,
            packageId: 9401,
            idempotencyKey: 'delivery-7001-attempt-1'
        });
        const sellerReplay = await run(sellerState);
        assert.equal(sellerReplay.statusCode, 200);
        assert.equal(sellerReplay.payload.reused, true);
        assert.equal(sellerState.sellerOrderUpdates, 1);
        assert.equal(sellerState.sellerPackageUpdates, 1);
        assert.equal(sellerState.sellerTransitions, 1);

        const multiSellerState = createState({
            sellerOrders: [
                { id: 1, canonical_order_id: 7001, organization_id: 1, store_id: 1, status: 'shipped', revision: 1 },
                { id: 2, canonical_order_id: 7001, organization_id: 2, store_id: 2, status: 'shipped', revision: 1 }
            ]
        });
        const multiSellerResponse = await run(multiSellerState);
        assert.equal(multiSellerResponse.statusCode, 409);
        assert.equal(multiSellerResponse.payload.code, 'MANUAL_DELIVERY_MULTI_SELLER_UNSUPPORTED');
        assert.equal(multiSellerState.shipmentUpdates, 0);
        assert.equal(multiSellerState.orderUpdates, 0);
        assert.equal(multiSellerState.calls.at(-1).sql, 'ROLLBACK');

        const mismatchState = createState();
        const mismatchResponse = await run(mismatchState, { body: { tracking_no: 'YK-2026-DIFFERENT' } });
        assert.equal(mismatchResponse.statusCode, 409);
        assert.equal(mismatchResponse.payload.code, 'MANUAL_DELIVERY_TRACKING_CONFLICT');
        assert.equal(mismatchState.shipmentUpdates, 0);
        assert.equal(mismatchState.orderUpdates, 0);

        const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'shipmentRoutes.js'), 'utf8');
        assert.match(
            routeSource,
            /router\.post\(\s*'\/:orderId\/manual-delivery-confirmation',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*requireAdminCommerceCapability\('manualShipmentWrite'\),\s*confirmManualDelivery\s*\)/u
        );

        const migrationPath = path.join(__dirname, '..', 'migrations', '20260902_01_seller_package_delivery_status.sql');
        const migrationSource = fs.readFileSync(migrationPath, 'utf8');
        assert.match(migrationSource, /^BEGIN;/u);
        assert.match(migrationSource, /DROP CONSTRAINT IF EXISTS chk_seller_fulfillment_packages_status/u);
        assert.match(
            migrationSource,
            /CHECK \(status IN \('pending', 'prepared', 'shipped', 'delivered'\)\)/u
        );
        assert.match(
            migrationSource,
            /CHECK \(command IN \('prepare', 'ship', 'cancel_request', 'delivery_confirm'\)\)/u
        );
        assert.match(migrationSource, /COMMIT;\s*$/u);
        const registry = loadRegistry();
        const deliveryMigrationId = '20260902_01_seller_package_delivery_status';
        const deliveryMigrationPath = 'migrations/20260902_01_seller_package_delivery_status.sql';
        const packageFoundationMigrationId = '20260806_02_seller_wave3_business_verticals';
        const deliveryMigrationIndex = registry.findIndex(({ id }) => id === deliveryMigrationId);
        const packageFoundationMigrationIndex = registry.findIndex(({ id }) => id === packageFoundationMigrationId);
        assert.notEqual(deliveryMigrationIndex, -1, 'The package delivery migration must remain in the registry.');
        assert.equal(
            registry.filter(({ id }) => id === deliveryMigrationId).length,
            1,
            'The package delivery migration id must be unique.'
        );
        assert.equal(
            registry.filter(({ path: migrationRegistryPath }) => migrationRegistryPath === deliveryMigrationPath).length,
            1,
            'The package delivery migration path must be unique.'
        );
        assert.equal(registry[deliveryMigrationIndex].path, deliveryMigrationPath);
        assert.notEqual(
            packageFoundationMigrationIndex,
            -1,
            'The seller fulfillment package foundation migration must remain in the registry.'
        );
        assert(
            deliveryMigrationIndex > packageFoundationMigrationIndex,
            'The package delivery migration must run after the seller fulfillment package foundation.'
        );

        console.log('manual delivery mutation smoke passed');
    } finally {
        pool.connect = originalPoolConnect;
        if (originalFlag === undefined) delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
        else process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = originalFlag;
        await pool.end().catch(() => {});
    }
})().catch((error) => {
    pool.connect = originalPoolConnect;
    if (originalFlag === undefined) delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
    else process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = originalFlag;
    console.error(error);
    process.exitCode = 1;
});
