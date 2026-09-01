'use strict';

const { PAYMENT_STATUS, ORDER_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { STOCK_RESERVATION_STATE, getStockReservationState } = require('./orderLifecyclePolicy');
const { appendOrderEvent, parseItems, releaseStockReservation } = require('./orderService');
const { releaseCouponReservationForOrder } = require('./couponReservationService');

const DEFAULT_CARD_RESERVATION_MINUTES = 30;
const DEFAULT_BANK_TRANSFER_RESERVATION_HOURS = 24;

const positiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getReservationDurationMs = (paymentMethod, env = process.env) => (
    paymentMethod === 'havale'
        ? positiveInteger(env.BANK_TRANSFER_RESERVATION_HOURS, DEFAULT_BANK_TRANSFER_RESERVATION_HOURS) * 60 * 60 * 1000
        : positiveInteger(env.CARD_PAYMENT_RESERVATION_MINUTES, DEFAULT_CARD_RESERVATION_MINUTES) * 60 * 1000
);

const buildReservationMetadata = ({ paymentMethod, now = Date.now(), env = process.env } = {}) => {
    const reservedAt = new Date(now);
    const reservationExpiresAt = new Date(now + getReservationDurationMs(paymentMethod, env));
    return Object.freeze({
        stockReserved: true,
        stockReservedAt: reservedAt.toISOString(),
        reservationExpiresAt: reservationExpiresAt.toISOString(),
        reservationPolicy: paymentMethod === 'havale' ? 'bank_transfer_v1' : 'provider_handoff_v1'
    });
};

const safeJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
};

const reservationExpiryTime = (payment) => {
    const rawRequest = safeJsonObject(payment?.raw_request);
    const expiresAt = String(rawRequest.reservationExpiresAt || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T/.test(expiresAt)) return null;
    const time = new Date(expiresAt).getTime();
    return Number.isFinite(time) ? time : null;
};

const expireLockedPaymentReservation = async (client, payment, {
    now = payment?.reservation_checked_at ?? Date.now()
} = {}) => {
    const paymentStatus = String(payment?.status || payment?.payment_status || '').trim().toUpperCase();
    const orderStatus = String(payment?.order_status || '').trim();
    const activePayment = [
        PAYMENT_STATUS.REQUIRES_ACTION,
        PAYMENT_STATUS.WAITING_TRANSFER
    ].includes(paymentStatus);
    const expiryTime = reservationExpiryTime(payment);
    const checkedAt = new Date(now).getTime();

    if (
        !activePayment
        || orderStatus !== ORDER_STATUS.ODEME_BEKLIYOR
        || getStockReservationState(payment) !== STOCK_RESERVATION_STATE.RESERVED
        || expiryTime === null
        || !Number.isFinite(checkedAt)
        || expiryTime > checkedAt
    ) {
        return Object.freeze({ expired: false, payment });
    }

    const stockRelease = await releaseStockReservation({
        client,
        payment,
        items: parseItems(payment),
        reasonCode: 'PAYMENT_RESERVATION_EXPIRED'
    });
    const couponRelease = await releaseCouponReservationForOrder(
        client,
        payment.order_id,
        'PAYMENT_RESERVATION_EXPIRED'
    );
    const paymentUpdate = await client.query(
        `UPDATE payments
         SET status = $1,
             raw_response = COALESCE(raw_response, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $3 AND status IN ($4, $5)
         RETURNING id, status, raw_request, raw_response`,
        [
            PAYMENT_STATUS.FAILED,
            JSON.stringify({ reasonCode: 'PAYMENT_RESERVATION_EXPIRED' }),
            payment.id,
            PAYMENT_STATUS.REQUIRES_ACTION,
            PAYMENT_STATUS.WAITING_TRANSFER
        ]
    );
    if (paymentUpdate.rows?.length !== 1) {
        const error = new Error('Süresi dolan ödeme kaydı güvenle sonuçlandırılamadı.');
        error.code = 'PAYMENT_RESERVATION_EXPIRY_PAYMENT_CONFLICT';
        throw error;
    }

    const orderUpdate = await client.query(
        `UPDATE orders
         SET payment_status = $1,
             status = $2,
             refund_status = $3,
             cancel_reason = 'Ödeme süresi doldu',
             updated_at = NOW()
         WHERE id = $4 AND status = $5
         RETURNING id, status, payment_status, refund_status`,
        [
            PAYMENT_STATUS.FAILED,
            ORDER_STATUS.IPTAL_EDILDI,
            REFUND_STATUS.NONE,
            payment.order_id,
            ORDER_STATUS.ODEME_BEKLIYOR
        ]
    );
    if (orderUpdate.rows?.length !== 1) {
        const error = new Error('Süresi dolan sipariş kaydı güvenle sonuçlandırılamadı.');
        error.code = 'PAYMENT_RESERVATION_EXPIRY_ORDER_CONFLICT';
        throw error;
    }

    await appendOrderEvent(
        client,
        payment.order_id,
        'PAYMENT_RESERVATION_EXPIRED',
        'Ödeme süresi dolduğu için stok rezervasyonu güvenle serbest bırakıldı.',
        { paymentId: Number(payment.id), provider: payment.provider }
    );

    const updatedPayment = paymentUpdate.rows[0];
    const updatedOrder = orderUpdate.rows[0];
    return Object.freeze({
        expired: true,
        stockRelease,
        couponRelease,
        payment: Object.freeze({
            ...payment,
            ...updatedPayment,
            payment_status: updatedPayment.status,
            order_status: updatedOrder.status,
            order_payment_status: updatedOrder.payment_status,
            refund_status: updatedOrder.refund_status
        })
    });
};

const releaseExpiredPaymentReservations = async (client, { limit = 20 } = {}) => {
    const safeLimit = Number.isSafeInteger(Number(limit))
        ? Math.min(Math.max(Number(limit), 1), 100)
        : 20;
    const result = await client.query(
        `SELECT p.*, o.items, o.status AS order_status, CURRENT_TIMESTAMP AS reservation_checked_at
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.status IN ($1, $2)
           AND o.status = $3
           AND p.raw_request @> '{"stockReserved": true}'::jsonb
           AND COALESCE(p.raw_request->>'reservationExpiresAt', '')
               ~ '^\\d{4}-\\d{2}-\\d{2}T'
           AND (p.raw_request->>'reservationExpiresAt')::timestamptz <= NOW()
         ORDER BY p.id
         LIMIT $4
         FOR UPDATE OF p, o SKIP LOCKED`,
        [PAYMENT_STATUS.REQUIRES_ACTION, PAYMENT_STATUS.WAITING_TRANSFER, ORDER_STATUS.ODEME_BEKLIYOR, safeLimit]
    );

    let released = 0;
    for (const payment of result.rows || []) {
        const result = await expireLockedPaymentReservation(client, payment);
        if (result.expired) released += 1;
    }
    return Object.freeze({ released });
};

module.exports = Object.freeze({
    DEFAULT_BANK_TRANSFER_RESERVATION_HOURS,
    DEFAULT_CARD_RESERVATION_MINUTES,
    buildReservationMetadata,
    expireLockedPaymentReservation,
    getReservationDurationMs,
    releaseExpiredPaymentReservations
});
