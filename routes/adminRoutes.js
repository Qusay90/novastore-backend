const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/adminController');

// Admin panelinin özet istatistiklerini getiren yol
router.get('/stats', getDashboardStats);

module.exports = router;