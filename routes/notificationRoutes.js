const express = require('express');
const router = express.Router();
const {
    getUserNotifications,
    getAdminNotifications,
    markAsRead,
    markAllAsRead,
    sendTestNotification
} = require('../controllers/notificationController');

// Kullanıcının bildirimlerini getir
router.get('/user/:userId', getUserNotifications);

// Admin bildirimlerini getir
router.get('/admin', getAdminNotifications);

// Tekil bildirimi okundu yap
router.patch('/:id/read', markAsRead);

// Tüm bildirimleri okundu yap (userId veya 'admin')
router.patch('/read-all/:userId', markAllAsRead);

// Test bildirimi gönder
router.post('/test', sendTestNotification);

module.exports = router;
