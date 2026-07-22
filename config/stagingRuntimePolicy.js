const EXTERNAL_SIDE_EFFECT_KINDS = Object.freeze([
    'payment_initialize',
    'payment_capture',
    'payment_refund',
    'email',
    'sms_or_push',
    'outbound_notification',
    'outbound_webhook',
    'cloudinary_write',
    'cloudinary_delete',
    'external_ai'
]);

const EXTERNAL_SIDE_EFFECT_KIND_SET = new Set(EXTERNAL_SIDE_EFFECT_KINDS);

const STAGING_ACCESS_ENV_KEYS = Object.freeze([
    'NOVASTORE_STAGING_ACCESS_GATE_ENABLED',
    'NOVASTORE_STAGING_ACCESS_USERNAME',
    'NOVASTORE_STAGING_ACCESS_PASSWORD_HASH',
    'NOVASTORE_STAGING_ACCESS_SESSION_SECRET'
]);

const STAGING_ONLY_ENV_KEYS = Object.freeze([
    ...STAGING_ACCESS_ENV_KEYS,
    'NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED'
]);

const ADMIN_WRITE_ENV_KEYS = Object.freeze([
    'NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED',
    'NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED',
    'NOVASTORE_ADMIN_CANCEL_WRITE_ENABLED',
    'NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED'
]);

const FORBIDDEN_PROVIDER_CREDENTIAL_KEYS = Object.freeze([
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
    'IYZICO_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY'
]);

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(1[2-4])\$[./A-Za-z0-9]{53}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const normalize = (value) => String(value === undefined || value === null ? '' : value).trim();
const normalizeLower = (value) => normalize(value).toLowerCase();
const isStagingEnvironment = (env = process.env) => normalizeLower(env.NOVASTORE_DEPLOY_ENV) === 'staging';

const parseStagingPasswordHash = (value) => {
    const raw = String(value === undefined || value === null ? '' : value);
    const match = raw.match(BCRYPT_HASH_PATTERN);
    if (!match) return null;
    return Object.freeze({
        algorithm: 'bcrypt',
        cost: Number(match[1]),
        hash: raw
    });
};

const isBoundedSecret = (value) => {
    if (typeof value !== 'string' || CONTROL_CHARACTER_PATTERN.test(value)) return false;
    const bytes = Buffer.byteLength(value, 'utf8');
    return bytes >= 32 && bytes <= 256;
};

const isBoundedUsername = (value) => {
    if (typeof value !== 'string' || value !== value.trim() || CONTROL_CHARACTER_PATTERN.test(value)) return false;
    return value.length >= 3 && value.length <= 64;
};

const resolveStagingRuntimePolicy = (env = process.env) => {
    const deployEnvironment = normalizeLower(env.NOVASTORE_DEPLOY_ENV);
    const isStaging = deployEnvironment === 'staging';
    const errors = [];

    if (!isStaging) {
        const misplacedKeys = STAGING_ONLY_ENV_KEYS.filter((key) => hasOwn(env, key));
        if (misplacedKeys.length > 0) {
            errors.push(`Staging-only runtime keys are not allowed outside staging: ${misplacedKeys.join(', ')}.`);
        }

        return Object.freeze({
            canStart: errors.length === 0,
            deployEnvironment,
            isStaging,
            accessGateEnabled: false,
            externalSideEffectsDisabled: false,
            errors: Object.freeze(errors)
        });
    }

    if (normalizeLower(env.NOVASTORE_STAGING_ACCESS_GATE_ENABLED) !== 'true') {
        errors.push('NOVASTORE_STAGING_ACCESS_GATE_ENABLED must be exact true in staging.');
    }

    if (!isBoundedUsername(env.NOVASTORE_STAGING_ACCESS_USERNAME)) {
        errors.push('NOVASTORE_STAGING_ACCESS_USERNAME is missing or malformed.');
    }

    if (!parseStagingPasswordHash(env.NOVASTORE_STAGING_ACCESS_PASSWORD_HASH)) {
        errors.push('NOVASTORE_STAGING_ACCESS_PASSWORD_HASH is missing or malformed.');
    }

    if (!isBoundedSecret(env.NOVASTORE_STAGING_ACCESS_SESSION_SECRET)) {
        errors.push('NOVASTORE_STAGING_ACCESS_SESSION_SECRET is missing or malformed.');
    } else if (
        typeof env.JWT_SECRET === 'string' &&
        env.JWT_SECRET.length > 0 &&
        env.NOVASTORE_STAGING_ACCESS_SESSION_SECRET === env.JWT_SECRET
    ) {
        errors.push('NOVASTORE_STAGING_ACCESS_SESSION_SECRET must be independent from JWT_SECRET.');
    }

    if (normalizeLower(env.NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED) !== 'true') {
        errors.push('NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED must be exact true in staging.');
    }

    for (const key of ADMIN_WRITE_ENV_KEYS) {
        if (normalizeLower(env[key]) !== 'false') {
            errors.push(`${key} must be exact false in staging.`);
        }
    }

    if (normalizeLower(env.AI_PROVIDER) !== 'mock') {
        errors.push('AI_PROVIDER must be exact mock in staging.');
    }

    if (normalizeLower(env.AI_PROVIDER_FALLBACK_ENABLED) !== 'false') {
        errors.push('AI_PROVIDER_FALLBACK_ENABLED must be exact false in staging.');
    }

    if (normalizeLower(env.SKIP_SCHEMA_INIT) !== 'true') {
        errors.push('SKIP_SCHEMA_INIT must be exact true in staging.');
    }

    if (normalizeLower(env.NOVASTORE_ALLOW_SCHEMA_INIT) !== 'false') {
        errors.push('NOVASTORE_ALLOW_SCHEMA_INIT must be exact false in staging.');
    }

    for (const key of FORBIDDEN_PROVIDER_CREDENTIAL_KEYS) {
        if (hasOwn(env, key)) {
            errors.push(`${key} must be omitted from the initial staging foundation.`);
        }
    }

    return Object.freeze({
        canStart: errors.length === 0,
        deployEnvironment,
        isStaging,
        accessGateEnabled: normalizeLower(env.NOVASTORE_STAGING_ACCESS_GATE_ENABLED) === 'true',
        externalSideEffectsDisabled:
            normalizeLower(env.NOVASTORE_STAGING_EXTERNAL_SIDE_EFFECTS_DISABLED) === 'true',
        errors: Object.freeze(errors)
    });
};

class StagingRuntimePolicyError extends Error {
    constructor() {
        super('Staging runtime safety configuration is invalid.');
        this.name = 'StagingRuntimePolicyError';
        this.code = 'STAGING_RUNTIME_POLICY_INVALID';
        this.statusCode = 503;
        this.publicMessage = 'Staging runtime is unavailable.';
    }
}

class ExternalSideEffectBlockedError extends Error {
    constructor(effect) {
        super('External side effect is disabled in staging.');
        this.name = 'ExternalSideEffectBlockedError';
        this.code = 'STAGING_EXTERNAL_SIDE_EFFECT_DISABLED';
        this.statusCode = 503;
        this.publicMessage = 'External side effect is disabled in staging.';
        this.effect = effect;
    }
}

const assertStagingRuntimePolicy = (env = process.env) => {
    const policy = resolveStagingRuntimePolicy(env);
    if (!policy.canStart) throw new StagingRuntimePolicyError();
    return policy;
};

const assertExternalSideEffectAllowed = (effect, env = process.env) => {
    if (!EXTERNAL_SIDE_EFFECT_KIND_SET.has(effect)) {
        throw new TypeError('Unknown external side-effect kind.');
    }

    const policy = resolveStagingRuntimePolicy(env);
    if (!policy.canStart && !policy.isStaging) throw new StagingRuntimePolicyError();
    if (!policy.isStaging) return true;
    if (!policy.canStart || policy.externalSideEffectsDisabled) {
        throw new ExternalSideEffectBlockedError(effect);
    }

    throw new ExternalSideEffectBlockedError(effect);
};

const getStagingAccessConfiguration = (env = process.env) => {
    const policy = assertStagingRuntimePolicy(env);
    if (!policy.isStaging || !policy.accessGateEnabled) return null;

    return Object.freeze({
        username: env.NOVASTORE_STAGING_ACCESS_USERNAME,
        passwordHash: parseStagingPasswordHash(env.NOVASTORE_STAGING_ACCESS_PASSWORD_HASH).hash,
        sessionSecret: env.NOVASTORE_STAGING_ACCESS_SESSION_SECRET
    });
};

module.exports = {
    ADMIN_WRITE_ENV_KEYS,
    EXTERNAL_SIDE_EFFECT_KINDS,
    ExternalSideEffectBlockedError,
    FORBIDDEN_PROVIDER_CREDENTIAL_KEYS,
    STAGING_ACCESS_ENV_KEYS,
    STAGING_ONLY_ENV_KEYS,
    StagingRuntimePolicyError,
    assertExternalSideEffectAllowed,
    assertStagingRuntimePolicy,
    getStagingAccessConfiguration,
    isStagingEnvironment,
    parseStagingPasswordHash,
    resolveStagingRuntimePolicy
};
