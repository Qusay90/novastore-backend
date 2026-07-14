const express = require('express');
const router = express.Router();
const {
    getAdminNotificationSummaries,
    getAdminOrderSummaries,
    getAdminProductSummaries,
    getAdminReturnSummaries,
    getAdminSession,
    getDashboardStats,
    getBehaviorAnalytics
} = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { privateNoStore } = require('../middlewares/privateNoStore');

const integratedAdminRead = [privateNoStore, authenticate, requireAdmin, requireCurrentAdmin];

router.get('/session', ...integratedAdminRead, getAdminSession);
router.get('/notifications/summary', ...integratedAdminRead, getAdminNotificationSummaries);
router.get('/orders/summary', ...integratedAdminRead, getAdminOrderSummaries);
router.get('/catalog/products/summary', ...integratedAdminRead, getAdminProductSummaries);
router.get('/returns/summary', ...integratedAdminRead, getAdminReturnSummaries);
router.get('/stats', ...integratedAdminRead, getDashboardStats);
router.get('/behavior', authenticate, requireAdmin, getBehaviorAnalytics);

module.exports = router;
