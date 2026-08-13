const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: 'coupon-admin-operations-smoke-secret',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_coupon_test',
    DB_SSL: 'false',
    SUPABASE_USE_POOLER: 'false'
});

const { createAuthSessionFixture } = require('./helpers/createAuthSessionFixture');

const {
    CouponAdminError,
    normalizeCreateCouponPayload,
    normalizeUpdateCouponPayload,
    resolveCouponOperationalStatus
} = require('../services/couponAdminPolicy');
const { calculatePricing } = require('../services/pricingService');
const pool = require('../config/db');

assert.throws(
    () => normalizeCreateCouponPayload({ code: 'BAD!', discount_type: 'FIXED', discount_value: 10 }),
    (error) => error instanceof CouponAdminError && error.code === 'COUPON_CODE_INVALID'
);
assert.throws(
    () => normalizeCreateCouponPayload({ code: 'OVER100', discount_type: 'PERCENT', discount_value: 100.01 }),
    (error) => error instanceof CouponAdminError && error.code === 'COUPON_DISCOUNT_VALUE_INVALID'
);
assert.throws(
    () => normalizeCreateCouponPayload({
        code: 'BADDATE',
        discount_type: 'FIXED',
        discount_value: 10,
        starts_at: '2026-02-30T00:00:00Z'
    }),
    (error) => error instanceof CouponAdminError && error.code === 'COUPON_DATE_INVALID'
);
assert.throws(
    () => normalizeCreateCouponPayload({
        code: 'DATES10',
        discount_type: 'FIXED',
        discount_value: 10,
        starts_at: '2026-09-02T10:00:00Z',
        ends_at: '2026-09-01T10:00:00Z'
    }),
    (error) => error instanceof CouponAdminError && error.code === 'COUPON_DATE_RANGE_INVALID'
);
assert.deepEqual(
    normalizeUpdateCouponPayload({
        expected_revision: 4,
        max_discount_amount: null,
        usage_limit: null,
        starts_at: null,
        ends_at: null
    }).changes,
    { max_discount_amount: null, usage_limit: null, starts_at: null, ends_at: null }
);
assert.equal(resolveCouponOperationalStatus({ is_active: false }), 'disabled');
assert.equal(resolveCouponOperationalStatus({
    is_active: true,
    starts_at: '2030-01-01T00:00:00Z'
}, new Date('2029-01-01T00:00:00Z')), 'scheduled');
assert.equal(resolveCouponOperationalStatus({
    is_active: true,
    ends_at: '2028-01-01T00:00:00Z'
}, new Date('2029-01-01T00:00:00Z')), 'expired');
assert.equal(resolveCouponOperationalStatus({
    is_active: true,
    usage_limit: 2,
    used_count: 2
}, new Date('2029-01-01T00:00:00Z')), 'exhausted');

const migrationSource = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '20260813_03_coupon_operations.sql'),
    'utf8'
);
assert.match(migrationSource, /^BEGIN;/);
assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1/);
assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS admin_coupon_audit_events/);
assert.match(migrationSource, /coupon_id INTEGER NOT NULL REFERENCES coupons\(id\) ON DELETE RESTRICT/);
assert.match(migrationSource, /trg_admin_coupon_audit_append_only/);
assert.match(migrationSource, /trg_coupons_reject_hard_delete/);
assert.match(migrationSource, /CHECK \(starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at\)/);
assert.match(migrationSource, /COMMIT;\s*$/);

const authFixture = createAuthSessionFixture();
authFixture.install();

const originalQuery = pool.query;
const originalConnect = pool.connect;
const originalFlag = process.env.NOVASTORE_ADMIN_COUPON_WRITE_ENABLED;
const fixedNow = '2026-08-13T12:00:00.000Z';
const state = {
    coupons: new Map(),
    audits: [],
    nextCouponId: 1,
    nextAuditId: 1,
    currentAdminQueries: 0,
    transactionConnects: 0,
    transactions: [],
    currentAdminRole: 'admin',
    currentAdminEnabled: true
};

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

pool.query = async (sql, params = []) => {
    const text = String(sql).trim();
    if (/SELECT id, role, auth_enabled FROM users WHERE id = \$1/i.test(text)) {
        state.currentAdminQueries += 1;
        return {
            rows: [{ id: Number(params[0]), role: state.currentAdminRole, auth_enabled: state.currentAdminEnabled }]
        };
    }
    if (/FROM coupons/i.test(text) && /ORDER BY created_at DESC, id DESC/i.test(text)) {
        return { rows: [...state.coupons.values()].sort((a, b) => b.id - a.id).map(clone) };
    }
    if (/FROM coupons/i.test(text) && /WHERE is_active = TRUE/i.test(text)) {
        const rows = [...state.coupons.values()].filter((coupon) => (
            coupon.is_active === true
            && (coupon.usage_limit === null || coupon.used_count < coupon.usage_limit)
        ));
        return { rows: rows.map(({ revision, used_count, usage_limit, ...record }) => clone(record)) };
    }
    throw new Error(`Unexpected coupon pool query: ${text}`);
};

const createClient = () => ({
    async query(sql, params = []) {
        const text = String(sql).trim();
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) {
            state.transactions.push(text);
            return { rows: [] };
        }
        if (/^INSERT INTO coupons/i.test(text)) {
            if ([...state.coupons.values()].some((coupon) => coupon.code === params[0])) {
                const duplicate = new Error('duplicate coupon code');
                duplicate.code = '23505';
                duplicate.constraint = 'coupons_code_key';
                throw duplicate;
            }
            const id = state.nextCouponId++;
            const coupon = {
                id,
                code: params[0],
                discount_type: params[1],
                discount_value: params[2],
                min_order_amount: params[3],
                max_discount_amount: params[4],
                usage_limit: params[5],
                used_count: 0,
                starts_at: params[6],
                ends_at: params[7],
                is_active: params[8],
                revision: 1,
                created_at: fixedNow,
                updated_at: fixedNow
            };
            state.coupons.set(id, coupon);
            return { rows: [clone(coupon)], rowCount: 1 };
        }
        if (/FROM coupons/i.test(text) && /FOR UPDATE/i.test(text)) {
            const coupon = state.coupons.get(Number(params[0]));
            return { rows: coupon ? [clone(coupon)] : [] };
        }
        if (/^UPDATE coupons/i.test(text) && /revision = revision \+ 1/i.test(text)) {
            const couponId = Number(params.at(-2));
            const expectedRevision = Number(params.at(-1));
            const coupon = state.coupons.get(couponId);
            if (!coupon || coupon.revision !== expectedRevision) return { rows: [], rowCount: 0 };
            const assignmentMatch = text.match(/SET ([\s\S]*?),\s*revision = revision \+ 1/i);
            assert(assignmentMatch);
            const fields = [...assignmentMatch[1].matchAll(/([a-z_]+) = \$(\d+)/g)];
            for (const [, field, index] of fields) coupon[field] = params[Number(index) - 1];
            coupon.revision += 1;
            coupon.updated_at = fixedNow;
            return { rows: [clone(coupon)], rowCount: 1 };
        }
        if (/^INSERT INTO admin_coupon_audit_events/i.test(text)) {
            const audit = {
                id: state.nextAuditId++,
                actorId: params[0],
                actorRole: params[1],
                couponId: params[2],
                action: params[3],
                expectedRevision: params[4],
                resultRevision: params[5],
                changedFields: params[6],
                requestId: params[7],
                metadata: JSON.parse(params[8]),
                created_at: fixedNow
            };
            state.audits.push(audit);
            return { rows: [{ id: audit.id, created_at: audit.created_at }], rowCount: 1 };
        }
        throw new Error(`Unexpected coupon transaction query: ${text}`);
    },
    release() {}
});

pool.connect = async () => {
    state.transactionConnects += 1;
    return createClient();
};

const campaignRoutes = require('../routes/campaignRoutes');

const request = (server, method, pathname, { body, token, contentType = 'application/json', requestId } = {}) =>
    new Promise((resolve, reject) => {
        const payload = body === undefined
            ? ''
            : (contentType === 'application/json' ? JSON.stringify(body) : String(body));
        const headers = {};
        if (contentType) headers['Content-Type'] = contentType;
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        if (token) headers.Authorization = `Bearer ${token}`;
        if (requestId) headers['X-Request-ID'] = requestId;
        const req = http.request({
            method,
            host: '127.0.0.1',
            port: server.address().port,
            path: pathname,
            headers
        }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve({
                    status: response.statusCode,
                    headers: response.headers,
                    body: text ? JSON.parse(text) : null
                });
            });
        });
        req.on('error', reject);
        req.end(payload);
    });

(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/campaigns', campaignRoutes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const adminToken = authFixture.issue({ userId: 17, role: 'admin', principal: 'admin' }).token;
    const customerToken = authFixture.issue({ userId: 18, role: 'customer', principal: 'customer' }).token;
    const validCreate = {
        code: 'LAUNCH10',
        discount_type: 'FIXED',
        discount_value: 10,
        min_order_amount: 50,
        max_discount_amount: 25,
        usage_limit: 5,
        starts_at: '2026-08-01T00:00:00Z',
        ends_at: '2030-08-31T23:59:59Z'
    };

    try {
        delete process.env.NOVASTORE_ADMIN_COUPON_WRITE_ENABLED;
        const beforeDisabledAdminReads = state.currentAdminQueries;
        const beforeDisabledConnects = state.transactionConnects;
        const disabled = await request(server, 'POST', '/api/campaigns/coupons', {
            token: adminToken,
            body: validCreate
        });
        assert.equal(disabled.status, 503);
        assert.equal(disabled.body.code, 'ADMIN_COMMERCE_CAPABILITY_DISABLED');
        assert.equal(state.currentAdminQueries, beforeDisabledAdminReads);
        assert.equal(state.transactionConnects, beforeDisabledConnects);
        assert.equal(disabled.headers['cache-control'], 'private, no-store, max-age=0');

        const anonymous = await request(server, 'GET', '/api/campaigns/coupons', { contentType: null });
        assert.equal(anonymous.status, 401);
        const customerAdminRead = await request(server, 'GET', '/api/campaigns/coupons', {
            token: customerToken,
            contentType: null
        });
        assert.equal(customerAdminRead.status, 401);

        const emptyList = await request(server, 'GET', '/api/campaigns/coupons', {
            token: adminToken,
            contentType: null
        });
        assert.equal(emptyList.status, 200);
        assert.deepEqual(emptyList.body, { items: [] });

        state.currentAdminRole = 'customer';
        const demoted = await request(server, 'GET', '/api/campaigns/coupons', {
            token: adminToken,
            contentType: null
        });
        assert.equal(demoted.status, 403);
        state.currentAdminRole = 'admin';

        process.env.NOVASTORE_ADMIN_COUPON_WRITE_ENABLED = 'true';
        const wrongType = await request(server, 'POST', '/api/campaigns/coupons', {
            token: adminToken,
            body: 'code=LAUNCH10',
            contentType: 'application/x-www-form-urlencoded'
        });
        assert.equal(wrongType.status, 415);
        assert.equal(wrongType.body.code, 'COUPON_JSON_REQUIRED');

        const connectsBeforeInvalid = state.transactionConnects;
        const invalid = await request(server, 'POST', '/api/campaigns/coupons', {
            token: adminToken,
            body: { ...validCreate, browser_price: 0.01 }
        });
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.code, 'COUPON_FIELD_NOT_ALLOWED');
        assert.equal(state.transactionConnects, connectsBeforeInvalid);

        const created = await request(server, 'POST', '/api/campaigns/coupons', {
            token: adminToken,
            body: validCreate,
            requestId: 'coupon-create-launch10'
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.coupon.code, 'LAUNCH10');
        assert.equal(created.body.coupon.is_active, false, 'new coupons default fail-closed');
        assert.equal(created.body.coupon.operational_status, 'disabled');
        assert.equal(created.body.coupon.revision, 1);
        assert.equal(created.body.audit.id, 1);
        assert.equal(state.audits[0].action, 'create');
        assert.equal(state.audits[0].requestId, 'coupon-create-launch10');
        assert.deepEqual(state.audits[0].metadata, { source: 'admin-coupon-operations' });

        const duplicate = await request(server, 'POST', '/api/campaigns/coupons', {
            token: adminToken,
            body: validCreate
        });
        assert.equal(duplicate.status, 409);
        assert.equal(duplicate.body.code, 'COUPON_CODE_CONFLICT');

        const missingPreconditionConnects = state.transactionConnects;
        const missingPrecondition = await request(server, 'PUT', '/api/campaigns/coupons/1', {
            token: adminToken,
            body: { discount_value: 12 }
        });
        assert.equal(missingPrecondition.status, 428);
        assert.equal(missingPrecondition.body.code, 'COUPON_PRECONDITION_REQUIRED');
        assert.equal(state.transactionConnects, missingPreconditionConnects);

        const cleared = await request(server, 'PUT', '/api/campaigns/coupons/1', {
            token: adminToken,
            body: {
                expected_revision: 1,
                max_discount_amount: null,
                usage_limit: null,
                starts_at: null,
                ends_at: null
            },
            requestId: 'coupon-clear-launch10'
        });
        assert.equal(cleared.status, 200);
        assert.equal(cleared.body.coupon.revision, 2);
        assert.equal(cleared.body.coupon.max_discount_amount, null);
        assert.equal(cleared.body.coupon.usage_limit, null);
        assert.equal(cleared.body.coupon.starts_at, null);
        assert.equal(cleared.body.coupon.ends_at, null);
        assert.equal(state.audits[1].action, 'update');

        const stale = await request(server, 'PUT', '/api/campaigns/coupons/1', {
            token: adminToken,
            body: { expected_revision: 1, discount_value: 11 }
        });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.code, 'COUPON_REVISION_CONFLICT');
        assert.equal(stale.body.details.refetchRequired, true);

        const activated = await request(server, 'PATCH', '/api/campaigns/coupons/1/status', {
            token: adminToken,
            body: { expected_revision: 2, is_active: true },
            requestId: 'coupon-activate-launch10'
        });
        assert.equal(activated.status, 200);
        assert.equal(activated.body.coupon.revision, 3);
        assert.equal(activated.body.coupon.is_active, true);
        assert.equal(activated.body.coupon.operational_status, 'active');
        assert.equal(state.audits[2].action, 'activate');

        const activeForCustomer = await request(server, 'GET', '/api/campaigns/coupons/active', {
            token: customerToken,
            contentType: null
        });
        assert.equal(activeForCustomer.status, 200);
        assert.equal(activeForCustomer.body.length, 1);
        assert.equal(activeForCustomer.body[0].code, 'LAUNCH10');

        const priced = await calculatePricing({
            cartItems: [{ id: 101, quantity: 1 }],
            couponCode: 'launch10',
            client: {
                async query(sql, params) {
                    if (/FROM products/i.test(sql)) {
                        assert.deepEqual(params, [[101]]);
                        return { rows: [{ id: 101, name: 'Test ürün', price: 100, old_price: null, stock: 3, image_url: null }] };
                    }
                    if (/FROM coupons/i.test(sql)) return { rows: [clone(state.coupons.get(1))] };
                    throw new Error(`Unexpected pricing query: ${sql}`);
                }
            }
        });
        assert.equal(priced.coupon.applied, true);
        assert.equal(priced.coupon.discountAmount, 10);
        assert.equal(priced.totals.couponDiscount, 10);

        const beforeDeleteConnects = state.transactionConnects;
        const hardDelete = await request(server, 'DELETE', '/api/campaigns/coupons/1', {
            token: adminToken,
            contentType: null
        });
        assert.equal(hardDelete.status, 405);
        assert.equal(hardDelete.body.code, 'COUPON_HARD_DELETE_DISABLED');
        assert.equal(state.transactionConnects, beforeDeleteConnects);
        assert.equal(state.coupons.has(1), true);

        assert.deepEqual(state.audits.map((audit) => audit.action), ['create', 'update', 'activate']);
        assert.equal(state.audits.every((audit) => audit.actorId === 17 && audit.actorRole === 'admin'), true);
        assert.equal(state.transactions.includes('ROLLBACK'), true);
        console.log('coupon admin operations smoke passed: auth=PASS revision=PASS audit=PASS pricing=PASS hard-delete=BLOCKED');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        pool.query = originalQuery;
        pool.connect = originalConnect;
        if (originalFlag === undefined) delete process.env.NOVASTORE_ADMIN_COUPON_WRITE_ENABLED;
        else process.env.NOVASTORE_ADMIN_COUPON_WRITE_ENABLED = originalFlag;
        authFixture.restore();
    }
})().catch((error) => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    if (originalFlag === undefined) delete process.env.NOVASTORE_ADMIN_COUPON_WRITE_ENABLED;
    else process.env.NOVASTORE_ADMIN_COUPON_WRITE_ENABLED = originalFlag;
    authFixture.restore();
    console.error(error);
    process.exitCode = 1;
});
