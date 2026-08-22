'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { inferExpectedPrincipal } = require('../middlewares/authMiddleware');
const { createStoreFollowRouter } = require('../routes/storeFollowRoutes');
const { getStoreFollowState, setStoreFollow } = require('../services/storeFollowService');

const makeDatabase = () => {
    const followers = new Set();
    const calls = [];
    return {
        calls,
        followers,
        async query(sql, params = []) {
            const source = String(sql);
            calls.push({ source, params });
            if (/FROM stores platform_store/u.test(source)) {
                return {
                    rows: [{
                        platform_store_id: 41,
                        slug: 'nova-teknoloji',
                        display_name: 'Nova Teknoloji',
                        description: '',
                        shipping_policy: '',
                        return_policy: ''
                    }]
                };
            }
            if (/INSERT INTO store_follows/u.test(source)) {
                followers.add(`${params[0]}:${params[1]}`);
                return { rows: [] };
            }
            if (/DELETE FROM store_follows/u.test(source)) {
                followers.delete(`${params[0]}:${params[1]}`);
                return { rows: [] };
            }
            if (/EXISTS \(/u.test(source) && /follower_count/u.test(source)) {
                return {
                    rows: [{
                        following: followers.has(`${params[0]}:${params[1]}`),
                        follower_count: [...followers].filter((value) => value.endsWith(`:${params[1]}`)).length
                    }]
                };
            }
            throw new Error(`UNEXPECTED_SQL: ${source}`);
        }
    };
};

const runServiceMatrix = async () => {
    const database = makeDatabase();
    assert.deepEqual(
        await getStoreFollowState('nova-teknoloji', 7, { queryable: database }),
        { store_slug: 'nova-teknoloji', following: false, follower_count: 0 }
    );
    assert.deepEqual(
        await setStoreFollow('nova-teknoloji', 7, true, { queryable: database }),
        { store_slug: 'nova-teknoloji', following: true, follower_count: 1 }
    );
    assert.deepEqual(
        await setStoreFollow('nova-teknoloji', 7, true, { queryable: database }),
        { store_slug: 'nova-teknoloji', following: true, follower_count: 1 },
        'follow işlemi idempotent olmalı'
    );
    assert.deepEqual(
        await setStoreFollow('nova-teknoloji', 7, false, { queryable: database }),
        { store_slug: 'nova-teknoloji', following: false, follower_count: 0 }
    );
    assert.equal(database.calls.every((call) => !call.source.includes('seller_organizations')), true);
    assert.equal(database.calls.some((call) => call.params.includes(41)), true, 'mağaza kimliği yalnız server çözümünden gelmeli');
    await assert.rejects(() => getStoreFollowState('../admin', 7, { queryable: database }), /STORE_NOT_FOUND/u);
    await assert.rejects(() => getStoreFollowState('nova-teknoloji', 0, { queryable: database }), /RESOURCE_NOT_FOUND/u);
};

const runHttpMatrix = async () => {
    const calls = [];
    const app = express();
    app.use('/api/store-follows', createStoreFollowRouter({
        authenticate(req, _res, next) {
            req.user = { id: 77, principal: 'customer' };
            next();
        },
        service: {
            async getStoreFollowState(slug, userId) {
                calls.push({ operation: 'get', slug, userId });
                return { store_slug: slug, following: false, follower_count: 3 };
            },
            async setStoreFollow(slug, userId, shouldFollow) {
                calls.push({ operation: 'set', slug, userId, shouldFollow });
                return { store_slug: slug, following: shouldFollow, follower_count: shouldFollow ? 4 : 3 };
            }
        }
    }));
    const server = await new Promise((resolve) => {
        const started = app.listen(0, '127.0.0.1', () => resolve(started));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        for (const [method, following, followerCount] of [
            ['GET', false, 3],
            ['POST', true, 4],
            ['DELETE', false, 3]
        ]) {
            const response = await fetch(`${base}/api/store-follows/nova-teknoloji`, { method });
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.following, following);
            assert.equal(body.follower_count, followerCount);
        }
        assert.deepEqual(calls.map((call) => call.userId), [77, 77, 77], 'müşteri kimliği yalnız auth bağlamından gelmeli');
        assert.deepEqual(calls.map((call) => call.slug), ['nova-teknoloji', 'nova-teknoloji', 'nova-teknoloji']);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
};

(async () => {
    const req = { originalUrl: '/api/store-follows/nova-teknoloji', method: 'POST' };
    assert.equal(inferExpectedPrincipal(req), 'customer');
    await runServiceMatrix();
    await runHttpMatrix();
    console.log('storeFollowSmoke PASS');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
