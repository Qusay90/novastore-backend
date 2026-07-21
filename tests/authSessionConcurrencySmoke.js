const assert = require('node:assert/strict');

const rawUrl = String(process.env.P4B_AUTH_DATABASE_URL || '').trim();
assert(rawUrl, 'P4B_AUTH_DATABASE_URL is required for the isolated concurrency smoke.');
const parsed = new URL(rawUrl);
assert(['127.0.0.1', 'localhost'].includes(parsed.hostname));
assert(/^novastore_p4b_auth_[a-z0-9_]+$/i.test(parsed.pathname.slice(1)));

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = rawUrl;
process.env.DB_HOST = parsed.hostname;
process.env.DB_PORT = parsed.port || '5432';
process.env.DB_NAME = parsed.pathname.slice(1);
process.env.DB_USER = decodeURIComponent(parsed.username);
process.env.DB_PASSWORD = decodeURIComponent(parsed.password);
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.JWT_SECRET = 'p4b-local-concurrency-secret';

const pool = require('../config/db');
const { applyAuthSessionSchema } = require('../models/authSessionSchema');
const authSessionService = require('../services/authSessionService');

const issueInTransaction = async (client, userId) => {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const session = await authSessionService.issueAccessSession({
        userId,
        role: 'customer',
        principal: 'customer',
        queryable: client,
        ttlSeconds: 3600
    });
    return session;
};

const expectRejected = async (token, service = authSessionService) => {
    await assert.rejects(
        () => service.verifyAccessToken(token, { expectedPrincipal: 'customer' }),
        (error) => error instanceof service.AuthSessionError && error.statusCode === 401
    );
};

(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.query(`
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'customer'
        )
    `);
    await applyAuthSessionSchema(pool);
    const user = await pool.query(
        "INSERT INTO users (email, password, role) VALUES ('concurrency@example.test', 'not-used', 'customer') RETURNING id"
    );
    const userId = Number(user.rows[0].id);

    const completedBeforeLogout = await pool.connect();
    const logoutPromise = (() => {
        let promise;
        return {
            start() {
                promise = authSessionService.revokeAllSessions({ userId, principal: 'customer' });
                return promise;
            },
            get promise() { return promise; }
        };
    })();
    try {
        const session = await issueInTransaction(completedBeforeLogout, userId);
        const pendingLogout = logoutPromise.start();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await completedBeforeLogout.query('COMMIT');
        await pendingLogout;
        await expectRejected(session.token);
    } finally {
        await completedBeforeLogout.query('ROLLBACK').catch(() => {});
        completedBeforeLogout.release();
    }

    const logoutFirst = await pool.connect();
    const loginAfterLogout = await pool.connect();
    try {
        await logoutFirst.query('BEGIN');
        await logoutFirst.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const loginPromise = (async () => {
            const session = await issueInTransaction(loginAfterLogout, userId);
            await loginAfterLogout.query('COMMIT');
            return session;
        })();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await logoutFirst.query(
            `UPDATE auth_sessions
             SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'logout_all'
             WHERE user_id = $1 AND principal_type = 'customer'
               AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
            [userId]
        );
        await logoutFirst.query('COMMIT');
        const newSession = await loginPromise;
        const verified = await authSessionService.verifyAccessToken(newSession.token, {
            expectedPrincipal: 'customer'
        });
        assert.equal(verified.user.id, userId);

        const capturedBeforeRevocation = verified;
        await authSessionService.revokeCurrentSession({
            sessionId: newSession.sessionId,
            userId,
            principal: 'customer'
        });
        assert.equal(capturedBeforeRevocation.user.id, userId, 'already-authorized in-flight work is a documented boundary');
        await expectRejected(newSession.token);
        await assert.rejects(
            () => authSessionService.revalidateSession({
                sessionId: newSession.sessionId,
                userId,
                principal: 'customer'
            }),
            (error) => error instanceof authSessionService.AuthSessionError && error.statusCode === 401
        );
    } finally {
        await logoutFirst.query('ROLLBACK').catch(() => {});
        await loginAfterLogout.query('ROLLBACK').catch(() => {});
        logoutFirst.release();
        loginAfterLogout.release();
    }

    const restartSessionClient = await pool.connect();
    let restartSession;
    try {
        restartSession = await issueInTransaction(restartSessionClient, userId);
        await restartSessionClient.query('COMMIT');
    } finally {
        await restartSessionClient.query('ROLLBACK').catch(() => {});
        restartSessionClient.release();
    }

    const servicePath = require.resolve('../services/authSessionService');
    delete require.cache[servicePath];
    const secondInstanceService = require('../services/authSessionService');
    assert.equal((await secondInstanceService.verifyAccessToken(restartSession.token, {
        expectedPrincipal: 'customer'
    })).user.id, userId);
    await authSessionService.revokeCurrentSession({
        sessionId: restartSession.sessionId,
        userId,
        principal: 'customer'
    });
    await expectRejected(restartSession.token, secondInstanceService);

    console.log('authSessionConcurrencySmoke: PASS ordering=2 restart=1 multi-instance=1 in-flight-boundary=1');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await pool.end();
});
