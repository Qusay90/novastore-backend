const assert = require('assert');
const Module = require('module');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { buildWebhookSignature } = require('../services/paymentProviderService');
const { webhookIyzico } = require('../controllers/paymentController');

const trackedEnv = [
    'NODE_ENV',
    'IYZICO_WEBHOOK_SECRET',
    'IYZICO_ALLOW_UNSIGNED_WEBHOOKS'
];

const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;
const originalModuleLoad = Module._load;
let failServerModuleLoad = false;

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

const createRes = () => ({
    code: null,
    body: null,
    status(code) {
        this.code = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const createPayload = (overrides = {}) => ({
    eventId: 'iyzico-event-7001',
    paymentRef: 'NST-PMT-7001-secure',
    status: 'SUCCESS',
    paidPrice: '1049.90',
    currency: 'TRY',
    providerTransactionId: 'iyzico-tx-7001',
    ...overrides
});

const createPaymentState = (overrides = {}) => ({
    webhookProcessed: false,
    paymentFound: true,
    provider: 'iyzico',
    paymentRef: 'NST-PMT-7001-secure',
    amount: '1049.90',
    currency: 'TRY',
    paymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
    orderPaymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
    orderStatus: ORDER_STATUS.ODEME_BEKLIYOR,
    orderRefundStatus: REFUND_STATUS.NONE,
    stockUpdates: 0,
    stockRestocks: 0,
    paymentPaidUpdates: 0,
    paymentFailedUpdates: 0,
    orderPaidUpdates: 0,
    orderFailedUpdates: 0,
    orderEvents: 0,
    reconciliationEvents: 0,
    reconciliationRequiredEvents: 0,
    reconciliationMetadataWrites: 0,
    reconciliationTask: null,
    staleFailureEvents: 0,
    refundedConflictEvents: 0,
    orderItemWrites: 0,
    webhookProcessedUpdates: 0,
    notificationInserts: 0,
    reconciliationNotificationInserts: 0,
    durableReconciliationNotificationInserts: 0,
    transactions: [],
    queries: [],
    ...overrides
});

const makePaymentRow = (state) => ({
    id: 5001,
    order_id: 7001,
    provider: state.provider,
    payment_ref: state.paymentRef,
    amount: state.amount,
    currency: state.currency,
    status: state.paymentStatus,
    raw_request: JSON.stringify(state.rawRequest || {
        coupon: { applied: false },
        stockReserved: false,
        finalizesOnWebhook: true
    }),
    items: JSON.stringify([{ id: 101, productId: 101, name: 'Test Telefon', quantity: 1 }]),
    user_id: 10,
    customer_name: 'Test Kullanici',
    order_status: state.orderStatus,
    order_payment_status: state.orderPaymentStatus,
    order_refund_status: state.orderRefundStatus,
    order_total_amount: state.amount
});

const createFakeClient = (state) => ({
    async query(sql, params = []) {
        state.queries.push({ sql, params });

        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            state.transactions.push(sql);
            return { rows: [] };
        }

        if (/INSERT INTO webhook_events/i.test(sql)) {
            return { rows: [{ id: 8001, processed: state.webhookProcessed }] };
        }

        if (/SELECT p\.\*/i.test(sql)) {
            return { rows: state.paymentFound ? [makePaymentRow(state)] : [] };
        }

        if (/UPDATE products\s+SET stock = stock -/i.test(sql)) {
            state.stockUpdates += 1;
            return { rows: [{ id: params[1], stock: 4 }] };
        }

        if (/UPDATE products\s+SET stock = stock \+/i.test(sql)) {
            state.stockRestocks += 1;
            return { rows: [{ id: params[1], stock: 6 }] };
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
            if (params[1] === 'PAYMENT_CAPTURE_RECONCILIATION') state.reconciliationEvents += 1;
            if (params[1] === 'PAYMENT_STALE_FAILURE_IGNORED') state.staleFailureEvents += 1;
            if (params[1] === 'PAYMENT_REFUNDED_CAPTURE_CONFLICT') state.refundedConflictEvents += 1;
            if (params[1] === 'PAYMENT_RECONCILIATION_REQUIRED') state.reconciliationRequiredEvents += 1;
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

        if (/DELETE FROM order_items/i.test(sql)) {
            return { rows: [] };
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

        if (/category_stats|WITH RECURSIVE category_tree/i.test(sql)) {
            return { rows: [], rowCount: 0 };
        }

        throw new Error(`Unexpected Iyzico webhook security query: ${sql}`);
    },
    release() {
        state.released = true;
    }
});

const assertNoFinalizationSideEffects = (state) => {
    assert.strictEqual(state.stockUpdates, 0);
    assert.strictEqual(state.stockRestocks, 0);
    assert.strictEqual(state.paymentPaidUpdates, 0);
    assert.strictEqual(state.paymentFailedUpdates, 0);
    assert.strictEqual(state.orderPaidUpdates, 0);
    assert.strictEqual(state.orderFailedUpdates, 0);
    assert.strictEqual(state.orderEvents, 0);
    assert.strictEqual(state.orderItemWrites, 0);
    assert.strictEqual(state.webhookProcessedUpdates, 0);
    assert.strictEqual(state.notificationInserts, 0);
};

const configureBaseTestRuntime = () => {
    process.env.NODE_ENV = 'test';
    delete process.env.IYZICO_WEBHOOK_SECRET;
    delete process.env.IYZICO_ALLOW_UNSIGNED_WEBHOOKS;

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === '../server' || request.endsWith('/server')) {
            if (failServerModuleLoad) throw new Error('notification server unavailable');
            return { io: null };
        }
        return originalModuleLoad.call(this, request, parent, isMain);
    };
};

const runWebhook = async ({ state, payload, headers = {} }) => {
    const client = createFakeClient(state);
    pool.connect = async () => client;
    pool.query = async (sql, params = []) => {
        if (/INSERT INTO notifications/i.test(sql)) {
            state.notificationInserts += 1;
            if (String(params[2] || '').includes('mutabakatı gerekli')) {
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
        throw new Error(`Unexpected Iyzico webhook security pool query: ${sql}`);
    };

    const res = createRes();
    await webhookIyzico({ body: payload, headers }, res);
    return { res, client };
};

const signHeaders = (payload, secret) => ({
    'x-iyzico-signature': buildWebhookSignature(payload, secret)
});

(async () => {
    try {
        configureBaseTestRuntime();

        const unsignedDefaultState = createPaymentState();
        let payload = createPayload();
        let result = await runWebhook({ state: unsignedDefaultState, payload });
        assert.strictEqual(result.res.code, 503);
        assertNoFinalizationSideEffects(unsignedDefaultState);
        assert.deepStrictEqual(unsignedDefaultState.transactions, []);

        const unsignedMockState = createPaymentState();
        process.env.IYZICO_ALLOW_UNSIGNED_WEBHOOKS = 'true';
        result = await runWebhook({ state: unsignedMockState, payload });
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(unsignedMockState.paymentPaidUpdates, 1);
        assert.strictEqual(unsignedMockState.orderPaidUpdates, 1);
        assert.strictEqual(unsignedMockState.stockUpdates, 1);
        assert.strictEqual(unsignedMockState.orderEvents, 1);
        assert.strictEqual(unsignedMockState.orderItemWrites, 1);
        assert.strictEqual(unsignedMockState.webhookProcessedUpdates, 1);
        assert.strictEqual(unsignedMockState.notificationInserts, 2);

        delete process.env.IYZICO_ALLOW_UNSIGNED_WEBHOOKS;
        process.env.IYZICO_WEBHOOK_SECRET = 'iyzico-webhook-secret';

        const signedSuccessState = createPaymentState();
        payload = createPayload({ eventId: 'iyzico-event-7002' });
        result = await runWebhook({
            state: signedSuccessState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(signedSuccessState.paymentPaidUpdates, 1);
        assert.strictEqual(signedSuccessState.orderPaidUpdates, 1);

        const sameProviderEventFirstState = createPaymentState();
        payload = createPayload({ eventId: 'iyzico-shared-provider-event' });
        result = await runWebhook({
            state: sameProviderEventFirstState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);

        const alternatePaymentRef = 'NST-PMT-7002-secure';
        const sameProviderEventSecondState = createPaymentState({ paymentRef: alternatePaymentRef });
        payload = createPayload({
            eventId: 'iyzico-shared-provider-event',
            paymentRef: alternatePaymentRef,
            providerTransactionId: 'iyzico-tx-7002'
        });
        result = await runWebhook({
            state: sameProviderEventSecondState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);
        const firstSharedEventInsert = sameProviderEventFirstState.queries.find((call) => /INSERT INTO webhook_events/i.test(call.sql));
        const secondSharedEventInsert = sameProviderEventSecondState.queries.find((call) => /INSERT INTO webhook_events/i.test(call.sql));
        assert.ok(firstSharedEventInsert);
        assert.ok(secondSharedEventInsert);
        assert.notStrictEqual(
            firstSharedEventInsert.params[0],
            secondSharedEventInsert.params[0],
            'Iyzico identical provider events and outcomes for different payments must use distinct idempotency keys'
        );

        const invalidSignatureState = createPaymentState();
        payload = createPayload({ eventId: 'iyzico-event-7003' });
        result = await runWebhook({
            state: invalidSignatureState,
            payload,
            headers: { 'x-iyzico-signature': 'bad-signature' }
        });
        assert.strictEqual(result.res.code, 401);
        assertNoFinalizationSideEffects(invalidSignatureState);
        assert.deepStrictEqual(invalidSignatureState.transactions, []);

        const amountMismatchState = createPaymentState();
        payload = createPayload({ eventId: 'iyzico-event-7004', paidPrice: '999.99' });
        result = await runWebhook({
            state: amountMismatchState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 409);
        assertNoFinalizationSideEffects(amountMismatchState);
        assert.deepStrictEqual(amountMismatchState.transactions, ['BEGIN', 'ROLLBACK']);

        const currencyMismatchState = createPaymentState();
        payload = createPayload({ eventId: 'iyzico-event-7005', currency: 'USD' });
        result = await runWebhook({
            state: currencyMismatchState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 409);
        assertNoFinalizationSideEffects(currencyMismatchState);

        const providerMismatchState = createPaymentState({ provider: 'paytr' });
        payload = createPayload({ eventId: 'iyzico-event-7006' });
        result = await runWebhook({
            state: providerMismatchState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 409);
        assertNoFinalizationSideEffects(providerMismatchState);

        const captureAfterCancelState = createPaymentState({
            orderStatus: ORDER_STATUS.IPTAL_EDILDI
        });
        const oppositeEventId = 'iyzico-opposite-outcome-1';
        payload = createPayload({ eventId: oppositeEventId });
        result = await runWebhook({
            state: captureAfterCancelState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(result.res.body.paymentStatus, PAYMENT_STATUS.PAID);
        assert.strictEqual(result.res.body.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
        assert.strictEqual(result.res.body.refundStatus, REFUND_STATUS.PENDING);
        assert.strictEqual(result.res.body.reconciliationRequired, true);
        assert.strictEqual(captureAfterCancelState.paymentStatus, PAYMENT_STATUS.PAID);
        assert.strictEqual(captureAfterCancelState.orderPaymentStatus, PAYMENT_STATUS.PAID);
        assert.strictEqual(captureAfterCancelState.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
        assert.strictEqual(captureAfterCancelState.orderRefundStatus, REFUND_STATUS.PENDING);
        assert.strictEqual(captureAfterCancelState.reconciliationEvents, 1);
        assert.strictEqual(captureAfterCancelState.stockUpdates, 0);
        assert.strictEqual(captureAfterCancelState.stockRestocks, 0);
        assert.strictEqual(captureAfterCancelState.orderItemWrites, 0);
        assert.strictEqual(captureAfterCancelState.notificationInserts, 1);
        assert.strictEqual(captureAfterCancelState.reconciliationNotificationInserts, 1);
        assert.strictEqual(captureAfterCancelState.durableReconciliationNotificationInserts, 1);
        assert.strictEqual(captureAfterCancelState.reconciliationMetadataWrites, 1);
        assert.strictEqual(captureAfterCancelState.reconciliationRequiredEvents, 1);
        assert.strictEqual(captureAfterCancelState.reconciliationTask.status, 'OPEN');

        const staleFailureState = createPaymentState({
            paymentStatus: PAYMENT_STATUS.PAID,
            orderPaymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: ORDER_STATUS.HAZIRLANIYOR
        });
        payload = createPayload({ eventId: oppositeEventId, status: 'FAILED' });
        result = await runWebhook({
            state: staleFailureState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(result.res.body.paymentStatus, PAYMENT_STATUS.PAID);
        assert.strictEqual(result.res.body.reconciliationRequired, true);
        assert.strictEqual(staleFailureState.paymentStatus, PAYMENT_STATUS.PAID);
        assert.strictEqual(staleFailureState.orderPaymentStatus, PAYMENT_STATUS.PAID);
        assert.strictEqual(staleFailureState.paymentFailedUpdates, 0);
        assert.strictEqual(staleFailureState.orderFailedUpdates, 0);
        assert.strictEqual(staleFailureState.staleFailureEvents, 1);
        assert.strictEqual(staleFailureState.stockRestocks, 0);
        assert.strictEqual(staleFailureState.reconciliationNotificationInserts, 1);
        assert.strictEqual(staleFailureState.durableReconciliationNotificationInserts, 1);
        assert.strictEqual(staleFailureState.reconciliationMetadataWrites, 1);
        assert.strictEqual(staleFailureState.reconciliationRequiredEvents, 1);

        const successEventInsert = captureAfterCancelState.queries.find((call) => /INSERT INTO webhook_events/i.test(call.sql));
        const failureEventInsert = staleFailureState.queries.find((call) => /INSERT INTO webhook_events/i.test(call.sql));
        assert.ok(successEventInsert);
        assert.ok(failureEventInsert);
        assert.notStrictEqual(
            successEventInsert.params[0],
            failureEventInsert.params[0],
            'Iyzico opposite outcomes must use distinct idempotency event keys'
        );

        const refundedCaptureState = createPaymentState({
            paymentStatus: PAYMENT_STATUS.REFUNDED,
            orderPaymentStatus: PAYMENT_STATUS.REFUNDED,
            orderStatus: ORDER_STATUS.IADE_EDILDI,
            orderRefundStatus: REFUND_STATUS.COMPLETED
        });
        payload = createPayload({ eventId: 'iyzico-refunded-success' });
        result = await runWebhook({
            state: refundedCaptureState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(result.res.body.paymentStatus, PAYMENT_STATUS.REFUNDED);
        assert.strictEqual(refundedCaptureState.paymentStatus, PAYMENT_STATUS.REFUNDED);
        assert.strictEqual(refundedCaptureState.orderStatus, ORDER_STATUS.IADE_EDILDI);
        assert.strictEqual(refundedCaptureState.paymentPaidUpdates, 0);
        assert.strictEqual(refundedCaptureState.refundedConflictEvents, 1);
        assert.strictEqual(refundedCaptureState.stockUpdates, 0);
        assert.strictEqual(refundedCaptureState.orderItemWrites, 0);
        assert.strictEqual(refundedCaptureState.reconciliationNotificationInserts, 1);
        assert.strictEqual(refundedCaptureState.durableReconciliationNotificationInserts, 1);
        assert.strictEqual(refundedCaptureState.reconciliationMetadataWrites, 1);
        assert.strictEqual(refundedCaptureState.reconciliationRequiredEvents, 1);

        const invalidPaymentState = createPaymentState({
            paymentStatus: 'CORRUPT_PROVIDER_STATE'
        });
        payload = createPayload({ eventId: 'iyzico-invalid-payment-state' });
        result = await runWebhook({
            state: invalidPaymentState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(result.res.body.paymentStatus, 'CORRUPT_PROVIDER_STATE');
        assert.strictEqual(result.res.body.reconciliationRequired, true);
        assert.strictEqual(invalidPaymentState.paymentPaidUpdates, 0);
        assert.strictEqual(invalidPaymentState.paymentFailedUpdates, 0);
        assert.strictEqual(invalidPaymentState.reconciliationMetadataWrites, 1);
        assert.strictEqual(invalidPaymentState.reconciliationRequiredEvents, 1);
        assert.strictEqual(invalidPaymentState.durableReconciliationNotificationInserts, 1);
        assert.strictEqual(invalidPaymentState.reconciliationTask.reasonCode, 'UNKNOWN_PAYMENT_STATE');
        assert.strictEqual(invalidPaymentState.webhookProcessedUpdates, 1);

        const exactDuplicateState = createPaymentState({ webhookProcessed: true });
        payload = createPayload({ eventId: 'iyzico-exact-duplicate' });
        result = await runWebhook({
            state: exactDuplicateState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(result.res.body.duplicate, true);
        assert.strictEqual(exactDuplicateState.paymentPaidUpdates, 0);
        assert.strictEqual(exactDuplicateState.orderEvents, 0);
        assert.strictEqual(exactDuplicateState.notificationInserts, 0);

        const postCommitNotificationFailureState = createPaymentState({
            orderStatus: ORDER_STATUS.HAZIRLANIYOR
        });
        payload = createPayload({
            eventId: 'iyzico-post-commit-notification-failure',
            status: 'FAILED',
            reason: 'provider declined'
        });
        const capturedNotificationErrors = [];
        const originalConsoleError = console.error;
        console.error = (...args) => capturedNotificationErrors.push(args.join(' '));
        failServerModuleLoad = true;
        try {
            result = await runWebhook({
                state: postCommitNotificationFailureState,
                payload,
                headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
            });
        } finally {
            failServerModuleLoad = false;
            console.error = originalConsoleError;
        }
        assert.strictEqual(result.res.code, 200);
        assert.strictEqual(result.res.body.paymentStatus, PAYMENT_STATUS.FAILED);
        assert.strictEqual(postCommitNotificationFailureState.transactions.at(-1), 'COMMIT');
        assert.strictEqual(postCommitNotificationFailureState.transactions.includes('ROLLBACK'), false);
        assert.strictEqual(postCommitNotificationFailureState.reconciliationMetadataWrites, 1);
        assert.strictEqual(postCommitNotificationFailureState.reconciliationRequiredEvents, 1);
        assert.strictEqual(postCommitNotificationFailureState.durableReconciliationNotificationInserts, 1);
        assert.ok(capturedNotificationErrors.length >= 1);
        assert.strictEqual(capturedNotificationErrors.join(' ').includes(process.env.IYZICO_WEBHOOK_SECRET), false);

        const unknownStatusState = createPaymentState();
        payload = createPayload({ eventId: 'iyzico-event-7007', status: 'PENDING_REVIEW' });
        result = await runWebhook({
            state: unknownStatusState,
            payload,
            headers: signHeaders(payload, process.env.IYZICO_WEBHOOK_SECRET)
        });
        assert.strictEqual(result.res.code, 202);
        assert.strictEqual(result.res.body.finalizationImplemented, false);
        assertNoFinalizationSideEffects(unknownStatusState);
        assert.deepStrictEqual(unknownStatusState.transactions, []);

        console.log('payment Iyzico webhook security smoke passed');
    } finally {
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exit(1);
});
