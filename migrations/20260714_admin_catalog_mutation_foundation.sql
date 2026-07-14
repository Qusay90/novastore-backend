ALTER TABLE products ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE attribute_definitions ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE attribute_options ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE attribute_templates ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

DO $$
DECLARE
    target_table TEXT;
    constraint_name TEXT;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'products', 'categories', 'attribute_definitions', 'attribute_options',
        'attribute_templates', 'collections', 'menus', 'menu_items'
    ] LOOP
        constraint_name := 'chk_' || target_table || '_revision_positive';
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = constraint_name
              AND conrelid = to_regclass(target_table)
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I CHECK (revision >= 1)',
                target_table,
                constraint_name
            );
        END IF;
    END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS admin_catalog_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_key VARCHAR(160) NOT NULL,
    action VARCHAR(40) NOT NULL,
    expected_revision BIGINT,
    result_revision BIGINT NOT NULL,
    changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    request_id VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_admin_catalog_audit_actor_role CHECK (actor_role = 'admin'),
    CONSTRAINT chk_admin_catalog_audit_entity_type CHECK (entity_type IN (
        'product', 'category', 'attribute', 'attribute_option', 'attribute_template',
        'template_attribute', 'collection', 'collection_product', 'menu', 'menu_item'
    )),
    CONSTRAINT chk_admin_catalog_audit_action CHECK (action IN (
        'create', 'update', 'archive', 'restore', 'link', 'unlink', 'move', 'reorder'
    )),
    CONSTRAINT chk_admin_catalog_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT chk_admin_catalog_audit_expected_revision CHECK (
        expected_revision IS NULL OR expected_revision >= 1
    ),
    CONSTRAINT chk_admin_catalog_audit_expected_by_action CHECK (
        (action = 'create' AND expected_revision IS NULL)
        OR (action <> 'create' AND expected_revision IS NOT NULL)
    ),
    CONSTRAINT chk_admin_catalog_audit_result_revision CHECK (result_revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_admin_catalog_audit_entity
    ON admin_catalog_audit_events(entity_type, entity_key, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_catalog_audit_actor
    ON admin_catalog_audit_events(actor_user_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION reject_admin_catalog_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'admin_catalog_audit_events is append-only'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_catalog_audit_append_only
    ON admin_catalog_audit_events;

CREATE TRIGGER trg_admin_catalog_audit_append_only
    BEFORE UPDATE OR DELETE ON admin_catalog_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION reject_admin_catalog_audit_mutation();
