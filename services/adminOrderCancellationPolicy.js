const crypto = require('node:crypto');
const { resolveOrderStatus } = require('../constants/orderStatus');
const { OrderLifecycleError } = require('./orderLifecyclePolicy');

const ADMIN_ORDER_CANCEL_REASON_CODES = Object.freeze([
    'CUSTOMER_REQUEST',
    'DUPLICATE_ORDER',
    'INVENTORY_UNAVAILABLE',
    'DELIVERY_ADDRESS_UNRESOLVED',
    'POLICY_OR_FRAUD_REVIEW'
]);

const ADMIN_ORDER_CANCEL_NOTE_MAX_LENGTH = 300;
const ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MIN_LENGTH = 8;
const ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MAX_LENGTH = 120;
const ADMIN_ORDER_CANCEL_NOTE_REQUIRED_REASONS = Object.freeze([
    'POLICY_OR_FRAUD_REVIEW'
]);

const readRequiredString = (value, { code, message }) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new OrderLifecycleError(message, { code, statusCode: 400 });
    }
    return value.trim();
};

const validateAdminOrderCancellationRequest = (body = {}) => {
    const expectedStatusValue = body.expected_status ?? body.expectedStatus;
    const expectedStatusText = readRequiredString(expectedStatusValue, {
        code: 'ORDER_EXPECTED_STATUS_REQUIRED',
        message: 'Yönetici iptali için expected_status zorunludur.'
    });
    const expectedStatus = resolveOrderStatus(expectedStatusText);
    if (!expectedStatus) {
        throw new OrderLifecycleError('Beklenen sipariş durumu geçersiz.', {
            code: 'ORDER_EXPECTED_STATUS_INVALID',
            statusCode: 400
        });
    }

    const reasonCode = readRequiredString(body.reason_code, {
        code: 'ORDER_CANCEL_REASON_REQUIRED',
        message: 'Yönetici iptali için reason_code zorunludur.'
    }).toUpperCase();
    if (!ADMIN_ORDER_CANCEL_REASON_CODES.includes(reasonCode)) {
        throw new OrderLifecycleError('Yönetici iptal nedeni izin verilen listede değil.', {
            code: 'ORDER_CANCEL_REASON_INVALID',
            statusCode: 400,
            details: { allowedReasonCodes: ADMIN_ORDER_CANCEL_REASON_CODES }
        });
    }

    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
        throw new OrderLifecycleError('İptal notu metin olmalıdır.', {
            code: 'ORDER_CANCEL_NOTE_INVALID',
            statusCode: 400
        });
    }
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(note)) {
        throw new OrderLifecycleError('İptal notu desteklenmeyen kontrol karakteri içeriyor.', {
            code: 'ORDER_CANCEL_NOTE_INVALID',
            statusCode: 400
        });
    }
    if (Array.from(note).length > ADMIN_ORDER_CANCEL_NOTE_MAX_LENGTH) {
        throw new OrderLifecycleError(`İptal notu en fazla ${ADMIN_ORDER_CANCEL_NOTE_MAX_LENGTH} karakter olabilir.`, {
            code: 'ORDER_CANCEL_NOTE_TOO_LONG',
            statusCode: 400,
            details: { maxLength: ADMIN_ORDER_CANCEL_NOTE_MAX_LENGTH }
        });
    }
    if (ADMIN_ORDER_CANCEL_NOTE_REQUIRED_REASONS.includes(reasonCode) && !note) {
        throw new OrderLifecycleError('Politika veya dolandırıcılık incelemesi için açıklama zorunludur.', {
            code: 'ORDER_CANCEL_NOTE_REQUIRED',
            statusCode: 400,
            details: { reasonCode }
        });
    }

    return Object.freeze({ expectedStatus, reasonCode, note });
};

const validateAdminOrderCancellationIdempotencyKey = (value) => {
    if (typeof value !== 'string') {
        throw new OrderLifecycleError('Yönetici iptali için Idempotency-Key zorunludur.', {
            code: 'ORDER_CANCEL_IDEMPOTENCY_KEY_REQUIRED',
            statusCode: 400
        });
    }
    const normalized = value.trim();
    if (
        normalized.length < ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MIN_LENGTH ||
        normalized.length > ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MAX_LENGTH ||
        !/^[A-Za-z0-9._:-]+$/.test(normalized)
    ) {
        throw new OrderLifecycleError('Idempotency-Key geçersiz.', {
            code: 'ORDER_CANCEL_IDEMPOTENCY_KEY_INVALID',
            statusCode: 400,
            details: {
                minLength: ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MIN_LENGTH,
                maxLength: ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MAX_LENGTH
            }
        });
    }
    return normalized;
};

const createAdminOrderCancellationFingerprint = ({ orderId, expectedStatus, reasonCode, note, actor }) => (
    crypto.createHash('sha256').update(JSON.stringify({
        orderId,
        expectedStatus,
        reasonCode,
        note,
        actor: { id: actor.id, role: actor.role }
    })).digest('hex')
);

const createAdminOrderCancellationCommand = ({ orderId, body, idempotencyKey, actor }) => {
    const request = validateAdminOrderCancellationRequest(body);
    const normalizedKey = validateAdminOrderCancellationIdempotencyKey(idempotencyKey);
    const command = {
        ...request,
        idempotencyKey: normalizedKey,
        actor
    };
    command.requestFingerprint = createAdminOrderCancellationFingerprint({ orderId, ...command });
    return Object.freeze(command);
};

const validateAdminOrderCancellationReplay = ({ eventPayload, command }) => {
    const payload = eventPayload && typeof eventPayload === 'object' && !Array.isArray(eventPayload)
        ? eventPayload
        : {};
    const sameActor = Number(payload.actor?.id) === command.actor.id &&
        String(payload.actor?.role || '') === command.actor.role;
    if (
        payload.idempotencyKey !== command.idempotencyKey ||
        payload.requestFingerprint !== command.requestFingerprint ||
        !sameActor
    ) {
        throw new OrderLifecycleError('İptal edilmiş sipariş için aynı güvenli isteğin tekrarı doğrulanamadı.', {
            code: 'ORDER_CANCEL_IDEMPOTENCY_CONFLICT',
            details: { refetchRequired: true }
        });
    }
    return Object.freeze({ reused: true });
};

const toCancellationActor = (req = {}) => {
    const source = req.currentAdmin || req.user || {};
    const id = Number(source.id);
    return Object.freeze({
        id: Number.isInteger(id) ? id : null,
        role: String(source.role || req.user?.role || 'unknown')
    });
};

module.exports = {
    ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MAX_LENGTH,
    ADMIN_ORDER_CANCEL_IDEMPOTENCY_KEY_MIN_LENGTH,
    ADMIN_ORDER_CANCEL_NOTE_MAX_LENGTH,
    ADMIN_ORDER_CANCEL_NOTE_REQUIRED_REASONS,
    ADMIN_ORDER_CANCEL_REASON_CODES,
    createAdminOrderCancellationCommand,
    createAdminOrderCancellationFingerprint,
    toCancellationActor,
    validateAdminOrderCancellationIdempotencyKey,
    validateAdminOrderCancellationReplay,
    validateAdminOrderCancellationRequest
};
