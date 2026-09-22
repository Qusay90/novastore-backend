BEGIN;

-- No automatic enrollment: an operator must explicitly audit the human binding.
CREATE TABLE theme_seller_bridge_mappings (
    id UUID PRIMARY KEY,
    connection_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    stocky_user_id BIGINT NOT NULL CHECK (stocky_user_id > 0),
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    membership_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    approved_by_user_id BIGINT NOT NULL REFERENCES users(id),
    approval_reason VARCHAR(240) NOT NULL CHECK (length(trim(approval_reason)) >= 8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    FOREIGN KEY (connection_id, organization_id, store_id)
        REFERENCES stocky_connector_connections(id, organization_id, store_id),
    FOREIGN KEY (organization_id, membership_id, user_id)
        REFERENCES seller_memberships(organization_id, id, user_id),
    UNIQUE (connection_id, tenant_id, stocky_user_id),
    CHECK ((active AND revoked_at IS NULL) OR (NOT active AND revoked_at IS NOT NULL))
);

CREATE TABLE theme_seller_bridge_sessions (
    id UUID PRIMARY KEY,
    mapping_id UUID NOT NULL REFERENCES theme_seller_bridge_mappings(id),
    session_hash CHAR(64) NOT NULL CHECK (session_hash ~ '^[0-9a-f]{64}$'),
    mapping_revision BIGINT NOT NULL CHECK (mapping_revision > 0),
    membership_revision BIGINT NOT NULL CHECK (membership_revision > 0),
    security_stamp UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (mapping_id, session_hash)
);

CREATE TABLE theme_seller_bridge_requests (
    connection_id UUID NOT NULL REFERENCES stocky_connector_connections(id),
    nonce VARCHAR(64) NOT NULL CHECK (nonce ~ '^[A-Za-z0-9_-]{24,64}$'),
    request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (connection_id, nonce)
);

CREATE TABLE theme_seller_bridge_audit (
    id BIGSERIAL PRIMARY KEY,
    mapping_id UUID NOT NULL REFERENCES theme_seller_bridge_mappings(id),
    session_id UUID REFERENCES theme_seller_bridge_sessions(id),
    event VARCHAR(32) NOT NULL CHECK (event IN ('SESSION_OPENED', 'SESSION_REVOKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE FUNCTION theme_seller_bridge_mapping_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.connection_id IS DISTINCT FROM OLD.connection_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.stocky_user_id IS DISTINCT FROM OLD.stocky_user_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
      OR NEW.approval_reason IS DISTINCT FROM OLD.approval_reason OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR OLD.active <> TRUE OR NEW.active <> FALSE OR NEW.revoked_at IS NULL OR NEW.revision <> OLD.revision + 1 THEN
        RAISE EXCEPTION 'THEME_BRIDGE_MAPPING_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER theme_seller_bridge_mapping_immutable BEFORE UPDATE OR DELETE ON theme_seller_bridge_mappings
    FOR EACH ROW EXECUTE FUNCTION theme_seller_bridge_mapping_guard();
COMMIT;
