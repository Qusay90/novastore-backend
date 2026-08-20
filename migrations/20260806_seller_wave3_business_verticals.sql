BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS seller_store_profiles (
    store_id BIGINT NOT NULL,
    organization_id BIGINT NOT NULL,
    description VARCHAR(2000) NOT NULL DEFAULT '',
    shipping_policy VARCHAR(2000) NOT NULL DEFAULT '',
    return_policy VARCHAR(2000) NOT NULL DEFAULT '',
    operational_status VARCHAR(24) NOT NULL DEFAULT 'open',
    verified_contact_visibility BOOLEAN NOT NULL DEFAULT FALSE,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_store_profiles PRIMARY KEY (store_id),
    CONSTRAINT fk_seller_store_profiles_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_store_profiles_operational_status
        CHECK (operational_status IN ('open', 'paused')),
    CONSTRAINT chk_seller_store_profiles_revision CHECK (revision >= 1)
);

CREATE TABLE IF NOT EXISTS seller_offers (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL DEFAULT 'draft',
    visibility VARCHAR(24) NOT NULL DEFAULT 'private',
    revision BIGINT NOT NULL DEFAULT 1,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_offers PRIMARY KEY (id),
    CONSTRAINT uq_seller_offers_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT fk_seller_offers_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_offers_store_product UNIQUE (organization_id, store_id, product_id),
    CONSTRAINT chk_seller_offers_status CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
    CONSTRAINT chk_seller_offers_visibility CHECK (visibility IN ('private', 'seller_visible')),
    CONSTRAINT chk_seller_offers_revision CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_seller_offers_organization_store_status_id
    ON seller_offers (organization_id, store_id, status, id);

CREATE TABLE IF NOT EXISTS seller_offer_variants (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    offer_id BIGINT NOT NULL,
    seller_sku VARCHAR(96) NOT NULL,
    price_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_offer_variants PRIMARY KEY (id),
    CONSTRAINT uq_seller_offer_variants_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT fk_seller_offer_variants_offer FOREIGN KEY (organization_id, offer_id)
        REFERENCES seller_offers(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_offer_variants_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_offer_variants_store_sku UNIQUE (organization_id, store_id, seller_sku),
    CONSTRAINT chk_seller_offer_variants_sku CHECK (BTRIM(seller_sku) <> ''),
    CONSTRAINT chk_seller_offer_variants_price CHECK (price_minor >= 0),
    CONSTRAINT chk_seller_offer_variants_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_seller_offer_variants_status CHECK (status IN ('active', 'inactive')),
    CONSTRAINT chk_seller_offer_variants_revision CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_seller_offer_variants_organization_store_offer_id
    ON seller_offer_variants (organization_id, store_id, offer_id, id);

CREATE TABLE IF NOT EXISTS seller_inventory_items (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    variant_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 0,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_inventory_items PRIMARY KEY (id),
    CONSTRAINT uq_seller_inventory_items_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT fk_seller_inventory_items_variant FOREIGN KEY (organization_id, variant_id)
        REFERENCES seller_offer_variants(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_inventory_items_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_inventory_items_variant UNIQUE (organization_id, variant_id),
    CONSTRAINT chk_seller_inventory_items_quantity CHECK (quantity >= 0),
    CONSTRAINT chk_seller_inventory_items_threshold CHECK (low_stock_threshold >= 0),
    CONSTRAINT chk_seller_inventory_items_revision CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_seller_inventory_items_organization_store_quantity_id
    ON seller_inventory_items (organization_id, store_id, quantity, id);

CREATE TABLE IF NOT EXISTS seller_inventory_movements (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    inventory_item_id BIGINT NOT NULL,
    delta INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    reason_code VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_inventory_movements PRIMARY KEY (id),
    CONSTRAINT fk_seller_inventory_movements_item FOREIGN KEY (organization_id, inventory_item_id)
        REFERENCES seller_inventory_items(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_inventory_movements_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_inventory_movements_delta CHECK (delta <> 0),
    CONSTRAINT chk_seller_inventory_movements_quantities CHECK (quantity_before >= 0 AND quantity_after >= 0),
    CONSTRAINT chk_seller_inventory_movements_reason CHECK (BTRIM(reason_code) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_inventory_movements_idempotency
    ON seller_inventory_movements (organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seller_inventory_movements_item_created_id
    ON seller_inventory_movements (organization_id, inventory_item_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS seller_mutation_receipts (
    organization_id BIGINT NOT NULL REFERENCES seller_organizations(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(160) NOT NULL,
    request_fingerprint CHAR(64) NOT NULL,
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id VARCHAR(160) NOT NULL,
    response_redacted JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_mutation_receipts PRIMARY KEY (organization_id, idempotency_key),
    CONSTRAINT chk_seller_mutation_receipts_fingerprint CHECK (request_fingerprint ~ '^[A-Fa-f0-9]{64}$'),
    CONSTRAINT chk_seller_mutation_receipts_response_object CHECK (jsonb_typeof(response_redacted) = 'object')
);

CREATE TABLE IF NOT EXISTS seller_orders (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    canonical_order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    currency CHAR(3) NOT NULL,
    gross_minor BIGINT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_orders PRIMARY KEY (id),
    CONSTRAINT uq_seller_orders_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT fk_seller_orders_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_orders_canonical_store UNIQUE (canonical_order_id, store_id),
    CONSTRAINT chk_seller_orders_status CHECK (status IN ('new', 'preparing', 'shipped', 'delivered', 'cancellation_requested', 'cancelled')),
    CONSTRAINT chk_seller_orders_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_seller_orders_gross CHECK (gross_minor >= 0),
    CONSTRAINT chk_seller_orders_revision CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_seller_orders_organization_store_status_id
    ON seller_orders (organization_id, store_id, status, id);

CREATE TABLE IF NOT EXISTS seller_order_items (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    seller_order_id BIGINT NOT NULL,
    offer_id BIGINT NOT NULL,
    variant_id BIGINT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price_minor BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_order_items PRIMARY KEY (id),
    CONSTRAINT fk_seller_order_items_order FOREIGN KEY (organization_id, seller_order_id)
        REFERENCES seller_orders(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_order_items_offer FOREIGN KEY (organization_id, offer_id)
        REFERENCES seller_offers(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_order_items_variant FOREIGN KEY (organization_id, variant_id)
        REFERENCES seller_offer_variants(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_order_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_seller_order_items_price CHECK (unit_price_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_seller_order_items_order_id
    ON seller_order_items (organization_id, seller_order_id, id);

CREATE TABLE IF NOT EXISTS seller_fulfillment_packages (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    seller_order_id BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    carrier_name VARCHAR(80),
    tracking_number VARCHAR(120),
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_fulfillment_packages PRIMARY KEY (id),
    CONSTRAINT uq_seller_fulfillment_packages_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT fk_seller_fulfillment_packages_order FOREIGN KEY (organization_id, seller_order_id)
        REFERENCES seller_orders(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_fulfillment_packages_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_fulfillment_packages_status CHECK (status IN ('pending', 'prepared', 'shipped')),
    CONSTRAINT chk_seller_fulfillment_packages_tracking CHECK (
        (status = 'shipped' AND carrier_name IS NOT NULL AND tracking_number IS NOT NULL)
        OR status <> 'shipped'
    ),
    CONSTRAINT chk_seller_fulfillment_packages_revision CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_seller_fulfillment_packages_organization_store_order
    ON seller_fulfillment_packages (organization_id, store_id, seller_order_id, id);

CREATE TABLE IF NOT EXISTS seller_order_transitions (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    seller_order_id BIGINT NOT NULL,
    package_id BIGINT,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    command VARCHAR(48) NOT NULL,
    idempotency_key VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_order_transitions PRIMARY KEY (id),
    CONSTRAINT fk_seller_order_transitions_order FOREIGN KEY (organization_id, seller_order_id)
        REFERENCES seller_orders(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_order_transitions_package FOREIGN KEY (organization_id, package_id)
        REFERENCES seller_fulfillment_packages(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_order_transitions_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_order_transitions_change CHECK (from_status <> to_status),
    CONSTRAINT chk_seller_order_transitions_command CHECK (command IN ('prepare', 'ship', 'cancel_request'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_order_transitions_idempotency
    ON seller_order_transitions (organization_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS seller_returns (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    seller_order_id BIGINT NOT NULL,
    canonical_return_id INTEGER REFERENCES returns(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'requested',
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_returns PRIMARY KEY (id),
    CONSTRAINT uq_seller_returns_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT fk_seller_returns_order FOREIGN KEY (organization_id, seller_order_id)
        REFERENCES seller_orders(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_returns_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_returns_canonical_return_store UNIQUE (canonical_return_id, store_id),
    CONSTRAINT chk_seller_returns_status CHECK (status IN ('requested', 'platform_review', 'closed')),
    CONSTRAINT chk_seller_returns_revision CHECK (revision >= 1)
);

CREATE TABLE IF NOT EXISTS seller_ledger_entries (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    seller_order_id BIGINT REFERENCES seller_orders(id) ON DELETE RESTRICT,
    entry_type VARCHAR(32) NOT NULL,
    balance_bucket VARCHAR(24) NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    source_type VARCHAR(80) NOT NULL,
    source_id VARCHAR(160) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_ledger_entries PRIMARY KEY (id),
    CONSTRAINT fk_seller_ledger_entries_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_ledger_entries_order FOREIGN KEY (organization_id, seller_order_id)
        REFERENCES seller_orders(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_ledger_entries_source UNIQUE (organization_id, source_type, source_id, entry_type),
    CONSTRAINT chk_seller_ledger_entries_type CHECK (entry_type IN ('sale', 'commission', 'refund', 'reserve', 'paid', 'adjustment')),
    CONSTRAINT chk_seller_ledger_entries_bucket CHECK (balance_bucket IN ('pending', 'available', 'reserved', 'paid')),
    CONSTRAINT chk_seller_ledger_entries_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_seller_ledger_entries_nonzero CHECK (amount_minor <> 0)
);

CREATE INDEX IF NOT EXISTS idx_seller_ledger_entries_organization_store_currency_occurred
    ON seller_ledger_entries (organization_id, store_id, currency, occurred_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS seller_settlements (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    ledger_through_id BIGINT NOT NULL,
    gross_minor BIGINT NOT NULL,
    commission_minor BIGINT NOT NULL,
    refund_minor BIGINT NOT NULL,
    net_minor BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'prepared',
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_settlements PRIMARY KEY (id),
    CONSTRAINT fk_seller_settlements_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_settlements_ledger_cursor UNIQUE (organization_id, store_id, currency, ledger_through_id),
    CONSTRAINT chk_seller_settlements_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_seller_settlements_status CHECK (status IN ('prepared', 'reviewed', 'blocked', 'superseded')),
    CONSTRAINT chk_seller_settlements_revision CHECK (revision >= 1),
    CONSTRAINT chk_seller_settlements_net CHECK (net_minor = gross_minor - commission_minor - refund_minor)
);

CREATE TABLE IF NOT EXISTS seller_support_conversations (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    category VARCHAR(48) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'open',
    subject VARCHAR(160) NOT NULL,
    internal_note TEXT,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ,
    CONSTRAINT pk_seller_support_conversations PRIMARY KEY (id),
    CONSTRAINT uq_seller_support_conversations_organization_id_id UNIQUE (organization_id, id),
    CONSTRAINT fk_seller_support_conversations_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_seller_support_conversations_category CHECK (BTRIM(category) <> ''),
    CONSTRAINT chk_seller_support_conversations_subject CHECK (BTRIM(subject) <> ''),
    CONSTRAINT chk_seller_support_conversations_status CHECK (status IN ('open', 'closed')),
    CONSTRAINT chk_seller_support_conversations_revision CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS idx_seller_support_conversations_organization_store_status_id
    ON seller_support_conversations (organization_id, store_id, status, id DESC);

CREATE TABLE IF NOT EXISTS seller_support_messages (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    conversation_id BIGINT NOT NULL,
    sender_membership_id BIGINT NOT NULL,
    body VARCHAR(2000) NOT NULL,
    client_message_id VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_support_messages PRIMARY KEY (id),
    CONSTRAINT fk_seller_support_messages_conversation FOREIGN KEY (organization_id, conversation_id)
        REFERENCES seller_support_conversations(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_support_messages_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_support_messages_membership FOREIGN KEY (organization_id, sender_membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_support_messages_client_id UNIQUE (organization_id, client_message_id),
    CONSTRAINT chk_seller_support_messages_body CHECK (BTRIM(body) <> '')
);

CREATE TABLE IF NOT EXISTS seller_support_ratings (
    id BIGSERIAL NOT NULL,
    organization_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    conversation_id BIGINT NOT NULL,
    membership_id BIGINT NOT NULL,
    score INTEGER NOT NULL,
    comment VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_seller_support_ratings PRIMARY KEY (id),
    CONSTRAINT fk_seller_support_ratings_conversation FOREIGN KEY (organization_id, conversation_id)
        REFERENCES seller_support_conversations(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_support_ratings_store FOREIGN KEY (organization_id, store_id)
        REFERENCES seller_stores(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_seller_support_ratings_membership FOREIGN KEY (organization_id, membership_id)
        REFERENCES seller_memberships(organization_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_seller_support_ratings_conversation_membership UNIQUE (conversation_id, membership_id),
    CONSTRAINT chk_seller_support_ratings_score CHECK (score BETWEEN 1 AND 5)
);

CREATE OR REPLACE FUNCTION seller_wave3_prevent_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SELLER_WAVE3_APPEND_ONLY';
END;
$$;

DO $$
DECLARE
    table_name TEXT;
    trigger_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'seller_inventory_movements',
        'seller_order_transitions',
        'seller_ledger_entries',
        'seller_mutation_receipts',
        'seller_support_messages',
        'seller_support_ratings'
    ]
    LOOP
        trigger_name := 'trg_' || table_name || '_append_only';
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = trigger_name AND tgrelid = table_name::regclass
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION seller_wave3_prevent_append_only_mutation()',
                trigger_name,
                table_name
            );
        END IF;
    END LOOP;
END;
$$;

INSERT INTO seller_permissions (code, domain, description)
VALUES
    ('store.update', 'store', 'Update seller-owned store profile'),
    ('offer.read', 'offer', 'Read seller offers'),
    ('offer.create', 'offer', 'Create seller offers'),
    ('offer.update', 'offer', 'Update seller offers'),
    ('offer.publish', 'offer', 'Activate seller offers'),
    ('offer.archive', 'offer', 'Archive seller offers'),
    ('inventory.read', 'inventory', 'Read seller inventory'),
    ('inventory.adjust', 'inventory', 'Adjust seller inventory'),
    ('inventory.threshold.update', 'inventory', 'Update seller inventory threshold'),
    ('order.read', 'order', 'Read seller order allocations'),
    ('order.prepare', 'order', 'Prepare seller packages'),
    ('order.ship', 'order', 'Record seller shipment handoff'),
    ('order.cancel.respond', 'order', 'Request seller cancellation response'),
    ('return.read', 'return', 'Read seller return allocations'),
    ('dashboard.read', 'dashboard', 'Read seller dashboard'),
    ('finance.read', 'finance', 'Read seller ledger summaries'),
    ('settlement.read', 'settlement', 'Read seller settlement readiness'),
    ('support.read', 'support', 'Read seller support conversations'),
    ('support.create', 'support', 'Create seller support conversation'),
    ('support.message', 'support', 'Create seller support message'),
    ('support.rate', 'support', 'Rate closed seller support conversation')
ON CONFLICT (code) DO NOTHING;

INSERT INTO seller_role_permissions (role_id, permission_code)
SELECT role_row.id, permission_row.code
FROM seller_roles role_row
JOIN seller_permissions permission_row ON permission_row.code IN (
    'store.update', 'offer.read', 'offer.create', 'offer.update', 'offer.publish', 'offer.archive',
    'inventory.read', 'inventory.adjust', 'inventory.threshold.update', 'order.read', 'order.prepare',
    'order.ship', 'order.cancel.respond', 'return.read', 'dashboard.read', 'finance.read',
    'settlement.read', 'support.read', 'support.create', 'support.message', 'support.rate'
)
WHERE role_row.organization_id IS NULL
  AND LOWER(role_row.code) IN ('owner', 'manager')
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO seller_role_permissions (role_id, permission_code)
SELECT role_row.id, permission_row.code
FROM seller_roles role_row
JOIN seller_permissions permission_row ON permission_row.code IN (
    'offer.read', 'offer.update', 'inventory.read', 'inventory.adjust', 'inventory.threshold.update',
    'order.read', 'order.prepare', 'order.ship', 'return.read', 'dashboard.read',
    'support.read', 'support.create', 'support.message', 'support.rate'
)
WHERE role_row.organization_id IS NULL
  AND LOWER(role_row.code) = 'operator'
ON CONFLICT (role_id, permission_code) DO NOTHING;

INSERT INTO seller_role_permissions (role_id, permission_code)
SELECT role_row.id, permission_row.code
FROM seller_roles role_row
JOIN seller_permissions permission_row ON permission_row.code IN (
    'offer.read', 'inventory.read', 'order.read', 'return.read', 'dashboard.read',
    'finance.read', 'settlement.read', 'support.read'
)
WHERE role_row.organization_id IS NULL
  AND LOWER(role_row.code) = 'viewer'
ON CONFLICT (role_id, permission_code) DO NOTHING;

COMMIT;
