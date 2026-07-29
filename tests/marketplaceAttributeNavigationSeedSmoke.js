const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { spawn } = require('child_process');
const pool = require('../config/db');
const { createAuthSessionFixture } = require('./helpers/createAuthSessionFixture');
const createCoreSchema = require('../models/createCoreDb');
const createCommerceSchema = require('../models/createCommerceDb');
const createNotificationsTable = require('../models/createNotificationDb');
const { resolveStartupSafety } = require('../config/startupSafety');
const { runMarketplaceCategorySeed } = require('../services/marketplaceCategorySeedService');
const {
    runMarketplaceAttributeSeed,
    buildTemplateBindings
} = require('../services/marketplaceAttributeSeedService');
const { runMarketplaceNavigationSeed } = require('../services/marketplaceNavigationSeedService');
const { recalculateAllCategoryStats } = require('../services/categoryStatsService');
const { buildLocalServerEnv } = require('./helpers/localServerProcess');
const adminAttributeRoutes = require('../routes/adminAttributeRoutes');
const adminMenuRoutes = require('../routes/adminMenuRoutes');
const adminCollectionRoutes = require('../routes/adminCollectionRoutes');
const publicCategoryRoutes = require('../routes/publicCategoryRoutes');
const publicNavigationRoutes = require('../routes/publicNavigationRoutes');
const publicCollectionRoutes = require('../routes/publicCollectionRoutes');
const { seedCurrentAdminUsers } = require('./helpers/seedCurrentAdminUsers');

const root = path.join(__dirname, '..');
process.env.JWT_SECRET = 'marketplace-attribute-navigation-seed-smoke';
const authFixture = createAuthSessionFixture();
authFixture.install();
const adminHeaders = {
    Authorization: `Bearer ${authFixture.issue({ userId: 1, role: 'admin', principal: 'admin' }).token}`
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

const startApi = async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminAttributeRoutes);
    app.use('/api/admin', adminMenuRoutes);
    app.use('/api/admin', adminCollectionRoutes);
    app.use('/api/public/categories', publicCategoryRoutes);
    app.use('/api/public/navigation', publicNavigationRoutes);
    app.use('/api/public/collections', publicCollectionRoutes);
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return { server, base: `http://127.0.0.1:${server.address().port}` };
};

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.shouldRunSchemaInit, true);
    assert.strictEqual(safety.target.label, '127.0.0.1:55432/novastore_category_v2_test');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    await seedCurrentAdminUsers(pool);
    await createNotificationsTable();
    await createCommerceSchema();
    await runMarketplaceCategorySeed(pool, { apply: true });

    const sentinelAttribute = await pool.query(`
        INSERT INTO attribute_definitions (
            code, name, type, is_filterable, sort_order
        )
        VALUES ('sentinel_attr', 'Korunan Attribute', 'text', FALSE, 999)
        RETURNING id
    `);
    const sentinelAttributeId = Number(sentinelAttribute.rows[0].id);
    const sentinelCollection = await pool.query(`
        INSERT INTO collections (
            name, slug, collection_type, sort_order, is_active
        )
        VALUES ('Korunan Koleksiyon', 'korunan-koleksiyon', 'manual', 999, TRUE)
        RETURNING id
    `);
    const sentinelCollectionId = Number(sentinelCollection.rows[0].id);

    const countsBeforeDryRun = await pool.query(`
        SELECT
            (SELECT COUNT(*)::INTEGER FROM attribute_definitions) AS attributes,
            (SELECT COUNT(*)::INTEGER FROM attribute_options) AS options,
            (SELECT COUNT(*)::INTEGER FROM attribute_templates) AS templates,
            (SELECT COUNT(*)::INTEGER FROM template_attributes) AS links,
            (SELECT COUNT(*)::INTEGER FROM collections) AS collections,
            (SELECT COUNT(*)::INTEGER FROM menus) AS menus,
            (SELECT COUNT(*)::INTEGER FROM menu_items) AS menu_items
    `);
    const attributeDryRun = await runMarketplaceAttributeSeed(pool);
    const navigationDryRun = await runMarketplaceNavigationSeed(pool);
    assert.strictEqual(attributeDryRun.attributes.added.length, 40);
    assert.strictEqual(attributeDryRun.options.added.length, 50);
    assert.strictEqual(attributeDryRun.templates.added.length, 104);
    assert.strictEqual(attributeDryRun.links.added.length, 526);
    assert.strictEqual(navigationDryRun.collections.added.length, 4);
    assert.strictEqual(navigationDryRun.menu_items.added.length, 12);
    const countsAfterDryRun = await pool.query(`
        SELECT
            (SELECT COUNT(*)::INTEGER FROM attribute_definitions) AS attributes,
            (SELECT COUNT(*)::INTEGER FROM attribute_options) AS options,
            (SELECT COUNT(*)::INTEGER FROM attribute_templates) AS templates,
            (SELECT COUNT(*)::INTEGER FROM template_attributes) AS links,
            (SELECT COUNT(*)::INTEGER FROM collections) AS collections,
            (SELECT COUNT(*)::INTEGER FROM menus) AS menus,
            (SELECT COUNT(*)::INTEGER FROM menu_items) AS menu_items
    `);
    assert.deepStrictEqual(countsAfterDryRun.rows[0], countsBeforeDryRun.rows[0]);

    for (const script of ['seedMarketplaceAttributes.js', 'seedMarketplaceNavigation.js']) {
        const localDryRun = await runChild(
            [`scripts/${script}`],
            buildLocalServerEnv()
        );
        assert.strictEqual(localDryRun.code, 0, localDryRun.output);
        assert.match(localDryRun.output, /"mode": "dry-run"/);

        const remoteApply = await runChild(
            [`scripts/${script}`, '--apply'],
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
        assert.notStrictEqual(remoteApply.code, 0);
        assert.match(remoteApply.output, /Marketplace category seed refused unsafe target/);
        assert.doesNotMatch(remoteApply.output, /pg must not load/);
    }

    const firstAttributes = await runMarketplaceAttributeSeed(pool, { apply: true });
    assert.strictEqual(firstAttributes.attributes.added.length, 40);
    assert.strictEqual(firstAttributes.options.added.length, 50);
    assert.strictEqual(firstAttributes.templates.added.length, 104);
    assert.strictEqual(firstAttributes.links.added.length, 526);
    assert.strictEqual(firstAttributes.conflicts.length, 0);

    const firstNavigation = await runMarketplaceNavigationSeed(pool, { apply: true });
    assert.strictEqual(firstNavigation.collections.added.length, 4);
    assert.strictEqual(firstNavigation.menus.added.length, 1);
    assert.strictEqual(firstNavigation.menu_items.added.length, 12);
    assert.strictEqual(firstNavigation.conflicts.length, 0);

    const secondAttributes = await runMarketplaceAttributeSeed(pool, { apply: true });
    assert.strictEqual(secondAttributes.attributes.added.length, 0);
    assert.strictEqual(secondAttributes.attributes.existing.length, 40);
    assert.strictEqual(secondAttributes.options.added.length, 0);
    assert.strictEqual(secondAttributes.options.existing.length, 50);
    assert.strictEqual(secondAttributes.templates.added.length, 0);
    assert.strictEqual(secondAttributes.templates.existing.length, 104);
    assert.strictEqual(secondAttributes.links.added.length, 0);
    assert.strictEqual(secondAttributes.links.existing.length, 526);

    const secondNavigation = await runMarketplaceNavigationSeed(pool, { apply: true });
    assert.strictEqual(secondNavigation.collections.added.length, 0);
    assert.strictEqual(secondNavigation.collections.existing.length, 4);
    assert.strictEqual(secondNavigation.menu_items.added.length, 0);
    assert.strictEqual(secondNavigation.menu_items.existing.length, 12);

    await pool.query(`
        INSERT INTO attribute_definitions (code, name, type)
        VALUES ('seed_conflict_code', 'Conflict', 'text')
    `);
    await assert.rejects(
        () => runMarketplaceAttributeSeed(pool, {
            apply: true,
            attributes: [
                { code: 'rollback_probe', name: 'Rollback Probe', type: 'text' },
                { code: 'seed_conflict_code', name: 'Conflict', type: 'number' }
            ],
            templateSpecs: []
        }),
        (error) => error.code === 'MARKETPLACE_ATTRIBUTE_SEED_CONFLICT'
    );
    assert.strictEqual(
        Number((await pool.query(
            `SELECT COUNT(*)::INTEGER AS count
             FROM attribute_definitions WHERE code='rollback_probe'`
        )).rows[0].count),
        0
    );

    const smartPhone = await pool.query(
        `SELECT id FROM categories WHERE slug='akilli-telefon'`
    );
    const smartPhoneId = Number(smartPhone.rows[0].id);
    const product = await pool.query(`
        INSERT INTO products (
            name, price, stock, category, categories,
            publication_status, is_customer_visible
        )
        VALUES (
            'Seeded Attribute Telefon', 1000, 5, 'Akıllı Telefon',
            ARRAY['Akıllı Telefon']::TEXT[], 'active', TRUE
        )
        RETURNING id
    `);
    const productId = Number(product.rows[0].id);
    await pool.query(`
        INSERT INTO product_categories (product_id, category_id, is_primary)
        VALUES ($1,$2,TRUE)
    `, [productId, smartPhoneId]);
    const definitions = await pool.query(`
        SELECT id, code FROM attribute_definitions
        WHERE code IN ('marka','ram','renk')
    `);
    const definitionByCode = new Map(definitions.rows.map((row) => [row.code, Number(row.id)]));
    const black = await pool.query(`
        SELECT id FROM attribute_options
        WHERE attribute_id=$1 AND value='siyah'
    `, [definitionByCode.get('renk')]);
    await pool.query(`
        INSERT INTO product_attribute_values (
            product_id, attribute_id, text_value
        ) VALUES ($1,$2,'NovaPhone')
    `, [productId, definitionByCode.get('marka')]);
    await pool.query(`
        INSERT INTO product_attribute_values (
            product_id, attribute_id, number_value
        ) VALUES ($1,$2,8)
    `, [productId, definitionByCode.get('ram')]);
    await pool.query(`
        INSERT INTO product_attribute_values (
            product_id, attribute_id, option_id
        ) VALUES ($1,$2,$3)
    `, [productId, definitionByCode.get('renk'), Number(black.rows[0].id)]);
    await recalculateAllCategoryStats(pool);

    const api = await startApi();
    try {
        const resolvedResponse = await fetch(
            `${api.base}/api/admin/attribute-templates/resolve?categoryIds=${encodeURIComponent(JSON.stringify([smartPhoneId]))}`,
            { headers: adminHeaders }
        );
        assert.strictEqual(resolvedResponse.status, 200);
        const resolved = await resolvedResponse.json();
        assert.deepStrictEqual(
            resolved.attributes.map((item) => item.code).sort(),
            ['depolama', 'ekran_boyutu', 'garanti_suresi', 'kamera', 'marka', 'model', 'ram', 'renk', 'suya_dayanikli'].sort()
        );

        const facetResponse = await fetch(
            `${api.base}/api/public/categories/akilli-telefon/filters`
        );
        assert.strictEqual(facetResponse.status, 200);
        const facets = await facetResponse.json();
        assert(facets.filters.some((item) => item.code === 'marka'));
        assert(facets.filters.some((item) => item.code === 'ram'));
        assert(facets.filters.some((item) => item.code === 'renk'));

        const adminMenus = await fetch(`${api.base}/api/admin/menus`, { headers: adminHeaders });
        assert.strictEqual(adminMenus.status, 200);
        assert((await adminMenus.json()).some((menu) => menu.code === 'main' && menu.item_count === 12));
        const adminCollections = await fetch(`${api.base}/api/admin/collections`, { headers: adminHeaders });
        assert.strictEqual(adminCollections.status, 200);
        const adminCollectionRows = await adminCollections.json();
        assert(['yeni-gelenler', 'indirim', 'cok-satanlar', 'vitrin'].every((slug) =>
            adminCollectionRows.some((collection) => collection.slug === slug)
        ));

        const publicNavigation = await fetch(`${api.base}/api/public/navigation/main`);
        assert.strictEqual(publicNavigation.status, 200);
        const navigation = await publicNavigation.json();
        assert(navigation.items.some((item) => item.title === 'Elektronik'));
        assert(navigation.items.some((item) => item.title === 'Yeni Gelenler'));
        assert(!navigation.items.some((item) => item.title === 'Moda'));
        assert(!navigation.items.some((item) => item.title === 'İndirim'));

        const publicCollections = await fetch(`${api.base}/api/public/collections`);
        assert.strictEqual(publicCollections.status, 200);
        const publicCollectionRows = await publicCollections.json();
        assert(publicCollectionRows.some((collection) => collection.slug === 'yeni-gelenler'));
        assert(!publicCollectionRows.some((collection) => collection.slug === 'vitrin'));

        const publicCategories = await fetch(`${api.base}/api/public/categories?format=flat`);
        const publicCategoryRows = await publicCategories.json();
        assert(publicCategoryRows.some((category) => category.slug === 'akilli-telefon'));
        assert(!publicCategoryRows.some((category) => category.slug === 'moda-ve-giyim'));
    } finally {
        await new Promise((resolve) => api.server.close(resolve));
    }

    const adminProductSource = fs.readFileSync(
        path.join(root, 'frontend', 'admin-products.js'),
        'utf8'
    );
    assert(adminProductSource.includes('/api/admin/attribute-templates/resolve?categoryIds='));
    assert(adminProductSource.includes('state.attributeDefinitions ='));
    assert.strictEqual(buildTemplateBindings().length, 104);

    const preserved = await pool.query(`
        SELECT
            EXISTS(SELECT 1 FROM attribute_definitions WHERE id=$1 AND code='sentinel_attr') AS attribute_ok,
            EXISTS(SELECT 1 FROM collections WHERE id=$2 AND slug='korunan-koleksiyon') AS collection_ok
    `, [sentinelAttributeId, sentinelCollectionId]);
    assert.deepStrictEqual(preserved.rows[0], { attribute_ok: true, collection_ok: true });

    console.log('marketplace attribute/navigation seed smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await pool.end();
});
