const assert = require('assert');
const express = require('express');
const http = require('http');
const net = require('net');

const DEFAULT_LOCAL_DATABASE_URL =
    'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_category_v2_test';

const FORBIDDEN_HOST_PARTS = [
    'supabase',
    'pooler',
    '.com',
    'amazonaws',
    'render',
    'railway'
];

const assertSafeLocalDatabaseUrl = (rawUrl) => {
    const parsed = new URL(String(rawUrl || '').trim());
    const host = parsed.hostname.toLowerCase();
    assert(['localhost', '127.0.0.1'].includes(host), `Unsafe DB host: ${host}`);
    assert(
        FORBIDDEN_HOST_PARTS.every((part) => !String(rawUrl).toLowerCase().includes(part)),
        `Forbidden remote DB marker in URL: ${rawUrl}`
    );
    assert.strictEqual(
        parsed.pathname.replace(/^\//, ''),
        'novastore_category_v2_test',
        'This smoke test is restricted to novastore_category_v2_test.'
    );
    return parsed;
};

const hasExplicitLocalDatabaseUrl = Boolean(process.env.CATEGORY_V2_BACKEND_LOCAL_DATABASE_URL);
const localDatabaseUrl = process.env.CATEGORY_V2_BACKEND_LOCAL_DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
const parsedDatabaseUrl = assertSafeLocalDatabaseUrl(localDatabaseUrl);

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'true';
process.env.SKIP_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = localDatabaseUrl;
process.env.DB_HOST = parsedDatabaseUrl.hostname;
process.env.DB_PORT = parsedDatabaseUrl.port || '5432';
process.env.DB_NAME = parsedDatabaseUrl.pathname.replace(/^\//, '');
process.env.DB_USER = decodeURIComponent(parsedDatabaseUrl.username || 'postgres');
process.env.DB_PASSWORD = decodeURIComponent(parsedDatabaseUrl.password || '');
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.SUPABASE_POOLER_HOST = '';
process.env.SUPABASE_REGION = '';
process.env.SUPABASE_PROJECT_REF = '';

const canReachLocalDatabase = (host, port) =>
    new Promise((resolve) => {
        const socket = new net.Socket();
        const finish = (ok) => {
            socket.destroy();
            resolve(ok);
        };
        socket.setTimeout(1000);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
    });

const startApi = async (productRoutes) => {
    const app = express();
    app.use(express.json());
    app.use('/api/products', productRoutes);
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

const requestJson = async (baseUrl, url) => {
    const response = await fetch(`${baseUrl}${url}`);
    const body = await response.json();
    return { status: response.status, body };
};

const productNames = (products) => products.map((product) => product.name).sort();

(async () => {
    const reachable = await canReachLocalDatabase(
        parsedDatabaseUrl.hostname,
        Number(parsedDatabaseUrl.port || 5432)
    );
    if (!reachable && !hasExplicitLocalDatabaseUrl) {
        console.log(
            `productCategoryDescendantsSmoke skipped: no local PostgreSQL at ${parsedDatabaseUrl.hostname}:${parsedDatabaseUrl.port || 5432}`
        );
        return;
    }

    const pool = require('../config/db');
    const productRoutes = require('../routes/productRoutes');
    const {
        applyCategoryV2Schema,
        applyCategoryV2BackfillConstraints
    } = require('../models/categoryV2Schema');
    const { recalculateAllCategoryStats } = require('../services/categoryStatsService');

    const client = await pool.connect();
    let api;

    try {
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await applyCategoryV2Schema(client);
        await applyCategoryV2BackfillConstraints(client);
        await client.query(`
            CREATE TABLE IF NOT EXISTS product_media (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                media_url TEXT,
                is_main BOOLEAN NOT NULL DEFAULT FALSE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                rating NUMERIC(3, 2) NOT NULL DEFAULT 5,
                comment TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const categoryRows = (await client.query(`
            INSERT INTO categories (
                name, parent_id, slug, path, depth, sort_order,
                is_active, is_customer_visible, deleted_at, hide_when_empty
            )
            VALUES
                ('Kadın', NULL, 'kadin', 'kadin', 0, 1, TRUE, TRUE, NULL, TRUE),
                ('Erkek', NULL, 'erkek', 'erkek', 0, 2, TRUE, TRUE, NULL, TRUE),
                ('Aksesuar', NULL, 'aksesuar', 'aksesuar', 0, 3, TRUE, TRUE, NULL, TRUE)
            RETURNING id, name
        `)).rows;
        const categoryIds = new Map(categoryRows.map((row) => [row.name, Number(row.id)]));

        const childRows = (await client.query(
            `INSERT INTO categories (
                name, parent_id, slug, path, depth, sort_order,
                is_active, is_customer_visible, deleted_at, hide_when_empty
             )
             VALUES
                ('Giyim', $1, 'kadin-giyim', 'kadin/giyim', 1, 1, TRUE, TRUE, NULL, TRUE),
                ('Ayakkabı', $1, 'kadin-ayakkabi', 'kadin/ayakkabi', 1, 2, TRUE, TRUE, NULL, TRUE),
                ('Giyim', $2, 'erkek-giyim', 'erkek/giyim', 1, 1, TRUE, TRUE, NULL, TRUE)
             RETURNING id, name, path`,
            [categoryIds.get('Kadın'), categoryIds.get('Erkek')]
        )).rows;
        childRows.forEach((row) => categoryIds.set(row.path, Number(row.id)));

        await client.query('INSERT INTO category_stats (category_id) SELECT id FROM categories ON CONFLICT DO NOTHING');

        const productRows = (await client.query(`
            INSERT INTO products (
                name, price, stock, category, categories,
                publication_status, is_customer_visible, deleted_at
            )
            VALUES
                ('Kadın Elbise', 100, 5, 'Giyim', ARRAY['Giyim']::TEXT[], 'active', TRUE, NULL),
                ('Kadın Sneaker', 120, 5, 'Ayakkabı', ARRAY['Ayakkabı']::TEXT[], 'active', TRUE, NULL),
                ('Erkek Gömlek', 140, 5, 'Giyim', ARRAY['Giyim']::TEXT[], 'active', TRUE, NULL),
                ('Deri Çanta', 160, 5, 'Aksesuar', ARRAY['Aksesuar']::TEXT[], 'active', TRUE, NULL)
            RETURNING id, name
        `)).rows;
        const productIds = new Map(productRows.map((row) => [row.name, Number(row.id)]));

        const relations = [
            ['Kadın Elbise', 'kadin/giyim'],
            ['Kadın Sneaker', 'kadin/ayakkabi'],
            ['Erkek Gömlek', 'erkek/giyim'],
            ['Deri Çanta', 'Aksesuar']
        ];
        for (const [productName, categoryKey] of relations) {
            await client.query(
                `INSERT INTO product_categories (product_id, category_id, is_primary)
                 VALUES ($1, $2, TRUE)`,
                [productIds.get(productName), categoryIds.get(categoryKey)]
            );
        }

        await recalculateAllCategoryStats(client);
        api = await startApi(productRoutes);

        const parentPath = await requestJson(api.baseUrl, '/api/products?category=kadin&includeDescendants=true');
        assert.strictEqual(parentPath.status, 200);
        assert.deepStrictEqual(productNames(parentPath.body), ['Kadın Elbise', 'Kadın Sneaker']);

        const parentWithoutDescendants = await requestJson(api.baseUrl, '/api/products?category=kadin');
        assert.strictEqual(parentWithoutDescendants.status, 200);
        assert.deepStrictEqual(parentWithoutDescendants.body, []);

        const leafPath = await requestJson(api.baseUrl, '/api/products?category=kadin%2Fgiyim&includeDescendants=true');
        assert.strictEqual(leafPath.status, 200);
        assert.deepStrictEqual(productNames(leafPath.body), ['Kadın Elbise']);

        const categoryId = await requestJson(
            api.baseUrl,
            `/api/products?categoryId=${categoryIds.get('Kadın')}`
        );
        assert.strictEqual(categoryId.status, 200);
        assert.deepStrictEqual(productNames(categoryId.body), ['Kadın Elbise', 'Kadın Sneaker']);

        const categorySlug = await requestJson(api.baseUrl, '/api/products?categorySlug=kadin');
        assert.strictEqual(categorySlug.status, 200);
        assert.deepStrictEqual(productNames(categorySlug.body), ['Kadın Elbise', 'Kadın Sneaker']);

        const numericCategoryParam = await requestJson(
            api.baseUrl,
            `/api/products?category=${categoryIds.get('Aksesuar')}&includeDescendants=true`
        );
        assert.strictEqual(numericCategoryParam.status, 200);
        assert.deepStrictEqual(productNames(numericCategoryParam.body), ['Deri Çanta']);

        const ambiguousLegacyName = await requestJson(api.baseUrl, '/api/products?category=Giyim');
        assert.strictEqual(ambiguousLegacyName.status, 409);
        assert.strictEqual(ambiguousLegacyName.body.code, 'AMBIGUOUS_CATEGORY');
        assert.deepStrictEqual(
            ambiguousLegacyName.body.candidateCategoryIds.sort((left, right) => left - right),
            [categoryIds.get('kadin/giyim'), categoryIds.get('erkek/giyim')].sort((left, right) => left - right)
        );

        const unmatched = await requestJson(api.baseUrl, '/api/products?category=olmayan-kategori');
        assert.strictEqual(unmatched.status, 404);
        assert.strictEqual(unmatched.body.code, 'CATEGORY_NOT_PUBLIC');

        console.log('productCategoryDescendantsSmoke passed');
    } finally {
        if (api) await stopApi(api.server);
        client.release();
        await pool.end();
    }
})().catch(async (error) => {
    console.error(error);
    process.exit(1);
});
