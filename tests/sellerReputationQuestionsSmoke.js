'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// This unit suite never connects. A random credential and loopback-only target keep imports fail-closed.
Object.assign(process.env, {
    NODE_ENV: 'test', NOVASTORE_SAFE_LOCAL_BACKEND: 'true', NOVASTORE_ALLOW_REMOTE_DB: 'false',
    DATABASE_URL: `postgresql://unit:${crypto.randomBytes(24).toString('hex')}@127.0.0.1:1/novastore_reputation_unit_test`,
    DB_SSL: 'false', SKIP_SCHEMA_INIT: 'true', NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    NOVASTORE_NOTIFICATION_WORKER_ENABLED: 'false', SUPABASE_USE_POOLER: 'false'
});
const service = require('../services/sellerReputationService');
const { createSellerBusinessRouter } = require('../routes/sellerBusinessRoutes');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const { selectLocalSellerMigrations } = require('../models/applyLocalSellerMigrations');

let cases = 0;
const rejects = (callback, code, status = 400) => {
    assert.throws(callback, (error) => error.code === code && error.statusCode === status);
    cases += 1;
};
const reply = { command: 'reply', body: 'Ürünümüz 40 cm genişliğindedir.', revision: 1, idempotency_key: 'unit-question-1' };
assert.equal(service.validateCommand(reply).body, reply.body);
assert.equal(service.validateCommand({ ...reply, body: '  İade koşulları\nürün sayfasında.  ' }).body, 'İade koşulları\nürün sayfasında.');
assert.equal(service.validateCommand({ ...reply, body: 'a'.repeat(2000) }).body.length, 2000);
for (const body of ['', '   ', null, 25, [], {}, 'a'.repeat(2001), 'yasak\u0000kontrol']) rejects(() => service.validateCommand({ ...reply, body }), 'VALIDATION_FAILED');
for (const body of ['https://example.test', 'www.example.test', 'contact@example.test', '+90 555 123 45 67', '<img src=x>', 'TR12 1234 1234 1234 1234 1234 12', 'Sipariş no: 12345', 'Adres: Örnek sokak', 'örnek mahallesi']) rejects(() => service.validateCommand({ ...reply, body }), 'CONTENT_POLICY_VIOLATION');
for (const field of ['sellerId', 'organizationId', 'storeId', 'ownerId', 'answered_by', 'status', 'reason_code']) rejects(() => service.validateCommand({ ...reply, [field]: 1 }), 'VALIDATION_FAILED');
for (const idempotency_key of [undefined, '']) rejects(() => service.validateCommand({ ...reply, idempotency_key }), 'IDEMPOTENCY_KEY_REQUIRED', 428);
for (const idempotency_key of ['short', 'x'.repeat(161), 'contains space', [], {}]) rejects(() => service.validateCommand({ ...reply, idempotency_key }), 'VALIDATION_FAILED');
for (const revision of [undefined, null, '']) rejects(() => service.validateCommand({ ...reply, revision }), 'PRECONDITION_REQUIRED', 428);
for (const revision of [0, -1, 1.5, true, [], {}, Number.MAX_SAFE_INTEGER + 1]) rejects(() => service.validateCommand({ ...reply, revision }), 'VALIDATION_FAILED');
rejects(() => service.validateCommand({ ...reply, command: 'report' }), 'UNSUPPORTED_COMMAND');
assert.deepEqual(service.validateQuery({}), { limit: 25, type: 'product_question', status: null, offerId: null, cursor: undefined });
assert.equal(service.validateQuery({ limit: '50', status: 'answered', offer_id: '2' }).offerId, 2);
for (const limit of ['51', 0, -1, true, '2x', '1.5', [], {}]) rejects(() => service.validateQuery({ limit }), 'VALIDATION_FAILED');
for (const type of ['review', '', [], {}]) rejects(() => service.validateQuery({ type }), 'UNSUPPORTED_REPUTATION_TYPE');
for (const status of ['pending', 'all', [], {}]) rejects(() => service.validateQuery({ status }), 'VALIDATION_FAILED');
for (const cursor of ['', 'a'.repeat(513), [], {}]) rejects(() => service.validateQuery({ cursor }), 'INVALID_CURSOR');
for (const key of ['storeId', 'organizationId', 'sellerId', 'offset', 'order_by']) rejects(() => service.validateQuery({ [key]: '1' }), 'VALIDATION_FAILED');

// Route-level permission composition is checked independently of the SQL service tests.
const calls = [];
const pass = (_req, _res, next) => next();
const tenant = { resolveServerTenantContext: pass, requireSellerPermission(permission) {
    return (_req, _res, next) => { calls.push(permission); next(); };
} };
const controller = new Proxy({}, { get: () => pass });
const router = createSellerBusinessRouter({ enabled: true, auth: { sellerAudienceAuthenticate: pass, requireLiveSellerSession: pass }, tenant, controller });
const reputationRoutes = router.stack.filter((layer) => layer.route?.path.startsWith('/reputation/'));
assert.deepEqual(reputationRoutes.map((layer) => layer.route.path), ['/reputation/inbox', '/reputation/items/:itemId', '/reputation/items/:itemId/commands']);
const replyRoute = reputationRoutes.at(-1).route;
const run = (index) => replyRoute.stack[index]?.handle({ body: { command: 'reply' } }, { setHeader() {} }, () => run(index + 1));
run(0);
assert.deepEqual(calls, ['reputation.read', 'reputation.reply']);

const registry = loadRegistry();
assert(selectLocalSellerMigrations({ registry }).some((entry) => entry.id === '20260904_01_seller_reputation_questions'));
assert.throws(() => selectLocalSellerMigrations({ registry: registry.filter((entry) => entry.id !== '20260904_01_seller_reputation_questions') }), /missing Seller migration/);
console.log(`seller reputation question unit: PASS rejected-input-cases=${cases} routes=3 migration=PASS remote-calls=0`);
