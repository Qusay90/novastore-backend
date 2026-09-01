'use strict';

const assert = require('assert');
const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');
const paymentController = require('../controllers/paymentController');
const { buildCheckoutAgreementPreview } = require('../services/legalDocumentService');
const { PaytrProviderTransportError } = require('../services/paytrPaymentService');

const { getCheckoutAgreementPreview, getPaymentStatus, initializePayment, __test: paymentTest } = paymentController;

const trackedEnv = [
    'NODE_ENV', 'APP_BASE_URL', 'PAYMENT_PROVIDER', 'PAYTR_MERCHANT_ID', 'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT', 'PAYTR_BASE_URL', 'PAYTR_CALLBACK_URL', 'PAYTR_SUCCESS_URL',
    'PAYTR_FAIL_URL', 'PAYTR_TEST_MODE', 'PAYTR_DEBUG_ON', 'PAYTR_LIVE_REQUESTS_ALLOWED',
    'BUSINESS_LEGAL_COMPANY_NAME', 'BUSINESS_TRADE_NAME', 'BUSINESS_TAX_VKN',
    'BUSINESS_TAX_OFFICE', 'BUSINESS_MERSIS_NUMBER',
    'BUSINESS_REGISTERED_ADDRESS', 'BUSINESS_KEP_ADDRESS', 'BUSINESS_PHONE', 'BUSINESS_EMAIL',
    'CUSTOMER_PUBLIC_DOMAIN', 'NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED',
    'NOVASTORE_LEGAL_PRE_INFORMATION_VERSION', 'NOVASTORE_LEGAL_PRE_INFORMATION_TEXT',
    'NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED', 'NOVASTORE_LEGAL_DISTANCE_SALE_VERSION',
    'NOVASTORE_LEGAL_DISTANCE_SALE_TEXT', 'FREE_SHIPPING_THRESHOLD', 'DEFAULT_SHIPPING_FEE'
];
const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
const originalConnect = pool.connect;
const originalQuery = pool.query;

const restore = () => {
    for (const key of trackedEnv) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
    pool.connect = originalConnect;
    pool.query = originalQuery;
    paymentTest.resetPaytrIframeSessionRequester();
};

const applyBaseEnv = () => {
    process.env.NODE_ENV = 'test';
    process.env.FREE_SHIPPING_THRESHOLD = '1500';
    process.env.DEFAULT_SHIPPING_FEE = '49.9';
};

const applyPaytrEnv = () => {
    applyBaseEnv();
    process.env.APP_BASE_URL = 'https://example.test';
    process.env.PAYMENT_PROVIDER = 'paytr';
    process.env.PAYTR_MERCHANT_ID = 'merchant-id';
    process.env.PAYTR_MERCHANT_KEY = 'merchant-key-secret';
    process.env.PAYTR_MERCHANT_SALT = 'merchant-salt-secret';
    process.env.PAYTR_BASE_URL = 'https://www.paytr.com';
    process.env.PAYTR_CALLBACK_URL = 'https://example.test/api/payments/webhook/paytr';
    process.env.PAYTR_SUCCESS_URL = 'https://example.test/#/odeme/sonuc';
    process.env.PAYTR_FAIL_URL = 'https://example.test/#/odeme/sonuc';
    process.env.PAYTR_TEST_MODE = 'true';
    process.env.PAYTR_DEBUG_ON = 'true';
    process.env.PAYTR_LIVE_REQUESTS_ALLOWED = 'true';
};

const applyIdentityEnv = () => {
    process.env.BUSINESS_LEGAL_COMPANY_NAME = 'Test Nova Teknoloji Anonim Şirketi';
    process.env.BUSINESS_TRADE_NAME = 'NovaStore Test';
    process.env.BUSINESS_TAX_VKN = '1234567890';
    process.env.BUSINESS_TAX_OFFICE = 'Test Vergi Dairesi';
    process.env.BUSINESS_MERSIS_NUMBER = '1234567890123456';
    process.env.BUSINESS_REGISTERED_ADDRESS = 'Test Mahallesi Test Sokak No 1 İstanbul';
    process.env.BUSINESS_KEP_ADDRESS = 'test@hs01.kep.tr';
    process.env.BUSINESS_PHONE = '+905551112233';
    process.env.BUSINESS_EMAIL = 'test@example.test';
    process.env.CUSTOMER_PUBLIC_DOMAIN = 'https://example.test/';
};

const applyLegalEnv = () => {
    process.env.NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED = 'true';
    process.env.NOVASTORE_LEGAL_PRE_INFORMATION_VERSION = 'test-pre-v1';
    process.env.NOVASTORE_LEGAL_PRE_INFORMATION_TEXT = 'Test ortamı için sahibince onaylanmış ön bilgilendirme metni.';
    process.env.NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED = 'true';
    process.env.NOVASTORE_LEGAL_DISTANCE_SALE_VERSION = 'test-distance-v1';
    process.env.NOVASTORE_LEGAL_DISTANCE_SALE_TEXT = 'Test ortamı için sahibince onaylanmış mesafeli satış metni.';
};

const applyReadyEnv = () => {
    applyPaytrEnv();
    applyIdentityEnv();
    applyLegalEnv();
};

const acceptances = () => ([
    { slug: 'pre-information', version: 'test-pre-v1', accepted: true },
    { slug: 'distance-sale', version: 'test-distance-v1', accepted: true }
]);

const agreementContext = () => paymentTest.buildCheckoutAgreementContext({
    identitySnapshot: {
        legalCompanyName: process.env.BUSINESS_LEGAL_COMPANY_NAME,
        tradeName: process.env.BUSINESS_TRADE_NAME,
        taxNumber: process.env.BUSINESS_TAX_VKN,
        taxOffice: process.env.BUSINESS_TAX_OFFICE,
        mersisNumber: process.env.BUSINESS_MERSIS_NUMBER,
        registeredAddress: process.env.BUSINESS_REGISTERED_ADDRESS,
        kepAddress: process.env.BUSINESS_KEP_ADDRESS,
        phone: process.env.BUSINESS_PHONE,
        email: process.env.BUSINESS_EMAIL,
        customerDomain: process.env.CUSTOMER_PUBLIC_DOMAIN
    },
    addressId: 301,
    customer: {
        fullName: 'Test Kullanıcı',
        email: 'customer@example.test',
        phone: '05551234567',
        address: 'Ev: Test Mahallesi Test Sokak No 1 Merkez / Kilis'
    },
    pricing: {
        items: [{ id: 101, name: 'Test Telefon', quantity: 1, price: 1000, line_total: 1000 }],
        totals: { currency: 'TRY', subtotal: 1000, bundleDiscount: 0, couponDiscount: 0, shippingFee: 49.9, total: 1049.9 },
        coupon: { applied: false, code: null, discountAmount: 0 }
    },
    platformAllocation: {
        currency: 'TRY',
        grossMinor: 100000,
        productIds: [101]
    },
    sellerProjection: []
});

const agreementSnapshotSha256 = () => buildCheckoutAgreementPreview({
    checkoutContext: agreementContext()
}).snapshotSha256;

const createRes = () => ({
    code: null,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
});

const createFakeClient = ({
    existingPaymentRows = [],
    existingPaymentRowsByRead = null,
    ownedAddress = true,
    addressEmails = ['customer@example.test'],
    productPrices = [1000]
} = {}) => {
    const calls = [];
    let transactionOpen = false;
    let paymentReadCount = 0;
    let addressReadCount = 0;
    let productReadCount = 0;
    let releaseCount = 0;
    let sessionLockHeld = false;
    return {
        calls,
        get transactionOpen() { return transactionOpen; },
        get releaseCount() { return releaseCount; },
        get sessionLockHeld() { return sessionLockHeld; },
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (/SELECT pg_advisory_lock/i.test(sql)) {
                assert.strictEqual(transactionOpen, false);
                sessionLockHeld = true;
                return { rows: [{ locked: true }], rowCount: 1 };
            }
            if (/SELECT pg_advisory_unlock/i.test(sql)) {
                assert.strictEqual(transactionOpen, false);
                const unlocked = sessionLockHeld;
                sessionLockHeld = false;
                return { rows: [{ unlocked }], rowCount: 1 };
            }
            if (sql === 'BEGIN') {
                transactionOpen = true;
                return { rows: [], rowCount: 0 };
            }
            if (['COMMIT', 'ROLLBACK'].includes(sql)) {
                transactionOpen = false;
                return { rows: [], rowCount: 0 };
            }
            if (/FROM payments p|JOIN payments p/i.test(sql)) {
                const rows = Array.isArray(existingPaymentRowsByRead)
                    ? (existingPaymentRowsByRead[Math.min(paymentReadCount, existingPaymentRowsByRead.length - 1)] || [])
                    : existingPaymentRows;
                paymentReadCount += 1;
                return { rows, rowCount: rows.length };
            }
            if (/FROM customer_addresses address_row/i.test(sql)) {
                assert.deepStrictEqual(params, [301, 10]);
                const email = addressEmails[Math.min(addressReadCount, addressEmails.length - 1)];
                addressReadCount += 1;
                const rows = ownedAddress ? [{
                    id: 301,
                    title: 'Ev',
                    full_name: 'Test Kullanıcı',
                    phone: '05551234567',
                    city: 'Kilis',
                    district: 'Merkez',
                    address_line: 'Test Mahallesi Test Sokak No 1',
                    email
                }] : [];
                return { rows, rowCount: rows.length };
            }
            if (/product\.id AS product_id/i.test(sql)) {
                return {
                    rows: [{
                        product_id: 101,
                        product_store_id: 501,
                        legacy_store_id: 501,
                        legacy_store_slug: 'novastore-platform',
                        legacy_store_is_active: true,
                        legacy_store_deleted_at: null,
                        seller_store_id: null
                    }],
                    rowCount: 1
                };
            }
            if (/FROM products/i.test(sql)) {
                const price = productPrices[Math.min(productReadCount, productPrices.length - 1)];
                productReadCount += 1;
                return {
                    rows: [{
                        id: 101,
                        name: 'Test Telefon',
                        price,
                        old_price: null,
                        stock: 5,
                        image_url: 'phone.png',
                        store_id: 501
                    }],
                    rowCount: 1
                };
            }
            if (/INSERT INTO orders/i.test(sql)) return {
                rows: [{ id: 7001, user_id: params[0], status: params[2], items: params[7], payment_status: params[8] }],
                rowCount: 1
            };
            if (/UPDATE products\s+SET stock = stock -/i.test(sql)) return { rows: [{ id: params[1], stock: 4 }], rowCount: 1 };
            if (/INSERT INTO payments/i.test(sql)) return { rows: [], rowCount: 1 };
            if (/UPDATE orders\s+SET payment_ref/i.test(sql)) return { rows: [], rowCount: 1 };
            if (/UPDATE coupons SET used_count/i.test(sql)) throw new Error('initialize must not consume coupon usage');
            return { rows: [], rowCount: 0 };
        },
        release() { releaseCount += 1; }
    };
};

const makeReq = (body = {}, headers = {}) => ({
    user: { id: 10, role: 'customer', principal: 'customer' },
    headers: { 'idempotency-key': 'idem-paytr-1', ...headers },
    ip: '203.0.113.10',
    body: {
        addressId: 301,
        cartItems: [{ productId: 101, quantity: 1 }],
        paymentMethod: 'card',
        analyticsSessionKey: 'customer-session-1',
        agreementAcceptances: acceptances(),
        agreementSnapshotSha256: (() => {
            try { return agreementSnapshotSha256(); } catch (_) { return ''; }
        })(),
        ...body
    }
});

const runInitialize = async ({
    configure = applyReadyEnv,
    clientOptions = {},
    body = {},
    requester,
    requesterFactory
} = {}) => {
    for (const key of trackedEnv) delete process.env[key];
    configure();
    const client = createFakeClient(clientOptions);
    let connectCount = 0;
    pool.connect = async () => { connectCount += 1; return client; };
    paymentTest.setPaytrIframeSessionRequester(
        (requesterFactory ? requesterFactory(client) : requester) || (async ({ payload }) => ({
        type: 'iframe',
        token: 'provider-token-123',
        iframeUrl: 'https://www.paytr.com/odeme/guvenli/provider-token-123',
        successUrl: payload.merchant_ok_url,
        failUrl: payload.merchant_fail_url
        }))
    );
    const res = createRes();
    await initializePayment(makeReq(body), res);
    return { client, connectCount, res };
};

const hasMutation = (client) => client.calls.some(({ sql }) => (
    /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql) || /\bnextval\s*\(/i.test(sql)
));

(async () => {
    const originalConsoleError = console.error;
    try {
        console.error = () => {};

        const absent = await runInitialize({ configure: () => { applyBaseEnv(); delete process.env.PAYMENT_PROVIDER; } });
        assert.strictEqual(absent.res.code, 503);
        assert.strictEqual(absent.res.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
        assert.strictEqual(absent.connectCount, 0);
        assert.strictEqual(hasMutation(absent.client), false);
        assert.strictEqual(JSON.stringify(absent.res.body).includes('PAYTR_MERCHANT_KEY'), false);

        const identityMissing = await runInitialize({ configure: () => { applyPaytrEnv(); applyLegalEnv(); } });
        assert.strictEqual(identityMissing.res.code, 503);
        assert.strictEqual(identityMissing.res.body.code, 'BUSINESS_IDENTITY_INCOMPLETE');
        assert.strictEqual(identityMissing.connectCount, 0);

        const legalMissing = await runInitialize({ configure: () => { applyPaytrEnv(); applyIdentityEnv(); } });
        assert.strictEqual(legalMissing.res.code, 503);
        assert.strictEqual(legalMissing.res.body.code, 'CHECKOUT_LEGAL_DOCUMENTS_NOT_PUBLISHED');
        assert.strictEqual(legalMissing.connectCount, 0);

        for (const key of trackedEnv) delete process.env[key];
        applyReadyEnv();
        const previewClient = createFakeClient();
        pool.connect = async () => previewClient;
        const previewRes = createRes();
        await getCheckoutAgreementPreview({
            user: { id: 10, role: 'customer', principal: 'customer' },
            body: {
                addressId: 301,
                cartItems: [{ productId: 101, quantity: 1 }],
                couponCode: null
            }
        }, previewRes);
        assert.strictEqual(previewRes.code, 200);
        assert.strictEqual(previewRes.body.schemaVersion, 'checkout-agreements-v2');
        assert.strictEqual(previewRes.body.snapshotSha256, agreementSnapshotSha256());
        assert.strictEqual(previewRes.body.context.delivery.addressId, 301);
        assert.strictEqual(previewRes.body.context.totals.total, 1049.9);
        assert.ok(previewRes.body.documents.every((document) => document.text.includes('NovaStore sunucu doğrulamalı işlem özeti')));
        assert.strictEqual(hasMutation(previewClient), false);

        const foreignAddress = await runInitialize({ clientOptions: { ownedAddress: false } });
        assert.strictEqual(foreignAddress.res.code, 404);
        assert.match(foreignAddress.res.body.error, /Teslimat adresi bulunamadı/);
        assert.strictEqual(hasMutation(foreignAddress.client), false);

        let providerFailureCalls = 0;
        const providerFailure = await runInitialize({
            requesterFactory: (client) => async () => {
                providerFailureCalls += 1;
                assert.strictEqual(client.transactionOpen, false);
                assert.strictEqual(client.calls.some(({ sql }) => sql === 'BEGIN'), false);
                assert.strictEqual(client.releaseCount, 1);
                throw new PaytrProviderTransportError('PAYTR_NETWORK_ERROR');
            }
        });
        assert.strictEqual(providerFailure.res.code, 502);
        assert.strictEqual(providerFailure.res.body.code, 'PAYTR_NETWORK_ERROR');
        assert.strictEqual(providerFailureCalls, 1);
        assert.strictEqual(providerFailure.connectCount, 1);
        assert.strictEqual(hasMutation(providerFailure.client), false);
        assert.strictEqual(providerFailure.client.calls.some(({ sql }) => sql === 'BEGIN'), false);
        assert.strictEqual(providerFailure.client.calls.some(({ sql }) => /\bnextval\s*\(/i.test(sql)), false);

        let staleProviderCalls = 0;
        const changedAfterToken = await runInitialize({
            clientOptions: {
                addressEmails: ['customer@example.test', 'changed-after-token@example.test']
            },
            requesterFactory: (client) => async ({ payload }) => {
                staleProviderCalls += 1;
                assert.strictEqual(client.transactionOpen, false);
                assert.strictEqual(client.releaseCount, 1);
                return {
                    type: 'iframe',
                    token: 'orphan-provider-token',
                    iframeUrl: 'https://www.paytr.com/odeme/guvenli/orphan-provider-token',
                    successUrl: payload.merchant_ok_url,
                    failUrl: payload.merchant_fail_url
                };
            }
        });
        assert.strictEqual(changedAfterToken.res.code, 409);
        assert.strictEqual(
            changedAfterToken.res.body.code,
            'CHECKOUT_AGREEMENT_SNAPSHOT_STALE',
            'Buyer email is now part of the accepted agreement snapshot and must fail stale first.'
        );
        assert.strictEqual(Object.prototype.hasOwnProperty.call(changedAfterToken.res.body, 'paymentAction'), false);
        assert.strictEqual(staleProviderCalls, 1);
        assert.strictEqual(hasMutation(changedAfterToken.client), false);
        assert.strictEqual(changedAfterToken.client.calls.some(({ sql }) => sql === 'ROLLBACK'), true);

        const ready = await runInitialize();
        assert.strictEqual(ready.res.code, 201);
        assert.strictEqual(ready.res.body.provider, 'paytr');
        assert.strictEqual(ready.res.body.paymentStatus, PAYMENT_STATUS.REQUIRES_ACTION);
        assert.strictEqual(ready.res.body.orderId, 7001);
        assert.match(ready.res.body.paymentRef, /^NSTPAYTR[a-f0-9]{40}$/);
        assert.deepStrictEqual(ready.res.body.paymentAction, {
            type: 'iframe',
            token: 'provider-token-123',
            iframeUrl: 'https://www.paytr.com/odeme/guvenli/provider-token-123',
            successUrl: ready.res.body.paymentAction.successUrl,
            failUrl: ready.res.body.paymentAction.failUrl
        });
        assert.strictEqual(new URL(ready.res.body.paymentAction.successUrl).searchParams.has('status'), false);
        const successHashParams = new URLSearchParams(new URL(ready.res.body.paymentAction.successUrl).hash.split('?')[1]);
        assert.strictEqual(successHashParams.get('paymentRef'), ready.res.body.paymentRef);
        assert.strictEqual(successHashParams.has('orderId'), false);
        assert.strictEqual(JSON.stringify(ready.res.body).includes('merchant-key-secret'), false);
        assert.strictEqual(JSON.stringify(ready.res.body).includes('merchant-salt-secret'), false);

        const paymentInsert = ready.client.calls.find(({ sql }) => /INSERT INTO payments/i.test(sql));
        assert.ok(paymentInsert);
        assert.strictEqual(paymentInsert.params[1], 'paytr');
        const rawRequest = JSON.parse(paymentInsert.params[7]);
        assert.strictEqual(rawRequest.addressId, 301);
        assert.strictEqual(rawRequest.checkoutAgreementSnapshot.schemaVersion, 'checkout-agreements-v2');
        assert.strictEqual(rawRequest.checkoutAgreementSnapshot.snapshotSha256, agreementSnapshotSha256());
        assert.deepStrictEqual(rawRequest.checkoutAgreementSnapshot.documents.map(({ slug, version }) => ({ slug, version })), [
            { slug: 'pre-information', version: 'test-pre-v1' },
            { slug: 'distance-sale', version: 'test-distance-v1' }
        ]);
        assert.ok(rawRequest.checkoutAgreementSnapshot.documents.every((document) => /^[a-f0-9]{64}$/.test(document.contentSha256)));
        assert.ok(rawRequest.checkoutAgreementSnapshot.documents.every((document) => document.text.includes('NovaStore sunucu doğrulamalı işlem özeti')));
        assert.strictEqual(rawRequest.checkoutAgreementSnapshot.context.delivery.addressId, 301);
        assert.strictEqual(rawRequest.checkoutAgreementSnapshot.context.delivery.phone, '05551234567');
        assert.strictEqual(rawRequest.checkoutAgreementSnapshot.context.items[0].productId, 101);
        assert.deepStrictEqual(rawRequest.checkoutAgreementSnapshot.context.platformAllocation.productIds, [101]);
        assert.deepStrictEqual(rawRequest.platformAllocation.productIds, [101]);
        assert.strictEqual(rawRequest.checkoutAgreementSnapshot.context.totals.total, 1049.9);
        assert.strictEqual(ready.client.calls.some(({ sql }) => /UPDATE products\s+SET stock = stock -/i.test(sql)), true);
        assert.strictEqual(ready.client.calls.some(({ sql }) => /UPDATE coupons SET used_count/i.test(sql)), false);
        const lockIndex = ready.client.calls.findIndex(({ sql }) => /SELECT pg_advisory_lock/i.test(sql));
        const beginIndex = ready.client.calls.findIndex(({ sql }) => sql === 'BEGIN');
        const unlockIndex = ready.client.calls.findIndex(({ sql }) => /SELECT pg_advisory_unlock/i.test(sql));
        assert.ok(lockIndex >= 0 && beginIndex > lockIndex && unlockIndex > beginIndex);
        assert.strictEqual(ready.client.sessionLockHeld, false);

        const storedAction = JSON.stringify(ready.res.body.paymentAction);
        let concurrentProviderCalls = 0;
        const concurrentDuplicate = await runInitialize({
            clientOptions: {
                existingPaymentRowsByRead: [[], [{
                    order_id: 7001,
                    payment_ref: ready.res.body.paymentRef,
                    status: PAYMENT_STATUS.REQUIRES_ACTION,
                    provider: 'paytr',
                    order_user_id: 10,
                    raw_request: paymentInsert.params[7],
                    raw_response: storedAction
                }]]
            },
            requesterFactory: (client) => async ({ payload }) => {
                concurrentProviderCalls += 1;
                assert.strictEqual(client.transactionOpen, false);
                assert.strictEqual(client.releaseCount, 1);
                return {
                    type: 'iframe',
                    token: 'unreturned-concurrent-token',
                    iframeUrl: 'https://www.paytr.com/odeme/guvenli/unreturned-concurrent-token',
                    successUrl: payload.merchant_ok_url,
                    failUrl: payload.merchant_fail_url
                };
            }
        });
        assert.strictEqual(concurrentDuplicate.res.code, 200);
        assert.strictEqual(concurrentDuplicate.res.body.reused, true);
        assert.deepStrictEqual(concurrentDuplicate.res.body.paymentAction, ready.res.body.paymentAction);
        assert.strictEqual(concurrentProviderCalls, 1);
        assert.strictEqual(hasMutation(concurrentDuplicate.client), false);
        assert.strictEqual(concurrentDuplicate.client.calls.some(({ sql }) => /INSERT INTO orders/i.test(sql)), false);

        const duplicate = await runInitialize({
            clientOptions: {
                existingPaymentRows: [{
                    order_id: 7001,
                    payment_ref: ready.res.body.paymentRef,
                    status: PAYMENT_STATUS.REQUIRES_ACTION,
                    provider: 'paytr',
                    order_user_id: 10,
                    raw_request: paymentInsert.params[7],
                    raw_response: storedAction
                }]
            }
        });
        assert.strictEqual(duplicate.res.code, 200);
        assert.strictEqual(duplicate.res.body.reused, true);
        assert.deepStrictEqual(duplicate.res.body.paymentAction, ready.res.body.paymentAction);
        assert.strictEqual(hasMutation(duplicate.client), false);

        const changedAddress = await runInitialize({
            body: { addressId: 302 },
            clientOptions: {
                existingPaymentRows: [{
                    order_id: 7001,
                    payment_ref: ready.res.body.paymentRef,
                    status: PAYMENT_STATUS.REQUIRES_ACTION,
                    provider: 'paytr',
                    order_user_id: 10,
                    raw_request: paymentInsert.params[7],
                    raw_response: storedAction
                }]
            }
        });
        assert.strictEqual(changedAddress.res.code, 409);
        assert.strictEqual(hasMutation(changedAddress.client), false);

        const statusClient = createFakeClient({ existingPaymentRows: [{
            id: 7101,
            payment_ref: ready.res.body.paymentRef,
            status: PAYMENT_STATUS.REQUIRES_ACTION,
            payment_status: PAYMENT_STATUS.REQUIRES_ACTION,
            provider: 'paytr',
            order_id: 7001,
            order_status: ORDER_STATUS.ODEME_BEKLIYOR,
            order_payment_status: PAYMENT_STATUS.REQUIRES_ACTION,
            order_user_id: 10,
            raw_request: {
                stockReserved: true,
                reservationExpiresAt: new Date(Date.now() + 60_000).toISOString()
            }
        }] });
        pool.connect = async () => statusClient;
        const statusRes = createRes();
        await getPaymentStatus({
            query: { paymentRef: ready.res.body.paymentRef, orderId: '7001' },
            user: { id: 10 }
        }, statusRes);
        assert.strictEqual(statusRes.code, 200);
        assert.strictEqual(statusRes.body.finalized, false);
        assert.strictEqual(statusRes.body.provider, 'paytr');

        console.log('payment PayTR initialize smoke passed');
    } finally {
        console.error = originalConsoleError;
        restore();
    }
})().catch((error) => {
    restore();
    console.error(error);
    process.exit(1);
});
