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
    const originalConnect = pool.connect;
    const calls = [];
    const client = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
            assert.match(sql, /WITH locked_order AS MATERIALIZED/i);
            assert.match(sql, /payment_lookup\.payment_ref = \$1/i);
            assert.match(sql, /o\.user_id = \$2/i);
            assert.match(sql, /\(\$3::bigint IS NULL OR o\.id = \$3\)/i);
            assert.match(sql, /FOR UPDATE OF p/i);
            const orderMatches = params[2] === null || Number(row?.order_id) === Number(params[2]);
            const owned = row
                && String(row.payment_ref) === String(params[0])
                && Number(row.order_user_id) === Number(params[1])
                && orderMatches;
            return { rows: owned ? [row] : [], rowCount: owned ? 1 : 0 };
        },
        release() {}
    };
    pool.connect = async () => client;

    try {
        const res = createRes();
        await getPaymentStatus({ query, user }, res);
        return { res, calls };
    } finally {
        pool.connect = originalConnect;
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

    const ownPaymentWithoutOrderId = await callStatus({
        query: { paymentRef: 'PAY-1' },
        row: {
            payment_ref: 'PAY-1',
            payment_status: PAYMENT_STATUS.PAID,
            provider: 'iyzico',
            order_id: 7001,
            order_status: ORDER_STATUS.HAZIRLANIYOR,
            order_user_id: 10
        }
    });
    assert.strictEqual(ownPaymentWithoutOrderId.res.code, 200);
    assert.strictEqual(ownPaymentWithoutOrderId.res.body.orderId, 7001);

    const otherUserPayment = await callStatus({
        query: { paymentRef: 'PAY-1' },
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
