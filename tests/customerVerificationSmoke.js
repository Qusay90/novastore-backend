const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://novastore_ci:novastore_ci_only@127.0.0.1:55432/novastore_ci';
process.env.DB_SSL = 'false';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.VERIFICATION_CODE_SECRET = 'customer-reset-smoke-secret-at-least-thirty-two-characters';
process.env.PUBLIC_AUTH_RATE_LIMIT_SECRET = 'public-auth-rate-limit-smoke-secret-at-least-thirty-two-characters';

const {
    hashResetCode,
    parseIdentifier
} = require('../services/customerVerificationService');
const {
    RESET_REQUEST_MESSAGE,
    createCustomerPasswordResetController
} = require('../controllers/customerVerificationController');
const {
    customerLoginRateLimit,
    customerPasswordResetCompleteRateLimit,
    customerPasswordResetRequestRateLimit,
    customerPasswordResetVerifyRateLimit
} = require('../middlewares/customerAuthRateLimit');
const userRoutes = require('../routes/userRoutes');

const createResponse = () => ({
    statusCode: null,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

const normalizedSql = (sql) => String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

class FakeResetPool {
    constructor() {
        this.users = [
            {
                id: 7,
                full_name: 'Customer Example',
                email: 'customer@example.test',
                phone: '+905551112233',
                role: 'customer',
                password: 'old-password-hash',
                password_reset_token_hash: null,
                password_reset_expires_at: null
            }
        ];
        this.sessions = [
            { user_id: 7, revoked_at: null, revoke_reason: null, expires_at: new Date('2030-01-01T00:00:00.000Z') }
        ];
    }

    async connect() {
        return { query: this.query.bind(this), release() {} };
    }

    async query(sql, params = []) {
        const text = normalizedSql(sql);
        if (text === 'begin' || text === 'commit' || text === 'rollback') return { rows: [] };
        if (text.startsWith('select id, full_name, name, email, phone, password_reset_token_hash')) {
            const identifier = String(params[0] || '').toLowerCase();
            const byEmail = text.includes('lower(btrim(email))');
            const rows = this.users.filter((user) => (
                user.role === 'customer'
                && (byEmail
                    ? user.email.toLowerCase() === identifier
                    : user.phone.replace(/\D/g, '') === identifier.replace(/\D/g, ''))
            ));
            return { rows: rows.map((row) => ({ ...row })) };
        }
        if (text.startsWith('update users set password_reset_token_hash = $1, password_reset_expires_at = $2')) {
            const user = this.users.find((row) => row.id === Number(params[2]));
            if (user) {
                user.password_reset_token_hash = params[0];
                user.password_reset_expires_at = new Date(params[1]);
            }
            return { rows: [], rowCount: user ? 1 : 0 };
        }
        if (text.startsWith('update users set password = $1, password_reset_token_hash = null')) {
            const [password, userId, codeHash, now] = params;
            const user = this.users.find((row) => (
                row.id === Number(userId)
                && row.password_reset_token_hash === codeHash
                && new Date(row.password_reset_expires_at).getTime() > new Date(now).getTime()
            ));
            if (!user) return { rows: [], rowCount: 0 };
            user.password = password;
            user.password_reset_token_hash = null;
            user.password_reset_expires_at = null;
            return { rows: [{ id: user.id }], rowCount: 1 };
        }
        if (text.startsWith('update auth_sessions set revoked_at')) {
            for (const session of this.sessions) {
                if (session.user_id === Number(params[0]) && !session.revoked_at) {
                    session.revoked_at = new Date('2026-07-30T10:00:00.000Z');
                    session.revoke_reason = 'password_reset';
                }
            }
            return { rows: [], rowCount: this.sessions.length };
        }
        if (text.startsWith('update users set password_reset_token_hash = null')) {
            const user = this.users.find((row) => row.id === Number(params[0]) && row.password_reset_token_hash === params[1]);
            if (user) {
                user.password_reset_token_hash = null;
                user.password_reset_expires_at = null;
            }
            return { rows: [], rowCount: user ? 1 : 0 };
        }
        throw new Error(`Unexpected test query: ${text}`);
    }
}

const routeHandlers = (routePath) => {
    const layer = userRoutes.stack.find((entry) => entry.route?.path === routePath);
    return layer ? layer.route.stack.map((entry) => entry.handle) : null;
};

(async () => {
    assert.deepEqual(parseIdentifier(' Customer@Example.Test '), { channel: 'email', value: 'customer@example.test' });
    assert.deepEqual(parseIdentifier('0555 111 22 33'), { channel: 'sms', value: '+905551112233' });
    assert.equal(parseIdentifier('not an identifier'), null);

    const pool = new FakeResetPool();
    const sent = [];
    const controller = createCustomerPasswordResetController({
        queryable: pool,
        delivery: {
            isConfigured: () => true,
            async sendCode(challenge) { sent.push({ ...challenge }); }
        },
        env: process.env,
        publicResponseDelayMs: 0,
        now: () => new Date('2026-07-30T10:00:00.000Z'),
        codeGenerator: () => '123456',
        challengeIdGenerator: () => 91,
        passwordHasher: async (password) => `hash:${password}`
    });

    const knownRequest = createResponse();
    await controller.requestPasswordReset({ body: { identifier: 'Customer@Example.Test' } }, knownRequest);
    const unknownRequest = createResponse();
    await controller.requestPasswordReset({ body: { identifier: 'absent@example.test' } }, unknownRequest);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(knownRequest.statusCode, 202);
    assert.deepEqual(knownRequest.payload, { message: RESET_REQUEST_MESSAGE });
    assert.deepEqual(unknownRequest.payload, knownRequest.payload, 'account existence must not alter the public request response');
    assert.equal(sent.length, 1, 'only a known account may reach the injected delivery fake');
    assert.equal(sent[0].challengeId, 91);
    assert.equal(sent[0].code, '123456');
    assert.equal(pool.users[0].password_reset_token_hash, hashResetCode({ userId: 7, code: '123456', env: process.env }));
    assert.equal(JSON.stringify(pool.users[0]).includes('123456'), false, 'the reset code must not be persisted in plaintext');

    const validCode = createResponse();
    await controller.verifyPasswordReset({ body: { identifier: 'customer@example.test', code: '123456' } }, validCode);
    assert.equal(validCode.statusCode, 200);
    assert.equal(validCode.payload.valid, true);
    assert(pool.users[0].password_reset_token_hash, 'verification must not consume a code');

    const invalidKnown = createResponse();
    await controller.verifyPasswordReset({ body: { identifier: 'customer@example.test', code: '654321' } }, invalidKnown);
    const invalidUnknown = createResponse();
    await controller.verifyPasswordReset({ body: { identifier: 'absent@example.test', code: '654321' } }, invalidUnknown);
    assert.equal(invalidKnown.statusCode, 400);
    assert.equal(invalidUnknown.statusCode, 400);
    assert.deepEqual(invalidKnown.payload, invalidUnknown.payload, 'unknown accounts and wrong codes must share the public error');
    assert.equal(JSON.stringify(invalidKnown.payload).includes('654321'), false);

    const complete = createResponse();
    await controller.completePasswordResetWithCode({
        body: { identifier: 'customer@example.test', code: '123456', newPassword: 'SafePassword7' }
    }, complete);
    assert.equal(complete.statusCode, 200);
    assert.equal(pool.users[0].password, 'hash:SafePassword7');
    assert.equal(pool.users[0].password_reset_token_hash, null);
    assert(pool.sessions.every((session) => session.revoked_at && session.revoke_reason === 'password_reset'));

    const replay = createResponse();
    await controller.completePasswordResetWithCode({
        body: { identifier: 'customer@example.test', code: '123456', newPassword: 'AnotherPassword8' }
    }, replay);
    assert.equal(replay.statusCode, 400);
    assert.deepEqual(replay.payload, invalidKnown.payload, 'a consumed code must be indistinguishable from another invalid code');

    const unavailable = createCustomerPasswordResetController({
        queryable: new FakeResetPool(),
        delivery: { isConfigured: () => false },
        env: process.env,
        publicResponseDelayMs: 0
    });
    const unavailableResponse = createResponse();
    await unavailable.requestPasswordReset({ body: { identifier: 'customer@example.test' } }, unavailableResponse);
    assert.equal(unavailableResponse.statusCode, 503);
    assert.equal(JSON.stringify(unavailableResponse.payload).includes('provider'), false);

    assert.deepEqual(routeHandlers('/login'), [customerLoginRateLimit, routeHandlers('/login')[1]]);
    for (const [routePath, limiter] of [
        ['/password-reset/request', customerPasswordResetRequestRateLimit],
        ['/password-reset/verify', customerPasswordResetVerifyRateLimit],
        ['/password-reset/complete', customerPasswordResetCompleteRateLimit]
    ]) {
        const handlers = routeHandlers(routePath);
        assert(handlers, `${routePath} must remain wired`);
        assert.equal(handlers.length, 2);
        assert.equal(handlers[0], limiter);
    }
    assert.equal(routeHandlers('/verification/email/send'), null, 'verification wiring remains deferred');
    assert.equal(routeHandlers('/verification/phone/verify'), null, 'verification wiring remains deferred');

    console.log('customerVerificationSmoke: PASS reset-only-generic-single-use-session-revocation-route-wiring-verification-deferred');
})().catch((error) => {
    console.error(`customerVerificationSmoke: FAIL ${error.stack || error.message}`);
    process.exitCode = 1;
});
