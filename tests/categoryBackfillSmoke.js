const assert = require('assert');
const pool = require('../config/db');
const { resolveStartupSafety } = require('../config/startupSafety');
const createCoreSchema = require('../models/createCoreDb');
const { applyCategoryV2BackfillConstraints } = require('../models/categoryV2Schema');
const {
    normalizeLegacyCategoryName,
    slugifyCategoryName,
    runCategoryV2Backfill
} = require('../services/categoryV2BackfillService');

const assertSafeDisposableTarget = () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.canStart, true, safety.errors.join(' '));
    assert.strictEqual(safety.safeLocalDatabase, true, `Unsafe DB target: ${safety.target.label}`);
    assert.strictEqual(safety.shouldRunSchemaInit, true, 'Schema init guard must be enabled.');
    assert.strictEqual(safety.target.isSupabaseHost, false, 'Supabase targets are forbidden.');
    assert.strictEqual(
        safety.target.database,
        'novastore_category_v2_test',
        'This destructive smoke test is restricted to novastore_category_v2_test.'
    );
    return safety;
};

const resetSchema = async (client) => {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    await applyCategoryV2BackfillConstraints(client);
};

const seedLegacyScenario = async (client) => {
    const categoryResult = await client.query(`
        INSERT INTO categories (name, parent_id)
        VALUES
            ('Elektronik', NULL),
            ('Moda', NULL)
        RETURNING id, name
    `);
    const roots = new Map(categoryResult.rows.map((row) => [row.name, Number(row.id)]));

    const childResult = await client.query(
        `INSERT INTO categories (name, parent_id)
         VALUES
            ('Telefonlar', $1),
            ('Aksesuar', $1),
            ('Laptop', $1),
            ('Aksesuar', $2)
         RETURNING id, name, parent_id`,
        [roots.get('Elektronik'), roots.get('Moda')]
    );
    const phoneId = Number(childResult.rows.find((row) => row.name === 'Telefonlar').id);
    const laptopId = Number(childResult.rows.find((row) => row.name === 'Laptop').id);

    await assert.rejects(
        client.query(`INSERT INTO categories (name) VALUES ('Elektronik')`),
        (error) => error && error.code === '23505'
    );

    await assert.rejects(
        client.query('DELETE FROM categories WHERE id = $1', [roots.get('Elektronik')]),
        (error) => error && error.code === '23503'
    );

    const productResult = await client.query(`
        INSERT INTO products (name, price, stock, category, categories)
        VALUES
            ('Tükenen Telefon', 100, 0, 'Telefonlar', ARRAY['Telefonlar']::TEXT[]),
            ('Fallback Telefon', 200, 5, 'Bulunamayan', ARRAY['Bulunamayan', 'Telefonlar']::TEXT[]),
            ('Belirsiz Aksesuar', 50, 5, 'Aksesuar', ARRAY['Aksesuar']::TEXT[]),
            ('Parent Ürün', 75, 5, 'Elektronik', ARRAY['Elektronik']::TEXT[]),
            ('Çoklu Kategori Ürünü', 300, 4, 'Telefonlar', ARRAY['Telefonlar', 'Laptop']::TEXT[]),
            ('Önceden Eşlenmiş', 400, 2, 'Telefonlar', ARRAY['Telefonlar']::TEXT[])
        RETURNING id, name
    `);
    const products = new Map(productResult.rows.map((row) => [row.name, Number(row.id)]));

    await client.query(
        `INSERT INTO product_categories (product_id, category_id, is_primary)
         VALUES ($1, $2, TRUE)`,
        [products.get('Önceden Eşlenmiş'), phoneId]
    );

    return { roots, phoneId, laptopId, products };
};

(async () => {
    const safety = assertSafeDisposableTarget();
    assert.strictEqual(normalizeLegacyCategoryName('  İÇ   GİYİM  '), 'iç giyim');
    assert.strictEqual(slugifyCategoryName('İç Giyim & Ev Giyim'), 'ic-giyim-ve-ev-giyim');
    const client = await pool.connect();

    try {
        await resetSchema(client);

        const emptyDryRun = await runCategoryV2Backfill(pool, { apply: false });
        assert.strictEqual(emptyDryRun.summary.categories, 0);
        assert.strictEqual(emptyDryRun.summary.products, 0);

        const emptyApply = await runCategoryV2Backfill(pool, { apply: true });
        assert.strictEqual(emptyApply.applied.relationshipsCreated, 0);

        await resetSchema(client);
        const cycleResult = await client.query(`
            INSERT INTO categories (name, parent_id)
            VALUES ('Cycle Root', NULL)
            RETURNING id
        `);
        const cycleRootId = Number(cycleResult.rows[0].id);
        const cycleChildResult = await client.query(
            `INSERT INTO categories (name, parent_id)
             VALUES ('Cycle Child', $1)
             RETURNING id`,
            [cycleRootId]
        );
        await client.query(
            'UPDATE categories SET parent_id = $1 WHERE id = $2',
            [Number(cycleChildResult.rows[0].id), cycleRootId]
        );
        const cycleDryRun = await runCategoryV2Backfill(pool, { apply: false });
        assert(cycleDryRun.structuralIssues.some((issue) => issue.type === 'cycle'));
        await assert.rejects(
            runCategoryV2Backfill(pool, { apply: true }),
            (error) => error && error.code === 'CATEGORY_TREE_INVALID'
        );

        await resetSchema(client);
        const scenario = await seedLegacyScenario(client);

        const dryRun = await runCategoryV2Backfill(pool, { apply: false });
        assert.strictEqual(dryRun.mode, 'dry-run');
        assert.strictEqual(dryRun.summary.categories, 6);
        assert.strictEqual(dryRun.summary.products, 6);
        assert.strictEqual(dryRun.summary.relationshipsToCreate, 4);
        assert.strictEqual(dryRun.summary.alreadyMappedProducts, 1);
        assert.strictEqual(dryRun.summary.ambiguousProducts, 1);
        assert.strictEqual(dryRun.summary.parentCategoryProducts, 1);
        assert(dryRun.unmatchedProducts.some((item) =>
            item.productId === scenario.products.get('Fallback Telefon')
        ));
        assert(dryRun.ambiguousProducts.some((item) =>
            item.productId === scenario.products.get('Belirsiz Aksesuar')
        ));
        assert(dryRun.parentCategoryProducts.some((item) =>
            item.productId === scenario.products.get('Parent Ürün')
        ));

        const beforeApply = await client.query(`
            SELECT
                (SELECT COUNT(*)::INTEGER FROM stores) AS stores,
                (SELECT COUNT(*)::INTEGER FROM category_aliases) AS aliases,
                (SELECT COUNT(*)::INTEGER FROM category_stats) AS stats,
                (SELECT COUNT(*)::INTEGER FROM product_categories) AS relations,
                (SELECT COUNT(*)::INTEGER FROM categories WHERE slug IS NOT NULL) AS slugs
        `);
        assert.deepStrictEqual(beforeApply.rows[0], {
            stores: 0,
            aliases: 0,
            stats: 0,
            relations: 1,
            slugs: 0
        });

        const applyReport = await runCategoryV2Backfill(pool, { apply: true });
        assert.strictEqual(applyReport.mode, 'apply');
        assert.strictEqual(applyReport.applied.categoryUpdates, 6);
        assert.strictEqual(applyReport.applied.relationshipsCreated, 4);
        assert.strictEqual(applyReport.applied.storeAssignments, 6);

        const categoryState = await client.query(`
            SELECT id, name, parent_id, slug, path, depth
            FROM categories
            ORDER BY id
        `);
        categoryState.rows.forEach((category) => {
            assert(category.slug, `Missing slug for category ${category.id}`);
            assert(category.path, `Missing path for category ${category.id}`);
            assert.notStrictEqual(category.depth, null, `Missing depth for category ${category.id}`);
        });
        const accessorySlugs = categoryState.rows
            .filter((category) => category.name === 'Aksesuar')
            .map((category) => category.slug);
        assert.strictEqual(new Set(accessorySlugs).size, 2);

        const aliasState = await client.query(`
            SELECT normalized_alias
            FROM category_aliases
            ORDER BY normalized_alias
        `);
        assert(!aliasState.rows.some((row) => row.normalized_alias === 'aksesuar'));
        assert(aliasState.rows.some((row) => row.normalized_alias === 'telefonlar'));

        const relationState = await client.query(`
            SELECT p.name, pc.category_id, pc.is_primary
            FROM products p
            LEFT JOIN product_categories pc ON pc.product_id = p.id
            ORDER BY p.name, pc.category_id
        `);
        const relationsFor = (name) => relationState.rows.filter((row) => row.name === name && row.category_id);
        assert.strictEqual(relationsFor('Tükenen Telefon').length, 1);
        assert.strictEqual(relationsFor('Tükenen Telefon')[0].is_primary, true);
        assert.strictEqual(relationsFor('Fallback Telefon').length, 1);
        assert.strictEqual(relationsFor('Fallback Telefon')[0].is_primary, true);
        assert.strictEqual(relationsFor('Belirsiz Aksesuar').length, 0);
        assert.strictEqual(relationsFor('Parent Ürün').length, 0);
        assert.strictEqual(relationsFor('Çoklu Kategori Ürünü').length, 2);
        assert.strictEqual(
            relationsFor('Çoklu Kategori Ürünü').find((row) => row.category_id === scenario.phoneId).is_primary,
            true
        );
        assert.strictEqual(
            relationsFor('Çoklu Kategori Ürünü').find((row) => row.category_id === scenario.laptopId).is_primary,
            false
        );

        const statsState = await client.query(
            `SELECT *
             FROM category_stats
             WHERE category_id IN ($1, $2)
             ORDER BY category_id`,
            [scenario.roots.get('Elektronik'), scenario.phoneId]
        );
        const electronicsStats = statsState.rows.find(
            (row) => Number(row.category_id) === scenario.roots.get('Elektronik')
        );
        const phoneStats = statsState.rows.find(
            (row) => Number(row.category_id) === scenario.phoneId
        );
        assert.strictEqual(Number(electronicsStats.subtree_visible_product_count), 4);
        assert.strictEqual(Number(electronicsStats.subtree_sellable_product_count), 3);
        assert.strictEqual(Number(phoneStats.visible_product_count), 4);
        assert.strictEqual(Number(phoneStats.sellable_product_count), 3);

        const legacyState = await client.query(`
            SELECT category, categories, store_id
            FROM products
            WHERE name = 'Tükenen Telefon'
        `);
        assert.strictEqual(legacyState.rows[0].category, 'Telefonlar');
        assert.deepStrictEqual(legacyState.rows[0].categories, ['Telefonlar']);
        assert(legacyState.rows[0].store_id);

        const countsBeforeSecondApply = await client.query(`
            SELECT
                (SELECT COUNT(*)::INTEGER FROM stores) AS stores,
                (SELECT COUNT(*)::INTEGER FROM category_aliases) AS aliases,
                (SELECT COUNT(*)::INTEGER FROM product_categories) AS relations
        `);
        const secondApply = await runCategoryV2Backfill(pool, { apply: true });
        const countsAfterSecondApply = await client.query(`
            SELECT
                (SELECT COUNT(*)::INTEGER FROM stores) AS stores,
                (SELECT COUNT(*)::INTEGER FROM category_aliases) AS aliases,
                (SELECT COUNT(*)::INTEGER FROM product_categories) AS relations
        `);
        assert.deepStrictEqual(countsAfterSecondApply.rows[0], countsBeforeSecondApply.rows[0]);
        assert.strictEqual(secondApply.applied.relationshipsCreated, 0);
        assert.strictEqual(secondApply.applied.storeAssignments, 0);

        const constraints = await client.query(`
            SELECT contype, confdeltype, pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'categories'::regclass
            ORDER BY conname
        `);
        assert(!constraints.rows.some((row) =>
            row.contype === 'u' && row.definition === 'UNIQUE (name)'
        ));
        assert(constraints.rows.some((row) =>
            row.contype === 'f' && row.confdeltype === 'r'
        ));

        console.log(`category backfill smoke passed against ${safety.target.label}`);
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
