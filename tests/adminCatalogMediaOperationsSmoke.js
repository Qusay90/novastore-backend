const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, {
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_media_test',
    DB_SSL: 'false'
});

const root = path.join(__dirname, '..');
const {
    MAX_PRODUCT_MEDIA,
    listProductMedia,
    normalizeCloudinaryMediaUrl,
    updateProductMediaCardFraming
} = require('../services/adminCatalogMediaService');

assert.equal(MAX_PRODUCT_MEDIA, 10);
assert.deepEqual(
    normalizeCloudinaryMediaUrl(
        'https://res.cloudinary.com/demo/image/upload/v1/catalog/item.webp',
        { CLOUDINARY_CLOUD_NAME: 'demo' }
    ),
    {
        mediaUrl: 'https://res.cloudinary.com/demo/image/upload/v1/catalog/item.webp',
        mediaType: 'image'
    }
);
assert.equal(
    normalizeCloudinaryMediaUrl(
        'https://res.cloudinary.com/demo/video/upload/v1/catalog/item.mp4',
        { CLOUDINARY_CLOUD_NAME: 'demo' }
    ).mediaType,
    'video'
);

for (const invalid of [
    'http://res.cloudinary.com/demo/image/upload/item.webp',
    'https://evil.example/demo/image/upload/item.webp',
    'https://user:pass@res.cloudinary.com/demo/image/upload/item.webp',
    'https://res.cloudinary.com:444/demo/image/upload/item.webp',
    'https://res.cloudinary.com/demo/image/upload/item.webp?token=secret',
    'https://res.cloudinary.com/demo/image/upload/item.webp#fragment',
    'https://res.cloudinary.com/demo/image/upload/%2e%2e/item.webp',
    'https://res.cloudinary.com/demo/raw/upload/item.bin'
]) {
    assert.throws(
        () => normalizeCloudinaryMediaUrl(invalid, { CLOUDINARY_CLOUD_NAME: 'demo' }),
        /Cloudinary|URL|yolu/
    );
}
assert.throws(
    () => normalizeCloudinaryMediaUrl('https://res.cloudinary.com/demo/image/upload/item.webp', {}),
    (error) => error.code === 'ADMIN_CATALOG_MEDIA_STORAGE_CONFIG_UNAVAILABLE' && error.statusCode === 503
);
assert.throws(
    () => normalizeCloudinaryMediaUrl(
        'https://res.cloudinary.com/foreign/image/upload/item.webp',
        { CLOUDINARY_CLOUD_NAME: 'owned' }
    ),
    /hesabına ait değil/
);

const calls = [];
const database = {
    async query(sql, params) {
        const text = String(sql);
        calls.push({ text, params });
        if (/FROM products product[\s\S]*JOIN stores store/i.test(text)) {
            return Number(params[0]) === 101 ? { rows: [{ id: 101, revision: 3 }] } : { rows: [] };
        }
        if (/FROM product_media/i.test(text)) {
            assert.match(text, /ORDER BY is_main DESC, sort_order ASC, id ASC/i);
            return {
                rows: [{
                    id: 8,
                    product_id: 101,
                    media_url: 'https://res.cloudinary.com/demo/image/upload/item.webp',
                    media_type: 'image',
                    is_main: true,
                    sort_order: 0,
                    created_at: '2026-08-13T00:00:00.000Z'
                }]
            };
        }
        throw new Error(`Unexpected query: ${text}`);
    }
};

(async () => {
    const media = await listProductMedia(database, 101);
    assert.equal(media.length, 1);
    assert.equal(media[0].isCover, true);
    assert.equal(media[0].productId, 101);
    await assert.rejects(
        listProductMedia(database, 999),
        (error) => error.code === 'ADMIN_CATALOG_ENTITY_NOT_FOUND' && error.statusCode === 404
    );
    assert.equal(calls.filter((call) => /FROM product_media/i.test(call.text)).length, 1);

    const mutationCalls = [];
    let productRevision = 1;
    const mutationQuery = async (sql, params = [], transaction = false) => {
        const text = String(sql).replace(/\s+/g, ' ').trim();
        mutationCalls.push({ text, params, transaction });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/^SELECT id, revision FROM products WHERE id = \$1 FOR UPDATE$/i.test(text)) {
            return { rows: [{ id: 101, revision: productRevision }] };
        }
        if (/^SELECT id FROM stores/i.test(text) && /FOR UPDATE$/i.test(text)) {
            return { rows: [{ id: 10 }] };
        }
        if (/^SELECT id, status, closed_at FROM seller_stores/i.test(text) && /FOR SHARE$/i.test(text)) {
            return {
                rows: [{
                    id: 900,
                    status: 'closed',
                    closed_at: '2026-08-31T00:00:00.000Z'
                }]
            };
        }
        if (/FROM products product JOIN stores store/i.test(text)) {
            return { rows: [{ id: 101, revision: productRevision }] };
        }
        if (/^UPDATE product_media SET card_focal_x/i.test(text)) {
            return { rows: [{ id: 8 }] };
        }
        if (/^UPDATE products SET revision = revision \+ 1/i.test(text)) {
            assert.equal(Number(params[1]), productRevision);
            productRevision += 1;
            return { rows: [{ revision: productRevision }] };
        }
        if (/^INSERT INTO admin_catalog_audit_events/i.test(text)) {
            assert.deepEqual(params[7], ['product_media']);
            return { rows: [{ id: 77, created_at: '2026-08-13T00:01:00.000Z' }] };
        }
        if (/FROM product_media WHERE product_id = \$1/i.test(text)) {
            return {
                rows: [{
                    id: 8,
                    product_id: 101,
                    media_url: 'https://res.cloudinary.com/demo/image/upload/item.webp',
                    media_type: 'image',
                    is_main: true,
                    sort_order: 0,
                    card_focal_x: 0.4,
                    card_focal_y: 0.6,
                    card_zoom: 1.2,
                    created_at: '2026-08-13T00:00:00.000Z'
                }]
            };
        }
        throw new Error(`Unexpected media mutation query: ${text}`);
    };
    const mutationDatabase = {
        query: (sql, params) => mutationQuery(sql, params, false),
        async connect() {
            return {
                query: (sql, params) => mutationQuery(sql, params, true),
                release() {}
            };
        }
    };
    const framing = await updateProductMediaCardFraming(mutationDatabase, 101, 8, {
        actor: { id: 17, role: 'admin' },
        body: {
            expected_revision: 1,
            card_framing: { focal_x: 0.4, focal_y: 0.6, zoom: 1.2 }
        },
        requestId: 'media-framing-unbound-control'
    });
    assert.equal(framing.revision, 2);
    assert.equal(framing.storageMutation, false);
    assert.deepEqual(framing.media[0].cardFraming, { focal_x: 0.4, focal_y: 0.6, zoom: 1.2 });
    const sellerBindingLock = mutationCalls.find(({ text }) => /^SELECT id, status, closed_at FROM seller_stores/i.test(text));
    assert.ok(sellerBindingLock);
    assert.doesNotMatch(sellerBindingLock.text, /closed_at IS NULL/i);
    assert.match(sellerBindingLock.text, /FOR SHARE$/i);
    assert.equal(mutationCalls.some(({ text }) => /fetch|axios|cloudinary\.uploader|\.destroy\(/i.test(text)), false);

    const service = fs.readFileSync(path.join(root, 'services', 'adminCatalogMediaService.js'), 'utf8');
    const routes = fs.readFileSync(path.join(root, 'routes', 'adminRoutes.js'), 'utf8');
    const migration = fs.readFileSync(path.join(root, 'migrations', '20260813_04_product_media_operations.sql'), 'utf8');
    assert.match(service, /max_sort_order \?\? -1/);
    assert.match(service, /storage_mutation: false/g);
    assert.equal(
        (service.match(/authorizeLockedTarget: authorizeFirstPartyMediaTarget/g) || []).length,
        4,
        'register, reorder, framing and delete must share the Seller-binding write authority guard'
    );
    assert.doesNotMatch(service, /fetch\(|axios|cloudinary\.uploader|\.destroy\(/i);
    assert.match(routes, /catalog\/products\/:id\/media[^]*integratedAdminProductWrite/);
    assert.match(migration, /CHECK \(media_type IN \('image', 'video'\)\)/);
    assert.match(migration, /chk_product_media_image_cover/i);
    assert.match(migration, /chk_product_media_video_publication_disabled/i);
    assert.match(migration, /chk_products_image_url_not_video/i);
    assert.match(migration, /media_url\s*~\*\s*'\/video\/upload\/'/i);
    assert.match(migration, /idx_product_media_product_url_unique/);
    assert.match(migration, /idx_product_media_one_main/);
    assert.match(service, /ADMIN_CATALOG_MEDIA_COVER_TYPE_INVALID/);
    assert.match(service, /ADMIN_CATALOG_MEDIA_VIDEO_RENDERER_HANDOFF_REQUIRED/);
    const legacyUpload = fs.readFileSync(path.join(root, 'config', 'cloudinary.js'), 'utf8');
    const legacyController = fs.readFileSync(path.join(root, 'controllers', 'productController.js'), 'utf8');
    assert.match(legacyUpload, /PRODUCT_MEDIA_VIDEO_RENDERER_HANDOFF_REQUIRED/);
    assert.match(legacyUpload, /resourceType:\s*'image'/);
    assert.match(legacyUpload, /allowedProductImageFormats/);
    assert.match(legacyController, /isSupportedProductImageFile/);
    console.log('adminCatalogMediaOperationsSmoke: OK');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
