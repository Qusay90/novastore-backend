'use strict';

const crypto = require('crypto');
const { getPublicBusinessIdentity } = require('../config/businessIdentityConfig');
const {
    buildSellerPublicLegalIdentityContentSha256
} = require('./sellerPublicLegalIdentityService');

const LEGAL_DOCUMENT_DEFINITIONS = Object.freeze([
    Object.freeze({ slug: 'about', path: '/hakkimizda', title: 'Hakkımızda', envKey: 'ABOUT', requiredForCheckout: false }),
    Object.freeze({ slug: 'privacy', path: '/gizlilik-politikasi', title: 'Gizlilik Politikası', envKey: 'PRIVACY', requiredForCheckout: false }),
    Object.freeze({ slug: 'kvkk', path: '/kvkk-aydinlatma-metni', title: 'KVKK Aydınlatma Metni', envKey: 'KVKK', requiredForCheckout: false }),
    Object.freeze({ slug: 'cookies', path: '/cerez-politikasi', title: 'Çerez Politikası', envKey: 'COOKIES', requiredForCheckout: false }),
    Object.freeze({ slug: 'membership-terms', path: '/kullanim-ve-uyelik-kosullari', title: 'Kullanım ve Üyelik Koşulları', envKey: 'MEMBERSHIP_TERMS', requiredForCheckout: false }),
    Object.freeze({ slug: 'pre-information', path: '/on-bilgilendirme-formu', title: 'Ön Bilgilendirme Formu', envKey: 'PRE_INFORMATION', requiredForCheckout: true }),
    Object.freeze({ slug: 'distance-sale', path: '/mesafeli-satis-sozlesmesi', title: 'Mesafeli Satış Sözleşmesi', envKey: 'DISTANCE_SALE', requiredForCheckout: true }),
    Object.freeze({ slug: 'cancellation-return', path: '/iptal-iade-cayma-politikasi', title: 'İptal, İade ve Cayma Politikası', envKey: 'CANCELLATION_RETURN', requiredForCheckout: false }),
    Object.freeze({ slug: 'delivery-shipping', path: '/teslimat-ve-kargo-kosullari', title: 'Teslimat ve Kargo Koşulları', envKey: 'DELIVERY_SHIPPING', requiredForCheckout: false }),
    Object.freeze({ slug: 'transaction-guide', path: '/islem-rehberi', title: 'İşlem Rehberi', envKey: 'TRANSACTION_GUIDE', requiredForCheckout: false }),
    Object.freeze({ slug: 'marketplace-disclosure', path: '/pazaryeri-bilgilendirmesi', title: 'Pazaryeri ve Aracı Hizmet Sağlayıcı Bilgilendirmesi', envKey: 'MARKETPLACE_DISCLOSURE', requiredForCheckout: false }),
    Object.freeze({ slug: 'seller-agreement', path: '/satici-sozlesmesi', title: 'Satıcı Sözleşmesi', envKey: 'SELLER_AGREEMENT', requiredForCheckout: false })
]);

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000\u000b\u000c\u007f]/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEGAL_TEMPLATE_TOKEN_PATTERN = /\{\{(business\.[A-Za-z][A-Za-z0-9]*)\}\}/g;
const LEGAL_TEMPLATE_BRACE_PATTERN = /\{\{|\}\}/;
const LEGAL_TEMPLATE_TOKEN_TO_IDENTITY_KEY = Object.freeze({
    'business.legalCompanyName': 'legalCompanyName',
    'business.tradeName': 'tradeName',
    'business.taxNumber': 'taxNumber',
    'business.taxOffice': 'taxOffice',
    'business.mersisNumber': 'mersisNumber',
    'business.registeredAddress': 'registeredAddress',
    'business.kepAddress': 'kepAddress',
    'business.phone': 'phone',
    'business.email': 'email',
    'business.customerDomain': 'customerDomain'
});
const exactTrue = (value) => String(value || '').trim().toLowerCase() === 'true';
const definitionBySlug = new Map(LEGAL_DOCUMENT_DEFINITIONS.map((definition) => [definition.slug, definition]));

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
};

const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
const cleanText = (value, maximum = 500) => String(value ?? '').trim().slice(0, maximum);
const cleanMoney = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return Number(numeric.toFixed(2));
};
const moneyToMinor = (value) => {
    const money = cleanMoney(value);
    if (money === null) return null;
    const minor = Math.round((money + Number.EPSILON) * 100);
    return Number.isSafeInteger(minor) ? minor : null;
};

const normalizeCheckoutAgreementContext = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new LegalDocumentError(
            'CHECKOUT_AGREEMENT_CONTEXT_REQUIRED',
            409,
            'Güncel sipariş özeti doğrulanmadan sözleşme oluşturulamaz.'
        );
    }

    const identity = input.businessIdentity || {};
    const delivery = input.delivery || {};
    const totals = input.totals || {};
    const items = Array.isArray(input.items) ? input.items : [];
    const sellers = Array.isArray(input.sellers) ? input.sellers : [];
    const hasPlatformAllocation = input.platformAllocation !== undefined
        && input.platformAllocation !== null;
    const platformAllocationInputInvalid = hasPlatformAllocation
        && (!input.platformAllocation || typeof input.platformAllocation !== 'object' || Array.isArray(input.platformAllocation));
    const platformAllocation = platformAllocationInputInvalid ? {} : input.platformAllocation;
    const addressId = Number(delivery.addressId);
    const currency = cleanText(totals.currency, 3).toUpperCase();
    const normalizedTotals = {
        currency,
        subtotal: cleanMoney(totals.subtotal),
        bundleDiscount: cleanMoney(totals.bundleDiscount),
        couponDiscount: cleanMoney(totals.couponDiscount),
        shippingFee: cleanMoney(totals.shippingFee),
        total: cleanMoney(totals.total)
    };
    const normalizedItems = items.map((item) => ({
        productId: Number(item.productId),
        ...(item.variantId !== undefined ? {
            variantId: Number(item.variantId),
            variantSelections: (Array.isArray(item.variantSelections) ? item.variantSelections : []).map(selection => ({group:cleanText(selection.group,96),value:cleanText(selection.value,96)})),
            sku: cleanText(item.sku,96)
        } : {}),
        name: cleanText(item.name, 300),
        quantity: Number(item.quantity),
        unitPrice: cleanMoney(item.unitPrice),
        lineTotal: cleanMoney(item.lineTotal)
    }));
    const normalizedSellers = sellers.map((seller) => ({
        organizationId: Number(seller.organizationId),
        organizationDisplayName: cleanText(seller.organizationDisplayName, 160),
        storeId: Number(seller.storeId),
        storeDisplayName: cleanText(seller.storeDisplayName, 160),
        legalIdentity: {
            id: Number(seller.legalIdentity?.id),
            organizationId: Number(seller.legalIdentity?.organizationId),
            version: cleanText(seller.legalIdentity?.version, 80),
            publicLegalName: cleanText(seller.legalIdentity?.publicLegalName, 200),
            publicTradeName: cleanText(seller.legalIdentity?.publicTradeName, 160),
            publicDisclosureText: cleanText(seller.legalIdentity?.publicDisclosureText, 4000),
            contentSha256: cleanText(seller.legalIdentity?.contentSha256, 64).toLowerCase(),
            approvedAt: cleanText(seller.legalIdentity?.approvedAt, 64)
        },
        currency: cleanText(seller.currency, 3).toUpperCase(),
        grossMinor: Number(seller.grossMinor),
        productIds: Object.freeze((Array.isArray(seller.productIds) ? seller.productIds : []).map(Number).sort((a, b) => a - b))
    }));
    const normalizedPlatformAllocation = hasPlatformAllocation
        ? {
            currency: cleanText(platformAllocation?.currency, 3).toUpperCase(),
            grossMinor: Number(platformAllocation?.grossMinor),
            productIds: Object.freeze(
                (Array.isArray(platformAllocation?.productIds) ? platformAllocation.productIds : [])
                    .map(Number)
                    .sort((a, b) => a - b)
            )
        }
        : null;

    const structuralInvalid = !Number.isSafeInteger(addressId)
        || addressId <= 0
        || !cleanText(delivery.fullName, 200)
        || !EMAIL_PATTERN.test(cleanText(delivery.email, 254))
        || !cleanText(delivery.address, 1000)
        || !/^05\d{9}$/.test(cleanText(delivery.phone, 11))
        || currency !== 'TRY'
        || Object.values(normalizedTotals).some((value, index) => index > 0 && value === null)
        || normalizedItems.length === 0
        || normalizedItems.some((item) => (
            !Number.isSafeInteger(item.productId)
            || item.productId <= 0
            || !item.name
            || (item.variantId !== undefined && (!Number.isSafeInteger(item.variantId) || item.variantId <= 0 || item.variantId > 2147483647 || !item.sku
                || item.variantSelections.length < 1 || item.variantSelections.length > 8
                || item.variantSelections.some(selection => !selection.group || !selection.value)))
            || !Number.isSafeInteger(item.quantity)
            || item.quantity <= 0
            || item.unitPrice === null
            || item.lineTotal === null
        ))
        || platformAllocationInputInvalid
        || (normalizedPlatformAllocation !== null && (
            normalizedPlatformAllocation.currency !== 'TRY'
            || !Number.isSafeInteger(normalizedPlatformAllocation.grossMinor)
            || normalizedPlatformAllocation.grossMinor < 0
            || normalizedPlatformAllocation.productIds.length === 0
            || normalizedPlatformAllocation.productIds.some((productId) => (
                !Number.isSafeInteger(productId) || productId <= 0
            ))
        ))
        || normalizedSellers.some((seller) => (
            !Number.isSafeInteger(seller.organizationId)
            || seller.organizationId <= 0
            || !seller.organizationDisplayName
            || !Number.isSafeInteger(seller.storeId)
            || seller.storeId <= 0
            || !seller.storeDisplayName
            || !Number.isSafeInteger(seller.legalIdentity.id)
            || seller.legalIdentity.id <= 0
            || !Number.isSafeInteger(seller.legalIdentity.organizationId)
            || seller.legalIdentity.organizationId !== seller.organizationId
            || !VERSION_PATTERN.test(seller.legalIdentity.version)
            || !seller.legalIdentity.publicLegalName
            || !seller.legalIdentity.publicTradeName
            || !seller.legalIdentity.publicDisclosureText
            || !SHA256_PATTERN.test(seller.legalIdentity.contentSha256)
            || seller.legalIdentity.contentSha256 !== buildSellerPublicLegalIdentityContentSha256(seller.legalIdentity)
            || !Number.isFinite(Date.parse(seller.legalIdentity.approvedAt))
            || seller.currency !== 'TRY'
            || !Number.isSafeInteger(seller.grossMinor)
            || seller.grossMinor < 0
            || seller.productIds.length === 0
            || seller.productIds.some((productId) => !Number.isSafeInteger(productId) || productId <= 0)
        ));
    let allocationInvalid = structuralInvalid;
    if (!allocationInvalid) {
        const itemIds = normalizedItems.map((item) => item.productId);
        const itemIdSet = new Set(itemIds);
        const itemLineMinorByProductId = new Map();
        for (const item of normalizedItems) {
            itemLineMinorByProductId.set(item.productId, (itemLineMinorByProductId.get(item.productId) || 0) + moneyToMinor(item.lineTotal));
        }
        const allocations = [
            ...(normalizedPlatformAllocation ? [normalizedPlatformAllocation] : []),
            ...normalizedSellers
        ];
        const allocatedProductIds = new Set();
        let allocatedGrossMinor = 0;
        if (new Set(normalizedItems.map(item => `${item.productId}:${item.variantId || ''}`)).size !== normalizedItems.length) allocationInvalid = true;
        for (const allocation of allocations) {
            let expectedGrossMinor = 0;
            const allocationIdSet = new Set(allocation.productIds);
            if (allocationIdSet.size !== allocation.productIds.length) allocationInvalid = true;
            for (const productId of allocation.productIds) {
                const lineMinor = itemLineMinorByProductId.get(productId);
                if (lineMinor === undefined || lineMinor === null || allocatedProductIds.has(productId)) {
                    allocationInvalid = true;
                    continue;
                }
                allocatedProductIds.add(productId);
                expectedGrossMinor += lineMinor;
                if (!Number.isSafeInteger(expectedGrossMinor)) allocationInvalid = true;
            }
            if (allocation.grossMinor !== expectedGrossMinor) allocationInvalid = true;
            allocatedGrossMinor += allocation.grossMinor;
            if (!Number.isSafeInteger(allocatedGrossMinor)) allocationInvalid = true;
        }
        const subtotalMinor = moneyToMinor(normalizedTotals.subtotal);
        if (
            allocatedProductIds.size !== itemIdSet.size
            || itemIds.some((productId) => !allocatedProductIds.has(productId))
            || subtotalMinor === null
            || allocatedGrossMinor !== subtotalMinor
        ) {
            allocationInvalid = true;
        }
    }
    const invalid = structuralInvalid || allocationInvalid;
    if (invalid) {
        throw new LegalDocumentError(
            'CHECKOUT_AGREEMENT_CONTEXT_INVALID',
            409,
            'Güncel sipariş özeti sözleşme için doğrulanamadı.'
        );
    }

    const normalized = {
        businessIdentity: {
            legalCompanyName: cleanText(identity.legalCompanyName, 200),
            tradeName: cleanText(identity.tradeName, 160),
            taxNumber: cleanText(identity.taxNumber, 20),
            taxOffice: cleanText(identity.taxOffice, 160) || null,
            mersisNumber: cleanText(identity.mersisNumber, 30),
            registeredAddress: cleanText(identity.registeredAddress, 500),
            kepAddress: cleanText(identity.kepAddress, 254),
            phone: cleanText(identity.phone, 30),
            email: cleanText(identity.email, 254),
            customerDomain: cleanText(identity.customerDomain, 500)
        },
        delivery: {
            addressId,
            fullName: cleanText(delivery.fullName, 200),
            email: cleanText(delivery.email, 254).toLowerCase(),
            phone: cleanText(delivery.phone, 11),
            address: cleanText(delivery.address, 1000)
        },
        items: normalizedItems,
        totals: normalizedTotals,
        coupon: {
            applied: input.coupon?.applied === true,
            code: input.coupon?.applied === true ? cleanText(input.coupon?.code, 80) : null,
            discountAmount: cleanMoney(input.coupon?.discountAmount) ?? 0
        },
        platformAllocation: normalizedPlatformAllocation,
        sellers: normalizedSellers
    };
    const requiredBusinessIdentityKeys = [
        'legalCompanyName',
        'tradeName',
        'taxNumber',
        'mersisNumber',
        'registeredAddress',
        'kepAddress',
        'phone',
        'email',
        'customerDomain'
    ];
    if (requiredBusinessIdentityKeys.some((key) => !normalized.businessIdentity[key])) {
        throw new LegalDocumentError(
            'CHECKOUT_AGREEMENT_CONTEXT_INVALID',
            409,
            'İşletme kimliği sözleşme için doğrulanamadı.'
        );
    }
    return Object.freeze({
        ...normalized,
        businessIdentity: Object.freeze(normalized.businessIdentity),
        delivery: Object.freeze(normalized.delivery),
        items: Object.freeze(normalized.items.map(Object.freeze)),
        totals: Object.freeze(normalized.totals),
        coupon: Object.freeze(normalized.coupon),
        platformAllocation: normalized.platformAllocation
            ? Object.freeze(normalized.platformAllocation)
            : null,
        sellers: Object.freeze(normalized.sellers.map((seller) => Object.freeze({
            ...seller,
            legalIdentity: Object.freeze(seller.legalIdentity)
        })))
    });
};

const formatMoney = (value, currency) => `${Number(value).toFixed(2)} ${currency}`;

const renderCheckoutContext = (context) => {
    const itemLines = context.items.map((item) => (
        `- ${item.name} (Ürün #${item.productId})${item.variantId ? ` | Varyant #${item.variantId} | SKU ${item.sku} | ${item.variantSelections.map(selection => `${selection.group}: ${selection.value}`).join(', ')}` : ''} | ${item.quantity} adet | Birim ${formatMoney(item.unitPrice, context.totals.currency)} | Satır ${formatMoney(item.lineTotal, context.totals.currency)}`
    ));
    const salesPartyLines = [
        ...(context.platformAllocation
            ? [
                `- Platform satıcısı: ${context.businessIdentity.legalCompanyName} (${context.businessIdentity.tradeName}) | Brüt ${formatMoney(context.platformAllocation.grossMinor / 100, context.platformAllocation.currency)} | Ürünler: ${context.platformAllocation.productIds.join(', ')}`
            ]
            : []),
        ...context.sellers.map((seller) => (
            `- Pazaryeri satıcısı: ${seller.legalIdentity.publicLegalName} (${seller.legalIdentity.publicTradeName}) | Mağaza: ${seller.storeDisplayName} | Kamusal kimlik sürümü: ${seller.legalIdentity.version} / ${seller.legalIdentity.contentSha256} | Açıklama: ${seller.legalIdentity.publicDisclosureText} | Brüt ${formatMoney(seller.grossMinor / 100, seller.currency)} | Ürünler: ${seller.productIds.join(', ')}`
        ))
    ];
    const couponLine = context.coupon.applied
        ? `${context.coupon.code} (${formatMoney(context.coupon.discountAmount, context.totals.currency)} indirim)`
        : 'Uygulanmadı';
    return [
        'NovaStore sunucu doğrulamalı işlem özeti',
        '',
        `Aracı hizmet sağlayıcı: ${context.businessIdentity.legalCompanyName}`,
        `Ticari unvan: ${context.businessIdentity.tradeName}`,
        `VKN: ${context.businessIdentity.taxNumber}`,
        ...(context.businessIdentity.taxOffice ? [`Vergi dairesi: ${context.businessIdentity.taxOffice}`] : []),
        `MERSİS: ${context.businessIdentity.mersisNumber}`,
        `Kayıtlı adres: ${context.businessIdentity.registeredAddress}`,
        `KEP: ${context.businessIdentity.kepAddress}`,
        `İletişim: ${context.businessIdentity.phone} · ${context.businessIdentity.email}`,
        `Müşteri alan adı: ${context.businessIdentity.customerDomain}`,
        '',
        `Alıcı: ${context.delivery.fullName}`,
        `E-posta: ${context.delivery.email}`,
        `Telefon: ${context.delivery.phone}`,
        `Teslimat adresi (#${context.delivery.addressId}): ${context.delivery.address}`,
        '',
        'Ürünler:',
        ...itemLines,
        '',
        `Ara toplam: ${formatMoney(context.totals.subtotal, context.totals.currency)}`,
        `Sepet indirimi: ${formatMoney(context.totals.bundleDiscount, context.totals.currency)}`,
        `Kupon indirimi: ${formatMoney(context.totals.couponDiscount, context.totals.currency)}`,
        `Kargo: ${formatMoney(context.totals.shippingFee, context.totals.currency)}`,
        `Ödenecek toplam: ${formatMoney(context.totals.total, context.totals.currency)}`,
        `Kupon: ${couponLine}`,
        '',
        'Satıcı işlem dağılımı:',
        ...salesPartyLines
    ].join('\n');
};

class LegalDocumentError extends Error {
    constructor(code, statusCode, publicMessage, details = []) {
        super(publicMessage);
        this.name = 'LegalDocumentError';
        this.code = code;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
        this.details = Object.freeze([...details]);
    }
}

const renderLegalTemplate = (template, env = process.env) => {
    const source = String(template || '').trim();
    if (!source) return null;
    const matches = [...source.matchAll(LEGAL_TEMPLATE_TOKEN_PATTERN)];
    const tokenTexts = new Set(matches.map((match) => match[0]));
    const sourceWithoutKnownTokens = [...tokenTexts].reduce(
        (value, tokenText) => value.replaceAll(tokenText, ''),
        source
    );
    if (LEGAL_TEMPLATE_BRACE_PATTERN.test(sourceWithoutKnownTokens)) return null;
    if (matches.length === 0) return source;

    const projection = getPublicBusinessIdentity(env);
    if (projection.status !== 'configured' || !projection.identity) return null;
    let rendered = source;
    for (const match of matches) {
        const token = match[1];
        const identityKey = LEGAL_TEMPLATE_TOKEN_TO_IDENTITY_KEY[token];
        const value = String(projection.identity[identityKey] || '').trim();
        if (!identityKey || !value || CONTROL_CHARACTER_PATTERN.test(value)) return null;
        rendered = rendered.replaceAll(match[0], value);
    }
    return LEGAL_TEMPLATE_BRACE_PATTERN.test(rendered) ? null : rendered;
};

const readConfiguredDocument = (definition, env = process.env) => {
    const prefix = `NOVASTORE_LEGAL_${definition.envKey}`;
    const approved = exactTrue(env[`${prefix}_APPROVED`]);
    const version = String(env[`${prefix}_VERSION`] || '').trim();
    const template = String(env[`${prefix}_TEXT`] || '').trim();
    const templateValid = approved
        && VERSION_PATTERN.test(version)
        && template.length > 0
        && template.length <= 30000
        && !CONTROL_CHARACTER_PATTERN.test(template);
    const text = templateValid ? renderLegalTemplate(template, env) : null;
    const published = templateValid
        && text !== null
        && text.length <= 30000
        && !CONTROL_CHARACTER_PATTERN.test(text);
    return Object.freeze({
        slug: definition.slug,
        path: definition.path,
        title: definition.title,
        requiredForCheckout: definition.requiredForCheckout,
        status: published ? 'published' : 'owner_external_required',
        version: published ? version : null,
        text: published ? text : null,
        sourceTemplateSha256: published ? sha256(template) : null,
        renderedContentSha256: published ? sha256(text) : null
    });
};

const getLegalDocument = (slug, env = process.env) => {
    const definition = definitionBySlug.get(String(slug || '').trim());
    return definition ? readConfiguredDocument(definition, env) : null;
};

const listLegalDocuments = (env = process.env) => Object.freeze(
    LEGAL_DOCUMENT_DEFINITIONS.map((definition) => readConfiguredDocument(definition, env))
);

const getCheckoutAgreementDocuments = (env = process.env) => Object.freeze(
    listLegalDocuments(env).filter((document) => document.requiredForCheckout)
);

const getCheckoutAgreementReadiness = (env = process.env) => {
    const documents = getCheckoutAgreementDocuments(env);
    const unpublished = documents.filter((document) => document.status !== 'published');
    return Object.freeze({
        ready: unpublished.length === 0,
        requiredCount: documents.length,
        publishedCount: documents.length - unpublished.length,
        missingSlugs: Object.freeze(unpublished.map((document) => document.slug))
    });
};

const buildCheckoutAgreementPreview = ({ checkoutContext, env = process.env } = {}) => {
    const readiness = getCheckoutAgreementReadiness(env);
    if (!readiness.ready) {
        throw new LegalDocumentError(
            'CHECKOUT_LEGAL_DOCUMENTS_NOT_PUBLISHED',
            503,
            'Ödeme için gerekli güncel sözleşmeler henüz yayımlanmadı.',
            readiness.missingSlugs
        );
    }
    const context = normalizeCheckoutAgreementContext(checkoutContext);
    const contextSha256 = sha256(stableStringify(context));
    const contextText = renderCheckoutContext(context);
    const documents = getCheckoutAgreementDocuments(env).map((document) => {
        const renderedText = `${document.text}\n\n---\n\n${contextText}`;
        return Object.freeze({
            slug: document.slug,
            path: document.path,
            title: document.title,
            version: document.version,
            text: renderedText,
            sourceTemplateSha256: document.sourceTemplateSha256,
            sourceContentSha256: document.renderedContentSha256,
            contentSha256: sha256(renderedText)
        });
    });
    const snapshotSha256 = sha256(stableStringify({
        schemaVersion: 'checkout-agreements-v2',
        contextSha256,
        documents: documents.map(({ slug, version, sourceTemplateSha256, sourceContentSha256, contentSha256 }) => ({
            slug,
            version,
            sourceTemplateSha256,
            sourceContentSha256,
            contentSha256
        }))
    }));
    return Object.freeze({
        schemaVersion: 'checkout-agreements-v2',
        snapshotSha256,
        contextSha256,
        context,
        documents: Object.freeze(documents)
    });
};

const buildCheckoutAgreementSnapshot = (acceptances, {
    checkoutContext,
    expectedSnapshotSha256,
    env = process.env,
    now = () => new Date()
} = {}) => {
    const preview = buildCheckoutAgreementPreview({ checkoutContext, env });
    if (!Array.isArray(acceptances)) {
        throw new LegalDocumentError('CHECKOUT_AGREEMENT_ACCEPTANCE_REQUIRED', 400, 'Ödeme için gerekli sözleşmeleri onaylamalısın.');
    }
    const expectedHash = String(expectedSnapshotSha256 || '').trim().toLowerCase();
    if (!SHA256_PATTERN.test(expectedHash) || expectedHash !== preview.snapshotSha256) {
        throw new LegalDocumentError(
            'CHECKOUT_AGREEMENT_SNAPSHOT_STALE',
            409,
            'Sipariş özeti değişti. Güncel sözleşmeleri yeniden inceleyip onaylamalısın.'
        );
    }
    const bySlug = new Map(acceptances.map((acceptance) => [String(acceptance?.slug || '').trim(), acceptance]));
    const acceptedAt = now().toISOString();
    const documents = preview.documents.map((document) => {
        const acceptance = bySlug.get(document.slug);
        if (acceptance?.accepted !== true || String(acceptance?.version || '').trim() !== document.version) {
            throw new LegalDocumentError(
                'CHECKOUT_AGREEMENT_ACCEPTANCE_REQUIRED',
                400,
                'Güncel ön bilgilendirme ve mesafeli satış sözleşmesini onaylamalısın.',
                [document.slug]
            );
        }
        return Object.freeze({
            slug: document.slug,
            path: document.path,
            title: document.title,
            version: document.version,
            text: document.text,
            sourceTemplateSha256: document.sourceTemplateSha256,
            sourceContentSha256: document.sourceContentSha256,
            contentSha256: document.contentSha256
        });
    });
    return Object.freeze({
        schemaVersion: preview.schemaVersion,
        snapshotSha256: preview.snapshotSha256,
        contextSha256: preview.contextSha256,
        acceptedAt,
        context: preview.context,
        documents: Object.freeze(documents)
    });
};

module.exports = Object.freeze({
    LEGAL_DOCUMENT_DEFINITIONS,
    LEGAL_TEMPLATE_TOKEN_TO_IDENTITY_KEY,
    LegalDocumentError,
    buildCheckoutAgreementPreview,
    buildCheckoutAgreementSnapshot,
    exactTrue,
    getCheckoutAgreementDocuments,
    getCheckoutAgreementReadiness,
    getLegalDocument,
    listLegalDocuments,
    normalizeCheckoutAgreementContext,
    readConfiguredDocument,
    renderLegalTemplate,
    renderCheckoutContext,
    stableStringify
});
