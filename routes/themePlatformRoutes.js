'use strict';

const express = require('express');
const { authenticateAdmin } = require('../middlewares/authMiddleware');
const { principalFromAdmin, principalFromSeller } = require('../services/themePlatformAuthService');
const { createThemePlatformService } = require('../services/themePlatformService');

const adminRoutes = Object.freeze([
    ['get', '/themes', 'themes'], ['post', '/themes', 'createTheme'],
    ['get', '/themes/:themeId', 'theme'], ['post', '/themes/:themeId/versions', 'createVersion'],
    ['get', '/versions/:versionId', 'version'], ['post', '/versions/:versionId/publish', 'publishVersion'],
    ['get', '/services', 'services'], ['post', '/services', 'createService'],
    ['get', '/services/:serviceId', 'service'], ['patch', '/services/:serviceId', 'updateService'],
    ['post', '/services/:serviceId/assignments', 'assign'], ['post', '/assignments/:assignmentId/withdraw', 'withdraw'],
    ['post', '/assignments/:assignmentId/delivery-retry', 'retryAssignmentDelivery'],
    ['get', '/services/:serviceId/entitlements', 'entitlements'], ['put', '/services/:serviceId/entitlements/:featureCode', 'entitlement'],
    ['get', '/operations/:operationId', 'operation'], ['get', '/services/:serviceId/audit', 'audit']
]);
const sellerRoutes = Object.freeze([
    ['get', '/assignments', 'assignments'], ['get', '/assignments/:assignmentId', 'assignment'],
    ['post', '/assignments/:assignmentId/accept', 'accept'], ['get', '/services/:serviceId/capabilities', 'capabilities'],
    ['get', '/services/:serviceId/entitlements', 'entitlements'],
    ['get', '/drafts/:draftId', 'draft'], ['put', '/drafts/:draftId', 'saveDraft'],
    ['post', '/drafts/:draftId/previews', 'preview'], ['get', '/previews/:previewId', 'preview'],
    ['post', '/services/:serviceId/assets', 'registerAsset'], ['get', '/assets/:assetId', 'asset'],
    ['post', '/drafts/:draftId/publications', 'publication'], ['get', '/publications/:publicationId', 'publication'],
    ['post', '/publications/:publicationId/rollback', 'rollback'], ['get', '/operations/:operationId', 'operation']
]);
const privateHeaders = (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
};
const createRouter = ({ database, enabled, kind, auth, tenant, storageRoot, storage, composition }) => {
    const router = express.Router();
    router.use(privateHeaders);
    if (enabled !== true) {
        router.use((_req, res) => res.status(404).json({ code: 'THEME_PLATFORM_DISABLED' }));
        return router;
    }
    const service = createThemePlatformService(database);
    if (kind === 'admin') router.use(authenticateAdmin);
    else {
        if (!auth?.sellerAudienceAuthenticate || !auth?.requireLiveSellerSession || !tenant?.resolveServerTenantContext) throw new TypeError('Existing Seller auth and tenant middleware required');
        router.use(auth.sellerAudienceAuthenticate, auth.requireLiveSellerSession, tenant.resolveServerTenantContext);
    }
    router.use(require('./themeExperienceRoutes').createThemeExperienceRouter({ database, kind, storageRoot, storage }));
    router.use(require('./themeStoreContentRoutes').createThemeStoreContentRouter({ database, kind }));
    router.use(require('./themeStoreSupportRoutes').createThemeStoreSupportRouter({ database, kind }));
    router.use(require('./themePublicationRoutes').createThemePublicationRouter({database,kind,
        composition:composition||require('../services/themePlatformRuntimeComposition').createThemeRuntimeComposition({database})}));
    const adminEditorRoutes = sellerRoutes.filter(([, path]) => /^\/(?:drafts|previews|assets|publications)\//u.test(path));
    for (const [method, path, action] of kind === 'admin' ? [...adminRoutes, ...adminEditorRoutes] : sellerRoutes) {
        router[method](path, async (req, res) => {
            try {
                if (Object.keys(req.query).length) return res.status(400).json({ code: 'THEME_QUERY_NOT_SUPPORTED' });
                const principal = kind === 'admin' ? principalFromAdmin(req) : principalFromSeller(req);
                const result = method === 'get'
                    ? await service.read(principal, action, req.params)
                    : await service.execute(principal, action, req.params, req.body, {
                        idempotencyKey: req.get('Idempotency-Key'), ifMatch: req.get('If-Match')
                    });
                return res.status(200).json(result);
            } catch (error) {
                const code = typeof error.code === 'string' && /^(?:THEME_|RESOURCE_NOT_FOUND$)/u.test(error.code)
                    ? error.code : 'THEME_SERVICE_UNAVAILABLE';
                const status = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500
                    ? error.statusCode : 503;
                return res.status(status).json({ code });
            }
        });
    }
    return router;
};

module.exports = Object.freeze({ adminRoutes, sellerRoutes,
    createAdminThemeRouter: (options) => createRouter({ ...options, kind: 'admin' }),
    createSellerThemeRouter: (options) => createRouter({ ...options, kind: 'seller' }) });
