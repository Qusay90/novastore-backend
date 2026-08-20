'use strict';

const assert = require('node:assert/strict');
const { adjustInventory, SellerOfferInventoryError } = require('../services/sellerOfferInventoryService');
const { orderCommand, SellerOrderFulfillmentError } = require('../services/sellerOrderFulfillmentService');

const context = Object.freeze({ organizationId: 1, membershipId: 1, userId: 7, storeIds: [11] });
assert.rejects(() => adjustInventory({}, context, { idempotency_key: 'stock-key', items: [{ inventory_item_id: 1, delta: 0, reason_code: 'count', revision: 1 }] }), (error) => error instanceof SellerOfferInventoryError && error.code === 'VALIDATION_FAILED');
assert.rejects(() => orderCommand({}, context, 1, { command: 'ship', package_id: 1, revision: 1, idempotency_key: 'order-key' }), (error) => error instanceof SellerOrderFulfillmentError && error.code === 'VALIDATION_FAILED');
assert.rejects(() => orderCommand({}, context, 1, { command: 'refund', revision: 1, idempotency_key: 'order-key' }), (error) => error instanceof SellerOrderFulfillmentError && error.code === 'VALIDATION_FAILED');
console.log('sellerWave3InventoryFulfillmentSmoke PASS');
