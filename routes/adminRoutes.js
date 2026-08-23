const express = require('express');
const router = express.Router();
const {
    getAdminCatalogStructureSummary,
    getAdminNotificationSummaries,
    getAdminOrderSummaries,
    getAdminProductSummaries,
    getAdminReturnSummaries,
    getAdminStoreDetail,
    getAdminStoreSummaries,
    getAdminSession,
    getDashboardStats,
    getBehaviorAnalytics
} = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { requireAdminCommerceCapability } = require('../middlewares/adminCommerceCapability');
const { requireAdminCatalogJson } = require('../middlewares/adminCatalogJson');
const {
    getAdminCatalogProduct,
    createAdminCatalogProduct,
    updateAdminCatalogProduct,
    archiveAdminCatalogProduct
} = require('../controllers/adminCatalogProductController');
const {
    getAdminCatalogProductMedia,
    registerAdminCatalogProductMedia,
    reorderAdminCatalogProductMedia,
    updateAdminCatalogProductMediaCardFraming,
    deleteAdminCatalogProductMedia
} = require('../controllers/adminCatalogMediaController');

const integratedAdminRead = [privateNoStore, authenticate, requireAdmin, requireCurrentAdmin];
const integratedAdminProductWrite = [
    privateNoStore,
    authenticate,
    requireAdmin,
    requireAdminCommerceCapability('firstPartyCatalogWrite'),
    requireCurrentAdmin,
    requireAdminCatalogJson
];

router.get('/session', ...integratedAdminRead, getAdminSession);
router.get('/notifications/summary', ...integratedAdminRead, getAdminNotificationSummaries);
router.get('/orders/summary', ...integratedAdminRead, getAdminOrderSummaries);
router.get('/catalog/products/summary', ...integratedAdminRead, getAdminProductSummaries);
router.get('/catalog/products/:id', ...integratedAdminRead, getAdminCatalogProduct);
router.get('/catalog/products/:id/media', ...integratedAdminRead, getAdminCatalogProductMedia);
router.post('/catalog/products/:id/media', ...integratedAdminProductWrite, registerAdminCatalogProductMedia);
router.put('/catalog/products/:id/media/order', ...integratedAdminProductWrite, reorderAdminCatalogProductMedia);
router.patch('/catalog/products/:id/media/:mediaId/framing', ...integratedAdminProductWrite, updateAdminCatalogProductMediaCardFraming);
router.delete('/catalog/products/:id/media/:mediaId', ...integratedAdminProductWrite, deleteAdminCatalogProductMedia);
router.post('/catalog/products', ...integratedAdminProductWrite, createAdminCatalogProduct);
router.patch('/catalog/products/:id/archive', ...integratedAdminProductWrite, archiveAdminCatalogProduct);
router.patch('/catalog/products/:id', ...integratedAdminProductWrite, updateAdminCatalogProduct);
router.get('/catalog/structure/summary', ...integratedAdminRead, getAdminCatalogStructureSummary);
router.get('/returns/summary', ...integratedAdminRead, getAdminReturnSummaries);
router.get('/stores/summary', ...integratedAdminRead, getAdminStoreSummaries);
router.get('/stores/:id', ...integratedAdminRead, getAdminStoreDetail);
router.get('/stats', ...integratedAdminRead, getDashboardStats);
router.get('/behavior', authenticate, requireAdmin, getBehaviorAnalytics);

module.exports = router;
