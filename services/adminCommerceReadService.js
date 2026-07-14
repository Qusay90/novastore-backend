const ADMIN_COMMERCE_CAPABILITIES = Object.freeze({
    dashboardRead: true,
    ordersRead: true,
    returnsRead: false,
    firstPartyCatalogRead: false,
    notificationsRead: false,
    orderStatusWrite: false,
    orderBulkWrite: false,
    orderOwnerWrite: false,
    customerAdmin: false,
    sellerAdmin: false,
    sellerOffers: false,
    settlements: false,
    payouts: false
});

const parseOrderSummaryLimit = (rawValue) => {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return 50;
    const normalized = String(rawValue).trim();
    if (!/^-?\d+$/.test(normalized)) return 50;
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed)) return 50;
    return Math.min(Math.max(parsed, 1), 100);
};

const getAdminSession = (req, res) => {
    if (!req.currentAdmin) {
        return res.status(401).json({ error: 'Güncel yönetici oturumu gerekli.' });
    }
    return res.status(200).json({
        user: { ...req.currentAdmin },
        commerceMode: 'single_vendor',
        apiVersion: '2026-07-14',
        capabilities: { ...ADMIN_COMMERCE_CAPABILITIES }
    });
};

const createGetAdminOrderSummaries = (database) => async (req, res) => {
    const limit = parseOrderSummaryLimit(req.query.limit);

    try {
        const result = await database.query(
            `
                SELECT
                    o.id,
                    o.total_amount,
                    o.status,
                    o.customer_name,
                    o.email,
                    o.created_at,
                    o.payment_status,
                    o.refund_status,
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
        const items = result.rows.slice(0, limit);
        return res.status(200).json({
            items,
            limit,
            hasMore: result.rows.length > limit
        });
    } catch (error) {
        console.error('Admin sipariş özetleri hatası:', error.message);
        return res.status(500).json({ error: 'Sipariş özetleri getirilemedi.' });
    }
};

module.exports = {
    ADMIN_COMMERCE_CAPABILITIES,
    createGetAdminOrderSummaries,
    getAdminSession,
    parseOrderSummaryLimit
};
