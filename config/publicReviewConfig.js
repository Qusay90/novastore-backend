'use strict';

const release = require('./publicReviewRelease.json');
const isPublicReviewRelease = (env = process.env) => env.NOVASTORE_PUBLIC_REVIEW_RELEASE === undefined
    ? release.enabled === true
    : String(env.NOVASTORE_PUBLIC_REVIEW_RELEASE).trim().toLowerCase() === 'true';
// Owner-supplied public contact only. These values are not a registered company identity.
const PUBLIC_REVIEW_CONTACT = Object.freeze({
    brandName: 'NovaStore',
    address: 'Baruthane Mah. Bafra Cad. No: 101A\nİç Kapı No: 3\nİlkadım / Samsun\nTürkiye',
    phone: '0555 177 24 30', telephoneUri: 'tel:+905551772430', email: 'destek@novastore.tr',
    legalCompanyName: null, taxNumber: null, mersisNumber: null, kepAddress: null,
    taxOffice: null, tradeRegistry: null, chamberRegistration: null, etbisStatus: 'pending',
});
const PENDING_LEGAL_FIELDS = Object.freeze([
    'Ticari unvan: Kuruluş/tescil sürecinde',
    'Vergi Kimlik Numarası: Henüz tahsis edilmedi — kuruluş işlemleri tamamlandığında güncellenecektir.',
    'MERSİS No: Henüz tahsis edilmedi — tescil tamamlandığında güncellenecektir.',
    'KEP Adresi: Henüz oluşturulmadı — oluşturulduğunda güncellenecektir.',
    'Vergi dairesi, ticaret sicili ve oda kaydı: Kuruluş işlemleri tamamlandığında güncellenecektir.',
    'ETBİS: Kayıt süreci tamamlanmadı.',
]);
const getPublicReviewProjection = () => Object.freeze({
    status: 'pending_owner_company_formation', identity: null, issueCount: 8,
    publicContact: Object.freeze({ ...PUBLIC_REVIEW_CONTACT, pendingFields: PENDING_LEGAL_FIELDS }),
    reviewRelease: true, legalIdentityComplete: false, realPaymentActivationAllowed: false,
    catalogAuthority: Object.freeze({
        contract: release.legacyCatalogContract,
        sourceCommit: release.legacyBaseCommit,
    }),
});
module.exports = { isPublicReviewRelease, PUBLIC_REVIEW_CONTACT, PENDING_LEGAL_FIELDS, getPublicReviewProjection };
