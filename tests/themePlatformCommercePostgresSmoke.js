'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const http = require('node:http');
const startDisposable = require('./helpers/themePlatformDisposableDb');
let db, server, cleanup;
const gates = [];
const gate = async (name, action) => {
    try { await action(); gates.push({ name, status: 'PASS' }); db.originalConsole.log(`PASS ${name}`); }
    catch (error) { gates.push({ name, status: 'FAIL' }); throw new Error(`${name}: ${error.stack || error.message}`); }
};
(async () => {
    db = await startDisposable();
    const { pool } = db;
    const commerce = require('../services/themePlatformCommerceService');
    const { createThemeStorefrontRouter } = require('../routes/themeStorefrontRoutes');
    const themeId = crypto.randomUUID(), versionId = crypto.randomUUID();
    const document = { schemaVersion: 1, tokens: {}, assetIds: [], components: [{ id: 'hero', type: 'hero', props: { title: 'Nova Store', target: '/shop' } }] };
    await pool.query("INSERT INTO themes(id,slug,name) VALUES($1,'commerce-wave2-fixture','Nova Store fixture')", [themeId]);
    await pool.query("INSERT INTO theme_versions(id,theme_id,version,status,document,digest) VALUES($1,$2,'1','PUBLISHED',$3,$4)", [versionId, themeId, document, crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex')]);
    const makeStore = async (slug) => {
        const org = (await pool.query('INSERT INTO seller_organizations(external_key,display_name) VALUES($1,$2) RETURNING id', [crypto.randomUUID(), `Private ${slug}`])).rows[0].id;
        const legacy = (await pool.query('INSERT INTO stores(name,slug) VALUES($1,$1) RETURNING id', [slug])).rows[0].id;
        const store = (await pool.query('INSERT INTO seller_stores(organization_id,legacy_store_id,display_name) VALUES($1,$2,$3) RETURNING id', [org, legacy, `Public ${slug}`])).rows[0].id;
        await pool.query('INSERT INTO seller_store_profiles(organization_id,store_id,shipping_policy,return_policy) VALUES($1,$2,$3,$4)', [org, store, `Shipping ${slug}`, `Returns ${slug}`]);
        const serviceId = crypto.randomUUID(), assignmentId = crypto.randomUUID(), bindingId = crypto.randomUUID();
        const service = (await pool.query("INSERT INTO seller_theme_services(id,organization_id,store_id,plan) VALUES($1,$2,$3,'pro') RETURNING *", [serviceId, org, store])).rows[0];
        const assignment = (await pool.query("INSERT INTO theme_assignments(id,service_id,organization_id,store_id,theme_version_id,channel,status,accepted_at,commerce_mode) VALUES($1,$2,$3,$4,$5,'web','ACCEPTED',NOW(),'SINGLE_STORE') RETURNING *", [assignmentId, serviceId, org, store, versionId])).rows[0];
        await pool.query("INSERT INTO theme_domain_bindings(id,hostname,service_id,organization_id,store_id,assignment_id,status,verified_at,verification_reference) VALUES($1,$2,$3,$4,$5,$6,'VERIFIED',NOW(),'disposable-fixture-not-dns')", [bindingId, `${slug}.test`, serviceId, org, store, assignmentId]);
        const category = (await pool.query('INSERT INTO categories(name,slug,path) VALUES($1,$2::text,$2::text) RETURNING id', [`Category ${slug}`, `category-${slug}`])).rows[0].id;
        const product = (await pool.query("INSERT INTO products(name,price,old_price,stock,store_id,publication_status,is_customer_visible,image_url) VALUES($1,125.50,150,9,$2,'active',TRUE,'/uploads/local-products/fixture.webp') RETURNING id", [`Search Match ${slug}`, legacy])).rows[0].id;
        await pool.query('INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,TRUE)', [product, category]);
        const collection = (await pool.query('INSERT INTO collections(name,slug) VALUES($1,$2) RETURNING id', [`Collection ${slug}`, `collection-${slug}`])).rows[0].id;
        await pool.query('INSERT INTO collection_products(collection_id,product_id) VALUES($1,$2)', [collection, product]);
        const variantProduct = (await pool.query("INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible,variant_selection_required) VALUES($1,222,5,$2,'active',TRUE,TRUE) RETURNING id", [`Variant ${slug}`, legacy])).rows[0].id;
        const offer = (await pool.query("INSERT INTO seller_offers(organization_id,store_id,product_id,status) VALUES($1,$2,$3,'active') RETURNING id", [org, store, variantProduct])).rows[0].id;
        const variants = [];
        for (const [value, price] of [['Red', 22200], ['Blue', 33300]]) {
            const variant = (await pool.query("INSERT INTO seller_offer_variants(organization_id,store_id,offer_id,product_id,seller_sku,price_minor,currency,selections,publication_status) VALUES($1,$2,$3,$4,$5,$6,'TRY',$7,'published') RETURNING id", [org, store, offer, variantProduct, `${slug}-${value}`, price, JSON.stringify([{ group: 'Color', value }])])).rows[0].id;
            await pool.query('INSERT INTO seller_inventory_items(organization_id,store_id,variant_id,quantity) VALUES($1,$2,$3,5)', [org, store, variant]); variants.push(variant);
        }
        const assetId = crypto.randomUUID();
        await pool.query("INSERT INTO theme_assets(id,service_id,organization_id,store_id,detected_mime,byte_size,digest,storage_key,status) VALUES($1,$2,$3,$4,'image/png',24,$5,$6,'READY')", [assetId, serviceId, org, store, 'a'.repeat(64), `fixture/${assetId}`]);
        return { org, legacy, store, service, assignment, bindingId, host: `${slug}.test`, category: Number(category), product: Number(product), variantProduct: Number(variantProduct), variants: variants.map(Number), collection: Number(collection), assetId };
    };
    const a = await makeStore('wave2-a'), b = await makeStore('wave2-b');
    const hidden = (await pool.query("INSERT INTO products(name,price,stock,store_id,publication_status,is_customer_visible) VALUES('Private hidden',99,9,$1,'draft',FALSE) RETURNING id", [a.legacy])).rows[0].id;
    const user = (await pool.query("INSERT INTO users(full_name,email,password) VALUES('Private Customer Name','commerce-private@example.test','unused') RETURNING id")).rows[0].id;
    const admin = (await pool.query("INSERT INTO users(full_name,email,password,role) VALUES('Legal Admin','commerce-admin@example.test','unused','admin') RETURNING id")).rows[0].id;
    const legal = { version: '1', publicLegalName: 'Store A Legal', publicTradeName: 'Store A Trade', publicDisclosureText: 'Store A approved public disclosure' };
    await pool.query("INSERT INTO seller_public_legal_identities(organization_id,version,public_legal_name,public_trade_name,public_disclosure_text,content_sha256,status,created_by_admin_user_id,approved_by_admin_user_id,approved_at) VALUES($1,$2,$3,$4,$5,$6,'approved',$7,$7,NOW())", [a.org, legal.version, legal.publicLegalName, legal.publicTradeName, legal.publicDisclosureText, require('../services/sellerPublicLegalIdentityService').buildSellerPublicLegalIdentityContentSha256(legal), admin]);
    await pool.query("INSERT INTO reviews(product_id,user_id,rating,comment,status) VALUES($1,$3,5,'Published A','PUBLISHED'),($2,$3,2,'Foreign B','PUBLISHED')", [a.product, b.product, user]);
    await pool.query("INSERT INTO product_questions(product_id,user_id,question,answer,answered_at) VALUES($1,$3,'Question A','Answer A',NOW()),($2,$3,'Foreign Question','Foreign Answer',NOW())", [a.product, b.product, user]);
    await pool.query("INSERT INTO product_questions(product_id,user_id,question) VALUES($1,$2,'PRIVATE UNANSWERED')", [a.product, user]);
    const app = express(); app.use(express.json({ limit: '256kb' }));
    app.use(commerce.createThemeStorefrontHostGuard({ database: pool, enabled: true, trustedPlatformHosts: ['127.0.0.1', 'localhost'] }));
    let assetReads = 0;
    app.use('/api/theme-storefront', createThemeStorefrontRouter({ database: pool, enabled: true, assetReader: async () => { assetReads += 1; return { bytes: Buffer.from('fixture-image-bytes'), mimeType: 'image/png' }; } }));
    app.get('/api/products', (_req, res) => res.json({ platformOnly: true }));
    app.post('/api/payments', (_req, res) => res.json({ mustNotReach: true }));
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const request = async (path, { host = a.host, body, headers = {}, method = body ? 'POST' : 'GET' } = {}) => {
        // Native fetch in the current Node runtime rewrites Host. Raw HTTP keeps
        // the real tenant Host header while the socket stays strictly loopback.
        return new Promise((resolve, reject) => {
            const req = http.request(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { host, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) } }, (response) => {
                let bytes = ''; response.setEncoding('utf8'); response.on('data', (chunk) => { bytes += chunk; });
                response.on('end', () => { try { resolve({ status: response.statusCode, body: response.headers['content-type']?.includes('application/json') ? JSON.parse(bytes) : bytes }); } catch (error) { reject(error); } });
            });
            req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
        });
    };
    const api = (path, options) => request(`/api/theme-storefront${path}`, options);
    const ok = (response, status = 200) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
    const ids = (rows) => rows.map((row) => Number(row.id));
    const reference = async (refs, referenceAdapter) => {
        const client = await pool.connect();
        try { await client.query('BEGIN'); const result = await commerce.validateDocumentReferences(client, { service: a.service, assignment: a.assignment,
            document: referenceAdapter ? {} : { schemaVersion: 1, assetIds: refs.assetIds || [], components: [{ props: refs }] }, referenceAdapter }); await client.query('ROLLBACK'); return result; }
        catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    };
    await gate('C01 complete registry and two independent store scopes', async () => { assert(db.migrations.some((name) => name.includes('seller_experience'))); assert.notEqual(a.legacy, b.legacy); });
    await gate('C02 verified host resolves canonical identity and legal reference', async () => {
        assert.equal(String((await commerce.resolvePublic(pool, a.host)).legacy_store_id), String(a.legacy));
        const context = ok(await api('/context')); assert.equal(context.store.name, 'Public wave2-a'); assert.equal(context.commerceMode, 'SINGLE_STORE');
        assert.equal(context.store.legal_refs[0].public_legal_name, legal.publicLegalName); assert.equal(context.store.logo_url, null); assert.equal(context.store.contact, null); assert.equal(context.checkout.enabled, false);
        const other = ok(await api('/context', { host: b.host })); assert.equal(other.store.name, 'Public wave2-b'); assert.deepEqual(other.store.legal_refs, []);
    });
    await gate('C03 unknown host and forwarded host cannot claim another tenant', async () => {
        ok(await api('/context', { host: 'unknown.test', headers: { 'x-forwarded-host': a.host } }), 421);
        assert.equal(ok(await api('/context', { headers: { 'x-forwarded-host': b.host } })).store.name, 'Public wave2-a');
        ok(await api('/context', { host: `${a.host}.` }), 400);
    });
    await gate('C04 custom host cannot escape through generic products/payment APIs', async () => {
        ok(await request('/api/products'), 404); ok(await request('/api/payments', { body: { productId: b.product } }), 404);
        ok(await request('/API/Products'), 404); ok(await request('/API/Payments', { body: { productId: b.product } }), 404);
        assert.equal(ok(await request('/api/products', { host: 'localhost' })).platformOnly, true);
        ok(await api('/context', { host: 'localhost' }), 404);
    });
    await gate('C05 catalog and search only return eligible canonical store products', async () => {
        assert.deepEqual(ids(ok(await api('/products')).products).sort(), [a.product, a.variantProduct].sort());
        assert.deepEqual(ids(ok(await api('/products?q=Search')).products), [a.product]);
        assert.equal(ok(await api('/products?q=wave2-b')).products.length, 0);
        const sorted = ok(await api('/products?sort=price_desc')); assert.deepEqual(ids(sorted.products), [a.variantProduct, a.product]);
        assert.deepEqual(sorted.products.find(row => row.id === a.product).category_ids, [a.category]);
        assert.deepEqual(sorted.products.find(row => row.id === a.variantProduct).category_ids, []);
    });
    await gate('C06 foreign missing and hidden product detail have identical response', async () => {
        const missing = await api('/products/2147483647'); ok(missing, 404);
        for (const productId of [b.product, hidden]) assert.deepEqual(await api(`/products/${productId}`), missing);
        const own = ok(await api(`/products/${a.product}`)); assert.equal(own.price, 125.5); assert(!('store_id' in own)); assert(!('sku' in own));
    });
    await gate('C07 store override query/body and forged prices are rejected', async () => {
        ok(await api(`/products?storeId=${b.legacy}`), 400); ok(await api(`/context?storeId=${b.legacy}`), 400);
        ok(await api('/quote', { body: { items: [{ productId: a.product, quantity: 1 }], storeId: b.legacy } }), 400);
        ok(await api('/quote', { body: { items: [{ productId: a.product, quantity: 1, price: 0 }] } }), 400);
    });
    await gate('C08 categories, counts and category filters are store scoped', async () => {
        const rows = ok(await api('/categories')); assert.deepEqual(ids(rows), [a.category]); assert.equal(rows[0].product_count, 1);
        assert.deepEqual(ids(ok(await api(`/products?categoryId=${a.category}`)).products), [a.product]);
        assert.deepEqual(await api(`/products?categoryId=${b.category}`), await api('/products?categoryId=2147483647'));
    });
    await gate('C28 verified store documents never fall through to global marketplace HTML', async () => {
        for (const path of ['/', '/magaza/foreign', '/admin-login', '/assets/main.js']) {
            assert.deepEqual(await request(path), { status: 503, body: { code: 'STOREFRONT_NOT_PUBLISHED' } });
        }
        assert.equal(ok(await api('/context')).store.name, 'Public wave2-a');
        assert.equal(ok(await request('/api/products', { host: 'localhost' })).platformOnly, true);
    });
    await gate('C09 collections intersect canonical store products', async () => {
        assert.deepEqual(ids(ok(await api('/collections'))), [a.collection]);
        assert.deepEqual(ids(ok(await api(`/collections/${a.collection}`)).products), [a.product]);
        assert.deepEqual(await api(`/collections/${b.collection}`), await api('/collections/2147483647'));
    });
    await gate('C10 recommendations cannot disclose foreign store products', async () => {
        assert.deepEqual(ids(ok(await api(`/products/${a.product}/recommendations`)).products), [a.variantProduct]);
        ok(await api(`/products/${b.product}/recommendations`), 404);
    });
    await gate('C11 navigation contains only scoped categories', async () => {
        const nav = ok(await api('/navigation')); assert(nav.links.some((row) => row.target === '/category/category-wave2-a'));
        assert(!JSON.stringify(nav).includes('wave2-b'));
    });
    await gate('C12 reviews/questions only expose published answered masked content', async () => {
        const reviews = ok(await api(`/products/${a.product}/reviews`)); assert.equal(reviews.reviews.length, 1); assert.equal(reviews.reviews[0].comment, 'Published A');
        assert(!JSON.stringify(reviews).includes('Private Customer Name'));
        const questions = ok(await api(`/products/${a.product}/questions`)); assert.equal(questions.questions.length, 1); assert.equal(questions.questions[0].answer, 'Answer A');
        for (const type of ['reviews', 'questions']) ok(await api(`/products/${b.product}/${type}`), 404);
    });
    await gate('C13 canonical variant detail and tuple quote retain two selected variants', async () => {
        const product = ok(await api(`/products/${a.variantProduct}`)); assert.equal(product.variants.length, 2);
        const before = (await pool.query('SELECT variant_id,quantity FROM seller_inventory_items ORDER BY id')).rows;
        const result = ok(await api('/quote', { body: { items: a.variants.map((variantId) => ({ productId: a.variantProduct, variantId, quantity: 1 })) } }));
        assert.equal(result.items.length, 2); assert.deepEqual(result.items.map((item) => item.price), [222, 333]); assert.equal(result.totals.subtotal, 555);
        assert.equal(result.inventoryReserved, false); assert.equal(result.checkout.enabled, false);
        assert.deepEqual((await pool.query('SELECT variant_id,quantity FROM seller_inventory_items ORDER BY id')).rows, before);
    });
    await gate('C14 foreign product and variant cannot enter a quote', async () => {
        ok(await api('/quote', { body: { items: [{ productId: b.product, quantity: 1 }] } }), 404);
        ok(await api('/quote', { body: { items: [{ productId: a.variantProduct, variantId: b.variants[0], quantity: 1 }] } }), 404);
        ok(await api('/quote', { body: { items: [{ productId: a.product, quantity: 1 }, { productId: b.product, quantity: 1 }] } }), 404);
        ok(await api('/quote', { body: { items: [{ productId: a.variantProduct, quantity: 1 }] } }), 400);
        ok(await api('/quote', { body: { items: [{ productId: a.variantProduct, variantId: a.variants[0], quantity: 6 }] } }), 409);
    });
    await gate('C15 valid canonical draft references succeed; foreign and missing fail identically', async () => {
        assert.equal((await reference({ productIds: [a.product], categoryIds: [a.category], collectionIds: [a.collection], target: `/product/${a.product}` })).validated, true);
        for (const refs of [{ productIds: [b.product] }, { productIds: [hidden] }, { productIds: [2147483647] }, { categoryIds: [b.category] }, { collectionIds: [b.collection] }, { target: `/product/${b.product}` }, { target: '/category/category-wave2-b' }, { target: '/collection/collection-wave2-b' }]) await assert.rejects(reference(refs), { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    });
    await gate('C16 native manifest adapter enforces variant/navigation scope', async () => {
        const adapter = (productId, variantId) => () => ({ variants: [{ productId, variantId }], navigation: [{ target: '/shop' }] });
        assert.equal((await reference({}, adapter(a.variantProduct, a.variants[0]))).variantCount, 1);
        await assert.rejects(reference({}, adapter(a.variantProduct, b.variants[0])), { code: 'RESOURCE_NOT_FOUND' });
        await assert.rejects(reference({}, () => ({ navigation: [{ target: 'https://foreign.test/product/1' }] })), { code: 'INVALID_NAVIGATION' });
    });
    await gate('C17 asset references and asset route require own READY metadata before adapter', async () => {
        assert.equal((await reference({ assetIds: [a.assetId] })).assetCount, 1);
        await assert.rejects(reference({ assetIds: [b.assetId] }), { code: 'RESOURCE_NOT_FOUND' });
        const own = await api(`/assets/${a.assetId}`); ok(own); assert.equal(own.body, 'fixture-image-bytes'); assert.equal(assetReads, 1);
        ok(await api(`/assets/${b.assetId}`), 404); assert.equal(assetReads, 1);
        await pool.query("UPDATE theme_assets SET status='QUARANTINED' WHERE id=$1", [a.assetId]);
        ok(await api(`/assets/${a.assetId}`), 404); await assert.rejects(reference({ assetIds: [a.assetId] }), { code: 'RESOURCE_NOT_FOUND' });
        await pool.query("UPDATE theme_assets SET status='READY' WHERE id=$1", [a.assetId]);
    });
    await gate('C18 internal resolver rejects forged service-assignment/channel tuple', async () => {
        await assert.rejects(commerce.resolveInternal(pool, { service: a.service, assignment: b.assignment }), { code: 'RESOURCE_NOT_FOUND' });
        await assert.rejects(commerce.resolveInternal(pool, { service: a.service, assignment: { ...a.assignment, channel: 'app' } }), { code: 'RESOURCE_NOT_FOUND' });
    });
    await gate('C19 pending or revoked binding immediately blocks public content', async () => {
        for (const status of ['PENDING', 'REVOKED']) { await pool.query('UPDATE theme_domain_bindings SET status=$2 WHERE id=$1', [a.bindingId, status]); ok(await api('/context'), 404); ok(await api('/products'), 404); }
        await pool.query("UPDATE theme_domain_bindings SET status='VERIFIED' WHERE id=$1", [a.bindingId]); ok(await api('/context'));
    });
    await gate('C20 suspended service and paused store immediately block access', async () => {
        await pool.query("UPDATE seller_theme_services SET status='SUSPENDED' WHERE id=$1", [a.service.id]); ok(await api('/context'), 404);
        await pool.query("UPDATE seller_theme_services SET status='ACTIVE' WHERE id=$1", [a.service.id]);
        await pool.query("UPDATE seller_store_profiles SET operational_status='paused' WHERE store_id=$1", [a.store]); ok(await api('/products'), 404);
        await pool.query("UPDATE seller_store_profiles SET operational_status='open' WHERE store_id=$1", [a.store]); ok(await api('/products'));
    });
    await gate('C21 service expiry and assignment withdrawal invalidate scope', async () => {
        await pool.query("UPDATE seller_theme_services SET starts_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 day' WHERE id=$1", [a.service.id]); ok(await api('/context'), 404);
        await pool.query('UPDATE seller_theme_services SET expires_at=NULL WHERE id=$1', [a.service.id]);
        await pool.query("UPDATE theme_assignments SET status='WITHDRAWN',withdrawn_at=NOW() WHERE id=$1", [a.assignment.id]); ok(await api('/products'), 404);
        await assert.rejects(reference({ productIds: [a.product] }), { code: 'RESOURCE_NOT_FOUND' });
    });
    await gate('C22 request validation and no hidden remote writes', async () => {
        ok(await api('/products?sort=unsafe', { host: b.host }), 400);
        ok(await api('/products?limit=101', { host: b.host }), 400);
        assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM orders')).rows[0].n), 0);
    });
    await gate('C23 candidate offer validates references without inventing an assignment', async () => {
        const args = { service: b.service, candidate: { theme_version_id: versionId, channel: 'web', commerce_mode: 'SINGLE_STORE' }, document };
        assert.equal((await commerce.validateCandidateDocumentReferences(pool, args)).validated, true);
        const snapshot = await commerce.previewCandidate(pool, { service: b.service, candidate: args.candidate });
        assert.equal(snapshot.context.assignment, null); assert.equal(snapshot.context.candidate.themeVersionId, versionId);
        assert.deepEqual(ids(snapshot.products).sort(), [b.product, b.variantProduct].sort());
        await assert.rejects(commerce.validateCandidateDocumentReferences(pool, { ...args, document: { ...document, components: [{ props: { productIds: [a.product] } }] } }), { code: 'RESOURCE_NOT_FOUND' });
    });
    await gate('C24 authenticated native preview uses shared reference adapter and canonical snapshot', async () => {
        const studio = require('../services/themePlatformStudioDocument');
        const native = studio.createNativeExample();
        assert.equal((await commerce.validateDocumentReferences(pool, { service: b.service, assignment: b.assignment, document: native, referenceAdapter: studio.commerceReferences })).validated, true);
        const result = await commerce.preview(pool, { service: b.service, assignment: b.assignment });
        assert.equal(result.live, false); assert.deepEqual(ids(result.products).sort(), [b.product, b.variantProduct].sort());
    });
    await gate('C25 authenticated candidate PDP retains reviews questions and scoped recommendations', async () => {
        const candidate = { theme_version_id: versionId, channel: 'web', commerce_mode: 'SINGLE_STORE' };
        const result = await commerce.authenticatedProductPreview(pool, { service: b.service, candidate, productId: b.product });
        assert.equal(result.product.id, b.product); assert.equal(result.product.price, 125.5);
        assert.equal(result.reviews.length, 1); assert.equal(result.reviews[0].comment, 'Foreign B');
        assert.equal(result.questions.length, 1); assert.equal(result.questions[0].answer, 'Foreign Answer');
        assert.deepEqual(ids(result.recommendations), [b.variantProduct]);
        assert.deepEqual(await commerce.authenticatedProductPreview(pool, { service: b.service, assignment: b.assignment, productId: b.product }), result);
    });
    await gate('C26 authenticated foreign PDP and ambiguous candidate scope are denied', async () => {
        const candidate = { theme_version_id: versionId, channel: 'web', commerce_mode: 'SINGLE_STORE' };
        for (const input of [{ service: b.service, candidate }, { service: b.service, assignment: b.assignment }]) {
            await assert.rejects(commerce.authenticatedProductPreview(pool, { ...input, productId: a.product }), { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
            await assert.rejects(commerce.authenticatedProductPreview(pool, { ...input, productId: 2147483647 }), { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
        }
        await assert.rejects(commerce.authenticatedProductPreview(pool, { service: b.service, assignment: b.assignment, candidate, productId: b.product }), { code: 'INVALID_REFERENCE', statusCode: 400 });
    });
    await gate('C27 authenticated quote uses canonical prices and rejects foreign tuple without writes', async () => {
        const candidate = { theme_version_id: versionId, channel: 'web', commerce_mode: 'SINGLE_STORE' };
        const body = { items: b.variants.map((variantId) => ({ productId: b.variantProduct, variantId, quantity: 1 })) };
        const result = await commerce.authenticatedQuotePreview(pool, { service: b.service, candidate, body });
        assert.equal(result.items.length, 2); assert.equal(result.totals.subtotal, 555); assert.equal(result.checkout.enabled, false); assert.equal(result.inventoryReserved, false);
        assert.deepEqual(await commerce.authenticatedQuotePreview(pool, { service: b.service, assignment: b.assignment, body }), result);
        await assert.rejects(commerce.authenticatedQuotePreview(pool, { service: b.service, candidate, body: { items: [{ productId: a.product, quantity: 1 }] } }), { code: 'RESOURCE_NOT_FOUND' });
        await assert.rejects(commerce.authenticatedQuotePreview(pool, { service: b.service, assignment: b.assignment, body: { items: [{ productId: b.variantProduct, variantId: a.variants[0], quantity: 1 }] } }), { code: 'RESOURCE_NOT_FOUND' });
        assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM orders')).rows[0].n), 0);
    });
})().catch((error) => { (db?.originalConsole.error || console.error)(db ? db.redact(error.stack || error.message) : error.message); process.exitCode = 1; })
    .finally(async () => {
        if (server) await new Promise((resolve) => server.close(resolve));
        try { if (db) cleanup = await db.cleanup(); } catch (error) { console.error(error.message); process.exitCode = 1; }
        console.log(JSON.stringify({ suite: 'themePlatformCommercePostgresSmoke', result: process.exitCode ? 'FAIL' : 'PASS', pass: gates.filter((row) => row.status === 'PASS').length, fail: gates.filter((row) => row.status === 'FAIL').length,
            gates, cleanup, migrationCount: db?.migrations.length, scope: 'real disposable PostgreSQL + loopback HTTP; fixture metadata and byte-reader test double for asset authorization only; no browser/DNS/TLS/provider/native/production UAT' }));
    });
