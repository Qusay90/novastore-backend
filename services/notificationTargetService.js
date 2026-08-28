const NOTIFICATION_ENTITY_TYPES = Object.freeze([
    'order',
    'payment',
    'product',
    'product_question',
    'return_request',
    'review',
    'seller_application',
    'shipment',
    'store',
    'support_thread'
]);

const notificationEntityTypes = new Set(NOTIFICATION_ENTITY_TYPES);
const ALLOWED_TARGET_FIELDS = new Set([
    'entityType',
    'entityId',
    'entityKey',
    'entity_type',
    'entity_id',
    'entity_key'
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

class NotificationTargetError extends TypeError {
    constructor(message, code = 'NOTIFICATION_TARGET_INVALID') {
        super(message);
        this.name = 'NotificationTargetError';
        this.code = code;
        this.statusCode = 400;
    }
}

const readAliasedTargetField = (target, camelName, snakeName) => {
    const hasCamel = Object.prototype.hasOwnProperty.call(target, camelName);
    const hasSnake = Object.prototype.hasOwnProperty.call(target, snakeName);
    if (hasCamel && hasSnake && target[camelName] !== target[snakeName]) {
        throw new NotificationTargetError('Bildirim hedefi birbiriyle çelişen alanlar içeriyor.');
    }
    return hasCamel ? target[camelName] : target[snakeName];
};

const normalizeNotificationTarget = (target) => {
    if (target === undefined || target === null) return null;
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
        throw new NotificationTargetError('Bildirim hedefi bir nesne olmalıdır.');
    }

    const unsupported = Object.keys(target).filter((field) => !ALLOWED_TARGET_FIELDS.has(field));
    if (unsupported.length > 0) {
        throw new NotificationTargetError(
            'Bildirim hedefi yalnız entityType ve entityId alanlarını kabul eder.',
            'NOTIFICATION_TARGET_FIELD_REJECTED'
        );
    }

    const entityType = String(readAliasedTargetField(target, 'entityType', 'entity_type') || '')
        .trim()
        .toLowerCase();
    const rawEntityId = readAliasedTargetField(target, 'entityId', 'entity_id');
    const entityId = rawEntityId === undefined || rawEntityId === null || rawEntityId === ''
        ? null
        : Number(rawEntityId);
    const entityKey = String(readAliasedTargetField(target, 'entityKey', 'entity_key') || '').trim().toLowerCase() || null;

    if (!notificationEntityTypes.has(entityType)) {
        throw new NotificationTargetError(
            'Bildirim hedef türü izin verilen listede değil.',
            'NOTIFICATION_TARGET_TYPE_REJECTED'
        );
    }
    if (entityType === 'seller_application') {
        if (entityId !== null || !entityKey || !UUID_PATTERN.test(entityKey)) {
            throw new NotificationTargetError(
                'Satıcı başvurusu hedefi geçerli bir entityKey içermelidir.',
                'NOTIFICATION_TARGET_KEY_INVALID'
            );
        }
        return Object.freeze({ entityType, entityKey });
    }
    if (entityKey !== null || !Number.isSafeInteger(entityId) || entityId <= 0) {
        throw new NotificationTargetError(
            'Bildirim hedef kimliği pozitif bir tam sayı olmalıdır.',
            'NOTIFICATION_TARGET_ID_INVALID'
        );
    }

    return Object.freeze({ entityType, entityId });
};

module.exports = {
    NOTIFICATION_ENTITY_TYPES,
    NotificationTargetError,
    normalizeNotificationTarget
};
