'use strict';

const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const express = require('express');
const { createSellerAccessTokenService } = require('../services/sellerAccessTokenService');
const { createSellerAuthMiddleware } = require('../middlewares/sellerAuthMiddleware');
const { createSellerAuthController } = require('../controllers/sellerAuthController');
const { createSellerAuthRouter } = require('../routes/sellerAuthRoutes');
const loginService = require('../services/sellerLoginService');
const { rotateRefreshCredential, SellerSessionError } = require('../services/sellerSessionService');

const listen = (app) => new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const request = (server, path, body, accessToken = null, requestId = null) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
        host: '127.0.0.1',
        port: server.address().port,
        path,
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
            ...(requestId ? { 'x-request-id': requestId } : {})
        }
    };
    const req = require('node:http').request(options, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.once('error', reject);
    req.end(payload);
});

;(async () => {
    assert.throws(() => createSellerAccessTokenService({ secret: 'short' }), /SELLER_ACCESS_TOKEN_SECRET_REQUIRED/u);
    const tokenService = createSellerAccessTokenService({ secret: 'seller-wave4-local-test-secret-32bytes-minimum' });
    const shortLivedTokenService = createSellerAccessTokenService({
        secret: 'seller-wave4-local-test-secret-32bytes-minimum',
        expiresIn: '2s'
    });
    assert.equal(tokenService.expiresInSeconds, 900);
    assert.equal(shortLivedTokenService.expiresInSeconds, 2);
    assert.throws(
        () => createSellerAccessTokenService({ secret: 'seller-wave4-local-test-secret-32bytes-minimum', expiresIn: '0s' }),
        /SELLER_ACCESS_TOKEN_EXPIRY_INVALID/u
    );
    assert.throws(
        () => createSellerAccessTokenService({ secret: 'seller-wave4-local-test-secret-32bytes-minimum', expiresIn: '901s' }),
        /SELLER_ACCESS_TOKEN_EXPIRY_INVALID/u
    );
    assert.throws(
        () => createSellerAccessTokenService({ secret: 'seller-wave4-local-test-secret-32bytes-minimum', expiresIn: 'invalid' }),
        /SELLER_ACCESS_TOKEN_EXPIRY_INVALID/u
    );
    const token = tokenService.issue({ sessionId: '00000000-0000-4000-8000-000000000001', userId: 41 });
    const claims = tokenService.verify(token);
    assert.equal(claims.aud, 'seller');
    assert.equal(claims.sub, '41');

    const queryCalls = [];
    const passwordHash = await bcrypt.hash('local-only-password', 4);
    let issuedSessionId = null;
    let activeSession = true;
    const client = {
        release() {},
        async query(sql, params = []) {
            queryCalls.push([sql, params]);
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM seller_memberships') && sql.includes('user_id = $3')) return { rows: [{ id: 11 }] };
            if (sql.startsWith('INSERT INTO seller_sessions')) {
                issuedSessionId = params[0];
                return { rows: [] };
            }
            if (sql.startsWith('UPDATE seller_sessions SET status')) {
                return { rows: [{ id: issuedSessionId, user_id: 41, organization_id: 7, membership_id: 11, membership_revision: 1 }] };
            }
            if (sql.startsWith('INSERT INTO seller_audit_events')) return { rows: [{ id: 101 }] };
            if (sql.startsWith('INSERT INTO seller_outbox_events')) return { rows: [{ id: 'outbox-101' }] };
            return { rows: [] };
        }
    };
    const database = {
        async query(sql) {
            if (sql.includes('FROM users user_row JOIN seller_memberships')) {
                return { rows: [{ user_id: 41, password: passwordHash, membership_id: 11, organization_id: 7, membership_revision: 1, security_stamp: 'stamp-1', organization_name: 'Yerel Satıcı' }] };
            }
            if (sql.includes('FROM seller_sessions session JOIN seller_memberships')) {
                if (!activeSession) return { rows: [] };
                return { rows: [{ session_id: issuedSessionId, user_id: 41, organization_id: 7, membership_id: 11, role_id: 2, session_status: 'active', session_expires_at: new Date(Date.now() + 60000), session_membership_revision: 1, session_security_stamp: 'stamp-1', membership_status: 'active', membership_revision: 1, security_stamp: 'stamp-1', organization_status: 'active' }] };
            }
            return { rows: [] };
        },
        async connect() { return client; }
    };
    const app = express();
    app.use(express.json({ limit: '8kb' }));
    app.locals.sellerDatabase = database;
    const auth = createSellerAuthMiddleware({ verifyAccessToken: tokenService.verify });
    const controller = createSellerAuthController({ loginService, tokenService });
    app.use('/api/seller/v1', createSellerAuthRouter({ auth, controller }));
    const server = await listen(app);
    try {
        const invalid = await request(server, '/api/seller/v1/auth/login', { identifier: 'nobody@example.test', password: 'not-a-real-password' });
        assert.equal(invalid.status, 401);
        assert.deepEqual(invalid.body, { code: 'AUTH_INVALID', error: 'AUTH_INVALID' });
        const malformed = await request(server, '/api/seller/v1/auth/refresh', { refresh_token: 'x', unexpected: true });
        assert.equal(malformed.status, 400);
        assert.deepEqual(malformed.body, { code: 'VALIDATION_FAILED', error: 'VALIDATION_FAILED' });
        const login = await request(server, '/api/seller/v1/auth/login', { identifier: 'seller@example.test', password: 'local-only-password' });
        assert.equal(login.status, 200);
        assert.equal(login.body.token_type, 'Bearer');
        assert.equal(tokenService.verify(login.body.access_token).aud, 'seller');
        assert.equal(queryCalls.some(([, params]) => params.includes(login.body.refresh_token)), false);
        const logoutCorrelationId = '11111111-1111-4111-8111-111111111111';
        const logout = await request(server, '/api/seller/v1/auth/logout', {}, login.body.access_token, logoutCorrelationId);
        assert.equal(logout.status, 200);
        assert.deepEqual(logout.body, { logged_out: true });
        const auditInsert = queryCalls.find(([sql]) => sql.startsWith('INSERT INTO seller_audit_events'));
        const outboxInsert = queryCalls.find(([sql]) => sql.startsWith('INSERT INTO seller_outbox_events'));
        assert.ok(auditInsert);
        assert.ok(outboxInsert);
        assert.equal(auditInsert[1][5], 'seller.session.revoked');
        assert.equal(auditInsert[1][9], logoutCorrelationId);
        assert.equal(auditInsert[1].some((value) => String(value).includes(login.body.refresh_token)), false);
        activeSession = false;
        const revoked = await request(server, '/api/seller/v1/auth/logout', {}, login.body.access_token);
        assert.equal(revoked.status, 401);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    const replayCalls = [];
    const replayClient = {
        release() { replayCalls.push(['release']); },
        async query(sql, params = []) {
            replayCalls.push([sql, params]);
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM seller_refresh_tokens token')) {
                return { rows: [{ token_id: 'token-1', family_id: 'family-1', generation: 1, token_status: 'consumed', token_expires_at: new Date(Date.now() + 60000), session_id: '00000000-0000-4000-8000-000000000001', current_generation: 1, family_status: 'active', family_expires_at: new Date(Date.now() + 60000), user_id: 41, organization_id: 7, membership_id: 11, session_status: 'active', session_expires_at: new Date(Date.now() + 60000), session_membership_revision: 1, session_security_stamp: 'stamp-1', membership_status: 'active', membership_revision: 1, security_stamp: 'stamp-1', organization_status: 'active' }] };
            }
            if (sql.includes("UPDATE seller_refresh_token_families SET status = 'replayed'")) return { rows: [{ id: 'family-1' }] };
            if (sql.startsWith('INSERT INTO seller_audit_events')) return { rows: [{ id: 102 }] };
            if (sql.startsWith('INSERT INTO seller_outbox_events')) return { rows: [{ id: 'outbox-102' }] };
            return { rows: [] };
        }
    };
    await assert.rejects(
        () => rotateRefreshCredential({ connect: async () => replayClient }, { presentedCredential: 'previous-refresh-token', replacementCredential: 'replacement-refresh-token' }),
        (error) => error instanceof SellerSessionError && error.code === 'REFRESH_TOKEN_REPLAY_DETECTED'
    );
    assert.equal(replayCalls.some(([sql]) => sql.startsWith('INSERT INTO seller_audit_events')), true);
    assert.equal(replayCalls.some(([sql]) => sql.startsWith('INSERT INTO seller_outbox_events')), true);
    assert.equal(replayCalls.some(([sql]) => sql === 'COMMIT'), true);
    assert.equal(replayCalls.some(([sql]) => sql === 'ROLLBACK'), false);
    assert.equal(replayCalls.some(([, params = []]) => params.some((value) => String(value).includes('previous-refresh-token') || String(value).includes('replacement-refresh-token'))), false);

    const rotatedCalls = [];
    const rotatedClient = {
        release() { rotatedCalls.push(['release']); },
        async query(sql, params = []) {
            rotatedCalls.push([sql, params]);
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM seller_refresh_tokens token')) {
                return { rows: [{ token_id: 'token-2', family_id: 'family-2', generation: 3, token_status: 'active', token_expires_at: new Date(Date.now() + 60000), session_id: '00000000-0000-4000-8000-000000000002', current_generation: 3, family_status: 'active', family_expires_at: new Date(Date.now() + 60000), user_id: 41, organization_id: 7, membership_id: 11, session_status: 'active', session_expires_at: new Date(Date.now() + 60000), session_membership_revision: 1, session_security_stamp: 'stamp-1', membership_status: 'active', membership_revision: 1, security_stamp: 'stamp-1', organization_status: 'active' }] };
            }
            if (sql.includes("SET status = 'consumed'")) return { rows: [{ id: 'token-2' }] };
            if (sql.includes('SET current_generation')) return { rows: [{ id: 'family-2' }] };
            if (sql.startsWith('INSERT INTO seller_audit_events')) return { rows: [{ id: 103 }] };
            if (sql.startsWith('INSERT INTO seller_outbox_events')) return { rows: [{ id: 'outbox-103' }] };
            return { rows: [] };
        }
    };
    const refreshCorrelationId = '22222222-2222-4222-8222-222222222222';
    const rotated = await rotateRefreshCredential({ connect: async () => rotatedClient }, {
        presentedCredential: 'rotation-previous-token',
        replacementCredential: 'rotation-replacement-token',
        auditContext: { correlationId: refreshCorrelationId }
    });
    assert.equal(rotated.generation, 4);
    const rotationAudit = rotatedCalls.find(([sql]) => sql.startsWith('INSERT INTO seller_audit_events'));
    const rotationOutbox = rotatedCalls.find(([sql]) => sql.startsWith('INSERT INTO seller_outbox_events'));
    assert.ok(rotationAudit);
    assert.ok(rotationOutbox);
    assert.equal(rotationAudit[1][5], 'seller.session.refresh_rotated');
    assert.equal(rotationAudit[1][9], refreshCorrelationId);
    assert.equal(rotationOutbox[1][6], 4);
    assert.equal(rotatedCalls.some(([sql]) => sql === 'COMMIT'), true);
    assert.equal(rotatedCalls.some(([, params = []]) => params.some((value) => String(value).includes('rotation-previous-token') || String(value).includes('rotation-replacement-token'))), false);

    const failingAuditCalls = [];
    const failingAuditClient = {
        release() { failingAuditCalls.push(['release']); },
        async query(sql, params = []) {
            failingAuditCalls.push([sql, params]);
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('FROM seller_refresh_tokens token')) return { rows: [{ token_id: 'token-3', family_id: 'family-3', generation: 1, token_status: 'active', token_expires_at: new Date(Date.now() + 60000), session_id: '00000000-0000-4000-8000-000000000003', current_generation: 1, family_status: 'active', family_expires_at: new Date(Date.now() + 60000), user_id: 41, organization_id: 7, membership_id: 11, session_status: 'active', session_expires_at: new Date(Date.now() + 60000), session_membership_revision: 1, session_security_stamp: 'stamp-1', membership_status: 'active', membership_revision: 1, security_stamp: 'stamp-1', organization_status: 'active' }] };
            if (sql.includes("SET status = 'consumed'")) return { rows: [{ id: 'token-3' }] };
            if (sql.includes('SET current_generation')) return { rows: [{ id: 'family-3' }] };
            if (sql.startsWith('INSERT INTO seller_audit_events')) throw new Error('synthetic audit insert failure');
            return { rows: [] };
        }
    };
    await assert.rejects(() => rotateRefreshCredential({ connect: async () => failingAuditClient }, { presentedCredential: 'audit-failure-previous', replacementCredential: 'audit-failure-replacement' }));
    assert.equal(failingAuditCalls.some(([sql]) => sql === 'COMMIT'), false);
    assert.equal(failingAuditCalls.some(([sql]) => sql === 'ROLLBACK'), true);
    assert.equal(failingAuditCalls.at(-1)[0], 'release');
    console.log('sellerWave4AuthHttpSmoke: PASS');
})().catch((error) => {
    console.error('sellerWave4AuthHttpSmoke: FAIL');
    console.error(error.stack);
    process.exitCode = 1;
});
