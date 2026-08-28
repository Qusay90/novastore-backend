BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS android_push_endpoints (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_role VARCHAR(16) NOT NULL,
    recipient_organization_id BIGINT REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    auth_session_id BIGINT REFERENCES auth_sessions(id) ON DELETE CASCADE,
    seller_session_id UUID REFERENCES seller_sessions(id) ON DELETE CASCADE,
    application VARCHAR(32) NOT NULL,
    platform VARCHAR(16) NOT NULL DEFAULT 'ANDROID',
    installation_id UUID NOT NULL,
    token TEXT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    invalid_reason VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT uq_android_push_endpoints_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_android_push_endpoints_role CHECK (recipient_role IN ('customer', 'seller')),
    CONSTRAINT chk_android_push_endpoints_application CHECK (application IN ('CUSTOMER_ANDROID', 'SELLER_ANDROID')),
    CONSTRAINT chk_android_push_endpoints_platform CHECK (platform = 'ANDROID'),
    CONSTRAINT chk_android_push_endpoints_binding CHECK (
        (
            application = 'CUSTOMER_ANDROID'
            AND recipient_role = 'customer'
            AND recipient_organization_id IS NULL
            AND auth_session_id IS NOT NULL
            AND seller_session_id IS NULL
        ) OR (
            application = 'SELLER_ANDROID'
            AND recipient_role = 'seller'
            AND recipient_organization_id IS NOT NULL
            AND auth_session_id IS NULL
            AND seller_session_id IS NOT NULL
        )
    ),
    CONSTRAINT chk_android_push_endpoints_token CHECK (
        OCTET_LENGTH(token) BETWEEN 16 AND 8192
        AND token !~ '[[:space:]]'
        AND token_hash ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT chk_android_push_endpoints_status CHECK (status IN ('ACTIVE', 'REVOKED', 'INVALID')),
    CONSTRAINT chk_android_push_endpoints_terminal_time CHECK (status = 'ACTIVE' OR revoked_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_android_push_endpoints_active_installation
    ON android_push_endpoints (application, installation_id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_android_push_endpoints_recipient
    ON android_push_endpoints (user_id, recipient_role, recipient_organization_id, status);

CREATE INDEX IF NOT EXISTS idx_android_push_endpoints_auth_session
    ON android_push_endpoints (auth_session_id, status)
    WHERE auth_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_android_push_endpoints_seller_session
    ON android_push_endpoints (seller_session_id, status)
    WHERE seller_session_id IS NOT NULL;

ALTER TABLE notification_deliveries
    ADD COLUMN IF NOT EXISTS android_push_endpoint_id UUID
        REFERENCES android_push_endpoints(id) ON DELETE CASCADE;

ALTER TABLE notification_deliveries
    DROP CONSTRAINT IF EXISTS chk_notification_deliveries_web_binding,
    DROP CONSTRAINT IF EXISTS chk_notification_deliveries_endpoint_binding;

ALTER TABLE notification_deliveries
    ADD CONSTRAINT chk_notification_deliveries_endpoint_binding CHECK (
        (
            channel = 'WEB_PUSH'
            AND web_push_subscription_id IS NOT NULL
            AND android_push_endpoint_id IS NULL
        ) OR (
            channel = 'ANDROID_PUSH'
            AND web_push_subscription_id IS NULL
            AND android_push_endpoint_id IS NOT NULL
        ) OR (
            channel = 'IN_APP'
            AND web_push_subscription_id IS NULL
            AND android_push_endpoint_id IS NULL
        )
    );

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_android_endpoint
    ON notification_deliveries (android_push_endpoint_id, status)
    WHERE android_push_endpoint_id IS NOT NULL;

CREATE OR REPLACE FUNCTION revoke_android_push_for_auth_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
        UPDATE android_push_endpoints
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

DROP TRIGGER IF EXISTS trg_auth_session_revoke_android_push ON auth_sessions;
CREATE TRIGGER trg_auth_session_revoke_android_push
    AFTER UPDATE OF revoked_at ON auth_sessions
    FOR EACH ROW EXECUTE FUNCTION revoke_android_push_for_auth_session();

CREATE OR REPLACE FUNCTION revoke_android_push_for_seller_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'active' AND NEW.status <> 'active' THEN
        UPDATE android_push_endpoints
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

DROP TRIGGER IF EXISTS trg_seller_session_revoke_android_push ON seller_sessions;
CREATE TRIGGER trg_seller_session_revoke_android_push
    AFTER UPDATE OF status ON seller_sessions
    FOR EACH ROW EXECUTE FUNCTION revoke_android_push_for_seller_session();

COMMIT;
