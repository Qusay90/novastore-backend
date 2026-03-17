const pool = require('../config/db');
const { createNotification } = require('./notificationController');
const { ORDER_STATUS, SHIPMENT_STATUS } = require('../constants/orderStatus');
const { appendOrderEvent } = require('../services/orderService');
const { createInvoice } = require('../services/invoiceService');

const defaultProvider = process.env.DEFAULT_SHIPMENT_PROVIDER || 'Yurtici Kargo';

const addDays = (baseDate, days) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

const buildTrackingNo = (orderId) => {
    return `NS${orderId}${Date.now().toString().slice(-6)}`;
};

const buildTrackingUrl = (provider, trackingNo) => {
    const providerKey = String(provider || '').toLowerCase();
    if (providerKey.includes('yurtici')) {
        return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(trackingNo)}`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(`${provider} ${trackingNo}`)}`;
};

const createShipment = async (req, res) => {
    const client = await pool.connect();

    try {
        const orderId = Number(req.params.orderId);
        if (!Number.isInteger(orderId)) {
            return res.status(400).json({ error: 'Gecersiz siparis kimligi.' });
        }

        const {
            provider = defaultProvider,
            trackingNo,
            etaDate,
            labelUrl = null,
            shipmentStatus = SHIPMENT_STATUS.IN_TRANSIT
        } = req.body;

        await client.query('BEGIN');

        const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
        if (orderResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Siparis bulunamadi.' });
        }

        const order = orderResult.rows[0];

        if (order.status === ORDER_STATUS.IPTAL_EDILDI) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Iptal edilen siparis icin gonderi olusturulamaz.' });
        }

        const finalTrackingNo = trackingNo || buildTrackingNo(orderId);
        const finalEta = etaDate || addDays(new Date(), 2);
        const trackingUrl = buildTrackingUrl(provider, finalTrackingNo);

        const shipmentResult = await client.query(
            `INSERT INTO shipments
                (order_id, provider, tracking_no, tracking_url, shipment_status, eta_date, label_url, raw_payload, updated_at)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
             ON CONFLICT (order_id)
             DO UPDATE SET
                provider = EXCLUDED.provider,
                tracking_no = EXCLUDED.tracking_no,
                tracking_url = EXCLUDED.tracking_url,
                shipment_status = EXCLUDED.shipment_status,
                eta_date = EXCLUDED.eta_date,
                label_url = EXCLUDED.label_url,
                raw_payload = EXCLUDED.raw_payload,
                updated_at = NOW()
             RETURNING *`,
            [
                orderId,
                provider,
                finalTrackingNo,
                trackingUrl,
                shipmentStatus,
                finalEta,
                labelUrl,
                JSON.stringify({ source: 'admin_create_shipment', createdBy: req.user.id })
            ]
        );

        await client.query(
            `UPDATE orders
             SET shipment_provider = $1,
                 tracking_no = $2,
                 shipment_status = $3,
                 estimated_delivery_date = $4,
                 status = $5,
                 updated_at = NOW()
             WHERE id = $6`,
            [provider, finalTrackingNo, shipmentStatus, finalEta, ORDER_STATUS.KARGOYA_VERILDI, orderId]
        );

        await appendOrderEvent(client, orderId, 'SHIPMENT_CREATED', 'Gonderi kaydi olusturuldu.', {
            provider,
            trackingNo: finalTrackingNo,
            trackingUrl,
            etaDate: finalEta
        });

        try {
            await createInvoice({ client, orderId, type: 'INVOICE', amount: Number(order.total_amount || 0) });
        } catch (invoiceErr) {
            console.error('Fatura olusturma hatasi (kargo):', invoiceErr.message);
        }

        await client.query('COMMIT');

        if (order.user_id) {
            const { io } = require('../server');
            await createNotification(
                order.user_id,
                'order_update',
                `Siparis #${orderId} kargoya verildi. Takip No: ${finalTrackingNo}`,
                io
            );
        }

        res.status(201).json({
            message: 'Gonderi kaydi olusturuldu.',
            shipment: shipmentResult.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Gonderi olusturma hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Gonderi olusturulamadi.' });
    } finally {
        client.release();
    }
};

const getShipment = async (req, res) => {
    try {
        const orderId = Number(req.params.orderId);
        if (!Number.isInteger(orderId)) {
            return res.status(400).json({ error: 'Gecersiz siparis kimligi.' });
        }

        const shipmentResult = await pool.query(
            `SELECT s.*, o.user_id, o.status AS order_status, o.tracking_no, o.shipment_provider, o.estimated_delivery_date
             FROM orders o
             LEFT JOIN shipments s ON s.order_id = o.id
             WHERE o.id = $1`,
            [orderId]
        );

        if (shipmentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Siparis bulunamadi.' });
        }

        const row = shipmentResult.rows[0];

        const isAdmin = req.user.role === 'admin';
        const isOwner = Number(row.user_id) === req.user.id;
        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: 'Bu gonderi kaydina erisim yetkiniz yok.' });
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
        console.error('Gonderi sorgulama hatasi:', err.message);
        res.status(500).json({ error: 'Gonderi bilgisi alinamadi.' });
    }
};

module.exports = {
    createShipment,
    getShipment
};
