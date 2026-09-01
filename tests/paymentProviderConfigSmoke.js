const assert = require('assert');
const {
    PaymentProviderConfigError,
    assertPaytrEnvReady,
    assertPaytrProviderReady,
    getCanonicalAppOrigin,
    getPaymentProviderCapability,
    getPaymentProviderConfig,
    getPaymentProviderName,
    getPaytrConfig,
    isProductionEnvironment,
    isSafePaytrCallbackUrl,
    isSafePaymentResultUrl
} = require('../config/paymentProviderConfig');
const {
    ProxyTrustConfigError,
    getPaymentClientIpConfigIssues,
    getTrustedProxyHops
} = require('../config/proxyTrustConfig');

const trackedEnv = [
    'NODE_ENV',
    'APP_BASE_URL',
    'PAYMENT_PROVIDER',
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
    'PAYTR_BASE_URL',
    'PAYTR_CALLBACK_URL',
    'PAYTR_SUCCESS_URL',
    'PAYTR_FAIL_URL',
    'PAYTR_TEST_MODE',
    'PAYTR_DEBUG_ON',
    'PAYTR_LIVE_REQUESTS_ALLOWED',
    'NOVASTORE_TRUST_PROXY_HOPS',
    'RENDER',
    'RENDER_SERVICE_ID',
    'RENDER_EXTERNAL_URL'
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
        if (key.startsWith('PAYTR_') || key === 'PAYMENT_PROVIDER' || key === 'APP_BASE_URL') {
            delete process.env[key];
        }
    }
};

try {
    clearPaytrEnv();
    process.env.NODE_ENV = 'test';
    assert.strictEqual(getPaymentProviderName(), null);
    assert.deepStrictEqual(getPaymentProviderConfig(), { provider: null, paytr: null });
    assert.deepStrictEqual(getPaymentProviderCapability(), {
        provider: null,
        ready: false,
        state: 'provider_not_configured'
    });

    assert.strictEqual(getTrustedProxyHops(), 0);
    assert.deepStrictEqual(getPaymentClientIpConfigIssues(), []);
    process.env.NOVASTORE_TRUST_PROXY_HOPS = 'not-a-number';
    assert.throws(() => getTrustedProxyHops(), ProxyTrustConfigError);
    delete process.env.NOVASTORE_TRUST_PROXY_HOPS;
    assert.strictEqual(getCanonicalAppOrigin('https://example.test'), 'https://example.test');
    assert.strictEqual(getCanonicalAppOrigin('https://example.test/'), 'https://example.test');
    assert.strictEqual(getCanonicalAppOrigin('https://example.test/app'), null);
    assert.strictEqual(getCanonicalAppOrigin('https://example.test/?source=unsafe'), null);
    assert.strictEqual(getCanonicalAppOrigin('https://example.test/#fragment'), null);
    assert.strictEqual(
        isSafePaytrCallbackUrl(
            'https://example.test/api/payments/webhook/paytr',
            'https://example.test'
        ),
        true
    );
    assert.strictEqual(
        isSafePaymentResultUrl('https://example.test/#/odeme/sonuc', 'https://example.test'),
        true
    );
    assert.strictEqual(
        isSafePaymentResultUrl('https://example.test/payment-result.html', 'https://example.test'),
        true
    );
    assert.strictEqual(
        isSafePaymentResultUrl('https://example.test/#/hesabim', 'https://example.test'),
        false
    );

    process.env.PAYMENT_PROVIDER = 'stripe';
    assert.throws(() => getPaymentProviderName(), PaymentProviderConfigError);

    clearPaytrEnv();
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_PROVIDER = 'paytr';
    const paytrConfig = getPaytrConfig();
    assert.strictEqual(paytrConfig.baseUrl, 'https://www.paytr.com');
    assert.strictEqual(paytrConfig.tokenUrl, 'https://www.paytr.com/odeme/api/get-token');
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
    assert.ok(missingError.details.includes('APP_BASE_URL'));
    assert.ok(missingError.details.includes('PAYTR_MERCHANT_ID'));
    assert.ok(missingError.details.includes('PAYTR_CALLBACK_URL'));

    process.env.APP_BASE_URL = 'https://example.test';
    process.env.PAYTR_MERCHANT_ID = 'merchant-id';
    process.env.PAYTR_MERCHANT_KEY = 'merchant-key';
    process.env.PAYTR_MERCHANT_SALT = 'merchant-salt';
    process.env.PAYTR_CALLBACK_URL = 'https://example.test/api/payments/webhook/paytr';
    process.env.PAYTR_SUCCESS_URL = 'https://example.test/#/odeme/sonuc';
    process.env.PAYTR_FAIL_URL = 'https://example.test/#/odeme/sonuc';
    assert.strictEqual(assertPaytrEnvReady().merchantId, 'merchant-id');
    assert.throws(() => assertPaytrProviderReady(), (error) => (
        error instanceof PaymentProviderConfigError
        && error.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED'
    ));
    assert.deepStrictEqual(getPaymentProviderCapability(), {
        provider: 'paytr',
        ready: false,
        state: 'activation_required'
    });

    const assertRejectedUrl = (name, value, expectedIssue = name) => {
        const original = process.env[name];
        process.env[name] = value;
        assert.throws(() => assertPaytrEnvReady(), (error) => (
            error instanceof PaymentProviderConfigError
            && error.details.includes(expectedIssue)
        ), `${name} should reject ${value}`);
        process.env[name] = original;
    };

    assertRejectedUrl('PAYTR_CALLBACK_URL', 'https://external.example/api/payments/webhook/paytr');
    assertRejectedUrl('PAYTR_CALLBACK_URL', 'https://example.test/api/payments/webhook/paytr/');
    assertRejectedUrl('PAYTR_CALLBACK_URL', 'https://example.test/api/payments/webhook/wrong');
    assertRejectedUrl('PAYTR_CALLBACK_URL', 'https://example.test/api/payments/webhook/paytr?source=unsafe');
    assertRejectedUrl('PAYTR_CALLBACK_URL', 'https://example.test/api/payments/webhook/paytr#fragment');

    assertRejectedUrl('PAYTR_SUCCESS_URL', 'https://external.example/payment-result.html');
    assertRejectedUrl('PAYTR_SUCCESS_URL', 'https://example.test/payment-result.html/');
    assertRejectedUrl('PAYTR_SUCCESS_URL', 'https://example.test/odeme/sonuc');
    assertRejectedUrl('PAYTR_SUCCESS_URL', 'https://example.test/payment-result.html?status=success');
    assertRejectedUrl('PAYTR_SUCCESS_URL', 'https://example.test/payment-result.html#fragment');
    assertRejectedUrl('PAYTR_SUCCESS_URL', 'https://example.test/#/odeme/sonuc?status=success');
    assertRejectedUrl('PAYTR_SUCCESS_URL', 'https://example.test/?status=success#/odeme/sonuc');

    assertRejectedUrl('PAYTR_FAIL_URL', 'https://external.example/#/odeme/sonuc');
    assertRejectedUrl('PAYTR_FAIL_URL', 'https://example.test/#/odeme/sonuc?status=failed');
    assertRejectedUrl('PAYTR_FAIL_URL', 'https://example.test/payment-result.html?status=failed');
    assertRejectedUrl('PAYTR_FAIL_URL', 'https://example.test/payment-failed.html');

    assertRejectedUrl('APP_BASE_URL', 'https://example.test/app');
    assertRejectedUrl('APP_BASE_URL', 'https://example.test/?source=unsafe');
    assertRejectedUrl('APP_BASE_URL', 'https://example.test/#fragment');

    process.env.PAYTR_LIVE_REQUESTS_ALLOWED = 'true';
    assert.strictEqual(assertPaytrProviderReady().merchantId, 'merchant-id');
    assert.deepStrictEqual(getPaymentProviderCapability(), {
        provider: 'paytr',
        ready: true,
        state: 'ready',
        testMode: true
    });

    process.env.NODE_ENV = 'production';
    process.env.RENDER = 'true';
    process.env.PAYTR_TEST_MODE = 'false';
    assert.deepStrictEqual(getPaymentProviderCapability(), {
        provider: 'paytr',
        ready: false,
        state: 'client_ip_config_required'
    });
    process.env.NOVASTORE_TRUST_PROXY_HOPS = '1';
    assert.strictEqual(getTrustedProxyHops(), 1);
    assert.deepStrictEqual(getPaymentProviderCapability(), {
        provider: 'paytr',
        ready: true,
        state: 'ready',
        testMode: false
    });

    process.env.PAYTR_TEST_MODE = 'true';
    assert.throws(() => assertPaytrProviderReady(), (error) => (
        error instanceof PaymentProviderConfigError
        && error.code === 'PAYMENT_PROVIDER_TEST_MODE_NOT_ALLOWED'
    ));
    assert.deepStrictEqual(getPaymentProviderCapability(), {
        provider: 'paytr',
        ready: false,
        state: 'production_test_mode_forbidden'
    });
    for (const mixedCaseProduction of ['Production', ' production ']) {
        process.env.NODE_ENV = mixedCaseProduction;
        assert.strictEqual(isProductionEnvironment(), true);
        assert.throws(() => assertPaytrProviderReady(), (error) => (
            error instanceof PaymentProviderConfigError
            && error.code === 'PAYMENT_PROVIDER_TEST_MODE_NOT_ALLOWED'
        ));
        assert.deepStrictEqual(getPaymentProviderCapability(), {
            provider: 'paytr',
            ready: false,
            state: 'production_test_mode_forbidden'
        });
    }

    process.env.NODE_ENV = 'test';
    delete process.env.RENDER;
    delete process.env.NOVASTORE_TRUST_PROXY_HOPS;
    process.env.PAYTR_TEST_MODE = 'true';

    process.env.PAYTR_BASE_URL = 'https://paytr-proxy.example.test';
    assert.throws(() => assertPaytrEnvReady(), (error) => (
        error instanceof PaymentProviderConfigError
        && error.details.includes('PAYTR_BASE_URL')
    ));

    console.log('payment provider config smoke passed');
} finally {
    restoreEnv();
}
