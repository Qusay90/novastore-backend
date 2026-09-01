'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { Client } = require('pg');
const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const { runApply } = require('../scripts/staging-migrations/runner');

const connectionString = String(process.env.LAUNCH_CRITICAL_TEST_DATABASE_URL || '').trim();
assert(connectionString, 'LAUNCH_CRITICAL_TEST_DATABASE_URL is required.');
const parsed = new URL(connectionString);
const host = parsed.hostname.replace(/^\[|\]$/g, '');
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
assert(['127.0.0.1', 'localhost', '::1'].includes(host), 'Integration target must be loopback.');
assert.equal(databaseName, 'novastore_launch_wave1_test', 'Integration target must be the dedicated Wave-1 test database.');
assert([55432, 55433, 55439].includes(Number(parsed.port)), 'Integration target must use an allowlisted disposable PostgreSQL port.');

Object.assign(process.env, {
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    DATABASE_URL: connectionString,
    DB_HOST: host,
    DB_PORT: parsed.port,
    DB_NAME: databaseName,
    DB_USER: decodeURIComponent(parsed.username),
    DB_PASSWORD: decodeURIComponent(parsed.password),
    DB_SSL: 'false',
    APP_BASE_URL: 'https://novastore.example',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: '',
    PAYMENT_PROVIDER: 'paytr',
    PAYTR_MERCHANT_ID: 'local-wave1-merchant',
    PAYTR_MERCHANT_KEY: 'local-wave1-key-not-a-secret',
    PAYTR_MERCHANT_SALT: 'local-wave1-salt-not-a-secret',
    PAYTR_BASE_URL: 'https://www.paytr.com',
    PAYTR_CALLBACK_URL: 'https://novastore.example/api/payments/webhook/paytr',
    PAYTR_SUCCESS_URL: 'https://novastore.example/payment-result.html',
    PAYTR_FAIL_URL: 'https://novastore.example/payment-result.html',
    PAYTR_TEST_MODE: 'true',
    PAYTR_DEBUG_ON: 'false',
    PAYTR_LIVE_REQUESTS_ALLOWED: 'true',
    NOVASTORE_REQUIRE_BUSINESS_IDENTITY_FOR_PAYMENT: 'false',
    BUSINESS_LEGAL_COMPANY_NAME: 'NovaStore Local Integration Test',
    BUSINESS_TRADE_NAME: 'NovaStore Local Test',
    BUSINESS_TAX_VKN: '1234567890',
    BUSINESS_TAX_OFFICE: 'Yerel Test Vergi Dairesi',
    BUSINESS_MERSIS_NUMBER: '1234567890123456',
    BUSINESS_REGISTERED_ADDRESS: 'Yalnız yerel entegrasyon testi adresi, İstanbul',
    BUSINESS_KEP_ADDRESS: 'local-integration@example.test',
    BUSINESS_PHONE: '+905551110000',
    BUSINESS_EMAIL: 'local-integration@example.test',
    CUSTOMER_PUBLIC_DOMAIN: 'https://novastore.example',
    NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED: 'true',
    NOVASTORE_LEGAL_PRE_INFORMATION_VERSION: 'local-integration-v1',
    NOVASTORE_LEGAL_PRE_INFORMATION_TEXT: 'Yalnız yerel entegrasyon testi için ön bilgilendirme metni.',
    NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED: 'true',
    NOVASTORE_LEGAL_DISTANCE_SALE_VERSION: 'local-integration-v1',
    NOVASTORE_LEGAL_DISTANCE_SALE_TEXT: 'Yalnız yerel entegrasyon testi için mesafeli satış metni.',
    NOVASTORE_RETURN_WINDOW_DAYS: '14',
    NOVASTORE_ADMIN_RETURN_WRITE_ENABLED: 'true',
    FREE_SHIPPING_THRESHOLD: '1',
    DEFAULT_SHIPPING_FEE: '49.90'
});

const migrationEnv = {
    NODE_ENV: 'test',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_STAGING_BOOTSTRAP_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: host,
    NOVASTORE_EXPECTED_DATABASE_NAME: databaseName,
    [LOCAL_TEST_CAPABILITY]: 'true',
    DATABASE_URL: connectionString
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../server') return { io: null };
    return originalLoad.call(this, request, parent, isMain);
};

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    contentType: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
    type(value) { this.contentType = value; return this; }
});

const invoke = async (handler, request) => {
    const response = createResponse();
    await handler(request, response);
    return response;
};

let paymentCustomerId = null;
let paymentAddressId = null;
const paymentRequest = (productId, idempotencyKey, overrides = {}) => ({
    method: 'POST',
    originalUrl: '/api/payments/initialize',
    path: '/initialize',
    headers: { 'idempotency-key': idempotencyKey },
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    user: { id: paymentCustomerId, principal: 'customer', role: 'customer' },
    body: {
        addressId: paymentAddressId,
        analyticsSessionKey: 'launch-wave1-session',
        cartItems: [{ id: productId, quantity: 1, price: 0.01 }],
        paymentMethod: 'card',
        ...overrides
    }
});

const expectCode = async (promise, code) => assert.rejects(
    promise,
    (error) => error && error.code === code,
    `Expected ${code}`
);

const admin = new Client({ connectionString, application_name: 'novastore_launch_wave1_assertions' });
let pool = null;
let paymentControllerTestApi = null;

(async () => {
    await admin.connect();
    await admin.query('DROP SCHEMA public CASCADE');
    await admin.query('CREATE SCHEMA public');

    const registry = loadRegistry();
    assert.equal(registry.length, 36);
    const firstApply = await runApply({ env: migrationEnv, registry, output: () => {} });
    const secondApply = await runApply({ env: migrationEnv, registry, output: () => {} });
    assert.deepEqual(firstApply.applied, registry.map((entry) => entry.id));
    assert.deepEqual(secondApply.applied, []);

    pool = require('../config/db');
    const paymentController = require('../controllers/paymentController');
    const {
        getCheckoutAgreementPreview,
        getPaymentStatus,
        initializePayment,
        webhookPaytr
    } = paymentController;
    paymentControllerTestApi = paymentController.__test;
    let providerSessionCalls = 0;
    paymentControllerTestApi.setPaytrIframeSessionRequester(async ({ payload, config }) => {
        providerSessionCalls += 1;
        const token = `local_${payload.merchant_oid}`;
        return Object.freeze({
            type: 'iframe',
            token,
            iframeUrl: `${config.baseUrl}/odeme/guvenli/${token}`,
            successUrl: payload.merchant_ok_url,
            failUrl: payload.merchant_fail_url
        });
    });
    const { cancelOrder, getUserOrders } = require('../controllers/orderController');
    const { getAllReturnRequests, getReturnById } = require('../controllers/returnController');
    const {
        createGetAdminOrderSummaries,
        createGetAdminReturnSummaries
    } = require('../services/adminCommerceReadService');
    const {
        createCustomerReturn,
        updateReturnByAdmin
    } = require('../services/returnWorkflowService');
    const {
        listOrders,
        listReturns,
        orderCommand,
        readOrder
    } = require('../services/sellerOrderFulfillmentService');
    const { dispatchNotificationOutboxBatch } = require('../services/notificationOutboxService');
    const { calculatePricing } = require('../services/pricingService');
    const { buildPaytrCallbackHash } = require('../services/paytrPaymentService');
    const {
        buildSellerPublicLegalIdentityContentSha256
    } = require('../services/sellerPublicLegalIdentityService');
    const {
        ORDER_STATUS,
        PAYMENT_STATUS,
        REFUND_STATUS,
        SHIPMENT_STATUS
    } = require('../constants/orderStatus');

    const users = await pool.query(
        `INSERT INTO users (full_name, name, email, phone, password, role, auth_enabled)
         VALUES
            ('Wave Customer', 'Wave Customer', 'wave-customer@example.test', '+905551110001', 'local-only', 'customer', TRUE),
            ('Other Customer', 'Other Customer', 'other-customer@example.test', '+905551110002', 'local-only', 'customer', TRUE),
            ('Wave Admin', 'Wave Admin', 'wave-admin@example.test', '+905551110003', 'local-only', 'admin', TRUE),
            ('Seller A User', 'Seller A User', 'seller-a@example.test', '+905551110004', 'local-only', 'customer', TRUE),
            ('Seller B User', 'Seller B User', 'seller-b@example.test', '+905551110005', 'local-only', 'customer', TRUE)
         RETURNING id, email`
    );
    const userIdByEmail = new Map(users.rows.map((row) => [row.email, Number(row.id)]));
    const customerId = userIdByEmail.get('wave-customer@example.test');
    const otherCustomerId = userIdByEmail.get('other-customer@example.test');
    const adminId = userIdByEmail.get('wave-admin@example.test');
    const sellerAUserId = userIdByEmail.get('seller-a@example.test');
    const sellerBUserId = userIdByEmail.get('seller-b@example.test');
    paymentCustomerId = customerId;

    const address = await pool.query(
        `INSERT INTO customer_addresses
            (user_id, title, full_name, phone, city, district, address_line, is_default)
         VALUES ($1, 'Ev', 'Wave Customer', '05551110001', 'İstanbul', 'Kadıköy',
                 'Yalnız yerel entegrasyon testi adresi No: 1', TRUE)
         RETURNING id`,
        [customerId]
    );
    paymentAddressId = Number(address.rows[0].id);

    const legacyStores = await pool.query(
        `INSERT INTO stores (name, slug, owner_user_id)
         VALUES ('Seller A Store', 'seller-a-store', $1), ('Seller B Store', 'seller-b-store', $2)
         RETURNING id, slug`,
        [sellerAUserId, sellerBUserId]
    );
    const legacyStoreBySlug = new Map(legacyStores.rows.map((row) => [row.slug, Number(row.id)]));
    const legacyStoreAId = legacyStoreBySlug.get('seller-a-store');
    const legacyStoreBId = legacyStoreBySlug.get('seller-b-store');
    const platformStores = await pool.query(
        `SELECT id
           FROM stores
          WHERE LOWER(slug) = 'novastore-platform'
            AND is_active = TRUE
            AND deleted_at IS NULL`
    );
    assert.equal(platformStores.rows.length, 1);
    const platformStoreId = Number(platformStores.rows[0].id);

    const products = await pool.query(
        `INSERT INTO products
            (name, price, stock, publication_status, is_customer_visible, store_id, sku, normalized_sku)
         VALUES
            ('Idempotency Product', 100.00, 5, 'active', TRUE, $1, 'WAVE-IDEMPOTENT', 'WAVE-IDEMPOTENT'),
            ('Last Unit Product', 80.00, 1, 'active', TRUE, $1, 'WAVE-LAST-UNIT', 'WAVE-LAST-UNIT'),
            ('Seller Projection Product', 250.00, 3, 'active', TRUE, $2, 'WAVE-SELLER-A', 'WAVE-SELLER-A')
         RETURNING id, name`,
        [platformStoreId, legacyStoreAId]
    );
    const productIdByName = new Map(products.rows.map((row) => [row.name, Number(row.id)]));
    const idempotencyProductId = productIdByName.get('Idempotency Product');
    const lastUnitProductId = productIdByName.get('Last Unit Product');
    const sellerProductId = productIdByName.get('Seller Projection Product');

    const organizations = await pool.query(
        `INSERT INTO seller_organizations (external_key, display_name)
         VALUES
            ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Seller A Organization'),
            ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'Seller B Organization')
         RETURNING id, display_name`
    );
    const organizationIdByName = new Map(organizations.rows.map((row) => [row.display_name, Number(row.id)]));
    const organizationAId = organizationIdByName.get('Seller A Organization');
    const organizationBId = organizationIdByName.get('Seller B Organization');
    await assert.rejects(
        () => pool.query(
            `INSERT INTO seller_public_legal_identities
                (organization_id, version, public_legal_name, public_trade_name,
                 public_disclosure_text, content_sha256, status,
                 created_by_admin_user_id)
             VALUES ($1, 'invalid-customer-creator', 'Rejected Test Tüzel Kişisi',
                     'Rejected Test', 'Customer role cannot create an identity.',
                     $2, 'draft', $3)`,
            [organizationAId, '0'.repeat(64), customerId]
        ),
        /creator must be an admin user/i
    );
    for (const [organizationId, suffix] of [[organizationAId, 'A'], [organizationBId, 'B']]) {
        const identity = {
            version: 'local-test-v1',
            publicLegalName: `Seller ${suffix} Test Tüzel Kişisi`,
            publicTradeName: `Seller ${suffix} Test`,
            publicDisclosureText: `Yalnız yerel entegrasyon testi için doğrulanmış Seller ${suffix} kamusal açıklaması.`
        };
        await pool.query(
            `INSERT INTO seller_public_legal_identities
                (organization_id, version, public_legal_name, public_trade_name,
                 public_disclosure_text, content_sha256, status,
                 created_by_admin_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)`,
            [
                organizationId,
                identity.version,
                identity.publicLegalName,
                identity.publicTradeName,
                identity.publicDisclosureText,
                buildSellerPublicLegalIdentityContentSha256(identity),
                adminId
            ]
        );
    }
    const managerRole = await pool.query("SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = 'manager'");
    const managerRoleId = Number(managerRole.rows[0].id);
    const memberships = await pool.query(
        `INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp)
         VALUES
            ($1, $2, $5, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1'),
            ($3, $4, $5, 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbb2')
         RETURNING id, organization_id`,
        [organizationAId, sellerAUserId, organizationBId, sellerBUserId, managerRoleId]
    );
    const membershipAId = Number(memberships.rows.find((row) => Number(row.organization_id) === organizationAId).id);
    const membershipBId = Number(memberships.rows.find((row) => Number(row.organization_id) === organizationBId).id);
    const sellerStores = await pool.query(
        `INSERT INTO seller_stores (organization_id, legacy_store_id, display_name)
         VALUES ($1, $2, 'Seller A Store'), ($3, $4, 'Seller B Store')
         RETURNING id, organization_id`,
        [organizationAId, legacyStoreAId, organizationBId, legacyStoreBId]
    );
    const sellerStoreAId = Number(sellerStores.rows.find((row) => Number(row.organization_id) === organizationAId).id);
    const sellerStoreBId = Number(sellerStores.rows.find((row) => Number(row.organization_id) === organizationBId).id);
    await pool.query(
        `INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id)
         VALUES ($1, $2, $3), ($4, $5, $6)`,
        [membershipAId, organizationAId, sellerStoreAId, membershipBId, organizationBId, sellerStoreBId]
    );

    const authorizedPaymentRequest = async (productId, idempotencyKey, overrides = {}) => {
        const request = paymentRequest(productId, idempotencyKey, overrides);
        const preview = await invoke(getCheckoutAgreementPreview, {
            user: request.user,
            body: {
                addressId: request.body.addressId,
                cartItems: request.body.cartItems,
                couponCode: request.body.couponCode || null
            }
        });
        assert.equal(preview.statusCode, 200, `Agreement preview failed: ${JSON.stringify(preview.payload)}`);
        return {
            ...request,
            body: {
                ...request.body,
                agreementSnapshotSha256: preview.payload.snapshotSha256,
                agreementAcceptances: preview.payload.documents.map((document) => ({
                    slug: document.slug,
                    version: document.version,
                    accepted: true
                }))
            }
        };
    };
    const sellerASession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    const sellerBSession = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    await pool.query(
        `INSERT INTO seller_sessions
            (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at)
         VALUES
            ($1, $2, $3, $4, 1, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1', NOW() + INTERVAL '1 day'),
            ($5, $6, $7, $8, 1, 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbb2', NOW() + INTERVAL '1 day')`,
        [sellerASession, sellerAUserId, organizationAId, membershipAId, sellerBSession, sellerBUserId, organizationBId, membershipBId]
    );
    const offer = await pool.query(
        `INSERT INTO seller_offers (organization_id, store_id, product_id, status, visibility)
         VALUES ($1, $2, $3, 'active', 'seller_visible') RETURNING id`,
        [organizationAId, sellerStoreAId, sellerProductId]
    );
    await pool.query(
        `INSERT INTO seller_offer_variants
            (organization_id, store_id, offer_id, seller_sku, price_minor, currency, status)
         VALUES ($1, $2, $3, 'SELLER-A-WAVE-1', 25000, 'TRY', 'active')`,
        [organizationAId, sellerStoreAId, Number(offer.rows[0].id)]
    );
    const sellerAgreementPreview = () => invoke(getCheckoutAgreementPreview, {
        user: { id: customerId, principal: 'customer', role: 'customer' },
        body: {
            addressId: paymentAddressId,
            cartItems: [{ id: sellerProductId, quantity: 1 }],
            couponCode: null
        }
    });
    const sellerAIdentityRow = (await pool.query(
        `SELECT id, content_sha256
           FROM seller_public_legal_identities
          WHERE organization_id = $1 AND status = 'draft'`,
        [organizationAId]
    )).rows[0];
    assert.ok(sellerAIdentityRow);

    const unapprovedSellerPreview = await sellerAgreementPreview();
    assert.equal(unapprovedSellerPreview.statusCode, 503);
    assert.equal(unapprovedSellerPreview.payload.code, 'SELLER_PUBLIC_LEGAL_IDENTITY_REQUIRED');
    await assert.rejects(
        () => pool.query(
            `UPDATE seller_public_legal_identities
                SET status = 'approved', approved_by_admin_user_id = $2, approved_at = CURRENT_TIMESTAMP
              WHERE id = $1`,
            [sellerAIdentityRow.id, customerId]
        ),
        /approver must be an admin user/i
    );
    await pool.query(
        `UPDATE seller_public_legal_identities
            SET status = 'approved', approved_by_admin_user_id = $2, approved_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [sellerAIdentityRow.id, adminId]
    );

    await assert.rejects(
        () => pool.query(
            'UPDATE seller_public_legal_identities SET content_sha256 = $2 WHERE id = $1',
            [sellerAIdentityRow.id, '0'.repeat(64)]
        ),
        /immutable|new version/i
    );
    const identityEvents = await pool.query(
        `SELECT event_type
           FROM seller_public_legal_identity_events
          WHERE identity_id = $1
          ORDER BY id`,
        [sellerAIdentityRow.id]
    );
    assert.deepEqual(identityEvents.rows.map((row) => row.event_type), ['created', 'approved']);
    await assert.rejects(
        () => pool.query(
            `UPDATE seller_public_legal_identity_events
                SET metadata_redacted = '{"tampered":true}'::jsonb
              WHERE identity_id = $1`,
            [sellerAIdentityRow.id]
        ),
        /append-only/i
    );

    const verifiedSellerPreview = await sellerAgreementPreview();
    assert.equal(verifiedSellerPreview.statusCode, 200, JSON.stringify(verifiedSellerPreview.payload));
    assert.equal(verifiedSellerPreview.payload.context.delivery.email, 'wave-customer@example.test');
    assert.equal(verifiedSellerPreview.payload.context.businessIdentity.tradeName, 'NovaStore Local Test');
    assert.equal(verifiedSellerPreview.payload.context.businessIdentity.taxOffice, 'Yerel Test Vergi Dairesi');
    assert.equal(verifiedSellerPreview.payload.context.sellers.length, 1);
    assert.equal(verifiedSellerPreview.payload.context.sellers[0].organizationId, organizationAId);
    assert.equal(verifiedSellerPreview.payload.context.sellers[0].legalIdentity.organizationId, organizationAId);
    assert.equal(verifiedSellerPreview.payload.context.sellers[0].legalIdentity.publicLegalName, 'Seller A Test Tüzel Kişisi');
    assert.equal(verifiedSellerPreview.payload.context.sellers[0].legalIdentity.contentSha256, sellerAIdentityRow.content_sha256);
    assert.doesNotMatch(JSON.stringify(verifiedSellerPreview.payload), /Seller B Test Tüzel Kişisi/);
    await pool.query(
        `INSERT INTO coupons
            (code, discount_type, discount_value, min_order_amount, usage_limit, used_count, is_active)
         VALUES ('LAUNCH10', 'PERCENT', 10, 0, 1, 0, TRUE)`
    );

    const unauthenticatedPayment = await invoke(
        initializePayment,
        { ...paymentRequest(idempotencyProductId, 'launch-unauthenticated-0001'), user: null }
    );
    assert.equal(unauthenticatedPayment.statusCode, 401);
    assert.equal(unauthenticatedPayment.payload.code, 'PAYMENT_CUSTOMER_SESSION_REQUIRED');

    const canonicalDuplicatePricing = await calculatePricing({
        cartItems: [
            { id: sellerProductId, quantity: 1 },
            { productId: sellerProductId, quantity: 2 }
        ],
        client: pool
    });
    assert.equal(canonicalDuplicatePricing.items.length, 1);
    assert.equal(canonicalDuplicatePricing.items[0].quantity, 3);
    assert.equal(canonicalDuplicatePricing.totals.bundleDiscount, 0);
    await assert.rejects(
        calculatePricing({ cartItems: [{ id: sellerProductId, quantity: 21 }], client: pool }),
        /Geçersiz ürün adedi/
    );

    const sameKey = 'launch-idempotency-0001';
    const [sameRequestA, sameRequestB] = await Promise.all([
        authorizedPaymentRequest(idempotencyProductId, sameKey),
        authorizedPaymentRequest(idempotencyProductId, sameKey)
    ]);
    const [sameA, sameB] = await Promise.all([
        invoke(initializePayment, sameRequestA),
        invoke(initializePayment, sameRequestB)
    ]);
    assert.deepEqual([sameA.statusCode, sameB.statusCode].sort(), [200, 201]);
    assert.equal(Number(sameA.payload.orderId), Number(sameB.payload.orderId));
    const sameKeySnapshot = await pool.query(
        `SELECT
            (SELECT COUNT(*)::int FROM payments WHERE idempotency_key = $1) AS payments,
            (SELECT COUNT(*)::int FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.idempotency_key = $1) AS orders,
            (SELECT stock FROM products WHERE id = $2) AS stock`,
        [sameKey, idempotencyProductId]
    );
    assert.deepEqual(sameKeySnapshot.rows[0], { payments: 1, orders: 1, stock: 4 });
    const cancellableOrderId = Number(sameA.payload.orderId);
    await pool.query('UPDATE orders SET user_id = $1 WHERE id = $2', [customerId, cancellableOrderId]);
    const foreignCancellation = await invoke(cancelOrder, {
        params: { id: String(cancellableOrderId) },
        body: { reason_code: 'CUSTOMER_REQUEST', expected_status: ORDER_STATUS.ODEME_BEKLIYOR },
        headers: {},
        user: { id: otherCustomerId, principal: 'customer', role: 'customer' }
    });
    assert.equal(foreignCancellation.statusCode, 404);
    const pendingCancellation = await invoke(cancelOrder, {
        params: { id: String(cancellableOrderId) },
        body: { reason_code: 'CUSTOMER_REQUEST', expected_status: ORDER_STATUS.ODEME_BEKLIYOR },
        headers: {},
        user: { id: customerId, principal: 'customer', role: 'customer' }
    });
    assert.equal(pendingCancellation.statusCode, 409);
    assert.equal(pendingCancellation.payload.code, 'ORDER_PAYMENT_PENDING_CANCELLATION_BLOCKED');
    const createdSamePayment = [sameA, sameB].find((response) => response.statusCode === 201);
    const sameTotalAmount = String(Math.round(Number(createdSamePayment.payload.totals.total) * 100));
    const sameCallbackBody = {
        merchant_oid: createdSamePayment.payload.paymentRef,
        status: 'success',
        total_amount: sameTotalAmount,
        payment_amount: sameTotalAmount,
        payment_type: 'card',
        currency: 'TL',
        test_mode: '1',
        hash: buildPaytrCallbackHash({
            merchantOid: createdSamePayment.payload.paymentRef,
            status: 'success',
            totalAmount: sameTotalAmount,
            merchantKey: process.env.PAYTR_MERCHANT_KEY,
            merchantSalt: process.env.PAYTR_MERCHANT_SALT
        })
    };
    const samePaymentCapture = await invoke(webhookPaytr, {
        body: sameCallbackBody,
        headers: {},
        method: 'POST'
    });
    assert.equal(samePaymentCapture.statusCode, 200);
    const ownerCancellation = await invoke(cancelOrder, {
        params: { id: String(cancellableOrderId) },
        body: { reason_code: 'CUSTOMER_REQUEST', expected_status: ORDER_STATUS.HAZIRLANIYOR },
        headers: {},
        user: { id: customerId, principal: 'customer', role: 'customer' }
    });
    assert.equal(ownerCancellation.statusCode, 200);
    assert.equal(ownerCancellation.payload.order.status, ORDER_STATUS.IPTAL_EDILDI);
    assert.equal(ownerCancellation.payload.refund.status, REFUND_STATUS.PENDING);
    assert.equal(ownerCancellation.payload.refund.providerExecuted, false);
    const cancellationSnapshot = await pool.query(
        `SELECT o.status, o.refund_status, p.status AS payment_status, product.stock,
                EXISTS (SELECT 1 FROM order_events event WHERE event.order_id = o.id AND event.event_type = 'ORDER_CANCELLED') AS has_event
         FROM orders o
         JOIN payments p ON p.order_id = o.id
         JOIN products product ON product.id = $1
         WHERE o.id = $2`,
        [idempotencyProductId, cancellableOrderId]
    );
    assert.equal(cancellationSnapshot.rows[0].status, ORDER_STATUS.IPTAL_EDILDI);
    assert.equal(cancellationSnapshot.rows[0].refund_status, REFUND_STATUS.PENDING);
    assert.equal(cancellationSnapshot.rows[0].payment_status, PAYMENT_STATUS.PAID);
    assert.equal(Number(cancellationSnapshot.rows[0].stock), 5);
    assert.equal(cancellationSnapshot.rows[0].has_event, true);

    const [lastRequestA, lastRequestB] = await Promise.all([
        authorizedPaymentRequest(lastUnitProductId, 'launch-last-unit-0001'),
        authorizedPaymentRequest(lastUnitProductId, 'launch-last-unit-0002')
    ]);
    const [lastA, lastB] = await Promise.all([
        invoke(initializePayment, lastRequestA),
        invoke(initializePayment, lastRequestB)
    ]);
    assert.deepEqual([lastA.statusCode, lastB.statusCode].sort(), [201, 409]);
    const lastUnitSnapshot = await pool.query(
        `SELECT
            stock,
            (SELECT COUNT(*)::int FROM payments WHERE idempotency_key IN ('launch-last-unit-0001', 'launch-last-unit-0002')) AS payments
         FROM products WHERE id = $1`,
        [lastUnitProductId]
    );
    assert.deepEqual(lastUnitSnapshot.rows[0], { stock: 0, payments: 1 });

    const stockBeforeExpiry = Number((await pool.query('SELECT stock FROM products WHERE id = $1', [idempotencyProductId])).rows[0].stock);
    const expiring = await invoke(
        initializePayment,
        await authorizedPaymentRequest(idempotencyProductId, 'launch-expiry-0001')
    );
    assert.equal(expiring.statusCode, 201);
    await pool.query(
        `UPDATE payments
         SET raw_request = raw_request || '{"reservationExpiresAt":"2026-08-01T00:00:00.000Z"}'::jsonb
         WHERE idempotency_key = 'launch-expiry-0001'`
    );
    const expiredStatus = await invoke(getPaymentStatus, {
        query: {
            paymentRef: expiring.payload.paymentRef,
            orderId: String(expiring.payload.orderId)
        },
        user: { id: customerId, principal: 'customer', role: 'customer' }
    });
    assert.equal(expiredStatus.statusCode, 200);
    assert.equal(expiredStatus.payload.paymentStatus, PAYMENT_STATUS.FAILED);
    assert.equal(expiredStatus.payload.nextAction, 'RETRY_PAYMENT');
    const duplicateExpiredStatus = await invoke(getPaymentStatus, {
        query: {
            paymentRef: expiring.payload.paymentRef,
            orderId: String(expiring.payload.orderId)
        },
        user: { id: customerId, principal: 'customer', role: 'customer' }
    });
    assert.equal(duplicateExpiredStatus.statusCode, 200);
    assert.equal(duplicateExpiredStatus.payload.paymentStatus, PAYMENT_STATUS.FAILED);
    const expirySnapshot = await pool.query(
        `SELECT p.status AS payment_status, o.status AS order_status, product.stock,
                (SELECT status FROM coupon_reservations reservation WHERE reservation.order_id = o.id) AS coupon_reservation_status,
                (SELECT COUNT(*)::int FROM order_events event WHERE event.order_id = o.id AND event.event_type = 'PAYMENT_RESERVATION_EXPIRED') AS event_count
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         JOIN products product ON product.id = $1
         WHERE p.idempotency_key = 'launch-expiry-0001'`,
        [idempotencyProductId]
    );
    assert.equal(expirySnapshot.rows[0].payment_status, PAYMENT_STATUS.FAILED);
    assert.equal(expirySnapshot.rows[0].order_status, ORDER_STATUS.IPTAL_EDILDI);
    assert.equal(Number(expirySnapshot.rows[0].stock), stockBeforeExpiry);
    assert.equal(expirySnapshot.rows[0].event_count, 1);

    const sellerInitialize = await invoke(
        initializePayment,
        await authorizedPaymentRequest(sellerProductId, 'launch-seller-order-0001', { couponCode: 'LAUNCH10' })
    );
    assert.equal(sellerInitialize.statusCode, 201);
    assert.equal(Number(sellerInitialize.payload.totals.subtotal), 250);
    assert.equal(Number(sellerInitialize.payload.totals.couponDiscount), 25);
    assert.equal(Number(sellerInitialize.payload.totals.total), 225);
    const canonicalOrderId = Number(sellerInitialize.payload.orderId);
    const storedSellerAgreement = await pool.query(
        'SELECT raw_request FROM payments WHERE order_id = $1',
        [canonicalOrderId]
    );
    const storedSellerRawRequest = typeof storedSellerAgreement.rows[0].raw_request === 'string'
        ? JSON.parse(storedSellerAgreement.rows[0].raw_request)
        : storedSellerAgreement.rows[0].raw_request;
    const storedAgreementSnapshot = storedSellerRawRequest.checkoutAgreementSnapshot;
    assert.equal(storedAgreementSnapshot.schemaVersion, 'checkout-agreements-v2');
    assert.equal(Number.isFinite(Date.parse(storedAgreementSnapshot.acceptedAt)), true);
    assert.equal(storedAgreementSnapshot.context.delivery.email, 'wave-customer@example.test');
    assert.equal(storedAgreementSnapshot.context.businessIdentity.tradeName, 'NovaStore Local Test');
    assert.equal(storedAgreementSnapshot.context.businessIdentity.taxOffice, 'Yerel Test Vergi Dairesi');
    assert.equal(storedAgreementSnapshot.context.sellers.length, 1);
    assert.equal(storedAgreementSnapshot.context.sellers[0].organizationId, organizationAId);
    assert.equal(storedAgreementSnapshot.context.sellers[0].legalIdentity.organizationId, organizationAId);
    assert.equal(storedAgreementSnapshot.context.sellers[0].legalIdentity.publicLegalName, 'Seller A Test Tüzel Kişisi');
    assert.equal(storedAgreementSnapshot.context.sellers[0].legalIdentity.contentSha256, sellerAIdentityRow.content_sha256);
    assert.ok(storedAgreementSnapshot.documents.every((document) => /^[a-f0-9]{64}$/.test(document.sourceTemplateSha256)));
    assert.ok(storedAgreementSnapshot.documents.every((document) => /^[a-f0-9]{64}$/.test(document.sourceContentSha256)));
    assert.ok(storedAgreementSnapshot.documents.every((document) => /^[a-f0-9]{64}$/.test(document.contentSha256)));
    assert.doesNotMatch(JSON.stringify(storedSellerRawRequest), /Seller B Test Tüzel Kişisi/);
    const reservedCoupon = await pool.query(
        'SELECT status FROM coupon_reservations WHERE order_id = $1',
        [canonicalOrderId]
    );
    assert.equal(reservedCoupon.rows[0].status, 'RESERVED');
    const competingCouponIntent = await invoke(
        initializePayment,
        await authorizedPaymentRequest(sellerProductId, 'launch-seller-order-0002', { couponCode: 'LAUNCH10' })
    );
    assert.equal(competingCouponIntent.statusCode, 409);
    assert.equal(competingCouponIntent.payload.code, 'COUPON_USAGE_LIMIT_RESERVED');
    await pool.query('UPDATE orders SET user_id = $1 WHERE id = $2', [customerId, canonicalOrderId]);
    const totalAmount = String(Math.round(Number(sellerInitialize.payload.totals.total) * 100));
    const callbackBody = {
        merchant_oid: sellerInitialize.payload.paymentRef,
        status: 'success',
        total_amount: totalAmount,
        payment_amount: totalAmount,
        payment_type: 'card',
        currency: 'TL',
        test_mode: '1',
        hash: buildPaytrCallbackHash({
            merchantOid: sellerInitialize.payload.paymentRef,
            status: 'success',
            totalAmount,
            merchantKey: process.env.PAYTR_MERCHANT_KEY,
            merchantSalt: process.env.PAYTR_MERCHANT_SALT
        })
    };
    const callbackFirst = await invoke(webhookPaytr, { body: callbackBody, headers: {}, method: 'POST' });
    const callbackReplay = await invoke(webhookPaytr, { body: callbackBody, headers: {}, method: 'POST' });
    assert.equal(callbackFirst.statusCode, 200);
    assert.equal(callbackFirst.payload, 'OK');
    assert.equal(callbackReplay.statusCode, 200);
    assert.equal(callbackReplay.payload, 'OK');

    const paidSnapshot = await pool.query(
        `SELECT o.status, o.payment_status, o.total_amount, p.status AS provider_payment_status,
                (SELECT COUNT(*)::int FROM seller_orders WHERE canonical_order_id = o.id) AS seller_orders,
                (SELECT COUNT(*)::int FROM seller_order_items item JOIN seller_orders seller_order ON seller_order.id = item.seller_order_id WHERE seller_order.canonical_order_id = o.id) AS seller_items,
                (SELECT used_count FROM coupons WHERE code = 'LAUNCH10') AS coupon_used_count,
                (SELECT status FROM coupon_reservations reservation WHERE reservation.order_id = o.id) AS coupon_reservation_status
         FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`,
        [canonicalOrderId]
    );
    assert.equal(paidSnapshot.rows[0].status, ORDER_STATUS.HAZIRLANIYOR);
    assert.equal(paidSnapshot.rows[0].payment_status, PAYMENT_STATUS.PAID);
    assert.equal(paidSnapshot.rows[0].provider_payment_status, PAYMENT_STATUS.PAID);
    assert.equal(Number(paidSnapshot.rows[0].total_amount), 225);
    assert.equal(paidSnapshot.rows[0].seller_orders, 1);
    assert.equal(paidSnapshot.rows[0].seller_items, 1);
    assert.equal(Number(paidSnapshot.rows[0].coupon_used_count), 1);
    assert.equal(paidSnapshot.rows[0].coupon_reservation_status, 'CONSUMED');

    const adminOrderSummaries = await invoke(
        createGetAdminOrderSummaries(pool),
        { query: { limit: '100' } }
    );
    assert.equal(adminOrderSummaries.statusCode, 200);
    const adminOrder = adminOrderSummaries.payload.items.find((entry) => Number(entry.id) === canonicalOrderId);
    assert.ok(adminOrder, 'Paid order must be visible in the Admin order projection.');
    assert.equal(adminOrder.payment_status, PAYMENT_STATUS.PAID);
    assert.equal(adminOrder.status, ORDER_STATUS.HAZIRLANIYOR);

    const sellerAContext = Object.freeze({
        sessionId: sellerASession,
        organizationId: organizationAId,
        membershipId: membershipAId,
        userId: sellerAUserId,
        storeIds: [sellerStoreAId]
    });
    const sellerBContext = Object.freeze({
        sessionId: sellerBSession,
        organizationId: organizationBId,
        membershipId: membershipBId,
        userId: sellerBUserId,
        storeIds: [sellerStoreBId]
    });
    const sellerOrders = await listOrders(pool, sellerAContext, {});
    assert.equal(sellerOrders.length, 1);
    const sellerOrder = sellerOrders[0];
    await expectCode(readOrder(pool, sellerBContext, sellerOrder.id), 'RESOURCE_NOT_FOUND');
    const packageId = sellerOrder.packages[0].id;
    const prepared = await orderCommand(pool, sellerAContext, sellerOrder.id, {
        command: 'prepare',
        package_id: packageId,
        revision: sellerOrder.revision,
        idempotency_key: 'launch-seller-prepare-0001'
    });
    assert.equal(prepared.order.status, 'preparing');
    const shipped = await orderCommand(pool, sellerAContext, sellerOrder.id, {
        command: 'ship',
        package_id: packageId,
        carrier_name: 'Nova Kargo',
        tracking_number: 'NOVA-WAVE1-0001',
        revision: prepared.order.revision,
        idempotency_key: 'launch-seller-ship-0001'
    });
    assert.equal(shipped.order.status, 'shipped');
    const shippedCanonical = await pool.query(
        'SELECT status, shipment_status, shipment_provider, tracking_no FROM orders WHERE id = $1',
        [canonicalOrderId]
    );
    assert.deepEqual(shippedCanonical.rows[0], {
        status: ORDER_STATUS.KARGOYA_VERILDI,
        shipment_status: SHIPMENT_STATUS.IN_TRANSIT,
        shipment_provider: 'Nova Kargo',
        tracking_no: 'NOVA-WAVE1-0001'
    });

    await pool.query(
        'UPDATE orders SET status = $1, shipment_status = $2, delivered_at = NOW(), updated_at = NOW() WHERE id = $3',
        [ORDER_STATUS.TESLIM_EDILDI, SHIPMENT_STATUS.DELIVERED, canonicalOrderId]
    );
    await expectCode(
        createCustomerReturn({
            user: { id: adminId, principal: 'admin', role: 'admin' },
            body: { order_id: canonicalOrderId, reason_code: 'DAMAGED', note: 'wrong role' },
            database: pool
        }),
        'RETURN_CUSTOMER_REQUIRED'
    );
    const returnCreated = await createCustomerReturn({
        user: { id: customerId, principal: 'customer', role: 'customer' },
        body: { order_id: canonicalOrderId, reason_code: 'DAMAGED', note: 'Ürün hasarlı ulaştı.' },
        database: pool
    });
    assert.equal(returnCreated.reused, false);
    assert.equal(returnCreated.return.status, 'REQUESTED');
    assert.equal(Number(returnCreated.return.refund_amount), 225);
    const returnId = returnCreated.return.id;
    const sellerReturns = await listReturns(pool, sellerAContext, {});
    assert.equal(sellerReturns.length, 1);
    assert.equal(sellerReturns[0].status, 'requested');

    const foreignReturn = await invoke(getReturnById, {
        params: { id: String(returnId) },
        user: { id: otherCustomerId, principal: 'customer', role: 'customer' }
    });
    assert.equal(foreignReturn.statusCode, 404);
    const ownerReturn = await invoke(getReturnById, {
        params: { id: String(returnId) },
        user: { id: customerId, principal: 'customer', role: 'customer' }
    });
    assert.equal(ownerReturn.statusCode, 200);
    assert.equal(ownerReturn.payload.id, returnId);

    await expectCode(
        updateReturnByAdmin({
            returnId,
            admin: { id: customerId, principal: 'customer', role: 'customer' },
            body: { status: 'IN_REVIEW', expected_revision: 1 },
            database: pool
        }),
        'RETURN_ADMIN_REQUIRED'
    );
    const inReview = await updateReturnByAdmin({
        returnId,
        admin: { id: adminId, principal: 'admin', role: 'admin' },
        body: { status: 'IN_REVIEW', expected_revision: 1 },
        database: pool
    });
    assert.equal(inReview.return.status, 'IN_REVIEW');
    assert.equal(inReview.return.revision, 2);
    await expectCode(
        updateReturnByAdmin({
            returnId,
            admin: { id: adminId, principal: 'admin', role: 'admin' },
            body: { status: 'APPROVED', expected_revision: 2 },
            database: pool
        }),
        'RETURN_VALIDATION_FAILED'
    );
    await expectCode(
        updateReturnByAdmin({
            returnId,
            admin: { id: adminId, principal: 'admin', role: 'admin' },
            body: { status: 'APPROVED', expected_revision: 1, decision_note: 'İade kabul edildi.' },
            database: pool
        }),
        'RETURN_REVISION_CONFLICT'
    );
    const approved = await updateReturnByAdmin({
        returnId,
        admin: { id: adminId, principal: 'admin', role: 'admin' },
        body: { status: 'APPROVED', expected_revision: 2, decision_note: 'Hasar kanıtı doğrulandı; iade kabul edildi.' },
        database: pool
    });
    assert.equal(approved.return.status, 'APPROVED');
    assert.equal(approved.return.revision, 3);
    assert.equal(approved.refundProviderExecuted, false);
    assert.equal(approved.refundProviderRequired, true);

    const returnSnapshot = await pool.query(
        `SELECT r.status, r.revision, r.decision_note, o.refund_status, payment.status AS payment_status,
                seller_return.status AS seller_return_status,
                (SELECT COUNT(*)::int FROM return_events event WHERE event.return_id = r.id) AS event_count
         FROM returns r
         JOIN orders o ON o.id = r.order_id
         JOIN payments payment ON payment.order_id = o.id
         JOIN seller_returns seller_return ON seller_return.canonical_return_id = r.id
         WHERE r.id = $1`,
        [returnId]
    );
    assert.equal(returnSnapshot.rows[0].status, 'APPROVED');
    assert.equal(Number(returnSnapshot.rows[0].revision), 3);
    assert.equal(returnSnapshot.rows[0].refund_status, REFUND_STATUS.PENDING);
    assert.equal(returnSnapshot.rows[0].payment_status, PAYMENT_STATUS.PAID);
    assert.equal(returnSnapshot.rows[0].seller_return_status, 'closed');
    assert.equal(returnSnapshot.rows[0].event_count, 3);
    await assert.rejects(
        admin.query('UPDATE return_events SET payload = payload WHERE return_id = $1', [returnId]),
        /RETURN_EVENT_APPEND_ONLY/
    );

    const customerOrders = await invoke(getUserOrders, { params: { userId: String(customerId) } });
    assert.equal(customerOrders.statusCode, 200);
    const customerOrder = customerOrders.payload.find((entry) => Number(entry.id) === canonicalOrderId);
    assert.equal(customerOrder.return_status, 'APPROVED');
    assert.equal(Number(customerOrder.return_revision), 3);
    const adminReturnSummaries = await invoke(
        createGetAdminReturnSummaries(pool),
        { query: { limit: '20' } }
    );
    assert.equal(adminReturnSummaries.statusCode, 200);
    assert.equal(adminReturnSummaries.payload.items[0].status, 'APPROVED');
    assert.equal(Number(adminReturnSummaries.payload.items[0].revision), 3);
    const legacyAdminReturns = await invoke(getAllReturnRequests, {});
    assert.equal(legacyAdminReturns.statusCode, 200);
    assert.equal(Number(legacyAdminReturns.payload[0].revision), 3);

    await dispatchNotificationOutboxBatch({ database: pool, limit: 100 });
    const notificationSnapshot = await pool.query(
        `SELECT id, type, title, entity_type, entity_id, message
         FROM notifications
         ORDER BY id`
    );
    assert.ok(notificationSnapshot.rows.length >= 5);
    for (const notification of notificationSnapshot.rows) {
        assert.ok(['order', 'return_request'].includes(notification.entity_type));
        assert.ok(Number(notification.entity_id) > 0);
        assert.doesNotMatch(notification.message, /https?:\/\//i);
    }
    assert.equal(
        notificationSnapshot.rows.some((notification) => (
            notification.entity_type === 'order'
            && Number(notification.entity_id) === canonicalOrderId
            && notification.type === 'SHIPMENT_CREATED'
            && /kargoya verildi/i.test(notification.title)
        )),
        true
    );

    const result = Object.freeze({
        migrationFirstApply: firstApply.applied.length,
        migrationSecondApply: secondApply.applied.length,
        idempotentPaymentRows: sameKeySnapshot.rows[0].payments,
        oversaleSuccessfulPaymentRows: lastUnitSnapshot.rows[0].payments,
        sellerOrderRows: paidSnapshot.rows[0].seller_orders,
        returnEventRows: returnSnapshot.rows[0].event_count,
        typedNotificationRows: notificationSnapshot.rows.length,
        refundProviderExecuted: approved.refundProviderExecuted,
        deterministicProviderSessionCalls: providerSessionCalls
    });
    assert(providerSessionCalls >= 6, 'Expected deterministic local provider session stub calls.');
    console.log(`launch-critical commerce PostgreSQL smoke passed: ${JSON.stringify(result)}`);
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    Module._load = originalLoad;
    paymentControllerTestApi?.resetPaytrIframeSessionRequester();
    if (pool) await pool.end().catch(() => {});
    await admin.end().catch(() => {});
});
