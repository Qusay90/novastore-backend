'use strict';

const express = require('express');
const projectionService = require('../services/publicStoreProjectionService');
const { PublicReadError, setPageHeaders } = require('../services/publicReadPaginationService');

const createPublicStoreRouter = ({ service = projectionService } = {}) => {
    if (!service || typeof service.loadPublicStoreBySlug !== 'function') {
        throw new TypeError('Public store projection service is required.');
    }
    const router = express.Router();
    router.get('/:storeSlug', async (req, res) => {
        try {
            const projection = await service.loadPublicStoreBySlug(req.params.storeSlug, { query: req.query || {} });
            if (projection.pagination) setPageHeaders(res, projection.pagination);
            return res.status(200).json(projection);
        } catch (error) {
            if (error instanceof PublicReadError) {
                return res.status(error.statusCode).json({ code: error.code, error: error.message });
            }
            if (error instanceof projectionService.PublicStoreError || error?.statusCode === 404) {
                return res.status(404).json({ code: 'STORE_NOT_FOUND', error: 'STORE_NOT_FOUND' });
            }
            return res.status(503).json({ code: 'PUBLIC_STORE_UNAVAILABLE', error: 'PUBLIC_STORE_UNAVAILABLE' });
        }
    });
    return router;
};

module.exports = createPublicStoreRouter();
module.exports.createPublicStoreRouter = createPublicStoreRouter;
