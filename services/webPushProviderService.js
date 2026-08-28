'use strict';

const { assertExternalSideEffectAllowed } = require('../config/stagingRuntimePolicy');
const { normalizeNotificationTarget } = require('./notificationTargetService');

const SUBJECT_PATTERN = /^(?:mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/iu;

class WebPushProviderError extends Error {
    constructor(message, code = 'WEB_PUSH_PROVIDER_UNAVAILABLE', options = {}) {
        super(message);
        this.name = 'WebPushProviderError';
        this.code = code;
        this.statusCode = options.statusCode || null;
        this.retryable = options.retryable === true;
        this.invalidSubscription = options.invalidSubscription === true;
    }
}

const resolveWebPushConfiguration = (env = process.env) => {
    const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
    const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
    const subject = String(env.WEB_PUSH_SUBJECT || '').trim();
    const complete = Boolean(publicKey && privateKey && SUBJECT_PATTERN.test(subject));
    return Object.freeze({
        configured: complete,
        publicKey: publicKey || null,
        subjectConfigured: Boolean(subject),
        privateKeyConfigured: Boolean(privateKey),
        subject: complete ? subject : null,
        privateKey: complete ? privateKey : null
    });
};

const publicWebPushConfiguration = (env = process.env) => {
    const config = resolveWebPushConfiguration(env);
    return Object.freeze({
        supported: true,
        configured: config.configured,
        publicKey: config.configured ? config.publicKey : null
    });
};

const safeText = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, max);

const buildWebPushPayload = (notification) => {
    const entityType = notification.entity_type ?? notification.entityType;
    const entityId = notification.entity_id ?? notification.entityId;
    const entityKey = notification.entity_key ?? notification.entityKey;
    const target = entityType
        ? normalizeNotificationTarget({ entityType, entityId, entityKey })
        : null;
    return Object.freeze({
        notificationId: Number(notification.id),
        recipientRole: ['admin', 'customer', 'seller'].includes(String(notification.recipient_role || notification.recipientRole || '').toLowerCase())
            ? String(notification.recipient_role || notification.recipientRole).toLowerCase()
            : 'customer',
        type: safeText(notification.type, 80),
        category: safeText(notification.category, 32),
        priority: safeText(notification.priority, 16),
        title: safeText(notification.title, 120),
        body: safeText(notification.message, 180),
        target: target ? Object.freeze({
            entityType: target.entityType,
            ...(target.entityId ? { entityId: target.entityId } : {}),
            ...(target.entityKey ? { entityKey: target.entityKey } : {})
        }) : null
    });
};

const classifyProviderError = (error) => {
    const statusCode = Number(error?.statusCode || error?.status);
    if ([404, 410].includes(statusCode)) {
        return new WebPushProviderError('Web Push aboneliği artık geçerli değil.', 'WEB_PUSH_SUBSCRIPTION_INVALID', {
            statusCode,
            invalidSubscription: true
        });
    }
    if (statusCode === 429 || statusCode >= 500 || !Number.isInteger(statusCode)) {
        return new WebPushProviderError('Web Push sağlayıcısı geçici olarak kullanılamıyor.', 'WEB_PUSH_PROVIDER_RETRYABLE', {
            statusCode: Number.isInteger(statusCode) ? statusCode : null,
            retryable: true
        });
    }
    return new WebPushProviderError('Web Push sağlayıcısı isteği reddetti.', 'WEB_PUSH_PROVIDER_REJECTED', { statusCode });
};

const createWebPushProvider = ({
    env = process.env,
    webPushModule = null,
    assertOutboundAllowed = assertExternalSideEffectAllowed
} = {}) => {
    const config = resolveWebPushConfiguration(env);
    if (!config.configured) {
        return Object.freeze({
            configured: false,
            publicKey: config.publicKey,
            send: async () => {
                throw new WebPushProviderError('Web Push üretim yapılandırması eksik.');
            }
        });
    }
    const moduleRef = webPushModule || require('web-push');
    moduleRef.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    return Object.freeze({
        configured: true,
        publicKey: config.publicKey,
        send: async ({ subscription, notification }) => {
            assertOutboundAllowed('outbound_notification');
            const payload = buildWebPushPayload(notification);
            try {
                const response = await moduleRef.sendNotification(
                    {
                        endpoint: subscription.endpoint,
                        expirationTime: subscription.expiration_time
                            ? new Date(subscription.expiration_time).getTime()
                            : null,
                        keys: {
                            p256dh: subscription.p256dh,
                            auth: subscription.auth_secret
                        }
                    },
                    JSON.stringify(payload),
                    {
                        TTL: notification.priority === 'CRITICAL' ? 900 : 3600,
                        urgency: ['CRITICAL', 'HIGH'].includes(notification.priority) ? 'high' : 'normal',
                        topic: `novastore-${Number(notification.id)}`.slice(0, 32)
                    }
                );
                return Object.freeze({
                    accepted: true,
                    statusCode: Number(response?.statusCode) || 201,
                    providerMessageId: null
                });
            } catch (error) {
                throw classifyProviderError(error);
            }
        }
    });
};

module.exports = Object.freeze({
    WebPushProviderError,
    buildWebPushPayload,
    classifyProviderError,
    createWebPushProvider,
    publicWebPushConfiguration,
    resolveWebPushConfiguration
});
