const pool = require('../config/db');
const { calculatePricing } = require('../services/pricingService');

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
        const result = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Kuponlar getirilemedi.' });
    }
};

const createCoupon = async (req, res) => {
    try {
        const {
            code,
            discount_type,
            discount_value,
            min_order_amount = 0,
            max_discount_amount = null,
            usage_limit = null,
            starts_at = null,
            ends_at = null
        } = req.body;

        if (!code || !discount_type || discount_value === undefined) {
            return res.status(400).json({ error: 'code, discount_type ve discount_value zorunludur.' });
        }

        const result = await pool.query(
            `INSERT INTO coupons
                (code, discount_type, discount_value, min_order_amount, max_discount_amount, usage_limit, starts_at, ends_at, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
             RETURNING *`,
            [
                String(code).trim().toUpperCase(),
                String(discount_type).toUpperCase(),
                discount_value,
                min_order_amount,
                max_discount_amount,
                usage_limit,
                starts_at,
                ends_at
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Bu kupon kodu zaten mevcut.' });
        if (err.code === '23514') return res.status(400).json({ error: 'discount_type sadece PERCENT veya FIXED olabilir.' });
        res.status(500).json({ error: err.message || 'Kupon olusturulamadi.' });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Gecersiz kupon kimligi.' });

        const { discount_value, min_order_amount, max_discount_amount, usage_limit, starts_at, ends_at, is_active } = req.body;

        const result = await pool.query(
            `UPDATE coupons
             SET discount_value      = COALESCE($1, discount_value),
                 min_order_amount    = COALESCE($2, min_order_amount),
                 max_discount_amount = COALESCE($3, max_discount_amount),
                 usage_limit         = COALESCE($4, usage_limit),
                 starts_at           = COALESCE($5, starts_at),
                 ends_at             = COALESCE($6, ends_at),
                 is_active           = COALESCE($7, is_active),
                 updated_at          = NOW()
             WHERE id = $8
             RETURNING *`,
            [discount_value, min_order_amount, max_discount_amount, usage_limit, starts_at, ends_at, is_active, id]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Kupon bulunamadi.' });
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Kupon guncellenemedi.' });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Gecersiz kupon kimligi.' });

        const result = await pool.query('DELETE FROM coupons WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Kupon bulunamadi.' });
        res.status(200).json({ mesaj: 'Kupon silindi.' });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Kupon silinemedi.' });
    }
};

const getCampaignConfig = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM campaign_configs ORDER BY key');
        const config = {};
        result.rows.forEach((row) => { config[row.key] = row.value; });
        res.status(200).json(config);
    } catch (err) {
        res.status(500).json({ error: 'Kampanya konfigurasyon alinamadi.' });
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
    createCoupon,
    updateCoupon,
    deleteCoupon,
    getCampaignConfig,
    updateCampaignConfig
};
