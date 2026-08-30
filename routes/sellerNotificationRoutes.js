'use strict';

const express = require('express');
const controller = require('../controllers/notificationController');
const { privateNoStore } = require('../middlewares/privateNoStore');

const createSellerNotificationRouter = ({ enabled, auth, tenant } = {}) => {
    const router = express.Router();
    if (!enabled) return router;
    if (!auth?.sellerAudienceAuthenticate || !auth?.requireLiveSellerSession || !tenant?.resolveServerTenantContext) {
        throw new TypeError('Seller bildirim rotaları için kimlik ve tenant koruması gerekir.');
    }
    const guarded = [
        privateNoStore,
        auth.sellerAudienceAuthenticate,
        auth.requireLiveSellerSession,
        tenant.resolveServerTenantContext
    ];

    router.get('/notifications', ...guarded, controller.getSellerNotifications);
    router.get('/notifications/unread-count', ...guarded, controller.getSellerUnreadCount);
    router.get('/notifications/:id/target', ...guarded, controller.getSellerNotificationTarget);
    router.patch('/notifications/read-all', ...guarded, controller.markAllSellerNotificationsRead);
    router.patch('/notifications/:id/read', ...guarded, controller.markSellerNotificationRead);
    router.get('/notifications/web-push/config', ...guarded, controller.getSellerWebPushConfig);
    router.get('/notifications/web-push/subscriptions', ...guarded, controller.getSellerWebPushState);
    router.post('/notifications/web-push/subscriptions', ...guarded, controller.registerSellerPushSubscription);
    router.delete('/notifications/web-push/subscriptions', ...guarded, controller.revokeSellerPushSubscription);
    router.delete('/notifications/web-push/subscriptions/session', ...guarded, controller.revokeSellerPushSession);
    router.post('/notifications/android-push/tokens', ...guarded, controller.registerSellerAndroidPushToken);
    router.delete('/notifications/android-push/tokens', ...guarded, controller.revokeSellerAndroidPushToken);
    router.delete('/notifications/android-push/tokens/session', ...guarded, controller.revokeSellerAndroidPushSession);
    return router;
};

module.exports = Object.freeze({ createSellerNotificationRouter });
