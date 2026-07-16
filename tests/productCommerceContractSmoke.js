const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_product_contract_smoke';
process.env.DB_USER = 'novastore_test';
process.env.DB_SSL = 'false';

const {
    normalizeCreateProductPayload,
    normalizeUpdateProductPayload
} = require('../services/adminCatalogProductPolicy');
const { toProductDetail } = require('../services/adminCatalogProductService');
const {
    getProductCommerceSchemaSql,
    applyProductCommerceSchema
} = require('../models/productCommerceSchema');

const taxSource = 'USER_SUPPLIED_TAX_VALUE';
const migrationSql = getProductCommerceSchemaSql();
assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS sku VARCHAR\(120\)/i);
assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_products_normalized_sku_unique/i);
assert.match(migrationSql, /WHERE normalized_sku IS NOT NULL AND deleted_at IS NULL/i);
let appliedSql = null;
const awaitableSchemaTest = applyProductCommerceSchema({
    async query(sql) {
        appliedSql = sql;
    }
});
const approvedProducts = [
    {
        name: 'Lee Cooper Kadın Orta Mavi Geniş Paça (Wide Leg) Jean Pantolon',
        sku: 'LC-2026-WD-BLUE09',
        brand: 'Lee Cooper',
        product_type: 'Jean Pantolon',
        price: 1449.90,
        stock: 60,
        vat_rate: 10,
        vat_rate_source: taxSource,
        weight_grams: 550,
        desi: 0.7
    },
    {
        name: 'Lenovo IdeaPad Slim 3 Intel Core i3 1215U 8GB 512GB SSD Windows 11 Home 15.6" FHD Taşınabilir Bilgisayar',
        sku: 'LN-83ER007WTR',
        brand: 'Lenovo',
        product_type: 'Dizüstü Bilgisayar',
        price: 12999.00,
        stock: 42,
        vat_rate: 20,
        vat_rate_source: taxSource,
        weight_grams: 1850,
        desi: 3.2
    },
    {
        name: 'Karaca Amber Borosilikat Cam Çaydanlık Takımı',
        sku: 'KR-200.15.02.4412',
        brand: 'Karaca',
        product_type: 'Çaydanlık Takımı',
        price: 849.90,
        stock: 75,
        vat_rate: 20,
        vat_rate_source: taxSource,
        weight_grams: 1200,
        desi: 2.8
    }
];

for (const fixture of approvedProducts) {
    const normalized = normalizeCreateProductPayload({
        ...fixture,
        description: 'Onaylı Tur 20E ürün açıklaması.',
        publication_status: 'active',
        is_customer_visible: true,
        category_ids: [],
        primary_category_id: null,
        attributes: {}
    });
    assert.equal(normalized.name, fixture.name);
    assert.equal(normalized.sku, fixture.sku);
    assert.equal(normalized.normalized_sku, fixture.sku.replace(/ /g, '').toUpperCase());
    assert.equal(normalized.brand, fixture.brand);
    assert.equal(normalized.product_type, fixture.product_type);
    assert.equal(normalized.price, fixture.price);
    assert.equal(normalized.stock, fixture.stock);
    assert.equal(normalized.vat_rate, fixture.vat_rate);
    assert.equal(normalized.vat_rate_source, taxSource);
    assert.equal(normalized.weight_grams, fixture.weight_grams);
    assert.equal(normalized.desi, fixture.desi);

    const detail = toProductDetail({
        id: 1,
        ...normalized,
        old_price: null,
        created_at: null,
        updated_at: null,
        deleted_at: null,
        revision: 1,
        has_media: false
    }, [], []);
    for (const field of [
        'sku', 'brand', 'product_type', 'vat_rate', 'vat_rate_source', 'weight_grams', 'desi'
    ]) {
        assert.equal(detail[field], fixture[field] ?? taxSource, `${fixture.sku} ${field} round-trip`);
    }
    assert.equal(Object.prototype.hasOwnProperty.call(detail, 'normalized_sku'), false);

    const update = normalizeUpdateProductPayload({
        expected_revision: 1,
        price: fixture.price,
        stock: fixture.stock,
        sku: fixture.sku,
        brand: fixture.brand,
        product_type: fixture.product_type,
        vat_rate: fixture.vat_rate,
        vat_rate_source: fixture.vat_rate_source,
        weight_grams: fixture.weight_grams,
        desi: fixture.desi
    });
    assert.equal(update.changes.price, fixture.price);
    assert.equal(update.changes.stock, fixture.stock);
    assert.equal(update.changes.sku, fixture.sku);
    assert.equal(update.changes.normalized_sku, fixture.sku.replace(/ /g, '').toUpperCase());
    assert.equal(update.changes.brand, fixture.brand);
    assert.equal(update.changes.product_type, fixture.product_type);
    assert.equal(update.changes.vat_rate, fixture.vat_rate);
    assert.equal(update.changes.vat_rate_source, taxSource);
    assert.equal(update.changes.weight_grams, fixture.weight_grams);
    assert.equal(update.changes.desi, fixture.desi);
}

const legacy = normalizeCreateProductPayload({
    name: 'Eski istemci ürünü',
    price: 10,
    stock: 1
});
assert.equal(legacy.sku, null);
assert.equal(legacy.brand, null);
assert.equal(legacy.product_type, null);
assert.equal(legacy.vat_rate, null);
assert.equal(legacy.vat_rate_source, null);
assert.equal(legacy.weight_grams, null);
assert.equal(legacy.desi, null);

assert.throws(
    () => normalizeCreateProductPayload({ name: 'Eksik vergi kaynağı', price: 10, stock: 1, vat_rate: 20 }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_VAT_PAIR_INVALID'
);
assert.throws(
    () => normalizeCreateProductPayload({ name: 'Geçersiz SKU', price: 10, stock: 1, sku: 'bad\tsku' }),
    (error) => error.code === 'ADMIN_CATALOG_PRODUCT_SKU_INVALID'
);
const cleared = normalizeUpdateProductPayload({
    expected_revision: 3,
    sku: null,
    vat_rate: null,
    vat_rate_source: null,
    brand: null,
    product_type: null,
    weight_grams: null,
    desi: null
});
assert.equal(cleared.changes.normalized_sku, null);
assert.equal(cleared.changes.vat_rate_source, null);

Promise.resolve(awaitableSchemaTest).then(() => {
    assert.equal(appliedSql, migrationSql);
    console.log('product commerce contract smoke passed');
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
