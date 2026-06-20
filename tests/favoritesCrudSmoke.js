const assert = require('assert');
const pool = require('../config/db');
const { authenticate } = require('../middlewares/authMiddleware');
const {
    listFavorites,
    addFavorite,
    removeFavorite,
    syncFavorites,
    __test
} = require('../controllers/favoriteController');

const products = new Set([101, 102]);
const favorites = [];

const mapFavoriteJoinRow = (favorite) => ({
    product_id: favorite.product_id,
    created_at: favorite.created_at,
    id: favorite.product_id,
    name: `Urun ${favorite.product_id}`,
    price: 100,
    old_price: null,
    image_url: 'test.png',
    stock: 5,
    category: 'Test'
});

const listRowsForUser = (userId) => favorites
    .filter((favorite) => favorite.user_id === userId && products.has(favorite.product_id))
    .sort((a, b) => b.created_at - a.created_at || b.product_id - a.product_id)
    .map(mapFavoriteJoinRow);

pool.query = async (sql, params = []) => {
    if (/SELECT id FROM products WHERE id = \$1/i.test(sql)) {
        const id = Number(params[0]);
        return { rows: products.has(id) ? [{ id }] : [], rowCount: products.has(id) ? 1 : 0 };
    }

    if (/INSERT INTO favorites/i.test(sql)) {
        const userId = params[0];
        const productId = params[1];
        const exists = favorites.some((favorite) => favorite.user_id === userId && favorite.product_id === productId);
        if (exists) return { rows: [], rowCount: 0 };
        const row = { user_id: userId, product_id: productId, created_at: new Date(Date.now() + favorites.length) };
        favorites.push(row);
        return { rows: [{ product_id: productId, created_at: row.created_at }], rowCount: 1 };
    }

    if (/DELETE FROM favorites WHERE user_id = \$1 AND product_id = \$2/i.test(sql)) {
        const index = favorites.findIndex((favorite) => favorite.user_id === params[0] && favorite.product_id === params[1]);
        if (index === -1) return { rows: [], rowCount: 0 };
        favorites.splice(index, 1);
        return { rows: [], rowCount: 1 };
    }

    if (/FROM favorites f\s+INNER JOIN products p/i.test(sql)) {
        const rows = listRowsForUser(params[0]);
        return { rows, rowCount: rows.length };
    }

    throw new Error(`Unhandled fake pool SQL: ${sql}`);
};

pool.connect = async () => ({
    async query(sql, params = []) {
        if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [], rowCount: 0 };

        if (/SELECT id FROM products WHERE id = ANY/i.test(sql)) {
            const ids = params[0].filter((id) => products.has(Number(id))).map((id) => ({ id }));
            return { rows: ids, rowCount: ids.length };
        }

        return pool.query(sql, params);
    },
    release() {}
});

const createReq = (userId, params = {}, body = {}) => ({
    user: { id: userId, role: 'customer' },
    params,
    body,
    headers: {}
});

const createRes = () => {
    const res = {
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
    };
    return res;
};

const invoke = async (handler, req) => {
    const res = createRes();
    await handler(req, res);
    return res;
};

(async () => {
    const authRes = createRes();
    authenticate({ headers: {} }, authRes, () => {
        throw new Error('Unauthenticated favorites request should not reach handler');
    });
    assert.strictEqual(authRes.statusCode, 401);

    assert.strictEqual(__test.normalizeProductId('101'), 101);
    assert.strictEqual(__test.normalizeProductId('abc'), null);
    assert.strictEqual(__test.normalizeProductId('0'), null);

    const invalidProductId = await invoke(addFavorite, createReq(10, { productId: 'abc' }));
    assert.strictEqual(invalidProductId.statusCode, 400);

    const missingProduct = await invoke(addFavorite, createReq(10, { productId: '999' }));
    assert.strictEqual(missingProduct.statusCode, 404);

    const created = await invoke(addFavorite, createReq(10, { productId: '101' }));
    assert.strictEqual(created.statusCode, 201);
    assert.strictEqual(created.body.favorited, true);
    assert.strictEqual(favorites.length, 1);

    const duplicate = await invoke(addFavorite, createReq(10, { productId: '101' }));
    assert.strictEqual(duplicate.statusCode, 200);
    assert.strictEqual(duplicate.body.created, false);
    assert.strictEqual(favorites.length, 1);

    await invoke(addFavorite, createReq(11, { productId: '102' }));

    const listed = await invoke(listFavorites, createReq(10));
    assert.deepStrictEqual(listed.body.productIds, [101]);
    assert.strictEqual(listed.body.favorites.length, 1);
    assert.strictEqual(listed.body.favorites[0].product.id, 101);

    const otherUserList = await invoke(listFavorites, createReq(11));
    assert.deepStrictEqual(otherUserList.body.productIds, [102]);

    const removed = await invoke(removeFavorite, createReq(10, { productId: '101' }));
    assert.strictEqual(removed.statusCode, 200);
    assert.strictEqual(removed.body.removed, true);

    const removedAgain = await invoke(removeFavorite, createReq(10, { productId: '101' }));
    assert.strictEqual(removedAgain.statusCode, 200);
    assert.strictEqual(removedAgain.body.removed, false);

    const afterRemove = await invoke(listFavorites, createReq(10));
    assert.deepStrictEqual(afterRemove.body.productIds, []);

    const syncResult = await invoke(syncFavorites, createReq(10, {}, { productIds: [101, '102', 102] }));
    assert.strictEqual(syncResult.statusCode, 200);
    assert.deepStrictEqual(syncResult.body.productIds.sort((a, b) => a - b), [101, 102]);
    assert.strictEqual(favorites.filter((favorite) => favorite.user_id === 10 && favorite.product_id === 102).length, 1);

    const syncMissing = await invoke(syncFavorites, createReq(10, {}, { productIds: [999] }));
    assert.strictEqual(syncMissing.statusCode, 404);

    console.log('favorites CRUD smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
