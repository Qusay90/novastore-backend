'use strict';

const assert = require('assert');
const {
    PAYTR_TOKEN_URL,
    PaytrProviderTransportError,
    buildPaytrCallbackHash,
    buildPaytrIframeUrl,
    buildPaytrMerchantOid,
    buildPaytrTokenPayload,
    buildPaytrUserBasket,
    createPaytrHttpTransport,
    parsePaytrTokenResponse,
    requestPaytrIframeSession,
    resolvePaytrUrls,
    serializePaytrTokenPayload,
    timingSafeEqualString,
    toPaytrPaymentAmount,
    verifyPaytrCallbackHash
} = require('../services/paytrPaymentService');

const config = {
    merchantId: 'merchant-123',
    merchantKey: 'secret-key-never-output',
    merchantSalt: 'secret-salt-never-output',
    baseUrl: 'https://www.paytr.com',
    tokenUrl: PAYTR_TOKEN_URL,
    callbackUrl: 'https://example.test/api/payments/webhook/paytr',
    successUrl: 'https://example.test/#/odeme/sonuc',
    failUrl: 'https://example.test/#/odeme/sonuc',
    testMode: true,
    debugOn: true
};

const order = { id: 7001 };
const deterministicRandom = () => Buffer.from('1234567890abcdef1234567890abcdef12345678', 'hex');
const merchantOid = buildPaytrMerchantOid(deterministicRandom);
assert.strictEqual(merchantOid, 'NSTPAYTR1234567890abcdef1234567890abcdef12345678');
assert.strictEqual(buildPaytrMerchantOid(order, deterministicRandom), merchantOid);
assert.match(buildPaytrMerchantOid(), /^NSTPAYTR[a-f0-9]{40}$/);
assert.ok(merchantOid.length <= 64);

assert.strictEqual(toPaytrPaymentAmount(34.56), 3456);
assert.strictEqual(toPaytrPaymentAmount(0.1 + 0.2), 30);

const userBasket = buildPaytrUserBasket([
    { name: 'Test Telefon', price: 1234.5, quantity: 2 },
    { name: '  Kablo\nUSB  ', price: 49.9, quantity: 1 }
]);
assert.deepStrictEqual(JSON.parse(Buffer.from(userBasket, 'base64').toString('utf8')), [
    ['Test Telefon', '1234.50', 2],
    ['Kablo USB', '49.90', 1]
]);

assert.strictEqual(
    buildPaytrIframeUrl('iframe-token-123', config),
    'https://www.paytr.com/odeme/guvenli/iframe-token-123'
);

const urls = resolvePaytrUrls({ config, paymentRef: merchantOid });
assert.strictEqual(urls.callbackUrl, config.callbackUrl);
const successRoute = new URL(urls.successUrl).hash.slice(1);
const [successPath, successQuery = ''] = successRoute.split('?');
const successParams = new URLSearchParams(successQuery);
assert.strictEqual(successPath, '/odeme/sonuc');
assert.strictEqual(successParams.get('paymentRef'), merchantOid);
assert.strictEqual(successParams.has('orderId'), false);
assert.strictEqual(new URL(urls.successUrl).searchParams.has('status'), false);
assert.strictEqual(new URL(urls.failUrl).searchParams.has('status'), false);

const validCallbackPayload = {
    merchant_oid: merchantOid,
    status: 'success',
    total_amount: '3456'
};
validCallbackPayload.hash = buildPaytrCallbackHash({
    merchantOid: validCallbackPayload.merchant_oid,
    status: validCallbackPayload.status,
    totalAmount: validCallbackPayload.total_amount,
    merchantKey: config.merchantKey,
    merchantSalt: config.merchantSalt
});
assert.strictEqual(verifyPaytrCallbackHash(validCallbackPayload, config), true);
assert.strictEqual(verifyPaytrCallbackHash({ ...validCallbackPayload, hash: 'wrong-hash' }, config), false);
assert.strictEqual(timingSafeEqualString(validCallbackPayload.hash, validCallbackPayload.hash), true);
assert.strictEqual(timingSafeEqualString(validCallbackPayload.hash, 'short'), false);

const tokenPayload = buildPaytrTokenPayload({
    config,
    customer: {
        fullName: 'Test Kullanıcı',
        email: 'test@example.com',
        phone: '05551234567',
        address: 'Test Mahallesi, Test Sokak No:1'
    },
    items: [{ name: 'Test Telefon', price: 34.56, quantity: 1 }],
    amount: 34.56,
    userIp: '203.0.113.10',
    merchantOid
});
const serializedPayload = JSON.stringify(tokenPayload);
assert.strictEqual(tokenPayload.merchant_oid, merchantOid);
assert.strictEqual(tokenPayload.payment_amount, 3456);
assert.ok(tokenPayload.paytr_token);
assert.strictEqual(serializedPayload.includes(config.merchantKey), false);
assert.strictEqual(serializedPayload.includes(config.merchantSalt), false);
assert.strictEqual(new URLSearchParams(serializePaytrTokenPayload(tokenPayload)).get('merchant_oid'), merchantOid);
assert.deepStrictEqual(parsePaytrTokenResponse('{"status":"success","token":"safe-token-123"}'), {
    status: 'success',
    token: 'safe-token-123'
});
assert.throws(() => buildPaytrTokenPayload({
    config,
    customer: {
        fullName: 'Test Kullanıcı',
        email: 'çağrı@example.com',
        phone: '05551234567',
        address: 'Test Mahallesi, Test Sokak No:1'
    },
    items: [{ name: 'Test Telefon', price: 34.56, quantity: 1 }],
    amount: 34.56,
    userIp: '203.0.113.10',
    merchantOid
}), /customer\.email is invalid/);
assert.throws(() => parsePaytrTokenResponse('{"status":"failed","reason":"redacted"}'), PaytrProviderTransportError);
assert.throws(() => parsePaytrTokenResponse('{"status":"success","token":"x"}'), PaytrProviderTransportError);

(async () => {
    let request = null;
    const transport = createPaytrHttpTransport({
        fetchImpl: async (url, options) => {
            request = { url, options };
            return {
                ok: true,
                async text() { return '{"status":"success","token":"provider-token-123"}'; }
            };
        },
        timeoutMs: 1000
    });
    const providerResponse = await transport(tokenPayload);
    assert.strictEqual(request.url, PAYTR_TOKEN_URL);
    assert.strictEqual(request.options.method, 'POST');
    assert.strictEqual(request.options.redirect, 'error');
    assert.strictEqual(request.options.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.strictEqual(new URLSearchParams(request.options.body).get('merchant_oid'), merchantOid);
    assert.deepStrictEqual(providerResponse, { status: 'success', token: 'provider-token-123' });

    const session = await requestPaytrIframeSession({
        payload: tokenPayload,
        config,
        transport: async () => ({ status: 'success', token: 'provider-token-456' })
    });
    assert.deepStrictEqual(session, {
        type: 'iframe',
        token: 'provider-token-456',
        iframeUrl: 'https://www.paytr.com/odeme/guvenli/provider-token-456',
        successUrl: tokenPayload.merchant_ok_url,
        failUrl: tokenPayload.merchant_fail_url
    });
    await assert.rejects(
        () => requestPaytrIframeSession({
            payload: tokenPayload,
            config: { ...config, tokenUrl: 'https://evil.example/get-token' },
            transport: async () => ({ status: 'success', token: 'provider-token-456' })
        }),
        (error) => error instanceof PaytrProviderTransportError && error.code === 'PAYTR_ENDPOINT_NOT_ALLOWED'
    );

    console.log('payment PayTR service smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
