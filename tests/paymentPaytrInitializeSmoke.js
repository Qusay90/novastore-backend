const assert = require('assert');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');
const { getPaymentStatus, initializePayment } = require('../controllers/paymentController');

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

const restoreEnv = () => {
    for (const key of trackedEnv) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
};

const applyBaseEnv = () => {
    process.env.NODE_ENV = 'test';
    process.env.FREE_SHIPPING_THRESHOLD = '1500';
    process.env.DEFAULT_SHIPPING_FEE = '49.9';
};

const applyPaytrEnv = () => {
    applyBaseEnv();
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

const createFakeClient = ({ existingPaymentRows = [] } = {}) => {
    const calls = [];

    return {
        calls,
        async query(sql, params = []) {
            calls.push({ sql, params });

            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
            }

            if (/FROM payments p/i.test(sql)) {
                return { rows: existingPaymentRows };
            }

            if (/FROM products/i.test(sql)) {
                return {
                    rows: [
                        { id: 101, name: 'Test Telefon', price: 1000, old_price: null, stock: 5, image_url: 'phone.png' }
                    ]
                };
            }

            if (/INSERT INTO orders/i.test(sql)) {
                assert.strictEqual(params[2], ORDER_STATUS.ODEME_BEKLIYOR);
                return {
                    rows: [
                        {
                            id: 7001,
                            user_id: params[0],
                            status: params[2],
                            items: params[7],
                            payment_status: params[8]
                        }
                    ]
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
                throw new Error('initialize must not reserve stock');
            }

            if (/UPDATE coupons SET used_count/i.test(sql)) {
                throw new Error('initialize must not increment coupon usage');
            }

            return { rows: [] };
        },
        release() {}
    };
};

const makeReq = ({ body = {}, headers = {} } = {}) => ({
    headers: {
        'idempotency-key': 'idem-paytr-1',
        'x-forwarded-for': '203.0.113.10',
        ...headers
    },
    ip: '203.0.113.10',
    body: {
        fullName: 'Test Kullanici',
        email: 'test@example.com',
        phone: '05551234567',
        address: 'Test Mahallesi, Test Sokak No:1',
        cartItems: [{ productId: 101, quantity: 1 }],
        paymentMethod: 'card',
        analyticsSessionKey: 'guest-session-1',
        ...body
    }
});

const callInitialize = async ({ configureEnv, clientOptions = {}, reqOptions = {} }) => {
    const originalConnect = pool.connect;
    const client = createFakeClient(clientOptions);
    pool.connect = async () => client;
    configureEnv();

    try {
        const res = createRes();
        await initializePayment(makeReq(reqOptions), res);
        return { client, res };
    } finally {
        pool.connect = originalConnect;
    }
};

const findPaymentInsert = (client) => client.calls.find((call) => /INSERT INTO payments/i.test(call.sql));
const findOrderPaymentUpdate = (client) => client.calls.find((call) => /UPDATE orders\s+SET payment_ref/i.test(call.sql));

(async () => {
    try {
        const paytrRun = await callInitialize({ configureEnv: applyPaytrEnv });
        const paytrRes = paytrRun.res;
        const paytrClient = paytrRun.client;

        assert.strictEqual(paytrRes.code, 201);
        assert.strictEqual(paytrRes.body.provider, 'paytr');
        assert.strictEqual(paytrRes.body.paymentStatus, PAYMENT_STATUS.REQUIRES_ACTION);
        assert.strictEqual(paytrRes.body.orderId, 7001);
        assert.strictEqual(paytrRes.body.idempotencyKey, 'idem-paytr-1');
        assert.strictEqual(paytrRes.body.totals.total, 1049.9);
        assert.strictEqual(paytrRes.body.coupon.applied, false);
        assert.strictEqual(paytrRes.body.campaigns.freeShippingApplied, false);
        assert.strictEqual(paytrRes.body.paymentAction.type, 'iframe');
        assert.ok(paytrRes.body.paymentAction.token);
        assert.ok(paytrRes.body.paymentAction.iframeUrl.includes(paytrRes.body.paymentAction.token));
        assert.ok(paytrRes.body.paymentAction.successUrl);
        assert.ok(paytrRes.body.paymentAction.failUrl);
        assert.match(paytrRes.body.paymentRef, /^NST-PAYTR-7001-[a-f0-9]{16}$/);
        assert.strictEqual(paytrRes.body.paymentRef, paytrRes.body.paymentAction.successUrl.match(/paymentRef=([^&]+)/)[1]);
        assert.strictEqual(JSON.stringify(paytrRes.body).includes(process.env.PAYTR_MERCHANT_KEY), false);
        assert.strictEqual(JSON.stringify(paytrRes.body).includes(process.env.PAYTR_MERCHANT_SALT), false);

        const paytrPaymentInsert = findPaymentInsert(paytrClient);
        assert.ok(paytrPaymentInsert, 'PayTR initialize should insert a payment record');
        assert.strictEqual(paytrPaymentInsert.params[1], 'paytr');
        assert.strictEqual(paytrPaymentInsert.params[3], paytrRes.body.paymentRef);
        assert.strictEqual(paytrPaymentInsert.params[6], PAYMENT_STATUS.REQUIRES_ACTION);

        const rawRequest = JSON.parse(paytrPaymentInsert.params[7]);
        const rawResponse = JSON.parse(paytrPaymentInsert.params[8]);
        assert.strictEqual(rawRequest.stockReserved, false);
        assert.strictEqual(rawRequest.finalizesOnWebhook, true);
        assert.strictEqual(rawRequest.paytr.merchantOid, paytrRes.body.paymentRef);
        assert.strictEqual(rawRequest.idempotency.key, 'idem-paytr-1');
        assert.match(rawRequest.idempotency.ownerKey, /^[a-f0-9]{64}$/);
        assert.match(rawRequest.idempotency.requestHash, /^[a-f0-9]{64}$/);
        assert.strictEqual(rawResponse.type, 'iframe');
        assert.strictEqual(rawResponse.token, paytrRes.body.paymentAction.token);

        const serializedRaw = `${paytrPaymentInsert.params[7]} ${paytrPaymentInsert.params[8]}`;
        assert.strictEqual(serializedRaw.includes(process.env.PAYTR_MERCHANT_KEY), false);
        assert.strictEqual(serializedRaw.includes(process.env.PAYTR_MERCHANT_SALT), false);
        assert.strictEqual(serializedRaw.includes('merchant-key-secret'), false);
        assert.strictEqual(serializedRaw.includes('merchant-salt-secret'), false);

        const orderUpdate = findOrderPaymentUpdate(paytrClient);
        assert.strictEqual(orderUpdate.params[0], paytrRes.body.paymentRef);
        assert.strictEqual(orderUpdate.params[1], PAYMENT_STATUS.REQUIRES_ACTION);
        assert.strictEqual(
            paytrClient.calls.some((call) => /UPDATE products\s+SET stock = stock -/i.test(call.sql)),
            false
        );
        assert.strictEqual(
            paytrClient.calls.some((call) => /UPDATE coupons SET used_count/i.test(call.sql)),
            false
        );
        assert.strictEqual(
            paytrClient.calls.some((call) => /PAYMENT_SUCCESS|PAYMENT_FAILED|Hazırlanıyor/i.test(call.sql)),
            false
        );

        const duplicateRun = await callInitialize({
            configureEnv: applyPaytrEnv,
            clientOptions: {
                existingPaymentRows: [
                    {
                        order_id: 7001,
                        payment_ref: paytrRes.body.paymentRef,
                        status: PAYMENT_STATUS.REQUIRES_ACTION,
                        provider: 'paytr',
                        order_user_id: null,
                        raw_request: paytrPaymentInsert.params[7]
                    }
                ]
            }
        });
        assert.strictEqual(duplicateRun.res.code, 200);
        assert.strictEqual(duplicateRun.res.body.reused, true);
        assert.strictEqual(duplicateRun.res.body.provider, 'paytr');
        assert.strictEqual(duplicateRun.res.body.paymentStatus, PAYMENT_STATUS.REQUIRES_ACTION);
        assert.strictEqual(duplicateRun.res.body.paymentRef, paytrRes.body.paymentRef);
        assert.strictEqual(duplicateRun.client.calls.some((call) => call.sql === 'BEGIN'), false);
        assert.strictEqual(duplicateRun.client.calls.some((call) => /INSERT INTO orders/i.test(call.sql)), false);
        assert.strictEqual(duplicateRun.client.calls.some((call) => /INSERT INTO payments/i.test(call.sql)), false);
        assert.strictEqual(duplicateRun.client.calls.some((call) => /UPDATE products\s+SET stock = stock -/i.test(call.sql)), false);
        assert.strictEqual(duplicateRun.client.calls.some((call) => /UPDATE coupons SET used_count/i.test(call.sql)), false);

        const bodyMismatchRun = await callInitialize({
            configureEnv: applyPaytrEnv,
            reqOptions: { body: { phone: '05550000000' } },
            clientOptions: {
                existingPaymentRows: [
                    {
                        order_id: 7001,
                        payment_ref: paytrRes.body.paymentRef,
                        status: PAYMENT_STATUS.REQUIRES_ACTION,
                        provider: 'paytr',
                        order_user_id: null,
                        raw_request: paytrPaymentInsert.params[7]
                    }
                ]
            }
        });
        assert.strictEqual(bodyMismatchRun.res.code, 409);
        assert.match(bodyMismatchRun.res.body.error, /Idempotency key/i);
        assert.strictEqual(bodyMismatchRun.client.calls.some((call) => /INSERT INTO orders|INSERT INTO payments/i.test(call.sql)), false);

        const guestSessionMismatchRun = await callInitialize({
            configureEnv: applyPaytrEnv,
            reqOptions: { body: { analyticsSessionKey: 'guest-session-2' } },
            clientOptions: {
                existingPaymentRows: [
                    {
                        order_id: 7001,
                        payment_ref: paytrRes.body.paymentRef,
                        status: PAYMENT_STATUS.REQUIRES_ACTION,
                        provider: 'paytr',
                        order_user_id: null,
                        raw_request: paytrPaymentInsert.params[7]
                    }
                ]
            }
        });
        assert.strictEqual(guestSessionMismatchRun.res.code, 409);
        assert.strictEqual(guestSessionMismatchRun.client.calls.some((call) => /INSERT INTO orders|INSERT INTO payments/i.test(call.sql)), false);

        const iyzicoRun = await callInitialize({
            configureEnv: () => {
                applyBaseEnv();
                delete process.env.PAYMENT_PROVIDER;
            }
        });
        assert.strictEqual(iyzicoRun.res.code, 201);
        assert.strictEqual(iyzicoRun.res.body.provider, 'iyzico');
        assert.strictEqual(iyzicoRun.res.body.paymentStatus, PAYMENT_STATUS.REQUIRES_ACTION);
        assert.strictEqual(iyzicoRun.res.body.paymentAction.provider, 'iyzico');
        assert.strictEqual(findPaymentInsert(iyzicoRun.client).params[1], 'iyzico');

        const originalConsoleError = console.error;
        console.error = () => {};
        let missingEnvRun;
        try {
            missingEnvRun = await callInitialize({
                configureEnv: () => {
                    applyBaseEnv();
                    process.env.PAYMENT_PROVIDER = 'paytr';
                    delete process.env.PAYTR_MERCHANT_ID;
                    delete process.env.PAYTR_MERCHANT_KEY;
                    delete process.env.PAYTR_MERCHANT_SALT;
                    delete process.env.PAYTR_CALLBACK_URL;
                    delete process.env.PAYTR_SUCCESS_URL;
                    delete process.env.PAYTR_FAIL_URL;
                }
            });
        } finally {
            console.error = originalConsoleError;
        }
        assert.strictEqual(missingEnvRun.res.code, 503);
        assert.ok(missingEnvRun.res.body.details.includes('PAYTR_MERCHANT_ID'));
        assert.strictEqual(JSON.stringify(missingEnvRun.res.body).includes('merchant-key-secret'), false);
        assert.strictEqual(JSON.stringify(missingEnvRun.res.body).includes('merchant-salt-secret'), false);
        assert.strictEqual(missingEnvRun.client.calls.some((call) => /INSERT INTO orders/i.test(call.sql)), false);
        assert.strictEqual(findPaymentInsert(missingEnvRun.client), undefined);
        assert.ok(missingEnvRun.client.calls.some((call) => call.sql === 'ROLLBACK'));

        const originalQuery = pool.query;
        const statusCalls = [];
        pool.query = async (sql, params) => {
            statusCalls.push({ sql, params });
            assert.match(sql, /^SELECT/i);
            return {
                rows: [
                    {
                        payment_ref: paytrRes.body.paymentRef,
                        payment_status: PAYMENT_STATUS.REQUIRES_ACTION,
                        provider: 'paytr',
                        order_id: 7001,
                        order_status: ORDER_STATUS.ODEME_BEKLIYOR,
                        order_user_id: 10
                    }
                ]
            };
        };

        try {
            const statusRes = createRes();
            await getPaymentStatus({
                query: { paymentRef: paytrRes.body.paymentRef, orderId: '7001' },
                user: { id: 10 }
            }, statusRes);
            assert.strictEqual(statusRes.code, 200);
            assert.strictEqual(statusRes.body.paymentStatus, PAYMENT_STATUS.REQUIRES_ACTION);
            assert.strictEqual(statusRes.body.finalized, false);
            assert.strictEqual(statusRes.body.provider, 'paytr');
            assert.strictEqual(statusCalls.length, 1);
        } finally {
            pool.query = originalQuery;
        }

        console.log('payment PayTR initialize smoke passed');
    } finally {
        restoreEnv();
    }
})().catch((err) => {
    restoreEnv();
    console.error(err);
    process.exit(1);
});
