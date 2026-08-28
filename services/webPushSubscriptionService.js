'use strict';

const crypto = require('node:crypto');
const pool = require('../config/db');

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/u;
const WEB_PUSH_PROVIDER_HOSTS = Object.freeze([
    'fcm.googleapis.com',
    'updates.push.services.mozilla.com',
    'web.push.apple.com'
]);
const MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_SESSION = 5;
const MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_ACCOUNT = 20;
const MAX_WEB_PUSH_SUBSCRIPTION_ROWS_PER_ACCOUNT = 100;

const isApprovedWebPushProviderHost = (hostname) => {
    const normalized = String(hostname || '').trim().toLowerCase();
    return WEB_PUSH_PROVIDER_HOSTS.includes(normalized)
        || normalized === 'notify.windows.com'
        || normalized.endsWith('.notify.windows.com');
};

class WebPushSubscriptionError extends Error {
    constructor(message, code = 'WEB_PUSH_SUBSCRIPTION_INVALID', statusCode = 400) {
        super(message);
        this.name = 'WebPushSubscriptionError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const normalizeEndpoint = (rawEndpoint) => {
    const endpoint = String(rawEndpoint || '').trim();
    if (!endpoint || endpoint.length > 2048) {
        throw new WebPushSubscriptionError('Web Push endpoint bilgisi geçersiz.', 'WEB_PUSH_ENDPOINT_INVALID');
    }
    let parsed;
    try {
        parsed = new URL(endpoint);
    } catch (_) {
        throw new WebPushSubscriptionError('Web Push endpoint bilgisi geçersiz.', 'WEB_PUSH_ENDPOINT_INVALID');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
        throw new WebPushSubscriptionError('Web Push endpoint güvenli HTTPS adresi olmalıdır.', 'WEB_PUSH_ENDPOINT_INVALID');
    }
    if (parsed.port || !isApprovedWebPushProviderHost(parsed.hostname)) {
        throw new WebPushSubscriptionError(
            'Web Push endpoint yalnızca desteklenen tarayıcı push sağlayıcılarına ait olabilir.',
            'WEB_PUSH_PROVIDER_HOST_REJECTED'
        );
    }
    return parsed.toString();
};

const normalizeKey = (value, name, minLength, maxLength) => {
    const normalized = String(value || '').trim();
    if (
        normalized.length < minLength
        || normalized.length > maxLength
        || !BASE64URL_PATTERN.test(normalized)
    ) {
        throw new WebPushSubscriptionError(`${name} Web Push anahtarı geçersiz.`, 'WEB_PUSH_KEY_INVALID');
    }
    return normalized;
};

const normalizeExpiration = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        throw new WebPushSubscriptionError('Web Push abonelik süresi geçersiz.', 'WEB_PUSH_EXPIRATION_INVALID');
    }
    return parsed;
};

const normalizeSubscription = (input = {}) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new WebPushSubscriptionError('Web Push aboneliği bir nesne olmalıdır.');
    }
    const allowed = new Set(['endpoint', 'expirationTime', 'expiration_time', 'keys']);
    if (Object.keys(input).some((key) => !allowed.has(key))) {
        throw new WebPushSubscriptionError('Web Push aboneliği desteklenmeyen alan içeriyor.', 'WEB_PUSH_FIELD_REJECTED');
    }
    if (!input.keys || typeof input.keys !== 'object' || Array.isArray(input.keys)) {
        throw new WebPushSubscriptionError('Web Push anahtarları eksik.', 'WEB_PUSH_KEY_INVALID');
    }
    if (Object.keys(input.keys).some((key) => !['p256dh', 'auth'].includes(key))) {
        throw new WebPushSubscriptionError('Web Push anahtarları desteklenmeyen alan içeriyor.', 'WEB_PUSH_FIELD_REJECTED');
    }
    const endpoint = normalizeEndpoint(input.endpoint);
    return Object.freeze({
        endpoint,
        endpointHash: crypto.createHash('sha256').update(endpoint).digest('hex'),
        p256dh: normalizeKey(input.keys.p256dh, 'p256dh', 43, 256),
        authSecret: normalizeKey(input.keys.auth, 'auth', 16, 128),
        expirationTime: normalizeExpiration(input.expirationTime ?? input.expiration_time)
    });
};

const regularBinding = (request) => {
    const userId = Number(request?.user?.id);
    const role = String(request?.user?.principal || '').trim().toLowerCase();
    const sessionId = Number(request?.auth?.session?.id);
    if (!Number.isSafeInteger(userId) || userId < 1 || !['admin', 'customer'].includes(role) || !Number.isSafeInteger(sessionId) || sessionId < 1) {
        throw new WebPushSubscriptionError('Kimliği doğrulanmış oturum gerekli.', 'AUTH_REQUIRED', 401);
    }
    return Object.freeze({
        userId,
        role,
        organizationId: null,
        authSessionId: sessionId,
        sellerSessionId: null
    });
};

const sellerBinding = (request) => {
    const userId = Number(request?.sellerContext?.userId);
    const organizationId = Number(request?.sellerContext?.organizationId);
    const sessionId = String(request?.sellerSession?.sessionId || '').trim().toLowerCase();
    if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(organizationId) || organizationId < 1 || !sessionId) {
        throw new WebPushSubscriptionError('Geçerli satıcı oturumu gerekli.', 'AUTH_REQUIRED', 401);
    }
    return Object.freeze({
        userId,
        role: 'seller',
        organizationId,
        authSessionId: null,
        sellerSessionId: sessionId
    });
};

const isSameBinding = (row, binding) => (
    Number(row.user_id) === binding.userId
    && row.recipient_role === binding.role
    && Number(row.recipient_organization_id || 0) === Number(binding.organizationId || 0)
    && Number(row.auth_session_id || 0) === Number(binding.authSessionId || 0)
    && String(row.seller_session_id || '') === String(binding.sellerSessionId || '')
);

const isSameAccount = (row, binding) => (
    Number(row.user_id) === binding.userId
    && row.recipient_role === binding.role
    && Number(row.recipient_organization_id || 0) === Number(binding.organizationId || 0)
);

const capacityLockKey = (binding) => [
    'web-push-subscription-capacity',
    binding.role,
    binding.userId,
    binding.organizationId || 0
].join(':');

const enforceSubscriptionCapacity = async ({ client, binding, consumesHistoricalRow }) => {
    const result = await client.query(
        `SELECT COUNT(*)::INT AS total_count,
                COUNT(*) FILTER (WHERE status = 'ACTIVE')::INT AS active_account_count,
                COUNT(*) FILTER (
                    WHERE status = 'ACTIVE'
                      AND COALESCE(auth_session_id, 0) = COALESCE($4::BIGINT, 0)
                      AND COALESCE(seller_session_id::TEXT, '') = COALESCE($5::TEXT, '')
                )::INT AS active_session_count
           FROM web_push_subscriptions
          WHERE user_id = $1
            AND recipient_role = $2
            AND COALESCE(recipient_organization_id, 0) = COALESCE($3::BIGINT, 0)`,
        [
            binding.userId,
            binding.role,
            binding.organizationId,
            binding.authSessionId,
            binding.sellerSessionId
        ]
    );
    const counts = result.rows[0] || {};
    if (consumesHistoricalRow && Number(counts.total_count || 0) >= MAX_WEB_PUSH_SUBSCRIPTION_ROWS_PER_ACCOUNT) {
        throw new WebPushSubscriptionError(
            'Web Push abonelik geçmişi sınırına ulaşıldı.',
            'WEB_PUSH_SUBSCRIPTION_HISTORY_LIMIT',
            429
        );
    }
    if (Number(counts.active_account_count || 0) >= MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_ACCOUNT) {
        throw new WebPushSubscriptionError(
            'Bu hesap için etkin Web Push cihazı sınırına ulaşıldı.',
            'WEB_PUSH_SUBSCRIPTION_ACCOUNT_LIMIT',
            429
        );
    }
    if (Number(counts.active_session_count || 0) >= MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_SESSION) {
        throw new WebPushSubscriptionError(
            'Bu oturum için etkin Web Push aboneliği sınırına ulaşıldı.',
            'WEB_PUSH_SUBSCRIPTION_SESSION_LIMIT',
            429
        );
    }
};

const registerWebPushSubscription = async ({ database = pool, binding, subscription }) => {
    const normalized = normalizeSubscription(subscription);
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [capacityLockKey(binding)]
        );
        const existingResult = await client.query(
            `SELECT id, user_id, recipient_role, recipient_organization_id,
                    auth_session_id, seller_session_id, status
               FROM web_push_subscriptions
              WHERE endpoint_hash = $1
              FOR UPDATE`,
            [normalized.endpointHash]
        );
        const existing = existingResult.rows[0] || null;
        if (existing && existing.status === 'ACTIVE' && !isSameBinding(existing, binding)) {
            throw new WebPushSubscriptionError(
                'Bu Web Push aboneliği başka bir etkin oturuma bağlı.',
                'WEB_PUSH_SUBSCRIPTION_OWNERSHIP_CONFLICT',
                409
            );
        }
        if (!existing || existing.status !== 'ACTIVE') {
            await enforceSubscriptionCapacity({
                client,
                binding,
                consumesHistoricalRow: !existing || !isSameAccount(existing, binding)
            });
        }
        const id = existing?.id || crypto.randomUUID();
        const result = existing
            ? await client.query(
                `UPDATE web_push_subscriptions
                    SET user_id = $2,
                        recipient_role = $3,
                        recipient_organization_id = $4,
                        auth_session_id = $5,
                        seller_session_id = $6,
                        endpoint = $7,
                        p256dh = $8,
                        auth_secret = $9,
                        expiration_time = $10,
                        status = 'ACTIVE',
                        invalid_reason = NULL,
                        revoked_at = NULL,
                        last_seen_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                  WHERE id = $1
              RETURNING id, status, expiration_time, created_at, updated_at`,
                [
                    id,
                    binding.userId,
                    binding.role,
                    binding.organizationId,
                    binding.authSessionId,
                    binding.sellerSessionId,
                    normalized.endpoint,
                    normalized.p256dh,
                    normalized.authSecret,
                    normalized.expirationTime
                ]
            )
            : await client.query(
                `INSERT INTO web_push_subscriptions
                    (id, user_id, recipient_role, recipient_organization_id,
                     auth_session_id, seller_session_id, endpoint, endpoint_hash,
                     p256dh, auth_secret, expiration_time)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              RETURNING id, status, expiration_time, created_at, updated_at`,
                [
                    id,
                    binding.userId,
                    binding.role,
                    binding.organizationId,
                    binding.authSessionId,
                    binding.sellerSessionId,
                    normalized.endpoint,
                    normalized.endpointHash,
                    normalized.p256dh,
                    normalized.authSecret,
                    normalized.expirationTime
                ]
            );
        await client.query('COMMIT');
        const row = result.rows[0];
        return Object.freeze({
            id: row.id,
            status: row.status,
            expirationTime: row.expiration_time || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const bindingWhere = (offset = 1) => ({
    sql: `user_id = $${offset}
          AND recipient_role = $${offset + 1}
          AND COALESCE(recipient_organization_id, 0) = COALESCE($${offset + 2}::BIGINT, 0)
          AND COALESCE(auth_session_id, 0) = COALESCE($${offset + 3}::BIGINT, 0)
          AND COALESCE(seller_session_id::TEXT, '') = COALESCE($${offset + 4}::TEXT, '')`,
    params: [
        offset,
        offset + 1,
        offset + 2,
        offset + 3,
        offset + 4
    ]
});

const bindingValues = (binding) => [
    binding.userId,
    binding.role,
    binding.organizationId,
    binding.authSessionId,
    binding.sellerSessionId
];

const revokeWebPushSubscription = async ({ database = pool, binding, endpoint }) => {
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const endpointHash = crypto.createHash('sha256').update(normalizedEndpoint).digest('hex');
    const clause = bindingWhere(2);
    const result = await database.query(
        `UPDATE web_push_subscriptions
            SET status = 'REVOKED',
                revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                invalid_reason = COALESCE(invalid_reason, 'USER_UNSUBSCRIBED'),
                updated_at = CURRENT_TIMESTAMP
          WHERE endpoint_hash = $1
            AND ${clause.sql}
            AND status = 'ACTIVE'
      RETURNING id`,
        [endpointHash, ...bindingValues(binding)]
    );
    return Object.freeze({ revoked: result.rows.length === 1 });
};

const revokeWebPushSubscriptionsForSession = async ({ database = pool, binding, reason = 'SESSION_LOGOUT' }) => {
    const clause = bindingWhere(1);
    const result = await database.query(
        `UPDATE web_push_subscriptions
            SET status = 'REVOKED',
                revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                invalid_reason = COALESCE(invalid_reason, $6),
                updated_at = CURRENT_TIMESTAMP
          WHERE ${clause.sql}
            AND status = 'ACTIVE'
      RETURNING id`,
        [...bindingValues(binding), String(reason).slice(0, 120)]
    );
    return result.rows.length;
};

const getWebPushSubscriptionState = async ({ database = pool, binding }) => {
    const result = await database.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::INT AS account_active_count,
                COUNT(*) FILTER (
                    WHERE status = 'ACTIVE'
                      AND COALESCE(auth_session_id, 0) = COALESCE($4::BIGINT, 0)
                      AND COALESCE(seller_session_id::TEXT, '') = COALESCE($5::TEXT, '')
                )::INT AS current_session_active_count
           FROM web_push_subscriptions
          WHERE user_id = $1
            AND recipient_role = $2
            AND COALESCE(recipient_organization_id, 0) = COALESCE($3::BIGINT, 0)`,
        [
            binding.userId,
            binding.role,
            binding.organizationId,
            binding.authSessionId,
            binding.sellerSessionId
        ]
    );
    return Object.freeze({
        enabled: Number(result.rows[0]?.current_session_active_count || 0) > 0,
        currentSessionActiveCount: Number(result.rows[0]?.current_session_active_count || 0),
        activeDeviceCount: Number(result.rows[0]?.account_active_count || 0)
    });
};

module.exports = Object.freeze({
    MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_ACCOUNT,
    MAX_ACTIVE_WEB_PUSH_SUBSCRIPTIONS_PER_SESSION,
    MAX_WEB_PUSH_SUBSCRIPTION_ROWS_PER_ACCOUNT,
    WEB_PUSH_PROVIDER_HOSTS,
    WebPushSubscriptionError,
    getWebPushSubscriptionState,
    normalizeEndpoint,
    normalizeSubscription,
    isApprovedWebPushProviderHost,
    regularBinding,
    registerWebPushSubscription,
    revokeWebPushSubscription,
    revokeWebPushSubscriptionsForSession,
    sellerBinding
});
