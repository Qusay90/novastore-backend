'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createSellerRecoveryRateLimit } = require('../middlewares/sellerAuthRateLimit');
const {
    createSellerPasswordRecoveryService,
    normalizeIdentifier,
    validatePassword
} = require('../services/sellerPasswordRecoveryService');
const { createSellerApplicationService, STEP_ORDER } = require('../services/sellerApplicationService');
const { SELLER_APPLICATION_PATHS } = require('../routes/sellerApplicationRoutes');

assert.deepEqual(normalizeIdentifier(' Seller@Example.Test '), { channel: 'email', value: 'seller@example.test' });
assert.deepEqual(normalizeIdentifier('+90 (555) 111 22 33'), { channel: 'phone', value: '+905551112233' });
assert.throws(() => normalizeIdentifier('not-an-identity'), /VALIDATION_FAILED/);
assert.equal(validatePassword('Güvenli!Parola9'), 'Güvenli!Parola9');
for (const weak of ['short', 'onlylowercase9!', 'ONLYUPPERCASE9!', 'NoNumber!Password', 'NoSymbol9Password', 'Space 9!Password']) {
    assert.throws(() => validatePassword(weak), /PASSWORD_POLICY_FAILED|VALIDATION_FAILED/);
}
assert.throws(() => createSellerPasswordRecoveryService({ secret: 'short' }), /SELLER_PASSWORD_RECOVERY_SECRET_REQUIRED/);
assert.throws(() => createSellerApplicationService({ secret: 'short' }), /SELLER_APPLICATION_AUTH_SECRET_REQUIRED/);
assert.deepEqual(STEP_ORDER, ['identity', 'business', 'contact', 'agreements', 'documents', 'payout', 'submission']);
assert.deepEqual(SELLER_APPLICATION_PATHS, [
    '/applications',
    '/applications/current',
    '/applications/current/steps/:step',
    '/applications/current/verifications/:channel/commands'
]);

const middleware = createSellerRecoveryRateLimit({ windowMs: 1000, ipMaxRequests: 10, identifierMaxRequests: 1, now: () => 100 });
const response = () => ({
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    set(name, value) { this.headers[name] = value; }
});
let continued = 0;
middleware({ ip: '127.0.0.1', body: { identifier: 'same@example.test' } }, response(), () => { continued += 1; });
const limited = response();
middleware({ ip: '127.0.0.2', body: { identifier: 'same@example.test' } }, limited, () => { continued += 1; });
assert.equal(continued, 1);
assert.equal(limited.statusCode, 202);
assert.deepEqual(limited.payload, { accepted: true });
assert.ok(Number(limited.headers['Retry-After']) >= 1);

const recoverySource = fs.readFileSync('services/sellerPasswordRecoveryService.js', 'utf8');
const applicationSource = fs.readFileSync('services/sellerApplicationService.js', 'utf8');
assert.doesNotMatch(recoverySource, /\baccess_token\b|jwt\.sign|redirect|https?:\/\//iu);
assert.doesNotMatch(recoverySource, /console\.(?:log|error|warn)/u);
assert.doesNotMatch(applicationSource, /INSERT INTO seller_(?:organizations|stores|memberships)/u);
assert.doesNotMatch(applicationSource, /https?:\/\/|redirect_url|callback_url/iu);
assert.match(applicationSource, /auto_approved: false/u);
assert.match(applicationSource, /provider_unavailable/u);

console.log('seller Main-6U contract smoke passed: recovery=bounded application=revisioned authority=isolated');
