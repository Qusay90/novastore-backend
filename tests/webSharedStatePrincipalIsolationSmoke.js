const assert = require('assert');

class FakeStorage {
    constructor() {
        this.items = new Map();
    }

    getItem(key) {
        return this.items.has(key) ? this.items.get(key) : null;
    }

    setItem(key, value) {
        this.items.set(key, String(value));
    }

    removeItem(key) {
        this.items.delete(key);
    }

    clear() {
        this.items.clear();
    }
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() {
            return payload ? JSON.stringify(payload) : '';
        }
    };
}

function login(userId, token) {
    localStorage.setItem('nova_user_info', JSON.stringify({ id: userId }));
    localStorage.setItem('nova_user_token', token);
}

function cartItem(productId) {
    return {
        id: productId,
        name: `Ürün ${productId}`,
        price: productId,
        image: `${productId}.png`,
        quantity: 1
    };
}

function requestRecord(path, options = {}) {
    return {
        path,
        authorization: options.headers?.Authorization || '',
        payload: options.body ? JSON.parse(options.body).payload : null
    };
}

async function expectPrincipalChanged(promise) {
    await assert.rejects(promise, (error) => {
        assert.strictEqual(error.code, 'SHARED_STATE_PRINCIPAL_CHANGED');
        assert.strictEqual(error.status, 409);
        return true;
    });
}

global.Storage = FakeStorage;
global.localStorage = new FakeStorage();
global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
};
global.addEventListener = () => {};
const events = [];
global.dispatchEvent = (event) => events.push(event);

let fetchImplementation = async () => {
    throw new Error('Fetch implementation was not configured.');
};
global.fetch = (...args) => fetchImplementation(...args);

require('../frontend/shared-state-sync');

(async () => {
    // A queued write can never be rebound to B, while a fresh B write proceeds.
    localStorage.clear();
    events.length = 0;
    const queuedCalls = [];
    const firstAStarted = deferred();
    const releaseFirstA = deferred();
    fetchImplementation = async (path, options = {}) => {
        const call = requestRecord(path, options);
        queuedCalls.push(call);
        if (call.payload?.items?.[0]?.productId === 101) {
            firstAStarted.resolve();
            await releaseFirstA.promise;
        }
        return response({ key: 'cart', payload: call.payload });
    };

    login(41, 'TOKEN_A');
    const firstAWrite = global.NovaStoreSharedState.saveCart([cartItem(101)]);
    const queuedAWrite = global.NovaStoreSharedState.saveCart([cartItem(202)]);
    await firstAStarted.promise;

    login(42, 'TOKEN_B');
    const freshBWrite = global.NovaStoreSharedState.saveCart([cartItem(303)]);
    await freshBWrite;
    releaseFirstA.resolve();
    await expectPrincipalChanged(firstAWrite);
    await expectPrincipalChanged(queuedAWrite);

    assert.deepStrictEqual(
        queuedCalls.map((call) => [call.payload.items[0].productId, call.authorization]),
        [
            [101, 'Bearer TOKEN_A'],
            [303, 'Bearer TOKEN_B']
        ]
    );
    assert.strictEqual(queuedCalls.some((call) => call.payload.items[0].productId === 202), false);

    // A retry keeps A's immutable principal and is cancelled after a B login.
    localStorage.clear();
    const retryCalls = [];
    const firstRetryAttempt = deferred();
    fetchImplementation = async (path, options = {}) => {
        retryCalls.push(requestRecord(path, options));
        firstRetryAttempt.resolve();
        return response({ error: 'temporary failure' }, 500);
    };
    login(41, 'TOKEN_A');
    const retryingAWrite = global.NovaStoreSharedState.saveCart([cartItem(404)]);
    await firstRetryAttempt.promise;
    login(42, 'TOKEN_B');
    await expectPrincipalChanged(retryingAWrite);
    assert.strictEqual(retryCalls.length, 1);
    assert.strictEqual(retryCalls[0].authorization, 'Bearer TOKEN_A');

    // A principal change inside the exact 250 ms retry wait cancels the retry.
    localStorage.clear();
    const retryWaitEntered = deferred();
    const releaseRetryWait = deferred();
    const duringWaitCalls = [];
    fetchImplementation = async (path, options = {}) => {
        duringWaitCalls.push(requestRecord(path, options));
        return response({ error: 'temporary failure' }, 500);
    };
    const nativeSetTimeout = global.setTimeout;
    global.setTimeout = (callback, milliseconds, ...args) => {
        if (milliseconds === 250) {
            retryWaitEntered.resolve();
            releaseRetryWait.promise.then(() => callback(...args));
            return 0;
        }
        return nativeSetTimeout(callback, milliseconds, ...args);
    };
    try {
        login(41, 'TOKEN_A');
        const waitingAWrite = global.NovaStoreSharedState.saveCart([cartItem(414)]);
        await retryWaitEntered.promise;
        login(42, 'TOKEN_B');
        releaseRetryWait.resolve();
        await expectPrincipalChanged(waitingAWrite);
    } finally {
        global.setTimeout = nativeSetTimeout;
    }
    assert.strictEqual(duringWaitCalls.length, 1);
    assert.strictEqual(duringWaitCalls[0].authorization, 'Bearer TOKEN_A');

    // A late A 401 cannot clear B or emit an auth-required event in B's session.
    localStorage.clear();
    events.length = 0;
    const late401Started = deferred();
    const releaseLate401 = deferred();
    fetchImplementation = async () => {
        late401Started.resolve();
        await releaseLate401.promise;
        return response({ error: 'Invalid or expired token.' }, 401);
    };
    login(41, 'TOKEN_A');
    const lateAWrite = global.NovaStoreSharedState.saveCart([cartItem(505)]);
    await late401Started.promise;
    login(42, 'TOKEN_B');
    releaseLate401.resolve();
    await expectPrincipalChanged(lateAWrite);
    assert.strictEqual(localStorage.getItem('nova_user_token'), 'TOKEN_B');
    assert.deepStrictEqual(JSON.parse(localStorage.getItem('nova_user_info')), { id: 42 });
    assert.strictEqual(events.some((event) => event.type === 'novastore:auth-required'), false);

    // A delayed read never returns A data after a B login.
    localStorage.clear();
    const readStarted = deferred();
    const releaseRead = deferred();
    fetchImplementation = async () => {
        readStarted.resolve();
        await releaseRead.promise;
        return response({
            key: 'cart',
            exists: true,
            payload: { items: [cartItem(606)] }
        });
    };
    login(41, 'TOKEN_A');
    const delayedARead = global.NovaStoreSharedState.loadCartState();
    await readStarted.promise;
    login(42, 'TOKEN_B');
    releaseRead.resolve();
    await expectPrincipalChanged(delayedARead);

    // The public loadCart wrapper revalidates one additional await boundary.
    localStorage.clear();
    const loadCartTextEntered = deferred();
    const loadCartText = deferred();
    fetchImplementation = async () => ({
        ok: true,
        status: 200,
        text() {
            loadCartTextEntered.resolve();
            return loadCartText.promise;
        }
    });
    login(41, 'TOKEN_A');
    const delayedPublicLoad = global.NovaStoreSharedState.loadCart();
    await loadCartTextEntered.promise;
    loadCartText.promise.then(() => queueMicrotask(() => queueMicrotask(() => login(42, 'TOKEN_B'))));
    loadCartText.resolve(JSON.stringify({
        key: 'cart',
        exists: true,
        payload: { items: [cartItem(616)] }
    }));
    await expectPrincipalChanged(delayedPublicLoad);
    assert.deepStrictEqual(JSON.parse(localStorage.getItem('nova_user_info')), { id: 42 });

    // The nested-await microtask gap also cancels A before storage/event side effects.
    localStorage.clear();
    events.length = 0;
    const hydrateTextEntered = deferred();
    const hydrateText = deferred();
    fetchImplementation = async (path, options = {}) => {
        const authorization = options.headers?.Authorization;
        if (authorization === 'Bearer TOKEN_A') {
            return {
                ok: true,
                status: 200,
                text() {
                    hydrateTextEntered.resolve();
                    return hydrateText.promise;
                }
            };
        }
        assert.strictEqual(authorization, 'Bearer TOKEN_B');
        return response({
            key: 'cart',
            exists: true,
            payload: { items: [cartItem(808)] }
        });
    };
    login(41, 'TOKEN_A');
    const staleAHydration = global.NovaStoreSharedState.hydrateCart();
    await hydrateTextEntered.promise;
    hydrateText.promise.then(() => queueMicrotask(() => login(42, 'TOKEN_B')));
    hydrateText.resolve(JSON.stringify({
        key: 'cart',
        exists: true,
        payload: { items: [cartItem(707)] }
    }));
    await staleAHydration;
    assert.deepStrictEqual(JSON.parse(localStorage.getItem('nova_user_info')), { id: 42 });
    assert.strictEqual(localStorage.getItem('novastore_cart_41'), null);
    assert.strictEqual(localStorage.getItem('novastore_cart_42'), null);
    assert.strictEqual(events.some((event) => event.type === 'novastore:shared-cart-updated'), false);
    assert.strictEqual(events.some((event) => event.type === 'novastore:shared-state-error'), false);

    await global.NovaStoreSharedState.hydrateCart();
    assert.strictEqual(JSON.parse(localStorage.getItem('novastore_cart_42'))[0].productId, 808);
    assert.strictEqual(
        events.filter((event) => event.type === 'novastore:shared-cart-updated').length,
        1
    );

    console.log('web shared state principal isolation smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
