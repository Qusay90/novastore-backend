'use strict';
const crypto = require('node:crypto');
const { VERSION, getReviewLegalText } = require('../config/paytrReviewLegalContent');
const definitions = [
    ['about', '/hakkimizda', 'Hakkımızda'],
    ['privacy', '/gizlilik-politikasi', 'Gizlilik Politikası'],
    ['kvkk', '/kvkk-aydinlatma-metni', 'KVKK Aydınlatma Metni'],
    ['cookies', '/cerez-politikasi', 'Çerez Politikası'],
    ['membership-terms', '/kullanim-ve-uyelik-kosullari', 'Kullanım ve Üyelik Koşulları'],
    ['delivery-shipping', '/teslimat-ve-kargo-kosullari', 'Teslimat ve Kargo Koşulları'],
    ['cancellation-return', '/iptal-iade-cayma-politikasi', 'İptal, İade ve Cayma Politikası'],
    ['distance-sale', '/mesafeli-satis-sozlesmesi', 'Mesafeli Satış Sözleşmesi'],
    ['pre-information', '/on-bilgilendirme-formu', 'Ön Bilgilendirme Formu'],
    ['transaction-guide', '/islem-rehberi', 'İşlem Rehberi'],
    ['marketplace-disclosure', '/pazaryeri-bilgilendirmesi', 'Pazaryeri Bilgilendirmesi'],
    ['seller-agreement', '/satici-sozlesmesi', 'Satıcı Sözleşmesi'],
];
const documents = Object.freeze(definitions.map(([slug, path, title]) => {
    const text = getReviewLegalText(slug);
    if (!text) throw new Error('Review legal content missing');
    return Object.freeze({ slug, path, title, text, version: VERSION, status: 'review_template',
        requiredForCheckout: false, consentEligible: false, lawyerApproved: false,
        contentHash: crypto.createHash('sha256').update(text).digest('hex') });
}));
module.exports = { listLegalDocuments: () => documents, getLegalDocument: slug => documents.find(doc => doc.slug === slug) || null };
