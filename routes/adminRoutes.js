const express = require('express');
const router = express.Router();
const {
    getAdminOrderSummaries,
    getAdminSession,
    getDashboardStats,
    getBehaviorAnalytics
} = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin } = require('../middlewares/currentAdmin');
const { privateNoStore } = require('../middlewares/privateNoStore');

const integratedAdminRead = [privateNoStore, authenticate, requireAdmin, requireCurrentAdmin];

router.get('/session', ...integratedAdminRead, getAdminSession);
router.get('/orders/summary', ...integratedAdminRead, getAdminOrderSummaries);
router.get('/stats', ...integratedAdminRead, getDashboardStats);
router.get('/behavior', authenticate, requireAdmin, getBehaviorAnalytics);

module.exports = router;
