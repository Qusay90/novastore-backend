'use strict';

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_novabot_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_novabot_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'novabot-input-smoke-secret';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeAssistantChatInput } = require('../controllers/assistantController');
const { normalizeProductIds } = require('../services/assistantToolRegistry');
const { fetchProviderResponse } = require('../services/aiProviderService');

const normalized = normalizeAssistantChatInput({
    message: '  Ürün öner  ',
    history: [{ role: 'user', message: '  Merhaba  ' }],
    context: { selectedMode: 'friendly' }
});
assert.deepEqual(normalized, {
    message: 'Ürün öner',
    history: [{ role: 'user', message: 'Merhaba' }],
    context: { selectedMode: 'friendly' }
});

for (const body of [
    null,
    [],
    { message: 7 },
    { message: 'ok', privateCustomerData: 'x' },
    { message: 'x'.repeat(2001) },
    { message: 'ok', history: Array.from({ length: 11 }, () => ({ role: 'user', message: 'x' })) },
    { message: 'ok', history: [{ role: 'admin', message: 'x' }] },
    { message: 'ok', history: [{ role: 'user', message: 'x', customerId: 42 }] },
    { message: 'ok', history: [{ role: 'user', message: 'x'.repeat(2001) }] },
    { message: 'ok', context: { selectedMode: 'friendly', privateCustomerData: 'x' } },
]) assert.throws(() => normalizeAssistantChatInput(body), { code: 'ASSISTANT_INPUT_INVALID' });

assert.deepEqual(
    normalizeProductIds([1, '2', 2, 0, -1, 'bad', 3, 4, 5, 6, 7, 8, 9, 10]),
    [1, 2, 3, 4, 5, 6, 7, 8],
    'tool product ID fan-out capped and deduplicated'
);

(async () => {
    let aborted = false;
    await assert.rejects(
        () => fetchProviderResponse('https://provider.invalid', {}, {
            timeoutMs: 1000,
            fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => {
                    aborted = true;
                    reject(new Error('provider aborted'));
                }, { once: true });
            })
        }),
        /provider aborted/
    );
    assert.equal(aborted, true);

    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'assistantRoutes.js'), 'utf8');
    const providers = fs.readFileSync(path.join(__dirname, '..', 'services', 'aiProviderService.js'), 'utf8');
    assert.match(routes, /simpleRateLimit\(\{ windowMs: 5 \* 60 \* 1000, max: 30 \}\)/u);
    assert.match(routes, /router\.post\('\/chat', privateNoStore, assistantChatRateLimit, assistantController\.chat\)/u);
    assert.equal((providers.match(/maxItems: 8/g) || []).length, 2);
    console.log('novabotInputSecuritySmoke PASS');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
