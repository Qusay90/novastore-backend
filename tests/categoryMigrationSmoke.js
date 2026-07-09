const assert = require('assert');
const pool = require('../config/db');
const { resolveStartupSafety } = require('../config/startupSafety');
const {
    applyCategoryV2Schema,
    applyCategoryV2BackfillConstraints
} = require('../models/categoryV2Schema');

const EXPECTED_TABLES = [
    'categories',
    'category_aliases',
    'category_stats',
    'product_categories',
    'products',
    'stores'
];

const EXPECTED_CATEGORY_COLUMNS = [
    'accent_color',
    'banner_url',
    'deleted_at',
    'depth',
    'description',
    'google_taxonomy_id',
    'hide_when_empty',
    'icon',
    'image_url',
    'is_active',
    'is_customer_visible',
    'path',
    'seo_description',
    'seo_title',
    'show_in_menu',
    'show_on_home',
    'slug',
    'sort_order',
    'updated_at'
];

const EXPECTED_PRODUCT_COLUMNS = [
    'categories',
    'category',
    'deleted_at',
    'is_customer_visible',
    'publication_status',
    'store_id',
    'updated_at'
];

const EXPECTED_STATS_COLUMNS = [
    'category_id',
    'descendant_sellable_product_count',
    'descendant_visible_product_count',
    'direct_product_count',
    'sellable_product_count',
    'subtree_sellable_product_count',
    'subtree_visible_product_count',
    'updated_at',
    'visible_product_count'
];

const EXPECTED_INDEXES = [
    'idx_categories_parent_sort',
    'idx_categories_path_unique',
    'idx_categories_public_visibility',
    'idx_categories_sibling_name_unique',
    'idx_categories_slug_unique',
    'idx_category_aliases_category_id',
    'idx_category_aliases_normalized_unique',
    'idx_product_categories_category_product',
    'idx_product_categories_one_primary',
    'idx_products_public_visibility',
    'idx_products_sellable_visibility',
    'idx_products_store_id',
    'idx_stores_slug_unique'
];

const getColumns = async (client, tableName) => {
    const result = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY column_name`,
        [tableName]
    );
    return result.rows.map((row) => row.column_name);
};

const assertContainsAll = (actual, expected, label) => {
    expected.forEach((value) => {
        assert(actual.includes(value), `${label} missing ${value}`);
    });
};

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.canStart, true, safety.errors.join(' '));
    assert.strictEqual(safety.safeLocalDatabase, true, `Unsafe DB target: ${safety.target.label}`);
    assert.strictEqual(safety.shouldRunSchemaInit, true, 'Schema init guard must be explicitly enabled.');
    assert.strictEqual(safety.target.isSupabaseHost, false, 'Remote Supabase targets are forbidden.');
    assert.strictEqual(
        safety.target.database,
        'novastore_category_v2_test',
        'This destructive smoke test is restricted to novastore_category_v2_test.'
    );

    const client = await pool.connect();

    try {
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');

        await applyCategoryV2Schema(client);
        await applyCategoryV2BackfillConstraints(client);

        const tableResult = await client.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
             ORDER BY table_name`
        );
        const tableNames = tableResult.rows.map((row) => row.table_name);
        assertContainsAll(tableNames, EXPECTED_TABLES, 'tables');

        assertContainsAll(await getColumns(client, 'categories'), EXPECTED_CATEGORY_COLUMNS, 'categories');
        assertContainsAll(await getColumns(client, 'products'), EXPECTED_PRODUCT_COLUMNS, 'products');
        assertContainsAll(await getColumns(client, 'category_stats'), EXPECTED_STATS_COLUMNS, 'category_stats');

        const indexResult = await client.query(
            `SELECT indexname
             FROM pg_indexes
             WHERE schemaname = 'public'
             ORDER BY indexname`
        );
        const indexNames = indexResult.rows.map((row) => row.indexname);
        assertContainsAll(indexNames, EXPECTED_INDEXES, 'indexes');

        const firstCategory = await client.query(
            `INSERT INTO categories (name, slug, depth)
             VALUES ('Legacy Category', 'legacy-category', 0)
             RETURNING id`
        );
        const secondCategory = await client.query(
            `INSERT INTO categories (name, slug, depth)
             VALUES ('Secondary Category', 'secondary-category', 0)
             RETURNING id`
        );
        const productResult = await client.query(
            `INSERT INTO products (name, price, stock, category, categories)
             VALUES ('Legacy Product', 100, 0, 'Legacy Category', ARRAY['Legacy Category']::TEXT[])
             RETURNING id, publication_status, is_customer_visible, category, categories`
        );

        const product = productResult.rows[0];
        assert.strictEqual(product.publication_status, 'active');
        assert.strictEqual(product.is_customer_visible, true);
        assert.strictEqual(product.category, 'Legacy Category');
        assert.deepStrictEqual(product.categories, ['Legacy Category']);

        await client.query(
            `INSERT INTO product_categories (product_id, category_id, is_primary)
             VALUES ($1, $2, TRUE)`,
            [product.id, firstCategory.rows[0].id]
        );
        await client.query(
            `INSERT INTO category_stats (
                category_id,
                direct_product_count,
                visible_product_count,
                sellable_product_count,
                subtree_visible_product_count,
                subtree_sellable_product_count
             )
             VALUES ($1, 1, 1, 0, 1, 0)`,
            [firstCategory.rows[0].id]
        );

        await assert.rejects(
            client.query(
                `INSERT INTO product_categories (product_id, category_id, is_primary)
                 VALUES ($1, $2, TRUE)`,
                [product.id, secondCategory.rows[0].id]
            ),
            (error) => error && error.code === '23505'
        );

        await applyCategoryV2Schema(client);
        await applyCategoryV2BackfillConstraints(client);

        const preservedResult = await client.query(
            `SELECT p.category,
                    p.categories,
                    p.publication_status,
                    p.is_customer_visible,
                    cs.visible_product_count,
                    cs.sellable_product_count
             FROM products p
             JOIN product_categories pc ON pc.product_id = p.id AND pc.is_primary = TRUE
             JOIN category_stats cs ON cs.category_id = pc.category_id
             WHERE p.id = $1`,
            [product.id]
        );

        assert.strictEqual(preservedResult.rowCount, 1);
        assert.strictEqual(preservedResult.rows[0].category, 'Legacy Category');
        assert.deepStrictEqual(preservedResult.rows[0].categories, ['Legacy Category']);
        assert.strictEqual(preservedResult.rows[0].publication_status, 'active');
        assert.strictEqual(preservedResult.rows[0].is_customer_visible, true);
        assert.strictEqual(Number(preservedResult.rows[0].visible_product_count), 1);
        assert.strictEqual(Number(preservedResult.rows[0].sellable_product_count), 0);

        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await client.query(`
            CREATE TABLE categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE products (
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

            INSERT INTO categories (name) VALUES ('Existing Legacy Category');
            INSERT INTO products (name, price, stock, category, categories)
            VALUES (
                'Existing Legacy Product',
                125,
                0,
                'Existing Legacy Category',
                ARRAY['Existing Legacy Category']::TEXT[]
            );
        `);

        await applyCategoryV2Schema(client);
        await applyCategoryV2BackfillConstraints(client);
        await applyCategoryV2Schema(client);
        await applyCategoryV2BackfillConstraints(client);

        const legacyUpgradeResult = await client.query(
            `SELECT p.name,
                    p.category,
                    p.categories,
                    p.publication_status,
                    p.is_customer_visible,
                    p.deleted_at,
                    c.name AS category_name
             FROM products p
             CROSS JOIN categories c
             WHERE p.name = 'Existing Legacy Product'
               AND c.name = 'Existing Legacy Category'`
        );
        assert.strictEqual(legacyUpgradeResult.rowCount, 1);
        assert.strictEqual(legacyUpgradeResult.rows[0].category, 'Existing Legacy Category');
        assert.deepStrictEqual(legacyUpgradeResult.rows[0].categories, ['Existing Legacy Category']);
        assert.strictEqual(legacyUpgradeResult.rows[0].publication_status, 'active');
        assert.strictEqual(legacyUpgradeResult.rows[0].is_customer_visible, true);
        assert.strictEqual(legacyUpgradeResult.rows[0].deleted_at, null);

        const automaticBackfillResult = await client.query(
            'SELECT COUNT(*)::INTEGER AS count FROM product_categories'
        );
        assert.strictEqual(automaticBackfillResult.rows[0].count, 0);

        console.log(`category migration smoke passed against ${safety.target.label}`);
    } finally {
        client.release();
        await pool.end();
    }
})().catch(async (error) => {
    console.error(error);
    try {
        await pool.end();
    } catch (_) {
        // Pool may already be closed.
    }
    process.exitCode = 1;
});
