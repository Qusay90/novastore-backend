const crypto = require('crypto');
const pool = require('../config/db');
const { getUserFromRequestIfAny, sendAuthError } = require('../middlewares/authMiddleware');
const { createNotification } = require('./notificationController');
const { initializeIyzicoPayment, verifyWebhookSignature } = require('../services/paymentProviderService');
const {
    PaymentProviderConfigError,
    assertPaytrEnvReady,
    getPaymentProviderName
} = require('../config/paymentProviderConfig');
const {
    buildMockPaytrTokenResponse,
    buildPaytrIframeUrl,
    buildPaytrTokenPayload,
    verifyPaytrCallbackHash
} = require('../services/paytrPaymentService');
const {
    createPendingPaymentOrder,
    reserveStock,
    releaseStockReservation,
    appendOrderEvent,
    syncOrderItemsForOrder
} = require('../services/orderService');
const { consumeCouponUsageIfNeeded } = require('../services/couponUsageService');
const { PAYMENT_STATUS, ORDER_STATUS, REFUND_STATUS } = require('../constants/orderStatus');
const {
    PAYMENT_CALLBACK_DECISION,
    PAYMENT_CALLBACK_OUTCOME,
    planPaymentCallback
} = require('../services/paymentCallbackPolicy');
const {
    STOCK_RESERVATION_STATE,
    getStockReservationState
} = require('../services/orderLifecyclePolicy');
const {
    ExternalSideEffectBlockedError,
    assertExternalSideEffectAllowed
} = require('../config/stagingRuntimePolicy');

const rejectBlockedExternalSideEffect = (res, effect) => {
    try {
        assertExternalSideEffectAllowed(effect);
        return false;
    } catch (error) {
        if (!(error instanceof ExternalSideEffectBlockedError)) throw error;
        res.status(error.statusCode).json({
            code: error.code,
            error: error.publicMessage
        });
        return true;
    }
};

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

const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .filter((key) => value[key] !== undefined)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(',')}}`;
    }

    return JSON.stringify(value === undefined ? null : value);
};

const hashIdempotencyPart = (value) => (
    crypto.createHash('sha256').update(String(value || '')).digest('hex')
);

const normalizeIdempotencyBody = (body = {}) => ({
    analyticsSessionKey: String(body.analyticsSessionKey || '').trim(),
    fullName: String(body.fullName || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    address: body.address,
    cartItems: Array.isArray(body.cartItems) ? body.cartItems : [],
    couponCode: body.couponCode || null,
    paymentMethod: body.paymentMethod || 'card'
});

const buildPaymentIdempotencyContext = ({ body = {}, userId = null, idempotencyKey }) => {
    const normalizedBody = normalizeIdempotencyBody(body);
    const ownerSeed = userId
        ? `user:${Number(userId)}`
        : `guest:${normalizedBody.analyticsSessionKey || normalizedBody.email}`;

    return {
        key: idempotencyKey,
        ownerKey: hashIdempotencyPart(ownerSeed),
        requestHash: hashIdempotencyPart(stableStringify(normalizedBody))
    };
};

const readStoredIdempotencyContext = (rawRequest) => {
    const parsed = safeJsonParse(rawRequest, {});
    const stored = parsed && typeof parsed === 'object' ? parsed.idempotency : null;
    return stored && typeof stored === 'object' ? stored : null;
};

const idempotencyContextMatches = (storedContext, expectedContext) => (
    storedContext &&
    storedContext.key === expectedContext.key &&
    storedContext.ownerKey === expectedContext.ownerKey &&
    storedContext.requestHash === expectedContext.requestHash
);

const readClientIp = (req) => {
    const forwardedFor = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
    return forwardedFor || req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
};

const truthyEnvValues = new Set(['1', 'true', 'yes', 'on']);

const isTruthyEnv = (value) => truthyEnvValues.has(String(value || '').trim().toLowerCase());

const isUnsignedIyzicoWebhookMockAllowed = () => (
    process.env.NODE_ENV !== 'production' &&
    isTruthyEnv(process.env.IYZICO_ALLOW_UNSIGNED_WEBHOOKS)
);

const safeJsonParse = (value, fallback = {}) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
};

const normalizePaytrCallbackPayload = (payload = {}) => ({
    merchant_oid: String(payload.merchant_oid || '').trim(),
    status: String(payload.status || '').trim(),
    total_amount: String(payload.total_amount || '').trim(),
    hash: String(payload.hash || '').trim(),
    failed_reason_code: String(payload.failed_reason_code || '').trim() || null,
    failed_reason_msg: String(payload.failed_reason_msg || '').trim() || null
});

const toPaytrMinorUnits = (amount) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;
    return Math.round((numericAmount + Number.EPSILON) * 100);
};

const toComparableMoney = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.round((numeric + Number.EPSILON) * 100);
};

const readIyzicoPayloadAmount = (payload = {}) => (
    payload.paidPrice ??
    payload.price ??
    payload.amount ??
    payload.totalAmount ??
    payload.total_amount ??
    null
);

const readIyzicoPayloadCurrency = (payload = {}) => String(
    payload.currency ?? payload.currencyCode ?? payload.currency_code ?? ''
).trim().toUpperCase();

const PAYTR_FAILED_STATUSES = new Set([
    'failed',
    'fail',
    'cancel',
    'canceled',
    'cancelled',
    'declined',
    'timeout',
    'expired',
    'error'
]);

const IYZICO_SUCCESS_STATUSES = new Set(['SUCCESS', 'PAID']);
const IYZICO_FAILED_STATUSES = new Set(['FAILURE', 'FAILED']);

const isPaytrFailedStatus = (status) => PAYTR_FAILED_STATUSES.has(String(status || '').trim().toLowerCase());

const buildPaytrWebhookEventId = (merchantOid, callbackOutcome) => {
    const paymentRefHash = crypto.createHash('sha256').update(String(merchantOid || '')).digest('hex');
    return `paytr:${paymentRefHash}:${String(callbackOutcome || '').toLowerCase()}`;
};

const buildIyzicoWebhookEventId = (paymentRef, providerEventId, callbackOutcome) => {
    const eventKeyHash = crypto.createHash('sha256').update(stableStringify({
        paymentRef: String(paymentRef || ''),
        providerEventId: String(providerEventId || ''),
        callbackOutcome: String(callbackOutcome || '').toUpperCase()
    })).digest('hex');
    return `iyzico:${eventKeyHash}`;
};

const lockPaymentAndOrderByRef = async (client, paymentRef) => {
    const paymentResult = await client.query(
        `WITH locked_order AS MATERIALIZED (
             SELECT o.*
             FROM orders o
             WHERE o.id = (
                 SELECT payment_lookup.order_id
                 FROM payments payment_lookup
                 WHERE payment_lookup.payment_ref = $1
                 LIMIT 1
             )
             FOR UPDATE OF o
         )
         SELECT p.*,
                o.items,
                o.user_id,
                o.customer_name,
                o.id AS order_id,
                o.status AS order_status,
                o.payment_status AS order_payment_status,
                o.refund_status AS order_refund_status,
                o.total_amount AS order_total_amount
         FROM locked_order o
         JOIN payments p ON p.order_id = o.id
         WHERE p.payment_ref = $1
         FOR UPDATE OF p`,
        [paymentRef]
    );

    return paymentResult.rows[0] || null;
};

const duplicatePaymentDecisions = new Set([
    PAYMENT_CALLBACK_DECISION.DUPLICATE_PAID,
    PAYMENT_CALLBACK_DECISION.DUPLICATE_FAILED,
    PAYMENT_CALLBACK_DECISION.DUPLICATE_REFUNDED
]);

const isDuplicatePaymentDecision = (decision) => duplicatePaymentDecisions.has(decision);

const redactPaymentSecretText = (value = '') => {
    let text = String(value || '');
    for (const secret of [
        process.env.PAYTR_MERCHANT_KEY,
        process.env.PAYTR_MERCHANT_SALT,
        process.env.IYZICO_WEBHOOK_SECRET
    ]) {
        const secretText = String(secret || '').trim();
        if (secretText) {
            text = text.split(secretText).join('[REDACTED]');
        }
    }
    return text;
};

const createPaymentNotificationSafely = async (provider, userId, type, message) => {
    try {
        const { io } = require('../server');
        await createNotification(userId, type, message, io);
    } catch (err) {
        console.error(`${provider} notification dispatch failed:`, redactPaymentSecretText(err.message));
    }
};

const persistOpenPaymentReconciliation = async ({
    client,
    payment,
    plan,
    provider,
    providerEventId,
    paymentRef
}) => {
    if (!plan.reconciliationRequired) return null;

    const openedAt = new Date().toISOString();
    const taskId = `PAYREC-${crypto.createHash('sha256').update(stableStringify({
        provider,
        paymentId: payment.id,
        paymentRef,
        providerEventId,
        callbackOutcome: plan.callbackOutcome,
        decision: plan.decision
    })).digest('hex').slice(0, 24)}`;
    const reconciliationTask = {
        taskId,
        type: 'PAYMENT_RECONCILIATION',
        status: 'OPEN',
        reasonCode: plan.reconciliationReason || 'PAYMENT_STATE_REVIEW',
        decision: plan.decision,
        provider,
        providerEventId: String(providerEventId || ''),
        paymentRef: String(paymentRef || ''),
        callbackOutcome: plan.callbackOutcome,
        openedAt
    };

    await client.query(
        `UPDATE payments
         SET raw_request = COALESCE(raw_request, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [
            JSON.stringify({
                reconciliationRequired: true,
                reconciliationReason: reconciliationTask.reasonCode,
                reconciliationRecordedAt: openedAt,
                reconciliationTask
            }),
            payment.id
        ]
    );

    await appendOrderEvent(
        client,
        payment.order_id,
        'PAYMENT_RECONCILIATION_REQUIRED',
        'Ödeme mutabakat görevi açıldı.',
        reconciliationTask
    );

    const notificationResult = await client.query(
        `INSERT INTO notifications (user_id, type, message)
         VALUES (NULL, $1, $2)
         RETURNING id`,
        [
            'order_update',
            `Aksiyon gerekli: Sipariş #${payment.order_id} için ödeme mutabakatı açık (${reconciliationTask.reasonCode}, ${taskId}).`
        ]
    );

    return {
        ...reconciliationTask,
        notificationId: notificationResult.rows[0]?.id || null
    };
};

const buildPaymentStatusResponse = (row) => {
    const paymentStatus = row.payment_status || row.status;
    const orderStatus = row.order_status;
    const refundStatus = row.refund_status || REFUND_STATUS.NONE;
    const paymentMetadata = safeJsonParse(row.raw_request, {});
    const provider = row.provider || null;
    const isPaid = paymentStatus === PAYMENT_STATUS.PAID;
    const isFailed = paymentStatus === PAYMENT_STATUS.FAILED;
    const isRefunded = paymentStatus === PAYMENT_STATUS.REFUNDED;
    const isWaitingTransfer = paymentStatus === PAYMENT_STATUS.WAITING_TRANSFER || provider === 'bank_transfer';
    const providerFinalized = isPaid || isFailed || isRefunded;
    const refundReviewPending = isPaid && [
        REFUND_STATUS.REQUESTED,
        REFUND_STATUS.IN_REVIEW,
        REFUND_STATUS.APPROVED,
        REFUND_STATUS.PENDING
    ].includes(refundStatus);
    const reconciliationTask = paymentMetadata && typeof paymentMetadata.reconciliationTask === 'object'
        ? paymentMetadata.reconciliationTask
        : null;
    const paymentReconciliationPending = reconciliationTask
        ? String(reconciliationTask.status || '').trim().toUpperCase() === 'OPEN'
        : paymentMetadata.reconciliationRequired === true;
    const commerceFinalized = providerFinalized && !refundReviewPending && !paymentReconciliationPending;

    let message = '\u00D6deme durumunuz kontrol ediliyor.';
    let nextAction = 'CHECK_ORDERS';

    if (refundReviewPending) {
        message = '\u00D6deme al\u0131nd\u0131; geri \u00F6deme incelemesi bekleniyor.';
        nextAction = 'WAIT_REFUND_REVIEW';
    } else if (paymentReconciliationPending) {
        message = isFailed
            ? '\u00D6deme sa\u011Flay\u0131c\u0131 sonucu ba\u015Far\u0131s\u0131z; sipari\u015F ve \u00F6deme kay\u0131tlar\u0131 manuel mutabakat bekliyor. Sepetiniz korunur.'
            : isRefunded
                ? '\u00D6deme iade durumunda; ge\u00E7 sa\u011Flay\u0131c\u0131 bildirimi manuel mutabakat bekliyor.'
                : isPaid
                    ? '\u00D6demeniz al\u0131nd\u0131; sipari\u015F kayd\u0131 operasyonel mutabakat bekliyor. Ayn\u0131 \u00F6demeyi tekrar denemeyin.'
                    : '\u00D6deme sonucu operasyonel mutabakat bekliyor. Sepetiniz korunur.';
        nextAction = 'WAIT_RECONCILIATION';
    } else if (isPaid) {
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
        refundStatus,
        provider,
        finalized: providerFinalized,
        providerFinalized,
        commerceFinalized,
        reconciliationRequired: refundReviewPending || paymentReconciliationPending,
        reconciliationReason: paymentReconciliationPending
            ? (reconciliationTask?.reasonCode || paymentMetadata.reconciliationReason || null)
            : null,
        message,
        nextAction
    };
};

const finalizePaytrCallback = async (payload, callbackOutcome) => {
    const client = await pool.connect();
    const eventId = buildPaytrWebhookEventId(payload.merchant_oid, callbackOutcome);
    let payment = null;

    try {
        await client.query('BEGIN');

        const webhookInsert = await client.query(
            `INSERT INTO webhook_events (provider, external_event_id, signature_valid, payload, processed)
             VALUES ('paytr', $1, TRUE, $2::jsonb, FALSE)
             ON CONFLICT (external_event_id)
             DO UPDATE SET external_event_id = EXCLUDED.external_event_id
             RETURNING id, processed`,
            [eventId, JSON.stringify(payload)]
        );
        const webhookRow = webhookInsert.rows[0];

        if (webhookRow.processed === true) {
            await client.query('COMMIT');
            return { duplicate: true, payment: null, decision: null, reconciliationRequired: false };
        }

        payment = await lockPaymentAndOrderByRef(client, payload.merchant_oid);
        if (!payment) {
            await client.query('ROLLBACK');
            const err = new Error('PayTR payment record not found.');
            err.statusCode = 404;
            throw err;
        }

        if (payment.provider !== 'paytr' || payment.payment_ref !== payload.merchant_oid) {
            await client.query('ROLLBACK');
            const err = new Error('PayTR payment provider mismatch.');
            err.statusCode = 409;
            throw err;
        }

        const expectedAmount = toPaytrMinorUnits(payment.amount || payment.order_total_amount);
        const callbackAmount = Number(payload.total_amount);
        if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== callbackAmount) {
            await client.query('ROLLBACK');
            const err = new Error('PayTR payment amount mismatch.');
            err.statusCode = 409;
            throw err;
        }

        const stockReservationState = getStockReservationState(payment);
        const plan = planPaymentCallback({
            paymentStatus: payment.status,
            orderStatus: payment.order_status,
            callbackOutcome,
            stockReservationState
        });
        const rawRequest = safeJsonParse(payment.raw_request, {});
        const parsedItemsRaw = safeJsonParse(payment.items, []);
        const parsedItems = Array.isArray(parsedItemsRaw) ? parsedItemsRaw : [];
        const failedReason = [payload.failed_reason_code, payload.failed_reason_msg]
            .filter(Boolean)
            .join(' - ') || 'PayTR payment failed';

        if (plan.decision === PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE) {
            if (plan.reserveStock) {
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
                    payload.merchant_oid,
                    JSON.stringify(payload),
                    JSON.stringify({ stockReserved: true, finalizedAt: new Date().toISOString() }),
                    payment.id
                ]
            );

            await consumeCouponUsageIfNeeded(client, rawRequest.coupon);
            await client.query(
                `UPDATE orders
                 SET payment_status = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.PAID, ORDER_STATUS.HAZIRLANIYOR, payment.order_id]
            );
            await syncOrderItemsForOrder(client, payment.order_id, parsedItems);
            await appendOrderEvent(client, payment.order_id, 'PAYMENT_SUCCESS', 'Ödeme başarılı.', {
                provider: 'paytr',
                eventId,
                paymentRef: payload.merchant_oid,
                stockReservationStateBeforeWebhook: stockReservationState
            });
        } else if (plan.decision === PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION) {
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
                    payload.merchant_oid,
                    JSON.stringify(payload),
                    JSON.stringify({
                        reconciliationRequired: true,
                        reconciliationReason: plan.reconciliationReason,
                        reconciliationRecordedAt: new Date().toISOString()
                    }),
                    payment.id
                ]
            );
            if (plan.targetRefundStatus) {
                await client.query(
                    `UPDATE orders
                     SET payment_status = $1,
                         refund_status = $2,
                         updated_at = NOW()
                     WHERE id = $3`,
                    [PAYMENT_STATUS.PAID, plan.targetRefundStatus, payment.order_id]
                );
            } else {
                await client.query(
                    `UPDATE orders
                     SET payment_status = $1,
                         updated_at = NOW()
                     WHERE id = $2`,
                    [PAYMENT_STATUS.PAID, payment.order_id]
                );
            }
            await appendOrderEvent(
                client,
                payment.order_id,
                'PAYMENT_CAPTURE_RECONCILIATION',
                plan.targetRefundStatus
                    ? 'Ödeme alındı; sipariş işleme alınmadan geri ödeme incelemesine yönlendirildi.'
                    : 'Ödeme alındı; sipariş durumu korunarak manuel uzlaştırma kaydı oluşturuldu.',
                {
                    provider: 'paytr',
                    eventId,
                    paymentRef: payload.merchant_oid,
                    previousPaymentStatus: payment.status,
                    orderStatusPreserved: payment.order_status,
                    reason: plan.reconciliationReason,
                    commerceSideEffectsApplied: false,
                    stockReservationState,
                    refundStatusChangedTo: plan.targetRefundStatus
                }
            );
        } else if (
            plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE ||
            plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER
        ) {
            await client.query(
                `UPDATE payments
                 SET status = $1,
                     raw_response = COALESCE(raw_response, '{}'::jsonb) || $2::jsonb,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.FAILED, JSON.stringify(payload), payment.id]
            );

            if (plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE) {
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
                        failedReason,
                        REFUND_STATUS.NONE,
                        payment.order_id
                    ]
                );
            } else {
                await client.query(
                    `UPDATE orders
                     SET payment_status = $1,
                         updated_at = NOW()
                     WHERE id = $2`,
                    [PAYMENT_STATUS.FAILED, payment.order_id]
                );
            }

            if (plan.releaseStockReservation) {
                await releaseStockReservation({
                    client,
                    payment,
                    items: parsedItems,
                    reasonCode: 'PAYMENT_CALLBACK_FAILED'
                });
            }

            await appendOrderEvent(
                client,
                payment.order_id,
                plan.reconciliationRequired
                    ? 'PAYMENT_FAILURE_RECONCILIATION'
                    : 'PAYMENT_FAILED',
                'PayTR payment failed.',
                {
                    provider: 'paytr',
                    eventId,
                    paymentRef: payload.merchant_oid,
                    reasonCode: payload.failed_reason_code || null,
                    reasonMessage: payload.failed_reason_msg || null,
                    orderStatusPreserved: plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER
                        ? payment.order_status
                        : null,
                    stockReservationStateBeforeWebhook: stockReservationState,
                    stockReservationReleased: plan.releaseStockReservation,
                    reconciliationReason: plan.reconciliationReason
                }
            );
        } else if (plan.decision === PAYMENT_CALLBACK_DECISION.STALE_FAILURE) {
            await appendOrderEvent(client, payment.order_id, 'PAYMENT_STALE_FAILURE_IGNORED', 'Geç ödeme başarısızlığı yok sayıldı.', {
                provider: 'paytr',
                eventId,
                paymentRef: payload.merchant_oid,
                authoritativePaymentStatus: payment.status
            });
        } else if (plan.decision === PAYMENT_CALLBACK_DECISION.REFUNDED_CAPTURE_CONFLICT) {
            await appendOrderEvent(client, payment.order_id, 'PAYMENT_REFUNDED_CAPTURE_CONFLICT', 'İade edilmiş ödeme için geç başarı callback’i alındı.', {
                provider: 'paytr',
                eventId,
                paymentRef: payload.merchant_oid,
                authoritativePaymentStatus: payment.status
            });
        }

        await persistOpenPaymentReconciliation({
            client,
            payment,
            plan,
            provider: 'paytr',
            providerEventId: eventId,
            paymentRef: payload.merchant_oid
        });

        await client.query('UPDATE webhook_events SET processed = TRUE WHERE id = $1', [webhookRow.id]);
        await client.query('COMMIT');

        return {
            duplicate: isDuplicatePaymentDecision(plan.decision),
            payment,
            decision: plan.decision,
            reconciliationRequired: plan.reconciliationRequired
        };
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}
        throw err;
    } finally {
        client.release();
    }
};

const finalizePaytrSuccess = (payload) => finalizePaytrCallback(payload, PAYMENT_CALLBACK_OUTCOME.SUCCESS);
const finalizePaytrFailure = (payload) => finalizePaytrCallback(payload, PAYMENT_CALLBACK_OUTCOME.FAILURE);

const webhookPaytr = async (req, res) => {
    if (rejectBlockedExternalSideEffect(res, 'payment_capture')) return;

    try {
        const payload = normalizePaytrCallbackPayload(req.body || {});

        if (!payload.merchant_oid || !payload.status || !payload.total_amount) {
            return res.status(400).json({ error: 'merchant_oid, status ve total_amount zorunludur.' });
        }

        if (!payload.hash) {
            return res.status(400).json({ error: 'PayTR callback hash zorunludur.' });
        }

        const paytrConfig = assertPaytrEnvReady();
        if (!verifyPaytrCallbackHash(payload, paytrConfig)) {
            return res.status(401).json({ error: 'PayTR callback hash dogrulanamadi.' });
        }

        if (payload.status === 'success') {
            const { payment, decision } = await finalizePaytrSuccess(payload);

            if (decision === PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE && payment) {
                if (payment.user_id) {
                    await createPaymentNotificationSafely(
                        'PayTR',
                        payment.user_id,
                        'order_update',
                        `Sipariş #${payment.order_id} ödemesi başarıyla alındı.`
                    );
                }

                await createPaymentNotificationSafely(
                    'PayTR',
                    null,
                    'new_order',
                    `Yeni sipariş kesinleşti (#${payment.order_id}). Müşteri: ${payment.customer_name || 'Bilinmiyor'}`
                );
            }
            return res.type('text/plain').status(200).send('OK');
        }

        if (isPaytrFailedStatus(payload.status)) {
            const { payment, decision } = await finalizePaytrFailure(payload);

            if (
                payment &&
                payment.user_id &&
                [
                    PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE,
                    PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER
                ].includes(decision)
            ) {
                await createPaymentNotificationSafely(
                    'PayTR',
                    payment.user_id,
                    'order_update',
                    `Sipariş #${payment.order_id} ödemesi başarısız oldu.`
                );
            }
            return res.type('text/plain').status(200).send('OK');
        }

        return res.status(202).json({
            ok: true,
            provider: 'paytr',
            merchantOid: payload.merchant_oid,
            status: payload.status,
            finalizationImplemented: false,
            message: 'PayTR callback hash dogrulandi; bilinmeyen status finalize edilmedi.'
        });
    } catch (err) {
        const statusCode = err instanceof PaymentProviderConfigError ? err.statusCode : (err.statusCode || 500);
        return res.status(statusCode).json({
            error: err instanceof PaymentProviderConfigError
                ? 'PayTR callback config eksik.'
                : (err.message || 'PayTR callback islenemedi.'),
            details: err instanceof PaymentProviderConfigError ? err.details : undefined
        });
    }
};

const initializePayment = async (req, res) => {
    if (rejectBlockedExternalSideEffect(res, 'payment_initialize')) return;

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

        const user = await getUserFromRequestIfAny(req);
        const userId = user ? user.id : null;

        const idempotencyKey = readIdempotencyKey(req) || createDeterministicKeyFromBody(req.body);
        const idempotencyContext = buildPaymentIdempotencyContext({
            body: req.body,
            userId,
            idempotencyKey
        });

        const existingPayment = await client.query(
            `SELECT p.*, o.id AS order_id, o.user_id AS order_user_id
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.idempotency_key = $1`,
            [idempotencyKey]
        );

        if (existingPayment.rows.length > 0) {
            const row = existingPayment.rows[0];
            const storedIdempotency = readStoredIdempotencyContext(row.raw_request);

            if (!idempotencyContextMatches(storedIdempotency, idempotencyContext)) {
                return res.status(409).json({
                    error: 'Idempotency key farklı bir ödeme isteği için kullanılmış.'
                });
            }

            const ownerUserId = row.order_user_id === null || row.order_user_id === undefined
                ? null
                : Number(row.order_user_id);

            if (userId !== null && ownerUserId !== userId) {
                return res.status(409).json({
                    error: 'Idempotency key farklı bir kullanıcıya ait.'
                });
            }

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

        const selectedCardPaymentProvider = paymentMethod === 'havale' ? null : getPaymentProviderName();
        const paytrProviderConfig = selectedCardPaymentProvider === 'paytr' ? assertPaytrEnvReady() : null;

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
        let rawRequestPayload = {
            paymentMethod,
            couponCode,
            coupon: pricing.coupon,
            stockReserved: false,
            finalizesOnWebhook: true,
            idempotency: idempotencyContext
        };

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
            paymentProvider = selectedCardPaymentProvider;

            if (paymentProvider === 'paytr') {
                const paytrConfig = paytrProviderConfig || assertPaytrEnvReady();
                const tokenPayload = buildPaytrTokenPayload({
                    config: paytrConfig,
                    order,
                    customer: {
                        fullName,
                        email,
                        phone,
                        address: typeof address === 'string' ? address : JSON.stringify(address)
                    },
                    items: pricing.items,
                    amount: pricing.totals.total,
                    userIp: readClientIp(req)
                });
                const mockTokenResponse = buildMockPaytrTokenResponse({
                    merchantOid: tokenPayload.merchant_oid,
                    paymentAmount: tokenPayload.payment_amount
                });

                paymentRef = tokenPayload.merchant_oid;
                paymentStatus = PAYMENT_STATUS.REQUIRES_ACTION;
                providerResponse = {
                    type: 'iframe',
                    token: mockTokenResponse.token,
                    iframeUrl: buildPaytrIframeUrl(mockTokenResponse.token, paytrConfig),
                    successUrl: tokenPayload.merchant_ok_url,
                    failUrl: tokenPayload.merchant_fail_url,
                    mock: true
                };
                rawRequestPayload = {
                    ...rawRequestPayload,
                    paytr: {
                        merchantOid: tokenPayload.merchant_oid,
                        paymentAmount: tokenPayload.payment_amount,
                        userBasket: tokenPayload.user_basket,
                        callbackUrl: paytrConfig.callbackUrl,
                        successUrl: tokenPayload.merchant_ok_url,
                        failUrl: tokenPayload.merchant_fail_url,
                        testMode: tokenPayload.test_mode,
                        debugOn: tokenPayload.debug_on,
                        mock: true
                    }
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
                JSON.stringify(rawRequestPayload),
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
        if (err.publicMessage && [401, 503].includes(err.statusCode)) return sendAuthError(res, err);
        const statusCode = err instanceof PaymentProviderConfigError ? err.statusCode : (err.statusCode || 500);
        console.error('\u00D6deme initialize hatas\u0131:', err.message);
        res.status(statusCode).json({
            error: err.message || '\u00D6deme ba\u015Flat\u0131lamad\u0131.',
            details: err instanceof PaymentProviderConfigError ? err.details : undefined
        });
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
                    p.raw_request,
                    o.id AS order_id,
                    o.status AS order_status,
                    o.refund_status,
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
    if (rejectBlockedExternalSideEffect(res, 'payment_capture')) return;

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
        const unsignedMockAllowed = isUnsignedIyzicoWebhookMockAllowed();

        if (!signatureSecret && !unsignedMockAllowed) {
            return res.status(503).json({ error: 'Iyzico webhook imza anahtari yapilandirilmalidir.' });
        }

        if (!signature && !unsignedMockAllowed) {
            return res.status(401).json({ error: 'Imzasiz Iyzico webhook istegi kabul edilmez.' });
        }

        const signatureValid = Boolean(signatureSecret && signature && verifyWebhookSignature(payload, signature, signatureSecret));
        const unsignedMockAccepted = !signatureSecret && unsignedMockAllowed;

        if (!signatureValid && !unsignedMockAccepted) {
            return res.status(401).json({ error: 'Webhook imza dogrulamasi basarisiz.' });
        }

        if (!IYZICO_SUCCESS_STATUSES.has(rawStatus) && !IYZICO_FAILED_STATUSES.has(rawStatus)) {
            return res.status(202).json({
                ok: true,
                processed: false,
                finalizationImplemented: false,
                status: rawStatus
            });
        }

        const isSuccess = IYZICO_SUCCESS_STATUSES.has(rawStatus);
        const callbackOutcome = isSuccess
            ? PAYMENT_CALLBACK_OUTCOME.SUCCESS
            : PAYMENT_CALLBACK_OUTCOME.FAILURE;
        const storedEventId = buildIyzicoWebhookEventId(paymentRef, eventId, callbackOutcome);

        await client.query('BEGIN');

        const webhookInsert = await client.query(
            `INSERT INTO webhook_events (provider, external_event_id, signature_valid, payload, processed)
             VALUES ('iyzico', $1, $2, $3::jsonb, FALSE)
             ON CONFLICT (external_event_id)
             DO UPDATE SET external_event_id = EXCLUDED.external_event_id
             RETURNING id, processed`,
            [storedEventId, signatureValid, JSON.stringify(payload)]
        );

        const webhookRow = webhookInsert.rows[0];

        if (webhookRow.processed === true) {
            await client.query('COMMIT');
            return res.status(200).json({ ok: true, processed: true, duplicate: true });
        }

        const payment = await lockPaymentAndOrderByRef(client, paymentRef);
        if (!payment) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '\u00D6deme kayd\u0131 bulunamad\u0131.' });
        }

        if (payment.provider !== 'iyzico' || payment.payment_ref !== paymentRef) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Iyzico odeme kaydi uyusmuyor.' });
        }

        const expectedAmount = toComparableMoney(payment.amount || payment.order_total_amount);
        const callbackAmount = toComparableMoney(readIyzicoPayloadAmount(payload));
        if (expectedAmount === null || callbackAmount === null || expectedAmount !== callbackAmount) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Iyzico odeme tutari uyusmuyor.' });
        }

        const expectedCurrency = String(payment.currency || '').trim().toUpperCase();
        const callbackCurrency = readIyzicoPayloadCurrency(payload);
        if (!expectedCurrency || expectedCurrency !== callbackCurrency) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Iyzico odeme para birimi uyusmuyor.' });
        }

        const stockReservationState = getStockReservationState(payment);
        const plan = planPaymentCallback({
            paymentStatus: payment.status,
            orderStatus: payment.order_status,
            callbackOutcome,
            stockReservationState
        });
        const rawRequest = safeJsonParse(payment.raw_request, {});
        const parsedItemsRaw = safeJsonParse(payment.items, []);
        const parsedItems = Array.isArray(parsedItemsRaw) ? parsedItemsRaw : [];

        if (plan.decision === PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE) {
            if (plan.reserveStock) {
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

            await consumeCouponUsageIfNeeded(client, rawRequest.coupon);

            await client.query(
                `UPDATE orders
                 SET payment_status = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.PAID, ORDER_STATUS.HAZIRLANIYOR, payment.order_id]
            );

            await syncOrderItemsForOrder(client, payment.order_id, parsedItems);

            await appendOrderEvent(client, payment.order_id, 'PAYMENT_SUCCESS', '\u00D6deme ba\u015Far\u0131l\u0131.', {
                provider: 'iyzico',
                eventId,
                paymentRef,
                stockReservationStateBeforeWebhook: stockReservationState
            });
        } else if (plan.decision === PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION) {
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
                    JSON.stringify({
                        reconciliationRequired: true,
                        reconciliationReason: plan.reconciliationReason,
                        reconciliationRecordedAt: new Date().toISOString()
                    }),
                    payment.id
                ]
            );

            if (plan.targetRefundStatus) {
                await client.query(
                    `UPDATE orders
                     SET payment_status = $1,
                         refund_status = $2,
                         updated_at = NOW()
                     WHERE id = $3`,
                    [PAYMENT_STATUS.PAID, plan.targetRefundStatus, payment.order_id]
                );
            } else {
                await client.query(
                    `UPDATE orders
                     SET payment_status = $1,
                         updated_at = NOW()
                     WHERE id = $2`,
                    [PAYMENT_STATUS.PAID, payment.order_id]
                );
            }

            await appendOrderEvent(
                client,
                payment.order_id,
                'PAYMENT_CAPTURE_RECONCILIATION',
                plan.targetRefundStatus
                    ? '\u00D6deme al\u0131nd\u0131; sipari\u015F i\u015Fleme al\u0131nmadan geri \u00F6deme incelemesine y\u00F6nlendirildi.'
                    : '\u00D6deme al\u0131nd\u0131; sipari\u015F durumu korunarak manuel uzla\u015Ft\u0131rma kayd\u0131 olu\u015Fturuldu.',
                {
                    provider: 'iyzico',
                    eventId,
                    paymentRef,
                    previousPaymentStatus: payment.status,
                    orderStatusPreserved: payment.order_status,
                    reason: plan.reconciliationReason,
                    commerceSideEffectsApplied: false,
                    stockReservationState,
                    refundStatusChangedTo: plan.targetRefundStatus
                }
            );
        } else if (
            plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE ||
            plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER
        ) {
            await client.query(
                `UPDATE payments
                 SET status = $1,
                     raw_response = COALESCE(raw_response, '{}'::jsonb) || $2::jsonb,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.FAILED, JSON.stringify(payload), payment.id]
            );

            if (plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE) {
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
            } else {
                await client.query(
                    `UPDATE orders
                     SET payment_status = $1,
                         updated_at = NOW()
                     WHERE id = $2`,
                    [PAYMENT_STATUS.FAILED, payment.order_id]
                );
            }

            if (plan.releaseStockReservation) {
                await releaseStockReservation({
                    client,
                    payment,
                    items: parsedItems,
                    reasonCode: 'PAYMENT_CALLBACK_FAILED'
                });
            }

            await appendOrderEvent(
                client,
                payment.order_id,
                plan.reconciliationRequired
                    ? 'PAYMENT_FAILURE_RECONCILIATION'
                    : 'PAYMENT_FAILED',
                '\u00D6deme ba\u015Far\u0131s\u0131z.',
                {
                    provider: 'iyzico',
                    eventId,
                    paymentRef,
                    reason: payload.reason || null,
                    orderStatusPreserved: plan.decision === PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER
                        ? payment.order_status
                        : null,
                    stockReservationStateBeforeWebhook: stockReservationState,
                    stockReservationReleased: plan.releaseStockReservation,
                    reconciliationReason: plan.reconciliationReason
                }
            );
        } else if (plan.decision === PAYMENT_CALLBACK_DECISION.STALE_FAILURE) {
            await appendOrderEvent(client, payment.order_id, 'PAYMENT_STALE_FAILURE_IGNORED', 'Ge\u00E7 \u00F6deme ba\u015Far\u0131s\u0131zl\u0131\u011F\u0131 yok say\u0131ld\u0131.', {
                provider: 'iyzico',
                eventId,
                paymentRef,
                authoritativePaymentStatus: payment.status
            });
        } else if (plan.decision === PAYMENT_CALLBACK_DECISION.REFUNDED_CAPTURE_CONFLICT) {
            await appendOrderEvent(client, payment.order_id, 'PAYMENT_REFUNDED_CAPTURE_CONFLICT', '\u0130ade edilmi\u015F \u00F6deme i\u00E7in ge\u00E7 ba\u015Far\u0131 callback\u2019i al\u0131nd\u0131.', {
                provider: 'iyzico',
                eventId,
                paymentRef,
                authoritativePaymentStatus: payment.status
            });
        }

        await persistOpenPaymentReconciliation({
            client,
            payment,
            plan,
            provider: 'iyzico',
            providerEventId: eventId,
            paymentRef
        });

        await client.query(
            'UPDATE webhook_events SET processed = TRUE WHERE id = $1',
            [webhookRow.id]
        );

        await client.query('COMMIT');

        const shouldNotifyCapture = plan.decision === PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE;
        const shouldNotifyFailure = [
            PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE,
            PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER
        ].includes(plan.decision);
        if (payment.user_id && (shouldNotifyCapture || shouldNotifyFailure)) {
            await createPaymentNotificationSafely(
                'Iyzico',
                payment.user_id,
                'order_update',
                shouldNotifyCapture
                    ? `Sipari\u015F #${payment.order_id} \u00F6demesi ba\u015Far\u0131yla al\u0131nd\u0131.`
                    : `Sipari\u015F #${payment.order_id} \u00F6demesi ba\u015Far\u0131s\u0131z oldu.`
            );
        }

        if (shouldNotifyCapture) {
            await createPaymentNotificationSafely(
                'Iyzico',
                null,
                'new_order',
                `Yeni sipari\u015F kesinle\u015Fti (#${payment.order_id}). M\u00FC\u015Fteri: ${payment.customer_name || 'Bilinmiyor'}`
            );
        }

        const duplicate = isDuplicatePaymentDecision(plan.decision);
        res.status(200).json({
            ok: true,
            processed: true,
            duplicate,
            status: plan.targetPaymentStatus || payment.status,
            paymentStatus: plan.targetPaymentStatus || payment.status,
            orderStatus: plan.targetOrderStatus || payment.order_status,
            refundStatus: plan.targetRefundStatus || payment.order_refund_status || REFUND_STATUS.NONE,
            reconciliationRequired: plan.reconciliationRequired,
            reconciliationReason: plan.reconciliationReason
        });
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
    normalizePaytrCallbackPayload,
    webhookPaytr,
    webhookIyzico
};
