'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificationController');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { requireCurrentAdmin, requireCurrentAdminIfClaimed } = require('../middlewares/currentAdmin');
const { privateNoStore } = require('../middlewares/privateNoStore');

router.use(privateNoStore);

router.get('/', authenticate, requireCurrentAdminIfClaimed, controller.getCurrentNotifications);
router.get('/unread-count', authenticate, requireCurrentAdminIfClaimed, controller.getCurrentUnreadCount);

router.get('/web-push/config', authenticate, requireCurrentAdminIfClaimed, controller.getWebPushConfig);
router.get('/web-push/subscriptions', authenticate, requireCurrentAdminIfClaimed, controller.getWebPushState);
router.post('/web-push/subscriptions', authenticate, requireCurrentAdminIfClaimed, controller.registerPushSubscription);
router.delete('/web-push/subscriptions', authenticate, requireCurrentAdminIfClaimed, controller.revokePushSubscription);
router.delete('/web-push/subscriptions/session', authenticate, requireCurrentAdminIfClaimed, controller.revokePushSession);

router.post('/android-push/tokens', authenticate, requireCurrentAdminIfClaimed, controller.registerAndroidPushToken);
router.delete('/android-push/tokens', authenticate, requireCurrentAdminIfClaimed, controller.revokeAndroidPushToken);
router.delete('/android-push/tokens/session', authenticate, requireCurrentAdminIfClaimed, controller.revokeAndroidPushSession);

router.get('/user/:userId', authenticate, controller.getUserNotifications);
router.get('/admin', authenticate, requireAdmin, requireCurrentAdmin, controller.getAdminNotifications);
router.patch('/read-all/:userId', authenticate, requireCurrentAdminIfClaimed, controller.markAllAsReadLegacy);
router.patch('/read-all', authenticate, requireCurrentAdminIfClaimed, controller.markAllAsRead);
router.patch('/:id/read', authenticate, requireCurrentAdminIfClaimed, controller.markAsRead);

router.post('/test', authenticate, requireAdmin, requireCurrentAdmin, controller.sendTestNotification);

module.exports = router;
