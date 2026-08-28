'use strict';

const pool = require('../config/db');
const {
    AndroidPushProviderError,
    createFcmHttpV1Provider
} = require('./androidPushProviderService');

const MAX_ANDROID_PUSH_ATTEMPTS = 3;

const insertAttempt = (client, deliveryId, attempt, outcome, providerStatus = null, errorCode = null) => client.query(
    `INSERT INTO notification_delivery_attempts
        (delivery_id, attempt_number, outcome, provider_status, error_code)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (delivery_id, attempt_number) DO NOTHING`,
    [deliveryId, attempt, outcome, providerStatus, errorCode]
);

const claimAndroidDelivery = async (client) => {
    const result = await client.query(
        `SELECT delivery.id AS delivery_id,
                delivery.attempt_count,
                notification.id,
                notification.type,
                notification.category,
                notification.priority,
                notification.title,
                notification.message,
                notification.entity_type,
                notification.entity_id,
                notification.entity_key,
                endpoint.id AS endpoint_id,
                endpoint.token,
                endpoint.status AS endpoint_status,
                CASE
                    WHEN endpoint.auth_session_id IS NOT NULL THEN
                        auth_session.revoked_at IS NULL
                        AND auth_session.expires_at > CURRENT_TIMESTAMP
                    ELSE NULL
                END AS auth_session_live,
                CASE
                    WHEN endpoint.seller_session_id IS NOT NULL THEN
                        seller_session.status = 'active'
                        AND seller_session.expires_at > CURRENT_TIMESTAMP
                    ELSE NULL
                END AS seller_session_live
           FROM notification_deliveries delivery
           JOIN notifications notification ON notification.id = delivery.notification_id
           JOIN android_push_endpoints endpoint ON endpoint.id = delivery.android_push_endpoint_id
      LEFT JOIN auth_sessions auth_session ON auth_session.id = endpoint.auth_session_id
      LEFT JOIN seller_sessions seller_session ON seller_session.id = endpoint.seller_session_id
          WHERE delivery.channel = 'ANDROID_PUSH'
            AND delivery.status IN ('PENDING', 'RETRYABLE')
            AND COALESCE(delivery.next_attempt_at, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
          ORDER BY delivery.created_at ASC, delivery.id ASC
          LIMIT 1
          FOR UPDATE OF delivery, endpoint SKIP LOCKED`
    );
    return result.rows[0] || null;
};

const isLiveAndroidBinding = (row) => (
    row.endpoint_status === 'ACTIVE'
    && (row.auth_session_live === true || row.seller_session_live === true)
);

const markInactiveEndpoint = async (client, row) => {
    await client.query(
        `UPDATE android_push_endpoints
            SET status = 'REVOKED',
                revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                invalid_reason = COALESCE(invalid_reason, 'SESSION_NOT_ACTIVE'),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND status = 'ACTIVE'`,
        [row.endpoint_id]
    );
    const attempt = Number(row.attempt_count) + 1;
    await insertAttempt(client, row.delivery_id, attempt, 'INVALID_SUBSCRIPTION', null, 'SESSION_NOT_ACTIVE');
    await client.query(
        `UPDATE notification_deliveries
            SET status = 'INVALID_SUBSCRIPTION',
                attempt_count = $2,
                next_attempt_at = NULL,
                last_error_code = 'SESSION_NOT_ACTIVE',
                last_error_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [row.delivery_id, attempt]
    );
};

const deliverOneAndroidPush = async ({ database = pool, provider = createFcmHttpV1Provider() } = {}) => {
    if (!provider.configured) {
        return Object.freeze({ processed: false, skipped: 'CONFIGURATION_REQUIRED' });
    }
    const client = await database.connect();
    try {
        await client.query('BEGIN');
        const row = await claimAndroidDelivery(client);
        if (!row) {
            await client.query('COMMIT');
            return Object.freeze({ processed: false });
        }
        if (!isLiveAndroidBinding(row)) {
            await markInactiveEndpoint(client, row);
            await client.query('COMMIT');
            return Object.freeze({
                processed: true,
                status: 'INVALID_SUBSCRIPTION',
                deliveryId: Number(row.delivery_id)
            });
        }

        const attempt = Number(row.attempt_count) + 1;
        try {
            const result = await provider.send({ endpoint: row, notification: row });
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
            const providerError = error instanceof AndroidPushProviderError
                ? error
                : new AndroidPushProviderError('FCM geçici olarak kullanılamıyor.', 'FCM_PROVIDER_RETRYABLE', { retryable: true });
            if (providerError.invalidEndpoint) {
                await client.query(
                    `UPDATE android_push_endpoints
                        SET status = 'INVALID',
                            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                            invalid_reason = $2,
                            updated_at = CURRENT_TIMESTAMP
                      WHERE id = $1`,
                    [row.endpoint_id, providerError.code]
                );
                await insertAttempt(
                    client,
                    row.delivery_id,
                    attempt,
                    'INVALID_SUBSCRIPTION',
                    providerError.statusCode,
                    providerError.code
                );
                await client.query(
                    `UPDATE notification_deliveries
                        SET status = 'INVALID_SUBSCRIPTION',
                            attempt_count = $2,
                            next_attempt_at = NULL,
                            last_error_code = $3,
                            last_error_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                      WHERE id = $1`,
                    [row.delivery_id, attempt, providerError.code]
                );
                await client.query('COMMIT');
                return Object.freeze({
                    processed: true,
                    status: 'INVALID_SUBSCRIPTION',
                    deliveryId: Number(row.delivery_id)
                });
            }

            const retryable = providerError.retryable && attempt < MAX_ANDROID_PUSH_ATTEMPTS;
            const outcome = retryable ? 'RETRYABLE' : 'FAILED';
            await insertAttempt(
                client,
                row.delivery_id,
                attempt,
                outcome,
                providerError.statusCode,
                providerError.code
            );
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

const deliverPendingAndroidPushBatch = async ({
    database = pool,
    provider = createFcmHttpV1Provider(),
    limit = 25
} = {}) => {
    if (!provider.configured) {
        return Object.freeze({ processed: 0, skipped: 'CONFIGURATION_REQUIRED', outcomes: Object.freeze([]) });
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
    const outcomes = [];
    for (let index = 0; index < safeLimit; index += 1) {
        const outcome = await deliverOneAndroidPush({ database, provider });
        if (!outcome.processed) break;
        outcomes.push(outcome);
    }
    return Object.freeze({ processed: outcomes.length, outcomes: Object.freeze(outcomes) });
};

module.exports = Object.freeze({
    MAX_ANDROID_PUSH_ATTEMPTS,
    deliverOneAndroidPush,
    deliverPendingAndroidPushBatch,
    isLiveAndroidBinding
});
