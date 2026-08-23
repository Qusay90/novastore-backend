'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const framing = require('../shared/productCardFraming');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

assert.deepStrictEqual(framing.normalizeCardFraming({ focal_x: 0.25, focal_y: 0.75, zoom: 1.45 }), {
    focal_x: 0.25,
    focal_y: 0.75,
    zoom: 1.45
});
assert.strictEqual(framing.normalizeCardFraming(null), null);
assert.strictEqual(framing.cardFramingFromStorage({ card_focal_x: null, card_focal_y: null, card_zoom: null }), null);
assert.strictEqual(framing.cardFramingFromStorage({ card_focal_x: 0.2, card_focal_y: null, card_zoom: 1.2 }), null);
assert.throws(() => framing.normalizeCardFraming({ focal_x: -0.1, focal_y: 0.5, zoom: 1 }), /aralık/u);
assert.throws(() => framing.normalizeCardFraming({ focal_x: 0.5, focal_y: 0.5, zoom: 3.01 }), /aralık/u);
assert.throws(() => framing.normalizeCardFraming({ focal_x: 0.5, focal_y: 0.5, zoom: 1, css: 'url(x)' }), /desteklenmeyen/u);
assert.deepStrictEqual(framing.resolveCardFraming(null), framing.CARD_FRAMING_DEFAULT);
assert.strictEqual(framing.cardFramingPresentation({ focal_x: 0.2, focal_y: 0.8, zoom: 1.4 }).objectPosition, '20% 80%');
assert.deepStrictEqual(framing.panCardFraming({ focal_x: 0.5, focal_y: 0.5, zoom: 1 }, 50, -25, 100, 100), {
    focal_x: 0,
    focal_y: 0.75,
    zoom: 1
});

const migration = read('migrations/20260823_01_product_media_card_framing.sql');
for (const column of ['card_focal_x', 'card_focal_y', 'card_zoom']) assert.ok(migration.includes(column));
assert.match(migration, /BETWEEN 0 AND 1[\s\S]*BETWEEN 0 AND 1[\s\S]*BETWEEN 1 AND 3/u);
assert.match(migration, /card_focal_x IS NOT NULL[\s\S]*card_focal_y IS NOT NULL[\s\S]*card_zoom IS NOT NULL/u);
assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/u);

const mediaService = read('services/adminCatalogMediaService.js');
assert.match(mediaService, /executeAdminCatalogMutation/u);
assert.match(mediaService, /WHERE id = \$4[\s\S]*AND product_id = \$5[\s\S]*AND media_type = 'image'/u);
assert.match(mediaService, /ADMIN_CATALOG_MEDIA_CARD_FRAMING_INVALID/u);
const adminRoutes = read('routes/adminRoutes.js');
assert.ok(adminRoutes.includes("/catalog/products/:id/media/:mediaId/framing"));
assert.match(adminRoutes, /integratedAdminProductWrite, updateAdminCatalogProductMediaCardFraming/u);

const publicProjection = read('services/publicStoreProjectionService.js');
assert.match(publicProjection, /card_framing/u);
const productController = read('controllers/productController.js');
assert.match(productController, /delete normalized\.store_id/u);
assert.match(productController, /seller_store\.display_name AS public_store_name/u);
assert.match(productController, /seller_store\.status = 'active'/u);
assert.match(productController, /card_framing: cardFramingFromStorage\(mediaRow\)/u);
assert.doesNotMatch(productController, /product\.media = mediaResult\.rows;/u);

const customerCard = read('storefront-commerce-pro/src/CustomerProductCard.jsx');
assert.match(customerCard, /CUSTOMER_CARD_AUTOPLAY_DWELL_MS = 360/u);
assert.match(customerCard, /CUSTOMER_CARD_AUTOPLAY_INTERVAL_MS = 1050/u);
assert.match(customerCard, /window\.clearInterval\(cycleTimer\.current\)/u);
assert.match(customerCard, /cardFramingPresentation\(item\.cardFraming\)/u);
const removedDeliveryCopy = ['Teslimat bilgisi', 'ürün detayında'].join(' ');
assert.equal(customerCard.includes(removedDeliveryCopy), false);
assert.equal(read('storefront-commerce-pro/src/adapters/catalogAdapter.js').includes(removedDeliveryCopy), false);

console.log('main6y product card framing smoke passed: normalized=PASS bounds=PASS IDOR=PASS autoplay=PASS delivery=PASS');
