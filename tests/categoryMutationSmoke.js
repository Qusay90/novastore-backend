const assert = require('assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const { resolveStartupSafety } = require('../config/startupSafety');
const { recalculateAllCategoryStats, reconcileCategoryStats } = require('../services/categoryStatsService');
const { seedCurrentAdminUsers } = require('./helpers/seedCurrentAdminUsers');
const adminRoutes = require('../routes/adminCategoryRoutes');
const publicRoutes = require('../routes/publicCategoryRoutes');
const legacyRoutes = require('../routes/categoryRoutes');

process.env.JWT_SECRET = 'category-mutation-smoke-secret';
const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
};

const startApi = async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin/categories', adminRoutes);
    app.use('/api/public/categories', publicRoutes);
    app.use('/api/categories', legacyRoutes);
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return { server, base: `http://127.0.0.1:${server.address().port}` };
};

const request = async (base, url, { method = 'GET', body, headers = {}, redirect = 'follow' } = {}) => {
    const response = await fetch(`${base}${url}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect
    });
    const text = await response.text();
    const isJson = String(response.headers.get('content-type') || '').includes('application/json');
    return {
        status: response.status,
        headers: response.headers,
        body: text ? (isJson ? JSON.parse(text) : text) : null
    };
};

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.shouldRunSchemaInit, true);
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    await seedCurrentAdminUsers(pool);
    const api = await startApi();

    try {
        const unauthorized = await request(api.base, '/api/admin/categories', {
            method: 'POST',
            body: { name: 'Unauthorized' },
            headers: { 'Content-Type': 'application/json' }
        });
        assert.strictEqual(unauthorized.status, 401);

        const createRoot = async (name, extra = {}) => request(api.base, '/api/admin/categories', {
            method: 'POST',
            headers: adminHeaders,
            body: { name, ...extra }
        });
        const rootAResponse = await createRoot('Root A', {
            image_url: 'root-a.jpg',
            banner_url: 'root-a-banner.jpg',
            icon: 'root-a-icon',
            accent_color: '#F7941D',
            seo_title: 'Root A SEO'
        });
        const rootBResponse = await createRoot('Root B');
        const rootCResponse = await createRoot('Root C');
        assert.strictEqual(rootAResponse.status, 201);
        assert.strictEqual(rootBResponse.status, 201);
        assert.strictEqual(rootCResponse.status, 201);
        const rootA = rootAResponse.body.category;
        const rootB = rootBResponse.body.category;
        const rootC = rootCResponse.body.category;
        assert.strictEqual(rootA.slug, 'root-a');
        assert.strictEqual(rootA.path, 'root-a');
        assert.strictEqual(rootA.depth, 0);
        assert.strictEqual(rootA.image_url, 'root-a.jpg');

        const childResponse = await createRoot('Movable Child', { parentId: rootA.id, sort_order: 8 });
        const sameNameFirstParent = await createRoot('Shared Name', { parentId: rootA.id });
        const sameNameOtherParent = await createRoot('Shared Name', { parentId: rootB.id });
        const duplicateSameParent = await createRoot('Shared Name', { parentId: rootA.id });
        assert.strictEqual(childResponse.status, 201);
        assert.strictEqual(sameNameFirstParent.status, 201);
        assert.strictEqual(sameNameOtherParent.status, 201);
        assert.strictEqual(duplicateSameParent.status, 409);
        assert.notStrictEqual(
            sameNameFirstParent.body.category.slug,
            sameNameOtherParent.body.category.slug
        );
        assert.notStrictEqual(
            sameNameFirstParent.body.category.path,
            sameNameOtherParent.body.category.path
        );
        const conflictingSharedMove = await request(
            api.base,
            `/api/admin/categories/${sameNameFirstParent.body.category.id}/move`,
            {
                method: 'PATCH',
                headers: adminHeaders,
                body: { parentId: rootB.id }
            }
        );
        assert.strictEqual(conflictingSharedMove.status, 409);
        assert.strictEqual(conflictingSharedMove.body.code, 'CATEGORY_CONFLICT');
        const allowedSharedMove = await request(
            api.base,
            `/api/admin/categories/${sameNameFirstParent.body.category.id}/move`,
            {
                method: 'PATCH',
                headers: adminHeaders,
                body: { parentId: rootC.id }
            }
        );
        assert.strictEqual(allowedSharedMove.status, 200);
        const sharedRows = await pool.query(`
            SELECT id, name, slug, path
            FROM categories
            WHERE id = ANY($1::INTEGER[])
            ORDER BY id
        `, [[sameNameFirstParent.body.category.id, sameNameOtherParent.body.category.id]]);
        assert.strictEqual(new Set(sharedRows.rows.map((row) => row.name)).size, 1);
        assert.strictEqual(new Set(sharedRows.rows.map((row) => row.slug)).size, 2);
        assert.strictEqual(new Set(sharedRows.rows.map((row) => row.path)).size, 2);
        assert(sharedRows.rows.some((row) => row.path === 'root-c/shared-name'));
        assert(sharedRows.rows.some((row) => row.path === 'root-b/shared-name-2'));
        const child = childResponse.body.category;

        const grandResponse = await createRoot('Grand Child', { parentId: child.id });
        assert.strictEqual(grandResponse.status, 201);
        const grand = grandResponse.body.category;
        assert.strictEqual(grand.path, 'root-a/movable-child/grand-child');
        assert.strictEqual(grand.depth, 2);

        const moved = await request(api.base, `/api/admin/categories/${child.id}/move`, {
            method: 'PATCH',
            headers: adminHeaders,
            body: { parentId: rootB.id, sortOrder: 3 }
        });
        assert.strictEqual(moved.status, 200);
        const movedGrand = await pool.query('SELECT path, depth FROM categories WHERE id=$1', [grand.id]);
        assert.strictEqual(movedGrand.rows[0].path, 'root-b/movable-child/grand-child');
        assert.strictEqual(Number(movedGrand.rows[0].depth), 2);

        const cycle = await request(api.base, `/api/admin/categories/${rootB.id}/move`, {
            method: 'PATCH',
            headers: adminHeaders,
            body: { parentId: grand.id }
        });
        assert.strictEqual(cycle.status, 409);

        const reordered = await request(api.base, `/api/admin/categories/${child.id}/move`, {
            method: 'PATCH',
            headers: adminHeaders,
            body: { parentId: rootB.id, sortOrder: 1 }
        });
        assert.strictEqual(reordered.status, 200);
        assert.strictEqual(Number(reordered.body.category.sort_order), 1);

        const renamed = await request(api.base, `/api/admin/categories/${rootB.id}`, {
            method: 'PATCH',
            headers: adminHeaders,
            body: {
                slug: 'root-b-canonical',
                description: 'Updated root',
                seo_description: 'Updated SEO'
            }
        });
        assert.strictEqual(renamed.status, 200);
        assert.strictEqual(renamed.body.category.slug, 'root-b-canonical');
        assert.strictEqual(
            (await pool.query('SELECT path FROM categories WHERE id=$1', [grand.id])).rows[0].path,
            'root-b-canonical/movable-child/grand-child'
        );
        const alias = await pool.query(
            `SELECT alias_type FROM category_aliases
             WHERE category_id=$1 AND normalized_alias='root-b'`,
            [rootB.id]
        );
        assert.strictEqual(alias.rows[0].alias_type, 'legacy_slug');

        const product = await pool.query(
            `INSERT INTO products (name, price, stock, category, categories)
             VALUES ('Grand Product', 10, 0, 'Grand Child', ARRAY['Grand Child']::TEXT[])
             RETURNING id`
        );
        await pool.query(
            `INSERT INTO product_categories (product_id, category_id, is_primary)
             VALUES ($1, $2, TRUE)`,
            [product.rows[0].id, grand.id]
        );
        await recalculateAllCategoryStats(pool);

        const riskyChild = await createRoot('Unsafe Child', { parentId: grand.id });
        assert.strictEqual(riskyChild.status, 409);
        assert.strictEqual(riskyChild.body.code, 'CATEGORY_PRODUCTS_REQUIRE_MIGRATION');

        const aliasRedirect = await request(api.base, '/api/public/categories/root-b', {
            redirect: 'manual'
        });
        assert.strictEqual(aliasRedirect.status, 301);
        assert.match(aliasRedirect.headers.get('location'), /root-b-canonical$/);

        const archived = await request(api.base, `/api/admin/categories/${rootB.id}/archive`, {
            method: 'PATCH',
            headers: adminHeaders,
            body: { archived: true }
        });
        assert.strictEqual(archived.status, 200);
        assert.strictEqual(
            (await request(api.base, '/api/public/categories/root-b-canonical')).status,
            404
        );
        const publicTreeAfterArchive = await request(api.base, '/api/public/categories?format=flat');
        assert(!publicTreeAfterArchive.body.some((category) => category.id === grand.id));
        const adminTree = await request(api.base, '/api/admin/categories?format=flat', {
            headers: adminHeaders
        });
        assert(adminTree.body.some((category) => category.id === rootB.id && category.deleted_at));

        const restored = await request(api.base, `/api/admin/categories/${rootB.id}/archive`, {
            method: 'PATCH',
            headers: adminHeaders,
            body: { archived: false }
        });
        assert.strictEqual(restored.status, 200);
        assert.strictEqual(
            (await request(api.base, '/api/public/categories/root-b-canonical')).status,
            200
        );

        const legacyCreate = await request(api.base, '/api/categories', {
            method: 'POST',
            headers: adminHeaders,
            body: { name: 'Legacy Created', parent_id: null }
        });
        assert.strictEqual(legacyCreate.status, 201);
        assert.strictEqual(legacyCreate.body.category.slug, 'legacy-created');
        assert.strictEqual(legacyCreate.body.category.path, 'legacy-created');
        assert.strictEqual(legacyCreate.body.category.depth, 0);
        const legacyStats = await pool.query(
            'SELECT 1 FROM category_stats WHERE category_id=$1',
            [legacyCreate.body.category.id]
        );
        assert.strictEqual(legacyStats.rowCount, 1);
        const legacyGet = await request(api.base, '/api/categories');
        assert(Array.isArray(legacyGet.body));
        assert(!Object.hasOwn(legacyGet.body[0], 'children'));

        const legacyDelete = await request(
            api.base,
            `/api/categories/${legacyCreate.body.category.id}`,
            { method: 'DELETE', headers: adminHeaders }
        );
        assert.strictEqual(legacyDelete.status, 200);
        assert((await pool.query(
            'SELECT deleted_at FROM categories WHERE id=$1',
            [legacyCreate.body.category.id]
        )).rows[0].deleted_at);

        const reconciliation = await reconcileCategoryStats(pool);
        assert.strictEqual(reconciliation.drift.length, 0);
        console.log(`category mutation smoke passed against ${safety.target.label}`);
    } finally {
        await new Promise((resolve) => api.server.close(resolve));
        await pool.end();
    }
})().catch(async (error) => {
    console.error(error);
    try { await pool.end(); } catch (_) {}
    process.exitCode = 1;
});
