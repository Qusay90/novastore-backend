const assert = require('assert');
const pool = require('../config/db');
const favoriteController = require('../controllers/favoriteController');
const sharedStateController = require('../controllers/sharedStateController');

const favorites = new Map();
const sharedRows = new Map();
const products = new Map([
    [101, { id: 101, name: 'Urun 101', price: 100, old_price: 120, image_url: '101.png', stock: 8, category: 'test' }],
    [102, { id: 102, name: 'Urun 102', price: 200, old_price: null, image_url: '102.png', stock: 5, category: 'test' }]
]);

const favKey = (userId, productId) => `${userId}:${productId}`;
const sharedKey = (userId, stateKey) => `${userId}:${stateKey}`;

pool.query = async (sql, params = []) => {
    if (/SELECT id FROM products WHERE id = \$1/i.test(sql)) {
        const product = products.get(Number(params[0]));
        return { rows: product ? [{ id: product.id }] : [], rowCount: product ? 1 : 0 };
    }

    if (/INSERT INTO favorites/i.test(sql)) {
        const key = favKey(params[0], params[1]);
        const existed = favorites.has(key);
        if (!existed) {
            favorites.set(key, {
                user_id: params[0],
                product_id: params[1],
                created_at: new Date('2026-06-22T00:00:00.000Z')
            });
        }
        return {
            rows: existed ? [] : [{ product_id: params[1], created_at: favorites.get(key).created_at }],
            rowCount: existed ? 0 : 1
        };
    }

    if (/DELETE FROM favorites/i.test(sql)) {
        const removed = favorites.delete(favKey(params[0], params[1]));
        return { rows: [], rowCount: removed ? 1 : 0 };
    }

    if (/FROM favorites f/i.test(sql)) {
        const rows = [...favorites.values()]
            .filter((row) => row.user_id === params[0])
            .map((row) => ({ ...row, ...products.get(row.product_id) }))
            .sort((a, b) => b.product_id - a.product_id);
        return { rows, rowCount: rows.length };
    }

    if (/SELECT payload, updated_at FROM user_shared_state/i.test(sql)) {
        const row = sharedRows.get(sharedKey(params[0], params[1]));
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/INSERT INTO user_shared_state/i.test(sql)) {
        const row = {
            payload: JSON.parse(params[2]),
            updated_at: new Date('2026-06-22T00:00:00.000Z')
        };
        sharedRows.set(sharedKey(params[0], params[1]), row);
        return { rows: [row], rowCount: 1 };
    }

    throw new Error(`Unhandled fake pool SQL: ${sql}`);
};

const createReq = (userId, params = {}, body = {}) => ({
    user: { id: userId, role: 'customer' },
    params,
    body
});

const createRes = () => ({
    statusCode: 200,
    body: undefined,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    }
});

const invoke = async (handler, req) => {
    const res = createRes();
    await handler(req, res);
    return res;
};

const listFavoriteIds = async (userId) => {
    const res = await invoke(favoriteController.listFavorites, createReq(userId));
    assert.strictEqual(res.statusCode, 200);
    return res.body.productIds;
};

const putState = async (userId, key, payload) => {
    const res = await invoke(sharedStateController.putSharedState, createReq(userId, { key }, { payload }));
    assert.strictEqual(res.statusCode, 200);
    return res.body.payload;
};

const getState = async (userId, key) => {
    const res = await invoke(sharedStateController.getSharedState, createReq(userId, { key }));
    assert.strictEqual(res.statusCode, 200);
    return res.body.payload;
};

(async () => {
    const userId = 42;

    await invoke(favoriteController.addFavorite, createReq(userId, { productId: 101 }));
    assert.deepStrictEqual(await listFavoriteIds(userId), [101]);

    await invoke(favoriteController.addFavorite, createReq(userId, { productId: 102 }));
    assert.deepStrictEqual(await listFavoriteIds(userId), [102, 101]);

    await invoke(favoriteController.removeFavorite, createReq(userId, { productId: 101 }));
    assert.deepStrictEqual(await listFavoriteIds(userId), [102]);

    await invoke(favoriteController.removeFavorite, createReq(userId, { productId: 102 }));
    assert.deepStrictEqual(await listFavoriteIds(userId), []);

    await putState(userId, 'cart', {
        items: [{ id: 101, name: 'Urun 101', price: 100, image: '101.png', quantity: 1 }]
    });
    assert.deepStrictEqual((await getState(userId, 'cart')).items.map((item) => item.productId), [101]);

    await putState(userId, 'cart', {
        items: [{ id: 101, name: 'Urun 101', price: 100, image: '101.png', quantity: 3 }]
    });
    assert.strictEqual((await getState(userId, 'cart')).items[0].quantity, 3);

    await putState(userId, 'cart', { items: [] });
    assert.deepStrictEqual((await getState(userId, 'cart')).items, []);

    await putState(userId, 'cart', {
        items: [{ id: 102, name: 'Urun 102', price: 200, image: '102.png', quantity: 2 }]
    });
    assert.strictEqual((await getState(userId, 'cart')).items[0].productId, 102);

    await putState(userId, 'checkout', {
        items: [{ id: 102, name: 'Urun 102', price: 200, image: '102.png', quantity: 2 }],
        selectedAddressId: 5,
        paymentMethod: 'card'
    });
    const checkout = await getState(userId, 'checkout');
    assert.strictEqual(checkout.items[0].productId, 102);
    assert.strictEqual(checkout.selectedAddressId, 5);
    assert.strictEqual(checkout.paymentMethod, 'card');

    await invoke(favoriteController.addFavorite, createReq(userId, { productId: 101 }));
    assert.deepStrictEqual(await listFavoriteIds(userId), [101]);
    assert.strictEqual((await getState(userId, 'cart')).items[0].productId, 102);

    console.log('cross-platform shared state smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
