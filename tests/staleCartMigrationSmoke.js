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

global.Storage = FakeStorage;
global.localStorage = new FakeStorage();
global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
};
global.addEventListener = () => {};
global.dispatchEvent = () => {};

let remoteCart = { exists: false, payload: { items: [] }, updatedAt: null };
const writes = [];

global.fetch = async (path, options = {}) => {
    if (path === '/api/shared-state/cart' && !options.method) {
        return ok({ key: 'cart', ...remoteCart });
    }

    if (path === '/api/shared-state/cart' && options.method === 'PUT') {
        const body = JSON.parse(options.body);
        writes.push(body.payload);
        remoteCart = { exists: true, payload: body.payload, updatedAt: '2026-06-22T00:00:00.000Z' };
        return ok({ key: 'cart', ...remoteCart });
    }

    throw new Error(`Unexpected fetch: ${path}`);
};

function ok(payload) {
    return {
        ok: true,
        status: 200,
        async json() {
            return payload;
        }
    };
}

require('../frontend/shared-state-sync');

const item101 = { id: 101, productId: 101, name: 'Urun 101', price: 100, image: '101.png', quantity: 1 };
const item102 = { id: 102, productId: 102, name: 'Urun 102', price: 200, image: '102.png', quantity: 2 };

function login(userId = 88) {
    localStorage.setItem('nova_user_info', JSON.stringify({ id: userId }));
    localStorage.setItem('nova_user_token', `token-${userId}`);
}

function webCart() {
    return JSON.parse(localStorage.getItem('novastore_cart_88') || '[]');
}

function resetWeb() {
    localStorage.clear();
    writes.length = 0;
    remoteCart = { exists: false, payload: { items: [] }, updatedAt: null };
}

function seedStaleLocalCart(items, userId = 88) {
    localStorage.setItem('nova_user_info', JSON.stringify({ id: userId }));
    global.NovaStoreSharedState.writeCartLocal(items);
    localStorage.setItem('nova_user_token', `token-${userId}`);
}

function androidRefreshDecision({ remoteExists, remoteItems, roomItems, migrationComplete }) {
    if (remoteExists) {
        return {
            roomItems: remoteItems,
            backendItems: remoteItems,
            migrationComplete: true,
            wroteBackend: false
        };
    }

    if (roomItems.length > 0 && !migrationComplete) {
        return {
            roomItems,
            backendItems: roomItems,
            migrationComplete: true,
            wroteBackend: true
        };
    }

    return {
        roomItems: [],
        backendItems: [],
        migrationComplete: true,
        wroteBackend: false
    };
}

(async () => {
    resetWeb();
    remoteCart = { exists: true, payload: { items: [] }, updatedAt: '2026-06-22T00:00:00.000Z' };
    seedStaleLocalCart([item101]);
    await global.NovaStoreSharedState.hydrateCart();
    assert.deepStrictEqual(webCart(), []);
    assert.strictEqual(writes.length, 0);

    resetWeb();
    remoteCart = { exists: false, payload: { items: [] }, updatedAt: null };
    seedStaleLocalCart([item101]);
    await global.NovaStoreSharedState.hydrateCart();
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(writes[0].items[0].productId, 101);
    assert.strictEqual(localStorage.getItem('novastore_cart_migrated_88'), '1');

    resetWeb();
    remoteCart = { exists: true, payload: { items: [] }, updatedAt: '2026-06-22T00:00:00.000Z' };
    seedStaleLocalCart([item102]);
    localStorage.removeItem('novastore_cart_migrated_88');
    await global.NovaStoreSharedState.hydrateCart();
    assert.deepStrictEqual(webCart(), []);
    assert.strictEqual(writes.length, 0);

    resetWeb();
    remoteCart = { exists: false, payload: { items: [] }, updatedAt: null };
    seedStaleLocalCart([item102]);
    localStorage.setItem('novastore_cart_migrated_88', '1');
    await global.NovaStoreSharedState.hydrateCart();
    assert.deepStrictEqual(webCart(), []);
    assert.strictEqual(writes.length, 0);

    const androidAfterWebClear = androidRefreshDecision({
        remoteExists: true,
        remoteItems: [],
        roomItems: [item101],
        migrationComplete: true
    });
    assert.deepStrictEqual(androidAfterWebClear.roomItems, []);
    assert.deepStrictEqual(androidAfterWebClear.backendItems, []);
    assert.strictEqual(androidAfterWebClear.wroteBackend, false);

    const androidFirstLogin = androidRefreshDecision({
        remoteExists: false,
        remoteItems: [],
        roomItems: [item101],
        migrationComplete: false
    });
    assert.strictEqual(androidFirstLogin.wroteBackend, true);
    assert.strictEqual(androidFirstLogin.backendItems[0].productId, 101);

    const androidRemoteEmptyExists = androidRefreshDecision({
        remoteExists: true,
        remoteItems: [],
        roomItems: [item102],
        migrationComplete: false
    });
    assert.deepStrictEqual(androidRemoteEmptyExists.roomItems, []);
    assert.strictEqual(androidRemoteEmptyExists.wroteBackend, false);

    console.log('stale cart migration smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
