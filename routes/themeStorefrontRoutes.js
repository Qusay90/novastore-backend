'use strict';
const express = require('express');
const { createThemePlatformCommerceService } = require('../services/themePlatformCommerceService');

function createThemeStorefrontRouter({ database, enabled = false, referenceAdapter, assetReader, customerRuntimeAuthority } = {}) {
    const router = express.Router();
    router.use((_req, res, next) => enabled ? next() : res.status(404).json({ code: 'RESOURCE_NOT_FOUND' }));
    const service = createThemePlatformCommerceService({ database, referenceAdapter,customerRuntimeAuthority });
    router.use('/customer',require('./themeStorefrontCustomerRoutes').createThemeStorefrontCustomerRouter({database,runtimeAuthority:customerRuntimeAuthority}));
    const endpoint = (callback, allowQuery = false) => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            if (!allowQuery && Object.keys(req.query).length) return res.status(400).json({ code: 'INVALID_REQUEST' });
            return res.json(await callback(req, res));
        } catch (error) {
            return res.status(error.statusCode || 503).json({ code: error.statusCode ? error.code : 'STOREFRONT_UNAVAILABLE' });
        }
    };
    router.get('/context', endpoint((req) => service.context(req)));
    router.get('/legal', endpoint((req) => service.legal(req)));
    router.get('/legal/:type', endpoint((req) => service.legal(req,req.params.type)));
    router.get('/products', endpoint((req) => service.products(req, req.query), true));
    router.get('/products/:productId', endpoint((req) => service.product(req, req.params.productId)));
    for (const type of ['reviews', 'questions']) router.get(`/products/:productId/${type}`, endpoint((req) => service.reputation(req, req.params.productId, type)));
    router.get('/products/:productId/recommendations', endpoint((req) => service.recommendations(req, req.params.productId)));
    router.get('/categories', endpoint((req) => service.categories(req)));
    router.get('/collections', endpoint((req) => service.collections(req)));
    router.get('/collections/:collectionId', endpoint((req) => service.collection(req, req.params.collectionId, req.query), true));
    router.get('/navigation', endpoint((req) => service.navigation(req)));
    router.post('/quote', endpoint((req) => service.quote(req, req.body)));
    if (assetReader) router.get('/assets/:assetId', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            if (Object.keys(req.query).length) return res.status(400).json({ code: 'INVALID_REQUEST' });
            // The storage adapter receives only a server-resolved scope. It must
            // return trusted READY bytes; it must not follow remote URLs.
            const asset = await service.asset(req, req.params.assetId, assetReader);
            if (!Buffer.isBuffer(asset?.bytes) || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)) return res.status(404).json({ code: 'RESOURCE_NOT_FOUND' });
            res.set('Content-Type', asset.mimeType); res.set('X-Content-Type-Options', 'nosniff'); return res.send(asset.bytes);
        } catch (error) { return res.status(error.statusCode || 503).json({ code: error.statusCode ? error.code : 'STOREFRONT_UNAVAILABLE' }); }
    });
    router.use((_req, res) => res.status(404).json({ code: 'RESOURCE_NOT_FOUND' }));
    return router;
}
module.exports = { createThemeStorefrontRouter };
