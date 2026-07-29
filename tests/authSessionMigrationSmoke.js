const assert = require('node:assert/strict');
const { Client } = require('pg');

const rawUrl = String(process.env.P4B_AUTH_DATABASE_URL || '').trim();
assert(rawUrl, 'P4B_AUTH_DATABASE_URL is required for the isolated auth migration smoke.');
const parsed = new URL(rawUrl);
assert(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'Auth migration smoke requires localhost PostgreSQL.');
assert(/^novastore_p4b_auth_[a-z0-9_]+$/i.test(parsed.pathname.slice(1)), 'Auth migration smoke requires its unique disposable database.');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.DATABASE_URL = rawUrl;
process.env.DB_HOST = parsed.hostname;
process.env.DB_PORT = parsed.port || '5432';
process.env.DB_NAME = parsed.pathname.slice(1);
process.env.DB_USER = decodeURIComponent(parsed.username);
process.env.DB_PASSWORD = decodeURIComponent(parsed.password);
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.JWT_SECRET = 'p4b-local-auth-migration-secret';

const { applyAuthSessionSchema } = require('../models/authSessionSchema');
const { cleanupExpiredSessions } = require('../services/authSessionService');

(async () => {
    const client = new Client({ connectionString: rawUrl, ssl: false });
    await client.connect();
    try {
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'customer'
            )
        `);

        await applyAuthSessionSchema(client);
        await applyAuthSessionSchema(client);

        const columns = await client.query(`
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name IN ('users', 'auth_sessions')
            ORDER BY table_name, ordinal_position
        `);
        const columnKeys = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
        for (const key of [
            'users.auth_enabled',
            'auth_sessions.id',
            'auth_sessions.jti_hash',
            'auth_sessions.user_id',
            'auth_sessions.principal_type',
            'auth_sessions.issued_at',
            'auth_sessions.expires_at',
            'auth_sessions.revoked_at',
            'auth_sessions.revoke_reason'
        ]) assert(columnKeys.has(key), `missing schema column ${key}`);
        assert.equal(
            [...columnKeys].some((key) => /raw_jti|raw_token|jwt|access_token/i.test(key)),
            false,
            'auth session schema must not expose raw token or jti columns'
        );

        const indexes = await client.query(`
            SELECT indexname FROM pg_indexes
            WHERE schemaname = 'public' AND tablename = 'auth_sessions'
        `);
        const indexNames = new Set(indexes.rows.map((row) => row.indexname));
        assert(indexNames.has('idx_auth_sessions_active_user_principal'));
        assert(indexNames.has('idx_auth_sessions_expires_at'));

        const constraints = await client.query(`
            SELECT contype, pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'auth_sessions'::regclass
        `);
        assert(constraints.rows.some((row) => row.contype === 'f' && /users/i.test(row.definition)));
        assert(constraints.rows.some((row) => row.contype === 'u' && /jti_hash/i.test(row.definition)));
        assert(constraints.rows.some((row) => row.contype === 'c' && /expires_at > issued_at/i.test(row.definition)));
        assert(constraints.rows.some((row) => row.contype === 'c' && /customer.*admin|admin.*customer/i.test(row.definition)));

        const triggers = await client.query(`
            SELECT tgname FROM pg_trigger
            WHERE NOT tgisinternal
              AND tgrelid IN ('users'::regclass, 'auth_sessions'::regclass)
        `);
        const triggerNames = new Set(triggers.rows.map((row) => row.tgname));
        assert(triggerNames.has('trg_users_revoke_auth_sessions'));
        assert(triggerNames.has('trg_auth_sessions_notify_revoked'));

        const user = await client.query(
            `INSERT INTO users (email, password, role)
             VALUES ('migration@example.test', 'hash-a', 'customer')
             RETURNING id, auth_enabled`
        );
        assert.equal(user.rows[0].auth_enabled, true);
        const userId = Number(user.rows[0].id);
        const hashA = 'a'.repeat(64);
        await client.query(
            `INSERT INTO auth_sessions (jti_hash, user_id, principal_type, issued_at, expires_at)
             VALUES ($1, $2, 'customer', NOW(), NOW() + INTERVAL '1 hour')`,
            [hashA, userId]
        );
        await assert.rejects(
            () => client.query(
                `INSERT INTO auth_sessions (jti_hash, user_id, principal_type, issued_at, expires_at)
                 VALUES ($1, $2, 'customer', NOW(), NOW() + INTERVAL '1 hour')`,
                [hashA, userId]
            ),
            (error) => error.code === '23505'
        );

        await client.query('UPDATE users SET password = password WHERE id = $1', [userId]);
        let state = await client.query('SELECT revoked_at FROM auth_sessions WHERE jti_hash = $1', [hashA]);
        assert.equal(state.rows[0].revoked_at, null, 'same-value password update must not revoke');

        await client.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
        state = await client.query('SELECT revoked_at, revoke_reason FROM auth_sessions WHERE jti_hash = $1', [hashA]);
        assert(state.rows[0].revoked_at);
        assert.equal(state.rows[0].revoke_reason, 'user_security_state_changed');

        const hashB = 'b'.repeat(64);
        await client.query(
            `INSERT INTO auth_sessions (jti_hash, user_id, principal_type, issued_at, expires_at)
             VALUES ($1, $2, 'admin', NOW(), NOW() + INTERVAL '1 hour')`,
            [hashB, userId]
        );
        await client.query('UPDATE users SET auth_enabled = FALSE WHERE id = $1', [userId]);
        state = await client.query('SELECT revoked_at FROM auth_sessions WHERE jti_hash = $1', [hashB]);
        assert(state.rows[0].revoked_at, 'account disable must revoke active sessions');

        const expiredHash = 'c'.repeat(64);
        await client.query(
            `INSERT INTO auth_sessions (
                jti_hash, user_id, principal_type, issued_at, expires_at, revoked_at
             ) VALUES ($1, $2, 'admin', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')`,
            [expiredHash, userId]
        );
        assert.equal(await cleanupExpiredSessions({ queryable: client, limit: 1 }), 1);
        const expiredCount = await client.query('SELECT COUNT(*)::int AS count FROM auth_sessions WHERE expires_at <= NOW()');
        assert.equal(expiredCount.rows[0].count, 0);

        console.log('authSessionMigrationSmoke: PASS fresh=1 upgrade=1 constraints=4 indexes=2 triggers=2');
    } finally {
        await client.end();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
