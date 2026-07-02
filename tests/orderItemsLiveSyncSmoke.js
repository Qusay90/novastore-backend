const assert = require('assert');
const path = require('path');
const { spawnLocalServer, stopServerProcess } = require('./helpers/localServerProcess');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const createCommerceSchema = require('../models/createCommerceDb');
const createNotificationsTable = require('../models/createNotificationDb');
const { reconcileOrderItemsForOrder } = require('../services/orderService');
const { getPublicCollection } = require('../services/collectionService');
const { buildPaytrCallbackHash } = require('../services/paytrPaymentService');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');
const { resolveStartupSafety } = require('../config/startupSafety');

const root = path.join(__dirname, '..');
const port = 5201;
const paytrEnv = {
    PAYTR_MERCHANT_ID: 'live-sync-merchant',
    PAYTR_MERCHANT_KEY: 'live-sync-key',
    PAYTR_MERCHANT_SALT: 'live-sync-salt',
    PAYTR_BASE_URL: 'https://www.paytr.com',
    PAYTR_CALLBACK_URL: `http://127.0.0.1:${port}/api/payments/webhook/paytr`,
    PAYTR_SUCCESS_URL: 'http://127.0.0.1/payment-result.html',
    PAYTR_FAIL_URL: 'http://127.0.0.1/payment-result.html',
    PAYTR_TEST_MODE: 'true',
    PAYTR_DEBUG_ON: 'true',
    PAYMENT_PROVIDER: 'paytr'
};
let child;

const waitForServer = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Order item sync server startup timed out')), 30000);
    const onData = (chunk) => {
        if (chunk.toString().includes('NovaStore sunucusu')) {
            clearTimeout(timer);
            resolve();
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited before order item sync smoke: ${code}`));
    });
});

const postPaytrCallback = async ({ paymentRef, status, totalAmount = '30000' }) => {
    const payload = {
        merchant_oid: paymentRef,
        status,
        total_amount: totalAmount,
        failed_reason_code: status === 'success' ? '' : '99',
        failed_reason_msg: status === 'success' ? '' : 'Declined'
    };
    payload.hash = buildPaytrCallbackHash({
        merchantOid: payload.merchant_oid,
        status: payload.status,
        totalAmount: payload.total_amount,
        merchantKey: paytrEnv.PAYTR_MERCHANT_KEY,
        merchantSalt: paytrEnv.PAYTR_MERCHANT_SALT
    });
    return fetch(`http://127.0.0.1:${port}/api/payments/webhook/paytr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(payload)
    });
};

const insertPendingPayment = async ({ productId, paymentRef, status = PAYMENT_STATUS.REQUIRES_ACTION }) => {
    const items = [{
        id: productId,
        name: 'Canlı Sync Ürünü',
        quantity: 2,
        price: 150,
        line_total: 300
    }];
    const orderResult = await pool.query(`
        INSERT INTO orders (
            total_amount, status, items, payment_status, payment_method, created_at
        )
        VALUES (300, $1, $2::jsonb, $3, 'card', CURRENT_TIMESTAMP)
        RETURNING id, items
    `, [ORDER_STATUS.ODEME_BEKLIYOR, JSON.stringify(items), status]);
    const order = orderResult.rows[0];
    await pool.query(`
        INSERT INTO payments (
            order_id, provider, payment_ref, amount, currency, status, raw_request, raw_response
        )
        VALUES ($1, 'paytr', $2, 300, 'TRY', $3, $4::jsonb, '{}'::jsonb)
    `, [
        order.id,
        paymentRef,
        status,
        JSON.stringify({ stockReserved: false, finalizesOnWebhook: true })
    ]);
    return { order, items };
};

const expectCollection404 = async (slug) => {
    await assert.rejects(
        () => getPublicCollection(slug),
        (error) => error.statusCode === 404
    );
};

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    await createNotificationsTable();
    await createCommerceSchema();

    const productResult = await pool.query(`
        INSERT INTO products (
            name, price, stock, category, categories,
            publication_status, is_customer_visible
        )
        VALUES (
            'Canlı Sync Ürünü', 150, 5, 'Canlı',
            ARRAY['Canlı']::TEXT[], 'active', TRUE
        )
        RETURNING id
    `);
    const productId = Number(productResult.rows[0].id);
    await pool.query(`
        INSERT INTO collections (
            name, slug, collection_type, rule_code, is_active
        )
        VALUES ('Canlı Çok Satanlar', 'canli-cok-satanlar', 'dynamic', 'best_sellers', TRUE)
    `);

    const successPaymentRef = 'NST-PAYTR-LIVE-SUCCESS';
    const success = await insertPendingPayment({ productId, paymentRef: successPaymentRef });
    const pendingPaymentRef = 'NST-PAYTR-LIVE-PENDING';
    const pending = await insertPendingPayment({ productId, paymentRef: pendingPaymentRef });
    const failedPaymentRef = 'NST-PAYTR-LIVE-FAILED';
    const failed = await insertPendingPayment({ productId, paymentRef: failedPaymentRef });

    child = spawnLocalServer({
        root,
        port,
        env: paytrEnv
    });
    await waitForServer();

    const successResponse = await postPaytrCallback({
        paymentRef: successPaymentRef,
        status: 'success'
    });
    assert.strictEqual(successResponse.status, 200);
    assert.strictEqual(await successResponse.text(), 'OK');

    const successState = await pool.query(`
        SELECT
            customer_order.items,
            customer_order.payment_status,
            customer_order.status,
            product.stock,
            (SELECT COUNT(*)::INTEGER
             FROM order_items
             WHERE order_id = customer_order.id) AS order_item_count
        FROM orders customer_order
        JOIN products product ON product.id = $2
        WHERE customer_order.id = $1
    `, [success.order.id, productId]);
    assert.deepStrictEqual(successState.rows[0].items, success.items);
    assert.strictEqual(successState.rows[0].payment_status, PAYMENT_STATUS.PAID);
    assert.strictEqual(successState.rows[0].status, ORDER_STATUS.HAZIRLANIYOR);
    assert.strictEqual(successState.rows[0].order_item_count, 1);
    assert.strictEqual(Number(successState.rows[0].stock), 3);

    const duplicateResponse = await postPaytrCallback({
        paymentRef: successPaymentRef,
        status: 'success'
    });
    assert.strictEqual(duplicateResponse.status, 200);
    assert.strictEqual(await duplicateResponse.text(), 'OK');
    const duplicateCount = await pool.query(
        'SELECT COUNT(*)::INTEGER AS count FROM order_items WHERE order_id = $1',
        [success.order.id]
    );
    assert.strictEqual(duplicateCount.rows[0].count, 1);

    const failedResponse = await postPaytrCallback({
        paymentRef: failedPaymentRef,
        status: 'failed'
    });
    assert.strictEqual(failedResponse.status, 200);
    assert.strictEqual(await failedResponse.text(), 'OK');
    const nonSuccessfulCount = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE order_id = $1)::INTEGER AS pending_count,
            COUNT(*) FILTER (WHERE order_id = $2)::INTEGER AS failed_count
        FROM order_items
    `, [pending.order.id, failed.order.id]);
    assert.strictEqual(nonSuccessfulCount.rows[0].pending_count, 0);
    assert.strictEqual(nonSuccessfulCount.rows[0].failed_count, 0);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const pendingReconciliation = await reconcileOrderItemsForOrder(client, pending.order.id);
        assert.strictEqual(pendingReconciliation.reconciled, false);
        assert.strictEqual(pendingReconciliation.reason, 'order_not_paid');
        await client.query('COMMIT');

        await pool.query('DELETE FROM order_items WHERE order_id = $1', [success.order.id]);
        await client.query('BEGIN');
        const firstReconciliation = await reconcileOrderItemsForOrder(client, success.order.id);
        const secondReconciliation = await reconcileOrderItemsForOrder(client, success.order.id);
        await client.query('COMMIT');
        assert.strictEqual(firstReconciliation.reconciled, true);
        assert.strictEqual(secondReconciliation.reconciled, true);
    } finally {
        client.release();
    }
    const reconciledCount = await pool.query(
        'SELECT COUNT(*)::INTEGER AS count FROM order_items WHERE order_id = $1',
        [success.order.id]
    );
    assert.strictEqual(reconciledCount.rows[0].count, 1);

    await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [ORDER_STATUS.TESLIM_EDILDI, success.order.id]
    );
    await pool.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);
    const bestSellers = await getPublicCollection('canli-cok-satanlar');
    assert.strictEqual(bestSellers.products[0].id, productId);
    assert.strictEqual(bestSellers.products[0].sold_quantity, 2);
    assert.strictEqual(bestSellers.products[0].is_purchasable, false);

    await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [ORDER_STATUS.IPTAL_EDILDI, success.order.id]
    );
    await expectCollection404('canli-cok-satanlar');
    await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [ORDER_STATUS.IADE_EDILDI, success.order.id]
    );
    await expectCollection404('canli-cok-satanlar');
    await pool.query(
        'UPDATE orders SET status = $1, payment_status = $2 WHERE id = $3',
        [ORDER_STATUS.TESLIM_EDILDI, PAYMENT_STATUS.REFUNDED, success.order.id]
    );
    await expectCollection404('canli-cok-satanlar');
    await pool.query(`
        UPDATE orders
        SET status = $1,
            payment_status = $2,
            created_at = CURRENT_TIMESTAMP - INTERVAL '31 days'
        WHERE id = $3
    `, [ORDER_STATUS.TESLIM_EDILDI, PAYMENT_STATUS.PAID, success.order.id]);
    await expectCollection404('canli-cok-satanlar');

    console.log('order items live sync smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await stopServerProcess(child);
    await pool.end();
});
