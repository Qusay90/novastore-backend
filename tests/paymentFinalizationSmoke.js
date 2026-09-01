const assert = require('assert');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');
const { buildPaymentStatusResponse } = require('../controllers/paymentController');
const {
    createPendingPaymentOrder,
    restockItems
} = require('../services/orderService');

const createFakeClient = () => {
    const calls = [];

    return {
        calls,
        async query(sql, params = []) {
            calls.push({ sql, params });

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

            if (/UPDATE products\s+SET stock = stock -/i.test(sql)) {
                return { rows: [{ id: params[1], stock: 4 }] };
            }

            if (/UPDATE products\s+SET stock = stock \+/i.test(sql)) {
                return { rows: [] };
            }

            return { rows: [] };
        }
    };
};

(async () => {
    const client = createFakeClient();

    const { order, pricing } = await createPendingPaymentOrder({
        client,
        userId: 10,
        fullName: 'Test Kullanıcı',
        email: 'test@example.com',
        phone: '05551234567',
        address: 'Test Mahallesi, Test Sokak No:1',
        cartItems: [{ productId: 101, quantity: 1 }],
        paymentMethod: 'card'
    });

    assert.strictEqual(order.status, ORDER_STATUS.ODEME_BEKLIYOR);
    assert.strictEqual(pricing.items[0].id, 101);
    assert.strictEqual(
        client.calls.some((call) => /UPDATE products\s+SET stock = stock -/i.test(call.sql)),
        true,
        'payment initialization must reserve stock atomically before provider handoff'
    );

    await restockItems(client, [{ productId: 101, quantity: 1 }]);
    assert.strictEqual(
        client.calls.some((call) => /UPDATE products\s+SET stock = stock \+/i.test(call.sql)),
        true,
        'legacy reserved failure path can restock productId payloads'
    );

    const waitingCardStatus = buildPaymentStatusResponse({
        order_id: 7001,
        payment_ref: 'PAY-7001',
        payment_status: PAYMENT_STATUS.REQUIRES_ACTION,
        order_status: ORDER_STATUS.ODEME_BEKLIYOR,
        provider: 'iyzico'
    });
    assert.strictEqual(waitingCardStatus.finalized, false);
    assert.strictEqual(waitingCardStatus.providerFinalized, false);
    assert.strictEqual(waitingCardStatus.commerceFinalized, false);
    assert.strictEqual(waitingCardStatus.nextAction, 'WAIT_PROVIDER_CONFIRMATION');

    const waitingTransferStatus = buildPaymentStatusResponse({
        order_id: 7002,
        payment_ref: 'HVL-7002',
        payment_status: PAYMENT_STATUS.WAITING_TRANSFER,
        order_status: ORDER_STATUS.ODEME_BEKLIYOR,
        provider: 'bank_transfer'
    });
    assert.strictEqual(waitingTransferStatus.finalized, false);
    assert.strictEqual(waitingTransferStatus.nextAction, 'WAIT_TRANSFER');

    const paidStatus = buildPaymentStatusResponse({
        order_id: 7001,
        payment_ref: 'PAY-7001',
        payment_status: PAYMENT_STATUS.PAID,
        order_payment_status: PAYMENT_STATUS.PAID,
        order_status: ORDER_STATUS.HAZIRLANIYOR,
        provider: 'iyzico'
    });
    assert.strictEqual(paidStatus.finalized, true);
    assert.strictEqual(paidStatus.providerFinalized, true);
    assert.strictEqual(paidStatus.commerceFinalized, true);
    assert.strictEqual(paidStatus.nextAction, 'VIEW_ORDER');

    const failedStatus = buildPaymentStatusResponse({
        order_id: 7001,
        payment_ref: 'PAY-7001',
        payment_status: PAYMENT_STATUS.FAILED,
        order_payment_status: PAYMENT_STATUS.FAILED,
        order_status: ORDER_STATUS.IPTAL_EDILDI,
        provider: 'iyzico'
    });
    assert.strictEqual(failedStatus.finalized, true);
    assert.strictEqual(failedStatus.providerFinalized, true);
    assert.strictEqual(failedStatus.commerceFinalized, true);
    assert.strictEqual(failedStatus.nextAction, 'RETRY_PAYMENT');

    const failedReconciliationStatus = buildPaymentStatusResponse({
        order_id: 7001,
        payment_ref: 'PAY-7001',
        payment_status: PAYMENT_STATUS.FAILED,
        order_status: ORDER_STATUS.IPTAL_EDILDI,
        provider: 'iyzico',
        raw_request: JSON.stringify({
            reconciliationRequired: true,
            reconciliationTask: {
                status: 'OPEN',
                reasonCode: 'FAILURE_STOCK_RESERVATION_UNKNOWN'
            }
        })
    });
    assert.strictEqual(failedReconciliationStatus.providerFinalized, true);
    assert.strictEqual(failedReconciliationStatus.commerceFinalized, false);
    assert.strictEqual(failedReconciliationStatus.nextAction, 'WAIT_RECONCILIATION');
    assert.strictEqual(failedReconciliationStatus.reconciliationRequired, true);

    const paidOrderMismatch = buildPaymentStatusResponse({
        order_id: 7003,
        payment_ref: 'PAY-7003',
        payment_status: PAYMENT_STATUS.PAID,
        order_payment_status: PAYMENT_STATUS.PAID,
        order_status: ORDER_STATUS.ODEME_BEKLIYOR,
        provider: 'paytr'
    });
    assert.strictEqual(paidOrderMismatch.providerFinalized, true);
    assert.strictEqual(paidOrderMismatch.commerceFinalized, false);
    assert.strictEqual(paidOrderMismatch.nextAction, 'WAIT_RECONCILIATION');
    assert.strictEqual(paidOrderMismatch.reconciliationReason, 'PAID_ORDER_STATE_MISMATCH');

    const paymentTruthMismatch = buildPaymentStatusResponse({
        order_id: 7004,
        payment_ref: 'PAY-7004',
        payment_status: PAYMENT_STATUS.PAID,
        order_payment_status: PAYMENT_STATUS.REQUIRES_ACTION,
        order_status: ORDER_STATUS.HAZIRLANIYOR,
        provider: 'paytr'
    });
    assert.strictEqual(paymentTruthMismatch.commerceFinalized, false);
    assert.strictEqual(paymentTruthMismatch.reconciliationReason, 'PAYMENT_ORDER_PAYMENT_STATUS_MISMATCH');

    const failedOrderMismatch = buildPaymentStatusResponse({
        order_id: 7005,
        payment_ref: 'PAY-7005',
        payment_status: PAYMENT_STATUS.FAILED,
        order_payment_status: PAYMENT_STATUS.FAILED,
        order_status: ORDER_STATUS.HAZIRLANIYOR,
        provider: 'paytr'
    });
    assert.strictEqual(failedOrderMismatch.commerceFinalized, false);
    assert.strictEqual(failedOrderMismatch.reconciliationReason, 'FAILED_ORDER_STATE_MISMATCH');

    const refundedOrderMismatch = buildPaymentStatusResponse({
        order_id: 7006,
        payment_ref: 'PAY-7006',
        payment_status: PAYMENT_STATUS.REFUNDED,
        order_payment_status: PAYMENT_STATUS.REFUNDED,
        order_status: ORDER_STATUS.IADE_EDILDI,
        refund_status: 'PENDING',
        provider: 'paytr'
    });
    assert.strictEqual(refundedOrderMismatch.commerceFinalized, false);
    assert.strictEqual(refundedOrderMismatch.reconciliationReason, 'REFUNDED_ORDER_STATE_MISMATCH');

    console.log('payment finalization smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
