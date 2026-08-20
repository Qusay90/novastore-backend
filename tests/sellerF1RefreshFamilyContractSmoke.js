'use strict';

const assert = require('node:assert/strict');
const {
    hashRefreshCredential,
    issueSellerSession,
    rotateRefreshCredential,
    SellerSessionError
} = require('../services/sellerSessionService');

const clientFor = (tokenStatus = 'active') => {
    const calls = [];
    const client = {
        calls,
        release() { calls.push(['release']); },
        async query(sql, params = []) {
            calls.push([sql, params]);
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM seller_refresh_tokens token')) return { rows: [{ token_id: 'token-1', family_id: 'family-1', generation: 3, token_status: tokenStatus, token_expires_at: new Date(Date.now() + 60000), session_id: 'session-1', current_generation: 3, family_status: 'active', family_expires_at: new Date(Date.now() + 60000), session_status: 'active', session_expires_at: new Date(Date.now() + 60000), session_membership_revision: 4, session_security_stamp: 'stamp-1', membership_status: 'active', membership_revision: 4, security_stamp: 'stamp-1', organization_status: 'active' }] };
            if (sql.includes("SET status = 'consumed'")) return { rows: tokenStatus === 'active' ? [{ id: 'token-1' }] : [] };
            if (sql.includes('SET current_generation')) return { rows: [{ id: 'family-1' }] };
            return { rows: [{ id: 'next-token' }] };
        }
    };
    return { client, database: { connect: async () => client } };
};

;(async () => {
    assert.match(hashRefreshCredential('opaque-one'), /^[a-f0-9]{64}$/u);
    assert.notEqual(hashRefreshCredential('opaque-one'), hashRefreshCredential('opaque-two'));
    const issuedClient = clientFor().client;
    const issued = await issueSellerSession(
        { connect: async () => issuedClient },
        {
            userId: 101,
            organizationId: 11,
            membershipId: 21,
            membershipRevision: 4,
            securityStamp: 'stamp-1',
            refreshCredential: 'opaque-login-refresh'
        }
    );
    const sessionInsert = issuedClient.calls.find(([sql]) => sql.includes('INSERT INTO seller_sessions'));
    const familyInsert = issuedClient.calls.find(([sql]) => sql.includes('INSERT INTO seller_refresh_token_families'));
    assert.equal(
        new Date(sessionInsert[1][8]).getTime(),
        new Date(familyInsert[1][4]).getTime(),
        'DB session must remain live for the refresh family lifetime'
    );
    assert.ok(new Date(issued.expiresAt).getTime() > Date.now() + 13 * 24 * 60 * 60 * 1000);
    assert.equal(
        issuedClient.calls.some(([sql]) => sql.includes('FROM seller_memberships') && sql.includes('user_id = $3')),
        true,
        'session issuance must bind the authenticated user to the exact membership'
    );
    const mismatchedMembershipClient = clientFor().client;
    const originalMismatchQuery = mismatchedMembershipClient.query;
    mismatchedMembershipClient.query = async (sql, params = []) => {
        if (sql.includes('FROM seller_memberships')) {
            mismatchedMembershipClient.calls.push([sql, params]);
            return { rows: [] };
        }
        return originalMismatchQuery(sql, params);
    };
    await assert.rejects(
        issueSellerSession(
            { connect: async () => mismatchedMembershipClient },
            {
                userId: 102,
                organizationId: 11,
                membershipId: 21,
                membershipRevision: 4,
                securityStamp: 'stamp-1',
                refreshCredential: 'opaque-mismatched-membership'
            }
        ),
        (error) => error instanceof SellerSessionError && error.code === 'NO_ACTIVE_MEMBERSHIP' && error.statusCode === 403
    );
    assert.equal(mismatchedMembershipClient.calls.some(([sql]) => sql.includes('INSERT INTO seller_sessions')), false);
    await assert.rejects(
        issueSellerSession(
            { connect: async () => issuedClient },
            {
                userId: 101,
                organizationId: 11,
                membershipId: 21,
                membershipRevision: 4,
                securityStamp: 'stamp-1',
                refreshCredential: 'opaque-misaligned-refresh',
                sessionExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
                familyExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            }
        ),
        (error) => error instanceof SellerSessionError && error.code === 'SELLER_SESSION_INPUT_INVALID'
    );
    const success = clientFor();
    const result = await rotateRefreshCredential(success.database, { presentedCredential: 'opaque-one', replacementCredential: 'opaque-two', nextTokenId: 'token-2' });
    assert.equal(result.generation, 4);
    assert.equal(success.client.calls.some(([, params = []]) => params.includes('opaque-one') || params.includes('opaque-two')), false);
    const replay = clientFor('consumed');
    await assert.rejects(
        () => rotateRefreshCredential(replay.database, { presentedCredential: 'old-token', replacementCredential: 'new-token' }),
        (error) => error instanceof SellerSessionError && error.code === 'REFRESH_TOKEN_REPLAY_DETECTED'
    );
    assert.equal(replay.client.calls.some(([sql]) => sql.includes("SET status = 'replayed'")), true);
    assert.equal(replay.client.calls.some(([sql]) => sql.includes("SET status = 'compromised'")), true);
    const stale = clientFor();
    const originalQuery = stale.client.query;
    stale.client.query = async (sql, params = []) => {
        const result = await originalQuery(sql, params);
        if (sql.includes('FROM seller_refresh_tokens token')) result.rows[0].membership_revision = 5;
        return result;
    };
    await assert.rejects(() => rotateRefreshCredential(stale.database, { presentedCredential: 'stale-token', replacementCredential: 'replacement-token' }), (error) => error.code === 'SELLER_SESSION_REVOKED');
    assert.equal(stale.client.calls.some(([sql]) => sql.includes("SET status = 'revoked'")), true);
    console.log('sellerF1RefreshFamilyContractSmoke: PASS');
})().catch((error) => { console.error('sellerF1RefreshFamilyContractSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
