const crypto = require('node:crypto');
const { resolveSensitiveRequestIp } = require('../config/trustedProxy');
const { parseIdentifier } = require('../services/customerVerificationService');
const { createSharedRateLimitStore } = require('../services/sharedRateLimitStore');

const RESET_REQUEST_MESSAGE = 'Hesap uygunsa doğrulama kodu gönderildi.';
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_IP_MAX = 30;
const DEFAULT_IDENTIFIER_MAX = 10;
const AUTH_RATE_LIMIT_SCOPES = Object.freeze({
    ADMIN_FORGOT_PASSWORD: 'admin-forgot-password',
    ADMIN_LOGIN: 'admin-login',
    CUSTOMER_LOGIN: 'customer-login',
    CUSTOMER_RESET_COMPLETE: 'customer-reset-complete',
    CUSTOMER_RESET_REQUEST: 'customer-reset-request',
    CUSTOMER_RESET_VERIFY: 'customer-reset-verify'
});

const requireLimiterSecret = (env = process.env) => {
    const secret = String(env.PUBLIC_AUTH_RATE_LIMIT_SECRET || env.VERIFICATION_CODE_SECRET || '');
    if (secret.length < 32 || /(?:change[_-]?me|replace[_-]?with)/i.test(secret)) {
        const error = new Error('PUBLIC_AUTH_RATE_LIMIT_CONFIG_MISSING');
        error.code = 'PUBLIC_AUTH_RATE_LIMIT_CONFIG_MISSING';
        error.statusCode = 503;
        throw error;
    }
    return secret;
};

const normalizedIdentifierValue = (value) => {
    const parsed = parseIdentifier(value);
    if (parsed) return `${parsed.channel}:${parsed.value}`;
    return `invalid:${String(value || '').trim().toLocaleLowerCase('en-US').slice(0, 254)}`;
};

const hashRateLimitKey = (kind, value, env = process.env) => (
    crypto
        .createHmac('sha256', requireLimiterSecret(env))
        .update(`${kind}:${String(value || '')}`)
        .digest('hex')
);

const requestIp = (req, env = process.env) => resolveSensitiveRequestIp(req, { env });

const createCounter = ({ windowMs, maxEntries = 10000 }) => {
    const entries = new Map();
    const take = (key, now) => {
        const current = entries.get(key);
        let count;
        if (!current || current.resetAt <= now) {
            entries.set(key, { count: 1, resetAt: now + windowMs });
            count = 1;
        } else {
            current.count += 1;
            count = current.count;
        }
        if (entries.size > maxEntries) {
            for (const [entryKey, entry] of entries) {
                if (entry.resetAt <= now) entries.delete(entryKey);
                if (entries.size <= maxEntries) break;
            }
            while (entries.size > maxEntries) {
                entries.delete(entries.keys().next().value);
            }
        }
        return count;
    };
    return Object.freeze({ take, size: () => entries.size });
};

const unavailable = (res, error) => res.status(503).json({
    code: error?.code || 'PUBLIC_AUTH_RATE_LIMIT_UNAVAILABLE',
    error: 'Kimlik doğrulama servisi geçici olarak kullanılamıyor.'
});

const createCustomerAuthRateLimit = ({
    env = process.env,
    windowMs = DEFAULT_WINDOW_MS,
    ipMax = DEFAULT_IP_MAX,
    identifierMax = DEFAULT_IDENTIFIER_MAX,
    maxEntries = 10000,
    responseKind = 'password-reset',
    keyScope = '',
    identifierField,
    now = () => Date.now(),
    store
} = {}) => {
    const normalizedKeyScope = String(keyScope || '').trim();
    if (
        normalizedKeyScope
        && (
            normalizedKeyScope.length > 64
            || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedKeyScope)
        )
    ) {
        const error = new Error('PUBLIC_AUTH_RATE_LIMIT_SCOPE_INVALID');
        error.code = 'PUBLIC_AUTH_RATE_LIMIT_CONFIG_INVALID';
        error.statusCode = 503;
        throw error;
    }
    const boundedWindow = Math.max(
        1000,
        Math.min(Number(windowMs) || DEFAULT_WINDOW_MS, 24 * 60 * 60 * 1000)
    );
    const boundedIpMax = Math.max(1, Math.min(Number(ipMax) || DEFAULT_IP_MAX, 1000));
    const boundedIdentifierMax = Math.max(
        1,
        Math.min(Number(identifierMax) || DEFAULT_IDENTIFIER_MAX, 1000)
    );
    const boundedMaxEntries = Math.max(1, Math.min(Number(maxEntries) || 10000, 100000));
    const limiterStore = store || createSharedRateLimitStore({
        env,
        maxEntries: boundedMaxEntries,
        now
    });
    const scopedKey = (kind, value) => {
        const hashKind = normalizedKeyScope
            ? `${normalizedKeyScope}:${kind}`
            : kind;
        const digest = hashRateLimitKey(hashKind, value, env);
        return normalizedKeyScope ? `${normalizedKeyScope}:${digest}` : digest;
    };

    const handleResult = (result, req, res, next) => {
        if (
            result.ipCount > boundedIpMax
            || result.identifierCount > boundedIdentifierMax
        ) {
            res.set?.('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
            if (responseKind === 'admin-login') {
                return res.status(429).json({
                    code: 'ADMIN_LOGIN_RATE_LIMIT',
                    error: 'E-posta veya şifre hatalı.'
                });
            }
            if (responseKind === 'login') {
                return res.status(429).json({
                    code: 'LOGIN_RATE_LIMIT',
                    error: 'E-posta, telefon veya şifre hatalı.'
                });
            }
            if (String(req.path || '').endsWith('/request')) {
                return res.status(429).json({
                    code: 'PASSWORD_RESET_RATE_LIMIT',
                    message: RESET_REQUEST_MESSAGE
                });
            }
            return res.status(429).json({
                code: 'PASSWORD_RESET_RATE_LIMIT',
                error: 'Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.'
            });
        }
        return next();
    };

    const middleware = (req, res, next) => {
        try {
            const rawIdentifier = identifierField
                ? req.body?.[identifierField] || ''
                : req.body?.identifier || req.body?.email || req.body?.phone || '';
            const ipKey = scopedKey('ip', requestIp(req, env));
            const identifierKey = scopedKey(
                'identifier',
                normalizedIdentifierValue(rawIdentifier)
            );
            const pending = limiterStore.consume({
                ipKey,
                identifierKey,
                windowMs: boundedWindow
            });
            if (pending && typeof pending.then === 'function') {
                return pending
                    .then((result) => handleResult(result, req, res, next))
                    .catch((error) => unavailable(res, error));
            }
            return handleResult(pending, req, res, next);
        } catch (error) {
            return unavailable(res, error);
        }
    };
    Object.defineProperty(middleware, 'rateLimitScope', {
        configurable: false,
        enumerable: true,
        value: normalizedKeyScope,
        writable: false
    });
    return middleware;
};

const createCustomerAuthRateLimiters = ({
    env = process.env,
    maxEntries = 10000,
    now = () => Date.now(),
    store
} = {}) => {
    const sharedStore = store || createSharedRateLimitStore({
        env,
        maxEntries,
        now
    });
    const createScopedLimiter = (options) => createCustomerAuthRateLimit({
        env,
        maxEntries,
        now,
        store: sharedStore,
        ...options
    });

    return Object.freeze({
        adminForgotPasswordRateLimit: createScopedLimiter({
            identifierField: 'email',
            keyScope: AUTH_RATE_LIMIT_SCOPES.ADMIN_FORGOT_PASSWORD
        }),
        adminLoginRateLimit: createScopedLimiter({
            identifierField: 'email',
            identifierMax: 5,
            ipMax: 30,
            keyScope: AUTH_RATE_LIMIT_SCOPES.ADMIN_LOGIN,
            responseKind: 'admin-login'
        }),
        customerLoginRateLimit: createScopedLimiter({
            identifierMax: 10,
            ipMax: 30,
            keyScope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_LOGIN,
            responseKind: 'login'
        }),
        customerPasswordResetCompleteRateLimit: createScopedLimiter({
            keyScope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_RESET_COMPLETE
        }),
        customerPasswordResetRequestRateLimit: createScopedLimiter({
            keyScope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_RESET_REQUEST
        }),
        customerPasswordResetVerifyRateLimit: createScopedLimiter({
            keyScope: AUTH_RATE_LIMIT_SCOPES.CUSTOMER_RESET_VERIFY
        })
    });
};

const {
    adminForgotPasswordRateLimit,
    adminLoginRateLimit,
    customerLoginRateLimit,
    customerPasswordResetCompleteRateLimit,
    customerPasswordResetRequestRateLimit,
    customerPasswordResetVerifyRateLimit
} = createCustomerAuthRateLimiters();

module.exports = {
    AUTH_RATE_LIMIT_SCOPES,
    DEFAULT_IDENTIFIER_MAX,
    DEFAULT_IP_MAX,
    DEFAULT_WINDOW_MS,
    RESET_REQUEST_MESSAGE,
    adminForgotPasswordRateLimit,
    adminLoginRateLimit,
    createCustomerAuthRateLimiters,
    createCustomerAuthRateLimit,
    createCounter,
    hashRateLimitKey,
    customerLoginRateLimit,
    customerPasswordResetCompleteRateLimit,
    customerPasswordResetRequestRateLimit,
    customerPasswordResetVerifyRateLimit,
    normalizedIdentifierValue,
    requestIp
};
