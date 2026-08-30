'use strict';

const pool = require('../config/db');
const {
    AndroidPushProviderError,
    createFcmHttpV1Provider
} = require('./androidPushProviderService');
const {
    SellerNotificationAuthorizationError,
    authorizeSellerPrivateDelivery
} = require('./sellerNotificationAuthorizationService');

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
                notification.id AS notification_id,
                notification.id,
                notification.user_id AS notification_user_id,
                notification.recipient_role AS notification_recipient_role,
                notification.recipient_organization_id AS notification_organization_id,
                notification.recipient_store_id AS notification_store_id,
                notification.type,
                notification.category,
                notification.priority,
                notification.title,
                notification.message,
                notification.entity_type,
                notification.entity_id,
                notification.entity_key,
                endpoint.id AS endpoint_id,
                endpoint.user_id AS endpoint_user_id,
                endpoint.recipient_role AS endpoint_recipient_role,
                endpoint.recipient_organization_id AS endpoint_organization_id,
                endpoint.auth_session_id AS endpoint_auth_session_id,
                endpoint.seller_session_id AS endpoint_seller_session_id,
                endpoint.application AS endpoint_application,
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
          FOR UPDATE OF delivery SKIP LOCKED`
    );
    return result.rows[0] || null;
};

const loadLockedAndroidEndpoint = async (client, endpointId) => {
    const result = await client.query(
        `SELECT endpoint.id AS endpoint_id,
                endpoint.user_id AS endpoint_user_id,
                endpoint.recipient_role AS endpoint_recipient_role,
                endpoint.recipient_organization_id AS endpoint_organization_id,
                endpoint.auth_session_id AS endpoint_auth_session_id,
                endpoint.seller_session_id AS endpoint_seller_session_id,
                endpoint.application AS endpoint_application,
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
           FROM android_push_endpoints endpoint
      LEFT JOIN auth_sessions auth_session ON auth_session.id = endpoint.auth_session_id
      LEFT JOIN seller_sessions seller_session ON seller_session.id = endpoint.seller_session_id
          WHERE endpoint.id = $1
          FOR UPDATE OF endpoint`,
        [endpointId]
    );
    return result.rows[0] || null;
};

const nullableIdentity = (value) => value == null ? null : String(value).trim().toLowerCase();

const isSameAndroidBinding = (claimed, refreshed) => (
    String(refreshed?.endpoint_id || '').toLowerCase() === String(claimed.endpoint_id || '').toLowerCase()
    && Number(refreshed.endpoint_user_id) === Number(claimed.endpoint_user_id)
    && String(refreshed.endpoint_recipient_role || '').trim().toLowerCase()
        === String(claimed.endpoint_recipient_role || '').trim().toLowerCase()
    && nullableIdentity(refreshed.endpoint_organization_id) === nullableIdentity(claimed.endpoint_organization_id)
    && nullableIdentity(refreshed.endpoint_auth_session_id) === nullableIdentity(claimed.endpoint_auth_session_id)
    && nullableIdentity(refreshed.endpoint_seller_session_id) === nullableIdentity(claimed.endpoint_seller_session_id)
    && refreshed.endpoint_application === claimed.endpoint_application
    && String(refreshed.endpoint_recipient_role || '').trim().toLowerCase()
        === String(claimed.notification_recipient_role || '').trim().toLowerCase()
    && (
        claimed.notification_user_id == null
            ? String(refreshed.endpoint_recipient_role || '').trim().toLowerCase() === 'admin'
            : Number(refreshed.endpoint_user_id) === Number(claimed.notification_user_id)
    )
    && nullableIdentity(refreshed.endpoint_organization_id) === nullableIdentity(claimed.notification_organization_id)
);

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

const markSellerUnauthorizedDelivery = async (client, row, error, { endpointBindingCurrent = false } = {}) => {
    if (error.endpointInvalid && endpointBindingCurrent) {
        await client.query(
            `UPDATE android_push_endpoints
                SET status = 'REVOKED',
                    revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                    invalid_reason = COALESCE(invalid_reason, 'SELLER_AUTHORITY_NOT_ACTIVE'),
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
                AND user_id = $2
                AND recipient_role = $3
                AND recipient_organization_id IS NOT DISTINCT FROM $4
                AND auth_session_id IS NOT DISTINCT FROM $5
                AND seller_session_id IS NOT DISTINCT FROM $6::UUID
                AND application = $7
                AND status = 'ACTIVE'`,
            [
                row.endpoint_id,
                row.endpoint_user_id,
                row.endpoint_recipient_role,
                row.endpoint_organization_id,
                row.endpoint_auth_session_id,
                row.endpoint_seller_session_id,
                row.endpoint_application
            ]
        );
    }
    const attempt = Number(row.attempt_count) + 1;
    await insertAttempt(client, row.delivery_id, attempt, 'FAILED', null, 'SELLER_DELIVERY_NOT_AUTHORIZED');
    await client.query(
        `UPDATE notification_deliveries
            SET status = 'FAILED',
                attempt_count = $2,
                next_attempt_at = NULL,
                last_error_code = 'SELLER_DELIVERY_NOT_AUTHORIZED',
                last_error_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [row.delivery_id, attempt]
    );
};

const markChangedBindingDelivery = async (client, row) => {
    const attempt = Number(row.attempt_count) + 1;
    await insertAttempt(client, row.delivery_id, attempt, 'FAILED', null, 'DELIVERY_BINDING_CHANGED');
    await client.query(
        `UPDATE notification_deliveries
            SET status = 'FAILED',
                attempt_count = $2,
                next_attempt_at = NULL,
                last_error_code = 'DELIVERY_BINDING_CHANGED',
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
        const claimedRow = await claimAndroidDelivery(client);
        if (!claimedRow) {
            await client.query('COMMIT');
            return Object.freeze({ processed: false });
        }
        let row = claimedRow;
        if (claimedRow.notification_recipient_role === 'seller') {
            try {
                // Lock Seller authority before the endpoint. Session-revocation triggers use
                // the same session -> endpoint order, avoiding an endpoint -> session cycle.
                await authorizeSellerPrivateDelivery(client, claimedRow, { channel: 'ANDROID_PUSH' });
                const refreshedEndpoint = await loadLockedAndroidEndpoint(client, claimedRow.endpoint_id);
                if (!isSameAndroidBinding(claimedRow, refreshedEndpoint)) {
                    await markChangedBindingDelivery(client, claimedRow);
                    await client.query('COMMIT');
                    return Object.freeze({
                        processed: true,
                        status: 'FAILED',
                        deliveryId: Number(claimedRow.delivery_id),
                        errorCode: 'DELIVERY_BINDING_CHANGED'
                    });
                }
                row = { ...claimedRow, ...refreshedEndpoint };
            } catch (error) {
                if (!(error instanceof SellerNotificationAuthorizationError)) throw error;
                const refreshedEndpoint = await loadLockedAndroidEndpoint(client, claimedRow.endpoint_id);
                const endpointBindingCurrent = isSameAndroidBinding(claimedRow, refreshedEndpoint);
                const failureRow = refreshedEndpoint ? { ...claimedRow, ...refreshedEndpoint } : claimedRow;
                await markSellerUnauthorizedDelivery(client, failureRow, error, { endpointBindingCurrent });
                await client.query('COMMIT');
                return Object.freeze({
                    processed: true,
                    status: 'FAILED',
                    deliveryId: Number(claimedRow.delivery_id),
                    errorCode: 'SELLER_DELIVERY_NOT_AUTHORIZED'
                });
            }
        } else {
            const refreshedEndpoint = await loadLockedAndroidEndpoint(client, claimedRow.endpoint_id);
            if (!isSameAndroidBinding(claimedRow, refreshedEndpoint)) {
                await markChangedBindingDelivery(client, claimedRow);
                await client.query('COMMIT');
                return Object.freeze({
                    processed: true,
                    status: 'FAILED',
                    deliveryId: Number(claimedRow.delivery_id),
                    errorCode: 'DELIVERY_BINDING_CHANGED'
                });
            }
            row = { ...claimedRow, ...refreshedEndpoint };
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
        if (row.notification_recipient_role === 'seller') {
            try {
                // Revalidate the refreshed endpoint and target while holding both the
                // original Seller authority locks and the endpoint row lock.
                await authorizeSellerPrivateDelivery(client, row, { channel: 'ANDROID_PUSH' });
            } catch (error) {
                if (!(error instanceof SellerNotificationAuthorizationError)) throw error;
                await markSellerUnauthorizedDelivery(client, row, error, { endpointBindingCurrent: true });
                await client.query('COMMIT');
                return Object.freeze({
                    processed: true,
                    status: 'FAILED',
                    deliveryId: Number(row.delivery_id),
                    errorCode: 'SELLER_DELIVERY_NOT_AUTHORIZED'
                });
            }
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
