'use strict';

const assert = require('node:assert/strict');
const { SELLER_BUSINESS_PATHS, commandPermission, createSellerBusinessRouter } = require('../routes/sellerBusinessRoutes');

assert.ok(SELLER_BUSINESS_PATHS.includes('/finance/summary'));
assert.ok(SELLER_BUSINESS_PATHS.includes('/support/messages'));
const router = createSellerBusinessRouter();
const layer = router.stack[0];
let statusCode = null;
let body = null;
layer.handle({}, { status(code) { statusCode = code; return this; }, json(value) { body = value; return this; } });
assert.equal(statusCode, 503);
assert.deepEqual(body, { code: 'CAPABILITY_DISABLED', error: 'CAPABILITY_DISABLED' });
assert.throws(() => createSellerBusinessRouter({ enabled: true }), /dependencies/u);
const calls = [];
const tenant = { requireSellerPermission(permission) { return (_req, _res, next) => { calls.push(permission); next(); }; } };
commandPermission(tenant, { ship: 'order.ship' })({ body: { command: 'ship' } }, {}, () => {});
assert.deepEqual(calls, ['order.ship']);
let invalid = null;
commandPermission(tenant, { ship: 'order.ship' })({ body: { command: 'refund' } }, { status(code) { invalid = code; return this; }, json() { return this; } }, () => { throw new Error('unexpected next'); });
assert.equal(invalid, 400);
console.log('sellerWave3HttpBoundarySmoke PASS');
