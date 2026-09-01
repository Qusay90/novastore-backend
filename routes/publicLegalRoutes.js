'use strict';

const express = require('express');
const {
    getLegalDocument,
    listLegalDocuments
} = require('../services/legalDocumentService');

const router = express.Router();

router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ documents: listLegalDocuments() });
});

router.get('/:slug', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const document = getLegalDocument(req.params.slug);
    if (!document) return res.status(404).json({ error: 'Yasal belge bulunamadı.' });
    return res.status(200).json(document);
});

module.exports = router;
