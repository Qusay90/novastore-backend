const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { ORDER_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const { appendOrderEvent } = require('../services/orderService');
const { createInvoice } = require('../services/invoiceService');

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
               AND status IN ('REQUESTED', 'APPROVED', 'IN_REVIEW')
             LIMIT 1`,
            [orderId]
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
                `?? Siparis #${orderId} icin iade talebiniz alindi.`,
                io
            );
        }

        await createNotification(
            null,
            'new_order',
            `?? Iade talebi olustu. Siparis #${orderId}, neden: ${reasonCode}.`,
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

module.exports = {
    createReturnRequest,
    getReturnById
};
