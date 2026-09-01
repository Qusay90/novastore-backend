const assert = require('assert');
const Module = require('node:module');
const originalModuleLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../server' || request.endsWith('/server')) return { io: null };
    return originalModuleLoad.call(this, request, parent, isMain);
};
const { webhookPaytr } = require('../controllers/paymentController');
const pool = require('../config/db');
const { PAYMENT_STATUS, ORDER_STATUS } = require('../constants/orderStatus');
const { buildPaytrCallbackHash } = require('../services/paytrPaymentService');
const { buildVerifiedCheckoutAgreementAllocationFixture } = require('./helpers/checkoutAgreementAllocationFixture');
const {
    COUPON_USAGE_LIMIT_EXHAUSTED_CODE,
    consumeCouponUsageIfNeeded
} = require('../services/couponUsageService');

const trackedEnv = [
    'NODE_ENV',
    'APP_BASE_URL',
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
    process.env.APP_BASE_URL = 'https://example.test';
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
    contentType: null,
    status(code) {
        this.code = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    },
    type(contentType) {
        this.contentType = contentType;
        return this;
    },
    send(body) {
        this.body = body;
        return this;
    }
});

const buildPayload = (overrides = {}) => {
    const payload = {
        merchant_oid: 'NST-PAYTR-COUPON-LIMIT',
        status: 'success',
        total_amount: '104990',
        payment_amount: '104990',
        payment_type: 'card',
        currency: 'TL',
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

const makePaymentRow = () => ({
    id: 5001,
    order_id: 9001,
    provider: 'paytr',
    payment_ref: 'NST-PAYTR-COUPON-LIMIT',
    amount: '1049.90',
    status: PAYMENT_STATUS.REQUIRES_ACTION,
    raw_request: JSON.stringify({
        ...buildVerifiedCheckoutAgreementAllocationFixture(),
        coupon: { applied: true, couponId: 901 },
        stockReserved: false,
        finalizesOnWebhook: true
    }),
    items: JSON.stringify([{ id: 101, name: 'Test Telefon', quantity: 1 }]),
    user_id: 10,
    customer_name: 'Test Kullanici',
    order_status: ORDER_STATUS.ODEME_BEKLIYOR,
    order_payment_status: PAYMENT_STATUS.REQUIRES_ACTION,
    order_total_amount: '1049.90'
});

const createCouponLimitClient = (state) => ({
    async query(sql, params = []) {
        state.calls.push({ sql, params });

        if (sql === 'BEGIN') {
            state.begins += 1;
            return { rows: [] };
        }

        if (sql === 'COMMIT') {
            state.commits += 1;
            return { rows: [] };
        }

        if (sql === 'ROLLBACK') {
            state.rollbacks += 1;
            return { rows: [] };
        }

        if (/INSERT INTO webhook_events/i.test(sql)) {
            return { rows: [{ id: 9101, processed: false }] };
        }

        if (/SELECT p\.\*/i.test(sql)) {
            return { rows: [makePaymentRow()] };
        }

        if (/UPDATE products\s+SET stock = stock -/i.test(sql)) {
            state.stockReservations += 1;
            return { rows: [{ id: params[1], stock: 4 }] };
        }

        if (/UPDATE payments/i.test(sql)) {
            state.paymentUpdates += 1;
            return { rows: [] };
        }

        if (/SELECT id, status\s+FROM coupon_reservations/i.test(sql)) {
            return { rows: [{ id: 9201, status: 'RESERVED' }] };
        }

        if (/UPDATE coupons\s+SET used_count = used_count \+/i.test(sql)) {
            state.couponAttempts += 1;
            assert.match(sql, /usage_limit IS NULL OR used_count < usage_limit/i);
            return { rows: [], rowCount: 0 };
        }

        if (/UPDATE coupon_reservations/i.test(sql)) {
            state.couponReconciliations += 1;
            assert.equal(params[0], 'RECONCILIATION_REQUIRED');
            return { rows: [{ id: 9201 }], rowCount: 1 };
        }

        if (/UPDATE orders/i.test(sql)) {
            state.orderUpdates += 1;
            return { rows: [] };
        }

        if (/UPDATE webhook_events SET processed = TRUE/i.test(sql)) {
            state.webhookProcessedUpdates += 1;
            return { rows: [] };
        }

        if (/category_stats|WITH RECURSIVE category_tree/i.test(sql)) {
            return { rows: [], rowCount: 0 };
        }

        if (/INSERT INTO order_events/i.test(sql)) {
            state.lateSideEffects += 1;
            return { rows: [] };
        }

        if (/INSERT INTO order_items/i.test(sql)) {
            state.orderItemWrites += 1;
            return { rows: [{ id: state.orderItemWrites }], rowCount: 1 };
        }

        if (/INSERT INTO notification_outbox_events/i.test(sql)) {
            state.notificationOutboxInserts += 1;
            assert.ok(['ORDER_CONFIRMED', 'PAYMENT_SUCCESS'].includes(params[2]));
            return {
                rows: [{
                    id: params[0],
                    source_event_key: params[1],
                    event_type: params[2],
                    aggregate_type: params[3],
                    aggregate_id: params[4],
                    aggregate_revision: params[5],
                    payload: JSON.parse(params[6]),
                    status: 'PENDING',
                    inserted: true
                }]
            };
        }

        throw new Error(`Unexpected coupon limit query: ${sql}`);
    },
    release() {}
});

(async () => {
    try {
        const noCouponClient = { queries: 0, async query() { this.queries += 1; } };
        assert.deepStrictEqual(
            await consumeCouponUsageIfNeeded(noCouponClient, { applied: false, couponId: 901 }),
            { consumed: false }
        );
        assert.strictEqual(noCouponClient.queries, 0);

        const successCalls = [];
        const successResult = await consumeCouponUsageIfNeeded({
            async query(sql, params) {
                successCalls.push({ sql, params });
                return {
                    rowCount: 1,
                    rows: [{ id: params[0], code: 'LIMITED10', usage_limit: 1, used_count: 1 }]
                };
            }
        }, { applied: true, couponId: 901 });
        assert.strictEqual(successResult.consumed, true);
        assert.strictEqual(successResult.couponId, 901);
        assert.strictEqual(successResult.coupon.code, 'LIMITED10');
        assert.match(successCalls[0].sql, /usage_limit IS NULL OR used_count < usage_limit/i);

        await assert.rejects(
            consumeCouponUsageIfNeeded({
                async query() {
                    return { rowCount: 0, rows: [] };
                }
            }, { applied: true, couponId: 901 }),
            (err) => err.statusCode === 409 && err.code === COUPON_USAGE_LIMIT_EXHAUSTED_CODE
        );

        applyPaytrEnv();
        const state = {
            begins: 0,
            commits: 0,
            rollbacks: 0,
            stockReservations: 0,
            paymentUpdates: 0,
            couponAttempts: 0,
            couponReconciliations: 0,
            orderUpdates: 0,
            webhookProcessedUpdates: 0,
            lateSideEffects: 0,
            orderItemWrites: 0,
            notificationOutboxInserts: 0,
            calls: []
        };
        pool.connect = async () => createCouponLimitClient(state);
        pool.query = async () => ({ rows: [{ id: 9901 }] });

        const res = createRes();
        await webhookPaytr({ body: buildPayload() }, res);

        assert.strictEqual(res.code, 200, JSON.stringify({
            body: res.body,
            queries: state.calls.map((call) => call.sql)
        }, null, 2));
        assert.strictEqual(res.body, 'OK');
        assert.strictEqual(state.begins, 1);
        assert.strictEqual(state.couponAttempts, 1);
        assert.strictEqual(state.couponReconciliations, 1);
        assert.strictEqual(state.commits, 1);
        assert.strictEqual(state.rollbacks, 0);
        assert.strictEqual(state.orderUpdates, 1);
        assert.strictEqual(state.webhookProcessedUpdates, 1);
        assert.strictEqual(state.lateSideEffects, 2);
        assert.strictEqual(state.orderItemWrites, 1);
        assert.strictEqual(state.notificationOutboxInserts, 2);

        console.log('payment coupon usage limit smoke passed');
    } finally {
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exit(1);
});
