'use strict';

const assert = require('node:assert/strict');
const { createSellerAuthMiddleware } = require('../middlewares/sellerAuthMiddleware');

const response = () => ({ statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

;(async () => {
    const seller = createSellerAuthMiddleware({ verifyAccessToken: async () => ({ aud: 'seller', iss: 'seller-issuer', sid: 'session-1', sub: '101' }) });
    const req = { headers: { authorization: 'Bearer opaque-seller-token' } };
    let nextCalled = false;
    await seller.sellerAudienceAuthenticate(req, response(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.deepEqual(req.sellerPrincipal, { sessionId: 'session-1', userId: 101, issuer: 'seller-issuer', audience: 'seller' });
    const customer = createSellerAuthMiddleware({ verifyAccessToken: async () => ({ aud: 'customer', iss: 'seller-issuer', sid: 'session-1', sub: '101' }) });
    const rejected = response();
    await customer.sellerAudienceAuthenticate({ headers: { authorization: 'Bearer customer-token' } }, rejected, () => assert.fail('customer token must not pass'));
    assert.deepEqual(rejected, { statusCode: 401, body: { code: 'SELLER_AUDIENCE_REQUIRED', error: 'SELLER_AUDIENCE_REQUIRED' }, status: rejected.status, json: rejected.json });
    console.log('sellerF1AudienceIsolationSmoke: PASS');
})().catch((error) => { console.error('sellerF1AudienceIsolationSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
