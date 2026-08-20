BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_organizations (
    id BIGSERIAL NOT NULL,
    external_key UUID NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    suspended_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    CONSTRAINT pk_seller_organizations PRIMARY KEY (id),
    CONSTRAINT uq_seller_organizations_external_key UNIQUE (external_key),
    CONSTRAINT chk_seller_organizations_display_name_nonblank
        CHECK (BTRIM(display_name) <> ''),
    CONSTRAINT chk_seller_organizations_status
        CHECK (status IN ('active', 'suspended', 'closed')),
    CONSTRAINT chk_seller_organizations_revision_positive
        CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_seller_organizations_status_id
    ON seller_organizations (status, id);

CREATE TABLE IF NOT EXISTS seller_roles (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    role_kind VARCHAR(16) NOT NULL,
    is_assignable BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_roles PRIMARY KEY (id),
    CONSTRAINT uq_seller_roles_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT chk_seller_roles_code_nonblank CHECK (BTRIM(code) <> ''),
    CONSTRAINT chk_seller_roles_name_nonblank CHECK (BTRIM(name) <> ''),
    CONSTRAINT chk_seller_roles_kind_scope CHECK (
        (role_kind = 'system' AND organization_id IS NULL)
        OR (role_kind = 'organization' AND organization_id IS NOT NULL)
    ),
    CONSTRAINT chk_seller_roles_revision_positive CHECK (revision >= 1),
    CONSTRAINT chk_seller_roles_owner_not_assignable CHECK (
        NOT (role_kind = 'system' AND LOWER(code) = 'owner' AND is_assignable)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_roles_system_code
    ON seller_roles (LOWER(code))
    WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_roles_organization_code
    ON seller_roles (organization_id, LOWER(code))
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_roles_organization_active_id
    ON seller_roles (organization_id, is_active, id)
    WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS seller_permissions (
    code VARCHAR(100) NOT NULL,
    domain VARCHAR(80) NOT NULL,
    description VARCHAR(240) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_permissions PRIMARY KEY (code),
    CONSTRAINT chk_seller_permissions_code_nonblank CHECK (BTRIM(code) <> ''),
    CONSTRAINT chk_seller_permissions_domain_nonblank CHECK (BTRIM(domain) <> '')
);

CREATE INDEX IF NOT EXISTS idx_seller_permissions_active_code
    ON seller_permissions (is_active, code);

CREATE TABLE IF NOT EXISTS seller_role_permissions (
    role_id BIGINT NOT NULL REFERENCES seller_roles(id) ON DELETE RESTRICT,
    permission_code VARCHAR(100) NOT NULL REFERENCES seller_permissions(code) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_role_permissions PRIMARY KEY (role_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_seller_role_permissions_permission_role
    ON seller_role_permissions (permission_code, role_id);

CREATE TABLE IF NOT EXISTS seller_memberships (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_id BIGINT NOT NULL REFERENCES seller_roles(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    security_stamp UUID NOT NULL,
    membership_revision BIGINT NOT NULL DEFAULT 1,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_memberships PRIMARY KEY (id),
    CONSTRAINT uq_seller_memberships_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT chk_seller_memberships_status
        CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    CONSTRAINT chk_seller_memberships_revision_positive
        CHECK (membership_revision >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_memberships_live_organization_user
    ON seller_memberships (organization_id, user_id)
    WHERE status IN ('active', 'suspended');

CREATE INDEX IF NOT EXISTS idx_seller_memberships_user_status_organization_id
    ON seller_memberships (user_id, status, organization_id, id);

CREATE INDEX IF NOT EXISTS idx_seller_memberships_organization_status_user
    ON seller_memberships (organization_id, status, user_id, id);

CREATE OR REPLACE FUNCTION seller_guard_membership_role_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    role_organization_id BIGINT;
    role_is_active BOOLEAN;
BEGIN
    SELECT organization_id, is_active
    INTO role_organization_id, role_is_active
    FROM seller_roles
    WHERE id = NEW.role_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SELLER_ROLE_NOT_FOUND' USING ERRCODE = '23503';
    END IF;

    IF role_organization_id IS NOT NULL
       AND role_organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'SELLER_ROLE_ORGANIZATION_MISMATCH' USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'active' AND NOT role_is_active THEN
        RAISE EXCEPTION 'SELLER_INACTIVE_ROLE_CANNOT_AUTHORIZE' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION seller_guard_last_active_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    old_is_owner BOOLEAN;
    new_is_owner BOOLEAN;
    active_owner_count BIGINT;
BEGIN
    SELECT LOWER(code) = 'owner'
    INTO old_is_owner
    FROM seller_roles
    WHERE id = OLD.role_id;

    SELECT LOWER(code) = 'owner'
    INTO new_is_owner
    FROM seller_roles
    WHERE id = NEW.role_id;

    IF OLD.status = 'active'
       AND COALESCE(old_is_owner, FALSE)
       AND NOT (NEW.status = 'active' AND COALESCE(new_is_owner, FALSE)) THEN
        PERFORM 1
        FROM seller_memberships membership_row
        JOIN seller_roles role_row ON role_row.id = membership_row.role_id
        WHERE membership_row.organization_id = OLD.organization_id
          AND membership_row.status = 'active'
          AND LOWER(role_row.code) = 'owner'
        FOR UPDATE;

        SELECT COUNT(*)
        INTO active_owner_count
        FROM seller_memberships membership_row
        JOIN seller_roles role_row ON role_row.id = membership_row.role_id
        WHERE membership_row.organization_id = OLD.organization_id
          AND membership_row.status = 'active'
          AND LOWER(role_row.code) = 'owner';

        IF active_owner_count <= 1 THEN
            RAISE EXCEPTION 'LAST_OWNER_REQUIRED' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION seller_prevent_membership_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SELLER_MEMBERSHIP_HARD_DELETE_FORBIDDEN' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION seller_prevent_platform_permission_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.permission_code LIKE 'platform.%' THEN
        RAISE EXCEPTION 'SELLER_PLATFORM_PERMISSION_FORBIDDEN' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_memberships_role_scope'
          AND tgrelid = 'seller_memberships'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_memberships_role_scope BEFORE INSERT OR UPDATE OF organization_id, role_id, status ON seller_memberships FOR EACH ROW EXECUTE FUNCTION seller_guard_membership_role_scope()';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_memberships_last_active_owner'
          AND tgrelid = 'seller_memberships'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_memberships_last_active_owner BEFORE UPDATE OF organization_id, role_id, status ON seller_memberships FOR EACH ROW EXECUTE FUNCTION seller_guard_last_active_owner()';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_memberships_no_hard_delete'
          AND tgrelid = 'seller_memberships'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_memberships_no_hard_delete BEFORE DELETE ON seller_memberships FOR EACH ROW EXECUTE FUNCTION seller_prevent_membership_hard_delete()';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_seller_role_permissions_no_platform'
          AND tgrelid = 'seller_role_permissions'::regclass
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_seller_role_permissions_no_platform BEFORE INSERT OR UPDATE OF permission_code ON seller_role_permissions FOR EACH ROW EXECUTE FUNCTION seller_prevent_platform_permission_grant()';
    END IF;
END;
$$;

INSERT INTO seller_permissions (code, domain, description)
VALUES
    ('organization.read', 'organization', 'Read seller organization context'),
    ('team.read', 'team', 'Read seller memberships'),
    ('team.invite', 'team', 'Create seller invitations'),
    ('team.manage', 'team', 'Manage seller team members'),
    ('team.remove', 'team', 'Revoke seller team memberships'),
    ('store.read', 'store', 'Read seller store bindings'),
    ('session.read', 'session', 'Read seller session state'),
    ('audit.read', 'audit', 'Read redacted seller audit events'),
    ('platform.catalog.manage', 'platform', 'Platform-only catalog permission')
ON CONFLICT (code) DO NOTHING;

INSERT INTO seller_roles (organization_id, code, name, role_kind, is_assignable, is_active)
SELECT NULL, seed.code, seed.name, 'system', seed.is_assignable, TRUE
FROM (
    VALUES
        ('owner', 'Owner', FALSE),
        ('manager', 'Manager', TRUE),
        ('operator', 'Operator', TRUE),
        ('viewer', 'Viewer', TRUE)
) AS seed(code, name, is_assignable)
WHERE NOT EXISTS (
    SELECT 1
    FROM seller_roles existing_role
    WHERE existing_role.organization_id IS NULL
      AND LOWER(existing_role.code) = seed.code
);

INSERT INTO seller_role_permissions (role_id, permission_code)
SELECT role_row.id, seed.permission_code
FROM (
    VALUES
        ('owner', 'organization.read'),
        ('owner', 'team.read'),
        ('owner', 'team.invite'),
        ('owner', 'team.manage'),
        ('owner', 'team.remove'),
        ('owner', 'store.read'),
        ('owner', 'session.read'),
        ('owner', 'audit.read'),
        ('manager', 'organization.read'),
        ('manager', 'team.read'),
        ('manager', 'team.invite'),
        ('manager', 'team.manage'),
        ('manager', 'store.read'),
        ('manager', 'session.read'),
        ('manager', 'audit.read'),
        ('operator', 'organization.read'),
        ('operator', 'team.read'),
        ('operator', 'store.read'),
        ('viewer', 'organization.read'),
        ('viewer', 'team.read'),
        ('viewer', 'store.read')
) AS seed(role_code, permission_code)
JOIN seller_roles role_row
    ON role_row.organization_id IS NULL
   AND LOWER(role_row.code) = seed.role_code
ON CONFLICT (role_id, permission_code) DO NOTHING;

COMMIT;
