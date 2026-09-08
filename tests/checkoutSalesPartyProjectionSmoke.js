'use strict';

const assert = require('node:assert/strict');

Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://novastore_ci:novastore_ci_only@127.0.0.1:55432/novastore_ci',
    DB_SSL: 'false',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false'
});

const {
    CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED,
    SellerOrderProjectionError,
    assertSingleFulfillmentSalesParty,
    buildCheckoutSalesPartyProjection,
    buildSellerOrderProjection
} = require('../services/sellerOrderProjectionService');
const {
    buildSellerPublicLegalIdentityContentSha256
} = require('../services/sellerPublicLegalIdentityService');
const {
    LegalDocumentError,
    normalizeCheckoutAgreementContext,
    renderCheckoutContext
} = require('../services/legalDocumentService');

const sellerIdentity = Object.freeze({
    version: 'allocation-v1',
    publicLegalName: 'Synthetic Seller Limited Şirketi',
    publicTradeName: 'Synthetic Seller',
    publicDisclosureText: 'Yalnız yerel satış tarafı dağılım testi için kamusal açıklama.'
});
const sellerIdentityHash = buildSellerPublicLegalIdentityContentSha256(sellerIdentity);

const platformRow = (productId, overrides = {}) => ({
    product_id: productId,
    product_store_id: 501,
    legacy_store_id: 501,
    legacy_store_slug: 'novastore-platform',
    legacy_store_is_active: true,
    legacy_store_deleted_at: null,
    seller_store_id: null,
    ...overrides
});

const sellerRow = (productId, overrides = {}) => ({
    product_id: productId,
    product_store_id: 601,
    legacy_store_id: 601,
    legacy_store_slug: 'seller-store',
    legacy_store_is_active: true,
    legacy_store_deleted_at: null,
    seller_store_id: 701,
    organization_id: 801,
    seller_store_display_name: 'Synthetic Seller Store',
    seller_store_status: 'active',
    seller_store_closed_at: null,
    seller_organization_display_name: 'Synthetic Seller Organization',
    seller_organization_status: 'active',
    seller_organization_closed_at: null,
    seller_legal_identity_id: 901,
    seller_legal_identity_version: sellerIdentity.version,
    public_legal_name: sellerIdentity.publicLegalName,
    public_trade_name: sellerIdentity.publicTradeName,
    public_disclosure_text: sellerIdentity.publicDisclosureText,
    seller_legal_identity_content_sha256: sellerIdentityHash,
    seller_legal_identity_status: 'approved',
    seller_legal_identity_approved_at: '2026-09-01T00:00:00.000Z',
    offer_id: 1001,
    offer_status: 'active',
    variant_id: 1101,
    variant_status: 'active',
    ...overrides
});

const pricedItem = (id, price, name = `Product ${id}`) => ({
    id,
    name,
    quantity: 1,
    price,
    line_total: price
});

const queryClient = (rows) => ({
    async query(sql, params) {
        assert.match(sql, /LEFT JOIN stores legacy_store/i);
        assert.match(sql, /LEFT JOIN seller_stores seller_store\s+ON seller_store\.legacy_store_id = product\.store_id/i);
        assert.doesNotMatch(sql, /seller_store\.legacy_store_id = product\.store_id\s+AND seller_store\.closed_at IS NULL/i);
        assert.deepEqual(params.length, 1);
        return { rows };
    }
});

const businessIdentity = Object.freeze({
    legalCompanyName: 'Synthetic Platform Anonim Şirketi',
    tradeName: 'Synthetic Platform',
    taxNumber: '1234567890',
    taxOffice: 'Test Vergi Dairesi',
    mersisNumber: '1234567890123456',
    registeredAddress: 'Synthetic registered address for local validation',
    kepAddress: 'platform@example.test',
    phone: '+905551110000',
    email: 'platform@example.test',
    customerDomain: 'https://example.test/'
});

const toCheckoutContext = (items, projection) => ({
    businessIdentity,
    delivery: {
        addressId: 1,
        fullName: 'Synthetic Customer',
        email: 'customer@example.test',
        phone: '05551110000',
        address: 'Synthetic delivery address'
    },
    items: items.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        lineTotal: item.line_total
    })),
    totals: {
        currency: 'TRY',
        subtotal: items.reduce((sum, item) => sum + item.line_total, 0),
        bundleDiscount: 0,
        couponDiscount: 0,
        shippingFee: 0,
        total: items.reduce((sum, item) => sum + item.line_total, 0)
    },
    coupon: { applied: false, code: null, discountAmount: 0 },
    platformAllocation: projection.platformAllocation
        ? {
            currency: projection.platformAllocation.currency,
            grossMinor: projection.platformAllocation.grossMinor,
            productIds: projection.platformAllocation.productIds
        }
        : null,
    sellers: projection.sellerProjection.map((seller) => ({
        organizationId: seller.organizationId,
        organizationDisplayName: seller.organizationDisplayName,
        storeId: seller.storeId,
        storeDisplayName: seller.storeDisplayName,
        legalIdentity: seller.legalIdentity,
        currency: seller.currency,
        grossMinor: seller.grossMinor,
        productIds: seller.productIds
    }))
});

const expectProjectionUnavailable = async (promise, reason) => assert.rejects(
    promise,
    (error) => (
        error instanceof SellerOrderProjectionError
        && error.code === 'SELLER_ORDER_PROJECTION_UNAVAILABLE'
        && error.details?.reason === reason
    )
);

const expectAgreementInvalid = (context) => assert.throws(
    () => normalizeCheckoutAgreementContext(context),
    (error) => error instanceof LegalDocumentError && error.code === 'CHECKOUT_AGREEMENT_CONTEXT_INVALID'
);

const expectUnsupportedFulfillment = (projection, expectedPartyCount) => assert.throws(
    () => assertSingleFulfillmentSalesParty(projection),
    (error) => (
        error instanceof SellerOrderProjectionError
        && error.code === CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED
        && error.statusCode === 409
        && error.details?.fulfillmentSalesPartyCount === expectedPartyCount
    )
);

(async () => {
    const allPlatformItems = [pricedItem(101, 10), pricedItem(102, 20)];
    const allPlatformRows = [platformRow(101), platformRow(102)];
    const allPlatform = await buildCheckoutSalesPartyProjection(
        queryClient(allPlatformRows),
        allPlatformItems
    );
    assert.deepEqual(allPlatform.sellerProjection, []);
    assert.deepEqual(allPlatform.platformAllocation.productIds, [101, 102]);
    assert.equal(allPlatform.platformAllocation.grossMinor, 3000);
    assert.deepEqual(assertSingleFulfillmentSalesParty(allPlatform), {
        kind: 'platform',
        fulfillmentSalesPartyCount: 1,
        sellerStoreCount: 0
    });
    assert.deepEqual(
        await buildSellerOrderProjection(queryClient(allPlatformRows), allPlatformItems),
        [],
        'legacy Seller-only projection remains compatible for platform-only carts'
    );
    const normalizedAllPlatform = normalizeCheckoutAgreementContext(
        toCheckoutContext(allPlatformItems, allPlatform)
    );
    assert.deepEqual(normalizedAllPlatform.platformAllocation.productIds, [101, 102]);
    assert.match(renderCheckoutContext(normalizedAllPlatform), /Platform satıcısı: Synthetic Platform Anonim Şirketi/);

    const mixedItems = [pricedItem(101, 20, 'Platform Product'), pricedItem(201, 10, 'Seller Product')];
    const mixed = await buildCheckoutSalesPartyProjection(
        queryClient([platformRow(101), sellerRow(201)]),
        mixedItems
    );
    assert.deepEqual(mixed.platformAllocation.productIds, [101]);
    assert.equal(mixed.platformAllocation.grossMinor, 2000);
    assert.equal(mixed.sellerProjection.length, 1);
    assert.deepEqual(mixed.sellerProjection[0].productIds, [201]);
    assert.equal(mixed.sellerProjection[0].grossMinor, 1000);
    expectUnsupportedFulfillment(mixed, 2);
    const mixedContext = toCheckoutContext(mixedItems, mixed);
    const normalizedMixed = normalizeCheckoutAgreementContext(mixedContext);
    const mixedText = renderCheckoutContext(normalizedMixed);
    assert.match(mixedText, /Platform satıcısı: Synthetic Platform Anonim Şirketi/);
    assert.match(mixedText, /Pazaryeri satıcısı: Synthetic Seller Limited Şirketi/);
    assert.doesNotMatch(mixedText, /ayrı pazaryeri satıcısı bulunmuyor/);

    const sellerOnlyItems = [pricedItem(202, 15, 'Seller-only Product')];
    const sellerOnly = await buildCheckoutSalesPartyProjection(
        queryClient([sellerRow(202)]),
        sellerOnlyItems
    );
    assert.equal(sellerOnly.platformAllocation, null);
    assert.deepEqual(sellerOnly.sellerProjection[0].productIds, [202]);
    assert.deepEqual(assertSingleFulfillmentSalesParty(sellerOnly), {
        kind: 'seller',
        fulfillmentSalesPartyCount: 1,
        sellerStoreCount: 1
    });
    assert.throws(
        () => assertSingleFulfillmentSalesParty({
            sellerProjection: [sellerOnly.sellerProjection[0], sellerOnly.sellerProjection[0]],
            platformAllocation: null
        }),
        (error) => (
            error.code === CHECKOUT_MULTI_FULFILLMENT_UNSUPPORTED
            && error.details?.hasDuplicateSellerAllocation === true
        )
    );
    const sellerOnlyText = renderCheckoutContext(normalizeCheckoutAgreementContext(
        toCheckoutContext(sellerOnlyItems, sellerOnly)
    ));
    assert.doesNotMatch(sellerOnlyText, /Platform satıcısı:/);
    assert.match(sellerOnlyText, /Pazaryeri satıcısı: Synthetic Seller Limited Şirketi/);

    const multiSeller = await buildCheckoutSalesPartyProjection(
        queryClient([
            sellerRow(203),
            sellerRow(204, {
                product_store_id: 602,
                legacy_store_id: 602,
                legacy_store_slug: 'seller-store-b',
                seller_store_id: 702,
                organization_id: 802,
                seller_store_display_name: 'Synthetic Seller Store B',
                seller_organization_display_name: 'Synthetic Seller Organization B',
                seller_legal_identity_id: 902,
                offer_id: 1002,
                variant_id: 1102
            })
        ]),
        [pricedItem(203, 10), pricedItem(204, 20)]
    );
    assert.equal(multiSeller.sellerProjection.length, 2);
    expectUnsupportedFulfillment(multiSeller, 2);
    expectUnsupportedFulfillment({ sellerProjection: [], platformAllocation: null }, 0);

    await expectProjectionUnavailable(
        buildCheckoutSalesPartyProjection(
            queryClient([platformRow(301, { legacy_store_id: null, legacy_store_slug: null })]),
            [pricedItem(301, 10)]
        ),
        'LEGACY_STORE_UNAVAILABLE'
    );
    await expectProjectionUnavailable(
        buildCheckoutSalesPartyProjection(
            queryClient([platformRow(302, { legacy_store_slug: 'unknown-store' })]),
            [pricedItem(302, 10)]
        ),
        'SALES_PARTY_UNRESOLVED'
    );
    await expectProjectionUnavailable(
        buildCheckoutSalesPartyProjection(
            queryClient([platformRow(303, { legacy_store_is_active: false })]),
            [pricedItem(303, 10)]
        ),
        'LEGACY_STORE_UNAVAILABLE'
    );
    await expectProjectionUnavailable(
        buildCheckoutSalesPartyProjection(
            queryClient([platformRow(304, { legacy_store_deleted_at: '2026-09-01T00:00:00.000Z' })]),
            [pricedItem(304, 10)]
        ),
        'LEGACY_STORE_UNAVAILABLE'
    );
    await expectProjectionUnavailable(
        buildCheckoutSalesPartyProjection(
            queryClient([sellerRow(305, { seller_store_closed_at: '2026-09-01T00:00:00.000Z' })]),
            [pricedItem(305, 10)]
        ),
        'SELLER_MAPPING_AMBIGUOUS'
    );
    await expectProjectionUnavailable(
        buildCheckoutSalesPartyProjection(
            queryClient([
                sellerRow(306),
                sellerRow(306, { seller_store_id: 702, offer_id: 1002, variant_id: 1102 })
            ]),
            [pricedItem(306, 10)]
        ),
        'SELLER_MAPPING_AMBIGUOUS'
    );
    await expectProjectionUnavailable(
        buildCheckoutSalesPartyProjection(
            queryClient([sellerRow(307, {
                product_store_id: 501,
                legacy_store_id: 501,
                legacy_store_slug: 'novastore-platform',
                seller_store_closed_at: '2026-09-01T00:00:00.000Z'
            })]),
            [pricedItem(307, 10)]
        ),
        'SELLER_MAPPING_AMBIGUOUS'
    );

    expectAgreementInvalid({
        ...mixedContext,
        sellers: [{
            ...mixedContext.sellers[0],
            productIds: [201, 201]
        }]
    });
    expectAgreementInvalid({
        ...mixedContext,
        platformAllocation: {
            ...mixedContext.platformAllocation,
            grossMinor: 3000,
            productIds: [101, 201]
        }
    });
    expectAgreementInvalid({
        ...mixedContext,
        platformAllocation: null
    });
    expectAgreementInvalid({
        ...mixedContext,
        platformAllocation: {
            ...mixedContext.platformAllocation,
            grossMinor: mixedContext.platformAllocation.grossMinor - 1
        }
    });

    const variantItems = [1101,1102].map((variant_id,index)=>({...pricedItem(401,10+index),variant_id}));
    const variantSales = await buildCheckoutSalesPartyProjection(queryClient([sellerRow(401),sellerRow(401,{variant_id:1102})]),variantItems);
    assert.deepEqual(variantSales.sellerProjection[0].items.map(item=>item.variantId),[1101,1102]);
    assert.deepEqual(variantSales.sellerProjection[0].productIds,[401]);
    const variantContext = toCheckoutContext(variantItems,variantSales);
    variantContext.items.forEach((item,index)=>Object.assign(item,{variantId:1101+index,sku:`R19-${index}`,variantSelections:[{group:'Size',value:index?'L':'M'}]}));
    const normalizedVariants=normalizeCheckoutAgreementContext(variantContext);
    assert.deepEqual(normalizedVariants.items.map(item=>item.variantId),[1101,1102]);
    assert.match(renderCheckoutContext(normalizedVariants),/Size: L/);
    expectAgreementInvalid({...variantContext,items:[variantContext.items[0],{...variantContext.items[1],variantId:1101}]});
    const renamed=structuredClone(variantContext);renamed.items[0].variantSelections[0].value='XL';
    assert.notEqual(JSON.stringify(normalizeCheckoutAgreementContext(renamed)),JSON.stringify(normalizedVariants));

    console.log('checkout sales-party projection smoke passed: platform=explicit mixed=complete unknown/closed/ambiguous=blocked allocation=exact');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
