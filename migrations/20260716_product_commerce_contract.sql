ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(120);
ALTER TABLE products ADD COLUMN IF NOT EXISTS normalized_sku VARCHAR(120);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(160);
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(160);
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate_source VARCHAR(40);
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_grams INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS desi NUMERIC(10, 3);

CREATE OR REPLACE FUNCTION normalize_product_sku(raw_sku TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
    SELECT UPPER(REPLACE(BTRIM(raw_sku), ' ', ''))
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_sku_pair'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_sku_pair
            CHECK ((sku IS NULL) = (normalized_sku IS NULL));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_sku_format'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_sku_format
            CHECK (
                sku IS NULL OR (
                    sku = BTRIM(sku)
                    AND sku ~ '^[A-Za-z0-9][A-Za-z0-9._/ -]{0,119}$'
                    AND normalized_sku = normalize_product_sku(sku)
                    AND normalized_sku <> ''
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_brand_nonblank'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_brand_nonblank
            CHECK (brand IS NULL OR (brand = BTRIM(brand) AND brand <> ''));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_product_type_nonblank'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_product_type_nonblank
            CHECK (product_type IS NULL OR (product_type = BTRIM(product_type) AND product_type <> ''));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_vat_pair'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_vat_pair
            CHECK ((vat_rate IS NULL) = (vat_rate_source IS NULL));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_vat_rate'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_vat_rate
            CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_vat_rate_source'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_vat_rate_source
            CHECK (vat_rate_source IS NULL OR vat_rate_source = 'USER_SUPPLIED_TAX_VALUE');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_weight_grams_positive'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_weight_grams_positive
            CHECK (weight_grams IS NULL OR weight_grams > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_products_desi_positive'
          AND conrelid = 'products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT chk_products_desi_positive
            CHECK (desi IS NULL OR desi > 0);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_normalized_sku_unique
    ON products(normalized_sku)
    WHERE normalized_sku IS NOT NULL AND deleted_at IS NULL;
