const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const authSessionService = require('../../services/authSessionService');

const invalid = (code = 'AUTH_SESSION_INVALID') => new authSessionService.AuthSessionError(
    code,
    401,
    authSessionService.GENERIC_AUTH_MESSAGE
);

const createAuthSessionFixture = ({ secret = process.env.JWT_SECRET } = {}) => {
    const sessionsByHash = new Map();
    const users = new Map();
    let nextSessionId = 1;
    let installed = false;
    const originals = {
        revalidateSession: authSessionService.revalidateSession,
        verifyAccessToken: authSessionService.verifyAccessToken
    };

    const setUser = ({ id, role, authEnabled = true }) => {
        users.set(Number(id), { id: Number(id), role, authEnabled });
    };

    const issue = ({
        userId,
        role = 'customer',
        principal = role === 'admin' ? 'admin' : 'customer',
        expiresIn = '1h',
        issuer = authSessionService.ACCESS_TOKEN_ISSUER,
        audience = authSessionService.ACCESS_TOKEN_AUDIENCES[principal],
        algorithm = 'HS256',
        payload = {},
        revoked = false,
        persist = true
    }) => {
        const normalizedUserId = Number(userId);
        const jti = crypto.randomBytes(32).toString('base64url');
        const token = jwt.sign(
            {
                id: normalizedUserId,
                role,
                principal,
                ...payload
            },
            secret,
            {
                algorithm,
                audience,
                expiresIn,
                issuer,
                jwtid: jti,
                subject: String(normalizedUserId)
            }
        );
        const decoded = jwt.decode(token);
        const session = {
            id: nextSessionId++,
            jtiHash: authSessionService.hashJti(jti),
            userId: normalizedUserId,
            principal,
            role,
            issuedAt: new Date(decoded.iat * 1000),
            expiresAt: new Date(decoded.exp * 1000),
            revokedAt: revoked ? new Date() : null
        };
        if (!users.has(normalizedUserId)) setUser({ id: normalizedUserId, role });
        if (persist) sessionsByHash.set(session.jtiHash, session);
        return Object.freeze({ token, ...session });
    };

    const signRaw = (payload, options = {}) => jwt.sign(payload, secret, {
        algorithm: options.algorithm || 'HS256',
        ...(options.audience ? { audience: options.audience } : {}),
        ...(options.expiresIn ? { expiresIn: options.expiresIn } : {}),
        ...(options.issuer ? { issuer: options.issuer } : {})
    });

    const verifyFixtureToken = async (token, { expectedPrincipal, allowRevoked = false } = {}) => {
        const claims = authSessionService.verifyTokenClaims(token, { expectedPrincipal });
        const session = sessionsByHash.get(claims.jtiHash);
        const user = users.get(claims.userId);
        if (
            !session
            || !user
            || session.userId !== claims.userId
            || session.principal !== claims.principal
            || user.role !== claims.role
            || user.authEnabled !== true
            || session.expiresAt.getTime() <= Date.now()
            || (!allowRevoked && session.revokedAt)
        ) throw invalid();

        return Object.freeze({
            user: Object.freeze({ id: user.id, role: user.role, principal: session.principal }),
            session: Object.freeze({
                id: session.id,
                userId: user.id,
                principal: session.principal,
                expiresAt: session.expiresAt,
                revoked: Boolean(session.revokedAt)
            }),
            claims: Object.freeze({ issuedAt: claims.issuedAt, expiresAt: claims.expiresAt })
        });
    };

    const revalidateFixtureSession = async ({ sessionId, userId, principal }) => {
        const session = [...sessionsByHash.values()].find((entry) => entry.id === Number(sessionId));
        const user = users.get(Number(userId));
        if (
            !session
            || !user
            || session.userId !== Number(userId)
            || session.principal !== principal
            || session.revokedAt
            || session.expiresAt.getTime() <= Date.now()
            || user.authEnabled !== true
            || user.role !== session.role
        ) throw invalid();
        return Object.freeze({ id: user.id, role: user.role, principal, sessionId: session.id });
    };

    const install = () => {
        if (installed) return;
        installed = true;
        authSessionService.verifyAccessToken = verifyFixtureToken;
        authSessionService.revalidateSession = revalidateFixtureSession;
    };

    const restore = () => {
        if (!installed) return;
        authSessionService.verifyAccessToken = originals.verifyAccessToken;
        authSessionService.revalidateSession = originals.revalidateSession;
        installed = false;
    };

    const revoke = (tokenOrSession) => {
        const hash = typeof tokenOrSession === 'string'
            ? authSessionService.hashJti(jwt.decode(tokenOrSession)?.jti)
            : tokenOrSession.jtiHash;
        const session = sessionsByHash.get(hash);
        if (session) session.revokedAt = session.revokedAt || new Date();
    };

    const persistSession = async (queryable, session) => {
        await queryable.query(
            `INSERT INTO auth_sessions (
                id, jti_hash, user_id, principal_type, issued_at, expires_at, revoked_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (jti_hash) DO NOTHING`,
            [
                session.id,
                session.jtiHash,
                session.userId,
                session.principal,
                session.issuedAt,
                session.expiresAt,
                session.revokedAt
            ]
        );
    };

    return Object.freeze({
        install,
        issue,
        persistSession,
        restore,
        revoke,
        sessionsByHash,
        setUser,
        signRaw,
        users,
        verifyFixtureToken
    });
};

module.exports = { createAuthSessionFixture };
