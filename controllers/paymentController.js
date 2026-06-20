const crypto = require('crypto');
const pool = require('../config/db');
const { getUserFromRequestIfAny } = require('../middlewares/authMiddleware');
const { createNotification } = require('./notificationController');
const { initializeIyzicoPayment, verifyWebhookSignature } = require('../services/paymentProviderService');
const { createPendingPaymentOrder, reserveStock, restockItems, appendOrderEvent } = require('../services/orderService');
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

const safeJsonParse = (value, fallback = {}) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
};

const buildPaymentStatusResponse = (row) => {
    const paymentStatus = row.payment_status || row.status;
    const orderStatus = row.order_status;
    const provider = row.provider || null;
    const isPaid = paymentStatus === PAYMENT_STATUS.PAID;
    const isFailed = paymentStatus === PAYMENT_STATUS.FAILED;
    const isRefunded = paymentStatus === PAYMENT_STATUS.REFUNDED;
    const isWaitingTransfer = paymentStatus === PAYMENT_STATUS.WAITING_TRANSFER || provider === 'bank_transfer';
    const finalized = isPaid || isFailed || isRefunded;

    let message = '\u00D6deme durumunuz kontrol ediliyor.';
    let nextAction = 'CHECK_ORDERS';

    if (isPaid) {
        message = '\u00D6demeniz onayland\u0131. Sipari\u015Finiz haz\u0131rlan\u0131yor.';
        nextAction = 'VIEW_ORDER';
    } else if (isFailed) {
        message = '\u00D6deme tamamlanamad\u0131. Sepetiniz korunur, dilerseniz tekrar deneyebilirsiniz.';
        nextAction = 'RETRY_PAYMENT';
    } else if (isRefunded) {
        message = '\u00D6demeniz iade edildi.';
        nextAction = 'VIEW_ORDER';
    } else if (isWaitingTransfer) {
        message = 'Havale/EFT bilgileri olu\u015Fturuldu. \u00D6demeniz onayland\u0131\u011F\u0131nda sipari\u015Finiz i\u015Fleme al\u0131nacak.';
        nextAction = 'WAIT_TRANSFER';
    } else if (paymentStatus === PAYMENT_STATUS.REQUIRES_ACTION) {
        message = '\u00D6deme do\u011Frulamas\u0131 bekleniyor. Banka onay\u0131 tamamland\u0131\u011F\u0131nda sipari\u015Finiz kesinle\u015Fecek.';
        nextAction = 'WAIT_PROVIDER_CONFIRMATION';
    }

    return {
        orderId: row.order_id,
        paymentRef: row.payment_ref,
        paymentStatus,
        orderStatus,
        provider,
        finalized,
        message,
        nextAction
    };
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
            return res.status(400).json({ error: 'M\u00FC\u015Fteri bilgileri eksik.' });
        }

        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ error: 'Sepet bo\u015F olamaz.' });
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
                message: 'Idempotent tekrar iste\u011Fi, mevcut \u00F6deme d\u00F6n\u00FCld\u00FC.',
                orderId: row.order_id,
                paymentRef: row.payment_ref,
                paymentStatus: row.status,
                provider: row.provider,
                idempotencyKey,
                reused: true
            });
        }

        await client.query('BEGIN');

        const { order, pricing } = await createPendingPaymentOrder({
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

        let paymentProvider = 'iyzico';
        let paymentRef = null;
        let paymentStatus = PAYMENT_STATUS.REQUIRES_ACTION;
        let providerResponse = null;

        if (paymentMethod === 'havale') {
            paymentProvider = 'bank_transfer';
            paymentRef = `HVL-${order.id}-${crypto.randomBytes(6).toString('hex')}`;
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
                JSON.stringify({
                    paymentMethod,
                    couponCode,
                    coupon: pricing.coupon,
                    stockReserved: false,
                    finalizesOnWebhook: true
                }),
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

        await appendOrderEvent(client, order.id, 'PAYMENT_INITIALIZED', '\u00D6deme ba\u015Flat\u0131ld\u0131.', {
            provider: paymentProvider,
            paymentRef,
            idempotencyKey,
            paymentStatus
        });

        await client.query('COMMIT');

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
                ? 'Havale bilgileri olu\u015Fturuldu. \u00D6deme bekleniyor.'
                : '3D \u00F6deme ad\u0131m\u0131 ba\u015Flat\u0131ld\u0131.'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('\u00D6deme initialize hatas\u0131:', err.message);
        res.status(500).json({ error: err.message || '\u00D6deme ba\u015Flat\u0131lamad\u0131.' });
    } finally {
        client.release();
    }
};

const getPaymentStatus = async (req, res) => {
    try {
        const paymentRef = String(req.query.paymentRef || '').trim();
        const orderId = Number(req.query.orderId || 0);
        const userId = Number(req.user && req.user.id);

        if (!paymentRef || !Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({ error: 'paymentRef ve orderId zorunludur.' });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const paymentResult = await pool.query(
            `SELECT p.payment_ref,
                    p.status AS payment_status,
                    p.provider,
                    o.id AS order_id,
                    o.status AS order_status,
                    o.user_id AS order_user_id
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.payment_ref = $1
               AND o.id = $2
             LIMIT 1`,
            [paymentRef, orderId]
        );

        if (paymentResult.rows.length === 0) {
            return res.status(404).json({ error: '\u00D6deme kayd\u0131 bulunamad\u0131.' });
        }

        const paymentRow = paymentResult.rows[0];
        const ownerUserId = paymentRow.order_user_id === null || paymentRow.order_user_id === undefined
            ? null
            : Number(paymentRow.order_user_id);

        if (!Number.isInteger(ownerUserId) || ownerUserId <= 0 || ownerUserId !== userId) {
            return res.status(404).json({ error: '\u00D6deme kayd\u0131 bulunamad\u0131.' });
        }

        res.status(200).json(buildPaymentStatusResponse(paymentRow));
    } catch (err) {
        console.error('\u00D6deme durum kontrol hatas\u0131:', err.message);
        res.status(500).json({ error: err.message || '\u00D6deme durumu kontrol edilemedi.' });
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

        const signature = String(req.headers['x-iyzico-signature'] || '').trim();
        const signatureSecret = String(process.env.IYZICO_WEBHOOK_SECRET || '').trim();
        const isProductionWebhook = process.env.NODE_ENV === 'production';

        if (isProductionWebhook && !signatureSecret) {
            return res.status(503).json({ error: 'Webhook imza anahtar\u0131 production ortam\u0131nda yap\u0131land\u0131r\u0131lmal\u0131d\u0131r.' });
        }

        if (isProductionWebhook && !signature) {
            return res.status(401).json({ error: 'Production ortam\u0131nda imzas\u0131z \u00F6deme webhook iste\u011Fi kabul edilmez.' });
        }

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
            return res.status(401).json({ error: 'Webhook imza do\u011Frulamas\u0131 ba\u015Far\u0131s\u0131z.' });
        }

        if (webhookRow.processed === true) {
            await client.query('COMMIT');
            return res.status(200).json({ ok: true, processed: true, duplicate: true });
        }

        const paymentResult = await client.query(
            `SELECT p.*, o.items, o.user_id, o.customer_name, o.id AS order_id, o.status AS order_status
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.payment_ref = $1`,
            [paymentRef]
        );

        if (paymentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '\u00D6deme kayd\u0131 bulunamad\u0131.' });
        }

        const payment = paymentResult.rows[0];
        const rawRequest = safeJsonParse(payment.raw_request, {});
        const parsedItemsRaw = safeJsonParse(payment.items, []);
        const parsedItems = Array.isArray(parsedItemsRaw) ? parsedItemsRaw : [];
        const stockWasReserved = rawRequest.stockReserved === true || rawRequest.finalizesOnWebhook !== true;
        const isSuccess = rawStatus === 'SUCCESS' || rawStatus === 'PAID';

        if (isSuccess) {
            if (!stockWasReserved) {
                await reserveStock(client, parsedItems);
            }

            await client.query(
                `UPDATE payments
                 SET status = $1,
                     external_ref = $2,
                     raw_response = COALESCE(raw_response, '{}'::jsonb) || $3::jsonb,
                     raw_request = COALESCE(raw_request, '{}'::jsonb) || $4::jsonb,
                     updated_at = NOW()
                 WHERE id = $5`,
                [
                    PAYMENT_STATUS.PAID,
                    payload.providerTransactionId || null,
                    JSON.stringify(payload),
                    JSON.stringify({ stockReserved: true, finalizedAt: new Date().toISOString() }),
                    payment.id
                ]
            );

            await incrementCouponUsageIfNeeded(client, rawRequest.coupon);

            await client.query(
                `UPDATE orders
                 SET payment_status = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.PAID, ORDER_STATUS.HAZIRLANIYOR, payment.order_id]
            );

            await appendOrderEvent(client, payment.order_id, 'PAYMENT_SUCCESS', '\u00D6deme ba\u015Far\u0131l\u0131.', {
                provider: 'iyzico',
                eventId,
                paymentRef,
                stockReservedBeforeWebhook: stockWasReserved
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
                    payload.reason || '\u00D6deme ba\u015Far\u0131s\u0131z',
                    REFUND_STATUS.NONE,
                    payment.order_id
                ]
            );

            if (stockWasReserved) {
                await restockItems(client, parsedItems);
            }

            await appendOrderEvent(client, payment.order_id, 'PAYMENT_FAILED', '\u00D6deme ba\u015Far\u0131s\u0131z.', {
                provider: 'iyzico',
                eventId,
                paymentRef,
                reason: payload.reason || null,
                stockReservedBeforeWebhook: stockWasReserved
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
                    ? `Sipari\u015F #${payment.order_id} \u00F6demesi ba\u015Far\u0131yla al\u0131nd\u0131.`
                    : `Sipari\u015F #${payment.order_id} \u00F6demesi ba\u015Far\u0131s\u0131z oldu.`,
                io
            );
        }

        if (isSuccess) {
            await createNotification(
                null,
                'new_order',
                `Yeni sipari\u015F kesinle\u015Fti (#${payment.order_id}). M\u00FC\u015Fteri: ${payment.customer_name || 'Bilinmiyor'}`,
                io
            );
        }

        res.status(200).json({ ok: true, processed: true, status: isSuccess ? 'PAID' : 'FAILED' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Iyzico webhook hatas\u0131:', err.message);
        res.status(500).json({ error: err.message || 'Webhook i\u015Flenemedi.' });
    } finally {
        client.release();
    }
};

module.exports = {
    buildPaymentStatusResponse,
    getPaymentStatus,
    initializePayment,
    webhookIyzico
};
