const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { ORDER_STATUS, REFUND_STATUS, SHIPMENT_STATUS } = require('../constants/orderStatus');
const { appendOrderEvent } = require('../services/orderService');
const { createInvoice } = require('../services/invoiceService');

const RETURN_STATUS = Object.freeze({
    REQUESTED: 'REQUESTED',
    IN_REVIEW: 'IN_REVIEW',
    APPROVED: 'APPROVED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    REJECTED: 'REJECTED'
});

const ACTIVE_RETURN_STATUSES = [
    RETURN_STATUS.REQUESTED,
    RETURN_STATUS.IN_REVIEW,
    RETURN_STATUS.APPROVED
];

const normalizeReturnStatus = (value = '') => String(value || '').trim().toUpperCase();

const getReturnStatusMessage = (status, orderId) => {
    const normalizedStatus = normalizeReturnStatus(status);

    switch (normalizedStatus) {
        case RETURN_STATUS.REQUESTED:
            return `Sipariş #${orderId} için iade talebiniz alındı.`;
        case RETURN_STATUS.IN_REVIEW:
            return `Sipariş #${orderId} için iade talebiniz inceleniyor.`;
        case RETURN_STATUS.APPROVED:
            return `Sipariş #${orderId} için iade talebiniz onaylandı.`;
        case RETURN_STATUS.COMPLETED:
            return `Sipariş #${orderId} için iade süreci tamamlandı.`;
        case RETURN_STATUS.REJECTED:
            return `Sipariş #${orderId} için iade talebiniz reddedildi.`;
        case RETURN_STATUS.FAILED:
            return `Sipariş #${orderId} için iade süreci tamamlanamadı.`;
        default:
            return `Sipariş #${orderId} için iade durumu güncellendi.`;
    }
};

const createReturnRequest = async (req, res) => {
    const client = await pool.connect();

    try {
        const orderId = Number(req.body.order_id);
        const reasonCode = String(req.body.reason_code || '').trim();
        const note = String(req.body.note || '').trim();

        if (!Number.isInteger(orderId)) {
            return res.status(400).json({ error: 'order_id zorunlu ve sayisal olmalidir.' });
        }

        if (!reasonCode) {
            return res.status(400).json({ error: 'reason_code zorunludur.' });
        }

        await client.query('BEGIN');

        const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
        if (orderResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Siparis bulunamadi.' });
        }

        const order = orderResult.rows[0];

        const isAdmin = req.user.role === 'admin';
        const isOwner = Number(order.user_id) === req.user.id;
        if (!isAdmin && !isOwner) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Bu siparis icin iade talebi olusturamazsiniz.' });
        }

        const status = String(order.status || '').trim();
        const isDeliverableForReturn = status === ORDER_STATUS.TESLIM_EDILDI || status === ORDER_STATUS.IPTAL_EDILDI;
        if (!isDeliverableForReturn) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Iade talebi sadece teslim edilen veya iptal edilen siparislerde acilabilir.' });
        }

        const existingReturn = await client.query(
            `SELECT id FROM returns
             WHERE order_id = $1
               AND status = ANY($2::text[])
             LIMIT 1`,
            [orderId, ACTIVE_RETURN_STATUSES]
        );

        if (existingReturn.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Bu siparis icin acik bir iade talebi zaten var.' });
        }

        const refundAmount = Number(order.total_amount || 0);

        const insertResult = await client.query(
            `INSERT INTO returns (order_id, user_id, reason_code, note, status, refund_amount)
             VALUES ($1, $2, $3, $4, 'REQUESTED', $5)
             RETURNING *`,
            [orderId, order.user_id, reasonCode, note || null, refundAmount]
        );

        await client.query(
            `UPDATE orders
             SET refund_status = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [REFUND_STATUS.REQUESTED, orderId]
        );

        await appendOrderEvent(client, orderId, 'RETURN_REQUESTED', 'Iade talebi olusturuldu.', {
            reasonCode,
            note,
            refundAmount
        });

        try {
            await createInvoice({ client, orderId, type: 'RETURN', amount: refundAmount });
        } catch (invoiceErr) {
            console.error('Iade fatura hatasi:', invoiceErr.message);
        }

        await client.query('COMMIT');

        const { io } = require('../server');
        if (order.user_id) {
            await createNotification(
                order.user_id,
                'order_update',
                `Siparis #${orderId} icin iade talebiniz alindi.`,
                io
            );
        }

        await createNotification(
            null,
            'new_order',
            `Iade talebi olustu. Siparis #${orderId}, neden: ${reasonCode}.`,
            io
        );

        res.status(201).json({
            message: 'Iade talebiniz alindi.',
            returnRequest: insertResult.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Iade talebi hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Iade talebi olusturulamadi.' });
    } finally {
        client.release();
    }
};

const getReturnById = async (req, res) => {
    try {
        const returnId = Number(req.params.id);
        if (!Number.isInteger(returnId)) {
            return res.status(400).json({ error: 'Gecersiz iade kimligi.' });
        }

        const result = await pool.query(
            `SELECT r.*, o.user_id, o.total_amount, o.status AS order_status
             FROM returns r
             JOIN orders o ON o.id = r.order_id
             WHERE r.id = $1`,
            [returnId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Iade talebi bulunamadi.' });
        }

        const row = result.rows[0];
        const isAdmin = req.user.role === 'admin';
        const isOwner = Number(row.user_id) === req.user.id;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'Bu iade talebine erisim yetkiniz yok.' });
        }

        res.status(200).json(row);
    } catch (err) {
        console.error('Iade detayi hatasi:', err.message);
        res.status(500).json({ error: 'Iade talebi bilgisi alinamadi.' });
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
        console.error('Iade taleplerini listeleme hatasi:', err.message);
        res.status(500).json({ error: 'Iade talepleri getirilemedi.' });
    }
};

const updateReturnStatus = async (req, res) => {
    const client = await pool.connect();

    try {
        const returnId = Number(req.params.id);
        const nextStatus = normalizeReturnStatus(req.body.status);

        if (!Number.isInteger(returnId)) {
            return res.status(400).json({ error: 'Geçersiz iade talebi kimliği.' });
        }

        if (!Object.values(RETURN_STATUS).includes(nextStatus)) {
            return res.status(400).json({ error: 'Geçersiz iade durumu.' });
        }

        await client.query('BEGIN');

        const result = await client.query(
            `SELECT
                r.*,
                o.user_id,
                o.status AS order_status,
                o.cancel_reason,
                o.shipment_status
             FROM returns r
             JOIN orders o ON o.id = r.order_id
             WHERE r.id = $1
             FOR UPDATE`,
            [returnId]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'İade talebi bulunamadı.' });
        }

        const currentReturn = result.rows[0];
        const currentOrderStatus = String(currentReturn.order_status || '').trim();
        const shouldMarkReturned = nextStatus === RETURN_STATUS.COMPLETED;
        const fallbackOrderStatus = currentReturn.cancel_reason
            ? ORDER_STATUS.IPTAL_EDILDI
            : ORDER_STATUS.TESLIM_EDILDI;

        const nextOrderStatus = shouldMarkReturned
            ? ORDER_STATUS.IADE_EDILDI
            : (currentOrderStatus === ORDER_STATUS.IADE_EDILDI ? fallbackOrderStatus : currentOrderStatus);

        const nextShipmentStatus = shouldMarkReturned
            ? SHIPMENT_STATUS.RETURNED
            : currentReturn.shipment_status;

        const updatedReturnResult = await client.query(
            `UPDATE returns
             SET status = $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [nextStatus, returnId]
        );

        await client.query(
            `UPDATE orders
             SET refund_status = $1,
                 status = $2,
                 shipment_status = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [nextStatus, nextOrderStatus, nextShipmentStatus, currentReturn.order_id]
        );

        await appendOrderEvent(
            client,
            currentReturn.order_id,
            'RETURN_STATUS_UPDATED',
            `İade durumu güncellendi: ${nextStatus}`,
            {
                returnId,
                status: nextStatus,
                orderStatus: nextOrderStatus
            }
        );

        await client.query('COMMIT');

        if (currentReturn.user_id) {
            const { io } = require('../server');
            await createNotification(
                currentReturn.user_id,
                'order_update',
                getReturnStatusMessage(nextStatus, currentReturn.order_id),
                io
            );
        }

        res.status(200).json({
            message: 'İade durumu güncellendi.',
            returnRequest: updatedReturnResult.rows[0],
            orderStatus: nextOrderStatus
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('İade durum güncelleme hatası:', err.message);
        res.status(500).json({ error: err.message || 'İade durumu güncellenemedi.' });
    } finally {
        client.release();
    }
};

module.exports = {
    createReturnRequest,
    getReturnById,
    getAllReturnRequests,
    updateReturnStatus
};
