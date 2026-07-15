const express = require('express');
const router = express.Router();
const {
    getUserNotifications,
    getAdminNotifications,
    markAsRead,
    markAllAsRead,
    sendTestNotification
} = require('../controllers/notificationController');
const { authenticate, requireAdmin, requireSelfOrAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');

// Kullanici bildirimleri
router.get('/user/:userId', authenticate, requireSelfOrAdmin('userId'), requireCurrentAdminIfClaimed, getUserNotifications);

// Admin bildirimleri
router.get('/admin', authenticate, requireAdmin, requireCurrentAdmin, getAdminNotifications);

// Tekil bildirimi okundu yap
router.patch('/:id/read', authenticate, requireCurrentAdminIfClaimed, markAsRead);

// Tum bildirimleri okundu yap (userId veya 'admin')
router.patch('/read-all/:userId', authenticate, requireCurrentAdminIfClaimed, markAllAsRead);

// Test bildirimi gonder
router.post('/test', authenticate, requireAdmin, requireCurrentAdmin, sendTestNotification);

module.exports = router;
