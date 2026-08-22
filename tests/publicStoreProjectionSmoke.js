'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const {
    MEDIA_PUBLIC_KEYS,
    PRODUCT_PUBLIC_KEYS,
    STORE_PUBLIC_KEYS,
    PublicStoreError,
    customerMediaUrl,
    customerText,
    loadPublicStoreBySlug,
    loadSellerPublicPreview,
    normalizeStoreSlug
} = require('../services/publicStoreProjectionService');
const { createPublicStoreRouter } = require('../routes/publicStoreRoutes');

const storeRow = Object.freeze({
    platform_store_id: 101,
    slug: 'nova-teknoloji',
    display_name: 'Nova <Teknoloji>',
    description: 'Güncel <script>alert(1)</script> teknoloji seçkisi',
    shipping_policy: 'Aynı gün\u0000 kargo',
    return_policy: '14 gün içinde iade'
});
const productRows = Object.freeze([
    Object.freeze({
        id: 501,
        name: 'Nova Kulaklık',
        price: '1250.00',
        old_price: '1499.00',
        stock: 7,
        image_url: 'javascript:alert(1)',
        average_rating: '4.8',
        review_count: 12
    }),
    Object.freeze({
        id: 502,
        name: 'Nova Stand',
        price: '450.00',
        old_price: null,
        stock: 0,
        image_url: null,
        average_rating: 0,
        review_count: 0
    })
]);
const mediaRows = Object.freeze([
    Object.freeze({ id: 1, product_id: 501, media_url: 'https://res.cloudinary.com/demo/image/upload/v1/nova-main.webp', media_type: 'image', is_main: true, sort_order: 1 }),
    Object.freeze({ id: 2, product_id: 501, media_url: 'https://tracker.example.test/pixel.webp', media_type: 'image', is_main: false, sort_order: 0 }),
    Object.freeze({ id: 3, product_id: 502, media_url: '/uploads/local-products/stand.webp', media_type: 'image', is_main: true, sort_order: 0 })
]);

const makeDatabase = ({ storeRows = [storeRow] } = {}) => {
    const calls = [];
    return {
        calls,
        async query(sql, params = []) {
            const source = String(sql);
            calls.push({ source, params });
            if (/FROM stores platform_store/u.test(source) || /FROM seller_stores seller_store/u.test(source)) return { rows: storeRows };
            if (/FROM products product/u.test(source)) return { rows: productRows };
            if (/FROM product_media media/u.test(source)) return { rows: mediaRows };
            throw new Error(`UNEXPECTED_SQL: ${source}`);
        }
    };
};

const assertExactKeys = (actual, expected, label) => {
    assert.deepEqual(Object.keys(actual).sort(), [...expected].sort(), label);
};

const runServiceMatrix = async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    const publicDatabase = makeDatabase();
    const publicProjection = await loadPublicStoreBySlug('NOVA-TEKNOLOJI', { queryable: publicDatabase });
    assertExactKeys(publicProjection.store, STORE_PUBLIC_KEYS, 'store DTO yalnız açık allowlist alanlarını içermeli');
    assert.equal(publicProjection.products.length, 2);
    publicProjection.products.forEach((product) => assertExactKeys(product, PRODUCT_PUBLIC_KEYS, 'product DTO allowlist'));
    publicProjection.products.flatMap((product) => product.media).forEach((media) => assertExactKeys(media, MEDIA_PUBLIC_KEYS, 'media DTO allowlist'));
    assert.equal(publicProjection.store.name, 'Nova Teknoloji');
    assert.equal(publicProjection.store.description, 'Güncel scriptalert(1)/script teknoloji seçkisi');
    assert.equal(publicProjection.store.shipping_summary, 'Aynı gün kargo');
    assert.equal(publicProjection.store.logo_url, null);
    assert.equal(publicProjection.store.banner_url, null);
    assert.equal(publicProjection.store.rating, null);
    assert.equal(publicProjection.products[0].image_url, 'https://res.cloudinary.com/demo/image/upload/v1/nova-main.webp');
    assert.equal(publicProjection.products[0].media.length, 1, 'güvensiz medya URL satırı DTO dışına atılmalı');
    assert.equal(publicProjection.products[0].is_purchasable, true);
    assert.equal(publicProjection.products[1].is_purchasable, false);

    const productQueries = publicDatabase.calls.filter((call) => /FROM products product|FROM product_media media/u.test(call.source));
    assert.equal(productQueries.length, 2);
    productQueries.forEach((call) => {
        assert.deepEqual(call.params, [101], 'ürün projeksiyonu yalnız server-resolved platform store kimliğiyle sorgulanmalı');
        assert.match(call.source, /product\.store_id = \$1/u);
        assert.match(call.source, /product\.publication_status = 'active'/u);
        assert.match(call.source, /product\.is_customer_visible = TRUE/u);
        assert.match(call.source, /product\.deleted_at IS NULL/u);
    });

    const sellerDatabase = makeDatabase();
    const context = Object.freeze({ organizationId: 10, membershipId: 20, userId: 30, storeIds: [40] });
    const sellerProjection = await loadSellerPublicPreview(sellerDatabase, context, 40);
    assert.deepEqual(sellerProjection, publicProjection, 'public ve Seller preview aynı serializer çıktısını kullanmalı');
    const sellerIdentityQuery = sellerDatabase.calls[0];
    assert.deepEqual(sellerIdentityQuery.params, [10, 40]);
    assert.match(sellerIdentityQuery.source, /platform_store\.id = seller_store\.legacy_store_id/u);
    assert.match(sellerIdentityQuery.source, /seller_store\.organization_id = \$1/u);

    const beforeCrossTenant = sellerDatabase.calls.length;
    await assert.rejects(
        () => loadSellerPublicPreview(sellerDatabase, context, 41),
        (error) => error instanceof PublicStoreError && error.code === 'RESOURCE_NOT_FOUND' && error.statusCode === 404
    );
    assert.equal(sellerDatabase.calls.length, beforeCrossTenant, 'scope dışı Seller store için DB sorgusu yapılmamalı');

    for (const slug of ['', 'bad_slug', '../admin', 'a/b', 'a'.repeat(161)]) {
        assert.throws(() => normalizeStoreSlug(slug), PublicStoreError, slug);
    }
    assert.equal(normalizeStoreSlug(' Nova-Teknoloji '), 'nova-teknoloji');
    assert.equal(customerMediaUrl('http://cdn.example.test/image.webp'), null);
    assert.equal(customerMediaUrl('https://tracker.example.test/pixel.webp', { CLOUDINARY_CLOUD_NAME: 'demo' }), null);
    assert.equal(customerMediaUrl('/api/private-or-mutating-get', { CLOUDINARY_CLOUD_NAME: 'demo' }), null);
    assert.equal(customerMediaUrl('/uploads/local-products/stand.webp?token=secret', { CLOUDINARY_CLOUD_NAME: 'demo' }), null);
    assert.equal(customerMediaUrl('/uploads/local-products/../private.webp', { CLOUDINARY_CLOUD_NAME: 'demo' }), null);
    assert.equal(customerMediaUrl('/uploads/local-products/stand.webp', { CLOUDINARY_CLOUD_NAME: 'demo' }), '/uploads/local-products/stand.webp');
    assert.equal(
        customerMediaUrl('https://res.cloudinary.com/demo/image/upload/v1/item.webp', { CLOUDINARY_CLOUD_NAME: 'demo' }),
        'https://res.cloudinary.com/demo/image/upload/v1/item.webp'
    );
    assert.equal(customerMediaUrl('https://res.cloudinary.com/foreign/image/upload/v1/item.webp', { CLOUDINARY_CLOUD_NAME: 'demo' }), null);
    assert.equal(customerMediaUrl('https://res.cloudinary.com/demo/image/upload/v1/item.webp?token=secret', { CLOUDINARY_CLOUD_NAME: 'demo' }), null);
    assert.equal(customerText('<img src=x onerror=alert(1)>', 100), 'img src=x onerror=alert(1)');

    for (const rows of [[], [storeRow, { ...storeRow, platform_store_id: 102 }]]) {
        await assert.rejects(
            () => loadPublicStoreBySlug('nova-teknoloji', { queryable: makeDatabase({ storeRows: rows }) }),
            (error) => error instanceof PublicStoreError && error.code === 'STORE_NOT_FOUND'
        );
    }
};

const request = async (base, path) => {
    const response = await fetch(`${base}${path}`);
    return { status: response.status, body: await response.json() };
};

const runHttpMatrix = async () => {
    const app = express();
    app.use('/api/public/stores', createPublicStoreRouter({
        service: {
            async loadPublicStoreBySlug(slug) {
                if (slug === 'ok') return { store: { slug: 'ok' }, products: [] };
                if (slug === 'down') throw new Error('database detail must remain private');
                throw new PublicStoreError();
            }
        }
    }));
    const server = await new Promise((resolve) => {
        const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    try {
        assert.equal((await request(base, '/api/public/stores/ok')).status, 200);
        for (const slug of ['missing', 'inactive', 'deleted', 'unbound', 'bad_slug']) {
            const result = await request(base, `/api/public/stores/${slug}`);
            assert.equal(result.status, 404, slug);
            assert.deepEqual(result.body, { code: 'STORE_NOT_FOUND', error: 'STORE_NOT_FOUND' }, slug);
        }
        const unavailable = await request(base, '/api/public/stores/down');
        assert.equal(unavailable.status, 503);
        assert.deepEqual(unavailable.body, { code: 'PUBLIC_STORE_UNAVAILABLE', error: 'PUBLIC_STORE_UNAVAILABLE' });
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
};

(async () => {
    await runServiceMatrix();
    await runHttpMatrix();
    console.log('publicStoreProjectionSmoke PASS');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
