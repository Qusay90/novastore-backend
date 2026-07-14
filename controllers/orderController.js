const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
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
    releaseStockReservation
} = require('../services/orderService');
const { consumeCouponUsageIfNeeded } = require('../services/couponUsageService');
const {
    OrderLifecycleError,
    evaluateGenericStatusRequest,
    planOrderCancellation,
    selectCancellationPayments,
    validateCancelledOrderIdempotency
} = require('../services/orderLifecyclePolicy');
const { isAdminCommerceCapabilityEnabled } = require('../services/adminCommerceCapabilityService');
const {
    createAdminOrderCancellationCommand,
    toCancellationActor,
    validateAdminOrderCancellationReplay
} = require('../services/adminOrderCancellationPolicy');
const { sendDisabledCapability } = require('../middlewares/adminCommerceCapability');

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

const fetchOrderById = async (client, orderId, { forUpdate = false } = {}) => {
    const lockClause = forUpdate ? ' FOR UPDATE OF o' : '';
    const result = await runOrderQueryWithFallback(
        client,
        `${orderSelectSql} WHERE o.id = $1${lockClause}`,
        [orderId],
        `${orderSelectFallbackSql} WHERE o.id = $1${lockClause}`
    );
    return result.rows[0] || null;
};

const fetchPaymentsForUpdate = async (client, order) => {
    const result = await client.query(
        `SELECT id, provider, payment_ref, status, raw_request, raw_response, created_at
         FROM payments
         WHERE order_id = $1
         ORDER BY id DESC
         FOR UPDATE`,
        [order.id]
    );
    return result.rows;
};

const fetchLatestCancellationEvent = async (client, orderId) => {
    const result = await client.query(
        `SELECT payload
         FROM order_events
         WHERE order_id = $1 AND event_type = 'ORDER_CANCELLED'
         ORDER BY id DESC
         LIMIT 1`,
        [orderId]
    );
    return result.rows[0]?.payload || null;
};

const getIdempotencyKey = (req) => {
    if (typeof req.get === 'function') {
        const value = req.get('Idempotency-Key');
        if (value !== undefined && value !== null) return value;
    }
    return req.headers?.['idempotency-key'] ?? req.headers?.['Idempotency-Key'];
};

const sendLifecycleError = (res, error) => res.status(error.statusCode || 409).json({
    code: error.code || 'ORDER_LIFECYCLE_CONFLICT',
    error: error.message,
    ...(error.details ? { details: error.details } : {})
});

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
                JSON.stringify({
                    paymentMethod,
                    couponCode,
                    stockReserved: true,
                    finalizesOnWebhook: false,
                    reservationSource: 'legacy_reserved_order'
                }),
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
        const status = req.body?.status;
        const resolvedStatus = resolveOrderStatus(status);

        if (!Number.isInteger(orderId)) {
            return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
        }
        if (!resolvedStatus) {
            return res.status(400).json({ error: 'Geçersiz sipariş durumu.' });
        }

        await client.query('BEGIN');

        const currentOrder = await fetchOrderById(client, orderId, { forUpdate: true });
        if (!currentOrder) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        }

        const decision = evaluateGenericStatusRequest({
            currentStatus: currentOrder.status,
            requestedStatus: resolvedStatus,
            expectedStatus: req.body?.expected_status ?? req.body?.expectedStatus
        });
        await client.query('COMMIT');
        return res.status(200).json({
            mesaj: 'Sipariş zaten istenen durumda.',
            reused: decision.reused,
            order: currentOrder
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err instanceof OrderLifecycleError) return sendLifecycleError(res, err);
        console.error('Durum güncelleme hatası:', err.message);
        return res.status(500).json({ error: 'Sipariş durumu güncellenirken hata oluştu.' });
    } finally {
        client.release();
    }
};

// 5. Siparis Iptali (Kullanici/Admin)
const cancelOrder = async (req, res) => {
    const orderId = Number(req.params.id);
    const isAdmin = req.user?.role === 'admin';

    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
    }
    if (isAdmin && !isAdminCommerceCapabilityEnabled('orderCancelWrite')) {
        return sendDisabledCapability(res, 'orderCancelWrite');
    }

    let reasonCode = String(req.body?.reason_code || '').trim();
    let note = String(req.body?.note || '').trim();
    let expectedStatus = req.body?.expected_status ?? req.body?.expectedStatus;
    let adminCommand = null;
    if (isAdmin) {
        try {
            const actor = toCancellationActor(req);
            adminCommand = createAdminOrderCancellationCommand({
                orderId,
                body: req.body,
                idempotencyKey: getIdempotencyKey(req),
                actor
            });
            reasonCode = adminCommand.reasonCode;
            note = adminCommand.note;
            expectedStatus = adminCommand.expectedStatus;
        } catch (error) {
            if (error instanceof OrderLifecycleError) return sendLifecycleError(res, error);
            throw error;
        }
    } else if (!reasonCode) {
        return res.status(400).json({ error: 'reason_code zorunludur.' });
    }

    let client = null;
    let transactionOpen = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        transactionOpen = true;

        const order = await fetchOrderById(client, orderId, { forUpdate: true });
        if (!order) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        }

        const isOwner = req.user && Number(order.user_id) === req.user.id;
        if (!isOwner && !isAdmin) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(403).json({ error: 'Bu siparişi iptal etme yetkiniz yok.' });
        }

        const lockedPayments = await fetchPaymentsForUpdate(client, order);
        const payments = selectCancellationPayments({ order, payments: lockedPayments });
        if (resolveOrderStatus(order.status) === ORDER_STATUS.IPTAL_EDILDI) {
            validateCancelledOrderIdempotency({ payments });
            if (adminCommand) {
                const cancellationEvent = await fetchLatestCancellationEvent(client, orderId);
                validateAdminOrderCancellationReplay({ eventPayload: cancellationEvent, command: adminCommand });
            }
            await client.query('COMMIT');
            transactionOpen = false;
            const refundStatus = order.refund_status || REFUND_STATUS.NONE;
            return res.status(200).json({
                mesaj: 'Sipariş zaten iptal edilmiş.',
                reused: true,
                order,
                refund: {
                    status: refundStatus,
                    providerExecuted: false,
                    manualReviewRequired: refundStatus === REFUND_STATUS.PENDING
                }
            });
        }

        if (expectedStatus !== undefined && expectedStatus !== null && String(expectedStatus).trim() !== '') {
            const expected = resolveOrderStatus(expectedStatus);
            if (!expected) {
                throw new OrderLifecycleError('Beklenen sipariş durumu geçersiz.', {
                    code: 'ORDER_EXPECTED_STATUS_INVALID',
                    statusCode: 400
                });
            }
            if (expected !== resolveOrderStatus(order.status)) {
                throw new OrderLifecycleError('Sipariş durumu başka bir işlem tarafından değiştirildi; güncel kaydı yeniden yükleyin.', {
                    code: 'ORDER_STATUS_CONFLICT',
                    details: {
                        expectedStatus: expected,
                        currentStatus: resolveOrderStatus(order.status),
                        refetchRequired: true
                    }
                });
            }
        }
        const cancellationPlan = planOrderCancellation({ order, payments });
        const stockRelease = cancellationPlan.releasePayment
            ? await releaseStockReservation({
                client,
                payment: cancellationPlan.releasePayment,
                items: parseItems(order),
                reasonCode
            })
            : null;
        await markOrderCancelled({
            client,
            order,
            reasonCode,
            note,
            refundStatus: cancellationPlan.refundStatus,
            stockRelease,
            actor: adminCommand?.actor || toCancellationActor(req),
            idempotencyKey: adminCommand?.idempotencyKey || null,
            requestFingerprint: adminCommand?.requestFingerprint || null
        });

        const updatedOrder = await fetchOrderById(client, orderId);
        await client.query('COMMIT');
        transactionOpen = false;

        if (order.user_id) {
            try {
                const { io } = require('../server');
                await createNotification(
                    order.user_id,
                    'order_update',
                    `Sipariş #${orderId} iptal edildi.`,
                    io
                );
            } catch (notificationError) {
                console.error('İptal sonrası bildirim hazırlanamadı:', notificationError.message);
            }
        }

        return res.status(200).json({
            mesaj: 'Sipariş iptal edildi.',
            order: updatedOrder,
            reused: false,
            refund_eta: null,
            refund: {
                status: cancellationPlan.refundStatus,
                providerExecuted: false,
                manualReviewRequired: cancellationPlan.refundStatus === REFUND_STATUS.PENDING
            }
        });
    } catch (err) {
        if (client && transactionOpen) {
            await client.query('ROLLBACK').catch(() => {});
        }
        if (err instanceof OrderLifecycleError) return sendLifecycleError(res, err);
        console.error('Sipariş iptal hatası:', err.message);
        return res.status(500).json({ error: 'Sipariş iptal edilirken hata oluştu.' });
    } finally {
        if (client) client.release();
    }
};

// 6. Siparis Silme (Admin)
const deleteOrder = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
    }
    return res.status(410).json({
        code: 'ORDER_HARD_DELETE_DISABLED',
        error: 'Siparişler finansal ve denetim izi nedeniyle kalıcı olarak silinemez.'
    });
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
    getIdempotencyKey,
    getOrderByIdInternal,
    normalizeOrderVisibility
};
