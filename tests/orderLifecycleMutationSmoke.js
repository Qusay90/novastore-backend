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
process.env.NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED = 'true';

const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { cancelOrder, deleteOrder, updateOrderStatus } = require('../controllers/orderController');
const { createShipment } = require('../controllers/shipmentController');
const { requireAdminCommerceCapabilityIfClaimed } = require('../middlewares/adminCommerceCapability');
const { requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');
const {
    ADMIN_ORDER_CANCEL_NOTE_MAX_LENGTH,
    ADMIN_ORDER_CANCEL_REASON_CODES,
    validateAdminOrderCancellationRequest
} = require('../services/adminOrderCancellationPolicy');

const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;

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

const cloneRow = (row) => (row ? { ...row } : row);

const createLifecycleState = ({ order = {}, payment = {} } = {}) => ({
    order: {
        id: 7001,
        user_id: null,
        status: ORDER_STATUS.HAZIRLANIYOR,
        payment_status: PAYMENT_STATUS.PAID,
        payment_ref: 'PAY-7001',
        refund_status: REFUND_STATUS.NONE,
        items: JSON.stringify([{ id: 101, name: 'Test Telefon', quantity: 2 }]),
        ...order
    },
    payment: {
        id: 5001,
        provider: 'paytr',
        payment_ref: 'PAY-7001',
        status: PAYMENT_STATUS.PAID,
        raw_request: JSON.stringify({ stockReserved: true, finalizesOnWebhook: true }),
        raw_response: '{}',
        created_at: '2026-07-14T10:00:00.000Z',
        ...payment
    },
    calls: [],
    stockReleaseCount: 0,
    paymentProofUpdates: 0,
    orderUpdates: 0,
    orderEvents: 0,
    eventPayloads: [],
    releasedQuantity: 0
});

const createLifecycleClient = (state) => ({
    async query(sql, params = []) {
        const text = String(sql).trim();
        state.calls.push({ sql: text, params });

        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };

        if (/FROM orders o[\s\S]*LEFT JOIN shipments/i.test(text) && /WHERE o\.id = \$1/i.test(text)) {
            return { rows: state.order ? [cloneRow(state.order)] : [] };
        }

        if (/FROM payments/i.test(text) && /WHERE order_id = \$1/i.test(text)) {
            const payments = state.payments || (state.payment ? [state.payment] : []);
            return { rows: payments.map(cloneRow) };
        }

        if (/SELECT payload[\s\S]*FROM order_events/i.test(text)) {
            const payload = state.eventPayloads.at(-1);
            return { rows: payload ? [{ payload: cloneRow(payload) }] : [] };
        }

        if (/UPDATE products\s+SET stock = stock \+/i.test(text)) {
            state.stockReleaseCount += 1;
            state.releasedQuantity += Number(params[0]);
            return { rows: [{ id: Number(params[1]), stock: 9 }], rowCount: 1 };
        }

        if (/WITH RECURSIVE category_tree|FROM category_stats/i.test(text)) {
            return { rows: [], rowCount: 0 };
        }

        if (/UPDATE payments/i.test(text)) {
            state.paymentProofUpdates += 1;
            const releaseMetadata = JSON.parse(params[0]);
            const previousRawRequest = typeof state.payment.raw_request === 'string'
                ? JSON.parse(state.payment.raw_request)
                : state.payment.raw_request;
            state.payment.raw_request = JSON.stringify({ ...previousRawRequest, ...releaseMetadata });
            return { rows: [{ id: Number(params[1]) }], rowCount: 1 };
        }

        if (/UPDATE orders/i.test(text)) {
            state.orderUpdates += 1;
            state.order = {
                ...state.order,
                status: params[0],
                cancel_reason: params[1],
                refund_status: params[2]
            };
            return { rows: [], rowCount: 1 };
        }

        if (/INSERT INTO order_events/i.test(text)) {
            state.orderEvents += 1;
            state.eventPayloads.push(params[3] ? JSON.parse(params[3]) : null);
            return { rows: [{ id: state.orderEvents }], rowCount: 1 };
        }

        throw new Error(`Unexpected lifecycle fake query: ${text}`);
    },
    release() {
        state.released = true;
    }
});

const runGenericStatus = async ({ currentStatus, requestedStatus, expectedStatus }) => {
    const calls = [];
    const client = {
        async query(sql, params = []) {
            const text = String(sql).trim();
            calls.push({ sql: text, params });
            if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
            if (/FROM orders o[\s\S]*LEFT JOIN shipments/i.test(text)) {
                return {
                    rows: [{
                        id: 7101,
                        status: currentStatus,
                        payment_status: PAYMENT_STATUS.PAID,
                        refund_status: REFUND_STATUS.NONE
                    }]
                };
            }
            throw new Error(`Generic status path must not mutate data: ${text}`);
        },
        release() {}
    };
    pool.connect = async () => client;
    const response = createResponse();
    await updateOrderStatus({
        params: { id: '7101' },
        body: {
            status: requestedStatus,
            ...(expectedStatus ? { expected_status: expectedStatus } : {})
        },
        user: { id: 17, role: 'admin' }
    }, response);
    return { calls, response };
};

const runCancellation = async (state, body = {}, request = {}) => {
    const client = createLifecycleClient(state);
    pool.connect = async () => client;
    const response = createResponse();
    await cancelOrder({
        params: { id: String(state.order.id) },
        body: {
            reason_code: 'CUSTOMER_REQUEST',
            expected_status: state.order.status,
            ...body
        },
        headers: request.withoutIdempotencyKey
            ? {}
            : { 'idempotency-key': request.idempotencyKey || 'cancel-7001-attempt-1' },
        user: request.user || { id: 17, role: 'admin' },
        ...(request.currentAdmin ? { currentAdmin: request.currentAdmin } : {})
    }, response);
    return response;
};

(async () => {
    try {
        assert.deepEqual(ADMIN_ORDER_CANCEL_REASON_CODES, [
            'CUSTOMER_REQUEST',
            'DUPLICATE_ORDER',
            'INVENTORY_UNAVAILABLE',
            'DELIVERY_ADDRESS_UNRESOLVED',
            'POLICY_OR_FRAUD_REVIEW'
        ]);
        assert.equal(ADMIN_ORDER_CANCEL_NOTE_MAX_LENGTH, 300);
        assert.deepEqual(
            validateAdminOrderCancellationRequest({
                expected_status: ORDER_STATUS.HAZIRLANIYOR,
                reason_code: 'POLICY_OR_FRAUD_REVIEW',
                note: 'İnsan incelemesi kaydı'
            }),
            {
                expectedStatus: ORDER_STATUS.HAZIRLANIYOR,
                reasonCode: 'POLICY_OR_FRAUD_REVIEW',
                note: 'İnsan incelemesi kaydı'
            }
        );

        const sameState = await runGenericStatus({
            currentStatus: ORDER_STATUS.HAZIRLANIYOR,
            requestedStatus: ORDER_STATUS.HAZIRLANIYOR,
            expectedStatus: ORDER_STATUS.HAZIRLANIYOR
        });
        assert.equal(sameState.response.statusCode, 200);
        assert.equal(sameState.response.payload.reused, true);
        assert.deepEqual(
            sameState.calls.filter(({ sql }) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)).map(({ sql }) => sql),
            ['BEGIN', 'COMMIT']
        );
        const sameStateRead = sameState.calls.find(({ sql }) => /FROM orders o/i.test(sql));
        assert(sameStateRead);
        assert.match(sameStateRead.sql, /FOR UPDATE OF o/i);
        assert.equal(sameState.calls.some(({ sql }) => /^(UPDATE|INSERT|DELETE)\b/i.test(sql)), false);

        const genericMutation = await runGenericStatus({
            currentStatus: ORDER_STATUS.HAZIRLANIYOR,
            requestedStatus: ORDER_STATUS.KARGOYA_VERILDI
        });
        assert.equal(genericMutation.response.statusCode, 409);
        assert.equal(genericMutation.response.payload.code, 'ORDER_STATUS_COMMAND_REQUIRED');
        assert.equal(genericMutation.calls.some(({ sql }) => /^(UPDATE|INSERT|DELETE)\b/i.test(sql)), false);
        assert.equal(genericMutation.calls.at(-1).sql, 'ROLLBACK');

        let poolCalls = 0;
        pool.connect = async () => {
            poolCalls += 1;
            throw new Error('disabled controller must not acquire a database client');
        };
        pool.query = async () => {
            poolCalls += 1;
            throw new Error('disabled controller must not issue SQL');
        };

        const deleteResponse = createResponse();
        await deleteOrder({ params: { id: '7001' } }, deleteResponse);
        assert.equal(deleteResponse.statusCode, 410);
        assert.equal(deleteResponse.payload.code, 'ORDER_HARD_DELETE_DISABLED');

        const shipmentResponse = createResponse();
        await createShipment({ params: { orderId: '7001' }, body: {}, user: { id: 17, role: 'admin' } }, shipmentResponse);
        assert.equal(shipmentResponse.statusCode, 410);
        assert.equal(shipmentResponse.payload.code, 'SHIPMENT_CREATE_DISABLED');
        assert.equal(poolCalls, 0);

        process.env.NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED = 'false';
        const cancelCapabilityGate = requireAdminCommerceCapabilityIfClaimed('orderCancelWrite');
        let disabledGateNextCalls = 0;
        const disabledGateResponse = createResponse();
        await cancelCapabilityGate(
            { user: { id: 17, role: 'admin' } },
            disabledGateResponse,
            () => { disabledGateNextCalls += 1; }
        );
        assert.equal(disabledGateResponse.statusCode, 503);
        assert.equal(disabledGateResponse.payload.code, 'ADMIN_ORDER_CANCEL_WRITE_DISABLED');
        assert.equal(disabledGateNextCalls, 0, 'disabled capability must stop before current-admin DB guard');

        let customerGateNextCalls = 0;
        await cancelCapabilityGate(
            { user: { id: 42, role: 'customer' } },
            createResponse(),
            () => { customerGateNextCalls += 1; }
        );
        assert.equal(customerGateNextCalls, 1, 'customer cancellation path must bypass the admin write flag');

        const disabledAdminCancel = createResponse();
        await cancelOrder({
            params: { id: '7001' },
            body: {
                reason_code: 'CUSTOMER_REQUEST',
                expected_status: ORDER_STATUS.HAZIRLANIYOR
            },
            user: { id: 17, role: 'admin' },
            currentAdmin: { id: 17, role: 'admin' }
        }, disabledAdminCancel);
        assert.equal(disabledAdminCancel.statusCode, 503);
        assert.equal(disabledAdminCancel.payload.code, 'ADMIN_ORDER_CANCEL_WRITE_DISABLED');
        assert.equal(poolCalls, 0, 'disabled admin cancellation must not acquire an order database client');

        process.env.NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED = 'true';
        const invalidAdminBodies = [
            {
                body: { reason_code: 'CUSTOMER_REQUEST' },
                code: 'ORDER_EXPECTED_STATUS_REQUIRED'
            },
            {
                body: { reason_code: 'ADMIN_REQUEST', expected_status: ORDER_STATUS.HAZIRLANIYOR },
                code: 'ORDER_CANCEL_REASON_INVALID'
            },
            {
                body: {
                    reason_code: 'POLICY_OR_FRAUD_REVIEW',
                    expected_status: ORDER_STATUS.HAZIRLANIYOR
                },
                code: 'ORDER_CANCEL_NOTE_REQUIRED'
            },
            {
                body: {
                    reason_code: 'INVENTORY_UNAVAILABLE',
                    expected_status: ORDER_STATUS.HAZIRLANIYOR,
                    note: 'x'.repeat(301)
                },
                code: 'ORDER_CANCEL_NOTE_TOO_LONG'
            }
        ];
        for (const { body, code } of invalidAdminBodies) {
            const response = createResponse();
            await cancelOrder({
                params: { id: '7001' },
                body,
                user: { id: 17, role: 'admin' },
                currentAdmin: { id: 17, role: 'admin' }
            }, response);
            assert.equal(response.statusCode, 400);
            assert.equal(response.payload.code, code);
        }
        assert.equal(poolCalls, 0, 'invalid admin cancellation input must fail before database access');

        const missingIdempotencyKey = createResponse();
        await cancelOrder({
            params: { id: '7001' },
            body: {
                reason_code: 'CUSTOMER_REQUEST',
                expected_status: ORDER_STATUS.HAZIRLANIYOR
            },
            headers: {},
            user: { id: 17, role: 'admin' },
            currentAdmin: { id: 17, role: 'admin' }
        }, missingIdempotencyKey);
        assert.equal(missingIdempotencyKey.statusCode, 400);
        assert.equal(missingIdempotencyKey.payload.code, 'ORDER_CANCEL_IDEMPOTENCY_KEY_REQUIRED');
        assert.equal(poolCalls, 0, 'missing idempotency key must fail before database access');

        process.env.NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED = 'false';
        const customerCancellationState = createLifecycleState({ order: { user_id: 0 } });
        const customerCancellation = await runCancellation(
            customerCancellationState,
            { expected_status: undefined },
            { user: { id: 0, role: 'customer' } }
        );
        assert.equal(customerCancellation.statusCode, 200);
        assert.equal(customerCancellation.payload.reused, false);
        assert.equal(customerCancellationState.order.status, ORDER_STATUS.IPTAL_EDILDI);
        assert.deepEqual(customerCancellationState.eventPayloads[0].actor, { id: 0, role: 'customer' });
        process.env.NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED = 'true';

        const staleAdminState = createLifecycleState();
        const staleAdminCancellation = await runCancellation(staleAdminState, {
            expected_status: ORDER_STATUS.ONAY_BEKLIYOR
        });
        assert.equal(staleAdminCancellation.statusCode, 409);
        assert.equal(staleAdminCancellation.payload.code, 'ORDER_STATUS_CONFLICT');
        assert.equal(staleAdminCancellation.payload.details.currentStatus, ORDER_STATUS.HAZIRLANIYOR);
        assert.equal(staleAdminCancellation.payload.details.refetchRequired, true);
        assert.equal(staleAdminState.stockReleaseCount, 0);
        assert.equal(staleAdminState.orderUpdates, 0);
        assert.equal(staleAdminState.orderEvents, 0);
        assert.equal(staleAdminState.calls.at(-1).sql, 'ROLLBACK');

        const cancellationState = createLifecycleState();
        const firstCancellation = await runCancellation(cancellationState, {
            expected_status: ORDER_STATUS.HAZIRLANIYOR,
            note: 'Müşteri talebi'
        }, { currentAdmin: { id: 17, role: 'admin' } });
        assert.equal(firstCancellation.statusCode, 200);
        assert.equal(firstCancellation.payload.reused, false);
        assert.equal(firstCancellation.payload.refund.status, REFUND_STATUS.PENDING);
        assert.equal(firstCancellation.payload.refund.providerExecuted, false);
        assert.equal(firstCancellation.payload.refund.manualReviewRequired, true);
        assert.equal(cancellationState.stockReleaseCount, 1);
        assert.equal(cancellationState.releasedQuantity, 2);
        assert.equal(cancellationState.paymentProofUpdates, 1);
        assert.equal(cancellationState.orderUpdates, 1);
        assert.equal(cancellationState.orderEvents, 1);
        assert.equal(cancellationState.order.status, ORDER_STATUS.IPTAL_EDILDI);
        assert.equal(cancellationState.order.refund_status, REFUND_STATUS.PENDING);
        assert.equal(cancellationState.order.cancel_reason, 'Müşteri talebi');
        assert.doesNotMatch(cancellationState.order.cancel_reason, /Müşteri talebi -/);

        const cancellationEvent = cancellationState.eventPayloads[0];
        assert.equal(cancellationEvent.command, 'cancel');
        assert.equal(cancellationEvent.idempotencyKey, 'cancel-7001-attempt-1');
        assert.match(cancellationEvent.requestFingerprint, /^[a-f0-9]{64}$/);
        assert.equal(cancellationEvent.reasonCode, 'CUSTOMER_REQUEST');
        assert.equal(cancellationEvent.note, 'Müşteri talebi');
        assert.deepEqual(cancellationEvent.actor, { id: 17, role: 'admin' });
        assert.deepEqual(cancellationEvent.before, {
            status: ORDER_STATUS.HAZIRLANIYOR,
            refundStatus: REFUND_STATUS.NONE
        });
        assert.deepEqual(cancellationEvent.after, {
            status: ORDER_STATUS.IPTAL_EDILDI,
            refundStatus: REFUND_STATUS.PENDING
        });
        assert.deepEqual(cancellationEvent.providerRefund, {
            executed: false,
            manualReviewRequired: true
        });

        const releaseProof = JSON.parse(cancellationState.payment.raw_request);
        assert.equal(releaseProof.stockReserved, false);
        assert.equal(releaseProof.stockReleaseReason, 'CUSTOMER_REQUEST');
        assert.equal(releaseProof.stockReleaseCommand, 'cancel');
        assert.match(releaseProof.stockReleasedAt, /^\d{4}-\d{2}-\d{2}T/);

        const firstOrderLockIndex = cancellationState.calls.findIndex(({ sql }) => /FROM orders o[\s\S]*FOR UPDATE OF o/i.test(sql));
        const firstPaymentLockIndex = cancellationState.calls.findIndex(({ sql }) => /FROM payments[\s\S]*FOR UPDATE/i.test(sql));
        const firstStockWriteIndex = cancellationState.calls.findIndex(({ sql }) => /UPDATE products\s+SET stock = stock \+/i.test(sql));
        const firstPaymentProofIndex = cancellationState.calls.findIndex(({ sql }) => /UPDATE payments/i.test(sql));
        const firstOrderWriteIndex = cancellationState.calls.findIndex(({ sql }) => /UPDATE orders/i.test(sql));
        const firstCommitIndex = cancellationState.calls.findIndex(({ sql }) => sql === 'COMMIT');
        assert(firstOrderLockIndex > 0, 'order row must be locked after BEGIN');
        assert(firstPaymentLockIndex > firstOrderLockIndex, 'payment proof must be locked after the order');
        assert(firstStockWriteIndex > firstPaymentLockIndex, 'stock release must happen only after both locks');
        assert(firstPaymentProofIndex > firstStockWriteIndex, 'release proof must be persisted in the same transaction');
        assert(firstOrderWriteIndex > firstPaymentProofIndex, 'order cancellation follows reservation release proof');
        assert(firstCommitIndex > firstOrderWriteIndex, 'transaction commits only after all mutation writes');

        const callsBeforeReplay = cancellationState.calls.length;
        const replayCancellation = await runCancellation(cancellationState, {
            expected_status: ORDER_STATUS.HAZIRLANIYOR,
            note: 'Müşteri talebi'
        });
        assert.equal(replayCancellation.statusCode, 200);
        assert.equal(replayCancellation.payload.reused, true);
        assert.equal(replayCancellation.payload.refund.providerExecuted, false);
        assert.equal(replayCancellation.payload.refund.manualReviewRequired, true);
        assert.equal(cancellationState.stockReleaseCount, 1, 'repeated admin cancellation must not inflate stock');
        assert.equal(cancellationState.paymentProofUpdates, 1, 'repeated cancellation must not rewrite release proof');
        assert.equal(cancellationState.orderUpdates, 1, 'repeated cancellation must not rewrite the order');
        assert.equal(cancellationState.orderEvents, 1, 'repeated cancellation must not append another event');
        const replayCalls = cancellationState.calls.slice(callsBeforeReplay);
        assert.match(replayCalls.find(({ sql }) => /FROM orders o/i.test(sql)).sql, /FOR UPDATE OF o/i);
        assert.match(replayCalls.find(({ sql }) => /FROM payments/i.test(sql)).sql, /FOR UPDATE/i);
        assert.deepEqual(
            replayCalls.filter(({ sql }) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)).map(({ sql }) => sql),
            ['BEGIN', 'COMMIT']
        );
        assert.equal(replayCalls.some(({ sql }) => /UPDATE products|UPDATE payments|UPDATE orders|INSERT INTO order_events/i.test(sql)), false);

        const conflictingReplay = await runCancellation(
            cancellationState,
            {
                expected_status: ORDER_STATUS.HAZIRLANIYOR,
                note: 'Farklı içerik'
            },
            { idempotencyKey: 'cancel-7001-attempt-2' }
        );
        assert.equal(conflictingReplay.statusCode, 409);
        assert.equal(conflictingReplay.payload.code, 'ORDER_CANCEL_IDEMPOTENCY_CONFLICT');
        assert.equal(conflictingReplay.payload.details.refetchRequired, true);
        assert.equal(cancellationState.stockReleaseCount, 1);
        assert.equal(cancellationState.orderUpdates, 1);
        assert.equal(cancellationState.orderEvents, 1);
        assert.equal(cancellationState.calls.at(-1).sql, 'ROLLBACK');

        const pendingState = createLifecycleState({
            order: {
                status: ORDER_STATUS.ODEME_BEKLIYOR,
                payment_status: PAYMENT_STATUS.REQUIRES_ACTION
            },
            payment: {
                status: PAYMENT_STATUS.REQUIRES_ACTION,
                raw_request: JSON.stringify({ stockReserved: false, finalizesOnWebhook: true })
            }
        });
        const pendingCancellation = await runCancellation(pendingState);
        assert.equal(pendingCancellation.statusCode, 409);
        assert.equal(pendingCancellation.payload.code, 'ORDER_PAYMENT_PENDING_CANCELLATION_BLOCKED');
        assert.equal(pendingState.stockReleaseCount, 0);
        assert.equal(pendingState.paymentProofUpdates, 0);
        assert.equal(pendingState.orderUpdates, 0);
        assert.equal(pendingState.orderEvents, 0);
        assert.equal(pendingState.calls.at(-1).sql, 'ROLLBACK');

        const hiddenPaymentState = createLifecycleState();
        hiddenPaymentState.payments = [
            hiddenPaymentState.payment,
            {
                id: 4999,
                provider: 'paytr',
                payment_ref: 'OLD-PENDING-7001',
                status: PAYMENT_STATUS.REQUIRES_ACTION,
                raw_request: JSON.stringify({ stockReserved: false, finalizesOnWebhook: true })
            }
        ];
        const hiddenPaymentCancellation = await runCancellation(hiddenPaymentState);
        assert.equal(hiddenPaymentCancellation.statusCode, 409);
        assert.equal(hiddenPaymentCancellation.payload.code, 'ORDER_PAYMENT_HISTORY_CONFLICT');
        assert.equal(hiddenPaymentState.stockReleaseCount, 0);
        assert.equal(hiddenPaymentState.paymentProofUpdates, 0);
        assert.equal(hiddenPaymentState.orderUpdates, 0);
        assert.equal(hiddenPaymentState.orderEvents, 0);
        const paymentLock = hiddenPaymentState.calls.find(({ sql }) => /FROM payments/i.test(sql));
        assert.match(paymentLock.sql, /WHERE order_id = \$1[\s\S]*FOR UPDATE/i);
        assert.doesNotMatch(paymentLock.sql, /payment_ref\s*=\s*\$2/i);

        for (const blockedStatus of [ORDER_STATUS.KARGOYA_VERILDI, ORDER_STATUS.IADE_EDILDI]) {
            const blockedState = createLifecycleState({ order: { status: blockedStatus } });
            const blockedCancellation = await runCancellation(blockedState);
            assert.equal(blockedCancellation.statusCode, 409);
            assert.equal(blockedCancellation.payload.code, 'ORDER_TRANSITION_NOT_ALLOWED');
            assert.equal(blockedState.stockReleaseCount, 0);
            assert.equal(blockedState.paymentProofUpdates, 0);
            assert.equal(blockedState.orderUpdates, 0);
            assert.equal(blockedState.orderEvents, 0);
            assert.equal(blockedState.calls.at(-1).sql, 'ROLLBACK');
        }

        const orderRouteSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'orderRoutes.js'), 'utf8');
        const shipmentRouteSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'shipmentRoutes.js'), 'utf8');
        const returnRouteSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'returnRoutes.js'), 'utf8');
        const notificationRouteSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'notificationRoutes.js'), 'utf8');
        assert.match(orderRouteSource, /router\.get\('\/',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*getAllOrders\)/);
        assert.match(orderRouteSource, /router\.get\('\/user\/:userId',\s*authenticate,\s*requireSelfOrAdmin\('userId'\),\s*requireCurrentAdminIfClaimed,\s*getUserOrders\)/);
        assert.match(
            orderRouteSource,
            /router\.post\(\s*'\/:id\/cancel',\s*authenticate,\s*requireAdminCommerceCapabilityIfClaimed\('orderCancelWrite'\),\s*requireCurrentAdminIfClaimed,\s*cancelOrder\s*\)/
        );
        assert.match(orderRouteSource, /router\.put\('\/:id\/status',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*updateOrderStatus\)/);
        assert.match(orderRouteSource, /router\.delete\('\/:id',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*deleteOrder\)/);
        assert.match(shipmentRouteSource, /router\.post\('\/:orderId\/create',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*createShipment\)/);
        assert.match(shipmentRouteSource, /router\.get\('\/:orderId',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*getShipment\)/);
        assert.match(returnRouteSource, /router\.post\('\/',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*createReturnRequest\)/);
        assert.match(returnRouteSource, /router\.get\('\/admin\/all',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*getAllReturnRequests\)/);
        assert.match(returnRouteSource, /router\.patch\('\/:id\/status',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*updateReturnStatus\)/);
        assert.match(returnRouteSource, /router\.get\('\/:id',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*getReturnById\)/);
        assert.match(notificationRouteSource, /router\.get\('\/user\/:userId',\s*authenticate,\s*requireSelfOrAdmin\('userId'\),\s*requireCurrentAdminIfClaimed,\s*getUserNotifications\)/);
        assert.match(notificationRouteSource, /router\.get\('\/admin',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*getAdminNotifications\)/);
        assert.match(notificationRouteSource, /router\.patch\('\/:id\/read',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*markAsRead\)/);
        assert.match(notificationRouteSource, /router\.patch\('\/read-all\/:userId',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*markAllAsRead\)/);
        assert.match(notificationRouteSource, /router\.post\('\/test',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*sendTestNotification\)/);

        let currentAdminQueries = 0;
        let storedRole = 'customer';
        pool.query = async (_sql, params) => {
            currentAdminQueries += 1;
            return { rows: [{ id: params[0], role: storedRole }] };
        };
        let customerNextCalls = 0;
        await requireCurrentAdminIfClaimed(
            { user: { id: 42, role: 'customer' } },
            createResponse(),
            () => { customerNextCalls += 1; }
        );
        assert.equal(customerNextCalls, 1);
        assert.equal(currentAdminQueries, 0, 'customer paths must not query the admin-role guard');

        const demotedResponse = createResponse();
        let demotedNextCalls = 0;
        await requireCurrentAdminIfClaimed(
            { user: { id: 17, role: 'admin' } },
            demotedResponse,
            () => { demotedNextCalls += 1; }
        );
        assert.equal(currentAdminQueries, 1);
        assert.equal(demotedNextCalls, 0);
        assert.equal(demotedResponse.statusCode, 403);

        storedRole = 'admin';
        const activeAdminRequest = { user: { id: 17, role: 'admin' } };
        let activeAdminNextCalls = 0;
        await requireCurrentAdminIfClaimed(
            activeAdminRequest,
            createResponse(),
            () => { activeAdminNextCalls += 1; }
        );
        assert.equal(currentAdminQueries, 2);
        assert.equal(activeAdminNextCalls, 1);
        assert.deepEqual(activeAdminRequest.currentAdmin, { id: 17, role: 'admin' });

        console.log('order lifecycle mutation smoke passed');
    } finally {
        pool.connect = originalPoolConnect;
        pool.query = originalPoolQuery;
        await pool.end().catch(() => {});
    }
})().catch((error) => {
    pool.connect = originalPoolConnect;
    pool.query = originalPoolQuery;
    console.error(error);
    process.exitCode = 1;
});
