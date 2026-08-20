'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const {
    SellerSessionError,
    issueSellerSession,
    rotateRefreshCredential,
    revokeSellerSession,
    revokeAllSellerSessions,
    listSellerSessions
} = require('./sellerSessionService');

class SellerLoginError extends Error {
    constructor(code, statusCode = 401) {
        super(code);
        this.name = 'SellerLoginError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const safeText = (value, max, code = 'VALIDATION_FAILED') => {
    if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new SellerLoginError(code, 400);
    }
    return value.trim();
};

const optionalPositiveInteger = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SellerLoginError('VALIDATION_FAILED', 400);
    return parsed;
};

const randomRefreshCredential = () => crypto.randomBytes(48).toString('base64url');

const assertAllowedKeys = (input, keys) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !keys.includes(key))) {
        throw new SellerLoginError('VALIDATION_FAILED', 400);
    }
};

const login = async (database, tokenService, body) => {
    assertAllowedKeys(body, ['identifier', 'password', 'organization_id']);
    const identifier = safeText(body.identifier, 100).toLocaleLowerCase('tr-TR');
    const password = safeText(body.password, 255);
    const requestedOrganizationId = optionalPositiveInteger(body.organization_id);
    const result = await database.query(
        "SELECT user_row.id AS user_id, user_row.password, membership.id AS membership_id, membership.organization_id, membership.membership_revision, membership.security_stamp, organization.display_name AS organization_name FROM users user_row JOIN seller_memberships membership ON membership.user_id = user_row.id AND membership.status = 'active' JOIN seller_organizations organization ON organization.id = membership.organization_id AND organization.status = 'active' WHERE (LOWER(user_row.email) = $1 OR LOWER(COALESCE(user_row.phone, '')) = $1) AND ($2::bigint IS NULL OR membership.organization_id = $2) ORDER BY membership.organization_id ASC",
        [identifier, requestedOrganizationId]
    );
    const rows = result.rows || [];
    const passwordHash = rows[0]?.password;
    const validPassword = typeof passwordHash === 'string' && await bcrypt.compare(password, passwordHash);
    if (!validPassword || rows.length === 0) throw new SellerLoginError('AUTH_INVALID', 401);
    if (rows.length > 1) throw new SellerLoginError('SELLER_CONTEXT_SELECTION_REQUIRED', 409);
    const membership = rows[0];
    const refreshToken = randomRefreshCredential();
    const issued = await issueSellerSession(database, {
        userId: Number(membership.user_id),
        organizationId: Number(membership.organization_id),
        membershipId: Number(membership.membership_id),
        membershipRevision: Number(membership.membership_revision),
        securityStamp: String(membership.security_stamp),
        refreshCredential: refreshToken
    });
    return Object.freeze({
        access_token: tokenService.issue({ sessionId: issued.sessionId, userId: issued.userId }),
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: tokenService.expiresInSeconds,
        session_id: issued.sessionId,
        organization: Object.freeze({ id: issued.organizationId, display_name: String(membership.organization_name || '') })
    });
};

const refresh = async (database, tokenService, body, auditContext = null) => {
    assertAllowedKeys(body, ['refresh_token']);
    const refreshToken = safeText(body.refresh_token, 1024);
    const replacement = randomRefreshCredential();
    const rotated = await rotateRefreshCredential(database, { presentedCredential: refreshToken, replacementCredential: replacement, auditContext });
    if (!Number.isSafeInteger(rotated.userId) || rotated.userId < 1) throw new SellerLoginError('SELLER_AUTH_UNAVAILABLE', 503);
    return Object.freeze({
        access_token: tokenService.issue({ sessionId: rotated.sessionId, userId: rotated.userId }),
        refresh_token: replacement,
        token_type: 'Bearer',
        expires_in: tokenService.expiresInSeconds,
        session_id: rotated.sessionId
    });
};

const logoutCurrent = async (database, sessionId, auditContext = null) => revokeSellerSession(database, { sessionId, reason: 'seller_logout', auditContext });
const logoutAll = async (database, userId, currentSessionId, auditContext = null) => revokeAllSellerSessions(database, { userId, exceptSessionId: currentSessionId, auditContext });
const sessions = async (database, userId, currentSessionId) => listSellerSessions(database, { userId, currentSessionId });

const toSafeError = (error) => {
    if (error instanceof SellerLoginError || error instanceof SellerSessionError) return error;
    return new SellerLoginError('SELLER_AUTH_UNAVAILABLE', 503);
};

module.exports = Object.freeze({ SellerLoginError, login, refresh, logoutCurrent, logoutAll, sessions, toSafeError });
