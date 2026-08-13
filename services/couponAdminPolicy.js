const COUPON_DISCOUNT_TYPES = Object.freeze(['PERCENT', 'FIXED']);
const COUPON_ADMIN_STATUSES = Object.freeze([
    'disabled',
    'scheduled',
    'expired',
    'exhausted',
    'active'
]);
const COUPON_ADMIN_ACTIONS = Object.freeze(['create', 'update', 'activate', 'deactivate']);

const CREATE_FIELDS = new Set([
    'code',
    'discount_type',
    'discount_value',
    'min_order_amount',
    'max_discount_amount',
    'usage_limit',
    'starts_at',
    'ends_at',
    'is_active'
]);
const UPDATE_FIELDS = new Set([...CREATE_FIELDS, 'expected_revision']);
const STATUS_FIELDS = new Set(['expected_revision', 'is_active']);
const NULLABLE_FIELDS = new Set([
    'max_discount_amount',
    'usage_limit',
    'starts_at',
    'ends_at'
]);
const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

class CouponAdminError extends Error {
    constructor(message, { code = 'COUPON_ADMIN_INVALID', statusCode = 400, details } = {}) {
        super(message);
        this.name = 'CouponAdminError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

const error = (message, code, statusCode = 400, details) => new CouponAdminError(message, {
    code,
    statusCode,
    details
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const assertPlainObject = (value) => {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw error('Kupon isteği bir JSON nesnesi olmalıdır.', 'COUPON_PAYLOAD_INVALID');
    }
    return value;
};

const assertAllowedFields = (body, allowed) => {
    const unknownFields = Object.keys(body).filter((field) => !allowed.has(field)).sort();
    if (unknownFields.length > 0) {
        throw error('Kupon isteği izin verilmeyen alan içeriyor.', 'COUPON_FIELD_NOT_ALLOWED', 400, {
            unknownFields: Object.freeze(unknownFields)
        });
    }
};

const normalizeCouponId = (value) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw error('Geçersiz kupon kimliği.', 'COUPON_ID_INVALID');
    }
    return id;
};

const normalizeCouponAdminActor = (actor) => {
    const id = Number(actor?.id);
    if (!Number.isSafeInteger(id) || id < 1 || actor?.role !== 'admin') {
        throw error('Kupon işlemi için güncel yönetici kimliği zorunludur.', 'COUPON_ADMIN_ACTOR_INVALID', 403);
    }
    return Object.freeze({ id, role: 'admin' });
};

const normalizeCouponRevision = (value, { required = true, field = 'expected_revision' } = {}) => {
    if (value === undefined || value === null || value === '') {
        if (!required) return null;
        throw error(`${field} zorunludur.`, 'COUPON_PRECONDITION_REQUIRED', 428, {
            refetchRequired: true
        });
    }
    const revision = Number(value);
    if (!Number.isSafeInteger(revision) || revision < 1) {
        throw error(`${field} pozitif güvenli tam sayı olmalıdır.`, 'COUPON_REVISION_INVALID');
    }
    return revision;
};

const assertCouponRevisionMatches = (currentValue, expectedValue) => {
    const currentRevision = normalizeCouponRevision(currentValue, { field: 'current_revision' });
    const expectedRevision = normalizeCouponRevision(expectedValue);
    if (currentRevision !== expectedRevision) {
        throw error('Kupon başka bir işlem tarafından güncellendi.', 'COUPON_REVISION_CONFLICT', 409, {
            refetchRequired: true,
            expectedRevision,
            currentRevision
        });
    }
    return currentRevision;
};

const normalizeCouponCode = (value) => {
    if (typeof value !== 'string') {
        throw error('Kupon kodu metin olmalıdır.', 'COUPON_CODE_INVALID');
    }
    const code = value.trim().toUpperCase();
    if (!COUPON_CODE_PATTERN.test(code)) {
        throw error('Kupon kodu 3-64 karakter ve yalnızca A-Z, 0-9, _ veya - içermelidir.', 'COUPON_CODE_INVALID');
    }
    return code;
};

const normalizeDiscountType = (value) => {
    if (typeof value !== 'string') {
        throw error('İndirim türü metin olmalıdır.', 'COUPON_DISCOUNT_TYPE_INVALID');
    }
    const discountType = value.trim().toUpperCase();
    if (!COUPON_DISCOUNT_TYPES.includes(discountType)) {
        throw error('İndirim türü PERCENT veya FIXED olmalıdır.', 'COUPON_DISCOUNT_TYPE_INVALID');
    }
    return discountType;
};

const normalizeMoneyInput = (value, field, { positive = false, nullable = false } = {}) => {
    if (nullable && value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw error(`${field} sonlu bir sayı olmalıdır.`, 'COUPON_AMOUNT_INVALID', 400, { field });
    }
    if (positive ? value <= 0 : value < 0) {
        throw error(`${field} ${positive ? 'sıfırdan büyük' : 'negatif olmayan'} bir sayı olmalıdır.`, 'COUPON_AMOUNT_INVALID', 400, { field });
    }
    if (value > 99_999_999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) {
        throw error(`${field} en fazla iki ondalık basamak içermelidir.`, 'COUPON_AMOUNT_INVALID', 400, { field });
    }
    return Number(value.toFixed(2));
};

const normalizeUsageLimitInput = (value) => {
    if (value === null) return null;
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
        throw error('usage_limit pozitif güvenli tam sayı veya null olmalıdır.', 'COUPON_USAGE_LIMIT_INVALID');
    }
    return value;
};

const normalizeTimestampInput = (value, field) => {
    if (value === null) return null;
    if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value.trim())) {
        throw error(`${field} saat dilimi içeren ISO-8601 zaman damgası veya null olmalıdır.`, 'COUPON_DATE_INVALID', 400, { field });
    }
    const input = value.trim();
    const parsed = new Date(input);
    if (!Number.isFinite(parsed.getTime())) {
        throw error(`${field} geçerli bir zaman damgası olmalıdır.`, 'COUPON_DATE_INVALID', 400, { field });
    }
    const calendar = input.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {
        throw error(`${field} geçerli bir takvim tarihi olmalıdır.`, 'COUPON_DATE_INVALID', 400, { field });
    }
    return parsed.toISOString();
};

const normalizeBooleanInput = (value, field = 'is_active') => {
    if (typeof value !== 'boolean') {
        throw error(`${field} boolean olmalıdır.`, 'COUPON_BOOLEAN_INVALID', 400, { field });
    }
    return value;
};

const normalizeRequestId = (value) => {
    const requestId = String(value || '').trim();
    if (!requestId) return null;
    if (requestId.length > 120 || !REQUEST_ID_PATTERN.test(requestId)) {
        throw error('İstek kimliği geçersiz.', 'COUPON_REQUEST_ID_INVALID');
    }
    return requestId;
};

const normalizeCreateCouponPayload = (rawBody) => {
    const body = assertPlainObject(rawBody);
    assertAllowedFields(body, CREATE_FIELDS);
    for (const required of ['code', 'discount_type', 'discount_value']) {
        if (!hasOwn(body, required)) {
            throw error(`${required} zorunludur.`, 'COUPON_REQUIRED_FIELD_MISSING', 400, { field: required });
        }
    }
    const payload = {
        code: normalizeCouponCode(body.code),
        discount_type: normalizeDiscountType(body.discount_type),
        discount_value: normalizeMoneyInput(body.discount_value, 'discount_value', { positive: true }),
        min_order_amount: hasOwn(body, 'min_order_amount')
            ? normalizeMoneyInput(body.min_order_amount, 'min_order_amount')
            : 0,
        max_discount_amount: hasOwn(body, 'max_discount_amount')
            ? normalizeMoneyInput(body.max_discount_amount, 'max_discount_amount', { positive: true, nullable: true })
            : null,
        usage_limit: hasOwn(body, 'usage_limit') ? normalizeUsageLimitInput(body.usage_limit) : null,
        starts_at: hasOwn(body, 'starts_at') ? normalizeTimestampInput(body.starts_at, 'starts_at') : null,
        ends_at: hasOwn(body, 'ends_at') ? normalizeTimestampInput(body.ends_at, 'ends_at') : null,
        is_active: hasOwn(body, 'is_active') ? normalizeBooleanInput(body.is_active) : false
    };
    validateEffectiveCoupon(payload);
    return Object.freeze(payload);
};

const normalizeUpdateCouponPayload = (rawBody) => {
    const body = assertPlainObject(rawBody);
    assertAllowedFields(body, UPDATE_FIELDS);
    const expectedRevision = normalizeCouponRevision(body.expected_revision);
    const changes = {};
    for (const field of CREATE_FIELDS) {
        if (!hasOwn(body, field)) continue;
        if (body[field] === null && !NULLABLE_FIELDS.has(field)) {
            throw error(`${field} null olamaz.`, 'COUPON_NULL_NOT_ALLOWED', 400, { field });
        }
        if (field === 'code') changes[field] = normalizeCouponCode(body[field]);
        if (field === 'discount_type') changes[field] = normalizeDiscountType(body[field]);
        if (field === 'discount_value') changes[field] = normalizeMoneyInput(body[field], field, { positive: true });
        if (field === 'min_order_amount') changes[field] = normalizeMoneyInput(body[field], field);
        if (field === 'max_discount_amount') changes[field] = normalizeMoneyInput(body[field], field, { positive: true, nullable: true });
        if (field === 'usage_limit') changes[field] = normalizeUsageLimitInput(body[field]);
        if (field === 'starts_at' || field === 'ends_at') changes[field] = normalizeTimestampInput(body[field], field);
        if (field === 'is_active') changes[field] = normalizeBooleanInput(body[field]);
    }
    if (Object.keys(changes).length === 0) {
        throw error('Kupon güncellemesi en az bir değişiklik alanı içermelidir.', 'COUPON_UPDATE_NOOP');
    }
    return Object.freeze({ expectedRevision, changes: Object.freeze(changes) });
};

const normalizeCouponStatusPayload = (rawBody) => {
    const body = assertPlainObject(rawBody);
    assertAllowedFields(body, STATUS_FIELDS);
    if (!hasOwn(body, 'is_active')) {
        throw error('is_active zorunludur.', 'COUPON_REQUIRED_FIELD_MISSING', 400, { field: 'is_active' });
    }
    return Object.freeze({
        expectedRevision: normalizeCouponRevision(body.expected_revision),
        isActive: normalizeBooleanInput(body.is_active)
    });
};

const storedNumber = (value, field, { nullable = false } = {}) => {
    if (nullable && (value === null || value === undefined)) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw error(`Kayıtlı ${field} geçersiz.`, 'COUPON_STORED_STATE_INVALID', 500, { field });
    }
    return parsed;
};

function validateEffectiveCoupon(value) {
    const discountType = normalizeDiscountType(value.discount_type);
    const discountValue = storedNumber(value.discount_value, 'discount_value');
    const minOrderAmount = storedNumber(value.min_order_amount ?? 0, 'min_order_amount');
    const maxDiscountAmount = storedNumber(value.max_discount_amount, 'max_discount_amount', { nullable: true });
    const usageLimit = storedNumber(value.usage_limit, 'usage_limit', { nullable: true });
    const usedCount = storedNumber(value.used_count ?? 0, 'used_count');

    if (discountValue <= 0 || (discountType === 'PERCENT' && discountValue > 100)) {
        throw error('İndirim değeri seçilen indirim türüyle uyumsuz.', 'COUPON_DISCOUNT_VALUE_INVALID');
    }
    if (minOrderAmount < 0 || (maxDiscountAmount !== null && maxDiscountAmount <= 0)) {
        throw error('Kupon tutar sınırları geçersiz.', 'COUPON_AMOUNT_INVALID');
    }
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit < usedCount)) {
        throw error('usage_limit mevcut kullanım sayısından küçük olamaz.', 'COUPON_USAGE_LIMIT_INVALID');
    }
    if (!Number.isInteger(usedCount) || usedCount < 0) {
        throw error('Kayıtlı kupon kullanım sayısı geçersiz.', 'COUPON_STORED_STATE_INVALID', 500);
    }

    const startsAt = value.starts_at === null || value.starts_at === undefined ? null : new Date(value.starts_at);
    const endsAt = value.ends_at === null || value.ends_at === undefined ? null : new Date(value.ends_at);
    if ((startsAt && !Number.isFinite(startsAt.getTime())) || (endsAt && !Number.isFinite(endsAt.getTime()))) {
        throw error('Kupon tarih aralığı geçersiz.', 'COUPON_DATE_INVALID');
    }
    if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
        throw error('ends_at, starts_at değerinden sonra olmalıdır.', 'COUPON_DATE_RANGE_INVALID');
    }
    return true;
}

const mergeAndValidateCoupon = (current, changes) => {
    const effective = { ...current, ...changes };
    validateEffectiveCoupon(effective);
    return effective;
};

const resolveCouponOperationalStatus = (coupon, now = new Date()) => {
    if (coupon?.is_active !== true) return 'disabled';
    const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const startsAt = coupon.starts_at ? new Date(coupon.starts_at).getTime() : null;
    const endsAt = coupon.ends_at ? new Date(coupon.ends_at).getTime() : null;
    if (startsAt !== null && startsAt > currentTime) return 'scheduled';
    if (endsAt !== null && endsAt < currentTime) return 'expired';
    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined
        && Number(coupon.used_count) >= Number(coupon.usage_limit)) return 'exhausted';
    return 'active';
};

module.exports = {
    COUPON_ADMIN_ACTIONS,
    COUPON_ADMIN_STATUSES,
    COUPON_CODE_PATTERN,
    COUPON_DISCOUNT_TYPES,
    CouponAdminError,
    assertCouponRevisionMatches,
    mergeAndValidateCoupon,
    normalizeCouponAdminActor,
    normalizeCouponId,
    normalizeCouponRevision,
    normalizeCouponStatusPayload,
    normalizeCreateCouponPayload,
    normalizeRequestId,
    normalizeUpdateCouponPayload,
    resolveCouponOperationalStatus,
    validateEffectiveCoupon
};
