const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const createCommerceSchema = require('../models/createCommerceDb');
const createNotificationsTable = require('../models/createNotificationDb');
const { applyMenuCollectionSchema } = require('../models/menuCollectionSchema');
const { recalculateAllCategoryStats } = require('../services/categoryStatsService');
const { resolveStartupSafety } = require('../config/startupSafety');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../constants/orderStatus');

const root = path.join(__dirname, '..');
const port = 5199;
const jwtSecret = 'menu-collection-smoke-only';
let child;

const waitForServer = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Menu/collection server startup timed out')), 30000);
    const onData = (chunk) => {
        if (chunk.toString().includes('NovaStore sunucusu')) {
            clearTimeout(timer);
            resolve();
        }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited before menu/collection smoke: ${code}`));
    });
});

const request = async (pathname, {
    method = 'GET',
    token = null,
    body = undefined
} = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, payload };
};

(async () => {
    const safety = resolveStartupSafety(process.env);
    assert.strictEqual(safety.safeLocalDatabase, true);
    assert.strictEqual(safety.target.database, 'novastore_category_v2_test');

    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await createCoreSchema();
    await createNotificationsTable();
    await createCommerceSchema();

    const categoryResult = await pool.query(`
        INSERT INTO categories (
            name, slug, path, depth, sort_order,
            is_active, is_customer_visible
        )
        VALUES
            ('Görünür Menü Kategorisi', 'gorunur-menu', 'gorunur-menu', 0, 0, TRUE, TRUE),
            ('Boş Menü Kategorisi', 'bos-menu', 'bos-menu', 0, 1, TRUE, TRUE)
        RETURNING id, slug
    `);
    const categoryBySlug = new Map(categoryResult.rows.map((row) => [row.slug, Number(row.id)]));

    const productResult = await pool.query(`
        INSERT INTO products (
            name, description, price, old_price, stock, category, categories,
            publication_status, is_customer_visible, created_at
        )
        VALUES
            ('Yeni Stoklu', 'Yeni ürün', 100, NULL, 5, 'Görünür Menü Kategorisi',
             ARRAY['Görünür Menü Kategorisi']::TEXT[], 'active', TRUE, CURRENT_TIMESTAMP),
            ('İndirimli Tükenen', 'İndirimli ürün', 80, 120, 0, 'Görünür Menü Kategorisi',
             ARRAY['Görünür Menü Kategorisi']::TEXT[], 'active', TRUE, CURRENT_TIMESTAMP),
            ('Çok Satan', 'Satış ürünü', 150, NULL, 4, 'Görünür Menü Kategorisi',
             ARRAY['Görünür Menü Kategorisi']::TEXT[], 'active', TRUE, CURRENT_TIMESTAMP - INTERVAL '2 days'),
            ('Gizli Ürün', 'Public değil', 50, 70, 8, 'Görünür Menü Kategorisi',
             ARRAY['Görünür Menü Kategorisi']::TEXT[], 'draft', TRUE, CURRENT_TIMESTAMP)
        RETURNING id, name
    `);
    const productByName = new Map(productResult.rows.map((row) => [row.name, Number(row.id)]));
    for (const name of ['Yeni Stoklu', 'İndirimli Tükenen', 'Çok Satan']) {
        await pool.query(`
            INSERT INTO product_categories (product_id, category_id, is_primary)
            VALUES ($1, $2, $3)
        `, [
            productByName.get(name),
            categoryBySlug.get('gorunur-menu'),
            name === 'Yeni Stoklu'
        ]);
    }
    await recalculateAllCategoryStats(pool);

    const orderResult = await pool.query(`
        INSERT INTO orders (total_amount, status, items, payment_status, created_at)
        VALUES
            (300, $1, $2::jsonb, $4, CURRENT_TIMESTAMP),
            (0, $1, $3::jsonb, $4, CURRENT_TIMESTAMP)
        RETURNING id
    `, [
        ORDER_STATUS.TESLIM_EDILDI,
        JSON.stringify([
            {
                id: productByName.get('Çok Satan'),
                name: 'Çok Satan',
                quantity: 2,
                price: 150
            },
            'okunamayan'
        ]),
        JSON.stringify({ invalid: true }),
        PAYMENT_STATUS.PAID
    ]);

    await applyMenuCollectionSchema(pool);
    await applyMenuCollectionSchema(pool);
    const backfillResult = await pool.query(`
        SELECT
            (SELECT COUNT(*)::INTEGER FROM order_items WHERE order_id = $1) AS valid_items,
            (SELECT COUNT(*)::INTEGER FROM order_item_backfill_issues
             WHERE order_id IN ($1, $2)) AS issue_count
    `, [orderResult.rows[0].id, orderResult.rows[1].id]);
    assert.strictEqual(backfillResult.rows[0].valid_items, 1);
    assert.strictEqual(backfillResult.rows[0].issue_count, 2);

    const preservedBefore = await pool.query('SELECT COUNT(*)::INTEGER AS count FROM products');
    await applyMenuCollectionSchema(pool);
    const preservedAfter = await pool.query('SELECT COUNT(*)::INTEGER AS count FROM products');
    assert.strictEqual(preservedAfter.rows[0].count, preservedBefore.rows[0].count);

    child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            JWT_SECRET: jwtSecret,
            NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
            SKIP_SCHEMA_INIT: 'true',
            NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
            DB_SSL: 'false'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer();

    const adminToken = jwt.sign({ id: 1, role: 'admin' }, jwtSecret);
    const customerToken = jwt.sign({ id: 2, role: 'customer' }, jwtSecret);

    const unauthenticated = await request('/api/admin/menus');
    assert.strictEqual(unauthenticated.response.status, 401);
    const forbidden = await request('/api/admin/menus', { token: customerToken });
    assert.strictEqual(forbidden.response.status, 403);

    const menuCreate = await request('/api/admin/menus', {
        method: 'POST',
        token: adminToken,
        body: { code: 'main', name: 'Ana Menü' }
    });
    assert.strictEqual(menuCreate.response.status, 201);
    const menuId = menuCreate.payload.menu.id;
    const menuPatch = await request(`/api/admin/menus/${menuId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { name: 'Ana Navigasyon' }
    });
    assert.strictEqual(menuPatch.payload.menu.name, 'Ana Navigasyon');

    const createCollection = async (body) => {
        const result = await request('/api/admin/collections', {
            method: 'POST',
            token: adminToken,
            body
        });
        assert.strictEqual(result.response.status, 201, JSON.stringify(result.payload));
        return result.payload.collection;
    };
    const showcase = await createCollection({
        name: 'Vitrin',
        slug: 'vitrin',
        collection_type: 'manual',
        show_on_home: true
    });
    const emptyCollection = await createCollection({
        name: 'Boş Koleksiyon',
        slug: 'bos-koleksiyon',
        collection_type: 'manual'
    });
    const inactiveCollection = await createCollection({
        name: 'Pasif Koleksiyon',
        slug: 'pasif-koleksiyon',
        collection_type: 'manual',
        is_active: false
    });
    await createCollection({
        name: 'Yeni Gelenler',
        slug: 'yeni-gelenler',
        collection_type: 'dynamic',
        rule_code: 'yeni_gelenler'
    });
    await createCollection({
        name: 'İndirim',
        slug: 'indirim',
        collection_type: 'dynamic',
        rule_code: 'indirim'
    });
    await createCollection({
        name: 'Çok Satanlar',
        slug: 'cok-satanlar',
        collection_type: 'dynamic',
        rule_code: 'cok_satanlar'
    });

    for (const [name, sortOrder] of [['Yeni Stoklu', 1], ['İndirimli Tükenen', 0]]) {
        const addResult = await request(`/api/admin/collections/${showcase.id}/products`, {
            method: 'POST',
            token: adminToken,
            body: {
                product_id: productByName.get(name),
                sort_order: sortOrder
            }
        });
        assert.strictEqual(addResult.response.status, 201);
    }
    const removeResult = await request(
        `/api/admin/collections/${showcase.id}/products/${productByName.get('İndirimli Tükenen')}`,
        { method: 'DELETE', token: adminToken }
    );
    assert.strictEqual(removeResult.payload.removed, true);
    await request(`/api/admin/collections/${showcase.id}/products`, {
        method: 'POST',
        token: adminToken,
        body: { product_id: productByName.get('İndirimli Tükenen'), sort_order: 0 }
    });
    await request(`/api/admin/collections/${inactiveCollection.id}/products`, {
        method: 'POST',
        token: adminToken,
        body: { product_id: productByName.get('Yeni Stoklu'), sort_order: 0 }
    });
    const collectionPatch = await request(`/api/admin/collections/${showcase.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { description: 'Seçili vitrin ürünleri' }
    });
    assert.strictEqual(collectionPatch.response.status, 200);
    assert.strictEqual(collectionPatch.payload.collection.description, 'Seçili vitrin ürünleri');
    const adminCollections = await request('/api/admin/collections', { token: adminToken });
    assert.strictEqual(adminCollections.response.status, 200);
    assert(adminCollections.payload.some((collection) => collection.slug === 'vitrin'));
    const adminCollectionProducts = await request(`/api/admin/collections/${showcase.id}/products`, {
        token: adminToken
    });
    assert.strictEqual(adminCollectionProducts.response.status, 200);
    assert.strictEqual(adminCollectionProducts.payload.length, 2);

    const createItem = async (body) => {
        const result = await request('/api/admin/menu-items', {
            method: 'POST',
            token: adminToken,
            body: { menu_id: menuId, ...body }
        });
        assert.strictEqual(result.response.status, 201, JSON.stringify(result.payload));
        return result.payload.item;
    };
    const levelOne = await createItem({ title: 'Seviye 1', sort_order: 10 });
    const levelTwo = await createItem({
        title: 'Seviye 2',
        parent_id: levelOne.id,
        sort_order: 0
    });
    const levelThree = await createItem({
        title: 'Seviye 3',
        parent_id: levelTwo.id,
        target_type: 'category',
        category_id: categoryBySlug.get('gorunur-menu')
    });
    await createItem({
        title: 'Boş kategori',
        target_type: 'category',
        category_id: categoryBySlug.get('bos-menu')
    });
    await createItem({
        title: 'Boş koleksiyon',
        target_type: 'collection',
        collection_id: emptyCollection.id
    });
    await createItem({ title: 'Hedefsiz ve çocuksuz' });
    await createItem({
        title: 'Vitrin linki',
        target_type: 'collection',
        collection_id: showcase.id,
        sort_order: 20
    });
    const archivedItem = await createItem({
        title: 'Arşivlenecek',
        target_type: 'internal_url',
        internal_url: '/kampanyalar'
    });
    const archiveResult = await request(`/api/admin/menu-items/${archivedItem.id}/archive`, {
        method: 'PATCH',
        token: adminToken,
        body: { archived: true }
    });
    assert.strictEqual(archiveResult.response.status, 200);
    assert.strictEqual(archiveResult.payload.item.is_active, false);
    const adminItems = await request(`/api/admin/menu-items?menu_id=${menuId}&format=flat`, {
        token: adminToken
    });
    assert.strictEqual(adminItems.response.status, 200);
    assert(adminItems.payload.some((item) => item.id === levelThree.id));
    const invalidExternal = await request('/api/admin/menu-items', {
        method: 'POST',
        token: adminToken,
        body: {
            menu_id: menuId,
            title: 'Dış link',
            target_type: 'internal_url',
            internal_url: 'https://example.com'
        }
    });
    assert.strictEqual(invalidExternal.response.status, 400);

    const reorderResult = await request('/api/admin/menu-items/reorder', {
        method: 'PATCH',
        token: adminToken,
        body: {
            items: [
                { id: levelOne.id, sort_order: 2 },
                { id: levelThree.id, sort_order: 3 }
            ]
        }
    });
    assert.strictEqual(reorderResult.response.status, 200);
    assert.strictEqual(reorderResult.payload.items[0].sort_order, 2);

    const navigationResult = await request('/api/public/navigation/main');
    assert.strictEqual(navigationResult.response.status, 200);
    const publicTitles = JSON.stringify(navigationResult.payload.items);
    assert(publicTitles.includes('Seviye 1'));
    assert(publicTitles.includes('Seviye 2'));
    assert(publicTitles.includes('Seviye 3'));
    assert(publicTitles.includes('Vitrin linki'));
    assert(!publicTitles.includes('Boş kategori'));
    assert(!publicTitles.includes('Boş koleksiyon'));
    assert(!publicTitles.includes('Hedefsiz ve çocuksuz'));
    assert(!publicTitles.includes('Arşivlenecek'));
    const publicLevelOne = navigationResult.payload.items.find((item) => item.title === 'Seviye 1');
    assert.strictEqual(publicLevelOne.children[0].children[0].title, 'Seviye 3');

    const publicCollections = await request('/api/public/collections');
    assert.strictEqual(publicCollections.response.status, 200);
    const publicSlugs = publicCollections.payload.map((collection) => collection.slug);
    assert(publicSlugs.includes('vitrin'));
    assert(publicSlugs.includes('yeni-gelenler'));
    assert(publicSlugs.includes('indirim'));
    assert(publicSlugs.includes('cok-satanlar'));
    assert(!publicSlugs.includes('bos-koleksiyon'));
    assert(!publicSlugs.includes('pasif-koleksiyon'));
    assert.strictEqual(
        publicCollections.payload.find((collection) => collection.slug === 'vitrin').show_on_home,
        true
    );

    const showcasePageOne = await request('/api/public/collections/vitrin?page=1&limit=1');
    assert.strictEqual(showcasePageOne.response.status, 200);
    assert.strictEqual(showcasePageOne.payload.pagination.total, 2);
    assert.strictEqual(showcasePageOne.payload.products[0].name, 'Yeni Stoklu');
    assert.strictEqual(showcasePageOne.payload.products[0].is_purchasable, true);
    const showcasePageTwo = await request('/api/public/collections/vitrin?page=2&limit=1');
    assert.strictEqual(showcasePageTwo.payload.products[0].name, 'İndirimli Tükenen');
    assert.strictEqual(showcasePageTwo.payload.products[0].is_purchasable, false);

    const newArrivals = await request('/api/public/collections/yeni-gelenler');
    assert(newArrivals.payload.products.some((product) => product.name === 'Yeni Stoklu'));
    assert(!newArrivals.payload.products.some((product) => product.name === 'Gizli Ürün'));
    const discount = await request('/api/public/collections/indirim');
    assert.deepStrictEqual(discount.payload.products.map((product) => product.name), ['İndirimli Tükenen']);
    const bestSellers = await request('/api/public/collections/cok-satanlar');
    assert.strictEqual(bestSellers.payload.products[0].name, 'Çok Satan');
    assert.strictEqual(bestSellers.payload.products[0].sold_quantity, 2);

    const emptyDetail = await request('/api/public/collections/bos-koleksiyon');
    assert.strictEqual(emptyDetail.response.status, 404);
    const inactiveDetail = await request('/api/public/collections/pasif-koleksiyon');
    assert.strictEqual(inactiveDetail.response.status, 404);

    const tablesResult = await pool.query(`
        SELECT
            to_regclass('public.menus') AS menus,
            to_regclass('public.menu_items') AS menu_items,
            to_regclass('public.collections') AS collections,
            to_regclass('public.collection_rules') AS collection_rules,
            to_regclass('public.collection_products') AS collection_products,
            to_regclass('public.order_items') AS order_items
    `);
    Object.values(tablesResult.rows[0]).forEach((value) => assert(value));

    console.log('menu/collection smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (child && !child.killed) child.kill();
    await pool.end();
});
