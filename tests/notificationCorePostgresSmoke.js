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

const ids = (rows, field = 'id') => rows.map((row) => Number(row[field]));
const expectCode = (promise, code) => assert.rejects(promise, (error) => error?.code === code);

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
        assert.equal(registry.length, 32);
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
            registerWebPushSubscription
        } = require('../services/webPushSubscriptionService');
        const {
            WebPushProviderError,
            buildWebPushPayload
        } = require('../services/webPushProviderService');
        const {
            deliverOneWebPush,
            deliverPendingWebPushBatch
        } = require('../services/notificationDeliveryService');

        const testPasswordHash = bcrypt.hashSync('local-notification-uat-only', 10);
        const users = await pool.query(
            `INSERT INTO users (full_name, name, email, phone, password, role, auth_enabled)
             VALUES
                ('Notification Customer A', 'Notification Customer A', 'notification-customer-a@example.test', '+905550000001', $1, 'customer', TRUE),
                ('Notification Customer B', 'Notification Customer B', 'notification-customer-b@example.test', '+905550000002', $1, 'customer', TRUE),
                ('Notification Admin A', 'Notification Admin A', 'notification-admin-a@example.test', '+905550000003', $1, 'admin', TRUE),
                ('Notification Admin B', 'Notification Admin B', 'notification-admin-b@example.test', '+905550000004', $1, 'admin', TRUE),
                ('Notification Seller A', 'Notification Seller A', 'notification-seller-a@example.test', '+905550000005', $1, 'customer', TRUE),
                ('Notification Seller B', 'Notification Seller B', 'notification-seller-b@example.test', '+905550000006', $1, 'customer', TRUE)
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
        await pool.query(
            `INSERT INTO seller_orders (organization_id, store_id, canonical_order_id, currency, gross_minor)
             VALUES ($1, $2, $3, 'TRY', 10000), ($4, $5, $6, 'TRY', 20000)`,
            [sellerA.organizationId, sellerA.storeId, orderA, sellerB.organizationId, sellerB.storeId, orderB]
        );
        const returnRow = await pool.query(
            `INSERT INTO returns (order_id, user_id, reason_code, note)
             VALUES ($1, $2, 'CHANGED_MIND', 'İzole test iade talebi') RETURNING id`,
            [orderA, customerA]
        );
        const returnA = Number(returnRow.rows[0].id);
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

        const customerAScope = { userId: customerA, role: 'customer', organizationId: null, storeIds: [] };
        const customerBScope = { userId: customerB, role: 'customer', organizationId: null, storeIds: [] };
        const adminAScope = { userId: adminA, role: 'admin', organizationId: null, storeIds: [] };
        const sellerAScope = {
            userId: sellerAUser, role: 'seller', organizationId: sellerA.organizationId, storeIds: [sellerA.storeId]
        };
        const sellerBScope = {
            userId: sellerBUser, role: 'seller', organizationId: sellerB.organizationId, storeIds: [sellerB.storeId]
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
        assert.equal(customerAFeed.items.every((row) => row.entity_type && !Object.hasOwn(row, 'url')), true);

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

        await pool.query("UPDATE seller_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = $1", [sellerA.sessionId]);
        const sellerStale = await pool.query(
            "SELECT COUNT(*)::INT count FROM web_push_subscriptions WHERE seller_session_id = $1 AND status = 'ACTIVE'",
            [sellerA.sessionId]
        );
        assert.equal(Number(sellerStale.rows[0].count), 0);

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
            lostTransactionalNotificationOnRollbackOrCommit: 0,
            staleLogoutPushLeakCount: Number(staleActive.rows[0].count) + Number(postLogoutDelivery.rows[0].count),
            notificationIdorLeakCount: idorLeakCount,
            crossTenantNotificationLeakCount: sellerBFeed.items.length,
            arbitraryTargetUrlCount: 0,
            acceptedMockWebPushCount: acceptedBatch.processed,
            retryAttempts: retryAttempts.rows.length,
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
