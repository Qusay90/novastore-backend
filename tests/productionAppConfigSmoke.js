'use strict';

const assert = require('node:assert/strict');
const {
    getAllowedOrigins,
    getAppBaseUrl,
    getMailFrom,
    isValidClientOrigin
} = require('../config/appConfig');

assert.equal(isValidClientOrigin('https://novastore.tr'), true);
assert.equal(isValidClientOrigin('https://www.novastore.tr/'), true);
assert.equal(isValidClientOrigin('capacitor://localhost'), true);
assert.equal(isValidClientOrigin('ionic://localhost'), true);
assert.equal(isValidClientOrigin('http://novastore.tr'), false);
assert.equal(isValidClientOrigin('https://user:secret@novastore.tr'), false);
assert.equal(isValidClientOrigin('https://novastore.tr/path'), false);
assert.equal(isValidClientOrigin('https://novastore.tr?origin=evil'), false);

assert.throws(
    () => getAllowedOrigins({ NODE_ENV: 'production', CLIENT_ORIGIN: '*' }),
    (error) => error?.code === 'CLIENT_ORIGIN_WILDCARD_FORBIDDEN'
);
assert.throws(
    () => getAllowedOrigins({ NODE_ENV: 'production', CLIENT_ORIGIN: 'http://novastore.tr' }),
    (error) => error?.code === 'CLIENT_ORIGIN_INVALID'
);
assert.deepEqual(
    getAllowedOrigins({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://novastore.tr, https://www.novastore.tr,https://novastore.tr/'
    }),
    ['https://novastore.tr', 'https://www.novastore.tr']
);
assert.equal(getAllowedOrigins({ NODE_ENV: 'test', CLIENT_ORIGIN: '*' }), '*');
assert.deepEqual(
    getAllowedOrigins({ NODE_ENV: 'test', PORT: '6123' }),
    ['http://localhost:6123']
);

for (const productionValue of ['production', 'Production', ' production ']) {
    assert.throws(
        () => getAllowedOrigins({ NODE_ENV: productionValue, CLIENT_ORIGIN: '*' }),
        (error) => error?.code === 'CLIENT_ORIGIN_WILDCARD_FORBIDDEN'
    );
    assert.throws(
        () => getMailFrom({ NODE_ENV: productionValue }),
        (error) => error?.code === 'MAIL_FROM_REQUIRED'
    );
    assert.equal(
        getAppBaseUrl(null, { NODE_ENV: productionValue }),
        'https://novastore.tr'
    );
}

assert.equal(
    getAppBaseUrl(null, { NODE_ENV: 'production', APP_BASE_URL: 'https://NOVASTORE.TR:443/' }),
    'https://novastore.tr'
);
assert.equal(
    getAppBaseUrl(null, { NODE_ENV: 'test', APP_BASE_URL: 'http://127.0.0.1:6124/' }),
    'http://127.0.0.1:6124'
);
for (const [nodeEnvironment, configuredBaseUrl] of [
    ['production', 'http://novastore.tr'],
    ['production', 'https://user:secret@novastore.tr'],
    ['production', 'https://novastore.tr/path'],
    ['production', 'https://novastore.tr?source=unsafe'],
    ['production', 'https://novastore.tr/#unsafe'],
    ['production', 'https://novastore.tr///'],
    ['test', 'javascript:alert(1)'],
    ['test', 'http:\\attacker.example']
]) {
    assert.throws(
        () => getAppBaseUrl(null, { NODE_ENV: nodeEnvironment, APP_BASE_URL: configuredBaseUrl }),
        (error) => error?.code === 'APP_BASE_URL_INVALID'
    );
}
assert.equal(
    getAppBaseUrl(
        { protocol: 'https', get: () => 'attacker.example' },
        { NODE_ENV: 'test', PORT: '6125' }
    ),
    'http://localhost:6125',
    'password-reset origin must never be derived from the request Host header'
);

assert.equal(
    getMailFrom({ NODE_ENV: 'production', MAIL_FROM: 'NovaStore Destek <destek@novastore.tr>' }),
    'NovaStore Destek <destek@novastore.tr>'
);
assert.throws(
    () => getMailFrom({ NODE_ENV: 'production' }),
    (error) => error?.code === 'MAIL_FROM_REQUIRED'
);
assert.throws(
    () => getMailFrom({ NODE_ENV: 'production', MAIL_FROM: 'not-an-email' }),
    (error) => error?.code === 'MAIL_FROM_INVALID'
);
assert.throws(
    () => getMailFrom({
        NODE_ENV: 'production',
        MAIL_FROM: 'NovaStore Destek\r\nBcc: attacker@example.test <destek@novastore.tr>'
    }),
    (error) => error?.code === 'MAIL_FROM_INVALID'
);
assert.equal(
    getMailFrom({ NODE_ENV: 'test' }),
    'NovaStore Destek <onboarding@resend.dev>'
);

console.log('production app config smoke passed: origin=fail-closed app-base=canonical mail-from=fail-closed');
