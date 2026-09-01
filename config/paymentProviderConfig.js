const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
const readUrl = (value) => String(value || '').trim();
const { getPaymentClientIpConfigIssues } = require('./proxyTrustConfig');

const SUPPORTED_PAYMENT_PROVIDERS = Object.freeze(['paytr']);
const OFFICIAL_PAYTR_BASE_URL = 'https://www.paytr.com';

class PaymentProviderConfigError extends Error {
    constructor(message, details = [], code = 'PAYMENT_PROVIDER_CONFIG_ERROR') {
        super(message);
        this.name = 'PaymentProviderConfigError';
        this.code = code;
        this.statusCode = 503;
        this.details = details;
    }
}

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const isProductionEnvironment = (env = process.env) => (
    String(env.NODE_ENV || '').trim().toLowerCase() === 'production'
);

const getPaymentProviderName = (env = process.env) => {
    const provider = String(env.PAYMENT_PROVIDER || '').trim().toLowerCase();
    if (!provider) return null;
    if (!SUPPORTED_PAYMENT_PROVIDERS.includes(provider)) {
        throw new PaymentProviderConfigError(
            `Unsupported PAYMENT_PROVIDER: ${provider}`,
            [`PAYMENT_PROVIDER must be one of: ${SUPPORTED_PAYMENT_PROVIDERS.join(', ')}`]
        );
    }
    return provider;
};

const getPaytrConfig = (env = process.env) => {
    const isProduction = isProductionEnvironment(env);
    return {
        merchantId: String(env.PAYTR_MERCHANT_ID || '').trim(),
        merchantKey: String(env.PAYTR_MERCHANT_KEY || '').trim(),
        merchantSalt: String(env.PAYTR_MERCHANT_SALT || '').trim(),
        baseUrl: normalizeUrl(env.PAYTR_BASE_URL || OFFICIAL_PAYTR_BASE_URL),
        tokenUrl: `${OFFICIAL_PAYTR_BASE_URL}/odeme/api/get-token`,
        appBaseUrl: readUrl(env.APP_BASE_URL),
        callbackUrl: readUrl(env.PAYTR_CALLBACK_URL),
        successUrl: readUrl(env.PAYTR_SUCCESS_URL),
        failUrl: readUrl(env.PAYTR_FAIL_URL),
        testMode: parseBoolean(env.PAYTR_TEST_MODE, !isProduction),
        debugOn: parseBoolean(env.PAYTR_DEBUG_ON, !isProduction),
        liveRequestsAllowed: parseBoolean(env.PAYTR_LIVE_REQUESTS_ALLOWED, false)
    };
};

const isSafeHttpsUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password && Boolean(parsed.hostname);
    } catch (_) {
        return false;
    }
};

const getCanonicalAppOrigin = (value) => {
    if (!isSafeHttpsUrl(value)) return null;
    const parsed = new URL(value);
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin;
};

const isSafePaytrCallbackUrl = (value, appBaseUrl) => {
    const appOrigin = getCanonicalAppOrigin(appBaseUrl);
    if (!appOrigin || !isSafeHttpsUrl(value)) return false;
    const parsed = new URL(value);
    return parsed.origin === appOrigin
        && parsed.pathname === '/api/payments/webhook/paytr'
        && parsed.search === ''
        && parsed.hash === '';
};

const isSafePaymentResultUrl = (value, appBaseUrl) => {
    const appOrigin = getCanonicalAppOrigin(appBaseUrl);
    if (!appOrigin || !isSafeHttpsUrl(value)) return false;
    const parsed = new URL(value);
    if (parsed.origin !== appOrigin || parsed.search) return false;
    const isStaticResult = parsed.pathname === '/payment-result.html' && parsed.hash === '';
    const isCanonicalHashResult = parsed.pathname === '/' && parsed.hash === '#/odeme/sonuc';
    return isStaticResult || isCanonicalHashResult;
};

const getMissingPaytrEnv = (config = getPaytrConfig(), env = process.env) => {
    const required = [
        ['APP_BASE_URL', config.appBaseUrl],
        ['PAYTR_MERCHANT_ID', config.merchantId],
        ['PAYTR_MERCHANT_KEY', config.merchantKey],
        ['PAYTR_MERCHANT_SALT', config.merchantSalt],
        ['PAYTR_BASE_URL', config.baseUrl],
        ['PAYTR_CALLBACK_URL', config.callbackUrl],
        ['PAYTR_SUCCESS_URL', config.successUrl],
        ['PAYTR_FAIL_URL', config.failUrl]
    ];

    const issues = required
        .filter(([, value]) => !value)
        .map(([name]) => name);
    if (config.baseUrl !== OFFICIAL_PAYTR_BASE_URL) issues.push('PAYTR_BASE_URL');
    if (config.appBaseUrl && !getCanonicalAppOrigin(config.appBaseUrl)) issues.push('APP_BASE_URL');
    if (config.callbackUrl && !isSafePaytrCallbackUrl(config.callbackUrl, config.appBaseUrl)) {
        issues.push('PAYTR_CALLBACK_URL');
    }
    if (config.successUrl && !isSafePaymentResultUrl(config.successUrl, config.appBaseUrl)) {
        issues.push('PAYTR_SUCCESS_URL');
    }
    if (config.failUrl && !isSafePaymentResultUrl(config.failUrl, config.appBaseUrl)) {
        issues.push('PAYTR_FAIL_URL');
    }
    issues.push(...getPaymentClientIpConfigIssues(env));
    return [...new Set(issues)];
};

const assertPaytrEnvReady = (env = process.env) => {
    if (getPaymentProviderName(env) !== 'paytr') {
        throw new PaymentProviderConfigError(
            'PayTR payment provider is not explicitly selected.',
            [],
            'PAYMENT_PROVIDER_NOT_CONFIGURED'
        );
    }
    const config = getPaytrConfig(env);
    const missing = getMissingPaytrEnv(config, env);
    if (missing.length) {
        throw new PaymentProviderConfigError(
            'PayTR payment provider is selected but required environment variables are missing.',
            missing
        );
    }
    return config;
};

const assertPaytrProviderReady = (env = process.env) => {
    const config = assertPaytrEnvReady(env);
    if (isProductionEnvironment(env) && config.testMode) {
        throw new PaymentProviderConfigError(
            'PayTR test mode cannot initialize a customer payment in production.',
            [],
            'PAYMENT_PROVIDER_TEST_MODE_NOT_ALLOWED'
        );
    }
    if (!config.liveRequestsAllowed) {
        throw new PaymentProviderConfigError(
            'PayTR external token requests are not explicitly activated.',
            [],
            'PAYMENT_PROVIDER_NOT_CONFIGURED'
        );
    }
    return config;
};

const getPaymentProviderCapability = (env = process.env) => {
    let provider;
    try {
        provider = getPaymentProviderName(env);
    } catch (_) {
        return Object.freeze({ provider: null, ready: false, state: 'provider_not_configured' });
    }
    if (provider !== 'paytr') return Object.freeze({ provider: null, ready: false, state: 'provider_not_configured' });
    const config = getPaytrConfig(env);
    const clientIpIssues = getPaymentClientIpConfigIssues(env);
    const missing = getMissingPaytrEnv(config, env);
    const nonClientIpIssues = missing.filter((issue) => !clientIpIssues.includes(issue));
    if (nonClientIpIssues.length > 0) {
        return Object.freeze({ provider: 'paytr', ready: false, state: 'credentials_required' });
    }
    if (clientIpIssues.length > 0) {
        return Object.freeze({ provider: 'paytr', ready: false, state: 'client_ip_config_required' });
    }
    if (isProductionEnvironment(env) && config.testMode) {
        return Object.freeze({ provider: 'paytr', ready: false, state: 'production_test_mode_forbidden' });
    }
    if (!config.liveRequestsAllowed) {
        return Object.freeze({ provider: 'paytr', ready: false, state: 'activation_required' });
    }
    return Object.freeze({ provider: 'paytr', ready: true, state: 'ready', testMode: config.testMode });
};

const getPaymentProviderConfig = (env = process.env) => {
    const provider = getPaymentProviderName(env);
    return {
        provider,
        paytr: provider === 'paytr' ? getPaytrConfig(env) : null
    };
};

module.exports = {
    PaymentProviderConfigError,
    SUPPORTED_PAYMENT_PROVIDERS,
    OFFICIAL_PAYTR_BASE_URL,
    assertPaytrEnvReady,
    assertPaytrProviderReady,
    getMissingPaytrEnv,
    getPaymentProviderConfig,
    getPaymentProviderCapability,
    getPaymentProviderName,
    getPaytrConfig,
    getCanonicalAppOrigin,
    isProductionEnvironment,
    isSafePaytrCallbackUrl,
    isSafePaymentResultUrl,
    isSafeHttpsUrl,
    parseBoolean
};
