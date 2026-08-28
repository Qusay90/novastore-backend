'use strict';

const crypto = require('node:crypto');
const pool = require('../config/db');
const { getNotificationCopy, getNotificationEventPolicy } = require('./notificationEventCatalog');
const { resolveNotificationRecipients, recipientKey } = require('./notificationRecipientService');
const { normalizeNotificationTarget } = require('./notificationTargetService');

const MAX_OUTBOX_ATTEMPTS = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FORBIDDEN_PAYLOAD_KEY = /^(?:recipient(?:id|ids|user|users)?|recipient_id|recipient_ids|user_id|userid|targeturl|target_url|route|url)$/iu;

class NotificationOutboxError extends Error {
    constructor(message, code = 'NOTIFICATION_OUTBOX_INVALID', statusCode = 400) {
        super(message);
        this.name = 'NotificationOutboxError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

const requireQueryable = (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Bildirim outbox işlemi için sorgulanabilir veritabanı gerekir.');
    }
    return queryable;
};

const assertPayloadKeys = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        value.forEach(assertPayloadKeys);
        return;
    }
    for (const [key, nested] of Object.entries(value)) {
        if (FORBIDDEN_PAYLOAD_KEY.test(key)) {
            throw new NotificationOutboxError(
                'Bildirim olayı istemci rotası veya alıcı kimliği taşıyamaz.',
                'NOTIFICATION_OUTBOX_AUTHORITY_FIELD_REJECTED'
            );
        }
        assertPayloadKeys(nested);
    }
};

const normalizePayload = (payload) => {
    if (payload === undefined || payload === null) return Object.freeze({});
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new NotificationOutboxError('Bildirim olay yükü bir nesne olmalıdır.');
    }
    assertPayloadKeys(payload);
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > 8192) {
        throw new NotificationOutboxError('Bildirim olay yükü sınırı aşıyor.', 'NOTIFICATION_OUTBOX_PAYLOAD_TOO_LARGE');
    }
    return Object.freeze(JSON.parse(serialized));
};

const normalizeAggregateId = (policy, rawId) => {
    const value = String(rawId ?? '').trim().toLowerCase();
    if (policy.aggregateType === 'seller_application') {
        if (!UUID_PATTERN.test(value)) {
            throw new NotificationOutboxError('Satıcı başvurusu olay kimliği geçersiz.', 'NOTIFICATION_AGGREGATE_ID_INVALID');
        }
        return value;
    }
    if (!/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new NotificationOutboxError('Bildirim olayı varlık kimliği geçersiz.', 'NOTIFICATION_AGGREGATE_ID_INVALID');
    }
    return value;
};

const normalizeRevision = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new NotificationOutboxError('Bildirim olayı revizyonu geçersiz.', 'NOTIFICATION_AGGREGATE_REVISION_INVALID');
    }
    return parsed;
};

const sourceEventKey = ({ eventType, aggregateType, aggregateId, aggregateRevision, eventKey }) => {
    const supplied = String(eventKey || '').trim();
    const generated = `${eventType}:${aggregateType}:${aggregateId}:r${aggregateRevision || 1}`;
    const resolved = supplied || generated;
    if (!/^[A-Za-z0-9._:-]{8,240}$/u.test(resolved)) {
        throw new NotificationOutboxError('Bildirim olay anahtarı geçersiz.', 'NOTIFICATION_SOURCE_EVENT_KEY_INVALID');
    }
    return resolved;
};

const enqueueNotificationEvent = async (queryable, input = {}) => {
    const target = requireQueryable(queryable);
    const policy = getNotificationEventPolicy(input.eventType);
    const aggregateType = String(input.aggregateType || policy.aggregateType).trim().toLowerCase();
    if (aggregateType !== policy.aggregateType) {
        throw new NotificationOutboxError('Bildirim olayı ve varlık türü uyuşmuyor.', 'NOTIFICATION_AGGREGATE_TYPE_MISMATCH');
    }
    const aggregateId = normalizeAggregateId(policy, input.aggregateId);
    const aggregateRevision = normalizeRevision(input.aggregateRevision);
    const payload = normalizePayload(input.payload);
    const eventKey = sourceEventKey({
        eventType: String(input.eventType).trim().toUpperCase(),
        aggregateType,
        aggregateId,
        aggregateRevision,
        eventKey: input.sourceEventKey
    });
    const id = input.id || crypto.randomUUID();

    const result = await target.query(
        `INSERT INTO notification_outbox_events
            (id, source_event_key, event_type, aggregate_type, aggregate_id, aggregate_revision, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)
         ON CONFLICT (source_event_key) DO UPDATE
             SET source_event_key = EXCLUDED.source_event_key
         RETURNING id, source_event_key, event_type, aggregate_type, aggregate_id,
                   aggregate_revision, payload, status, (xmax = 0) AS inserted`,
        [
            id,
            eventKey,
            String(input.eventType).trim().toUpperCase(),
            aggregateType,
            aggregateId,
            aggregateRevision,
            JSON.stringify(payload)
        ]
    );
    return Object.freeze({
        inserted: result.rows[0]?.inserted === true,
        id: result.rows[0]?.id || id,
        sourceEventKey: eventKey
    });
};

const makeDedupeKey = (event, recipient) => `nfy:v1:${crypto.createHash('sha256')
    .update(`${event.source_event_key}|${recipientKey(recipient)}`)
    .digest('hex')}`;

const makeTarget = (eventPolicy, event) => normalizeNotificationTarget(
    eventPolicy.targetType === 'seller_application'
        ? { entityType: eventPolicy.targetType, entityKey: event.aggregate_id }
        : { entityType: eventPolicy.targetType, entityId: Number(event.aggregate_id) }
);

const activeSubscriptions = async (queryable, recipient) => {
    const result = await queryable.query(
        `SELECT subscription.id
           FROM web_push_subscriptions subscription
      LEFT JOIN auth_sessions auth_session
             ON auth_session.id = subscription.auth_session_id
      LEFT JOIN seller_sessions seller_session
             ON seller_session.id = subscription.seller_session_id
          WHERE subscription.user_id = $1
            AND subscription.recipient_role = $2
            AND COALESCE(subscription.recipient_organization_id, 0) = COALESCE($3::BIGINT, 0)
            AND subscription.status = 'ACTIVE'
            AND (
                (
                    subscription.auth_session_id IS NOT NULL
                    AND auth_session.revoked_at IS NULL
                    AND auth_session.expires_at > CURRENT_TIMESTAMP
                ) OR (
                    subscription.seller_session_id IS NOT NULL
                    AND seller_session.status = 'active'
                    AND seller_session.expires_at > CURRENT_TIMESTAMP
                )
            )
          ORDER BY subscription.created_at ASC, subscription.id ASC`,
        [recipient.userId, recipient.role, recipient.organizationId]
    );
    return result.rows;
};

const persistLogicalNotification = async (queryable, event, eventPolicy, recipient) => {
    const copy = getNotificationCopy(event.event_type, recipient.role);
    const target = makeTarget(eventPolicy, event);
    const dedupeKey = makeDedupeKey(event, recipient);
    const result = await queryable.query(
        `INSERT INTO notifications
            (user_id, recipient_role, recipient_organization_id, recipient_store_id,
             type, category, priority, title, message,
             entity_type, entity_id, entity_key, source_event_key, dedupe_key, is_read, read_at)
         VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, FALSE, NULL)
         ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [
            recipient.userId,
            recipient.role,
            recipient.organizationId,
            recipient.storeId,
            event.event_type,
            eventPolicy.category,
            eventPolicy.priority,
            copy.title,
            copy.body,
            target.entityType,
            target.entityId,
            target.entityKey,
            event.source_event_key,
            dedupeKey
        ]
    );
    if (result.rows.length === 0) return null;

    const notification = result.rows[0];
    await queryable.query(
        `INSERT INTO notification_deliveries
            (notification_id, channel, endpoint_key, status, attempt_count, sent_at)
         VALUES ($1, 'IN_APP', 'logical', 'SENT', 1, CURRENT_TIMESTAMP)
         ON CONFLICT (notification_id, channel, endpoint_key) DO NOTHING`,
        [notification.id]
    );
    const subscriptions = await activeSubscriptions(queryable, recipient);
    for (const subscription of subscriptions) {
        await queryable.query(
            `INSERT INTO notification_deliveries
                (notification_id, channel, endpoint_key, web_push_subscription_id, status, next_attempt_at)
             VALUES ($1, 'WEB_PUSH', $2, $3, 'PENDING', CURRENT_TIMESTAMP)
             ON CONFLICT (notification_id, channel, endpoint_key) DO NOTHING`,
            [notification.id, String(subscription.id), subscription.id]
        );
    }
    return notification;
};

const emitRealtime = async (io, notifications) => {
    if (!io || !Array.isArray(notifications) || notifications.length === 0) return;
    for (const notification of notifications) {
        try {
            io.to(`user_${Number(notification.user_id)}`).emit('notification_refresh', {
                notificationId: Number(notification.id),
                unreadChanged: true
            });
        } catch (_) {
            // Persisted notification remains authoritative when realtime is unavailable.
        }
    }
};

const markDispatchFailure = async (database, eventId, attemptCount, error) => {
    const terminal = attemptCount >= MAX_OUTBOX_ATTEMPTS;
    const code = String(error?.code || error?.name || 'NOTIFICATION_DISPATCH_FAILED').slice(0, 500);
    await database.query(
        `UPDATE notification_outbox_events
            SET status = $2,
                last_error = $3,
                available_at = CASE WHEN $2 = 'RETRYABLE'
                    THEN CURRENT_TIMESTAMP + (LEAST(GREATEST($4, 1), 5) * INTERVAL '1 minute')
                    ELSE available_at END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [eventId, terminal ? 'FAILED' : 'RETRYABLE', code, attemptCount]
    );
};

const dispatchOneNotificationEvent = async ({ database = pool, eventId = null, io = null } = {}) => {
    const client = await database.connect();
    let event = null;
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `SELECT id, source_event_key, event_type, aggregate_type, aggregate_id,
                    aggregate_revision, payload, status, attempt_count
               FROM notification_outbox_events
              WHERE ($1::UUID IS NULL OR id = $1)
                AND status IN ('PENDING', 'RETRYABLE')
                AND available_at <= CURRENT_TIMESTAMP
              ORDER BY created_at ASC, id ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED`,
            [eventId]
        );
        event = result.rows[0] || null;
        if (!event) {
            await client.query('COMMIT');
            return Object.freeze({ processed: false, notifications: Object.freeze([]) });
        }
        event.attempt_count = Number(event.attempt_count) + 1;
        await client.query(
            `UPDATE notification_outbox_events
                SET status = 'PROCESSING', attempt_count = $2, updated_at = CURRENT_TIMESTAMP
              WHERE id = $1`,
            [event.id, event.attempt_count]
        );

        const eventPolicy = getNotificationEventPolicy(event.event_type);
        const recipients = await resolveNotificationRecipients(client, {
            eventType: event.event_type,
            aggregateType: event.aggregate_type,
            aggregateId: event.aggregate_id
        });
        const notifications = [];
        for (const recipient of recipients) {
            const notification = await persistLogicalNotification(client, event, eventPolicy, recipient);
            if (notification) notifications.push(notification);
        }
        await client.query(
            `UPDATE notification_outbox_events
                SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP,
                    last_error = NULL, updated_at = CURRENT_TIMESTAMP
              WHERE id = $1`,
            [event.id]
        );
        await client.query('COMMIT');
        await emitRealtime(io, notifications);
        return Object.freeze({
            processed: true,
            eventId: event.id,
            recipientCount: recipients.length,
            notificationCount: notifications.length,
            notifications: Object.freeze(notifications.map((row) => Object.freeze(row)))
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (event) await markDispatchFailure(database, event.id, event.attempt_count || 1, error).catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const dispatchNotificationOutboxBatch = async ({ database = pool, io = null, limit = 25 } = {}) => {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
    const outcomes = [];
    for (let index = 0; index < safeLimit; index += 1) {
        const outcome = await dispatchOneNotificationEvent({ database, io });
        if (!outcome.processed) break;
        outcomes.push(outcome);
    }
    return Object.freeze(outcomes);
};

module.exports = Object.freeze({
    MAX_OUTBOX_ATTEMPTS,
    NotificationOutboxError,
    dispatchNotificationOutboxBatch,
    dispatchOneNotificationEvent,
    enqueueNotificationEvent,
    makeDedupeKey,
    normalizePayload,
    sourceEventKey
});
