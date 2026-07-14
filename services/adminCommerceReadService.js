const {
    ADMIN_COMMERCE_CAPABILITY_DEFAULTS,
    getAdminCommerceCapabilities
} = require('./adminCommerceCapabilityService');

const ADMIN_COMMERCE_CAPABILITIES = ADMIN_COMMERCE_CAPABILITY_DEFAULTS;

const parseOrderSummaryLimit = (rawValue) => {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return 50;
    const normalized = String(rawValue).trim();
    if (!/^-?\d+$/.test(normalized)) return 50;
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed)) return 50;
    return Math.min(Math.max(parsed, 1), 100);
};

const toSummaryPage = (rows, limit) => ({
    items: rows.slice(0, limit),
    limit,
    hasMore: rows.length > limit
});

const getAdminSession = (req, res) => {
    if (!req.currentAdmin) {
        return res.status(401).json({ error: 'Güncel yönetici oturumu gerekli.' });
    }
    return res.status(200).json({
        user: { ...req.currentAdmin },
        commerceMode: 'single_vendor',
        apiVersion: '2026-07-14',
        capabilities: getAdminCommerceCapabilities()
    });
};

const createGetAdminOrderSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT
                    o.id,
                    o.total_amount,
                    o.currency,
                    o.status,
                    o.customer_name,
                    o.email,
                    o.created_at,
                    o.payment_status,
                    o.refund_status,
                    o.shipment_status,
                    o.shipment_provider,
                    o.estimated_delivery_date,
                    CASE
                        WHEN jsonb_typeof(o.items) = 'array' THEN jsonb_array_length(o.items)
                        ELSE 0
                    END::INT AS item_count
                FROM orders o
                ORDER BY o.created_at DESC NULLS LAST, o.id DESC
                LIMIT $1
            `,
            [limit + 1]
        );
        return res.status(200).json(toSummaryPage(result.rows, limit));
    } catch (error) {
        console.error('Admin sipariş özetleri hatası:', error.message);
        return res.status(500).json({ error: 'Sipariş özetleri getirilemedi.' });
    }
};

const createGetAdminReturnSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT
                    r.id,
                    r.order_id,
                    r.reason_code,
                    r.status,
                    r.refund_amount,
                    r.created_at,
                    r.updated_at,
                    o.status AS order_status,
                    o.refund_status,
                    o.payment_status,
                    o.currency,
                    COALESCE(u.full_name, u.name, o.customer_name, 'Bilinmiyor') AS customer_name
                FROM returns r
                JOIN orders o ON o.id = r.order_id
                LEFT JOIN users u ON u.id = r.user_id
                ORDER BY
                    CASE r.status
                        WHEN 'REQUESTED' THEN 0
                        WHEN 'IN_REVIEW' THEN 1
                        WHEN 'APPROVED' THEN 2
                        WHEN 'COMPLETED' THEN 3
                        ELSE 4
                    END,
                    r.created_at DESC NULLS LAST,
                    r.id DESC
                LIMIT $1
            `,
            [limit + 1]
        );
        return res.status(200).json(toSummaryPage(result.rows, limit));
    } catch (error) {
        console.error('Admin iade özetleri hatası:', error.message);
        return res.status(500).json({ error: 'İade özetleri getirilemedi.' });
    }
};

const createGetAdminNotificationSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query?.limit);

    try {
        const result = await database.query(
            `
                SELECT id, type, message, COALESCE(is_read, FALSE) AS is_read, created_at
                FROM notifications
                WHERE user_id IS NULL
                ORDER BY created_at DESC NULLS LAST, id DESC
                LIMIT $1
            `,
            [limit + 1]
        );
        return res.status(200).json(toSummaryPage(result.rows, limit));
    } catch (error) {
        console.error('Admin bildirim özetleri hatası:', error.message);
        return res.status(500).json({ error: 'Bildirim özetleri getirilemedi.' });
    }
};

module.exports = {
    ADMIN_COMMERCE_CAPABILITIES,
    createGetAdminNotificationSummaries,
    createGetAdminOrderSummaries,
    createGetAdminReturnSummaries,
    getAdminCommerceCapabilities,
    getAdminSession,
    parseOrderSummaryLimit,
    toSummaryPage
};
