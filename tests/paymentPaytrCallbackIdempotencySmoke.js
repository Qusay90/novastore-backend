const assert = require('assert');
const express = require('express');
const http = require('http');
const Module = require('module');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { buildPaytrCallbackHash } = require('../services/paytrPaymentService');

const trackedEnv = [
    'NODE_ENV',
    'PAYMENT_PROVIDER',
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
    'PAYTR_BASE_URL',
    'PAYTR_CALLBACK_URL',
    'PAYTR_SUCCESS_URL',
    'PAYTR_FAIL_URL',
    'PAYTR_TEST_MODE',
    'PAYTR_DEBUG_ON'
];

const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;
const originalModuleLoad = Module._load;
let failServerModuleLoad = false;

const merchantOid = 'NST-PAYTR-8001-abcdef1234567890';

const restoreState = () => {
    for (const key of trackedEnv) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
    pool.connect = originalPoolConnect;
    pool.query = originalPoolQuery;
    Module._load = originalModuleLoad;
    failServerModuleLoad = false;
};

const applyPaytrEnv = () => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_PROVIDER = 'paytr';
    process.env.PAYTR_MERCHANT_ID = 'merchant-id';
    process.env.PAYTR_MERCHANT_KEY = 'merchant-key-secret';
    process.env.PAYTR_MERCHANT_SALT = 'merchant-salt-secret';
    process.env.PAYTR_BASE_URL = 'https://www.paytr.com';
    process.env.PAYTR_CALLBACK_URL = 'https://example.test/api/payments/webhook/paytr';
    process.env.PAYTR_SUCCESS_URL = 'https://example.test/payment-result.html';
    process.env.PAYTR_FAIL_URL = 'https://example.test/payment-result.html';
    process.env.PAYTR_TEST_MODE = 'true';
    process.env.PAYTR_DEBUG_ON = 'true';
};

const buildPayload = (overrides = {}) => {
    const payload = {
        merchant_oid: merchantOid,
        status: 'failed',
        total_amount: '104990',
        failed_reason_code: '99',
        failed_reason_msg: 'Bank declined',
        ...overrides
    };
    return {
        ...payload,
        hash: buildPaytrCallbackHash({
            merchantOid: payload.merchant_oid,
            status: payload.status,
            totalAmount: payload.total_amount,
            merchantKey: process.env.PAYTR_MERCHANT_KEY,
            merchantSalt: process.env.PAYTR_MERCHANT_SALT
        })
    };
};

const createPaymentState = (overrides = {}) => ({
    webhookProcessed: false,
    paymentFound: true,
    provider: 'paytr',
    paymentRef: merchantOid,
    paymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
    orderPaymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
    orderStatus: ORDER_STATUS.ODEME_BEKLIYOR,
    orderRefundStatus: REFUND_STATUS.NONE,
    amount: '1049.90',
    orderTotalAmount: '1049.90',
    stockDecrements: 0,
    stockRestocks: 0,
    couponIncrements: 0,
    couponDecrements: 0,
    orderEvents: 0,
    paymentSuccessEvents: 0,
    orderItemWrites: 0,
    paymentFailedEvents: 0,
    paymentFailureReconciliationEvents: 0,
    paymentReconciliationEvents: 0,
    paymentReconciliationRequiredEvents: 0,
    reconciliationMetadataWrites: 0,
    reconciliationTask: null,
    staleFailureEvents: 0,
    refundedConflictEvents: 0,
    paymentPaidUpdates: 0,
    paymentFailedUpdates: 0,
    orderPaidUpdates: 0,
    orderFailedUpdates: 0,
    webhookProcessedUpdates: 0,
    notificationInserts: 0,
    successNotificationInserts: 0,
    failedNotificationInserts: 0,
    reconciliationNotificationInserts: 0,
    durableReconciliationNotificationInserts: 0,
    cartDeletes: 0,
    queries: [],
    ...overrides
});

const makePaymentRow = (state) => ({
    id: 5001,
    order_id: 8001,
    orderId: 8001,
    provider: state.provider,
    payment_ref: state.paymentRef,
    amount: state.amount,
    status: state.paymentStatus,
    raw_request: JSON.stringify(state.rawRequest || {
        coupon: { applied: true, couponId: 901 },
        stockReserved: false,
        finalizesOnWebhook: true
    }),
    items: JSON.stringify([{ id: 101, name: 'Test Telefon', quantity: 1 }]),
    user_id: 10,
    customer_name: 'Test Kullanici',
    order_status: state.orderStatus,
    order_payment_status: state.orderPaymentStatus,
    order_refund_status: state.orderRefundStatus,
    order_total_amount: state.orderTotalAmount
});

const createFakeClient = (state) => ({
    async query(sql, params = []) {
        state.queries.push({ sql, params });

        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return { rows: [] };
        }

        if (/INSERT INTO webhook_events/i.test(sql)) {
            return { rows: [{ id: 8001, processed: state.webhookProcessed }] };
        }

        if (/SELECT p\.\*/i.test(sql)) {
            return { rows: state.paymentFound ? [makePaymentRow(state)] : [] };
        }

        if (/UPDATE products\s+SET stock = stock -/i.test(sql)) {
            state.stockDecrements += 1;
            return { rows: [{ id: params[1], stock: 4 }] };
        }

        if (/UPDATE products\s+SET stock = stock \+/i.test(sql)) {
            state.stockRestocks += 1;
            return { rows: [{ id: params[1], stock: 6 }] };
        }

        if (/UPDATE coupons SET used_count = used_count \+/i.test(sql)) {
            state.couponIncrements += 1;
            return { rows: [] };
        }

        if (/UPDATE coupons SET used_count = used_count -/i.test(sql)) {
            state.couponDecrements += 1;
            return { rows: [] };
        }

        if (/UPDATE payments/i.test(sql)) {
            if (params[0] === PAYMENT_STATUS.PAID) {
                state.paymentPaidUpdates += 1;
                state.paymentStatus = PAYMENT_STATUS.PAID;
            }
            if (params[0] === PAYMENT_STATUS.FAILED) {
                state.paymentFailedUpdates += 1;
                state.paymentStatus = PAYMENT_STATUS.FAILED;
            }
            for (const value of params) {
                if (typeof value !== 'string' || !value.startsWith('{')) continue;
                let metadata = null;
                try {
                    metadata = JSON.parse(value);
                } catch (_) {}
                if (metadata?.reconciliationTask?.status === 'OPEN') {
                    state.reconciliationMetadataWrites += 1;
                    state.reconciliationTask = metadata.reconciliationTask;
                }
            }
            return { rows: /RETURNING id/i.test(sql) ? [{ id: 5001 }] : [] };
        }

        if (/UPDATE orders/i.test(sql)) {
            if (params[0] === PAYMENT_STATUS.PAID) {
                state.orderPaidUpdates += 1;
                state.orderPaymentStatus = PAYMENT_STATUS.PAID;
                if (/\bstatus\s*=\s*\$2/i.test(sql)) state.orderStatus = params[1];
                if (/refund_status\s*=\s*\$2/i.test(sql)) state.orderRefundStatus = params[1];
            }
            if (params[0] === PAYMENT_STATUS.FAILED) {
                state.orderFailedUpdates += 1;
                state.orderPaymentStatus = PAYMENT_STATUS.FAILED;
                if (/\bstatus\s*=\s*\$2/i.test(sql)) state.orderStatus = params[1];
                if (/refund_status\s*=\s*\$4/i.test(sql)) state.orderRefundStatus = params[3];
            }
            return { rows: [] };
        }

        if (/INSERT INTO order_events/i.test(sql)) {
            state.orderEvents += 1;
            if (params[1] === 'PAYMENT_SUCCESS') state.paymentSuccessEvents += 1;
            if (params[1] === 'PAYMENT_FAILED') state.paymentFailedEvents += 1;
            if (params[1] === 'PAYMENT_FAILURE_RECONCILIATION') state.paymentFailureReconciliationEvents += 1;
            if (params[1] === 'PAYMENT_CAPTURE_RECONCILIATION') state.paymentReconciliationEvents += 1;
            if (params[1] === 'PAYMENT_STALE_FAILURE_IGNORED') state.staleFailureEvents += 1;
            if (params[1] === 'PAYMENT_REFUNDED_CAPTURE_CONFLICT') state.refundedConflictEvents += 1;
            if (params[1] === 'PAYMENT_RECONCILIATION_REQUIRED') state.paymentReconciliationRequiredEvents += 1;
            return { rows: [] };
        }

        if (/INSERT INTO notifications/i.test(sql)) {
            state.notificationInserts += 1;
            state.reconciliationNotificationInserts += 1;
            state.durableReconciliationNotificationInserts += 1;
            return {
                rows: [{
                    id: state.notificationInserts,
                    user_id: null,
                    type: params[0],
                    message: params[1]
                }]
            };
        }

        if (/INSERT INTO order_items/i.test(sql)) {
            state.orderItemWrites += 1;
            return { rows: [{ id: 1 }], rowCount: 1 };
        }

        if (/UPDATE webhook_events SET processed = TRUE/i.test(sql)) {
            state.webhookProcessedUpdates += 1;
            state.webhookProcessed = true;
            return { rows: [] };
        }

        if (/DELETE FROM carts|DELETE FROM cart|UPDATE carts|UPDATE cart/i.test(sql)) {
            state.cartDeletes += 1;
            return { rows: [] };
        }

        if (/category_stats|WITH RECURSIVE category_tree/i.test(sql)) {
            return { rows: [], rowCount: 0 };
        }

        throw new Error(`Unexpected PayTR idempotency query: ${sql}`);
    },
    release() {}
});

const createAppServer = (state) => new Promise((resolve) => {
    const paymentRoutes = require('../routes/paymentRoutes');
    pool.connect = async () => createFakeClient(state);
    pool.query = async (sql, params = []) => {
        if (/INSERT INTO notifications/i.test(sql)) {
            state.notificationInserts += 1;
            const message = String(params[2] || '');
            if (message.includes('başarıyla') || message.includes('kesinleşti')) {
                state.successNotificationInserts += 1;
            }
            if (message.includes('başarısız')) {
                state.failedNotificationInserts += 1;
            }
            if (message.includes('mutabakatı gerekli')) {
                state.reconciliationNotificationInserts += 1;
            }
            return {
                rows: [{
                    id: state.notificationInserts,
                    user_id: params[0] || null,
                    type: params[1],
                    message: params[2]
                }]
            };
        }
        if (/INSERT INTO notification_audit_logs/i.test(sql)) {
            return { rows: [] };
        }
        throw new Error(`Unexpected pool query: ${sql}`);
    };

    const app = express();
    app.use(express.json());
    app.use('/api/payments', paymentRoutes);
    const server = app.listen(0, () => resolve(server));
});

const postForm = (server, path, payload) => new Promise((resolve, reject) => {
    const body = new URLSearchParams(payload).toString();
    const { port } = server.address();
    const req = http.request({
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed = null;
            try {
                parsed = JSON.parse(text);
            } catch (_) {}
            resolve({ statusCode: res.statusCode, text, body: parsed });
        });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
});

const withServer = async (state, fn) => {
    let server = null;
    try {
        server = await createAppServer(state);
        return await fn(server);
    } finally {
        if (server) await new Promise((resolve) => server.close(resolve));
    }
};

const assertNoFailureSideEffects = (state) => {
    assert.strictEqual(state.stockDecrements, 0);
    assert.strictEqual(state.stockRestocks, 0);
    assert.strictEqual(state.couponIncrements, 0);
    assert.strictEqual(state.couponDecrements, 0);
    assert.strictEqual(state.successNotificationInserts, 0);
    assert.strictEqual(state.cartDeletes, 0);
};

const assertNoAnyFinalizationSideEffects = (state) => {
    assertNoFailureSideEffects(state);
    assert.strictEqual(state.orderEvents, 0);
    assert.strictEqual(state.paymentPaidUpdates, 0);
    assert.strictEqual(state.paymentFailedUpdates, 0);
    assert.strictEqual(state.orderPaidUpdates, 0);
    assert.strictEqual(state.orderFailedUpdates, 0);
    assert.strictEqual(state.notificationInserts, 0);
    assert.strictEqual(state.orderItemWrites, 0);
};

const assertNoSecrets = (response, state) => {
    const responseText = response.text || '';
    const queryText = JSON.stringify(state.queries);
    assert.strictEqual(responseText.includes('merchant-key-secret'), false);
    assert.strictEqual(responseText.includes('merchant-salt-secret'), false);
    assert.strictEqual(queryText.includes('merchant-key-secret'), false);
    assert.strictEqual(queryText.includes('merchant-salt-secret'), false);
};

(async () => {
    try {
        applyPaytrEnv();
        Module._load = function patchedLoad(request, parent, isMain) {
            if (request === '../server' || request.endsWith('/server')) {
                if (failServerModuleLoad) throw new Error('notification server unavailable');
                return { io: null };
            }
            return originalModuleLoad.call(this, request, parent, isMain);
        };

        const failedState = createPaymentState();
        await withServer(failedState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(failedState.paymentStatus, PAYMENT_STATUS.FAILED);
            assert.strictEqual(failedState.orderPaymentStatus, PAYMENT_STATUS.FAILED);
            assert.strictEqual(failedState.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
            assert.strictEqual(failedState.paymentFailedUpdates, 1);
            assert.strictEqual(failedState.orderFailedUpdates, 1);
            assert.strictEqual(failedState.paymentFailedEvents, 1);
            assert.strictEqual(failedState.notificationInserts, 1);
            assert.strictEqual(failedState.failedNotificationInserts, 1);
            assertNoFailureSideEffects(failedState);
            assertNoSecrets(response, failedState);
        });

        const duplicateFailedState = createPaymentState({ webhookProcessed: true });
        await withServer(duplicateFailedState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assertNoAnyFinalizationSideEffects(duplicateFailedState);
        });

        const successState = createPaymentState();
        await withServer(successState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({
                status: 'success',
                failed_reason_code: '',
                failed_reason_msg: ''
            }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(successState.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successState.orderPaymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successState.orderStatus, ORDER_STATUS.HAZIRLANIYOR);
            assert.strictEqual(successState.stockDecrements, 1);
            assert.strictEqual(successState.couponIncrements, 1);
            assert.strictEqual(successState.notificationInserts, 2);
            assert.strictEqual(successState.successNotificationInserts, 2);
            assert.strictEqual(successState.paymentSuccessEvents, 1);
            assert.strictEqual(successState.orderItemWrites, 1);
            const lockQuery = successState.queries.find((call) => /WITH locked_order AS MATERIALIZED/i.test(call.sql));
            assert.ok(lockQuery, 'callback must lock the order before the payment row');
            assert.ok(lockQuery.sql.indexOf('FOR UPDATE OF o') < lockQuery.sql.indexOf('FOR UPDATE OF p'));
        });

        const duplicateSuccessState = createPaymentState({ webhookProcessed: true });
        await withServer(duplicateSuccessState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({
                status: 'success',
                failed_reason_code: '',
                failed_reason_msg: ''
            }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assertNoAnyFinalizationSideEffects(duplicateSuccessState);
        });

        const successThenFailedState = createPaymentState({
            paymentStatus: PAYMENT_STATUS.PAID,
            orderPaymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: ORDER_STATUS.HAZIRLANIYOR
        });
        await withServer(successThenFailedState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(successThenFailedState.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successThenFailedState.orderPaymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successThenFailedState.orderStatus, ORDER_STATUS.HAZIRLANIYOR);
            assertNoFailureSideEffects(successThenFailedState);
            assert.strictEqual(successThenFailedState.paymentPaidUpdates, 0);
            assert.strictEqual(successThenFailedState.paymentFailedUpdates, 0);
            assert.strictEqual(successThenFailedState.orderPaidUpdates, 0);
            assert.strictEqual(successThenFailedState.orderFailedUpdates, 0);
            assert.strictEqual(successThenFailedState.orderItemWrites, 0);
            assert.strictEqual(successThenFailedState.staleFailureEvents, 1);
            assert.strictEqual(successThenFailedState.notificationInserts, 1);
            assert.strictEqual(successThenFailedState.reconciliationNotificationInserts, 1);
            assert.strictEqual(successThenFailedState.durableReconciliationNotificationInserts, 1);
            assert.strictEqual(successThenFailedState.reconciliationMetadataWrites, 1);
            assert.strictEqual(successThenFailedState.paymentReconciliationRequiredEvents, 1);
            assert.strictEqual(successThenFailedState.reconciliationTask.status, 'OPEN');
            assert.strictEqual(successThenFailedState.reconciliationTask.reasonCode, 'FAILURE_AFTER_CAPTURE');
            assert.strictEqual(successThenFailedState.webhookProcessedUpdates, 1);
        });

        const failedThenSuccessState = createPaymentState({
            paymentStatus: PAYMENT_STATUS.FAILED,
            orderPaymentStatus: PAYMENT_STATUS.FAILED,
            orderStatus: ORDER_STATUS.IPTAL_EDILDI
        });
        await withServer(failedThenSuccessState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({
                status: 'success',
                failed_reason_code: '',
                failed_reason_msg: ''
            }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(failedThenSuccessState.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(failedThenSuccessState.orderPaymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(failedThenSuccessState.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
            assert.strictEqual(failedThenSuccessState.orderRefundStatus, REFUND_STATUS.PENDING);
            assert.strictEqual(failedThenSuccessState.paymentPaidUpdates, 1);
            assert.strictEqual(failedThenSuccessState.orderPaidUpdates, 1);
            assert.strictEqual(failedThenSuccessState.paymentReconciliationEvents, 1);
            assert.strictEqual(failedThenSuccessState.stockDecrements, 0);
            assert.strictEqual(failedThenSuccessState.stockRestocks, 0);
            assert.strictEqual(failedThenSuccessState.couponIncrements, 0);
            assert.strictEqual(failedThenSuccessState.orderItemWrites, 0);
            assert.strictEqual(failedThenSuccessState.successNotificationInserts, 0);
            assert.strictEqual(failedThenSuccessState.reconciliationNotificationInserts, 1);
            assert.strictEqual(failedThenSuccessState.durableReconciliationNotificationInserts, 1);
            assert.strictEqual(failedThenSuccessState.reconciliationMetadataWrites, 1);
            assert.strictEqual(failedThenSuccessState.paymentReconciliationRequiredEvents, 1);
            assert.strictEqual(failedThenSuccessState.webhookProcessedUpdates, 1);
        });

        const failedEventInsert = successThenFailedState.queries.find((call) => /INSERT INTO webhook_events/i.test(call.sql));
        const successEventInsert = failedThenSuccessState.queries.find((call) => /INSERT INTO webhook_events/i.test(call.sql));
        assert.ok(failedEventInsert);
        assert.ok(successEventInsert);
        assert.notStrictEqual(
            failedEventInsert.params[0],
            successEventInsert.params[0],
            'PayTR opposite outcomes must use distinct idempotency event keys'
        );

        const captureAfterCancelState = createPaymentState({
            orderStatus: ORDER_STATUS.IPTAL_EDILDI
        });
        await withServer(captureAfterCancelState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({
                status: 'success',
                failed_reason_code: '',
                failed_reason_msg: ''
            }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(captureAfterCancelState.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(captureAfterCancelState.orderPaymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(captureAfterCancelState.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
            assert.strictEqual(captureAfterCancelState.orderRefundStatus, REFUND_STATUS.PENDING);
            assert.strictEqual(captureAfterCancelState.paymentReconciliationEvents, 1);
            assert.strictEqual(captureAfterCancelState.stockDecrements, 0);
            assert.strictEqual(captureAfterCancelState.stockRestocks, 0);
            assert.strictEqual(captureAfterCancelState.couponIncrements, 0);
            assert.strictEqual(captureAfterCancelState.orderItemWrites, 0);
            assert.strictEqual(captureAfterCancelState.successNotificationInserts, 0);
            assert.strictEqual(captureAfterCancelState.reconciliationNotificationInserts, 1);
            assert.strictEqual(captureAfterCancelState.durableReconciliationNotificationInserts, 1);
            assert.strictEqual(captureAfterCancelState.reconciliationMetadataWrites, 1);
            assert.strictEqual(captureAfterCancelState.paymentReconciliationRequiredEvents, 1);
        });

        const refundedCaptureState = createPaymentState({
            paymentStatus: PAYMENT_STATUS.REFUNDED,
            orderPaymentStatus: PAYMENT_STATUS.REFUNDED,
            orderStatus: ORDER_STATUS.IADE_EDILDI,
            orderRefundStatus: REFUND_STATUS.COMPLETED
        });
        await withServer(refundedCaptureState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({
                status: 'success',
                failed_reason_code: '',
                failed_reason_msg: ''
            }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(refundedCaptureState.paymentStatus, PAYMENT_STATUS.REFUNDED);
            assert.strictEqual(refundedCaptureState.orderPaymentStatus, PAYMENT_STATUS.REFUNDED);
            assert.strictEqual(refundedCaptureState.orderStatus, ORDER_STATUS.IADE_EDILDI);
            assert.strictEqual(refundedCaptureState.refundedConflictEvents, 1);
            assert.strictEqual(refundedCaptureState.paymentPaidUpdates, 0);
            assert.strictEqual(refundedCaptureState.stockDecrements, 0);
            assert.strictEqual(refundedCaptureState.orderItemWrites, 0);
            assert.strictEqual(refundedCaptureState.reconciliationNotificationInserts, 1);
            assert.strictEqual(refundedCaptureState.durableReconciliationNotificationInserts, 1);
            assert.strictEqual(refundedCaptureState.reconciliationMetadataWrites, 1);
            assert.strictEqual(refundedCaptureState.paymentReconciliationRequiredEvents, 1);
        });

        const reservedFailureState = createPaymentState({
            rawRequest: {
                coupon: { applied: false },
                stockReserved: true,
                finalizesOnWebhook: true
            }
        });
        await withServer(reservedFailureState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(reservedFailureState.paymentStatus, PAYMENT_STATUS.FAILED);
            assert.strictEqual(reservedFailureState.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
            assert.strictEqual(reservedFailureState.stockRestocks, 1);
            assert.strictEqual(reservedFailureState.paymentFailedEvents, 1);
        });

        const unknownReservationFailureState = createPaymentState({ rawRequest: {} });
        await withServer(unknownReservationFailureState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(unknownReservationFailureState.paymentStatus, PAYMENT_STATUS.FAILED);
            assert.strictEqual(unknownReservationFailureState.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
            assert.strictEqual(unknownReservationFailureState.stockRestocks, 0);
            assert.strictEqual(unknownReservationFailureState.paymentFailureReconciliationEvents, 1);
            assert.strictEqual(unknownReservationFailureState.reconciliationNotificationInserts, 1);
            assert.strictEqual(unknownReservationFailureState.durableReconciliationNotificationInserts, 1);
            assert.strictEqual(unknownReservationFailureState.reconciliationMetadataWrites, 1);
            assert.strictEqual(unknownReservationFailureState.paymentReconciliationRequiredEvents, 1);
        });

        const invalidPaymentState = createPaymentState({
            paymentStatus: 'CORRUPT_PROVIDER_STATE'
        });
        await withServer(invalidPaymentState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({
                status: 'success',
                failed_reason_code: '',
                failed_reason_msg: ''
            }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(invalidPaymentState.paymentStatus, 'CORRUPT_PROVIDER_STATE');
            assert.strictEqual(invalidPaymentState.paymentPaidUpdates, 0);
            assert.strictEqual(invalidPaymentState.paymentFailedUpdates, 0);
            assert.strictEqual(invalidPaymentState.reconciliationMetadataWrites, 1);
            assert.strictEqual(invalidPaymentState.paymentReconciliationRequiredEvents, 1);
            assert.strictEqual(invalidPaymentState.durableReconciliationNotificationInserts, 1);
            assert.strictEqual(invalidPaymentState.reconciliationTask.reasonCode, 'UNKNOWN_PAYMENT_STATE');
            assert.strictEqual(invalidPaymentState.webhookProcessedUpdates, 1);
        });

        const notificationFailureReconciliationState = createPaymentState({
            orderStatus: ORDER_STATUS.HAZIRLANIYOR
        });
        await withServer(notificationFailureReconciliationState, async (server) => {
            const capturedNotificationErrors = [];
            const originalConsoleError = console.error;
            failServerModuleLoad = true;
            console.error = (...args) => capturedNotificationErrors.push(args.join(' '));
            let response;
            try {
                response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            } finally {
                failServerModuleLoad = false;
                console.error = originalConsoleError;
            }
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(notificationFailureReconciliationState.paymentStatus, PAYMENT_STATUS.FAILED);
            assert.strictEqual(notificationFailureReconciliationState.reconciliationMetadataWrites, 1);
            assert.strictEqual(notificationFailureReconciliationState.paymentReconciliationRequiredEvents, 1);
            assert.strictEqual(notificationFailureReconciliationState.durableReconciliationNotificationInserts, 1);
            assert.strictEqual(notificationFailureReconciliationState.webhookProcessedUpdates, 1);
            assert.ok(capturedNotificationErrors.length >= 1);
        });

        const providerMismatchState = createPaymentState({ provider: 'iyzico' });
        await withServer(providerMismatchState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 409);
            assertNoAnyFinalizationSideEffects(providerMismatchState);
        });

        const paymentRefMismatchState = createPaymentState({ paymentRef: 'NST-PAYTR-OTHER' });
        await withServer(paymentRefMismatchState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 409);
            assertNoAnyFinalizationSideEffects(paymentRefMismatchState);
        });

        const missingPaymentState = createPaymentState({ paymentFound: false });
        await withServer(missingPaymentState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 404);
            assertNoAnyFinalizationSideEffects(missingPaymentState);
        });

        const amountMismatchState = createPaymentState();
        await withServer(amountMismatchState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({ total_amount: '999' }));
            assert.strictEqual(response.statusCode, 409);
            assertNoAnyFinalizationSideEffects(amountMismatchState);
        });

        const invalidHashState = createPaymentState();
        await withServer(invalidHashState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', { ...buildPayload(), hash: 'bad-hash' });
            assert.strictEqual(response.statusCode, 401);
            assertNoAnyFinalizationSideEffects(invalidHashState);
            assertNoSecrets(response, invalidHashState);
        });

        const missingHashState = createPaymentState();
        await withServer(missingHashState, async (server) => {
            const payload = buildPayload();
            delete payload.hash;
            const response = await postForm(server, '/api/payments/webhook/paytr', payload);
            assert.strictEqual(response.statusCode, 400);
            assertNoAnyFinalizationSideEffects(missingHashState);
            assertNoSecrets(response, missingHashState);
        });

        const unknownStatusState = createPaymentState();
        await withServer(unknownStatusState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({ status: 'pending_review' }));
            assert.strictEqual(response.statusCode, 202);
            assert.strictEqual(response.body.finalizationImplemented, false);
            assertNoAnyFinalizationSideEffects(unknownStatusState);
        });

        console.log('payment PayTR callback idempotency smoke passed');
    } finally {
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exit(1);
});
