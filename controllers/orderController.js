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
const { consumeCouponUsageIfNeeded } = require('../services/couponUsageService');

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

const notifyOrderCreated = async (orderId, userId, customerName) => {
    const { io } = require('../server');

    if (userId) {
        await createNotification(
            userId,
            'order_update',
            `#${orderId} numaralı siparişiniz alındı ve ödeme süreci başlatıldı.`,
            io
        );
    }

    await createNotification(
        null,
        'new_order',
        `Yeni sipariş alındı! Sipariş No: #${orderId} - Müşteri: ${customerName}`,
        io
    );
};

const statusMessageForUser = (status, orderId) => {
    const normalized = resolveOrderStatus(status);

    switch (normalized) {
        case ORDER_STATUS.ONAY_BEKLIYOR:
            return `Sipariş #${orderId} onay bekliyor.`;
        case ORDER_STATUS.HAZIRLANIYOR:
            return `Sipariş #${orderId} hazırlanıyor.`;
        case ORDER_STATUS.KARGOYA_VERILDI:
            return `Sipariş #${orderId} kargoya verildi!`;
        case ORDER_STATUS.TESLIM_EDILDI:
            return `Sipariş #${orderId} teslim edildi, keyifli kullanımlar!`;
        case ORDER_STATUS.IPTAL_EDILDI:
            return `Sipariş #${orderId} iptal edildi.`;
        case ORDER_STATUS.IADE_EDILDI:
            return `Sipariş #${orderId} iade edildi.`;
        default:
            return `Sipariş #${orderId} durumu güncellendi: ${status}`;
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

const isPendingPaymentRow = (row = {}) => (
    row.status === ORDER_STATUS.ODEME_BEKLIYOR ||
    row.payment_status === PAYMENT_STATUS.REQUIRES_ACTION
);

const isFailedPaymentRow = (row = {}) => (
    row.payment_status === PAYMENT_STATUS.FAILED
);

const normalizeOrderVisibility = (row = {}) => {
    const isPendingPayment = isPendingPaymentRow(row);
    const isPaymentFailed = isFailedPaymentRow(row);

    return {
        ...row,
        is_pending_payment: isPendingPayment,
        is_payment_failed: isPaymentFailed,
        display_status: isPendingPayment
            ? ORDER_STATUS.ODEME_BEKLIYOR
            : isPaymentFailed
                ? 'Ödeme Başarısız'
                : row.status,
        status_note: isPendingPayment
            ? 'Ödeme tamamlanmadan kesin siparişe dönüşmez.'
            : isPaymentFailed
                ? 'Ödeme tamamlanmadığı için sipariş kesinleşmedi.'
                : null
    };
};

// 1. Yeni Siparis Olusturma (legacy/fallback)
const createOrder = async (req, res) => {
    return res.status(410).json({
        code: 'LEGACY_ORDER_CREATE_DISABLED',
        error: 'Eski sipari\u015f olu\u015fturma endpointi devre d\u0131\u015f\u0131. \u00d6deme ba\u015flatmak i\u00e7in /api/payments/initialize kullan\u0131n.'
    });
};

const createReservedLegacyOrder = async (req, res) => {
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
            return res.status(400).json({ error: 'Müşteri bilgileri eksik.' });
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

        await consumeCouponUsageIfNeeded(client, pricing.coupon);

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
            mesaj: 'Siparişiniz başarıyla alındı!',
            siparisNo: order.id,
            totals: pricing.totals,
            campaigns: pricing.campaigns,
            coupon: pricing.coupon
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Sipariş hatası:', err.message);
        res.status(500).json({ error: err.message || 'Sipariş oluşturulurken bir hata meydana geldi.' });
    } finally {
        client.release();
    }
};

// 2. Tüm Siparişleri Getir (Admin)
const getAllOrders = async (req, res) => {
    try {
        const result = await runOrderQueryWithFallback(
            pool,
            `${orderSelectSql} ORDER BY o.created_at DESC`,
            [],
            `${orderSelectFallbackSql} ORDER BY o.created_at DESC`
        );
        res.status(200).json(result.rows.map(normalizeOrderVisibility));
    } catch (err) {
        res.status(500).json({ error: 'Siparişler getirilemedi.' });
    }
};

// 3. Belirli Kullanıcının Siparişleri
const getUserOrders = async (req, res) => {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isInteger(userId)) {
            return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği.' });
        }

        const result = await runOrderQueryWithFallback(
            pool,
            `${orderSelectSql} WHERE o.user_id = $1 ORDER BY o.created_at DESC`,
            [userId],
            `${orderSelectFallbackSql} WHERE o.user_id = $1 ORDER BY o.created_at DESC`
        );
        res.status(200).json(result.rows.map(normalizeOrderVisibility));
    } catch (err) {
        res.status(500).json({ error: 'Geçmiş siparişler getirilemedi.' });
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
            return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
        }
        if (!resolvedStatus) {
            return res.status(400).json({ error: 'Geçersiz sipariş durumu.' });
        }

        await client.query('BEGIN');

        const currentOrder = await fetchOrderById(client, orderId);
        if (!currentOrder) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        }

        if (resolvedStatus === ORDER_STATUS.IPTAL_EDILDI && resolveOrderStatus(currentOrder.status) === ORDER_STATUS.TESLIM_EDILDI) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Teslim edilen sipariş durumdan iptal edilemez. İade akışını kullanın.' });
        }

        let updatedOrder;
        if (resolvedStatus === ORDER_STATUS.IPTAL_EDILDI) {
            await markOrderCancelled({
                client,
                order: currentOrder,
                reasonCode: 'ADMIN_STATUS_UPDATE',
                note: 'Yönetici panelinden iptal edildi.',
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

        res.status(200).json({ mesaj: 'Sipariş durumu başarıyla güncellendi!', order: updatedOrder });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Durum güncelleme hatası:', err.message);
        res.status(500).json({ error: err.message || 'Sipariş durumu güncellenirken hata oluştu.' });
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
            return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
        }

        if (!reasonCode) {
            return res.status(400).json({ error: 'reason_code zorunludur.' });
        }

        await client.query('BEGIN');

        const order = await fetchOrderById(client, orderId);
        if (!order) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        }

        const isOwner = req.user && Number(order.user_id) === req.user.id;
        const isAdmin = req.user && req.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Bu siparişi iptal etme yetkiniz yok.' });
        }

        if (resolveOrderStatus(order.status) === ORDER_STATUS.IPTAL_EDILDI) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Sipariş zaten iptal edilmiş.' });
        }

        if (resolveOrderStatus(order.status) === ORDER_STATUS.TESLIM_EDILDI) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Teslim edilen sipariş doğrudan iptal edilemez. İade talebi oluşturun.' });
        }

        const refundStatus = order.payment_status === PAYMENT_STATUS.PAID ? REFUND_STATUS.PENDING : REFUND_STATUS.NONE;
        await markOrderCancelled({ client, order, reasonCode, note, refundStatus });

        try {
            await createInvoice({ client, orderId, type: 'CANCELLATION', amount: Number(order.total_amount || 0) });
        } catch (invoiceErr) {
            console.error('İptal fatura hatası:', invoiceErr.message);
        }

        const updatedOrder = await fetchOrderById(client, orderId);
        await client.query('COMMIT');

        if (order.user_id) {
            const { io } = require('../server');
            await createNotification(
                order.user_id,
                'order_update',
                `Sipariş #${orderId} iptal edildi.`,
                io
            );
        }

        res.status(200).json({
            mesaj: 'Sipariş iptal edildi.',
            order: updatedOrder,
            refund_eta: refundStatus === REFUND_STATUS.PENDING ? '1-3 iş günü' : null
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Sipariş iptal hatası:', err.message);
        res.status(500).json({ error: err.message || 'Sipariş iptal edilirken hata oluştu.' });
    } finally {
        client.release();
    }
};

// 6. Siparis Silme (Admin)
const deleteOrder = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
        }

        const result = await pool.query('DELETE FROM orders WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        }

        res.status(200).json({ mesaj: 'Sipariş başarıyla silindi.' });
    } catch (err) {
        console.error('Sipariş silme hatası:', err.message);
        res.status(500).json({ error: 'Sipariş silinirken hata oluştu.' });
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
    return normalizeOrderVisibility(row);
};

module.exports = {
    createOrder,
    getAllOrders,
    getUserOrders,
    updateOrderStatus,
    cancelOrder,
    deleteOrder,
    getOrderByIdInternal,
    normalizeOrderVisibility
};
