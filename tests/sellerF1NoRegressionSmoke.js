'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

;(async () => {
    const server = fs.readFileSync('server.js', 'utf8');
    const route = fs.readFileSync('routes/sellerContextRoutes.js', 'utf8');
    const tenant = fs.readFileSync('services/sellerTenantContextService.js', 'utf8');
    const session = fs.readFileSync('services/sellerSessionService.js', 'utf8');
    assert.match(
        server,
        /const localSellerApiEnabled = String\(process\.env\.SELLER_API_V1_ENABLED \|\| ''\)\.toLowerCase\(\) === 'true' &&\s*String\(process\.env\.SELLER_API_V1_LOCAL_ONLY \|\| ''\)\.toLowerCase\(\) === 'true';/u
    );
    assert.match(server, /if \(localSellerApiEnabled\) \{\s*if \(!startupSafety\.safeLocalDatabase\) throw new Error\('Seller API local mode requires a named loopback database\.'\);/u);
    assert.match(server, /app\.use\('\/api\/seller\/v1', createSellerContextRouter\(\{ enabled: true, auth, tenant, controller: contextController \}\)\);/u);
    assert.doesNotMatch(route, /\/api\/admin|authMiddleware|socketAuthService/u);
    assert.doesNotMatch(tenant, /owner_user_id|products|orders|finance/u);
    assert.doesNotMatch(session, /controllers\/authController|JWT_SECRET|process\.env/u);
    assert.doesNotMatch(route, /router\.(?:post|patch|put|delete)\(/u);
    console.log('sellerF1NoRegressionSmoke: PASS');
})().catch((error) => { console.error('sellerF1NoRegressionSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
