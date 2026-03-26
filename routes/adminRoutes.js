const express = require('express');
const router = express.Router();
const { getDashboardStats, getBehaviorAnalytics } = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

router.get('/stats', authenticate, requireAdmin, getDashboardStats);
router.get('/behavior', authenticate, requireAdmin, getBehaviorAnalytics);

module.exports = router;
