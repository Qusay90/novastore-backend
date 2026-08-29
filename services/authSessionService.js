const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const ACCESS_TOKEN_ALGORITHMS = Object.freeze(['HS256']);
const ACCESS_TOKEN_ISSUER = 'novastore-api';
const ACCESS_TOKEN_AUDIENCES = Object.freeze({
    customer: 'novastore-customer',
    admin: 'novastore-admin'
});
const ACCESS_TOKEN_TTLS = Object.freeze({
    customer: 30 * 24 * 60 * 60,
    admin: 24 * 60 * 60
});
const CUSTOMER_REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const CUSTOMER_REFRESH_CREDENTIAL_BYTES = 48;
const CUSTOMER_REFRESH_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43,512}$/u;
const CUSTOMER_REFRESH_HASH_DOMAIN = 'customer-refresh-v1\u0000';
const PRINCIPALS = new Set(Object.keys(ACCESS_TOKEN_AUDIENCES));
const GENERIC_AUTH_MESSAGE = 'Invalid or expired token.';
const SESSION_STATE_UNAVAILABLE_MESSAGE = 'Authentication service temporarily unavailable.';

class AuthSessionError extends Error {
    constructor(code, statusCode, publicMessage, options = {}) {
        super(code, options);
        this.name = 'AuthSessionError';
        this.code = code;
        this.statusCode = statusCode;
        this.publicMessage = publicMessage;
    }
}

const invalidToken = (code = 'AUTH_INVALID') => (
    new AuthSessionError(code, 401, GENERIC_AUTH_MESSAGE)
);

const sessionStateUnavailable = (cause) => (
    new AuthSessionError(
        'AUTH_SESSION_STATE_UNAVAILABLE',
        503,
        SESSION_STATE_UNAVAILABLE_MESSAGE,
        cause ? { cause } : undefined
    )
);

const requireJwtSecret = () => {
    const secret = String(process.env.JWT_SECRET || '');
    if (!secret) {
        throw new AuthSessionError('AUTH_JWT_CONFIG_MISSING', 500, 'Server security configuration missing.');
    }
    return secret;
};

const normalizePrincipal = (value) => {
    const principal = String(value || '').trim().toLowerCase();
    return PRINCIPALS.has(principal) ? principal : null;
};

const expectedRoleForPrincipal = (principal) => (
    principal === 'admin' ? 'admin' : 'customer'
);

const hashJti = (jti) => crypto.createHash('sha256').update(String(jti || '')).digest('hex');

const createJti = () => crypto.randomBytes(32).toString('base64url');

const invalidRefreshCredential = (code = 'AUTH_REFRESH_REJECTED') => (
    new AuthSessionError(code, 401, GENERIC_AUTH_MESSAGE)
);

const normalizeCustomerRefreshCredential = (value) => {
    const credential = typeof value === 'string' ? value.trim() : '';
    if (!CUSTOMER_REFRESH_CREDENTIAL_PATTERN.test(credential)) {
        throw invalidRefreshCredential('AUTH_REFRESH_MALFORMED');
    }
    return credential;
};

const hashCustomerRefreshCredential = (credential) => crypto
    .createHash('sha256')
    .update(CUSTOMER_REFRESH_HASH_DOMAIN, 'utf8')
    .update(normalizeCustomerRefreshCredential(credential), 'utf8')
    .digest('hex');

const createCustomerRefreshCredential = () => crypto
    .randomBytes(CUSTOMER_REFRESH_CREDENTIAL_BYTES)
    .toString('base64url');

const decodePrincipalHint = (token) => {
    const decoded = jwt.decode(token);
    return normalizePrincipal(decoded && decoded.principal);
};

const normalizeVerifiedClaims = (decoded, expectedPrincipal) => {
    const principal = normalizePrincipal(decoded && decoded.principal);
    const userId = Number(decoded && decoded.sub);
    const compatibilityId = Number(decoded && decoded.id);
    const role = String(decoded && decoded.role || '');
    const jti = String(decoded && decoded.jti || '');

    if (
        !decoded
        || !principal
        || principal !== expectedPrincipal
        || !Number.isInteger(userId)
        || userId <= 0
        || compatibilityId !== userId
        || role !== expectedRoleForPrincipal(principal)
        || jti.length < 32
        || !Number.isInteger(decoded.iat)
        || !Number.isInteger(decoded.exp)
        || decoded.exp <= decoded.iat
    ) {
        throw invalidToken('AUTH_CLAIMS_INVALID');
    }

    return Object.freeze({
        userId,
        id: userId,
        role,
        principal,
        jti,
        jtiHash: hashJti(jti),
        issuedAt: new Date(decoded.iat * 1000),
        expiresAt: new Date(decoded.exp * 1000)
    });
};

const verifyTokenClaims = (token, { expectedPrincipal } = {}) => {
    const principal = normalizePrincipal(expectedPrincipal) || decodePrincipalHint(token);
    if (!principal) throw invalidToken('AUTH_PRINCIPAL_INVALID');

    try {
        const decoded = jwt.verify(token, requireJwtSecret(), {
            algorithms: ACCESS_TOKEN_ALGORITHMS,
            issuer: ACCESS_TOKEN_ISSUER,
            audience: ACCESS_TOKEN_AUDIENCES[principal]
        });
        return normalizeVerifiedClaims(decoded, principal);
    } catch (error) {
        if (error instanceof AuthSessionError) throw error;
        throw invalidToken('AUTH_TOKEN_INVALID');
    }
};

const mapSessionRow = (row) => ({
    sessionId: Number(row.session_id),
    jtiHash: String(row.jti_hash || '').trim(),
    userId: Number(row.user_id),
    principal: normalizePrincipal(row.principal_type),
    issuedAt: new Date(row.issued_at),
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    role: String(row.user_role || ''),
    authEnabled: row.auth_enabled === true
});

const querySessionByHash = async (queryable, jtiHash) => {
    try {
        const result = await queryable.query(
            `SELECT s.id AS session_id,
                    s.jti_hash,
                    s.user_id,
                    s.principal_type,
                    s.issued_at,
                    s.expires_at,
                    s.revoked_at,
                    u.role AS user_role,
                    u.auth_enabled
             FROM auth_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.jti_hash = $1`,
            [jtiHash]
        );
        return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
    } catch (error) {
        throw sessionStateUnavailable(error);
    }
};

const querySessionById = async (queryable, sessionId) => {
    try {
        const result = await queryable.query(
            `SELECT s.id AS session_id,
                    s.jti_hash,
                    s.user_id,
                    s.principal_type,
                    s.issued_at,
                    s.expires_at,
                    s.revoked_at,
                    u.role AS user_role,
                    u.auth_enabled
             FROM auth_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.id = $1`,
            [sessionId]
        );
        return result.rows[0] ? mapSessionRow(result.rows[0]) : null;
    } catch (error) {
        throw sessionStateUnavailable(error);
    }
};

const assertActiveSession = (session, claims, { allowRevoked = false } = {}) => {
    const now = Date.now();
    if (
        !session
        || !Number.isInteger(session.sessionId)
        || session.userId !== claims.userId
        || session.principal !== claims.principal
        || session.jtiHash !== claims.jtiHash
        || session.role !== claims.role
        || session.authEnabled !== true
        || !Number.isFinite(session.expiresAt.getTime())
        || session.expiresAt.getTime() <= now
        || (!allowRevoked && session.revokedAt)
    ) {
        throw invalidToken('AUTH_SESSION_INVALID');
    }
    return session;
};

const toAuthContext = (session, claims) => Object.freeze({
    user: Object.freeze({
        id: session.userId,
        role: session.role,
        principal: session.principal
    }),
    session: Object.freeze({
        id: session.sessionId,
        principal: session.principal,
        userId: session.userId,
        expiresAt: session.expiresAt,
        revoked: Boolean(session.revokedAt)
    }),
    claims: Object.freeze({
        issuedAt: claims.issuedAt,
        expiresAt: claims.expiresAt
    })
});

const verifyAccessToken = async (token, {
    expectedPrincipal,
    allowRevoked = false,
    queryable = pool
} = {}) => {
    const claims = verifyTokenClaims(token, { expectedPrincipal });
    const session = await querySessionByHash(queryable, claims.jtiHash);
    assertActiveSession(session, claims, { allowRevoked });
    return toAuthContext(session, claims);
};

const revalidateSession = async ({
    sessionId,
    userId,
    principal,
    queryable = pool
}) => {
    const normalizedPrincipal = normalizePrincipal(principal);
    const expectedUserId = Number(userId);
    const session = await querySessionById(queryable, Number(sessionId));
    const now = Date.now();
    if (
        !session
        || !normalizedPrincipal
        || session.userId !== expectedUserId
        || session.principal !== normalizedPrincipal
        || session.role !== expectedRoleForPrincipal(normalizedPrincipal)
        || session.authEnabled !== true
        || session.revokedAt
        || session.expiresAt.getTime() <= now
    ) {
        throw invalidToken('AUTH_SESSION_INVALID');
    }
    return Object.freeze({
        id: session.userId,
        role: session.role,
        principal: session.principal,
        sessionId: session.sessionId
    });
};

const createAccessCredential = ({
    userId,
    role,
    principal,
    ttlSeconds,
    expiresAtCap = null
}) => {
    const normalizedPrincipal = normalizePrincipal(principal);
    const normalizedUserId = Number(userId);
    const normalizedRole = String(role || '');
    if (
        !normalizedPrincipal
        || !Number.isInteger(normalizedUserId)
        || normalizedUserId <= 0
        || normalizedRole !== expectedRoleForPrincipal(normalizedPrincipal)
    ) {
        throw invalidToken('AUTH_LOGIN_PRINCIPAL_INVALID');
    }

    const lifetime = Number.isInteger(ttlSeconds) && ttlSeconds > 0
        ? ttlSeconds
        : ACCESS_TOKEN_TTLS[normalizedPrincipal];
    const cappedLifetime = expiresAtCap
        ? Math.min(lifetime, Math.floor((new Date(expiresAtCap).getTime() - Date.now()) / 1000))
        : lifetime;
    if (!Number.isInteger(cappedLifetime) || cappedLifetime < 1) {
        throw invalidRefreshCredential('AUTH_REFRESH_EXPIRED');
    }
    const jti = createJti();
    const issuedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const expiresAt = new Date(issuedAt.getTime() + cappedLifetime * 1000);
    const token = jwt.sign(
        {
            id: normalizedUserId,
            role: normalizedRole,
            principal: normalizedPrincipal
        },
        requireJwtSecret(),
        {
            algorithm: ACCESS_TOKEN_ALGORITHMS[0],
            audience: ACCESS_TOKEN_AUDIENCES[normalizedPrincipal],
            expiresIn: cappedLifetime,
            issuer: ACCESS_TOKEN_ISSUER,
            jwtid: jti,
            subject: String(normalizedUserId)
        }
    );

    return Object.freeze({
        expiresAt,
        issuedAt,
        jtiHash: hashJti(jti),
        principal: normalizedPrincipal,
        role: normalizedRole,
        token,
        userId: normalizedUserId
    });
};

const issueAccessSession = async ({
    userId,
    role,
    principal,
    queryable,
    ttlSeconds
}) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('A transactional PostgreSQL queryable is required.');
    }
    const credential = createAccessCredential({ userId, role, principal, ttlSeconds });
    const result = await queryable.query(
        `INSERT INTO auth_sessions (
            jti_hash, user_id, principal_type, issued_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
            credential.jtiHash,
            credential.userId,
            credential.principal,
            credential.issuedAt,
            credential.expiresAt
        ]
    );

    return Object.freeze({
        token: credential.token,
        sessionId: Number(result.rows[0].id),
        expiresAt: credential.expiresAt
    });
};

const issueCustomerSession = async ({
    userId,
    role = 'customer',
    queryable,
    accessTtlSeconds,
    refreshTtlSeconds = CUSTOMER_REFRESH_TOKEN_TTL_SECONDS
}) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('A transactional PostgreSQL queryable is required.');
    }
    if (!Number.isInteger(refreshTtlSeconds) || refreshTtlSeconds < 1) {
        throw new TypeError('Customer refresh lifetime must be a positive integer.');
    }

    const refreshToken = createCustomerRefreshCredential();
    const refreshIssuedAt = new Date();
    const refreshExpiresAt = new Date(refreshIssuedAt.getTime() + refreshTtlSeconds * 1000);
    const session = await issueAccessSession({
        userId,
        role,
        principal: 'customer',
        queryable,
        ttlSeconds: accessTtlSeconds
    });
    const refreshId = crypto.randomUUID();
    await queryable.query(
        `INSERT INTO auth_refresh_tokens (
            id, auth_session_id, generation, token_hash, status, issued_at, expires_at
         ) VALUES ($1, $2, 1, $3, 'active', $4, $5)`,
        [
            refreshId,
            session.sessionId,
            hashCustomerRefreshCredential(refreshToken),
            refreshIssuedAt,
            refreshExpiresAt
        ]
    );

    return Object.freeze({
        ...session,
        refreshExpiresAt,
        refreshToken
    });
};

const normalizeExpectedSessionId = (value) => {
    const sessionId = typeof value === 'string' && /^\d+$/u.test(value)
        ? Number(value)
        : value;
    if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
        throw invalidRefreshCredential('AUTH_REFRESH_SESSION_INVALID');
    }
    return sessionId;
};

const markCustomerRefreshReplay = async (client, row) => {
    await client.query(
        `UPDATE auth_refresh_tokens
         SET status = 'replayed',
             replayed_at = COALESCE(replayed_at, CURRENT_TIMESTAMP)
         WHERE id = $1
           AND status IN ('rotated', 'replayed')`,
        [row.token_id]
    );
    await client.query(
        `UPDATE auth_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
             revoke_reason = COALESCE(revoke_reason, 'refresh_replay_detected')
         WHERE id = $1`,
        [row.session_id]
    );
    await client.query(
        `UPDATE auth_refresh_tokens
         SET status = 'revoked',
             revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE auth_session_id = $1
           AND status = 'active'`,
        [row.session_id]
    );
};

const revokeCustomerRefreshSession = async (client, row, reason) => {
    await client.query(
        `UPDATE auth_sessions
         SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
             revoke_reason = COALESCE(revoke_reason, $2)
         WHERE id = $1`,
        [row.session_id, String(reason || 'refresh_session_invalid').slice(0, 80)]
    );
    await client.query(
        `UPDATE auth_refresh_tokens
         SET status = 'revoked',
             revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
         WHERE auth_session_id = $1
           AND status = 'active'`,
        [row.session_id]
    );
};

const refreshRowIsStructurallyValid = (row) => (
    row
    && Number.isSafeInteger(Number(row.session_id))
    && Number(row.session_id) > 0
    && Number.isSafeInteger(Number(row.user_id))
    && Number(row.user_id) > 0
    && Number.isSafeInteger(Number(row.generation))
    && Number(row.generation) > 0
    && /^[0-9a-f]{64}$/u.test(String(row.session_jti_hash || '').trim())
    && Number.isFinite(new Date(row.session_issued_at).getTime())
    && Number.isFinite(new Date(row.session_expires_at).getTime())
    && Number.isFinite(new Date(row.token_expires_at).getTime())
);

const rotateCustomerRefreshSession = async ({
    refreshToken,
    expectedSessionId,
    database = pool
}) => {
    const presentedHash = hashCustomerRefreshCredential(refreshToken);
    const sessionId = normalizeExpectedSessionId(expectedSessionId);
    let client = database;
    let ownsClient = false;
    let transactionOpen = false;

    try {
        if (database && typeof database.connect === 'function') {
            client = await database.connect();
            ownsClient = true;
        }
        if (!client || typeof client.query !== 'function') {
            throw new TypeError('Customer refresh database queryable is required.');
        }

        await client.query('BEGIN');
        transactionOpen = true;
        const result = await client.query(
            `SELECT token.id AS token_id,
                    token.auth_session_id AS session_id,
                    token.generation,
                    token.status AS token_status,
                    token.expires_at AS token_expires_at,
                    session.jti_hash AS session_jti_hash,
                    session.user_id,
                    session.principal_type,
                    session.issued_at AS session_issued_at,
                    session.expires_at AS session_expires_at,
                    session.revoked_at AS session_revoked_at,
                    user_row.role AS user_role,
                    user_row.auth_enabled
             FROM auth_refresh_tokens token
             JOIN auth_sessions session ON session.id = token.auth_session_id
             JOIN users user_row ON user_row.id = session.user_id
             WHERE token.token_hash = $1
             FOR UPDATE OF token, session SKIP LOCKED`,
            [presentedHash]
        );
        const row = result.rows[0];
        if (!row || Number(row.session_id) !== sessionId) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            throw invalidRefreshCredential();
        }

        if (row.principal_type !== 'customer' || row.user_role !== 'customer' || row.auth_enabled !== true) {
            await revokeCustomerRefreshSession(client, row, 'refresh_customer_account_inactive');
            await client.query('COMMIT');
            transactionOpen = false;
            throw new AuthSessionError(
                'AUTH_CUSTOMER_ACCOUNT_INACTIVE',
                403,
                'Customer account is not active.'
            );
        }

        if (!refreshRowIsStructurallyValid(row)) {
            await revokeCustomerRefreshSession(client, row, 'refresh_session_corrupted');
            await client.query('COMMIT');
            transactionOpen = false;
            throw invalidRefreshCredential('AUTH_REFRESH_SESSION_INVALID');
        }

        if (row.session_revoked_at || ['revoked', 'expired'].includes(row.token_status)) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            throw invalidRefreshCredential();
        }

        if (['rotated', 'replayed'].includes(row.token_status)) {
            await markCustomerRefreshReplay(client, row);
            await client.query('COMMIT');
            transactionOpen = false;
            throw invalidRefreshCredential('AUTH_REFRESH_REPLAY_DETECTED');
        }

        if (row.token_status !== 'active') {
            await revokeCustomerRefreshSession(client, row, 'refresh_token_state_invalid');
            await client.query('COMMIT');
            transactionOpen = false;
            throw invalidRefreshCredential('AUTH_REFRESH_SESSION_INVALID');
        }

        const refreshExpiresAt = new Date(row.token_expires_at);
        if (refreshExpiresAt.getTime() <= Date.now()) {
            await client.query(
                `UPDATE auth_refresh_tokens
                 SET status = 'expired',
                     expired_at = COALESCE(expired_at, CURRENT_TIMESTAMP)
                 WHERE id = $1
                   AND status = 'active'`,
                [row.token_id]
            );
            await revokeCustomerRefreshSession(client, row, 'refresh_expired');
            await client.query('COMMIT');
            transactionOpen = false;
            throw invalidRefreshCredential('AUTH_REFRESH_EXPIRED');
        }

        const replacementRefreshToken = createCustomerRefreshCredential();
        const access = createAccessCredential({
            userId: Number(row.user_id),
            role: 'customer',
            principal: 'customer',
            expiresAtCap: refreshExpiresAt
        });
        const rotated = await client.query(
            `UPDATE auth_refresh_tokens
             SET status = 'rotated',
                 rotated_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND status = 'active'
             RETURNING id`,
            [row.token_id]
        );
        if (rotated.rows.length !== 1) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            throw invalidRefreshCredential();
        }

        const replacementId = crypto.randomUUID();
        const nextGeneration = Number(row.generation) + 1;
        await client.query(
            `INSERT INTO auth_refresh_tokens (
                id, auth_session_id, generation, token_hash, status, issued_at, expires_at
             ) VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, $5)`,
            [
                replacementId,
                sessionId,
                nextGeneration,
                hashCustomerRefreshCredential(replacementRefreshToken),
                refreshExpiresAt
            ]
        );
        await client.query(
            `UPDATE auth_refresh_tokens
             SET replaced_by_token_id = $1
             WHERE id = $2`,
            [replacementId, row.token_id]
        );
        const updatedSession = await client.query(
            `UPDATE auth_sessions
             SET jti_hash = $1,
                 issued_at = $2,
                 expires_at = $3
             WHERE id = $4
               AND user_id = $5
               AND principal_type = 'customer'
               AND revoked_at IS NULL
             RETURNING id`,
            [access.jtiHash, access.issuedAt, access.expiresAt, sessionId, access.userId]
        );
        if (updatedSession.rows.length !== 1) {
            throw invalidRefreshCredential('AUTH_REFRESH_SESSION_INVALID');
        }

        await client.query('COMMIT');
        transactionOpen = false;
        return Object.freeze({
            accessExpiresAt: access.expiresAt,
            accessToken: access.token,
            generation: nextGeneration,
            refreshExpiresAt,
            refreshToken: replacementRefreshToken,
            sessionId,
            userId: access.userId
        });
    } catch (error) {
        if (transactionOpen) {
            try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
        }
        if (error instanceof AuthSessionError) throw error;
        throw sessionStateUnavailable(error);
    } finally {
        if (ownsClient) client.release();
    }
};

const revokeCurrentSession = async ({ sessionId, userId, principal, queryable = pool }) => {
    try {
        const result = await queryable.query(
            `UPDATE auth_sessions
             SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                 revoke_reason = COALESCE(revoke_reason, 'logout')
             WHERE id = $1 AND user_id = $2 AND principal_type = $3
             RETURNING id`,
            [Number(sessionId), Number(userId), normalizePrincipal(principal)]
        );
        if (result.rows.length === 0) throw invalidToken('AUTH_SESSION_INVALID');
        return result.rows.map((row) => Number(row.id));
    } catch (error) {
        if (error instanceof AuthSessionError) throw error;
        throw sessionStateUnavailable(error);
    }
};

const revokeAllSessions = async ({ userId, principal, queryable = pool }) => {
    const normalizedUserId = Number(userId);
    const normalizedPrincipal = normalizePrincipal(principal);
    let client = queryable;
    let ownsClient = false;
    try {
        if (typeof queryable.connect === 'function') {
            client = await queryable.connect();
            ownsClient = true;
        }
        await client.query('BEGIN');
        const userResult = await client.query(
            'SELECT id FROM users WHERE id = $1 FOR UPDATE',
            [normalizedUserId]
        );
        if (userResult.rows.length === 0) throw invalidToken('AUTH_SESSION_INVALID');
        const result = await client.query(
            `UPDATE auth_sessions
             SET revoked_at = CURRENT_TIMESTAMP,
                 revoke_reason = COALESCE(revoke_reason, 'logout_all')
             WHERE user_id = $1
               AND principal_type = $2
               AND revoked_at IS NULL
               AND (
                    expires_at > CURRENT_TIMESTAMP
                    OR EXISTS (
                        SELECT 1
                        FROM auth_refresh_tokens refresh_token
                        WHERE refresh_token.auth_session_id = auth_sessions.id
                          AND refresh_token.status = 'active'
                          AND refresh_token.expires_at > CURRENT_TIMESTAMP
                    )
               )
             RETURNING id`,
            [normalizedUserId, normalizedPrincipal]
        );
        await client.query('COMMIT');
        return result.rows.map((row) => Number(row.id));
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
        if (error instanceof AuthSessionError) throw error;
        throw sessionStateUnavailable(error);
    } finally {
        if (ownsClient) client.release();
    }
};

const cleanupExpiredSessions = async ({ queryable = pool, limit = 500 } = {}) => {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 500, 5000));
    try {
        const result = await queryable.query(
            `DELETE FROM auth_sessions session
             WHERE session.id IN (
                 SELECT candidate.id
                 FROM auth_sessions candidate
                 WHERE candidate.expires_at <= CURRENT_TIMESTAMP
                   AND NOT EXISTS (
                       SELECT 1
                       FROM auth_refresh_tokens refresh_token
                       WHERE refresh_token.auth_session_id = candidate.id
                         AND refresh_token.status = 'active'
                         AND refresh_token.expires_at > CURRENT_TIMESTAMP
                   )
                 ORDER BY candidate.expires_at, candidate.id
                 LIMIT $1
             )
             RETURNING id`,
            [boundedLimit]
        );
        return result.rows.length;
    } catch (error) {
        throw sessionStateUnavailable(error);
    }
};

module.exports = {
    ACCESS_TOKEN_ALGORITHMS,
    ACCESS_TOKEN_AUDIENCES,
    ACCESS_TOKEN_ISSUER,
    ACCESS_TOKEN_TTLS,
    AuthSessionError,
    CUSTOMER_REFRESH_CREDENTIAL_PATTERN,
    CUSTOMER_REFRESH_TOKEN_TTL_SECONDS,
    GENERIC_AUTH_MESSAGE,
    SESSION_STATE_UNAVAILABLE_MESSAGE,
    cleanupExpiredSessions,
    createCustomerRefreshCredential,
    hashCustomerRefreshCredential,
    hashJti,
    issueAccessSession,
    issueCustomerSession,
    normalizePrincipal,
    normalizeCustomerRefreshCredential,
    revalidateSession,
    revokeAllSessions,
    revokeCurrentSession,
    rotateCustomerRefreshSession,
    verifyAccessToken,
    verifyTokenClaims
};
