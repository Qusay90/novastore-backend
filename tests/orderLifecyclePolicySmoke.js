const assert = require('node:assert/strict');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS
} = require('../constants/orderStatus');
const {
    ORDER_COMMAND,
    ORDER_TRANSITION_MATRIX,
    STOCK_RESERVATION_STATE,
    OrderLifecycleError,
    assertTransition,
    evaluateGenericStatusRequest,
    getStockReservationState,
    isProviderPending,
    planOrderCancellation,
    selectCancellationPayments,
    validateCancelledOrderIdempotency
} = require('../services/orderLifecyclePolicy');

const expectLifecycleError = (fn, code, statusCode = 409) => {
    assert.throws(fn, (error) => {
        assert(error instanceof OrderLifecycleError);
        assert.equal(error.code, code);
        assert.equal(error.statusCode, statusCode);
        return true;
    });
};

const payment = ({
    id = 1,
    provider = 'paytr',
    status = PAYMENT_STATUS.PAID,
    rawRequest = { stockReserved: true, finalizesOnWebhook: true }
} = {}) => ({
    id,
    provider,
    status,
    raw_request: JSON.stringify(rawRequest)
});

(() => {
    const statuses = Object.values(ORDER_STATUS);
    const commands = Object.values(ORDER_COMMAND);

    assert(Object.isFrozen(ORDER_TRANSITION_MATRIX));
    commands.forEach((command) => {
        assert(Object.isFrozen(ORDER_TRANSITION_MATRIX[command]));
        ORDER_TRANSITION_MATRIX[command].forEach((transition) => assert(Object.isFrozen(transition)));

        const allowed = new Set(
            ORDER_TRANSITION_MATRIX[command].map(([current, next]) => `${current}\u0000${next}`)
        );
        statuses.forEach((currentStatus) => {
            statuses.forEach((nextStatus) => {
                const transitionKey = `${currentStatus}\u0000${nextStatus}`;
                if (allowed.has(transitionKey)) {
                    assert.deepEqual(
                        assertTransition({ command, currentStatus, nextStatus }),
                        { command, currentStatus, nextStatus }
                    );
                    return;
                }
                expectLifecycleError(
                    () => assertTransition({ command, currentStatus, nextStatus }),
                    'ORDER_TRANSITION_NOT_ALLOWED'
                );
            });
        });
    });

    assert.deepEqual(ORDER_TRANSITION_MATRIX[ORDER_COMMAND.CANCEL], [
        [ORDER_STATUS.ODEME_BEKLIYOR, ORDER_STATUS.IPTAL_EDILDI],
        [ORDER_STATUS.ONAY_BEKLIYOR, ORDER_STATUS.IPTAL_EDILDI],
        [ORDER_STATUS.HAZIRLANIYOR, ORDER_STATUS.IPTAL_EDILDI]
    ]);
    expectLifecycleError(
        () => assertTransition({
            command: ORDER_COMMAND.CANCEL,
            currentStatus: ORDER_STATUS.KARGOYA_VERILDI,
            nextStatus: ORDER_STATUS.IPTAL_EDILDI
        }),
        'ORDER_TRANSITION_NOT_ALLOWED'
    );
    expectLifecycleError(
        () => assertTransition({
            command: ORDER_COMMAND.CANCEL,
            currentStatus: ORDER_STATUS.IADE_EDILDI,
            nextStatus: ORDER_STATUS.IPTAL_EDILDI
        }),
        'ORDER_TRANSITION_NOT_ALLOWED'
    );

    const sameState = evaluateGenericStatusRequest({
        currentStatus: ORDER_STATUS.HAZIRLANIYOR,
        requestedStatus: ORDER_STATUS.HAZIRLANIYOR,
        expectedStatus: ORDER_STATUS.HAZIRLANIYOR
    });
    assert.deepEqual(sameState, {
        reused: true,
        currentStatus: ORDER_STATUS.HAZIRLANIYOR,
        requestedStatus: ORDER_STATUS.HAZIRLANIYOR
    });
    assert(Object.isFrozen(sameState));
    expectLifecycleError(
        () => evaluateGenericStatusRequest({
            currentStatus: ORDER_STATUS.HAZIRLANIYOR,
            requestedStatus: ORDER_STATUS.KARGOYA_VERILDI
        }),
        'ORDER_STATUS_COMMAND_REQUIRED'
    );
    expectLifecycleError(
        () => evaluateGenericStatusRequest({
            currentStatus: ORDER_STATUS.HAZIRLANIYOR,
            requestedStatus: ORDER_STATUS.HAZIRLANIYOR,
            expectedStatus: ORDER_STATUS.ONAY_BEKLIYOR
        }),
        'ORDER_STATUS_CONFLICT'
    );
    expectLifecycleError(
        () => evaluateGenericStatusRequest({
            currentStatus: ORDER_STATUS.HAZIRLANIYOR,
            requestedStatus: 'uydurma durum'
        }),
        'ORDER_STATUS_INVALID',
        400
    );

    assert.equal(getStockReservationState(payment()), STOCK_RESERVATION_STATE.RESERVED);
    assert.equal(getStockReservationState(payment({ rawRequest: { stockReserved: false } })), STOCK_RESERVATION_STATE.UNRESERVED);
    assert.equal(getStockReservationState(payment({
        rawRequest: { stockReserved: false, stockReleasedAt: '2026-07-14T10:00:00.000Z' }
    })), STOCK_RESERVATION_STATE.RELEASED);
    assert.equal(getStockReservationState(payment({ rawRequest: {} })), STOCK_RESERVATION_STATE.UNKNOWN);
    assert.equal(getStockReservationState({ raw_request: '{invalid-json' }), STOCK_RESERVATION_STATE.UNKNOWN);

    assert.equal(isProviderPending(payment({ status: PAYMENT_STATUS.REQUIRES_ACTION })), true);
    assert.equal(isProviderPending(payment({ provider: 'iyzico', status: PAYMENT_STATUS.PENDING })), true);
    assert.equal(isProviderPending(payment({ provider: 'bank_transfer', status: PAYMENT_STATUS.PENDING })), false);
    assert.equal(isProviderPending(payment({ status: PAYMENT_STATUS.PAID })), false);

    const activePayment = {
        ...payment({ id: 7 }),
        payment_ref: 'ACTIVE-7'
    };
    assert.deepEqual(selectCancellationPayments({
        order: { payment_ref: 'ACTIVE-7' },
        payments: [
            {
                ...payment({
                    id: 6,
                    status: PAYMENT_STATUS.FAILED,
                    rawRequest: { stockReserved: false }
                }),
                payment_ref: 'OLD-6'
            },
            activePayment
        ]
    }), [activePayment]);
    expectLifecycleError(
        () => selectCancellationPayments({
            order: { payment_ref: 'ACTIVE-7' },
            payments: [{ ...payment({ id: 6 }), payment_ref: 'OLD-6' }, activePayment]
        }),
        'ORDER_PAYMENT_HISTORY_CONFLICT'
    );
    expectLifecycleError(
        () => selectCancellationPayments({
            order: { payment_ref: 'MISSING' },
            payments: [activePayment]
        }),
        'ORDER_ACTIVE_PAYMENT_NOT_FOUND'
    );

    const paidReservation = payment();
    const paidCancellation = planOrderCancellation({
        order: { status: ORDER_STATUS.HAZIRLANIYOR },
        payments: [paidReservation]
    });
    assert.equal(paidCancellation.currentStatus, ORDER_STATUS.HAZIRLANIYOR);
    assert.equal(paidCancellation.refundStatus, REFUND_STATUS.PENDING);
    assert.equal(paidCancellation.releasePayment, paidReservation);
    assert(Object.isFrozen(paidCancellation));

    const failedCancellation = planOrderCancellation({
        order: { status: ORDER_STATUS.ODEME_BEKLIYOR },
        payments: [payment({
            provider: 'paytr',
            status: PAYMENT_STATUS.FAILED,
            rawRequest: { stockReserved: false, finalizesOnWebhook: true }
        })]
    });
    assert.equal(failedCancellation.refundStatus, REFUND_STATUS.NONE);
    assert.equal(failedCancellation.releasePayment, null);

    const refundedCancellation = planOrderCancellation({
        order: { status: ORDER_STATUS.ONAY_BEKLIYOR },
        payments: [payment({
            provider: 'manual_transfer',
            status: PAYMENT_STATUS.REFUNDED,
            rawRequest: { stockReserved: false }
        })]
    });
    assert.equal(refundedCancellation.refundStatus, REFUND_STATUS.COMPLETED);
    assert.equal(refundedCancellation.releasePayment, null);

    expectLifecycleError(
        () => planOrderCancellation({
            order: { status: ORDER_STATUS.ODEME_BEKLIYOR },
            payments: [payment({ status: PAYMENT_STATUS.REQUIRES_ACTION, rawRequest: { stockReserved: false } })]
        }),
        'ORDER_PAYMENT_PENDING_CANCELLATION_BLOCKED'
    );
    expectLifecycleError(
        () => planOrderCancellation({
            order: { status: ORDER_STATUS.HAZIRLANIYOR },
            payments: [payment({ status: PAYMENT_STATUS.PAID, rawRequest: { stockReserved: false } })]
        }),
        'ORDER_PAID_STOCK_RESERVATION_MISSING'
    );
    expectLifecycleError(
        () => planOrderCancellation({
            order: { status: ORDER_STATUS.HAZIRLANIYOR },
            payments: [payment({ rawRequest: {} })]
        }),
        'ORDER_STOCK_RESERVATION_UNKNOWN'
    );
    expectLifecycleError(
        () => planOrderCancellation({
            order: { status: ORDER_STATUS.HAZIRLANIYOR },
            payments: [payment({ id: 1 }), payment({ id: 2 })]
        }),
        'ORDER_MULTIPLE_STOCK_RESERVATIONS'
    );
    [ORDER_STATUS.KARGOYA_VERILDI, ORDER_STATUS.TESLIM_EDILDI, ORDER_STATUS.IADE_EDILDI].forEach((status) => {
        expectLifecycleError(
            () => planOrderCancellation({ order: { status }, payments: [paidReservation] }),
            'ORDER_TRANSITION_NOT_ALLOWED'
        );
    });

    assert.deepEqual(validateCancelledOrderIdempotency({
        payments: [payment({
            status: PAYMENT_STATUS.PAID,
            rawRequest: { stockReserved: false, stockReleaseReason: 'CUSTOMER_REQUEST' }
        })]
    }), { reused: true });
    assert.deepEqual(validateCancelledOrderIdempotency({
        payments: [payment({ status: PAYMENT_STATUS.FAILED, rawRequest: { stockReserved: false } })]
    }), { reused: true });
    expectLifecycleError(
        () => validateCancelledOrderIdempotency({ payments: [] }),
        'ORDER_CANCELLED_STATE_UNVERIFIED'
    );
    expectLifecycleError(
        () => validateCancelledOrderIdempotency({
            payments: [payment({ status: PAYMENT_STATUS.REQUIRES_ACTION, rawRequest: { stockReserved: false } })]
        }),
        'ORDER_CANCELLED_PAYMENT_STILL_PENDING'
    );
    expectLifecycleError(
        () => validateCancelledOrderIdempotency({ payments: [payment()] }),
        'ORDER_CANCELLED_STOCK_STILL_RESERVED'
    );
    expectLifecycleError(
        () => validateCancelledOrderIdempotency({ payments: [payment({ rawRequest: {} })] }),
        'ORDER_CANCELLED_STATE_UNVERIFIED'
    );

    console.log('order lifecycle policy smoke passed');
})();
