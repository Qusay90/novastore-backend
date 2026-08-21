BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_password_recovery_challenges (
    id UUID NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    identifier_hash CHAR(64) NOT NULL,
    delivery_channel VARCHAR(16) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    reset_token_hash CHAR(64),
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    reset_expires_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_password_recovery_challenges PRIMARY KEY (id),
    CONSTRAINT chk_seller_password_recovery_identifier_hash CHECK (identifier_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_password_recovery_code_hash CHECK (code_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_password_recovery_reset_hash CHECK (reset_token_hash IS NULL OR reset_token_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_password_recovery_channel CHECK (delivery_channel IN ('email', 'phone')),
    CONSTRAINT chk_seller_password_recovery_status CHECK (status IN ('pending', 'verified', 'consumed', 'expired', 'locked', 'superseded')),
    CONSTRAINT chk_seller_password_recovery_attempts CHECK (attempt_count >= 0 AND attempt_count <= 5),
    CONSTRAINT chk_seller_password_recovery_expiry CHECK (expires_at > created_at),
    CONSTRAINT chk_seller_password_recovery_verified_state CHECK (
        (status = 'verified' AND verified_at IS NOT NULL AND reset_token_hash IS NOT NULL AND reset_expires_at IS NOT NULL)
        OR status <> 'verified'
    ),
    CONSTRAINT chk_seller_password_recovery_consumed_state CHECK (
        (status = 'consumed' AND consumed_at IS NOT NULL) OR status <> 'consumed'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_password_recovery_pending_identifier
    ON seller_password_recovery_challenges (identifier_hash)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_password_recovery_reset_token_hash
    ON seller_password_recovery_challenges (reset_token_hash)
    WHERE reset_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_password_recovery_user_status_created
    ON seller_password_recovery_challenges (user_id, status, created_at DESC)
    WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS seller_password_recovery_events (
    id BIGSERIAL NOT NULL,
    challenge_id UUID NOT NULL REFERENCES seller_password_recovery_challenges(id) ON DELETE RESTRICT,
    event_type VARCHAR(80) NOT NULL,
    result_code VARCHAR(80) NOT NULL,
    metadata_redacted JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_password_recovery_events PRIMARY KEY (id),
    CONSTRAINT chk_seller_password_recovery_event_type CHECK (BTRIM(event_type) <> ''),
    CONSTRAINT chk_seller_password_recovery_result_code CHECK (BTRIM(result_code) <> ''),
    CONSTRAINT chk_seller_password_recovery_metadata CHECK (jsonb_typeof(metadata_redacted) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_seller_password_recovery_events_challenge_created
    ON seller_password_recovery_events (challenge_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION seller_password_recovery_event_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SELLER_PASSWORD_RECOVERY_EVENT_APPEND_ONLY' USING ERRCODE = '55000';
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_seller_password_recovery_events_append_only'
          AND tgrelid = 'seller_password_recovery_events'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_password_recovery_events_append_only BEFORE UPDATE OR DELETE ON seller_password_recovery_events FOR EACH ROW EXECUTE FUNCTION seller_password_recovery_event_append_only()';
    END IF;
END;
$$;

COMMIT;
