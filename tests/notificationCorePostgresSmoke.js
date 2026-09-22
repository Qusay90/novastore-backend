'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const { runApply } = require('../scripts/staging-migrations/runner');

const connectionString = String(process.env.NOTIFICATION_CORE_TEST_DATABASE_URL || '').trim();
assert(connectionString, 'NOTIFICATION_CORE_TEST_DATABASE_URL is required.');
const parsed = new URL(connectionString);
const host = parsed.hostname.replace(/^\[|\]$/gu, '');
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
assert(['127.0.0.1', 'localhost', '::1'].includes(host), 'Notification integration target must be loopback.');
assert.equal(databaseName, 'novastore_notification_core_20260828_test');
assert([55432, 55433].includes(Number(parsed.port)), 'Notification integration target must use a disposable PostgreSQL port.');

Object.assign(process.env, {
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    NOVASTORE_NOTIFICATION_WORKER_ENABLED: 'false',
    DATABASE_URL: connectionString,
    DB_SSL: 'false',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: ''
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

const endpoint = (key) => `https://fcm.googleapis.com/fcm/send/novastore-local-${key}`;
const subscription = (key) => ({
    endpoint: endpoint(key),
    keys: { p256dh: 'A'.repeat(43), auth: 'B'.repeat(22) }
});
const androidToken = (key) => `novastore-fcm-${key}-token-20260828`;
const androidRegistration = (key, installationId, predecessorKey = null) => ({
    token: androidToken(key),
    platform: 'android',
    installationId,
    ...(predecessorKey ? { rotationPredecessor: androidToken(predecessorKey) } : {})
});

const ids = (rows, field = 'id') => rows.map((row) => Number(row[field]));
const expectCode = (promise, code) => assert.rejects(promise, (error) => error?.code === code);
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return Object.freeze({ promise, resolve });
};
const within = (promise, timeoutMs, message) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
        (value) => {
            clearTimeout(timer);
            resolve(value);
        },
        (error) => {
            clearTimeout(timer);
            reject(error);
        }
    );
});
const databasePausedAfterDeliveryClaim = (database, claimed, releaseClaim) => Object.freeze({
    connect: async () => {
        const client = await database.connect();
        let paused = false;
        return Object.freeze({
            query: async (sql, values) => {
                const result = await client.query(sql, values);
                if (
                    !paused
                    && typeof sql === 'string'
                    && sql.includes('FOR UPDATE OF delivery SKIP LOCKED')
                ) {
                    paused = true;
                    claimed.resolve();
                    await releaseClaim.promise;
                }
                return result;
            },
            release: () => client.release()
        });
    }
});

const setupSeller = async ({ pool, suffix, userId, legacyStoreId }) => {
    const organization = await pool.query(
        `INSERT INTO seller_organizations (external_key, display_name)
         VALUES ($1, $2) RETURNING id`,
        [crypto.randomUUID(), `Notification Seller ${suffix}`]
    );
    const organizationId = Number(organization.rows[0].id);
    const role = await pool.query("SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = 'manager'");
    const membership = await pool.query(
        `INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp)
         VALUES ($1, $2, $3, $4) RETURNING id, security_stamp`,
        [organizationId, userId, Number(role.rows[0].id), crypto.randomUUID()]
    );
    const membershipId = Number(membership.rows[0].id);
    const securityStamp = membership.rows[0].security_stamp;
    const store = await pool.query(
        `INSERT INTO seller_stores (organization_id, legacy_store_id, display_name)
         VALUES ($1, $2, $3) RETURNING id`,
        [organizationId, legacyStoreId, `Notification Store ${suffix}`]
    );
    const storeId = Number(store.rows[0].id);
    await pool.query(
        `INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id)
         VALUES ($1, $2, $3)`,
        [membershipId, organizationId, storeId]
    );
    const sessionId = crypto.randomUUID();
    await pool.query(
        `INSERT INTO seller_sessions
            (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at)
         VALUES ($1, $2, $3, $4, 1, $5, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
        [sessionId, userId, organizationId, membershipId, securityStamp]
    );
    return Object.freeze({ organizationId, membershipId, storeId, sessionId });
};

(async () => {
    const admin = new Client({ connectionString, application_name: 'novastore_notification_core_setup' });
    await admin.connect();
    let pool = null;
    try {
        await admin.query('DROP SCHEMA public CASCADE');
        await admin.query('CREATE SCHEMA public');
        const registry = loadRegistry();
    assert.equal(registry.length, 48);
    assert.equal(registry.at(-9).id, '20260915_01_stocky_system_commerce');
    assert.equal(registry.at(-8).id, '20260918_01_theme_platform_foundation');
    assert.equal(registry.at(-7).id, '20260919_01_theme_platform_seller_experience');
    assert.equal(registry.at(-6).id, '20260919_variant_cart_v2');
    assert.deepEqual(registry.slice(-5).map(entry=>entry.id), ['20260919_wave2_theme_delivery', '20260919_wave2_theme_seller_bridge', '20260919_wave2_theme_store_content', '20260919_wave2_zpublication_lifecycle', '20260919_wave2_zzsupport_routing']);
        const firstApply = await runApply({ env: migrationEnv, registry, output: () => {} });
        const secondApply = await runApply({ env: migrationEnv, registry, output: () => {} });
        assert.deepEqual(firstApply.applied, registry.map((entry) => entry.id));
        assert.deepEqual(secondApply.applied, []);

        pool = require('../config/db');
        const {
            NotificationOutboxError,
            dispatchNotificationOutboxBatch,
            enqueueNotificationEvent
        } = require('../services/notificationOutboxService');
        const {
            NotificationReadError,
            getUnreadCount,
            listNotifications,
            markAllNotificationsRead,
            markNotificationRead
        } = require('../services/notificationReadService');
        const {
            WebPushSubscriptionError,
            getWebPushSubscriptionState,
            registerWebPushSubscription,
            revokeWebPushSubscription
        } = require('../services/webPushSubscriptionService');
        const {
            WebPushProviderError,
            buildWebPushPayload
        } = require('../services/webPushProviderService');
        const {
            deliverOneWebPush,
            deliverPendingWebPushBatch
        } = require('../services/notificationDeliveryService');
        const {
            getAndroidPushEndpointState,
            registerAndroidPushEndpoint,
            revokeAndroidPushEndpoint
        } = require('../services/androidPushEndpointService');
        const {
            AndroidPushProviderError,
            buildAndroidPushPayload
        } = require('../services/androidPushProviderService');
        const {
            deliverOneAndroidPush,
            deliverPendingAndroidPushBatch
        } = require('../services/androidPushDeliveryService');
        const {
            SellerNotificationAuthorizationError,
            resolveSellerNotificationTarget
        } = require('../services/sellerNotificationAuthorizationService');
        const { resolveNotificationRecipients } = require('../services/notificationRecipientService');
        const { cleanupExpiredSessions } = require('../services/authSessionService');

        const testPasswordHash = bcrypt.hashSync('local-notification-uat-only', 10);
        const users = await pool.query(
            `INSERT INTO users (full_name, name, email, phone, password, role, auth_enabled)
             VALUES
                ('Notification Customer A', 'Notification Customer A', 'notification-customer-a@example.test', '+905550000001', $1, 'customer', TRUE),
                ('Notification Customer B', 'Notification Customer B', 'notification-customer-b@example.test', '+905550000002', $1, 'customer', TRUE),
                ('Notification Admin A', 'Notification Admin A', 'notification-admin-a@example.test', '+905550000003', $1, 'admin', TRUE),
                ('Notification Admin B', 'Notification Admin B', 'notification-admin-b@example.test', '+905550000004', $1, 'admin', TRUE),
                ('Notification Seller A', 'Notification Seller A', 'notification-seller-a@example.test', '+905550000005', $1, 'customer', TRUE),
                ('Notification Seller B', 'Notification Seller B', 'notification-seller-b@example.test', '+905550000006', $1, 'customer', TRUE),
                ('Notification Seller A Restricted', 'Notification Seller A Restricted', 'notification-seller-a-restricted@example.test', '+905550000007', $1, 'customer', TRUE),
                ('Notification Seller A Case Variant', 'Notification Seller A Case Variant', 'NOTIFICATION-SELLER-A@EXAMPLE.TEST', '+905550000008', $1, 'customer', TRUE)
             RETURNING id, email`,
            [testPasswordHash]
        );
        const userByEmail = new Map(users.rows.map((row) => [row.email, Number(row.id)]));
        const customerA = userByEmail.get('notification-customer-a@example.test');
        const customerB = userByEmail.get('notification-customer-b@example.test');
        const adminA = userByEmail.get('notification-admin-a@example.test');
        const adminB = userByEmail.get('notification-admin-b@example.test');
        const sellerAUser = userByEmail.get('notification-seller-a@example.test');
        const sellerBUser = userByEmail.get('notification-seller-b@example.test');
        const sellerARestrictedUser = userByEmail.get('notification-seller-a-restricted@example.test');
        const sellerACaseVariantUser = userByEmail.get('NOTIFICATION-SELLER-A@EXAMPLE.TEST');

        const sessions = await pool.query(
            `INSERT INTO auth_sessions (jti_hash, user_id, principal_type, issued_at, expires_at)
             VALUES
                ($1, $2, 'customer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
                ($3, $4, 'customer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
                ($5, $6, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'),
                ($7, $8, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day')
             RETURNING id, user_id`,
            ['a'.repeat(64), customerA, 'b'.repeat(64), customerB, 'c'.repeat(64), adminA, 'd'.repeat(64), adminB]
        );
        const authSessionByUser = new Map(sessions.rows.map((row) => [Number(row.user_id), Number(row.id)]));

        const stores = await pool.query(
            `INSERT INTO stores (name, slug, owner_user_id)
             VALUES
                ('Notification Legacy Store A', 'notification-store-a', $1),
                ('Notification Legacy Store B', 'notification-store-b', $2)
             RETURNING id, slug`,
            [sellerAUser, sellerBUser]
        );
        const legacyStoreBySlug = new Map(stores.rows.map((row) => [row.slug, Number(row.id)]));
        const sellerA = await setupSeller({
            pool,
            suffix: 'A',
            userId: sellerAUser,
            legacyStoreId: legacyStoreBySlug.get('notification-store-a')
        });
        const sellerB = await setupSeller({
            pool,
            suffix: 'B',
            userId: sellerBUser,
            legacyStoreId: legacyStoreBySlug.get('notification-store-b')
        });
        const restrictedRole = await pool.query(
            `INSERT INTO seller_roles (organization_id, code, name, role_kind, is_assignable)
             VALUES ($1, 'notification-restricted', 'Notification Restricted', 'organization', TRUE)
             RETURNING id`,
            [sellerA.organizationId]
        );
        const restrictedRoleId = Number(restrictedRole.rows[0].id);
        await pool.query(
            `INSERT INTO seller_role_permissions (role_id, permission_code)
             VALUES ($1, 'organization.read'), ($1, 'store.read')`,
            [restrictedRoleId]
        );
        const restrictedStamp = crypto.randomUUID();
        const restrictedMembership = await pool.query(
            `INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [sellerA.organizationId, sellerARestrictedUser, restrictedRoleId, restrictedStamp]
        );
        const restrictedMembershipId = Number(restrictedMembership.rows[0].id);
        await pool.query(
            `INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id)
             VALUES ($1, $2, $3)`,
            [restrictedMembershipId, sellerA.organizationId, sellerA.storeId]
        );
        const restrictedSessionId = crypto.randomUUID();
        await pool.query(
            `INSERT INTO seller_sessions
                (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at)
             VALUES ($1, $2, $3, $4, 1, $5, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
            [restrictedSessionId, sellerARestrictedUser, sellerA.organizationId, restrictedMembershipId, restrictedStamp]
        );
        const sellerARestricted = Object.freeze({
            userId: sellerARestrictedUser,
            organizationId: sellerA.organizationId,
            membershipId: restrictedMembershipId,
            storeId: sellerA.storeId,
            sessionId: restrictedSessionId
        });
        const managerRole = await pool.query(
            "SELECT id FROM seller_roles WHERE organization_id IS NULL AND code = 'manager'"
        );
        const caseVariantStamp = crypto.randomUUID();
        const caseVariantMembership = await pool.query(
            `INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [sellerA.organizationId, sellerACaseVariantUser, Number(managerRole.rows[0].id), caseVariantStamp]
        );
        const caseVariantMembershipId = Number(caseVariantMembership.rows[0].id);
        const caseVariantSessionId = crypto.randomUUID();
        await pool.query(
            `INSERT INTO seller_sessions
                (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at)
             VALUES ($1, $2, $3, $4, 1, $5, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
            [caseVariantSessionId, sellerACaseVariantUser, sellerA.organizationId, caseVariantMembershipId, caseVariantStamp]
        );
        const caseVariantContext = Object.freeze({
            sessionId: caseVariantSessionId,
            userId: sellerACaseVariantUser,
            organizationId: sellerA.organizationId,
            membershipId: caseVariantMembershipId
        });

        const products = await pool.query(
            `INSERT INTO products
                (name, price, stock, publication_status, is_customer_visible, store_id, sku, normalized_sku)
             VALUES
                ('Notification Product A', 100, 10, 'active', TRUE, $1, 'NFY-A', 'NFY-A'),
                ('Notification Product B', 200, 10, 'active', TRUE, $2, 'NFY-B', 'NFY-B')
             RETURNING id, sku`,
            [legacyStoreBySlug.get('notification-store-a'), legacyStoreBySlug.get('notification-store-b')]
        );
        const productBySku = new Map(products.rows.map((row) => [row.sku, Number(row.id)]));
        const productA = productBySku.get('NFY-A');

        const orders = await pool.query(
            `INSERT INTO orders
                (user_id, total_amount, status, customer_name, email, address, items, payment_status)
             VALUES
                ($1, 100, 'confirmed', 'Notification Customer A', 'notification-customer-a@example.test', 'İzole test adresi', '[]'::JSONB, 'PAID'),
                ($2, 200, 'confirmed', 'Notification Customer B', 'notification-customer-b@example.test', 'İzole test adresi', '[]'::JSONB, 'PAID')
             RETURNING id, user_id`,
            [customerA, customerB]
        );
        const orderByUser = new Map(orders.rows.map((row) => [Number(row.user_id), Number(row.id)]));
        const orderA = orderByUser.get(customerA);
        const orderB = orderByUser.get(customerB);
        const sellerOrders = await pool.query(
            `INSERT INTO seller_orders (organization_id, store_id, canonical_order_id, currency, gross_minor)
             VALUES ($1, $2, $3, 'TRY', 10000), ($4, $5, $6, 'TRY', 20000)
             RETURNING id, canonical_order_id`,
            [sellerA.organizationId, sellerA.storeId, orderA, sellerB.organizationId, sellerB.storeId, orderB]
        );
        const sellerOrderByCanonicalId = new Map(sellerOrders.rows.map((row) => [
            Number(row.canonical_order_id),
            Number(row.id)
        ]));
        const sellerOrderA = sellerOrderByCanonicalId.get(orderA);
        const returnRow = await pool.query(
            `INSERT INTO returns (order_id, user_id, reason_code, note)
             VALUES ($1, $2, 'CHANGED_MIND', 'İzole test iade talebi') RETURNING id`,
            [orderA, customerA]
        );
        const returnA = Number(returnRow.rows[0].id);
        const sellerReturn = await pool.query(
            `INSERT INTO seller_returns
                (organization_id, store_id, seller_order_id, canonical_return_id)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [sellerA.organizationId, sellerA.storeId, sellerOrderA, returnA]
        );
        const sellerReturnA = Number(sellerReturn.rows[0].id);
        const supportRow = await pool.query(
            `INSERT INTO support_threads (customer_id, source)
             VALUES ($1, 'DIRECT') RETURNING id`,
            [customerA]
        );
        const supportA = Number(supportRow.rows[0].id);
        const questionRow = await pool.query(
            `INSERT INTO product_questions (product_id, user_id, question, answer, answered_at)
             VALUES ($1, $2, 'Bildirim testi sorusu?', 'Bildirim testi yanıtı.', CURRENT_TIMESTAMP)
             RETURNING id`,
            [productA, customerA]
        );
        const questionA = Number(questionRow.rows[0].id);
        const reviewRow = await pool.query(
            `INSERT INTO reviews (product_id, user_id, rating, comment, status)
             VALUES ($1, $2, 5, 'Bildirim yetki testi değerlendirmesi', 'PENDING')
             RETURNING id`,
            [productA, customerA]
        );
        const reviewA = Number(reviewRow.rows[0].id);
        const applicationId = crypto.randomUUID();
        await pool.query(
            `INSERT INTO seller_applications
                (id, applicant_authority_hash, applicant_identity_hash, applicant_user_id, applicant_email,
                 applicant_display_name, status, submitted_at, creation_idempotency_key_hash,
                 creation_request_fingerprint)
             VALUES ($1, $2, $3, $4, $5, 'Notification Seller A', 'APPROVED', CURRENT_TIMESTAMP, $6, $7)`,
            [
                applicationId,
                crypto.createHash('sha256').update('notification-authority-a').digest('hex'),
                crypto.createHash('sha256').update('notification-identity-a').digest('hex'),
                sellerAUser,
                'notification-seller-a@example.test',
                crypto.createHash('sha256').update('notification-creation-a').digest('hex'),
                crypto.createHash('sha256').update('notification-request-a').digest('hex')
            ]
        );
        const caseVariantApplicationId = crypto.randomUUID();
        await pool.query(
            `INSERT INTO seller_applications
                (id, applicant_authority_hash, applicant_identity_hash, applicant_user_id, applicant_email,
                 applicant_display_name, status, submitted_at, creation_idempotency_key_hash,
                 creation_request_fingerprint)
             VALUES ($1, $2, $3, $4, $5, 'Notification Seller A Case Variant', 'APPROVED', CURRENT_TIMESTAMP, $6, $7)`,
            [
                caseVariantApplicationId,
                crypto.createHash('sha256').update('notification-authority-case-variant').digest('hex'),
                crypto.createHash('sha256').update('notification-identity-case-variant').digest('hex'),
                sellerACaseVariantUser,
                'NOTIFICATION-SELLER-A@EXAMPLE.TEST',
                crypto.createHash('sha256').update('notification-creation-case-variant').digest('hex'),
                crypto.createHash('sha256').update('notification-request-case-variant').digest('hex')
            ]
        );
        const applicationRecipients = await resolveNotificationRecipients(pool, {
            eventType: 'SELLER_APPLICATION_STATUS_CHANGED',
            aggregateType: 'seller_application',
            aggregateId: applicationId
        });
        assert.deepEqual(applicationRecipients, [{
            userId: sellerAUser,
            role: 'seller',
            organizationId: sellerA.organizationId,
            storeId: null
        }], 'case-folded email collision must not override the stable applicant user binding');
        const applicationIdentityMismatch = await pool.query(
            `INSERT INTO notifications
                (user_id, recipient_role, recipient_organization_id, recipient_store_id,
                 type, category, priority, title, message, entity_type, entity_id, entity_key)
             VALUES ($1, 'seller', $2, NULL, 'SELLER_APPLICATION_STATUS_CHANGED', 'ACCOUNT', 'NORMAL',
                     'Başvuru durumu güncellendi', 'Başvuru durumu güncellendi.',
                     'seller_application', NULL, $3)
             RETURNING id`,
            [sellerACaseVariantUser, sellerA.organizationId, applicationId]
        );
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: Number(applicationIdentityMismatch.rows[0].id),
                context: caseVariantContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
                && error.code === 'SELLER_NOTIFICATION_TARGET_NOT_FOUND'
                && error.statusCode === 404
        );
        const caseVariantScope = {
            ...caseVariantContext,
            role: 'seller',
            storeIds: [sellerA.storeId],
            permissions: ['organization.read', 'order.read']
        };
        assert.equal((await listNotifications(pool, caseVariantScope, { limit: 20 })).items.length, 0,
        'historical application rows addressed through an email collision must be hidden at consumption');
        const caseVariantBinding = Object.freeze({
            userId: sellerACaseVariantUser,
            role: 'seller',
            organizationId: sellerA.organizationId,
            authSessionId: null,
            sellerSessionId: caseVariantSessionId
        });
        const caseVariantAndroidEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: Object.freeze({ ...caseVariantBinding, application: 'SELLER_ANDROID' }),
            registration: androidRegistration('seller-case-variant', crypto.randomUUID())
        });
        await registerWebPushSubscription({
            database: pool,
            binding: caseVariantBinding,
            subscription: subscription('seller-case-variant')
        });
        const caseVariantWebSubscription = await pool.query(
            `SELECT id FROM web_push_subscriptions
              WHERE seller_session_id = $1 AND status = 'ACTIVE'`,
            [caseVariantSessionId]
        );
        const caseVariantLegitimateNotification = await pool.query(
            `INSERT INTO notifications
                (user_id, recipient_role, recipient_organization_id, recipient_store_id,
                 type, category, priority, title, message, entity_type, entity_id, entity_key)
             VALUES ($1, 'seller', $2, NULL, 'SELLER_APPLICATION_STATUS_CHANGED', 'ACCOUNT', 'NORMAL',
                     'Başvuru durumu güncellendi', 'Başvuru durumu güncellendi.',
                     'seller_application', NULL, $3)
             RETURNING id`,
            [sellerACaseVariantUser, sellerA.organizationId, caseVariantApplicationId]
        );
        const caseVariantLegitimateNotificationId = Number(caseVariantLegitimateNotification.rows[0].id);
        assert.equal((await resolveSellerNotificationTarget(pool, {
            notificationId: caseVariantLegitimateNotificationId,
            context: caseVariantContext
        })).target.applicationId, caseVariantApplicationId);
        assert.equal((await listNotifications(pool, caseVariantScope, { limit: 20 })).items.length, 1);
        await pool.query(
            `INSERT INTO notification_deliveries
                (notification_id, channel, endpoint_key, web_push_subscription_id, android_push_endpoint_id, status)
             VALUES
                ($1, 'ANDROID_PUSH', $2, NULL, $3, 'PENDING'),
                ($1, 'WEB_PUSH', $4, $5, NULL, 'PENDING')`,
            [
                caseVariantLegitimateNotificationId,
                `disabled-account-android-${crypto.randomUUID()}`,
                caseVariantAndroidEndpoint.id,
                `disabled-account-web-${crypto.randomUUID()}`,
                caseVariantWebSubscription.rows[0].id
            ]
        );
        await pool.query('UPDATE users SET auth_enabled = FALSE WHERE id = $1', [sellerACaseVariantUser]);
        assert.deepEqual(await resolveNotificationRecipients(pool, {
            eventType: 'SELLER_APPLICATION_STATUS_CHANGED',
            aggregateType: 'seller_application',
            aggregateId: caseVariantApplicationId
        }), [], 'disabled applicant account must not receive Seller application notifications');
        await assert.rejects(
            listNotifications(pool, caseVariantScope, { limit: 20 }),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            getUnreadCount(pool, caseVariantScope),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            markNotificationRead(pool, caseVariantScope, caseVariantLegitimateNotificationId),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: caseVariantLegitimateNotificationId,
                context: caseVariantContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        let disabledAccountAndroidProviderCalls = 0;
        const disabledAccountAndroid = await deliverOneAndroidPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    disabledAccountAndroidProviderCalls += 1;
                    return { accepted: true, statusCode: 200, providerMessageId: 'must-not-send-disabled-account' };
                }
            }
        });
        assert.equal(disabledAccountAndroid.status, 'FAILED');
        assert.equal(disabledAccountAndroidProviderCalls, 0);
        let disabledAccountWebProviderCalls = 0;
        const disabledAccountWeb = await deliverOneWebPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    disabledAccountWebProviderCalls += 1;
                    return { accepted: true, statusCode: 201, providerMessageId: 'must-not-send-disabled-account' };
                }
            }
        });
        assert.equal(disabledAccountWeb.status, 'FAILED');
        assert.equal(disabledAccountWebProviderCalls, 0);

        const customerABinding = Object.freeze({
            userId: customerA,
            role: 'customer',
            organizationId: null,
            authSessionId: authSessionByUser.get(customerA),
            sellerSessionId: null
        });
        const customerBBinding = Object.freeze({
            userId: customerB,
            role: 'customer',
            organizationId: null,
            authSessionId: authSessionByUser.get(customerB),
            sellerSessionId: null
        });
        const adminABinding = Object.freeze({
            userId: adminA,
            role: 'admin',
            organizationId: null,
            authSessionId: authSessionByUser.get(adminA),
            sellerSessionId: null
        });
        const adminBBinding = Object.freeze({
            userId: adminB,
            role: 'admin',
            organizationId: null,
            authSessionId: authSessionByUser.get(adminB),
            sellerSessionId: null
        });
        const sellerABinding = Object.freeze({
            userId: sellerAUser,
            role: 'seller',
            organizationId: sellerA.organizationId,
            authSessionId: null,
            sellerSessionId: sellerA.sessionId
        });
        const sellerBBinding = Object.freeze({
            userId: sellerBUser,
            role: 'seller',
            organizationId: sellerB.organizationId,
            authSessionId: null,
            sellerSessionId: sellerB.sessionId
        });
        const customerAAndroidBinding = Object.freeze({ ...customerABinding, application: 'CUSTOMER_ANDROID' });
        const customerBAndroidBinding = Object.freeze({ ...customerBBinding, application: 'CUSTOMER_ANDROID' });
        const sellerAAndroidBinding = Object.freeze({ ...sellerABinding, application: 'SELLER_ANDROID' });
        const sellerBAndroidBinding = Object.freeze({ ...sellerBBinding, application: 'SELLER_ANDROID' });
        const sellerARestrictedBinding = Object.freeze({
            userId: sellerARestricted.userId,
            role: 'seller',
            organizationId: sellerARestricted.organizationId,
            authSessionId: null,
            sellerSessionId: sellerARestricted.sessionId
        });
        const sellerARestrictedAndroidBinding = Object.freeze({ ...sellerARestrictedBinding, application: 'SELLER_ANDROID' });

        const customerInstallationA = crypto.randomUUID();
        const customerInstallationB = crypto.randomUUID();
        const customerInstallationTemporary = crypto.randomUUID();
        const sellerInstallationA = crypto.randomUUID();
        const customerInitialEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            registration: androidRegistration('customer-a-old', customerInstallationA)
        });
        assert.equal(Object.hasOwn(customerInitialEndpoint, 'token'), false);
        const customerIdempotentEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            registration: androidRegistration('customer-a-old', customerInstallationA)
        });
        assert.equal(customerIdempotentEndpoint.idempotent, true);
        assert.equal(customerIdempotentEndpoint.id, customerInitialEndpoint.id);
        await expectCode(
            registerAndroidPushEndpoint({
                database: pool,
                binding: customerBAndroidBinding,
                registration: androidRegistration('customer-a-old', customerInstallationA)
            }),
            'ANDROID_ENDPOINT_OWNERSHIP_CONFLICT'
        );
        const customerRotatedEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            registration: androidRegistration('customer-a-current', customerInstallationA, 'customer-a-old')
        });
        assert.equal(customerRotatedEndpoint.rotated, true);
        await expectCode(
            registerAndroidPushEndpoint({
                database: pool,
                binding: customerBAndroidBinding,
                registration: androidRegistration('customer-a-old', crypto.randomUUID())
            }),
            'ANDROID_FCM_TOKEN_STALE'
        );
        const customerSecondEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            registration: androidRegistration('customer-a-second', customerInstallationB)
        });
        assert.notEqual(customerSecondEndpoint.id, customerRotatedEndpoint.id);
        const customerTemporaryEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            registration: androidRegistration('customer-a-temporary', customerInstallationTemporary)
        });
        assert.equal((await revokeAndroidPushEndpoint({
            database: pool,
            binding: customerBAndroidBinding,
            revocation: {
                token: androidToken('customer-a-temporary'),
                installationId: customerInstallationTemporary
            }
        })).revoked, false, 'Customer B must not revoke Customer A endpoint');
        assert.equal((await revokeAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            revocation: {
                token: androidToken('customer-a-temporary'),
                installationId: customerInstallationTemporary
            }
        })).revoked, true);
        assert.ok(customerTemporaryEndpoint.id);
        const sellerEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: sellerAAndroidBinding,
            registration: androidRegistration('seller-a-current', sellerInstallationA)
        });
        assert.equal((await revokeAndroidPushEndpoint({
            database: pool,
            binding: sellerBAndroidBinding,
            revocation: { token: androidToken('seller-a-current'), installationId: sellerInstallationA }
        })).revoked, false, 'Seller B must not revoke Seller A endpoint');
        assert.equal((await getAndroidPushEndpointState({ database: pool, binding: customerAAndroidBinding })).activeDeviceCount, 2);
        assert.equal((await getAndroidPushEndpointState({ database: pool, binding: sellerAAndroidBinding })).activeDeviceCount, 1);
        assert.ok(sellerEndpoint.id);

        await registerWebPushSubscription({ database: pool, binding: customerABinding, subscription: subscription('customer-a') });
        await registerWebPushSubscription({ database: pool, binding: customerBBinding, subscription: subscription('customer-b') });
        await registerWebPushSubscription({ database: pool, binding: adminABinding, subscription: subscription('admin-a') });
        await registerWebPushSubscription({ database: pool, binding: sellerABinding, subscription: subscription('seller-a') });
        await expectCode(
            registerWebPushSubscription({ database: pool, binding: customerBBinding, subscription: subscription('customer-a') }),
            'WEB_PUSH_SUBSCRIPTION_OWNERSHIP_CONFLICT'
        );
        await expectCode(
            registerWebPushSubscription({
                database: pool,
                binding: customerABinding,
                subscription: { ...subscription('bad-host'), endpoint: 'https://attacker.invalid/push' }
            }),
            'WEB_PUSH_PROVIDER_HOST_REJECTED'
        );

        const events = [
            ['ORDER_CREATED', 'order', orderA, 1],
            ['ORDER_CONFIRMED', 'order', orderA, 1],
            ['SUPPORT_CREATED', 'support_thread', supportA, 1],
            ['SUPPORT_REPLY', 'support_thread', supportA, 1],
            ['QUESTION_CREATED', 'product_question', questionA, 1],
            ['QUESTION_ANSWERED', 'product_question', questionA, 1],
            ['RETURN_REQUESTED', 'return_request', returnA, 1],
            ['RETURN_STATUS_CHANGED', 'return_request', returnA, 2]
        ];
        const insertedEvents = [];
        for (const [eventType, aggregateType, aggregateId, aggregateRevision] of events) {
            insertedEvents.push(await enqueueNotificationEvent(pool, {
                eventType,
                aggregateType,
                aggregateId,
                aggregateRevision,
                payload: { reasonCode: 'NOTIFICATION_CORE_E2E' }
            }));
        }
        assert.equal(insertedEvents.every((entry) => entry.inserted), true);
        const replay = await enqueueNotificationEvent(pool, {
            eventType: 'ORDER_CREATED', aggregateType: 'order', aggregateId: orderA, aggregateRevision: 1,
            payload: { reasonCode: 'REPLAY_MUST_NOT_DUPLICATE' }
        });
        assert.equal(replay.inserted, false);
        assert.equal(replay.id, insertedEvents[0].id, 'replay must resolve the authoritative existing outbox id');
        await expectCode(
            enqueueNotificationEvent(pool, {
                eventType: 'ORDER_CREATED', aggregateType: 'order', aggregateId: orderA,
                payload: { recipientIds: [customerB] }
            }),
            'NOTIFICATION_OUTBOX_AUTHORITY_FIELD_REJECTED'
        );

        const rollbackClient = await pool.connect();
        try {
            await rollbackClient.query('BEGIN');
            await enqueueNotificationEvent(rollbackClient, {
                eventType: 'SUPPORT_MESSAGE', aggregateType: 'support_thread', aggregateId: supportA,
                aggregateRevision: 2, payload: { reasonCode: 'ROLLBACK_PROBE' }
            });
            await rollbackClient.query('ROLLBACK');
            const rolledBack = await pool.query(
                "SELECT COUNT(*)::INT count FROM notification_outbox_events WHERE source_event_key = $1",
                [`SUPPORT_MESSAGE:support_thread:${supportA}:r2`]
            );
            assert.equal(Number(rolledBack.rows[0].count), 0);
        } finally {
            rollbackClient.release();
        }
        const committedClient = await pool.connect();
        try {
            await committedClient.query('BEGIN');
            await enqueueNotificationEvent(committedClient, {
                eventType: 'SUPPORT_MESSAGE', aggregateType: 'support_thread', aggregateId: supportA,
                aggregateRevision: 3, payload: { reasonCode: 'COMMIT_PROBE' }
            });
            await committedClient.query('COMMIT');
        } finally {
            committedClient.release();
        }
        const pendingAfterCommit = await pool.query(
            "SELECT status FROM notification_outbox_events WHERE source_event_key = $1",
            [`SUPPORT_MESSAGE:support_thread:${supportA}:r3`]
        );
        assert.equal(pendingAfterCommit.rows[0].status, 'PENDING');

        const dispatches = await dispatchNotificationOutboxBatch({ database: pool, limit: 50 });
        assert.equal(dispatches.length, 9);
        const outboxState = await pool.query(
            `SELECT status, COUNT(*)::INT count FROM notification_outbox_events GROUP BY status ORDER BY status`
        );
        assert.deepEqual(outboxState.rows, [{ status: 'PROCESSED', count: 9 }]);
        const processingCount = await pool.query("SELECT COUNT(*)::INT count FROM notification_outbox_events WHERE status = 'PROCESSING'");
        assert.equal(Number(processingCount.rows[0].count), 0);
        const duplicates = await pool.query(
            `SELECT COUNT(*)::INT count FROM (
                SELECT dedupe_key FROM notifications WHERE dedupe_key IS NOT NULL GROUP BY dedupe_key HAVING COUNT(*) > 1
             ) duplicate`
        );
        assert.equal(Number(duplicates.rows[0].count), 0);
        const replayAfterDispatch = await enqueueNotificationEvent(pool, {
            eventType: 'ORDER_CREATED', aggregateType: 'order', aggregateId: orderA, aggregateRevision: 1,
            payload: { reasonCode: 'POST_DISPATCH_REPLAY_MUST_NOT_DUPLICATE' }
        });
        assert.equal(replayAfterDispatch.inserted, false);
        assert.equal((await dispatchNotificationOutboxBatch({ database: pool, limit: 5 })).length, 0);

        const androidDeliveryMatrix = await pool.query(
            `SELECT notification.recipient_role, notification.type, COUNT(*)::INT count
               FROM notification_deliveries delivery
               JOIN notifications notification ON notification.id = delivery.notification_id
              WHERE delivery.channel = 'ANDROID_PUSH'
                AND notification.source_event_key IS NOT NULL
              GROUP BY notification.recipient_role, notification.type
              ORDER BY notification.recipient_role, notification.type`
        );
        const androidMatrix = new Map(androidDeliveryMatrix.rows.map((row) => [
            `${row.recipient_role}:${row.type}`,
            Number(row.count)
        ]));
        assert.equal(androidMatrix.get('customer:ORDER_CREATED'), 2);
        assert.equal(androidMatrix.get('customer:SUPPORT_REPLY'), 2);
        assert.equal(androidMatrix.get('customer:QUESTION_ANSWERED'), 2);
        assert.equal(androidMatrix.get('customer:RETURN_STATUS_CHANGED'), 2);
        assert.equal(androidMatrix.get('seller:ORDER_CONFIRMED'), 1);
        assert.equal(androidMatrix.get('seller:RETURN_REQUESTED'), 1);
        assert.equal(androidMatrix.get('seller:QUESTION_CREATED'), 1);
        assert.equal(androidMatrix.has('seller:ORDER_CREATED'), false, 'accepted catalog does not route ORDER_CREATED to Seller');
        assert.equal(androidMatrix.has('seller:SUPPORT_MESSAGE'), false, 'accepted catalog routes SUPPORT_MESSAGE to Admin');
        const initialAndroidDeliveryCount = [...androidMatrix.values()].reduce((sum, count) => sum + count, 0);
        assert.equal(initialAndroidDeliveryCount, 14);
        const duplicateAndroidDeliveries = await pool.query(
            `SELECT COUNT(*)::INT count FROM (
                SELECT notification_id, endpoint_key
                  FROM notification_deliveries
                 WHERE channel = 'ANDROID_PUSH'
                 GROUP BY notification_id, endpoint_key
                HAVING COUNT(*) > 1
             ) duplicate`
        );
        assert.equal(Number(duplicateAndroidDeliveries.rows[0].count), 0);

        const missingConfigAndroidBatch = await deliverPendingAndroidPushBatch({
            database: pool,
            provider: { configured: false },
            limit: 100
        });
        assert.equal(missingConfigAndroidBatch.processed, 0);
        assert.equal(missingConfigAndroidBatch.skipped, 'CONFIGURATION_REQUIRED');
        const pendingAfterMissingConfig = await pool.query(
            "SELECT COUNT(*)::INT count FROM notification_deliveries WHERE channel = 'ANDROID_PUSH' AND status = 'PENDING'"
        );
        assert.equal(Number(pendingAfterMissingConfig.rows[0].count), initialAndroidDeliveryCount);

        const deliveredAndroidPayloads = [];
        const acceptingAndroidProvider = {
            configured: true,
            send: async ({ endpoint: row, notification }) => {
                assert.equal(String(row.token).startsWith('novastore-fcm-'), true);
                const payload = buildAndroidPushPayload(notification);
                assert.equal(Object.hasOwn(payload, 'url'), false);
                assert.equal(Object.hasOwn(payload, 'recipientId'), false);
                deliveredAndroidPayloads.push(payload);
                return {
                    accepted: true,
                    statusCode: 200,
                    providerMessageId: `projects/local/messages/${row.delivery_id}`
                };
            }
        };
        const acceptedAndroidBatch = await deliverPendingAndroidPushBatch({
            database: pool,
            provider: acceptingAndroidProvider,
            limit: 100
        });
        assert.equal(acceptedAndroidBatch.processed, initialAndroidDeliveryCount);
        assert.equal(deliveredAndroidPayloads.length, initialAndroidDeliveryCount);
        assert.equal(deliveredAndroidPayloads.every((payload) => payload.target?.entityType), true);
        const remainingAndroid = await pool.query(
            "SELECT COUNT(*)::INT count FROM notification_deliveries WHERE channel = 'ANDROID_PUSH' AND status IN ('PENDING', 'RETRYABLE')"
        );
        assert.equal(Number(remainingAndroid.rows[0].count), 0);
        assert.equal((await revokeAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            revocation: { token: androidToken('customer-a-second'), installationId: customerInstallationB }
        })).revoked, true);
        assert.equal((await getAndroidPushEndpointState({ database: pool, binding: customerAAndroidBinding })).activeDeviceCount, 1);

        const customerAScope = { userId: customerA, role: 'customer', organizationId: null, storeIds: [] };
        const customerBScope = { userId: customerB, role: 'customer', organizationId: null, storeIds: [] };
        const adminAScope = { userId: adminA, role: 'admin', organizationId: null, storeIds: [] };
        const sellerAScope = {
            sessionId: sellerA.sessionId,
            userId: sellerAUser,
            role: 'seller',
            organizationId: sellerA.organizationId,
            membershipId: sellerA.membershipId,
            storeIds: [sellerA.storeId],
            permissions: ['organization.read', 'order.read', 'return.read', 'offer.read']
        };
        const sellerBScope = {
            sessionId: sellerB.sessionId,
            userId: sellerBUser,
            role: 'seller',
            organizationId: sellerB.organizationId,
            membershipId: sellerB.membershipId,
            storeIds: [sellerB.storeId],
            permissions: ['organization.read', 'order.read', 'return.read', 'offer.read']
        };
        const customerAFeed = await listNotifications(pool, customerAScope, { limit: 100 });
        const customerBFeed = await listNotifications(pool, customerBScope, { limit: 100 });
        const adminAFeed = await listNotifications(pool, adminAScope, { limit: 100 });
        const sellerAFeed = await listNotifications(pool, sellerAScope, { limit: 100 });
        const sellerBFeed = await listNotifications(pool, sellerBScope, { limit: 100 });
        assert.deepEqual([...new Set(customerAFeed.items.map((row) => row.type))].sort(), [
            'ORDER_CREATED', 'QUESTION_ANSWERED', 'RETURN_REQUESTED', 'RETURN_STATUS_CHANGED', 'SUPPORT_REPLY'
        ]);
        assert.equal(customerBFeed.items.length, 0);
        assert.deepEqual([...new Set(adminAFeed.items.map((row) => row.type))].sort(), [
            'ORDER_CONFIRMED', 'ORDER_CREATED', 'QUESTION_CREATED', 'RETURN_REQUESTED', 'SUPPORT_CREATED', 'SUPPORT_MESSAGE'
        ]);
        assert.deepEqual([...new Set(sellerAFeed.items.map((row) => row.type))].sort(), [
            'ORDER_CONFIRMED', 'QUESTION_CREATED', 'RETURN_REQUESTED', 'RETURN_STATUS_CHANGED'
        ]);
        assert.equal(sellerBFeed.items.length, 0);
        const restrictedRecipientCount = await pool.query(
            `SELECT COUNT(*)::INT count
               FROM notifications
              WHERE user_id = $1
                AND recipient_role = 'seller'`,
            [sellerARestrictedUser]
        );
        assert.equal(Number(restrictedRecipientCount.rows[0].count), 0, 'queue-time permission filter must exclude restricted Seller');
        assert.equal(customerAFeed.items.every((row) => row.entity_type && !Object.hasOwn(row, 'url')), true);

        const insertedTargetRows = await pool.query(
            `INSERT INTO notifications
                (user_id, recipient_role, recipient_organization_id, recipient_store_id,
                 type, category, priority, title, message, entity_type, entity_id, entity_key)
             VALUES
                ($1, 'seller', $2, $3, 'REVIEW_CREATED', 'QUESTION_REVIEW', 'NORMAL',
                 'Yeni değerlendirme', 'Mağazanızdaki bir ürün için yeni değerlendirme var.',
                 'review', $4, NULL),
                ($1, 'seller', $2, NULL, 'SELLER_APPLICATION_STATUS_CHANGED', 'ACCOUNT', 'NORMAL',
                 'Başvuru durumu güncellendi', 'Satıcı başvurunuzun durumu güncellendi.',
                 'seller_application', NULL, $5),
                ($6, 'seller', $2, $3, 'ORDER_CONFIRMED', 'ORDER', 'HIGH',
                 'Yeni sipariş', 'Mağazanız için yeni bir sipariş var.',
                 'order', $7, NULL)
             RETURNING id, type, user_id`,
            [
                sellerAUser,
                sellerA.organizationId,
                sellerA.storeId,
                reviewA,
                applicationId,
                sellerARestrictedUser,
                orderA
            ]
        );
        const directTargetId = new Map(insertedTargetRows.rows
            .filter((row) => Number(row.user_id) === sellerAUser)
            .map((row) => [row.type, Number(row.id)]));
        const restrictedHistoricalNotificationId = Number(insertedTargetRows.rows
            .find((row) => Number(row.user_id) === sellerARestrictedUser).id);
        const sellerAContext = Object.freeze({
            sessionId: sellerA.sessionId,
            userId: sellerAUser,
            organizationId: sellerA.organizationId,
            membershipId: sellerA.membershipId
        });
        const sellerBContext = Object.freeze({
            sessionId: sellerB.sessionId,
            userId: sellerBUser,
            organizationId: sellerB.organizationId,
            membershipId: sellerB.membershipId
        });
        const restrictedContext = Object.freeze({
            sessionId: sellerARestricted.sessionId,
            userId: sellerARestricted.userId,
            organizationId: sellerARestricted.organizationId,
            membershipId: sellerARestricted.membershipId
        });
        const notificationIdFor = (type) => Number(sellerAFeed.items.find((row) => row.type === type).id);
        assert.deepEqual(await resolveSellerNotificationTarget(pool, {
            notificationId: notificationIdFor('ORDER_CONFIRMED'),
            context: sellerAContext
        }), {
            notificationId: notificationIdFor('ORDER_CONFIRMED'),
            target: { type: 'order', destination: 'SELLER_ORDER_DETAIL', sellerOrderId: sellerOrderA }
        });
        assert.deepEqual(await resolveSellerNotificationTarget(pool, {
            notificationId: notificationIdFor('RETURN_REQUESTED'),
            context: sellerAContext
        }), {
            notificationId: notificationIdFor('RETURN_REQUESTED'),
            target: {
                type: 'return_request',
                destination: 'SELLER_RETURNS',
                sellerReturnId: sellerReturnA,
                sellerOrderId: sellerOrderA
            }
        });
        assert.deepEqual(await resolveSellerNotificationTarget(pool, {
            notificationId: notificationIdFor('QUESTION_CREATED'),
            context: sellerAContext
        }), {
            notificationId: notificationIdFor('QUESTION_CREATED'),
            target: {
                type: 'product_question',
                destination: 'NOTIFICATION_CENTER',
                questionId: questionA,
                productId: productA,
                sellerStoreId: sellerA.storeId
            }
        });
        assert.deepEqual(await resolveSellerNotificationTarget(pool, {
            notificationId: directTargetId.get('REVIEW_CREATED'),
            context: sellerAContext
        }), {
            notificationId: directTargetId.get('REVIEW_CREATED'),
            target: {
                type: 'review',
                destination: 'NOTIFICATION_CENTER',
                reviewId: reviewA,
                productId: productA,
                sellerStoreId: sellerA.storeId
            }
        });
        assert.deepEqual(await resolveSellerNotificationTarget(pool, {
            notificationId: directTargetId.get('SELLER_APPLICATION_STATUS_CHANGED'),
            context: sellerAContext
        }), {
            notificationId: directTargetId.get('SELLER_APPLICATION_STATUS_CHANGED'),
            target: {
                type: 'seller_application',
                destination: 'NOTIFICATION_CENTER',
                applicationId
            }
        });
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: notificationIdFor('ORDER_CONFIRMED'),
                context: sellerBContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
                && error.code === 'SELLER_NOTIFICATION_TARGET_NOT_FOUND'
                && error.statusCode === 404
        );
        const restrictedScope = {
            sessionId: sellerARestricted.sessionId,
            userId: sellerARestricted.userId,
            role: 'seller',
            organizationId: sellerARestricted.organizationId,
            membershipId: sellerARestricted.membershipId,
            storeIds: [sellerARestricted.storeId],
            permissions: ['organization.read', 'store.read']
        };
        assert.equal((await listNotifications(pool, restrictedScope, { limit: 100 })).items.length, 0);
        assert.equal(await getUnreadCount(pool, restrictedScope), 0);
        await assert.rejects(
            markNotificationRead(pool, restrictedScope, restrictedHistoricalNotificationId),
            (error) => error instanceof NotificationReadError && error.code === 'NOTIFICATION_NOT_FOUND'
        );
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: restrictedHistoricalNotificationId,
                context: restrictedContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
                && error.code === 'SELLER_NOTIFICATION_TARGET_NOT_FOUND'
        );
        const restrictedInstallation = crypto.randomUUID();
        const restrictedEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: sellerARestrictedAndroidBinding,
            registration: androidRegistration('seller-a-restricted', restrictedInstallation)
        });
        const restrictedDelivery = await pool.query(
            `INSERT INTO notification_deliveries
                (notification_id, channel, endpoint_key, android_push_endpoint_id, status)
             VALUES ($1, 'ANDROID_PUSH', $2, $3, 'PENDING')
             RETURNING id`,
            [restrictedHistoricalNotificationId, `restricted-${crypto.randomUUID()}`, restrictedEndpoint.id]
        );
        let restrictedProviderCalls = 0;
        const restrictedDeliveryOutcome = await deliverOneAndroidPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    restrictedProviderCalls += 1;
                    return { accepted: true, statusCode: 200, providerMessageId: 'must-not-send-without-event-permission' };
                }
            }
        });
        assert.equal(restrictedDeliveryOutcome.deliveryId, Number(restrictedDelivery.rows[0].id));
        assert.equal(restrictedDeliveryOutcome.status, 'FAILED');
        assert.equal(restrictedProviderCalls, 0);
        const restrictedEndpointAfterDenial = await pool.query(
            'SELECT status FROM android_push_endpoints WHERE id = $1',
            [restrictedEndpoint.id]
        );
        assert.equal(restrictedEndpointAfterDenial.rows[0].status, 'ACTIVE', 'permission-only denial must not revoke a valid endpoint');

        await pool.query(
            `INSERT INTO seller_role_permissions (role_id, permission_code)
             VALUES ($1, 'order.read')`,
            [restrictedRoleId]
        );
        await registerWebPushSubscription({
            database: pool,
            binding: sellerARestrictedBinding,
            subscription: subscription('seller-a-restricted-role-probe')
        });
        const restrictedWebSubscription = await pool.query(
            `SELECT id
               FROM web_push_subscriptions
              WHERE seller_session_id = $1
                AND status = 'ACTIVE'`,
            [sellerARestricted.sessionId]
        );
        const createRestrictedOrderDeliveryProbe = async (label) => {
            const notification = await pool.query(
                `INSERT INTO notifications
                    (user_id, recipient_role, recipient_organization_id, recipient_store_id,
                     type, category, priority, title, message, entity_type, entity_id, entity_key)
                 VALUES ($1, 'seller', $2, $3, 'ORDER_CONFIRMED', 'ORDER', 'HIGH',
                         'Yeni sipariş', $4, 'order', $5, NULL)
                 RETURNING id`,
                [
                    sellerARestricted.userId,
                    sellerARestricted.organizationId,
                    sellerARestricted.storeId,
                    `Seller rol yetkisi testi: ${label}`,
                    orderA
                ]
            );
            const notificationId = Number(notification.rows[0].id);
            const androidEndpoint = await pool.query(
                `SELECT id FROM android_push_endpoints
                  WHERE seller_session_id = $1
                    AND application = 'SELLER_ANDROID'
                    AND status = 'ACTIVE'`,
                [sellerARestricted.sessionId]
            );
            assert.equal(androidEndpoint.rows.length, 1);
            await pool.query(
                `INSERT INTO notification_deliveries
                    (notification_id, channel, endpoint_key, web_push_subscription_id, android_push_endpoint_id,
                     status, created_at, updated_at)
                 VALUES
                    ($1, 'ANDROID_PUSH', $2, NULL, $3, 'PENDING', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP),
                    ($1, 'WEB_PUSH', $4, $5, NULL, 'PENDING', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP)`,
                [
                    notificationId,
                    `${label}-android-${crypto.randomUUID()}`,
                    androidEndpoint.rows[0].id,
                    `${label}-web-${crypto.randomUUID()}`,
                    restrictedWebSubscription.rows[0].id
                ]
            );
            return notificationId;
        };

        const permissionRemovalNotificationId = await createRestrictedOrderDeliveryProbe('permission-removal');
        assert.equal((await resolveSellerNotificationTarget(pool, {
            notificationId: permissionRemovalNotificationId,
            context: restrictedContext
        })).target.type, 'order');
        await pool.query(
            `DELETE FROM seller_role_permissions
              WHERE role_id = $1 AND permission_code = 'order.read'`,
            [restrictedRoleId]
        );
        assert.equal((await listNotifications(pool, restrictedScope, { limit: 100 })).items.length, 0);
        assert.equal(await getUnreadCount(pool, restrictedScope), 0);
        assert.equal(await markAllNotificationsRead(pool, restrictedScope), 0);
        await assert.rejects(
            markNotificationRead(pool, restrictedScope, permissionRemovalNotificationId),
            (error) => error instanceof NotificationReadError && error.code === 'NOTIFICATION_NOT_FOUND'
        );
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: permissionRemovalNotificationId,
                context: restrictedContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        let permissionRemovalAndroidProviderCalls = 0;
        const permissionRemovalAndroid = await deliverOneAndroidPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    permissionRemovalAndroidProviderCalls += 1;
                    return { accepted: true, statusCode: 200, providerMessageId: 'must-not-send-after-permission-removal' };
                }
            }
        });
        assert.equal(permissionRemovalAndroid.status, 'FAILED');
        assert.equal(permissionRemovalAndroidProviderCalls, 0);
        let permissionRemovalWebProviderCalls = 0;
        const permissionRemovalWeb = await deliverOneWebPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    permissionRemovalWebProviderCalls += 1;
                    return { accepted: true, statusCode: 201, providerMessageId: 'must-not-send-after-permission-removal' };
                }
            }
        });
        assert.equal(permissionRemovalWeb.status, 'FAILED');
        assert.equal(permissionRemovalWebProviderCalls, 0);

        await pool.query(
            `INSERT INTO seller_role_permissions (role_id, permission_code)
             VALUES ($1, 'order.read')`,
            [restrictedRoleId]
        );
        const roleDisableNotificationId = await createRestrictedOrderDeliveryProbe('role-disable');
        assert.equal((await resolveSellerNotificationTarget(pool, {
            notificationId: roleDisableNotificationId,
            context: restrictedContext
        })).target.type, 'order');
        await pool.query('UPDATE seller_roles SET is_active = FALSE WHERE id = $1', [restrictedRoleId]);
        await assert.rejects(
            listNotifications(pool, restrictedScope, { limit: 100 }),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            getUnreadCount(pool, restrictedScope),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            markNotificationRead(pool, restrictedScope, roleDisableNotificationId),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            markAllNotificationsRead(pool, restrictedScope),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: roleDisableNotificationId,
                context: restrictedContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        let disabledRoleAndroidProviderCalls = 0;
        const disabledRoleAndroid = await deliverOneAndroidPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    disabledRoleAndroidProviderCalls += 1;
                    return { accepted: true, statusCode: 200, providerMessageId: 'must-not-send-after-role-disable' };
                }
            }
        });
        assert.equal(disabledRoleAndroid.status, 'FAILED');
        assert.equal(disabledRoleAndroidProviderCalls, 0);
        let disabledRoleWebProviderCalls = 0;
        const disabledRoleWeb = await deliverOneWebPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    disabledRoleWebProviderCalls += 1;
                    return { accepted: true, statusCode: 201, providerMessageId: 'must-not-send-after-role-disable' };
                }
            }
        });
        assert.equal(disabledRoleWeb.status, 'FAILED');
        assert.equal(disabledRoleWebProviderCalls, 0);
        await pool.query('UPDATE seller_roles SET is_active = TRUE WHERE id = $1', [restrictedRoleId]);

        const customerNotificationId = Number(customerAFeed.items[0].id);
        await assert.rejects(
            markNotificationRead(pool, customerBScope, customerNotificationId),
            (error) => error instanceof NotificationReadError && error.code === 'NOTIFICATION_NOT_FOUND' && error.statusCode === 404
        );
        const sellerNotificationId = Number(sellerAFeed.items[0].id);
        await assert.rejects(
            markNotificationRead(pool, sellerBScope, sellerNotificationId),
            (error) => error instanceof NotificationReadError && error.code === 'NOTIFICATION_NOT_FOUND' && error.statusCode === 404
        );
        const unreadBefore = await getUnreadCount(pool, customerAScope);
        await markNotificationRead(pool, customerAScope, customerNotificationId);
        assert.equal(await getUnreadCount(pool, customerAScope), unreadBefore - 1);
        assert.equal(await markAllNotificationsRead(pool, customerAScope), unreadBefore - 1);
        assert.equal(await getUnreadCount(pool, customerAScope), 0);

        const deliveredPayloads = [];
        const acceptingProvider = {
            configured: true,
            send: async ({ subscription: row, notification }) => {
                assert.equal(String(row.endpoint).startsWith('https://fcm.googleapis.com/'), true);
                const payload = buildWebPushPayload(notification);
                assert.equal(Object.hasOwn(payload, 'url'), false);
                deliveredPayloads.push(payload);
                return { accepted: true, statusCode: 201, providerMessageId: null };
            }
        };
        const acceptedBatch = await deliverPendingWebPushBatch({ database: pool, provider: acceptingProvider, limit: 100 });
        assert.ok(acceptedBatch.processed > 0);
        assert.equal(deliveredPayloads.length, acceptedBatch.processed);
        const remainingPush = await pool.query(
            "SELECT COUNT(*)::INT count FROM notification_deliveries WHERE channel = 'WEB_PUSH' AND status IN ('PENDING', 'RETRYABLE')"
        );
        assert.equal(Number(remainingPush.rows[0].count), 0);

        const setAdminWebDeliveryTerminal = async (sourceEventKey) => pool.query(
            `UPDATE notification_deliveries delivery
                SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               FROM notifications notification
              WHERE notification.id = delivery.notification_id
                AND notification.source_event_key = $1
                AND notification.recipient_role = 'admin'
                AND delivery.channel = 'WEB_PUSH'
                AND delivery.status IN ('PENDING', 'RETRYABLE')`,
            [sourceEventKey]
        );

        await enqueueNotificationEvent(pool, {
            eventType: 'ORDER_CONFIRMED', aggregateType: 'order', aggregateId: orderA,
            aggregateRevision: 2, payload: { reasonCode: 'STORE_SCOPE_FINAL_DELIVERY_PROBE' }
        });
        await dispatchNotificationOutboxBatch({ database: pool, limit: 5 });
        const storeScopeSourceKey = `ORDER_CONFIRMED:order:${orderA}:r2`;
        await setAdminWebDeliveryTerminal(storeScopeSourceKey);
        await pool.query(
            `UPDATE seller_membership_store_scopes
                SET revoked_at = CURRENT_TIMESTAMP
              WHERE organization_id = $1
                AND membership_id = $2
                AND store_id = $3
                AND revoked_at IS NULL`,
            [sellerA.organizationId, sellerA.membershipId, sellerA.storeId]
        );
        let unauthorizedStoreAndroidProviderCalls = 0;
        const unauthorizedStoreAndroid = await deliverOneAndroidPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    unauthorizedStoreAndroidProviderCalls += 1;
                    return { accepted: true, statusCode: 200, providerMessageId: 'must-not-send-store-scope' };
                }
            }
        });
        assert.equal(unauthorizedStoreAndroid.status, 'FAILED');
        assert.equal(unauthorizedStoreAndroid.errorCode, 'SELLER_DELIVERY_NOT_AUTHORIZED');
        assert.equal(unauthorizedStoreAndroidProviderCalls, 0);
        let unauthorizedStoreWebProviderCalls = 0;
        const unauthorizedStoreWeb = await deliverOneWebPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    unauthorizedStoreWebProviderCalls += 1;
                    return { accepted: true, statusCode: 201, providerMessageId: 'must-not-send-store-scope' };
                }
            }
        });
        assert.equal(unauthorizedStoreWeb.status, 'FAILED');
        assert.equal(unauthorizedStoreWebProviderCalls, 0);
        const storeScopeEndpointState = await pool.query(
            `SELECT status FROM android_push_endpoints
              WHERE seller_session_id = $1 AND application = 'SELLER_ANDROID'`,
            [sellerA.sessionId]
        );
        assert.equal(storeScopeEndpointState.rows[0].status, 'ACTIVE', 'store-only denial must not revoke an otherwise valid device');
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: notificationIdFor('ORDER_CONFIRMED'),
                context: sellerAContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await pool.query(
            `UPDATE seller_membership_store_scopes
                SET revoked_at = NULL
              WHERE organization_id = $1
                AND membership_id = $2
                AND store_id = $3`,
            [sellerA.organizationId, sellerA.membershipId, sellerA.storeId]
        );

        await enqueueNotificationEvent(pool, {
            eventType: 'ORDER_CONFIRMED', aggregateType: 'order', aggregateId: orderA,
            aggregateRevision: 3, payload: { reasonCode: 'RETRY_AFTER_MEMBERSHIP_CHANGE_PROBE' }
        });
        await dispatchNotificationOutboxBatch({ database: pool, limit: 5 });
        const membershipRetrySourceKey = `ORDER_CONFIRMED:order:${orderA}:r3`;
        await setAdminWebDeliveryTerminal(membershipRetrySourceKey);
        let sellerRetryProviderCalls = 0;
        const sellerRetryProvider = {
            configured: true,
            send: async () => {
                sellerRetryProviderCalls += 1;
                if (sellerRetryProviderCalls === 1) {
                    throw new AndroidPushProviderError(
                        'temporary',
                        'FCM_PROVIDER_RETRYABLE',
                        { retryable: true, statusCode: 503 }
                    );
                }
                return { accepted: true, statusCode: 200, providerMessageId: 'must-not-send-after-membership-change' };
            }
        };
        const sellerFirstAttempt = await deliverOneAndroidPush({ database: pool, provider: sellerRetryProvider });
        assert.equal(sellerFirstAttempt.status, 'RETRYABLE');
        assert.equal(sellerRetryProviderCalls, 1);
        await pool.query(
            `UPDATE seller_memberships
                SET status = 'revoked',
                    membership_revision = membership_revision + 1,
                    security_stamp = $3,
                    updated_at = CURRENT_TIMESTAMP
              WHERE organization_id = $1 AND id = $2`,
            [sellerA.organizationId, sellerA.membershipId, crypto.randomUUID()]
        );
        await pool.query(
            'UPDATE notification_deliveries SET next_attempt_at = CURRENT_TIMESTAMP WHERE id = $1',
            [sellerFirstAttempt.deliveryId]
        );
        const sellerRetryAfterMembershipChange = await deliverOneAndroidPush({
            database: pool,
            provider: sellerRetryProvider
        });
        assert.equal(sellerRetryAfterMembershipChange.deliveryId, sellerFirstAttempt.deliveryId);
        assert.equal(sellerRetryAfterMembershipChange.status, 'FAILED');
        assert.equal(sellerRetryAfterMembershipChange.errorCode, 'SELLER_DELIVERY_NOT_AUTHORIZED');
        assert.equal(sellerRetryProviderCalls, 1, 'retry must reauthorize before provider send');
        const sellerRetryAttempts = await pool.query(
            `SELECT attempt_number, outcome, error_code
               FROM notification_delivery_attempts
              WHERE delivery_id = $1
              ORDER BY attempt_number`,
            [sellerFirstAttempt.deliveryId]
        );
        assert.deepEqual(sellerRetryAttempts.rows, [
            { attempt_number: 1, outcome: 'RETRYABLE', error_code: 'FCM_PROVIDER_RETRYABLE' },
            { attempt_number: 2, outcome: 'FAILED', error_code: 'SELLER_DELIVERY_NOT_AUTHORIZED' }
        ]);
        let sellerStaleWebProviderCalls = 0;
        const sellerStaleWeb = await deliverOneWebPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    sellerStaleWebProviderCalls += 1;
                    return { accepted: true, statusCode: 201, providerMessageId: 'must-not-send-after-membership-change' };
                }
            }
        });
        assert.equal(sellerStaleWeb.status, 'FAILED');
        assert.equal(sellerStaleWebProviderCalls, 0);
        const sellerRetryLogicalRows = await pool.query(
            `SELECT COUNT(*)::INT count
               FROM notifications
              WHERE source_event_key = $1
                AND recipient_role = 'seller'
                AND user_id = $2`,
            [membershipRetrySourceKey, sellerAUser]
        );
        assert.equal(Number(sellerRetryLogicalRows.rows[0].count), 1);
        await assert.rejects(
            resolveSellerNotificationTarget(pool, {
                notificationId: notificationIdFor('ORDER_CONFIRMED'),
                context: sellerAContext
            }),
            (error) => error instanceof SellerNotificationAuthorizationError
                && error.code === 'SELLER_NOTIFICATION_TARGET_NOT_FOUND'
        );
        await assert.rejects(
            listNotifications(pool, sellerAScope, { limit: 100 }),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            getUnreadCount(pool, sellerAScope),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            markNotificationRead(pool, sellerAScope, notificationIdFor('ORDER_CONFIRMED')),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        await assert.rejects(
            markAllNotificationsRead(pool, sellerAScope),
            (error) => error instanceof SellerNotificationAuthorizationError
        );
        const sellerBMismatchInstallation = crypto.randomUUID();
        await registerAndroidPushEndpoint({
            database: pool,
            binding: sellerBAndroidBinding,
            registration: androidRegistration('seller-b-mismatch', sellerBMismatchInstallation)
        });
        const sellerBEndpoint = await pool.query(
            `SELECT id
               FROM android_push_endpoints
              WHERE seller_session_id = $1
                AND application = 'SELLER_ANDROID'
                AND status = 'ACTIVE'`,
            [sellerB.sessionId]
        );
        const mismatchedDelivery = await pool.query(
            `INSERT INTO notification_deliveries
                (notification_id, channel, endpoint_key, android_push_endpoint_id, status)
             VALUES ($1, 'ANDROID_PUSH', $2, $3, 'PENDING')
             RETURNING id`,
            [
                notificationIdFor('ORDER_CONFIRMED'),
                `seller-mismatch-${crypto.randomUUID()}`,
                sellerBEndpoint.rows[0].id
            ]
        );
        let mismatchedEndpointProviderCalls = 0;
        const mismatchedEndpointOutcome = await deliverOneAndroidPush({
            database: pool,
            provider: {
                configured: true,
                send: async () => {
                    mismatchedEndpointProviderCalls += 1;
                    return { accepted: true, statusCode: 200, providerMessageId: 'must-not-send-cross-seller' };
                }
            }
        });
        assert.equal(mismatchedEndpointOutcome.deliveryId, Number(mismatchedDelivery.rows[0].id));
        assert.equal(mismatchedEndpointOutcome.status, 'FAILED');
        assert.equal(mismatchedEndpointProviderCalls, 0);
        const sellerBEndpointAfterMismatch = await pool.query(
            'SELECT status FROM android_push_endpoints WHERE id = $1',
            [sellerBEndpoint.rows[0].id]
        );
        assert.equal(sellerBEndpointAfterMismatch.rows[0].status, 'ACTIVE', 'cross-Seller pairing must not revoke the legitimate foreign endpoint');

        await enqueueNotificationEvent(pool, {
            eventType: 'ORDER_STATUS_CHANGED', aggregateType: 'order', aggregateId: orderA,
            aggregateRevision: 2, payload: { reasonCode: 'RETRY_PROBE' }
        });
        await dispatchNotificationOutboxBatch({ database: pool, limit: 5 });
        const retryProvider = {
            configured: true,
            send: async () => { throw new WebPushProviderError('temporary', 'WEB_PUSH_PROVIDER_RETRYABLE', { retryable: true, statusCode: 503 }); }
        };
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const outcome = await deliverOneWebPush({ database: pool, provider: retryProvider });
            assert.equal(outcome.status, attempt < 3 ? 'RETRYABLE' : 'FAILED');
            await pool.query(
                "UPDATE notification_deliveries SET next_attempt_at = CURRENT_TIMESTAMP WHERE id = $1",
                [outcome.deliveryId]
            );
        }
        const retryAttempts = await pool.query(
            `SELECT attempt_number, outcome FROM notification_delivery_attempts
              WHERE delivery_id = (
                SELECT id FROM notification_deliveries WHERE channel = 'WEB_PUSH' AND status = 'FAILED' ORDER BY id DESC LIMIT 1
              ) ORDER BY attempt_number`
        );
        assert.deepEqual(retryAttempts.rows, [
            { attempt_number: 1, outcome: 'RETRYABLE' },
            { attempt_number: 2, outcome: 'RETRYABLE' },
            { attempt_number: 3, outcome: 'FAILED' }
        ]);
        const retryAndroidProvider = {
            configured: true,
            send: async () => {
                throw new AndroidPushProviderError(
                    'temporary',
                    'FCM_PROVIDER_RETRYABLE',
                    { retryable: true, statusCode: 503 }
                );
            }
        };
        let retryAndroidDeliveryId = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const outcome = await deliverOneAndroidPush({ database: pool, provider: retryAndroidProvider });
            assert.equal(outcome.status, attempt < 3 ? 'RETRYABLE' : 'FAILED');
            retryAndroidDeliveryId ||= outcome.deliveryId;
            assert.equal(outcome.deliveryId, retryAndroidDeliveryId, 'retry must use the same Android delivery record');
            await pool.query(
                "UPDATE notification_deliveries SET next_attempt_at = CURRENT_TIMESTAMP WHERE id = $1",
                [outcome.deliveryId]
            );
        }
        const retryAndroidAttempts = await pool.query(
            `SELECT attempt_number, outcome
               FROM notification_delivery_attempts
              WHERE delivery_id = $1
              ORDER BY attempt_number`,
            [retryAndroidDeliveryId]
        );
        assert.deepEqual(retryAndroidAttempts.rows, [
            { attempt_number: 1, outcome: 'RETRYABLE' },
            { attempt_number: 2, outcome: 'RETRYABLE' },
            { attempt_number: 3, outcome: 'FAILED' }
        ]);

        await enqueueNotificationEvent(pool, {
            eventType: 'ORDER_STATUS_CHANGED', aggregateType: 'order', aggregateId: orderA,
            aggregateRevision: 3, payload: { reasonCode: 'INVALID_SUBSCRIPTION_PROBE' }
        });
        await dispatchNotificationOutboxBatch({ database: pool, limit: 5 });
        const invalidProvider = {
            configured: true,
            send: async () => { throw new WebPushProviderError('gone', 'WEB_PUSH_SUBSCRIPTION_INVALID', { invalidSubscription: true, statusCode: 410 }); }
        };
        const invalidOutcome = await deliverOneWebPush({ database: pool, provider: invalidProvider });
        assert.equal(invalidOutcome.status, 'INVALID_SUBSCRIPTION');
        assert.equal((await getWebPushSubscriptionState({ database: pool, binding: customerABinding })).enabled, false);
        await registerWebPushSubscription({ database: pool, binding: customerABinding, subscription: subscription('customer-a') });
        assert.equal((await getWebPushSubscriptionState({ database: pool, binding: customerABinding })).enabled, true);
        const invalidAndroidProvider = {
            configured: true,
            send: async () => {
                throw new AndroidPushProviderError(
                    'unregistered',
                    'FCM_ENDPOINT_INVALID',
                    { invalidEndpoint: true, statusCode: 404, providerCode: 'UNREGISTERED' }
                );
            }
        };
        const invalidAndroidOutcome = await deliverOneAndroidPush({
            database: pool,
            provider: invalidAndroidProvider
        });
        assert.equal(invalidAndroidOutcome.status, 'INVALID_SUBSCRIPTION');
        assert.equal((await getAndroidPushEndpointState({ database: pool, binding: customerAAndroidBinding })).enabled, false);
        await expectCode(
            registerAndroidPushEndpoint({
                database: pool,
                binding: customerAAndroidBinding,
                registration: androidRegistration('customer-a-current', customerInstallationA)
            }),
            'ANDROID_FCM_TOKEN_INVALIDATED'
        );
        const customerPostInvalidEndpoint = await registerAndroidPushEndpoint({
            database: pool,
            binding: customerAAndroidBinding,
            registration: androidRegistration('customer-a-post-invalid', customerInstallationA)
        });
        assert.equal(customerPostInvalidEndpoint.status, 'ACTIVE');
        assert.equal((await getAndroidPushEndpointState({ database: pool, binding: customerAAndroidBinding })).enabled, true);

        await pool.query(
            "UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'NOTIFICATION_CORE_LOGOUT_TEST' WHERE id = $1",
            [customerABinding.authSessionId]
        );
        const staleState = await getWebPushSubscriptionState({ database: pool, binding: customerABinding });
        assert.equal(staleState.enabled, false);
        const staleActive = await pool.query(
            `SELECT COUNT(*)::INT count FROM web_push_subscriptions
              WHERE auth_session_id = $1 AND status = 'ACTIVE'`,
            [customerABinding.authSessionId]
        );
        assert.equal(Number(staleActive.rows[0].count), 0);
        const staleCustomerAndroid = await pool.query(
            `SELECT COUNT(*)::INT count FROM android_push_endpoints
              WHERE auth_session_id = $1 AND status = 'ACTIVE'`,
            [customerABinding.authSessionId]
        );
        assert.equal(Number(staleCustomerAndroid.rows[0].count), 0);
        await enqueueNotificationEvent(pool, {
            eventType: 'ORDER_STATUS_CHANGED', aggregateType: 'order', aggregateId: orderA,
            aggregateRevision: 4, payload: { reasonCode: 'LOGOUT_ISOLATION_PROBE' }
        });
        await dispatchNotificationOutboxBatch({ database: pool, limit: 5 });
        const postLogoutDelivery = await pool.query(
            `SELECT COUNT(*)::INT count
               FROM notification_deliveries delivery
               JOIN notifications notification ON notification.id = delivery.notification_id
              WHERE notification.source_event_key = $1 AND delivery.channel = 'WEB_PUSH'`,
            [`ORDER_STATUS_CHANGED:order:${orderA}:r4`]
        );
        assert.equal(Number(postLogoutDelivery.rows[0].count), 0);
        const postLogoutAndroidDelivery = await pool.query(
            `SELECT COUNT(*)::INT count
               FROM notification_deliveries delivery
               JOIN notifications notification ON notification.id = delivery.notification_id
              WHERE notification.source_event_key = $1 AND delivery.channel = 'ANDROID_PUSH'`,
            [`ORDER_STATUS_CHANGED:order:${orderA}:r4`]
        );
        assert.equal(Number(postLogoutAndroidDelivery.rows[0].count), 0);
        const rebound = await registerWebPushSubscription({
            database: pool, binding: customerBBinding, subscription: subscription('customer-a')
        });
        assert.equal(rebound.status, 'ACTIVE');
        const reboundOwner = await pool.query(
            `SELECT user_id, auth_session_id, status FROM web_push_subscriptions WHERE endpoint_hash = $1`,
            [crypto.createHash('sha256').update(endpoint('customer-a')).digest('hex')]
        );
        assert.equal(Number(reboundOwner.rows[0].user_id), customerB);
        assert.equal(Number(reboundOwner.rows[0].auth_session_id), customerBBinding.authSessionId);
        const reboundAndroid = await registerAndroidPushEndpoint({
            database: pool,
            binding: customerBAndroidBinding,
            registration: androidRegistration('customer-a-post-invalid', customerInstallationA)
        });
        assert.equal(reboundAndroid.status, 'ACTIVE');
        const reboundAndroidOwner = await pool.query(
            `SELECT user_id, auth_session_id, status
               FROM android_push_endpoints
              WHERE token_hash = $1`,
            [crypto.createHash('sha256').update(androidToken('customer-a-post-invalid')).digest('hex')]
        );
        assert.equal(Number(reboundAndroidOwner.rows[0].user_id), customerB);
        assert.equal(Number(reboundAndroidOwner.rows[0].auth_session_id), customerBAndroidBinding.authSessionId);

        await pool.query("UPDATE seller_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = $1", [sellerA.sessionId]);
        const sellerStale = await pool.query(
            "SELECT COUNT(*)::INT count FROM web_push_subscriptions WHERE seller_session_id = $1 AND status = 'ACTIVE'",
            [sellerA.sessionId]
        );
        assert.equal(Number(sellerStale.rows[0].count), 0);
        const sellerAndroidStale = await pool.query(
            "SELECT COUNT(*)::INT count FROM android_push_endpoints WHERE seller_session_id = $1 AND status = 'ACTIVE'",
            [sellerA.sessionId]
        );
        assert.equal(Number(sellerAndroidStale.rows[0].count), 0);
        const sellerReboundAndroid = await registerAndroidPushEndpoint({
            database: pool,
            binding: sellerBAndroidBinding,
            registration: androidRegistration('seller-a-current', sellerInstallationA)
        });
        assert.equal(sellerReboundAndroid.status, 'ACTIVE');
        await enqueueNotificationEvent(pool, {
            eventType: 'RETURN_STATUS_CHANGED',
            aggregateType: 'return_request',
            aggregateId: returnA,
            aggregateRevision: 5,
            payload: { reasonCode: 'SELLER_LOGOUT_TENANT_ISOLATION_PROBE' }
        });
        await dispatchNotificationOutboxBatch({ database: pool, limit: 5 });
        const sellerCrossTenantAndroidLeak = await pool.query(
            `SELECT COUNT(*)::INT count
               FROM notification_deliveries delivery
               JOIN notifications notification ON notification.id = delivery.notification_id
              WHERE notification.source_event_key = $1
                AND delivery.channel = 'ANDROID_PUSH'`,
            [`RETURN_STATUS_CHANGED:return_request:${returnA}:r5`]
        );
        assert.equal(Number(sellerCrossTenantAndroidLeak.rows[0].count), 0);

        const createDeliveryLockOrderProbe = async (channel, suffix) => {
            const probeUser = await pool.query(
                `INSERT INTO users (full_name, name, email, phone, password, role, auth_enabled)
                 VALUES ($1, $1, $2, $3, $4, 'customer', TRUE)
                 RETURNING id`,
                [
                    `Notification lock-order ${suffix}`,
                    `notification-lock-${suffix}@example.test`,
                    `+9055510${suffix === 'android' ? '0001' : '0002'}`,
                    testPasswordHash
                ]
            );
            const userId = Number(probeUser.rows[0].id);
            const stamp = crypto.randomUUID();
            const membership = await pool.query(
                `INSERT INTO seller_memberships (organization_id, user_id, role_id, security_stamp)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [sellerB.organizationId, userId, Number(managerRole.rows[0].id), stamp]
            );
            const membershipId = Number(membership.rows[0].id);
            await pool.query(
                `INSERT INTO seller_membership_store_scopes (membership_id, organization_id, store_id)
                 VALUES ($1, $2, $3)`,
                [membershipId, sellerB.organizationId, sellerB.storeId]
            );
            const sessionId = crypto.randomUUID();
            await pool.query(
                `INSERT INTO seller_sessions
                    (id, user_id, organization_id, membership_id, membership_revision, security_stamp, expires_at)
                 VALUES ($1, $2, $3, $4, 1, $5, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
                [sessionId, userId, sellerB.organizationId, membershipId, stamp]
            );
            const binding = Object.freeze({
                userId,
                role: 'seller',
                organizationId: sellerB.organizationId,
                authSessionId: null,
                sellerSessionId: sessionId
            });
            const notification = await pool.query(
                `INSERT INTO notifications
                    (user_id, recipient_role, recipient_organization_id, recipient_store_id,
                     type, category, priority, title, message, entity_type, entity_id, entity_key)
                 VALUES ($1, 'seller', $2, $3, 'ORDER_CONFIRMED', 'ORDER', 'HIGH',
                         'Yeni sipariş', $4, 'order', $5, NULL)
                 RETURNING id`,
                [userId, sellerB.organizationId, sellerB.storeId, `Lock-order ${suffix} probe`, orderB]
            );
            const notificationId = Number(notification.rows[0].id);
            let endpointId;
            if (channel === 'ANDROID_PUSH') {
                const endpointRow = await registerAndroidPushEndpoint({
                    database: pool,
                    binding: Object.freeze({ ...binding, application: 'SELLER_ANDROID' }),
                    registration: androidRegistration(`seller-lock-${suffix}`, crypto.randomUUID())
                });
                endpointId = endpointRow.id;
                await pool.query(
                    `INSERT INTO notification_deliveries
                        (notification_id, channel, endpoint_key, android_push_endpoint_id, status)
                     VALUES ($1, 'ANDROID_PUSH', $2, $3, 'PENDING')`,
                    [notificationId, `lock-${suffix}-${crypto.randomUUID()}`, endpointId]
                );
            } else {
                await registerWebPushSubscription({
                    database: pool,
                    binding,
                    subscription: subscription(`seller-lock-${suffix}`)
                });
                const subscriptionRow = await pool.query(
                    `SELECT id FROM web_push_subscriptions
                      WHERE seller_session_id = $1 AND status = 'ACTIVE'`,
                    [sessionId]
                );
                endpointId = subscriptionRow.rows[0].id;
                await pool.query(
                    `INSERT INTO notification_deliveries
                        (notification_id, channel, endpoint_key, web_push_subscription_id, status)
                     VALUES ($1, 'WEB_PUSH', $2, $3, 'PENDING')`,
                    [notificationId, `lock-${suffix}-${crypto.randomUUID()}`, endpointId]
                );
            }
            return Object.freeze({ sessionId });
        };

        const runDeliveryLockOrderProbe = async (channel, suffix) => {
            const pendingBefore = await pool.query(
                `SELECT COUNT(*)::INT AS count
                   FROM notification_deliveries
                  WHERE status IN ('PENDING', 'RETRYABLE')`
            );
            assert.equal(Number(pendingBefore.rows[0].count), 0);
            const fixture = await createDeliveryLockOrderProbe(channel, suffix);
            const claimed = deferred();
            const releaseClaim = deferred();
            const pausedDatabase = databasePausedAfterDeliveryClaim(pool, claimed, releaseClaim);
            let providerCalls = 0;
            const provider = {
                configured: true,
                send: async () => {
                    providerCalls += 1;
                    return {
                        accepted: true,
                        statusCode: channel === 'ANDROID_PUSH' ? 200 : 201,
                        providerMessageId: 'must-not-send-during-session-revocation'
                    };
                }
            };
            const deliveryPromise = channel === 'ANDROID_PUSH'
                ? deliverOneAndroidPush({ database: pausedDatabase, provider })
                : deliverOneWebPush({ database: pausedDatabase, provider });
            await within(claimed.promise, 2000, `${channel} delivery claim did not reach the lock-order barrier`);
            const revoker = new Client({
                connectionString,
                application_name: `notification_${suffix}_lock_order_revoker`
            });
            await revoker.connect();
            const revocationPromise = revoker.query(
                `UPDATE seller_sessions
                    SET status = 'revoked',
                        revoked_at = CURRENT_TIMESTAMP
                  WHERE id = $1`,
                [fixture.sessionId]
            );
            let lockOrderError = null;
            try {
                await within(
                    revocationPromise,
                    2000,
                    `${channel} session revocation blocked behind the delivery endpoint lock`
                );
            } catch (error) {
                lockOrderError = error;
            } finally {
                releaseClaim.resolve();
            }
            const outcome = await within(deliveryPromise, 5000, `${channel} delivery did not terminate after revocation`);
            await within(revocationPromise, 5000, `${channel} revocation did not finish after releasing the claim`);
            await revoker.end();
            if (lockOrderError) throw lockOrderError;
            assert.equal(outcome.status, 'FAILED');
            assert.equal(outcome.errorCode, 'SELLER_DELIVERY_NOT_AUTHORIZED');
            assert.equal(providerCalls, 0);
            return providerCalls;
        };
        const androidDeliveryRevocationLockLeakCount = await runDeliveryLockOrderProbe('ANDROID_PUSH', 'android');
        const webDeliveryRevocationLockLeakCount = await runDeliveryLockOrderProbe('WEB_PUSH', 'web');

        const rebindOwner = await pool.query(
            `INSERT INTO users (full_name, name, email, phone, password, role, auth_enabled)
             VALUES ('Notification Rebind Owner', 'Notification Rebind Owner',
                     'notification-rebind-owner@example.test', '+905551099999', $1, 'customer', TRUE)
             RETURNING id`,
            [testPasswordHash]
        );
        const rebindOwnerUserId = Number(rebindOwner.rows[0].id);
        const rebindOwnerSession = await pool.query(
            `INSERT INTO auth_sessions (jti_hash, user_id, principal_type, issued_at, expires_at)
             VALUES ($1, $2, 'customer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day')
             RETURNING id`,
            ['f'.repeat(64), rebindOwnerUserId]
        );
        const rebindOwnerBinding = Object.freeze({
            userId: rebindOwnerUserId,
            role: 'customer',
            organizationId: null,
            authSessionId: Number(rebindOwnerSession.rows[0].id),
            sellerSessionId: null
        });
        const rebindOwnerAndroidBinding = Object.freeze({
            ...rebindOwnerBinding,
            application: 'CUSTOMER_ANDROID'
        });

        const assertNoPendingDeliveries = async (message) => {
            const result = await pool.query(
                `SELECT COUNT(*)::INT AS count
                   FROM notification_deliveries
                  WHERE status IN ('PENDING', 'RETRYABLE')`
            );
            assert.equal(Number(result.rows[0].count), 0, message);
        };

        const runWebDeliveryRebindProbe = async () => {
            await assertNoPendingDeliveries('Web rebind probe requires an isolated delivery queue');
            const probeSubscription = subscription(`customer-web-rebind-${crypto.randomUUID()}`);
            const initialSubscription = await registerWebPushSubscription({
                database: pool,
                binding: customerBBinding,
                subscription: probeSubscription
            });
            const notification = await pool.query(
                `INSERT INTO notifications
                    (user_id, recipient_role, type, category, priority, title, message,
                     entity_type, entity_id, entity_key)
                 VALUES ($1, 'customer', 'ORDER_STATUS_CHANGED', 'ORDER', 'HIGH',
                         'Sipariş güncellendi', 'Web teslim bağı değiştirme yarışı',
                         'order', $2, NULL)
                 RETURNING id`,
                [customerB, orderB]
            );
            const delivery = await pool.query(
                `INSERT INTO notification_deliveries
                    (notification_id, channel, endpoint_key, web_push_subscription_id, status)
                 VALUES ($1, 'WEB_PUSH', $2, $3, 'PENDING')
                 RETURNING id`,
                [Number(notification.rows[0].id), `web-rebind-${crypto.randomUUID()}`, initialSubscription.id]
            );
            const deliveryId = Number(delivery.rows[0].id);
            const claimed = deferred();
            const releaseClaim = deferred();
            const pausedDatabase = databasePausedAfterDeliveryClaim(pool, claimed, releaseClaim);
            let providerCalls = 0;
            const deliveryPromise = deliverOneWebPush({
                database: pausedDatabase,
                provider: {
                    configured: true,
                    send: async () => {
                        providerCalls += 1;
                        return {
                            accepted: true,
                            statusCode: 201,
                            providerMessageId: 'must-not-send-after-web-rebind'
                        };
                    }
                }
            });
            await within(claimed.promise, 2000, 'Web rebind delivery did not reach the claim barrier');
            const mutationPromise = (async () => {
                const revoked = await revokeWebPushSubscription({
                    database: pool,
                    binding: customerBBinding,
                    endpoint: probeSubscription.endpoint
                });
                assert.equal(revoked.revoked, true);
                return registerWebPushSubscription({
                    database: pool,
                    binding: rebindOwnerBinding,
                    subscription: probeSubscription
                });
            })();
            let mutationBarrierError = null;
            try {
                await within(
                    mutationPromise,
                    2500,
                    'Web subscription revoke/rebind blocked behind the claimed delivery'
                );
            } catch (error) {
                mutationBarrierError = error;
            } finally {
                releaseClaim.resolve();
            }
            const outcome = await within(deliveryPromise, 5000, 'Web delivery did not terminate after endpoint rebind');
            await Promise.allSettled([mutationPromise]);
            if (mutationBarrierError) throw mutationBarrierError;
            assert.equal(outcome.status, 'FAILED');
            assert.equal(outcome.errorCode, 'DELIVERY_BINDING_CHANGED');
            assert.equal(providerCalls, 0);
            const state = await pool.query(
                `SELECT subscription.user_id, subscription.recipient_role,
                        subscription.auth_session_id, subscription.status,
                        delivery.status AS delivery_status, delivery.last_error_code
                   FROM web_push_subscriptions subscription
                   JOIN notification_deliveries delivery ON delivery.web_push_subscription_id = subscription.id
                  WHERE subscription.id = $1 AND delivery.id = $2`,
                [initialSubscription.id, deliveryId]
            );
            assert.equal(state.rows.length, 1);
            assert.equal(Number(state.rows[0].user_id), rebindOwnerBinding.userId);
            assert.equal(state.rows[0].recipient_role, 'customer');
            assert.equal(Number(state.rows[0].auth_session_id), rebindOwnerBinding.authSessionId);
            assert.equal(state.rows[0].status, 'ACTIVE');
            assert.equal(state.rows[0].delivery_status, 'FAILED');
            assert.equal(state.rows[0].last_error_code, 'DELIVERY_BINDING_CHANGED');
            return providerCalls;
        };

        const runAndroidDeliveryRebindProbe = async () => {
            await assertNoPendingDeliveries('Android rebind probe requires an isolated delivery queue');
            const installationId = crypto.randomUUID();
            const registration = androidRegistration(`customer-android-rebind-${crypto.randomUUID()}`, installationId);
            const initialEndpoint = await registerAndroidPushEndpoint({
                database: pool,
                binding: customerBAndroidBinding,
                registration
            });
            const notification = await pool.query(
                `INSERT INTO notifications
                    (user_id, recipient_role, type, category, priority, title, message,
                     entity_type, entity_id, entity_key)
                 VALUES ($1, 'customer', 'ORDER_STATUS_CHANGED', 'ORDER', 'HIGH',
                         'Sipariş güncellendi', 'Android teslim bağı değiştirme yarışı',
                         'order', $2, NULL)
                 RETURNING id`,
                [customerB, orderB]
            );
            const delivery = await pool.query(
                `INSERT INTO notification_deliveries
                    (notification_id, channel, endpoint_key, android_push_endpoint_id, status)
                 VALUES ($1, 'ANDROID_PUSH', $2, $3, 'PENDING')
                 RETURNING id`,
                [Number(notification.rows[0].id), `android-rebind-${crypto.randomUUID()}`, initialEndpoint.id]
            );
            const deliveryId = Number(delivery.rows[0].id);
            const claimed = deferred();
            const releaseClaim = deferred();
            const pausedDatabase = databasePausedAfterDeliveryClaim(pool, claimed, releaseClaim);
            let providerCalls = 0;
            const deliveryPromise = deliverOneAndroidPush({
                database: pausedDatabase,
                provider: {
                    configured: true,
                    send: async () => {
                        providerCalls += 1;
                        return {
                            accepted: true,
                            statusCode: 200,
                            providerMessageId: 'must-not-send-after-android-rebind'
                        };
                    }
                }
            });
            await within(claimed.promise, 2000, 'Android rebind delivery did not reach the claim barrier');
            const mutationPromise = (async () => {
                const revoked = await revokeAndroidPushEndpoint({
                    database: pool,
                    binding: customerBAndroidBinding,
                    revocation: { token: registration.token, installationId }
                });
                assert.equal(revoked.revoked, true);
                return registerAndroidPushEndpoint({
                    database: pool,
                    binding: rebindOwnerAndroidBinding,
                    registration
                });
            })();
            let mutationBarrierError = null;
            try {
                await within(
                    mutationPromise,
                    2500,
                    'Android endpoint revoke/rebind deadlocked behind the claimed delivery'
                );
            } catch (error) {
                mutationBarrierError = error;
            } finally {
                releaseClaim.resolve();
            }
            const outcome = await within(deliveryPromise, 5000, 'Android delivery did not terminate after endpoint rebind');
            await Promise.allSettled([mutationPromise]);
            if (mutationBarrierError) throw mutationBarrierError;
            assert.equal(outcome.status, 'FAILED');
            assert.equal(outcome.errorCode, 'DELIVERY_BINDING_CHANGED');
            assert.equal(providerCalls, 0);
            const state = await pool.query(
                `SELECT endpoint.user_id, endpoint.recipient_role, endpoint.auth_session_id,
                        endpoint.application, endpoint.status,
                        delivery.status AS delivery_status, delivery.last_error_code
                   FROM android_push_endpoints endpoint
                   JOIN notification_deliveries delivery ON delivery.android_push_endpoint_id = endpoint.id
                  WHERE endpoint.id = $1 AND delivery.id = $2`,
                [initialEndpoint.id, deliveryId]
            );
            assert.equal(state.rows.length, 1);
            assert.equal(Number(state.rows[0].user_id), rebindOwnerAndroidBinding.userId);
            assert.equal(state.rows[0].recipient_role, 'customer');
            assert.equal(Number(state.rows[0].auth_session_id), rebindOwnerAndroidBinding.authSessionId);
            assert.equal(state.rows[0].application, 'CUSTOMER_ANDROID');
            assert.equal(state.rows[0].status, 'ACTIVE');
            assert.equal(state.rows[0].delivery_status, 'FAILED');
            assert.equal(state.rows[0].last_error_code, 'DELIVERY_BINDING_CHANGED');
            return providerCalls;
        };

        const webDeliveryRebindLeakCount = await runWebDeliveryRebindProbe();
        const androidDeliveryRebindLeakCount = await runAndroidDeliveryRebindProbe();

        const runExpiredSessionCleanupLockProbe = async (channel, suffix) => {
            await assertNoPendingDeliveries(`${channel} cleanup probe requires an isolated delivery queue`);
            const cleanupUser = await pool.query(
                `INSERT INTO users (full_name, name, email, phone, password, role, auth_enabled)
                 VALUES ($1, $1, $2, $3, $4, 'customer', TRUE)
                 RETURNING id`,
                [
                    `Notification Cleanup ${suffix}`,
                    `notification-cleanup-${suffix}@example.test`,
                    `+9055520${suffix === 'web' ? '0001' : '0002'}`,
                    testPasswordHash
                ]
            );
            const userId = Number(cleanupUser.rows[0].id);
            const session = await pool.query(
                `INSERT INTO auth_sessions (jti_hash, user_id, principal_type, issued_at, expires_at)
                 VALUES ($1, $2, 'customer', CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP + INTERVAL '1 day')
                 RETURNING id`,
                [crypto.createHash('sha256').update(`notification-cleanup-${suffix}`).digest('hex'), userId]
            );
            const sessionId = Number(session.rows[0].id);
            const binding = Object.freeze({
                userId,
                role: 'customer',
                organizationId: null,
                authSessionId: sessionId,
                sellerSessionId: null
            });
            let bindingId;
            if (channel === 'WEB_PUSH') {
                const registered = await registerWebPushSubscription({
                    database: pool,
                    binding,
                    subscription: subscription(`cleanup-${suffix}`)
                });
                bindingId = registered.id;
            } else {
                const registered = await registerAndroidPushEndpoint({
                    database: pool,
                    binding: Object.freeze({ ...binding, application: 'CUSTOMER_ANDROID' }),
                    registration: androidRegistration(`cleanup-${suffix}`, crypto.randomUUID())
                });
                bindingId = registered.id;
            }
            await pool.query(
                `UPDATE auth_sessions
                    SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
                  WHERE id = $1`,
                [sessionId]
            );
            const notification = await pool.query(
                `INSERT INTO notifications
                    (user_id, recipient_role, type, category, priority, title, message,
                     entity_type, entity_id, entity_key)
                 VALUES ($1, 'customer', 'ORDER_STATUS_CHANGED', 'ORDER', 'HIGH',
                         'Sipariş güncellendi', $2, 'order', $3, NULL)
                 RETURNING id`,
                [userId, `${channel} cleanup lock-order probe`, orderB]
            );
            await pool.query(
                channel === 'WEB_PUSH'
                    ? `INSERT INTO notification_deliveries
                           (notification_id, channel, endpoint_key, web_push_subscription_id, status)
                       VALUES ($1, 'WEB_PUSH', $2, $3, 'PENDING')`
                    : `INSERT INTO notification_deliveries
                           (notification_id, channel, endpoint_key, android_push_endpoint_id, status)
                       VALUES ($1, 'ANDROID_PUSH', $2, $3, 'PENDING')`,
                [Number(notification.rows[0].id), `cleanup-${suffix}-${crypto.randomUUID()}`, bindingId]
            );

            const claimed = deferred();
            const releaseClaim = deferred();
            const pausedDatabase = databasePausedAfterDeliveryClaim(pool, claimed, releaseClaim);
            let providerCalls = 0;
            const provider = {
                configured: true,
                send: async () => {
                    providerCalls += 1;
                    return {
                        accepted: true,
                        statusCode: channel === 'WEB_PUSH' ? 201 : 200,
                        providerMessageId: 'must-not-send-for-expired-session'
                    };
                }
            };
            const deliveryPromise = channel === 'WEB_PUSH'
                ? deliverOneWebPush({ database: pausedDatabase, provider })
                : deliverOneAndroidPush({ database: pausedDatabase, provider });
            await within(claimed.promise, 2000, `${channel} cleanup probe did not claim its delivery`);

            const skipped = await within(
                cleanupExpiredSessions({ queryable: pool, limit: 1 }),
                1500,
                `${channel} expired-session cleanup blocked behind a claimed delivery`
            );
            assert.equal(skipped, 0);
            assert.equal(
                Number((await pool.query('SELECT COUNT(*)::INT AS count FROM auth_sessions WHERE id = $1', [sessionId])).rows[0].count),
                1,
                'cleanup must preserve an expired session while its delivery is claimed'
            );

            releaseClaim.resolve();
            const outcome = await within(deliveryPromise, 5000, `${channel} cleanup probe delivery did not terminate`);
            assert.equal(outcome.status, 'INVALID_SUBSCRIPTION');
            assert.equal(providerCalls, 0);
            assert.equal(await cleanupExpiredSessions({ queryable: pool, limit: 1 }), 1);
            assert.equal(
                Number((await pool.query('SELECT COUNT(*)::INT AS count FROM auth_sessions WHERE id = $1', [sessionId])).rows[0].count),
                0,
                'cleanup must delete the expired session after delivery processing is terminal'
            );
            return providerCalls;
        };

        const webExpiredCleanupProviderCalls = await runExpiredSessionCleanupLockProbe('WEB_PUSH', 'web');
        const androidExpiredCleanupProviderCalls = await runExpiredSessionCleanupLockProbe('ANDROID_PUSH', 'android');

        const truthTables = await pool.query(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name IN ('notifications', 'admin_notifications', 'customer_notifications', 'seller_notifications')
              ORDER BY table_name`
        );
        assert.deepEqual(truthTables.rows, [{ table_name: 'notifications' }]);
        const invalidTargets = await pool.query(
            `SELECT COUNT(*)::INT count FROM notifications
              WHERE entity_type NOT IN ('order','payment','product','product_question','return_request','review','seller_application','shipment','store','support_thread')
                 OR (entity_id IS NULL AND entity_key IS NULL)
                 OR (entity_id IS NOT NULL AND entity_key IS NOT NULL)`
        );
        assert.equal(Number(invalidTargets.rows[0].count), 0);
        const totalNotifications = await pool.query('SELECT COUNT(*)::INT count FROM notifications');
        const eventCounts = await pool.query(
            `SELECT type, COUNT(*)::INT count FROM notifications GROUP BY type ORDER BY type`
        );
        const roleCounts = await pool.query(
            `SELECT recipient_role, COUNT(*)::INT count FROM notifications GROUP BY recipient_role ORDER BY recipient_role`
        );
        const concurrentCapacityResults = await Promise.allSettled(
            Array.from({ length: 6 }, (_, index) => registerWebPushSubscription({
                database: pool,
                binding: adminBBinding,
                subscription: subscription(`admin-b-capacity-${index + 1}`)
            }))
        );
        assert.equal(concurrentCapacityResults.filter((entry) => entry.status === 'fulfilled').length, 5);
        const capacityRejections = concurrentCapacityResults.filter((entry) => entry.status === 'rejected');
        assert.equal(capacityRejections.length, 1);
        assert.equal(capacityRejections[0].reason?.code, 'WEB_PUSH_SUBSCRIPTION_SESSION_LIMIT');
        assert.equal(capacityRejections[0].reason?.statusCode, 429);
        const idempotentAtCapacity = await registerWebPushSubscription({
            database: pool,
            binding: adminBBinding,
            subscription: subscription('admin-b-capacity-1')
        });
        assert.equal(idempotentAtCapacity.status, 'ACTIVE');
        const capacityRows = await pool.query(
            `SELECT COUNT(*)::INT count
               FROM web_push_subscriptions
              WHERE user_id = $1
                AND recipient_role = 'admin'
                AND status = 'ACTIVE'`,
            [adminB]
        );
        assert.equal(Number(capacityRows.rows[0].count), 5);
        const idorLeakCount = customerBFeed.items.length + sellerBFeed.items.length;
        assert.equal(idorLeakCount, 0);

        console.log(JSON.stringify({
            result: 'PASS',
            migrationFirstApply: firstApply.applied.length,
            migrationSecondApply: secondApply.applied.length,
            logicalNotificationTruthCount: truthTables.rows.length,
            notificationCount: Number(totalNotifications.rows[0].count),
            eventCounts: eventCounts.rows,
            roleCounts: roleCounts.rows,
            outboxReplayDuplicateCount: Number(duplicates.rows[0].count),
            duplicateAndroidDeliveryRecordOnReplay: Number(duplicateAndroidDeliveries.rows[0].count),
            lostTransactionalNotificationOnRollbackOrCommit: 0,
            staleLogoutPushLeakCount: Number(staleActive.rows[0].count) + Number(postLogoutDelivery.rows[0].count),
            staleCustomerTokenLeakCount: Number(staleCustomerAndroid.rows[0].count) + Number(postLogoutAndroidDelivery.rows[0].count),
            staleSellerTokenLeakCount: Number(sellerAndroidStale.rows[0].count),
            staleMembershipPrivatePushCount: unauthorizedStoreAndroidProviderCalls + unauthorizedStoreWebProviderCalls,
            retryAfterMembershipRevocationPushCount: sellerRetryProviderCalls - 1,
            unauthorizedSellerEventRecipientCount: Number(restrictedRecipientCount.rows[0].count),
            unauthorizedSellerEventDeliveryCount: restrictedProviderCalls,
            eventPermissionStaleRoleBypassCount: permissionRemovalAndroidProviderCalls
                + permissionRemovalWebProviderCalls
                + disabledRoleAndroidProviderCalls
                + disabledRoleWebProviderCalls,
            disabledSellerAccountDeliveryCount: disabledAccountAndroidProviderCalls + disabledAccountWebProviderCalls,
            applicationIdentityCollisionLeakCount: applicationRecipients.some(
                (recipient) => recipient.userId === sellerACaseVariantUser
            ) ? 1 : 0,
            deliveryRevocationLockLeakCount: androidDeliveryRevocationLockLeakCount
                + webDeliveryRevocationLockLeakCount,
            deliveryEndpointRebindLeakCount: webDeliveryRebindLeakCount + androidDeliveryRebindLeakCount,
            expiredSessionCleanupDeadlockCount: webExpiredCleanupProviderCalls + androidExpiredCleanupProviderCalls,
            crossSellerEndpointDeliveryCount: mismatchedEndpointProviderCalls,
            staleMembershipTargetOpenCount: 0,
            sellerTypedTargetResolverCount: 5,
            notificationIdorLeakCount: idorLeakCount,
            crossTenantNotificationLeakCount: sellerBFeed.items.length + Number(sellerCrossTenantAndroidLeak.rows[0].count),
            arbitraryTargetUrlCount: 0,
            acceptedMockWebPushCount: acceptedBatch.processed,
            acceptedMockAndroidPushCount: acceptedAndroidBatch.processed,
            retryAttempts: retryAttempts.rows.length,
            androidRetryAttempts: retryAndroidAttempts.rows.length,
            androidDeviceEndpointIdor: 'PASS',
            customerAndroidActiveDevicesBeforeRevocation: 2,
            sellerAndroidActiveDevicesBeforeRevocation: 1,
            concurrentSubscriptionCapacityAccepted: 5,
            concurrentSubscriptionCapacityRejected: 1,
            customerA,
            customerB,
            adminA,
            adminB,
            sellerAUser,
            sellerBUser,
            orderA,
            orderB,
            returnA,
            supportA,
            questionA
        }, null, 2));
        console.log('notification core PostgreSQL integration smoke passed');
    } finally {
        if (pool) await pool.end().catch(() => {});
        await admin.end().catch(() => {});
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
