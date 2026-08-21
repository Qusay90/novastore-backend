BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_applications (
    id UUID NOT NULL,
    applicant_identity_hash CHAR(64) NOT NULL,
    applicant_email VARCHAR(320) NOT NULL,
    applicant_phone VARCHAR(32),
    applicant_display_name VARCHAR(160) NOT NULL,
    status VARCHAR(48) NOT NULL DEFAULT 'DRAFT',
    revision BIGINT NOT NULL DEFAULT 1,
    current_step VARCHAR(40) NOT NULL DEFAULT 'identity',
    next_allowed_step VARCHAR(40) NOT NULL DEFAULT 'business',
    correction_steps TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    terms_revision VARCHAR(120),
    step_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    verification_state JSONB NOT NULL DEFAULT '{}'::JSONB,
    creation_idempotency_key_hash CHAR(64) NOT NULL,
    creation_request_fingerprint CHAR(64) NOT NULL,
    submitted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_applications PRIMARY KEY (id),
    CONSTRAINT uq_seller_applications_creation_idempotency UNIQUE (creation_idempotency_key_hash),
    CONSTRAINT chk_seller_applications_identity_hash CHECK (applicant_identity_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_applications_creation_key_hash CHECK (creation_idempotency_key_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_applications_creation_fingerprint CHECK (creation_request_fingerprint ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_applications_status CHECK (status IN (
        'DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'NEEDS_CORRECTION', 'UNDER_REVIEW',
        'AWAITING_EXTERNAL_VERIFICATION', 'APPROVED', 'REJECTED', 'WITHDRAWN'
    )),
    CONSTRAINT chk_seller_applications_revision CHECK (revision >= 1),
    CONSTRAINT chk_seller_applications_step_payload CHECK (jsonb_typeof(step_payload) = 'object'),
    CONSTRAINT chk_seller_applications_verification_state CHECK (jsonb_typeof(verification_state) = 'object'),
    CONSTRAINT chk_seller_applications_submitted_state CHECK (
        (status IN ('SUBMITTED', 'UNDER_REVIEW', 'AWAITING_EXTERNAL_VERIFICATION', 'APPROVED', 'REJECTED') AND submitted_at IS NOT NULL)
        OR status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'AWAITING_EXTERNAL_VERIFICATION', 'APPROVED', 'REJECTED')
    ),
    CONSTRAINT chk_seller_applications_withdrawn_state CHECK ((status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL) OR status <> 'WITHDRAWN')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_applications_active_identity
    ON seller_applications (applicant_identity_hash)
    WHERE status NOT IN ('REJECTED', 'WITHDRAWN');

CREATE INDEX IF NOT EXISTS idx_seller_applications_status_updated
    ON seller_applications (status, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS seller_applicant_sessions (
    id UUID NOT NULL,
    application_id UUID NOT NULL REFERENCES seller_applications(id) ON DELETE RESTRICT,
    token_hash CHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT pk_seller_applicant_sessions PRIMARY KEY (id),
    CONSTRAINT uq_seller_applicant_sessions_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_seller_applicant_sessions_token_hash CHECK (token_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_applicant_sessions_status CHECK (status IN ('active', 'revoked', 'expired')),
    CONSTRAINT chk_seller_applicant_sessions_expiry CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_seller_applicant_sessions_application_status_expiry
    ON seller_applicant_sessions (application_id, status, expires_at);

CREATE TABLE IF NOT EXISTS seller_application_verification_requests (
    id UUID NOT NULL,
    application_id UUID NOT NULL REFERENCES seller_applications(id) ON DELETE RESTRICT,
    channel VARCHAR(24) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'provider_pending',
    revision BIGINT NOT NULL DEFAULT 1,
    provider_reference VARCHAR(160),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_application_verification_requests PRIMARY KEY (id),
    CONSTRAINT chk_seller_application_verification_channel CHECK (channel IN ('email', 'phone', 'identity', 'documents', 'bank')),
    CONSTRAINT chk_seller_application_verification_status CHECK (status IN ('provider_pending', 'provider_unavailable', 'verified', 'failed', 'expired')),
    CONSTRAINT chk_seller_application_verification_revision CHECK (revision >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_application_verification_open_channel
    ON seller_application_verification_requests (application_id, channel)
    WHERE status IN ('provider_pending', 'provider_unavailable');

CREATE TABLE IF NOT EXISTS seller_application_command_receipts (
    application_id UUID NOT NULL REFERENCES seller_applications(id) ON DELETE RESTRICT,
    operation VARCHAR(100) NOT NULL,
    idempotency_key_hash CHAR(64) NOT NULL,
    request_fingerprint CHAR(64) NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_application_command_receipts PRIMARY KEY (application_id, operation, idempotency_key_hash),
    CONSTRAINT chk_seller_application_command_key_hash CHECK (idempotency_key_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_application_command_fingerprint CHECK (request_fingerprint ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_application_command_response CHECK (jsonb_typeof(response_payload) = 'object')
);

CREATE TABLE IF NOT EXISTS seller_application_events (
    id BIGSERIAL NOT NULL,
    application_id UUID NOT NULL REFERENCES seller_applications(id) ON DELETE RESTRICT,
    event_type VARCHAR(100) NOT NULL,
    from_status VARCHAR(48),
    to_status VARCHAR(48) NOT NULL,
    application_revision BIGINT NOT NULL,
    result_code VARCHAR(80) NOT NULL,
    metadata_redacted JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_application_events PRIMARY KEY (id),
    CONSTRAINT chk_seller_application_event_revision CHECK (application_revision >= 1),
    CONSTRAINT chk_seller_application_event_metadata CHECK (jsonb_typeof(metadata_redacted) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_seller_application_events_application_revision
    ON seller_application_events (application_id, application_revision DESC, id DESC);

CREATE OR REPLACE FUNCTION seller_application_event_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SELLER_APPLICATION_EVENT_APPEND_ONLY' USING ERRCODE = '55000';
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_seller_application_events_append_only'
          AND tgrelid = 'seller_application_events'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_application_events_append_only BEFORE UPDATE OR DELETE ON seller_application_events FOR EACH ROW EXECUTE FUNCTION seller_application_event_append_only()';
    END IF;
END;
$$;

COMMIT;
