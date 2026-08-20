'use strict';

const assert = require('node:assert/strict');
const { createSellerAuthMiddleware } = require('../middlewares/sellerAuthMiddleware');
const { createSellerTenantContextMiddleware } = require('../middlewares/sellerTenantContext');

const response = () => ({ headers: {}, statusCode: null, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

;(async () => {
    const order = [];
    const auth = createSellerAuthMiddleware({ verifyAccessToken: async () => ({ aud: 'seller', iss: 'seller-issuer', sid: 'session-1', sub: '101' }), loadSession: async () => { order.push('session'); return { sessionId: 'session-1', organizationId: 11, membershipId: 21, membershipRevision: 1, securityStamp: 'stamp' }; } });
    const tenant = createSellerTenantContextMiddleware({ resolveContext: async () => { order.push('tenant'); return { organizationId: 11, membershipId: 21, storeIds: [], permissions: [] }; }, requirePermission: () => { throw new Error('not used'); } });
    const req = { headers: { authorization: 'Bearer seller' }, app: { locals: { sellerDatabase: {} } } };
    const res = response();
    await auth.sellerAudienceAuthenticate(req, res, () => order.push('audience'));
    await auth.requireLiveSellerSession(req, res, () => order.push('live'));
    await tenant.resolveServerTenantContext(req, res, () => order.push('context'));
    assert.deepEqual(order, ['audience', 'session', 'live', 'tenant', 'context']);
    assert.equal(req.sellerContext.organizationId, 11);
    console.log('sellerF1TenantResolverSmoke: PASS');
})().catch((error) => { console.error('sellerF1TenantResolverSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
