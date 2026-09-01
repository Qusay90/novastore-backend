'use strict';

const assert = require('assert');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { getPaymentStatus } = require('../controllers/paymentController');
const {
    PAYMENT_CALLBACK_DECISION,
    PAYMENT_CALLBACK_OUTCOME,
    planPaymentCallback
} = require('../services/paymentCallbackPolicy');
const { getStockReservationState } = require('../services/orderLifecyclePolicy');

const CHECKED_AT = Date.parse('2026-09-01T12:00:00.000Z');

const createRes = () => ({
    code: null,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
});

const createState = ({
    paymentRef,
    provider,
    paymentStatus,
    expiresAt,
    ownerUserId = 10
}) => ({
    payment: {
        id: 501,
        order_id: 701,
        payment_ref: paymentRef,
        provider,
        status: paymentStatus,
        raw_request: {
            stockReserved: true,
            reservationExpiresAt: expiresAt,
            reservationPolicy: provider === 'bank_transfer' ? 'bank_transfer_v1' : 'provider_handoff_v1'
        },
        raw_response: {}
    },
    order: {
        id: 701,
        user_id: ownerUserId,
        status: ORDER_STATUS.ODEME_BEKLIYOR,
        payment_status: paymentStatus,
        refund_status: REFUND_STATUS.NONE,
        items: [{ id: 91, quantity: 2, name: 'Rezervasyon ürünü' }]
    },
    productStock: 4,
    couponReservationStatus: 'RESERVED',
    stockReleaseCount: 0,
    couponReleaseCount: 0,
    expiryEventCount: 0,
    transactionCommands: []
});

const createClient = (state) => ({
    async query(sql, params = []) {
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
            state.transactionCommands.push(sql);
            return { rows: [], rowCount: 0 };
        }

        if (/WITH locked_order AS MATERIALIZED/i.test(sql)) {
            assert.match(sql, /payment_lookup\.payment_ref = \$1/i);
            assert.match(sql, /o\.user_id = \$2/i);
            assert.match(sql, /FOR UPDATE OF o/i);
            assert.match(sql, /FOR UPDATE OF p/i);
            const [paymentRef, userId, orderId] = params;
            const owned = paymentRef === state.payment.payment_ref
                && (orderId === null || Number(orderId) === state.order.id)
                && Number(userId) === state.order.user_id;
            return {
                rows: owned ? [{
                    ...state.payment,
                    payment_status: state.payment.status,
                    items: state.order.items,
                    order_user_id: state.order.user_id,
                    order_id: state.order.id,
                    order_status: state.order.status,
                    order_payment_status: state.order.payment_status,
                    refund_status: state.order.refund_status,
                    reservation_checked_at: new Date(CHECKED_AT)
                }] : [],
                rowCount: owned ? 1 : 0
            };
        }

        if (/UPDATE products\s+SET stock = stock \+/i.test(sql)) {
            state.productStock += Number(params[0]);
            state.stockReleaseCount += 1;
            return { rows: [{ id: Number(params[1]), stock: state.productStock }], rowCount: 1 };
        }

        if (/UPDATE payments\s+SET raw_request =/i.test(sql)) {
            state.payment.raw_request = {
                ...state.payment.raw_request,
                ...JSON.parse(params[0])
            };
            return { rows: [{ id: state.payment.id }], rowCount: 1 };
        }

        if (/UPDATE coupon_reservations/i.test(sql)) {
            const releasable = state.couponReservationStatus === 'RESERVED';
            if (releasable) {
                state.couponReservationStatus = String(params[0]);
                state.couponReleaseCount += 1;
            }
            return { rows: releasable ? [{ id: 801 }] : [], rowCount: releasable ? 1 : 0 };
        }

        if (/UPDATE payments\s+SET status = \$1/i.test(sql)) {
            const active = [PAYMENT_STATUS.REQUIRES_ACTION, PAYMENT_STATUS.WAITING_TRANSFER]
                .includes(state.payment.status);
            if (!active) return { rows: [], rowCount: 0 };
            state.payment.status = String(params[0]);
            state.payment.raw_response = {
                ...state.payment.raw_response,
                ...JSON.parse(params[1])
            };
            return {
                rows: [{
                    id: state.payment.id,
                    status: state.payment.status,
                    raw_request: state.payment.raw_request,
                    raw_response: state.payment.raw_response
                }],
                rowCount: 1
            };
        }

        if (/UPDATE orders\s+SET payment_status = \$1/i.test(sql)) {
            if (state.order.status !== ORDER_STATUS.ODEME_BEKLIYOR) return { rows: [], rowCount: 0 };
            state.order.payment_status = String(params[0]);
            state.order.status = String(params[1]);
            state.order.refund_status = String(params[2]);
            return {
                rows: [{
                    id: state.order.id,
                    status: state.order.status,
                    payment_status: state.order.payment_status,
                    refund_status: state.order.refund_status
                }],
                rowCount: 1
            };
        }

        if (/INSERT INTO order_events/i.test(sql)) {
            if (params[1] === 'PAYMENT_RESERVATION_EXPIRED') state.expiryEventCount += 1;
            return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
    },
    release() {}
});

const callStatus = async (state, userId = 10) => {
    const client = createClient(state);
    pool.connect = async () => client;
    const res = createRes();
    await getPaymentStatus({
        query: { paymentRef: state.payment.payment_ref, orderId: String(state.order.id) },
        user: { id: userId }
    }, res);
    return res;
};

(async () => {
    const originalConnect = pool.connect;
    const originalConsoleError = console.error;
    try {
        console.error = () => {};

        const expiredPaytr = createState({
            paymentRef: 'PAYTRSTATUS701',
            provider: 'paytr',
            paymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
            expiresAt: '2026-09-01T11:59:59.000Z'
        });
        const expiredPaytrResponse = await callStatus(expiredPaytr);
        assert.strictEqual(expiredPaytrResponse.code, 200);
        assert.strictEqual(expiredPaytrResponse.body.paymentStatus, PAYMENT_STATUS.FAILED);
        assert.strictEqual(expiredPaytrResponse.body.orderStatus, ORDER_STATUS.IPTAL_EDILDI);
        assert.strictEqual(expiredPaytrResponse.body.nextAction, 'RETRY_PAYMENT');
        assert.strictEqual(expiredPaytrResponse.body.commerceFinalized, true);
        assert.strictEqual(expiredPaytr.productStock, 6);
        assert.strictEqual(expiredPaytr.stockReleaseCount, 1);
        assert.strictEqual(expiredPaytr.couponReleaseCount, 1);
        assert.strictEqual(expiredPaytr.expiryEventCount, 1);
        assert.strictEqual(expiredPaytr.payment.raw_request.stockReserved, false);
        assert.strictEqual(expiredPaytr.payment.raw_request.stockReleaseReason, 'PAYMENT_RESERVATION_EXPIRED');

        const duplicateStatusResponse = await callStatus(expiredPaytr);
        assert.strictEqual(duplicateStatusResponse.code, 200);
        assert.strictEqual(duplicateStatusResponse.body.nextAction, 'RETRY_PAYMENT');
        assert.strictEqual(expiredPaytr.productStock, 6);
        assert.strictEqual(expiredPaytr.stockReleaseCount, 1);
        assert.strictEqual(expiredPaytr.couponReleaseCount, 1);
        assert.strictEqual(expiredPaytr.expiryEventCount, 1);

        const lateCapture = planPaymentCallback({
            paymentStatus: expiredPaytr.payment.status,
            orderStatus: expiredPaytr.order.status,
            callbackOutcome: PAYMENT_CALLBACK_OUTCOME.SUCCESS,
            stockReservationState: getStockReservationState(expiredPaytr.payment)
        });
        assert.strictEqual(lateCapture.decision, PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION);
        assert.strictEqual(lateCapture.reconciliationReason, 'SUCCESS_AFTER_FAILURE');
        assert.strictEqual(lateCapture.runCommerceSideEffects, false);
        assert.strictEqual(lateCapture.targetRefundStatus, REFUND_STATUS.PENDING);

        const expiredTransfer = createState({
            paymentRef: 'BANKSTATUS701',
            provider: 'bank_transfer',
            paymentStatus: PAYMENT_STATUS.WAITING_TRANSFER,
            expiresAt: '2026-08-31T12:00:00.000Z'
        });
        const expiredTransferResponse = await callStatus(expiredTransfer);
        assert.strictEqual(expiredTransferResponse.code, 200);
        assert.strictEqual(expiredTransferResponse.body.paymentStatus, PAYMENT_STATUS.FAILED);
        assert.strictEqual(expiredTransferResponse.body.nextAction, 'RETRY_PAYMENT');
        assert.strictEqual(expiredTransfer.stockReleaseCount, 1);
        assert.strictEqual(expiredTransfer.couponReleaseCount, 1);

        const unexpiredPaytr = createState({
            paymentRef: 'PAYTRSTATUS702',
            provider: 'paytr',
            paymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
            expiresAt: '2026-09-01T12:00:01.000Z'
        });
        const unexpiredResponse = await callStatus(unexpiredPaytr);
        assert.strictEqual(unexpiredResponse.code, 200);
        assert.strictEqual(unexpiredResponse.body.paymentStatus, PAYMENT_STATUS.REQUIRES_ACTION);
        assert.strictEqual(unexpiredResponse.body.nextAction, 'WAIT_PROVIDER_CONFIRMATION');
        assert.strictEqual(unexpiredPaytr.productStock, 4);
        assert.strictEqual(unexpiredPaytr.stockReleaseCount, 0);
        assert.strictEqual(unexpiredPaytr.couponReleaseCount, 0);
        assert.deepStrictEqual(unexpiredPaytr.transactionCommands, ['BEGIN', 'COMMIT']);

        const foreignOwned = createState({
            paymentRef: 'PAYTRSTATUS703',
            provider: 'paytr',
            paymentStatus: PAYMENT_STATUS.REQUIRES_ACTION,
            expiresAt: '2026-09-01T11:00:00.000Z',
            ownerUserId: 11
        });
        const foreignResponse = await callStatus(foreignOwned, 10);
        assert.strictEqual(foreignResponse.code, 404);
        assert.deepStrictEqual(foreignResponse.body, { error: 'Ödeme kaydı bulunamadı.' });
        assert.strictEqual(foreignOwned.stockReleaseCount, 0);
        assert.strictEqual(foreignOwned.couponReleaseCount, 0);
        assert.deepStrictEqual(foreignOwned.transactionCommands, ['BEGIN', 'ROLLBACK']);

        console.log('payment status expiry smoke passed');
    } finally {
        pool.connect = originalConnect;
        console.error = originalConsoleError;
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
