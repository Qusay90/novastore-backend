BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_public_legal_identities (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    version VARCHAR(80) NOT NULL,
    public_legal_name VARCHAR(200) NOT NULL,
    public_trade_name VARCHAR(160) NOT NULL,
    public_disclosure_text TEXT NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    created_by_admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_admin_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    withdrawn_by_admin_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    withdrawn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revision BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT pk_seller_public_legal_identities PRIMARY KEY (id),
    CONSTRAINT uq_seller_public_legal_identity_version UNIQUE (organization_id, version),
    CONSTRAINT chk_seller_public_legal_identity_version
        CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
    CONSTRAINT chk_seller_public_legal_identity_names
        CHECK (BTRIM(public_legal_name) <> '' AND BTRIM(public_trade_name) <> ''),
    CONSTRAINT chk_seller_public_legal_identity_disclosure
        CHECK (BTRIM(public_disclosure_text) <> '' AND LENGTH(public_disclosure_text) <= 4000),
    CONSTRAINT chk_seller_public_legal_identity_hash
        CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_seller_public_legal_identity_status
        CHECK (status IN ('draft', 'approved', 'withdrawn')),
    CONSTRAINT chk_seller_public_legal_identity_approval
        CHECK (
            (status = 'draft'
                AND approved_by_admin_user_id IS NULL AND approved_at IS NULL
                AND withdrawn_by_admin_user_id IS NULL AND withdrawn_at IS NULL)
            OR (status = 'approved'
                AND approved_by_admin_user_id IS NOT NULL AND approved_at IS NOT NULL
                AND withdrawn_by_admin_user_id IS NULL AND withdrawn_at IS NULL)
            OR (status = 'withdrawn'
                AND approved_by_admin_user_id IS NOT NULL AND approved_at IS NOT NULL
                AND withdrawn_by_admin_user_id IS NOT NULL AND withdrawn_at IS NOT NULL
                AND withdrawn_at >= approved_at)
        ),
    CONSTRAINT chk_seller_public_legal_identity_revision CHECK (revision >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_public_legal_identity_approved
    ON seller_public_legal_identities (organization_id)
    WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_seller_public_legal_identity_status_organization
    ON seller_public_legal_identities (status, organization_id, id);

CREATE OR REPLACE FUNCTION seller_public_legal_identity_admin_actor_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users
         WHERE id = NEW.created_by_admin_user_id
           AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'seller public legal identity creator must be an admin user';
    END IF;

    IF NEW.approved_by_admin_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users
         WHERE id = NEW.approved_by_admin_user_id
           AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'seller public legal identity approver must be an admin user';
    END IF;

    IF NEW.withdrawn_by_admin_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users
         WHERE id = NEW.withdrawn_by_admin_user_id
           AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'seller public legal identity withdrawer must be an admin user';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seller_public_legal_identity_admin_actor_guard
    ON seller_public_legal_identities;
CREATE TRIGGER trg_seller_public_legal_identity_admin_actor_guard
BEFORE INSERT OR UPDATE ON seller_public_legal_identities
FOR EACH ROW EXECUTE FUNCTION seller_public_legal_identity_admin_actor_guard();

CREATE OR REPLACE FUNCTION seller_public_legal_identity_version_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'seller public legal identities are versioned and cannot be deleted';
    END IF;
    IF OLD.created_by_admin_user_id IS DISTINCT FROM NEW.created_by_admin_user_id THEN
        RAISE EXCEPTION 'seller public legal identity creator is immutable';
    END IF;
    IF OLD.status = 'withdrawn' THEN
        RAISE EXCEPTION 'withdrawn seller public legal identities are immutable';
    END IF;
    IF OLD.status = 'approved' THEN
        IF NEW.status <> 'withdrawn' THEN
            RAISE EXCEPTION 'approved seller public legal identity requires a new version';
        END IF;
        IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
            OR OLD.version IS DISTINCT FROM NEW.version
            OR OLD.public_legal_name IS DISTINCT FROM NEW.public_legal_name
            OR OLD.public_trade_name IS DISTINCT FROM NEW.public_trade_name
            OR OLD.public_disclosure_text IS DISTINCT FROM NEW.public_disclosure_text
            OR OLD.content_sha256 IS DISTINCT FROM NEW.content_sha256
            OR OLD.approved_by_admin_user_id IS DISTINCT FROM NEW.approved_by_admin_user_id
            OR OLD.approved_at IS DISTINCT FROM NEW.approved_at THEN
            RAISE EXCEPTION 'approved seller public legal identity content is immutable';
        END IF;
    ELSIF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'approved') THEN
        RAISE EXCEPTION 'draft seller public legal identity may only remain draft or become approved';
    END IF;
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.revision = OLD.revision + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seller_public_legal_identity_version_guard
    ON seller_public_legal_identities;
CREATE TRIGGER trg_seller_public_legal_identity_version_guard
BEFORE UPDATE OR DELETE ON seller_public_legal_identities
FOR EACH ROW EXECUTE FUNCTION seller_public_legal_identity_version_guard();

CREATE TABLE IF NOT EXISTS seller_public_legal_identity_events (
    id BIGSERIAL PRIMARY KEY,
    identity_id BIGINT NOT NULL REFERENCES seller_public_legal_identities(id) ON DELETE RESTRICT,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    event_type VARCHAR(48) NOT NULL,
    identity_version VARCHAR(80) NOT NULL,
    identity_content_sha256 CHAR(64) NOT NULL,
    actor_admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_redacted JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT chk_seller_public_legal_identity_event_type
        CHECK (event_type IN ('created', 'approved', 'withdrawn')),
    CONSTRAINT chk_seller_public_legal_identity_event_hash
        CHECK (identity_content_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_seller_public_legal_identity_event_metadata
        CHECK (jsonb_typeof(metadata_redacted) = 'object')
);

CREATE OR REPLACE FUNCTION seller_public_legal_identity_event_admin_actor_guard()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users
         WHERE id = NEW.actor_admin_user_id
           AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'seller public legal identity event actor must be an admin user';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seller_public_legal_identity_event_admin_actor_guard
    ON seller_public_legal_identity_events;
CREATE TRIGGER trg_seller_public_legal_identity_event_admin_actor_guard
BEFORE INSERT ON seller_public_legal_identity_events
FOR EACH ROW EXECUTE FUNCTION seller_public_legal_identity_event_admin_actor_guard();

CREATE OR REPLACE FUNCTION seller_public_legal_identity_audit_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO seller_public_legal_identity_events
            (identity_id, organization_id, event_type, identity_version,
             identity_content_sha256, actor_admin_user_id, metadata_redacted)
        VALUES
            (NEW.id, NEW.organization_id, 'created', NEW.version,
             NEW.content_sha256, NEW.created_by_admin_user_id,
             jsonb_build_object('revision', NEW.revision));
        IF NEW.status = 'approved' THEN
            INSERT INTO seller_public_legal_identity_events
                (identity_id, organization_id, event_type, identity_version,
                 identity_content_sha256, actor_admin_user_id, metadata_redacted)
            VALUES
                (NEW.id, NEW.organization_id, 'approved', NEW.version,
                 NEW.content_sha256, NEW.approved_by_admin_user_id,
                 jsonb_build_object('revision', NEW.revision));
        END IF;
    ELSIF OLD.status = 'draft' AND NEW.status = 'approved' THEN
        INSERT INTO seller_public_legal_identity_events
            (identity_id, organization_id, event_type, identity_version,
             identity_content_sha256, actor_admin_user_id, metadata_redacted)
        VALUES
            (NEW.id, NEW.organization_id, 'approved', NEW.version,
             NEW.content_sha256, NEW.approved_by_admin_user_id,
             jsonb_build_object('revision', NEW.revision));
    ELSIF OLD.status = 'approved' AND NEW.status = 'withdrawn' THEN
        INSERT INTO seller_public_legal_identity_events
            (identity_id, organization_id, event_type, identity_version,
             identity_content_sha256, actor_admin_user_id, metadata_redacted)
        VALUES
            (NEW.id, NEW.organization_id, 'withdrawn', NEW.version,
             NEW.content_sha256, NEW.withdrawn_by_admin_user_id,
             jsonb_build_object('revision', NEW.revision));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seller_public_legal_identity_audit_event
    ON seller_public_legal_identities;
CREATE TRIGGER trg_seller_public_legal_identity_audit_event
AFTER INSERT OR UPDATE ON seller_public_legal_identities
FOR EACH ROW EXECUTE FUNCTION seller_public_legal_identity_audit_event();

CREATE OR REPLACE FUNCTION seller_public_legal_identity_event_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'seller public legal identity events are append-only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_seller_public_legal_identities_no_truncate'
           AND tgrelid = 'seller_public_legal_identities'::regclass
    ) THEN
        CREATE TRIGGER trg_seller_public_legal_identities_no_truncate
        BEFORE TRUNCATE ON seller_public_legal_identities
        FOR EACH STATEMENT EXECUTE FUNCTION seller_public_legal_identity_event_append_only();
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_seller_public_legal_identity_events_append_only'
           AND tgrelid = 'seller_public_legal_identity_events'::regclass
    ) THEN
        CREATE TRIGGER trg_seller_public_legal_identity_events_append_only
        BEFORE UPDATE OR DELETE ON seller_public_legal_identity_events
        FOR EACH ROW EXECUTE FUNCTION seller_public_legal_identity_event_append_only();
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_seller_public_legal_identity_events_no_truncate'
           AND tgrelid = 'seller_public_legal_identity_events'::regclass
    ) THEN
        CREATE TRIGGER trg_seller_public_legal_identity_events_no_truncate
        BEFORE TRUNCATE ON seller_public_legal_identity_events
        FOR EACH STATEMENT EXECUTE FUNCTION seller_public_legal_identity_event_append_only();
    END IF;
END;
$$;

COMMIT;
