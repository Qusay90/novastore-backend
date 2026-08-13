const pool = require('../config/db');
const { calculatePricing } = require('../services/pricingService');
const { CouponAdminError } = require('../services/couponAdminPolicy');
const {
    createCouponAdmin,
    readCouponAdminList,
    setCouponAdminStatus,
    updateCouponAdmin
} = require('../services/couponAdminService');

const readRequestId = (req) => req.get?.('x-request-id') || req.headers?.['x-request-id'] || null;

const sendCouponAdminError = (res, error) => {
    const expected = error instanceof CouponAdminError;
    if (!expected) console.error('Admin kupon işlemi hatası:', error?.message || error);
    const payload = {
        code: expected ? error.code : 'COUPON_ADMIN_INTERNAL_ERROR',
        error: expected ? error.message : 'Kupon işlemi tamamlanamadı.'
    };
    if (expected && error.details !== undefined) payload.details = error.details;
    return res.status(expected ? error.statusCode : 500).json(payload);
};

const getQuote = async (req, res) => {
    try {
        const { cartItems, couponCode = null } = req.body;
        const pricing = await calculatePricing({ cartItems, couponCode, client: pool });

        res.status(200).json({
            totals: pricing.totals,
            campaigns: pricing.campaigns,
            coupon: pricing.coupon,
            items: pricing.items
        });
    } catch (err) {
        res.status(400).json({ error: err.message || 'Kampanya hesaplanamadi.' });
    }
};

const getCoupons = async (req, res) => {
    try {
        return res.status(200).json(await readCouponAdminList(pool));
    } catch (error) {
        return sendCouponAdminError(res, error);
    }
};

const getActiveCoupons = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                code,
                discount_type,
                discount_value,
                min_order_amount,
                max_discount_amount,
                starts_at,
                ends_at
             FROM coupons
             WHERE is_active = TRUE
               AND (starts_at IS NULL OR starts_at <= NOW())
               AND (ends_at IS NULL OR ends_at >= NOW())
               AND (usage_limit IS NULL OR used_count < usage_limit)
             ORDER BY ends_at ASC NULLS LAST, created_at DESC`
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Aktif kuponlar getirilemedi:', err.message);
        res.status(500).json({ error: 'Kuponlar getirilemedi.' });
    }
};

const createCoupon = async (req, res) => {
    try {
        const result = await createCouponAdmin(pool, {
            actor: req.currentAdmin,
            body: req.body,
            requestId: readRequestId(req)
        });
        return res.status(201).json(result);
    } catch (error) {
        return sendCouponAdminError(res, error);
    }
};

const updateCoupon = async (req, res) => {
    try {
        const result = await updateCouponAdmin(pool, req.params.id, {
            actor: req.currentAdmin,
            body: req.body,
            requestId: readRequestId(req)
        });
        return res.status(200).json(result);
    } catch (error) {
        return sendCouponAdminError(res, error);
    }
};

const setCouponStatus = async (req, res) => {
    try {
        const result = await setCouponAdminStatus(pool, req.params.id, {
            actor: req.currentAdmin,
            body: req.body,
            requestId: readRequestId(req)
        });
        return res.status(200).json(result);
    } catch (error) {
        return sendCouponAdminError(res, error);
    }
};

const deleteCoupon = (_req, res) => res.status(405).json({
    code: 'COUPON_HARD_DELETE_DISABLED',
    error: 'Kuponlar silinemez; etkinlik durumunu güncelleyin.'
});

const getCampaignConfig = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM campaign_configs ORDER BY key');
        const config = {};
        result.rows.forEach((row) => { config[row.key] = row.value; });
        res.status(200).json(config);
    } catch (err) {
        res.status(500).json({ error: 'Kampanya konfigürasyonu alınamadı.' });
    }
};

const updateCampaignConfig = async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined || value === null) {
            return res.status(400).json({ error: 'key ve value zorunludur.' });
        }

        const result = await pool.query(
            `INSERT INTO campaign_configs (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
             RETURNING *`,
            [key, String(value)]
        );

        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Konfigurasyon guncellenemedi.' });
    }
};

module.exports = {
    getQuote,
    getCoupons,
    getActiveCoupons,
    createCoupon,
    updateCoupon,
    setCouponStatus,
    deleteCoupon,
    getCampaignConfig,
    updateCampaignConfig,
    sendCouponAdminError
};
