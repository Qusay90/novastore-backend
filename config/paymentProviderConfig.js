const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const SUPPORTED_PAYMENT_PROVIDERS = Object.freeze(['iyzico', 'paytr']);

class PaymentProviderConfigError extends Error {
    constructor(message, details = []) {
        super(message);
        this.name = 'PaymentProviderConfigError';
        this.code = 'PAYMENT_PROVIDER_CONFIG_ERROR';
        this.statusCode = 503;
        this.details = details;
    }
}

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const getPaymentProviderName = () => {
    const provider = String(process.env.PAYMENT_PROVIDER || 'iyzico').trim().toLowerCase() || 'iyzico';
    if (!SUPPORTED_PAYMENT_PROVIDERS.includes(provider)) {
        throw new PaymentProviderConfigError(
            `Unsupported PAYMENT_PROVIDER: ${provider}`,
            [`PAYMENT_PROVIDER must be one of: ${SUPPORTED_PAYMENT_PROVIDERS.join(', ')}`]
        );
    }
    return provider;
};

const getPaytrConfig = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        merchantId: String(process.env.PAYTR_MERCHANT_ID || '').trim(),
        merchantKey: String(process.env.PAYTR_MERCHANT_KEY || '').trim(),
        merchantSalt: String(process.env.PAYTR_MERCHANT_SALT || '').trim(),
        baseUrl: normalizeUrl(process.env.PAYTR_BASE_URL || 'https://www.paytr.com'),
        callbackUrl: normalizeUrl(process.env.PAYTR_CALLBACK_URL),
        successUrl: normalizeUrl(process.env.PAYTR_SUCCESS_URL),
        failUrl: normalizeUrl(process.env.PAYTR_FAIL_URL),
        testMode: parseBoolean(process.env.PAYTR_TEST_MODE, !isProduction),
        debugOn: parseBoolean(process.env.PAYTR_DEBUG_ON, !isProduction),
        liveRequestsAllowed: false
    };
};

const getMissingPaytrEnv = (config = getPaytrConfig()) => {
    const required = [
        ['PAYTR_MERCHANT_ID', config.merchantId],
        ['PAYTR_MERCHANT_KEY', config.merchantKey],
        ['PAYTR_MERCHANT_SALT', config.merchantSalt],
        ['PAYTR_BASE_URL', config.baseUrl],
        ['PAYTR_CALLBACK_URL', config.callbackUrl],
        ['PAYTR_SUCCESS_URL', config.successUrl],
        ['PAYTR_FAIL_URL', config.failUrl]
    ];

    return required
        .filter(([, value]) => !value)
        .map(([name]) => name);
};

const assertPaytrEnvReady = () => {
    const config = getPaytrConfig();
    const missing = getMissingPaytrEnv(config);
    if (missing.length) {
        throw new PaymentProviderConfigError(
            'PayTR payment provider is selected but required environment variables are missing.',
            missing
        );
    }
    return config;
};

const getPaymentProviderConfig = () => {
    const provider = getPaymentProviderName();
    return {
        provider,
        paytr: provider === 'paytr' ? getPaytrConfig() : null
    };
};

module.exports = {
    PaymentProviderConfigError,
    SUPPORTED_PAYMENT_PROVIDERS,
    assertPaytrEnvReady,
    getMissingPaytrEnv,
    getPaymentProviderConfig,
    getPaymentProviderName,
    getPaytrConfig,
    parseBoolean
};
