const COUPON_USAGE_LIMIT_EXHAUSTED_CODE = 'COUPON_USAGE_LIMIT_EXHAUSTED';

const consumeCouponUsageIfNeeded = async (client, coupon) => {
    if (!coupon || !coupon.applied || !coupon.couponId) {
        return { consumed: false };
    }

    const result = await client.query(
        'UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit) RETURNING id, code, usage_limit, used_count',
        [coupon.couponId]
    );

    if (typeof result.rowCount === 'number' && result.rowCount === 0) {
        const err = new Error('Kupon kullanım limiti doldu veya kupon bulunamadı.');
        err.statusCode = 409;
        err.code = COUPON_USAGE_LIMIT_EXHAUSTED_CODE;
        throw err;
    }

    return {
        consumed: true,
        couponId: coupon.couponId,
        coupon: Array.isArray(result.rows) ? result.rows[0] || null : null
    };
};

module.exports = {
    COUPON_USAGE_LIMIT_EXHAUSTED_CODE,
    consumeCouponUsageIfNeeded
};
