BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Additive Wave 1 foundation. No existing commerce table or business row is changed.
-- IDs are supplied by the server; no extension, remote service or tenant migration.

CREATE TABLE themes (
    id UUID PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE theme_versions (
    id UUID PRIMARY KEY,
    theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE RESTRICT,
    version TEXT NOT NULL CHECK (char_length(btrim(version)) BETWEEN 1 AND 80),
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object' AND octet_length(document::text) <= 4194304),
    digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (theme_id, version)
);

CREATE TABLE seller_theme_services (
    id UUID PRIMARY KEY,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    external_binding_id UUID,
    plan TEXT NOT NULL CHECK (plan ~ '^[a-z][a-z0-9_-]{0,63}$'),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    policy_revision INTEGER NOT NULL DEFAULT 1 CHECK (policy_revision > 0),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, store_id),
    UNIQUE (id, organization_id, store_id),
    FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (external_binding_id, organization_id, store_id)
        REFERENCES stocky_connector_connections(id, organization_id, store_id) ON DELETE RESTRICT,
    CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE TABLE theme_assignments (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    theme_version_id UUID NOT NULL REFERENCES theme_versions(id) ON DELETE RESTRICT,
    channel TEXT NOT NULL CHECK (channel IN ('web', 'app')),
    status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'ACCEPTED', 'WITHDRAWN')),
    accepted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, service_id, organization_id, store_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    CHECK ((status = 'ASSIGNED' AND accepted_at IS NULL AND withdrawn_at IS NULL)
        OR (status = 'ACCEPTED' AND accepted_at IS NOT NULL AND withdrawn_at IS NULL)
        OR (status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_theme_assignments_active_channel
    ON theme_assignments(service_id, channel) WHERE status <> 'WITHDRAWN';

CREATE TABLE theme_drafts (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    assignment_id UUID NOT NULL UNIQUE,
    overrides JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(overrides) = 'object' AND octet_length(overrides::text) <= 1048576),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, service_id, organization_id, store_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (assignment_id, service_id, organization_id, store_id)
        REFERENCES theme_assignments(id, service_id, organization_id, store_id) ON DELETE RESTRICT
);

CREATE TABLE theme_draft_revisions (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    draft_id UUID NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    overrides JSONB NOT NULL CHECK (jsonb_typeof(overrides) = 'object' AND octet_length(overrides::text) <= 1048576),
    digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (draft_id, revision),
    UNIQUE (draft_id, revision, service_id, organization_id, store_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (draft_id, service_id, organization_id, store_id)
        REFERENCES theme_drafts(id, service_id, organization_id, store_id) ON DELETE RESTRICT
);

CREATE TABLE feature_catalog (
    code TEXT PRIMARY KEY CHECK (code ~ '^theme\.[a-z][a-z0-9_]{0,79}$'),
    kind TEXT NOT NULL CHECK (kind IN ('boolean', 'quota')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE plan_feature_defaults (
    plan TEXT NOT NULL CHECK (plan ~ '^[a-z][a-z0-9_-]{0,63}$'),
    feature_code TEXT NOT NULL REFERENCES feature_catalog(code) ON DELETE RESTRICT,
    effect TEXT NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
    quota BIGINT CHECK (quota IS NULL OR quota >= 0),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (plan, feature_code)
);

CREATE TABLE seller_feature_entitlements (
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    feature_code TEXT NOT NULL REFERENCES feature_catalog(code) ON DELETE RESTRICT,
    effect TEXT NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
    quota BIGINT CHECK (quota IS NULL OR quota >= 0),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (service_id, organization_id, store_id, feature_code),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE TABLE theme_assets (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    detected_mime TEXT NOT NULL CHECK (detected_mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
    byte_size BIGINT NOT NULL CHECK (byte_size BETWEEN 1 AND 52428800),
    digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 1 AND 512),
    status TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK (status IN ('QUARANTINED', 'READY', 'REJECTED')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, service_id, organization_id, store_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT
);

CREATE TABLE theme_operations (
    id UUID PRIMARY KEY,
    service_id UUID,
    organization_id BIGINT,
    store_id BIGINT,
    scope_key TEXT NOT NULL,
    actor_id TEXT NOT NULL CHECK (char_length(btrim(actor_id)) BETWEEN 1 AND 160),
    type TEXT NOT NULL CHECK (char_length(btrim(type)) BETWEEN 1 AND 100),
    status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'REQUESTED', 'BLOCKED')),
    idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
    result JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 4194304),
    failure_reason TEXT CHECK (failure_reason IS NULL OR char_length(failure_reason) BETWEEN 1 AND 240),
    correlation_id UUID NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scope_key, actor_id, idempotency_key),
    UNIQUE (id, service_id, organization_id, store_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) MATCH FULL ON DELETE RESTRICT,
    CHECK ((service_id IS NULL AND organization_id IS NULL AND store_id IS NULL AND scope_key = 'global')
        OR (service_id IS NOT NULL AND organization_id IS NOT NULL AND store_id IS NOT NULL AND scope_key = service_id::text))
);

CREATE TABLE theme_previews (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    draft_id UUID NOT NULL,
    draft_revision INTEGER NOT NULL CHECK (draft_revision > 0),
    artifact JSONB NOT NULL CHECK (jsonb_typeof(artifact) = 'object' AND octet_length(artifact::text) <= 4194304),
    digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'REVOKED')),
    expires_at TIMESTAMPTZ NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, service_id, organization_id, store_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (draft_id, draft_revision, service_id, organization_id, store_id)
        REFERENCES theme_draft_revisions(draft_id, revision, service_id, organization_id, store_id) ON DELETE RESTRICT,
    CHECK (expires_at > created_at)
);

CREATE TABLE theme_publications (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    draft_id UUID NOT NULL,
    draft_revision INTEGER NOT NULL CHECK (draft_revision > 0),
    operation_id UUID NOT NULL UNIQUE,
    artifact JSONB NOT NULL CHECK (jsonb_typeof(artifact) = 'object' AND octet_length(artifact::text) <= 4194304),
    digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    policy_revision INTEGER NOT NULL CHECK (policy_revision > 0),
    status TEXT NOT NULL DEFAULT 'PUBLICATION_REQUESTED' CHECK (status IN ('PUBLICATION_REQUESTED', 'BLOCKED')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, service_id, organization_id, store_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (draft_id, draft_revision, service_id, organization_id, store_id)
        REFERENCES theme_draft_revisions(draft_id, revision, service_id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (operation_id, service_id, organization_id, store_id)
        REFERENCES theme_operations(id, service_id, organization_id, store_id) ON DELETE RESTRICT
);

CREATE TABLE theme_deployments (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    publication_id UUID NOT NULL,
    operation_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'BLOCKED')),
    digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, service_id, organization_id, store_id),
    UNIQUE (publication_id, operation_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (publication_id, service_id, organization_id, store_id)
        REFERENCES theme_publications(id, service_id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (operation_id, service_id, organization_id, store_id)
        REFERENCES theme_operations(id, service_id, organization_id, store_id) ON DELETE RESTRICT
);

CREATE TABLE theme_outbox (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    operation_id UUID NOT NULL,
    event_type TEXT NOT NULL CHECK (char_length(btrim(event_type)) BETWEEN 1 AND 120),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 1048576),
    payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'DEAD')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (operation_id, event_type),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (operation_id, service_id, organization_id, store_id)
        REFERENCES theme_operations(id, service_id, organization_id, store_id) ON DELETE RESTRICT
);

CREATE TABLE theme_inbox (
    id UUID PRIMARY KEY,
    service_id UUID NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    source TEXT NOT NULL CHECK (source ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
    event_id UUID NOT NULL,
    payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED')),
    receipt JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(receipt) = 'object' AND octet_length(receipt::text) <= 65536),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, event_id),
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) ON DELETE RESTRICT,
    CHECK ((status = 'RECEIVED' AND processed_at IS NULL)
        OR (status = 'PROCESSED' AND processed_at IS NOT NULL AND processed_at >= received_at))
);

CREATE TABLE theme_audit_events (
    id UUID PRIMARY KEY,
    service_id UUID,
    organization_id BIGINT,
    store_id BIGINT,
    actor_id TEXT NOT NULL CHECK (char_length(btrim(actor_id)) BETWEEN 1 AND 160),
    effective_actor TEXT NOT NULL CHECK (char_length(btrim(effective_actor)) BETWEEN 1 AND 160),
    action TEXT NOT NULL CHECK (char_length(btrim(action)) BETWEEN 1 AND 100),
    target_type TEXT NOT NULL CHECK (char_length(btrim(target_type)) BETWEEN 1 AND 100),
    target_id TEXT NOT NULL CHECK (char_length(btrim(target_id)) BETWEEN 1 AND 160),
    before_state JSONB CHECK (before_state IS NULL OR (jsonb_typeof(before_state) = 'object' AND octet_length(before_state::text) <= 65536)),
    after_state JSONB CHECK (after_state IS NULL OR (jsonb_typeof(after_state) = 'object' AND octet_length(after_state::text) <= 65536)),
    correlation_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id, organization_id, store_id)
        REFERENCES seller_theme_services(id, organization_id, store_id) MATCH FULL ON DELETE RESTRICT,
    CHECK ((service_id IS NULL AND organization_id IS NULL AND store_id IS NULL)
        OR (service_id IS NOT NULL AND organization_id IS NOT NULL AND store_id IS NOT NULL))
);

CREATE TABLE theme_admin_roles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'theme_admin', 'support')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE theme_seller_roles (
    organization_id BIGINT NOT NULL,
    membership_id BIGINT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('seller_owner', 'seller_admin', 'seller_editor', 'seller_viewer')),
    publish_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, membership_id),
    FOREIGN KEY (organization_id, membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CHECK (role <> 'seller_viewer' OR NOT publish_allowed)
);

-- Catalog defaults grant no real account a role or theme service.
INSERT INTO feature_catalog(code, kind, enabled) VALUES
    ('theme.editor', 'boolean', TRUE),
    ('theme.publish', 'boolean', TRUE),
    ('theme.asset_bytes', 'quota', TRUE),
    ('theme.mobile_customization', 'boolean', TRUE),
    ('theme.advanced_blocks', 'boolean', TRUE),
    ('theme.custom_header', 'boolean', TRUE),
    ('theme.collaboration', 'boolean', TRUE),
    ('theme.custom_css', 'boolean', FALSE),
    ('theme.ai_builder', 'boolean', FALSE);

INSERT INTO plan_feature_defaults(plan, feature_code, effect, quota)
SELECT plans.plan, features.code,
    CASE WHEN NOT features.enabled THEN 'DENY'
         WHEN features.code IN ('theme.editor', 'theme.asset_bytes') THEN 'ALLOW'
         WHEN plans.plan = 'pro' THEN 'ALLOW'
         ELSE 'DENY' END,
    CASE WHEN features.code = 'theme.asset_bytes' THEN
        CASE WHEN plans.plan = 'pro' THEN 52428800::BIGINT ELSE 5242880::BIGINT END
        ELSE NULL END
FROM (VALUES ('basic'), ('pro')) AS plans(plan)
CROSS JOIN feature_catalog features;

-- Historical evidence and published base documents cannot be edited or removed.
CREATE FUNCTION theme_platform_prevent_history_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'THEME_HISTORY_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION theme_platform_guard_published_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'THEME_VERSION_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.theme_id IS DISTINCT FROM OLD.theme_id
       OR NEW.version IS DISTINCT FROM OLD.version THEN
        RAISE EXCEPTION 'THEME_VERSION_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER theme_versions_immutable_published
    BEFORE UPDATE OR DELETE ON theme_versions FOR EACH ROW
    EXECUTE FUNCTION theme_platform_guard_published_version();
CREATE TRIGGER theme_versions_no_truncate
    BEFORE TRUNCATE ON theme_versions FOR EACH STATEMENT
    EXECUTE FUNCTION theme_platform_prevent_history_mutation();
CREATE TRIGGER theme_draft_revisions_append_only
    BEFORE UPDATE OR DELETE ON theme_draft_revisions FOR EACH ROW
    EXECUTE FUNCTION theme_platform_prevent_history_mutation();
CREATE TRIGGER theme_draft_revisions_no_truncate
    BEFORE TRUNCATE ON theme_draft_revisions FOR EACH STATEMENT
    EXECUTE FUNCTION theme_platform_prevent_history_mutation();
CREATE TRIGGER theme_audit_events_append_only
    BEFORE UPDATE OR DELETE ON theme_audit_events FOR EACH ROW
    EXECUTE FUNCTION theme_platform_prevent_history_mutation();
CREATE TRIGGER theme_audit_events_no_truncate
    BEFORE TRUNCATE ON theme_audit_events FOR EACH STATEMENT
    EXECUTE FUNCTION theme_platform_prevent_history_mutation();

CREATE FUNCTION theme_platform_guard_assignment_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM theme_versions WHERE id = NEW.theme_version_id AND status = 'PUBLISHED') THEN
        RAISE EXCEPTION 'THEME_ASSIGNMENT_REQUIRES_PUBLISHED_VERSION' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.theme_version_id IS DISTINCT FROM OLD.theme_version_id
        OR NEW.channel IS DISTINCT FROM OLD.channel) THEN
        RAISE EXCEPTION 'THEME_ASSIGNMENT_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'WITHDRAWN' AND NEW.status <> 'WITHDRAWN' THEN
        RAISE EXCEPTION 'THEME_ASSIGNMENT_WITHDRAWAL_FINAL' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER theme_assignments_published_version
    BEFORE INSERT OR UPDATE ON theme_assignments FOR EACH ROW
    EXECUTE FUNCTION theme_platform_guard_assignment_version();

-- Nullable global operation/audit scope must stay global; scoped rows cannot be
-- transferred to another tenant, store, service or resource identity after insert.
CREATE FUNCTION theme_platform_guard_scope_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    old_row JSONB := to_jsonb(OLD);
    new_row JSONB := to_jsonb(NEW);
    field_name TEXT;
BEGIN
    FOREACH field_name IN ARRAY ARRAY['id', 'service_id', 'organization_id', 'store_id',
        'assignment_id', 'draft_id', 'draft_revision', 'publication_id', 'operation_id',
        'scope_key', 'actor_id', 'idempotency_key', 'request_hash', 'type', 'source', 'event_id']
    LOOP
        IF old_row ? field_name AND old_row -> field_name IS DISTINCT FROM new_row -> field_name THEN
            RAISE EXCEPTION 'THEME_SCOPE_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['seller_theme_services', 'theme_assignments',
        'theme_drafts', 'seller_feature_entitlements', 'theme_assets', 'theme_operations',
        'theme_previews', 'theme_publications', 'theme_deployments', 'theme_outbox', 'theme_inbox']
    LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION theme_platform_guard_scope_identity()',
            table_name || '_scope_identity', table_name);
    END LOOP;
END;
$$;

-- Retry and delivery state can evolve, but a persisted artifact or logical event
-- must retain the content and digest that were originally accepted together.
CREATE FUNCTION theme_platform_guard_artifact_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    old_row JSONB := to_jsonb(OLD);
    new_row JSONB := to_jsonb(NEW);
    protected_fields TEXT[];
    field_name TEXT;
BEGIN
    CASE TG_TABLE_NAME
        WHEN 'theme_previews' THEN protected_fields := ARRAY['artifact', 'digest'];
        WHEN 'theme_publications' THEN protected_fields := ARRAY['artifact', 'digest', 'policy_revision'];
        WHEN 'theme_outbox' THEN protected_fields := ARRAY['payload', 'payload_hash', 'event_type'];
        WHEN 'theme_inbox' THEN protected_fields := ARRAY['payload_hash'];
        ELSE RAISE EXCEPTION 'THEME_ARTIFACT_GUARD_UNKNOWN_TABLE' USING ERRCODE = '55000';
    END CASE;
    FOREACH field_name IN ARRAY protected_fields
    LOOP
        IF old_row -> field_name IS DISTINCT FROM new_row -> field_name THEN
            RAISE EXCEPTION 'THEME_ARTIFACT_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER theme_previews_artifact_identity
    BEFORE UPDATE ON theme_previews FOR EACH ROW
    EXECUTE FUNCTION theme_platform_guard_artifact_identity();
CREATE TRIGGER theme_publications_artifact_identity
    BEFORE UPDATE ON theme_publications FOR EACH ROW
    EXECUTE FUNCTION theme_platform_guard_artifact_identity();
CREATE TRIGGER theme_outbox_artifact_identity
    BEFORE UPDATE ON theme_outbox FOR EACH ROW
    EXECUTE FUNCTION theme_platform_guard_artifact_identity();
CREATE TRIGGER theme_inbox_artifact_identity
    BEFORE UPDATE ON theme_inbox FOR EACH ROW
    EXECUTE FUNCTION theme_platform_guard_artifact_identity();

CREATE INDEX idx_theme_versions_catalog ON theme_versions(theme_id, status, created_at DESC);
CREATE INDEX idx_seller_theme_services_status ON seller_theme_services(status, expires_at, id);
CREATE INDEX idx_theme_assignments_scope_status ON theme_assignments(organization_id, store_id, status, id);
CREATE INDEX idx_theme_drafts_scope ON theme_drafts(organization_id, store_id, id);
CREATE INDEX idx_theme_draft_revisions_scope ON theme_draft_revisions(service_id, draft_id, revision DESC);
CREATE INDEX idx_theme_entitlements_effective ON seller_feature_entitlements(service_id, starts_at, expires_at);
CREATE INDEX idx_theme_assets_scope_status ON theme_assets(service_id, status, id);
CREATE INDEX idx_theme_previews_scope_expiry ON theme_previews(service_id, status, expires_at, id);
CREATE INDEX idx_theme_publications_scope ON theme_publications(service_id, created_at DESC, id);
CREATE INDEX idx_theme_deployments_scope ON theme_deployments(service_id, created_at DESC, id);
CREATE INDEX idx_theme_operations_scope_created ON theme_operations(service_id, created_at DESC, id);
CREATE INDEX idx_theme_outbox_retry ON theme_outbox(next_attempt_at, id) WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX idx_theme_outbox_scope ON theme_outbox(service_id, created_at DESC, id);
CREATE INDEX idx_theme_inbox_scope ON theme_inbox(service_id, received_at DESC, id);
CREATE INDEX idx_theme_audit_events_scope ON theme_audit_events(service_id, created_at DESC, id);
CREATE INDEX idx_theme_audit_events_correlation ON theme_audit_events(correlation_id);

COMMIT;
