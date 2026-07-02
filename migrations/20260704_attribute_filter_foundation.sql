CREATE TABLE IF NOT EXISTS attribute_definitions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    type VARCHAR(24) NOT NULL,
    unit VARCHAR(40),
    is_filterable BOOLEAN NOT NULL DEFAULT FALSE,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_variant_relevant BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    validation_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT attribute_definitions_type_check
        CHECK (type IN ('text', 'number', 'boolean', 'option', 'multi_option', 'range')),
    CONSTRAINT attribute_definitions_code_format_check
        CHECK (code ~ '^[a-z][a-z0-9_]{1,79}$'),
    CONSTRAINT attribute_definitions_validation_object_check
        CHECK (jsonb_typeof(validation_metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_definitions_code_lower
    ON attribute_definitions (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_attribute_definitions_active_sort
    ON attribute_definitions (sort_order, id)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS attribute_options (
    id SERIAL PRIMARY KEY,
    attribute_id INTEGER NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
    value VARCHAR(160) NOT NULL,
    label VARCHAR(160) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_options_attribute_value_lower
    ON attribute_options (attribute_id, LOWER(value));
CREATE INDEX IF NOT EXISTS idx_attribute_options_attribute_active_sort
    ON attribute_options (attribute_id, sort_order, id)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS attribute_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_templates_category_name_lower
    ON attribute_templates (category_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_attribute_templates_category_active_sort
    ON attribute_templates (category_id, sort_order, id)
    WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS template_attributes (
    template_id INTEGER NOT NULL REFERENCES attribute_templates(id) ON DELETE CASCADE,
    attribute_id INTEGER NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
    is_required BOOLEAN,
    is_filterable BOOLEAN,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (template_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_template_attributes_attribute_id
    ON template_attributes (attribute_id, template_id);

CREATE TABLE IF NOT EXISTS product_attribute_values (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_id INTEGER NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
    text_value TEXT,
    number_value NUMERIC,
    boolean_value BOOLEAN,
    option_id INTEGER REFERENCES attribute_options(id) ON DELETE RESTRICT,
    option_ids INTEGER[],
    range_min NUMERIC,
    range_max NUMERIC,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_attribute_values_product_attribute_unique
        UNIQUE (product_id, attribute_id),
    CONSTRAINT product_attribute_values_range_order_check
        CHECK (range_min IS NULL OR range_max IS NULL OR range_min <= range_max)
);

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_attribute_product
    ON product_attribute_values (attribute_id, product_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_option_id
    ON product_attribute_values (option_id, product_id)
    WHERE option_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_number
    ON product_attribute_values (attribute_id, number_value)
    WHERE number_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_text
    ON product_attribute_values (attribute_id, text_value)
    WHERE text_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_boolean
    ON product_attribute_values (attribute_id, boolean_value)
    WHERE boolean_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_range
    ON product_attribute_values (attribute_id, range_min, range_max)
    WHERE range_min IS NOT NULL AND range_max IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_option_ids_gin
    ON product_attribute_values USING GIN (option_ids)
    WHERE option_ids IS NOT NULL;
