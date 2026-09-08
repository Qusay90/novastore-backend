'use strict';

const assert = require('node:assert/strict');
const { SellerStoreError, updateStore } = require('../services/sellerStoreService');
const { SellerOfferInventoryError, createOffer, updateOffer } = require('../services/sellerOfferInventoryService');

const context = Object.freeze({ organizationId: 1, membershipId: 1, userId: 7, storeIds: [11] });
assert.rejects(() => updateStore({}, context, 11, { revision: 1, idempotency_key: 'a', unsupported: true }), (error) => error instanceof SellerStoreError && error.code === 'VALIDATION_FAILED');
assert.rejects(() => createOffer({}, context, { product_id: 1, seller_sku: 'SKU-1', price_minor: 1, currency: 'TRY', initial_quantity: 0, commerce_revision: 1, idempotency_key: 'test-key', category_id: 1 }), (error) => error instanceof SellerOfferInventoryError && error.code === 'VALIDATION_FAILED');
assert.rejects(() => updateOffer({}, context, 1, { revision: 1, idempotency_key: 'test-key', category_id: 1 }), (error) => error instanceof SellerOfferInventoryError && error.code === 'VALIDATION_FAILED');
assert.rejects(() => createOffer({}, { ...context, storeIds: [11, 12] }, { product_id: 1, seller_sku: 'SKU-1', price_minor: 1, currency: 'TRY', initial_quantity: 0, commerce_revision: 1, idempotency_key: 'test-key' }), (error) => error instanceof SellerOfferInventoryError && error.code === 'STORE_SELECTION_REQUIRED');
console.log('sellerWave3StoreCatalogSmoke PASS');
