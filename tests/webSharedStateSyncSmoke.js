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
global.dispatchEvent = (event) => {
    events.push(event);
};

const calls = [];
let failWrites = false;
global.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    if (failWrites) {
        return {
            ok: false,
            status: 500,
            async json() {
                return { error: 'backend down' };
            }
        };
    }
    if (path === '/api/shared-state/cart' && options.method === 'PUT') {
        const body = JSON.parse(options.body);
        assert.strictEqual(body.payload.items[0].productId, 101);
        return ok({ key: 'cart', payload: body.payload });
    }
    if (path === '/api/shared-state/checkout' && options.method === 'PUT') {
        const body = JSON.parse(options.body);
        assert.strictEqual(body.payload.items[0].productId, 101);
        return ok({ key: 'checkout', payload: body.payload });
    }
    if (path === '/api/shared-state/checkout' && !options.method) {
        return ok({ key: 'checkout', payload: { items: [{ id: 101, name: 'Urun 101', price: 100, image: '101.png', quantity: 1 }] } });
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

(async () => {
    localStorage.setItem('nova_user_info', JSON.stringify({ id: 77 }));
    localStorage.setItem('nova_user_token', 'token-77');

    const item = { id: 101, name: 'Urun 101', price: 100, image: '101.png', quantity: 1 };
    await global.NovaStoreSharedState.saveCart([item]);
    await global.NovaStoreSharedState.saveCheckout({ items: [item], paymentMethod: 'card' });
    const checkout = await global.NovaStoreSharedState.loadCheckout();
    assert.strictEqual(checkout.items[0].productId, 101);

    assert.strictEqual(calls.some((call) => call.path === '/api/shared-state/cart'), true);
    assert.strictEqual(calls.some((call) => call.path === '/api/shared-state/checkout'), true);

    failWrites = true;
    await assert.rejects(
        () => global.NovaStoreSharedState.saveCart([item]),
        /backend down/
    );
    assert.strictEqual(localStorage.getItem('novastore_cart_77'), null);

    global.NovaStoreSharedState.writeCartLocal([item]);
    assert.strictEqual(JSON.parse(localStorage.getItem('novastore_cart_77'))[0].productId, 101);

    console.log('web shared state sync smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
