const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const { recalculateAllCategoryStats } = require('../services/categoryStatsService');
const { resolveStartupSafety } = require('../config/startupSafety');

const root = path.join(__dirname, '..');
const port = 5198;
let child;

const waitForServer = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 30000);
    const onData = (chunk) => {
        const text = chunk.toString();
        if (text.includes('NovaStore sunucusu')) {
            clearTimeout(timer);
            resolve();
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited before routing smoke: ${code}`));
    });
});

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    const categoryResult = await pool.query(`
        INSERT INTO categories (
            name, slug, path, depth, seo_title, seo_description,
            is_active, is_customer_visible
        )
        VALUES (
            'Temiz Rota', 'temiz-rota', 'temiz-rota', 0,
            'Temiz Rota SEO', 'Temiz kategori açıklaması', TRUE, TRUE
        )
        RETURNING id
    `);
    const categoryId = Number(categoryResult.rows[0].id);
    const productResult = await pool.query(`
        INSERT INTO products (
            name, price, stock, category, categories,
            publication_status, is_customer_visible
        )
        VALUES (
            'Tükenen Rota Ürünü', 100, 0, 'Temiz Rota',
            ARRAY['Temiz Rota']::TEXT[], 'active', TRUE
        )
        RETURNING id
    `);
    await pool.query(
        `INSERT INTO product_categories (product_id, category_id, is_primary)
         VALUES ($1, $2, TRUE)`,
        [productResult.rows[0].id, categoryId]
    );
    await pool.query(
        `INSERT INTO category_aliases (
            category_id, alias, normalized_alias, alias_type, redirect_status
         )
         VALUES ($1, 'eski-rota', 'eski-rota', 'legacy_slug', 301)`,
        [categoryId]
    );
    await recalculateAllCategoryStats(pool);

    child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
            SKIP_SCHEMA_INIT: 'true',
            NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
            DB_SSL: 'false'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer();

    const base = `http://127.0.0.1:${port}`;
    const canonical = await fetch(`${base}/kategori/temiz-rota`, { redirect: 'manual' });
    assert.strictEqual(canonical.status, 200);
    assert.match(await canonical.text(), /catalog-navigation\.js/);

    const alternate = await fetch(`${base}/category/temiz-rota`, { redirect: 'manual' });
    assert.strictEqual(alternate.status, 301);
    assert.strictEqual(alternate.headers.get('location'), '/kategori/temiz-rota');

    const alias = await fetch(`${base}/kategori/eski-rota`, { redirect: 'manual' });
    assert.strictEqual(alias.status, 301);
    assert.strictEqual(alias.headers.get('location'), '/kategori/temiz-rota');

    const apiAlias = await fetch(`${base}/api/public/categories/eski-rota`, { redirect: 'manual' });
    assert.strictEqual(apiAlias.status, 301);
    assert.strictEqual(apiAlias.headers.get('location'), '/api/public/categories/temiz-rota');

    const legacyQuery = await fetch(`${base}/categories.html?slug=temiz-rota`);
    assert.strictEqual(legacyQuery.status, 200);
    assert.match(await legacyQuery.text(), /native-categories-list/);

    const missing = await fetch(`${base}/kategori/bulunamayan`, { redirect: 'manual' });
    assert.strictEqual(missing.status, 404);
    assert.match(await missing.text(), /native-categories-list/);

    console.log('web category routing smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (child && !child.killed) child.kill();
    await pool.end();
});
