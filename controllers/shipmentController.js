const pool = require('../config/db');

const defaultProvider = process.env.DEFAULT_SHIPMENT_PROVIDER || 'Yurtici Kargo';

const buildTrackingUrl = (provider, trackingNo) => {
    const providerKey = String(provider || '').toLowerCase();
    if (providerKey.includes('yurtici')) {
        return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(trackingNo)}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(`${provider} ${trackingNo}`)}`;
};

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
            trackingUrl: row.tracking_url || (row.tracking_no ? buildTrackingUrl(row.provider || row.shipment_provider || defaultProvider, row.tracking_no) : null),
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
    getShipment
};
