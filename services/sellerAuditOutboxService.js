'use strict';

const crypto = require('node:crypto');

class SellerAuditOutboxError extends Error {
    constructor(code, statusCode = 409) {
        super(code);
        this.name = 'SellerAuditOutboxError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const SENSITIVE_KEY = /(?:authorization|token|secret|password|credential|otp|email|phone|address|bank|tax|cookie|stack|hash)/iu;
const SAFE_SCALAR = (value) => ['string', 'number', 'boolean'].includes(typeof value) || value === null;
const SAFE_METADATA_KEYS = new Set(['reason', 'result', 'action', 'source', 'correlation_class', 'target_class', 'request_class']);

const redactMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return Object.freeze({});
    const redacted = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (SENSITIVE_KEY.test(key)) {
            redacted[key] = '[REDACTED]';
        } else if (SAFE_METADATA_KEYS.has(key) && SAFE_SCALAR(value)) {
            redacted[key] = typeof value === 'string' ? value.slice(0, 160) : value;
        } else {
            redacted[key] = '[REDACTED]';
        }
    }
    return Object.freeze(redacted);
};

const positiveInteger = (value, code = 'SELLER_AUDIT_INPUT_INVALID') => {
    const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new SellerAuditOutboxError(code, 400);
    return parsed;
};

const requiredText = (value, code = 'SELLER_AUDIT_INPUT_INVALID') => {
    if (typeof value !== 'string' || value.trim().length === 0) throw new SellerAuditOutboxError(code, 400);
    return value.trim();
};

const requireQueryable = (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') throw new TypeError('Seller audit queryable is required.');
    return queryable;
};

const writeAuditAndOutbox = async (queryable, input) => {
    const client = requireQueryable(queryable);
    const organizationId = positiveInteger(input?.organizationId);
    const audit = input?.audit || {};
    const outbox = input?.outbox || {};
    const auditResult = await client.query(
        'INSERT INTO seller_audit_events (organization_id, store_id, actor_user_id, actor_membership_id, session_id, event_type, target_type, target_id, result_code, correlation_id, metadata_redacted) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING id',
        [organizationId, audit.storeId || null, audit.actorUserId || null, audit.actorMembershipId || null, audit.sessionId || null, requiredText(audit.eventType), requiredText(audit.targetType), requiredText(audit.targetId), requiredText(audit.resultCode), audit.correlationId || null, JSON.stringify(redactMetadata(audit.metadata))]
    );
    const outboxResult = await client.query(
        'INSERT INTO seller_outbox_events (id, organization_id, store_id, aggregate_type, aggregate_id, event_type, aggregate_revision, idempotency_key, payload_redacted) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING id',
        [outbox.id || crypto.randomUUID(), organizationId, outbox.storeId || null, requiredText(outbox.aggregateType), requiredText(outbox.aggregateId), requiredText(outbox.eventType), positiveInteger(outbox.aggregateRevision), outbox.idempotencyKey || null, JSON.stringify(redactMetadata(outbox.payload))]
    );
    return Object.freeze({ auditEventId: auditResult.rows?.[0]?.id, outboxEventId: outboxResult.rows?.[0]?.id });
};

const runAtomicSellerMutation = async (database, input) => {
    if (!database || typeof database.connect !== 'function') throw new TypeError('Seller audit database pool is required.');
    if (typeof input?.mutation !== 'function') throw new SellerAuditOutboxError('SELLER_AUDIT_INPUT_INVALID', 400);
    const client = await database.connect();
    let began = false;
    try {
        await client.query('BEGIN');
        began = true;
        const mutationResult = await input.mutation(client);
        const records = await writeAuditAndOutbox(client, input);
        await client.query('COMMIT');
        return Object.freeze({ mutationResult, ...records });
    } catch (error) {
        if (began) await client.query('ROLLBACK').catch(() => {});
        throw error instanceof SellerAuditOutboxError ? error : new SellerAuditOutboxError('SELLER_AUDIT_TRANSACTION_FAILED', 503);
    } finally {
        client.release();
    }
};

const appendOutboxDeliveryAttempt = async (queryable, input) => {
    const client = requireQueryable(queryable);
    const outcome = requiredText(input?.outcome);
    if (!['leased', 'delivered', 'failed', 'dead_letter'].includes(outcome)) throw new SellerAuditOutboxError('SELLER_AUDIT_INPUT_INVALID', 400);
    const result = await client.query(
        'INSERT INTO seller_outbox_delivery_attempts (id, outbox_event_id, attempt_number, outcome, lease_expires_at, retry_after_at, error_code) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [input.id || crypto.randomUUID(), requiredText(input?.outboxEventId), positiveInteger(input?.attemptNumber), outcome, input.leaseExpiresAt || null, input.retryAfterAt || null, input.errorCode ? String(input.errorCode).slice(0, 80) : null]
    );
    return Object.freeze({ id: result.rows?.[0]?.id, outcome });
};

module.exports = Object.freeze({
    SellerAuditOutboxError,
    redactMetadata,
    writeAuditAndOutbox,
    runAtomicSellerMutation,
    appendOutboxDeliveryAttempt
});
