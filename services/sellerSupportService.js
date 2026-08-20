'use strict';

const crypto = require('node:crypto');
const { writeAuditAndOutbox } = require('./sellerAuditOutboxService');

class SellerSupportError extends Error {
    constructor(code, statusCode = 409) {
        super(code);
        this.name = 'SellerSupportError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const fail = (code, statusCode) => { throw new SellerSupportError(code, statusCode); };
const integer = (value, code = 'VALIDATION_FAILED') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) fail(code, 400);
    return parsed;
};
const text = (value, max) => {
    if (typeof value !== 'string') fail('VALIDATION_FAILED', 400);
    const normalized = value.trim();
    if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized) || /(?:https?:\/\/|file:|\\\\)/iu.test(normalized)) fail('VALIDATION_FAILED', 400);
    return normalized;
};
const context = (value) => {
    const storeIds = Array.isArray(value?.storeIds) ? value.storeIds.map((id) => integer(id, 'RESOURCE_NOT_FOUND')) : [];
    if (!storeIds.length) fail('RESOURCE_NOT_FOUND', 404);
    return Object.freeze({ organizationId: integer(value?.organizationId, 'RESOURCE_NOT_FOUND'), membershipId: integer(value?.membershipId, 'RESOURCE_NOT_FOUND'), userId: integer(value?.userId, 'RESOURCE_NOT_FOUND'), storeIds, sessionId: value.sessionId || null });
};
const activeStore = (safeContext) => { if (safeContext.storeIds.length !== 1) fail('STORE_SELECTION_REQUIRED', 409); return safeContext.storeIds[0]; };
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const fingerprint = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex');
const receipt = async (queryable, organizationId, idempotencyKey, requestFingerprint) => {
    const result = await queryable.query('SELECT request_fingerprint, response_redacted FROM seller_mutation_receipts WHERE organization_id = $1 AND idempotency_key = $2', [organizationId, idempotencyKey]);
    const row = result.rows?.[0];
    if (!row) return null;
    if (row.request_fingerprint !== requestFingerprint) fail('IDEMPOTENCY_KEY_REUSED', 409);
    return Object.freeze(row.response_redacted);
};
const atomic = async (database, input) => {
    const client = await database.connect(); let began = false;
    try { await client.query('BEGIN'); began = true; const mutationResult = await input.mutation(client); await writeAuditAndOutbox(client, input); await client.query('COMMIT'); return mutationResult; }
    catch (error) { if (began) await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
};
const saveReceipt = (client, organizationId, key, requestFingerprint, aggregateType, aggregateId, response) => client.query('INSERT INTO seller_mutation_receipts (organization_id, idempotency_key, request_fingerprint, aggregate_type, aggregate_id, response_redacted) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [organizationId, key, requestFingerprint, aggregateType, String(aggregateId), JSON.stringify(response)]);
const safeConversation = (row) => Object.freeze({ id: Number(row.id), store_id: Number(row.store_id), category: String(row.category), status: String(row.status), subject: String(row.subject), revision: Number(row.revision), created_at: row.created_at, messages: Object.freeze((row.messages || []).map((message) => Object.freeze({ id: Number(message.id), body: String(message.body), created_at: message.created_at }))) });
const loadConversation = async (queryable, rawContext, conversationId, lock = '') => {
    const safeContext = context(rawContext);
    const found = await queryable.query(`SELECT id, store_id, category, status, subject, revision, created_at FROM seller_support_conversations WHERE organization_id = $1 AND id = $2 AND store_id = ANY($3::bigint[]) ${lock}`, [safeContext.organizationId, integer(conversationId, 'RESOURCE_NOT_FOUND'), safeContext.storeIds]);
    const row = found.rows?.[0];
    if (!row) fail('RESOURCE_NOT_FOUND', 404);
    const messages = await queryable.query('SELECT id, body, created_at FROM seller_support_messages WHERE organization_id = $1 AND conversation_id = $2 ORDER BY id', [safeContext.organizationId, Number(row.id)]);
    return safeConversation({ ...row, messages: messages.rows || [] });
};

const listConversations = async (database, rawContext, query = {}) => {
    const safeContext = context(rawContext);
    if (!query || typeof query !== 'object' || Object.keys(query).some((key) => !['limit', 'status', 'category'].includes(key))) fail('VALIDATION_FAILED', 400);
    const limit = query.limit === undefined ? 50 : integer(query.limit);
    if (limit > 50) fail('VALIDATION_FAILED', 400);
    const status = query.status === undefined ? null : text(query.status, 24);
    if (status !== null && !['open', 'closed'].includes(status)) fail('VALIDATION_FAILED', 400);
    const category = query.category === undefined ? null : text(query.category, 48);
    const result = await database.query('SELECT id FROM seller_support_conversations WHERE organization_id = $1 AND store_id = ANY($2::bigint[]) AND ($3::varchar IS NULL OR status = $3) AND ($4::varchar IS NULL OR category = $4) ORDER BY id DESC LIMIT $5', [safeContext.organizationId, safeContext.storeIds, status, category, limit]);
    return Object.freeze(await Promise.all((result.rows || []).map((row) => loadConversation(database, safeContext, row.id))));
};

const createConversation = async (database, rawContext, input) => {
    const safeContext = context(rawContext);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['category', 'subject', 'body', 'client_message_id', 'idempotency_key'].includes(key))) fail('VALIDATION_FAILED', 400);
    const data = Object.freeze({ category: text(input.category, 48), subject: text(input.subject, 160), body: text(input.body, 2000), clientMessageId: text(input.client_message_id, 120), idempotencyKey: text(input.idempotency_key, 160) });
    const storeId = activeStore(safeContext);
    const requestFingerprint = fingerprint({ storeId, ...data });
    const replay = await receipt(database, safeContext.organizationId, data.idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, conversation: replay });
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.support.conversation_created', targetType: 'support_conversation', targetId: 'pending', resultCode: 'success', metadata: { action: 'create', target_class: 'support_conversation' } },
        outbox: { storeId, aggregateType: 'support_conversation', aggregateId: `create:${data.idempotencyKey}`, eventType: 'seller.support.conversation_created', aggregateRevision: 1, idempotencyKey: data.idempotencyKey, payload: { action: 'create', target_class: 'support_conversation' } },
        mutation: async (client) => {
            const conversation = await client.query('INSERT INTO seller_support_conversations (organization_id, store_id, category, subject) VALUES ($1, $2, $3, $4) RETURNING id', [safeContext.organizationId, storeId, data.category, data.subject]);
            const conversationId = Number(conversation.rows[0].id);
            await client.query('INSERT INTO seller_support_messages (organization_id, store_id, conversation_id, sender_membership_id, body, client_message_id) VALUES ($1, $2, $3, $4, $5, $6)', [safeContext.organizationId, storeId, conversationId, safeContext.membershipId, data.body, data.clientMessageId]);
            const response = await loadConversation(client, safeContext, conversationId);
            await saveReceipt(client, safeContext.organizationId, data.idempotencyKey, requestFingerprint, 'support_conversation', conversationId, response);
            return Object.freeze({ reused: false, conversation: response });
        }
    });
    return result;
};

const addMessage = async (database, rawContext, input) => {
    const safeContext = context(rawContext);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['conversation_id', 'body', 'client_message_id', 'revision', 'idempotency_key'].includes(key))) fail('VALIDATION_FAILED', 400);
    const data = Object.freeze({ conversationId: integer(input.conversation_id), body: text(input.body, 2000), clientMessageId: text(input.client_message_id, 120), revision: integer(input.revision, 'PRECONDITION_REQUIRED'), idempotencyKey: text(input.idempotency_key, 160) });
    const requestFingerprint = fingerprint(data);
    const preflight = await loadConversation(database, safeContext, data.conversationId);
    const replay = await receipt(database, safeContext.organizationId, data.idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, conversation: replay });
    if (preflight.status !== 'open') fail('CONVERSATION_CLOSED', 409);
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId: preflight.store_id, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.support.message_sent', targetType: 'support_conversation', targetId: String(data.conversationId), resultCode: 'success', metadata: { action: 'message', target_class: 'support_conversation' } },
        outbox: { storeId: preflight.store_id, aggregateType: 'support_conversation', aggregateId: String(data.conversationId), eventType: 'seller.support.message_sent', aggregateRevision: data.revision + 1, idempotencyKey: data.idempotencyKey, payload: { action: 'message', target_class: 'support_conversation' } },
        mutation: async (client) => {
            const current = await loadConversation(client, safeContext, data.conversationId, 'FOR UPDATE');
            if (current.revision !== data.revision) fail('REVISION_CONFLICT', 409);
            if (current.status !== 'open') fail('CONVERSATION_CLOSED', 409);
            await client.query('INSERT INTO seller_support_messages (organization_id, store_id, conversation_id, sender_membership_id, body, client_message_id) VALUES ($1, $2, $3, $4, $5, $6)', [safeContext.organizationId, current.store_id, data.conversationId, safeContext.membershipId, data.body, data.clientMessageId]);
            await client.query('UPDATE seller_support_conversations SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $1 AND id = $2 AND revision = $3', [safeContext.organizationId, data.conversationId, data.revision]);
            const response = await loadConversation(client, safeContext, data.conversationId);
            await saveReceipt(client, safeContext.organizationId, data.idempotencyKey, requestFingerprint, 'support_conversation', data.conversationId, response);
            return Object.freeze({ reused: false, conversation: response });
        }
    });
    return result;
};

const rateConversation = async (database, rawContext, conversationId, input) => {
    const safeContext = context(rawContext);
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['score', 'comment', 'revision', 'idempotency_key'].includes(key))) fail('VALIDATION_FAILED', 400);
    const data = Object.freeze({ score: integer(input.score), comment: input.comment === undefined ? null : text(input.comment, 1000), revision: integer(input.revision, 'PRECONDITION_REQUIRED'), idempotencyKey: text(input.idempotency_key, 160) });
    if (data.score > 5) fail('VALIDATION_FAILED', 400);
    const requestFingerprint = fingerprint({ conversationId: integer(conversationId), ...data });
    const preflight = await loadConversation(database, safeContext, conversationId);
    const replay = await receipt(database, safeContext.organizationId, data.idempotencyKey, requestFingerprint);
    if (replay) return Object.freeze({ reused: true, rating: replay });
    if (preflight.status !== 'closed') fail('CONVERSATION_NOT_CLOSED', 409);
    const result = await atomic(database, {
        organizationId: safeContext.organizationId,
        audit: { storeId: preflight.store_id, actorUserId: safeContext.userId, actorMembershipId: safeContext.membershipId, sessionId: safeContext.sessionId, eventType: 'seller.support.rated', targetType: 'support_conversation', targetId: String(conversationId), resultCode: 'success', metadata: { action: 'rate', target_class: 'support_conversation' } },
        outbox: { storeId: preflight.store_id, aggregateType: 'support_conversation', aggregateId: String(conversationId), eventType: 'seller.support.rated', aggregateRevision: data.revision, idempotencyKey: data.idempotencyKey, payload: { action: 'rate', target_class: 'support_conversation' } },
        mutation: async (client) => {
            const current = await loadConversation(client, safeContext, conversationId, 'FOR UPDATE');
            if (current.revision !== data.revision) fail('REVISION_CONFLICT', 409);
            if (current.status !== 'closed') fail('CONVERSATION_NOT_CLOSED', 409);
            const inserted = await client.query('INSERT INTO seller_support_ratings (organization_id, store_id, conversation_id, membership_id, score, comment) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, score', [safeContext.organizationId, current.store_id, integer(conversationId), safeContext.membershipId, data.score, data.comment]);
            const rating = Object.freeze({ id: Number(inserted.rows[0].id), score: Number(inserted.rows[0].score), rated: true });
            await saveReceipt(client, safeContext.organizationId, data.idempotencyKey, requestFingerprint, 'support_conversation', conversationId, rating);
            return Object.freeze({ reused: false, rating });
        }
    });
    return result;
};

module.exports = Object.freeze({ SellerSupportError, listConversations, loadConversation, createConversation, addMessage, rateConversation });
