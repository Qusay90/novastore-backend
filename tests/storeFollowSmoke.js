'use strict';

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_store_follow_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_store_follow_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.JWT_SECRET = 'store-follow-smoke-secret';

const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { inferExpectedPrincipal } = require('../middlewares/authMiddleware');
const { createStoreFollowRouter } = require('../routes/storeFollowRoutes');
const { getStoreFollowState, listFollowedStores, setStoreFollow } = require('../services/storeFollowService');

const makeDatabase = () => {
    const followers = new Set();
    const calls = [];
    return {
        calls,
        followers,
        async query(sql, params = []) {
            const source = String(sql);
            calls.push({ source, params });
            if (/FROM store_follows customer_follow[\s\S]*INNER JOIN stores platform_store/u.test(source)) {
                return {
                    rows: [
                        {
                            store_slug: 'nova-teknoloji',
                            store_name: 'Nova\u0007 Teknoloji',
                            follower_count: 12,
                            followed_at: new Date('2026-08-22T12:30:00.000Z')
                        },
                        {
                            store_slug: 'nova-ev',
                            store_name: 'Nova Ev',
                            follower_count: 4,
                            followed_at: '2026-08-21T08:00:00.000Z'
                        }
                    ]
                };
            }
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
        await listFollowedStores(7, { queryable: database }),
        [
            {
                store_slug: 'nova-teknoloji',
                store_name: 'Nova Teknoloji',
                following: true,
                follower_count: 12,
                followed_at: '2026-08-22T12:30:00.000Z'
            },
            {
                store_slug: 'nova-ev',
                store_name: 'Nova Ev',
                following: true,
                follower_count: 4,
                followed_at: '2026-08-21T08:00:00.000Z'
            }
        ]
    );
    const listCall = database.calls.find((call) => /FROM store_follows customer_follow[\s\S]*INNER JOIN stores platform_store/u.test(call.source));
    assert.deepEqual(listCall.params, [7], 'liste kimliği yalnız oturum sahibinden gelmeli');
    assert.match(listCall.source, /platform_store\.is_active = TRUE/u);
    assert.match(listCall.source, /platform_store\.deleted_at IS NULL/u);
    assert.match(listCall.source, /seller_store\.status = 'active'/u);
    assert.match(listCall.source, /seller_store\.closed_at IS NULL/u);
    assert.match(listCall.source, /COALESCE\(profile\.operational_status, 'open'\) = 'open'/u);
    assert.match(listCall.source, /ORDER BY customer_follow\.created_at DESC, platform_store\.id DESC/u);
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
    app.use(express.json());
    app.use('/api/store-follows', createStoreFollowRouter({
        authenticate(req, _res, next) {
            req.user = { id: 77, principal: 'customer' };
            next();
        },
        service: {
            async listFollowedStores(userId) {
                calls.push({ operation: 'list', userId });
                return [{
                    store_slug: 'nova-teknoloji',
                    store_name: 'Nova Teknoloji',
                    following: true,
                    follower_count: 3,
                    followed_at: '2026-08-22T12:30:00.000Z'
                }];
            },
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
        const listResponse = await fetch(`${base}/api/store-follows?userId=999`, {
            headers: { 'content-type': 'application/json' }
        });
        assert.equal(listResponse.status, 200);
        assert.equal(listResponse.headers.get('cache-control'), 'private, no-store, max-age=0');
        const listBody = await listResponse.json();
        assert.deepEqual(listBody, [{
            store_slug: 'nova-teknoloji',
            store_name: 'Nova Teknoloji',
            following: true,
            follower_count: 3,
            followed_at: '2026-08-22T12:30:00.000Z'
        }]);
        assert.deepEqual(Object.keys(listBody[0]).sort(), [
            'followed_at', 'follower_count', 'following', 'store_name', 'store_slug'
        ]);
        const bodyOverride = await new Promise((resolve, reject) => {
            const payload = JSON.stringify({ userId: 12345 });
            const target = new URL('/api/store-follows', base);
            const request = http.request(target, {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload)
                }
            }, (response) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve({
                    status: response.statusCode,
                    body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
                }));
            });
            request.on('error', reject);
            request.end(payload);
        });
        assert.equal(bodyOverride.status, 200);
        assert.deepEqual(bodyOverride.body, listBody);
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
        assert.deepEqual(calls.map((call) => call.userId), [77, 77, 77, 77, 77], 'query/body userId yerine yalnız auth bağlamı kullanılmalı');
        assert.deepEqual(calls.filter((call) => call.slug).map((call) => call.slug), ['nova-teknoloji', 'nova-teknoloji', 'nova-teknoloji']);
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
