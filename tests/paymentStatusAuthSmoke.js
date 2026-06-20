const assert = require('assert');
const paymentRoutes = require('../routes/paymentRoutes');
const { getPaymentStatus } = require('../controllers/paymentController');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');

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

const callStatus = async ({ user = { id: 10 }, row, query = { paymentRef: 'PAY-1', orderId: '7001' } }) => {
    const originalQuery = pool.query;
    const calls = [];
    pool.query = async (sql, params) => {
        calls.push({ sql, params });
        assert.match(sql, /SELECT/i);
        assert.match(sql, /o\.user_id AS order_user_id/i);
        return { rows: row ? [row] : [] };
    };

    try {
        const res = createRes();
        await getPaymentStatus({ query, user }, res);
        return { res, calls };
    } finally {
        pool.query = originalQuery;
    }
};

(async () => {
    const statusRoute = paymentRoutes.stack.find((layer) => layer.route && layer.route.path === '/status');
    assert.ok(statusRoute, 'payment status route should be registered');
    const handlerNames = statusRoute.route.stack.map((layer) => layer.handle.name);
    assert.deepStrictEqual(handlerNames.slice(0, 2), ['authenticate', 'getPaymentStatus']);

    const missingAuth = await callStatus({
        user: null,
        row: {
            payment_ref: 'PAY-1',
            payment_status: PAYMENT_STATUS.PAID,
            provider: 'iyzico',
            order_id: 7001,
            order_status: ORDER_STATUS.HAZIRLANIYOR,
            order_user_id: 10
        }
    });
    assert.strictEqual(missingAuth.res.code, 401);
    assert.strictEqual(missingAuth.calls.length, 0);

    const ownPayment = await callStatus({
        row: {
            payment_ref: 'PAY-1',
            payment_status: PAYMENT_STATUS.PAID,
            provider: 'iyzico',
            order_id: 7001,
            order_status: ORDER_STATUS.HAZIRLANIYOR,
            order_user_id: 10
        }
    });
    assert.strictEqual(ownPayment.res.code, 200);
    assert.strictEqual(ownPayment.res.body.paymentStatus, PAYMENT_STATUS.PAID);
    assert.strictEqual(ownPayment.res.body.finalized, true);

    const otherUserPayment = await callStatus({
        row: {
            payment_ref: 'PAY-1',
            payment_status: PAYMENT_STATUS.PAID,
            provider: 'iyzico',
            order_id: 7001,
            order_status: ORDER_STATUS.HAZIRLANIYOR,
            order_user_id: 11
        }
    });
    assert.strictEqual(otherUserPayment.res.code, 404);

    const guestPayment = await callStatus({
        row: {
            payment_ref: 'PAY-1',
            payment_status: PAYMENT_STATUS.PAID,
            provider: 'iyzico',
            order_id: 7001,
            order_status: ORDER_STATUS.HAZIRLANIYOR,
            order_user_id: null
        }
    });
    assert.strictEqual(guestPayment.res.code, 404);

    console.log('payment status auth smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
