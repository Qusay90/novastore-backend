const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { isAdminCommerceCapabilityEnabled } = require('../services/adminCommerceCapabilityService');
const { ManualShipmentError } = require('../services/manualShipmentPolicy');
const { recordManualShipment } = require('../services/manualShipmentService');

const createShipment = async (req, res) => {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
        return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
    }
    return res.status(410).json({
        code: 'SHIPMENT_CREATE_DISABLED',
        error: 'Doğrulanmış taşıyıcı entegrasyonu olmadan gönderi ve takip numarası oluşturma kapalıdır.'
    });
};

const getIdempotencyKey = (req) => {
    if (typeof req.get === 'function') {
        const value = req.get('Idempotency-Key');
        if (value !== undefined && value !== null) return value;
    }
    return req.headers?.['idempotency-key'] ?? req.headers?.['Idempotency-Key'];
};

const notifyManualShipmentSafely = async (
    { orderId, userId },
    {
        createNotificationFn = createNotification,
        getIoFn = () => require('../server').io,
        logErrorFn = console.error
    } = {}
) => {
    if (userId === null || userId === undefined || !Number.isInteger(Number(userId))) return false;
    try {
        const notification = await createNotificationFn(
            Number(userId),
            'order_update',
            `Sipariş #${orderId} kargoya verildi.`,
            getIoFn()
        );
        if (!notification) {
            logErrorFn('Manuel kargo kaydı sonrası bildirim hazırlanamadı.');
            return false;
        }
        return true;
    } catch (notificationError) {
        logErrorFn('Manuel kargo kaydı sonrası bildirim hazırlanamadı.');
        return false;
    }
};

const createManualShipment = async (
    req,
    res,
    {
        recordManualShipmentFn = recordManualShipment,
        notificationDependencies = undefined
    } = {}
) => {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({
            code: 'MANUAL_SHIPMENT_ORDER_ID_INVALID',
            error: 'Geçersiz sipariş kimliği.'
        });
    }
    if (!isAdminCommerceCapabilityEnabled('manualShipmentWrite')) {
        return res.status(503).json({
            code: 'MANUAL_FULFILLMENT_DISABLED',
            error: 'Manuel kargo yazma özelliği bu ortamda kapalıdır.'
        });
    }

    try {
        const result = await recordManualShipmentFn({
            orderId,
            idempotencyKey: getIdempotencyKey(req),
            body: req.body,
            actor: req.currentAdmin || req.user
        });
        if (!result.reused) {
            await notifyManualShipmentSafely(
                { orderId, userId: result.userId },
                notificationDependencies
            );
        }
        return res.status(result.reused ? 200 : 201).json({
            mesaj: result.reused
                ? 'Manuel kargo kaydı daha önce oluşturulmuş.'
                : 'Manuel kargo kaydı oluşturuldu.',
            reused: result.reused,
            order: result.order,
            shipment: result.shipment
        });
    } catch (error) {
        if (error instanceof ManualShipmentError || Number.isInteger(error?.statusCode)) {
            return res.status(error.statusCode || 409).json({
                code: error.code || 'MANUAL_SHIPMENT_CONFLICT',
                error: error.message,
                ...(error.details ? { details: error.details } : {})
            });
        }
        console.error('Manuel kargo kaydı hatası:', error.message);
        return res.status(500).json({
            code: 'MANUAL_SHIPMENT_FAILED',
            error: 'Manuel kargo kaydı oluşturulamadı.'
        });
    }
};

const getShipment = async (req, res) => {
    try {
        const orderId = Number(req.params.orderId);
        if (!Number.isInteger(orderId)) {
            return res.status(400).json({ error: 'Geçersiz sipariş kimliği.' });
        }

        const shipmentResult = await pool.query(
            `SELECT s.*, o.user_id, o.status AS order_status, o.tracking_no, o.shipment_provider, o.estimated_delivery_date
             FROM orders o
             LEFT JOIN shipments s ON s.order_id = o.id
             WHERE o.id = $1`,
            [orderId]
        );

        if (shipmentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı.' });
        }

        const row = shipmentResult.rows[0];

        const isAdmin = req.user.role === 'admin';
        const isOwner = Number(row.user_id) === req.user.id;
        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'Bu gönderi kaydına erişim yetkiniz yok.' });
        }

        res.status(200).json({
            orderId,
            provider: row.provider || row.shipment_provider || null,
            trackingNo: row.tracking_no,
            trackingUrl: row.tracking_url || null,
            shipmentStatus: row.shipment_status || null,
            etaDate: row.eta_date || row.estimated_delivery_date || null,
            orderStatus: row.order_status
        });
    } catch (err) {
        console.error('Gönderi sorgulama hatası:', err.message);
        res.status(500).json({ error: 'Gönderi bilgisi alınamadı.' });
    }
};

module.exports = {
    createShipment,
    createManualShipment,
    getIdempotencyKey,
    getShipment,
    notifyManualShipmentSafely
};
