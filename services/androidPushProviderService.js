'use strict';

const crypto = require('node:crypto');
const { assertExternalSideEffectAllowed } = require('../config/stagingRuntimePolicy');
const { normalizeNotificationTarget } = require('./notificationTargetService');

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_API_ORIGIN = 'https://fcm.googleapis.com';
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const CLIENT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u;
const INVALID_ENDPOINT_CODES = new Set(['INVALID_ARGUMENT', 'SENDER_ID_MISMATCH', 'UNREGISTERED']);
const RETRYABLE_PROVIDER_CODES = new Set(['INTERNAL', 'QUOTA_EXCEEDED', 'UNAVAILABLE']);

class AndroidPushProviderError extends Error {
    constructor(message, code = 'FCM_PROVIDER_UNAVAILABLE', options = {}) {
        super(message);
        this.name = 'AndroidPushProviderError';
        this.code = code;
        this.statusCode = options.statusCode || null;
        this.providerCode = options.providerCode || null;
        this.retryable = options.retryable === true;
        this.invalidEndpoint = options.invalidEndpoint === true;
    }
}

const normalizePrivateKey = (value) => String(value || '').replace(/\\n/gu, '\n').trim();

const resolveFcmConfiguration = (env = process.env) => {
    const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
    const clientEmail = String(env.FIREBASE_CLIENT_EMAIL || '').trim().toLowerCase();
    const privateKey = normalizePrivateKey(env.FIREBASE_PRIVATE_KEY);
    const timeoutRequested = Number(env.FCM_REQUEST_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(timeoutRequested)
        ? Math.max(1000, Math.min(timeoutRequested, 15000))
        : 5000;
    const projectIdValid = PROJECT_ID_PATTERN.test(projectId);
    const clientEmailValid = CLIENT_EMAIL_PATTERN.test(clientEmail);
    const privateKeyValid = privateKey.length >= 256
        && privateKey.length <= 16384
        && /^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/u.test(privateKey);
    const configured = projectIdValid && clientEmailValid && privateKeyValid;
    return Object.freeze({
        configured,
        projectId: configured ? projectId : null,
        clientEmail: configured ? clientEmail : null,
        privateKey: configured ? privateKey : null,
        projectIdConfigured: Boolean(projectId),
        clientEmailConfigured: Boolean(clientEmail),
        privateKeyConfigured: Boolean(privateKey),
        projectIdValid,
        clientEmailValid,
        privateKeyValid,
        timeoutMs
    });
};

const publicFcmConfiguration = (env = process.env) => {
    const config = resolveFcmConfiguration(env);
    return Object.freeze({
        provider: 'FCM_HTTP_V1',
        configured: config.configured,
        projectIdConfigured: config.projectIdConfigured,
        clientEmailConfigured: config.clientEmailConfigured,
        privateKeyConfigured: config.privateKeyConfigured
    });
};

const safeText = (value, max) => String(value || '')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .trim()
    .slice(0, max);

const buildAndroidPushPayload = (notification) => {
    const entityType = notification.entity_type ?? notification.entityType;
    const entityId = notification.entity_id ?? notification.entityId;
    const entityKey = notification.entity_key ?? notification.entityKey;
    const target = entityType
        ? normalizeNotificationTarget({ entityType, entityId, entityKey })
        : null;
    if (!target) {
        throw new AndroidPushProviderError('Android bildirimi güvenli typed target içermiyor.', 'FCM_PAYLOAD_TARGET_INVALID');
    }
    const notificationId = Number(notification.id);
    if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
        throw new AndroidPushProviderError('Android bildirimi kimliği geçersiz.', 'FCM_PAYLOAD_NOTIFICATION_ID_INVALID');
    }
    return Object.freeze({
        notificationId,
        type: safeText(notification.type, 80),
        category: safeText(notification.category, 32),
        priority: safeText(notification.priority, 16),
        title: safeText(notification.title, 120),
        body: safeText(notification.message ?? notification.body, 180),
        target: Object.freeze({
            entityType: target.entityType,
            ...(target.entityId ? { entityId: target.entityId } : {}),
            ...(target.entityKey ? { entityKey: target.entityKey } : {})
        })
    });
};

const buildFcmHttpV1Message = ({ endpoint, notification }) => {
    const payload = buildAndroidPushPayload(notification);
    const token = String(endpoint?.token || '').trim();
    if (!token) {
        throw new AndroidPushProviderError('Android teslim noktası token içermiyor.', 'FCM_ENDPOINT_TOKEN_MISSING', {
            invalidEndpoint: true
        });
    }
    const data = Object.freeze({
        notificationId: String(payload.notificationId),
        type: payload.type,
        category: payload.category,
        priority: payload.priority,
        title: payload.title,
        body: payload.body,
        target: JSON.stringify(payload.target)
    });
    return Object.freeze({
        message: Object.freeze({
            token,
            notification: Object.freeze({ title: payload.title, body: payload.body }),
            data,
            android: Object.freeze({
                priority: ['CRITICAL', 'HIGH'].includes(payload.priority) ? 'high' : 'normal',
                ttl: payload.priority === 'CRITICAL' ? '900s' : '3600s',
                notification: Object.freeze({
                    channel_id: 'novastore_transactional',
                    tag: `novastore-${payload.notificationId}`,
                    default_sound: true
                })
            })
        })
    });
};

const base64UrlJson = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const createServiceAccountJwt = ({ config, nowSeconds = Math.floor(Date.now() / 1000), sign = crypto.sign }) => {
    if (!config?.configured) {
        throw new AndroidPushProviderError('FCM server yapılandırması eksik.', 'FCM_CONFIGURATION_REQUIRED');
    }
    const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
    const claims = base64UrlJson({
        iss: config.clientEmail,
        scope: FCM_SCOPE,
        aud: GOOGLE_OAUTH_TOKEN_URL,
        iat: nowSeconds,
        exp: nowSeconds + 3600
    });
    const unsigned = `${header}.${claims}`;
    let signature;
    try {
        signature = sign('RSA-SHA256', Buffer.from(unsigned, 'utf8'), config.privateKey);
    } catch (_) {
        throw new AndroidPushProviderError('FCM server anahtarı kullanılamıyor.', 'FCM_CREDENTIAL_INVALID');
    }
    return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
};

const readJsonResponse = async (response) => {
    const text = String(await response.text()).slice(0, 65536);
    if (!text) return Object.freeze({});
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : Object.freeze({});
    } catch (_) {
        return Object.freeze({});
    }
};

const fcmProviderCode = (body) => {
    const details = Array.isArray(body?.error?.details) ? body.error.details : [];
    const detailCode = details.map((entry) => String(entry?.errorCode || '').trim().toUpperCase()).find(Boolean);
    return detailCode || String(body?.error?.status || '').trim().toUpperCase() || null;
};

const classifyFcmResponseError = ({ statusCode, body }) => {
    const providerCode = fcmProviderCode(body);
    if (providerCode && INVALID_ENDPOINT_CODES.has(providerCode)) {
        return new AndroidPushProviderError('FCM teslim noktası artık geçerli değil.', 'FCM_ENDPOINT_INVALID', {
            statusCode,
            providerCode,
            invalidEndpoint: true
        });
    }
    if (statusCode === 429 || statusCode >= 500 || RETRYABLE_PROVIDER_CODES.has(providerCode)) {
        return new AndroidPushProviderError('FCM geçici olarak kullanılamıyor.', 'FCM_PROVIDER_RETRYABLE', {
            statusCode,
            providerCode,
            retryable: true
        });
    }
    if ([401, 403].includes(statusCode) || providerCode === 'THIRD_PARTY_AUTH_ERROR') {
        return new AndroidPushProviderError('FCM server yetkilendirmesi reddedildi.', 'FCM_CREDENTIAL_REJECTED', {
            statusCode,
            providerCode
        });
    }
    return new AndroidPushProviderError('FCM isteği kalıcı olarak reddedildi.', 'FCM_PROVIDER_REJECTED', {
        statusCode,
        providerCode
    });
};

const classifyOAuthError = ({ statusCode }) => {
    if (statusCode === 429 || statusCode >= 500) {
        return new AndroidPushProviderError('Firebase OAuth geçici olarak kullanılamıyor.', 'FCM_AUTH_RETRYABLE', {
            statusCode,
            retryable: true
        });
    }
    return new AndroidPushProviderError('Firebase server kimliği reddedildi.', 'FCM_CREDENTIAL_REJECTED', { statusCode });
};

const classifyTransportError = (error) => {
    if (error instanceof AndroidPushProviderError) return error;
    const timeout = error?.name === 'AbortError' || error?.code === 'ETIMEDOUT';
    return new AndroidPushProviderError(
        timeout ? 'FCM isteği zaman aşımına uğradı.' : 'FCM ağına erişilemedi.',
        timeout ? 'FCM_PROVIDER_TIMEOUT' : 'FCM_PROVIDER_RETRYABLE',
        { retryable: true }
    );
};

const fetchWithTimeout = async (fetchImpl, url, options, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

const createFcmHttpV1Provider = ({
    env = process.env,
    fetchImpl = globalThis.fetch,
    assertOutboundAllowed = assertExternalSideEffectAllowed,
    now = () => Date.now(),
    sign = crypto.sign
} = {}) => {
    const config = resolveFcmConfiguration(env);
    if (!config.configured) {
        return Object.freeze({
            configured: false,
            provider: 'FCM_HTTP_V1',
            send: async () => {
                throw new AndroidPushProviderError('FCM server yapılandırması eksik.', 'FCM_CONFIGURATION_REQUIRED');
            }
        });
    }
    if (typeof fetchImpl !== 'function') {
        return Object.freeze({
            configured: false,
            provider: 'FCM_HTTP_V1',
            send: async () => {
                throw new AndroidPushProviderError('FCM HTTP istemcisi kullanılamıyor.', 'FCM_HTTP_CLIENT_UNAVAILABLE');
            }
        });
    }

    let cachedAccessToken = null;
    let cachedAccessTokenExpiresAt = 0;
    let tokenPromise = null;

    const getAccessToken = async () => {
        if (cachedAccessToken && cachedAccessTokenExpiresAt > now() + 60000) return cachedAccessToken;
        if (tokenPromise) return tokenPromise;
        tokenPromise = (async () => {
            const assertion = createServiceAccountJwt({
                config,
                nowSeconds: Math.floor(now() / 1000),
                sign
            });
            let response;
            try {
                response = await fetchWithTimeout(
                    fetchImpl,
                    GOOGLE_OAUTH_TOKEN_URL,
                    {
                        method: 'POST',
                        headers: { 'content-type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                            assertion
                        }).toString()
                    },
                    config.timeoutMs
                );
            } catch (error) {
                throw classifyTransportError(error);
            }
            const body = await readJsonResponse(response);
            if (!response.ok) throw classifyOAuthError({ statusCode: Number(response.status), body });
            const accessToken = String(body.access_token || '').trim();
            const expiresIn = Number(body.expires_in);
            if (!accessToken || !Number.isFinite(expiresIn) || expiresIn < 60) {
                throw new AndroidPushProviderError('Firebase OAuth yanıtı geçersiz.', 'FCM_AUTH_RESPONSE_INVALID');
            }
            cachedAccessToken = accessToken;
            cachedAccessTokenExpiresAt = now() + (Math.min(expiresIn, 3600) * 1000);
            return accessToken;
        })();
        try {
            return await tokenPromise;
        } finally {
            tokenPromise = null;
        }
    };

    return Object.freeze({
        configured: true,
        provider: 'FCM_HTTP_V1',
        send: async ({ endpoint, notification }) => {
            assertOutboundAllowed('outbound_notification');
            const accessToken = await getAccessToken();
            const body = buildFcmHttpV1Message({ endpoint, notification });
            let response;
            try {
                response = await fetchWithTimeout(
                    fetchImpl,
                    `${FCM_API_ORIGIN}/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
                    {
                        method: 'POST',
                        headers: {
                            authorization: `Bearer ${accessToken}`,
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    },
                    config.timeoutMs
                );
            } catch (error) {
                throw classifyTransportError(error);
            }
            const responseBody = await readJsonResponse(response);
            if (!response.ok) {
                throw classifyFcmResponseError({ statusCode: Number(response.status), body: responseBody });
            }
            const providerMessageId = safeText(responseBody.name, 240);
            if (!providerMessageId) {
                throw new AndroidPushProviderError('FCM kabul yanıtı doğrulanamadı.', 'FCM_PROVIDER_RESPONSE_INVALID');
            }
            return Object.freeze({
                accepted: true,
                statusCode: Number(response.status) || 200,
                providerMessageId
            });
        }
    });
};

module.exports = Object.freeze({
    AndroidPushProviderError,
    FCM_API_ORIGIN,
    FCM_SCOPE,
    GOOGLE_OAUTH_TOKEN_URL,
    buildAndroidPushPayload,
    buildFcmHttpV1Message,
    classifyFcmResponseError,
    classifyTransportError,
    createFcmHttpV1Provider,
    createServiceAccountJwt,
    publicFcmConfiguration,
    resolveFcmConfiguration
});
