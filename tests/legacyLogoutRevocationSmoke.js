const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const token = 'legacy-session-token-never-log';

const extractAsyncFunction = (source, name, fromIndex = 0) => {
    const marker = `async function ${name}(`;
    const start = source.indexOf(marker, fromIndex);
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

const extractAsyncFunctions = (source, name) => {
    const marker = `async function ${name}(`;
    const functions = [];
    let fromIndex = 0;
    while (source.indexOf(marker, fromIndex) >= 0) {
        const start = source.indexOf(marker, fromIndex);
        const functionSource = extractAsyncFunction(source, name, start);
        functions.push(functionSource);
        fromIndex = start + functionSource.length;
    }
    assert(functions.length > 0, `${name} must be present`);
    return functions;
};

class FakeStorage {
    constructor(values) {
        this.values = new Map(Object.entries(values));
        this.removeCalls = new Map();
    }
    getItem(key) { return this.values.get(key) ?? null; }
    removeItem(key) {
        this.removeCalls.set(key, (this.removeCalls.get(key) || 0) + 1);
        this.values.delete(key);
    }
}

const runCase = async ({ file, functionName, tokenKey, endpoint, outcome, customer }) => {
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
    let rejectPendingFetch;
    const fetchImpl = (input, init) => {
        requests.push({ input, init });
        if (outcome === 'sync-throw') throw new Error('synthetic synchronous offline');
        if (outcome === 'async-throw') return Promise.reject(new Error('synthetic asynchronous offline'));
        if (outcome === 'pending') {
            return new Promise((_resolve, reject) => {
                rejectPendingFetch = reject;
            });
        }
        return Promise.resolve({ status: outcome === 'success' ? 204 : 503 });
    };
    let nextTimerId = 1;
    const timers = new Map();
    const clearedTimers = [];
    const context = {
        AbortController,
        Promise,
        localStorage: storage,
        fetch: fetchImpl,
        _nativeFetch: fetchImpl,
        _getUserId: () => 42,
        appUrl: (value) => value,
        alert: (message) => alerts.push(message),
        setTimeout(callback, milliseconds) {
            const id = nextTimerId;
            nextTimerId += 1;
            timers.set(id, { callback, milliseconds });
            return id;
        },
        clearTimeout(id) {
            clearedTimers.push(id);
            timers.delete(id);
        },
        window: { location }
    };
    const logout = vm.runInNewContext(`${functionSource}; ${functionName}`, context);
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
        const logoutPromise = logout();
        await Promise.resolve();
        if (outcome === 'pending') {
            assert.equal(timers.size, 1, `${file} must install one bounded logout timer`);
            const [[timerId, timer]] = timers;
            assert.equal(timer.milliseconds, 10_000);
            timer.callback();
            await logoutPromise;
            assert.equal(requests[0].init.signal.aborted, true);
            assert(clearedTimers.includes(timerId));
            rejectPendingFetch(new Error('synthetic late rejection'));
            await new Promise((resolve) => setImmediate(resolve));
            assert.equal(unhandled.length, 0);
        } else {
            await logoutPromise;
        }
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }

    assert.equal(requests.length, 1);
    assert.equal(requests[0].input, endpoint);
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.credentials, 'same-origin');
    assert.equal(requests[0].init.headers.Authorization, `Bearer ${token}`);
    assert.equal(requests[0].init.body, undefined);
    assert.equal(storage.getItem(tokenKey), null);
    assert.equal(storage.removeCalls.get(tokenKey), 1);
    if (customer) {
        assert.equal(storage.getItem('nova_user_info'), null);
        assert.equal(storage.getItem('novastore_checkout_42'), null);
        assert.equal(storage.removeCalls.get('nova_user_info'), 1);
        assert.equal(storage.removeCalls.get('novastore_checkout_42'), 1);
    }
    assert.deepEqual(alerts, [], `${file} must not place a modal alert before navigation`);
    assert.equal(alerts.some((message) => message.includes(token)), false);
    if (file === 'frontend/admin.html') {
        assert.equal(location.href, 'admin-login.html');
        assert.equal(location.reloadCalls, 0);
    } else if (file === 'frontend/profile.html') {
        assert.equal(location.href, 'index.html');
        assert.equal(location.reloadCalls, 0);
    } else {
        assert.equal(location.href, '');
        assert.equal(location.reloadCalls, 1);
    }
};

const runAdminQuestionAuthCase = async (outcome) => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'frontend/admin.html'), 'utf8');
    const functionSources = extractAsyncFunctions(source, 'loadAdminQuestions');
    assert.equal(functionSources.length, 2, 'all duplicate admin question callers must stay covered');

    for (const [definitionIndex, functionSource] of functionSources.entries()) {
        if (outcome === '403-products' && definitionIndex === 0) continue;
        const storage = new FakeStorage({ nova_admin_token: token });
        const alerts = [];
        const location = { href: '' };
        const tbody = { innerHTML: '' };
        let jsonCalls = 0;
        let logoutCalls = 0;

        const response = ({ ok, status, payload, mustNotRead = false }) => ({
            ok,
            status,
            async json() {
                jsonCalls += 1;
                if (mustNotRead) throw new Error('403 response body must not delay local logout');
                return payload;
            }
        });
        const adminApiFetch = async (input) => {
            if (outcome === '401') {
                storage.removeItem('nova_admin_token');
                location.href = 'admin-login.html?reason=session-expired';
                const error = new Error('synthetic admin auth error');
                error.status = 401;
                error.isAdminAuthError = true;
                throw error;
            }
            if (outcome === '403' && input.includes('/admin/all')) {
                return response({ ok: false, status: 403, mustNotRead: true });
            }
            if (outcome === '403-products' && input.includes('/admin/products')) {
                return response({ ok: false, status: 403, mustNotRead: true });
            }
            if (outcome === 'token-error' && input.includes('/admin/all')) {
                return response({ ok: false, status: 400, payload: { error: 'synthetic invalid token' } });
            }
            return response({ ok: true, status: 200, payload: [] });
        };
        const adminReadJson = async (apiResponse, fallbackMessage) => {
            const payload = await apiResponse.json();
            if (!apiResponse.ok) {
                const error = new Error(payload?.error || fallbackMessage);
                error.status = apiResponse.status;
                throw error;
            }
            return payload;
        };
        const adminLogout = async () => {
            logoutCalls += 1;
            storage.removeItem('nova_admin_token');
            location.href = 'admin-login.html';
        };
        const context = {
            adminApiFetch,
            adminLogout,
            adminQuestionProductRows: [],
            adminQuestionRows: [],
            adminReadJson,
            alert: (message) => alerts.push(message),
            console: { error() {} },
            document: { querySelector: () => tbody },
            escapeAdminHtml: (value) => String(value),
            localStorage: storage,
            productQuestionFallbackSummary: () => [],
            renderProductQuestionRows() {},
            window: { location }
        };
        const loadAdminQuestions = vm.runInNewContext(`${functionSource}; loadAdminQuestions`, context);
        await loadAdminQuestions();

        const label = `admin question definition ${definitionIndex + 1} ${outcome}`;
        assert.deepEqual(alerts, [], `${label} auth handling must not block navigation with a modal`);
        assert.equal(storage.getItem('nova_admin_token'), null, `${label} must clean the token`);
        assert.equal(storage.removeCalls.get('nova_admin_token'), 1, `${label} cleanup must run once`);
        if (outcome === '401') {
            assert.equal(logoutCalls, 0);
            assert.equal(jsonCalls, 0);
            assert.equal(location.href, 'admin-login.html?reason=session-expired');
        } else {
            assert.equal(logoutCalls, 1);
            assert.equal(jsonCalls, outcome.startsWith('403') ? 0 : 1);
            assert.equal(location.href, 'admin-login.html');
        }
    }
};

(async () => {
    for (const file of ['frontend/index.html', 'frontend/product.html', 'frontend/profile.html']) {
        for (const outcome of ['success', 'http-error', 'sync-throw', 'async-throw', 'pending']) {
            await runCase({
                file,
                functionName: 'userLogout',
                tokenKey: 'nova_user_token',
                endpoint: '/api/users/logout',
                outcome,
                customer: true
            });
        }
    }
    for (const outcome of ['success', 'http-error', 'sync-throw', 'async-throw', 'pending']) {
        await runCase({
            file: 'frontend/admin.html',
            functionName: 'adminLogout',
            tokenKey: 'nova_admin_token',
            endpoint: '/api/auth/logout',
            outcome,
            customer: false
        });
    }
    for (const outcome of ['401', '403', '403-products', 'token-error']) {
        await runAdminQuestionAuthCase(outcome);
    }
    console.log('legacyLogoutRevocationSmoke: PASS clients=4 cases=20 pending=4 cleanup-once=20 navigation-nonmodal=20 admin-auth-callers=7 definitions=2');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
