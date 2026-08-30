'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

Object.assign(process.env, {
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_notification_r2_20260830_test',
    DB_SSL: 'false',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: ''
});

const {
    SELLER_NOTIFICATION_EVENT_AUTHORITY,
    SELLER_SUPPORTED_EVENT_TYPES,
    SELLER_SUPPORTED_TYPED_TARGETS,
    SellerNotificationAuthorizationError,
    allowedSellerNotificationEventTypes,
    authorizeSellerPrivateDelivery,
    getSellerNotificationEventAuthority,
    isSellerNotificationEventAllowed
} = require('../services/sellerNotificationAuthorizationService');
const {
    getUnreadCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    normalizeScope,
    scopeSql
} = require('../services/notificationReadService');
const { loadLiveSellerSession, SellerSessionError } = require('../services/sellerSessionService');
const { createSellerNotificationRouter } = require('../routes/sellerNotificationRoutes');

const SELLER_SESSION_ID = '11111111-1111-4111-8111-111111111111';

const liveSellerDatabase = () => {
    const transactionEvents = [];
    const notificationQueries = [];
    const client = {
        async query(sql, values = []) {
            const text = String(sql).trim();
            if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
                transactionEvents.push(text);
                return { rows: [] };
            }
            if (/FROM seller_sessions seller_session/u.test(text)) {
                assert.match(text, /user_row\.auth_enabled = TRUE/u);
                assert.match(text, /FOR SHARE OF seller_session, membership, organization, role_row, user_row/u);
                assert.deepEqual(values, [SELLER_SESSION_ID, 7, 17]);
                return {
                    rows: [{
                        session_id: SELLER_SESSION_ID,
                        user_id: 7,
                        organization_id: 17,
                        membership_id: 19,
                        role_id: 29,
                        membership_revision: 3,
                        security_stamp: 'live-stamp'
                    }]
                };
            }
            if (/SELECT permission\.code AS permission_code/u.test(text)) {
                assert.match(text, /permission\.is_active = TRUE/u);
                assert.match(text, /FOR SHARE OF role_permission, permission/u);
                assert.deepEqual(values, [29]);
                return { rows: [{ permission_code: 'order.read' }] };
            }
            if (/SELECT store_scope\.store_id/u.test(text)) {
                assert.match(text, /store_scope\.revoked_at IS NULL/u);
                assert.match(text, /seller_store\.status = 'active'/u);
                assert.match(text, /FOR SHARE OF store_scope, seller_store/u);
                assert.deepEqual(values, [17, 19]);
                return { rows: [{ store_id: 27 }] };
            }
            if (/\b(?:FROM|UPDATE) notifications\b/u.test(text)) {
                notificationQueries.push(Object.freeze({ text, values: structuredClone(values) }));
                if (/COUNT\(\*\)::INT AS unread_count/u.test(text)) return { rows: [{ unread_count: 2 }] };
                if (/UPDATE notifications/u.test(text) && /RETURNING id, type/u.test(text)) {
                    return { rows: [{ id: 44, type: 'ORDER_CONFIRMED', created_at: new Date(), updated_at: new Date() }] };
                }
                if (/UPDATE notifications/u.test(text)) return { rows: [{ id: 44 }] };
                return { rows: [] };
            }
            throw new Error(`Unexpected Seller notification unit query: ${text}`);
        },
        release() {
            transactionEvents.push('RELEASE');
        }
    };
    return Object.freeze({
        database: Object.freeze({
            async connect() { return client; },
            async query() { throw new Error('Seller reads must use their locked transaction client.'); }
        }),
        notificationQueries,
        transactionEvents
    });
};

(async () => {
    assert.deepEqual(SELLER_SUPPORTED_EVENT_TYPES, [
        'SELLER_APPLICATION_STATUS_CHANGED',
        'ORDER_CONFIRMED',
        'ORDER_CANCEL_REQUESTED',
        'CANCELLATION_RESULT',
        'REFUND_STATUS_CHANGED',
        'RETURN_REQUESTED',
        'RETURN_STATUS_CHANGED',
        'QUESTION_CREATED',
        'REVIEW_CREATED'
    ]);
    assert.deepEqual(SELLER_SUPPORTED_TYPED_TARGETS, [
        'seller_application',
        'order',
        'return_request',
        'product_question',
        'review'
    ]);
    assert.deepEqual(SELLER_NOTIFICATION_EVENT_AUTHORITY.ORDER_CONFIRMED, {
        permission: 'order.read',
        targetType: 'order'
    });
    assert.deepEqual(SELLER_NOTIFICATION_EVENT_AUTHORITY.RETURN_STATUS_CHANGED, {
        permission: 'return.read',
        targetType: 'return_request'
    });
    assert.deepEqual(SELLER_NOTIFICATION_EVENT_AUTHORITY.REFUND_STATUS_CHANGED, {
        permission: 'finance.read',
        targetType: 'order'
    });
    assert.deepEqual(SELLER_NOTIFICATION_EVENT_AUTHORITY.QUESTION_CREATED, {
        permission: 'offer.read',
        targetType: 'product_question'
    });
    assert.deepEqual(SELLER_NOTIFICATION_EVENT_AUTHORITY.REVIEW_CREATED, {
        permission: 'offer.read',
        targetType: 'review'
    });
    assert.equal(getSellerNotificationEventAuthority('support_message'), null);
    assert.equal(isSellerNotificationEventAllowed('ORDER_CONFIRMED', ['order.read']), true);
    assert.equal(isSellerNotificationEventAllowed('ORDER_CONFIRMED', ['store.read']), false);
    assert.equal(isSellerNotificationEventAllowed('UNKNOWN_EVENT', ['order.read']), false);

    assert.deepEqual(allowedSellerNotificationEventTypes(['order.read', 'return.read']), [
        'ORDER_CONFIRMED',
        'ORDER_CANCEL_REQUESTED',
        'CANCELLATION_RESULT',
        'RETURN_REQUESTED',
        'RETURN_STATUS_CHANGED'
    ]);
    assert.deepEqual(allowedSellerNotificationEventTypes(['unknown.permission']), []);

    const sellerScope = normalizeScope({
        userId: 7,
        role: 'seller',
        organizationId: 17,
        storeIds: [27],
        permissions: ['order.read']
    });
    const sellerSql = scopeSql(sellerScope, 2);
    assert.match(sellerSql.clause, /type = ANY\(\$5::VARCHAR\[\]\)/u);
    assert.deepEqual(sellerSql.values, [
        7,
        17,
        [27],
        ['ORDER_CONFIRMED', 'ORDER_CANCEL_REQUESTED', 'CANCELLATION_RESULT']
    ]);
    assert.deepEqual(normalizeScope({
        userId: 7,
        role: 'seller',
        organizationId: 17,
        storeIds: [27]
    }).allowedEventTypes, []);

    const untrustedSellerScope = Object.freeze({
        sessionId: SELLER_SESSION_ID,
        userId: 7,
        role: 'seller',
        organizationId: 17,
        membershipId: 19,
        storeIds: Object.freeze([999]),
        permissions: Object.freeze(['finance.read'])
    });
    const authoritativeEventTypes = [
        'ORDER_CONFIRMED',
        'ORDER_CANCEL_REQUESTED',
        'CANCELLATION_RESULT'
    ];
    const readCases = [
        {
            run: (database) => listNotifications(database, untrustedSellerScope, { limit: 20 }),
            expectedValues: [7, 17, [27], authoritativeEventTypes, null, null, 21]
        },
        {
            run: (database) => getUnreadCount(database, untrustedSellerScope),
            expectedValues: [7, 17, [27], authoritativeEventTypes]
        },
        {
            run: (database) => markNotificationRead(database, untrustedSellerScope, 44),
            expectedValues: [44, 7, 17, [27], authoritativeEventTypes]
        },
        {
            run: (database) => markAllNotificationsRead(database, untrustedSellerScope),
            expectedValues: [7, 17, [27], authoritativeEventTypes]
        }
    ];
    for (const readCase of readCases) {
        const harness = liveSellerDatabase();
        await readCase.run(harness.database);
        assert.deepEqual(harness.notificationQueries.map((entry) => entry.values), [readCase.expectedValues]);
        assert.deepEqual(harness.transactionEvents, ['BEGIN', 'COMMIT', 'RELEASE']);
    }

    const disabledSessionRow = {
        session_id: 'session-1',
        user_id: 7,
        organization_id: 17,
        membership_id: 19,
        role_id: 29,
        session_status: 'active',
        session_expires_at: new Date(Date.now() + 60_000),
        session_membership_revision: 3,
        session_security_stamp: 'live-stamp',
        membership_status: 'active',
        membership_revision: 3,
        security_stamp: 'live-stamp',
        organization_status: 'active',
        auth_enabled: false
    };
    await assert.rejects(
        loadLiveSellerSession({ query: async () => ({ rows: [disabledSessionRow] }) }, { sessionId: 'session-1', userId: 7 }),
        (error) => error instanceof SellerSessionError && error.code === 'SELLER_SESSION_REVOKED'
    );

    await assert.rejects(
        authorizeSellerPrivateDelivery({ query: async () => ({ rows: [] }) }, {
            notification_id: 1,
            notification_user_id: 7,
            notification_recipient_role: 'seller',
            notification_organization_id: 17,
            notification_store_id: 27,
            type: 'ORDER_CONFIRMED',
            entity_type: 'order',
            entity_id: 37,
            endpoint_user_id: 8,
            endpoint_recipient_role: 'seller',
            endpoint_organization_id: 17,
            endpoint_seller_session_id: '11111111-1111-4111-8111-111111111111',
            endpoint_application: 'SELLER_ANDROID'
        }, { channel: 'ANDROID_PUSH' }),
        (error) => error instanceof SellerNotificationAuthorizationError
            && error.code === 'SELLER_NOTIFICATION_TARGET_NOT_FOUND'
            && error.statusCode === 404
    );

    const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'sellerNotificationAuthorizationService.js'), 'utf8');
    const androidDeliverySource = fs.readFileSync(path.join(__dirname, '..', 'services', 'androidPushDeliveryService.js'), 'utf8');
    const webDeliverySource = fs.readFileSync(path.join(__dirname, '..', 'services', 'notificationDeliveryService.js'), 'utf8');
    const sellerSessionSource = fs.readFileSync(path.join(__dirname, '..', 'services', 'sellerSessionService.js'), 'utf8');
    const notificationControllerSource = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'notificationController.js'), 'utf8');
    const routesSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'sellerNotificationRoutes.js'), 'utf8');
    assert.equal(/\burl\b/iu.test(serviceSource), false, 'Seller target resolver must not emit or accept URLs');
    assert.match(androidDeliverySource, /authorizeSellerPrivateDelivery\(client, row, \{ channel: 'ANDROID_PUSH' \}\)/u);
    assert.match(webDeliverySource, /authorizeSellerPrivateDelivery\(client, row, \{ channel: 'WEB_PUSH' \}\)/u);
    assert.match(sellerSessionSource, /JOIN users user_row ON user_row\.id = session\.user_id AND user_row\.auth_enabled = TRUE/u);
    assert.match(notificationControllerSource, /sessionId: String\(req\.sellerContext\.sessionId\)[\s\S]*membershipId: Number\(req\.sellerContext\.membershipId\)/u);
    const controllerSellerScope = notificationControllerSource.match(/const currentSellerScope = \(req\) => Object\.freeze\(\{[\s\S]*?\n\}\);/u)?.[0] || '';
    assert.doesNotMatch(controllerSellerScope, /storeIds|permissions/u, 'Seller feed controller must pass identity, not cached authorization scope');
    assert.match(routesSource, /router\.get\('\/notifications\/:id\/target', \.\.\.guarded, controller\.getSellerNotificationTarget\)/u);
    assert.match(routesSource, /const guarded = \[\s*privateNoStore,/u);

    const noStoreApp = express();
    noStoreApp.use('/api/seller/v1', createSellerNotificationRouter({
        enabled: true,
        auth: {
            sellerAudienceAuthenticate: (_req, res) => res.status(401).json({ code: 'AUTH_REQUIRED' }),
            requireLiveSellerSession: (_req, res) => res.status(401).json({ code: 'SELLER_SESSION_REVOKED' })
        },
        tenant: {
            resolveServerTenantContext: (_req, res) => res.status(403).json({ code: 'NO_ACTIVE_MEMBERSHIP' })
        }
    }));
    const noStoreServer = http.createServer(noStoreApp);
    try {
        await new Promise((resolve) => noStoreServer.listen(0, '127.0.0.1', resolve));
        const noStoreResponse = await fetch(`http://127.0.0.1:${noStoreServer.address().port}/api/seller/v1/notifications`);
        assert.equal(noStoreResponse.status, 401);
        assert.equal(noStoreResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
        assert.equal(noStoreResponse.headers.get('pragma'), 'no-cache');
    } finally {
        await new Promise((resolve) => noStoreServer.close(resolve));
    }

    console.log('Seller notification authorization unit smoke passed: 9 events, 5 targets, live locked consumption scope, fail-closed account and permissions, final delivery hooks');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
