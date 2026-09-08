'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { format } = require('node:util');
const express = require('express');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const rawUrl = String(process.env.PC1_CUSTOMER_REFRESH_DATABASE_URL || '').trim();
assert(rawUrl, 'PC1_CUSTOMER_REFRESH_DATABASE_URL is required.');
const parsed = new URL(rawUrl);
const databaseName = parsed.pathname.slice(1);
assert(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'Customer refresh integration requires loopback PostgreSQL.');
assert(/^novastore_pc1_customer_refresh_[a-z0-9_]+_test$/iu.test(databaseName), 'Customer refresh database must be uniquely disposable.');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = rawUrl;
process.env.DB_HOST = parsed.hostname;
process.env.DB_PORT = parsed.port || '5432';
process.env.DB_NAME = databaseName;
process.env.DB_USER = decodeURIComponent(parsed.username);
process.env.DB_PASSWORD = decodeURIComponent(parsed.password);
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.SUPABASE_POOLER_HOST = '';
process.env.SUPABASE_REGION = '';
process.env.JWT_SECRET = 'pc1-customer-refresh-integration-only-secret';
process.env.NOVASTORE_REQUEST_LOGGING_ENABLED = 'true';

const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const { runApply } = require('../scripts/staging-migrations/runner');

const migrationEnv = {
    NODE_ENV: 'test',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: parsed.hostname,
    NOVASTORE_EXPECTED_DATABASE_NAME: databaseName,
    [LOCAL_TEST_CAPABILITY]: 'true',
    DATABASE_URL: rawUrl
};

const serverModulePath = require.resolve('../server');
require.cache[serverModulePath] = {
    id: serverModulePath,
    filename: serverModulePath,
    loaded: true,
    exports: { io: null }
};

const pool = require('../config/db');
const authSessionService = require('../services/authSessionService');
const { issueSellerSession } = require('../services/sellerSessionService');
const { requestContext } = require('../middlewares/securityMiddleware');
const userRoutes = require('../routes/userRoutes');
const authRoutes = require('../routes/authRoutes');
const notificationRoutes = require('../routes/notificationRoutes');

const jsonRequest = async (baseUrl, path, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return Object.freeze({
        status: response.status,
        body: text ? JSON.parse(text) : null
    });
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const captureConsoleOutput = () => {
    const entries = [];
    const methods = ['debug', 'error', 'info', 'log', 'warn'];
    const originals = Object.fromEntries(methods.map((method) => [method, console[method]]));
    let restored = false;
    for (const method of methods) {
        console[method] = (...args) => {
            entries.push(format(...args));
        };
    }
    return Object.freeze({
        entries,
        restore() {
            if (restored) return;
            restored = true;
            for (const method of methods) console[method] = originals[method];
        }
    });
};

;(async () => {
    const adminClient = new Client({ connectionString: rawUrl, ssl: false });
    await adminClient.connect();
    await adminClient.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await adminClient.end();

    const registry = loadRegistry();
    assert.equal(registry.length, 39);
    assert.equal(registry.at(-1).id, '20260908_01_purchasable_variants');
    const firstApply = await runApply({ env: migrationEnv, registry, output: () => {} });
    const secondApply = await runApply({ env: migrationEnv, registry, output: () => {} });
    assert.deepEqual(firstApply.applied, registry.map((entry) => entry.id));
    assert.deepEqual(secondApply.applied, []);

    const password = 'CustomerRefresh123!';
    const changedPassword = 'CustomerRefreshChanged456!';
    const passwordHash = await bcrypt.hash(password, 4);
    const insertedUsers = await pool.query(
        `INSERT INTO users (full_name, email, password, role, auth_enabled)
         VALUES
            ('Customer A', 'customer-a@example.test', $1, 'customer', TRUE),
            ('Customer B', 'customer-b@example.test', $1, 'customer', TRUE),
            ('Customer Security', 'customer-security@example.test', $1, 'customer', TRUE),
            ('Admin A', 'admin-a@example.test', $1, 'admin', TRUE),
            ('Seller A', 'seller-a@example.test', $1, 'customer', TRUE)
         RETURNING id, email`,
        [passwordHash]
    );
    const userIds = Object.fromEntries(insertedUsers.rows.map((row) => [row.email, Number(row.id)]));
    const customerAId = userIds['customer-a@example.test'];
    const customerBId = userIds['customer-b@example.test'];
    const securityCustomerId = userIds['customer-security@example.test'];
    const sellerUserId = userIds['seller-a@example.test'];

    const app = express();
    app.use(requestContext);
    app.use(express.json({ limit: '16kb' }));
    app.use('/api/users', userRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/notifications', notificationRoutes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const runtimeLogCapture = captureConsoleOutput();
    const seenRawRefreshTokens = [];
    const sensitiveRuntimeValues = new Set([password, changedPassword]);
    const rememberRefreshToken = (value) => {
        if (typeof value !== 'string' || !value) return;
        seenRawRefreshTokens.push(value);
        sensitiveRuntimeValues.add(value);
    };
    const rememberAccessToken = (value) => {
        if (typeof value === 'string' && value) sensitiveRuntimeValues.add(value);
    };
    const loginCustomer = async (email) => {
        const response = await jsonRequest(baseUrl, '/api/users/login', {
            method: 'POST',
            body: { email, password }
        });
        assert.equal(response.status, 200);
        for (const key of ['token', 'refreshToken', 'accessExpiresAt', 'refreshExpiresAt', 'sessionId']) {
            assert(response.body[key], `Customer login response missing ${key}.`);
        }
        assert.equal(response.body.user.role, 'customer');
        rememberAccessToken(response.body.token);
        rememberRefreshToken(response.body.refreshToken);
        return response.body;
    };
    const refresh = async (session, overrides = {}) => {
        rememberRefreshToken(session.refreshToken);
        const response = await jsonRequest(baseUrl, '/api/users/refresh', {
            method: 'POST',
            body: {
                refreshToken: session.refreshToken,
                sessionId: session.sessionId,
                ...overrides
            }
        });
        if (response.status === 200) {
            rememberAccessToken(response.body.accessToken);
            rememberRefreshToken(response.body.refreshToken);
        }
        return response;
    };

    try {
        const malformedMissing = await jsonRequest(baseUrl, '/api/users/refresh', { method: 'POST', body: {} });
        const malformedToken = await jsonRequest(baseUrl, '/api/users/refresh', {
            method: 'POST', body: { refreshToken: 'malformed.refresh', sessionId: 1 }
        });
        const authorityInjectionCredential = authSessionService.createCustomerRefreshCredential();
        rememberRefreshToken(authorityInjectionCredential);
        const authorityInjection = await jsonRequest(baseUrl, '/api/users/refresh', {
            method: 'POST', body: { refreshToken: authorityInjectionCredential, sessionId: 1, userId: customerBId }
        });
        assert.equal(malformedMissing.status, 401);
        assert.equal(malformedToken.status, 401);
        assert.equal(authorityInjection.status, 400);

        const concurrentLogin = await loginCustomer('customer-a@example.test');
        seenRawRefreshTokens.push(concurrentLogin.refreshToken);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: concurrentLogin.token })).body.user.id, customerAId);
        const installationId = '11111111-1111-4111-8111-111111111111';
        const fcmToken = 'pc1-customer-a-fcm-token-concurrency-0001';
        const registered = await jsonRequest(baseUrl, '/api/notifications/android-push/tokens', {
            method: 'POST',
            token: concurrentLogin.token,
            body: { token: fcmToken, platform: 'android', installationId }
        });
        assert.equal(registered.status, 201);

        const concurrencyLockKeys = Object.freeze([73421, 60829]);
        const concurrencyGate = await pool.connect();
        let concurrencyGateHeld = false;
        let firstConcurrent = null;
        let concurrentResponses;
        try {
            await concurrencyGate.query('SELECT pg_advisory_lock($1, $2)', concurrencyLockKeys);
            concurrencyGateHeld = true;
            await pool.query(`
                CREATE OR REPLACE FUNCTION pc1_hold_first_refresh_rotation()
                RETURNS TRIGGER LANGUAGE plpgsql AS $$
                BEGIN
                    PERFORM pg_advisory_xact_lock(73421, 60829);
                    RETURN NEW;
                END;
                $$;
                CREATE TRIGGER trg_pc1_hold_first_refresh_rotation
                BEFORE UPDATE OF status ON auth_refresh_tokens
                FOR EACH ROW
                WHEN (OLD.status = 'active' AND NEW.status = 'rotated')
                EXECUTE FUNCTION pc1_hold_first_refresh_rotation();
            `);
            firstConcurrent = refresh(concurrentLogin);
            let firstRotationBlocked = false;
            for (let attempt = 0; attempt < 200; attempt += 1) {
                const waiting = await pool.query(
                    `SELECT COUNT(*)::INT AS count
                     FROM pg_stat_activity
                     WHERE datname = current_database()
                       AND wait_event_type = 'Lock'
                       AND wait_event = 'advisory'
                       AND query LIKE '%UPDATE auth_refresh_tokens%'`
                );
                if (Number(waiting.rows[0].count) > 0) {
                    firstRotationBlocked = true;
                    break;
                }
                await delay(10);
            }
            assert.equal(firstRotationBlocked, true, 'First refresh must hold the token row before the duplicate request.');
            const secondConcurrent = await refresh(concurrentLogin);
            assert.equal(secondConcurrent.status, 401);
            await concurrencyGate.query('SELECT pg_advisory_unlock($1, $2)', concurrencyLockKeys);
            concurrencyGateHeld = false;
            concurrentResponses = [await firstConcurrent, secondConcurrent];
        } finally {
            if (concurrencyGateHeld) {
                await concurrencyGate.query('SELECT pg_advisory_unlock($1, $2)', concurrencyLockKeys).catch(() => {});
            }
            if (firstConcurrent) await firstConcurrent.catch(() => {});
            concurrencyGate.release();
            await pool.query('DROP TRIGGER IF EXISTS trg_pc1_hold_first_refresh_rotation ON auth_refresh_tokens');
            await pool.query('DROP FUNCTION IF EXISTS pc1_hold_first_refresh_rotation()');
        }
        const concurrentSuccesses = concurrentResponses.filter((response) => response.status === 200);
        const concurrentFailures = concurrentResponses.filter((response) => response.status === 401);
        assert.equal(concurrentSuccesses.length, 1);
        assert.equal(concurrentFailures.length, 1);
        const concurrentWinner = concurrentSuccesses[0].body;
        seenRawRefreshTokens.push(concurrentWinner.refreshToken);
        assert.equal(concurrentWinner.sessionId, concurrentLogin.sessionId);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: concurrentWinner.accessToken })).body.user.id, customerAId);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: concurrentLogin.token })).status, 401);
        const activeAfterConcurrent = await pool.query(
            `SELECT COUNT(*)::INT AS count
             FROM auth_refresh_tokens token
             JOIN auth_sessions session ON session.id = token.auth_session_id
             WHERE token.auth_session_id = $1
               AND token.status = 'active'
               AND session.revoked_at IS NULL`,
            [concurrentLogin.sessionId]
        );
        assert.equal(Number(activeAfterConcurrent.rows[0].count), 1);
        const deviceAfterRefresh = await pool.query(
            `SELECT status, user_id, auth_session_id::INT AS auth_session_id
             FROM android_push_endpoints
             WHERE installation_id = $1::UUID`,
            [installationId]
        );
        assert.deepEqual(deviceAfterRefresh.rows[0], {
            status: 'ACTIVE',
            user_id: customerAId,
            auth_session_id: Number(concurrentLogin.sessionId)
        });

        const replay = await refresh(concurrentLogin);
        assert.equal(replay.status, 401);
        assert.equal(Object.hasOwn(replay.body, 'accessToken'), false);
        const compromisedState = await pool.query(
            `SELECT session.revoked_at, session.revoke_reason,
                    COUNT(*) FILTER (WHERE token.status = 'active')::INT AS active_refresh_count
             FROM auth_sessions session
             LEFT JOIN auth_refresh_tokens token ON token.auth_session_id = session.id
             WHERE session.id = $1
             GROUP BY session.id`,
            [concurrentLogin.sessionId]
        );
        assert(compromisedState.rows[0].revoked_at);
        assert.equal(compromisedState.rows[0].revoke_reason, 'refresh_replay_detected');
        assert.equal(Number(compromisedState.rows[0].active_refresh_count), 0);
        assert.equal((await pool.query(
            'SELECT status FROM android_push_endpoints WHERE installation_id = $1::UUID',
            [installationId]
        )).rows[0].status, 'REVOKED');

        const lifecycleLogin = await loginCustomer('customer-a@example.test');
        seenRawRefreshTokens.push(lifecycleLogin.refreshToken);
        const lifecycleR2 = await refresh(lifecycleLogin);
        assert.equal(lifecycleR2.status, 200);
        seenRawRefreshTokens.push(lifecycleR2.body.refreshToken);
        const lifecycleR3 = await refresh({
            refreshToken: lifecycleR2.body.refreshToken,
            sessionId: lifecycleR2.body.sessionId
        });
        assert.equal(lifecycleR3.status, 200);
        seenRawRefreshTokens.push(lifecycleR3.body.refreshToken);
        assert.equal(lifecycleR3.body.sessionId, lifecycleLogin.sessionId);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: lifecycleR3.body.accessToken })).body.user.id, customerAId);
        const lifecycleInstallation = '22222222-2222-4222-8222-222222222222';
        assert.equal((await jsonRequest(baseUrl, '/api/notifications/android-push/tokens', {
            method: 'POST',
            token: lifecycleR3.body.accessToken,
            body: { token: 'pc1-customer-a-fcm-token-lifecycle-0002', platform: 'android', installationId: lifecycleInstallation }
        })).status, 201);
        assert.equal((await jsonRequest(baseUrl, '/api/users/logout', {
            method: 'POST', token: lifecycleR3.body.accessToken
        })).status, 204);
        assert.equal((await pool.query(
            'SELECT status FROM android_push_endpoints WHERE installation_id = $1::UUID',
            [lifecycleInstallation]
        )).rows[0].status, 'REVOKED');
        assert.equal((await refresh({
            refreshToken: lifecycleR3.body.refreshToken,
            sessionId: lifecycleR3.body.sessionId
        })).status, 401);

        const accessExpiredLogin = await loginCustomer('customer-a@example.test');
        await pool.query(
            `UPDATE auth_sessions
             SET issued_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
                 expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
             WHERE id = $1`,
            [accessExpiredLogin.sessionId]
        );
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: accessExpiredLogin.token })).status, 401);
        await authSessionService.cleanupExpiredSessions({ queryable: pool, limit: 500 });
        assert.equal(Number((await pool.query(
            'SELECT COUNT(*)::INT AS count FROM auth_sessions WHERE id = $1',
            [accessExpiredLogin.sessionId]
        )).rows[0].count), 1, 'Cleanup must preserve an access-expired session with a live refresh credential.');
        const accessExpiryRenewal = await refresh(accessExpiredLogin);
        assert.equal(accessExpiryRenewal.status, 200);
        const accessExpiryRenewedMe = await jsonRequest(baseUrl, '/api/users/me', {
            token: accessExpiryRenewal.body.accessToken
        });
        assert.equal(accessExpiryRenewedMe.status, 200);
        assert.equal(accessExpiryRenewedMe.body.user.id, customerAId);

        const expiredLogin = await loginCustomer('customer-a@example.test');
        seenRawRefreshTokens.push(expiredLogin.refreshToken);
        await pool.query(
            `UPDATE auth_refresh_tokens
             SET issued_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
                 expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
             WHERE token_hash = $1`,
            [authSessionService.hashCustomerRefreshCredential(expiredLogin.refreshToken)]
        );
        assert.equal((await refresh(expiredLogin)).status, 401);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: expiredLogin.token })).status, 401);
        const expiredState = await pool.query(
            `SELECT session.revoked_at, session.revoke_reason, token.status
             FROM auth_sessions session
             JOIN auth_refresh_tokens token ON token.auth_session_id = session.id
             WHERE session.id = $1 AND token.generation = 1`,
            [expiredLogin.sessionId]
        );
        assert(expiredState.rows[0].revoked_at);
        assert.equal(expiredState.rows[0].revoke_reason, 'refresh_expired');
        assert.equal(expiredState.rows[0].status, 'expired');
        assert.equal(Number((await pool.query(
            'SELECT COUNT(*)::INT AS count FROM auth_refresh_tokens WHERE auth_session_id = $1 AND generation > 1',
            [expiredLogin.sessionId]
        )).rows[0].count), 0);

        const revokedLogin = await loginCustomer('customer-a@example.test');
        seenRawRefreshTokens.push(revokedLogin.refreshToken);
        await pool.query(
            `UPDATE auth_sessions
             SET revoked_at = CURRENT_TIMESTAMP, revoke_reason = 'explicit_test_revocation'
             WHERE id = $1`,
            [revokedLogin.sessionId]
        );
        assert.equal((await refresh(revokedLogin)).status, 401);

        const securityChangeLogin = await loginCustomer('customer-security@example.test');
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: securityChangeLogin.token })).body.user.id, securityCustomerId);
        await pool.query(
            `UPDATE auth_sessions
             SET issued_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
                 expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
             WHERE id = $1`,
            [securityChangeLogin.sessionId]
        );
        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [await bcrypt.hash(changedPassword, 4), securityCustomerId]
        );
        const securityChangeState = await pool.query(
            `SELECT session.revoked_at, session.revoke_reason, token.status
             FROM auth_sessions session
             JOIN auth_refresh_tokens token ON token.auth_session_id = session.id
             WHERE session.id = $1 AND token.generation = 1`,
            [securityChangeLogin.sessionId]
        );
        assert(securityChangeState.rows[0].revoked_at);
        assert.equal(securityChangeState.rows[0].revoke_reason, 'user_security_state_changed');
        assert.equal(securityChangeState.rows[0].status, 'revoked');
        assert.equal((await refresh(securityChangeLogin)).status, 401);

        const logoutAllA = await loginCustomer('customer-a@example.test');
        const logoutAllB = await loginCustomer('customer-a@example.test');
        seenRawRefreshTokens.push(logoutAllA.refreshToken, logoutAllB.refreshToken);
        await pool.query(
            `UPDATE auth_sessions
             SET issued_at = CURRENT_TIMESTAMP - INTERVAL '2 days',
                 expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day'
             WHERE id = $1`,
            [logoutAllA.sessionId]
        );
        assert.equal((await jsonRequest(baseUrl, '/api/users/logout-all', {
            method: 'POST', token: logoutAllB.token
        })).status, 204);
        assert.equal((await refresh(logoutAllA)).status, 401);
        assert.equal((await refresh(logoutAllB)).status, 401);

        const isolationA = await loginCustomer('customer-a@example.test');
        const isolationB = await loginCustomer('customer-b@example.test');
        assert.equal((await refresh(isolationA, { sessionId: isolationB.sessionId })).status, 401);
        assert.equal((await refresh(isolationB, { sessionId: isolationA.sessionId })).status, 401);
        const isolationARenewed = await refresh(isolationA);
        const isolationBRenewed = await refresh(isolationB);
        assert.equal(isolationARenewed.status, 200);
        assert.equal(isolationBRenewed.status, 200);
        const customerAMe = await jsonRequest(baseUrl, '/api/users/me', { token: isolationARenewed.body.accessToken });
        const customerBMe = await jsonRequest(baseUrl, '/api/users/me', { token: isolationBRenewed.body.accessToken });
        assert.equal(customerAMe.status, 200);
        assert.equal(customerAMe.body.user.id, customerAId);
        assert.equal(customerBMe.status, 200);
        assert.equal(customerBMe.body.user.id, customerBId);
        assert.equal(customerBMe.body.user.email, 'customer-b@example.test');

        const adminLogin = await jsonRequest(baseUrl, '/api/auth/login', {
            method: 'POST', body: { email: 'admin-a@example.test', password }
        });
        assert.equal(adminLogin.status, 200);
        rememberAccessToken(adminLogin.body.token);
        assert.equal((await jsonRequest(baseUrl, '/api/users/refresh', {
            method: 'POST', body: { refreshToken: adminLogin.body.token, sessionId: isolationB.sessionId }
        })).status, 401);

        const organization = await pool.query(
            `INSERT INTO seller_organizations (external_key, display_name)
             VALUES ($1, 'Seller A Organization') RETURNING id`,
            [crypto.randomUUID()]
        );
        const ownerRole = await pool.query("SELECT id FROM seller_roles WHERE code = 'owner' AND organization_id IS NULL");
        const membership = await pool.query(
            `INSERT INTO seller_memberships (
                organization_id, user_id, role_id, security_stamp, membership_revision
             ) VALUES ($1, $2, $3, $4, 1) RETURNING id, security_stamp`,
            [organization.rows[0].id, sellerUserId, ownerRole.rows[0].id, crypto.randomUUID()]
        );
        const sellerRefreshCredential = authSessionService.createCustomerRefreshCredential();
        rememberRefreshToken(sellerRefreshCredential);
        await issueSellerSession(pool, {
            userId: sellerUserId,
            organizationId: Number(organization.rows[0].id),
            membershipId: Number(membership.rows[0].id),
            membershipRevision: 1,
            securityStamp: membership.rows[0].security_stamp,
            refreshCredential: sellerRefreshCredential
        });
        assert.equal((await jsonRequest(baseUrl, '/api/users/refresh', {
            method: 'POST', body: { refreshToken: sellerRefreshCredential, sessionId: isolationB.sessionId }
        })).status, 401);

        const adminSession = await pool.query(
            `SELECT id FROM auth_sessions WHERE user_id = $1 AND principal_type = 'admin' ORDER BY id DESC LIMIT 1`,
            [userIds['admin-a@example.test']]
        );
        await assert.rejects(
            () => pool.query(
                `INSERT INTO auth_refresh_tokens (
                    id, auth_session_id, generation, token_hash, expires_at
                 ) VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
                [crypto.randomUUID(), adminSession.rows[0].id, 'f'.repeat(64)]
            ),
            (error) => error.code === '23514'
        );

        assert.equal((await jsonRequest(baseUrl, '/api/users/logout', {
            method: 'POST', token: isolationARenewed.body.accessToken
        })).status, 204);
        assert.equal((await jsonRequest(baseUrl, '/api/users/logout', {
            method: 'POST', token: isolationBRenewed.body.accessToken
        })).status, 204);
        const staleCustomerDeviceLeak = Number((await pool.query(
            `SELECT COUNT(*)::INT AS count
             FROM android_push_endpoints
             WHERE user_id = $1
               AND status = 'ACTIVE'`,
            [customerAId]
        )).rows[0].count);
        assert.equal(staleCustomerDeviceLeak, 0);

        const storedRefreshHashes = await pool.query('SELECT token_hash FROM auth_refresh_tokens');
        assert(storedRefreshHashes.rows.every((row) => /^[0-9a-f]{64}$/u.test(String(row.token_hash).trim())));
        for (const rawToken of seenRawRefreshTokens) {
            assert.equal(storedRefreshHashes.rows.some((row) => String(row.token_hash).includes(rawToken)), false);
        }
        const storedAccessHashes = await pool.query('SELECT jti_hash FROM auth_sessions');
        assert(storedAccessHashes.rows.every((row) => /^[0-9a-f]{64}$/u.test(String(row.jti_hash).trim())));

        await delay(0);
        const tokenLogLeakCount = runtimeLogCapture.entries.reduce(
            (count, entry) => count + [...sensitiveRuntimeValues].filter((value) => entry.includes(value)).length,
            0
        );
        assert.equal(tokenLogLeakCount, 0, 'Runtime logs must not contain passwords, access tokens, or refresh tokens.');
        runtimeLogCapture.restore();

        console.log(JSON.stringify({
            result: 'PASS',
            migrationFirstApply: firstApply.applied.length,
            migrationSecondApply: secondApply.applied.length,
            concurrentDoubleRefreshSuccessCount: concurrentSuccesses.length,
            activeRotatedRefreshCount: Number(activeAfterConcurrent.rows[0].count),
            oldRefreshAfterRotation: 'REJECTED',
            refreshReplay: 'PASS',
            expiry: 'PASS',
            revocation: 'PASS',
            logoutRefreshInvalidation: 'PASS',
            customerIdentityPreserved: 'PASS',
            customerABIsolation: 'PASS',
            crossRoleConfusionCount: 0,
            tokenLogLeakCount,
            accessExpiryRenewal: 'PASS',
            passwordChangeAfterAccessExpiryRevocation: 'PASS',
            androidFcmAuthIdentityRegression: 'PASS',
            staleCustomerNotificationDeviceLeak: staleCustomerDeviceLeak,
            customerWebAuthRegression: 'PASS'
        }, null, 2));
        console.log('customer refresh PostgreSQL integration smoke passed');
    } finally {
        runtimeLogCapture.restore();
        await pool.query('DROP TRIGGER IF EXISTS trg_pc1_hold_first_refresh_rotation ON auth_refresh_tokens').catch(() => {});
        await pool.query('DROP FUNCTION IF EXISTS pc1_hold_first_refresh_rotation()').catch(() => {});
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error('customerRefreshPostgresSmoke: FAIL');
    console.error(error.stack);
    process.exitCode = 1;
}).finally(async () => {
    delete require.cache[serverModulePath];
    await pool.end().catch(() => {});
});
