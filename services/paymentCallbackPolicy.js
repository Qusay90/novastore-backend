const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    resolveOrderStatus
} = require('../constants/orderStatus');
const { STOCK_RESERVATION_STATE } = require('./orderLifecyclePolicy');

const PAYMENT_CALLBACK_OUTCOME = Object.freeze({
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE'
});

const PAYMENT_CALLBACK_DECISION = Object.freeze({
    CAPTURE_ACTIVE: 'CAPTURE_ACTIVE',
    CAPTURE_RECONCILIATION: 'CAPTURE_RECONCILIATION',
    FAIL_ACTIVE: 'FAIL_ACTIVE',
    FAIL_PRESERVE_ORDER: 'FAIL_PRESERVE_ORDER',
    DUPLICATE_PAID: 'DUPLICATE_PAID',
    DUPLICATE_FAILED: 'DUPLICATE_FAILED',
    DUPLICATE_REFUNDED: 'DUPLICATE_REFUNDED',
    STALE_FAILURE: 'STALE_FAILURE',
    REFUNDED_CAPTURE_CONFLICT: 'REFUNDED_CAPTURE_CONFLICT',
    INVALID_PAYMENT_STATE: 'INVALID_PAYMENT_STATE'
});

const KNOWN_PAYMENT_STATUSES = new Set(Object.values(PAYMENT_STATUS));
const ACTIVE_PAYMENT_ORDER_STATUSES = new Set([
    ORDER_STATUS.ODEME_BEKLIYOR
]);
const REFUND_RECONCILIATION_ORDER_STATUSES = new Set([
    ORDER_STATUS.IPTAL_EDILDI,
    ORDER_STATUS.IADE_EDILDI
]);

const normalizePaymentStatus = (value) => String(value || '').trim().toUpperCase();

const planPaymentCallback = ({
    paymentStatus,
    orderStatus,
    callbackOutcome,
    stockReservationState = STOCK_RESERVATION_STATE.UNKNOWN
}) => {
    const currentPaymentStatus = normalizePaymentStatus(paymentStatus);
    const currentOrderStatus = resolveOrderStatus(orderStatus);
    const outcome = String(callbackOutcome || '').trim().toUpperCase();

    if (!Object.values(PAYMENT_CALLBACK_OUTCOME).includes(outcome)) {
        throw new TypeError('Unsupported payment callback outcome.');
    }

    if (!KNOWN_PAYMENT_STATUSES.has(currentPaymentStatus)) {
        return {
            decision: PAYMENT_CALLBACK_DECISION.INVALID_PAYMENT_STATE,
            currentPaymentStatus,
            currentOrderStatus,
            callbackOutcome: outcome,
            targetPaymentStatus: null,
            targetOrderStatus: null,
            targetRefundStatus: null,
            runCommerceSideEffects: false,
            reserveStock: false,
            releaseStockReservation: false,
            stockReservationState,
            reconciliationRequired: true,
            reconciliationReason: 'UNKNOWN_PAYMENT_STATE'
        };
    }

    if (currentPaymentStatus === PAYMENT_STATUS.REFUNDED) {
        const successConflict = outcome === PAYMENT_CALLBACK_OUTCOME.SUCCESS;
        return {
            decision: successConflict
                ? PAYMENT_CALLBACK_DECISION.REFUNDED_CAPTURE_CONFLICT
                : PAYMENT_CALLBACK_DECISION.DUPLICATE_REFUNDED,
            currentPaymentStatus,
            currentOrderStatus,
            callbackOutcome: outcome,
            targetPaymentStatus: PAYMENT_STATUS.REFUNDED,
            targetOrderStatus: currentOrderStatus,
            targetRefundStatus: null,
            runCommerceSideEffects: false,
            reserveStock: false,
            releaseStockReservation: false,
            stockReservationState,
            reconciliationRequired: successConflict,
            reconciliationReason: successConflict ? 'SUCCESS_AFTER_REFUND' : null
        };
    }

    if (outcome === PAYMENT_CALLBACK_OUTCOME.FAILURE) {
        if (currentPaymentStatus === PAYMENT_STATUS.PAID) {
            return {
                decision: PAYMENT_CALLBACK_DECISION.STALE_FAILURE,
                currentPaymentStatus,
                currentOrderStatus,
                callbackOutcome: outcome,
                targetPaymentStatus: PAYMENT_STATUS.PAID,
                targetOrderStatus: currentOrderStatus,
                targetRefundStatus: null,
                runCommerceSideEffects: false,
                reserveStock: false,
                releaseStockReservation: false,
                stockReservationState,
                reconciliationRequired: true,
                reconciliationReason: 'FAILURE_AFTER_CAPTURE'
            };
        }

        if (currentPaymentStatus === PAYMENT_STATUS.FAILED) {
            return {
                decision: PAYMENT_CALLBACK_DECISION.DUPLICATE_FAILED,
                currentPaymentStatus,
                currentOrderStatus,
                callbackOutcome: outcome,
                targetPaymentStatus: PAYMENT_STATUS.FAILED,
                targetOrderStatus: currentOrderStatus,
                targetRefundStatus: null,
                runCommerceSideEffects: false,
                reserveStock: false,
                releaseStockReservation: false,
                stockReservationState,
                reconciliationRequired: false,
                reconciliationReason: null
            };
        }

        const orderIsActive = ACTIVE_PAYMENT_ORDER_STATUSES.has(currentOrderStatus);
        const stockStateUnknown = stockReservationState === STOCK_RESERVATION_STATE.UNKNOWN;
        return {
            decision: orderIsActive
                ? PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE
                : PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER,
            currentPaymentStatus,
            currentOrderStatus,
            callbackOutcome: outcome,
            targetPaymentStatus: PAYMENT_STATUS.FAILED,
            targetOrderStatus: orderIsActive ? ORDER_STATUS.IPTAL_EDILDI : currentOrderStatus,
            targetRefundStatus: orderIsActive ? REFUND_STATUS.NONE : null,
            runCommerceSideEffects: false,
            reserveStock: false,
            releaseStockReservation: stockReservationState === STOCK_RESERVATION_STATE.RESERVED,
            stockReservationState,
            reconciliationRequired: !orderIsActive || stockStateUnknown,
            reconciliationReason: stockStateUnknown
                ? 'FAILURE_STOCK_RESERVATION_UNKNOWN'
                : orderIsActive
                    ? null
                    : 'FAILURE_OUTSIDE_PAYMENT_STAGE'
        };
    }

    if (currentPaymentStatus === PAYMENT_STATUS.PAID) {
        return {
            decision: PAYMENT_CALLBACK_DECISION.DUPLICATE_PAID,
            currentPaymentStatus,
            currentOrderStatus,
            callbackOutcome: outcome,
            targetPaymentStatus: PAYMENT_STATUS.PAID,
            targetOrderStatus: currentOrderStatus,
            targetRefundStatus: null,
            runCommerceSideEffects: false,
            reserveStock: false,
            releaseStockReservation: false,
            stockReservationState,
            reconciliationRequired: false,
            reconciliationReason: null
        };
    }

    const orderIsActive = ACTIVE_PAYMENT_ORDER_STATUSES.has(currentOrderStatus);
    const successAfterFailure = currentPaymentStatus === PAYMENT_STATUS.FAILED;
    const stockAllowsActiveCapture = [
        STOCK_RESERVATION_STATE.UNRESERVED,
        STOCK_RESERVATION_STATE.RESERVED
    ].includes(stockReservationState);
    const reconciliationRequired = successAfterFailure || !orderIsActive || !stockAllowsActiveCapture;
    const refundRequired = reconciliationRequired && (
        successAfterFailure ||
        REFUND_RECONCILIATION_ORDER_STATUSES.has(currentOrderStatus)
    );

    return {
        decision: reconciliationRequired
            ? PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION
            : PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE,
        currentPaymentStatus,
        currentOrderStatus,
        callbackOutcome: outcome,
        targetPaymentStatus: PAYMENT_STATUS.PAID,
        targetOrderStatus: reconciliationRequired ? currentOrderStatus : ORDER_STATUS.HAZIRLANIYOR,
        targetRefundStatus: refundRequired ? REFUND_STATUS.PENDING : null,
        runCommerceSideEffects: !reconciliationRequired,
        reserveStock: !reconciliationRequired && stockReservationState === STOCK_RESERVATION_STATE.UNRESERVED,
        releaseStockReservation: false,
        stockReservationState,
        reconciliationRequired,
        reconciliationReason: successAfterFailure
            ? 'SUCCESS_AFTER_FAILURE'
            : REFUND_RECONCILIATION_ORDER_STATUSES.has(currentOrderStatus)
                ? 'SUCCESS_AFTER_CANCELLATION_OR_RETURN'
                : reconciliationRequired
                    ? !orderIsActive
                        ? 'SUCCESS_DURING_FULFILLMENT'
                        : stockReservationState === STOCK_RESERVATION_STATE.RELEASED
                            ? 'SUCCESS_AFTER_STOCK_RELEASE'
                            : 'SUCCESS_STOCK_RESERVATION_UNKNOWN'
                : null
    };
};

module.exports = {
    PAYMENT_CALLBACK_DECISION,
    PAYMENT_CALLBACK_OUTCOME,
    planPaymentCallback
};
