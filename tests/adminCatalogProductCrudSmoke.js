const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { createAuthSessionFixture } = require('./helpers/createAuthSessionFixture');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_catalog_product_crud_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'admin-catalog-product-crud-smoke-secret';

const authFixture = createAuthSessionFixture();
authFixture.install();

const {
    normalizeCreateProductPayload,
    normalizeUpdateProductPayload,
    normalizeArchiveProductPayload
} = require('../services/adminCatalogProductPolicy');

const validCreate = {
    name: 'Nova Ürün',
    description: 'Medyasız güvenli ürün',
    price: 1299.9,
    old_price: null,
    stock: 8,
    sku: 'NV-101',
    brand: 'Nova',
    product_type: 'Test Ürünü',
    vat_rate: 20,
    vat_rate_source: 'USER_SUPPLIED_TAX_VALUE',
    weight_grams: 500,
    desi: 1.25,
    category_ids: [5],
    primary_category_id: 5,
    attributes: {}
};
const normalizedCreate = normalizeCreateProductPayload(validCreate);
assert.equal(normalizedCreate.publication_status, 'draft');
assert.equal(normalizedCreate.is_customer_visible, false);
assert.deepEqual(normalizedCreate.category_ids, [5]);
assert.equal(normalizedCreate.normalized_sku, 'NV-101');
assert.throws(
    () => normalizeCreateProductPayload({ ...validCreate, image_url: 'https://example.invalid/private.jpg' }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_FIELD_NOT_ALLOWED'
        && error.details.unknown_fields.includes('image_url')
);
assert.throws(
    () => normalizeCreateProductPayload({ ...validCreate, store_id: 99 }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_FIELD_NOT_ALLOWED'
);
assert.throws(
    () => normalizeCreateProductPayload({ ...validCreate, price: 1.001 }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_PRICE_INVALID'
);
assert.throws(
    () => normalizeCreateProductPayload({ ...validCreate, publication_status: 'archived' }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_STATUS_INVALID'
);
assert.throws(
    () => normalizeCreateProductPayload({ ...validCreate, is_customer_visible: 'true' }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_BOOLEAN_INVALID'
);
assert.throws(
    () => normalizeUpdateProductPayload({ expected_revision: 1 }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_UPDATE_EMPTY'
);
assert.throws(
    () => normalizeUpdateProductPayload({ name: 'Eksik revision' }),
    (error) => error.code === 'ADMIN_CATALOG_PRECONDITION_REQUIRED' && error.statusCode === 428
);
assert.throws(
    () => normalizeArchiveProductPayload({ expected_revision: 1, reason: 'raw value' }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_FIELD_NOT_ALLOWED'
);

const pool = require('../config/db');
const categoryStatsService = require('../services/categoryStatsService');
const originalStatsSync = categoryStatsService.syncCategoryStatsForProducts;
categoryStatsService.syncCategoryStatsForProducts = async (client, productIds, previousCategoryIds) => {
    await client.query('/* ADMIN_CATALOG_TEST_CATEGORY_STATS */ SELECT 1', [productIds, previousCategoryIds]);
    return [];
};

const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;
const originalFlag = process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED;

const now = '2026-07-14T12:00:00.000Z';
const state = {
    products: new Map([
        [72, {
            id: 72,
            name: 'Başka mağaza ürünü',
            description: null,
            price: '10.00',
            old_price: null,
            stock: 1,
            sku: null,
            normalized_sku: null,
            brand: null,
            product_type: null,
            vat_rate: null,
            vat_rate_source: null,
            weight_grams: null,
            desi: null,
            category: 'Kategorisiz',
            categories: ['Kategorisiz'],
            publication_status: 'draft',
            is_customer_visible: false,
            deleted_at: null,
            created_at: now,
            updated_at: now,
            revision: 1,
            store_id: 99,
            has_media: false
        }]
    ]),
    categories: new Map([
        [5, {
            id: 5,
            name: 'Telefon',
            path: 'Elektronik / Telefon',
            is_active: true,
            is_customer_visible: true,
            deleted_at: null,
            has_children: false
        }],
        [6, {
            id: 6,
            name: 'Gizli',
            path: 'Gizli',
            is_active: false,
            is_customer_visible: false,
            deleted_at: null,
            has_children: false
        }]
    ]),
    links: new Map(),
    attributes: new Map(),
    nextProductId: 101,
    nextAuditId: 501,
    audits: [],
    calls: [],
    currentAdminQueries: 0,
    transactionConnects: 0,
    platformStoreActive: true
};

const compact = (sql) => String(sql).replace(/\s+/g, ' ').trim();

const productDetailRow = (product) => ({ ...product, has_media: product.has_media === true });

const categoryDetailRows = (productId) => (state.links.get(productId) || []).map((link) => {
    const category = state.categories.get(link.categoryId);
    return {
        id: category.id,
        name: category.name,
        path: category.path,
        is_primary: link.isPrimary
    };
}).sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || left.id - right.id);

const runQuery = async (sql, params = [], { transaction = false } = {}) => {
    const text = compact(sql);
    state.calls.push({ text, params, transaction });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };

    if (/^SELECT id, revision FROM products WHERE id = \$1 FOR UPDATE$/i.test(text)) {
        const product = state.products.get(Number(params[0]));
        return { rows: product ? [{ id: product.id, revision: product.revision }] : [] };
    }
    if (/^SELECT id FROM stores/i.test(text) && /FOR SHARE$/i.test(text)) {
        return { rows: state.platformStoreActive ? [{ id: 10 }] : [] };
    }
    if (/FROM products WHERE id = \$1 AND store_id = \$2$/i.test(text)) {
        const product = state.products.get(Number(params[0]));
        return { rows: product && product.store_id === Number(params[1]) ? [{ ...product }] : [] };
    }
    if (/FROM categories category WHERE category\.id = ANY\(\$1::INTEGER\[\]\)/i.test(text)) {
        return {
            rows: params[0]
                .map(Number)
                .map((id) => state.categories.get(id))
                .filter(Boolean)
                .map((category) => ({ ...category }))
        };
    }
    if (/^INSERT INTO products/i.test(text)) {
        const skuConflict = [...state.products.values()].some((product) =>
            product.deleted_at === null
            && product.normalized_sku !== null
            && product.normalized_sku === params[6]
        );
        if (skuConflict) {
            throw Object.assign(new Error('duplicate key value violates unique constraint'), {
                code: '23505',
                constraint: 'idx_products_normalized_sku_unique'
            });
        }
        const id = state.nextProductId++;
        const product = {
            id,
            name: params[0],
            description: params[1],
            price: Number(params[2]).toFixed(2),
            old_price: params[3] === null ? null : Number(params[3]).toFixed(2),
            stock: params[4],
            sku: params[5],
            normalized_sku: params[6],
            brand: params[7],
            product_type: params[8],
            vat_rate: params[9] === null ? null : Number(params[9]).toFixed(2),
            vat_rate_source: params[10],
            weight_grams: params[11],
            desi: params[12] === null ? null : Number(params[12]).toFixed(3),
            category: params[13],
            categories: [...params[14]],
            publication_status: params[15],
            is_customer_visible: params[16],
            deleted_at: null,
            created_at: now,
            updated_at: now,
            revision: 1,
            store_id: Number(params[17]),
            has_media: true
        };
        state.products.set(id, product);
        return { rows: [{ id, revision: 1 }], rowCount: 1 };
    }
    if (/^SELECT category_id, is_primary FROM product_categories/i.test(text)) {
        return {
            rows: (state.links.get(Number(params[0])) || []).map((link) => ({
                category_id: link.categoryId,
                is_primary: link.isPrimary
            }))
        };
    }
    if (/^DELETE FROM product_categories WHERE product_id = \$1$/i.test(text)) {
        state.links.set(Number(params[0]), []);
        return { rows: [] };
    }
    if (/^INSERT INTO product_categories/i.test(text)) {
        const productId = Number(params[0]);
        const links = state.links.get(productId) || [];
        links.push({ categoryId: Number(params[1]), isPrimary: params[2] === true });
        state.links.set(productId, links);
        return { rows: [] };
    }
    if (/FROM product_attribute_values value JOIN attribute_definitions definition/i.test(text)) {
        return { rows: state.attributes.get(Number(params[0])) || [] };
    }
    if (/FROM attribute_templates template JOIN template_attributes link/i.test(text)) {
        return { rows: [] };
    }
    if (/^DELETE FROM product_attribute_values value/i.test(text)) {
        state.attributes.set(Number(params[0]), []);
        return { rows: [] };
    }
    if (/^UPDATE products SET name = \$1/i.test(text)) {
        const product = state.products.get(Number(params[17]));
        assert.equal(product.store_id, Number(params[18]));
        Object.assign(product, {
            name: params[0],
            description: params[1],
            price: Number(params[2]).toFixed(2),
            old_price: params[3] === null ? null : Number(params[3]).toFixed(2),
            stock: params[4],
            sku: params[5],
            normalized_sku: params[6],
            brand: params[7],
            product_type: params[8],
            vat_rate: params[9] === null ? null : Number(params[9]).toFixed(2),
            vat_rate_source: params[10],
            weight_grams: params[11],
            desi: params[12] === null ? null : Number(params[12]).toFixed(3),
            category: params[13],
            categories: [...params[14]],
            publication_status: params[15],
            is_customer_visible: params[16]
        });
        return { rows: [{ id: product.id }], rowCount: 1 };
    }
    if (/^UPDATE products SET publication_status = 'archived'/i.test(text)) {
        const product = state.products.get(Number(params[0]));
        assert.equal(product.store_id, Number(params[1]));
        product.publication_status = 'archived';
        product.is_customer_visible = false;
        product.deleted_at = now;
        return { rows: [{ id: product.id }], rowCount: 1 };
    }
    if (/^UPDATE products SET revision = revision \+ 1/i.test(text)) {
        const product = state.products.get(Number(params[0]));
        if (!product || product.revision !== Number(params[1])) return { rows: [] };
        product.revision += 1;
        product.updated_at = now;
        return { rows: [{ revision: product.revision }] };
    }
    if (/^INSERT INTO admin_catalog_audit_events/i.test(text)) {
        state.audits.push({
            actor: params[0],
            entityType: params[2],
            entityKey: params[3],
            action: params[4],
            expectedRevision: params[5],
            resultRevision: params[6],
            changedFields: params[7],
            requestId: params[8],
            metadata: params[9]
        });
        return { rows: [{ id: state.nextAuditId++, created_at: now }] };
    }
    if (/ADMIN_CATALOG_TEST_CATEGORY_STATS/i.test(text)) return { rows: [{ '?column?': 1 }] };

    if (/FROM products product JOIN stores first_party_store/i.test(text)) {
        const product = state.products.get(Number(params[1]));
        return {
            rows: product && product.store_id === 10 ? [productDetailRow(product)] : []
        };
    }
    if (/FROM product_categories category_link JOIN categories category/i.test(text)) {
        return { rows: categoryDetailRows(Number(params[0])) };
    }
    if (/SELECT id, role, auth_enabled FROM users WHERE id = \$1/i.test(text)) {
        state.currentAdminQueries += 1;
        return { rows: [{ id: 17, role: 'admin', auth_enabled: true }] };
    }
    throw new Error(`Unexpected admin catalog fake query: ${text}`);
};

pool.query = (sql, params) => runQuery(sql, params, { transaction: false });
pool.connect = async () => {
    state.transactionConnects += 1;
    return {
        query: (sql, params) => runQuery(sql, params, { transaction: true }),
        release() {
            state.calls.push({ text: 'RELEASE', params: [], transaction: true });
        }
    };
};

const adminRoutes = require('../routes/adminRoutes');
const { sendCatalogProductError } = require('../controllers/adminCatalogProductController');

const hiddenErrorResponse = {
    statusCode: null,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
};
const originalConsoleError = console.error;
console.error = () => {};
try {
    sendCatalogProductError(hiddenErrorResponse, new Error('SELECT secret_token FROM private_table'));
} finally {
    console.error = originalConsoleError;
}
assert.equal(hiddenErrorResponse.statusCode, 500);
assert.deepEqual(hiddenErrorResponse.payload, {
    code: 'ADMIN_CATALOG_PRODUCT_INTERNAL_ERROR',
    error: 'Ürün işlemi tamamlanamadı.'
});

const request = (server, method, path, { body, token, contentType = 'application/json', requestId } = {}) =>
    new Promise((resolve, reject) => {
        const payload = body === undefined
            ? ''
            : (contentType === 'application/json' ? JSON.stringify(body) : String(body));
        const headers = {};
        if (contentType) headers['Content-Type'] = contentType;
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        if (token) headers.Authorization = `Bearer ${token}`;
        if (requestId) headers['X-Request-ID'] = requestId;
        const req = http.request({
            method,
            host: '127.0.0.1',
            port: server.address().port,
            path,
            headers
        }, (response) => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => resolve({
                status: response.statusCode,
                headers: response.headers,
                body: data ? JSON.parse(data) : null
            }));
        });
        req.on('error', reject);
        req.end(payload);
    });

const assertBoundedProduct = (payload) => {
    assert.equal(payload.catalogMode, 'first_party');
    assert.deepEqual(Object.keys(payload.product).sort(), [
        'attributes', 'brand', 'categories', 'category_ids', 'created_at', 'currency', 'deleted_at',
        'description', 'desi', 'has_media', 'id', 'is_customer_visible', 'name', 'old_price',
        'price', 'primary_category_id', 'product_type', 'publication_status', 'revision', 'sku',
        'stock', 'updated_at', 'vat_rate', 'vat_rate_source', 'weight_grams'
    ]);
    assert.equal(payload.product.currency, 'TRY');
    assert.equal(typeof payload.product.description, 'string');
    assert.equal(JSON.stringify(payload).includes('store_id'), false);
    assert.equal(JSON.stringify(payload).includes('image_url'), false);
    assert.equal(JSON.stringify(payload).includes('media_url'), false);
    assert.equal(JSON.stringify(payload).includes('audit'), false);
};

(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const token = authFixture.issue({ userId: 17, role: 'admin', principal: 'admin' }).token;
    const customerToken = authFixture.issue({ userId: 18, role: 'customer', principal: 'customer' }).token;

    try {
        delete process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED;
        const disabledConnects = state.transactionConnects;
        const disabledAdminReads = state.currentAdminQueries;
        const disabled = await request(server, 'POST', '/api/admin/catalog/products', {
            token,
            body: validCreate
        });
        assert.equal(disabled.status, 503);
        assert.equal(disabled.body.code, 'ADMIN_CATALOG_PRODUCT_WRITE_DISABLED');
        assert.equal(disabled.headers['cache-control'], 'private, no-store, max-age=0');
        assert.equal(state.transactionConnects, disabledConnects);
        assert.equal(state.currentAdminQueries, disabledAdminReads, 'capability current-admin DB adımından önce durmalı');

        const anonymous = await request(server, 'POST', '/api/admin/catalog/products', { body: validCreate });
        assert.equal(anonymous.status, 401);
        assert.equal(state.currentAdminQueries, disabledAdminReads);

        const customerConnects = state.transactionConnects;
        const customerAdminReads = state.currentAdminQueries;
        const customer = await request(server, 'POST', '/api/admin/catalog/products', {
            token: customerToken,
            body: validCreate
        });
        assert.equal(customer.status, 401);
        assert.equal(state.transactionConnects, customerConnects);
        assert.equal(state.currentAdminQueries, customerAdminReads);

        process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED = 'true';
        const beforeWrongTypeConnects = state.transactionConnects;
        const beforeWrongTypeAdminReads = state.currentAdminQueries;
        const wrongType = await request(server, 'POST', '/api/admin/catalog/products', {
            token,
            contentType: 'application/x-www-form-urlencoded',
            body: 'name=Nova'
        });
        assert.equal(wrongType.status, 415);
        assert.equal(wrongType.body.code, 'ADMIN_CATALOG_JSON_REQUIRED');
        assert.equal(state.transactionConnects, beforeWrongTypeConnects);
        assert.equal(state.currentAdminQueries, beforeWrongTypeAdminReads + 1,
            'JSON guard current-admin doğrulamasından sonra, mutation transaction öncesinde çalışmalı');

        const beforeUnknownConnects = state.transactionConnects;
        const unknownField = await request(server, 'POST', '/api/admin/catalog/products', {
            token,
            body: { ...validCreate, media: [] }
        });
        assert.equal(unknownField.status, 400);
        assert.equal(unknownField.body.code, 'ADMIN_CATALOG_PRODUCT_FIELD_NOT_ALLOWED');
        assert.equal(state.transactionConnects, beforeUnknownConnects);

        state.platformStoreActive = false;
        const beforeUnavailableInserts = state.calls.filter(({ text }) => /^INSERT INTO products/i.test(text)).length;
        const unavailableStore = await request(server, 'POST', '/api/admin/catalog/products', {
            token,
            body: validCreate
        });
        state.platformStoreActive = true;
        assert.equal(unavailableStore.status, 503);
        assert.equal(unavailableStore.body.code, 'ADMIN_CATALOG_PLATFORM_STORE_UNAVAILABLE');
        assert.equal(state.calls.filter(({ text }) => /^INSERT INTO products/i.test(text)).length, beforeUnavailableInserts,
            'platform store yokken ürün insert edilmemeli');

        const beforeHiddenCategoryInserts = state.calls.filter(({ text }) => /^INSERT INTO products/i.test(text)).length;
        const hiddenCategory = await request(server, 'POST', '/api/admin/catalog/products', {
            token,
            body: {
                ...validCreate,
                publication_status: 'active',
                is_customer_visible: true,
                category_ids: [6],
                primary_category_id: 6
            }
        });
        assert.equal(hiddenCategory.status, 400);
        assert.equal(hiddenCategory.body.code, 'PRODUCT_CATEGORY_INVALID');
        assert.equal(state.calls.filter(({ text }) => /^INSERT INTO products/i.test(text)).length, beforeHiddenCategoryInserts);

        const beforeCreateCallIndex = state.calls.length;
        const created = await request(server, 'POST', '/api/admin/catalog/products', {
            token,
            body: validCreate,
            requestId: 'catalog-create-101'
        });
        assert.equal(created.status, 201);
        assertBoundedProduct(created.body);
        assert.equal(created.body.product.id, 101);
        assert.equal(created.body.product.sku, 'NV-101');
        assert.equal(created.body.product.brand, 'Nova');
        assert.equal(created.body.product.product_type, 'Test Ürünü');
        assert.equal(created.body.product.vat_rate, 20);
        assert.equal(created.body.product.vat_rate_source, 'USER_SUPPLIED_TAX_VALUE');
        assert.equal(created.body.product.weight_grams, 500);
        assert.equal(created.body.product.desi, 1.25);
        assert.equal(created.body.product.publication_status, 'draft');
        assert.equal(created.body.product.is_customer_visible, false);
        assert.equal(created.body.product.has_media, true, 'medya yalnızca boolean olarak görünmeli');
        assert.deepEqual(created.body.product.category_ids, [5]);
        assert.equal(created.body.product.categories[0].path, 'Elektronik / Telefon');
        const skuConflict = await request(server, 'POST', '/api/admin/catalog/products', {
            token,
            body: { ...validCreate, sku: 'nv-101' }
        });
        assert.equal(skuConflict.status, 409);
        assert.equal(skuConflict.body.code, 'ADMIN_CATALOG_PRODUCT_SKU_CONFLICT');
        assert.equal(skuConflict.body.details.refetchRequired, true);
        assert.equal(state.products.get(101).store_id, 10, 'store_id yalnızca sunucu tarafından atanmalı');
        const createCalls = state.calls.slice(beforeCreateCallIndex);
        assert.equal(createCalls.some((call) =>
            /FROM products product JOIN stores first_party_store/i.test(call.text) && call.transaction
        ), true, 'mutation response projection aynı transaction client üzerinden okunmalı');
        assert.equal(createCalls.some((call) =>
            /FROM products product JOIN stores first_party_store/i.test(call.text) && !call.transaction
        ), false, 'commit sonrası ayrı detail read duplicate-retry belirsizliği yaratmamalı');

        const detail = await request(server, 'GET', '/api/admin/catalog/products/101', { token, contentType: null });
        assert.equal(detail.status, 200);
        assertBoundedProduct(detail.body);
        assert.equal(detail.body.product.revision, 1);

        const scalarNoop = await request(server, 'PATCH', '/api/admin/catalog/products/101', {
            token,
            body: { expected_revision: 1, name: 'Nova Ürün' }
        });
        assert.equal(scalarNoop.status, 400);
        assert.equal(scalarNoop.body.code, 'ADMIN_CATALOG_PRODUCT_UPDATE_NOOP');
        assert.equal(state.products.get(101).revision, 1);

        const missingPreconditionConnects = state.transactionConnects;
        const missingPrecondition = await request(server, 'PATCH', '/api/admin/catalog/products/101', {
            token,
            body: { stock: 9 }
        });
        assert.equal(missingPrecondition.status, 428);
        assert.equal(missingPrecondition.body.code, 'ADMIN_CATALOG_PRECONDITION_REQUIRED');
        assert.equal(state.transactionConnects, missingPreconditionConnects);

        const updated = await request(server, 'PATCH', '/api/admin/catalog/products/101', {
            token,
            body: {
                expected_revision: 1,
                name: 'Nova Ürün Güncel',
                publication_status: 'active',
                is_customer_visible: true,
                category_ids: [5],
                primary_category_id: 5
            },
            requestId: 'catalog-update-101'
        });
        assert.equal(updated.status, 200);
        assertBoundedProduct(updated.body);
        assert.equal(updated.body.product.revision, 2);
        assert.equal(updated.body.product.publication_status, 'active');
        assert.equal(updated.body.product.name, 'Nova Ürün Güncel');
        assert.equal(state.calls.some(({ text }) => /^DELETE FROM product_attribute_values value/i.test(text)), true,
            'kategori değişiminde template dışı attribute değerleri budanmalı');

        const stale = await request(server, 'PATCH', '/api/admin/catalog/products/101', {
            token,
            body: { expected_revision: 1, stock: 10 }
        });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.code, 'ADMIN_CATALOG_REVISION_CONFLICT');
        assert.equal(stale.body.details.refetchRequired, true);

        const missingTarget = await request(server, 'PATCH', '/api/admin/catalog/products/999', {
            token,
            body: { expected_revision: 1, stock: 1 }
        });
        const foreignTarget = await request(server, 'PATCH', '/api/admin/catalog/products/72', {
            token,
            body: { expected_revision: 999, stock: 1 }
        });
        assert.equal(missingTarget.status, 404);
        assert.equal(foreignTarget.status, 404);
        assert.equal(foreignTarget.body.code, missingTarget.body.code);
        assert.equal(foreignTarget.body.error, missingTarget.body.error);

        const archived = await request(server, 'PATCH', '/api/admin/catalog/products/101/archive', {
            token,
            body: { expected_revision: 2 },
            requestId: 'catalog-archive-101'
        });
        assert.equal(archived.status, 200);
        assertBoundedProduct(archived.body);
        assert.equal(archived.body.product.revision, 3);
        assert.equal(archived.body.product.publication_status, 'archived');
        assert.equal(archived.body.product.is_customer_visible, false);
        assert.ok(archived.body.product.deleted_at);
        assert.equal(archived.body.product.has_media, true);
        assert.deepEqual(archived.body.product.category_ids, [5], 'archive category linklerini korumalı');

        const archivedUpdate = await request(server, 'PATCH', '/api/admin/catalog/products/101', {
            token,
            body: { expected_revision: 3, stock: 11 }
        });
        assert.equal(archivedUpdate.status, 409);
        assert.equal(archivedUpdate.body.code, 'ADMIN_CATALOG_PRODUCT_ALREADY_ARCHIVED');

        const repeatedArchive = await request(server, 'PATCH', '/api/admin/catalog/products/101/archive', {
            token,
            body: { expected_revision: 3 }
        });
        assert.equal(repeatedArchive.status, 409);
        assert.equal(repeatedArchive.body.code, 'ADMIN_CATALOG_PRODUCT_ALREADY_ARCHIVED');
        assert.equal(state.products.get(101).revision, 3, 'tekrar archive revision artırmamalı');

        assert.deepEqual(state.audits.map((event) => event.action), ['create', 'update', 'archive']);
        assert.deepEqual(state.audits.map((event) => event.resultRevision), [1, 2, 3]);
        assert.deepEqual(state.audits.map((event) => event.requestId), [
            'catalog-create-101', 'catalog-update-101', 'catalog-archive-101'
        ]);
        assert.equal(state.audits.every((event) => event.metadata.source === 'admin-commerce-pro'), true);
        assert.equal(state.audits.some((event) => JSON.stringify(event).includes('Medyasız güvenli ürün')), false,
            'audit ham ürün değerlerini taşımamalı');

        const transactionTexts = state.calls.filter((call) => call.transaction).map((call) => call.text);
        assert.equal(transactionTexts.some((text) =>
            /cloudinary|multer/i.test(text) || /^(?:insert|update|delete)\b[\s\S]*\bproduct_media\b/i.test(text)
        ), false);
        assert.equal(transactionTexts.filter((text) => text === 'BEGIN').length >= 7, true);
        assert.equal(transactionTexts.includes('ROLLBACK'), true);

        console.log('admin catalog product CRUD smoke passed');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        pool.connect = originalPoolConnect;
        pool.query = originalPoolQuery;
        categoryStatsService.syncCategoryStatsForProducts = originalStatsSync;
        if (originalFlag === undefined) {
            delete process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED;
        } else {
            process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED = originalFlag;
        }
        await pool.end().catch(() => {});
    }
})().catch((error) => {
    pool.connect = originalPoolConnect;
    pool.query = originalPoolQuery;
    categoryStatsService.syncCategoryStatsForProducts = originalStatsSync;
    if (originalFlag === undefined) {
        delete process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED;
    } else {
        process.env.NOVASTORE_ADMIN_CATALOG_PRODUCT_WRITE_ENABLED = originalFlag;
    }
    console.error(error);
    process.exitCode = 1;
});
