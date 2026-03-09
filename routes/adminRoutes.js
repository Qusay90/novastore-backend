const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');

// Admin panelinin ozet istatistiklerini getiren yol
router.get('/stats', authenticate, requireAdmin, getDashboardStats);

module.exports = router;
