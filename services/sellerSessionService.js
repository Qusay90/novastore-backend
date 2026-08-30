'use strict';

const crypto = require('node:crypto');
const { writeAuditAndOutbox } = require('./sellerAuditOutboxService');

class SellerSessionError extends Error {
    constructor(code, statusCode = 401) {
        super(code);
        this.name = 'SellerSessionError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const positiveInteger = (value, code = 'SELLER_SESSION_INPUT_INVALID') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SellerSessionError(code, 400);
    return parsed;
};

const optionalPositiveInteger = (value, code = 'SELLER_SESSION_INPUT_INVALID') =>
    value === undefined || value === null ? null : positiveInteger(value, code);

const nonEmptyString = (value, code = 'SELLER_SESSION_INPUT_INVALID') => {
    if (typeof value !== 'string' || value.trim().length === 0) throw new SellerSessionError(code, 400);
    return value.trim();
};

const hashRefreshCredential = (credential) => crypto
    .createHash('sha256')
    .update(`seller-refresh-v1\u0000${nonEmptyString(credential)}`, 'utf8')
    .digest('hex');

const requireQueryable = (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') throw new TypeError('Seller session queryable is required.');
    return queryable;
};

const requirePool = (database) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Seller session database pool is required.');
    return database;
};

const sessionFailure = (row) => {
    if (!row || row.session_status !== 'active') return new SellerSessionError('SELLER_SESSION_REVOKED');
    if (Object.prototype.hasOwnProperty.call(row, 'auth_enabled') && row.auth_enabled !== true) {
        return new SellerSessionError('SELLER_SESSION_REVOKED');
    }
    if (new Date(row.session_expires_at).getTime() <= Date.now()) return new SellerSessionError('SESSION_EXPIRED');
    if (row.membership_status !== 'active') return new SellerSessionError('NO_ACTIVE_MEMBERSHIP', 403);
    if (row.organization_status !== 'active') return new SellerSessionError('ACCOUNT_SUSPENDED', 403);
    if (Number(row.session_membership_revision) !== Number(row.membership_revision) || row.session_security_stamp !== row.security_stamp) {
        return new SellerSessionError('SELLER_SESSION_REVOKED');
    }
    return null;
};

const mapLiveSession = (row) => Object.freeze({
    sessionId: row.session_id,
    userId: positiveInteger(Number(row.user_id)),
    organizationId: positiveInteger(Number(row.organization_id)),
    membershipId: positiveInteger(Number(row.membership_id)),
    roleId: positiveInteger(Number(row.role_id)),
    membershipRevision: positiveInteger(Number(row.membership_revision)),
    securityStamp: String(row.security_stamp),
    audience: 'seller'
});

const loadLiveSellerSession = async (queryable, principal) => {
    const target = requireQueryable(queryable);
    const sessionId = nonEmptyString(principal?.sessionId, 'SELLER_AUDIENCE_REQUIRED');
    const userId = positiveInteger(principal?.userId, 'SELLER_AUDIENCE_REQUIRED');
    const result = await target.query(
        "SELECT session.id AS session_id, session.user_id, session.organization_id, session.membership_id, session.status AS session_status, session.expires_at AS session_expires_at, session.membership_revision AS session_membership_revision, session.security_stamp AS session_security_stamp, membership.role_id, membership.status AS membership_status, membership.membership_revision, membership.security_stamp, organization.status AS organization_status, user_row.auth_enabled FROM seller_sessions session JOIN seller_memberships membership ON membership.organization_id = session.organization_id AND membership.id = session.membership_id AND membership.user_id = session.user_id JOIN seller_organizations organization ON organization.id = session.organization_id JOIN users user_row ON user_row.id = session.user_id AND user_row.auth_enabled = TRUE WHERE session.id = $1 AND session.user_id = $2 AND session.audience = 'seller'",
        [sessionId, userId]
    );
    const row = result.rows?.[0];
    const failure = sessionFailure(row);
    if (failure) throw failure;
    return mapLiveSession(row);
};

const withTransaction = async (database, work) => {
    const client = await requirePool(database).connect();
    let began = false;
    try {
        await client.query('BEGIN');
        began = true;
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const optionalAuditActor = (context, organizationId) => {
    const actor = context?.actor;
    if (!actor || Number(actor.organizationId) !== organizationId) return null;
    const userId = Number(actor.userId);
    const membershipId = Number(actor.membershipId);
    const sessionId = String(actor.sessionId || '');
    if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(membershipId) || membershipId < 1 || !sessionId) return null;
    return Object.freeze({ userId, membershipId, sessionId });
};

const auditCorrelationId = (context) => {
    const correlationId = String(context?.correlationId || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(correlationId)
        ? correlationId
        : crypto.randomUUID();
};

const recordSessionSecurityEvent = async (client, row, eventType, reason, context = null) => {
    const sessionId = String(row?.session_id || row?.id || '');
    const organizationId = Number(row?.organization_id);
    const membershipId = Number(row?.membership_id);
    const userId = Number(row?.user_id);
    const revision = Number(row?.event_revision || row?.session_membership_revision || row?.membership_revision || 1);
    if (!sessionId || !Number.isSafeInteger(organizationId) || !Number.isSafeInteger(membershipId) || !Number.isSafeInteger(userId) || !Number.isSafeInteger(revision) || revision < 1) return null;
    const actor = optionalAuditActor(context, organizationId);
    return writeAuditAndOutbox(client, {
        organizationId,
        audit: {
            actorUserId: actor?.userId || null,
            actorMembershipId: actor?.membershipId || null,
            sessionId: actor?.sessionId || null,
            eventType,
            targetType: 'seller_session',
            targetId: sessionId,
            resultCode: 'success',
            correlationId: auditCorrelationId(context),
            metadata: { action: reason, source: 'seller_session', target_class: 'seller_session' }
        },
        outbox: {
            id: crypto.randomUUID(),
            aggregateType: 'seller_session',
            aggregateId: sessionId,
            eventType,
            aggregateRevision: revision,
            payload: { action: reason, source: 'seller_session', target_class: 'seller_session' }
        }
    });
};

const revokeSellerSession = async (database, { sessionId, reason = 'security_event', auditContext = null }) => withTransaction(database, async (client) => {
    const result = await client.query(
        "UPDATE seller_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'active' RETURNING id, user_id, organization_id, membership_id, membership_revision",
        [nonEmptyString(sessionId)]
    );
    if (result.rows?.[0]) await recordSessionSecurityEvent(client, result.rows[0], 'seller.session.revoked', String(reason).slice(0, 80), auditContext);
    return Object.freeze({ revoked: result.rows?.length === 1, reason: String(reason).slice(0, 80) });
});

const revokeMembershipSessions = async (database, { organizationId, membershipId, reason = 'membership_changed', auditContext = null }) => withTransaction(database, async (client) => {
    const result = await client.query(
        "UPDATE seller_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $1 AND membership_id = $2 AND status = 'active' RETURNING id, user_id, organization_id, membership_id, membership_revision",
        [positiveInteger(organizationId), positiveInteger(membershipId)]
    );
    for (const row of result.rows || []) await recordSessionSecurityEvent(client, row, 'seller.session.revoked', String(reason).slice(0, 80), auditContext);
    return Object.freeze({ revokedSessionIds: Object.freeze((result.rows || []).map((row) => row.id)), reason: String(reason).slice(0, 80) });
});

const validFutureDate = (value, code = 'SELLER_SESSION_INPUT_INVALID') => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new SellerSessionError(code, 400);
    return date;
};

const issueSellerSession = async (database, input) => {
    const userId = positiveInteger(input?.userId);
    const organizationId = positiveInteger(input?.organizationId);
    const membershipId = positiveInteger(input?.membershipId);
    const membershipRevision = positiveInteger(input?.membershipRevision);
    const securityStamp = nonEmptyString(input?.securityStamp);
    const refreshCredential = nonEmptyString(input?.refreshCredential);
    const sessionId = input?.sessionId || crypto.randomUUID();
    const familyId = input?.familyId || crypto.randomUUID();
    const tokenId = input?.tokenId || crypto.randomUUID();
    const familyExpiresAt = validFutureDate(input?.familyExpiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    const sessionExpiresAt = validFutureDate(input?.sessionExpiresAt || familyExpiresAt);
    if (sessionExpiresAt.getTime() !== familyExpiresAt.getTime()) {
        throw new SellerSessionError('SELLER_SESSION_INPUT_INVALID', 400);
    }
    return withTransaction(database, async (client) => {
        const membership = await client.query(
            "SELECT id FROM seller_memberships WHERE organization_id = $1 AND id = $2 AND user_id = $3 AND status = 'active' AND membership_revision = $4 AND security_stamp = $5 FOR SHARE",
            [organizationId, membershipId, userId, membershipRevision, securityStamp]
        );
        if (membership.rows?.length !== 1) throw new SellerSessionError('NO_ACTIVE_MEMBERSHIP', 403);
        await client.query(
            'INSERT INTO seller_sessions (id, user_id, organization_id, membership_id, audience, status, membership_revision, security_stamp, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [sessionId, userId, organizationId, membershipId, 'seller', 'active', membershipRevision, securityStamp, sessionExpiresAt]
        );
        await client.query(
            'INSERT INTO seller_refresh_token_families (id, session_id, current_generation, status, expires_at) VALUES ($1, $2, $3, $4, $5)',
            [familyId, sessionId, 1, 'active', familyExpiresAt]
        );
        await client.query(
            'INSERT INTO seller_refresh_tokens (id, family_id, generation, token_hash, status, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [tokenId, familyId, 1, hashRefreshCredential(refreshCredential), 'active', familyExpiresAt]
        );
        return Object.freeze({ sessionId, familyId, tokenId, userId, organizationId, membershipId, expiresAt: sessionExpiresAt.toISOString() });
    });
};

const listSellerSessions = async (queryable, input) => {
    const target = requireQueryable(queryable);
    const userId = positiveInteger(input?.userId, 'SELLER_AUDIENCE_REQUIRED');
    const currentSessionId = nonEmptyString(input?.currentSessionId, 'SELLER_AUDIENCE_REQUIRED');
    const result = await target.query(
        "SELECT id, issued_at, last_seen_at, expires_at FROM seller_sessions WHERE user_id = $1 AND audience = 'seller' AND status = 'active' AND expires_at > CURRENT_TIMESTAMP ORDER BY (id = $2) DESC, last_seen_at DESC NULLS LAST, issued_at DESC",
        [userId, currentSessionId]
    );
    return Object.freeze((result.rows || []).map((row) => Object.freeze({
        id: String(row.id),
        current: String(row.id) === currentSessionId,
        issued_at: row.issued_at,
        last_seen_at: row.last_seen_at,
        expires_at: row.expires_at
    })));
};

const revokeAllSellerSessions = async (database, input) => withTransaction(database, async (client) => {
    const userId = positiveInteger(input?.userId, 'SELLER_AUDIENCE_REQUIRED');
    const exceptSessionId = input?.exceptSessionId ? nonEmptyString(input.exceptSessionId, 'SELLER_AUDIENCE_REQUIRED') : null;
    const result = await client.query(
        "UPDATE seller_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND audience = 'seller' AND status = 'active' AND ($2::uuid IS NULL OR id <> $2::uuid) RETURNING id, user_id, organization_id, membership_id, membership_revision",
        [userId, exceptSessionId]
    );
    const revokedIds = (result.rows || []).map((row) => String(row.id));
    if (revokedIds.length) {
        await client.query("UPDATE seller_refresh_token_families SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE session_id = ANY($1::uuid[]) AND status = 'active'", [revokedIds]);
        for (const row of result.rows || []) await recordSessionSecurityEvent(client, row, 'seller.session.logout_all', 'logout_all', input?.auditContext);
    }
    return Object.freeze({ revokedSessionIds: Object.freeze(revokedIds) });
});

const selfAuditContext = (row, context) => Object.freeze({
    correlationId: context?.correlationId || crypto.randomUUID(),
    actor: context?.actor || Object.freeze({
        userId: Number(row.user_id),
        membershipId: Number(row.membership_id),
        organizationId: Number(row.organization_id),
        sessionId: String(row.session_id)
    })
});

const markRefreshReplay = async (client, row, recordSecurityEvent, auditContext) => {
    const family = await client.query(
        "UPDATE seller_refresh_token_families SET status = 'replayed', replay_detected_at = CURRENT_TIMESTAMP, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'active' RETURNING id",
        [row.family_id]
    );
    if (family.rows?.length !== 1) return;
    await client.query(
        "UPDATE seller_sessions SET status = 'compromised', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'active'",
        [row.session_id]
    );
    await recordSessionSecurityEvent(client, { ...row, event_revision: Number(row.generation) }, 'seller.session.refresh_replay_detected', 'refresh_replay', selfAuditContext(row, auditContext));
    if (typeof recordSecurityEvent === 'function') {
        await recordSecurityEvent(client, Object.freeze({ sessionId: row.session_id, eventType: 'REFRESH_TOKEN_REPLAY_DETECTED' }));
    }
};

const refreshSessionIsLive = (row) => row.session_status === 'active' &&
    row.membership_status === 'active' &&
    row.organization_status === 'active' &&
    Number(row.session_membership_revision) === Number(row.membership_revision) &&
    row.session_security_stamp === row.security_stamp &&
    new Date(row.session_expires_at).getTime() > Date.now();

const rotateRefreshCredential = async (database, input) => {
    const presentedHash = hashRefreshCredential(input?.presentedCredential);
    const replacementHash = hashRefreshCredential(input?.replacementCredential);
    if (presentedHash === replacementHash) throw new SellerSessionError('SELLER_SESSION_INPUT_INVALID', 400);
    return withTransaction(database, async (client) => {
        const result = await client.query(
            "SELECT token.id AS token_id, token.family_id, token.generation, token.status AS token_status, token.expires_at AS token_expires_at, family.session_id, family.current_generation, family.status AS family_status, family.expires_at AS family_expires_at, session.user_id, session.organization_id, session.membership_id, session.status AS session_status, session.expires_at AS session_expires_at, session.membership_revision AS session_membership_revision, session.security_stamp AS session_security_stamp, membership.status AS membership_status, membership.membership_revision, membership.security_stamp, organization.status AS organization_status FROM seller_refresh_tokens token JOIN seller_refresh_token_families family ON family.id = token.family_id JOIN seller_sessions session ON session.id = family.session_id JOIN seller_memberships membership ON membership.organization_id = session.organization_id AND membership.id = session.membership_id AND membership.user_id = session.user_id JOIN seller_organizations organization ON organization.id = session.organization_id WHERE token.token_hash = $1 FOR UPDATE",
            [presentedHash]
        );
        const row = result.rows?.[0];
        if (!row) throw new SellerSessionError('SELLER_SESSION_REVOKED');
        if (!refreshSessionIsLive(row)) {
            const revoked = await client.query("UPDATE seller_sessions SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'active' RETURNING id, user_id, organization_id, membership_id, membership_revision", [row.session_id]);
            if (revoked.rows?.[0]) await recordSessionSecurityEvent(client, revoked.rows[0], 'seller.session.revoked', 'refresh_session_invalid', input?.auditContext);
            return Object.freeze({ failureCode: 'SELLER_SESSION_REVOKED' });
        }
        const expired = new Date(row.token_expires_at).getTime() <= Date.now() || new Date(row.family_expires_at).getTime() <= Date.now();
        if (row.token_status !== 'active' || row.family_status !== 'active' || expired || Number(row.generation) !== Number(row.current_generation)) {
            await markRefreshReplay(client, row, input?.recordSecurityEvent, input?.auditContext);
            return Object.freeze({ failureCode: 'REFRESH_TOKEN_REPLAY_DETECTED' });
        }
        const consumed = await client.query(
            "UPDATE seller_refresh_tokens SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP, replaced_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'active' RETURNING id",
            [row.token_id]
        );
        if (consumed.rows?.length !== 1) {
            await markRefreshReplay(client, row, input?.recordSecurityEvent, input?.auditContext);
            return Object.freeze({ failureCode: 'REFRESH_TOKEN_REPLAY_DETECTED' });
        }
        const nextGeneration = Number(row.generation) + 1;
        const advanced = await client.query(
            'UPDATE seller_refresh_token_families SET current_generation = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND current_generation = $3 AND status = $4 RETURNING id',
            [nextGeneration, row.family_id, row.current_generation, 'active']
        );
        if (advanced.rows?.length !== 1) {
            await markRefreshReplay(client, row, input?.recordSecurityEvent, input?.auditContext);
            return Object.freeze({ failureCode: 'REFRESH_TOKEN_REPLAY_DETECTED' });
        }
        const nextTokenId = input?.nextTokenId || crypto.randomUUID();
        await client.query(
            "INSERT INTO seller_refresh_tokens (id, family_id, generation, token_hash, expires_at) SELECT $1, id, $2, $3, expires_at FROM seller_refresh_token_families WHERE id = $4",
            [nextTokenId, nextGeneration, replacementHash, row.family_id]
        );
        await client.query('UPDATE seller_refresh_tokens SET replaced_by_token_id = $1 WHERE id = $2', [nextTokenId, row.token_id]);
        await recordSessionSecurityEvent(client, { ...row, event_revision: nextGeneration }, 'seller.session.refresh_rotated', 'refresh_rotated', selfAuditContext(row, input?.auditContext));
        return Object.freeze({ familyId: row.family_id, sessionId: row.session_id, userId: optionalPositiveInteger(row.user_id), organizationId: optionalPositiveInteger(row.organization_id), membershipId: optionalPositiveInteger(row.membership_id), generation: nextGeneration });
    }).then((outcome) => {
        if (outcome?.failureCode) throw new SellerSessionError(outcome.failureCode);
        return outcome;
    });
};

const requireSellerStepUp = async (queryable, input) => {
    const target = requireQueryable(queryable);
    const result = await target.query(
        "SELECT id, status, expires_at, session_id, action, target_type, target_id, membership_id, organization_id FROM seller_step_up_challenges WHERE id = $1 AND session_id = $2 AND organization_id = $3 AND membership_id = $4 AND action = $5 AND target_type = $6 AND target_id = $7",
        [nonEmptyString(input?.challengeId), nonEmptyString(input?.sessionId), positiveInteger(input?.organizationId), positiveInteger(input?.membershipId), nonEmptyString(input?.action), nonEmptyString(input?.targetType), nonEmptyString(input?.targetId)]
    );
    const row = result.rows?.[0];
    if (!row || row.status !== 'verified') throw new SellerSessionError('STEP_UP_REQUIRED', 403);
    if (new Date(row.expires_at).getTime() <= Date.now()) throw new SellerSessionError('STEP_UP_EXPIRED', 403);
    return Object.freeze({ id: row.id, verified: true });
};

module.exports = Object.freeze({
    SellerSessionError,
    hashRefreshCredential,
    loadLiveSellerSession,
    revokeSellerSession,
    revokeMembershipSessions,
    issueSellerSession,
    listSellerSessions,
    revokeAllSellerSessions,
    rotateRefreshCredential,
    requireSellerStepUp,
    withTransaction
});
