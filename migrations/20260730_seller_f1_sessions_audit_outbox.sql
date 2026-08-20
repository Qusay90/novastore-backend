BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_sessions (
    id UUID NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    organization_id BIGINT NOT NULL,
    membership_id BIGINT NOT NULL,
    audience VARCHAR(32) NOT NULL DEFAULT 'seller',
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    membership_revision BIGINT NOT NULL,
    security_stamp UUID NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_sessions PRIMARY KEY (id),
    CONSTRAINT fk_seller_sessions_membership
        FOREIGN KEY (organization_id, membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_sessions_audience CHECK (audience = 'seller'),
    CONSTRAINT chk_seller_sessions_status
        CHECK (status IN ('active', 'revoked', 'expired', 'compromised')),
    CONSTRAINT chk_seller_sessions_membership_revision_positive
        CHECK (membership_revision >= 1),
    CONSTRAINT chk_seller_sessions_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_seller_sessions_id_status_expires
    ON seller_sessions (id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_seller_sessions_membership_status_id
    ON seller_sessions (membership_id, status, id);

CREATE INDEX IF NOT EXISTS idx_seller_sessions_organization_membership_status
    ON seller_sessions (organization_id, membership_id, status);

CREATE TABLE IF NOT EXISTS seller_refresh_token_families (
    id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES seller_sessions(id) ON DELETE RESTRICT,
    current_generation BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replay_detected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_refresh_token_families PRIMARY KEY (id),
    CONSTRAINT chk_seller_refresh_token_families_generation_positive
        CHECK (current_generation >= 1),
    CONSTRAINT chk_seller_refresh_token_families_status
        CHECK (status IN ('active', 'revoked', 'replayed', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_seller_refresh_token_families_session_status_expires
    ON seller_refresh_token_families (session_id, status, expires_at);

CREATE TABLE IF NOT EXISTS seller_refresh_tokens (
    id UUID NOT NULL,
    family_id UUID NOT NULL REFERENCES seller_refresh_token_families(id) ON DELETE RESTRICT,
    generation BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    replaced_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id UUID REFERENCES seller_refresh_tokens(id) ON DELETE RESTRICT,
    CONSTRAINT pk_seller_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT uq_seller_refresh_tokens_family_generation UNIQUE (family_id, generation),
    CONSTRAINT uq_seller_refresh_tokens_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_seller_refresh_tokens_generation_positive CHECK (generation >= 1),
    CONSTRAINT chk_seller_refresh_tokens_status
        CHECK (status IN ('active', 'consumed', 'replaced', 'revoked', 'expired')),
    CONSTRAINT chk_seller_refresh_tokens_expiry_after_issue CHECK (expires_at > issued_at),
    CONSTRAINT chk_seller_refresh_tokens_hash_format
        CHECK (token_hash ~ '^[A-Fa-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_refresh_tokens_active_family
    ON seller_refresh_tokens (family_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_seller_refresh_tokens_family_status_generation
    ON seller_refresh_tokens (family_id, status, generation);

CREATE INDEX IF NOT EXISTS idx_seller_refresh_tokens_hash_status
    ON seller_refresh_tokens (token_hash, status);

CREATE TABLE IF NOT EXISTS seller_step_up_challenges (
    id UUID NOT NULL,
    session_id UUID NOT NULL REFERENCES seller_sessions(id) ON DELETE RESTRICT,
    organization_id BIGINT NOT NULL,
    membership_id BIGINT NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(160) NOT NULL,
    secret_hash CHAR(64),
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_step_up_challenges PRIMARY KEY (id),
    CONSTRAINT fk_seller_step_up_challenges_membership
        FOREIGN KEY (organization_id, membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_step_up_challenges_status
        CHECK (status IN ('pending', 'verified', 'expired', 'locked', 'revoked')),
    CONSTRAINT chk_seller_step_up_challenges_attempt_count
        CHECK (attempt_count >= 0 AND attempt_count <= 100),
    CONSTRAINT chk_seller_step_up_challenges_verified_at
        CHECK ((status = 'verified' AND verified_at IS NOT NULL) OR status <> 'verified')
);

CREATE INDEX IF NOT EXISTS idx_seller_step_up_challenges_session_status_expires
    ON seller_step_up_challenges (session_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_seller_step_up_challenges_organization_action_target_status
    ON seller_step_up_challenges (organization_id, action, target_type, target_id, status);

CREATE TABLE IF NOT EXISTS seller_audit_events (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    store_id BIGINT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    actor_membership_id BIGINT,
    session_id UUID REFERENCES seller_sessions(id) ON DELETE RESTRICT,
    event_type VARCHAR(120) NOT NULL,
    target_type VARCHAR(120) NOT NULL,
    target_id VARCHAR(160) NOT NULL,
    result_code VARCHAR(120) NOT NULL,
    correlation_id UUID,
    metadata_redacted JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_audit_events PRIMARY KEY (id),
    CONSTRAINT fk_seller_audit_events_store
        FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_audit_events_actor_membership
        FOREIGN KEY (organization_id, actor_membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_audit_events_metadata_object
        CHECK (jsonb_typeof(metadata_redacted) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_seller_audit_events_organization_created_id
    ON seller_audit_events (organization_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_seller_audit_events_organization_store_created_id
    ON seller_audit_events (organization_id, store_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_seller_audit_events_actor_membership_created
    ON seller_audit_events (actor_membership_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seller_audit_events_correlation_id
    ON seller_audit_events (correlation_id);

CREATE TABLE IF NOT EXISTS seller_outbox_events (
    id UUID NOT NULL,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    store_id BIGINT,
    aggregate_type VARCHAR(120) NOT NULL,
    aggregate_id VARCHAR(160) NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    aggregate_revision BIGINT NOT NULL,
    idempotency_key VARCHAR(160),
    payload_redacted JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_outbox_events PRIMARY KEY (id),
    CONSTRAINT fk_seller_outbox_events_store
        FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_outbox_events_aggregate_revision
        UNIQUE (organization_id, aggregate_type, aggregate_id, aggregate_revision, event_type),
    CONSTRAINT chk_seller_outbox_events_aggregate_revision_positive
        CHECK (aggregate_revision >= 1),
    CONSTRAINT chk_seller_outbox_events_payload_object
        CHECK (jsonb_typeof(payload_redacted) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_outbox_events_organization_idempotency
    ON seller_outbox_events (organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_outbox_events_organization_created_id
    ON seller_outbox_events (organization_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS seller_outbox_delivery_attempts (
    id UUID NOT NULL,
    outbox_event_id UUID NOT NULL REFERENCES seller_outbox_events(id) ON DELETE RESTRICT,
    attempt_number INTEGER NOT NULL,
    outcome VARCHAR(24) NOT NULL,
    lease_expires_at TIMESTAMPTZ,
    retry_after_at TIMESTAMPTZ,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_outbox_delivery_attempts PRIMARY KEY (id),
    CONSTRAINT uq_seller_outbox_delivery_attempts_event_number_outcome
        UNIQUE (outbox_event_id, attempt_number, outcome),
    CONSTRAINT chk_seller_outbox_delivery_attempts_number_positive
        CHECK (attempt_number >= 1),
    CONSTRAINT chk_seller_outbox_delivery_attempts_outcome
        CHECK (outcome IN ('leased', 'delivered', 'failed', 'dead_letter')),
    CONSTRAINT chk_seller_outbox_delivery_attempts_lease
        CHECK (outcome <> 'leased' OR lease_expires_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_seller_outbox_delivery_attempts_event_created_id
    ON seller_outbox_delivery_attempts (outbox_event_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_seller_outbox_delivery_attempts_retry_after_id
    ON seller_outbox_delivery_attempts (retry_after_at, id)
    WHERE retry_after_at IS NOT NULL;

CREATE OR REPLACE FUNCTION seller_reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SELLER_APPEND_ONLY_MUTATION_FORBIDDEN' USING ERRCODE = '55000';
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_audit_events_append_only'
          AND tgrelid = 'seller_audit_events'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_audit_events_append_only BEFORE UPDATE OR DELETE ON seller_audit_events FOR EACH ROW EXECUTE FUNCTION seller_reject_append_only_mutation()';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_outbox_events_append_only'
          AND tgrelid = 'seller_outbox_events'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_outbox_events_append_only BEFORE UPDATE OR DELETE ON seller_outbox_events FOR EACH ROW EXECUTE FUNCTION seller_reject_append_only_mutation()';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_outbox_delivery_attempts_append_only'
          AND tgrelid = 'seller_outbox_delivery_attempts'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_outbox_delivery_attempts_append_only BEFORE UPDATE OR DELETE ON seller_outbox_delivery_attempts FOR EACH ROW EXECUTE FUNCTION seller_reject_append_only_mutation()';
    END IF;
END;
$$;

COMMIT;
