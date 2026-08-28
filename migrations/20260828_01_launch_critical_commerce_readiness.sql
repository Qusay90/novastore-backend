BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS business_identity_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

UPDATE orders
SET delivered_at = updated_at
WHERE status = 'Teslim Edildi'
  AND delivered_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_orders_business_identity_snapshot_object'
          AND conrelid = 'orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT chk_orders_business_identity_snapshot_object
            CHECK (
                business_identity_snapshot IS NULL
                OR jsonb_typeof(business_identity_snapshot) = 'object'
            );
    END IF;
END;
$$;

ALTER TABLE returns
    ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS decision_note VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS decided_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_returns_launch_v1_status'
          AND conrelid = 'returns'::regclass
    ) THEN
        ALTER TABLE returns
            ADD CONSTRAINT chk_returns_launch_v1_status
            CHECK (status IN ('REQUESTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_returns_revision_positive'
          AND conrelid = 'returns'::regclass
    ) THEN
        ALTER TABLE returns
            ADD CONSTRAINT chk_returns_revision_positive CHECK (revision >= 1);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_one_active_per_order
    ON returns (order_id)
    WHERE status IN ('REQUESTED', 'IN_REVIEW', 'APPROVED');

CREATE TABLE IF NOT EXISTS return_events (
    id BIGSERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE RESTRICT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(24) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    from_status VARCHAR(40),
    to_status VARCHAR(40) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_return_events_actor_role
        CHECK (actor_role IN ('customer', 'admin', 'system')),
    CONSTRAINT chk_return_events_event_type CHECK (BTRIM(event_type) <> ''),
    CONSTRAINT chk_return_events_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_return_events_return_created_id
    ON return_events (return_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_return_events_order_created_id
    ON return_events (order_id, created_at, id);

CREATE TABLE IF NOT EXISTS coupon_reservations (
    id BIGSERIAL PRIMARY KEY,
    coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(40) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    release_reason VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_coupon_reservations_order UNIQUE (order_id),
    CONSTRAINT uq_coupon_reservations_coupon_order UNIQUE (coupon_id, order_id),
    CONSTRAINT chk_coupon_reservations_status CHECK (
        status IN ('RESERVED', 'CONSUMED', 'RELEASED', 'RECONCILIATION_REQUIRED')
    ),
    CONSTRAINT chk_coupon_reservations_terminal_times CHECK (
        (status <> 'CONSUMED' OR consumed_at IS NOT NULL)
        AND (status <> 'RELEASED' OR released_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_coupon_reservations_active
    ON coupon_reservations (coupon_id, expires_at, id)
    WHERE status = 'RESERVED';

CREATE OR REPLACE FUNCTION prevent_return_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'RETURN_EVENT_APPEND_ONLY';
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_return_events_append_only'
          AND tgrelid = 'return_events'::regclass
    ) THEN
        CREATE TRIGGER trg_return_events_append_only
            BEFORE UPDATE OR DELETE ON return_events
            FOR EACH ROW EXECUTE FUNCTION prevent_return_event_mutation();
    END IF;
END;
$$;

ALTER TABLE seller_order_items
    ADD COLUMN IF NOT EXISTS source_item_index INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_seller_order_items_source_index'
          AND conrelid = 'seller_order_items'::regclass
    ) THEN
        ALTER TABLE seller_order_items
            ADD CONSTRAINT chk_seller_order_items_source_index
            CHECK (source_item_index IS NULL OR source_item_index >= 0);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_order_items_source_index
    ON seller_order_items (organization_id, seller_order_id, source_item_index)
    WHERE source_item_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_orders_canonical_order
    ON seller_orders (canonical_order_id, organization_id, store_id);

COMMIT;
