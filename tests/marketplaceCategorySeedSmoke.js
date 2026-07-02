const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const { resolveStartupSafety } = require('../config/startupSafety');
const { flattenTree, runMarketplaceCategorySeed } =
    require('../services/marketplaceCategorySeedService');
const { buildLocalServerEnv } = require('./helpers/localServerProcess');
const adminRoutes = require('../routes/adminCategoryRoutes');
const publicRoutes = require('../routes/publicCategoryRoutes');

const root = path.join(__dirname, '..');
const records = flattenTree();
process.env.JWT_SECRET = 'marketplace-category-seed-smoke-secret';

const adminHeaders = {
    Authorization: `Bearer ${jwt.sign(
        { id: 1, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    )}`
};

const startApi = async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin/categories', adminRoutes);
    app.use('/api/public/categories', publicRoutes);
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        server,
        base: `http://127.0.0.1:${server.address().port}`
    };
};

const runChild = (args, env, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Seed child timed out: ${output}`));
    }, timeoutMs);
    child.once('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, output });
    });
});

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.shouldRunSchemaInit, true);
    assert.strictEqual(safety.target.host, '127.0.0.1');
    assert.strictEqual(String(safety.target.port), '55432');
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');

    assert.strictEqual(records.length, 279);
    assert.strictEqual(records.filter((record) => record.depth === 0).length, 10);
    assert.strictEqual(new Set(records.map((record) => record.slug)).size, records.length);

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();

    const sentinelCategory = await pool.query(`
        INSERT INTO categories (
            name, slug, path, depth, sort_order,
            is_active, is_customer_visible, hide_when_empty
        )
        VALUES ('Korunan Kategori', 'korunan-kategori', 'korunan-kategori', 0, 999, TRUE, TRUE, TRUE)
        RETURNING id
    `);
    const sentinelCategoryId = Number(sentinelCategory.rows[0].id);
    await pool.query(
        'INSERT INTO category_stats (category_id) VALUES ($1)',
        [sentinelCategoryId]
    );
    const sentinelProduct = await pool.query(`
        INSERT INTO products (name, price, stock, category, categories)
        VALUES (
            'Korunan Ürün', 10, 4, 'Korunan Kategori',
            ARRAY['Korunan Kategori']::TEXT[]
        )
        RETURNING id
    `);
    const sentinelProductId = Number(sentinelProduct.rows[0].id);

    const beforeDryRun = await pool.query(`
        SELECT
            (SELECT COUNT(*)::INTEGER FROM categories) AS categories,
            (SELECT COUNT(*)::INTEGER FROM products) AS products,
            (SELECT COUNT(*)::INTEGER FROM category_stats) AS stats
    `);
    const dryRun = await runMarketplaceCategorySeed(pool);
    assert.strictEqual(dryRun.mode, 'dry-run');
    assert.strictEqual(dryRun.added.length, records.length);
    assert.strictEqual(dryRun.conflicts.length, 0);
    const afterDryRun = await pool.query(`
        SELECT
            (SELECT COUNT(*)::INTEGER FROM categories) AS categories,
            (SELECT COUNT(*)::INTEGER FROM products) AS products,
            (SELECT COUNT(*)::INTEGER FROM category_stats) AS stats
    `);
    assert.deepStrictEqual(afterDryRun.rows[0], beforeDryRun.rows[0]);

    const defaultCli = await runChild(
        ['scripts/seedMarketplaceCategories.js'],
        buildLocalServerEnv()
    );
    assert.strictEqual(defaultCli.code, 0, defaultCli.output);
    assert.match(defaultCli.output, /"mode": "dry-run"/);
    assert.match(defaultCli.output, /"total_seed_categories": 279/);
    assert.deepStrictEqual(
        (await pool.query('SELECT COUNT(*)::INTEGER AS count FROM categories')).rows[0],
        { count: 1 }
    );

    const remoteCli = await runChild(
        ['scripts/seedMarketplaceCategories.js', '--apply'],
        buildLocalServerEnv({
            DATABASE_URL: 'postgresql://test:test@remote.invalid:5432/postgres',
            DB_HOST: 'remote.invalid',
            DB_PORT: '5432',
            DB_NAME: 'postgres',
            DB_USER: 'test',
            DB_PASSWORD: 'test',
            NOVASTORE_SAFE_LOCAL_BACKEND: 'false',
            NOVASTORE_ALLOW_REMOTE_DB: 'false',
            NODE_OPTIONS: `--require=${path.join(__dirname, 'helpers', 'blockPgLoad.js')}`
        })
    );
    assert.notStrictEqual(remoteCli.code, 0);
    assert.match(remoteCli.output, /Marketplace category seed refused unsafe target/);
    assert.doesNotMatch(remoteCli.output, /pg must not load/);

    const firstApply = await runMarketplaceCategorySeed(pool, { apply: true });
    assert.strictEqual(firstApply.added.length, records.length);
    assert.strictEqual(firstApply.existing.length, 0);
    assert.strictEqual(firstApply.updated.length, 0);
    assert.strictEqual(firstApply.conflicts.length, 0);
    assert.strictEqual(firstApply.stats_created, records.length);

    const seededRows = await pool.query(`
        SELECT id, name, parent_id, slug, path, depth
        FROM categories
        WHERE slug = ANY($1::TEXT[])
    `, [records.map((record) => record.slug)]);
    assert.strictEqual(seededRows.rowCount, records.length);
    const seededBySlug = new Map(seededRows.rows.map((row) => [row.slug, row]));
    const recordByKey = new Map(records.map((record) => [record.key, record]));
    records.forEach((record) => {
        const row = seededBySlug.get(record.slug);
        assert(row, `Missing seeded slug: ${record.slug}`);
        assert.strictEqual(row.name, record.name);
        assert.strictEqual(row.path, record.path);
        assert.strictEqual(Number(row.depth), record.depth);
        const parentRecord = record.parentKey ? recordByKey.get(record.parentKey) : null;
        const expectedParentId = parentRecord
            ? Number(seededBySlug.get(parentRecord.slug).id)
            : null;
        assert.strictEqual(row.parent_id === null ? null : Number(row.parent_id), expectedParentId);
    });

    const uniqueness = await pool.query(`
        SELECT
            COUNT(*)::INTEGER AS total,
            COUNT(DISTINCT LOWER(slug))::INTEGER AS unique_slugs,
            COUNT(DISTINCT LOWER(path))::INTEGER AS unique_paths
        FROM categories
        WHERE slug = ANY($1::TEXT[])
    `, [records.map((record) => record.slug)]);
    assert.deepStrictEqual(uniqueness.rows[0], {
        total: records.length,
        unique_slugs: records.length,
        unique_paths: records.length
    });

    const repeatedNames = await pool.query(`
        SELECT name, COUNT(*)::INTEGER AS count,
               COUNT(DISTINCT parent_id)::INTEGER AS parent_count
        FROM categories
        WHERE name IN ('Giyim', 'Üst Giyim', 'Alt Giyim', 'Takım')
        GROUP BY name
    `);
    assert(repeatedNames.rows.some((row) => row.name === 'Giyim' && row.count === 2));
    assert(repeatedNames.rows.every((row) => row.count === row.parent_count));

    const stats = await pool.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM category_stats stats
        JOIN categories category ON category.id=stats.category_id
        WHERE category.slug = ANY($1::TEXT[])
    `, [records.map((record) => record.slug)]);
    assert.strictEqual(stats.rows[0].count, records.length);

    const preserved = await pool.query(`
        SELECT
            EXISTS(SELECT 1 FROM categories WHERE id=$1 AND slug='korunan-kategori') AS category_ok,
            EXISTS(SELECT 1 FROM products WHERE id=$2 AND name='Korunan Ürün') AS product_ok
    `, [sentinelCategoryId, sentinelProductId]);
    assert.deepStrictEqual(preserved.rows[0], { category_ok: true, product_ok: true });

    const legacyColumns = await pool.query(`
        SELECT COUNT(*)::INTEGER AS count
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='products'
          AND column_name IN ('category', 'categories')
    `);
    assert.strictEqual(legacyColumns.rows[0].count, 2);

    const api = await startApi();
    try {
        const publicResponse = await fetch(`${api.base}/api/public/categories?format=flat`);
        assert.strictEqual(publicResponse.status, 200);
        assert.deepStrictEqual(await publicResponse.json(), []);

        const adminResponse = await fetch(`${api.base}/api/admin/categories?format=flat`, {
            headers: adminHeaders
        });
        assert.strictEqual(adminResponse.status, 200);
        const adminCategories = await adminResponse.json();
        assert.strictEqual(adminCategories.length, records.length + 1);
        assert(adminCategories.some((category) => category.slug === 'moda-ve-giyim'));
        assert(adminCategories.some((category) => category.slug === 'elektronik'));
    } finally {
        await new Promise((resolve) => api.server.close(resolve));
    }

    const countBeforeSecondApply = Number(
        (await pool.query('SELECT COUNT(*)::INTEGER AS count FROM categories')).rows[0].count
    );
    const secondApply = await runMarketplaceCategorySeed(pool, { apply: true });
    assert.strictEqual(secondApply.added.length, 0);
    assert.strictEqual(secondApply.updated.length, 0);
    assert.strictEqual(secondApply.existing.length, records.length);
    assert.strictEqual(secondApply.conflicts.length, 0);
    assert.strictEqual(secondApply.stats_created, 0);
    assert.strictEqual(
        Number((await pool.query('SELECT COUNT(*)::INTEGER AS count FROM categories')).rows[0].count),
        countBeforeSecondApply
    );

    const guardedParent = await pool.query(`
        INSERT INTO categories (
            name, slug, path, depth, is_active, is_customer_visible
        )
        VALUES (
            'Ürün Bağlı Seed Parent', 'urun-bagli-seed-parent',
            'urun-bagli-seed-parent', 0, TRUE, TRUE
        )
        RETURNING id
    `);
    const guardedParentId = Number(guardedParent.rows[0].id);
    await pool.query(
        'INSERT INTO category_stats (category_id) VALUES ($1)',
        [guardedParentId]
    );
    await pool.query(`
        INSERT INTO product_categories (product_id, category_id, is_primary)
        VALUES ($1, $2, TRUE)
    `, [sentinelProductId, guardedParentId]);
    const guardedTree = [{
        name: 'Ürün Bağlı Seed Parent',
        children: [{ name: 'Eklenmemesi Gereken Child', children: [] }]
    }];
    const guardedDryRun = await runMarketplaceCategorySeed(pool, { tree: guardedTree });
    assert.strictEqual(guardedDryRun.conflicts.length, 1);
    assert.strictEqual(guardedDryRun.conflicts[0].reason, 'parent_has_products');
    await assert.rejects(
        () => runMarketplaceCategorySeed(pool, { apply: true, tree: guardedTree }),
        (error) => error.code === 'MARKETPLACE_CATEGORY_SEED_CONFLICT'
    );
    assert.strictEqual(
        Number((await pool.query(
            `SELECT COUNT(*)::INTEGER AS count
             FROM categories WHERE slug='eklenmemesi-gereken-child'`
        )).rows[0].count),
        0
    );

    console.log(`marketplace category seed smoke passed (${records.length} categories)`);
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await pool.end();
});
