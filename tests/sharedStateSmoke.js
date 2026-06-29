const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const {
    getSharedState,
    putSharedState,
    deleteSharedState,
    __test
} = require('../controllers/sharedStateController');

const rows = new Map();

const keyFor = (userId, stateKey) => `${userId}:${stateKey}`;

pool.query = async (sql, params = []) => {
    if (/SELECT payload, updated_at FROM user_shared_state/i.test(sql)) {
        const row = rows.get(keyFor(params[0], params[1]));
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (/INSERT INTO user_shared_state/i.test(sql)) {
        const row = {
            payload: JSON.parse(params[2]),
            updated_at: new Date('2026-06-22T00:00:00.000Z')
        };
        rows.set(keyFor(params[0], params[1]), row);
        return { rows: [row], rowCount: 1 };
    }

    if (/DELETE FROM user_shared_state/i.test(sql)) {
        rows.delete(keyFor(params[0], params[1]));
        return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unhandled fake pool SQL: ${sql}`);
};

const createReq = (userId, key, body = {}) => ({
    user: { id: userId, role: 'customer' },
    params: { key },
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

(async () => {
    assert.strictEqual(__test.normalizeStateKey('cart'), 'cart');
    assert.strictEqual(__test.normalizeStateKey('bad'), null);

    const saved = await invoke(putSharedState, createReq(10, 'cart', {
        payload: {
            items: [
                { id: 101, name: 'Urun 101', price: 100, image: 'a.png', quantity: 1 },
                { productId: 101, name: 'Urun 101', price: 100, imageUrl: 'a.png', quantity: 2 },
                { id: 'bad', name: 'Bad', price: 1, quantity: 1 }
            ]
        }
    }));
    assert.strictEqual(saved.statusCode, 200);
    assert.strictEqual(saved.body.exists, true);
    assert.strictEqual(saved.body.payload.items.length, 1);
    assert.strictEqual(saved.body.payload.items[0].quantity, 3);

    const listed = await invoke(getSharedState, createReq(10, 'cart'));
    assert.strictEqual(listed.statusCode, 200);
    assert.strictEqual(listed.body.exists, true);
    assert.strictEqual(listed.body.payload.items[0].productId, 101);

    const otherUser = await invoke(getSharedState, createReq(11, 'cart'));
    assert.strictEqual(otherUser.statusCode, 200);
    assert.strictEqual(otherUser.body.exists, false);
    assert.deepStrictEqual(otherUser.body.payload.items, []);

    const badKey = await invoke(putSharedState, createReq(10, 'session', { payload: {} }));
    assert.strictEqual(badKey.statusCode, 400);

    const deleted = await invoke(deleteSharedState, createReq(10, 'cart'));
    assert.strictEqual(deleted.statusCode, 200);
    assert.strictEqual(deleted.body.exists, false);
    assert.strictEqual(rows.has(keyFor(10, 'cart')), false);

    const schemaError = new Error('relation does not exist');
    schemaError.code = '42P01';
    const schemaErrorResponse = createRes();
    __test.sendSharedStateError(schemaErrorResponse, schemaError, 'fallback');
    assert.strictEqual(schemaErrorResponse.statusCode, 503);
    assert.strictEqual(schemaErrorResponse.body.code, 'SHARED_STATE_SCHEMA_MISSING');

    const migrationSql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '20260629_shared_customer_state.sql'),
        'utf8'
    );
    assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS favorites/i);
    assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS user_shared_state/i);

    console.log('shared state smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
