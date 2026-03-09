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

// Kullanici bildirimleri
router.get('/user/:userId', authenticate, requireSelfOrAdmin('userId'), getUserNotifications);

// Admin bildirimleri
router.get('/admin', authenticate, requireAdmin, getAdminNotifications);

// Tekil bildirimi okundu yap
router.patch('/:id/read', authenticate, markAsRead);

// Tum bildirimleri okundu yap (userId veya 'admin')
router.patch('/read-all/:userId', authenticate, markAllAsRead);

// Test bildirimi gonder
router.post('/test', authenticate, requireAdmin, sendTestNotification);

module.exports = router;
