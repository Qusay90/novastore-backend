const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const warning = 'Bu cihazdaki oturum kapatıldı; sunucu oturumunun kapatıldığı doğrulanamadı.';
const token = 'legacy-session-token-never-log';

const extractAsyncFunction = (source, name) => {
    const marker = `async function ${name}(`;
    const start = source.indexOf(marker);
    assert(start >= 0, `${name} must be async`);
    const open = source.indexOf('{', start);
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = open; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'" || character === '`') {
            quote = character;
            continue;
        }
        if (character === '{') depth += 1;
        if (character === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`Could not extract ${name}`);
};

class FakeStorage {
    constructor(values) { this.values = new Map(Object.entries(values)); }
    getItem(key) { return this.values.get(key) ?? null; }
    removeItem(key) { this.values.delete(key); }
}

const runCase = async ({ file, functionName, tokenKey, endpoint, success, customer }) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const functionSource = extractAsyncFunction(source, functionName);
    const storage = new FakeStorage({
        [tokenKey]: token,
        ...(customer ? {
            nova_user_info: JSON.stringify({ id: 42 }),
            novastore_checkout_42: 'preserved-until-local-logout'
        } : {})
    });
    const requests = [];
    const alerts = [];
    const location = { href: '', reloadCalls: 0, reload() { this.reloadCalls += 1; } };
    const fetchImpl = async (input, init) => {
        requests.push({ input, init });
        if (!success) throw new Error('synthetic offline');
        return { status: 204 };
    };
    const context = {
        localStorage: storage,
        fetch: fetchImpl,
        _nativeFetch: fetchImpl,
        _getUserId: () => 42,
        appUrl: (value) => value,
        alert: (message) => alerts.push(message),
        window: { location }
    };
    const logout = vm.runInNewContext(`${functionSource}; ${functionName}`, context);
    await logout();

    assert.equal(requests.length, 1);
    assert.equal(requests[0].input, endpoint);
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.credentials, 'same-origin');
    assert.equal(requests[0].init.headers.Authorization, `Bearer ${token}`);
    assert.equal(storage.getItem(tokenKey), null);
    if (customer) {
        assert.equal(storage.getItem('nova_user_info'), null);
        assert.equal(storage.getItem('novastore_checkout_42'), null);
    }
    assert.deepEqual(alerts, success ? [] : [warning]);
    assert.equal(alerts.some((message) => message.includes(token)), false);
};

(async () => {
    for (const file of ['frontend/index.html', 'frontend/product.html', 'frontend/profile.html']) {
        await runCase({ file, functionName: 'userLogout', tokenKey: 'nova_user_token', endpoint: '/api/users/logout', success: true, customer: true });
        await runCase({ file, functionName: 'userLogout', tokenKey: 'nova_user_token', endpoint: '/api/users/logout', success: false, customer: true });
    }
    await runCase({ file: 'frontend/admin.html', functionName: 'adminLogout', tokenKey: 'nova_admin_token', endpoint: '/api/auth/logout', success: true, customer: false });
    await runCase({ file: 'frontend/admin.html', functionName: 'adminLogout', tokenKey: 'nova_admin_token', endpoint: '/api/auth/logout', success: false, customer: false });
    console.log('legacyLogoutRevocationSmoke: PASS clients=4 cases=8');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
