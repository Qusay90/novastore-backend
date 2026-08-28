'use strict';

const pool = require('../config/db');
const { WebPushProviderError, createWebPushProvider } = require('./webPushProviderService');

const MAX_WEB_PUSH_ATTEMPTS = 3;

const insertAttempt = (client, deliveryId, attempt, outcome, providerStatus = null, errorCode = null) => client.query(
    `INSERT INTO notification_delivery_attempts
        (delivery_id, attempt_number, outcome, provider_status, error_code)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (delivery_id, attempt_number) DO NOTHING`,
    [deliveryId, attempt, outcome, providerStatus, errorCode]
);

const markInactiveBinding = async (client, row) => {
    await client.query(
        `UPDATE web_push_subscriptions
            SET status = 'REVOKED',
                revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                invalid_reason = COALESCE(invalid_reason, 'SESSION_NOT_ACTIVE'),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND status = 'ACTIVE'`,
        [row.subscription_id]
    );
    await insertAttempt(client, row.delivery_id, Number(row.attempt_count) + 1, 'INVALID_SUBSCRIPTION', null, 'SESSION_NOT_ACTIVE');
    await client.query(
        `UPDATE notification_deliveries
            SET status = 'INVALID_SUBSCRIPTION',
                attempt_count = attempt_count + 1,
                last_error_code = 'SESSION_NOT_ACTIVE',
                last_error_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [row.delivery_id]
    );
};

const claimDelivery = async (client) => {
    const result = await client.query(
        `SELECT delivery.id AS delivery_id,
                delivery.attempt_count,
                notification.id,
                notification.recipient_role,
                notification.type,
                notification.category,
                notification.priority,
                notification.title,
                notification.message,
                notification.entity_type,
                notification.entity_id,
                notification.entity_key,
                subscription.id AS subscription_id,
                subscription.endpoint,
                subscription.p256dh,
                subscription.auth_secret,
                subscription.expiration_time,
                subscription.status AS subscription_status,
                CASE
                    WHEN subscription.auth_session_id IS NOT NULL THEN
                        auth_session.revoked_at IS NULL
                        AND auth_session.expires_at > CURRENT_TIMESTAMP
                    ELSE NULL
                END AS auth_session_live,
                CASE
                    WHEN subscription.seller_session_id IS NOT NULL THEN
                        seller_session.status = 'active'
                        AND seller_session.expires_at > CURRENT_TIMESTAMP
                    ELSE NULL
                END AS seller_session_live
           FROM notification_deliveries delivery
           JOIN notifications notification ON notification.id = delivery.notification_id
           JOIN web_push_subscriptions subscription ON subscription.id = delivery.web_push_subscription_id
      LEFT JOIN auth_sessions auth_session ON auth_session.id = subscription.auth_session_id
      LEFT JOIN seller_sessions seller_session ON seller_session.id = subscription.seller_session_id
          WHERE delivery.channel = 'WEB_PUSH'
            AND delivery.status IN ('PENDING', 'RETRYABLE')
            AND COALESCE(delivery.next_attempt_at, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
          ORDER BY delivery.created_at ASC, delivery.id ASC
          LIMIT 1
          FOR UPDATE OF delivery, subscription SKIP LOCKED`
    );
    return result.rows[0] || null;
};

const isLiveBinding = (row) => (
    row.subscription_status === 'ACTIVE'
    && (row.auth_session_live === true || row.seller_session_live === true)
);

const deliverOneWebPush = async ({ database = pool, provider = createWebPushProvider() } = {}) => {
    if (!provider.configured) {
        return Object.freeze({ processed: false, skipped: 'CONFIGURATION_REQUIRED' });
    }
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const row = await claimDelivery(client);
        if (!row) {
            await client.query('COMMIT');
            return Object.freeze({ processed: false });
        }
        if (!isLiveBinding(row)) {
            await markInactiveBinding(client, row);
            await client.query('COMMIT');
            return Object.freeze({ processed: true, status: 'INVALID_SUBSCRIPTION', deliveryId: Number(row.delivery_id) });
        }

        const attempt = Number(row.attempt_count) + 1;
        try {
            const result = await provider.send({ subscription: row, notification: row });
            await insertAttempt(client, row.delivery_id, attempt, 'PROVIDER_ACCEPTED', result.statusCode, null);
            await client.query(
                `UPDATE notification_deliveries
                    SET status = 'PROVIDER_ACCEPTED',
                        attempt_count = $2,
                        provider_message_id = $3,
                        last_error_code = NULL,
                        last_error_at = NULL,
                        sent_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                  WHERE id = $1`,
                [row.delivery_id, attempt, result.providerMessageId || null]
            );
            await client.query('COMMIT');
            return Object.freeze({
                processed: true,
                status: 'PROVIDER_ACCEPTED',
                deliveryId: Number(row.delivery_id),
                providerStatus: result.statusCode
            });
        } catch (error) {
            const providerError = error instanceof WebPushProviderError
                ? error
                : new WebPushProviderError('Web Push sağlayıcısı kullanılamıyor.', 'WEB_PUSH_PROVIDER_RETRYABLE', { retryable: true });
            if (providerError.invalidSubscription) {
                await client.query(
                    `UPDATE web_push_subscriptions
                        SET status = 'INVALID',
                            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                            invalid_reason = $2,
                            updated_at = CURRENT_TIMESTAMP
                      WHERE id = $1`,
                    [row.subscription_id, providerError.code]
                );
                await insertAttempt(client, row.delivery_id, attempt, 'INVALID_SUBSCRIPTION', providerError.statusCode, providerError.code);
                await client.query(
                    `UPDATE notification_deliveries
                        SET status = 'INVALID_SUBSCRIPTION', attempt_count = $2,
                            last_error_code = $3, last_error_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                      WHERE id = $1`,
                    [row.delivery_id, attempt, providerError.code]
                );
                await client.query('COMMIT');
                return Object.freeze({ processed: true, status: 'INVALID_SUBSCRIPTION', deliveryId: Number(row.delivery_id) });
            }

            const retryable = providerError.retryable && attempt < MAX_WEB_PUSH_ATTEMPTS;
            const outcome = retryable ? 'RETRYABLE' : 'FAILED';
            await insertAttempt(client, row.delivery_id, attempt, outcome, providerError.statusCode, providerError.code);
            await client.query(
                `UPDATE notification_deliveries
                    SET status = $2::VARCHAR,
                        attempt_count = $3::INTEGER,
                        next_attempt_at = CASE WHEN $2::VARCHAR = 'RETRYABLE'
                            THEN CURRENT_TIMESTAMP + (CASE $3::INTEGER WHEN 1 THEN 1 WHEN 2 THEN 5 ELSE 15 END * INTERVAL '1 minute')
                            ELSE NULL END,
                        last_error_code = $4,
                        last_error_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                  WHERE id = $1`,
                [row.delivery_id, outcome, attempt, providerError.code]
            );
            await client.query('COMMIT');
            return Object.freeze({ processed: true, status: outcome, deliveryId: Number(row.delivery_id) });
        }
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const deliverPendingWebPushBatch = async ({ database = pool, provider = createWebPushProvider(), limit = 25 } = {}) => {
    if (!provider.configured) {
        return Object.freeze({ processed: 0, skipped: 'CONFIGURATION_REQUIRED', outcomes: Object.freeze([]) });
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
    const outcomes = [];
    for (let index = 0; index < safeLimit; index += 1) {
        const outcome = await deliverOneWebPush({ database, provider });
        if (!outcome.processed) break;
        outcomes.push(outcome);
    }
    return Object.freeze({ processed: outcomes.length, outcomes: Object.freeze(outcomes) });
};

module.exports = Object.freeze({
    MAX_WEB_PUSH_ATTEMPTS,
    deliverOneWebPush,
    deliverPendingWebPushBatch,
    isLiveBinding
});
