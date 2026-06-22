const assert = require('assert');
const {
    PaymentProviderConfigError,
    assertPaytrEnvReady,
    getPaymentProviderConfig,
    getPaymentProviderName,
    getPaytrConfig
} = require('../config/paymentProviderConfig');

const trackedEnv = [
    'NODE_ENV',
    'PAYMENT_PROVIDER',
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
    'PAYTR_BASE_URL',
    'PAYTR_CALLBACK_URL',
    'PAYTR_SUCCESS_URL',
    'PAYTR_FAIL_URL',
    'PAYTR_TEST_MODE',
    'PAYTR_DEBUG_ON'
];

const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));

const restoreEnv = () => {
    for (const key of trackedEnv) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
};

const clearPaytrEnv = () => {
    for (const key of trackedEnv) {
        if (key.startsWith('PAYTR_') || key === 'PAYMENT_PROVIDER') {
            delete process.env[key];
        }
    }
};

try {
    clearPaytrEnv();
    process.env.NODE_ENV = 'test';
    assert.strictEqual(getPaymentProviderName(), 'iyzico');
    assert.deepStrictEqual(getPaymentProviderConfig(), { provider: 'iyzico', paytr: null });

    process.env.PAYMENT_PROVIDER = 'stripe';
    assert.throws(() => getPaymentProviderName(), PaymentProviderConfigError);

    clearPaytrEnv();
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_PROVIDER = 'paytr';
    const paytrConfig = getPaytrConfig();
    assert.strictEqual(paytrConfig.baseUrl, 'https://www.paytr.com');
    assert.strictEqual(paytrConfig.testMode, true);
    assert.strictEqual(paytrConfig.debugOn, true);
    assert.strictEqual(paytrConfig.liveRequestsAllowed, false);

    let missingError = null;
    try {
        assertPaytrEnvReady();
    } catch (err) {
        missingError = err;
    }
    assert.ok(missingError instanceof PaymentProviderConfigError);
    assert.ok(missingError.details.includes('PAYTR_MERCHANT_ID'));
    assert.ok(missingError.details.includes('PAYTR_CALLBACK_URL'));

    process.env.PAYTR_MERCHANT_ID = 'merchant-id';
    process.env.PAYTR_MERCHANT_KEY = 'merchant-key';
    process.env.PAYTR_MERCHANT_SALT = 'merchant-salt';
    process.env.PAYTR_CALLBACK_URL = 'https://example.test/api/payments/webhook/paytr';
    process.env.PAYTR_SUCCESS_URL = 'https://example.test/payment-result.html?status=success';
    process.env.PAYTR_FAIL_URL = 'https://example.test/payment-result.html?status=failed';
    assert.strictEqual(assertPaytrEnvReady().merchantId, 'merchant-id');

    console.log('payment provider config smoke passed');
} finally {
    restoreEnv();
}
