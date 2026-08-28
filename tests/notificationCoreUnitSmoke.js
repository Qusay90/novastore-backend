'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

Object.assign(process.env, {
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_notification_core_20260828_test',
    DB_SSL: 'false',
    SUPABASE_USE_POOLER: 'false',
    SUPABASE_POOLER_HOST: '',
    SUPABASE_REGION: '',
    SUPABASE_PROJECT_REF: ''
});

const {
    EVENT,
    EVENT_POLICIES,
    NOTIFICATION_EVENT_TYPE_COUNT,
    getNotificationCopy,
    getNotificationEventPolicy
} = require('../services/notificationEventCatalog');
const {
    NotificationOutboxError,
    normalizePayload,
    sourceEventKey
} = require('../services/notificationOutboxService');
const {
    NOTIFICATION_ENTITY_TYPES,
    NotificationTargetError,
    normalizeNotificationTarget
} = require('../services/notificationTargetService');
const {
    MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_ACCOUNT,
    MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_SESSION,
    MAX_WEB_PUSH_SUBSCRIPTION_ROWS_PER_ACCOUNT,
    WEB_PUSH_PROVIDER_HOSTS,
    WebPushSubscriptionError,
    isApprovedWebPushProviderHost,
    normalizeEndpoint,
    normalizeSubscription
} = require('../services/webPushSubscriptionService');
const {
    buildWebPushPayload,
    classifyProviderError,
    publicWebPushConfiguration,
    resolveWebPushConfiguration
} = require('../services/webPushProviderService');

const rejectCode = (fn, ErrorType, code) => assert.throws(fn, (error) => (
    error instanceof ErrorType && error.code === code
));

const runServiceWorkerContract = async () => {
    const listeners = {};
    const navigations = [];
    const shown = [];
    const windowClient = {
        url: 'http://127.0.0.1:5050/#/hesabim',
        navigate: async (url) => { navigations.push(url); },
        focus: async () => true
    };
    const sandbox = {
        URL,
        self: {
            location: { origin: 'http://127.0.0.1:5050' },
            registration: {
                showNotification: async (title, options) => { shown.push({ title, options }); }
            },
            clients: {
                matchAll: async () => [windowClient],
                openWindow: async (url) => { navigations.push(url); }
            },
            addEventListener: (name, listener) => { listeners[name] = listener; }
        }
    };
    vm.runInNewContext(
        fs.readFileSync(path.join(__dirname, '..', 'frontend', 'novastore-notification-sw.js'), 'utf8'),
        sandbox,
        { filename: 'novastore-notification-sw.js' }
    );
    assert.deepEqual(Object.keys(listeners).sort(), ['notificationclick', 'push']);

    let pending;
    listeners.push({
        data: {
            json: () => ({
                notificationId: 17,
                recipientRole: 'customer',
                title: 'Siparişiniz güncellendi',
                body: 'Güvenli bildirim içeriği',
                url: 'https://attacker.invalid/steal',
                target: { entityType: 'order', entityId: 42, url: 'https://attacker.invalid/steal' }
            })
        },
        waitUntil: (promise) => { pending = promise; }
    });
    await pending;
    assert.equal(shown.length, 1);
    assert.equal(shown[0].options.data.target.entityType, 'order');
    assert.equal(Object.hasOwn(shown[0].options.data, 'url'), false);

    listeners.notificationclick({
        notification: {
            data: shown[0].options.data,
            close() {}
        },
        waitUntil: (promise) => { pending = promise; }
    });
    await pending;
    assert.equal(navigations.at(-1), 'http://127.0.0.1:5050/#/hesabim/siparisler/42');

    listeners.notificationclick({
        notification: {
            data: {
                recipientRole: 'admin',
                target: { entityType: 'order', entityId: 42 }
            },
            close() {}
        },
        waitUntil: (promise) => { pending = promise; }
    });
    await pending;
    assert.equal(
        navigations.at(-1),
        'http://127.0.0.1:5050/admin-commerce-pro-live.html#/orders?notificationTarget=order&notificationTargetId=42'
    );

    listeners.notificationclick({
        notification: {
            data: {
                recipientRole: 'customer',
                target: { entityType: 'https://attacker.invalid', entityId: 1 },
                url: 'https://attacker.invalid/steal'
            },
            close() {}
        },
        waitUntil: (promise) => { pending = promise; }
    });
    await pending;
    assert.equal(navigations.at(-1), 'http://127.0.0.1:5050/#/hesabim/bildirimler');
    assert.equal(navigations.some((url) => String(url).includes('attacker.invalid')), false);
};

const runWebClientContract = async () => {
    const moduleUrl = pathToFileURL(path.join(__dirname, '..', 'web-notifications', 'notificationClient.js')).href;
    const client = await import(moduleUrl);
    assert.equal(client.notificationClientContract.targetTypes.length, 10);
    assert.equal(client.resolveNotificationTarget({ entityType: 'order', entityId: 42 }, 'customer'), '#/hesabim/siparisler/42');
    assert.equal(client.resolveNotificationTarget({ entityType: 'order', entityId: 42, url: 'https://attacker.invalid' }, 'customer'), '#/hesabim/siparisler/42');
    assert.equal(
        client.resolveNotificationTarget({ entityType: 'order', entityId: 42 }, 'admin'),
        '/admin-commerce-pro-live.html#/orders?notificationTarget=order&notificationTargetId=42'
    );
    assert.equal(client.resolveNotificationTarget({ entityType: 'unknown', entityId: 42 }, 'customer'), null);

    const originalPushManager = globalThis.PushManager;
    globalThis.PushManager = class PushManager {};
    try {
        let permissionRequests = 0;
        let registered = 0;
        let subscribed = 0;
        const subscription = {
            endpoint: 'https://fcm.googleapis.com/fcm/send/local-unit-test',
            toJSON: () => ({
                endpoint: 'https://fcm.googleapis.com/fcm/send/local-unit-test',
                keys: { p256dh: 'A'.repeat(43), auth: 'B'.repeat(22) }
            }),
            unsubscribe: async () => true
        };
        let browserSubscription = null;
        const registration = {
            pushManager: {
                getSubscription: async () => browserSubscription,
                subscribe: async () => { subscribed += 1; browserSubscription = subscription; return subscription; }
            }
        };
        const navigatorRef = {
            serviceWorker: {
                register: async (serviceWorkerPath, options) => {
                    registered += 1;
                    assert.equal(serviceWorkerPath, '/novastore-notification-sw.js');
                    assert.deepEqual(options, { scope: '/' });
                    return registration;
                }
            }
        };
        const NotificationRef = {
            permission: 'default',
            requestPermission: async () => { permissionRequests += 1; NotificationRef.permission = 'granted'; return 'granted'; }
        };
        let serverEnabled = false;
        const api = {
            getConfig: async () => ({ configured: true, publicKey: 'BA'.repeat(44) }),
            getSubscriptionState: async () => ({ enabled: serverEnabled, activeDeviceCount: serverEnabled ? 1 : 0 }),
            registerSubscription: async (value) => { assert.equal(value.endpoint, subscription.endpoint); serverEnabled = true; },
            revokeSubscription: async ({ endpoint }) => { assert.equal(endpoint, subscription.endpoint); serverEnabled = false; }
        };
        const controller = client.createWebPushController({ api, navigatorRef, NotificationRef });
        const initial = await controller.getState();
        assert.equal(initial.state, client.WEB_PUSH_STATE.NOT_REQUESTED);
        assert.equal(permissionRequests, 0, 'permission must not be requested during passive state read');
        const enabled = await controller.enable();
        assert.equal(enabled.state, client.WEB_PUSH_STATE.ENABLED);
        assert.equal(permissionRequests, 1, 'permission is requested only by the explicit enable action');
        assert.equal(subscribed, 1);
        assert.ok(registered >= 2);
        const disabled = await controller.disable();
        assert.equal(disabled.state, client.WEB_PUSH_STATE.UNSUBSCRIBED);
    } finally {
        if (originalPushManager === undefined) delete globalThis.PushManager;
        else globalThis.PushManager = originalPushManager;
    }
};

(async () => {
    const customerRuntimeSource = fs.readFileSync(
        path.join(__dirname, '..', 'storefront-commerce-pro', 'src', 'IntegratedApp.jsx'),
        'utf8'
    );
    assert.match(customerRuntimeSource, /\bBell,\s*\n\s*CaretDown,/);
    assert.match(customerRuntimeSource, /window\.addEventListener\("hashchange", handleRouteChange\)/);
    assert.match(customerRuntimeSource, /"account",[\s\S]*allowEmptyCatalog: isPublicStoreRoute \|\| catalogOptionalRoute/);

    assert.equal(NOTIFICATION_EVENT_TYPE_COUNT, 25);
    assert.equal(Object.keys(EVENT_POLICIES).length, 25);
    assert.equal(Object.keys(EVENT).length, 25);
    assert.equal(getNotificationEventPolicy('order_created').targetType, 'order');
    assert.equal(getNotificationCopy('ORDER_CREATED', 'customer').title, 'Siparişiniz alındı');
    rejectCode(() => getNotificationEventPolicy('CLIENT_SELECTED_EVENT'), TypeError, 'NOTIFICATION_EVENT_TYPE_REJECTED');

    assert.equal(NOTIFICATION_ENTITY_TYPES.length, 10);
    assert.deepEqual(normalizeNotificationTarget({ entityType: 'order', entityId: 12 }), {
        entityType: 'order', entityId: 12
    });
    rejectCode(
        () => normalizeNotificationTarget({ entityType: 'order', entityId: 12, url: 'https://attacker.invalid' }),
        NotificationTargetError,
        'NOTIFICATION_TARGET_FIELD_REJECTED'
    );
    rejectCode(
        () => normalizeNotificationTarget({ entityType: 'unknown', entityId: 12 }),
        NotificationTargetError,
        'NOTIFICATION_TARGET_TYPE_REJECTED'
    );

    assert.deepEqual(normalizePayload({ reasonCode: 'STATUS_CHANGED', metadata: { revision: 2 } }), {
        reasonCode: 'STATUS_CHANGED', metadata: { revision: 2 }
    });
    rejectCode(() => normalizePayload({ recipientIds: [1] }), NotificationOutboxError, 'NOTIFICATION_OUTBOX_AUTHORITY_FIELD_REJECTED');
    rejectCode(() => normalizePayload({ nested: { target_url: 'https://attacker.invalid' } }), NotificationOutboxError, 'NOTIFICATION_OUTBOX_AUTHORITY_FIELD_REJECTED');
    assert.equal(sourceEventKey({
        eventType: 'ORDER_CREATED', aggregateType: 'order', aggregateId: '12', aggregateRevision: 3
    }), 'ORDER_CREATED:order:12:r3');

    assert.deepEqual(WEB_PUSH_PROVIDER_HOSTS, [
        'fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'
    ]);
    assert.equal(MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_SESSION, 5);
    assert.equal(MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_ACCOUNT, 20);
    assert.equal(MAX_WEB_PUSH_SUBSCRIPTION_ROWS_PER_ACCOUNT, 100);
    assert.equal(isApprovedWebPushProviderHost('wns2-db5p.notify.windows.com'), true);
    assert.equal(isApprovedWebPushProviderHost('internal.example.test'), false);
    assert.equal(normalizeEndpoint('https://fcm.googleapis.com/fcm/send/unit-test'), 'https://fcm.googleapis.com/fcm/send/unit-test');
    rejectCode(() => normalizeEndpoint('https://127.0.0.1/push'), WebPushSubscriptionError, 'WEB_PUSH_PROVIDER_HOST_REJECTED');
    rejectCode(() => normalizeEndpoint('https://attacker.invalid/push'), WebPushSubscriptionError, 'WEB_PUSH_PROVIDER_HOST_REJECTED');
    const normalizedSubscription = normalizeSubscription({
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/unit-test',
        keys: { p256dh: 'A'.repeat(43), auth: 'B'.repeat(22) }
    });
    assert.equal(normalizedSubscription.endpointHash.length, 64);

    const completeConfig = resolveWebPushConfiguration({
        VAPID_PUBLIC_KEY: 'public-test-key',
        VAPID_PRIVATE_KEY: 'private-test-key',
        WEB_PUSH_SUBJECT: 'mailto:notifications@example.test'
    });
    assert.equal(completeConfig.configured, true);
    const publicConfig = publicWebPushConfiguration({
        VAPID_PUBLIC_KEY: 'public-test-key',
        VAPID_PRIVATE_KEY: 'private-test-key',
        WEB_PUSH_SUBJECT: 'mailto:notifications@example.test'
    });
    assert.deepEqual(publicConfig, { supported: true, configured: true, publicKey: 'public-test-key' });
    assert.equal(JSON.stringify(publicConfig).includes('private-test-key'), false);

    const payload = buildWebPushPayload({
        id: 9,
        recipient_role: 'admin',
        type: 'ORDER_CREATED',
        category: 'ORDER',
        priority: 'HIGH',
        title: 'Yeni sipariş',
        message: 'Yeni sipariş var.',
        entity_type: 'order',
        entity_id: 77,
        entity_key: null,
        url: 'https://attacker.invalid'
    });
    assert.equal(payload.recipientRole, 'admin');
    assert.deepEqual(payload.target, { entityType: 'order', entityId: 77 });
    assert.equal(Object.hasOwn(payload, 'url'), false);
    assert.equal(classifyProviderError({ statusCode: 410 }).invalidSubscription, true);
    assert.equal(classifyProviderError({ statusCode: 503 }).retryable, true);
    assert.equal(classifyProviderError({ statusCode: 400 }).retryable, false);

    await runWebClientContract();
    await runServiceWorkerContract();
    console.log('notification core unit smoke passed: 25 events, 10 targets, explicit push consent, safe routes, provider allowlist');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
