const assert = require('node:assert/strict');
const Module = require('node:module');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_category_v2_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_category_v2_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.JWT_SECRET = 'password-reset-purpose-smoke-secret';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.APP_BASE_URL = 'https://novastore.test';

let sentEmail = null;

class FakeResend {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.emails = {
            send: async (payload) => {
                sentEmail = payload;
                return { data: { id: 'test-email' } };
            }
        };
    }
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
    if (request === 'resend') {
        return { Resend: FakeResend };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const pool = require('../config/db');
const { forgotPassword, resetPassword, changePassword } = require('../controllers/authController');
Module._load = originalLoad;

const originalQuery = pool.query;

const createResponse = () => ({
    statusCode: 200,
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

const extractResetToken = () => {
    assert.ok(sentEmail && sentEmail.html, 'reset email should be sent for existing account');
    const tokenMatch = sentEmail.html.match(/reset-password\.html\?token=([^"]+)/);
    assert.ok(tokenMatch, 'reset link should contain a token');
    return tokenMatch[1];
};

(async () => {
    const resetStateWrites = [];
    const successfulResetUpdates = [];
    const passwordChangeUpdates = [];
    let activeResetHash = null;
    let activeResetExpiresAt = null;
    let currentPasswordHash = await bcrypt.hash('CurrentPassword123!', 10);

    pool.query = async (sql, params = []) => {
        const text = String(sql);

        if (text.includes('SELECT * FROM users WHERE email')) {
            assert.equal(params[0], 'customer@example.com');
            return {
                rows: [{
                    id: 42,
                    email: 'customer@example.com',
                    name: 'Guvenli Musteri',
                    role: 'customer',
                    password: currentPasswordHash
                }]
            };
        }

        if (text.includes('SELECT id, password FROM users WHERE id')) {
            assert.equal(params[0], 42);
            return { rows: [{ id: 42, password: currentPasswordHash }] };
        }

        if (/UPDATE users\s+SET password_reset_token_hash = \$1/i.test(text)) {
            assert.equal(params[2], 42);
            activeResetHash = params[0];
            activeResetExpiresAt = params[1];
            resetStateWrites.push({ sql: text, params });
            return { rows: [{ id: 42 }] };
        }

        if (/UPDATE users\s+SET password = \$1/i.test(text) && /AND password_reset_token_hash = \$3/i.test(text)) {
            assert.equal(params[1], 42);
            if (!activeResetHash || params[2] !== activeResetHash) {
                return { rows: [] };
            }
            assert.ok(activeResetExpiresAt instanceof Date);
            activeResetHash = null;
            activeResetExpiresAt = null;
            currentPasswordHash = params[0];
            successfulResetUpdates.push({ sql: text, params });
            return { rows: [{ id: 42 }] };
        }

        if (/UPDATE users\s+SET password = \$1/i.test(text) && /password_reset_token_hash = NULL/i.test(text)) {
            assert.equal(params[1], 42);
            activeResetHash = null;
            activeResetExpiresAt = null;
            currentPasswordHash = params[0];
            passwordChangeUpdates.push({ sql: text, params });
            return { rows: [] };
        }

        throw new Error(`Unexpected SQL in password reset smoke: ${text}`);
    };

    const requestResetToken = async () => {
        sentEmail = null;
        const forgotRes = createResponse();
        await forgotPassword({
            body: { email: 'customer@example.com' },
            protocol: 'https',
            get: () => 'novastore.test'
        }, forgotRes);

        assert.equal(forgotRes.statusCode, 200);
        return extractResetToken();
    };

    const resetToken = await requestResetToken();
    assert.equal(resetStateWrites.length, 1);

    const decodedResetToken = jwt.verify(resetToken, process.env.JWT_SECRET);
    assert.equal(decodedResetToken.id, 42);
    assert.equal(decodedResetToken.purpose, 'password_reset');
    assert.equal(typeof decodedResetToken.jti, 'string');
    assert.ok(decodedResetToken.jti.length >= 16);

    const loginToken = jwt.sign(
        { id: 42, role: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );

    const loginTokenResetRes = createResponse();
    await resetPassword({
        body: { token: loginToken, newPassword: 'NewPassword123!' }
    }, loginTokenResetRes);

    assert.equal(loginTokenResetRes.statusCode, 400);
    assert.match(loginTokenResetRes.payload.message, /Gecersiz|Geçersiz|bozuk/i);
    assert.equal(successfulResetUpdates.length, 0, 'login JWT must not update password');

    const legacyResetToken = jwt.sign(
        { id: 42 },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    const legacyTokenResetRes = createResponse();
    await resetPassword({
        body: { token: legacyResetToken, newPassword: 'NewPassword123!' }
    }, legacyTokenResetRes);

    assert.equal(legacyTokenResetRes.statusCode, 400);
    assert.equal(successfulResetUpdates.length, 0, 'legacy no-purpose reset token must not update password');

    const validResetRes = createResponse();
    await resetPassword({
        body: { token: resetToken, newPassword: 'NewPassword123!' }
    }, validResetRes);

    assert.equal(validResetRes.statusCode, 200);
    assert.equal(successfulResetUpdates.length, 1);
    assert.equal(successfulResetUpdates[0].params[1], 42);
    assert.ok(
        await bcrypt.compare('NewPassword123!', successfulResetUpdates[0].params[0]),
        'stored password hash should match the requested new password'
    );

    const replayResetRes = createResponse();
    await resetPassword({
        body: { token: resetToken, newPassword: 'ReplayPassword123!' }
    }, replayResetRes);

    assert.equal(replayResetRes.statusCode, 400);
    assert.match(replayResetRes.payload.message, /Gecersiz|Geçersiz|suresi|süresi/i);
    assert.equal(successfulResetUpdates.length, 1, 'same reset JWT must be single-use');

    const resetTokenBeforePasswordChange = await requestResetToken();
    assert.equal(resetStateWrites.length, 2);

    const changePasswordRes = createResponse();
    await changePassword({
        user: { id: 42 },
        body: {
            currentPassword: 'NewPassword123!',
            newPassword: 'ChangedPassword123!'
        }
    }, changePasswordRes);

    assert.equal(changePasswordRes.statusCode, 200);
    assert.equal(passwordChangeUpdates.length, 1);
    assert.equal(activeResetHash, null, 'password change must clear outstanding reset token state');

    const resetAfterPasswordChangeRes = createResponse();
    await resetPassword({
        body: {
            token: resetTokenBeforePasswordChange,
            newPassword: 'ResetAfterChange123!'
        }
    }, resetAfterPasswordChangeRes);

    assert.equal(resetAfterPasswordChangeRes.statusCode, 400);
    assert.equal(successfulResetUpdates.length, 1, 'password change must invalidate older reset links');

    console.log('passwordResetTokenPurposeSmoke: OK');
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
}).finally(() => {
    pool.query = originalQuery;
});
