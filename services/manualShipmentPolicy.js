const crypto = require('node:crypto');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    SHIPMENT_STATUS,
    resolveOrderStatus
} = require('../constants/orderStatus');
const {
    ORDER_COMMAND,
    STOCK_RESERVATION_STATE,
    assertTransition,
    getStockReservationState,
    safeJsonObject
} = require('./orderLifecyclePolicy');

const MANUAL_SHIPMENT_SOURCE = 'admin_manual_fulfillment';
const MANUAL_SHIPMENT_SCHEMA_VERSION = 1;

const ALLOWED_BODY_FIELDS = new Set([
    'expected_status',
    'expectedStatus',
    'handoff_confirmed',
    'handoffConfirmed',
    'provider',
    'tracking_no',
    'trackingNo'
]);

const PROHIBITED_BODY_FIELDS = new Set([
    'tracking_url',
    'trackingUrl',
    'label_url',
    'labelUrl',
    'carrier_payload',
    'carrierPayload',
    'raw_payload',
    'rawPayload'
]);

class ManualShipmentError extends Error {
    constructor(message, { code, statusCode = 409, details = null } = {}) {
        super(message);
        this.name = 'ManualShipmentError';
        this.code = code || 'MANUAL_SHIPMENT_CONFLICT';
        this.statusCode = statusCode;
        this.details = details;
    }
}

const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
};

const cleanRequiredText = (value, {
    field,
    minLength,
    maxLength,
    pattern = null,
    code
}) => {
    if (typeof value !== 'string') {
        throw new ManualShipmentError(`${field} geçersiz.`, {
            code,
            statusCode: 400,
            details: { field, minLength, maxLength }
        });
    }
    const normalized = String(value ?? '').trim();
    if (
        normalized.length < minLength ||
        normalized.length > maxLength ||
        /[\u0000-\u001f\u007f]/.test(normalized) ||
        (pattern && !pattern.test(normalized))
    ) {
        throw new ManualShipmentError(`${field} geçersiz.`, {
            code,
            statusCode: 400,
            details: { field, minLength, maxLength }
        });
    }
    return normalized;
};

const readAliasedField = (body, snakeCaseName, camelCaseName) => {
    const hasSnakeCase = Object.prototype.hasOwnProperty.call(body, snakeCaseName);
    const hasCamelCase = Object.prototype.hasOwnProperty.call(body, camelCaseName);
    if (hasSnakeCase && hasCamelCase && body[snakeCaseName] !== body[camelCaseName]) {
        throw new ManualShipmentError(`${snakeCaseName} birbiriyle çelişen iki değer içeremez.`, {
            code: 'MANUAL_SHIPMENT_AMBIGUOUS_FIELD',
            statusCode: 400,
            details: { field: snakeCaseName }
        });
    }
    return hasSnakeCase ? body[snakeCaseName] : body[camelCaseName];
};

const createRequestFingerprint = ({ orderId, expectedStatus, provider, trackingNo, handoffConfirmed }) => (
    crypto.createHash('sha256').update(stableStringify({
        orderId,
        expectedStatus,
        provider,
        trackingNo,
        handoffConfirmed
    })).digest('hex')
);

const normalizeManualShipmentCommand = ({ orderId, idempotencyKey, body, actor }) => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
        throw new ManualShipmentError('Geçersiz sipariş kimliği.', {
            code: 'MANUAL_SHIPMENT_ORDER_ID_INVALID',
            statusCode: 400
        });
    }
    if (!actor || !Number.isInteger(Number(actor.id)) || actor.role !== 'admin') {
        throw new ManualShipmentError('Manuel kargo kaydı için güncel admin yetkisi gerekir.', {
            code: 'MANUAL_SHIPMENT_ADMIN_REQUIRED',
            statusCode: 403
        });
    }

    const requestBody = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const prohibitedFields = Object.keys(requestBody).filter((key) => PROHIBITED_BODY_FIELDS.has(key));
    if (prohibitedFields.length > 0) {
        throw new ManualShipmentError('Takip bağlantısı, etiket veya taşıyıcı payload alanı kabul edilmez.', {
            code: 'MANUAL_SHIPMENT_CARRIER_FIELDS_REJECTED',
            statusCode: 400,
            details: { fields: prohibitedFields.sort() }
        });
    }
    const unsupportedFields = Object.keys(requestBody).filter((key) => !ALLOWED_BODY_FIELDS.has(key));
    if (unsupportedFields.length > 0) {
        throw new ManualShipmentError('İstek desteklenmeyen alanlar içeriyor.', {
            code: 'MANUAL_SHIPMENT_UNSUPPORTED_FIELD',
            statusCode: 400,
            details: { fields: unsupportedFields.sort() }
        });
    }

    const normalizedIdempotencyKey = cleanRequiredText(idempotencyKey, {
        field: 'Idempotency-Key',
        minLength: 8,
        maxLength: 120,
        pattern: /^[A-Za-z0-9._:-]+$/,
        code: 'MANUAL_SHIPMENT_IDEMPOTENCY_KEY_INVALID'
    });
    const provider = cleanRequiredText(requestBody.provider, {
        field: 'provider',
        minLength: 2,
        maxLength: 80,
        pattern: /^[\p{L}\p{N} .()_-]+$/u,
        code: 'MANUAL_SHIPMENT_PROVIDER_INVALID'
    });
    const trackingNo = cleanRequiredText(
        readAliasedField(requestBody, 'tracking_no', 'trackingNo'),
        {
            field: 'tracking_no',
            minLength: 3,
            maxLength: 120,
            pattern: /^[A-Za-z0-9._/-]+$/,
            code: 'MANUAL_SHIPMENT_TRACKING_NO_INVALID'
        }
    );
    if (/:\/\//.test(trackingNo)) {
        throw new ManualShipmentError('tracking_no bir bağlantı içeremez.', {
            code: 'MANUAL_SHIPMENT_TRACKING_NO_INVALID',
            statusCode: 400,
            details: { field: 'tracking_no' }
        });
    }

    const expectedRaw = readAliasedField(requestBody, 'expected_status', 'expectedStatus');
    if (expectedRaw === undefined || expectedRaw === null || String(expectedRaw).trim() === '') {
        throw new ManualShipmentError('expected_status zorunludur.', {
            code: 'MANUAL_SHIPMENT_EXPECTED_STATUS_REQUIRED',
            statusCode: 400
        });
    }
    const expectedStatus = resolveOrderStatus(expectedRaw);
    if (expectedStatus !== ORDER_STATUS.HAZIRLANIYOR) {
        throw new ManualShipmentError('expected_status yalnızca Hazırlanıyor olabilir.', {
            code: 'MANUAL_SHIPMENT_EXPECTED_STATUS_INVALID',
            statusCode: 400
        });
    }

    const handoffConfirmed = readAliasedField(requestBody, 'handoff_confirmed', 'handoffConfirmed');
    if (handoffConfirmed !== true) {
        throw new ManualShipmentError('handoff_confirmed tam olarak true olmalıdır.', {
            code: 'MANUAL_SHIPMENT_HANDOFF_CONFIRMATION_REQUIRED',
            statusCode: 400
        });
    }

    const command = {
        orderId,
        idempotencyKey: normalizedIdempotencyKey,
        expectedStatus,
        provider,
        trackingNo,
        handoffConfirmed: true,
        actor: Object.freeze({ id: Number(actor.id), role: actor.role })
    };
    command.requestFingerprint = createRequestFingerprint(command);
    return Object.freeze(command);
};

const hasOpenPaymentReconciliation = (payment = {}) => {
    const metadata = safeJsonObject(payment.raw_request);
    const task = metadata.reconciliationTask;
    const taskStatus = task && typeof task === 'object'
        ? String(task.status || '').trim().toUpperCase()
        : '';
    const taskIsOpenOrUnknown = Boolean(task) && !['CLOSED', 'RESOLVED', 'COMPLETED'].includes(taskStatus);
    return metadata.reconciliationRequired === true || taskIsOpenOrUnknown;
};

const selectFulfillmentPayment = ({ order, payments }) => {
    const rows = Array.isArray(payments) ? payments : [];
    if (rows.length === 0) {
        throw new ManualShipmentError('Gönderim için ödeme ve stok kanıtı bulunamadı.', {
            code: 'MANUAL_SHIPMENT_PAYMENT_PROOF_MISSING'
        });
    }
    if (rows.some(hasOpenPaymentReconciliation)) {
        throw new ManualShipmentError('Açık ödeme mutabakatı bulunan sipariş gönderilemez.', {
            code: 'MANUAL_SHIPMENT_RECONCILIATION_OPEN'
        });
    }

    const activePaymentRef = String(order?.payment_ref || '').trim();
    if (!activePaymentRef) {
        throw new ManualShipmentError('Siparişin aktif ödeme referansı bulunamadı.', {
            code: 'MANUAL_SHIPMENT_ACTIVE_PAYMENT_REF_MISSING'
        });
    }
    const activeRows = rows.filter((payment) => (
        String(payment?.payment_ref || '').trim() === activePaymentRef
    ));
    if (activeRows.length !== 1) {
        throw new ManualShipmentError('Siparişin tekil aktif ödeme kaydı doğrulanamadı.', {
            code: 'MANUAL_SHIPMENT_ACTIVE_PAYMENT_INVALID',
            details: {
                paymentIds: activeRows.map((payment) => Number(payment.id)).filter(Number.isInteger)
            }
        });
    }

    const activePayment = activeRows[0];
    if (String(activePayment.status || '').trim().toUpperCase() !== PAYMENT_STATUS.PAID) {
        throw new ManualShipmentError('Aktif ödeme tahsil edilmiş durumda değil.', {
            code: 'MANUAL_SHIPMENT_PAYMENT_NOT_PAID'
        });
    }
    if (getStockReservationState(activePayment) !== STOCK_RESERVATION_STATE.RESERVED) {
        throw new ManualShipmentError('Aktif ödemenin stok rezervasyonu doğrulanamadı.', {
            code: 'MANUAL_SHIPMENT_STOCK_RESERVATION_INVALID'
        });
    }

    const inactiveConflicts = rows.filter((payment) => {
        if (payment === activePayment) return false;
        const status = String(payment?.status || '').trim().toUpperCase();
        const reservationState = getStockReservationState(payment);
        return ![PAYMENT_STATUS.FAILED, PAYMENT_STATUS.REFUNDED].includes(status) ||
            ![STOCK_RESERVATION_STATE.UNRESERVED, STOCK_RESERVATION_STATE.RELEASED].includes(reservationState);
    });
    if (inactiveConflicts.length > 0) {
        throw new ManualShipmentError('Ödeme geçmişinde sonuçlanmamış veya stok kanıtı belirsiz kayıt var.', {
            code: 'MANUAL_SHIPMENT_PAYMENT_HISTORY_CONFLICT',
            details: {
                paymentIds: inactiveConflicts.map((payment) => Number(payment.id)).filter(Number.isInteger)
            }
        });
    }
    return activePayment;
};

const planManualShipment = ({ order, payments, command }) => {
    const currentStatus = resolveOrderStatus(order?.status);
    if (!currentStatus) {
        throw new ManualShipmentError('Sipariş durumu tanınmıyor; manuel inceleme gerekli.', {
            code: 'MANUAL_SHIPMENT_ORDER_STATUS_UNKNOWN'
        });
    }
    if (currentStatus !== command.expectedStatus) {
        throw new ManualShipmentError('Sipariş durumu başka bir işlem tarafından değiştirildi.', {
            code: 'ORDER_STATUS_CONFLICT',
            details: {
                expectedStatus: command.expectedStatus,
                currentStatus,
                refetchRequired: true
            }
        });
    }
    assertTransition({
        command: ORDER_COMMAND.SHIPMENT_CREATE,
        currentStatus,
        nextStatus: ORDER_STATUS.KARGOYA_VERILDI
    });

    const shipmentStatus = String(order?.shipment_status || '').trim().toUpperCase();
    const shipmentProvider = String(order?.shipment_provider || '').trim();
    const trackingNo = String(order?.tracking_no || '').trim();
    if (shipmentStatus !== SHIPMENT_STATUS.NONE || shipmentProvider || trackingNo) {
        throw new ManualShipmentError('Siparişin kargo alanları yeni manuel gönderim kaydıyla uyumlu değil.', {
            code: 'MANUAL_SHIPMENT_ORDER_SHIPMENT_CONFLICT',
            details: {
                shipmentStatus: shipmentStatus || null,
                hasShipmentProvider: Boolean(shipmentProvider),
                hasTrackingNo: Boolean(trackingNo),
                refetchRequired: true
            }
        });
    }

    if (String(order?.payment_status || '').trim().toUpperCase() !== PAYMENT_STATUS.PAID) {
        throw new ManualShipmentError('Siparişin ödeme durumu PAID değil.', {
            code: 'MANUAL_SHIPMENT_ORDER_PAYMENT_NOT_PAID'
        });
    }
    if (String(order?.refund_status || '').trim().toUpperCase() !== REFUND_STATUS.NONE) {
        throw new ManualShipmentError('Geri ödeme süreci bulunan sipariş gönderilemez.', {
            code: 'MANUAL_SHIPMENT_REFUND_CONFLICT'
        });
    }

    const activePayment = selectFulfillmentPayment({ order, payments });
    return Object.freeze({
        currentStatus,
        nextStatus: ORDER_STATUS.KARGOYA_VERILDI,
        shipmentStatus: SHIPMENT_STATUS.IN_TRANSIT,
        activePaymentId: Number(activePayment.id)
    });
};

const parseShipmentMetadata = (rawPayload) => safeJsonObject(rawPayload);

const decideManualShipmentReplay = ({ existingShipment, command }) => {
    if (!existingShipment) return Object.freeze({ reused: false });

    const metadata = parseShipmentMetadata(existingShipment.raw_payload);
    const storedKey = String(metadata.idempotencyKey || '').trim();
    if (storedKey !== command.idempotencyKey) {
        throw new ManualShipmentError('Sipariş için farklı bir manuel kargo kaydı zaten var.', {
            code: 'MANUAL_SHIPMENT_ALREADY_EXISTS',
            details: { shipmentId: Number(existingShipment.id) || null }
        });
    }

    const storedActorId = Number(metadata.actor?.id ?? metadata.actorId);
    const storedActorRole = String(metadata.actor?.role ?? metadata.actorRole ?? '').trim();
    const sameActor = storedActorId === command.actor.id && storedActorRole === command.actor.role;
    const sameFingerprint = metadata.requestFingerprint === command.requestFingerprint;
    const sameStoredFields = String(existingShipment.provider || '').trim() === command.provider &&
        String(existingShipment.tracking_no || '').trim() === command.trackingNo &&
        !existingShipment.tracking_url &&
        !existingShipment.label_url &&
        String(existingShipment.shipment_status || '').trim().toUpperCase() === SHIPMENT_STATUS.IN_TRANSIT;
    const sameManualContract = metadata.source === MANUAL_SHIPMENT_SOURCE &&
        Number(metadata.schemaVersion) === MANUAL_SHIPMENT_SCHEMA_VERSION &&
        metadata.handoffConfirmed === true &&
        metadata.carrierApiExecuted === false &&
        metadata.carrierConfirmed === false &&
        metadata.labelGenerated === false;
    if (!sameActor || !sameFingerprint || !sameStoredFields || !sameManualContract) {
        throw new ManualShipmentError('Idempotency-Key farklı aktör veya istek içeriğiyle yeniden kullanılamaz.', {
            code: 'MANUAL_SHIPMENT_IDEMPOTENCY_CONFLICT',
            details: { shipmentId: Number(existingShipment.id) || null }
        });
    }
    return Object.freeze({ reused: true });
};

const buildManualShipmentMetadata = ({ command, now = new Date().toISOString() }) => ({
    source: MANUAL_SHIPMENT_SOURCE,
    schemaVersion: MANUAL_SHIPMENT_SCHEMA_VERSION,
    idempotencyKey: command.idempotencyKey,
    requestFingerprint: command.requestFingerprint,
    actor: {
        id: command.actor.id,
        role: command.actor.role
    },
    expectedStatus: command.expectedStatus,
    handoffConfirmed: command.handoffConfirmed,
    provider: command.provider,
    trackingHash: crypto.createHash('sha256').update(command.trackingNo).digest('hex'),
    trackingLast4: command.trackingNo.slice(-4),
    carrierApiExecuted: false,
    carrierConfirmed: false,
    labelGenerated: false,
    recordedAt: now
});

module.exports = {
    MANUAL_SHIPMENT_SCHEMA_VERSION,
    MANUAL_SHIPMENT_SOURCE,
    ManualShipmentError,
    buildManualShipmentMetadata,
    createRequestFingerprint,
    decideManualShipmentReplay,
    hasOpenPaymentReconciliation,
    normalizeManualShipmentCommand,
    planManualShipment,
    selectFulfillmentPayment,
    stableStringify
};
