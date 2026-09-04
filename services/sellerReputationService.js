'use strict';

const crypto = require('node:crypto');
const { loadLiveSellerSession } = require('./sellerSessionService');
const { resolveTenantContext, requireTenantPermission } = require('./sellerTenantContextService');
const { writeAuditAndOutbox } = require('./sellerAuditOutboxService');
const { enqueueNotificationEvent } = require('./notificationOutboxService');
const { EVENT } = require('./notificationEventCatalog');

class SellerReputationError extends Error {
    constructor(code, statusCode = 400) { super(code); this.code = code; this.statusCode = statusCode; }
}
const fail = (code, status = 400) => { throw new SellerReputationError(code, status); };
const integer = (value, code = 'VALIDATION_FAILED') => {
    const parsed = typeof value === 'string' && /^[1-9]\d*$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) fail(code);
    return parsed;
};
const allowedKeys = (input, keys) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !keys.includes(key))) fail('VALIDATION_FAILED');
};
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

// A bounded plain-text policy, not a claim of universal natural-language PII detection.
const FORBIDDEN_CONTENT = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:|javascript:|data:|<\/?[a-z][^>]*>|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(?:com|net|org|tr|io|co)\b|\bTR\s*\d{2}(?:\s*\d){22}\b|(?:\+?\d[\s().-]*){10,}|(?:sipariş|siparis|order)\s*(?:no|numarası|numarasi|number|id|#)\s*[:#-]?\s*[a-z0-9-]+|\b(?:adres|address|iban|kart numarası|card number)\s*:|\b(?:mahallesi|sokağı|sokagi|caddesi)\b)/iu;
const validateCommand = (input) => {
    allowedKeys(input, ['command', 'body', 'revision', 'idempotency_key']);
    if (input.command !== 'reply') fail('UNSUPPORTED_COMMAND');
    if (input.idempotency_key === undefined || input.idempotency_key === '') fail('IDEMPOTENCY_KEY_REQUIRED', 428);
    if (typeof input.idempotency_key !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/u.test(input.idempotency_key)) fail('VALIDATION_FAILED');
    if (input.revision === undefined || input.revision === null || input.revision === '') fail('PRECONDITION_REQUIRED', 428);
    const revision = integer(input.revision);
    if (typeof input.body !== 'string') fail('VALIDATION_FAILED');
    const body = input.body.trim();
    if (body.length < 1 || body.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) fail('VALIDATION_FAILED');
    if (FORBIDDEN_CONTENT.test(body)) fail('CONTENT_POLICY_VIOLATION');
    return { command: 'reply', body, revision, idempotencyKey: input.idempotency_key };
};
const validateQuery = (query) => {
    allowedKeys(query, ['cursor', 'limit', 'type', 'status', 'offer_id']);
    const limit = query.limit === undefined ? 25 : integer(query.limit);
    if (limit > 50) fail('VALIDATION_FAILED');
    if (query.type !== undefined && query.type !== 'product_question') fail('UNSUPPORTED_REPUTATION_TYPE');
    if (query.status !== undefined && !['unanswered', 'answered'].includes(query.status)) fail('VALIDATION_FAILED');
    if (query.cursor !== undefined && (typeof query.cursor !== 'string' || query.cursor.length > 512 || !query.cursor)) fail('INVALID_CURSOR');
    return { limit, type: 'product_question', status: query.status || null, offerId: query.offer_id === undefined ? null : integer(query.offer_id), cursor: query.cursor };
};

const transaction = async (database, work) => {
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '10s'");
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        // The organization-wide receipt key can also be used by a different Seller command.
        if (error.code === '23505') fail('IDEMPOTENCY_KEY_REUSED', 409);
        throw error;
    } finally { client.release(); }
};

const liveContext = async (client, raw, permissions) => {
    const userId = integer(raw?.userId, 'RESOURCE_NOT_FOUND');
    const sessionId = String(raw?.sessionId || '');
    if (!/^[0-9a-f-]{36}$/iu.test(sessionId)) fail('AUTH_REQUIRED', 401);
    // Hold current authority through commit, including replies waiting on another reply.
    const locked = await client.query(`SELECT membership.role_id
        FROM seller_sessions session
        JOIN seller_memberships membership ON membership.id = session.membership_id
          AND membership.organization_id = session.organization_id AND membership.user_id = session.user_id
        JOIN seller_organizations organization ON organization.id = session.organization_id
        JOIN users actor ON actor.id = session.user_id
        WHERE session.id = $1 AND session.user_id = $2
        FOR SHARE OF session, membership, organization, actor NOWAIT`, [sessionId, userId]);
    if (!locked.rows.length) fail('SELLER_SESSION_REVOKED', 401);
    const roleId = locked.rows[0].role_id;
    await client.query('SELECT id FROM seller_roles WHERE id = $1 FOR SHARE NOWAIT', [roleId]);
    await client.query(`SELECT permission.code FROM seller_role_permissions role_permission
        JOIN seller_permissions permission ON permission.code = role_permission.permission_code
        WHERE role_permission.role_id = $1 FOR SHARE OF role_permission, permission NOWAIT`, [roleId]);
    const session = await loadLiveSellerSession(client, { sessionId, userId });
    const context = await resolveTenantContext(client, session);
    if (context.organizationId !== raw.organizationId || context.membershipId !== raw.membershipId) fail('RESOURCE_NOT_FOUND', 404);
    for (const permission of permissions) requireTenantPermission(context, permission);
    const stores = await client.query(`SELECT seller_store.id
        FROM seller_membership_store_scopes scope
        JOIN seller_stores seller_store ON seller_store.organization_id = scope.organization_id AND seller_store.id = scope.store_id
        JOIN stores store ON store.id = seller_store.legacy_store_id
        WHERE scope.organization_id = $1 AND scope.membership_id = $2
          AND scope.scope_kind = 'assigned' AND scope.revoked_at IS NULL
          AND seller_store.status = 'active' AND seller_store.closed_at IS NULL
          AND store.is_active = TRUE AND store.deleted_at IS NULL
        ORDER BY seller_store.id FOR SHARE OF scope, seller_store, store NOWAIT`, [context.organizationId, context.membershipId]);
    const ids = stores.rows.map((row) => Number(row.id));
    // Lock existing profiles before inspecting operational state; missing profile means open.
    const profiles = await client.query(`SELECT store_id, operational_status FROM seller_store_profiles
        WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) ORDER BY store_id FOR SHARE NOWAIT`, [context.organizationId, ids]);
    const closed = new Set(profiles.rows.filter((row) => row.operational_status !== 'open').map((row) => Number(row.store_id)));
    return Object.freeze({ ...context, storeIds: ids.filter((id) => !closed.has(id)) });
};

const QUESTION_SELECT = `SELECT pq.id, pq.product_id, product.name AS product_name,
    seller_store.id AS store_id, seller_store.display_name AS store_name,
    pq.question, pq.answer, pq.revision, pq.created_at, pq.answered_at
    FROM product_questions pq
    JOIN products product ON product.id = pq.product_id AND product.deleted_at IS NULL
    JOIN seller_stores seller_store ON seller_store.legacy_store_id = product.store_id
    WHERE seller_store.organization_id = $1 AND seller_store.id = ANY($2::bigint[])
      AND seller_store.status = 'active' AND seller_store.closed_at IS NULL`;
const safeItem = (row, context) => ({
    item_id: Number(row.id), type: 'product_question', product_id: Number(row.product_id),
    product_name: row.product_name, store_id: Number(row.store_id), store_name: row.store_name,
    question: row.question, answer: row.answer || null,
    status: String(row.answer || '').trim() ? 'answered' : 'unanswered', revision: Number(row.revision),
    created_at: row.created_at, answered_at: row.answered_at,
    can_reply: !String(row.answer || '').trim() && context.permissions.includes('reputation.reply')
});
const loadQuestion = async (client, context, itemId, lock = false) => {
    const result = await client.query(`${QUESTION_SELECT} AND pq.id = $3${lock ? ' FOR UPDATE OF pq FOR SHARE OF product' : ''}`,
        [context.organizationId, context.storeIds, itemId]);
    if (!result.rows.length) fail('RESOURCE_NOT_FOUND', 404);
    return result.rows[0];
};
const cursorScope = (context, filters) => digest([context.organizationId, context.membershipId, context.storeIds, filters.type, filters.status, filters.offerId]);
const cursorSignature = (context, payload) => crypto.createHmac('sha256', context.securityStamp).update(`seller-reputation-v1:${payload}`).digest('base64url');
const makeCursor = (context, filters, before) => {
    const payload = Buffer.from(JSON.stringify({ v: 1, scope: cursorScope(context, filters), before })).toString('base64url');
    return `${payload}.${cursorSignature(context, payload)}`;
};
const readCursor = (context, filters) => {
    if (filters.cursor === undefined) return null;
    try {
        const parts = filters.cursor.split('.');
        if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/u.test(part))) fail('INVALID_CURSOR');
        const [payload, signature] = parts;
        const expected = cursorSignature(context, payload);
        if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) fail('INVALID_CURSOR');
        const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (value.v !== 1 || value.scope !== cursorScope(context, filters) || Object.keys(value).sort().join(',') !== 'before,scope,v') fail('INVALID_CURSOR');
        return integer(value.before, 'INVALID_CURSOR');
    } catch (_) { fail('INVALID_CURSOR'); }
};

const listInbox = async (database, rawContext, query = {}) => {
    const filters = validateQuery(query);
    return transaction(database, async (client) => {
        const context = await liveContext(client, rawContext, ['reputation.read']);
        const before = readCursor(context, filters);
        let productId = null;
        let storeId = null;
        if (filters.offerId !== null) {
            const offer = await client.query(`SELECT offer.product_id, offer.store_id FROM seller_offers offer
                JOIN seller_stores store ON store.id = offer.store_id AND store.organization_id = offer.organization_id
                JOIN products product ON product.id = offer.product_id AND product.store_id = store.legacy_store_id
                WHERE offer.organization_id = $1 AND offer.store_id = ANY($2::bigint[]) AND offer.id = $3
                  AND offer.archived_at IS NULL AND offer.status <> 'archived'`, [context.organizationId, context.storeIds, filters.offerId]);
            if (!offer.rows.length) fail('RESOURCE_NOT_FOUND', 404);
            productId = Number(offer.rows[0].product_id); storeId = Number(offer.rows[0].store_id);
        }
        const rows = await client.query(`${QUESTION_SELECT}
            AND ($3::bigint IS NULL OR pq.id < $3)
            AND ($4::text IS NULL OR CASE WHEN NULLIF(BTRIM(pq.answer), '') IS NULL THEN 'unanswered' ELSE 'answered' END = $4)
            AND ($5::bigint IS NULL OR pq.product_id = $5)
            AND ($6::bigint IS NULL OR seller_store.id = $6)
            ORDER BY pq.id DESC LIMIT $7`, [context.organizationId, context.storeIds, before, filters.status, productId, storeId, filters.limit + 1]);
        const page = rows.rows.slice(0, filters.limit);
        return { items: page.map((row) => safeItem(row, context)), next_cursor: rows.rows.length > filters.limit ? makeCursor(context, filters, Number(page.at(-1).id)) : null };
    });
};
const readItem = (database, rawContext, itemId) => {
    const id = integer(itemId);
    return transaction(database, async (client) => {
        const context = await liveContext(client, rawContext, ['reputation.read']);
        return { item: safeItem(await loadQuestion(client, context, id), context) };
    });
};
const command = (database, rawContext, itemId, input) => {
    const id = integer(itemId);
    const data = validateCommand(input);
    return transaction(database, async (client) => {
        const context = await liveContext(client, rawContext, ['reputation.read', 'reputation.reply']);
        // Lock org/key first: retries of the same command cannot race receipt insertion.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`seller-mutation:${context.organizationId}:${data.idempotencyKey}`]);
        const current = await loadQuestion(client, context, id, true);
        const fingerprint = digest(['seller.reputation.reply', context.organizationId, context.membershipId, Number(current.store_id), id, data.body, data.revision]);
        const receipt = await client.query('SELECT request_fingerprint, response_redacted FROM seller_mutation_receipts WHERE organization_id = $1 AND idempotency_key = $2', [context.organizationId, data.idempotencyKey]);
        if (receipt.rows.length) {
            if (receipt.rows[0].request_fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_REUSED', 409);
            return receipt.rows[0].response_redacted;
        }
        if (Number(current.revision) !== data.revision || String(current.answer || '').trim()) fail('REVISION_CONFLICT', 409);
        const updated = await client.query(`UPDATE product_questions SET answer = $1, answered_by = $2,
            answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
            WHERE id = $3 AND revision = $4 AND NULLIF(BTRIM(answer), '') IS NULL
            RETURNING id, product_id, question, answer, revision, created_at, answered_at`, [data.body, context.userId, id, data.revision]);
        if (updated.rows.length !== 1) fail('REVISION_CONFLICT', 409);
        const item = safeItem({ ...current, ...updated.rows[0] }, context);
        const response = { item, status: item.status, revision: item.revision };
        await writeAuditAndOutbox(client, {
            organizationId: context.organizationId,
            audit: { storeId: item.store_id, actorUserId: context.userId, actorMembershipId: context.membershipId, sessionId: context.sessionId,
                eventType: 'seller.reputation.reply_published', targetType: 'product_question', targetId: String(id), resultCode: 'success',
                metadata: { action: 'reply', source: 'seller_reputation', target_class: 'product_question' } },
            outbox: { storeId: item.store_id, aggregateType: 'product_question', aggregateId: String(id), aggregateRevision: item.revision,
                eventType: 'seller.reputation.reply_published', idempotencyKey: data.idempotencyKey,
                payload: { action: 'reply', source: 'seller_reputation', target_class: 'product_question' } }
        });
        await enqueueNotificationEvent(client, { eventType: EVENT.QUESTION_ANSWERED, aggregateType: 'product_question',
            aggregateId: id, aggregateRevision: item.revision,
            sourceEventKey: `QUESTION_ANSWERED:product_question:${id}:r${item.revision}`, payload: { source: 'seller_answer' } });
        await client.query(`INSERT INTO seller_mutation_receipts (organization_id, idempotency_key, request_fingerprint, aggregate_type, aggregate_id, response_redacted)
            VALUES ($1, $2, $3, 'product_question', $4, $5::jsonb)`, [context.organizationId, data.idempotencyKey, fingerprint, String(id), JSON.stringify(response)]);
        return response;
    });
};

module.exports = Object.freeze({ SellerReputationError, validateCommand, validateQuery, listInbox, readItem, command });
