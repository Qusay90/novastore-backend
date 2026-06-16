const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const DEFAULT_PRODUCTION_BASE_URL = 'https://novastore.tr';
const DEFAULT_PRODUCTION_WWW_BASE_URL = 'https://www.novastore.tr';
const DEFAULT_NATIVE_APP_ORIGINS = [
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost'
];

const isProduction = () => process.env.NODE_ENV === 'production';

const getLocalBaseUrl = () => {
    const port = Number(process.env.PORT || 5000);
    return `http://localhost:${Number.isInteger(port) ? port : 5000}`;
};

const getAppBaseUrl = (req = null) => {
    const configuredBaseUrl = normalizeUrl(process.env.APP_BASE_URL);
    if (configuredBaseUrl) return configuredBaseUrl;

    if (isProduction()) return DEFAULT_PRODUCTION_BASE_URL;

    if (req && req.protocol && typeof req.get === 'function') {
        const requestHost = String(req.get('host') || '').trim();
        if (requestHost) {
            return normalizeUrl(`${req.protocol}://${requestHost}`);
        }
    }

    return getLocalBaseUrl();
};

const getAllowedOrigins = () => {
    const configuredOrigins = String(process.env.CLIENT_ORIGIN || '').trim();
    if (configuredOrigins) {
        if (configuredOrigins === '*') return '*';
        return configuredOrigins
            .split(',')
            .map((origin) => normalizeUrl(origin))
            .filter(Boolean);
    }

    if (isProduction()) {
        return [
            DEFAULT_PRODUCTION_BASE_URL,
            DEFAULT_PRODUCTION_WWW_BASE_URL,
            ...DEFAULT_NATIVE_APP_ORIGINS
        ];
    }

    return [getLocalBaseUrl()];
};

const getMailFrom = () => {
    const configuredSender = String(process.env.MAIL_FROM || '').trim();
    return configuredSender || 'NovaStore Destek <onboarding@resend.dev>';
};

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const splitList = (value) => String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const getAiProviderFallbacks = (primaryProvider) => {
    const configuredFallbacks = splitList(process.env.AI_PROVIDER_FALLBACKS);
    if (configuredFallbacks.length) {
        return configuredFallbacks.filter((provider) => provider !== primaryProvider);
    }

    if (primaryProvider === 'mock') return [];
    return ['mock'];
};

const getAiProviderConfig = () => {
    const primaryProvider = String(process.env.AI_PROVIDER || 'mock').trim().toLowerCase() || 'mock';
    return {
        primaryProvider,
        fallbackEnabled: parseBoolean(process.env.AI_PROVIDER_FALLBACK_ENABLED, true),
        fallbackProviders: getAiProviderFallbacks(primaryProvider)
    };
};

module.exports = {
    DEFAULT_PRODUCTION_BASE_URL,
    DEFAULT_PRODUCTION_WWW_BASE_URL,
    DEFAULT_NATIVE_APP_ORIGINS,
    getAllowedOrigins,
    getAppBaseUrl,
    getAiProviderConfig,
    getMailFrom
};
