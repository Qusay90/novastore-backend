BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_bootstrap_operator_authorizations (
    id BIGSERIAL NOT NULL,
    public_id UUID NOT NULL,
    purpose VARCHAR(64) NOT NULL,
    target_owner_user_id INTEGER NOT NULL,
    target_legacy_store_id BIGINT NOT NULL,
    intended_organization_external_key UUID NOT NULL,
    intended_organization_display_name VARCHAR(160) NOT NULL,
    intended_seller_store_display_name VARCHAR(160) NOT NULL,
    decision_payload_sha256 CHAR(64) NOT NULL,
    operator_reference VARCHAR(160) NOT NULL,
    reason_code VARCHAR(80),
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    revision BIGINT NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_bootstrap_operator_authorizations PRIMARY KEY (id),
    CONSTRAINT uq_seller_bootstrap_operator_authorizations_public_id UNIQUE (public_id),
    CONSTRAINT fk_seller_bootstrap_operator_authorizations_owner
        FOREIGN KEY (target_owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_bootstrap_operator_authorizations_store
        FOREIGN KEY (target_legacy_store_id) REFERENCES stores(id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_bootstrap_operator_authorizations_purpose
        CHECK (purpose = 'FIRST_PARTY_SELLER_BOOTSTRAP'),
    CONSTRAINT chk_seller_bootstrap_operator_authorizations_payload_hash
        CHECK (decision_payload_sha256 ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_sbo_auth_organization_display_name
        CHECK (BTRIM(intended_organization_display_name) <> ''),
    CONSTRAINT chk_sbo_auth_store_display_name
        CHECK (BTRIM(intended_seller_store_display_name) <> ''),
    CONSTRAINT chk_sbo_auth_operator_reference
        CHECK (BTRIM(operator_reference) <> ''),
    CONSTRAINT chk_seller_bootstrap_operator_authorizations_reason_code
        CHECK (reason_code IS NULL OR BTRIM(reason_code) <> ''),
    CONSTRAINT chk_seller_bootstrap_operator_authorizations_status
        CHECK (status IN ('pending', 'consumed', 'revoked', 'expired')),
    CONSTRAINT chk_seller_bootstrap_operator_authorizations_revision
        CHECK (revision >= 1),
    CONSTRAINT chk_seller_bootstrap_operator_authorizations_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT chk_sbo_auth_terminal_timestamps
        CHECK (
            (status IN ('pending', 'expired') AND consumed_at IS NULL AND revoked_at IS NULL)
            OR (status = 'consumed' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
            OR (status = 'revoked' AND revoked_at IS NOT NULL AND consumed_at IS NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_bootstrap_operator_authorizations_pending_target
    ON seller_bootstrap_operator_authorizations (
        intended_organization_external_key,
        target_owner_user_id,
        target_legacy_store_id
    )
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_seller_bootstrap_operator_authorizations_pending_expiry
    ON seller_bootstrap_operator_authorizations (purpose, status, expires_at, id);

COMMIT;
