const pool = require('../config/db');
const { sendCatalogProductError } = require('./adminCatalogProductController');
const {
    listProductMedia,
    registerProductMedia,
    reorderProductMedia,
    deleteProductMediaRecord
} = require('../services/adminCatalogMediaService');

const requestId = (req) => req.get?.('x-request-id') || req.headers?.['x-request-id'] || null;

const handlers = {
    getAdminCatalogProductMedia: async (req, res) => {
        try {
            return res.status(200).json({ productId: Number(req.params.id), media: await listProductMedia(pool, req.params.id) });
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    },
    registerAdminCatalogProductMedia: async (req, res) => {
        try {
            return res.status(201).json(await registerProductMedia(pool, req.params.id, {
                actor: req.currentAdmin,
                body: req.body,
                requestId: requestId(req)
            }));
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    },
    reorderAdminCatalogProductMedia: async (req, res) => {
        try {
            return res.status(200).json(await reorderProductMedia(pool, req.params.id, {
                actor: req.currentAdmin,
                body: req.body,
                requestId: requestId(req)
            }));
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    },
    deleteAdminCatalogProductMedia: async (req, res) => {
        try {
            return res.status(200).json(await deleteProductMediaRecord(pool, req.params.id, req.params.mediaId, {
                actor: req.currentAdmin,
                body: req.body,
                requestId: requestId(req)
            }));
        } catch (error) {
            return sendCatalogProductError(res, error);
        }
    }
};

module.exports = handlers;
