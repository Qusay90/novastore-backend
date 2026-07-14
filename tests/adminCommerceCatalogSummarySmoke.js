const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { authenticate, requireAdmin } = require('../middlewares/authMiddleware');
const { privateNoStore } = require('../middlewares/privateNoStore');
const { createRequireCurrentAdmin } = require('../services/currentAdminGuard');
const {
    createGetAdminProductSummaries,
    parseOrderSummaryLimit
} = require('../services/adminCommerceReadService');

process.env.JWT_SECRET = 'commerce-pro-catalog-summary-smoke-secret';

const tokenFor = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

const createResponse = () => ({
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(value) {
        this.payload = value;
        return this;
    },
    setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = String(value);
    }
});

const runChain = async (handlers, req) => {
    const res = createResponse();
    const dispatch = async (index) => {
        if (index >= handlers.length) return;
        let nextPromise = null;
        const next = () => {
            nextPromise = dispatch(index + 1);
            return nextPromise;
        };
        await handlers[index](req, res, next);
        if (nextPromise) await nextPromise;
    };
    await dispatch(0);
    return res;
};

const productRow = (id) => ({
    id,
    name: `Ürün ${id}`,
    price: '149.90',
    old_price: null,
    currency: 'TRY',
    stock: 8,
    publication_status: 'active',
    is_customer_visible: true,
    deleted_at: null,
    created_at: '2026-07-14T10:00:00.000Z',
    updated_at: '2026-07-14T11:00:00.000Z',
    revision: 3,
    primary_category_id: 4,
    primary_category_name: 'Telefon',
    primary_category_path: 'elektronik/telefon',
    category_count: 2,
    has_media: true
});

(async () => {
    assert.equal(parseOrderSummaryLimit(undefined), 50);
    assert.equal(parseOrderSummaryLimit(''), 50);
    assert.equal(parseOrderSummaryLimit('0'), 1);
    assert.equal(parseOrderSummaryLimit('-12'), 1);
    assert.equal(parseOrderSummaryLimit('100'), 100);
    assert.equal(parseOrderSummaryLimit('101'), 100);
    assert.equal(parseOrderSummaryLimit('20junk'), 50);

    const catalogQueries = [];
    const catalogHandler = createGetAdminProductSummaries({
        async query(sql, params) {
            catalogQueries.push({ sql, params });
            return { rows: Array.from({ length: 101 }, (_, index) => productRow(200 - index)) };
        }
    });
    const catalogResponse = createResponse();
    await catalogHandler({ query: { limit: '100' } }, catalogResponse);

    assert.equal(catalogResponse.statusCode, 200);
    assert.equal(catalogResponse.payload.catalogMode, 'first_party');
    assert.equal(catalogResponse.payload.limit, 100);
    assert.equal(catalogResponse.payload.items.length, 100);
    assert.equal(catalogResponse.payload.hasMore, true);
    assert.deepEqual(catalogQueries[0].params, ['novastore-platform', 101]);
    assert.deepEqual(Object.keys(catalogResponse.payload.items[0]).sort(), [
        'category_count',
        'created_at',
        'currency',
        'deleted_at',
        'has_media',
        'id',
        'is_customer_visible',
        'name',
        'old_price',
        'price',
        'primary_category_id',
        'primary_category_name',
        'primary_category_path',
        'publication_status',
        'revision',
        'stock',
        'updated_at'
    ]);

    const sql = catalogQueries[0].sql;
    const projection = sql.match(/SELECT([\s\S]*?)FROM products p/i)?.[1] || '';
    assert.notEqual(projection, '', 'ürün özet sorgusu açık bir projection içermeli');
    assert.doesNotMatch(projection, /\bp\.\*\b|\bSELECT\s+\*/i);
    assert.doesNotMatch(
        projection,
        /\bdescription\b|\bimage_url\b|\bmedia_url\b|\bstore_id\b|\bseller\b|\brisk\b/i,
        'ürün özet DTO açıklama, medya URL, satıcı veya uydurma risk alanı seçmemeli'
    );
    assert.doesNotMatch(
        sql,
        /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i,
        'ürün özeti sorgusu hiçbir yazma veya DDL komutu içermemeli'
    );
    for (const column of [
        'p.id',
        'p.name',
        'p.price',
        'p.old_price',
        'p.stock',
        'p.publication_status',
        'p.is_customer_visible',
        'p.deleted_at',
        'p.created_at',
        'p.updated_at',
        'p.revision'
    ]) {
        assert.match(projection, new RegExp(column.replace('.', '\\.'), 'i'));
    }
    assert.match(sql, /LEFT JOIN LATERAL[\s\S]*primary_link\.is_primary = TRUE/i);
    assert.match(
        sql,
        /INNER JOIN stores first_party_store[\s\S]*first_party_store\.id = p\.store_id[\s\S]*LOWER\(first_party_store\.slug\) = LOWER\(\$1\)[\s\S]*first_party_store\.is_active = TRUE[\s\S]*first_party_store\.deleted_at IS NULL/i,
        'null, farklı, pasif veya silinmiş store kayıtları first-party katalog kapsamına girmemeli'
    );
    assert.match(sql, /COUNT\(\*\)::INT[\s\S]*FROM product_categories category_link/i);
    assert.match(sql, /EXISTS\s*\([\s\S]*FROM product_media media[\s\S]*media\.product_id = p\.id/i);
    assert.match(sql, /ORDER BY p\.id DESC\s+LIMIT \$2/i);

    let failingQueryCount = 0;
    const failingHandler = createGetAdminProductSummaries({
        async query() {
            failingQueryCount += 1;
            throw new Error('catalog unavailable');
        }
    });
    const originalConsoleError = console.error;
    console.error = () => {};
    const failingResponse = createResponse();
    try {
        await failingHandler({ query: { limit: '25' } }, failingResponse);
    } finally {
        console.error = originalConsoleError;
    }
    assert.equal(failingQueryCount, 1);
    assert.equal(failingResponse.statusCode, 500);
    assert.deepEqual(failingResponse.payload, { error: 'Ürün özetleri getirilemedi.' });

    let guardedCatalogQueryCount = 0;
    const guardedCatalogHandler = createGetAdminProductSummaries({
        async query() {
            guardedCatalogQueryCount += 1;
            return { rows: [productRow(21)] };
        }
    });
    const currentAdminQueries = [];
    const currentAdminGuard = createRequireCurrentAdmin({
        async query(sqlText, params) {
            currentAdminQueries.push({ sql: sqlText, params });
            return { rows: [{ id: 17, role: 'admin' }] };
        }
    });
    const chain = [privateNoStore, authenticate, requireAdmin, currentAdminGuard, guardedCatalogHandler];

    const noToken = await runChain(chain, { headers: {}, query: { limit: '100' } });
    assert.equal(noToken.statusCode, 401);
    assert.equal(noToken.headers['cache-control'], 'private, no-store, max-age=0');
    assert.equal(guardedCatalogQueryCount, 0);

    const customer = await runChain(chain, {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'customer' })}` },
        query: { limit: '100' }
    });
    assert.equal(customer.statusCode, 403);
    assert.equal(guardedCatalogQueryCount, 0);

    const missingCurrentAdminChain = [
        privateNoStore,
        authenticate,
        requireAdmin,
        createRequireCurrentAdmin({ async query() { return { rows: [] }; } }),
        guardedCatalogHandler
    ];
    const missingCurrentAdmin = await runChain(missingCurrentAdminChain, {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
        query: { limit: '100' }
    });
    assert.equal(missingCurrentAdmin.statusCode, 401);
    assert.equal(guardedCatalogQueryCount, 0);

    const demotedCurrentAdminChain = [
        privateNoStore,
        authenticate,
        requireAdmin,
        createRequireCurrentAdmin({ async query() { return { rows: [{ id: 17, role: 'customer' }] }; } }),
        guardedCatalogHandler
    ];
    const demotedCurrentAdmin = await runChain(demotedCurrentAdminChain, {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
        query: { limit: '100' }
    });
    assert.equal(demotedCurrentAdmin.statusCode, 403);
    assert.equal(guardedCatalogQueryCount, 0);

    const currentAdminErrorChain = [
        privateNoStore,
        authenticate,
        requireAdmin,
        createRequireCurrentAdmin({ async query() { throw new Error('guard database unavailable'); } }),
        guardedCatalogHandler
    ];
    console.error = () => {};
    let currentAdminError;
    try {
        currentAdminError = await runChain(currentAdminErrorChain, {
            headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
            query: { limit: '100' }
        });
    } finally {
        console.error = originalConsoleError;
    }
    assert.equal(currentAdminError.statusCode, 500);
    assert.deepEqual(currentAdminError.payload, { error: 'Yönetici yetkisi doğrulanamadı.' });
    assert.equal(currentAdminError.headers['cache-control'], 'private, no-store, max-age=0');
    assert.equal(guardedCatalogQueryCount, 0);

    const validAdmin = await runChain(chain, {
        headers: { authorization: `Bearer ${tokenFor({ id: 17, role: 'admin' })}` },
        query: { limit: '100' }
    });
    assert.equal(validAdmin.statusCode, 200);
    assert.equal(validAdmin.headers['cache-control'], 'private, no-store, max-age=0');
    assert.equal(validAdmin.payload.items[0].id, 21);
    assert.equal(guardedCatalogQueryCount, 1);
    assert.deepEqual(currentAdminQueries[0].params, [17]);

    const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'adminRoutes.js'), 'utf8');
    assert.match(routeSource, /integratedAdminRead = \[privateNoStore, authenticate, requireAdmin, requireCurrentAdmin\]/);
    assert.match(
        routeSource,
        /router\.get\('\/catalog\/products\/summary', \.\.\.integratedAdminRead, getAdminProductSummaries\)/
    );

    console.log('admin Commerce Pro first-party catalog summary smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
