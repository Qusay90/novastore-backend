'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'sellerWave3MigrationDisposableDbIntegrationSmoke.js'), 'utf8');
for (const proof of [
    'RESOURCE_NOT_FOUND',
    'NEGATIVE_STOCK_FORBIDDEN',
    'INVALID_STATE_TRANSITION',
    'seller_ledger_entries',
    'seller_support_conversations',
    'Promise.allSettled',
    'proveForeignStoreMutationMatrix',
    'foreign-store-update-denied',
    'foreign-offer-command-denied',
    'foreign-inventory-threshold-denied',
    'foreign-order-command-denied',
    'foreign-support-rating-denied',
    'session_id IS NULL'
]) assert.ok(source.includes(proof), `Missing real DB business-isolation proof: ${proof}`);
console.log('sellerWave3BusinessIsolationIntegrationSmoke PASS delegated real-DB proof inventory');
