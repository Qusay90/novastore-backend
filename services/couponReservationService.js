'use strict';

const COUPON_RESERVATION_STATUS = Object.freeze({
    RESERVED: 'RESERVED',
    CONSUMED: 'CONSUMED',
    RELEASED: 'RELEASED',
    RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED'
});

class CouponReservationError extends Error {
    constructor(code, message, statusCode = 409) {
        super(message);
        this.name = 'CouponReservationError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const positiveInteger = (value, label) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new CouponReservationError('COUPON_RESERVATION_INVALID', `${label} geçersiz.`, 400);
    }
    return parsed;
};

const parseExpiry = (value) => {
    const expiry = new Date(value);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        throw new CouponReservationError(
            'COUPON_RESERVATION_EXPIRY_INVALID',
            'Kupon rezervasyon süresi geçersiz.',
            400
        );
    }
    return expiry.toISOString();
};

const releaseExpiredCouponReservations = async (client, { couponId = null } = {}) => {
    const params = [];
    const couponPredicate = couponId === null
        ? ''
        : ` AND coupon_id = $${params.push(positiveInteger(couponId, 'Kupon kimliği'))}`;
    const result = await client.query(
        `UPDATE coupon_reservations
         SET status = $${params.push(COUPON_RESERVATION_STATUS.RELEASED)},
             released_at = COALESCE(released_at, NOW()),
             updated_at = NOW()
         WHERE status = $${params.push(COUPON_RESERVATION_STATUS.RESERVED)}
           AND expires_at <= NOW()
           ${couponPredicate}
         RETURNING id`,
        params
    );
    return Object.freeze({ released: Number(result.rowCount || result.rows?.length || 0) });
};

const reserveCouponUsageForOrder = async (client, { coupon, orderId, expiresAt }) => {
    if (!coupon?.applied || !coupon?.couponId) {
        return Object.freeze({ reserved: false, reservation: null });
    }

    const couponId = positiveInteger(coupon.couponId, 'Kupon kimliği');
    const safeOrderId = positiveInteger(orderId, 'Sipariş kimliği');
    const safeExpiry = parseExpiry(expiresAt);
    const locked = await client.query(
        `SELECT id, code, usage_limit, used_count, is_active, starts_at, ends_at
         FROM coupons
         WHERE id = $1
         FOR UPDATE`,
        [couponId]
    );
    const current = locked.rows?.[0];
    if (!current || String(current.code || '').toUpperCase() !== String(coupon.code || '').toUpperCase()) {
        throw new CouponReservationError('COUPON_RESERVATION_COUPON_CHANGED', 'Kupon artık kullanılamıyor.');
    }
    if (
        current.is_active !== true
        || (current.starts_at && new Date(current.starts_at).getTime() > Date.now())
        || (current.ends_at && new Date(current.ends_at).getTime() < Date.now())
    ) {
        throw new CouponReservationError('COUPON_RESERVATION_COUPON_INACTIVE', 'Kupon artık aktif değil.');
    }

    await releaseExpiredCouponReservations(client, { couponId });
    const existing = await client.query(
        `SELECT id, coupon_id, order_id, status, expires_at
         FROM coupon_reservations
         WHERE order_id = $1
         FOR UPDATE`,
        [safeOrderId]
    );
    if (existing.rows?.[0]) {
        const row = existing.rows[0];
        if (
            Number(row.coupon_id) === couponId
            && row.status === COUPON_RESERVATION_STATUS.RESERVED
        ) {
            return Object.freeze({ reserved: true, reused: true, reservation: row });
        }
        throw new CouponReservationError(
            'COUPON_RESERVATION_ORDER_CONFLICT',
            'Sipariş farklı bir kupon rezervasyonuna bağlı.'
        );
    }

    const active = await client.query(
        `SELECT COUNT(*)::integer AS count
         FROM coupon_reservations
         WHERE coupon_id = $1
           AND status = $2
           AND expires_at > NOW()`,
        [couponId, COUPON_RESERVATION_STATUS.RESERVED]
    );
    const usageLimit = current.usage_limit === null ? null : Number(current.usage_limit);
    const usedCount = Number(current.used_count || 0);
    const activeCount = Number(active.rows?.[0]?.count || 0);
    if (usageLimit !== null && usedCount + activeCount >= usageLimit) {
        throw new CouponReservationError(
            'COUPON_USAGE_LIMIT_RESERVED',
            'Kupon kullanım limiti başka bir ödeme için ayrıldı.'
        );
    }

    const inserted = await client.query(
        `INSERT INTO coupon_reservations
            (coupon_id, order_id, status, expires_at)
         VALUES ($1, $2, $3, $4::timestamptz)
         RETURNING id, coupon_id, order_id, status, expires_at`,
        [couponId, safeOrderId, COUPON_RESERVATION_STATUS.RESERVED, safeExpiry]
    );
    return Object.freeze({ reserved: true, reused: false, reservation: inserted.rows[0] });
};

const consumeCouponReservationIfNeeded = async (client, coupon, orderId) => {
    if (!coupon?.applied || !coupon?.couponId) {
        return Object.freeze({ consumed: false, reconciliationRequired: false });
    }

    const couponId = positiveInteger(coupon.couponId, 'Kupon kimliği');
    const safeOrderId = positiveInteger(orderId, 'Sipariş kimliği');
    const result = await client.query(
        `SELECT id, status
         FROM coupon_reservations
         WHERE coupon_id = $1 AND order_id = $2
         FOR UPDATE`,
        [couponId, safeOrderId]
    );
    const reservation = result.rows?.[0];
    if (!reservation || reservation.status === COUPON_RESERVATION_STATUS.RELEASED) {
        return Object.freeze({
            consumed: false,
            reconciliationRequired: true,
            reasonCode: reservation ? 'COUPON_RESERVATION_RELEASED' : 'COUPON_RESERVATION_MISSING'
        });
    }
    if (reservation.status === COUPON_RESERVATION_STATUS.CONSUMED) {
        return Object.freeze({ consumed: true, reused: true, reconciliationRequired: false });
    }
    if (reservation.status === COUPON_RESERVATION_STATUS.RECONCILIATION_REQUIRED) {
        return Object.freeze({
            consumed: false,
            reused: true,
            reconciliationRequired: true,
            reasonCode: 'COUPON_RESERVATION_RECONCILIATION_REQUIRED'
        });
    }

    const couponUpdate = await client.query(
        `UPDATE coupons
         SET used_count = used_count + 1,
             updated_at = NOW()
         WHERE id = $1
           AND (usage_limit IS NULL OR used_count < usage_limit)
         RETURNING id, code, usage_limit, used_count`,
        [couponId]
    );
    if (!couponUpdate.rows?.[0]) {
        await client.query(
            `UPDATE coupon_reservations
             SET status = $1, updated_at = NOW()
             WHERE id = $2`,
            [COUPON_RESERVATION_STATUS.RECONCILIATION_REQUIRED, reservation.id]
        );
        return Object.freeze({
            consumed: false,
            reconciliationRequired: true,
            reasonCode: 'COUPON_QUOTA_CONVERSION_FAILED'
        });
    }

    await client.query(
        `UPDATE coupon_reservations
         SET status = $1,
             consumed_at = COALESCE(consumed_at, NOW()),
             updated_at = NOW()
         WHERE id = $2`,
        [COUPON_RESERVATION_STATUS.CONSUMED, reservation.id]
    );
    return Object.freeze({
        consumed: true,
        reused: false,
        reconciliationRequired: false,
        coupon: couponUpdate.rows[0]
    });
};

const releaseCouponReservationForOrder = async (client, orderId, reasonCode = 'PAYMENT_RELEASED') => {
    const safeOrderId = positiveInteger(orderId, 'Sipariş kimliği');
    const result = await client.query(
        `UPDATE coupon_reservations
         SET status = $1,
             released_at = COALESCE(released_at, NOW()),
             release_reason = COALESCE(release_reason, $2),
             updated_at = NOW()
         WHERE order_id = $3 AND status = $4
         RETURNING id`,
        [
            COUPON_RESERVATION_STATUS.RELEASED,
            String(reasonCode || 'PAYMENT_RELEASED').slice(0, 80),
            safeOrderId,
            COUPON_RESERVATION_STATUS.RESERVED
        ]
    );
    return Object.freeze({ released: Number(result.rowCount || result.rows?.length || 0) });
};

module.exports = Object.freeze({
    COUPON_RESERVATION_STATUS,
    CouponReservationError,
    consumeCouponReservationIfNeeded,
    releaseCouponReservationForOrder,
    releaseExpiredCouponReservations,
    reserveCouponUsageForOrder
});
