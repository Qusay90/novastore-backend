const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const pool = require('../config/db');
const { createAuthSessionFixture } = require('./helpers/createAuthSessionFixture');
const { resolveStartupSafety } = require('../config/startupSafety');
const {
    applyCategoryV2Schema,
    applyCategoryV2BackfillConstraints
} = require('../models/categoryV2Schema');
const { applyAuthSessionSchema } = require('../models/authSessionSchema');
const { recalculateCategoryStats } = require('../services/categoryV2BackfillService');
const {
    assertCategoryMoveAllowed,
    flattenCategoryTree
} = require('../services/categoryService');
const { seedCurrentAdminUsers } = require('./helpers/seedCurrentAdminUsers');

process.env.JWT_SECRET = 'category-api-smoke-secret';

const authFixture = createAuthSessionFixture();
authFixture.install();

const adminCategoryRoutes = require('../routes/adminCategoryRoutes');
const publicCategoryRoutes = require('../routes/publicCategoryRoutes');
const legacyCategoryRoutes = require('../routes/categoryRoutes');

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

const startApi = async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin/categories', adminCategoryRoutes);
    app.use('/api/public/categories', publicCategoryRoutes);
    app.use('/api/categories', legacyCategoryRoutes);
    const server = http.createServer(app);

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    return {
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`
    };
};

const stopApi = (server) =>
    new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

const requestJson = async (baseUrl, url, options = {}) => {
    const response = await fetch(`${baseUrl}${url}`, options);
    const body = await response.json();
    return { status: response.status, body };
};

const bearer = (role) => ({
    Authorization: `Bearer ${authFixture.issue({
        userId: role === 'admin' ? 1 : 2,
        role,
        principal: role === 'admin' ? 'admin' : 'customer'
    }).token}`
});

(async () => {
    const safety = assertSafeDisposableTarget();
    const client = await pool.connect();
    let api;

    try {
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await applyCategoryV2Schema(client);
        await applyCategoryV2BackfillConstraints(client);
        await seedCurrentAdminUsers(client);
        await applyAuthSessionSchema(client);

        const categoryResult = await client.query(`
            INSERT INTO categories (
                name,
                parent_id,
                slug,
                path,
                depth,
                sort_order,
                is_active,
                is_customer_visible,
                deleted_at,
                seo_title,
                image_url,
                banner_url,
                icon,
                accent_color
            )
            VALUES
                ('Görünür Root', NULL, 'gorunur-root', 'gorunur-root', 0, 1, TRUE, TRUE, NULL, 'Root SEO', 'root.jpg', 'banner.jpg', 'root-icon', '#F7941D'),
                ('Boş Root', NULL, 'bos-root', 'bos-root', 0, 2, TRUE, TRUE, NULL, NULL, NULL, NULL, NULL, NULL),
                ('Pasif Root', NULL, 'pasif-root', 'pasif-root', 0, 3, FALSE, TRUE, NULL, NULL, NULL, NULL, NULL, NULL),
                ('Silinmiş Root', NULL, 'silinmis-root', 'silinmis-root', 0, 4, TRUE, TRUE, CURRENT_TIMESTAMP, NULL, NULL, NULL, NULL, NULL),
                ('Gizli Root', NULL, 'gizli-root', 'gizli-root', 0, 5, TRUE, FALSE, NULL, NULL, NULL, NULL, NULL, NULL),
                ('Pasif Parent', NULL, 'pasif-parent', 'pasif-parent', 0, 6, FALSE, TRUE, NULL, NULL, NULL, NULL, NULL, NULL)
            RETURNING id, name
        `);
        const ids = new Map(categoryResult.rows.map((row) => [row.name, Number(row.id)]));

        const childResult = await client.query(
            `INSERT INTO categories (
                name, parent_id, slug, path, depth, sort_order, is_active, is_customer_visible
             )
             VALUES
                ('Tükenenler', $1, 'tukenenler', 'gorunur-root/tukenenler', 1, 1, TRUE, TRUE),
                ('Satılabilirler', $1, 'satilabilirler', 'gorunur-root/satilabilirler', 1, 2, TRUE, TRUE),
                ('Yetim Olmamalı', $2, 'yetim-olmamali', 'pasif-parent/yetim-olmamali', 1, 1, TRUE, TRUE)
             RETURNING id, name`,
            [ids.get('Görünür Root'), ids.get('Pasif Parent')]
        );
        childResult.rows.forEach((row) => ids.set(row.name, Number(row.id)));

        const productResult = await client.query(`
            INSERT INTO products (
                name, price, stock, category, categories, publication_status, is_customer_visible, deleted_at
            )
            VALUES
                ('Tükenen Ürün', 100, 0, 'Tükenenler', ARRAY['Tükenenler']::TEXT[], 'active', TRUE, NULL),
                ('Satılabilir Ürün', 200, 5, 'Satılabilirler', ARRAY['Satılabilirler']::TEXT[], 'active', TRUE, NULL),
                ('Pasif Kategori Ürünü', 300, 3, 'Pasif Root', ARRAY['Pasif Root']::TEXT[], 'active', TRUE, NULL),
                ('Silinmiş Kategori Ürünü', 400, 3, 'Silinmiş Root', ARRAY['Silinmiş Root']::TEXT[], 'active', TRUE, NULL),
                ('Gizli Kategori Ürünü', 500, 3, 'Gizli Root', ARRAY['Gizli Root']::TEXT[], 'active', TRUE, NULL),
                ('Yetim Ürün', 600, 3, 'Yetim Olmamalı', ARRAY['Yetim Olmamalı']::TEXT[], 'active', TRUE, NULL)
            RETURNING id, name
        `);
        const productIds = new Map(productResult.rows.map((row) => [row.name, Number(row.id)]));
        const relationRows = [
            ['Tükenen Ürün', 'Tükenenler'],
            ['Satılabilir Ürün', 'Satılabilirler'],
            ['Pasif Kategori Ürünü', 'Pasif Root'],
            ['Silinmiş Kategori Ürünü', 'Silinmiş Root'],
            ['Gizli Kategori Ürünü', 'Gizli Root'],
            ['Yetim Ürün', 'Yetim Olmamalı']
        ];
        for (const [productName, categoryName] of relationRows) {
            await client.query(
                `INSERT INTO product_categories (product_id, category_id, is_primary)
                 VALUES ($1, $2, TRUE)`,
                [productIds.get(productName), ids.get(categoryName)]
            );
        }
        await recalculateCategoryStats(client);

        const serviceRows = (await client.query(`
            SELECT id, parent_id
            FROM categories
            ORDER BY id
        `)).rows;
        assert.throws(
            () => assertCategoryMoveAllowed(serviceRows, ids.get('Görünür Root'), ids.get('Tükenenler')),
            (error) => error && error.code === 'CATEGORY_CYCLE'
        );
        assert.strictEqual(
            assertCategoryMoveAllowed(serviceRows, ids.get('Satılabilirler'), null),
            true
        );

        api = await startApi();

        const unauthorized = await requestJson(api.baseUrl, '/api/admin/categories');
        assert.strictEqual(unauthorized.status, 401);
        const customer = await requestJson(api.baseUrl, '/api/admin/categories', {
            headers: bearer('customer')
        });
        assert.strictEqual(customer.status, 401);

        const adminTree = await requestJson(api.baseUrl, '/api/admin/categories', {
            headers: bearer('admin')
        });
        assert.strictEqual(adminTree.status, 200);
        assert.strictEqual(flattenCategoryTree(adminTree.body).length, 9);
        const adminEmpty = flattenCategoryTree(adminTree.body).find((item) => item.slug === 'bos-root');
        assert(adminEmpty);
        assert.strictEqual(adminEmpty.subtree_visible_product_count, 0);
        assert(Object.hasOwn(adminEmpty, 'deleted_at'));
        assert(Object.hasOwn(adminEmpty, 'seo_title'));

        const adminFlat = await requestJson(api.baseUrl, '/api/admin/categories?format=flat', {
            headers: bearer('admin')
        });
        assert.strictEqual(adminFlat.status, 200);
        assert.strictEqual(adminFlat.body.length, 9);
        assert(!Object.hasOwn(adminFlat.body[0], 'children'));

        const publicTree = await requestJson(api.baseUrl, '/api/public/categories');
        assert.strictEqual(publicTree.status, 200);
        assert.strictEqual(publicTree.body.length, 1);
        assert.strictEqual(publicTree.body[0].slug, 'gorunur-root');
        assert.deepStrictEqual(
            publicTree.body[0].children.map((category) => category.slug).sort(),
            ['satilabilirler', 'tukenenler']
        );

        const publicFlat = await requestJson(api.baseUrl, '/api/public/categories?format=flat');
        assert.strictEqual(publicFlat.status, 200);
        assert.deepStrictEqual(
            publicFlat.body.map((category) => category.slug).sort(),
            ['gorunur-root', 'satilabilirler', 'tukenenler']
        );
        assert(!publicFlat.body.some((category) => category.slug === 'yetim-olmamali'));
        assert(!publicFlat.body.some((category) => category.slug === 'bos-root'));
        assert(!publicFlat.body.some((category) => category.slug === 'pasif-root'));
        assert(!publicFlat.body.some((category) => category.slug === 'silinmis-root'));
        assert(!publicFlat.body.some((category) => category.slug === 'gizli-root'));

        const outOfStockDetail = await requestJson(
            api.baseUrl,
            '/api/public/categories/tukenenler'
        );
        assert.strictEqual(outOfStockDetail.status, 200);
        assert.strictEqual(outOfStockDetail.body.category.visible_product_count, 1);
        assert.strictEqual(outOfStockDetail.body.category.sellable_product_count, 0);
        assert.deepStrictEqual(
            outOfStockDetail.body.breadcrumb.map((category) => category.slug),
            ['gorunur-root', 'tukenenler']
        );

        for (const slug of ['bos-root', 'pasif-root', 'silinmis-root', 'gizli-root', 'yetim-olmamali']) {
            const hiddenDetail = await requestJson(api.baseUrl, `/api/public/categories/${slug}`);
            assert.strictEqual(hiddenDetail.status, 404, `${slug} should be public 404`);
        }

        const invalidFormat = await requestJson(api.baseUrl, '/api/public/categories?format=xml');
        assert.strictEqual(invalidFormat.status, 400);

        const legacy = await requestJson(api.baseUrl, '/api/categories');
        assert.strictEqual(legacy.status, 200);
        assert.strictEqual(legacy.body.length, 9);
        assert(!Object.hasOwn(legacy.body[0], 'children'));

        const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        assert.match(serverSource, /app\.use\('\/api\/admin\/categories', adminCategoryRoutes\)/);
        assert.match(serverSource, /app\.use\('\/api\/public\/categories', publicCategoryRoutes\)/);
        assert.match(serverSource, /app\.use\('\/api\/categories', categoryRoutes\)/);

        console.log(`category API smoke passed against ${safety.target.label}`);
    } finally {
        if (api?.server) await stopApi(api.server);
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
