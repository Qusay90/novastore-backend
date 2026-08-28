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

const releaseExpiredPaymentReservations = async (client, { limit = 20 } = {}) => {
    const safeLimit = Number.isSafeInteger(Number(limit))
        ? Math.min(Math.max(Number(limit), 1), 100)
        : 20;
    const result = await client.query(
        `SELECT p.*, o.items, o.status AS order_status
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
        if (getStockReservationState(payment) !== STOCK_RESERVATION_STATE.RESERVED) continue;
        await releaseStockReservation({
            client,
            payment,
            items: parseItems(payment),
            reasonCode: 'PAYMENT_RESERVATION_EXPIRED'
        });
        await releaseCouponReservationForOrder(
            client,
            payment.order_id,
            'PAYMENT_RESERVATION_EXPIRED'
        );
        await client.query(
            `UPDATE payments
             SET status = $1,
                 raw_response = COALESCE(raw_response, '{}'::jsonb) || $2::jsonb,
                 updated_at = NOW()
             WHERE id = $3`,
            [PAYMENT_STATUS.FAILED, JSON.stringify({ reasonCode: 'PAYMENT_RESERVATION_EXPIRED' }), payment.id]
        );
        await client.query(
            `UPDATE orders
             SET payment_status = $1,
                 status = $2,
                 refund_status = $3,
                 cancel_reason = 'Ödeme süresi doldu',
                 updated_at = NOW()
             WHERE id = $4`,
            [PAYMENT_STATUS.FAILED, ORDER_STATUS.IPTAL_EDILDI, REFUND_STATUS.NONE, payment.order_id]
        );
        await appendOrderEvent(
            client,
            payment.order_id,
            'PAYMENT_RESERVATION_EXPIRED',
            'Ödeme süresi dolduğu için stok rezervasyonu güvenle serbest bırakıldı.',
            { paymentId: Number(payment.id), provider: payment.provider }
        );
        released += 1;
    }
    return Object.freeze({ released });
};

module.exports = Object.freeze({
    DEFAULT_BANK_TRANSFER_RESERVATION_HOURS,
    DEFAULT_CARD_RESERVATION_MINUTES,
    buildReservationMetadata,
    getReservationDurationMs,
    releaseExpiredPaymentReservations
});
