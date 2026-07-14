const assert = require('assert');
const express = require('express');
const http = require('http');
const Module = require('module');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { getPaymentStatus, initializePayment } = require('../controllers/paymentController');
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
    'PAYTR_DEBUG_ON',
    'FREE_SHIPPING_THRESHOLD',
    'DEFAULT_SHIPPING_FEE'
];

const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;
const originalModuleLoad = Module._load;
const originalConsoleError = console.error;
const merchantOid = 'NST-PAYTR-9001-abcdef1234567890';

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
    console.error = originalConsoleError;
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
    process.env.FREE_SHIPPING_THRESHOLD = '1500';
    process.env.DEFAULT_SHIPPING_FEE = '49.9';
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

const buildPayload = (overrides = {}) => {
    const payload = {
        merchant_oid: merchantOid,
        status: 'success',
        total_amount: '104990',
        failed_reason_code: '',
        failed_reason_msg: '',
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

const createInitializeClient = ({ existingPaymentRows = [] } = {}) => {
    const state = {
        calls: [],
        stockDecrements: 0,
        couponIncrements: 0,
        notificationInserts: 0
    };

    return {
        state,
        async query(sql, params = []) {
            state.calls.push({ sql, params });

            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
            }

            if (/FROM payments p/i.test(sql)) {
                return { rows: existingPaymentRows };
            }

            if (/FROM products/i.test(sql)) {
                return {
                    rows: [{ id: 101, name: 'Test Telefon', price: 1000, old_price: null, stock: 5, image_url: 'phone.png' }]
                };
            }

            if (/INSERT INTO orders/i.test(sql)) {
                assert.strictEqual(params[2], ORDER_STATUS.ODEME_BEKLIYOR);
                return {
                    rows: [{
                        id: 9001,
                        user_id: params[0],
                        status: params[2],
                        items: params[7],
                        payment_status: params[8]
                    }]
                };
            }

            if (/INSERT INTO payments/i.test(sql)) {
                return { rows: [] };
            }

            if (/UPDATE orders\s+SET payment_ref/i.test(sql)) {
                assert.strictEqual(params[1], PAYMENT_STATUS.REQUIRES_ACTION);
                return { rows: [] };
            }

            if (/INSERT INTO order_events/i.test(sql)) {
                return { rows: [] };
            }

            if (/UPDATE products\s+SET stock = stock -/i.test(sql)) {
                state.stockDecrements += 1;
                throw new Error('initialize must not reserve stock');
            }

            if (/UPDATE coupons SET used_count/i.test(sql)) {
                state.couponIncrements += 1;
                throw new Error('initialize must not increment coupon usage');
            }

            if (/INSERT INTO notifications/i.test(sql)) {
                state.notificationInserts += 1;
                throw new Error('initialize must not create notifications');
            }

            return { rows: [] };
        },
        release() {}
    };
};

const makeInitializeReq = () => ({
    headers: {
        'idempotency-key': 'idem-paytr-security',
        'x-forwarded-for': '203.0.113.10'
    },
    ip: '203.0.113.10',
    body: {
        fullName: 'Test Kullanici',
        email: 'test@example.com',
        phone: '05551234567',
        address: 'Test Mahallesi',
        cartItems: [{ productId: 101, quantity: 1 }],
        paymentMethod: 'card',
        analyticsSessionKey: 'guest-session-security'
    }
});

const callInitialize = async ({ env = applyPaytrEnv, existingPaymentRows = [] } = {}) => {
    const client = createInitializeClient({ existingPaymentRows });
    pool.connect = async () => client;
    env();

    const res = createRes();
    await initializePayment(makeInitializeReq(), res);
    return { client, res };
};

const createCallbackState = (overrides = {}) => ({
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
    successNotifications: 0,
    failedNotifications: 0,
    orderEvents: 0,
    paymentSuccessEvents: 0,
    paymentFailedEvents: 0,
    reconciliationRequiredEvents: 0,
    reconciliationMetadataWrites: 0,
    durableReconciliationNotifications: 0,
    orderItemWrites: 0,
    paymentPaidUpdates: 0,
    paymentFailedUpdates: 0,
    orderPaidUpdates: 0,
    orderFailedUpdates: 0,
    cartMutations: 0,
    notificationShouldFail: false,
    queries: [],
    ...overrides
});

const makePaymentRow = (state) => ({
    id: 5001,
    order_id: 9001,
    provider: state.provider,
    payment_ref: state.paymentRef,
    amount: state.amount,
    status: state.paymentStatus,
    raw_request: JSON.stringify({
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

const createCallbackClient = (state) => ({
    async query(sql, params = []) {
        state.queries.push({ sql, params });

        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
            return { rows: [] };
        }

        if (/INSERT INTO webhook_events/i.test(sql)) {
            return { rows: [{ id: 9101, processed: state.webhookProcessed }] };
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
            return { rows: [] };
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
                }
            }
            return { rows: [] };
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
            if (params[1] === 'PAYMENT_RECONCILIATION_REQUIRED') state.reconciliationRequiredEvents += 1;
            return { rows: [] };
        }

        if (/INSERT INTO notifications/i.test(sql)) {
            state.durableReconciliationNotifications += 1;
            return { rows: [{ id: state.durableReconciliationNotifications }] };
        }

        if (/INSERT INTO order_items/i.test(sql)) {
            state.orderItemWrites += 1;
            return { rows: [{ id: 1 }], rowCount: 1 };
        }

        if (/UPDATE webhook_events SET processed = TRUE/i.test(sql)) {
            state.webhookProcessed = true;
            return { rows: [] };
        }

        if (/DELETE FROM carts|DELETE FROM cart|UPDATE carts|UPDATE cart/i.test(sql)) {
            state.cartMutations += 1;
            return { rows: [] };
        }

        if (/category_stats|WITH RECURSIVE category_tree/i.test(sql)) {
            return { rows: [], rowCount: 0 };
        }

        throw new Error(`Unexpected PayTR backend security query: ${sql}`);
    },
    release() {}
});

const createAppServer = (state) => new Promise((resolve) => {
    const paymentRoutes = require('../routes/paymentRoutes');
    pool.connect = async () => createCallbackClient(state);
    pool.query = async (sql, params = []) => {
        if (/INSERT INTO notifications/i.test(sql)) {
            const message = String(params[2] || '');
            if (state.notificationShouldFail) {
                throw new Error(`notification failed ${process.env.PAYTR_MERCHANT_KEY} ${process.env.PAYTR_MERCHANT_SALT}`);
            }
            if (message.includes('başarıyla') || message.includes('kesinleşti')) state.successNotifications += 1;
            if (message.includes('başarısız')) state.failedNotifications += 1;
            return { rows: [{ id: state.successNotifications + state.failedNotifications, user_id: params[0], type: params[1], message }] };
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

const postForm = (server, payload) => new Promise((resolve, reject) => {
    const body = new URLSearchParams(payload).toString();
    const { port } = server.address();
    const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/api/payments/webhook/paytr',
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

const assertNoSecrets = (value) => {
    const text = JSON.stringify(value);
    assert.strictEqual(text.includes('merchant-key-secret'), false);
    assert.strictEqual(text.includes('merchant-salt-secret'), false);
};

const assertNoFinalization = (state, { auditEvents = 0 } = {}) => {
    assert.strictEqual(state.stockDecrements, 0);
    assert.strictEqual(state.stockRestocks, 0);
    assert.strictEqual(state.couponIncrements, 0);
    assert.strictEqual(state.couponDecrements, 0);
    assert.strictEqual(state.successNotifications, 0);
    assert.strictEqual(state.failedNotifications, 0);
    assert.strictEqual(state.orderEvents, auditEvents);
    assert.strictEqual(state.paymentPaidUpdates, 0);
    assert.strictEqual(state.paymentFailedUpdates, 0);
    assert.strictEqual(state.orderPaidUpdates, 0);
    assert.strictEqual(state.orderFailedUpdates, 0);
    assert.strictEqual(state.cartMutations, 0);
    assert.strictEqual(state.orderItemWrites, 0);
};

const callStatus = async ({ row, user = { id: 10 } }) => {
    const calls = [];
    pool.query = async (sql, params) => {
        calls.push({ sql, params });
        assert.match(sql, /^SELECT/i);
        return { rows: row ? [row] : [] };
    };
    const res = createRes();
    await getPaymentStatus({ query: { paymentRef: 'PAYTR-STATUS', orderId: '9001' }, user }, res);
    return { res, calls };
};

(async () => {
    try {
        applyPaytrEnv();
        Module._load = function patchedLoad(request, parent, isMain) {
            if (request === '../server' || request.endsWith('/server')) {
                return { io: null };
            }
            return originalModuleLoad.call(this, request, parent, isMain);
        };

        const initRun = await callInitialize();
        assert.strictEqual(initRun.res.code, 201);
        assert.strictEqual(initRun.res.body.provider, 'paytr');
        assert.strictEqual(initRun.res.body.paymentStatus, PAYMENT_STATUS.REQUIRES_ACTION);
        assert.strictEqual(initRun.client.state.stockDecrements, 0);
        assert.strictEqual(initRun.client.state.couponIncrements, 0);
        assert.strictEqual(initRun.client.state.notificationInserts, 0);
        const paymentInsert = initRun.client.state.calls.find((call) => /INSERT INTO payments/i.test(call.sql));
        assert.ok(paymentInsert);
        const initRawRequest = JSON.parse(paymentInsert.params[7]);
        assert.strictEqual(initRawRequest.idempotency.key, 'idem-paytr-security');
        assert.match(initRawRequest.idempotency.ownerKey, /^[a-f0-9]{64}$/);
        assert.match(initRawRequest.idempotency.requestHash, /^[a-f0-9]{64}$/);
        assertNoSecrets(initRun.res.body);
        assertNoSecrets(paymentInsert.params);

        const duplicateInit = await callInitialize({
            existingPaymentRows: [{
                order_id: 9001,
                payment_ref: initRun.res.body.paymentRef,
                status: PAYMENT_STATUS.REQUIRES_ACTION,
                provider: 'paytr',
                order_user_id: null,
                raw_request: paymentInsert.params[7]
            }]
        });
        assert.strictEqual(duplicateInit.res.code, 200);
        assert.strictEqual(duplicateInit.res.body.reused, true);
        assert.strictEqual(duplicateInit.client.state.calls.some((call) => /INSERT INTO orders|INSERT INTO payments/i.test(call.sql)), false);

        const missingEnvLogs = [];
        console.error = (...args) => missingEnvLogs.push(args.join(' '));
        const missingEnv = await callInitialize({
            env: () => {
                applyPaytrEnv();
                delete process.env.PAYTR_MERCHANT_KEY;
                delete process.env.PAYTR_MERCHANT_SALT;
            }
        });
        console.error = originalConsoleError;
        assert.strictEqual(missingEnv.res.code, 503);
        assert.strictEqual(missingEnv.client.state.calls.some((call) => /INSERT INTO orders|INSERT INTO payments/i.test(call.sql)), false);
        assertNoSecrets(missingEnv.res.body);
        assertNoSecrets(missingEnvLogs);
        applyPaytrEnv();

        const successState = createCallbackState();
        await withServer(successState, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'success' }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(successState.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successState.orderPaymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successState.orderStatus, ORDER_STATUS.HAZIRLANIYOR);
            assert.strictEqual(successState.stockDecrements, 1);
            assert.strictEqual(successState.couponIncrements, 1);
            assert.strictEqual(successState.paymentSuccessEvents, 1);
            assert.strictEqual(successState.orderItemWrites, 1);
            assert.strictEqual(successState.successNotifications, 2);
            assertNoSecrets(response);
        });

        const notificationFailureState = createCallbackState({ notificationShouldFail: true });
        const capturedErrors = [];
        console.error = (...args) => capturedErrors.push(args.join(' '));
        await withServer(notificationFailureState, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'success' }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(notificationFailureState.paymentStatus, PAYMENT_STATUS.PAID);
        });
        assertNoSecrets(capturedErrors);
        console.error = originalConsoleError;

        const duplicateSuccessState = createCallbackState({ webhookProcessed: true });
        await withServer(duplicateSuccessState, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'success' }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assertNoFinalization(duplicateSuccessState);
        });

        const failedState = createCallbackState();
        await withServer(failedState, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'failed', failed_reason_code: '99', failed_reason_msg: 'Declined' }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(failedState.paymentStatus, PAYMENT_STATUS.FAILED);
            assert.strictEqual(failedState.orderPaymentStatus, PAYMENT_STATUS.FAILED);
            assert.strictEqual(failedState.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
            assert.strictEqual(failedState.stockDecrements, 0);
            assert.strictEqual(failedState.stockRestocks, 0);
            assert.strictEqual(failedState.couponIncrements, 0);
            assert.strictEqual(failedState.couponDecrements, 0);
            assert.strictEqual(failedState.paymentFailedEvents, 1);
            assert.strictEqual(failedState.failedNotifications, 1);
        });

        const duplicateFailedState = createCallbackState({ webhookProcessed: true });
        await withServer(duplicateFailedState, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'failed' }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assertNoFinalization(duplicateFailedState);
        });

        const successThenFailed = createCallbackState({
            paymentStatus: PAYMENT_STATUS.PAID,
            orderPaymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: ORDER_STATUS.HAZIRLANIYOR
        });
        await withServer(successThenFailed, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'failed' }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(successThenFailed.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successThenFailed.orderStatus, ORDER_STATUS.HAZIRLANIYOR);
            assertNoFinalization(successThenFailed, { auditEvents: 2 });
            assert.strictEqual(successThenFailed.reconciliationMetadataWrites, 1);
            assert.strictEqual(successThenFailed.reconciliationRequiredEvents, 1);
            assert.strictEqual(successThenFailed.durableReconciliationNotifications, 1);
        });

        const failedThenSuccess = createCallbackState({
            paymentStatus: PAYMENT_STATUS.FAILED,
            orderPaymentStatus: PAYMENT_STATUS.FAILED,
            orderStatus: ORDER_STATUS.IPTAL_EDILDI
        });
        await withServer(failedThenSuccess, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'success' }));
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(failedThenSuccess.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(failedThenSuccess.orderPaymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(failedThenSuccess.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
            assert.strictEqual(failedThenSuccess.orderRefundStatus, REFUND_STATUS.PENDING);
            assert.strictEqual(failedThenSuccess.paymentPaidUpdates, 1);
            assert.strictEqual(failedThenSuccess.orderPaidUpdates, 1);
            assert.strictEqual(failedThenSuccess.orderEvents, 2);
            assert.strictEqual(failedThenSuccess.reconciliationMetadataWrites, 1);
            assert.strictEqual(failedThenSuccess.reconciliationRequiredEvents, 1);
            assert.strictEqual(failedThenSuccess.durableReconciliationNotifications, 1);
            assert.strictEqual(failedThenSuccess.stockDecrements, 0);
            assert.strictEqual(failedThenSuccess.stockRestocks, 0);
            assert.strictEqual(failedThenSuccess.couponIncrements, 0);
            assert.strictEqual(failedThenSuccess.orderItemWrites, 0);
            assert.strictEqual(failedThenSuccess.successNotifications, 0);
        });

        for (const state of [
            createCallbackState({ provider: 'iyzico' }),
            createCallbackState({ paymentRef: 'NST-PAYTR-DIFFERENT' }),
            createCallbackState({ paymentFound: false }),
            createCallbackState()
        ]) {
            const payload = state.amount === '1049.90' && state.paymentFound !== false && state.provider === 'paytr' && state.paymentRef === merchantOid
                ? buildPayload({ total_amount: '999' })
                : buildPayload();
            await withServer(state, async (server) => {
                const response = await postForm(server, payload);
                assert.ok([404, 409].includes(response.statusCode));
                assertNoFinalization(state);
                assertNoSecrets(response);
            });
        }

        const hashFailState = createCallbackState();
        await withServer(hashFailState, async (server) => {
            const response = await postForm(server, { ...buildPayload(), hash: 'bad-hash' });
            assert.strictEqual(response.statusCode, 401);
            assertNoFinalization(hashFailState);
            assertNoSecrets(response);
        });

        const missingHashState = createCallbackState();
        await withServer(missingHashState, async (server) => {
            const payload = buildPayload();
            delete payload.hash;
            const response = await postForm(server, payload);
            assert.strictEqual(response.statusCode, 400);
            assertNoFinalization(missingHashState);
            assertNoSecrets(response);
        });

        const unknownStatusState = createCallbackState();
        await withServer(unknownStatusState, async (server) => {
            const response = await postForm(server, buildPayload({ status: 'pending_review' }));
            assert.strictEqual(response.statusCode, 202);
            assert.strictEqual(response.body.finalizationImplemented, false);
            assertNoFinalization(unknownStatusState);
            assertNoSecrets(response);
        });

        const paidStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-STATUS',
                payment_status: PAYMENT_STATUS.PAID,
                provider: 'paytr',
                order_id: 9001,
                order_status: ORDER_STATUS.HAZIRLANIYOR,
                order_user_id: 10
            }
        });
        assert.strictEqual(paidStatus.res.code, 200);
        assert.strictEqual(paidStatus.res.body.finalized, true);
        assert.strictEqual(paidStatus.res.body.providerFinalized, true);
        assert.strictEqual(paidStatus.res.body.commerceFinalized, true);
        assert.strictEqual(paidStatus.res.body.paymentStatus, PAYMENT_STATUS.PAID);
        assert.strictEqual(paidStatus.calls.length, 1);
        assert.match(paidStatus.calls[0].sql, /p\.raw_request/);
        assert.match(paidStatus.calls[0].sql, /o\.refund_status/);

        const refundReviewStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-REFUND-REVIEW',
                payment_status: PAYMENT_STATUS.PAID,
                provider: 'paytr',
                raw_request: JSON.stringify({ reconciliationRequired: true }),
                order_id: 9001,
                order_status: ORDER_STATUS.IPTAL_EDILDI,
                refund_status: REFUND_STATUS.PENDING,
                order_user_id: 10
            }
        });
        assert.strictEqual(refundReviewStatus.res.code, 200);
        assert.strictEqual(refundReviewStatus.res.body.nextAction, 'WAIT_REFUND_REVIEW');
        assert.strictEqual(refundReviewStatus.res.body.refundStatus, REFUND_STATUS.PENDING);
        assert.strictEqual(refundReviewStatus.res.body.reconciliationRequired, true);
        assert.strictEqual(refundReviewStatus.res.body.commerceFinalized, false);

        const manualReconciliationStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-MANUAL-RECONCILIATION',
                payment_status: PAYMENT_STATUS.PAID,
                provider: 'paytr',
                raw_request: JSON.stringify({ reconciliationRequired: true }),
                order_id: 9001,
                order_status: ORDER_STATUS.KARGOYA_VERILDI,
                refund_status: REFUND_STATUS.NONE,
                order_user_id: 10
            }
        });
        assert.strictEqual(manualReconciliationStatus.res.code, 200);
        assert.strictEqual(manualReconciliationStatus.res.body.nextAction, 'WAIT_RECONCILIATION');
        assert.strictEqual(manualReconciliationStatus.res.body.reconciliationRequired, true);
        assert.strictEqual(manualReconciliationStatus.res.body.providerFinalized, true);
        assert.strictEqual(manualReconciliationStatus.res.body.commerceFinalized, false);

        const refundedReconciliationStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-REFUNDED',
                payment_status: PAYMENT_STATUS.REFUNDED,
                provider: 'paytr',
                raw_request: JSON.stringify({ reconciliationRequired: true }),
                order_id: 9001,
                order_status: ORDER_STATUS.IADE_EDILDI,
                refund_status: REFUND_STATUS.COMPLETED,
                order_user_id: 10
            }
        });
        assert.strictEqual(refundedReconciliationStatus.res.code, 200);
        assert.strictEqual(refundedReconciliationStatus.res.body.nextAction, 'WAIT_RECONCILIATION');
        assert.strictEqual(refundedReconciliationStatus.res.body.paymentStatus, PAYMENT_STATUS.REFUNDED);
        assert.strictEqual(refundedReconciliationStatus.res.body.reconciliationRequired, true);
        assert.strictEqual(refundedReconciliationStatus.res.body.commerceFinalized, false);

        const failedReconciliationStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-FAILED-RECONCILIATION',
                payment_status: PAYMENT_STATUS.FAILED,
                provider: 'paytr',
                raw_request: JSON.stringify({
                    reconciliationRequired: true,
                    reconciliationTask: {
                        status: 'OPEN',
                        reasonCode: 'FAILURE_STOCK_RESERVATION_UNKNOWN'
                    }
                }),
                order_id: 9001,
                order_status: ORDER_STATUS.IPTAL_EDILDI,
                refund_status: REFUND_STATUS.NONE,
                order_user_id: 10
            }
        });
        assert.strictEqual(failedReconciliationStatus.res.code, 200);
        assert.strictEqual(failedReconciliationStatus.res.body.providerFinalized, true);
        assert.strictEqual(failedReconciliationStatus.res.body.commerceFinalized, false);
        assert.strictEqual(failedReconciliationStatus.res.body.nextAction, 'WAIT_RECONCILIATION');

        const failedStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-STATUS',
                payment_status: PAYMENT_STATUS.FAILED,
                provider: 'paytr',
                order_id: 9001,
                order_status: ORDER_STATUS.IPTAL_EDILDI,
                order_user_id: 10
            }
        });
        assert.strictEqual(failedStatus.res.code, 200);
        assert.strictEqual(failedStatus.res.body.finalized, true);
        assert.strictEqual(failedStatus.res.body.paymentStatus, PAYMENT_STATUS.FAILED);

        const pendingStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-STATUS',
                payment_status: PAYMENT_STATUS.REQUIRES_ACTION,
                provider: 'paytr',
                order_id: 9001,
                order_status: ORDER_STATUS.ODEME_BEKLIYOR,
                order_user_id: 10
            }
        });
        assert.strictEqual(pendingStatus.res.code, 200);
        assert.strictEqual(pendingStatus.res.body.finalized, false);

        const otherUserStatus = await callStatus({
            row: {
                payment_ref: 'PAYTR-STATUS',
                payment_status: PAYMENT_STATUS.PAID,
                provider: 'paytr',
                order_id: 9001,
                order_status: ORDER_STATUS.HAZIRLANIYOR,
                order_user_id: 11
            }
        });
        assert.strictEqual(otherUserStatus.res.code, 404);

        const missingAuthStatus = await callStatus({
            user: null,
            row: {
                payment_ref: 'PAYTR-STATUS',
                payment_status: PAYMENT_STATUS.PAID,
                provider: 'paytr',
                order_id: 9001,
                order_status: ORDER_STATUS.HAZIRLANIYOR,
                order_user_id: 10
            }
        });
        assert.strictEqual(missingAuthStatus.res.code, 401);
        assert.strictEqual(missingAuthStatus.calls.length, 0);

        console.log('payment PayTR backend security smoke passed');
    } finally {
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exit(1);
});
