'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSellerLoginRateLimit, normalizeIdentifier } = require('../middlewares/sellerAuthRateLimit');

const invoke = async (middleware, { ip, identifier, outcomeStatus = 401 }) => {
    const request = { ip, body: { identifier } };
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};
    response.set = (name, value) => { response.headers[name] = value; return response; };
    response.status = (statusCode) => { response.statusCode = statusCode; return response; };
    response.json = (body) => { response.body = body; response.emit('finish'); return response; };
    let passed = false;
    middleware(request, response, () => {
        passed = true;
        response.statusCode = outcomeStatus;
        response.emit('finish');
    });
    return { passed, status: response.statusCode, body: response.body, headers: response.headers };
};

;(async () => {
    assert.equal(normalizeIdentifier('  SATICI@EXAMPLE.TEST '), 'satıcı@example.test');

    const byIdentifier = createSellerLoginRateLimit({ windowMs: 60_000, ipMaxFailures: 20, identifierMaxFailures: 2 });
    assert.equal((await invoke(byIdentifier, { ip: '127.0.0.1', identifier: 'blocked@example.test' })).status, 401);
    assert.equal((await invoke(byIdentifier, { ip: '127.0.0.1', identifier: 'BLOCKED@example.test' })).status, 401);
    const blockedAcrossIp = await invoke(byIdentifier, { ip: '127.0.0.2', identifier: 'blocked@example.test' });
    assert.equal(blockedAcrossIp.passed, false);
    assert.equal(blockedAcrossIp.status, 429);
    assert.deepEqual(blockedAcrossIp.body, { code: 'SELLER_LOGIN_RATE_LIMITED', error: 'SELLER_LOGIN_RATE_LIMITED' });
    assert.match(blockedAcrossIp.headers['Retry-After'], /^\d+$/u);

    const byIp = createSellerLoginRateLimit({ windowMs: 60_000, ipMaxFailures: 3, identifierMaxFailures: 10 });
    for (const identifier of ['one@example.test', 'two@example.test', 'three@example.test']) {
        assert.equal((await invoke(byIp, { ip: '127.0.0.3', identifier })).status, 401);
    }
    const ipBlocked = await invoke(byIp, { ip: '127.0.0.3', identifier: 'four@example.test' });
    assert.equal(ipBlocked.passed, false);
    assert.equal(ipBlocked.status, 429);
    assert.equal((await invoke(byIp, { ip: '127.0.0.4', identifier: 'four@example.test' })).status, 401);

    const resetOnSuccess = createSellerLoginRateLimit({ windowMs: 60_000, ipMaxFailures: 20, identifierMaxFailures: 2 });
    assert.equal((await invoke(resetOnSuccess, { ip: '127.0.0.5', identifier: 'seller@example.test' })).status, 401);
    assert.equal((await invoke(resetOnSuccess, { ip: '127.0.0.5', identifier: 'seller@example.test', outcomeStatus: 200 })).status, 200);
    assert.equal((await invoke(resetOnSuccess, { ip: '127.0.0.5', identifier: 'seller@example.test' })).status, 401);
    assert.equal((await invoke(resetOnSuccess, { ip: '127.0.0.5', identifier: 'seller@example.test' })).status, 401);
    assert.equal((await invoke(resetOnSuccess, { ip: '127.0.0.6', identifier: 'seller@example.test' })).status, 429);

    console.log('sellerLoginRateLimitSmoke: PASS');
})().catch((error) => {
    console.error('sellerLoginRateLimitSmoke: FAIL');
    console.error(error.stack);
    process.exitCode = 1;
});
