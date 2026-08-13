BEGIN;

ALTER TABLE coupons
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_coupons_revision_positive'
          AND conrelid = 'coupons'::regclass
    ) THEN
        ALTER TABLE coupons
            ADD CONSTRAINT chk_coupons_revision_positive CHECK (revision >= 1) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_coupons_discount_value_positive'
          AND conrelid = 'coupons'::regclass
    ) THEN
        ALTER TABLE coupons
            ADD CONSTRAINT chk_coupons_discount_value_positive
            CHECK (discount_value > 0 AND (UPPER(discount_type) <> 'PERCENT' OR discount_value <= 100))
            NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_coupons_amount_bounds'
          AND conrelid = 'coupons'::regclass
    ) THEN
        ALTER TABLE coupons
            ADD CONSTRAINT chk_coupons_amount_bounds
            CHECK (min_order_amount >= 0 AND (max_discount_amount IS NULL OR max_discount_amount > 0))
            NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_coupons_usage_bounds'
          AND conrelid = 'coupons'::regclass
    ) THEN
        ALTER TABLE coupons
            ADD CONSTRAINT chk_coupons_usage_bounds
            CHECK (
                used_count >= 0
                AND (usage_limit IS NULL OR usage_limit >= 1)
                AND (usage_limit IS NULL OR used_count <= usage_limit)
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_coupons_date_range'
          AND conrelid = 'coupons'::regclass
    ) THEN
        ALTER TABLE coupons
            ADD CONSTRAINT chk_coupons_date_range
            CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
            NOT VALID;
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM coupons
        WHERE revision < 1
           OR discount_value <= 0
           OR (UPPER(discount_type) = 'PERCENT' AND discount_value > 100)
           OR min_order_amount < 0
           OR (max_discount_amount IS NOT NULL AND max_discount_amount <= 0)
           OR used_count < 0
           OR (usage_limit IS NOT NULL AND (usage_limit < 1 OR used_count > usage_limit))
           OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at >= ends_at)
    ) THEN
        RAISE EXCEPTION 'coupons contains legacy rows outside the Main 6S operational bounds; correct them before applying coupon constraints'
            USING ERRCODE = '23514';
    END IF;
END;
$$;

ALTER TABLE coupons VALIDATE CONSTRAINT chk_coupons_revision_positive;
ALTER TABLE coupons VALIDATE CONSTRAINT chk_coupons_discount_value_positive;
ALTER TABLE coupons VALIDATE CONSTRAINT chk_coupons_amount_bounds;
ALTER TABLE coupons VALIDATE CONSTRAINT chk_coupons_usage_bounds;
ALTER TABLE coupons VALIDATE CONSTRAINT chk_coupons_date_range;

CREATE TABLE IF NOT EXISTS admin_coupon_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role VARCHAR(20) NOT NULL,
    coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL,
    expected_revision BIGINT,
    result_revision BIGINT NOT NULL,
    changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    request_id VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_admin_coupon_audit_actor_role CHECK (actor_role = 'admin'),
    CONSTRAINT chk_admin_coupon_audit_action CHECK (action IN ('create', 'update', 'activate', 'deactivate')),
    CONSTRAINT chk_admin_coupon_audit_revision CHECK (
        result_revision >= 1
        AND (expected_revision IS NULL OR expected_revision >= 1)
        AND (
            (action = 'create' AND expected_revision IS NULL AND result_revision = 1)
            OR (action <> 'create' AND expected_revision IS NOT NULL AND result_revision = expected_revision + 1)
        )
    ),
    CONSTRAINT chk_admin_coupon_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_admin_coupon_audit_coupon
    ON admin_coupon_audit_events(coupon_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_admin_coupon_audit_actor
    ON admin_coupon_audit_events(actor_user_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION reject_admin_coupon_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'admin_coupon_audit_events is append-only'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_coupon_audit_append_only
    ON admin_coupon_audit_events;

CREATE TRIGGER trg_admin_coupon_audit_append_only
    BEFORE UPDATE OR DELETE ON admin_coupon_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION reject_admin_coupon_audit_mutation();

CREATE OR REPLACE FUNCTION reject_coupon_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'coupons cannot be hard deleted; deactivate instead'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_coupons_reject_hard_delete ON coupons;

CREATE TRIGGER trg_coupons_reject_hard_delete
    BEFORE DELETE ON coupons
    FOR EACH ROW
    EXECUTE FUNCTION reject_coupon_hard_delete();

COMMIT;
