'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

;(async () => {
    const server = fs.readFileSync('server.js', 'utf8');
    const route = fs.readFileSync('routes/sellerContextRoutes.js', 'utf8');
    const tenant = fs.readFileSync('services/sellerTenantContextService.js', 'utf8');
    const session = fs.readFileSync('services/sellerSessionService.js', 'utf8');
    const activation = fs.readFileSync('config/sellerApiActivationPolicy.js', 'utf8');
    const runtimeIdentity = fs.readFileSync('services/runtimeDatabaseIdentityService.js', 'utf8');
    const transport = fs.readFileSync('middlewares/sellerTransportSecurity.js', 'utf8');
    assert.match(server, /resolveSellerApiActivationPolicy\(\{/u);
    assert.match(server, /app\.use\('\/api\/seller\/v1', sellerApiRouter\);/u);
    assert.match(server, /sellerApiRouter\.use\(createSellerContextRouter\(\{ enabled: true, auth, tenant, controller: contextController \}\)\);/u);
    assert.ok(server.indexOf('await assertRuntimeDatabaseIdentity') < server.indexOf('configureSellerRoutes();'));
    assert.match(server, /sellerApiActivation\.requiresConnectedDatabaseIdentity \|\| stockyCommerceRuntime\.enabled/u);
    assert.match(server, /sellerApiActivation\.enabled \|\| stockyCommerceRuntime\.enabled[\s\S]*await applyLocalSellerMigrations\(\)/u);
    assert.match(server, /await prepareDatabase\(startupSafety, stockyCommerceRuntime\)/u);
    assert.ok(server.indexOf('await assertRuntimeDatabaseIdentity') < server.indexOf('startStockyOrderDeliveryWorker({'));
    assert.match(server, /stopStockyOrderDeliveryWorker\(\);[\s\S]*stopNotificationWorker\(\);/u);
    assert.ok(server.indexOf('configureSellerRoutes();') < server.indexOf('server.listen('));
    assert.match(activation, /SELLER_API_V1_ACTIVATION_MODE/u);
    assert.match(activation, /SELLER_API_V1_TRUSTED_INGRESS_CIDRS/u);
    assert.match(activation, /mode === 'production'.*nodeEnv !== 'production'/u);
    assert.match(runtimeIdentity, /current_database\(\) AS database, inet_server_port\(\) AS port/u);
    assert.match(transport, /trustedIngress && forwardedProto === 'https'/u);
    assert.doesNotMatch(route, /\/api\/admin|authMiddleware|socketAuthService/u);
    assert.doesNotMatch(tenant, /owner_user_id|products|orders|finance/u);
    assert.doesNotMatch(session, /controllers\/authController|JWT_SECRET|process\.env/u);
    assert.doesNotMatch(route, /router\.(?:post|patch|put|delete)\(/u);
    console.log('sellerF1NoRegressionSmoke: PASS');
})().catch((error) => { console.error('sellerF1NoRegressionSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
