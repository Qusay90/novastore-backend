const {
    acquireLock,
    assertConnectedDatabase,
    createDefaultClient,
    ledgerExists,
    readLedgerRows,
    releaseLock,
    validateLedgerRows
} = require('./runner');
const { loadRegistry } = require('./registry');
const { validateTarget } = require('./guard');

const BOOTSTRAP_LOCK_KEYS = Object.freeze([764103, 20260723]);
const SYNTHETIC_CATEGORY_PATH = 'p4d-uat-synthetic';
const SYNTHETIC_SKU = 'P4D-UAT-0001';

const assertFullyMigrated = async (client, registry) => {
    if (!(await ledgerExists(client))) {
        throw new Error('Synthetic bootstrap requires a completed migration ledger.');
    }
    const rows = await readLedgerRows(client);
    const applied = validateLedgerRows(registry, rows);
    if (applied.size !== registry.length) {
        throw new Error('Synthetic bootstrap requires every registered migration to be applied.');
    }
};

const upsertSyntheticCatalog = async (client) => {
    const storeResult = await client.query(
        `SELECT id
         FROM stores
         WHERE LOWER(slug) = 'novastore-platform'
           AND is_active = TRUE
           AND deleted_at IS NULL
         ORDER BY id`
    );
    if (storeResult.rowCount !== 1) {
        throw new Error('Synthetic bootstrap requires exactly one active platform store.');
    }
    const storeId = storeResult.rows[0].id;

    let categoryResult = await client.query(
        `SELECT id
         FROM categories
         WHERE LOWER(path) = LOWER($1)
           AND deleted_at IS NULL
         FOR UPDATE`,
        [SYNTHETIC_CATEGORY_PATH]
    );

    let categoryId;
    if (categoryResult.rowCount === 0) {
        categoryResult = await client.query(
            `INSERT INTO categories (
                name, slug, path, depth, description, sort_order,
                is_active, is_customer_visible, show_in_menu, show_on_home, hide_when_empty
             ) VALUES ($1, $2, $3, 0, $4, 9000, TRUE, TRUE, TRUE, FALSE, FALSE)
             RETURNING id`,
            [
                'P4D Synthetic Catalog',
                SYNTHETIC_CATEGORY_PATH,
                SYNTHETIC_CATEGORY_PATH,
                'Local-only deterministic staging UAT fixture.'
            ]
        );
        categoryId = categoryResult.rows[0].id;
    } else if (categoryResult.rowCount === 1) {
        categoryId = categoryResult.rows[0].id;
        await client.query(
            `UPDATE categories
             SET name = $2,
                 slug = $1,
                 depth = 0,
                 description = $3,
                 sort_order = 9000,
                 is_active = TRUE,
                 is_customer_visible = TRUE,
                 show_in_menu = TRUE,
                 show_on_home = FALSE,
                 hide_when_empty = FALSE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
               AND (
                   name IS DISTINCT FROM $2::VARCHAR
                   OR slug IS DISTINCT FROM $1::VARCHAR
                   OR depth IS DISTINCT FROM 0
                   OR description IS DISTINCT FROM $3::TEXT
                   OR sort_order IS DISTINCT FROM 9000
                   OR is_active IS DISTINCT FROM TRUE
                   OR is_customer_visible IS DISTINCT FROM TRUE
                   OR show_in_menu IS DISTINCT FROM TRUE
                   OR show_on_home IS DISTINCT FROM FALSE
                   OR hide_when_empty IS DISTINCT FROM FALSE
               )`,
            [
                SYNTHETIC_CATEGORY_PATH,
                'P4D Synthetic Catalog',
                'Local-only deterministic staging UAT fixture.',
                categoryId
            ]
        );
    } else {
        throw new Error('Synthetic category identifier is not unique.');
    }

    let productResult = await client.query(
        `SELECT id
         FROM products
         WHERE normalized_sku = $1
           AND deleted_at IS NULL
         FOR UPDATE`,
        [SYNTHETIC_SKU]
    );

    const productValues = [
        'P4D Synthetic Product',
        'Deterministic local-only staging UAT product.',
        'P4D Synthetic Catalog',
        storeId,
        SYNTHETIC_SKU
    ];

    let productId;
    if (productResult.rowCount === 0) {
        productResult = await client.query(
            `INSERT INTO products (
                name, description, price, stock, image_url, category, categories,
                publication_status, is_customer_visible, store_id, sku, normalized_sku,
                brand, product_type, vat_rate, vat_rate_source, weight_grams, desi
             ) VALUES (
                $1, $2, 1.00, 10, 'https://assets.invalid/p4d-uat-product.svg', $3::TEXT, ARRAY[$3::TEXT]::TEXT[],
                'active', TRUE, $4, $5, $5,
                'NovaStore Synthetic', 'synthetic', 20, 'USER_SUPPLIED_TAX_VALUE', 100, 1
             )
             RETURNING id`,
            productValues
        );
        productId = productResult.rows[0].id;
    } else if (productResult.rowCount === 1) {
        productId = productResult.rows[0].id;
        await client.query(
            `UPDATE products
             SET name = $1,
                 description = $2,
                 price = 1.00,
                 stock = 10,
                 image_url = 'https://assets.invalid/p4d-uat-product.svg',
                 category = $3::TEXT,
                 categories = ARRAY[$3::TEXT]::TEXT[],
                 publication_status = 'active',
                 is_customer_visible = TRUE,
                 store_id = $4,
                 sku = $5,
                 normalized_sku = $5,
                 brand = 'NovaStore Synthetic',
                 product_type = 'synthetic',
                 vat_rate = 20,
                 vat_rate_source = 'USER_SUPPLIED_TAX_VALUE',
                 weight_grams = 100,
                 desi = 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
               AND (
                   name IS DISTINCT FROM $1::VARCHAR
                   OR description IS DISTINCT FROM $2::TEXT
                   OR price IS DISTINCT FROM 1.00::NUMERIC
                   OR stock IS DISTINCT FROM 10
                   OR image_url IS DISTINCT FROM 'https://assets.invalid/p4d-uat-product.svg'
                   OR category IS DISTINCT FROM $3::VARCHAR
                   OR categories IS DISTINCT FROM ARRAY[$3::TEXT]::TEXT[]
                   OR publication_status IS DISTINCT FROM 'active'
                   OR is_customer_visible IS DISTINCT FROM TRUE
                   OR store_id IS DISTINCT FROM $4::BIGINT
                   OR sku IS DISTINCT FROM $5::VARCHAR
                   OR normalized_sku IS DISTINCT FROM $5::VARCHAR
                   OR brand IS DISTINCT FROM 'NovaStore Synthetic'
                   OR product_type IS DISTINCT FROM 'synthetic'
                   OR vat_rate IS DISTINCT FROM 20::NUMERIC
                   OR vat_rate_source IS DISTINCT FROM 'USER_SUPPLIED_TAX_VALUE'
                   OR weight_grams IS DISTINCT FROM 100
                   OR desi IS DISTINCT FROM 1::NUMERIC
               )`,
            [...productValues, productId]
        );
    } else {
        throw new Error('Synthetic product identifier is not unique.');
    }

    await client.query(
        `UPDATE product_categories
         SET is_primary = FALSE
         WHERE product_id = $1
           AND category_id <> $2
           AND is_primary = TRUE`,
        [productId, categoryId]
    );
    await client.query(
        `INSERT INTO product_categories (product_id, category_id, is_primary)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (product_id, category_id)
         DO UPDATE SET is_primary = TRUE
         WHERE product_categories.is_primary IS DISTINCT FROM TRUE`,
        [productId, categoryId]
    );
    await client.query(
        `INSERT INTO category_stats (
            category_id, direct_product_count, visible_product_count, sellable_product_count,
            descendant_visible_product_count, descendant_sellable_product_count,
            subtree_visible_product_count, subtree_sellable_product_count, updated_at
         ) VALUES ($1, 1, 1, 1, 0, 0, 1, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (category_id) DO UPDATE SET
            direct_product_count = 1,
            visible_product_count = 1,
            sellable_product_count = 1,
            descendant_visible_product_count = 0,
            descendant_sellable_product_count = 0,
            subtree_visible_product_count = 1,
            subtree_sellable_product_count = 1,
            updated_at = CURRENT_TIMESTAMP
         WHERE category_stats.direct_product_count IS DISTINCT FROM 1
            OR category_stats.visible_product_count IS DISTINCT FROM 1
            OR category_stats.sellable_product_count IS DISTINCT FROM 1
            OR category_stats.descendant_visible_product_count IS DISTINCT FROM 0
            OR category_stats.descendant_sellable_product_count IS DISTINCT FROM 0
            OR category_stats.subtree_visible_product_count IS DISTINCT FROM 1
            OR category_stats.subtree_sellable_product_count IS DISTINCT FROM 1`,
        [categoryId]
    );

    return { categoryId, productId };
};

const runBootstrap = async ({
    env = process.env,
    registry = loadRegistry(),
    createClient = createDefaultClient,
    output = console.log
} = {}) => {
    const target = validateTarget(env, { bootstrap: true });
    const client = createClient(target, 'novastore_staging_synthetic_bootstrap');
    let locked = false;
    try {
        await client.connect();
        await assertConnectedDatabase(client, target);
        await acquireLock(client, BOOTSTRAP_LOCK_KEYS);
        locked = true;
        await assertFullyMigrated(client, registry);

        await client.query('BEGIN');
        try {
            const result = await upsertSyntheticCatalog(client);
            await client.query('COMMIT');
            output('Synthetic catalog bootstrap complete.');
            return result;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        }
    } finally {
        if (locked) await releaseLock(client, BOOTSTRAP_LOCK_KEYS).catch(() => {});
        await client.end().catch(() => {});
    }
};

module.exports = {
    BOOTSTRAP_LOCK_KEYS,
    SYNTHETIC_CATEGORY_PATH,
    SYNTHETIC_SKU,
    assertFullyMigrated,
    runBootstrap,
    upsertSyntheticCatalog
};
