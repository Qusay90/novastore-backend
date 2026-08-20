'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rows = fs.readFileSync(path.join(root, 'docs/seller/wave3/SELLER-WAVE3-FILE-ALLOWLIST.tsv'), 'utf8').trim().split('\n').slice(1).map((line) => line.split('\t'));
const paths = rows.map((row) => row[1]);
const writablePaths = rows.filter((row) => !['READ_ONLY', 'FORBIDDEN'].includes(row[2])).map((row) => row[1]);
assert.equal(new Set(paths).size, paths.length, 'Wave 3 allowlist paths must be unique');
for (const required of ['migrations/20260806_seller_wave3_business_verticals.sql', 'services/sellerStoreService.js', 'services/sellerOfferInventoryService.js', 'services/sellerOrderFulfillmentService.js', 'services/sellerFinanceService.js', 'services/sellerSupportService.js', 'routes/sellerBusinessRoutes.js', 'tests/sellerWave3BusinessIsolationIntegrationSmoke.js']) assert.ok(paths.includes(required), `Missing allowlist path: ${required}`);
assert.ok(!writablePaths.some((entry) => /^app\//u.test(entry) || entry === 'package.json' || entry === 'package-lock.json'));
const contract = fs.readFileSync(path.join(root, 'docs/seller/wave3/SELLER-WAVE3-BUSINESS-VERTICALS-CONTRACT.md'), 'utf8');
for (const phrase of ['RETURN_DECISION_UNSUPPORTED', 'SELLER_OFFER_WRITE_ENABLED=false', 'SELLER_ORDER_WRITE_ENABLED=false', 'SELLER_FINANCE_READ_ENABLED=false', 'minor unit', 'no address']) assert.ok(contract.includes(phrase), `Missing contract invariant: ${phrase}`);
console.log('sellerWave3ContractSmoke PASS');
