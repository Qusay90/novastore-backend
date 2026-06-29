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
global.dispatchEvent = () => {};

let inFlight = 0;
let maxInFlight = 0;
let unauthorized = false;
const writes = [];

global.fetch = async (path, options = {}) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
        await new Promise((resolve) => setTimeout(resolve, 15));
        if (unauthorized) {
            return response({ error: 'Invalid or expired token.' }, 401);
        }

        const body = JSON.parse(options.body);
        writes.push({ path, payload: body.payload });
        return response({ key: path.endsWith('cart') ? 'cart' : 'checkout', payload: body.payload });
    } finally {
        inFlight -= 1;
    }
};

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() {
            return payload ? JSON.stringify(payload) : '';
        }
    };
}

require('../frontend/shared-state-sync');

const item = (quantity) => ({
    id: 101,
    name: 'Ürün 101',
    price: 100,
    image: '101.png',
    quantity
});

(async () => {
    localStorage.setItem('nova_user_info', JSON.stringify({ id: 77 }));
    localStorage.setItem('nova_user_token', 'token-77');

    await Promise.all([
        global.NovaStoreSharedState.saveCart([item(1)]),
        global.NovaStoreSharedState.saveCart([item(2)])
    ]);

    assert.strictEqual(maxInFlight, 1);
    assert.deepStrictEqual(
        writes.filter((write) => write.path.endsWith('/cart')).map((write) => write.payload.items[0].quantity),
        [1, 2]
    );

    await global.NovaStoreSharedState.saveCheckout({ items: [item(1)] });
    const checkoutWritesBeforePending = writes.filter((write) => write.path.endsWith('/checkout')).length;
    localStorage.setItem('novastore_pending_checkout_77', JSON.stringify({ orderId: 9001 }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(
        writes.filter((write) => write.path.endsWith('/checkout')).length,
        checkoutWritesBeforePending
    );

    unauthorized = true;
    await assert.rejects(
        () => global.NovaStoreSharedState.saveCart([item(3)]),
        /Invalid or expired token/
    );
    assert.strictEqual(localStorage.getItem('nova_user_token'), null);
    assert.strictEqual(localStorage.getItem('nova_user_info'), null);

    const callsBeforeGuestSave = writes.length;
    assert.strictEqual(await global.NovaStoreSharedState.saveCart([item(4)]), null);
    assert.strictEqual(writes.length, callsBeforeGuestSave);

    console.log('web shared state resilience smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
