BEGIN;

CREATE TABLE IF NOT EXISTS collections (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    collection_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    rule_code VARCHAR(40),
    description TEXT,
    image_url TEXT,
    banner_url TEXT,
    accent_color VARCHAR(20),
    seo_title VARCHAR(180),
    seo_description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT collections_type_check CHECK (collection_type IN ('manual', 'dynamic')),
    CONSTRAINT collections_rule_check CHECK (
        (collection_type = 'manual' AND rule_code IS NULL) OR
        (collection_type = 'dynamic' AND rule_code IN ('new_arrivals', 'discount', 'best_sellers'))
    )
);

CREATE TABLE IF NOT EXISTS collection_rules (
    id BIGSERIAL PRIMARY KEY,
    collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    rule_type VARCHAR(40) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT collection_rules_type_check CHECK (
        rule_type IN ('new_arrivals', 'discount', 'best_sellers')
    ),
    CONSTRAINT collection_rules_collection_type_unique UNIQUE (collection_id, rule_type)
);

CREATE TABLE IF NOT EXISTS collection_products (
    collection_id BIGINT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, product_id)
);

CREATE TABLE IF NOT EXISTS menus (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT menus_code_check CHECK (code IN ('main', 'footer', 'mobile', 'home'))
);

CREATE TABLE IF NOT EXISTS menu_items (
    id BIGSERIAL PRIMARY KEY,
    menu_id BIGINT NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES menu_items(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    subtitle VARCHAR(240),
    target_type VARCHAR(30),
    category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
    collection_id BIGINT REFERENCES collections(id) ON DELETE RESTRICT,
    internal_url VARCHAR(500),
    icon VARCHAR(120),
    image_url TEXT,
    accent_color VARCHAR(20),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT menu_items_target_type_check CHECK (
        target_type IS NULL OR target_type IN ('category', 'collection', 'internal_url')
    ),
    CONSTRAINT menu_items_target_shape_check CHECK (
        (target_type IS NULL AND category_id IS NULL AND collection_id IS NULL AND internal_url IS NULL) OR
        (target_type = 'category' AND category_id IS NOT NULL AND collection_id IS NULL AND internal_url IS NULL) OR
        (target_type = 'collection' AND category_id IS NULL AND collection_id IS NOT NULL AND internal_url IS NULL) OR
        (target_type = 'internal_url' AND category_id IS NULL AND collection_id IS NULL AND internal_url IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
    source_item_index INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT order_items_order_source_unique UNIQUE (order_id, source_item_index)
);

CREATE TABLE IF NOT EXISTS order_item_backfill_issues (
    order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    reason VARCHAR(80) NOT NULL,
    source_items JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collections_public
    ON collections(is_active, sort_order, id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collection_products_product
    ON collection_products(product_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_menu_parent_sort
    ON menu_items(menu_id, parent_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_menu_items_parent
    ON menu_items(parent_id)
    WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_category
    ON menu_items(category_id)
    WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_collection
    ON menu_items(collection_id)
    WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_product_order
    ON order_items(product_id, order_id);
CREATE INDEX IF NOT EXISTS idx_orders_completed_created
    ON orders(status, created_at);

INSERT INTO order_items (
    order_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_price,
    source_item_index,
    created_at
)
SELECT
    orders.id,
    products.id,
    LEFT(COALESCE(NULLIF(item.value->>'name', ''), products.name, 'Legacy product'), 255),
    parsed.quantity,
    parsed.unit_price,
    parsed.quantity * parsed.unit_price,
    (item.ordinality - 1)::INTEGER,
    COALESCE(orders.created_at, CURRENT_TIMESTAMP)
FROM orders
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(orders.items) = 'array' THEN orders.items ELSE '[]'::jsonb END
) WITH ORDINALITY AS item(value, ordinality)
CROSS JOIN LATERAL (
    SELECT
        CASE
            WHEN COALESCE(item.value->>'quantity', '') ~ '^[1-9][0-9]*$'
                THEN (item.value->>'quantity')::INTEGER
            ELSE NULL
        END AS quantity,
        CASE
            WHEN COALESCE(item.value->>'price', item.value->>'unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
                THEN COALESCE(item.value->>'price', item.value->>'unit_price')::DECIMAL(12, 2)
            ELSE 0::DECIMAL(12, 2)
        END AS unit_price,
        CASE
            WHEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId', '') ~ '^[1-9][0-9]*$'
                THEN COALESCE(item.value->>'id', item.value->>'product_id', item.value->>'productId')::INTEGER
            ELSE NULL
        END AS requested_product_id
) parsed
LEFT JOIN products ON products.id = parsed.requested_product_id
WHERE orders.items IS NOT NULL
  AND jsonb_typeof(orders.items) = 'array'
  AND jsonb_typeof(item.value) = 'object'
  AND parsed.quantity IS NOT NULL
ON CONFLICT (order_id, source_item_index) DO NOTHING;

INSERT INTO order_item_backfill_issues (order_id, reason, source_items)
SELECT
    orders.id,
    CASE
        WHEN orders.items IS NULL THEN 'items_null'
        WHEN jsonb_typeof(orders.items) <> 'array' THEN 'items_not_array'
        WHEN jsonb_array_length(orders.items) = 0 THEN 'items_empty'
        ELSE 'items_partially_unreadable'
    END,
    orders.items
FROM orders
WHERE orders.items IS NULL
   OR jsonb_typeof(orders.items) <> 'array'
   OR CASE
        WHEN jsonb_typeof(orders.items) = 'array' THEN jsonb_array_length(orders.items) = 0
        ELSE FALSE
      END
   OR (
        jsonb_typeof(orders.items) = 'array'
        AND (
            SELECT COUNT(*)
            FROM order_items
            WHERE order_items.order_id = orders.id
        ) < CASE
                WHEN jsonb_typeof(orders.items) = 'array' THEN jsonb_array_length(orders.items)
                ELSE 0
            END
   )
ON CONFLICT (order_id) DO UPDATE
SET reason = EXCLUDED.reason,
    source_items = EXCLUDED.source_items,
    recorded_at = CURRENT_TIMESTAMP;

COMMIT;
