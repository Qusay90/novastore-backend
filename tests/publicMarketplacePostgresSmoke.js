'use strict';

// Owns a fresh loopback-only PostgreSQL container. Never reads an existing DB URL.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { format } = require('node:util');
const { Client } = require('pg');
const express = require('express');

const suffix = crypto.randomBytes(8).toString('hex');
const container = `novastore-r27-public-${suffix}`;
const database = `novastore_r27_public_${suffix}_test`;
const password = crypto.randomBytes(32).toString('base64url');
const jwtSecret = crypto.randomBytes(48).toString('base64url');
const sensitive = new Set([password, jwtSecret]);
const logs = [];
const originalConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((key) => [key, console[key]]));
for (const key of Object.keys(originalConsole)) console[key] = (...args) => logs.push(format(...args));
const redact = (value) => { let text = String(value); for (const secret of sensitive) text = text.split(secret).join('[REDACTED]'); return text; };
const docker = (args, env = process.env) => {
    const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000, env });
    if (result.status !== 0) throw new Error(`Docker failed: ${redact(result.stderr || result.error?.code)}`);
    return result.stdout.trim();
};
let created = false;
let pool;
let server;
let checks = 0;
let outbound = 0;
let recording = false;
const sqlReads = [];
const originalQuery = Client.prototype.query;
const originalFetch = global.fetch;
const check = (condition, message) => { assert(condition, message); checks += 1; };
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const keys = (value, expected) => same(Object.keys(value).sort(), [...expected].sort(), 'Exact public allowlist');
const ids = (rows) => rows.map((row) => Number(row.id));

(async () => {
    assert(process.argv.includes('--execute-disposable-db'), 'Use --execute-disposable-db.');
    docker(['run', '--pull', 'never', '--rm', '--name', container, '-d', '-p', '127.0.0.1::5432',
        '-e', 'POSTGRES_DB', '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', 'postgres:16-bookworm'],
    { ...process.env, POSTGRES_DB: database, POSTGRES_USER: 'r27_test', POSTGRES_PASSWORD: password });
    created = true;
    const portMatch = /^127\.0\.0\.1:(\d+)$/u.exec(docker(['port', container, '5432/tcp']));
    assert(portMatch);
    const url = `postgresql://r27_test:${password}@127.0.0.1:${portMatch[1]}/${database}`;
    sensitive.add(url);
    for (let attempt = 0; attempt < 80; attempt += 1) {
        const client = new Client({ connectionString: url, ssl: false, connectionTimeoutMillis: 1000 });
        try {
            await client.connect();
            assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, database);
            await client.end();
            break;
        } catch (error) {
            await client.end().catch(() => {});
            if (attempt === 79) throw new Error(`PostgreSQL unavailable: ${error.code}`);
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
    }
    Object.assign(process.env, {
        NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'local', NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
        NOVASTORE_ALLOW_REMOTE_DB: 'false', SKIP_SCHEMA_INIT: 'true', NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
        DATABASE_URL: url, DB_HOST: '127.0.0.1', DB_PORT: portMatch[1], DB_NAME: database,
        DB_USER: 'r27_test', DB_PASSWORD: password, DB_SSL: 'false', SUPABASE_USE_POOLER: 'false',
        SUPABASE_POOLER_HOST: '', SUPABASE_REGION: '', SUPABASE_PROJECT_REF: '', JWT_SECRET: jwtSecret,
        NOVASTORE_NOTIFICATION_WORKER_ENABLED: 'false', NOVASTORE_REQUEST_LOGGING_ENABLED: 'false',
        CLOUDINARY_CLOUD_NAME: 'r27-fixture', PAYTR_LIVE_REQUESTS_ALLOWED: 'false'
    });
    const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
    const { loadRegistry } = require('../scripts/staging-migrations/registry');
    const { runApply } = require('../scripts/staging-migrations/runner');
    const registry = loadRegistry();
    const migrationEnv = {
        NODE_ENV: 'test', NOVASTORE_DEPLOY_ENV: 'staging', NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
        NOVASTORE_ALLOW_REMOTE_DB: 'true', NOVASTORE_EXPECTED_DATABASE_HOST: '127.0.0.1',
        NOVASTORE_EXPECTED_DATABASE_NAME: database, [LOCAL_TEST_CAPABILITY]: 'true', DATABASE_URL: url
    };
    same((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, registry.map((entry) => entry.id));
    same((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, []);
    const serverPath = require.resolve('../server');
    require.cache[serverPath] = { id: serverPath, filename: serverPath, loaded: true, exports: { io: null } };
    pool = require('../config/db');
    global.fetch = (target, options) => {
        if (new URL(target).hostname !== '127.0.0.1') { outbound += 1; throw new Error('External HTTP forbidden'); }
        return originalFetch(target, options);
    };

    const store = async (slug) => {
        const org = (await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id',
            [crypto.randomUUID(), `Private organization ${slug}`])).rows[0].id;
        const id = (await pool.query('INSERT INTO stores(name,slug) VALUES($1,$2) RETURNING id', [slug, slug])).rows[0].id;
        const seller = (await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id',
            [org, id, `Public ${slug}`])).rows[0].id;
        await pool.query('INSERT INTO seller_store_profiles(organization_id,store_id) VALUES($1,$2)', [org, seller]);
        return { id, org, seller, slug };
    };
    const a = await store('r27-store-a');
    const b = await store('r27-store-b');
    const closed = await store('r27-closed');
    await pool.query("UPDATE seller_stores SET status='closed',closed_at=NOW() WHERE id=$1", [closed.seller]);
    const inactive = await store('r27-inactive');
    await pool.query("UPDATE seller_stores SET status='suspended' WHERE id=$1", [inactive.seller]);
    const platform = (await pool.query("SELECT id FROM stores WHERE slug='novastore-platform'")).rows[0].id;
    const categories = [];
    for (const [name, parent] of [['Root', null], ['Child', 0], ['Other', null]]) {
        categories.push((await pool.query(`INSERT INTO categories(name,slug,path,parent_id,hide_when_empty)
            VALUES($1,$2::TEXT,$2::TEXT,$3,FALSE) RETURNING id`, [`R27 ${name}`, `r27-${name.toLowerCase()}`, parent === null ? null : categories[parent]])).rows[0].id);
    }
    const productRows = (await pool.query(`INSERT INTO products(name,description,price,old_price,stock,category,categories,
        publication_status,is_customer_visible,store_id,variant_selection_required,created_at,image_url)
        SELECT 'R27 Match Product ' || n, 'Public açıklama <b>DATA</b>', 10+n, 200+n,
            CASE WHEN n%9=0 THEN 0 ELSE 5 END, 'R27 Child', ARRAY['R27 Child'], 'active', TRUE,
            CASE WHEN n%2=0 THEN $1::BIGINT ELSE $2::BIGINT END, n=1,
            CASE WHEN n%13=0 THEN NULL ELSE TIMESTAMP '2026-09-18 10:00:00.123456' + (n%3)*INTERVAL '1 microsecond' END,
            '/uploads/local-products/r27.webp'
        FROM generate_series(1,105) n RETURNING id,store_id,variant_selection_required`, [a.id, b.id])).rows;
    const product = Number(productRows[0].id);
    await pool.query(`INSERT INTO product_categories(product_id,category_id,is_primary)
        SELECT id, CASE WHEN id%3=0 THEN $1::INTEGER ELSE $2::INTEGER END, TRUE FROM products WHERE id=ANY($3::INTEGER[])`,
    [categories[2], categories[1], ids(productRows)]);
    const attribute = (await pool.query("INSERT INTO attribute_definitions(code,name,type,is_filterable) VALUES('r27_color','R27 Color','text',TRUE) RETURNING id")).rows[0].id;
    const template = (await pool.query("INSERT INTO attribute_templates(name,category_id) VALUES('R27 Template',$1) RETURNING id", [categories[1]])).rows[0].id;
    await pool.query('INSERT INTO template_attributes(template_id,attribute_id,is_filterable) VALUES($1,$2,TRUE)', [template, attribute]);
    await pool.query(`INSERT INTO product_attribute_values(product_id,attribute_id,text_value)
        SELECT id,$1,CASE WHEN id%2=0 THEN 'blue' ELSE 'red' END FROM products WHERE id=ANY($2::INTEGER[])`, [attribute, ids(productRows)]);
    const addProduct = async (storeId, name, status = 'active', visible = true) => Number((await pool.query(
        `INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible,created_at)
         VALUES($1,10,5,$2,$3,$4,'2026-09-18 12:00:00') RETURNING id`, [name, storeId, status, visible])).rows[0].id);
    const excluded = [await addProduct(closed.id, 'R27 Match Closed'), await addProduct(inactive.id, 'R27 Match Inactive'),
        await addProduct(a.id, 'R27 Match Draft', 'draft'), await addProduct(a.id, 'R27 Match Invisible', 'active', false)];
    const unbound = (await pool.query("INSERT INTO stores(name,slug) VALUES('Unbound','r27-unbound') RETURNING id")).rows[0].id;
    excluded.push(await addProduct(unbound, 'R27 Match Unbound'));
    const firstParty = await addProduct(platform, 'First party platform product');
    const literal = await addProduct(a.id, "Literal %_! and ' OR 1=1 -- and Unicode Çığ Şİşe");
    await pool.query('UPDATE products SET description=$1 WHERE id=$2', ['Needle only in description', firstParty]);
    await pool.query(`INSERT INTO product_media(product_id,media_url,media_type,is_main,sort_order)
        VALUES($1,'/uploads/local-products/r27.webp','image',TRUE,0),
              ($1,'https://tracker.invalid/private?token=hidden','image',FALSE,1)`, [product]);
    const users = (await pool.query(`INSERT INTO users(full_name,email,password,phone)
        SELECT 'Private Customer ' || n, 'r27-private-' || n || '@example.test', 'unused', '+905000000000'
        FROM generate_series(1,31) n RETURNING id`)).rows.map((row) => row.id);
    const questions = (await pool.query(`INSERT INTO product_questions(product_id,user_id,question,answer,answered_by,created_at,answered_at)
        SELECT $1,$2,'Question <img src=x onerror=alert(1)> ' || n, 'Answer <b>DATA</b> ' || n,$2,
            '2026-09-18 10:00:00', CASE WHEN n%11=0 THEN NULL ELSE TIMESTAMP '2026-09-18 10:00:00.123456' + (n%2)*INTERVAL '1 microsecond' END
        FROM generate_series(1,27) n RETURNING id`, [product, users[0]])).rows;
    const unanswered = (await pool.query("INSERT INTO product_questions(product_id,user_id,question) VALUES($1,$2,'PRIVATE UNANSWERED') RETURNING id", [product, users[0]])).rows[0].id;
    const foreignUnanswered = (await pool.query("INSERT INTO product_questions(product_id,user_id,question) VALUES($1,$2,'FOREIGN PRIVATE UNANSWERED') RETURNING id", [product, users[1]])).rows[0].id;
    await pool.query("INSERT INTO product_questions(product_id,user_id,question,answer) VALUES($1,$2,'Blank answer','   ')", [product, users[0]]);
    const reviews = [];
    for (let i = 0; i < 29; i += 1) {
        const row = (await pool.query(`INSERT INTO reviews(product_id,user_id,rating,comment,status,created_at)
            VALUES($1,$2,$3,$4,$5, TIMESTAMP '2026-09-18 10:00:00.123456' + ($6::INTEGER%2)*INTERVAL '1 microsecond') RETURNING id`,
        [product, users[i], i < 9 ? 1 : 5, `Review <script>DATA</script> ${i}`, i < 27 ? 'PUBLISHED' : i === 27 ? 'HIDDEN' : 'PENDING', i])).rows[0];
        if (i < 27) reviews.push(row);
    }
    await pool.query(`INSERT INTO review_media(review_id,media_url,media_type,sort_order) VALUES
        ($1,'https://res.cloudinary.com/r27-fixture/image/upload/v1/review.webp','image',0),
        ($1,'https://res.cloudinary.com/r27-fixture/video/upload/v1/review.mp4','video',1)`, [reviews.at(-1).id]);
    await pool.query("UPDATE reviews SET created_at=NULL WHERE id=$1", [reviews[0].id]);
    await require('../services/categoryStatsService').recalculateAllCategoryStats(pool);

    const app = express();
    app.use(express.json());
    app.use('/api/products', require('../routes/productRoutes'));
    app.use('/api/questions', require('../routes/questionRoutes'));
    app.use('/api/reviews', require('../routes/reviewRoutes'));
    app.use('/api/public/stores', require('../routes/publicStoreRoutes'));
    server = await new Promise((resolve) => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    Client.prototype.query = function captureQuery(sql, params) {
        if (recording && typeof sql === 'string') sqlReads.push({ sql, params: [...(params || [])] });
        return originalQuery.apply(this, arguments);
    };
    const request = async (route, status = 200, headers = {}) => {
        recording = true;
        try {
            const response = await fetch(origin + route, { headers });
            const body = await response.json();
            same(response.status, status, `HTTP ${route.slice(0, 150)}: ${JSON.stringify(body).slice(0, 200)}`);
            return { body, headers: response.headers };
        } finally { recording = false; }
    };
    const walk = async (route, field = 'items', pageField = null) => {
        const result = [];
        let cursor;
        for (let step = 0; step < 150; step += 1) {
            const page = (await request(`${route}${route.includes('?') ? '&' : '?'}${cursor ? `cursor=${encodeURIComponent(cursor)}` : ''}`)).body;
            const meta = pageField ? page[pageField] : page;
            check(page[field].length <= meta.limit, 'Response bound');
            result.push(...page[field]);
            same(meta.hasMore, meta.nextCursor !== null, 'Truthful continuation');
            if (!meta.hasMore) return result;
            check(meta.nextCursor !== cursor, 'Continuation progresses');
            cursor = meta.nextCursor;
        }
        throw new Error('Continuation did not terminate');
    };

    const defaultProducts = await request('/api/products');
    check(Array.isArray(defaultProducts.body), 'Legacy product array');
    same(defaultProducts.body.length, 20);
    same(defaultProducts.headers.get('x-pagination-has-more'), 'true');
    check(Boolean(defaultProducts.headers.get('x-pagination-next-cursor')), 'Legacy continuation headers');
    const all = await walk('/api/products?pagination=cursor&limit=17');
    same(new Set(ids(all)).size, all.length, 'No duplicate marketplace rows');
    same([...ids(all)].sort((x, y) => x-y), [...ids(productRows), firstParty, literal].sort((x, y) => x-y), 'No missing or ineligible products');
    check(all.length >= 101 && ids(all).includes(Number(productRows[100].id)), 'Record 101 reachable');
    const expectedOrder = ids((await pool.query(`SELECT id FROM products WHERE id=ANY($1::INTEGER[])
        ORDER BY CASE WHEN stock>0 THEN 0 ELSE 1 END,created_at DESC NULLS LAST,id DESC`, [ids(all)])).rows);
    same(ids(all), expectedOrder, 'Stock/time/microsecond/null/ID ordering');
    for (const row of all) {
        keys(row, ['id','name','description','brand','product_type','price','old_price','stock','is_purchasable','variant_selection_required','image_url','media',
            'category','categories','categoryIds','primaryCategoryId','average_rating','review_count','store']);
        check(row.store !== null && Boolean(row.store.slug), 'Public store identity present');
        keys(row.store, ['slug','name']);
        const seeded = productRows.find((item) => Number(item.id) === row.id);
        if (seeded) same(row.store.slug, String(seeded.store_id) === String(a.id) ? a.slug : b.slug, 'Exact server-owned store');
    }
    same(all.find((row) => row.id === product).variant_selection_required, true);
    same(all.find((row) => row.id === product).media.length, 1, 'Unsafe media excluded');
    check(all.some((row) => row.variant_selection_required === false), 'Simple products');
    const searched = await walk('/api/products?pagination=cursor&q=%20r27%20match%20&limit=13');
    same([...ids(searched)].sort((x,y)=>x-y), ids(productRows), 'Search across all pages');
    for (const needle of ['%_!', "' OR 1=1 --", 'Çığ', 'Şİşe']) {
        same(ids((await request(`/api/products?pagination=cursor&q=${encodeURIComponent(needle)}`)).body.items), [literal], 'Literal parameterized search');
    }
    same(ids((await request('/api/products?pagination=cursor&q=Needle%20only')).body.items), [firstParty], 'Public description search');
    same((await request('/api/products?pagination=cursor&q=Private%20organization')).body.items, [], 'Private Seller metadata not searched');
    same(ids((await request('/api/products?pagination=cursor&q=%20%20')).body.items), ids(defaultProducts.body), 'Whitespace means no search');
    const filter = encodeURIComponent(JSON.stringify({ r27_color: 'blue' }));
    const combined = await walk(`/api/products?pagination=cursor&q=R27%20Match&categoryId=${categories[0]}&includeDescendants=true&attributes=${filter}&limit=7`);
    const expectedCombined = ids(productRows).filter((id) => id%3 !== 0 && id%2 === 0);
    same([...ids(combined)].sort((x,y)=>x-y), expectedCombined, 'Category + search + attribute + pages');
    const slugCombined = await walk(`/api/products?pagination=cursor&q=R27%20Match&categorySlug=r27-root&attributes=${filter}&limit=7`);
    same(ids(slugCombined), ids(combined), 'Category slug and default descendants');
    same((await request(`/api/products?pagination=cursor&q=R27&categoryId=${categories[0]}&includeDescendants=false`)).body.items, [], 'No descendants');
    same((await request('/api/products?pagination=cursor&q=R27&category=r27-root')).body.items, [], 'Legacy category defaults to direct category');
    const storeProducts = await walk(`/api/public/stores/${a.slug}?limit=8`, 'products', 'pagination');
    same([...ids(storeProducts)].sort((x,y)=>x-y), [...ids(productRows.filter((row) => String(row.store_id) === String(a.id))), literal].sort((x,y)=>x-y), 'Store-scoped continuation');
    const storeFirst = (await request(`/api/public/stores/${a.slug}?limit=1`)).body;
    same(storeFirst.store.product_count, storeProducts.length, 'Global store count independent of page');

    const qaRoute = `/api/questions/product/${product}`;
    const reviewRoute = `/api/reviews/product/${product}`;
    const legacyQa = await request(qaRoute);
    check(Array.isArray(legacyQa.body), 'Legacy Q&A array');
    same(legacyQa.body.length, 20);
    const qa = await walk(`${qaRoute}?pagination=cursor&limit=5`);
    same([...ids(qa)].sort((x,y)=>x-y), ids(questions), 'Answered questions complete once');
    check(!ids(qa).includes(unanswered), 'Unanswered question private');
    for (const row of qa) {
        keys(row, ['id','question','answer','user_name','created_at','answered_at','status','is_answered']);
        check(row.user_name.startsWith('PR*** CU***'), 'Masked Q&A identity');
        check(row.question.includes('<img') && row.answer.includes('<b>'), 'Q&A preserved as plain text data');
    }
    const reviewFirst = (await request(`${reviewRoute}?limit=2`)).body;
    const publicReviews = await walk(`${reviewRoute}?limit=5`, 'reviews', 'pagination');
    same([...ids(publicReviews)].sort((x,y)=>x-y), ids(reviews), 'Published reviews complete once');
    same(reviewFirst.totalReviews, 27);
    same(reviewFirst.average, '3.7');
    check(reviewFirst.average !== (reviewFirst.reviews.reduce((n,row)=>n+row.rating,0)/2).toFixed(1), 'Global rating is not page-derived');
    for (const row of publicReviews) {
        keys(row, ['id','rating','comment','created_at','full_name','media']);
        check(row.full_name.startsWith('PR*** CU***'), 'Masked review identity');
        check(row.comment.includes('<script>'), 'Review text preserved');
        for (const media of row.media) keys(media, ['id','media_url','media_type','sort_order']);
    }
    same(publicReviews.find((row)=>row.id===Number(reviews.at(-1).id)).media.length, 2, 'Accepted image and video media');
    check(!Object.hasOwn(reviewFirst, 'starDistribution'), 'No fabricated star distribution');
    const emptyProduct = firstParty;
    same((await request(`/api/questions/product/${emptyProduct}?pagination=cursor`)).body.items, []);
    const emptyReview = (await request(`/api/reviews/product/${emptyProduct}`)).body;
    same([emptyReview.reviews,emptyReview.average,emptyReview.totalReviews,emptyReview.pagination.hasMore], [[],0,0,false]);
    const lastPageCursor = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(reviewFirst.pagination.nextCursor,'base64url')), id:1, micros:null })).toString('base64url');
    const beyond = (await request(`${reviewRoute}?cursor=${lastPageCursor}`)).body;
    same([beyond.reviews,beyond.totalReviews,beyond.average,beyond.pagination.hasMore], [[],27,'3.7',false], 'Empty later page still carries global summary');

    for (const bad of ['limit=0','limit=-1','limit=x','limit=1000000','limit=1&limit=2','limit=1.5','limit=',
        'cursor=broken','cursor=','cursor=x&cursor=y','page=0','page=abc','pagination=bad']) {
        for (const route of ['/api/products', qaRoute, reviewRoute, `/api/public/stores/${a.slug}`]) await request(`${route}?${bad}`, 400);
    }
    for (const bad of [`q=${'x'.repeat(121)}`, 'q=a&q=b','q=%00','categoryId=nope','attributes=%7Bbad']) await request(`/api/products?${bad}`,400);
    same((await request(`/api/products?q=${'%25'.repeat(100)}&pagination=cursor`)).body.items, [], 'Wildcard-heavy literal input bounded');
    same((await request('/api/products?limit=100&pagination=cursor')).body.items.length,100);
    const productCursor = (await request('/api/products?pagination=cursor&limit=1&q=R27')).body.nextCursor;
    await request(`/api/products?pagination=cursor&q=different&cursor=${productCursor}`,400);
    await request(`${qaRoute}?cursor=${productCursor}`,400);
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(productCursor,'base64url')), id:"1 OR 1=1" })).toString('base64url');
    await request(`/api/products?q=R27&cursor=${tampered}`,400);
    await request('/api/products?pagination=cursor&store_id=999',400);

    // Eligibility changes are checked against every affected public surface, including an old cursor.
    const variants = [
        ["UPDATE seller_stores SET status='suspended' WHERE id=$1", "UPDATE seller_stores SET status='active' WHERE id=$1", b.seller],
        ["UPDATE seller_stores SET closed_at=NOW() WHERE id=$1", "UPDATE seller_stores SET closed_at=NULL WHERE id=$1", b.seller],
        ["UPDATE seller_store_profiles SET operational_status='paused' WHERE store_id=$1", "UPDATE seller_store_profiles SET operational_status='open' WHERE store_id=$1", b.seller],
        ["UPDATE stores SET is_active=FALSE WHERE id=$1", "UPDATE stores SET is_active=TRUE WHERE id=$1", b.id],
        ["UPDATE stores SET deleted_at=NOW() WHERE id=$1", "UPDATE stores SET deleted_at=NULL WHERE id=$1", b.id],
        ["UPDATE seller_organizations SET status='suspended' WHERE id=$1", "UPDATE seller_organizations SET status='active' WHERE id=$1", b.org]
    ];
    for (const [hide, restore, id] of variants) {
        await pool.query(hide,[id]);
        try {
            await request(qaRoute,404); await request(reviewRoute,404); await request(`/api/public/stores/${b.slug}`,404);
            const remaining = await walk('/api/products?pagination=cursor&limit=100&q=R27%20Match');
            check(remaining.every((row)=>row.store.slug===a.slug), 'Ineligible store products completely absent');
        } finally { await pool.query(restore,[id]); }
    }
    for (const id of excluded) {
        await request(`/api/questions/product/${id}`,404); await request(`/api/reviews/product/${id}`,404);
    }
    const sessionService = require('../services/authSessionService');
    const customerToken = (await sessionService.issueAccessSession({ queryable:pool, userId:users[0], role:'customer', principal:'customer' })).token;
    sensitive.add(customerToken);
    const own = (await request('/api/questions/user',200,{Authorization:`Bearer ${customerToken}`})).body;
    check(ids(own).includes(Number(unanswered)) && !ids(own).includes(Number(foreignUnanswered)), 'Own history remains private and user-scoped');
    const customerReviews = (await request(reviewRoute,200,{Authorization:`Bearer ${customerToken}`})).body;
    same(customerReviews.reviewPermission.code,'SELLER_REVIEW_HANDOFF_REQUIRED','Read pagination does not broaden Seller review writes');
    const adminId = (await pool.query("INSERT INTO users(full_name,email,password,role,auth_enabled) VALUES('R27 Admin','r27-admin@example.test','unused','admin',TRUE) RETURNING id")).rows[0].id;
    const adminToken = (await sessionService.issueAccessSession({queryable:pool,userId:adminId,role:'admin',principal:'admin'})).token;
    sensitive.add(adminToken);
    const adminInventory = (await request('/api/products',200,{Authorization:`Bearer ${adminToken}`})).body;
    check(Array.isArray(adminInventory) && ids(adminInventory).includes(excluded[2]),'Legacy Admin inventory still includes drafts');
    check(Object.hasOwn(adminInventory[0],'store_id'),'Legacy authenticated Admin inventory DTO retained');
    const adminPublic = (await request('/api/products?pagination=cursor',200,{Authorization:`Bearer ${adminToken}`})).body;
    check(adminPublic.items.length<=20 && adminPublic.items.every((row)=>!Object.hasOwn(row,'store_id')), 'Explicit shared public contract stays public even for Admin');

    const internalSentinel = 'R27_INTERNAL_ERROR_MUST_NOT_LEAVE_SERVER';
    sensitive.add(internalSentinel);
    const savedPoolQuery=pool.query;
    const savedPoolConnect=pool.connect;
    pool.query=async()=>{throw new Error(internalSentinel);};
    pool.connect=async()=>{throw new Error(internalSentinel);};
    try {
        for(const [route,status] of [['/api/products',500],[qaRoute,500],[reviewRoute,500],[`/api/public/stores/${a.slug}`,503]]) {
            const error=(await request(route,status)).body;
            check(!JSON.stringify(error).includes(internalSentinel),'Raw internal errors stay private');
        }
    } finally { pool.query=savedPoolQuery; pool.connect=savedPoolConnect; }
    const boundReads = sqlReads.filter(({sql}) => /FROM products p\s+JOIN \(SELECT platform_store|WITH public_product AS|SELECT products\.id AS public_product_id|SELECT product\.id, product\.name/u.test(sql));
    check(boundReads.length > 50, 'Observed real SQL across all public pages');
    for (const read of boundReads) {
        check(/LIMIT \$\d+/u.test(read.sql), 'Actual SQL bound');
        check(Number.isInteger(read.params.at(-1)) && read.params.at(-1)>=2 && read.params.at(-1)<=101, 'Bounded limit + one sentinel');
    }
    check(sqlReads.some(({sql})=>sql==="SET LOCAL statement_timeout = '3s'"), 'Server-side search execution budget');
    same(outbound,0);
    for (const log of logs) for (const secret of sensitive) check(!log.includes(secret),'No logged secret');
    const report = { result:'PASS',checks, products:all.length, searchProducts:searched.length, publicQuestions:qa.length,
        publishedReviews:publicReviews.length, boundedSqlReads:boundReads.length, record101:'PASS',
        privateFieldExposure:0, unboundedPublicQueries:0, duplicateProducts:0, missedProducts:0,
        unansweredExposure:0, nonPublishedExposure:0, crossStoreIdentityLeak:0, limitBypasses:0,
        productionWrites:0, providerCalls:outbound, secretExposure:0, migrations:registry.length };
    const out = path.join(__dirname,'..','artifacts','r27');
    fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'public-http-proof.json'),JSON.stringify(report,null,2)+'\n');
    originalConsole.log(`publicMarketplacePostgresSmoke PASS ${JSON.stringify(report)}`);
})().catch((error)=>{
    originalConsole.error(`publicMarketplacePostgresSmoke FAIL ${redact(error.stack || error.message)}`);
    process.exitCode=1;
}).finally(async()=>{
    Client.prototype.query=originalQuery;
    global.fetch=originalFetch;
    if(server) await new Promise((resolve)=>server.close(resolve));
    if(pool) await pool.end().catch(()=>{});
    if(created) {
        assert(/^novastore-r27-public-[a-f0-9]{16}$/u.test(container));
        try { docker(['rm','-f',container]); } catch(error) { originalConsole.error(redact(error.message)); process.exitCode=1; }
    }
    for(const [key,value] of Object.entries(originalConsole)) console[key]=value;
});
