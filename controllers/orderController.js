const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
const { createInvoice } = require('../services/invoiceService');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    resolveOrderStatus
} = require('../constants/orderStatus');
const {
    createOrderWithReservation,
    markOrderCancelled,
    parseItems,
    updateOrderStatus: applyOrderStatus
} = require('../services/orderService');

const orderSelectSql = `
    SELECT o.*, s.tracking_url, s.eta_date
    FROM orders o
    LEFT JOIN shipments s ON s.order_id = o.id
`;

const orderSelectFallbackSql = `
    SELECT o.*
    FROM orders o
`;

const runOrderQueryWithFallback = async (client, primaryQuery, params, fallbackQuery) => {
    try {
        return await client.query(primaryQuery, params);
    } catch (err) {
        const code = String((err && err.code) || '');
        const message = String((err && err.message) || '');
        const isShipmentSchemaMismatch =
            code.startsWith('42') &&
            /(shipments|tracking_url|eta_date|s\.order_id)/i.test(message);
        if (!isShipmentSchemaMismatch) throw err;
        return client.query(fallbackQuery, params);
    }
};

const incrementCouponUsageIfNeeded = async (client, coupon) => {
    if (!coupon || !coupon.applied || !coupon.couponId) return;

    await client.query(
        'UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1',
        [coupon.couponId]
    );
};

const notifyOrderCreated = async (orderId, userId, customerName) => {
    const { io } = require('../server');

    if (userId) {
        await createNotification(
            userId,
            'order_update',
            `#${orderId} numarali siparisiniz alindi ve odeme sureci baslatildi.`,
            io
        );
    }

    await createNotification(
        null,
        'new_order',
        `Yeni siparis alindi! Siparis No: #${orderId} - Musteri: ${customerName}`,
        io
    );
};

const statusMessageForUser = (status, orderId) => {
    const normalized = resolveOrderStatus(status);

    switch (normalized) {
        case ORDER_STATUS.ONAY_BEKLIYOR:
            return `Siparis #${orderId} onay bekliyor.`;
        case ORDER_STATUS.HAZIRLANIYOR:
            return `Siparis #${orderId} hazirlaniyor.`;
        case ORDER_STATUS.KARGOYA_VERILDI:
            return `Siparis #${orderId} kargoya verildi!`;
        case ORDER_STATUS.TESLIM_EDILDI:
            return `Siparis #${orderId} teslim edildi, keyifli kullanimlar!`;
        case ORDER_STATUS.IPTAL_EDILDI:
            return `Siparis #${orderId} iptal edildi.`;
        case ORDER_STATUS.IADE_EDILDI:
            return `Siparis #${orderId} iade edildi.`;
        default:
            return `Siparis #${orderId} durumu guncellendi: ${status}`;
    }
};

const fetchOrderById = async (client, orderId) => {
    const result = await runOrderQueryWithFallback(
        client,
        `${orderSelectSql} WHERE o.id = $1`,
        [orderId],
        `${orderSelectFallbackSql} WHERE o.id = $1`
    );
    return result.rows[0] || null;
};

// 1. Yeni Siparis Olusturma (legacy/fallback)
const createOrder = async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            fullName,
            email,
            phone,
            address,
            cartItems,
            paymentMethod = 'havale',
            couponCode = null,
            analyticsSessionKey = null
        } = req.body;

        if (!fullName || !email || !address) {
            return res.status(400).json({ error: 'Musteri bilgileri eksik.' });
        }

        const authUser = getUserFromRequestIfAny(req);
        const userId = authUser ? authUser.id : null;

        await client.query('BEGIN');

        const { order, pricing } = await createOrderWithReservation({
            client,
            userId,
            analyticsSessionKey,
            fullName,
            email,
            phone,
            address,
            cartItems,
            couponCode,
            paymentMethod
        });

        await incrementCouponUsageIfNeeded(client, pricing.coupon);

        await client.query(
            `INSERT INTO payments
                (order_id, provider, payment_ref, amount, currency, status, raw_request, raw_response)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
            [
                order.id,
                paymentMethod === 'havale' ? 'manual_transfer' : 'manual',
                `MAN-${order.id}`,
                pricing.totals.total,
                pricing.totals.currency,
                paymentMethod === 'havale' ? PAYMENT_STATUS.WAITING_TRANSFER : PAYMENT_STATUS.PENDING,
                JSON.stringify({ paymentMethod, couponCode }),
                JSON.stringify({ source: 'legacy_create_order' })
            ]
        );

        await client.query('COMMIT');

        await notifyOrderCreated(order.id, userId, fullName);

        res.status(201).json({
            mesaj: 'Siparisiniz basariyla alindi!',
            siparisNo: order.id,
            totals: pricing.totals,
            campaigns: pricing.campaigns,
            coupon: pricing.coupon
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Siparis hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Siparis olusturulurken bir hata meydana geldi.' });
    } finally {
        client.release();
    }
};

// 2. Tum Siparisleri Getir (Admin)
const getAllOrders = async (req, res) => {
    try {
        const result = await runOrderQueryWithFallback(
            pool,
            `${orderSelectSql} ORDER BY o.created_at DESC`,
            [],
            `${orderSelectFallbackSql} ORDER BY o.created_at DESC`
        );
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Siparisler getirilemedi.' });
    }
};

// 3. Belirli Kullanicinin Siparisleri
const getUserOrders = async (req, res) => {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isInteger(userId)) {
            return res.status(400).json({ error: 'Gecersiz kullanici kimligi.' });
        }

        const result = await runOrderQueryWithFallback(
            pool,
            `${orderSelectSql} WHERE o.user_id = $1 ORDER BY o.created_at DESC`,
            [userId],
            `${orderSelectFallbackSql} WHERE o.user_id = $1 ORDER BY o.created_at DESC`
        );
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Gecmis siparisler getirilemedi.' });
    }
};

// 4. Siparis Durumunu Guncelleme (Admin)
const updateOrderStatus = async (req, res) => {
    const client = await pool.connect();

    try {
        const orderId = Number(req.params.id);
        const status = req.body.status;
        const resolvedStatus = resolveOrderStatus(status);

        if (!Number.isInteger(orderId)) {
            return res.status(400).json({ error: 'Gecersiz siparis kimligi.' });
        }
        if (!resolvedStatus) {
            return res.status(400).json({ error: 'Gecersiz siparis durumu.' });
        }

        await client.query('BEGIN');

        const currentOrder = await fetchOrderById(client, orderId);
        if (!currentOrder) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Siparis bulunamadi.' });
        }

        if (resolvedStatus === ORDER_STATUS.IPTAL_EDILDI && resolveOrderStatus(currentOrder.status) === ORDER_STATUS.TESLIM_EDILDI) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Teslim edilen siparis durumdan iptal edilemez. Iade akisini kullanin.' });
        }

        let updatedOrder;
        if (resolvedStatus === ORDER_STATUS.IPTAL_EDILDI) {
            await markOrderCancelled({
                client,
                order: currentOrder,
                reasonCode: 'ADMIN_STATUS_UPDATE',
                note: 'Yonetici panelinden iptal edildi.',
                refundStatus: currentOrder.payment_status === PAYMENT_STATUS.PAID ? REFUND_STATUS.PENDING : REFUND_STATUS.NONE
            });
            updatedOrder = await fetchOrderById(client, orderId);
        } else {
            updatedOrder = await applyOrderStatus({
                client,
                orderId,
                status: resolvedStatus,
                shipmentStatus: resolvedStatus === ORDER_STATUS.KARGOYA_VERILDI ? 'IN_TRANSIT' : null
            });
        }

        await client.query('COMMIT');

        if (updatedOrder && updatedOrder.user_id) {
            const { io } = require('../server');
            const msg = statusMessageForUser(updatedOrder.status, orderId);
            await createNotification(updatedOrder.user_id, 'order_update', msg, io);
        }

        res.status(200).json({ mesaj: 'Siparis durumu basariyla guncellendi!', order: updatedOrder });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Durum guncelleme hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Siparis durumu guncellenirken hata olustu.' });
    } finally {
        client.release();
    }
};

// 5. Siparis Iptali (Kullanici/Admin)
const cancelOrder = async (req, res) => {
    const client = await pool.connect();

    try {
        const orderId = Number(req.params.id);
        const reasonCode = String(req.body.reason_code || '').trim();
        const note = String(req.body.note || '').trim();

        if (!Number.isInteger(orderId)) {
            return res.status(400).json({ error: 'Gecersiz siparis kimligi.' });
        }

        if (!reasonCode) {
            return res.status(400).json({ error: 'reason_code zorunludur.' });
        }

        await client.query('BEGIN');

        const order = await fetchOrderById(client, orderId);
        if (!order) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Siparis bulunamadi.' });
        }

        const isOwner = req.user && Number(order.user_id) === req.user.id;
        const isAdmin = req.user && req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Bu siparisi iptal etme yetkiniz yok.' });
        }

        if (resolveOrderStatus(order.status) === ORDER_STATUS.IPTAL_EDILDI) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Siparis zaten iptal edilmis.' });
        }

        if (resolveOrderStatus(order.status) === ORDER_STATUS.TESLIM_EDILDI) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Teslim edilen siparis dogrudan iptal edilemez. Iade talebi olusturun.' });
        }

        const refundStatus = order.payment_status === PAYMENT_STATUS.PAID ? REFUND_STATUS.PENDING : REFUND_STATUS.NONE;
        await markOrderCancelled({ client, order, reasonCode, note, refundStatus });

        try {
            await createInvoice({ client, orderId, type: 'CANCELLATION', amount: Number(order.total_amount || 0) });
        } catch (invoiceErr) {
            console.error('Iptal fatura hatasi:', invoiceErr.message);
        }

        const updatedOrder = await fetchOrderById(client, orderId);
        await client.query('COMMIT');

        if (order.user_id) {
            const { io } = require('../server');
            await createNotification(
                order.user_id,
                'order_update',
                `Siparis #${orderId} iptal edildi.`,
                io
            );
        }

        res.status(200).json({
            mesaj: 'Siparis iptal edildi.',
            order: updatedOrder,
            refund_eta: refundStatus === REFUND_STATUS.PENDING ? '1-3 is gunu' : null
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Siparis iptal hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Siparis iptal edilirken hata olustu.' });
    } finally {
        client.release();
    }
};

// 6. Siparis Silme (Admin)
const deleteOrder = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Gecersiz siparis kimligi.' });
        }

        const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Siparis bulunamadi.' });
        }

        res.status(200).json({ mesaj: 'Siparis basariyla silindi.' });
    } catch (err) {
        console.error('Siparis silme hatasi:', err.message);
        res.status(500).json({ error: 'Siparis silinirken hata olustu.' });
    }
};

// 7. Siparis detay (ic servisler icin)
const getOrderByIdInternal = async (orderId) => {
    const result = await runOrderQueryWithFallback(
        pool,
        `${orderSelectSql} WHERE o.id = $1`,
        [orderId],
        `${orderSelectFallbackSql} WHERE o.id = $1`
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    row.items = parseItems(row);
    return row;
};

module.exports = {
    createOrder,
    getAllOrders,
    getUserOrders,
    updateOrderStatus,
    cancelOrder,
    deleteOrder,
    getOrderByIdInternal
};
