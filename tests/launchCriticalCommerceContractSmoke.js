'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL
        || 'postgresql://novastore_ci:novastore_ci_only@127.0.0.1:55432/novastore_ci',
    DB_SSL: 'false',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: ''
});

const {
    BusinessIdentityConfigError,
    assertBusinessIdentityReadyForPayment,
    buildBusinessIdentitySnapshot,
    getPublicBusinessIdentity
} = require('../config/businessIdentityConfig');
const {
    PaymentLaunchPolicyError,
    assertPaymentLaunchPolicy,
    isValidTurkishIban,
    readBankTransferConfig
} = require('../config/paymentLaunchPolicy');
const {
    DEFAULT_BANK_TRANSFER_RESERVATION_HOURS,
    DEFAULT_CARD_RESERVATION_MINUTES,
    buildReservationMetadata,
    getReservationDurationMs
} = require('../services/paymentReservationService');
const { requestContext } = require('../middlewares/securityMiddleware');
const { inferExpectedPrincipal } = require('../middlewares/authMiddleware');
const {
    MAX_CART_QUANTITY_PER_PRODUCT,
    normalizeCartItems
} = require('../services/pricingService');

const root = path.resolve(__dirname, '..');
const validIdentityEnv = Object.freeze({
    BUSINESS_LEGAL_COMPANY_NAME: 'NovaStore Teknoloji Anonim Şirketi',
    BUSINESS_TRADE_NAME: 'NovaStore',
    BUSINESS_TAX_VKN: '1234567890',
    BUSINESS_TAX_OFFICE: 'Test Vergi Dairesi',
    BUSINESS_MERSIS_NUMBER: '0123456789012345',
    BUSINESS_REGISTERED_ADDRESS: 'Örnek Mahallesi, Güvenli Sokak No: 1 İstanbul',
    BUSINESS_KEP_ADDRESS: 'novastore@hs01.kep.tr',
    BUSINESS_PHONE: '+902121234567',
    BUSINESS_EMAIL: 'destek@novastore.example',
    CUSTOMER_PUBLIC_DOMAIN: 'https://www.novastore.example',
    ADMIN_PUBLIC_DOMAIN: 'https://admin.novastore.example',
    SELLER_WEB_PUBLIC_DOMAIN: 'https://seller.novastore.example',
    CUSTOMER_ANDROID_APP_ID: 'com.novastore.customer',
    SELLER_ANDROID_APP_ID: 'com.novastore.seller'
});

const identity = assertBusinessIdentityReadyForPayment(validIdentityEnv);
const snapshot = buildBusinessIdentitySnapshot(identity);
assert.equal(snapshot.legalCompanyName, validIdentityEnv.BUSINESS_LEGAL_COMPANY_NAME);
assert.equal(snapshot.tradeName, validIdentityEnv.BUSINESS_TRADE_NAME);
assert.equal(snapshot.taxOffice, validIdentityEnv.BUSINESS_TAX_OFFICE);
assert.equal(snapshot.customerDomain, validIdentityEnv.CUSTOMER_PUBLIC_DOMAIN);
assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'adminDomain'), false);
assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'sellerAndroidAppId'), false);
assert.equal(getPublicBusinessIdentity(validIdentityEnv).status, 'configured');
assert.deepEqual(getPublicBusinessIdentity({ BUSINESS_LEGAL_COMPANY_NAME: 'Temporary Name' }), {
    status: 'pending_owner_company_formation',
    identity: null,
    issueCount: 8
});
assert.equal(
    getPublicBusinessIdentity({ ...validIdentityEnv, BUSINESS_TAX_OFFICE: '' }).status,
    'configured',
    'tax office stays optional until owner/legal/PayTR confirms it is required'
);
const identityWithoutTaxOffice = { ...validIdentityEnv };
delete identityWithoutTaxOffice.BUSINESS_TAX_OFFICE;
assert.equal(
    buildBusinessIdentitySnapshot(assertBusinessIdentityReadyForPayment(identityWithoutTaxOffice)).taxOffice,
    null,
    'an absent optional identity field must remain allowed for payment readiness'
);

for (const [environmentKey, invalidValue] of [
    ['BUSINESS_TAX_OFFICE', 'X'],
    ['BUSINESS_TAX_OFFICE', 'A'.repeat(161)],
    ['BUSINESS_TAX_OFFICE', 'Kadıköy Vergi Dairesi\nYetkisiz ek satır'],
    ['ADMIN_PUBLIC_DOMAIN', 'http://admin.novastore.example'],
    ['SELLER_WEB_PUBLIC_DOMAIN', 'https://seller.novastore.example/path'],
    ['CUSTOMER_ANDROID_APP_ID', 'invalid-app-id'],
    ['SELLER_ANDROID_APP_ID', 'invalid-app-id']
]) {
    assert.throws(
        () => assertBusinessIdentityReadyForPayment({
            ...validIdentityEnv,
            [environmentKey]: invalidValue
        }),
        (error) => error instanceof BusinessIdentityConfigError
            && error.code === 'BUSINESS_IDENTITY_INCOMPLETE'
            && error.details.includes(environmentKey),
        `present optional ${environmentKey} must be valid for payment readiness`
    );
}

assert.throws(
    () => assertBusinessIdentityReadyForPayment({ ...validIdentityEnv, BUSINESS_TAX_VKN: '123' }),
    (error) => error instanceof BusinessIdentityConfigError
        && error.code === 'BUSINESS_IDENTITY_INCOMPLETE'
        && error.details.includes('BUSINESS_TAX_VKN')
);
assert.throws(
    () => assertBusinessIdentityReadyForPayment({ ...validIdentityEnv, CUSTOMER_PUBLIC_DOMAIN: 'http://novastore.example' }),
    (error) => error instanceof BusinessIdentityConfigError
        && error.details.includes('CUSTOMER_PUBLIC_DOMAIN')
);

const validIban = 'TR330006100519786457841326';
assert.equal(isValidTurkishIban(validIban), true);
assert.equal(isValidTurkishIban('TR000000000000000000000000'), false);
assert.deepEqual(readBankTransferConfig({}), {
    enabled: false,
    accountName: '',
    iban: '',
    missing: ['NOVASTORE_BANK_TRANSFER_ENABLED', 'HAVALE_ACCOUNT_NAME', 'HAVALE_IBAN']
});

const productionCardPolicy = assertPaymentLaunchPolicy({
    paymentMethod: 'card',
    env: { ...validIdentityEnv, NODE_ENV: 'production' }
});
assert.equal(productionCardPolicy.production, true);
assert.equal(productionCardPolicy.identitySnapshot.legalCompanyName, validIdentityEnv.BUSINESS_LEGAL_COMPANY_NAME);
assert.throws(
    () => assertPaymentLaunchPolicy({ paymentMethod: 'havale', env: { NODE_ENV: 'test' } }),
    (error) => error instanceof PaymentLaunchPolicyError
        && error.code === 'BANK_TRANSFER_CONFIG_INCOMPLETE'
);
const validBankTransferEnv = {
    ...validIdentityEnv,
    NOVASTORE_BANK_TRANSFER_ENABLED: 'true',
    HAVALE_ACCOUNT_NAME: 'NovaStore Teknoloji A.Ş.',
    HAVALE_IBAN: validIban
};
assert.throws(
    () => assertPaymentLaunchPolicy({
        paymentMethod: 'havale',
        env: { ...validBankTransferEnv, NODE_ENV: 'production' }
    }),
    (error) => error instanceof PaymentLaunchPolicyError
        && error.code === 'BANK_TRANSFER_SETTLEMENT_NOT_ACTIVATED'
);
const bankPolicy = assertPaymentLaunchPolicy({
    paymentMethod: 'havale',
    env: { ...validBankTransferEnv, NODE_ENV: 'test' }
});
assert.equal(bankPolicy.bankTransfer.enabled, true);
assert.equal(bankPolicy.bankTransfer.iban, validIban);
assert.equal(bankPolicy.identitySnapshot, null);

assert.equal(getReservationDurationMs('card', {}), DEFAULT_CARD_RESERVATION_MINUTES * 60 * 1000);
assert.equal(getReservationDurationMs('havale', {}), DEFAULT_BANK_TRANSFER_RESERVATION_HOURS * 60 * 60 * 1000);
const fixedNow = Date.parse('2026-08-28T00:00:00.000Z');
const cardReservation = buildReservationMetadata({ paymentMethod: 'card', now: fixedNow, env: {} });
assert.equal(cardReservation.stockReserved, true);
assert.equal(cardReservation.stockReservedAt, '2026-08-28T00:00:00.000Z');
assert.equal(cardReservation.reservationExpiresAt, '2026-08-28T00:30:00.000Z');

const headers = new Map();
let nextCalled = false;
requestContext(
    { method: 'GET', path: '/health' },
    {
        statusCode: 200,
        setHeader(name, value) { headers.set(name, value); },
        once() {}
    },
    () => { nextCalled = true; }
);
assert.equal(nextCalled, true);
assert.match(headers.get('X-Request-Id'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.equal(inferExpectedPrincipal({ method: 'POST', originalUrl: '/api/returns' }), 'customer');
assert.equal(inferExpectedPrincipal({ method: 'GET', originalUrl: '/api/returns/mine' }), 'customer');
assert.equal(inferExpectedPrincipal({ method: 'PATCH', originalUrl: '/api/returns/42/status' }), 'admin');
assert.deepEqual(normalizeCartItems([
    { id: 7, quantity: 1 },
    { productId: 7, quantity: 2 }
]), [{ id: 7, quantity: 3, image: null, nameHint: null }]);
assert.throws(
    () => normalizeCartItems([{ id: 7, quantity: MAX_CART_QUANTITY_PER_PRODUCT + 1 }]),
    /Geçersiz ürün adedi/
);

const paymentControllerSource = fs.readFileSync(path.join(root, 'controllers', 'paymentController.js'), 'utf8');
const migrationSource = fs.readFileSync(
    path.join(root, 'migrations', '20260828_01_launch_critical_commerce_readiness.sql'),
    'utf8'
);
const returnSource = fs.readFileSync(path.join(root, 'services', 'returnWorkflowService.js'), 'utf8');
assert.match(paymentControllerSource, /pg_advisory_lock\(hashtextextended\(\$1, 0\)\)/);
assert.match(paymentControllerSource, /pg_advisory_unlock\(hashtextextended\(\$1, 0\)\)/);
assert.match(
    paymentControllerSource,
    /pg_advisory_lock\(hashtextextended\(\$1, 0\)\)[\s\S]{0,500}client\.query\('BEGIN'\)/,
    'idempotency session lock must be acquired before the short mutation transaction begins'
);
assert.match(paymentControllerSource, /createPendingPaymentOrder/);
assert.match(paymentControllerSource, /enqueueNotificationEvent\(client/);
assert.match(paymentControllerSource, /eventType:\s*EVENT\.(?:ORDER_CREATED|ORDER_CONFIRMED|PAYMENT_SUCCESS|PAYMENT_FAILED)/);
assert.doesNotMatch(paymentControllerSource, /createPaymentNotificationSafely/);
assert.match(migrationSource, /CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_one_active_per_order/);
assert.match(migrationSource, /CREATE TRIGGER trg_return_events_append_only/);
assert.match(migrationSource, /CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_order_items_source_index/);
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS coupon_reservations/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ/);
assert.match(returnSource, /refundProviderExecuted:\s*false/);
assert.doesNotMatch(returnSource, /https?:\/\//);

console.log('launch-critical commerce contract smoke passed');
