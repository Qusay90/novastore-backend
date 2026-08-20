'use strict';
const assert = require('node:assert/strict');
const invitationService = require('../services/sellerInvitationService');
const { PURPOSE, hash, purposeBoundHash, findPendingByPurposeHash } = invitationService;
;(async () => {
try {
    assert.equal(hash('a'.repeat(64)), 'a'.repeat(64));
    assert.throws(() => hash('token'));
    assert.notEqual(purposeBoundHash('long-enough-invitation-token'), 'long-enough-invitation-token');
    assert.throws(() => purposeBoundHash('short'));
    assert.equal(Object.hasOwn(invitationService, 'acceptInvitation'), false);
    const queryable = { query: async () => ({ rows: [{ id: 1, status: 'pending' }] }) };
    assert.equal(await findPendingByPurposeHash(queryable, { organizationId: 1, token: 'long-enough-invitation-token', purpose: 'other' }), null);
    assert.equal((await findPendingByPurposeHash(queryable, { organizationId: 1, token: 'long-enough-invitation-token', purpose: PURPOSE })).id, 1);
    console.log('sellerF1InvitationPersistenceSmoke: PASS');
} catch (error) { console.error('sellerF1InvitationPersistenceSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; }
})();
