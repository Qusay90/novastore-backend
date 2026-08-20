'use strict';

const assert = require('node:assert/strict');
const { requireSellerStepUp, SellerSessionError } = require('../services/sellerSessionService');

;(async () => {
    const input = { challengeId: 'challenge-1', sessionId: 'session-1', organizationId: 11, membershipId: 21, action: 'team.member.revoke', targetType: 'membership', targetId: '41' };
    const verified = await requireSellerStepUp({ query: async () => ({ rows: [{ id: 'challenge-1', status: 'verified', expires_at: new Date(Date.now() + 60000) }] }) }, input);
    assert.equal(verified.verified, true);
    await assert.rejects(
        () => requireSellerStepUp({ query: async () => ({ rows: [{ id: 'challenge-1', status: 'verified', expires_at: new Date(Date.now() - 1) }] }) }, input),
        (error) => error instanceof SellerSessionError && error.code === 'STEP_UP_EXPIRED'
    );
    await assert.rejects(
        () => requireSellerStepUp({ query: async () => ({ rows: [] }) }, input),
        (error) => error.code === 'STEP_UP_REQUIRED'
    );
    console.log('sellerF1StepUpBindingSmoke: PASS');
})().catch((error) => { console.error('sellerF1StepUpBindingSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
