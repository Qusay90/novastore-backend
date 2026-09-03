const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const DEFAULT_PRODUCTION_BASE_URL = 'https://novastore.tr';
const DEFAULT_PRODUCTION_WWW_BASE_URL = 'https://www.novastore.tr';
const DEFAULT_NATIVE_APP_ORIGINS = [
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost'
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAILBOX_PATTERN = /^(?:[^<>\r\n]{1,100}\s<([^<>\r\n]+)>|([^<>\r\n]+))$/;
const APP_BASE_URL_PATTERN = /^https?:\/\/[^/?#\\]+\/?$/i;

const isProduction = (env = process.env) => (
    String(env?.NODE_ENV || '').trim().toLowerCase() === 'production'
);

const configurationError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

const isValidClientOrigin = (value) => {
    try {
        const parsed = new URL(value);
        return ['https:', 'capacitor:', 'ionic:'].includes(parsed.protocol)
            && !parsed.username
            && !parsed.password
            && (parsed.pathname === '' || parsed.pathname === '/')
            && !parsed.search
            && !parsed.hash;
    } catch (_) {
        return false;
    }
};

const getCanonicalAppBaseUrl = (value, { production = false } = {}) => {
    const candidate = String(value || '').trim();
    if (!APP_BASE_URL_PATTERN.test(candidate)) return null;
    try {
        const parsed = new URL(candidate);
        if (
            !['http:', 'https:'].includes(parsed.protocol)
            || (production && parsed.protocol !== 'https:')
            || parsed.username
            || parsed.password
            || parsed.pathname !== '/'
            || parsed.search
            || parsed.hash
        ) return null;
        return parsed.origin;
    } catch (_) {
        return null;
    }
};

const getLocalBaseUrl = (env = process.env) => {
    const port = Number(env?.PORT || 5000);
    return `http://localhost:${Number.isInteger(port) ? port : 5000}`;
};

const getAppBaseUrl = (_req = null, env = process.env) => {
    const configuredValue = String(env?.APP_BASE_URL || '').trim();
    const production = isProduction(env);
    if (configuredValue) {
        const configuredBaseUrl = getCanonicalAppBaseUrl(configuredValue, { production });
        if (!configuredBaseUrl) {
            throw configurationError(
                'APP_BASE_URL_INVALID',
                'APP_BASE_URL kök http(s) origin olmalı; production ortamında HTTPS kullanılmalıdır.'
            );
        }
        return configuredBaseUrl;
    }

    if (production) return DEFAULT_PRODUCTION_BASE_URL;
    return getLocalBaseUrl(env);
};

const getAllowedOrigins = (env = process.env) => {
    const configuredOrigins = String(env.CLIENT_ORIGIN || '').trim();
    if (configuredOrigins) {
        if (configuredOrigins === '*') {
            if (isProduction(env)) {
                throw configurationError('CLIENT_ORIGIN_WILDCARD_FORBIDDEN', 'Production CLIENT_ORIGIN wildcard olamaz.');
            }
            return '*';
        }
        const origins = [...new Set(configuredOrigins
            .split(',')
            .map((origin) => normalizeUrl(origin))
            .filter(Boolean))];
        if (isProduction(env) && (origins.length === 0 || origins.some((origin) => !isValidClientOrigin(origin)))) {
            throw configurationError('CLIENT_ORIGIN_INVALID', 'Production CLIENT_ORIGIN yalnız güvenli origin değerleri içermelidir.');
        }
        return origins;
    }

    if (isProduction(env)) {
        return [
            DEFAULT_PRODUCTION_BASE_URL,
            DEFAULT_PRODUCTION_WWW_BASE_URL,
            ...DEFAULT_NATIVE_APP_ORIGINS
        ];
    }

    return [getLocalBaseUrl(env)];
};

const getMailFrom = (env = process.env) => {
    const configuredSender = String(env.MAIL_FROM || '').trim();
    if (configuredSender) {
        const mailbox = configuredSender.match(MAILBOX_PATTERN);
        const email = mailbox ? (mailbox[1] || mailbox[2]) : '';
        if (!EMAIL_PATTERN.test(email)) {
            throw configurationError('MAIL_FROM_INVALID', 'MAIL_FROM geçerli bir e-posta göndereni olmalıdır.');
        }
        return configuredSender;
    }
    if (isProduction(env)) {
        throw configurationError('MAIL_FROM_REQUIRED', 'Production parola kurtarma için doğrulanmış MAIL_FROM gereklidir.');
    }
    return 'NovaStore Destek <onboarding@resend.dev>';
};

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const splitList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const getAiProviderFallbacks = (primaryProvider, env = process.env) => {
    const configuredFallbacks = splitList(env.AI_PROVIDER_FALLBACKS);
    if (configuredFallbacks.length) {
        return configuredFallbacks.filter((provider) => provider !== primaryProvider);
    }

    if (primaryProvider === 'mock') return [];
    return ['mock'];
};

const getAiProviderConfig = (env = process.env) => {
    const primaryProvider = String(env.AI_PROVIDER || 'mock').trim().toLowerCase() || 'mock';
    return {
        primaryProvider,
        fallbackEnabled: parseBoolean(env.AI_PROVIDER_FALLBACK_ENABLED, true),
        fallbackProviders: getAiProviderFallbacks(primaryProvider, env)
    };
};

module.exports = {
    DEFAULT_PRODUCTION_BASE_URL,
    DEFAULT_PRODUCTION_WWW_BASE_URL,
    DEFAULT_NATIVE_APP_ORIGINS,
    isValidClientOrigin,
    getAllowedOrigins,
    getAppBaseUrl,
    getAiProviderConfig,
    getMailFrom
};
