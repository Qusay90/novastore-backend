const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const rawUrl = String(process.env.P4B_AUTH_DATABASE_URL || '').trim();
assert(rawUrl, 'P4B_AUTH_DATABASE_URL is required for the isolated revocation smoke.');
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
process.env.JWT_SECRET = 'p4b-local-revocation-secret';

const serverModulePath = require.resolve('../server');
require.cache[serverModulePath] = {
    id: serverModulePath,
    filename: serverModulePath,
    loaded: true,
    exports: { io: null }
};

const pool = require('../config/db');
const authSessionService = require('../services/authSessionService');
const { applyAuthSessionSchema } = require('../models/authSessionSchema');
const userRoutes = require('../routes/userRoutes');
const authRoutes = require('../routes/authRoutes');
const questionRoutes = require('../routes/questionRoutes');
const questionController = require('../controllers/questionController');
const {
    authenticateAdmin,
    authenticateCustomer,
    requireAdmin
} = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const {
    getUserFromRequestIfAny,
    inferExpectedPrincipal,
    sendAuthError
} = require('../middlewares/authMiddleware');

const jsonRequest = async (baseUrl, pathname, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return {
        status: response.status,
        body: text ? JSON.parse(text) : null
    };
};

const issueSession = async ({ userId, role, principal }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const session = await authSessionService.issueAccessSession({
            userId,
            role,
            principal,
            queryable: client,
            ttlSeconds: 3600
        });
        await client.query('COMMIT');
        return session;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const questionPaths = Object.freeze([
    { method: 'POST', path: '/api/questions/ask', principal: 'customer', body: { product_id: 1, question: 'Bu ürün stokta mı?' } },
    { method: 'GET', path: '/api/questions/user', principal: 'customer' },
    { method: 'GET', path: '/api/questions/admin/all', principal: 'admin' },
    { method: 'GET', path: '/api/questions/admin/products', principal: 'admin' },
    { method: 'PATCH', path: '/api/questions/admin/answer/1', principal: 'admin', body: { answer: 'Evet, stokta.' } }
]);

const findQuestionRoute = (path) => questionRoutes.stack.find((layer) => layer.route?.path === path).route;

const assertQuestionRoute = (path, expectedHandlers) => {
    const actual = findQuestionRoute(path).stack.map((layer) => layer.handle);
    assert.equal(actual.length, expectedHandlers.length);
    expectedHandlers.forEach((handler, index) => assert.equal(actual[index], handler));
};

const inferPrincipal = (method, originalUrl) => inferExpectedPrincipal({ method, originalUrl });

(async () => {
    assert.equal(inferPrincipal('GET', '/api/messages/history/42'), null);
    assert.equal(inferPrincipal('POST', '/api/messages/send'), null);
    assert.equal(inferPrincipal('GET', '/api/notifications/user/42'), null);
    assert.equal(inferPrincipal('GET', '/api/reviews/user/42'), null);
    assert.equal(inferPrincipal('GET', '/api/messages/users'), 'admin');
    assert.equal(inferPrincipal('GET', '/api/notifications/admin'), 'admin');
    assert.equal(inferPrincipal('POST', '/api/reviews'), 'customer');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.query(`
        CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            full_name VARCHAR(100),
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE NOT NULL,
            phone VARCHAR(20),
            password VARCHAR(255) NOT NULL,
            password_reset_token_hash VARCHAR(64),
            password_reset_expires_at TIMESTAMPTZ,
            role VARCHAR(20) NOT NULL DEFAULT 'customer',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE products (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            image_url TEXT,
            publication_status TEXT NOT NULL DEFAULT 'active',
            is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
            deleted_at TIMESTAMPTZ
        );
        CREATE TABLE product_questions (
            id SERIAL PRIMARY KEY,
            product_id INTEGER REFERENCES products(id),
            user_id INTEGER REFERENCES users(id),
            question TEXT NOT NULL,
            answer TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            answered_at TIMESTAMPTZ
        );
        CREATE TABLE notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            type TEXT,
            message TEXT,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE notification_audit_logs (
            id BIGSERIAL PRIMARY KEY,
            notification_id INTEGER,
            channel TEXT,
            room TEXT,
            event_name TEXT,
            payload JSONB,
            delivered BOOLEAN,
            attempts INTEGER,
            last_error TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await applyAuthSessionSchema(pool);

    const customerPassword = 'CustomerPassword123!';
    const adminPassword = 'AdminPassword123!';
    const customerHash = await bcrypt.hash(customerPassword, 10);
    const adminHash = await bcrypt.hash(adminPassword, 10);
    const customer = await pool.query(
        `INSERT INTO users (full_name, email, password, role)
         VALUES ('Test Customer', 'customer@example.test', $1, 'customer') RETURNING id`,
        [customerHash]
    );
    const admin = await pool.query(
        `INSERT INTO users (full_name, email, password, role)
         VALUES ('Test Admin', 'admin@example.test', $1, 'admin') RETURNING id`,
        [adminHash]
    );
    const customerId = Number(customer.rows[0].id);
    const adminId = Number(admin.rows[0].id);
    await pool.query("INSERT INTO products (id, name) VALUES (1, 'Test Product')");

    const app = express();
    app.use(express.json());
    app.use('/api/users', userRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/questions', questionRoutes);
    app.get('/api/assistant/auth-probe', async (req, res) => {
        try {
            const user = await getUserFromRequestIfAny(req);
            return res.status(200).json({ user });
        } catch (error) {
            return sendAuthError(res, error);
        }
    });
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const customerLogin = await jsonRequest(baseUrl, '/api/users/login', {
            method: 'POST',
            body: { email: 'customer@example.test', password: customerPassword }
        });
        assert.equal(customerLogin.status, 200);
        const customerTokenA = customerLogin.body.token;
        const customerClaims = jwt.verify(customerTokenA, process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            audience: authSessionService.ACCESS_TOKEN_AUDIENCES.customer,
            issuer: authSessionService.ACCESS_TOKEN_ISSUER
        });
        assert.equal(customerClaims.sub, String(customerId));
        assert.equal(customerClaims.id, customerId);
        assert.equal(customerClaims.role, 'customer');
        assert.equal(customerClaims.principal, 'customer');
        assert.equal(typeof customerClaims.jti, 'string');

        const customerLoginB = await jsonRequest(baseUrl, '/api/users/login', {
            method: 'POST',
            body: { email: 'customer@example.test', password: customerPassword }
        });
        assert.equal(customerLoginB.status, 200);
        const customerTokenB = customerLoginB.body.token;

        const adminLogin = await jsonRequest(baseUrl, '/api/auth/login', {
            method: 'POST',
            body: { email: 'admin@example.test', password: adminPassword }
        });
        assert.equal(adminLogin.status, 200);
        const adminToken = adminLogin.body.token;
        const adminClaims = jwt.verify(adminToken, process.env.JWT_SECRET, {
            algorithms: ['HS256'],
            audience: authSessionService.ACCESS_TOKEN_AUDIENCES.admin,
            issuer: authSessionService.ACCESS_TOKEN_ISSUER
        });
        assert.equal(adminClaims.sub, String(adminId));
        assert.equal(adminClaims.principal, 'admin');

        const invalidAccessToken = ({ algorithm = 'HS256', audience, issuer, principal = 'customer' }) => jwt.sign(
            { id: customerId, role: 'customer', principal },
            process.env.JWT_SECRET,
            {
                algorithm,
                audience: audience || authSessionService.ACCESS_TOKEN_AUDIENCES.customer,
                expiresIn: '1h',
                issuer: issuer || authSessionService.ACCESS_TOKEN_ISSUER,
                jwtid: `invalid-access-jti-${algorithm}-${principal}-000000000000`,
                subject: String(customerId)
            }
        );
        for (const token of [
            invalidAccessToken({ issuer: 'unexpected-issuer' }),
            invalidAccessToken({ audience: authSessionService.ACCESS_TOKEN_AUDIENCES.admin }),
            invalidAccessToken({ algorithm: 'HS512' })
        ]) {
            const rejected = await jsonRequest(baseUrl, '/api/users/me', { token });
            assert.equal(rejected.status, 401);
            assert.deepEqual(rejected.body, { error: authSessionService.GENERIC_AUTH_MESSAGE });
        }

        assert.equal((await jsonRequest(baseUrl, '/api/users/login', {
            method: 'POST', body: { email: 'admin@example.test', password: adminPassword }
        })).status, 400, 'admin credentials must not create a customer session');
        assert.equal((await jsonRequest(baseUrl, '/api/auth/login', {
            method: 'POST', body: { email: 'customer@example.test', password: customerPassword }
        })).status, 401, 'customer credentials must not create an admin session');

        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: customerTokenA })).status, 200);
        assert.equal((await jsonRequest(baseUrl, '/api/users/logout', { method: 'POST', token: customerTokenA })).status, 204);
        assert.equal((await jsonRequest(baseUrl, '/api/users/logout', { method: 'POST', token: customerTokenA })).status, 204);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: customerTokenA })).status, 401);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: customerTokenB })).status, 200);

        const logoutFailureSession = await issueSession({ userId: customerId, role: 'customer', principal: 'customer' });
        const originalRevokeCurrent = authSessionService.revokeCurrentSession;
        authSessionService.revokeCurrentSession = async () => {
            throw new authSessionService.AuthSessionError(
                'AUTH_SESSION_STATE_UNAVAILABLE', 503, authSessionService.SESSION_STATE_UNAVAILABLE_MESSAGE
            );
        };
        try {
            assert.equal((await jsonRequest(baseUrl, '/api/users/logout', {
                method: 'POST', token: logoutFailureSession.token
            })).status, 503);
        } finally {
            authSessionService.revokeCurrentSession = originalRevokeCurrent;
        }

        const originalRevokeAll = authSessionService.revokeAllSessions;
        authSessionService.revokeAllSessions = async () => {
            throw new authSessionService.AuthSessionError(
                'AUTH_SESSION_STATE_UNAVAILABLE', 503, authSessionService.SESSION_STATE_UNAVAILABLE_MESSAGE
            );
        };
        try {
            assert.equal((await jsonRequest(baseUrl, '/api/users/logout-all', {
                method: 'POST', token: logoutFailureSession.token
            })).status, 503);
        } finally {
            authSessionService.revokeAllSessions = originalRevokeAll;
        }

        assert.equal((await jsonRequest(baseUrl, '/api/users/logout-all', { method: 'POST', token: customerTokenB })).status, 204);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: customerTokenB })).status, 401);
        assert.equal((await jsonRequest(baseUrl, '/api/questions/admin/all', { token: adminToken })).status, 200);

        const questionCustomer = await issueSession({ userId: customerId, role: 'customer', principal: 'customer' });
        const questionAdmin = await issueSession({ userId: adminId, role: 'admin', principal: 'admin' });
        const anonymousOptional = await jsonRequest(baseUrl, '/api/assistant/auth-probe');
        assert.equal(anonymousOptional.status, 200);
        assert.equal(anonymousOptional.body.user, null);
        const authenticatedOptional = await jsonRequest(baseUrl, '/api/assistant/auth-probe', {
            token: questionCustomer.token
        });
        assert.equal(authenticatedOptional.status, 200);
        assert.equal(authenticatedOptional.body.user.id, customerId);
        assert.equal((await jsonRequest(baseUrl, '/api/assistant/auth-probe', {
            token: questionAdmin.token
        })).status, 401);
        const successStatuses = [];
        for (const entry of questionPaths) {
            const token = entry.principal === 'customer' ? questionCustomer.token : questionAdmin.token;
            const response = await jsonRequest(baseUrl, entry.path, {
                method: entry.method,
                token,
                body: entry.body
            });
            successStatuses.push(response.status);
        }
        assert.deepEqual(successStatuses, [201, 200, 200, 200, 200]);

        assertQuestionRoute('/ask', [authenticateCustomer, questionController.askQuestion]);
        assertQuestionRoute('/user', [authenticateCustomer, questionController.getUserQuestions]);
        assertQuestionRoute('/admin/all', [
            authenticateAdmin, requireAdmin, requireCurrentAdmin, questionController.getAllQuestionsAdmin
        ]);
        assertQuestionRoute('/admin/products', [
            authenticateAdmin, requireAdmin, requireCurrentAdmin, questionController.getProductQuestionSummaryAdmin
        ]);
        assertQuestionRoute('/admin/answer/:id', [
            authenticateAdmin, requireAdmin, requireCurrentAdmin, questionController.answerQuestion
        ]);

        for (const entry of questionPaths.filter((item) => item.principal === 'admin')) {
            assert.equal((await jsonRequest(baseUrl, entry.path, {
                method: entry.method, token: questionCustomer.token, body: entry.body
            })).status, 401);
        }
        for (const entry of questionPaths.filter((item) => item.principal === 'customer')) {
            assert.equal((await jsonRequest(baseUrl, entry.path, {
                method: entry.method, token: questionAdmin.token, body: entry.body
            })).status, 401);
        }

        const revokedCustomer = await issueSession({ userId: customerId, role: 'customer', principal: 'customer' });
        const revokedAdmin = await issueSession({ userId: adminId, role: 'admin', principal: 'admin' });
        await pool.query(
            "UPDATE auth_sessions SET revoked_at = NOW(), revoke_reason = 'test' WHERE id = ANY($1::bigint[])",
            [[revokedCustomer.sessionId, revokedAdmin.sessionId]]
        );
        assert.equal((await jsonRequest(baseUrl, '/api/assistant/auth-probe', {
            token: revokedCustomer.token
        })).status, 401);
        assert.equal((await jsonRequest(baseUrl, '/api/assistant/auth-probe', {
            token: 'malformed.token'
        })).status, 401);
        const legacyCustomer = jwt.sign({ id: customerId, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const legacyAdmin = jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const expiredCustomer = jwt.sign(
            { id: customerId, role: 'customer', principal: 'customer' },
            process.env.JWT_SECRET,
            {
                algorithm: 'HS256',
                audience: authSessionService.ACCESS_TOKEN_AUDIENCES.customer,
                expiresIn: -1,
                issuer: authSessionService.ACCESS_TOKEN_ISSUER,
                jwtid: 'expired-customer-jti-value-0000000000000000',
                subject: String(customerId)
            }
        );
        const expiredAdmin = jwt.sign(
            { id: adminId, role: 'admin', principal: 'admin' },
            process.env.JWT_SECRET,
            {
                algorithm: 'HS256',
                audience: authSessionService.ACCESS_TOKEN_AUDIENCES.admin,
                expiresIn: -1,
                issuer: authSessionService.ACCESS_TOKEN_ISSUER,
                jwtid: 'expired-admin-jti-value-000000000000000000',
                subject: String(adminId)
            }
        );

        const countBeforeDenied = Number((await pool.query('SELECT COUNT(*)::int AS count FROM product_questions')).rows[0].count);
        for (const entry of questionPaths) {
            const principal = entry.principal;
            for (const token of [
                principal === 'customer' ? revokedCustomer.token : revokedAdmin.token,
                principal === 'customer' ? legacyCustomer : legacyAdmin,
                principal === 'customer' ? expiredCustomer : expiredAdmin,
                'malformed.token'
            ]) {
                assert.equal((await jsonRequest(baseUrl, entry.path, {
                    method: entry.method, token, body: entry.body
                })).status, 401, `${entry.method} ${entry.path} must reject invalid session token`);
            }
        }
        const countAfterDenied = Number((await pool.query('SELECT COUNT(*)::int AS count FROM product_questions')).rows[0].count);
        assert.equal(countAfterDenied, countBeforeDenied, 'failed auth must not reach question mutations');

        const originalVerify = authSessionService.verifyAccessToken;
        authSessionService.verifyAccessToken = async () => {
            throw new authSessionService.AuthSessionError(
                'AUTH_SESSION_STATE_UNAVAILABLE',
                503,
                authSessionService.SESSION_STATE_UNAVAILABLE_MESSAGE
            );
        };
        try {
            assert.equal((await jsonRequest(baseUrl, '/api/assistant/auth-probe', {
                token: questionCustomer.token
            })).status, 503);
            for (const entry of questionPaths) {
                assert.equal((await jsonRequest(baseUrl, entry.path, {
                    method: entry.method,
                    token: entry.principal === 'customer' ? questionCustomer.token : questionAdmin.token,
                    body: entry.body
                })).status, 503);
            }
        } finally {
            authSessionService.verifyAccessToken = originalVerify;
        }

        const passwordSession = await issueSession({ userId: customerId, role: 'customer', principal: 'customer' });
        const changePassword = await jsonRequest(baseUrl, '/api/users/change-password', {
            method: 'POST',
            token: passwordSession.token,
            body: { currentPassword: customerPassword, newPassword: 'ChangedPassword123!' }
        });
        assert.equal(changePassword.status, 200);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: passwordSession.token })).status, 401);

        const resetAccess = await issueSession({ userId: customerId, role: 'customer', principal: 'customer' });
        const resetToken = jwt.sign(
            { id: customerId, purpose: 'password_reset', jti: 'reset-purpose-jti-00000000000000000000' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const resetHash = authSessionService.hashJti(resetToken);
        await pool.query(
            `UPDATE users SET password_reset_token_hash = $1, password_reset_expires_at = NOW() + INTERVAL '1 hour'
             WHERE id = $2`,
            [resetHash, customerId]
        );
        assert.equal((await jsonRequest(baseUrl, '/api/auth/reset-password', {
            method: 'POST',
            body: { token: resetToken, newPassword: 'ResetPassword123!' }
        })).status, 200);
        assert.equal((await jsonRequest(baseUrl, '/api/users/me', { token: resetAccess.token })).status, 401);

        const sameRoleSession = await issueSession({ userId: adminId, role: 'admin', principal: 'admin' });
        await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [adminId]);
        assert.equal((await jsonRequest(baseUrl, '/api/questions/admin/all', { token: sameRoleSession.token })).status, 200);
        await pool.query("UPDATE users SET role = 'customer' WHERE id = $1", [adminId]);
        assert.equal((await jsonRequest(baseUrl, '/api/questions/admin/all', { token: sameRoleSession.token })).status, 401);
        await pool.query("UPDATE users SET role = 'admin', auth_enabled = TRUE WHERE id = $1", [adminId]);
        const disableSession = await issueSession({ userId: adminId, role: 'admin', principal: 'admin' });
        await pool.query('UPDATE users SET auth_enabled = FALSE WHERE id = $1', [adminId]);
        assert.equal((await jsonRequest(baseUrl, '/api/questions/admin/all', { token: disableSession.token })).status, 401);

        const storedHashes = await pool.query('SELECT jti_hash FROM auth_sessions');
        assert(storedHashes.rows.every((row) => /^[0-9a-f]{64}$/.test(String(row.jti_hash).trim())));
        assert.equal(storedHashes.rows.some((row) => String(row.jti_hash).includes('.')), false);

        console.log('authSessionRevocationSmoke: PASS login=4 token-validation=3 lifecycle=10 optional=6 question=5x7 state=5 shared-principal=7');
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    delete require.cache[serverModulePath];
    await pool.end();
});
