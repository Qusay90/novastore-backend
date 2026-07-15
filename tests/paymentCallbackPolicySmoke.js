const assert = require('assert');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { STOCK_RESERVATION_STATE } = require('../services/orderLifecyclePolicy');
const {
    PAYMENT_CALLBACK_DECISION,
    PAYMENT_CALLBACK_OUTCOME,
    planPaymentCallback
} = require('../services/paymentCallbackPolicy');

const plan = ({
    paymentStatus = PAYMENT_STATUS.REQUIRES_ACTION,
    orderStatus = ORDER_STATUS.ODEME_BEKLIYOR,
    callbackOutcome = PAYMENT_CALLBACK_OUTCOME.SUCCESS,
    stockReservationState = STOCK_RESERVATION_STATE.UNRESERVED
} = {}) => planPaymentCallback({
    paymentStatus,
    orderStatus,
    callbackOutcome,
    stockReservationState
});

const activeCapture = plan();
assert.strictEqual(activeCapture.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE);
assert.strictEqual(activeCapture.targetOrderStatus, ORDER_STATUS.HAZIRLANIYOR);
assert.strictEqual(activeCapture.reserveStock, true);
assert.strictEqual(activeCapture.runCommerceSideEffects, true);

const alreadyReservedCapture = plan({ stockReservationState: STOCK_RESERVATION_STATE.RESERVED });
assert.strictEqual(alreadyReservedCapture.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE);
assert.strictEqual(alreadyReservedCapture.reserveStock, false);

const approvalStateCapture = plan({ orderStatus: ORDER_STATUS.ONAY_BEKLIYOR });
assert.strictEqual(approvalStateCapture.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION);
assert.strictEqual(approvalStateCapture.targetOrderStatus, ORDER_STATUS.ONAY_BEKLIYOR);
assert.strictEqual(approvalStateCapture.targetRefundStatus, null);
assert.strictEqual(approvalStateCapture.runCommerceSideEffects, false);

for (const orderStatus of [ORDER_STATUS.IPTAL_EDILDI, ORDER_STATUS.IADE_EDILDI]) {
    const cancelledCapture = plan({ orderStatus });
    assert.strictEqual(cancelledCapture.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION);
    assert.strictEqual(cancelledCapture.targetPaymentStatus, PAYMENT_STATUS.PAID);
    assert.strictEqual(cancelledCapture.targetOrderStatus, orderStatus);
    assert.strictEqual(cancelledCapture.targetRefundStatus, REFUND_STATUS.PENDING);
    assert.strictEqual(cancelledCapture.runCommerceSideEffects, false);
}

for (const orderStatus of [
    ORDER_STATUS.HAZIRLANIYOR,
    ORDER_STATUS.KARGOYA_VERILDI,
    ORDER_STATUS.TESLIM_EDILDI
]) {
    const fulfillmentCapture = plan({ orderStatus });
    assert.strictEqual(fulfillmentCapture.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION);
    assert.strictEqual(fulfillmentCapture.targetOrderStatus, orderStatus);
    assert.strictEqual(fulfillmentCapture.targetRefundStatus, null);
    assert.strictEqual(fulfillmentCapture.reconciliationReason, 'SUCCESS_DURING_FULFILLMENT');
}

for (const stockReservationState of [
    STOCK_RESERVATION_STATE.UNKNOWN,
    STOCK_RESERVATION_STATE.RELEASED
]) {
    const unsafeStockCapture = plan({ stockReservationState });
    assert.strictEqual(unsafeStockCapture.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION);
    assert.strictEqual(unsafeStockCapture.targetOrderStatus, ORDER_STATUS.ODEME_BEKLIYOR);
    assert.strictEqual(unsafeStockCapture.targetRefundStatus, null);
    assert.strictEqual(unsafeStockCapture.reserveStock, false);
    assert.strictEqual(unsafeStockCapture.runCommerceSideEffects, false);
}

const successAfterFailure = plan({ paymentStatus: PAYMENT_STATUS.FAILED });
assert.strictEqual(successAfterFailure.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION);
assert.strictEqual(successAfterFailure.targetPaymentStatus, PAYMENT_STATUS.PAID);
assert.strictEqual(successAfterFailure.targetOrderStatus, ORDER_STATUS.ODEME_BEKLIYOR);
assert.strictEqual(successAfterFailure.targetRefundStatus, REFUND_STATUS.PENDING);
assert.strictEqual(successAfterFailure.reconciliationReason, 'SUCCESS_AFTER_FAILURE');

const staleFailure = plan({
    paymentStatus: PAYMENT_STATUS.PAID,
    orderStatus: ORDER_STATUS.HAZIRLANIYOR,
    callbackOutcome: PAYMENT_CALLBACK_OUTCOME.FAILURE,
    stockReservationState: STOCK_RESERVATION_STATE.RESERVED
});
assert.strictEqual(staleFailure.decision, PAYMENT_CALLBACK_DECISION.STALE_FAILURE);
assert.strictEqual(staleFailure.targetPaymentStatus, PAYMENT_STATUS.PAID);
assert.strictEqual(staleFailure.releaseStockReservation, false);

const refundedCapture = plan({
    paymentStatus: PAYMENT_STATUS.REFUNDED,
    orderStatus: ORDER_STATUS.IADE_EDILDI
});
assert.strictEqual(refundedCapture.decision, PAYMENT_CALLBACK_DECISION.REFUNDED_CAPTURE_CONFLICT);
assert.strictEqual(refundedCapture.targetPaymentStatus, PAYMENT_STATUS.REFUNDED);
assert.strictEqual(refundedCapture.runCommerceSideEffects, false);

const reservedFailure = plan({
    callbackOutcome: PAYMENT_CALLBACK_OUTCOME.FAILURE,
    stockReservationState: STOCK_RESERVATION_STATE.RESERVED
});
assert.strictEqual(reservedFailure.decision, PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE);
assert.strictEqual(reservedFailure.targetOrderStatus, ORDER_STATUS.IPTAL_EDILDI);
assert.strictEqual(reservedFailure.releaseStockReservation, true);

const unknownFailure = plan({
    callbackOutcome: PAYMENT_CALLBACK_OUTCOME.FAILURE,
    stockReservationState: STOCK_RESERVATION_STATE.UNKNOWN
});
assert.strictEqual(unknownFailure.decision, PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE);
assert.strictEqual(unknownFailure.releaseStockReservation, false);
assert.strictEqual(unknownFailure.reconciliationRequired, true);
assert.strictEqual(unknownFailure.reconciliationReason, 'FAILURE_STOCK_RESERVATION_UNKNOWN');

for (const stockReservationState of [
    STOCK_RESERVATION_STATE.UNRESERVED,
    STOCK_RESERVATION_STATE.RELEASED
]) {
    const noReleaseFailure = plan({
        callbackOutcome: PAYMENT_CALLBACK_OUTCOME.FAILURE,
        stockReservationState
    });
    assert.strictEqual(noReleaseFailure.releaseStockReservation, false);
}

console.log('payment callback policy smoke passed');
