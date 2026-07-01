const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeStorage {
    constructor(values = {}) {
        this.values = new Map(Object.entries(values));
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

class FakeHeaders {
    constructor(initial = {}) {
        this.values = new Map();
        Object.entries(initial).forEach(([key, value]) => this.set(key, value));
    }

    has(key) {
        return this.values.has(String(key).toLowerCase());
    }

    set(key, value) {
        this.values.set(String(key).toLowerCase(), String(value));
    }

    get(key) {
        return this.values.get(String(key).toLowerCase()) || null;
    }
}

const extractFunction = (source, functionName) => {
    const match = new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`).exec(source);
    assert(match, `${functionName} should exist in admin.html`);

    const start = match.index;
    const parametersStart = source.indexOf('(', start);
    let parametersDepth = 0;
    let parametersEnd = -1;
    for (let index = parametersStart; index < source.length; index += 1) {
        if (source[index] === '(') parametersDepth += 1;
        if (source[index] === ')') {
            parametersDepth -= 1;
            if (parametersDepth === 0) {
                parametersEnd = index;
                break;
            }
        }
    }
    assert(parametersEnd > parametersStart, `${functionName} parameters should be complete`);

    const bodyStart = source.indexOf('{', parametersEnd);
    let depth = 0;

    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }

    throw new Error(`${functionName} body could not be extracted`);
};

const encodePayload = (payload) => Buffer.from(JSON.stringify(payload))
    .toString('base64url');

const tokenFor = (payload) => `header.${encodePayload(payload)}.signature`;
const adminSource = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'admin.html'),
    'utf8'
);

const authFunctions = [
    'decodeAdminTokenPayload',
    'isValidAdminToken',
    'beginAdminReauthentication',
    'createAdminAuthError',
    'adminApiFetch'
].map((name) => extractFunction(adminSource, name)).join('\n');

const createContext = ({ token, responseStatus = 200, nowMs }) => {
    const requests = [];
    const localStorage = new FakeStorage({ nova_admin_token: token });
    const window = {
        location: { href: 'admin.html' }
    };
    const nativeFetch = async (input, init) => {
        requests.push({ input, init });
        return { ok: responseStatus >= 200 && responseStatus < 300, status: responseStatus };
    };

    const context = vm.createContext({
        atob(value) {
            return Buffer.from(value, 'base64').toString('binary');
        },
        Date: {
            now() {
                return nowMs;
            }
        },
        Error,
        Headers: FakeHeaders,
        JSON,
        Math,
        Number,
        String,
        localStorage,
        testNativeFetch: nativeFetch,
        window
    });

    vm.runInContext(`
        const _nativeFetch = testNativeFetch;
        let adminAuthRedirectStarted = false;
        ${authFunctions}
        globalThis.adminAuth = {
            decodeAdminTokenPayload,
            isValidAdminToken,
            adminApiFetch
        };
    `, context);

    return { context, localStorage, requests, window };
};

(async () => {
    const nowMs = Date.UTC(2026, 5, 29, 20, 0, 0);
    const validToken = tokenFor({
        id: 1,
        role: 'admin',
        exp: Math.floor(nowMs / 1000) + 3600
    });
    const valid = createContext({ token: validToken, nowMs });

    assert.strictEqual(valid.context.adminAuth.isValidAdminToken(validToken, nowMs), true);
    await valid.context.adminAuth.adminApiFetch('/api/products', { method: 'POST' });
    assert.strictEqual(valid.requests.length, 1);
    assert.strictEqual(
        valid.requests[0].init.headers.get('Authorization'),
        `Bearer ${validToken}`
    );
    assert.strictEqual(valid.window.location.href, 'admin.html');

    const expiredToken = tokenFor({
        id: 1,
        role: 'admin',
        exp: Math.floor(nowMs / 1000) - 1
    });
    const expired = createContext({ token: expiredToken, nowMs });

    assert.strictEqual(expired.context.adminAuth.isValidAdminToken(expiredToken, nowMs), false);
    await assert.rejects(
        () => expired.context.adminAuth.adminApiFetch('/api/products/29', { method: 'DELETE' }),
        (error) => error.status === 401 && error.isAdminAuthError === true
    );
    assert.strictEqual(expired.requests.length, 0);
    assert.strictEqual(expired.localStorage.getItem('nova_admin_token'), null);
    assert.strictEqual(
        expired.window.location.href,
        'admin-login.html?reason=session-expired'
    );

    const customerToken = tokenFor({
        id: 5,
        role: 'customer',
        exp: Math.floor(nowMs / 1000) + 3600
    });
    const wrongRole = createContext({ token: customerToken, nowMs });

    assert.strictEqual(wrongRole.context.adminAuth.isValidAdminToken(customerToken, nowMs), false);
    await assert.rejects(
        () => wrongRole.context.adminAuth.adminApiFetch('/api/products', { method: 'POST' }),
        (error) => error.status === 401 && error.isAdminAuthError === true
    );
    assert.strictEqual(wrongRole.requests.length, 0);
    assert.strictEqual(wrongRole.localStorage.getItem('nova_admin_token'), null);

    const rejected = createContext({
        token: validToken,
        responseStatus: 401,
        nowMs
    });

    await assert.rejects(
        () => rejected.context.adminAuth.adminApiFetch('/api/products/29', { method: 'DELETE' }),
        (error) => error.status === 401 && error.isAdminAuthError === true
    );
    assert.strictEqual(rejected.requests.length, 1);
    assert.strictEqual(rejected.localStorage.getItem('nova_admin_token'), null);
    assert.strictEqual(
        rejected.window.location.href,
        'admin-login.html?reason=session-expired'
    );

    console.log('admin session auth smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
