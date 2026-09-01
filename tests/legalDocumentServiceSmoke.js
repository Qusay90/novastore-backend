'use strict';

const assert = require('assert');
const crypto = require('crypto');
const {
    LEGAL_DOCUMENT_DEFINITIONS,
    LegalDocumentError,
    buildCheckoutAgreementPreview,
    buildCheckoutAgreementSnapshot,
    getCheckoutAgreementReadiness,
    getLegalDocument,
    listLegalDocuments
} = require('../services/legalDocumentService');

assert.strictEqual(LEGAL_DOCUMENT_DEFINITIONS.length, 12);
assert.strictEqual(new Set(LEGAL_DOCUMENT_DEFINITIONS.map(({ slug }) => slug)).size, 12);
assert.strictEqual(new Set(LEGAL_DOCUMENT_DEFINITIONS.map(({ path }) => path)).size, 12);
assert.strictEqual(LEGAL_DOCUMENT_DEFINITIONS.filter(({ requiredForCheckout }) => requiredForCheckout).length, 2);

const empty = listLegalDocuments({});
assert.strictEqual(empty.length, 12);
assert.ok(empty.every((document) => document.status === 'owner_external_required'));
assert.ok(empty.every((document) => document.version === null && document.text === null));
assert.deepStrictEqual(getCheckoutAgreementReadiness({}), {
    ready: false,
    requiredCount: 2,
    publishedCount: 0,
    missingSlugs: ['pre-information', 'distance-sale']
});

const env = {
    NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED: 'true',
    NOVASTORE_LEGAL_PRE_INFORMATION_VERSION: 'owner-pre-v1',
    NOVASTORE_LEGAL_PRE_INFORMATION_TEXT: 'Sahibi tarafından onaylanmış test ön bilgilendirme metni.',
    NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED: 'true',
    NOVASTORE_LEGAL_DISTANCE_SALE_VERSION: 'owner-distance-v1',
    NOVASTORE_LEGAL_DISTANCE_SALE_TEXT: 'Sahibi tarafından onaylanmış test mesafeli satış metni.'
};
assert.strictEqual(getLegalDocument('pre-information', env).status, 'published');
assert.strictEqual(getLegalDocument('missing', env), null);
assert.deepStrictEqual(getCheckoutAgreementReadiness(env), {
    ready: true,
    requiredCount: 2,
    publishedCount: 2,
    missingSlugs: []
});

const acceptedAt = new Date('2026-09-01T00:00:00.000Z');
const checkoutContext = {
    businessIdentity: {
        legalCompanyName: 'Test Nova Teknoloji Anonim Şirketi',
        taxNumber: '1234567890',
        mersisNumber: '1234567890123456',
        registeredAddress: 'Test Mahallesi Test Sokak No 1 İstanbul',
        kepAddress: 'test@hs01.kep.tr',
        phone: '+905551112233',
        email: 'test@example.test',
        customerDomain: 'https://example.test/'
    },
    delivery: {
        addressId: 301,
        fullName: 'Test Kullanıcı',
        phone: '05551234567',
        address: 'Ev: Test Mahallesi Test Sokak No 1 Merkez / Kilis'
    },
    items: [{ productId: 101, name: 'Test Telefon', quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
    totals: {
        currency: 'TRY',
        subtotal: 1000,
        bundleDiscount: 0,
        couponDiscount: 0,
        shippingFee: 49.9,
        total: 1049.9
    },
    coupon: { applied: false, code: null, discountAmount: 0 },
    sellers: [{ organizationId: 7, storeId: 8, currency: 'TRY', grossMinor: 100000, productIds: [101] }]
};
const preview = buildCheckoutAgreementPreview({ checkoutContext, env });
assert.strictEqual(preview.schemaVersion, 'checkout-agreements-v2');
assert.match(preview.snapshotSha256, /^[a-f0-9]{64}$/);
assert.match(preview.contextSha256, /^[a-f0-9]{64}$/);
assert.strictEqual(preview.documents.length, 2);
assert.match(preview.documents[0].text, /NovaStore sunucu doğrulamalı işlem özeti/);
assert.match(preview.documents[0].text, /Test Telefon/);
assert.match(preview.documents[0].text, /1049\.90 TRY/);
const snapshot = buildCheckoutAgreementSnapshot([
    { slug: 'pre-information', version: 'owner-pre-v1', accepted: true },
    { slug: 'distance-sale', version: 'owner-distance-v1', accepted: true }
], { checkoutContext, expectedSnapshotSha256: preview.snapshotSha256, env, now: () => acceptedAt });
assert.strictEqual(snapshot.schemaVersion, 'checkout-agreements-v2');
assert.strictEqual(snapshot.acceptedAt, acceptedAt.toISOString());
assert.strictEqual(snapshot.snapshotSha256, preview.snapshotSha256);
assert.strictEqual(snapshot.contextSha256, preview.contextSha256);
assert.deepStrictEqual(snapshot.documents.map(({ slug, version }) => ({ slug, version })), [
    { slug: 'pre-information', version: 'owner-pre-v1' },
    { slug: 'distance-sale', version: 'owner-distance-v1' }
]);
assert.strictEqual(
    snapshot.documents[0].sourceContentSha256,
    crypto.createHash('sha256').update(env.NOVASTORE_LEGAL_PRE_INFORMATION_TEXT).digest('hex')
);
assert.strictEqual(JSON.stringify(snapshot).includes(env.NOVASTORE_LEGAL_PRE_INFORMATION_TEXT), true);
assert.strictEqual(snapshot.context.delivery.addressId, 301);
assert.strictEqual(snapshot.context.items[0].productId, 101);

assert.throws(
    () => buildCheckoutAgreementSnapshot([], { checkoutContext, expectedSnapshotSha256: preview.snapshotSha256, env: {} }),
    (error) => error instanceof LegalDocumentError && error.code === 'CHECKOUT_LEGAL_DOCUMENTS_NOT_PUBLISHED'
);
assert.throws(
    () => buildCheckoutAgreementSnapshot([
        { slug: 'pre-information', version: 'stale-version', accepted: true },
        { slug: 'distance-sale', version: 'owner-distance-v1', accepted: true }
    ], { checkoutContext, expectedSnapshotSha256: preview.snapshotSha256, env }),
    (error) => error instanceof LegalDocumentError && error.code === 'CHECKOUT_AGREEMENT_ACCEPTANCE_REQUIRED'
);
assert.throws(
    () => buildCheckoutAgreementSnapshot([
        { slug: 'pre-information', version: 'owner-pre-v1', accepted: true },
        { slug: 'distance-sale', version: 'owner-distance-v1', accepted: true }
    ], {
        checkoutContext: { ...checkoutContext, totals: { ...checkoutContext.totals, total: 1050 } },
        expectedSnapshotSha256: preview.snapshotSha256,
        env
    }),
    (error) => error instanceof LegalDocumentError && error.code === 'CHECKOUT_AGREEMENT_SNAPSHOT_STALE'
);

console.log('legal document service smoke passed');
