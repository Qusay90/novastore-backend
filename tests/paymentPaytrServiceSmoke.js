const assert = require('assert');
const {
    buildMockPaytrTokenResponse,
    buildPaytrCallbackHash,
    buildPaytrIframeUrl,
    buildPaytrMerchantOid,
    buildPaytrTokenPayload,
    buildPaytrUserBasket,
    resolvePaytrUrls,
    timingSafeEqualString,
    toPaytrPaymentAmount,
    verifyPaytrCallbackHash
} = require('../services/paytrPaymentService');

const config = {
    merchantId: 'merchant-123',
    merchantKey: 'secret-key-never-output',
    merchantSalt: 'secret-salt-never-output',
    baseUrl: 'https://www.paytr.com',
    callbackUrl: 'https://example.test/api/payments/webhook/paytr',
    successUrl: 'https://example.test/payment-result.html',
    failUrl: 'https://example.test/payment-result.html',
    testMode: true,
    debugOn: true
};

const order = { id: 7001 };
const merchantOid = buildPaytrMerchantOid(order, () => Buffer.from('1234567890abcdef', 'hex'));
assert.strictEqual(merchantOid, 'NST-PAYTR-7001-1234567890abcdef');
assert.match(buildPaytrMerchantOid(order), /^NST-PAYTR-7001-[a-f0-9]{16}$/);

assert.strictEqual(toPaytrPaymentAmount(34.56), 3456);
assert.strictEqual(toPaytrPaymentAmount(0.1 + 0.2), 30);

const userBasket = buildPaytrUserBasket([
    { name: 'Test Telefon', price: 1234.5, quantity: 2 },
    { name: '  Kablo\nUSB  ', price: 49.9, quantity: 1 }
]);
const decodedBasket = JSON.parse(Buffer.from(userBasket, 'base64').toString('utf8'));
assert.deepStrictEqual(decodedBasket, [
    ['Test Telefon', '1234.50', 2],
    ['Kablo USB', '49.90', 1]
]);

assert.strictEqual(
    buildPaytrIframeUrl('iframe-token-123', config),
    'https://www.paytr.com/odeme/guvenli/iframe-token-123'
);

const urls = resolvePaytrUrls({ config, paymentRef: merchantOid, orderId: order.id });
assert.strictEqual(urls.callbackUrl, config.callbackUrl);
assert.ok(urls.successUrl.includes(`paymentRef=${merchantOid}`));
assert.ok(urls.successUrl.includes('orderId=7001'));
assert.ok(urls.successUrl.includes('status=success'));
assert.ok(urls.failUrl.includes('status=failed'));

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
assert.strictEqual(verifyPaytrCallbackHash({ ...validCallbackPayload, hash: '' }, config), false);
assert.strictEqual(timingSafeEqualString(validCallbackPayload.hash, validCallbackPayload.hash), true);
assert.strictEqual(timingSafeEqualString(validCallbackPayload.hash, 'short'), false);

const tokenPayload = buildPaytrTokenPayload({
    config,
    order,
    customer: {
        fullName: 'Test Kullanici',
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

const mockToken = buildMockPaytrTokenResponse({
    merchantOid,
    paymentAmount: tokenPayload.payment_amount
});
assert.deepStrictEqual(mockToken, buildMockPaytrTokenResponse({
    merchantOid,
    paymentAmount: tokenPayload.payment_amount
}));
assert.strictEqual(mockToken.status, 'success');
assert.strictEqual(mockToken.mock, true);
assert.match(mockToken.token, /^mock-paytr-[a-f0-9]{40}$/);

console.log('payment PayTR service smoke passed');
