'use strict';

const assert = require('node:assert/strict');
const { loadLiveSellerSession, SellerSessionError } = require('../services/sellerSessionService');

const activeRow = Object.freeze({ session_id: 'session-1', user_id: 101, organization_id: 11, membership_id: 21, role_id: 31, session_status: 'active', session_expires_at: new Date(Date.now() + 60000), session_membership_revision: 4, session_security_stamp: 'stamp-1', membership_status: 'active', membership_revision: 4, security_stamp: 'stamp-1', organization_status: 'active' });

;(async () => {
    const queryable = { query: async () => ({ rows: [activeRow] }) };
    const session = await loadLiveSellerSession(queryable, { sessionId: 'session-1', userId: 101 });
    assert.equal(session.organizationId, 11);
    let liveSessionSql = '';
    await loadLiveSellerSession({ query: async (sql) => {
        liveSessionSql = sql;
        return { rows: [activeRow] };
    } }, { sessionId: 'session-1', userId: 101 });
    assert.match(liveSessionSql, /membership\.user_id = session\.user_id/u);
    await assert.rejects(
        () => loadLiveSellerSession({ query: async () => ({ rows: [{ ...activeRow, membership_revision: 5 }] }) }, { sessionId: 'session-1', userId: 101 }),
        (error) => error instanceof SellerSessionError && error.code === 'SELLER_SESSION_REVOKED'
    );
    await assert.rejects(
        () => loadLiveSellerSession({ query: async () => ({ rows: [{ ...activeRow, membership_status: 'revoked' }] }) }, { sessionId: 'session-1', userId: 101 }),
        (error) => error.code === 'NO_ACTIVE_MEMBERSHIP' && error.statusCode === 403
    );
    console.log('sellerF1SessionRevisionSmoke: PASS');
})().catch((error) => { console.error('sellerF1SessionRevisionSmoke: FAIL'); console.error(error.stack); process.exitCode = 1; });
