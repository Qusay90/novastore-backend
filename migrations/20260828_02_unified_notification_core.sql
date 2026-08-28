BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS title VARCHAR(120),
    ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(16),
    ADD COLUMN IF NOT EXISTS recipient_organization_id BIGINT,
    ADD COLUMN IF NOT EXISTS recipient_store_id BIGINT,
    ADD COLUMN IF NOT EXISTS category VARCHAR(32),
    ADD COLUMN IF NOT EXISTS priority VARCHAR(16),
    ADD COLUMN IF NOT EXISTS source_event_key VARCHAR(240),
    ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(320),
    ADD COLUMN IF NOT EXISTS entity_key VARCHAR(120),
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE notifications
SET title = COALESCE(NULLIF(BTRIM(title), ''), 'NovaStore bildirimi'),
    recipient_role = COALESCE(NULLIF(BTRIM(recipient_role), ''), CASE WHEN user_id IS NULL THEN 'admin' ELSE 'customer' END),
    category = COALESCE(NULLIF(BTRIM(category), ''), 'ACCOUNT'),
    priority = COALESCE(NULLIF(BTRIM(priority), ''), 'NORMAL'),
    read_at = CASE
        WHEN COALESCE(is_read, FALSE) = TRUE THEN COALESCE(read_at, created_at AT TIME ZONE 'Europe/Istanbul')
        ELSE NULL
    END;

ALTER TABLE notifications
    ALTER COLUMN title SET NOT NULL,
    ALTER COLUMN recipient_role SET NOT NULL,
    ALTER COLUMN category SET NOT NULL,
    ALTER COLUMN priority SET NOT NULL;

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS chk_notifications_entity_pair,
    DROP CONSTRAINT IF EXISTS chk_notifications_entity_type;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_entity_pair'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_entity_pair
            CHECK (
                (entity_type IS NULL AND entity_id IS NULL AND entity_key IS NULL)
                OR (
                    entity_type IS NOT NULL
                    AND ((entity_id IS NOT NULL)::INT + (entity_key IS NOT NULL)::INT) = 1
                )
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_entity_type'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_entity_type
            CHECK (
                entity_type IS NULL OR entity_type IN (
                    'order',
                    'payment',
                    'product',
                    'product_question',
                    'return_request',
                    'review',
                    'seller_application',
                    'shipment',
                    'store',
                    'support_thread'
                )
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_entity_key'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_entity_key
            CHECK (
                entity_key IS NULL
                OR (
                    entity_type = 'seller_application'
                    AND entity_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                )
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_recipient_role'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_recipient_role
            CHECK (recipient_role IN ('admin', 'customer', 'seller'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_recipient_scope'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_recipient_scope
            CHECK (
                (
                    recipient_role IN ('admin', 'customer')
                    AND recipient_organization_id IS NULL
                    AND recipient_store_id IS NULL
                ) OR (
                    recipient_role = 'seller'
                    AND user_id IS NOT NULL
                    AND recipient_organization_id IS NOT NULL
                )
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_category'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_category
            CHECK (category IN ('ORDER', 'PAYMENT', 'SHIPPING', 'RETURN', 'SUPPORT', 'QUESTION_REVIEW', 'ACCOUNT', 'MARKETING'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_notifications_priority'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT chk_notifications_priority
            CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_notifications_recipient_organization'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT fk_notifications_recipient_organization
            FOREIGN KEY (recipient_organization_id) REFERENCES seller_organizations(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_notifications_recipient_store'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT fk_notifications_recipient_store
            FOREIGN KEY (recipient_store_id) REFERENCES seller_stores(id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe_key
    ON notifications (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_feed
    ON notifications (user_id, recipient_role, recipient_organization_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
    ON notifications (user_id, recipient_role, recipient_organization_id, created_at DESC, id DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_entity_key
    ON notifications (entity_type, entity_key)
    WHERE entity_key IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_notification_read_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.read_at IS NOT NULL THEN
        NEW.is_read := TRUE;
    ELSIF COALESCE(NEW.is_read, FALSE) = TRUE THEN
        NEW.read_at := CURRENT_TIMESTAMP;
    ELSE
        NEW.is_read := FALSE;
        NEW.read_at := NULL;
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_sync_read_state ON notifications;
CREATE TRIGGER trg_notifications_sync_read_state
    BEFORE INSERT OR UPDATE OF is_read, read_at ON notifications
    FOR EACH ROW EXECUTE FUNCTION sync_notification_read_state();

CREATE TABLE IF NOT EXISTS notification_outbox_events (
    id UUID PRIMARY KEY,
    source_event_key VARCHAR(240) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id VARCHAR(120) NOT NULL,
    aggregate_revision BIGINT,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    last_error VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notification_outbox_source_event UNIQUE (source_event_key),
    CONSTRAINT chk_notification_outbox_event_type CHECK (BTRIM(event_type) <> ''),
    CONSTRAINT chk_notification_outbox_aggregate_type CHECK (BTRIM(aggregate_type) <> ''),
    CONSTRAINT chk_notification_outbox_aggregate_id CHECK (BTRIM(aggregate_id) <> ''),
    CONSTRAINT chk_notification_outbox_revision CHECK (aggregate_revision IS NULL OR aggregate_revision >= 1),
    CONSTRAINT chk_notification_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT chk_notification_outbox_status CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'RETRYABLE', 'FAILED')),
    CONSTRAINT chk_notification_outbox_attempt_count CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_dispatch
    ON notification_outbox_events (available_at, created_at, id)
    WHERE status IN ('PENDING', 'RETRYABLE');

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_role VARCHAR(16) NOT NULL,
    recipient_organization_id BIGINT REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    auth_session_id BIGINT REFERENCES auth_sessions(id) ON DELETE CASCADE,
    seller_session_id UUID REFERENCES seller_sessions(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    endpoint_hash CHAR(64) NOT NULL,
    p256dh TEXT NOT NULL,
    auth_secret TEXT NOT NULL,
    expiration_time TIMESTAMPTZ,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    invalid_reason VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT uq_web_push_subscriptions_endpoint_hash UNIQUE (endpoint_hash),
    CONSTRAINT chk_web_push_subscriptions_role CHECK (recipient_role IN ('admin', 'customer', 'seller')),
    CONSTRAINT chk_web_push_subscriptions_binding CHECK (
        (
            recipient_role IN ('admin', 'customer')
            AND recipient_organization_id IS NULL
            AND auth_session_id IS NOT NULL
            AND seller_session_id IS NULL
        ) OR (
            recipient_role = 'seller'
            AND recipient_organization_id IS NOT NULL
            AND auth_session_id IS NULL
            AND seller_session_id IS NOT NULL
        )
    ),
    CONSTRAINT chk_web_push_subscriptions_endpoint CHECK (BTRIM(endpoint) <> ''),
    CONSTRAINT chk_web_push_subscriptions_keys CHECK (BTRIM(p256dh) <> '' AND BTRIM(auth_secret) <> ''),
    CONSTRAINT chk_web_push_subscriptions_status CHECK (status IN ('ACTIVE', 'REVOKED', 'INVALID')),
    CONSTRAINT chk_web_push_subscriptions_terminal_time CHECK (status = 'ACTIVE' OR revoked_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_recipient
    ON web_push_subscriptions (user_id, recipient_role, recipient_organization_id, status);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_auth_session
    ON web_push_subscriptions (auth_session_id, status)
    WHERE auth_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_seller_session
    ON web_push_subscriptions (seller_session_id, status)
    WHERE seller_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id BIGSERIAL PRIMARY KEY,
    notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel VARCHAR(24) NOT NULL,
    endpoint_key VARCHAR(80) NOT NULL DEFAULT 'logical',
    web_push_subscription_id UUID REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    provider_message_id VARCHAR(240),
    last_error_code VARCHAR(80),
    last_error_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    CONSTRAINT uq_notification_deliveries_fanout UNIQUE (notification_id, channel, endpoint_key),
    CONSTRAINT chk_notification_deliveries_channel CHECK (channel IN ('IN_APP', 'WEB_PUSH', 'ANDROID_PUSH')),
    CONSTRAINT chk_notification_deliveries_status CHECK (status IN ('PENDING', 'SENT', 'PROVIDER_ACCEPTED', 'FAILED', 'RETRYABLE', 'INVALID_SUBSCRIPTION')),
    CONSTRAINT chk_notification_deliveries_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT chk_notification_deliveries_web_binding CHECK (
        (channel = 'WEB_PUSH' AND web_push_subscription_id IS NOT NULL)
        OR (channel <> 'WEB_PUSH' AND web_push_subscription_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_pending
    ON notification_deliveries (next_attempt_at, created_at, id)
    WHERE status IN ('PENDING', 'RETRYABLE');

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
    id BIGSERIAL PRIMARY KEY,
    delivery_id BIGINT NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    outcome VARCHAR(32) NOT NULL,
    provider_status INTEGER,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_notification_delivery_attempt_number UNIQUE (delivery_id, attempt_number),
    CONSTRAINT chk_notification_delivery_attempt_number CHECK (attempt_number >= 1),
    CONSTRAINT chk_notification_delivery_attempt_outcome CHECK (outcome IN ('PROVIDER_ACCEPTED', 'RETRYABLE', 'FAILED', 'INVALID_SUBSCRIPTION'))
);

CREATE OR REPLACE FUNCTION revoke_web_push_for_auth_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
        UPDATE web_push_subscriptions
        SET status = 'REVOKED',
            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP,
            invalid_reason = COALESCE(invalid_reason, 'AUTH_SESSION_REVOKED')
        WHERE auth_session_id = NEW.id
          AND status = 'ACTIVE';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_session_revoke_web_push ON auth_sessions;
CREATE TRIGGER trg_auth_session_revoke_web_push
    AFTER UPDATE OF revoked_at ON auth_sessions
    FOR EACH ROW EXECUTE FUNCTION revoke_web_push_for_auth_session();

CREATE OR REPLACE FUNCTION revoke_web_push_for_seller_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'active' AND NEW.status <> 'active' THEN
        UPDATE web_push_subscriptions
        SET status = 'REVOKED',
            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP,
            invalid_reason = COALESCE(invalid_reason, 'SELLER_SESSION_REVOKED')
        WHERE seller_session_id = NEW.id
          AND status = 'ACTIVE';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_session_revoke_web_push ON seller_sessions;
CREATE TRIGGER trg_seller_session_revoke_web_push
    AFTER UPDATE OF status ON seller_sessions
    FOR EACH ROW EXECUTE FUNCTION revoke_web_push_for_seller_session();

COMMIT;
