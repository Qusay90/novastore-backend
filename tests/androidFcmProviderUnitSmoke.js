'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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
    AndroidPushEndpointError,
    MAX_ACTIVE_ANDROID_ENDPOINTS_PER_ACCOUNT,
    MAX_ACTIVE_ANDROID_ENDPOINTS_PER_SESSION,
    MAX_ANDROID_ENDPOINT_ROWS_PER_ACCOUNT,
    normalizeRegistration,
    normalizeRevocation,
    normalizeSessionRevocation,
    regularAndroidBinding,
    sellerAndroidBinding
} = require('../services/androidPushEndpointService');
const {
    AndroidPushProviderError,
    FCM_API_ORIGIN,
    GOOGLE_OAUTH_TOKEN_URL,
    buildAndroidPushPayload,
    buildFcmHttpV1Message,
    classifyFcmResponseError,
    classifyTransportError,
    createFcmHttpV1Provider,
    createServiceAccountJwt,
    publicFcmConfiguration,
    resolveFcmConfiguration
} = require('../services/androidPushProviderService');

const TOKEN = 'customer-fcm-token-unit-0001';
const INSTALLATION_ID = '11111111-1111-4111-8111-111111111111';
const PREDECESSOR = 'customer-fcm-token-unit-0000';

const expectCode = (fn, ErrorType, code) => assert.throws(fn, (error) => (
    error instanceof ErrorType && error.code === code
));

const response = (status, value) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value)
});

(async () => {
    assert.equal(MAX_ACTIVE_ANDROID_ENDPOINTS_PER_SESSION, 5);
    assert.equal(MAX_ACTIVE_ANDROID_ENDPOINTS_PER_ACCOUNT, 20);
    assert.equal(MAX_ANDROID_ENDPOINT_ROWS_PER_ACCOUNT, 100);

    assert.deepEqual(normalizeRegistration({
        token: TOKEN,
        platform: 'android',
        installationId: INSTALLATION_ID,
        rotationPredecessor: PREDECESSOR
    }), {
        token: TOKEN,
        tokenHash: crypto.createHash('sha256').update(TOKEN).digest('hex'),
        installationId: INSTALLATION_ID,
        rotationPredecessor: PREDECESSOR,
        rotationPredecessorHash: crypto.createHash('sha256').update(PREDECESSOR).digest('hex')
    });
    assert.equal(normalizeRevocation({ token: TOKEN, installationId: INSTALLATION_ID }).installationId, INSTALLATION_ID);
    assert.equal(normalizeSessionRevocation({ installationId: INSTALLATION_ID }).installationId, INSTALLATION_ID);
    expectCode(
        () => normalizeRegistration({ token: TOKEN, platform: 'android', installationId: INSTALLATION_ID, userId: 999 }),
        AndroidPushEndpointError,
        'ANDROID_FCM_FIELD_REJECTED'
    );
    expectCode(
        () => normalizeRegistration({ token: TOKEN, platform: 'ios', installationId: INSTALLATION_ID }),
        AndroidPushEndpointError,
        'ANDROID_PLATFORM_INVALID'
    );
    expectCode(
        () => normalizeRegistration({ token: 'token with spaces 12345', platform: 'android', installationId: INSTALLATION_ID }),
        AndroidPushEndpointError,
        'ANDROID_FCM_TOKEN_INVALID'
    );

    assert.deepEqual(regularAndroidBinding({
        user: { id: 7, principal: 'customer' },
        auth: { session: { id: 71 } }
    }), {
        userId: 7,
        role: 'customer',
        organizationId: null,
        authSessionId: 71,
        sellerSessionId: null,
        application: 'CUSTOMER_ANDROID'
    });
    expectCode(
        () => regularAndroidBinding({ user: { id: 7, principal: 'admin' }, auth: { session: { id: 71 } } }),
        AndroidPushEndpointError,
        'ANDROID_CUSTOMER_REQUIRED'
    );
    assert.deepEqual(sellerAndroidBinding({
        sellerContext: { userId: 8, organizationId: 81 },
        sellerSession: { sessionId: '22222222-2222-4222-8222-222222222222' }
    }), {
        userId: 8,
        role: 'seller',
        organizationId: 81,
        authSessionId: null,
        sellerSessionId: '22222222-2222-4222-8222-222222222222',
        application: 'SELLER_ANDROID'
    });

    const missing = resolveFcmConfiguration({});
    assert.equal(missing.configured, false);
    assert.deepEqual(publicFcmConfiguration({}), {
        provider: 'FCM_HTTP_V1',
        configured: false,
        projectIdConfigured: false,
        clientEmailConfigured: false,
        privateKeyConfigured: false
    });
    const missingProvider = createFcmHttpV1Provider({ env: {} });
    assert.equal(missingProvider.configured, false);
    await assert.rejects(missingProvider.send({}), (error) => (
        error instanceof AndroidPushProviderError && error.code === 'FCM_CONFIGURATION_REQUIRED'
    ));

    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const env = {
        FIREBASE_PROJECT_ID: 'novastore-test-123',
        FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-test@novastore-test-123.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: privateKeyPem,
        FCM_REQUEST_TIMEOUT_MS: '2500'
    };
    const config = resolveFcmConfiguration(env);
    assert.equal(config.configured, true);
    assert.equal(config.timeoutMs, 2500);
    assert.equal(JSON.stringify(publicFcmConfiguration(env)).includes(String(privateKeyPem)), false);
    const jwt = createServiceAccountJwt({ config, nowSeconds: 1_800_000_000 });
    assert.equal(jwt.split('.').length, 3);

    const notification = {
        id: 42,
        recipient_role: 'customer',
        type: 'ORDER_STATUS_CHANGED',
        category: 'ORDER',
        priority: 'HIGH',
        title: 'Sipariş durumu güncellendi',
        message: 'Siparişinizin durumu güncellendi.',
        entity_type: 'order',
        entity_id: 77,
        entity_key: null,
        url: 'https://attacker.invalid/steal',
        recipient_id: 999,
        authToken: 'must-not-leak',
        address: 'must-not-leak',
        payment: 'must-not-leak'
    };
    const payload = buildAndroidPushPayload(notification);
    assert.deepEqual(payload.target, { entityType: 'order', entityId: 77 });
    assert.equal(Object.hasOwn(payload, 'url'), false);
    assert.equal(Object.hasOwn(payload, 'recipient_id'), false);
    const message = buildFcmHttpV1Message({ endpoint: { token: TOKEN }, notification });
    assert.equal(message.message.token, TOKEN);
    assert.deepEqual(JSON.parse(message.message.data.target), { entityType: 'order', entityId: 77 });
    const serializedMessage = JSON.stringify(message);
    for (const forbidden of ['attacker.invalid', 'must-not-leak', 'recipient_id', 'authToken', 'address', 'payment']) {
        assert.equal(serializedMessage.includes(forbidden), false, `${forbidden} must not enter FCM payload`);
    }

    let oauthCalls = 0;
    let fcmCalls = 0;
    const outboundActions = [];
    const fetchImpl = async (url, options) => {
        if (url === GOOGLE_OAUTH_TOKEN_URL) {
            oauthCalls += 1;
            assert.equal(options.method, 'POST');
            assert.match(String(options.body), /^grant_type=/u);
            return response(200, { access_token: 'unit-oauth-access-token', expires_in: 3600 });
        }
        assert.equal(url, `${FCM_API_ORIGIN}/v1/projects/novastore-test-123/messages:send`);
        fcmCalls += 1;
        assert.equal(options.headers.authorization, 'Bearer unit-oauth-access-token');
        const body = JSON.parse(options.body);
        assert.equal(body.message.token, TOKEN);
        return response(200, { name: `projects/novastore-test-123/messages/unit-${fcmCalls}` });
    };
    const provider = createFcmHttpV1Provider({
        env,
        fetchImpl,
        assertOutboundAllowed: (action) => outboundActions.push(action),
        now: () => 1_800_000_000_000
    });
    assert.equal(provider.configured, true);
    const acceptedOne = await provider.send({ endpoint: { token: TOKEN }, notification });
    const acceptedTwo = await provider.send({ endpoint: { token: TOKEN }, notification });
    assert.equal(acceptedOne.accepted, true);
    assert.equal(acceptedTwo.accepted, true);
    assert.equal(oauthCalls, 1, 'OAuth token must be safely cached');
    assert.equal(fcmCalls, 2);
    assert.deepEqual(outboundActions, ['outbound_notification', 'outbound_notification']);

    const unregistered = classifyFcmResponseError({
        statusCode: 404,
        body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }
    });
    assert.equal(unregistered.invalidEndpoint, true);
    assert.equal(unregistered.retryable, false);
    assert.equal(classifyFcmResponseError({ statusCode: 429, body: {} }).retryable, true);
    assert.equal(classifyFcmResponseError({ statusCode: 503, body: {} }).retryable, true);
    assert.equal(classifyFcmResponseError({ statusCode: 401, body: {} }).code, 'FCM_CREDENTIAL_REJECTED');
    assert.equal(classifyTransportError({ name: 'AbortError' }).code, 'FCM_PROVIDER_TIMEOUT');
    assert.equal(classifyTransportError({ code: 'ECONNRESET' }).retryable, true);

    const customerRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'notificationRoutes.js'), 'utf8');
    assert.match(customerRoutes, /router\.post\('\/android-push\/tokens', authenticate, requireCurrentAdminIfClaimed, controller\.registerAndroidPushToken\)/u);
    assert.match(customerRoutes, /router\.delete\('\/android-push\/tokens', authenticate, requireCurrentAdminIfClaimed, controller\.revokeAndroidPushToken\)/u);
    assert.match(customerRoutes, /router\.delete\('\/android-push\/tokens\/session', authenticate, requireCurrentAdminIfClaimed, controller\.revokeAndroidPushSession\)/u);
    const sellerRoutes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'sellerNotificationRoutes.js'), 'utf8');
    assert.match(sellerRoutes, /router\.post\('\/notifications\/android-push\/tokens', \.\.\.guarded, controller\.registerSellerAndroidPushToken\)/u);
    assert.match(sellerRoutes, /sellerAudienceAuthenticate,[\s\S]*requireLiveSellerSession,[\s\S]*resolveServerTenantContext/u);
    const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(serverSource, /app\.use\('\/api\/notifications', notificationRoutes\)/u);
    assert.match(serverSource, /app\.use\('\/api\/seller\/v1', sellerApiRouter\)/u);
    assert.match(serverSource, /sellerApiRouter\.use\(createSellerNotificationRouter\(\{ enabled: true, auth, tenant \}\)\)/u);
    assert.match(serverSource, /await assertRuntimeDatabaseIdentity\([\s\S]*?configureSellerRoutes\(\)/u);

    console.log('Android FCM provider unit smoke passed: strict endpoint contract, HTTP v1 auth, safe typed payload, failure classes, guarded routes');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
