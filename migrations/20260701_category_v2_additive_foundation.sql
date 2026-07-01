BEGIN;

CREATE TABLE IF NOT EXISTS stores (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    owner_user_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_slug_unique
    ON stores (LOWER(slug))
    WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS path TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS depth INTEGER;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_title VARCHAR(255);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_in_menu BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS hide_when_empty BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS google_taxonomy_id VARCHAR(100);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'categories_depth_nonnegative'
          AND conrelid = 'categories'::regclass
    ) THEN
        ALTER TABLE categories
            ADD CONSTRAINT categories_depth_nonnegative
            CHECK (depth IS NULL OR depth >= 0);
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_unique
    ON categories (LOWER(slug))
    WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_categories_parent_sort
    ON categories (parent_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_categories_public_visibility
    ON categories (is_active, is_customer_visible, parent_id)
    WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    old_price DECIMAL(10, 2),
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    category VARCHAR(100) DEFAULT 'Kategorisiz',
    categories TEXT[] DEFAULT ARRAY['Kategorisiz']::TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Kategorisiz';
ALTER TABLE products ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT ARRAY['Kategorisiz']::TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS publication_status VARCHAR(30) NOT NULL DEFAULT 'active';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id BIGINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'products_publication_status_check'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT products_publication_status_check
            CHECK (
                publication_status IN (
                    'draft',
                    'pending_approval',
                    'active',
                    'inactive',
                    'rejected',
                    'archived'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'products_store_id_fkey'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT products_store_id_fkey
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_products_store_id
    ON products (store_id)
    WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_public_visibility
    ON products (id)
    WHERE publication_status = 'active'
      AND is_customer_visible = TRUE
      AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_sellable_visibility
    ON products (id)
    WHERE publication_status = 'active'
      AND is_customer_visible = TRUE
      AND deleted_at IS NULL
      AND stock > 0;

CREATE TABLE IF NOT EXISTS category_aliases (
    id BIGSERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    alias VARCHAR(255) NOT NULL,
    normalized_alias VARCHAR(255) NOT NULL,
    alias_type VARCHAR(30) NOT NULL DEFAULT 'legacy',
    redirect_status SMALLINT NOT NULL DEFAULT 301,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT category_aliases_redirect_status_check
        CHECK (redirect_status IN (301, 302, 307, 308))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_aliases_normalized_unique
    ON category_aliases (LOWER(normalized_alias));

CREATE INDEX IF NOT EXISTS idx_category_aliases_category_id
    ON category_aliases (category_id);

CREATE TABLE IF NOT EXISTS product_categories (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, category_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_one_primary
    ON product_categories (product_id)
    WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_categories_category_product
    ON product_categories (category_id, product_id);

CREATE TABLE IF NOT EXISTS category_stats (
    category_id INTEGER PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
    direct_product_count BIGINT NOT NULL DEFAULT 0 CHECK (direct_product_count >= 0),
    visible_product_count BIGINT NOT NULL DEFAULT 0 CHECK (visible_product_count >= 0),
    sellable_product_count BIGINT NOT NULL DEFAULT 0 CHECK (sellable_product_count >= 0),
    descendant_visible_product_count BIGINT NOT NULL DEFAULT 0 CHECK (descendant_visible_product_count >= 0),
    descendant_sellable_product_count BIGINT NOT NULL DEFAULT 0 CHECK (descendant_sellable_product_count >= 0),
    subtree_visible_product_count BIGINT NOT NULL DEFAULT 0 CHECK (subtree_visible_product_count >= 0),
    subtree_sellable_product_count BIGINT NOT NULL DEFAULT 0 CHECK (subtree_sellable_product_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
