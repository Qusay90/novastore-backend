const assert = require('assert');
const { normalizeOrderVisibility } = require('../controllers/orderController');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');

const pendingByStatus = normalizeOrderVisibility({
    id: 1,
    status: ORDER_STATUS.ODEME_BEKLIYOR,
    payment_status: PAYMENT_STATUS.REQUIRES_ACTION
});

assert.strictEqual(pendingByStatus.is_pending_payment, true);
assert.strictEqual(pendingByStatus.display_status, ORDER_STATUS.ODEME_BEKLIYOR);
assert.match(pendingByStatus.status_note, /kesin sipari/);

const paidOrder = normalizeOrderVisibility({
    id: 2,
    status: ORDER_STATUS.ONAY_BEKLIYOR,
    payment_status: PAYMENT_STATUS.PAID
});

assert.strictEqual(paidOrder.is_pending_payment, false);
assert.strictEqual(paidOrder.is_payment_failed, false);
assert.strictEqual(paidOrder.display_status, ORDER_STATUS.ONAY_BEKLIYOR);
assert.strictEqual(paidOrder.status_note, null);

const failedPayment = normalizeOrderVisibility({
    id: 3,
    status: ORDER_STATUS.IPTAL_EDILDI,
    payment_status: PAYMENT_STATUS.FAILED
});

assert.strictEqual(failedPayment.is_payment_failed, true);
assert.strictEqual(failedPayment.display_status, 'Ödeme Başarısız');
assert.match(failedPayment.status_note, /kesinleşmedi/);

console.log('order visibility smoke ok');
