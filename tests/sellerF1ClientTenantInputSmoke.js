'use strict';

const assert = require('node:assert/strict');
const { createSellerTenantContextMiddleware } = require('../middlewares/sellerTenantContext');

const response = () => ({ statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

;(async () => {
    const serverContext = Object.freeze({ organizationId: 11, membershipId: 21, storeIds: Object.freeze([31]), permissions: Object.freeze(['team.read']) });
    const middleware = createSellerTenantContextMiddleware({ resolveContext: async () => serverContext, requirePermission: (context, permission) => { assert.equal(context, serverContext); assert.equal(permission, 'team.read'); } });
    const req = { query: { organization_id: '999', store_id: '998', role: 'owner' }, body: { owner_user_id: 1 }, headers: { 'x-organization-id': '997' }, sellerSession: { organizationId: 11 } };
    let nextCalled = false;
    await middleware.resolveServerTenantContext(req, response(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.sellerContext.organizationId, 11);
    middleware.requireSellerPermission('team.read')(req, response(), () => { nextCalled = true; });
    console.log('sellerF1ClientTenantInputSmoke: PASS');
})().catch((error) => { console.error('sellerF1ClientTenantInputSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
