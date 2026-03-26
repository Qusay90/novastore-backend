const crypto = require('crypto');
const pool = require('../config/db');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
const { createNotification } = require('./notificationController');
const { initializeIyzicoPayment, verifyWebhookSignature } = require('../services/paymentProviderService');
const { createOrderWithReservation, restockItems, appendOrderEvent } = require('../services/orderService');
const { PAYMENT_STATUS, ORDER_STATUS, REFUND_STATUS } = require('../constants/orderStatus');

const readIdempotencyKey = (req) => {
    const headerKey = req.headers['idempotency-key'];
    const bodyKey = req.body && req.body.idempotency_key;
    const key = String(headerKey || bodyKey || '').trim();
    return key || null;
};

const createDeterministicKeyFromBody = (body) => {
    const seed = JSON.stringify({
        analyticsSessionKey: body.analyticsSessionKey,
        fullName: body.fullName,
        email: body.email,
        phone: body.phone,
        address: body.address,
        cartItems: body.cartItems,
        couponCode: body.couponCode,
        paymentMethod: body.paymentMethod
    });

    return `AUTO-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
};

const incrementCouponUsageIfNeeded = async (client, coupon) => {
    if (!coupon || !coupon.applied || !coupon.couponId) return;

    await client.query(
        'UPDATE coupons SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1',
        [coupon.couponId]
    );
};

const initializePayment = async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            fullName,
            email,
            phone,
            address,
            cartItems,
            couponCode = null,
            paymentMethod = 'card',
            analyticsSessionKey = null
        } = req.body;

        if (!fullName || !email || !address) {
            return res.status(400).json({ error: 'Musteri bilgileri eksik.' });
        }

        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ error: 'Sepet bos olamaz.' });
        }

        const user = getUserFromRequestIfAny(req);
        const userId = user ? user.id : null;

        const idempotencyKey = readIdempotencyKey(req) || createDeterministicKeyFromBody(req.body);

        const existingPayment = await client.query(
            `SELECT p.*, o.id AS order_id
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.idempotency_key = $1`,
            [idempotencyKey]
        );

        if (existingPayment.rows.length > 0) {
            const row = existingPayment.rows[0];
            return res.status(200).json({
                message: 'Idempotent tekrar istegi, mevcut odeme donuldu.',
                orderId: row.order_id,
                paymentRef: row.payment_ref,
                paymentStatus: row.status,
                provider: row.provider,
                idempotencyKey,
                reused: true
            });
        }

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

        let paymentProvider = 'iyzico';
        let paymentRef = null;
        let paymentStatus = PAYMENT_STATUS.REQUIRES_ACTION;
        let providerResponse = null;

        if (paymentMethod === 'havale') {
            paymentProvider = 'bank_transfer';
            paymentRef = `HVL-${order.id}-${Date.now()}`;
            paymentStatus = PAYMENT_STATUS.WAITING_TRANSFER;
            providerResponse = {
                accountName: process.env.HAVALE_ACCOUNT_NAME || 'NovaStore Elektronik',
                iban: process.env.HAVALE_IBAN || 'TR00 0000 0000 0000 0000 0000 00',
                dueHours: 24
            };
        } else {
            const iyzicoInit = await initializeIyzicoPayment({
                orderId: order.id,
                amount: pricing.totals.total,
                currency: pricing.totals.currency
            });
            paymentRef = iyzicoInit.paymentRef;
            paymentStatus = PAYMENT_STATUS.REQUIRES_ACTION;
            providerResponse = iyzicoInit;
        }

        await client.query(
            `INSERT INTO payments
                (order_id, provider, idempotency_key, payment_ref, amount, currency, status, raw_request, raw_response)
             VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
            [
                order.id,
                paymentProvider,
                idempotencyKey,
                paymentRef,
                pricing.totals.total,
                pricing.totals.currency,
                paymentStatus,
                JSON.stringify({ paymentMethod, couponCode }),
                JSON.stringify(providerResponse || {})
            ]
        );

        await client.query(
            `UPDATE orders
             SET payment_ref = $1,
                 payment_status = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [paymentRef, paymentStatus, order.id]
        );

        await appendOrderEvent(client, order.id, 'PAYMENT_INITIALIZED', 'Odeme baslatildi.', {
            provider: paymentProvider,
            paymentRef,
            idempotencyKey,
            paymentStatus
        });

        await client.query('COMMIT');

        const { io } = require('../server');
        if (userId) {
            await createNotification(
                userId,
                'order_update',
                `Siparis #${order.id} icin odeme adimi baslatildi.`,
                io
            );
        }

        await createNotification(
            null,
            'new_order',
            `Yeni siparis olusturuldu (#${order.id}). Odeme adimi: ${paymentMethod}.`,
            io
        );

        res.status(201).json({
            orderId: order.id,
            paymentRef,
            paymentStatus,
            provider: paymentProvider,
            idempotencyKey,
            totals: pricing.totals,
            campaigns: pricing.campaigns,
            coupon: pricing.coupon,
            paymentAction: providerResponse,
            message: paymentMethod === 'havale'
                ? 'Havale bilgileri olusturuldu. Odeme bekleniyor.'
                : '3D odeme adimi baslatildi.'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Odeme initialize hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Odeme baslatilamadi.' });
    } finally {
        client.release();
    }
};

const webhookIyzico = async (req, res) => {
    const client = await pool.connect();

    try {
        const payload = req.body || {};
        const eventId = String(payload.eventId || payload.conversationId || payload.paymentRef || '').trim();
        const paymentRef = String(payload.paymentRef || '').trim();
        const rawStatus = String(payload.status || '').toUpperCase();

        if (!eventId || !paymentRef || !rawStatus) {
            return res.status(400).json({ error: 'eventId, paymentRef ve status zorunludur.' });
        }

        const signature = req.headers['x-iyzico-signature'];
        const signatureSecret = process.env.IYZICO_WEBHOOK_SECRET || '';
        const signatureValid = signatureSecret ? verifyWebhookSignature(payload, signature, signatureSecret) : true;

        await client.query('BEGIN');

        const webhookInsert = await client.query(
            `INSERT INTO webhook_events (provider, external_event_id, signature_valid, payload, processed)
             VALUES ('iyzico', $1, $2, $3::jsonb, FALSE)
             ON CONFLICT (external_event_id)
             DO UPDATE SET external_event_id = EXCLUDED.external_event_id
             RETURNING id, processed`,
            [eventId, signatureValid, JSON.stringify(payload)]
        );

        const webhookRow = webhookInsert.rows[0];

        if (!signatureValid) {
            await client.query('ROLLBACK');
            return res.status(401).json({ error: 'Webhook imza dogrulamasi basarisiz.' });
        }

        const paymentResult = await client.query(
            `SELECT p.*, o.items, o.user_id, o.id AS order_id, o.status AS order_status
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.payment_ref = $1`,
            [paymentRef]
        );

        if (paymentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Odeme kaydi bulunamadi.' });
        }

        const payment = paymentResult.rows[0];
        const isSuccess = rawStatus === 'SUCCESS' || rawStatus === 'PAID';

        if (isSuccess) {
            await client.query(
                `UPDATE payments
                 SET status = $1,
                     external_ref = $2,
                     raw_response = COALESCE(raw_response, '{}'::jsonb) || $3::jsonb,
                     updated_at = NOW()
                 WHERE id = $4`,
                [PAYMENT_STATUS.PAID, payload.providerTransactionId || null, JSON.stringify(payload), payment.id]
            );

            await client.query(
                `UPDATE orders
                 SET payment_status = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.PAID, ORDER_STATUS.HAZIRLANIYOR, payment.order_id]
            );

            await appendOrderEvent(client, payment.order_id, 'PAYMENT_SUCCESS', 'Odeme basarili.', {
                provider: 'iyzico',
                eventId,
                paymentRef
            });
        } else {
            await client.query(
                `UPDATE payments
                 SET status = $1,
                     raw_response = COALESCE(raw_response, '{}'::jsonb) || $2::jsonb,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.FAILED, JSON.stringify(payload), payment.id]
            );

            await client.query(
                `UPDATE orders
                 SET payment_status = $1,
                     status = $2,
                     cancel_reason = COALESCE($3, cancel_reason),
                     refund_status = $4,
                     updated_at = NOW()
                 WHERE id = $5`,
                [
                    PAYMENT_STATUS.FAILED,
                    ORDER_STATUS.IPTAL_EDILDI,
                    payload.reason || 'Odeme basarisiz',
                    REFUND_STATUS.NONE,
                    payment.order_id
                ]
            );

            let parsedItems = [];
            try {
                parsedItems = Array.isArray(payment.items) ? payment.items : JSON.parse(payment.items || '[]');
            } catch (_) {
                parsedItems = [];
            }
            await restockItems(client, parsedItems);

            await appendOrderEvent(client, payment.order_id, 'PAYMENT_FAILED', 'Odeme basarisiz.', {
                provider: 'iyzico',
                eventId,
                paymentRef,
                reason: payload.reason || null
            });
        }

        await client.query(
            'UPDATE webhook_events SET processed = TRUE WHERE id = $1',
            [webhookRow.id]
        );

        await client.query('COMMIT');

        const { io } = require('../server');
        if (payment.user_id) {
            await createNotification(
                payment.user_id,
                'order_update',
                isSuccess
                    ? `Siparis #${payment.order_id} odemesi basariyla alindi.`
                    : `Siparis #${payment.order_id} odemesi basarisiz oldu.`,
                io
            );
        }

        res.status(200).json({ ok: true, processed: true, status: isSuccess ? 'PAID' : 'FAILED' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Iyzico webhook hatasi:', err.message);
        res.status(500).json({ error: err.message || 'Webhook islenemedi.' });
    } finally {
        client.release();
    }
};

module.exports = {
    initializePayment,
    webhookIyzico
};
