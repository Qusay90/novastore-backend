const assert = require('assert');

const values = new Map();
global.localStorage = {
    getItem(key) {
        return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
        values.set(key, String(value));
    },
    removeItem(key) {
        values.delete(key);
    }
};
global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
};
global.dispatchEvent = () => {};

let inFlight = 0;
let maxInFlight = 0;
const calls = [];

global.fetch = async (path, options = {}) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
        await new Promise((resolve) => setTimeout(resolve, 15));
        calls.push({ path, method: options.method || 'GET' });

        if (path === '/api/favorites/sync') {
            const ids = JSON.parse(options.body).productIds;
            return ok({ productIds: ids });
        }
        if (path === '/api/favorites') {
            return ok({ productIds: [101, 201] });
        }
        if (path === '/api/favorites/301') {
            return ok({ productId: 301, favorited: options.method === 'POST' });
        }
        throw new Error(`Unexpected fetch: ${path}`);
    } finally {
        inFlight -= 1;
    }
};

function ok(payload) {
    return {
        ok: true,
        status: 200,
        async text() {
            return JSON.stringify(payload);
        }
    };
}

const favorites = require('../frontend/favorites-sync');

(async () => {
    localStorage.setItem('novastore_favs_guest', JSON.stringify([201]));
    localStorage.setItem('novastore_favs_10', JSON.stringify([101]));
    localStorage.setItem('nova_user_info', JSON.stringify({ id: 10 }));
    localStorage.setItem('nova_user_token', 'token-10');

    await favorites.loadFavoriteIds();
    const syncCall = calls.find((call) => call.path === '/api/favorites/sync');
    assert(syncCall);
    assert.strictEqual(localStorage.getItem('novastore_favs_guest'), null);
    assert.deepStrictEqual(favorites.readLocalIds(10).sort((a, b) => a - b), [101, 201]);

    await Promise.all([
        favorites.setFavorite(301, true),
        favorites.setFavorite(301, false)
    ]);

    assert.strictEqual(maxInFlight, 1);
    assert.deepStrictEqual(
        calls.filter((call) => call.path === '/api/favorites/301').map((call) => call.method),
        ['POST', 'DELETE']
    );
    assert.strictEqual(favorites.readLocalIds(10).includes(301), false);

    console.log('web favorites race smoke passed');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
