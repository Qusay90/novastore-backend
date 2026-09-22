'use strict';
const assert = require('node:assert/strict');
const { safeHost, documentReferences, createThemeStorefrontHostGuard } = require('../services/themePlatformCommerceService');
let checks = 0;
const check = (name, action) => { action(); checks += 1; console.log(`PASS ${name}`); };
check('DNS host normalizes case and strips a valid transport port', () => assert.equal(safeHost('STORE-A.example.test:8443'), 'store-a.example.test'));
check('loopback platform hosts normalize explicitly', () => { assert.equal(safeHost('127.0.0.1:5538'), '127.0.0.1'); assert.equal(safeHost('[::1]:5538'), '[::1]'); });
for (const bad of ['', ' example.test', 'example.test ', 'example.test.', 'user@example.test', 'example.test/other', 'a..test', '-a.test', 'a-.test', 'a:0', 'a:65536', 'a:abc', 'a,b', 'a\r\nX-Test:1', 'https://a.test', 'a_test', '[::::]', 'a%2eb.test']) {
    check(`invalid Host rejected ${JSON.stringify(bad)}`, () => assert.throws(() => safeHost(bad), { code: 'INVALID_HOST', statusCode: 400 }));
}
check('duplicate raw Host headers rejected', () => assert.throws(() => safeHost({ headers: { host: 'a.test' }, rawHeaders: ['Host', 'a.test', 'host', 'b.test'] }), { code: 'INVALID_HOST' }));
check('forwarded host has no tenant authority', () => assert.equal(safeHost({ headers: { host: 'a.test', 'x-forwarded-host': 'b.test' }, rawHeaders: ['Host', 'a.test', 'X-Forwarded-Host', 'b.test'] }), 'a.test'));
check('unknown Studio schema requires explicit reference adapter', () => assert.throws(() => documentReferences({ studio: true }), { code: 'THEME_REFERENCE_ADAPTER_REQUIRED' }));
check('version one captures all canonical ref categories and navigational targets', () => assert.deepEqual(documentReferences({ schemaVersion: 1, assetIds: [], components: [{ props: { productIds: [1], categoryIds: [2], target: '/product/1' } }] }),
    { productIds: [1], categoryIds: [2], collectionIds: [], variants: [], navigation: [{ target: '/product/1' }], assetIds: [] }));
check('malformed ref list rejected', () => assert.throws(() => documentReferences({ schemaVersion: 1, assetIds: [], components: [{ props: { productIds: '1' } }] }), { code: 'INVALID_REFERENCE' }));
check('native adapter manifest fields are explicit and bounded', () => assert.throws(() => documentReferences({}, () => ({ arbitraryCode: 'x' })), { code: 'INVALID_REQUEST' }));

(async () => {
    let queried = 0, next = 0;
    const db = { query: async (_sql, args) => { queried += 1; return { rows: args[0] === 'a.test' ? [{ commerce_mode: 'SINGLE_STORE' }] : [] }; } };
    const guard = createThemeStorefrontHostGuard({ database: db, enabled: true, trustedPlatformHosts: ['localhost'] });
    const call = async (host, path, forwarded) => {
        let status = 200, body;
        const res = { status: (s) => { status = s; return res; }, json: (b) => { body = b; return res; } };
        await guard({ headers: { host, 'x-forwarded-host': forwarded }, rawHeaders: ['Host', host], path }, res, () => { next += 1; });
        return { status, body };
    };
    assert.equal((await call('localhost:3000', '/api/products')).status, 200); assert.equal(queried, 0); checks += 1;
    assert.equal((await call('a.test', '/api/theme-storefront/products', 'b.test')).status, 200); checks += 1;
    assert.deepEqual(await call('a.test', '/api/products'), { status: 404, body: { code: 'RESOURCE_NOT_FOUND' } }); checks += 1;
    for (const path of ['/', '/magaza/foreign', '/admin-login', '/assets/main.js']) {
        assert.deepEqual(await call('a.test', path), { status: 503, body: { code: 'STOREFRONT_NOT_PUBLISHED' } }); checks += 1;
    }
    assert.deepEqual(await call('unknown.test', '/api/theme-storefront/products', 'a.test'), { status: 421, body: { code: 'HOST_NOT_CONFIGURED' } }); checks += 1;
    assert.equal(next, 2); checks += 1;
    console.log(JSON.stringify({ result: 'PASS', checks, database: 'none', guardDatabase: 'unit test double; no runtime data authority', providers: 'none' }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
