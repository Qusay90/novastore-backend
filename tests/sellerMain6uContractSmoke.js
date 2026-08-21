'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createSellerRecoveryRateLimit } = require('../middlewares/sellerAuthRateLimit');
const {
    createSellerPasswordRecoveryService,
    normalizeIdentifier,
    validatePassword
} = require('../services/sellerPasswordRecoveryService');
const { applicantAuthority, createSellerApplicationService, STEP_ORDER } = require('../services/sellerApplicationService');
const { SELLER_APPLICATION_PATHS } = require('../routes/sellerApplicationRoutes');
const {
    getActiveSellerApplicationTermsRevision,
    getSellerApplicationTermsAuthority,
    normalizeSellerApplicationTermsGeneration,
    normalizeSellerApplicationTermsRevision
} = require('../config/sellerApplicationTerms');

assert.deepEqual(normalizeIdentifier(' Seller@Example.Test '), { channel: 'email', value: 'seller@example.test' });
assert.deepEqual(normalizeIdentifier('+90 (555) 111 22 33'), { channel: 'phone', value: '+905551112233' });
assert.throws(() => normalizeIdentifier('not-an-identity'), /VALIDATION_FAILED/);
assert.equal(validatePassword('Güvenli!Parola9'), 'Güvenli!Parola9');
for (const weak of ['short', 'onlylowercase9!', 'ONLYUPPERCASE9!', 'NoNumber!Password', 'NoSymbol9Password', 'Space 9!Password']) {
    assert.throws(() => validatePassword(weak), /PASSWORD_POLICY_FAILED|VALIDATION_FAILED/);
}
assert.throws(() => createSellerPasswordRecoveryService({ secret: 'short' }), /SELLER_PASSWORD_RECOVERY_SECRET_REQUIRED/);
assert.throws(() => createSellerApplicationService({ secret: 'short' }), /SELLER_APPLICATION_AUTH_SECRET_REQUIRED/);
assert.equal(normalizeSellerApplicationTermsRevision(undefined), null);
assert.equal(normalizeSellerApplicationTermsRevision('  seller-terms-approved-v7  '), 'seller-terms-approved-v7');
assert.equal(normalizeSellerApplicationTermsGeneration('7'), 7);
assert.deepEqual(getSellerApplicationTermsAuthority({
    SELLER_APPLICATION_TERMS_REVISION: 'seller-terms-approved-v7',
    SELLER_APPLICATION_TERMS_REVISION_GENERATION: '7'
}), { revision: 'seller-terms-approved-v7', generation: 7 });
assert.equal(getActiveSellerApplicationTermsRevision({
    SELLER_APPLICATION_TERMS_REVISION: 'seller-terms-approved-v7',
    SELLER_APPLICATION_TERMS_REVISION_GENERATION: '7'
}), 'seller-terms-approved-v7');
assert.equal(getActiveSellerApplicationTermsRevision({}), null);
assert.throws(() => getSellerApplicationTermsAuthority({ SELLER_APPLICATION_TERMS_REVISION: 'seller-terms-approved-v7' }), /configuration is invalid/u);
assert.throws(() => getSellerApplicationTermsAuthority({ SELLER_APPLICATION_TERMS_REVISION_GENERATION: '7' }), /configuration is invalid/u);
for (const invalidGeneration of [0, -1, '0', '1.5', 'abc', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeSellerApplicationTermsGeneration(invalidGeneration), /configuration is invalid/u);
}
for (const invalidRevision of [123, 'x'.repeat(121), 'seller-terms\ninvalid']) {
    assert.throws(() => normalizeSellerApplicationTermsRevision(invalidRevision), /configuration is invalid/u);
}
assert.equal(applicantAuthority('A'.repeat(43)), 'A'.repeat(43));
for (const invalid of [undefined, '', 'short', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '=']) {
    assert.throws(() => applicantAuthority(invalid), /APPLICANT_AUTH_REQUIRED/);
}
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
const applicationControllerSource = fs.readFileSync('controllers/sellerApplicationController.js', 'utf8');
const applicationTermsConfigSource = fs.readFileSync('config/sellerApplicationTerms.js', 'utf8');
const serverSource = fs.readFileSync('server.js', 'utf8');
const envExampleSource = fs.readFileSync('.env.example', 'utf8');
const applicationMigrationSource = fs.readFileSync('migrations/20260821_02_seller_applications.sql', 'utf8');
const termsAuthorityMigrationSource = fs.readFileSync('migrations/20260822_01_seller_application_terms_authority.sql', 'utf8');
assert.doesNotMatch(recoverySource, /\baccess_token\b|jwt\.sign|redirect|https?:\/\//iu);
assert.doesNotMatch(recoverySource, /console\.(?:log|error|warn)/u);
assert.doesNotMatch(applicationSource, /INSERT INTO seller_(?:organizations|stores|memberships)/u);
assert.doesNotMatch(applicationSource, /https?:\/\/|redirect_url|callback_url/iu);
assert.match(applicationSource, /auto_approved: false/u);
assert.match(applicationSource, /provider_unavailable/u);
assert.match(applicationSource, /seller-applicant-authority-v1/u);
assert.match(applicationSource, /applicant_authority_hash/u);
assert.match(applicationSource, /terms_revision: currentTermsRevision \|\| null/u);
assert.match(applicationSource, /staleTermsReacceptance/u);
assert.match(applicationSource, /seller-application-terms-authority-v1/u);
assert.match(applicationSource, /TERMS_REVISION_AUTHORITY_STALE/u);
assert.match(applicationControllerSource, /Applicant-Secret/u);
assert.match(serverSource, /getSellerApplicationTermsAuthority\(\)/u);
assert.doesNotMatch(serverSource, /SELLER_APPLICATION_TERMS_REVISION\s*\|\|/u);
assert.match(envExampleSource, /^SELLER_APPLICATION_TERMS_REVISION=$/mu);
assert.match(envExampleSource, /^SELLER_APPLICATION_TERMS_REVISION_GENERATION=$/mu);
assert.doesNotMatch(applicationTermsConfigSource, /seller-terms-local-test-v1/u);
assert.match(applicationMigrationSource, /uq_seller_applications_active_authority/u);
assert.doesNotMatch(applicationMigrationSource, /uq_seller_applications_active_identity/u);
assert.match(termsAuthorityMigrationSource, /seller_application_terms_authority/u);
assert.match(termsAuthorityMigrationSource, /seller_application_terms_authority_events/u);
assert.match(termsAuthorityMigrationSource, /APPEND_ONLY/u);
assert.match(termsAuthorityMigrationSource, /BEFORE TRUNCATE/u);
assert.match(recoverySource, /status = 'superseded'/u);

console.log('seller Main-6U contract smoke passed: recovery=bounded application=revisioned authority=isolated');
