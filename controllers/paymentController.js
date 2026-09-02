const crypto = require('crypto');
const net = require('net');
const pool = require('../config/db');
const { sendAuthError } = require('../middlewares/authMiddleware');
const { EVENT } = require('../services/notificationEventCatalog');
const { enqueueNotificationEvent } = require('../services/notificationOutboxService');
const { verifyWebhookSignature } = require('../services/paymentProviderService');
const {
    PaymentProviderConfigError,
    assertPaytrEnvReady,
    assertPaytrProviderReady,
    getPaymentProviderCapability,
    getPaymentProviderName,
    isProductionEnvironment
} = require('../config/paymentProviderConfig');
const {
    buildPaytrMerchantOid,
    buildPaytrTokenPayload,
    PaytrProviderTransportError,
    requestPaytrIframeSession,
    verifyPaytrCallbackHash
} = require('../services/paytrPaymentService');
const {
    assertRequestedCouponApplied,
    createPendingPaymentOrderFromPricing,
    reserveStock,
    releaseStockReservation,
    appendOrderEvent,
    syncOrderItemsForOrder
} = require('../services/orderService');
const {
    consumeCouponReservationIfNeeded,
    releaseCouponReservationForOrder,
    reserveCouponUsageForOrder
} = require('../services/couponReservationService');
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
const {
    PaymentLaunchPolicyError,
    assertPaymentLaunchPolicy
} = require('../config/paymentLaunchPolicy');
const {
    BusinessIdentityConfigError,
    getBusinessIdentityIssueKeys
} = require('../config/businessIdentityConfig');
const {
    LegalDocumentError,
    buildCheckoutAgreementPreview,
    buildCheckoutAgreementSnapshot,
    getCheckoutAgreementDocuments,
    getCheckoutAgreementReadiness,
    normalizeCheckoutAgreementContext
} = require('../services/legalDocumentService');
const { calculatePricing } = require('../services/pricingService');
const {
    canonicalProvinceDistrict,
    normalizeTurkishMobilePhone
} = require('../services/turkiyeAddressContract');
const {
    buildReservationMetadata,
    expireLockedPaymentReservation,
    releaseExpiredPaymentReservations
} = require('../services/paymentReservationService');
const {
    assertSingleFulfillmentSalesParty,
    buildCheckoutSalesPartyProjection,
    materializeSellerOrderProjection
} = require('../services/sellerOrderProjectionService');

let paytrIframeSessionRequester = requestPaytrIframeSession;

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
    if (!key) return null;
    if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
        const error = new Error('Idempotency anahtarı geçersiz.');
        error.code = 'PAYMENT_IDEMPOTENCY_KEY_INVALID';
        error.statusCode = 400;
        throw error;
    }
    return key;
};

const createDeterministicKeyFromBody = (body, userId = null) => {
    const seed = JSON.stringify({
        owner: userId
            ? `user:${Number(userId)}`
            : `guest:${String(body.analyticsSessionKey || body.email || '').trim().toLowerCase()}`,
        analyticsSessionKey: body.analyticsSessionKey,
        addressId: body.addressId,
        cartItems: body.cartItems,
        couponCode: body.couponCode,
        paymentMethod: body.paymentMethod,
        agreementAcceptances: body.agreementAcceptances,
        agreementSnapshotSha256: body.agreementSnapshotSha256
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
    addressId: Number(body.addressId || 0),
    cartItems: Array.isArray(body.cartItems) ? body.cartItems : [],
    couponCode: body.couponCode || null,
    paymentMethod: body.paymentMethod || 'card',
    agreementSnapshotSha256: String(body.agreementSnapshotSha256 || '').trim().toLowerCase(),
    agreementAcceptances: Array.isArray(body.agreementAcceptances)
        ? body.agreementAcceptances.map((item) => ({
            slug: String(item?.slug || '').trim(),
            version: String(item?.version || '').trim(),
            accepted: item?.accepted === true
        })).sort((left, right) => left.slug.localeCompare(right.slug))
        : []
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
    const raw = String(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '').trim();
    const candidate = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    if (!net.isIP(candidate)) {
        const error = new Error('Payment client IP is unavailable.');
        error.code = 'PAYMENT_CLIENT_IP_INVALID';
        error.statusCode = 400;
        throw error;
    }
    return candidate;
};

const truthyEnvValues = new Set(['1', 'true', 'yes', 'on']);

const isTruthyEnv = (value) => truthyEnvValues.has(String(value || '').trim().toLowerCase());

const isUnsignedIyzicoWebhookMockAllowed = () => (
    !isProductionEnvironment(process.env) &&
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

const CHECKOUT_AGREEMENT_SCHEMA_VERSION = 'checkout-agreements-v2';
const CHECKOUT_AGREEMENT_ALLOCATION_RECONCILIATION_REASON = 'CHECKOUT_AGREEMENT_ALLOCATION_UNVERIFIED';

const summarizeStoredProjectionProductIds = (allocation) => {
    if (!Array.isArray(allocation?.productIds) || !Array.isArray(allocation?.items)) return null;
    const productIds = allocation.productIds.map(Number).sort((left, right) => left - right);
    const itemProductIds = allocation.items.map((item) => Number(item?.productId)).sort((left, right) => left - right);
    if (
        productIds.some((productId) => !Number.isSafeInteger(productId) || productId <= 0)
        || itemProductIds.some((productId) => !Number.isSafeInteger(productId) || productId <= 0)
        || stableStringify(productIds) !== stableStringify(itemProductIds)
    ) {
        return null;
    }
    return productIds;
};

const summarizeStoredSellerProjection = (sellerProjection) => {
    if (!Array.isArray(sellerProjection)) return null;
    const summaries = sellerProjection.map((seller) => {
        const productIds = summarizeStoredProjectionProductIds(seller);
        if (!productIds) return null;
        return {
            organizationId: Number(seller.organizationId),
            storeId: Number(seller.storeId),
            currency: String(seller.currency || '').trim().toUpperCase(),
            grossMinor: Number(seller.grossMinor),
            productIds
        };
    });
    if (summaries.some((summary) => !summary)) return null;
    return summaries.sort((left, right) => (
        left.organizationId - right.organizationId || left.storeId - right.storeId
    ));
};

const summarizeStoredPlatformAllocation = (platformAllocation) => {
    if (platformAllocation === null || platformAllocation === undefined) return null;
    const productIds = summarizeStoredProjectionProductIds(platformAllocation);
    const storeId = Number(platformAllocation.storeId);
    if (
        !productIds
        || !Number.isSafeInteger(storeId)
        || storeId <= 0
        || String(platformAllocation.storeSlug || '').trim().toLowerCase() !== 'novastore-platform'
    ) {
        return undefined;
    }
    return {
        currency: String(platformAllocation.currency || '').trim().toUpperCase(),
        grossMinor: Number(platformAllocation.grossMinor),
        productIds
    };
};

const hasVerifiedStoredCheckoutAgreementAllocation = (rawRequest) => {
    try {
        if (!rawRequest || typeof rawRequest !== 'object' || Array.isArray(rawRequest)) return false;
        const snapshot = rawRequest.checkoutAgreementSnapshot;
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
        if (snapshot.schemaVersion !== CHECKOUT_AGREEMENT_SCHEMA_VERSION) return false;
        const normalizedContext = normalizeCheckoutAgreementContext(snapshot.context);
        const expectedContextSha256 = crypto
            .createHash('sha256')
            .update(stableStringify(normalizedContext), 'utf8')
            .digest('hex');
        if (String(snapshot.contextSha256 || '').trim().toLowerCase() !== expectedContextSha256) return false;
        const storedSellerSummaries = summarizeStoredSellerProjection(rawRequest.sellerProjection);
        const storedPlatformSummary = summarizeStoredPlatformAllocation(rawRequest.platformAllocation);
        if (!storedSellerSummaries || storedPlatformSummary === undefined) return false;
        assertSingleFulfillmentSalesParty({
            sellerProjection: rawRequest.sellerProjection,
            platformAllocation: rawRequest.platformAllocation
        });
        const snapshotSellerSummaries = normalizedContext.sellers.map((seller) => ({
            organizationId: seller.organizationId,
            storeId: seller.storeId,
            currency: seller.currency,
            grossMinor: seller.grossMinor,
            productIds: [...seller.productIds]
        })).sort((left, right) => (
            left.organizationId - right.organizationId || left.storeId - right.storeId
        ));
        const snapshotPlatformSummary = normalizedContext.platformAllocation
            ? {
                currency: normalizedContext.platformAllocation.currency,
                grossMinor: normalizedContext.platformAllocation.grossMinor,
                productIds: [...normalizedContext.platformAllocation.productIds]
            }
            : null;
        return stableStringify({
            platformAllocation: storedPlatformSummary,
            sellers: storedSellerSummaries
        }) === stableStringify({
            platformAllocation: snapshotPlatformSummary,
            sellers: snapshotSellerSummaries
        });
    } catch (_) {
        return false;
    }
};

const guardActiveCaptureAgreementAllocation = (plan, rawRequest) => {
    if (
        plan.decision !== PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE
        || hasVerifiedStoredCheckoutAgreementAllocation(rawRequest)
    ) {
        return plan;
    }
    return Object.freeze({
        ...plan,
        decision: PAYMENT_CALLBACK_DECISION.CAPTURE_RECONCILIATION,
        targetOrderStatus: plan.currentOrderStatus,
        targetRefundStatus: REFUND_STATUS.PENDING,
        runCommerceSideEffects: false,
        reserveStock: false,
        releaseStockReservation: false,
        reconciliationRequired: true,
        reconciliationReason: CHECKOUT_AGREEMENT_ALLOCATION_RECONCILIATION_REASON
    });
};

const finalizeCouponReservationForCapture = async ({
    client,
    payment,
    coupon,
    provider,
    providerEventId,
    paymentRef
}) => {
    const result = await consumeCouponReservationIfNeeded(client, coupon, payment.order_id);
    if (!result.reconciliationRequired) return result;

    const reconciliation = {
        couponReconciliationRequired: true,
        couponReconciliationReason: result.reasonCode,
        couponReconciliationRecordedAt: new Date().toISOString()
    };
    await client.query(
        `UPDATE payments
         SET raw_request = COALESCE(raw_request, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(reconciliation), payment.id]
    );
    await appendOrderEvent(
        client,
        payment.order_id,
        'COUPON_CAPTURE_RECONCILIATION',
        'Ödeme kaydedildi; kupon kotası manuel uzlaştırma incelemesine alındı.',
        {
            provider,
            providerEventId,
            paymentRef,
            reasonCode: result.reasonCode,
            paymentCapturePreserved: true
        }
    );
    return result;
};

const normalizePaytrCallbackPayload = (payload = {}) => ({
    merchant_oid: String(payload.merchant_oid || '').trim(),
    status: String(payload.status || '').trim().toLowerCase(),
    total_amount: String(payload.total_amount || '').trim(),
    payment_amount: String(payload.payment_amount || '').trim(),
    payment_type: String(payload.payment_type || '').trim().toLowerCase(),
    currency: String(payload.currency || '').trim().toUpperCase(),
    test_mode: String(payload.test_mode || '').trim(),
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

const IYZICO_SUCCESS_STATUSES = new Set(['SUCCESS', 'PAID']);
const IYZICO_FAILED_STATUSES = new Set(['FAILURE', 'FAILED']);

const isPaytrFailedStatus = (status) => String(status || '').trim().toLowerCase() === 'failed';

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

const lockOwnedPaymentAndOrderForStatus = async (client, { paymentRef, orderId, userId }) => {
    const paymentResult = await client.query(
        `WITH locked_order AS MATERIALIZED (
             SELECT o.*
             FROM orders o
             JOIN payments payment_lookup ON payment_lookup.order_id = o.id
             WHERE payment_lookup.payment_ref = $1
               AND o.user_id = $2
               AND ($3::bigint IS NULL OR o.id = $3)
             FOR UPDATE OF o
         )
         SELECT p.id,
                p.payment_ref,
                p.status,
                p.status AS payment_status,
                p.provider,
                p.raw_request,
                p.raw_response,
                o.items,
                o.user_id AS order_user_id,
                o.id AS order_id,
                o.status AS order_status,
                o.payment_status AS order_payment_status,
                o.refund_status,
                CURRENT_TIMESTAMP AS reservation_checked_at
         FROM locked_order o
         JOIN payments p ON p.order_id = o.id
         WHERE p.payment_ref = $1
         FOR UPDATE OF p`,
        [paymentRef, userId, orderId]
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

    const notificationEvent = await enqueueNotificationEvent(client, {
        eventType: EVENT.REFUND_ACTION_REQUIRED,
        aggregateType: 'order',
        aggregateId: payment.order_id,
        sourceEventKey: `REFUND_ACTION_REQUIRED:order:${payment.order_id}:${providerEventId}`,
        payload: { provider, reasonCode: reconciliationTask.reasonCode }
    });

    return {
        ...reconciliationTask,
        notificationOutboxEventId: notificationEvent.id
    };
};

const enqueuePaymentOutcomeNotifications = async ({ client, payment, plan, provider, providerEventId }) => {
    if (plan.decision === PAYMENT_CALLBACK_DECISION.CAPTURE_ACTIVE) {
        await enqueueNotificationEvent(client, {
            eventType: EVENT.ORDER_CONFIRMED,
            aggregateType: 'order',
            aggregateId: payment.order_id,
            sourceEventKey: `ORDER_CONFIRMED:order:${payment.order_id}:${providerEventId}`,
            payload: { provider, outcome: 'captured' }
        });
        await enqueueNotificationEvent(client, {
            eventType: EVENT.PAYMENT_SUCCESS,
            aggregateType: 'order',
            aggregateId: payment.order_id,
            sourceEventKey: `PAYMENT_SUCCESS:order:${payment.order_id}:${providerEventId}`,
            payload: { provider, outcome: 'captured' }
        });
    }
    if ([
        PAYMENT_CALLBACK_DECISION.FAIL_ACTIVE,
        PAYMENT_CALLBACK_DECISION.FAIL_PRESERVE_ORDER
    ].includes(plan.decision)) {
        await enqueueNotificationEvent(client, {
            eventType: EVENT.PAYMENT_FAILED,
            aggregateType: 'order',
            aggregateId: payment.order_id,
            sourceEventKey: `PAYMENT_FAILED:order:${payment.order_id}:${providerEventId}`,
            payload: { provider, outcome: 'failed' }
        });
    }
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
    const currentOrderStatus = Object.values(ORDER_STATUS).includes(orderStatus) ? orderStatus : null;
    const orderPaymentStatus = String(row.order_payment_status || '').trim().toUpperCase() || null;
    const paidOrderStates = new Set([
        ORDER_STATUS.HAZIRLANIYOR,
        ORDER_STATUS.KARGOYA_VERILDI,
        ORDER_STATUS.TESLIM_EDILDI
    ]);
    let stateCoherenceReason = null;
    if (orderPaymentStatus && orderPaymentStatus !== paymentStatus) {
        stateCoherenceReason = 'PAYMENT_ORDER_PAYMENT_STATUS_MISMATCH';
    } else if (isPaid && !refundReviewPending && !paidOrderStates.has(currentOrderStatus)) {
        stateCoherenceReason = 'PAID_ORDER_STATE_MISMATCH';
    } else if (isFailed && currentOrderStatus !== ORDER_STATUS.IPTAL_EDILDI) {
        stateCoherenceReason = 'FAILED_ORDER_STATE_MISMATCH';
    } else if (isRefunded && (
        refundStatus !== REFUND_STATUS.COMPLETED
        || ![ORDER_STATUS.IPTAL_EDILDI, ORDER_STATUS.IADE_EDILDI].includes(currentOrderStatus)
    )) {
        stateCoherenceReason = 'REFUNDED_ORDER_STATE_MISMATCH';
    }
    const paymentReconciliationPending = (reconciliationTask
        ? String(reconciliationTask.status || '').trim().toUpperCase() === 'OPEN'
        : paymentMetadata.reconciliationRequired === true) || Boolean(stateCoherenceReason);
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
            ? (stateCoherenceReason || reconciliationTask?.reasonCode || paymentMetadata.reconciliationReason || null)
            : null,
        message,
        nextAction
    };
};

const getPaymentCapability = (_req, res) => {
    const provider = getPaymentProviderCapability();
    const agreements = getCheckoutAgreementReadiness();
    const identityReady = getBusinessIdentityIssueKeys(process.env, { paymentOnly: true }).length === 0;
    const ready = provider.ready && agreements.ready && identityReady;
    const state = !provider.ready
        ? provider.state
        : !identityReady
            ? 'company_identity_required'
            : !agreements.ready
                ? 'legal_documents_required'
                : 'ready';
    const messages = {
        provider_not_configured: 'Güvenli ödeme hizmeti aktivasyon sürecindedir.',
        credentials_required: 'PayTR Pazaryeri sağlayıcı bilgileri bekleniyor.',
        client_ip_config_required: 'Yayın proxy zinciri doğrulanmadan müşteri IP bilgisi PayTR\'a gönderilemez.',
        production_test_mode_forbidden: 'PayTR test modu production müşteri ödemelerinde kullanılamaz.',
        activation_required: 'PayTR güvenli ödeme bağlantısı henüz yetkili olarak etkinleştirilmedi.',
        company_identity_required: 'Gerçek şirket kimliği tamamlanmadan ödeme açılamaz.',
        legal_documents_required: 'Güncel ödeme sözleşmeleri yayımlanmadan ödeme açılamaz.',
        ready: 'PayTR güvenli ödeme alanı kullanıma hazır.'
    };
    return res.status(200).json({
        provider: provider.provider,
        ready,
        state,
        message: messages[state],
        testMode: ready ? provider.testMode === true : null,
        requirements: {
            providerReady: provider.ready,
            businessIdentityReady: identityReady,
            legalDocumentsReady: agreements.ready
        },
        agreements: getCheckoutAgreementDocuments().map((document) => ({
            slug: document.slug,
            path: document.path,
            title: document.title,
            status: document.status,
            version: document.version
        }))
    });
};

const normalizeCheckoutAddressId = (value) => {
    const addressId = Number(value);
    return Number.isInteger(addressId) && addressId > 0 ? addressId : null;
};

const loadOwnedCheckoutAddress = async (client, addressId, userId) => {
    const result = await client.query(
        `SELECT address_row.id, address_row.title, address_row.full_name, address_row.phone,
                address_row.city, address_row.district, address_row.address_line, user_row.email
         FROM customer_addresses address_row
         JOIN users user_row ON user_row.id = address_row.user_id
         WHERE address_row.id = $1 AND address_row.user_id = $2
         LIMIT 1`,
        [addressId, userId]
    );
    return result.rows[0] || null;
};

const loadPaymentByIdempotencyKey = async (client, idempotencyKey) => {
    const result = await client.query(
        `SELECT p.*, o.id AS order_id, o.user_id AS order_user_id
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.idempotency_key = $1`,
        [idempotencyKey]
    );
    return result.rows[0] || null;
};

const formatCheckoutAddress = (address) => [
    address.title ? `${address.title}:` : '',
    address.address_line,
    [address.district, address.city].filter(Boolean).join(' / ')
].filter(Boolean).join(' ');

const buildCheckoutAgreementContext = ({
    identitySnapshot,
    addressId,
    customer,
    pricing,
    sellerProjection,
    platformAllocation
}) => ({
    businessIdentity: identitySnapshot,
    delivery: {
        addressId,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        address: customer.address
    },
    items: pricing.items.map((item) => ({
        productId: Number(item.id),
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.price),
        lineTotal: Number(item.line_total)
    })),
    totals: pricing.totals,
    coupon: {
        applied: pricing.coupon?.applied === true,
        code: pricing.coupon?.applied === true ? pricing.coupon.code : null,
        discountAmount: Number(pricing.coupon?.discountAmount || 0)
    },
    platformAllocation: platformAllocation
        ? {
            currency: platformAllocation.currency,
            grossMinor: Number(platformAllocation.grossMinor),
            productIds: (platformAllocation.productIds || []).map(Number)
        }
        : null,
    sellers: (Array.isArray(sellerProjection) ? sellerProjection : []).map((seller) => ({
        organizationId: Number(seller.organizationId),
        organizationDisplayName: seller.organizationDisplayName,
        storeId: Number(seller.storeId),
        storeDisplayName: seller.storeDisplayName,
        legalIdentity: seller.legalIdentity,
        currency: seller.currency,
        grossMinor: Number(seller.grossMinor),
        productIds: (seller.items || []).map((item) => Number(item.productId))
    }))
});

const buildCustomerFromCheckoutAddress = (checkoutAddress) => {
    const canonicalGeography = checkoutAddress
        ? canonicalProvinceDistrict(checkoutAddress.city, checkoutAddress.district)
        : null;
    const canonicalPhone = checkoutAddress ? normalizeTurkishMobilePhone(checkoutAddress.phone) : null;
    if (!checkoutAddress || !canonicalGeography || !canonicalPhone) {
        const error = new Error('Teslimat adresi bulunamadı.');
        error.code = 'CHECKOUT_ADDRESS_NOT_FOUND';
        error.statusCode = 404;
        throw error;
    }
    return Object.freeze({
        fullName: String(checkoutAddress.full_name || '').trim(),
        email: String(checkoutAddress.email || '').trim().toLowerCase(),
        phone: canonicalPhone,
        address: formatCheckoutAddress({
            ...checkoutAddress,
            city: canonicalGeography.province,
            district: canonicalGeography.district
        })
    });
};

const assertAuthoritativeCheckoutFulfillment = async ({ client, cartItems }) => {
    const pricing = await calculatePricing({
        cartItems,
        couponCode: null,
        client,
        lockCoupon: false
    });
    const checkoutSalesPartyProjection = await buildCheckoutSalesPartyProjection(client, pricing.items);
    assertSingleFulfillmentSalesParty(checkoutSalesPartyProjection);
    return checkoutSalesPartyProjection;
};

const loadAuthoritativeCheckoutState = async ({
    client,
    addressId,
    userId,
    cartItems,
    couponCode,
    agreementAcceptances,
    expectedAgreementSnapshotSha256,
    identitySnapshot,
    lockCoupon
}) => {
    const checkoutAddress = await loadOwnedCheckoutAddress(client, addressId, userId);
    const customer = buildCustomerFromCheckoutAddress(checkoutAddress);
    const pricing = await calculatePricing({ cartItems, couponCode, client, lockCoupon });
    assertRequestedCouponApplied(couponCode, pricing.coupon);
    const checkoutSalesPartyProjection = await buildCheckoutSalesPartyProjection(client, pricing.items);
    assertSingleFulfillmentSalesParty(checkoutSalesPartyProjection);
    const { sellerProjection, platformAllocation } = checkoutSalesPartyProjection;
    const checkoutAgreementSnapshot = buildCheckoutAgreementSnapshot(agreementAcceptances, {
        checkoutContext: buildCheckoutAgreementContext({
            identitySnapshot,
            addressId,
            customer,
            pricing,
            sellerProjection,
            platformAllocation
        }),
        expectedSnapshotSha256: expectedAgreementSnapshotSha256
    });
    return Object.freeze({
        customer,
        pricing,
        sellerProjection,
        platformAllocation,
        checkoutAgreementSnapshot
    });
};

const buildPaytrPayloadBindingHash = (payload) => crypto
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex');

const paytrPayloadBindingsMatch = (left, right) => crypto.timingSafeEqual(
    Buffer.from(buildPaytrPayloadBindingHash(left), 'hex'),
    Buffer.from(buildPaytrPayloadBindingHash(right), 'hex')
);

const buildExistingPaymentResult = ({ row, idempotencyContext, idempotencyKey, userId }) => {
    if (!row) return null;
    const storedIdempotency = readStoredIdempotencyContext(row.raw_request);
    if (!idempotencyContextMatches(storedIdempotency, idempotencyContext)) {
        return Object.freeze({
            statusCode: 409,
            body: { error: 'Idempotency key farklı bir ödeme isteği için kullanılmış.' }
        });
    }
    const ownerUserId = row.order_user_id === null || row.order_user_id === undefined
        ? null
        : Number(row.order_user_id);
    if (ownerUserId !== userId) {
        return Object.freeze({
            statusCode: 409,
            body: { error: 'Idempotency key farklı bir kullanıcıya ait.' }
        });
    }
    return Object.freeze({
        statusCode: 200,
        body: {
            message: 'Idempotent tekrar isteği, mevcut ödeme döndürüldü.',
            orderId: row.order_id,
            paymentRef: row.payment_ref,
            paymentStatus: row.status,
            provider: row.provider,
            idempotencyKey,
            paymentAction: row.provider === 'paytr' && row.status === PAYMENT_STATUS.REQUIRES_ACTION
                ? readStoredPaytrAction(row.raw_response)
                : null,
            reused: true
        }
    });
};

const getCheckoutAgreementPreview = async (req, res) => {
    const user = req.user;
    if (!user || user.principal !== 'customer' || user.role !== 'customer') {
        return res.status(401).json({
            code: 'PAYMENT_CUSTOMER_SESSION_REQUIRED',
            error: 'Sözleşme özeti için doğrulanmış müşteri oturumu gereklidir.'
        });
    }

    let client = null;
    try {
        const addressId = normalizeCheckoutAddressId(req.body?.addressId);
        const cartItems = req.body?.cartItems;
        const couponCode = req.body?.couponCode || null;
        if (!addressId) return res.status(400).json({ error: 'Geçerli teslimat adresi seçilmelidir.' });
        if (!Array.isArray(cartItems) || cartItems.length === 0) return res.status(400).json({ error: 'Sepet boş olamaz.' });

        const userId = Number(user.id);
        const launchPolicy = assertPaymentLaunchPolicy({ paymentMethod: 'card' });
        client = await pool.connect();
        const checkoutAddress = await loadOwnedCheckoutAddress(client, addressId, userId);
        const canonicalGeography = checkoutAddress
            ? canonicalProvinceDistrict(checkoutAddress.city, checkoutAddress.district)
            : null;
        const canonicalPhone = checkoutAddress ? normalizeTurkishMobilePhone(checkoutAddress.phone) : null;
        if (!checkoutAddress || !canonicalGeography || !canonicalPhone) {
            return res.status(404).json({ error: 'Teslimat adresi bulunamadı.' });
        }
        const customer = {
            fullName: String(checkoutAddress.full_name || '').trim(),
            email: String(checkoutAddress.email || '').trim().toLowerCase(),
            phone: canonicalPhone,
            address: formatCheckoutAddress({
                ...checkoutAddress,
                city: canonicalGeography.province,
                district: canonicalGeography.district
            })
        };
        const pricing = await calculatePricing({ cartItems, couponCode, client });
        const checkoutSalesPartyProjection = await buildCheckoutSalesPartyProjection(client, pricing.items);
        assertSingleFulfillmentSalesParty(checkoutSalesPartyProjection);
        const { sellerProjection, platformAllocation } = checkoutSalesPartyProjection;
        const preview = buildCheckoutAgreementPreview({
            checkoutContext: buildCheckoutAgreementContext({
                identitySnapshot: launchPolicy.identitySnapshot,
                addressId,
                customer,
                pricing,
                sellerProjection,
                platformAllocation
            })
        });
        return res.status(200).json({
            ...preview,
            quote: {
                totals: pricing.totals,
                campaigns: pricing.campaigns,
                coupon: pricing.coupon,
                items: pricing.items
            }
        });
    } catch (error) {
        const policyError = error instanceof PaymentLaunchPolicyError
            || error instanceof BusinessIdentityConfigError
            || error instanceof LegalDocumentError;
        const statusCode = policyError ? error.statusCode : (error.statusCode || 400);
        if (!policyError && statusCode >= 500) console.error('Sözleşme özeti hatası:', error.code || 'CHECKOUT_AGREEMENT_PREVIEW_ERROR');
        return res.status(statusCode).json({
            code: error.code || undefined,
            error: policyError ? error.publicMessage : (statusCode < 500 ? error.message : 'Sözleşme özeti oluşturulamadı.')
        });
    } finally {
        client?.release();
    }
};

const readStoredPaytrAction = (rawResponse) => {
    const action = safeJsonParse(rawResponse, null);
    if (!action || action.type !== 'iframe' || !action.token || !action.iframeUrl) return null;
    try {
        const url = new URL(action.iframeUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'www.paytr.com' || !url.pathname.startsWith('/odeme/guvenli/')) return null;
    } catch (_) {
        return null;
    }
    return {
        type: 'iframe',
        token: String(action.token),
        iframeUrl: String(action.iframeUrl),
        successUrl: String(action.successUrl || ''),
        failUrl: String(action.failUrl || '')
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
        const callbackPaymentAmount = Number(payload.payment_amount);
        const callbackChargedAmount = Number(payload.total_amount);
        if (
            !Number.isSafeInteger(expectedAmount)
            || expectedAmount !== callbackPaymentAmount
            || !Number.isSafeInteger(callbackChargedAmount)
            || callbackChargedAmount < callbackPaymentAmount
            || payload.payment_type !== 'card'
            || payload.currency !== 'TL'
        ) {
            await client.query('ROLLBACK');
            const err = new Error('PayTR payment amount mismatch.');
            err.statusCode = 409;
            throw err;
        }

        const rawRequest = safeJsonParse(payment.raw_request, {});
        const storedTestMode = String(rawRequest.paytr?.testMode ?? '0') === '1';
        const callbackTestMode = payload.test_mode === '1';
        if (!['', '0', '1'].includes(payload.test_mode) || callbackTestMode !== storedTestMode) {
            await client.query('ROLLBACK');
            const err = new Error('PayTR payment mode mismatch.');
            err.statusCode = 409;
            throw err;
        }

        const stockReservationState = getStockReservationState(payment);
        let plan = planPaymentCallback({
            paymentStatus: payment.status,
            orderStatus: payment.order_status,
            callbackOutcome,
            stockReservationState
        });
        plan = guardActiveCaptureAgreementAllocation(plan, rawRequest);
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

            await finalizeCouponReservationForCapture({
                client,
                payment,
                coupon: rawRequest.coupon,
                provider: 'paytr',
                providerEventId: eventId,
                paymentRef: payload.merchant_oid
            });
            await client.query(
                `UPDATE orders
                 SET payment_status = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.PAID, ORDER_STATUS.HAZIRLANIYOR, payment.order_id]
            );
            await syncOrderItemsForOrder(client, payment.order_id, parsedItems);
            await materializeSellerOrderProjection(
                client,
                payment.order_id,
                Array.isArray(rawRequest.sellerProjection) ? rawRequest.sellerProjection : []
            );
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
                await releaseCouponReservationForOrder(
                    client,
                    payment.order_id,
                    'PAYMENT_CALLBACK_FAILED'
                );
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

        await enqueuePaymentOutcomeNotifications({
            client,
            payment,
            plan,
            provider: 'paytr',
            providerEventId: eventId
        });

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

        if (
            !payload.merchant_oid
            || !payload.status
            || !payload.total_amount
            || !payload.payment_amount
            || !payload.payment_type
            || !payload.currency
        ) {
            return res.status(400).json({ error: 'PayTR callback alanları eksik.' });
        }

        if (!payload.hash) {
            return res.status(400).json({ error: 'PayTR callback hash zorunludur.' });
        }

        if (isProductionEnvironment(process.env) && payload.test_mode === '1') {
            return res.status(409).json({ error: 'PayTR test callback production ortamında kabul edilmez.' });
        }

        const paytrConfig = assertPaytrEnvReady();
        if (!verifyPaytrCallbackHash(payload, paytrConfig)) {
            return res.status(401).json({ error: 'PayTR callback hash dogrulanamadi.' });
        }

        if (payload.status === 'success') {
            await finalizePaytrSuccess(payload);
            return res.type('text/plain').status(200).send('OK');
        }

        if (isPaytrFailedStatus(payload.status)) {
            await finalizePaytrFailure(payload);
            return res.type('text/plain').status(200).send('OK');
        }

        return res.status(400).json({ error: 'Desteklenmeyen PayTR callback durumu.' });
    } catch (err) {
        const statusCode = err instanceof PaymentProviderConfigError ? err.statusCode : (err.statusCode || 500);
        return res.status(statusCode).json({
            error: err instanceof PaymentProviderConfigError
                ? 'PayTR callback config eksik.'
                : (err.message || 'PayTR callback islenemedi.')
        });
    }
};

const initializePayment = async (req, res) => {
    if (rejectBlockedExternalSideEffect(res, 'payment_initialize')) return;

    const user = req.user;
    if (!user || user.principal !== 'customer' || user.role !== 'customer') {
        return res.status(401).json({
            code: 'PAYMENT_CUSTOMER_SESSION_REQUIRED',
            error: 'Ödemeyi başlatmak için doğrulanmış müşteri oturumu gereklidir.'
        });
    }

    let preflightClient = null;
    let client = null;
    let transactionOpen = false;
    let idempotencySessionLockHeld = false;
    let heldIdempotencyKey = null;
    let discardClient = false;

    try {
        const {
            addressId,
            cartItems,
            couponCode = null,
            paymentMethod = 'card',
            analyticsSessionKey = null,
            agreementAcceptances = [],
            agreementSnapshotSha256 = ''
        } = req.body;

        const normalizedAddressId = normalizeCheckoutAddressId(addressId);
        if (!normalizedAddressId) return res.status(400).json({ error: 'Geçerli teslimat adresi seçilmelidir.' });

        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ error: 'Sepet bo\u015F olamaz.' });
        }

        if (!['card', 'havale'].includes(paymentMethod)) {
            return res.status(400).json({
                code: 'PAYMENT_METHOD_INVALID',
                error: 'Desteklenmeyen ödeme yöntemi.'
            });
        }

        const userId = Number(user.id);

        const selectedCardPaymentProvider = paymentMethod === 'havale' ? null : getPaymentProviderName();
        const paytrProviderConfig = selectedCardPaymentProvider === 'paytr' ? assertPaytrProviderReady() : null;
        if (paymentMethod === 'card' && selectedCardPaymentProvider !== 'paytr') {
            throw new PaymentProviderConfigError(
                'PayTR payment provider is not configured.',
                [],
                'PAYMENT_PROVIDER_NOT_CONFIGURED'
            );
        }
        const launchPolicy = assertPaymentLaunchPolicy({ paymentMethod });
        const agreementReadiness = getCheckoutAgreementReadiness();
        if (!agreementReadiness.ready) {
            throw new LegalDocumentError(
                'CHECKOUT_LEGAL_DOCUMENTS_NOT_PUBLISHED',
                503,
                'Ödeme için gerekli güncel sözleşmeler henüz yayımlanmadı.',
                agreementReadiness.missingSlugs
            );
        }
        const normalizedAgreementSnapshotSha256 = String(agreementSnapshotSha256 || '').trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(normalizedAgreementSnapshotSha256)) {
            return res.status(400).json({
                code: 'CHECKOUT_AGREEMENT_SNAPSHOT_REQUIRED',
                error: 'Güncel sipariş sözleşmesi incelenip onaylanmalıdır.'
            });
        }

        const idempotencyKey = readIdempotencyKey(req) || createDeterministicKeyFromBody(req.body, userId);
        const idempotencyContext = buildPaymentIdempotencyContext({
            body: req.body,
            userId,
            idempotencyKey
        });

        const clientIp = paymentMethod === 'card' ? readClientIp(req) : null;

        // Strictly read-only preflight. This connection is released before the
        // PayTR request, so provider latency cannot hold a transaction or lock,
        // reserve stock/coupon quota, or consume an order sequence value.
        preflightClient = await pool.connect();
        const preflightExisting = buildExistingPaymentResult({
            row: await loadPaymentByIdempotencyKey(preflightClient, idempotencyKey),
            idempotencyContext,
            idempotencyKey,
            userId
        });
        if (preflightExisting) {
            return res.status(preflightExisting.statusCode).json(preflightExisting.body);
        }
        const preflight = await loadAuthoritativeCheckoutState({
            client: preflightClient,
            addressId: normalizedAddressId,
            userId,
            cartItems,
            couponCode,
            agreementAcceptances,
            expectedAgreementSnapshotSha256: normalizedAgreementSnapshotSha256,
            identitySnapshot: launchPolicy.identitySnapshot,
            lockCoupon: false
        });
        preflightClient.release();
        preflightClient = null;

        let preflightPaymentRef = null;
        let preflightProviderResponse = null;
        let preflightTokenPayload = null;
        if (paymentMethod === 'card') {
            preflightPaymentRef = buildPaytrMerchantOid();
            preflightTokenPayload = buildPaytrTokenPayload({
                config: paytrProviderConfig,
                customer: preflight.customer,
                items: preflight.pricing.items,
                amount: preflight.pricing.totals.total,
                userIp: clientIp,
                merchantOid: preflightPaymentRef
            });
            preflightProviderResponse = await paytrIframeSessionRequester({
                payload: preflightTokenPayload,
                config: paytrProviderConfig
            });
        }

        client = await pool.connect();
        // Acquire the idempotency lock before BEGIN. A transaction-level lock
        // SELECT would establish a REPEATABLE READ snapshot while waiting and
        // could miss the winner's newly committed payment row.
        await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [idempotencyKey]);
        idempotencySessionLockHeld = true;
        heldIdempotencyKey = idempotencyKey;
        await client.query('BEGIN');
        transactionOpen = true;
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');

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
                await client.query('COMMIT');
                transactionOpen = false;
                return res.status(409).json({
                    error: 'Idempotency key farklı bir ödeme isteği için kullanılmış.'
                });
            }

            const ownerUserId = row.order_user_id === null || row.order_user_id === undefined
                ? null
                : Number(row.order_user_id);

            if (userId !== null && ownerUserId !== userId) {
                await client.query('COMMIT');
                transactionOpen = false;
                return res.status(409).json({
                    error: 'Idempotency key farklı bir kullanıcıya ait.'
                });
            }

            await client.query('COMMIT');
            transactionOpen = false;
            return res.status(200).json({
                message: 'Idempotent tekrar iste\u011Fi, mevcut \u00F6deme d\u00F6n\u00FCld\u00FC.',
                orderId: row.order_id,
                paymentRef: row.payment_ref,
                paymentStatus: row.status,
                provider: row.provider,
                idempotencyKey,
                paymentAction: row.provider === 'paytr' && row.status === PAYMENT_STATUS.REQUIRES_ACTION
                    ? readStoredPaytrAction(row.raw_response)
                    : null,
                reused: true
            });
        }

        // Re-read the authoritative product/store bindings after the provider
        // handoff and before any expiry cleanup, stock, order, or coupon write.
        // The full state load below repeats the same guard after cleanup.
        await assertAuthoritativeCheckoutFulfillment({ client, cartItems });
        await releaseExpiredPaymentReservations(client);
        const finalState = await loadAuthoritativeCheckoutState({
            client,
            addressId: normalizedAddressId,
            userId,
            cartItems,
            couponCode,
            agreementAcceptances,
            expectedAgreementSnapshotSha256: normalizedAgreementSnapshotSha256,
            identitySnapshot: launchPolicy.identitySnapshot,
            lockCoupon: true
        });

        if (paymentMethod === 'card') {
            const finalTokenPayload = buildPaytrTokenPayload({
                config: paytrProviderConfig,
                customer: finalState.customer,
                items: finalState.pricing.items,
                amount: finalState.pricing.totals.total,
                userIp: clientIp,
                merchantOid: preflightPaymentRef
            });
            if (!paytrPayloadBindingsMatch(preflightTokenPayload, finalTokenPayload)) {
                const error = new Error('Ödeme özeti sağlayıcı oturumu hazırlanırken değişti; lütfen yeniden deneyin.');
                error.code = 'PAYMENT_PROVIDER_PAYLOAD_STALE';
                error.statusCode = 409;
                throw error;
            }
        }

        const reservationMetadata = buildReservationMetadata({ paymentMethod });
        const { order, pricing } = await createPendingPaymentOrderFromPricing({
            client,
            pricing: finalState.pricing,
            userId,
            analyticsSessionKey,
            fullName: finalState.customer.fullName,
            email: finalState.customer.email,
            phone: finalState.customer.phone,
            address: finalState.customer.address,
            paymentMethod,
            businessIdentitySnapshot: launchPolicy.identitySnapshot
        });
        const { sellerProjection, platformAllocation, checkoutAgreementSnapshot } = finalState;
        const couponReservation = await reserveCouponUsageForOrder(client, {
            coupon: pricing.coupon,
            orderId: order.id,
            expiresAt: reservationMetadata.reservationExpiresAt
        });

        let paymentProvider = paymentMethod === 'havale' ? 'bank_transfer' : selectedCardPaymentProvider;
        let paymentRef = paymentMethod === 'card' ? preflightPaymentRef : null;
        let paymentStatus = paymentMethod === 'havale'
            ? PAYMENT_STATUS.WAITING_TRANSFER
            : PAYMENT_STATUS.REQUIRES_ACTION;
        let providerResponse = paymentMethod === 'card' ? preflightProviderResponse : null;
        let rawRequestPayload = {
            paymentMethod,
            addressId: normalizedAddressId,
            checkoutAgreementSnapshot,
            couponCode,
            coupon: pricing.coupon,
            couponReservation: couponReservation.reserved
                ? {
                    reservationId: Number(couponReservation.reservation.id),
                    couponId: Number(couponReservation.reservation.coupon_id),
                    status: couponReservation.reservation.status,
                    expiresAt: couponReservation.reservation.expires_at
                }
                : null,
            ...reservationMetadata,
            finalizesOnWebhook: true,
            idempotency: idempotencyContext,
            platformAllocation,
            sellerProjection
        };

        if (paymentMethod === 'havale') {
            paymentRef = `HVL-${order.id}-${crypto.randomBytes(6).toString('hex')}`;
            providerResponse = {
                accountName: launchPolicy.bankTransfer.accountName,
                iban: launchPolicy.bankTransfer.iban,
                dueHours: 24
            };
        } else {
            rawRequestPayload = {
                ...rawRequestPayload,
                paytr: {
                    merchantOid: preflightTokenPayload.merchant_oid,
                    paymentAmount: preflightTokenPayload.payment_amount,
                    userBasket: preflightTokenPayload.user_basket,
                    callbackUrl: paytrProviderConfig.callbackUrl,
                    successUrl: preflightTokenPayload.merchant_ok_url,
                    failUrl: preflightTokenPayload.merchant_fail_url,
                    testMode: preflightTokenPayload.test_mode,
                    debugOn: preflightTokenPayload.debug_on,
                    payloadBindingSha256: buildPaytrPayloadBindingHash(preflightTokenPayload)
                }
            };
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

        await enqueueNotificationEvent(client, {
            eventType: EVENT.ORDER_CREATED,
            aggregateType: 'order',
            aggregateId: order.id,
            sourceEventKey: `ORDER_CREATED:order:${order.id}:payment-init`,
            payload: { source: 'payment_initialize', paymentMethod }
        });

        await client.query('COMMIT');
        transactionOpen = false;

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
        if (client && transactionOpen) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {
                discardClient = true;
            }
            transactionOpen = false;
        }
        const policyError = err instanceof PaymentLaunchPolicyError
            || err instanceof BusinessIdentityConfigError
            || err instanceof LegalDocumentError;
        if (!policyError && err.publicMessage && [401, 503].includes(err.statusCode)) return sendAuthError(res, err);
        const providerError = err instanceof PaymentProviderConfigError || err instanceof PaytrProviderTransportError;
        const transactionConflict = err?.code === '40001' || err?.code === '40P01';
        const statusCode = transactionConflict
            ? 409
            : (providerError || policyError ? err.statusCode : (err.statusCode || 500));
        console.error('\u00D6deme initialize hatas\u0131:', err.code || 'PAYMENT_INITIALIZE_ERROR');
        res.status(statusCode).json({
            code: transactionConflict ? 'PAYMENT_CONCURRENT_STATE_CHANGED' : (err.code || undefined),
            error: transactionConflict
                ? 'Sepet veya stok durumu eşzamanlı olarak değişti. Güncel özeti kontrol edip yeniden deneyin.'
                : providerError
                ? (err.publicMessage || 'Güvenli ödeme hizmeti aktivasyon sürecindedir.')
                : policyError
                    ? err.publicMessage
                    : (statusCode < 500 ? err.message : '\u00D6deme ba\u015Flat\u0131lamad\u0131.')
        });
    } finally {
        preflightClient?.release();
        if (client && idempotencySessionLockHeld && !discardClient) {
            try {
                const unlock = await client.query(
                    'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
                    [heldIdempotencyKey]
                );
                if (unlock.rows?.[0]?.unlocked !== true) discardClient = true;
            } catch (_) {
                discardClient = true;
            }
        }
        client?.release(discardClient ? new Error('PAYMENT_IDEMPOTENCY_LOCK_RELEASE_FAILED') : undefined);
    }
};

const getPaymentStatus = async (req, res) => {
    let client = null;
    let transactionOpen = false;
    try {
        const paymentRef = String(req.query.paymentRef || '').trim();
        const hasOrderId = req.query.orderId !== undefined && String(req.query.orderId).trim() !== '';
        const orderId = hasOrderId ? Number(req.query.orderId) : null;
        const userId = Number(req.user && req.user.id);

        if (!/^[A-Za-z0-9._:-]{1,120}$/.test(paymentRef)) {
            return res.status(400).json({ error: 'Geçerli paymentRef zorunludur.' });
        }
        if (hasOrderId && (!Number.isInteger(orderId) || orderId <= 0)) {
            return res.status(400).json({ error: 'orderId sağlanırsa pozitif tamsayı olmalıdır.' });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        client = await pool.connect();
        await client.query('BEGIN');
        transactionOpen = true;

        const paymentRow = await lockOwnedPaymentAndOrderForStatus(client, {
            paymentRef,
            orderId,
            userId
        });
        if (!paymentRow) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(404).json({ error: '\u00D6deme kayd\u0131 bulunamad\u0131.' });
        }

        const expiration = await expireLockedPaymentReservation(client, paymentRow, {
            now: paymentRow.reservation_checked_at
        });
        await client.query('COMMIT');
        transactionOpen = false;

        res.status(200).json(buildPaymentStatusResponse(expiration.payment));
    } catch (err) {
        if (client && transactionOpen) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}
            transactionOpen = false;
        }
        console.error('\u00D6deme durum kontrol hatas\u0131:', err.code || 'PAYMENT_STATUS_ERROR');
        res.status(500).json({ error: '\u00D6deme durumu kontrol edilemedi.' });
    } finally {
        client?.release();
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
        let plan = planPaymentCallback({
            paymentStatus: payment.status,
            orderStatus: payment.order_status,
            callbackOutcome,
            stockReservationState
        });
        const rawRequest = safeJsonParse(payment.raw_request, {});
        plan = guardActiveCaptureAgreementAllocation(plan, rawRequest);
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

            await finalizeCouponReservationForCapture({
                client,
                payment,
                coupon: rawRequest.coupon,
                provider: 'iyzico',
                providerEventId: eventId,
                paymentRef
            });

            await client.query(
                `UPDATE orders
                 SET payment_status = $1,
                     status = $2,
                     updated_at = NOW()
                 WHERE id = $3`,
                [PAYMENT_STATUS.PAID, ORDER_STATUS.HAZIRLANIYOR, payment.order_id]
            );

            await syncOrderItemsForOrder(client, payment.order_id, parsedItems);
            await materializeSellerOrderProjection(
                client,
                payment.order_id,
                Array.isArray(rawRequest.sellerProjection) ? rawRequest.sellerProjection : []
            );

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
                await releaseCouponReservationForOrder(
                    client,
                    payment.order_id,
                    'PAYMENT_CALLBACK_FAILED'
                );
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

        await enqueuePaymentOutcomeNotifications({
            client,
            payment,
            plan,
            provider: 'iyzico',
            providerEventId: eventId
        });

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
    getCheckoutAgreementPreview,
    getPaymentCapability,
    getPaymentStatus,
    initializePayment,
    normalizePaytrCallbackPayload,
    webhookPaytr,
    webhookIyzico,
    __test: {
        buildCheckoutAgreementContext,
        formatCheckoutAddress,
        guardActiveCaptureAgreementAllocation,
        hasVerifiedStoredCheckoutAgreementAllocation,
        loadOwnedCheckoutAddress,
        normalizeCheckoutAddressId,
        readStoredPaytrAction,
        resetPaytrIframeSessionRequester() {
            paytrIframeSessionRequester = requestPaytrIframeSession;
        },
        setPaytrIframeSessionRequester(requester) {
            if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
                const error = new Error('PayTR test requester overrides are disabled in production.');
                error.code = 'PAYMENT_TEST_HOOK_DISABLED';
                throw error;
            }
            if (typeof requester !== 'function') throw new TypeError('requester must be a function.');
            paytrIframeSessionRequester = requester;
        }
    }
};
