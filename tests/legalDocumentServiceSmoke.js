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
const {
    SellerPublicLegalIdentityError,
    assertApprovedSellerPublicLegalIdentity,
    buildSellerPublicLegalIdentityContentSha256
} = require('../services/sellerPublicLegalIdentityService');

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

const businessIdentityEnv = {
    BUSINESS_LEGAL_COMPANY_NAME: 'Test Nova Teknoloji Anonim Şirketi',
    BUSINESS_TRADE_NAME: 'NovaStore Test',
    BUSINESS_TAX_VKN: '1234567890',
    BUSINESS_TAX_OFFICE: 'Kadıköy Test Vergi Dairesi',
    BUSINESS_MERSIS_NUMBER: '1234567890123456',
    BUSINESS_REGISTERED_ADDRESS: 'Test Mahallesi Test Sokak No 1 İstanbul',
    BUSINESS_KEP_ADDRESS: 'test@hs01.kep.tr',
    BUSINESS_PHONE: '+905551112233',
    BUSINESS_EMAIL: 'test@example.test',
    CUSTOMER_PUBLIC_DOMAIN: 'https://example.test/'
};
const env = {
    ...businessIdentityEnv,
    NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED: 'true',
    NOVASTORE_LEGAL_PRE_INFORMATION_VERSION: 'owner-pre-v1',
    NOVASTORE_LEGAL_PRE_INFORMATION_TEXT: 'Aracı: {{business.legalCompanyName}} · Ticari unvan: {{business.tradeName}} · Vergi dairesi: {{business.taxOffice}}.',
    NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED: 'true',
    NOVASTORE_LEGAL_DISTANCE_SALE_VERSION: 'owner-distance-v1',
    NOVASTORE_LEGAL_DISTANCE_SALE_TEXT: 'Müşteri alan adı: {{business.customerDomain}}.'
};
const preInformation = getLegalDocument('pre-information', env);
assert.strictEqual(preInformation.status, 'published');
assert.match(preInformation.text, /Test Nova Teknoloji Anonim Şirketi/);
assert.match(preInformation.text, /NovaStore Test/);
assert.match(preInformation.text, /Kadıköy Test Vergi Dairesi/);
assert.doesNotMatch(preInformation.text, /\{\{/);
assert.strictEqual(
    preInformation.sourceTemplateSha256,
    crypto.createHash('sha256').update(env.NOVASTORE_LEGAL_PRE_INFORMATION_TEXT).digest('hex')
);
assert.strictEqual(
    preInformation.renderedContentSha256,
    crypto.createHash('sha256').update(preInformation.text).digest('hex')
);
assert.strictEqual(getLegalDocument('missing', env), null);
assert.deepStrictEqual(getCheckoutAgreementReadiness(env), {
    ready: true,
    requiredCount: 2,
    publishedCount: 2,
    missingSlugs: []
});

const withoutTaxOffice = { ...env };
delete withoutTaxOffice.BUSINESS_TAX_OFFICE;
assert.strictEqual(
    getLegalDocument('distance-sale', withoutTaxOffice).status,
    'published',
    'taxOffice kullanılmayan şablon için isteğe bağlı kalmalı'
);
assert.strictEqual(
    getLegalDocument('pre-information', withoutTaxOffice).status,
    'owner_external_required',
    'taxOffice kullanan şablon değer yokken başarısız-kapalı kalmalı'
);
const withoutTradeName = { ...env };
delete withoutTradeName.BUSINESS_TRADE_NAME;
assert.strictEqual(getLegalDocument('pre-information', withoutTradeName).status, 'owner_external_required');
for (const invalidTemplate of [
    '{{business.unknownField}}',
    '{{process.env.SECRET}}',
    '{{business.legalCompanyName}'
]) {
    assert.strictEqual(getLegalDocument('pre-information', {
        ...env,
        NOVASTORE_LEGAL_PRE_INFORMATION_TEXT: invalidTemplate
    }).status, 'owner_external_required');
}

const acceptedAt = new Date('2026-09-01T00:00:00.000Z');
const sellerLegalIdentitySource = {
    version: 'seller-public-v1',
    publicLegalName: 'Test Satıcı Teknoloji Limited Şirketi',
    publicTradeName: 'Test Satıcı Mağazası',
    publicDisclosureText: 'Bu satıcı kimliği yalnız yerel sözleşme doğrulaması için onaylanmıştır.'
};
const sellerLegalIdentity = {
    id: 71,
    organizationId: 7,
    ...sellerLegalIdentitySource,
    contentSha256: buildSellerPublicLegalIdentityContentSha256(sellerLegalIdentitySource),
    approvedAt: '2026-09-01T00:00:00.000Z'
};
const approvedSellerLegalIdentity = {
    ...sellerLegalIdentity,
    status: 'approved'
};
assert.strictEqual(
    assertApprovedSellerPublicLegalIdentity(approvedSellerLegalIdentity, { organizationId: 7 }).organizationId,
    7
);
assert.throws(
    () => assertApprovedSellerPublicLegalIdentity(approvedSellerLegalIdentity, { organizationId: 8 }),
    (error) => error instanceof SellerPublicLegalIdentityError
        && error.code === 'SELLER_PUBLIC_LEGAL_IDENTITY_REQUIRED'
);
const checkoutContext = {
    businessIdentity: {
        legalCompanyName: 'Test Nova Teknoloji Anonim Şirketi',
        tradeName: 'NovaStore Test',
        taxNumber: '1234567890',
        taxOffice: 'Kadıköy Test Vergi Dairesi',
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
        email: 'test-kullanici@example.test',
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
    sellers: [{
        organizationId: 7,
        organizationDisplayName: 'Test Satıcı Organizasyonu',
        storeId: 8,
        storeDisplayName: 'Test Satıcı Mağazası',
        legalIdentity: sellerLegalIdentity,
        currency: 'TRY',
        grossMinor: 100000,
        productIds: [101]
    }]
};
const preview = buildCheckoutAgreementPreview({ checkoutContext, env });
assert.strictEqual(preview.schemaVersion, 'checkout-agreements-v2');
assert.match(preview.snapshotSha256, /^[a-f0-9]{64}$/);
assert.match(preview.contextSha256, /^[a-f0-9]{64}$/);
assert.strictEqual(preview.documents.length, 2);
assert.match(preview.documents[0].text, /NovaStore sunucu doğrulamalı işlem özeti/);
assert.match(preview.documents[0].text, /Test Telefon/);
assert.match(preview.documents[0].text, /1049\.90 TRY/);
assert.match(preview.documents[0].text, /Ticari unvan: NovaStore Test/);
assert.match(preview.documents[0].text, /Vergi dairesi: Kadıköy Test Vergi Dairesi/);
assert.match(preview.documents[0].text, /E-posta: test-kullanici@example\.test/);
assert.match(preview.documents[0].text, /Test Satıcı Teknoloji Limited Şirketi/);
assert.match(preview.documents[0].text, new RegExp(sellerLegalIdentity.contentSha256));
assert.strictEqual(preview.context.businessIdentity.tradeName, 'NovaStore Test');
assert.strictEqual(preview.context.businessIdentity.taxOffice, 'Kadıköy Test Vergi Dairesi');
assert.strictEqual(preview.context.delivery.email, 'test-kullanici@example.test');
assert.strictEqual(preview.context.sellers[0].legalIdentity.organizationId, 7);
assert.strictEqual(preview.context.sellers[0].legalIdentity.contentSha256, sellerLegalIdentity.contentSha256);
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
    snapshot.documents[0].sourceTemplateSha256,
    crypto.createHash('sha256').update(env.NOVASTORE_LEGAL_PRE_INFORMATION_TEXT).digest('hex')
);
assert.strictEqual(snapshot.documents[0].sourceContentSha256, preInformation.renderedContentSha256);
assert.strictEqual(JSON.stringify(snapshot).includes(env.NOVASTORE_LEGAL_PRE_INFORMATION_TEXT), false);
assert.strictEqual(JSON.stringify(snapshot).includes(preInformation.text), true);
assert.strictEqual(snapshot.context.delivery.addressId, 301);
assert.strictEqual(snapshot.context.delivery.email, 'test-kullanici@example.test');
assert.strictEqual(snapshot.context.items[0].productId, 101);
assert.strictEqual(snapshot.context.sellers[0].legalIdentity.organizationId, 7);
assert.strictEqual(snapshot.context.sellers[0].legalIdentity.publicLegalName, sellerLegalIdentity.publicLegalName);

for (const invalidCheckoutContext of [
    {
        ...checkoutContext,
        delivery: { ...checkoutContext.delivery, email: 'gecersiz-email' }
    },
    {
        ...checkoutContext,
        sellers: [{
            ...checkoutContext.sellers[0],
            legalIdentity: { ...sellerLegalIdentity, organizationId: 99 }
        }]
    },
    {
        ...checkoutContext,
        sellers: [{
            ...checkoutContext.sellers[0],
            legalIdentity: { ...sellerLegalIdentity, contentSha256: '0'.repeat(64) }
        }]
    },
    {
        ...checkoutContext,
        sellers: [{ ...checkoutContext.sellers[0], legalIdentity: null }]
    }
]) {
    assert.throws(
        () => buildCheckoutAgreementPreview({ checkoutContext: invalidCheckoutContext, env }),
        (error) => error instanceof LegalDocumentError && error.code === 'CHECKOUT_AGREEMENT_CONTEXT_INVALID'
    );
}

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
