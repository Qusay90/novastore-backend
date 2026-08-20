'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../models/sellerWave3MigrationRegistry');
const helper = require('./helpers/sellerWave3DisposableDb');

const descriptors = registry.verifyMigrationFiles();
assert.equal(descriptors.length, 5);
assert.equal(descriptors.at(-1).id, 'seller-wave3-005-business-verticals');
assert.equal(descriptors.at(-1).relativePath, 'migrations/20260806_seller_wave3_business_verticals.sql');
assert.equal(registry.WAVE3_MIGRATION.previousMigrationId, 'seller-f1b-004-bootstrap-operator-authorizations');
assert.throws(() => helper.validateDisposableDbTarget({ host: 'example.com', database: 'novastore_seller_wave3_test_x' }), /SELLER_WAVE3_DB_HOST_REJECTED/u);
assert.throws(() => helper.validateMigrationPaths(['20260806_seller_wave3_business_verticals.sql']), /SELLER_WAVE3_MIGRATION_SET_REJECTED/u);
const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/20260806_seller_wave3_business_verticals.sql'), 'utf8');
for (const phrase of ['seller_offers', 'seller_inventory_movements', 'seller_orders', 'seller_ledger_entries', 'seller_support_conversations', 'seller_wave3_prevent_append_only_mutation']) assert.ok(sql.includes(phrase), `Missing schema surface: ${phrase}`);
assert.equal(/\bDROP\b|\bTRUNCATE\b|ALTER\s+TABLE\s+(?:products|orders|returns|stores|users)\b/iu.test(sql), false, 'Wave 3 SQL must be additive');
console.log('sellerWave3MigrationContractSmoke PASS');
