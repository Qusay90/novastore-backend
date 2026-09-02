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
const { convergeSellerOrderProjectionsForCancellation } = require('../services/orderService');

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

const createLifecycleState = ({ order = {}, payment = {}, sellerOrders = [] } = {}) => ({
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
    sellerOrders: sellerOrders.map(cloneRow),
    calls: [],
    stockReleaseCount: 0,
    paymentProofUpdates: 0,
    orderUpdates: 0,
    orderEvents: 0,
    eventPayloads: [],
    sellerOrderUpdates: 0,
    sellerOrderTransitions: 0,
    sellerTransitionPayloads: [],
    notificationOutboxInserts: 0,
    notificationOutboxEvent: null,
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

        if (/FROM seller_orders[\s\S]*WHERE canonical_order_id = \$1[\s\S]*FOR UPDATE NOWAIT/i.test(text)) {
            if (state.sellerLockErrorCode) {
                const error = new Error('simulated seller projection lock conflict');
                error.code = state.sellerLockErrorCode;
                throw error;
            }
            return { rows: state.sellerOrders.map(cloneRow) };
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

        if (/UPDATE coupon_reservations/i.test(text)) {
            state.couponReservationReleaseCount = (state.couponReservationReleaseCount || 0) + 1;
            return { rows: [], rowCount: 0 };
        }

        if (/UPDATE seller_orders[\s\S]*SET status = 'cancelled'/i.test(text)) {
            const [, organizationId, sellerOrderId, revision, fromStatus] = params;
            const row = state.sellerOrders.find((entry) => (
                String(entry.organization_id) === String(organizationId)
                && String(entry.id) === String(sellerOrderId)
                && Number(entry.revision) === Number(revision)
                && String(entry.status) === String(fromStatus)
            ));
            if (!row) return { rows: [], rowCount: 0 };
            row.status = 'cancelled';
            row.revision = Number(row.revision) + 1;
            state.sellerOrderUpdates += 1;
            return { rows: [{ revision: row.revision }], rowCount: 1 };
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


        if (/INSERT INTO seller_order_transitions/i.test(text)) {
            state.sellerOrderTransitions += 1;
            state.sellerTransitionPayloads.push({
                organizationId: params[0],
                storeId: params[1],
                sellerOrderId: params[2],
                fromStatus: params[3],
                idempotencyKey: params[4]
            });
            return { rows: [{ id: state.sellerOrderTransitions }], rowCount: 1 };
        }

        if (/INSERT INTO notification_outbox_events/i.test(text)) {
            state.notificationOutboxInserts += 1;
            state.notificationOutboxEvent = {
                id: params[0],
                source_event_key: params[1],
                event_type: params[2],
                aggregate_type: params[3],
                aggregate_id: params[4],
                aggregate_revision: params[5],
                payload: JSON.parse(params[6]),
                status: 'PENDING',
                inserted: true
            };
            return { rows: [cloneRow(state.notificationOutboxEvent)], rowCount: 1 };
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
            { user: { id: 0, principal: 'customer', role: 'customer' } }
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

        const cancellationState = createLifecycleState({
            sellerOrders: [
                { id: 8101, organization_id: 901, store_id: 801, status: 'new', revision: 1 },
                { id: 8102, organization_id: 902, store_id: 802, status: 'cancellation_requested', revision: 2 },
                { id: 8103, organization_id: 903, store_id: 803, status: 'cancelled', revision: 3 }
            ]
        });
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
        assert.equal(cancellationState.notificationOutboxInserts, 1);
        assert.equal(cancellationState.sellerOrderUpdates, 2);
        assert.equal(cancellationState.sellerOrderTransitions, 2);
        assert.deepEqual(cancellationState.sellerOrders.map(({ status, revision }) => ({ status, revision })), [
            { status: 'cancelled', revision: 2 },
            { status: 'cancelled', revision: 3 },
            { status: 'cancelled', revision: 3 }
        ]);
        assert.deepEqual(
            cancellationState.sellerTransitionPayloads.map(({ fromStatus, idempotencyKey }) => ({
                fromStatus,
                idempotencyKey
            })),
            [
                { fromStatus: 'new', idempotencyKey: 'canonical-cancel:7001:seller-order:8101:r1' },
                { fromStatus: 'cancellation_requested', idempotencyKey: 'canonical-cancel:7001:seller-order:8102:r2' }
            ]
        );
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
        assert.deepEqual(cancellationEvent.sellerOrderProjection, {
            matchedCount: 3,
            changedCount: 2,
            reusedCount: 1
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
        const firstSellerLockIndex = cancellationState.calls.findIndex(({ sql }) => /FROM seller_orders[\s\S]*FOR UPDATE NOWAIT/i.test(sql));
        const firstSellerWriteIndex = cancellationState.calls.findIndex(({ sql }) => /UPDATE seller_orders/i.test(sql));
        const firstOrderWriteIndex = cancellationState.calls.findIndex(({ sql }) => /UPDATE orders/i.test(sql));
        const firstCommitIndex = cancellationState.calls.findIndex(({ sql }) => sql === 'COMMIT');
        assert(firstOrderLockIndex > 0, 'order row must be locked after BEGIN');
        assert(firstPaymentLockIndex > firstOrderLockIndex, 'payment proof must be locked after the order');
        assert(firstStockWriteIndex > firstPaymentLockIndex, 'stock release must happen only after both locks');
        assert(firstPaymentProofIndex > firstStockWriteIndex, 'release proof must be persisted in the same transaction');
        assert(firstSellerLockIndex > firstPaymentProofIndex, 'seller projections are locked after reservation release proof');
        assert(firstSellerWriteIndex > firstSellerLockIndex, 'seller projection cancellation follows its row lock');
        assert(firstOrderWriteIndex > firstSellerWriteIndex, 'canonical cancellation follows seller projection convergence');
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
        assert.equal(cancellationState.sellerOrderUpdates, 2, 'repeated cancellation must not rewrite seller projections');
        assert.equal(cancellationState.sellerOrderTransitions, 2, 'repeated cancellation must not duplicate seller transitions');
        const replayCalls = cancellationState.calls.slice(callsBeforeReplay);
        assert.match(replayCalls.find(({ sql }) => /FROM orders o/i.test(sql)).sql, /FOR UPDATE OF o/i);
        assert.match(replayCalls.find(({ sql }) => /FROM payments/i.test(sql)).sql, /FOR UPDATE/i);
        assert.deepEqual(
            replayCalls.filter(({ sql }) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)).map(({ sql }) => sql),
            ['BEGIN', 'COMMIT']
        );
        assert.equal(replayCalls.some(({ sql }) => /UPDATE products|UPDATE payments|UPDATE orders|INSERT INTO order_events/i.test(sql)), false);

        const legacyCancelledProjectionState = createLifecycleState({
            order: {
                user_id: 42,
                status: ORDER_STATUS.IPTAL_EDILDI,
                refund_status: REFUND_STATUS.PENDING
            },
            payment: {
                raw_request: JSON.stringify({
                    stockReserved: false,
                    stockReleaseReason: 'CUSTOMER_REQUEST',
                    stockReleaseCommand: 'cancel',
                    stockReleasedAt: '2026-09-02T10:00:00.000Z'
                })
            },
            sellerOrders: [
                { id: 8120, organization_id: 920, store_id: 820, status: 'new', revision: 7 }
            ]
        });
        const legacyCancelledProjectionReplay = await runCancellation(
            legacyCancelledProjectionState,
            { expected_status: undefined },
            { user: { id: 42, principal: 'customer', role: 'customer' } }
        );
        assert.equal(legacyCancelledProjectionReplay.statusCode, 200);
        assert.equal(legacyCancelledProjectionReplay.payload.reused, true);
        assert.deepEqual(
            legacyCancelledProjectionState.sellerOrders.map(({ status, revision }) => ({ status, revision })),
            [{ status: 'cancelled', revision: 8 }]
        );
        assert.equal(legacyCancelledProjectionState.sellerOrderUpdates, 1);
        assert.equal(legacyCancelledProjectionState.sellerOrderTransitions, 1);
        assert.deepEqual(legacyCancelledProjectionState.sellerTransitionPayloads[0], {
            organizationId: 920,
            storeId: 820,
            sellerOrderId: 8120,
            fromStatus: 'new',
            idempotencyKey: 'canonical-cancel:7001:seller-order:8120:r7'
        });
        assert.equal(legacyCancelledProjectionState.stockReleaseCount, 0);
        assert.equal(legacyCancelledProjectionState.paymentProofUpdates, 0);
        assert.equal(legacyCancelledProjectionState.orderUpdates, 0);
        assert.equal(legacyCancelledProjectionState.orderEvents, 0);
        assert.equal(legacyCancelledProjectionState.notificationOutboxInserts, 0);
        assert.deepEqual(
            legacyCancelledProjectionState.calls
                .filter(({ sql }) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql))
                .map(({ sql }) => sql),
            ['BEGIN', 'COMMIT']
        );

        const fulfilledSellerState = createLifecycleState({
            sellerOrders: [
                { id: 8110, organization_id: 910, store_id: 810, status: 'shipped', revision: 4 }
            ]
        });
        await assert.rejects(
            () => convergeSellerOrderProjectionsForCancellation({
                client: createLifecycleClient(fulfilledSellerState),
                canonicalOrderId: fulfilledSellerState.order.id
            }),
            (error) => error?.code === 'ORDER_SELLER_FULFILLMENT_CONFLICT'
        );
        assert.equal(fulfilledSellerState.sellerOrderUpdates, 0);
        assert.equal(fulfilledSellerState.sellerOrderTransitions, 0);

        const busySellerState = createLifecycleState();
        busySellerState.sellerLockErrorCode = '55P03';
        await assert.rejects(
            () => convergeSellerOrderProjectionsForCancellation({
                client: createLifecycleClient(busySellerState),
                canonicalOrderId: busySellerState.order.id
            }),
            (error) => error?.code === 'ORDER_SELLER_FULFILLMENT_BUSY'
        );

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
        const notificationControllerSource = fs.readFileSync(
            path.join(__dirname, '..', 'controllers', 'notificationController.js'),
            'utf8'
        );
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
        assert.match(
            returnRouteSource,
            /const requireReturnWrite = requireAdminCommerceCapability\('returnWrite'\);/
        );
        assert.match(
            returnRouteSource,
            /router\.patch\('\/:id\/status',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*requireReturnWrite,\s*updateReturnStatus\)/
        );
        assert.match(returnRouteSource, /router\.get\('\/:id',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*getReturnById\)/);
        assert.match(
            notificationRouteSource,
            /router\.get\('\/user\/:userId',\s*authenticate,\s*controller\.getUserNotifications\)/
        );
        assert.match(
            notificationControllerSource,
            /const getUserNotifications = async \(req, res\) => \{\s*if \(Number\(req\.params\.userId\) !== Number\(req\.user\.id\) \|\| req\.user\.principal !== 'customer'\) \{\s*return res\.status\(403\)\.json\(\{ code: 'NOTIFICATION_SCOPE_FORBIDDEN'/
        );
        assert.match(
            notificationRouteSource,
            /router\.get\('\/admin',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*controller\.getAdminNotifications\)/
        );
        assert.match(
            notificationRouteSource,
            /router\.patch\('\/:id\/read',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*controller\.markAsRead\)/
        );
        assert.match(
            notificationRouteSource,
            /router\.patch\('\/read-all\/:userId',\s*authenticate,\s*requireCurrentAdminIfClaimed,\s*controller\.markAllAsReadLegacy\)/
        );
        assert.match(
            notificationControllerSource,
            /const markAllAsReadLegacy = async \(req, res\) => \{[\s\S]*const expected = req\.user\.principal === 'admin' \? 'admin' : String\(req\.user\.id\);[\s\S]*NOTIFICATION_SCOPE_FORBIDDEN[\s\S]*return markAllAsRead\(req, res\);\s*\};/
        );
        assert.match(
            notificationRouteSource,
            /router\.post\('\/test',\s*authenticate,\s*requireAdmin,\s*requireCurrentAdmin,\s*controller\.sendTestNotification\)/
        );

        let currentAdminQueries = 0;
        let storedRole = 'customer';
        pool.query = async (_sql, params) => {
            currentAdminQueries += 1;
            return {
                rows: [{
                    id: params[0],
                    role: storedRole,
                    auth_enabled: true
                }]
            };
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
