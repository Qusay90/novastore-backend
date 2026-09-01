'use strict';

const assert = require('node:assert/strict');
const {
    SellerPublicLegalIdentityError,
    assertApprovedSellerPublicLegalIdentity,
    buildSellerPublicLegalIdentityContentSha256,
    normalizeApprovedSellerPublicLegalIdentity
} = require('../services/sellerPublicLegalIdentityService');

const source = Object.freeze({
    seller_legal_identity_id: 701,
    organization_id: 42,
    seller_legal_identity_version: 'seller-public-v1',
    public_legal_name: 'Test Satıcı Anonim Şirketi',
    public_trade_name: 'Test Satıcı',
    public_disclosure_text: 'Yalnızca otomatik test için kamusal satıcı açıklaması.',
    seller_legal_identity_status: 'approved',
    seller_legal_identity_approved_at: '2026-09-01T09:00:00.000Z'
});
const contentSha256 = buildSellerPublicLegalIdentityContentSha256(source);
const row = Object.freeze({
    ...source,
    seller_legal_identity_content_sha256: contentSha256
});

const normalized = normalizeApprovedSellerPublicLegalIdentity(row);
assert.deepEqual(normalized, {
    id: 701,
    organizationId: 42,
    version: 'seller-public-v1',
    publicLegalName: 'Test Satıcı Anonim Şirketi',
    publicTradeName: 'Test Satıcı',
    publicDisclosureText: 'Yalnızca otomatik test için kamusal satıcı açıklaması.',
    contentSha256,
    approvedAt: '2026-09-01T09:00:00.000Z'
});
assert.deepEqual(assertApprovedSellerPublicLegalIdentity(row, { organizationId: 42 }), normalized);

const expectRequired = (candidate, details = { organizationId: 42 }) => assert.throws(
    () => assertApprovedSellerPublicLegalIdentity(candidate, details),
    (error) => (
        error instanceof SellerPublicLegalIdentityError
        && error.code === 'SELLER_PUBLIC_LEGAL_IDENTITY_REQUIRED'
        && error.statusCode === 503
        && !JSON.stringify(error).includes('Test Satıcı')
    )
);

expectRequired({ ...row, seller_legal_identity_status: 'draft' });
expectRequired({ ...row, seller_legal_identity_content_sha256: '0'.repeat(64) });
expectRequired({ ...row, seller_legal_identity_approved_at: 'not-a-date' });
expectRequired(row, { organizationId: 43 });
expectRequired(null);

assert.notEqual(
    buildSellerPublicLegalIdentityContentSha256({
        ...source,
        public_trade_name: 'Değişmiş Ticari Ad'
    }),
    contentSha256
);

console.log('seller public legal identity smoke passed: hash=bound tenant=bound fail-closed=PASS');
