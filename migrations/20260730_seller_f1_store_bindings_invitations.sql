BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_stores (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    legacy_store_id BIGINT REFERENCES stores(id) ON DELETE RESTRICT,
    display_name VARCHAR(160) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    suspended_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    CONSTRAINT pk_seller_stores PRIMARY KEY (id),
    CONSTRAINT uq_seller_stores_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT chk_seller_stores_display_name_nonblank CHECK (BTRIM(display_name) <> ''),
    CONSTRAINT chk_seller_stores_status
        CHECK (status IN ('active', 'suspended', 'closed')),
    CONSTRAINT chk_seller_stores_revision_positive CHECK (revision >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_stores_live_legacy_store
    ON seller_stores (legacy_store_id)
    WHERE legacy_store_id IS NOT NULL AND closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_seller_stores_organization_status_id
    ON seller_stores (organization_id, status, id);

CREATE TABLE IF NOT EXISTS seller_membership_store_scopes (
    membership_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    scope_kind VARCHAR(16) NOT NULL DEFAULT 'assigned',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT pk_seller_membership_store_scopes
        PRIMARY KEY (membership_id, store_id, created_at),
    CONSTRAINT fk_seller_membership_store_scopes_membership
        FOREIGN KEY (organization_id, membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_membership_store_scopes_store
        FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_membership_store_scopes_kind
        CHECK (scope_kind = 'assigned')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_membership_store_scopes_live
    ON seller_membership_store_scopes (membership_id, store_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_seller_membership_store_scopes_organization_store_membership
    ON seller_membership_store_scopes (organization_id, store_id, membership_id);

CREATE INDEX IF NOT EXISTS idx_seller_membership_store_scopes_membership_revoked
    ON seller_membership_store_scopes (membership_id, revoked_at);

CREATE TABLE IF NOT EXISTS seller_invitations (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    role_id BIGINT NOT NULL REFERENCES seller_roles(id) ON DELETE RESTRICT,
    invited_by_membership_id BIGINT NOT NULL,
    invitee_email_hash CHAR(64) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_invitations PRIMARY KEY (id),
    CONSTRAINT fk_seller_invitations_inviter_membership
        FOREIGN KEY (organization_id, invited_by_membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_invitations_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_seller_invitations_status
        CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    CONSTRAINT chk_seller_invitations_revision_positive CHECK (revision >= 1),
    CONSTRAINT chk_seller_invitations_email_hash_format
        CHECK (invitee_email_hash ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_invitations_token_hash_format
        CHECK (token_hash ~ '^[A-Fa-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_invitations_pending_email
    ON seller_invitations (organization_id, invitee_email_hash)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_seller_invitations_organization_status_expires_id
    ON seller_invitations (organization_id, status, expires_at, id);

CREATE OR REPLACE FUNCTION seller_guard_invitation_role_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    role_organization_id BIGINT;
    role_is_assignable BOOLEAN;
    role_code VARCHAR(80);
BEGIN
    SELECT organization_id, is_assignable, code
    INTO role_organization_id, role_is_assignable, role_code
    FROM seller_roles
    WHERE id = NEW.role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SELLER_INVITATION_ROLE_NOT_FOUND' USING ERRCODE = '23503';
    END IF;

    IF role_organization_id IS NOT NULL
       AND role_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'SELLER_INVITATION_ROLE_ORGANIZATION_MISMATCH' USING ERRCODE = '23514';
    END IF;

    IF NOT role_is_assignable OR LOWER(role_code) = 'owner' THEN
        RAISE EXCEPTION 'SELLER_INVITATION_ROLE_NOT_ASSIGNABLE' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_invitations_role_scope'
          AND tgrelid = 'seller_invitations'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_invitations_role_scope BEFORE INSERT OR UPDATE OF organization_id, role_id ON seller_invitations FOR EACH ROW EXECUTE FUNCTION seller_guard_invitation_role_scope()';
    END IF;
END;
$$;

COMMIT;
