const assert = require('assert');

const storage = new Map();
global.localStorage = {
    getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
        storage.set(key, String(value));
    },
    removeItem(key) {
        storage.delete(key);
    }
};

const calls = [];
global.fetch = async (path, options = {}) => {
    calls.push({ path, options });

    if (path === '/api/favorites/sync') {
        const body = JSON.parse(options.body);
        assert.deepStrictEqual(body.productIds, [101, 102]);
        return ok({ productIds: [101, 102] });
    }

    if (path === '/api/favorites') {
        return ok({ productIds: [101, 102] });
    }

    if (path === '/api/favorites/103' && options.method === 'POST') {
        return ok({ productId: 103, favorited: true, created: true }, 201);
    }

    if (path === '/api/favorites/101' && options.method === 'DELETE') {
        return ok({ productId: 101, favorited: false, removed: true });
    }

    throw new Error(`Unexpected fetch: ${path}`);
};

function ok(payload, status = 200) {
    return {
        ok: true,
        status,
        async json() {
            return payload;
        }
    };
}

const favorites = require('../frontend/favorites-sync');

(async () => {
    localStorage.setItem('nova_user_info', JSON.stringify({ id: 10 }));
    localStorage.setItem('nova_user_token', 'token-10');
    localStorage.setItem('novastore_favs_10', JSON.stringify([101, 101, '102']));

    const firstLoad = await favorites.loadFavoriteIds();
    assert.deepStrictEqual([...firstLoad].sort((a, b) => a - b), [101, 102]);
    assert.strictEqual(localStorage.getItem('novastore_favs_migrated_10'), '1');
    assert.strictEqual(calls.filter((call) => call.path === '/api/favorites/sync').length, 1);

    await favorites.loadFavoriteIds();
    assert.strictEqual(calls.filter((call) => call.path === '/api/favorites/sync').length, 1);

    await favorites.setFavorite(103, true);
    assert.strictEqual(calls.some((call) => call.path === '/api/favorites/103' && call.options.method === 'POST'), true);
    assert.deepStrictEqual(favorites.readLocalIds(10).sort((a, b) => a - b), [101, 102, 103]);

    await favorites.setFavorite(101, false);
    assert.strictEqual(calls.some((call) => call.path === '/api/favorites/101' && call.options.method === 'DELETE'), true);
    assert.deepStrictEqual(favorites.readLocalIds(10).sort((a, b) => a - b), [102, 103]);

    localStorage.removeItem('nova_user_token');
    localStorage.setItem('nova_user_info', JSON.stringify({ id: 'guest' }));
    await favorites.setFavorite(201, true);
    assert.deepStrictEqual(favorites.readLocalIds('guest'), [201]);

    console.log('web favorites sync smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
