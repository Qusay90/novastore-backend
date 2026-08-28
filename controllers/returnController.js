const pool = require('../config/db');
const { isAdminCommerceCapabilityEnabled } = require('../services/adminCommerceCapabilityService');
const {
    ReturnWorkflowError,
    createCustomerReturn,
    serializeReturn,
    updateReturnByAdmin
} = require('../services/returnWorkflowService');

const sendWorkflowError = (res, error) => res.status(error.statusCode || 409).json({
    code: error.code || 'RETURN_WORKFLOW_CONFLICT',
    error: error.message,
    ...(error.details ? { details: error.details } : {})
});

const createReturnRequest = async (req, res) => {
    try {
        const result = await createCustomerReturn({ user: req.user, body: req.body });
        return res.status(result.reused ? 200 : 201).json(result);
    } catch (error) {
        if (error instanceof ReturnWorkflowError) return sendWorkflowError(res, error);
        console.error('İade talebi oluşturma hatası.');
        return res.status(500).json({ error: 'İade talebi oluşturulamadı.' });
    }
};

const getReturnById = async (req, res) => {
    try {
        const returnId = Number(req.params.id);
        if (!Number.isSafeInteger(returnId) || returnId <= 0) {
            return res.status(400).json({ error: 'Geçersiz iade kimliği.' });
        }
        const result = await pool.query(
            `SELECT r.*, o.user_id AS order_user_id, o.total_amount, o.status AS order_status,
                    o.refund_status, o.payment_status
             FROM returns r
             JOIN orders o ON o.id = r.order_id
             WHERE r.id = $1`,
            [returnId]
        );
        const row = result.rows[0];
        if (!row) return res.status(404).json({ error: 'İade talebi bulunamadı.' });
        const isAdmin = req.user.principal === 'admin' && req.user.role === 'admin';
        const isOwner = req.user.principal === 'customer'
            && req.user.role === 'customer'
            && Number(row.order_user_id) === Number(req.user.id);
        if (!isAdmin && !isOwner) return res.status(404).json({ error: 'İade talebi bulunamadı.' });
        return res.status(200).json(serializeReturn(row, {
            order_status: row.order_status,
            payment_status: row.payment_status,
            refund_status: row.refund_status
        }));
    } catch (_error) {
        console.error('İade detayı alınamadı.');
        return res.status(500).json({ error: 'İade talebi bilgisi alınamadı.' });
    }
};

const getMyReturnRequests = async (req, res) => {
    try {
        if (req.user.principal !== 'customer' || req.user.role !== 'customer') {
            return res.status(403).json({ error: 'Müşteri oturumu gereklidir.' });
        }
        const result = await pool.query(
            `SELECT r.*
             FROM returns r
             JOIN orders o ON o.id = r.order_id
             WHERE o.user_id = $1
             ORDER BY r.created_at DESC, r.id DESC`,
            [Number(req.user.id)]
        );
        return res.status(200).json(result.rows.map((row) => serializeReturn(row)));
    } catch (_error) {
        console.error('Müşteri iade talepleri alınamadı.');
        return res.status(500).json({ error: 'İade talepleri getirilemedi.' });
    }
};

const getAllReturnRequests = async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, o.customer_name AS order_customer_name, o.total_amount AS order_total_amount,
                    o.status AS order_status, o.refund_status, o.payment_status,
                    COALESCE(u.full_name, u.name, o.customer_name, 'Bilinmiyor') AS customer_name
             FROM returns r
             JOIN orders o ON o.id = r.order_id
             LEFT JOIN users u ON u.id = r.user_id
             ORDER BY CASE r.status WHEN 'REQUESTED' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,
                      r.created_at DESC, r.id DESC`
        );
        return res.status(200).json(result.rows);
    } catch (_error) {
        console.error('İade talepleri listelenemedi.');
        return res.status(500).json({ error: 'İade talepleri getirilemedi.' });
    }
};

const updateReturnStatus = async (req, res) => {
    if (!isAdminCommerceCapabilityEnabled('returnWrite')) {
        return res.status(503).json({
            code: 'ADMIN_COMMERCE_CAPABILITY_DISABLED',
            capability: 'returnWrite',
            error: 'İade operasyon yazma yeteneği etkin değil.'
        });
    }
    try {
        const result = await updateReturnByAdmin({
            returnId: req.params.id,
            admin: req.user,
            body: req.body
        });
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof ReturnWorkflowError) return sendWorkflowError(res, error);
        console.error('İade durumu güncellenemedi.');
        return res.status(500).json({ error: 'İade durumu güncellenemedi.' });
    }
};

module.exports = {
    createReturnRequest,
    getAllReturnRequests,
    getMyReturnRequests,
    getReturnById,
    updateReturnStatus
};
