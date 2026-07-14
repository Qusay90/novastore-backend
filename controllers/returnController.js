const pool = require('../config/db');

const sendReturnWritesDisabled = (res) => res.status(503).json({
    code: 'RETURN_WRITES_DISABLED',
    error: 'İade talebi ve durum değişiklikleri güvenli iade akışı tamamlanana kadar geçici olarak kapalıdır.'
});

const createReturnRequest = async (req, res) => {
    const orderId = Number(req.body?.order_id);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'order_id zorunlu ve sayisal olmalidir.' });
    }

    return sendReturnWritesDisabled(res);
};

const getReturnById = async (req, res) => {
    try {
        const returnId = Number(req.params.id);
        if (!Number.isInteger(returnId)) {
            return res.status(400).json({ error: 'Geçersiz iade kimliği.' });
        }

        const result = await pool.query(
            `SELECT r.*, o.user_id, o.total_amount, o.status AS order_status
             FROM returns r
             JOIN orders o ON o.id = r.order_id
             WHERE r.id = $1`,
            [returnId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'İade talebi bulunamadı.' });
        }

        const row = result.rows[0];
        const isAdmin = req.user.role === 'admin';
        const isOwner = Number(row.user_id) === req.user.id;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'Bu iade talebine erişim yetkiniz yok.' });
        }

        res.status(200).json(row);
    } catch (err) {
        console.error('İade detayı hatası:', err.message);
        res.status(500).json({ error: 'İade talebi bilgisi alınamadı.' });
    }
};

const getAllReturnRequests = async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                r.*,
                o.customer_name AS order_customer_name,
                o.total_amount AS order_total_amount,
                o.status AS order_status,
                o.refund_status,
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
                r.created_at DESC`
        );

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('İade taleplerini listeleme hatası:', err.message);
        res.status(500).json({ error: 'İade talepleri getirilemedi.' });
    }
};

const updateReturnStatus = async (req, res) => {
    const returnId = Number(req.params.id);
    if (!Number.isInteger(returnId)) {
        return res.status(400).json({ error: 'Geçersiz iade talebi kimliği.' });
    }

    return sendReturnWritesDisabled(res);
};

module.exports = {
    createReturnRequest,
    getReturnById,
    getAllReturnRequests,
    updateReturnStatus
};
