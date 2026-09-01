'use strict';

const crypto = require('crypto');

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
        name: cleanText(item.name, 300),
        quantity: Number(item.quantity),
        unitPrice: cleanMoney(item.unitPrice),
        lineTotal: cleanMoney(item.lineTotal)
    }));
    const normalizedSellers = sellers.map((seller) => ({
        organizationId: Number(seller.organizationId),
        storeId: Number(seller.storeId),
        currency: cleanText(seller.currency, 3).toUpperCase(),
        grossMinor: Number(seller.grossMinor),
        productIds: Object.freeze((Array.isArray(seller.productIds) ? seller.productIds : []).map(Number).sort((a, b) => a - b))
    }));

    const invalid = !Number.isSafeInteger(addressId)
        || addressId <= 0
        || !cleanText(delivery.fullName, 200)
        || !cleanText(delivery.address, 1000)
        || !/^05\d{9}$/.test(cleanText(delivery.phone, 11))
        || currency !== 'TRY'
        || Object.values(normalizedTotals).some((value, index) => index > 0 && value === null)
        || normalizedItems.length === 0
        || normalizedItems.some((item) => (
            !Number.isSafeInteger(item.productId)
            || item.productId <= 0
            || !item.name
            || !Number.isSafeInteger(item.quantity)
            || item.quantity <= 0
            || item.unitPrice === null
            || item.lineTotal === null
        ))
        || normalizedSellers.some((seller) => (
            !Number.isSafeInteger(seller.organizationId)
            || seller.organizationId <= 0
            || !Number.isSafeInteger(seller.storeId)
            || seller.storeId <= 0
            || seller.currency !== 'TRY'
            || !Number.isSafeInteger(seller.grossMinor)
            || seller.grossMinor < 0
            || seller.productIds.some((productId) => !Number.isSafeInteger(productId) || productId <= 0)
        ));
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
            taxNumber: cleanText(identity.taxNumber, 20),
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
        sellers: normalizedSellers
    };
    if (Object.values(normalized.businessIdentity).some((value) => !value)) {
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
        sellers: Object.freeze(normalized.sellers.map(Object.freeze))
    });
};

const formatMoney = (value, currency) => `${Number(value).toFixed(2)} ${currency}`;

const renderCheckoutContext = (context) => {
    const itemLines = context.items.map((item) => (
        `- ${item.name} (Ürün #${item.productId}) | ${item.quantity} adet | Birim ${formatMoney(item.unitPrice, context.totals.currency)} | Satır ${formatMoney(item.lineTotal, context.totals.currency)}`
    ));
    const sellerLines = context.sellers.length > 0
        ? context.sellers.map((seller) => (
            `- Organizasyon #${seller.organizationId} / Mağaza #${seller.storeId} | Brüt ${formatMoney(seller.grossMinor / 100, seller.currency)} | Ürünler: ${seller.productIds.join(', ')}`
        ))
        : ['- Bu sepet için ayrı bir satıcı operasyon dağılımı bulunmuyor.'];
    const couponLine = context.coupon.applied
        ? `${context.coupon.code} (${formatMoney(context.coupon.discountAmount, context.totals.currency)} indirim)`
        : 'Uygulanmadı';
    return [
        'NovaStore sunucu doğrulamalı işlem özeti',
        '',
        `Aracı hizmet sağlayıcı: ${context.businessIdentity.legalCompanyName}`,
        `VKN: ${context.businessIdentity.taxNumber}`,
        `MERSİS: ${context.businessIdentity.mersisNumber}`,
        `Kayıtlı adres: ${context.businessIdentity.registeredAddress}`,
        `KEP: ${context.businessIdentity.kepAddress}`,
        `İletişim: ${context.businessIdentity.phone} · ${context.businessIdentity.email}`,
        `Müşteri alan adı: ${context.businessIdentity.customerDomain}`,
        '',
        `Alıcı: ${context.delivery.fullName}`,
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
        ...sellerLines
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

const readConfiguredDocument = (definition, env = process.env) => {
    const prefix = `NOVASTORE_LEGAL_${definition.envKey}`;
    const approved = exactTrue(env[`${prefix}_APPROVED`]);
    const version = String(env[`${prefix}_VERSION`] || '').trim();
    const text = String(env[`${prefix}_TEXT`] || '').trim();
    const published = approved
        && VERSION_PATTERN.test(version)
        && text.length > 0
        && text.length <= 30000
        && !CONTROL_CHARACTER_PATTERN.test(text);
    return Object.freeze({
        slug: definition.slug,
        path: definition.path,
        title: definition.title,
        requiredForCheckout: definition.requiredForCheckout,
        status: published ? 'published' : 'owner_external_required',
        version: published ? version : null,
        text: published ? text : null
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
            sourceContentSha256: sha256(document.text),
            contentSha256: sha256(renderedText)
        });
    });
    const snapshotSha256 = sha256(stableStringify({
        schemaVersion: 'checkout-agreements-v2',
        contextSha256,
        documents: documents.map(({ slug, version, sourceContentSha256, contentSha256 }) => ({
            slug,
            version,
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
    renderCheckoutContext,
    stableStringify
});
