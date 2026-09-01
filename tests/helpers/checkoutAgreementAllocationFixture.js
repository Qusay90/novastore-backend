'use strict';

const crypto = require('crypto');
const {
    normalizeCheckoutAgreementContext,
    stableStringify
} = require('../../services/legalDocumentService');

const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

const buildVerifiedCheckoutAgreementAllocationFixture = () => {
    const platformAllocation = {
        storeId: 501,
        storeSlug: 'novastore-platform',
        currency: 'TRY',
        grossMinor: 100000,
        productIds: [101],
        items: [{ sourceItemIndex: 0, productId: 101, quantity: 1, unitPriceMinor: 100000 }]
    };
    const context = normalizeCheckoutAgreementContext({
        businessIdentity: {
            legalCompanyName: 'Test Nova Teknoloji Anonim Şirketi',
            tradeName: 'NovaStore Test',
            taxNumber: '1234567890',
            taxOffice: 'Test Vergi Dairesi',
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
            email: 'customer@example.test',
            phone: '05551234567',
            address: 'Test Mahallesi Test Sokak No 1 Merkez / Kilis'
        },
        items: [{
            productId: 101,
            name: 'Test Telefon',
            quantity: 1,
            unitPrice: 1000,
            lineTotal: 1000
        }],
        totals: {
            currency: 'TRY',
            subtotal: 1000,
            bundleDiscount: 0,
            couponDiscount: 0,
            shippingFee: 49.9,
            total: 1049.9
        },
        coupon: { applied: false, code: null, discountAmount: 0 },
        platformAllocation,
        sellers: []
    });
    return {
        checkoutAgreementSnapshot: {
            schemaVersion: 'checkout-agreements-v2',
            contextSha256: sha256(stableStringify(context)),
            context
        },
        platformAllocation,
        sellerProjection: []
    };
};

const buildLegacyImplicitPlatformAgreementFixture = () => {
    const current = buildVerifiedCheckoutAgreementAllocationFixture();
    const legacyContext = JSON.parse(JSON.stringify(current.checkoutAgreementSnapshot.context));
    delete legacyContext.platformAllocation;
    return {
        checkoutAgreementSnapshot: {
            schemaVersion: 'checkout-agreements-v2',
            contextSha256: sha256(stableStringify(legacyContext)),
            context: legacyContext
        },
        sellerProjection: []
    };
};

module.exports = Object.freeze({
    buildLegacyImplicitPlatformAgreementFixture,
    buildVerifiedCheckoutAgreementAllocationFixture
});
