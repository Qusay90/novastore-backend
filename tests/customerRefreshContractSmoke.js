'use strict';

const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_ci:novastore_ci_only@127.0.0.1:55432/novastore_ci';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_ci';
process.env.DB_USER = 'novastore_ci';
process.env.DB_PASSWORD = 'novastore_ci_only';
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.JWT_SECRET = 'customer-refresh-unit-only-secret';

const authSessionService = require('../services/authSessionService');
const { hashRefreshCredential: hashSellerRefreshCredential } = require('../services/sellerSessionService');
const customerRefreshController = require('../controllers/customerRefreshController');
const userRoutes = require('../routes/userRoutes');

const refreshRow = (overrides = {}) => ({
    token_id: '11111111-1111-4111-8111-111111111111',
    session_id: 7,
    generation: 1,
    token_status: 'active',
    token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    session_jti_hash: 'a'.repeat(64),
    user_id: 41,
    principal_type: 'customer',
    session_issued_at: new Date(Date.now() - 60 * 1000),
    session_expires_at: new Date(Date.now() + 60 * 1000),
    session_revoked_at: null,
    user_role: 'customer',
    auth_enabled: true,
    ...overrides
});

const fakeDatabase = ({ row = refreshRow(), selectError = null } = {}) => {
    const calls = [];
    const client = {
        release() { calls.push(['RELEASE', []]); },
        async query(sql, params = []) {
            calls.push([sql, params]);
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM auth_refresh_tokens token')) {
                if (selectError) throw selectError;
                return { rows: row ? [row] : [] };
            }
            if (sql.includes("SET status = 'rotated'")) return { rows: [{ id: row.token_id }] };
            if (sql.includes('SET jti_hash = $1')) return { rows: [{ id: row.session_id }] };
            return { rows: [] };
        }
    };
    return Object.freeze({
        calls,
        database: { async connect() { return client; } }
    });
};

const responseRecorder = () => {
    const state = { statusCode: null, body: null };
    return {
        state,
        response: {
            status(code) { state.statusCode = code; return this; },
            json(body) { state.body = body; return this; }
        }
    };
};

const rejectsRefresh = async (promise, statusCode = 401) => assert.rejects(
    promise,
    (error) => error instanceof authSessionService.AuthSessionError && error.statusCode === statusCode
);

;(async () => {
    const presented = authSessionService.createCustomerRefreshCredential();
    assert.match(presented, authSessionService.CUSTOMER_REFRESH_CREDENTIAL_PATTERN);
    assert.match(authSessionService.hashCustomerRefreshCredential(presented), /^[a-f0-9]{64}$/u);
    assert.notEqual(
        authSessionService.hashCustomerRefreshCredential(presented),
        hashSellerRefreshCredential(presented),
        'Customer and Seller refresh credentials must use separate hash domains.'
    );

    const success = fakeDatabase();
    const rotated = await authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: success.database
    });
    assert.equal(rotated.sessionId, 7);
    assert.equal(rotated.userId, 41);
    assert.equal(rotated.generation, 2);
    assert.match(rotated.refreshToken, authSessionService.CUSTOMER_REFRESH_CREDENTIAL_PATTERN);
    assert.notEqual(rotated.refreshToken, presented);
    const claims = authSessionService.verifyTokenClaims(rotated.accessToken, { expectedPrincipal: 'customer' });
    assert.equal(claims.userId, 41);
    assert.equal(claims.role, 'customer');
    assert.equal(success.calls.some(([sql]) => sql === 'COMMIT'), true);
    assert.equal(success.calls.some(([sql]) => sql === 'ROLLBACK'), false);
    assert.equal(
        success.calls.some(([, params]) => params.some((value) => value === presented || value === rotated.refreshToken)),
        false,
        'Raw refresh credentials must never enter SQL parameters.'
    );

    const replay = fakeDatabase({ row: refreshRow({ token_status: 'rotated' }) });
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: replay.database
    }));
    assert.equal(replay.calls.some(([sql]) => sql.includes("SET status = 'replayed'")), true);
    assert.equal(replay.calls.some(([sql]) => sql.includes("refresh_replay_detected")), true);
    assert.equal(replay.calls.some(([sql]) => sql === 'COMMIT'), true, 'Replay revocation must commit.');

    const concurrent = fakeDatabase({ row: null });
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: concurrent.database
    }));
    assert.equal(concurrent.calls.some(([sql]) => sql === 'ROLLBACK'), true);
    assert.equal(concurrent.calls.some(([sql]) => sql.includes('SET jti_hash')), false);

    const expired = fakeDatabase({ row: refreshRow({ token_expires_at: new Date(Date.now() - 1000) }) });
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: expired.database
    }));
    assert.equal(expired.calls.some(([sql]) => sql.includes("SET status = 'expired'")), true);
    assert.equal(expired.calls.some(([, params]) => params.includes('refresh_expired')), true);

    const revoked = fakeDatabase({ row: refreshRow({ token_status: 'revoked', session_revoked_at: new Date() }) });
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: revoked.database
    }));
    assert.equal(revoked.calls.some(([sql]) => sql === 'COMMIT'), false);

    const wrongRole = fakeDatabase({ row: refreshRow({ principal_type: 'admin', user_role: 'admin' }) });
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: wrongRole.database
    }), 403);
    assert.equal(wrongRole.calls.some(([, params]) => params.includes('refresh_customer_account_inactive')), true);

    const corrupted = fakeDatabase({ row: refreshRow({ session_jti_hash: 'corrupted' }) });
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: corrupted.database
    }));
    assert.equal(corrupted.calls.some(([, params]) => params.includes('refresh_session_corrupted')), true);

    const unavailable = fakeDatabase({ selectError: new Error('synthetic database unavailable') });
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 7,
        database: unavailable.database
    }), 503);
    assert.equal(unavailable.calls.some(([sql]) => sql === 'ROLLBACK'), true);

    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: 'malformed.refresh.token',
        expectedSessionId: 7,
        database: success.database
    }));
    await rejectsRefresh(authSessionService.rotateCustomerRefreshSession({
        refreshToken: presented,
        expectedSessionId: 999,
        database: fakeDatabase().database
    }));

    assert.throws(
        () => customerRefreshController.normalizeRefreshRequest({ refreshToken: presented, sessionId: 7, userId: 41 }),
        (error) => error instanceof authSessionService.AuthSessionError && error.statusCode === 400
    );
    const refreshRoute = userRoutes.stack.find((layer) => layer.route?.path === '/refresh')?.route;
    assert(refreshRoute, 'POST /api/users/refresh route is required.');
    assert.equal(refreshRoute.methods.post, true);
    assert.equal(refreshRoute.stack.length, 2, 'Refresh route must be throttled and unauthenticated by access token.');
    assert.equal(refreshRoute.stack.at(-1).handle, customerRefreshController.refreshCustomerSession);

    const originalRotate = authSessionService.rotateCustomerRefreshSession;
    authSessionService.rotateCustomerRefreshSession = async () => rotated;
    try {
        const recorder = responseRecorder();
        await customerRefreshController.refreshCustomerSession(
            { body: { refreshToken: presented, sessionId: 7 } },
            recorder.response
        );
        assert.equal(recorder.state.statusCode, 200);
        assert.deepEqual(Object.keys(recorder.state.body).sort(), [
            'accessExpiresAt', 'accessToken', 'refreshExpiresAt', 'refreshToken', 'sessionId', 'tokenType'
        ]);
        assert.equal(Object.hasOwn(recorder.state.body, 'user'), false, '/api/users/me remains profile authority.');
    } finally {
        authSessionService.rotateCustomerRefreshSession = originalRotate;
    }

    console.log('customerRefreshContractSmoke: PASS cases=12 route=1 raw-token-sql-leak=0 cross-role=0');
})().catch((error) => {
    console.error('customerRefreshContractSmoke: FAIL');
    console.error(error.stack);
    process.exitCode = 1;
});
