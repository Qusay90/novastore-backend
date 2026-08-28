'use strict';

const crypto = require('node:crypto');
const pool = require('../config/db');

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FCM_TOKEN_PATTERN = /^[\x21-\x7e]+$/u;
const MAX_ACTIVE_ANDROID_ENDPOINTS_PER_SESSION = 5;
const MAX_ACTIVE_ANDROID_ENDPOINTS_PER_ACCOUNT = 20;
const MAX_ANDROID_ENDPOINT_ROWS_PER_ACCOUNT = 100;

class AndroidPushEndpointError extends Error {
    constructor(message, code = 'ANDROID_FCM_ENDPOINT_INVALID', statusCode = 400) {
        super(message);
        this.name = 'AndroidPushEndpointError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const normalizeFcmToken = (value) => {
    const token = String(value || '').trim();
    if (token.length < 16 || token.length > 8192 || !FCM_TOKEN_PATTERN.test(token)) {
        throw new AndroidPushEndpointError('FCM teslim noktası geçersiz.', 'ANDROID_FCM_TOKEN_INVALID');
    }
    return token;
};

const normalizeInstallationId = (value) => {
    const installationId = String(value || '').trim().toLowerCase();
    if (!UUID_V4_PATTERN.test(installationId)) {
        throw new AndroidPushEndpointError('Android kurulum kimliği geçersiz.', 'ANDROID_INSTALLATION_ID_INVALID');
    }
    return installationId;
};

const requireObject = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new AndroidPushEndpointError('Android teslim noktası isteği bir nesne olmalıdır.');
    }
    return input;
};

const rejectUnknownFields = (input, allowed) => {
    if (Object.keys(input).some((key) => !allowed.has(key))) {
        throw new AndroidPushEndpointError(
            'Android teslim noktası isteği desteklenmeyen veya yetki belirleyen alan içeriyor.',
            'ANDROID_FCM_FIELD_REJECTED'
        );
    }
};

const normalizeRegistration = (input = {}) => {
    const source = requireObject(input);
    rejectUnknownFields(source, new Set(['token', 'platform', 'installationId', 'rotationPredecessor']));
    if (String(source.platform || '').trim().toLowerCase() !== 'android') {
        throw new AndroidPushEndpointError('Yalnızca Android teslim noktası kabul edilir.', 'ANDROID_PLATFORM_INVALID');
    }
    const token = normalizeFcmToken(source.token);
    const predecessor = source.rotationPredecessor
        ? normalizeFcmToken(source.rotationPredecessor)
        : null;
    return Object.freeze({
        token,
        tokenHash: hashFcmToken(token),
        installationId: normalizeInstallationId(source.installationId),
        rotationPredecessor: predecessor && predecessor !== token ? predecessor : null,
        rotationPredecessorHash: predecessor && predecessor !== token ? hashFcmToken(predecessor) : null
    });
};

const normalizeRevocation = (input = {}) => {
    const source = requireObject(input);
    rejectUnknownFields(source, new Set(['token', 'installationId']));
    const token = normalizeFcmToken(source.token);
    return Object.freeze({
        tokenHash: hashFcmToken(token),
        installationId: normalizeInstallationId(source.installationId)
    });
};

const normalizeSessionRevocation = (input = {}) => {
    const source = requireObject(input);
    rejectUnknownFields(source, new Set(['installationId']));
    return Object.freeze({
        installationId: source.installationId ? normalizeInstallationId(source.installationId) : null
    });
};

function hashFcmToken(token) {
    return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

const regularAndroidBinding = (request) => {
    const userId = Number(request?.user?.id);
    const role = String(request?.user?.principal || '').trim().toLowerCase();
    const sessionId = Number(request?.auth?.session?.id);
    if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(sessionId) || sessionId < 1) {
        throw new AndroidPushEndpointError('Kimliği doğrulanmış müşteri oturumu gerekli.', 'AUTH_REQUIRED', 401);
    }
    if (role !== 'customer') {
        throw new AndroidPushEndpointError('Android müşteri teslim noktası yalnızca müşteri oturumuna açıktır.', 'ANDROID_CUSTOMER_REQUIRED', 403);
    }
    return Object.freeze({
        userId,
        role: 'customer',
        organizationId: null,
        authSessionId: sessionId,
        sellerSessionId: null,
        application: 'CUSTOMER_ANDROID'
    });
};

const sellerAndroidBinding = (request) => {
    const userId = Number(request?.sellerContext?.userId);
    const organizationId = Number(request?.sellerContext?.organizationId);
    const sessionId = String(request?.sellerSession?.sessionId || '').trim().toLowerCase();
    if (
        !Number.isSafeInteger(userId) || userId < 1
        || !Number.isSafeInteger(organizationId) || organizationId < 1
        || !UUID_PATTERN.test(sessionId)
    ) {
        throw new AndroidPushEndpointError('Geçerli satıcı oturumu gerekli.', 'AUTH_REQUIRED', 401);
    }
    return Object.freeze({
        userId,
        role: 'seller',
        organizationId,
        authSessionId: null,
        sellerSessionId: sessionId,
        application: 'SELLER_ANDROID'
    });
};

const assertBinding = (binding) => {
    const validCustomer = binding?.application === 'CUSTOMER_ANDROID'
        && binding.role === 'customer'
        && binding.organizationId === null
        && Number.isSafeInteger(binding.userId)
        && Number.isSafeInteger(binding.authSessionId)
        && binding.sellerSessionId === null;
    const validSeller = binding?.application === 'SELLER_ANDROID'
        && binding.role === 'seller'
        && Number.isSafeInteger(binding.userId)
        && Number.isSafeInteger(binding.organizationId)
        && UUID_PATTERN.test(String(binding.sellerSessionId || ''))
        && binding.authSessionId === null;
    if (!validCustomer && !validSeller) {
        throw new AndroidPushEndpointError('Android teslim noktası oturum bağı geçersiz.', 'AUTH_REQUIRED', 401);
    }
    return binding;
};

const isSameAccount = (row, binding) => (
    Number(row.user_id) === binding.userId
    && row.recipient_role === binding.role
    && Number(row.recipient_organization_id || 0) === Number(binding.organizationId || 0)
    && row.application === binding.application
);

const isSameBinding = (row, binding) => (
    isSameAccount(row, binding)
    && Number(row.auth_session_id || 0) === Number(binding.authSessionId || 0)
    && String(row.seller_session_id || '') === String(binding.sellerSessionId || '')
);

const lockKeys = (binding, registration) => [...new Set([
    `android-push-account:${binding.application}:${binding.role}:${binding.userId}:${binding.organizationId || 0}`,
    `android-push-installation:${binding.application}:${registration.installationId}`,
    `android-push-token:${registration.tokenHash}`,
    registration.rotationPredecessorHash ? `android-push-token:${registration.rotationPredecessorHash}` : null
].filter(Boolean))].sort();

const acquireRegistrationLocks = async (client, keys) => {
    for (const key of keys) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
    }
};

const enforceEndpointCapacity = async ({ client, binding, consumesHistoricalRow, consumesActiveSlot }) => {
    const result = await client.query(
        `SELECT COUNT(*)::INT AS total_count,
                COUNT(*) FILTER (WHERE status = 'ACTIVE')::INT AS active_account_count,
                COUNT(*) FILTER (
                    WHERE status = 'ACTIVE'
                      AND COALESCE(auth_session_id, 0) = COALESCE($4::BIGINT, 0)
                      AND COALESCE(seller_session_id::TEXT, '') = COALESCE($5::TEXT, '')
                )::INT AS active_session_count
           FROM android_push_endpoints
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
    if (consumesHistoricalRow && Number(counts.total_count || 0) >= MAX_ANDROID_ENDPOINT_ROWS_PER_ACCOUNT) {
        throw new AndroidPushEndpointError('Android cihaz geçmişi sınırına ulaşıldı.', 'ANDROID_ENDPOINT_HISTORY_LIMIT', 429);
    }
    if (consumesActiveSlot && Number(counts.active_account_count || 0) >= MAX_ACTIVE_ANDROID_ENDPOINTS_PER_ACCOUNT) {
        throw new AndroidPushEndpointError('Bu hesap için etkin Android cihazı sınırına ulaşıldı.', 'ANDROID_ENDPOINT_ACCOUNT_LIMIT', 429);
    }
    if (consumesActiveSlot && Number(counts.active_session_count || 0) >= MAX_ACTIVE_ANDROID_ENDPOINTS_PER_SESSION) {
        throw new AndroidPushEndpointError('Bu oturum için etkin Android cihazı sınırına ulaşıldı.', 'ANDROID_ENDPOINT_SESSION_LIMIT', 429);
    }
};

const retirePendingDeliveries = async (client, endpointIds, reason) => {
    const ids = [...new Set(endpointIds.filter(Boolean).map(String))];
    if (ids.length === 0) return 0;
    const result = await client.query(
        `UPDATE notification_deliveries
            SET status = 'INVALID_SUBSCRIPTION',
                next_attempt_at = NULL,
                last_error_code = $2,
                last_error_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE android_push_endpoint_id = ANY($1::UUID[])
            AND status IN ('PENDING', 'RETRYABLE')
      RETURNING id`,
        [ids, String(reason).slice(0, 80)]
    );
    return result.rows.length;
};

const publicEndpoint = (row, { rotated = false, idempotent = false } = {}) => Object.freeze({
    id: row.id,
    application: row.application,
    platform: String(row.platform || 'ANDROID').toLowerCase(),
    installationId: row.installation_id,
    status: row.status,
    rotated,
    idempotent,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

const registerAndroidPushEndpoint = async ({ database = pool, binding, registration }) => {
    const authority = assertBinding(binding);
    const normalized = normalizeRegistration(registration);
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        await acquireRegistrationLocks(client, lockKeys(authority, normalized));
        const rowsResult = await client.query(
            `SELECT id, user_id, recipient_role, recipient_organization_id,
                    auth_session_id, seller_session_id, application, platform,
                    installation_id, token_hash, status, invalid_reason,
                    created_at, updated_at
               FROM android_push_endpoints
              WHERE token_hash = $1
                 OR ($2::TEXT IS NOT NULL AND token_hash = $2)
                 OR (application = $3 AND installation_id = $4::UUID)
              FOR UPDATE`,
            [
                normalized.tokenHash,
                normalized.rotationPredecessorHash,
                authority.application,
                normalized.installationId
            ]
        );
        const rows = rowsResult.rows;
        const newRow = rows.find((row) => row.token_hash.trim() === normalized.tokenHash) || null;
        const predecessorRow = normalized.rotationPredecessorHash
            ? rows.find((row) => row.token_hash.trim() === normalized.rotationPredecessorHash) || null
            : null;
        const activeInstallation = rows.find((row) => (
            row.application === authority.application
            && String(row.installation_id).toLowerCase() === normalized.installationId
            && row.status === 'ACTIVE'
        )) || null;

        if (newRow?.status === 'ACTIVE') {
            if (
                !isSameBinding(newRow, authority)
                || newRow.application !== authority.application
                || String(newRow.installation_id).toLowerCase() !== normalized.installationId
            ) {
                throw new AndroidPushEndpointError(
                    'Bu Android teslim noktası başka bir etkin oturuma bağlı.',
                    'ANDROID_ENDPOINT_OWNERSHIP_CONFLICT',
                    409
                );
            }
            const refreshed = await client.query(
                `UPDATE android_push_endpoints
                    SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                  WHERE id = $1
              RETURNING id, application, platform, installation_id, status, created_at, updated_at`,
                [newRow.id]
            );
            await client.query('COMMIT');
            return publicEndpoint(refreshed.rows[0], { idempotent: true });
        }

        if (activeInstallation && !isSameBinding(activeInstallation, authority)) {
            throw new AndroidPushEndpointError(
                'Bu Android kurulumu başka bir etkin oturuma bağlı.',
                'ANDROID_INSTALLATION_OWNERSHIP_CONFLICT',
                409
            );
        }
        if (activeInstallation && !normalized.rotationPredecessorHash) {
            throw new AndroidPushEndpointError(
                'Etkin Android teslim noktasını değiştirmek için önceki token gereklidir.',
                'ANDROID_ROTATION_PREDECESSOR_REQUIRED',
                409
            );
        }
        if (
            activeInstallation
            && activeInstallation.token_hash.trim() !== normalized.rotationPredecessorHash
        ) {
            throw new AndroidPushEndpointError(
                'Android token döndürme öncülü etkin kurulumla uyuşmuyor.',
                'ANDROID_ROTATION_PREDECESSOR_MISMATCH',
                409
            );
        }
        if (normalized.rotationPredecessorHash && (
            !predecessorRow
            || predecessorRow.status !== 'ACTIVE'
            || !isSameBinding(predecessorRow, authority)
            || predecessorRow.application !== authority.application
            || String(predecessorRow.installation_id).toLowerCase() !== normalized.installationId
        )) {
            throw new AndroidPushEndpointError(
                'Android token döndürme öncülü bu etkin oturuma ait değil.',
                'ANDROID_ROTATION_PREDECESSOR_NOT_ACTIVE',
                409
            );
        }
        if (newRow?.status === 'INVALID') {
            throw new AndroidPushEndpointError('FCM tarafından geçersiz kılınan token yeniden etkinleştirilemez.', 'ANDROID_FCM_TOKEN_INVALIDATED', 409);
        }
        if (newRow?.invalid_reason === 'TOKEN_ROTATED') {
            throw new AndroidPushEndpointError('Döndürülmüş eski FCM token yeniden etkinleştirilemez.', 'ANDROID_FCM_TOKEN_STALE', 409);
        }

        const rotation = Boolean(predecessorRow);
        await enforceEndpointCapacity({
            client,
            binding: authority,
            consumesHistoricalRow: !newRow || !isSameAccount(newRow, authority),
            consumesActiveSlot: !rotation
        });
        if (predecessorRow) {
            await client.query(
                `UPDATE android_push_endpoints
                    SET status = 'REVOKED', invalid_reason = 'TOKEN_ROTATED',
                        revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP
                  WHERE id = $1 AND status = 'ACTIVE'`,
                [predecessorRow.id]
            );
            await retirePendingDeliveries(client, [predecessorRow.id], 'TOKEN_ROTATED');
        }

        const id = newRow?.id || crypto.randomUUID();
        if (newRow) await retirePendingDeliveries(client, [newRow.id], 'ENDPOINT_REBOUND');
        const result = newRow
            ? await client.query(
                `UPDATE android_push_endpoints
                    SET user_id = $2,
                        recipient_role = $3,
                        recipient_organization_id = $4,
                        auth_session_id = $5,
                        seller_session_id = $6,
                        application = $7,
                        platform = 'ANDROID',
                        installation_id = $8,
                        token = $9,
                        token_hash = $10,
                        status = 'ACTIVE',
                        invalid_reason = NULL,
                        revoked_at = NULL,
                        last_seen_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                  WHERE id = $1
              RETURNING id, application, platform, installation_id, status, created_at, updated_at`,
                [
                    id,
                    authority.userId,
                    authority.role,
                    authority.organizationId,
                    authority.authSessionId,
                    authority.sellerSessionId,
                    authority.application,
                    normalized.installationId,
                    normalized.token,
                    normalized.tokenHash
                ]
            )
            : await client.query(
                `INSERT INTO android_push_endpoints
                    (id, user_id, recipient_role, recipient_organization_id,
                     auth_session_id, seller_session_id, application, platform,
                     installation_id, token, token_hash)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'ANDROID', $8, $9, $10)
              RETURNING id, application, platform, installation_id, status, created_at, updated_at`,
                [
                    id,
                    authority.userId,
                    authority.role,
                    authority.organizationId,
                    authority.authSessionId,
                    authority.sellerSessionId,
                    authority.application,
                    normalized.installationId,
                    normalized.token,
                    normalized.tokenHash
                ]
            );
        await client.query('COMMIT');
        return publicEndpoint(result.rows[0], { rotated: rotation });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const bindingClause = (offset = 1) => `user_id = $${offset}
    AND recipient_role = $${offset + 1}
    AND COALESCE(recipient_organization_id, 0) = COALESCE($${offset + 2}::BIGINT, 0)
    AND COALESCE(auth_session_id, 0) = COALESCE($${offset + 3}::BIGINT, 0)
    AND COALESCE(seller_session_id::TEXT, '') = COALESCE($${offset + 4}::TEXT, '')
    AND application = $${offset + 5}`;

const bindingValues = (binding) => [
    binding.userId,
    binding.role,
    binding.organizationId,
    binding.authSessionId,
    binding.sellerSessionId,
    binding.application
];

const revokeAndroidPushEndpoint = async ({ database = pool, binding, revocation }) => {
    const authority = assertBinding(binding);
    const normalized = normalizeRevocation(revocation);
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE android_push_endpoints
                SET status = 'REVOKED',
                    revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                    invalid_reason = COALESCE(invalid_reason, 'USER_UNREGISTERED'),
                    updated_at = CURRENT_TIMESTAMP
              WHERE token_hash = $1
                AND installation_id = $2::UUID
                AND ${bindingClause(3)}
                AND status = 'ACTIVE'
          RETURNING id`,
            [normalized.tokenHash, normalized.installationId, ...bindingValues(authority)]
        );
        await retirePendingDeliveries(client, result.rows.map((row) => row.id), 'USER_UNREGISTERED');
        await client.query('COMMIT');
        return Object.freeze({ revoked: result.rows.length === 1 });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const revokeAndroidPushEndpointsForSession = async ({
    database = pool,
    binding,
    request = {},
    reason = 'SESSION_LOGOUT'
}) => {
    const authority = assertBinding(binding);
    normalizeSessionRevocation(request);
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE android_push_endpoints
                SET status = 'REVOKED',
                    revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                    invalid_reason = COALESCE(invalid_reason, $7),
                    updated_at = CURRENT_TIMESTAMP
              WHERE ${bindingClause(1)}
                AND status = 'ACTIVE'
          RETURNING id`,
            [...bindingValues(authority), String(reason).slice(0, 120)]
        );
        await retirePendingDeliveries(client, result.rows.map((row) => row.id), String(reason).slice(0, 80));
        await client.query('COMMIT');
        return result.rows.length;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const getAndroidPushEndpointState = async ({ database = pool, binding }) => {
    const authority = assertBinding(binding);
    const result = await database.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::INT AS account_active_count,
                COUNT(*) FILTER (
                    WHERE status = 'ACTIVE'
                      AND COALESCE(auth_session_id, 0) = COALESCE($4::BIGINT, 0)
                      AND COALESCE(seller_session_id::TEXT, '') = COALESCE($5::TEXT, '')
                )::INT AS current_session_active_count
           FROM android_push_endpoints
          WHERE user_id = $1
            AND recipient_role = $2
            AND COALESCE(recipient_organization_id, 0) = COALESCE($3::BIGINT, 0)
            AND application = $6`,
        [
            authority.userId,
            authority.role,
            authority.organizationId,
            authority.authSessionId,
            authority.sellerSessionId,
            authority.application
        ]
    );
    return Object.freeze({
        enabled: Number(result.rows[0]?.current_session_active_count || 0) > 0,
        currentSessionActiveCount: Number(result.rows[0]?.current_session_active_count || 0),
        activeDeviceCount: Number(result.rows[0]?.account_active_count || 0)
    });
};

module.exports = Object.freeze({
    AndroidPushEndpointError,
    MAX_ACTIVE_ANDROID_ENDPOINTS_PER_ACCOUNT,
    MAX_ACTIVE_ANDROID_ENDPOINTS_PER_SESSION,
    MAX_ANDROID_ENDPOINT_ROWS_PER_ACCOUNT,
    getAndroidPushEndpointState,
    hashFcmToken,
    normalizeFcmToken,
    normalizeInstallationId,
    normalizeRegistration,
    normalizeRevocation,
    normalizeSessionRevocation,
    regularAndroidBinding,
    registerAndroidPushEndpoint,
    revokeAndroidPushEndpoint,
    revokeAndroidPushEndpointsForSession,
    sellerAndroidBinding
});
