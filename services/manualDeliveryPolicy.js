'use strict';

const crypto = require('node:crypto');
const {
    ORDER_STATUS,
    PAYMENT_STATUS,
    REFUND_STATUS,
    SHIPMENT_STATUS,
    resolveOrderStatus
} = require('../constants/orderStatus');
const { ORDER_COMMAND, assertTransition } = require('./orderLifecyclePolicy');

const MANUAL_DELIVERY_SOURCE = 'admin_manual_delivery_confirmation';
const MANUAL_DELIVERY_SCHEMA_VERSION = 1;
const ALLOWED_BODY_FIELDS = new Set([
    'expected_status',
    'expected_shipment_status',
    'delivery_confirmed',
    'provider',
    'tracking_no'
]);

class ManualDeliveryError extends Error {
    constructor(message, { code, statusCode = 409, details = null } = {}) {
        super(message);
        this.name = 'ManualDeliveryError';
        this.code = code || 'MANUAL_DELIVERY_CONFLICT';
        this.statusCode = statusCode;
        this.details = details;
    }
}

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
};

const requiredText = (value, { field, minLength, maxLength, pattern, code }) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (
        normalized.length < minLength
        || normalized.length > maxLength
        || /[\u0000-\u001f\u007f]/u.test(normalized)
        || (pattern && !pattern.test(normalized))
    ) {
        throw new ManualDeliveryError(`${field} geçersiz.`, {
            code,
            statusCode: 400,
            details: { field, minLength, maxLength }
        });
    }
    return normalized;
};

const fingerprint = (value) => crypto
    .createHash('sha256')
    .update(stableStringify(value))
    .digest('hex');

const normalizeManualDeliveryCommand = ({ orderId, idempotencyKey, body, actor }) => {
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        throw new ManualDeliveryError('Geçersiz sipariş kimliği.', {
            code: 'MANUAL_DELIVERY_ORDER_ID_INVALID',
            statusCode: 400
        });
    }
    if (!actor || !Number.isSafeInteger(Number(actor.id)) || actor.role !== 'admin') {
        throw new ManualDeliveryError('Teslim doğrulaması için güncel admin yetkisi gerekir.', {
            code: 'MANUAL_DELIVERY_ADMIN_REQUIRED',
            statusCode: 403
        });
    }

    const requestBody = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const unsupportedFields = Object.keys(requestBody).filter((key) => !ALLOWED_BODY_FIELDS.has(key));
    if (unsupportedFields.length > 0) {
        throw new ManualDeliveryError('İstek desteklenmeyen alanlar içeriyor.', {
            code: 'MANUAL_DELIVERY_UNSUPPORTED_FIELD',
            statusCode: 400,
            details: { fields: unsupportedFields.sort() }
        });
    }

    const normalizedIdempotencyKey = requiredText(idempotencyKey, {
        field: 'Idempotency-Key',
        minLength: 8,
        maxLength: 120,
        pattern: /^[A-Za-z0-9._:-]+$/u,
        code: 'MANUAL_DELIVERY_IDEMPOTENCY_KEY_INVALID'
    });
    const expectedStatus = resolveOrderStatus(requestBody.expected_status);
    if (expectedStatus !== ORDER_STATUS.KARGOYA_VERILDI) {
        throw new ManualDeliveryError('expected_status yalnızca Kargoya Verildi olabilir.', {
            code: 'MANUAL_DELIVERY_EXPECTED_STATUS_INVALID',
            statusCode: 400
        });
    }
    const expectedShipmentStatus = String(requestBody.expected_shipment_status || '').trim().toUpperCase();
    if (expectedShipmentStatus !== SHIPMENT_STATUS.IN_TRANSIT) {
        throw new ManualDeliveryError('expected_shipment_status yalnızca IN_TRANSIT olabilir.', {
            code: 'MANUAL_DELIVERY_EXPECTED_SHIPMENT_STATUS_INVALID',
            statusCode: 400
        });
    }
    if (requestBody.delivery_confirmed !== true) {
        throw new ManualDeliveryError('delivery_confirmed tam olarak true olmalıdır.', {
            code: 'MANUAL_DELIVERY_CONFIRMATION_REQUIRED',
            statusCode: 400
        });
    }
    const provider = requiredText(requestBody.provider, {
        field: 'provider',
        minLength: 2,
        maxLength: 80,
        pattern: /^[\p{L}\p{N} .()_-]+$/u,
        code: 'MANUAL_DELIVERY_PROVIDER_INVALID'
    });
    const trackingNo = requiredText(requestBody.tracking_no, {
        field: 'tracking_no',
        minLength: 3,
        maxLength: 120,
        pattern: /^[A-Za-z0-9._/-]+$/u,
        code: 'MANUAL_DELIVERY_TRACKING_NO_INVALID'
    });
    if (/:\/\//u.test(trackingNo)) {
        throw new ManualDeliveryError('tracking_no bir bağlantı içeremez.', {
            code: 'MANUAL_DELIVERY_TRACKING_NO_INVALID',
            statusCode: 400
        });
    }

    const command = {
        orderId,
        idempotencyKey: normalizedIdempotencyKey,
        expectedStatus,
        expectedShipmentStatus,
        deliveryConfirmed: true,
        provider,
        trackingNo,
        actor: Object.freeze({ id: Number(actor.id), role: actor.role })
    };
    command.requestFingerprint = fingerprint(command);
    return Object.freeze(command);
};

const planManualDelivery = ({ order, shipment, command }) => {
    const currentStatus = resolveOrderStatus(order?.status);
    if (currentStatus !== command.expectedStatus) {
        throw new ManualDeliveryError('Sipariş durumu başka bir işlem tarafından değiştirildi.', {
            code: 'ORDER_STATUS_CONFLICT',
            details: {
                expectedStatus: command.expectedStatus,
                currentStatus,
                refetchRequired: true
            }
        });
    }
    assertTransition({
        command: ORDER_COMMAND.DELIVERY_CONFIRM,
        currentStatus,
        nextStatus: ORDER_STATUS.TESLIM_EDILDI
    });
    if (String(order?.payment_status || '').trim().toUpperCase() !== PAYMENT_STATUS.PAID) {
        throw new ManualDeliveryError('Siparişin ödeme durumu PAID değil.', {
            code: 'MANUAL_DELIVERY_PAYMENT_NOT_PAID'
        });
    }
    if (String(order?.refund_status || '').trim().toUpperCase() !== REFUND_STATUS.NONE) {
        throw new ManualDeliveryError('Geri ödeme süreci bulunan sipariş teslim edilemez.', {
            code: 'MANUAL_DELIVERY_REFUND_CONFLICT'
        });
    }
    if (!shipment) {
        throw new ManualDeliveryError('Teslim doğrulaması için mevcut gönderi kaydı gerekir.', {
            code: 'MANUAL_DELIVERY_SHIPMENT_MISSING'
        });
    }
    const orderShipmentStatus = String(order?.shipment_status || '').trim().toUpperCase();
    const shipmentStatus = String(shipment.shipment_status || '').trim().toUpperCase();
    if (
        orderShipmentStatus !== command.expectedShipmentStatus
        || shipmentStatus !== command.expectedShipmentStatus
    ) {
        throw new ManualDeliveryError('Gönderi durumu IN_TRANSIT değil.', {
            code: 'MANUAL_DELIVERY_SHIPMENT_STATUS_CONFLICT',
            details: { orderShipmentStatus, shipmentStatus, refetchRequired: true }
        });
    }
    const fieldsMatch = String(order.shipment_provider || '').trim() === command.provider
        && String(shipment.provider || '').trim() === command.provider
        && String(order.tracking_no || '').trim() === command.trackingNo
        && String(shipment.tracking_no || '').trim() === command.trackingNo;
    if (!fieldsMatch) {
        throw new ManualDeliveryError('Taşıyıcı veya takip numarası mevcut gönderiyle eşleşmiyor.', {
            code: 'MANUAL_DELIVERY_TRACKING_CONFLICT',
            details: { refetchRequired: true }
        });
    }
    return Object.freeze({
        nextOrderStatus: ORDER_STATUS.TESLIM_EDILDI,
        nextShipmentStatus: SHIPMENT_STATUS.DELIVERED
    });
};

const buildManualDeliveryEventPayload = ({ command, sellerProjection, now = new Date().toISOString() }) => ({
    source: MANUAL_DELIVERY_SOURCE,
    schemaVersion: MANUAL_DELIVERY_SCHEMA_VERSION,
    command: ORDER_COMMAND.DELIVERY_CONFIRM,
    idempotencyKey: command.idempotencyKey,
    requestFingerprint: command.requestFingerprint,
    actor: command.actor,
    before: {
        orderStatus: command.expectedStatus,
        shipmentStatus: command.expectedShipmentStatus
    },
    after: {
        orderStatus: ORDER_STATUS.TESLIM_EDILDI,
        shipmentStatus: SHIPMENT_STATUS.DELIVERED
    },
    deliveryConfirmed: true,
    provider: command.provider,
    trackingHash: fingerprint(command.trackingNo),
    trackingLast4: command.trackingNo.slice(-4),
    sellerProjection,
    confirmedAt: now
});

const validateManualDeliveryReplay = ({ order, shipment, eventPayload, command, sellerProjection }) => {
    const stored = eventPayload && typeof eventPayload === 'object' ? eventPayload : null;
    const sameAuthority = stored
        && stored.source === MANUAL_DELIVERY_SOURCE
        && Number(stored.schemaVersion) === MANUAL_DELIVERY_SCHEMA_VERSION
        && stored.command === ORDER_COMMAND.DELIVERY_CONFIRM
        && stored.idempotencyKey === command.idempotencyKey
        && stored.requestFingerprint === command.requestFingerprint
        && Number(stored.actor?.id) === command.actor.id
        && stored.actor?.role === command.actor.role;
    const finalState = resolveOrderStatus(order?.status) === ORDER_STATUS.TESLIM_EDILDI
        && String(order?.shipment_status || '').trim().toUpperCase() === SHIPMENT_STATUS.DELIVERED
        && String(shipment?.shipment_status || '').trim().toUpperCase() === SHIPMENT_STATUS.DELIVERED
        && String(order?.shipment_provider || '').trim() === command.provider
        && String(shipment?.provider || '').trim() === command.provider
        && String(order?.tracking_no || '').trim() === command.trackingNo
        && String(shipment?.tracking_no || '').trim() === command.trackingNo
        && sellerProjection?.consistent === true;
    if (!sameAuthority || !finalState) {
        throw new ManualDeliveryError('Teslim doğrulaması bu Idempotency-Key ile güvenli biçimde yeniden kullanılamaz.', {
            code: 'MANUAL_DELIVERY_IDEMPOTENCY_CONFLICT',
            details: { refetchRequired: true }
        });
    }
    return Object.freeze({ reused: true });
};

module.exports = {
    ALLOWED_BODY_FIELDS,
    MANUAL_DELIVERY_SCHEMA_VERSION,
    MANUAL_DELIVERY_SOURCE,
    ManualDeliveryError,
    buildManualDeliveryEventPayload,
    normalizeManualDeliveryCommand,
    planManualDelivery,
    validateManualDeliveryReplay
};
