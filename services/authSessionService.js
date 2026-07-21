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
    const jti = createJti();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + lifetime * 1000);
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
            expiresIn: lifetime,
            issuer: ACCESS_TOKEN_ISSUER,
            jwtid: jti,
            subject: String(normalizedUserId)
        }
    );
    const result = await queryable.query(
        `INSERT INTO auth_sessions (
            jti_hash, user_id, principal_type, issued_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [hashJti(jti), normalizedUserId, normalizedPrincipal, issuedAt, expiresAt]
    );

    return Object.freeze({
        token,
        sessionId: Number(result.rows[0].id),
        expiresAt
    });
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
               AND expires_at > CURRENT_TIMESTAMP
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
            `DELETE FROM auth_sessions
             WHERE id IN (
                 SELECT id
                 FROM auth_sessions
                 WHERE expires_at <= CURRENT_TIMESTAMP
                 ORDER BY expires_at, id
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
    GENERIC_AUTH_MESSAGE,
    SESSION_STATE_UNAVAILABLE_MESSAGE,
    cleanupExpiredSessions,
    hashJti,
    issueAccessSession,
    normalizePrincipal,
    revalidateSession,
    revokeAllSessions,
    revokeCurrentSession,
    verifyAccessToken,
    verifyTokenClaims
};
