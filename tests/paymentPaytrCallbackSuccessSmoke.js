const assert = require('assert');
const express = require('express');
const http = require('http');
const Module = require('module');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');
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

const merchantOid = 'NST-PAYTR-7001-abcdef1234567890';

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

const createPaymentState = (overrides = {}) => ({
    webhookProcessed: false,
    paymentFound: true,
    provider: 'paytr',
    paymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
    orderPaymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
    orderStatus: ORDER_STATUS.ODEME_BEKLIYOR,
    amount: '1049.90',
    orderTotalAmount: '1049.90',
    stockUpdates: 0,
    couponUpdates: 0,
    orderEvents: 0,
    paymentPaidUpdates: 0,
    orderPaidUpdates: 0,
    webhookProcessedUpdates: 0,
    notificationInserts: 0,
    queries: [],
    ...overrides
});

const makePaymentRow = (state) => ({
    id: 5001,
    order_id: 7001,
    orderId: 7001,
    provider: state.provider,
    payment_ref: merchantOid,
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
            state.stockUpdates += 1;
            return { rows: [{ id: params[1], stock: 4 }] };
        }

        if (/UPDATE payments/i.test(sql)) {
            if (params[0] === PAYMENT_STATUS.PAID) {
                state.paymentPaidUpdates += 1;
                state.paymentStatus = PAYMENT_STATUS.PAID;
            }
            return { rows: [] };
        }

        if (/UPDATE coupons SET used_count/i.test(sql)) {
            state.couponUpdates += 1;
            return { rows: [] };
        }

        if (/UPDATE orders/i.test(sql)) {
            if (params[0] === PAYMENT_STATUS.PAID) {
                state.orderPaidUpdates += 1;
                state.orderPaymentStatus = PAYMENT_STATUS.PAID;
                state.orderStatus = ORDER_STATUS.HAZIRLANIYOR;
            }
            return { rows: [] };
        }

        if (/INSERT INTO order_events/i.test(sql)) {
            state.orderEvents += 1;
            return { rows: [] };
        }

        if (/UPDATE webhook_events SET processed = TRUE/i.test(sql)) {
            state.webhookProcessedUpdates += 1;
            state.webhookProcessed = true;
            return { rows: [] };
        }

        if (/category_stats|WITH RECURSIVE category_tree/i.test(sql)) {
            return { rows: [], rowCount: 0 };
        }

        throw new Error(`Unexpected PayTR success query: ${sql}`);
    },
    release() {}
});

const createAppServer = (state) => new Promise((resolve) => {
    const paymentRoutes = require('../routes/paymentRoutes');
    pool.connect = async () => createFakeClient(state);
    pool.query = async (sql, params = []) => {
        if (/INSERT INTO notifications/i.test(sql)) {
            state.notificationInserts += 1;
            return {
                rows: [
                    {
                        id: state.notificationInserts,
                        user_id: params[0] || null,
                        type: params[1],
                        message: params[2]
                    }
                ]
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

const assertNoSideEffects = (state) => {
    assert.strictEqual(state.stockUpdates, 0);
    assert.strictEqual(state.couponUpdates, 0);
    assert.strictEqual(state.orderEvents, 0);
    assert.strictEqual(state.paymentPaidUpdates, 0);
    assert.strictEqual(state.orderPaidUpdates, 0);
    assert.strictEqual(state.notificationInserts, 0);
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

        const successState = createPaymentState();
        await withServer(successState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assert.strictEqual(successState.paymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successState.orderPaymentStatus, PAYMENT_STATUS.PAID);
            assert.strictEqual(successState.orderStatus, ORDER_STATUS.HAZIRLANIYOR);
            assert.strictEqual(successState.stockUpdates, 1);
            assert.strictEqual(successState.couponUpdates, 1);
            assert.strictEqual(successState.orderEvents, 1);
            assert.strictEqual(successState.notificationInserts, 2);
            assert.strictEqual(successState.webhookProcessed, true);
            assert.strictEqual(response.text.includes('merchant-key-secret'), false);
            assert.strictEqual(response.text.includes('merchant-salt-secret'), false);
        });

        const duplicateWebhookState = createPaymentState({ webhookProcessed: true });
        await withServer(duplicateWebhookState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assertNoSideEffects(duplicateWebhookState);
        });

        const alreadyPaidState = createPaymentState({
            paymentStatus: PAYMENT_STATUS.PAID,
            orderPaymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: ORDER_STATUS.HAZIRLANIYOR
        });
        await withServer(alreadyPaidState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 200);
            assert.strictEqual(response.text, 'OK');
            assertNoSideEffects(alreadyPaidState);
            assert.strictEqual(alreadyPaidState.webhookProcessedUpdates, 1);
        });

        const invalidHashState = createPaymentState();
        await withServer(invalidHashState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', { ...buildPayload(), hash: 'bad-hash' });
            assert.strictEqual(response.statusCode, 401);
            assertNoSideEffects(invalidHashState);
        });

        const missingHashState = createPaymentState();
        await withServer(missingHashState, async (server) => {
            const payload = buildPayload();
            delete payload.hash;
            const response = await postForm(server, '/api/payments/webhook/paytr', payload);
            assert.strictEqual(response.statusCode, 400);
            assertNoSideEffects(missingHashState);
        });

        const amountMismatchState = createPaymentState();
        await withServer(amountMismatchState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({ total_amount: '999' }));
            assert.strictEqual(response.statusCode, 409);
            assertNoSideEffects(amountMismatchState);
        });

        const providerMismatchState = createPaymentState({ provider: 'iyzico' });
        await withServer(providerMismatchState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 409);
            assertNoSideEffects(providerMismatchState);
        });

        const missingPaymentState = createPaymentState({ paymentFound: false });
        await withServer(missingPaymentState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload());
            assert.strictEqual(response.statusCode, 404);
            assertNoSideEffects(missingPaymentState);
        });

        const unknownStatusState = createPaymentState();
        await withServer(unknownStatusState, async (server) => {
            const response = await postForm(server, '/api/payments/webhook/paytr', buildPayload({ status: 'pending_review' }));
            assert.strictEqual(response.statusCode, 202);
            assert.strictEqual(response.body.finalizationImplemented, false);
            assertNoSideEffects(unknownStatusState);
        });

        console.log('payment PayTR callback success smoke passed');
    } finally {
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exit(1);
});
