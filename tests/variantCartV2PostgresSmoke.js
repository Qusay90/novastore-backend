'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const startDisposable = require('./helpers/themePlatformDisposableDb');
const { seedVariantCartV2 } = require('./helpers/variantCartV2Fixture');

const caps = { 'X-Cart-Schema-Version': '2', 'X-Cart-Variant-Line-Identity': 'true', 'X-Cart-CAS': 'true' };
const gates = [];
let db, server, cleanup, fixture;
const gate = async (id, name, action) => {
    try { await action(); gates.push({ id, name, status: 'PASS' }); db.originalConsole.log(`PASS ${id} ${name}`); }
    catch (error) { gates.push({ id, name, status: 'FAIL', error: error.message }); throw error; }
};

(async () => {
    db = await startDisposable();
    const { pool } = db;
    assert(db.migrations.includes('20260919_variant_cart_v2'), 'Real B03 migration must be in the authoritative manifest.');
    fixture = await seedVariantCartV2(pool, db.sensitive);
    const { a, b, alice, bob, createCustomer, createOrder, auth } = fixture;
    const app = express();
    app.use(express.json());
    app.use('/api/shared-state', require('../routes/sharedStateRoutes'));
    app.use('/api/campaigns', require('../routes/campaignRoutes'));
    server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const request = async (route = 'cart', { user = alice, method = 'GET', body, capability = caps } = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${route.startsWith('campaigns/') ? route : `shared-state/${route}`}`, {
            method, headers: { ...(user ? { authorization: `Bearer ${user.token}` } : {}), ...capability, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
        });
        return { status: response.status, body: await response.json() };
    };
    const ok = (response, status = 200, code) => { assert.equal(response.status, status, JSON.stringify(response.body)); if (code) assert.equal(response.body.code, code); return response.body; };
    const get = async (user = alice, key = 'cart') => ok(await request(key, { user }));
    const identitiesOnly = (items) => items.map(({ productId, variantId, quantity, storeId }) => ({ productId, variantId, quantity, ...(storeId === undefined ? {} : { storeId }) }));
    const put = (items, expectedRevision, { user = alice, key = 'cart', ...extra } = {}) => request(key, { user, method: 'PUT', body: { expectedRevision, payload: { cartSchemaVersion: 2, items: identitiesOnly(items) }, ...extra } });
    const save = async (items, user = alice, key = 'cart') => ok(await put(items, (await get(user, key)).revision, { user, key }));
    const line = (variantId = 901, quantity = 1, store = a) => ({ productId: store.productId, variantId, quantity });
    const identities = (state) => state.payload.items.map((item) => `${item.storeId}:${item.productId}:${item.variantId}`).sort();
    const quantity = (state, variantId) => state.payload.items.find((item) => item.variantId === variantId)?.quantity;
    const snapshot = async (user = alice) => (await pool.query('SELECT state_key,payload,cart_schema_version,revision FROM user_shared_state WHERE user_id=$1 ORDER BY state_key', [user.userId])).rows;
    let current, purchased;

    await gate('DB01', '501/901 and 501/902 persist as distinct canonical lines', async () => {
        current = await save([line(901), line(902)]);
        assert.equal(current.payload.cartSchemaVersion, 2);
        assert.deepEqual(identities(current), [`${a.storeId}:501:901`, `${a.storeId}:501:902`]);
    });
    await gate('DB02', 'Duplicate same variant sums quantity', async () => {
        current = await save([line(901), line(901, 2), line(902)]);
        assert.equal(current.payload.items.length, 2); assert.equal(quantity(current, 901), 3);
    });
    await gate('DB03', 'Different variants retain independent canonical prices and display', async () => {
        assert.equal(quantity(current, 902), 1);
        assert.deepEqual(current.payload.items.map((item) => item.price), [111, 225]);
        assert(current.payload.items.every((item) => item.storeId === a.storeId));
    });
    await gate('DB04', 'Removing 901 leaves 902 intact', async () => {
        current = ok(await put(current.payload.items.filter((item) => item.variantId !== 901), current.revision));
        assert.deepEqual(identities(current), [`${a.storeId}:501:902`]);
    });
    await gate('DB05', 'Checkout snapshot of 901 does not erase unpaid 902', async () => {
        current = await save([line(901, 3), line(902, 2)]);
        const checkout = await save([line(901, 1)], alice, 'checkout');
        assert.deepEqual(identities(checkout), [`${a.storeId}:501:901`]);
        assert.deepEqual((await get()).payload.items, current.payload.items);
    });
    await gate('DB06', 'Stale revision is rejected without any state change', async () => {
        const before = await snapshot();
        ok(await put([line(902, 7)], current.revision - 1), 409, 'CART_REVISION_CONFLICT');
        assert.deepEqual(await snapshot(), before);
    });
    await gate('DB07', 'Concurrent same-revision replacements have exactly one winner', async () => {
        const revision = current.revision;
        const results = await Promise.all([put([line(901), line(902, 3)], revision), put([line(901), line(902, 4)], revision)]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        assert.equal(results.find((r) => r.status === 409).body.code, 'CART_REVISION_CONFLICT');
        current = await get(); assert.equal(current.revision, revision + 1);
    });
    await gate('DB08', 'Legacy PUT and compact-cart replacements cannot downgrade v2', async () => {
        const before = await snapshot();
        for (const key of ['cart', 'checkout']) ok(await request(key, { capability: {}, method: 'PUT', body: { payload: { version: 1, items: [{ productId: 501, name: 'Legacy', quantity: 99, price: 1 }] } } }), 426, 'CART_CLIENT_UPGRADE_REQUIRED');
        assert.deepEqual(await snapshot(), before);
    });
    await gate('DB09', 'Legacy DELETE and logout cleanup cannot delete account v2 state', async () => {
        const before = await snapshot();
        for (const key of ['cart', 'checkout']) ok(await request(key, { capability: {}, method: 'DELETE' }), 426, 'CART_CLIENT_UPGRADE_REQUIRED');
        assert.deepEqual(await snapshot(), before);
    });
    await gate('DB10', 'Unknown future body and capability schema fail closed', async () => {
        const before = await snapshot();
        ok(await request('cart', { method: 'PUT', body: { expectedRevision: current.revision, payload: { cartSchemaVersion: 99, items: [] } } }), 400, 'CART_SCHEMA_UNSUPPORTED');
        ok(await request('cart', { capability: { ...caps, 'X-Cart-Schema-Version': '99' } }), 400, 'CART_SCHEMA_UNSUPPORTED');
        assert.deepEqual(await snapshot(), before);
    });
    await gate('DB11', 'Fresh HTTP reload and database JSON retain variant identity', async () => {
        const again = await get(); assert.deepEqual(again.payload.items, current.payload.items);
        const row = (await snapshot()).find((item) => item.state_key === 'cart');
        assert.equal(row.cart_schema_version, 2); assert.deepEqual(row.payload.items, current.payload.items);
    });
    await gate('DB12', 'Authenticated account switch never exposes another customer cart', async () => {
        const other = await get(bob); assert.deepEqual(other.payload.items, []);
        await save([line(903, 1, b)], bob);
        assert.deepEqual((await get()).payload.items, current.payload.items);
        ok(await request('cart', { user: null }), 401);
    });
    await gate('DB13', 'Two stores keep canonical ownership and reject forged store or variant', async () => {
        const combined = await save([line(901), line(903, 1, b)], bob);
        assert.deepEqual(identities(combined), [`${a.storeId}:501:901`, `${b.storeId}:601:903`].sort());
        const before = await snapshot(bob);
        assert.notEqual((await put([{ ...line(901), storeId: b.storeId }], combined.revision, { user: bob })).status, 200);
        assert.notEqual((await put([{ productId: 501, variantId: 903, quantity: 1 }], combined.revision, { user: bob })).status, 200);
        assert.deepEqual(await snapshot(bob), before);
    });
    await gate('DB14', 'Actual canonical quote preserves tuple and owns price and stock', async () => {
        const quote = ok(await request('campaigns/quote', { method: 'POST', user: null, body: { cartItems: [line(901), line(902)].map((item) => ({ ...item, price: 0.01, stock: 9999, store_id: b.storeId })) } }));
        assert.deepEqual(quote.items.map((item) => item.variant_id), [901, 902]);
        assert.deepEqual(quote.items.map((item) => item.price), [111, 225]);
        assert(quote.items.every((item) => item.store_id === a.storeId));
    });
    await gate('DB15', 'Actual order creation reserves only chosen variant and snapshots its identity', async () => {
        const stocks = async () => (await pool.query('SELECT variant_id,quantity FROM seller_inventory_items WHERE variant_id IN (901,902) ORDER BY variant_id')).rows.map((row) => Number(row.quantity));
        const before = await stocks();
        purchased = await createOrder(alice.userId, [line(901)], { paid: true });
        assert.equal(purchased.items.length, 1); assert.equal(purchased.items[0].variant_id, 901);
        assert.equal(purchased.items[0].store_id, a.storeId); assert.equal(purchased.items[0].price, 111);
        assert.deepEqual(await stocks(), [before[0] - 1, before[1]]);
    });
    await gate('DB16', 'Paid-order finalization removes exact quantity and preserves sibling; replay once', async () => {
        current = await save([line(901, 3), line(902, 2)]);
        const revision = current.revision;
        current = ok(await request('cart/finalize', { method: 'POST', body: { expectedRevision: revision, orderId: Number(purchased.id) } }));
        assert.equal(quantity(current, 901), 2); assert.equal(quantity(current, 902), 2); assert.equal(current.revision, revision + 1);
        const replay = ok(await request('cart/finalize', { method: 'POST', body: { expectedRevision: revision, orderId: Number(purchased.id) } }));
        assert.equal(replay.reused, true); assert.equal(replay.revision, current.revision); assert.deepEqual(replay.payload.items, current.payload.items);
        assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM user_cart_finalizations WHERE user_id=$1 AND order_id=$2', [alice.userId, purchased.id])).rows[0].n), 1);
    });
    await gate('DB17', 'Real session revoke and relogin retain durable cart', async () => {
        const oldToken = alice.token;
        await auth.revokeCurrentSession({ sessionId: alice.sessionId, userId: alice.userId, principal: 'customer', queryable: pool });
        ok(await request('cart', { user: { ...alice, token: oldToken } }), 401);
        const next = await auth.issueAccessSession({ queryable: pool, userId: alice.userId, role: 'customer', principal: 'customer' });
        db.sensitive.add(next.token); Object.assign(alice, next);
        assert.deepEqual((await get()).payload.items, current.payload.items);
    });
    await gate('DB18', 'Older HTTP snapshot cannot write over newer persisted revision', async () => {
        const older = await get();
        current = await save([line(901, 4), line(902, 2)]);
        assert(older.revision < current.revision);
        ok(await put(older.payload.items, older.revision), 409, 'CART_REVISION_CONFLICT');
        assert.deepEqual((await get()).payload.items, current.payload.items);
        // Browser/Android stale-response rendering must also pass in their own runtime suites.
    });
    await gate('DB19', 'Legacy GET never returns lossy product-only v2 projection', async () => {
        for (const key of ['cart', 'checkout']) ok(await request(key, { capability: {} }), 426, 'CART_CLIENT_UPGRADE_REQUIRED');
    });
    await gate('DB20', 'Missing capabilities and revision do not mutate v2', async () => {
        const before = await snapshot();
        for (const omitted of Object.keys(caps)) { const capability = { ...caps }; delete capability[omitted]; ok(await request('cart', { method: 'PUT', capability, body: { expectedRevision: current.revision, payload: { cartSchemaVersion: 2, items: [] } } }), 426, 'CART_CLIENT_UPGRADE_REQUIRED'); }
        const missing = await request('cart', { method: 'PUT', body: { payload: { cartSchemaVersion: 2, items: [] } } });
        assert.notEqual(missing.status, 200); assert.deepEqual(await snapshot(), before);
    });
    await gate('DB21', 'Ambiguous legacy rows are archived and require explicit repair without guessed variant', async () => {
        const legacy = await createCustomer('b03-legacy');
        const input = { version: 1, items: [{ productId: 501, name: 'Unknown selection', price: 1, quantity: 2 }, { productId: 502, name: 'Simple', price: 1, quantity: 1 }] };
        const original = ok(await request('cart', { user: legacy, capability: {}, method: 'PUT', body: { payload: input } })).payload;
        const converted = await get(legacy);
        assert.equal(converted.migration.status, 'REVIEW_REQUIRED');
        assert(converted.migration.unresolvedItems.some((item) => item.productId === 501 && item.quantity === 2));
        assert.equal(converted.payload.items.some((item) => item.productId === 501), false);
        assert.equal(converted.payload.items.find((item) => item.productId === 502).variantId, null);
        const durable = ok(await put(converted.payload.items, converted.revision, { user: legacy }));
        assert.equal(durable.migration.status, 'REVIEW_REQUIRED');
        const archive = (await pool.query('SELECT * FROM user_shared_state_v1_archive WHERE user_id=$1 AND state_key=$2', [legacy.userId, 'cart'])).rows;
        assert.equal(archive.length, 1); assert.deepEqual(archive[0].payload, original);
        const repaired = ok(await put([...durable.payload.items, line(902, 2)], durable.revision, { user: legacy, resolveLegacyProductIds: [501] }));
        assert.equal(repaired.migration.status, 'NONE'); assert.equal(quantity(repaired, 902), 2);
        assert.equal((await pool.query('SELECT * FROM user_shared_state_v1_archive WHERE user_id=$1', [legacy.userId])).rows.length, 1);
    });
    await gate('DB22', 'Migration and simultaneous legacy write serialize safely', async () => {
        const legacy = await createCustomer('b03-migration-race');
        const initial = { payload: { version: 1, items: [{ productId: 502, name: 'Simple', price: 45, quantity: 1 }] } };
        ok(await request('cart', { user: legacy, capability: {}, method: 'PUT', body: initial }));
        const preview = await get(legacy);
        const results = await Promise.all([put(preview.payload.items, preview.revision, { user: legacy }), request('cart', { user: legacy, method: 'PUT', capability: {}, body: { payload: { ...initial.payload, items: [{ ...initial.payload.items[0], quantity: 2 }] } } })]);
        assert.deepEqual(results.map((result) => result.status).sort(), results[0].status === 200 ? [200, 426] : [200, 409]);
        const reloaded = await get(legacy);
        const final = results[0].status === 200 ? reloaded : ok(await put(reloaded.payload.items, reloaded.revision, { user: legacy }));
        assert.equal(final.payload.cartSchemaVersion, 2);
        assert.equal(final.payload.items[0].quantity, results[1].status === 200 ? 2 : 1);
        ok(await request('cart', { user: legacy, method: 'DELETE', capability: {} }), 426, 'CART_CLIENT_UPGRADE_REQUIRED');
    });
    await gate('DB23', 'V2 DELETE leaves versioned tombstone and stale resurrection fails', async () => {
        const user = await createCustomer('b03-tombstone');
        const saved = await save([line(901)], user);
        const removed = ok(await request('cart', { user, method: 'DELETE', body: { expectedRevision: saved.revision } }));
        assert.equal(removed.payload.cartSchemaVersion, 2); assert.deepEqual(removed.payload.items, []); assert.equal(removed.revision, saved.revision + 1);
        ok(await put(saved.payload.items, saved.revision, { user }), 409, 'CART_REVISION_CONFLICT');
        ok(await request('cart', { user, capability: {}, method: 'PUT', body: { payload: { items: [] } } }), 426, 'CART_CLIENT_UPGRADE_REQUIRED');
    });
    await gate('DB24', 'Foreign unpaid and legacy finalization cannot consume cart', async () => {
        const before = await snapshot();
        const unpaid = await createOrder(alice.userId, [line(901)]);
        const foreign = await createOrder(bob.userId, [line(901)], { paid: true });
        for (const order of [unpaid, foreign]) assert.notEqual((await request('cart/finalize', { method: 'POST', body: { expectedRevision: current.revision, orderId: Number(order.id) } })).status, 200);
        ok(await request('cart/finalize', { method: 'POST', capability: {}, body: { expectedRevision: current.revision, orderId: Number(purchased.id) } }), 426, 'CART_CLIENT_UPGRADE_REQUIRED');
        assert.deepEqual(await snapshot(), before);
    });
    await gate('DB25', 'Concurrent finalization delivery has one subtraction and one durable receipt', async () => {
        const user = await createCustomer('b03-finalize-race');
        const state = await save([line(901, 4), line(902)], user);
        const order = await createOrder(user.userId, [line(901, 2)], { paid: true });
        const results = await Promise.all([1, 2].map(() => request('cart/finalize', { user, method: 'POST', body: { expectedRevision: state.revision, orderId: Number(order.id) } })));
        results.forEach((result) => ok(result)); assert.equal(results.filter((result) => result.body.reused).length, 1);
        const final = await get(user); assert.equal(quantity(final, 901), 2); assert.equal(quantity(final, 902), 1); assert.equal(final.revision, state.revision + 1);
    });
    await gate('DB26', 'Simple product null identity and forged display fields remain server owned', async () => {
        const beforeForgery = await get(bob);
        const forged = await request('cart', { user: bob, method: 'PUT', body: { expectedRevision: beforeForgery.revision, payload: { cartSchemaVersion: 2, items: [{ productId: 502, variantId: null, quantity: 2, name: 'FORGED', price: 0.01, stock: 9999, imageUrl: 'https://invalid.example/spy' }] } } });
        ok(forged, 400, 'CART_LINE_INVALID');
        const result = await save([{ productId: 502, variantId: null, quantity: 2 }], bob);
        assert.equal(result.payload.items[0].variantId, null); assert.equal(result.payload.items[0].price, 45);
        assert.notEqual(result.payload.items[0].name, 'FORGED'); assert.equal(result.payload.items[0].storeId, a.storeId);
        const before = await snapshot(bob);
        assert.notEqual((await put([{ productId: 502, variantId: 901, quantity: 1 }], result.revision, { user: bob })).status, 200);
        assert.deepEqual(await snapshot(bob), before);
    });
    await gate('DB27', 'Out-of-stock saved line is visible as unavailable and canonical quote rejects it', async () => {
        await pool.query('UPDATE seller_inventory_items SET quantity=0 WHERE variant_id=902');
        const changed = ok(await put([line(901), line(902)], current.revision));
        assert.equal(changed.payload.items.find((item) => item.variantId === 902).unavailable, true);
        ok(await request('campaigns/quote', { user: null, method: 'POST', body: { cartItems: [line(902)] } }), 409, 'VARIANT_STOCK_UNAVAILABLE');
        await pool.query('UPDATE seller_inventory_items SET quantity=100 WHERE variant_id=902');
    });
    await gate('DB28', 'Database guard rejects older backend direct overwrite delete and cross-key insert', async () => {
        const user = await createCustomer('b03-old-backend');
        const state = await save([line(901), line(902)], user);
        const before = await snapshot(user);
        for (const [sql, params] of [
            ['UPDATE user_shared_state SET payload=$2::jsonb WHERE user_id=$1 AND state_key=\'cart\'', [user.userId, JSON.stringify({ version: 1, items: [] })]],
            ['UPDATE user_shared_state SET cart_schema_version=1,payload=$2::jsonb WHERE user_id=$1 AND state_key=\'cart\'', [user.userId, JSON.stringify({ version: 1, items: [] })]],
            ['DELETE FROM user_shared_state WHERE user_id=$1', [user.userId]],
            ["INSERT INTO user_shared_state(user_id,state_key,payload) VALUES($1,'checkout',$2::jsonb)", [user.userId, JSON.stringify({ version: 1, items: [] })]]
        ]) await assert.rejects(pool.query(sql, params), (error) => error.code === '23514');
        assert.deepEqual(await snapshot(user), before); assert.equal((await get(user)).revision, state.revision);
    });
    await gate('DB29', 'Duplicate quantities recompute availability after canonical merge', async () => {
        const user = await createCustomer('b03-duplicate-stock');
        await pool.query('UPDATE seller_inventory_items SET quantity=3 WHERE variant_id=902');
        const result = await save([line(902, 2), line(902, 2)], user);
        assert.equal(result.payload.items.length, 1); assert.equal(quantity(result, 902), 4);
        assert.equal(result.payload.items[0].unavailable, true); assert.equal(result.payload.items[0].stock, 3);
        await pool.query('UPDATE seller_inventory_items SET quantity=100 WHERE variant_id=902');
    });
    await gate('DB30', 'Previously saved unpublished variant remains removable without becoming purchasable', async () => {
        const user = await createCustomer('b03-unpublished');
        await save([line(901), line(902)], user);
        await pool.query("UPDATE seller_offer_variants SET publication_status='unpublished' WHERE id=901");
        const reloaded = await get(user); assert.equal(reloaded.payload.items.find((item) => item.variantId === 901).unavailable, true);
        const saved = ok(await put(reloaded.payload.items, reloaded.revision, { user }));
        assert.equal(saved.payload.items.find((item) => item.variantId === 901).unavailable, true);
        const removed = ok(await put(saved.payload.items.filter((item) => item.variantId !== 901), saved.revision, { user }));
        assert.deepEqual(identities(removed), [`${a.storeId}:501:902`]);
        await pool.query("UPDATE seller_offer_variants SET publication_status='published' WHERE id=901");
    });
    await gate('DB31', 'Unknown persisted schema is refused rather than read as v1', async () => {
        const user = await createCustomer('b03-future-row');
        // Represents previously stored/unrecognized data. No application writer
        // may normalize it, even when its old column default still says v1.
        await pool.query("INSERT INTO user_shared_state(user_id,state_key,payload) VALUES($1,'cart',$2::jsonb)", [user.userId, JSON.stringify({ version: 99, items: [] })]);
        const before = await snapshot(user);
        for (const capability of [caps, {}]) ok(await request('cart', { user, capability }), 400, 'CART_SCHEMA_UNSUPPORTED');
        assert.deepEqual(await snapshot(user), before);
    });
    await gate('DB32', 'Illegal IDs quantities and nonexistent orders do not mutate state', async () => {
        const user = await createCustomer('b03-invalid');
        const state = await save([line(901)], user);
        const before = await snapshot(user);
        for (const item of [{ ...line(901), productId: '0501' }, { ...line(901), variantId: '0901' }, line(901, 0), line(901, 1.5), line(901, 1000)]) assert.notEqual((await put([item], state.revision, { user })).status, 200);
        ok(await request('cart/finalize', { user, method: 'POST', body: { expectedRevision: state.revision, orderId: 2147483647 } }), 404, 'CART_ORDER_NOT_FOUND');
        assert.deepEqual(await snapshot(user), before);
    });
    await gate('DB33', 'Omitted store identity recovers only the saved unavailable line while sibling removal succeeds', async () => {
        const user = await createCustomer('b03-unavailable-optional-store');
        await save([line(901, 2), line(902)], user);
        await pool.query("UPDATE seller_offer_variants SET publication_status='unpublished' WHERE id=901");
        try {
            const reloaded = await get(user);
            assert.equal(reloaded.payload.items.find((item) => item.variantId === 901).unavailable, true);
            // This is the normal compact client body: optional storeId is absent.
            const retained = ok(await put([line(901)], reloaded.revision, { user }));
            assert.deepEqual(identities(retained), [`${a.storeId}:501:901`]);
            assert.equal(quantity(retained, 901), 1);
            assert.equal(retained.payload.items[0].unavailable, true);
            assert.equal(retained.payload.items[0].stock, 0);
            assert.equal(retained.revision, reloaded.revision + 1);
            assert.deepEqual((await get(user)).payload.items, retained.payload.items);
        } finally {
            await pool.query("UPDATE seller_offer_variants SET publication_status='published' WHERE id=901");
        }
    });
    await gate('DB34', 'Explicit foreign store cannot borrow a previously saved unavailable identity', async () => {
        const user = await createCustomer('b03-unavailable-foreign-store');
        await save([line(901), line(902)], user);
        await pool.query("UPDATE seller_offer_variants SET publication_status='unpublished' WHERE id=901");
        try {
            const reloaded = await get(user);
            const before = await snapshot(user);
            ok(await put([{ ...line(901), storeId: b.storeId }], reloaded.revision, { user }), 409, 'CART_STORE_IDENTITY_MISMATCH');
            assert.deepEqual(await snapshot(user), before);
            assert.deepEqual(identities(await get(user)), [`${a.storeId}:501:901`, `${a.storeId}:501:902`]);
        } finally {
            await pool.query("UPDATE seller_offer_variants SET publication_status='published' WHERE id=901");
        }
    });
    await gate('DB35', 'Canonical simple-to-variant conversion preserves unavailable identity and leaves cart repairable', async () => {
        const user = await createCustomer('b03-mode-change');
        const clearUser = await createCustomer('b03-mode-change-clear');
        const owner = await createCustomer('b03-mode-change-owner');
        const simple = { productId: 502, variantId: null, quantity: 2 };
        await save([simple, line(902)], user);
        await save([simple, line(902)], clearUser);
        const roleId = Number((await pool.query("SELECT id FROM seller_roles WHERE code='owner' AND organization_id IS NULL")).rows[0].id);
        const membershipId = Number((await pool.query('INSERT INTO seller_memberships(organization_id,user_id,role_id,security_stamp) VALUES($1,$2,$3,$4) RETURNING id', [a.organizationId, owner.userId, roleId, require('node:crypto').randomUUID()])).rows[0].id);
        await pool.query('INSERT INTO seller_membership_store_scopes(membership_id,organization_id,store_id) VALUES($1,$2,$3)', [membershipId, a.organizationId, a.sellerStoreId]);
        const context = { organizationId: a.organizationId, userId: owner.userId, membershipId, storeIds: [a.sellerStoreId] };
        const offerId = Number((await pool.query("INSERT INTO seller_offers(organization_id,store_id,product_id,status) VALUES($1,$2,502,'active') RETURNING id", [a.organizationId, a.sellerStoreId])).rows[0].id);
        const productRevision = Number((await pool.query('SELECT revision FROM products WHERE id=502')).rows[0].revision);
        const variants = require('../services/purchasableVariantService');
        const converted = await variants.mutate(pool, context, offerId, null, {
            sku: 'B03-CONVERTED-502', selections: [{ group: 'Boyut', value: 'Standart' }], price_minor: 5000,
            quantity: 8, commerce_revision: productRevision, idempotency_key: 'b03-convert-502'
        });
        await variants.mutate(pool, context, offerId, converted.variant.id, {
            publication_status: 'published', commerce_revision: converted.variant.commerce_revision, idempotency_key: 'b03-publish-converted-502'
        });
        assert.equal((await pool.query('SELECT variant_selection_required FROM products WHERE id=502')).rows[0].variant_selection_required, true);

        const reloaded = await get(user);
        const stale = reloaded.payload.items.find((item) => item.productId === 502);
        assert.equal(stale.variantId, null); assert.equal(stale.quantity, 2);
        assert.equal(stale.unavailable, true); assert.equal(stale.stock, 0);
        const beforeIncrease = await snapshot(user);
        ok(await put([{ ...simple, quantity: 3 }, line(902)], reloaded.revision, { user }), 409, 'VARIANT_REQUIRED');
        assert.deepEqual(await snapshot(user), beforeIncrease);
        const retained = ok(await put([{ ...simple, quantity: 1 }, line(902)], reloaded.revision, { user }));
        assert.equal(retained.payload.items.find((item) => item.productId === 502).variantId, null);
        assert.equal(retained.payload.items.find((item) => item.productId === 502).unavailable, true);
        const removed = ok(await put([line(902)], retained.revision, { user }));
        assert.deepEqual(identities(removed), [`${a.storeId}:501:902`]);
        assert.deepEqual((await get(user)).payload.items, removed.payload.items);

        const clearState = await get(clearUser);
        const cleared = ok(await request('cart', { user: clearUser, method: 'DELETE', body: { expectedRevision: clearState.revision } }));
        assert.equal(cleared.payload.cartSchemaVersion, 2); assert.deepEqual(cleared.payload.items, []);
        assert.equal(cleared.revision, clearState.revision + 1);
        ok(await put([simple], removed.revision, { user }), 409, 'VARIANT_REQUIRED');
    });
    await gate('DB36', 'Finalization recomputes availability for the remaining canonical quantity', async () => {
        const user = await createCustomer('b03-finalize-availability');
        try {
            await pool.query('UPDATE seller_inventory_items SET quantity=3 WHERE variant_id=901');
            await save([line(901, 3), line(902)], user);
            const order = await createOrder(user.userId, [line(901)], { paid: true });
            const before = await get(user);
            const beforeLine = before.payload.items.find((item) => item.variantId === 901);
            assert.equal(beforeLine.stock, 2); assert.equal(beforeLine.quantity, 3); assert.equal(beforeLine.unavailable, true);
            const result = ok(await request('cart/finalize', { user, method: 'POST', body: { expectedRevision: before.revision, orderId: Number(order.id) } }));
            const remaining = result.payload.items.find((item) => item.variantId === 901);
            assert.equal(remaining.quantity, 2); assert.equal(remaining.stock, 2); assert.equal(remaining.unavailable, false);
            assert.equal(quantity(result, 902), 1);
            assert.deepEqual((await get(user)).payload.items, result.payload.items);

            await save([line(901, 5), line(902)], user);
            const secondOrder = await createOrder(user.userId, [line(901)], { paid: true });
            const next = await get(user);
            const stillUnavailable = ok(await request('cart/finalize', { user, method: 'POST', body: { expectedRevision: next.revision, orderId: Number(secondOrder.id) } }));
            const leftover = stillUnavailable.payload.items.find((item) => item.variantId === 901);
            assert.equal(leftover.quantity, 4); assert.equal(leftover.stock, 1); assert.equal(leftover.unavailable, true);
            assert.equal(quantity(stillUnavailable, 902), 1);
            assert.deepEqual((await get(user)).payload.items, stillUnavailable.payload.items);
        } finally {
            await pool.query('UPDATE seller_inventory_items SET quantity=100 WHERE variant_id=901');
        }
    });
})().catch((error) => {
    (db?.originalConsole.error || console.error)(db ? db.redact(error.stack || error.message) : error.message); process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    try { if (db) cleanup = await db.cleanup(); } catch (error) { console.error(error.message); process.exitCode = 1; }
    const result = { suite: 'variantCartV2PostgresSmoke', result: process.exitCode ? 'FAIL' : 'PASS', pass: gates.filter((row) => row.status === 'PASS').length, fail: gates.filter((row) => row.status === 'FAIL').length, skip: 0, gates, cleanup, postgresVersion: db?.postgresVersion, migrationCount: db?.migrations.length,
        scope: 'Actual controller/routes/authentication, canonical pricing/order services, real disposable PostgreSQL and loopback HTTP. Only customer/session/product fixtures and an explicit local PAID order status; no provider, production, browser, Android or cross-client runtime acceptance. DB18 proves server CAS only; consumer stale-response guards require separate runtime tests.' };
    const flag = process.argv.indexOf('--evidence-dir');
    if (flag !== -1) { const output = path.resolve(process.argv[flag + 1]); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'variant-cart-v2-postgres-result.json'), JSON.stringify(result, null, 2) + '\n'); }
    console.log(JSON.stringify(result));
});
