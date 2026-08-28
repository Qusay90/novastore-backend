'use strict';

const pool = require('../config/db');
const { emitWithRetry } = require('../services/notificationService');
const {
    NotificationTargetError,
    normalizeNotificationTarget
} = require('../services/notificationTargetService');
const {
    NotificationReadError,
    getUnreadCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead
} = require('../services/notificationReadService');
const {
    WebPushSubscriptionError,
    getWebPushSubscriptionState,
    regularBinding,
    registerWebPushSubscription,
    revokeWebPushSubscription,
    revokeWebPushSubscriptionsForSession,
    sellerBinding
} = require('../services/webPushSubscriptionService');
const { publicWebPushConfiguration } = require('../services/webPushProviderService');

const redactKnownSecretText = (value = '') => {
    let text = String(value || '');
    for (const secret of [process.env.PAYTR_MERCHANT_KEY, process.env.PAYTR_MERCHANT_SALT, process.env.VAPID_PRIVATE_KEY]) {
        const secretText = String(secret || '').trim();
        if (secretText) text = text.split(secretText).join('[REDACTED]');
    }
    return text;
};

const legacyTitle = (type) => ({
    ai_handoff: 'Destek devri gerekli',
    new_order: 'Yeni sipariş',
    new_question: 'Yeni ürün sorusu',
    new_review: 'Yeni değerlendirme',
    order_update: 'Sipariş güncellendi',
    question_answered: 'Sorunuz yanıtlandı',
    support_message: 'Yeni destek mesajı'
}[String(type || '').trim()] || 'NovaStore bildirimi');

/**
 * Geriye dönük çağrılar için tek `notifications` gerçeğine yazan uyumluluk sınırı.
 * Yeni launch-critical akışlar `notificationOutboxService` kullanmalıdır.
 */
const createNotification = async (userId, type, message, io = null, target = null) => {
    const normalizedTarget = normalizeNotificationTarget(target);
    const recipientRole = userId ? 'customer' : 'admin';
    try {
        const result = await pool.query(
            `INSERT INTO notifications
                (user_id, recipient_role, type, category, priority, title, message,
                 entity_type, entity_id, entity_key)
             VALUES ($1, $2, $3, 'ACCOUNT', 'NORMAL', $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                userId || null,
                recipientRole,
                type,
                legacyTitle(type),
                message,
                normalizedTarget?.entityType || null,
                normalizedTarget?.entityId || null,
                normalizedTarget?.entityKey || null
            ]
        );
        const notification = result.rows[0];
        await pool.query(
            `INSERT INTO notification_deliveries
                (notification_id, channel, endpoint_key, status, attempt_count, sent_at)
             VALUES ($1, 'IN_APP', 'logical', 'SENT', 1, CURRENT_TIMESTAMP)
             ON CONFLICT (notification_id, channel, endpoint_key) DO NOTHING`,
            [notification.id]
        );
        const room = userId ? `user_${Number(userId)}` : 'admin_room';
        await emitWithRetry({
            io,
            room,
            eventName: 'notification_refresh',
            payload: { notificationId: Number(notification.id), unreadChanged: true },
            notificationId: notification.id,
            retries: 1
        }).catch(() => false);
        return notification;
    } catch (error) {
        if (error instanceof NotificationTargetError) throw error;
        console.error('Bildirim oluşturma hatası:', redactKnownSecretText(error?.code || error?.name || 'NOTIFICATION_CREATE_FAILED'));
        return null;
    }
};

const currentScope = (req) => Object.freeze({
    userId: Number(req.user.id),
    role: String(req.user.principal || req.user.role).toLowerCase(),
    organizationId: null,
    storeIds: Object.freeze([])
});

const currentSellerScope = (req) => Object.freeze({
    userId: Number(req.sellerContext.userId),
    role: 'seller',
    organizationId: Number(req.sellerContext.organizationId),
    storeIds: req.sellerContext.storeIds || Object.freeze([])
});

const sendKnownError = (res, error) => {
    if (error instanceof NotificationReadError || error instanceof WebPushSubscriptionError || error instanceof NotificationTargetError) {
        return res.status(error.statusCode || 400).json({ code: error.code, error: error.message });
    }
    console.error('Bildirim isteği hatası:', redactKnownSecretText(error?.code || error?.name || 'NOTIFICATION_REQUEST_FAILED'));
    return res.status(500).json({ code: 'NOTIFICATION_REQUEST_FAILED', error: 'Bildirim işlemi tamamlanamadı.' });
};

const makeListHandler = (scopeFactory, { legacyArray = false } = {}) => async (req, res) => {
    try {
        const page = await listNotifications(pool, scopeFactory(req), {
            limit: req.query?.limit,
            cursor: req.query?.cursor
        });
        return res.status(200).json(legacyArray ? page.items : page);
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const makeUnreadHandler = (scopeFactory) => async (req, res) => {
    try {
        const unreadCount = await getUnreadCount(pool, scopeFactory(req));
        return res.status(200).json({ unreadCount });
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const makeMarkOneHandler = (scopeFactory) => async (req, res) => {
    try {
        const notification = await markNotificationRead(pool, scopeFactory(req), req.params.id);
        return res.status(200).json({ notification });
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const makeMarkAllHandler = (scopeFactory) => async (req, res) => {
    try {
        const updatedCount = await markAllNotificationsRead(pool, scopeFactory(req));
        return res.status(200).json({ updatedCount });
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const makePushConfigHandler = () => (_req, res) => res.status(200).json(publicWebPushConfiguration());

const makePushStateHandler = (bindingFactory) => async (req, res) => {
    try {
        const state = await getWebPushSubscriptionState({ binding: bindingFactory(req) });
        return res.status(200).json(state);
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const makePushRegisterHandler = (bindingFactory) => async (req, res) => {
    try {
        const subscription = await registerWebPushSubscription({
            binding: bindingFactory(req),
            subscription: req.body?.subscription || req.body
        });
        return res.status(201).json({ subscription });
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const makePushRevokeHandler = (bindingFactory) => async (req, res) => {
    try {
        const result = await revokeWebPushSubscription({
            binding: bindingFactory(req),
            endpoint: req.body?.endpoint
        });
        return res.status(200).json(result);
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const makePushRevokeSessionHandler = (bindingFactory) => async (req, res) => {
    try {
        const revokedCount = await revokeWebPushSubscriptionsForSession({ binding: bindingFactory(req) });
        return res.status(200).json({ revokedCount });
    } catch (error) {
        return sendKnownError(res, error);
    }
};

const getCurrentNotifications = makeListHandler(currentScope);
const getCurrentUnreadCount = makeUnreadHandler(currentScope);
const markAsRead = makeMarkOneHandler(currentScope);
const markAllAsRead = makeMarkAllHandler(currentScope);
const getWebPushConfig = makePushConfigHandler();
const getWebPushState = makePushStateHandler(regularBinding);
const registerPushSubscription = makePushRegisterHandler(regularBinding);
const revokePushSubscription = makePushRevokeHandler(regularBinding);
const revokePushSession = makePushRevokeSessionHandler(regularBinding);

const getSellerNotifications = makeListHandler(currentSellerScope);
const getSellerUnreadCount = makeUnreadHandler(currentSellerScope);
const markSellerNotificationRead = makeMarkOneHandler(currentSellerScope);
const markAllSellerNotificationsRead = makeMarkAllHandler(currentSellerScope);
const getSellerWebPushConfig = makePushConfigHandler();
const getSellerWebPushState = makePushStateHandler(sellerBinding);
const registerSellerPushSubscription = makePushRegisterHandler(sellerBinding);
const revokeSellerPushSubscription = makePushRevokeHandler(sellerBinding);
const revokeSellerPushSession = makePushRevokeSessionHandler(sellerBinding);

const getUserNotifications = async (req, res) => {
    if (Number(req.params.userId) !== Number(req.user.id) || req.user.principal !== 'customer') {
        return res.status(403).json({ code: 'NOTIFICATION_SCOPE_FORBIDDEN', error: 'Bu bildirim kapsamına erişim yetkiniz yok.' });
    }
    return makeListHandler(currentScope, { legacyArray: true })(req, res);
};

const getAdminNotifications = makeListHandler(currentScope, { legacyArray: true });

const markAllAsReadLegacy = async (req, res) => {
    const requested = String(req.params.userId || '');
    const expected = req.user.principal === 'admin' ? 'admin' : String(req.user.id);
    if (requested !== expected) {
        return res.status(403).json({ code: 'NOTIFICATION_SCOPE_FORBIDDEN', error: 'Bu bildirim kapsamına erişim yetkiniz yok.' });
    }
    return markAllAsRead(req, res);
};

const sendTestNotification = (_req, res) => res.status(410).json({
    code: 'CLIENT_DIRECTED_NOTIFICATION_DISABLED',
    error: 'İstemci tarafından alıcı seçilen test bildirimi devre dışıdır.'
});

module.exports = {
    createNotification,
    getAdminNotifications,
    getCurrentNotifications,
    getCurrentUnreadCount,
    getSellerNotifications,
    getSellerUnreadCount,
    getSellerWebPushConfig,
    getSellerWebPushState,
    getUserNotifications,
    getWebPushConfig,
    getWebPushState,
    markAllAsRead,
    markAllAsReadLegacy,
    markAllSellerNotificationsRead,
    markAsRead,
    markSellerNotificationRead,
    registerPushSubscription,
    registerSellerPushSubscription,
    revokePushSession,
    revokePushSubscription,
    revokeSellerPushSession,
    revokeSellerPushSubscription,
    sendTestNotification
};
