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
assert.strictEqual(framing.CARD_VIEWPORT_ASPECT_RATIO, 1);
assert.strictEqual(framing.classifyCardFramingNeed({ width: 1200, height: 1200 }).state, framing.CARD_FRAMING_STATES.NO_FRAMING_NEEDED);
assert.strictEqual(framing.classifyCardFramingNeed({ width: 800, height: 1200 }).state, framing.CARD_FRAMING_STATES.FRAMING_RECOMMENDED);
assert.strictEqual(framing.classifyCardFramingNeed({ width: 1600, height: 900 }).state, framing.CARD_FRAMING_STATES.FRAMING_RECOMMENDED);
assert.strictEqual(framing.classifyCardFramingNeed({ width: 1200, height: 1200, cardFraming: { focal_x: 0.4, focal_y: 0.6, zoom: 1.2 } }).state, framing.CARD_FRAMING_STATES.CUSTOM_FRAMING_SAVED);
assert.strictEqual(framing.classifyCardFramingNeed({ width: 320, height: 320 }).lowResolution, true);

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
assert.match(customerCard, /CUSTOMER_CARD_AUTOPLAY_DWELL_MS = 500/u);
assert.match(customerCard, /CUSTOMER_CARD_AUTOPLAY_INTERVAL_MS = 1650/u);
assert.match(customerCard, /window\.clearInterval\(cycleTimer\.current\)/u);
assert.match(customerCard, /cardFramingPresentation\(item\.cardFraming\)/u);
assert.match(customerCard, /productCardMediaIndex\(event\.clientX/u);
assert.doesNotMatch(customerCard, /görsel · otomatik|customer-card-media-cue/u);
const lightbox = read('storefront-commerce-pro/src/ProductMediaLightbox.jsx');
assert.match(lightbox, /PDP_LIGHTBOX_ZOOM_MAX = 4/u);
assert.match(lightbox, /Önceki medyayı göster/u);
assert.match(lightbox, /Sonraki medyayı göster/u);
const adminApp = read('admin-commerce-pro/src/IntegratedApp.jsx');
assert.match(adminApp, /classifyCardFramingNeed/u);
assert.match(adminApp, /Kart kadrajını özelleştir/u);
assert.match(adminApp, /Görseli sürükleyerek konumlandır/u);
assert.match(adminApp, /CARD_VIEWPORT_ASPECT_RATIO/u);
assert.doesNotMatch(adminApp, /Yatay odak ·|Dikey odak ·/u);
const removedDeliveryCopy = ['Teslimat bilgisi', 'ürün detayında'].join(' ');
assert.equal(customerCard.includes(removedDeliveryCopy), false);
assert.equal(read('storefront-commerce-pro/src/adapters/catalogAdapter.js').includes(removedDeliveryCopy), false);

console.log('main6y R1 framing smoke passed: normalized=PASS bounds=PASS IDOR=PASS detection=PASS direct-editor=PASS lightbox=PASS autoplay-scrub=PASS');
