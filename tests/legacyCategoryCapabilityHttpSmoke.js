const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

Object.assign(process.env, {
    NODE_ENV: 'test',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    DB_HOST: '127.0.0.1',
    DB_PORT: '55432',
    DB_NAME: 'novastore_legacy_category_capability_test',
    DB_USER: 'novastore_test',
    DB_SSL: 'false',
    JWT_SECRET: 'legacy-category-capability-smoke-secret'
});

const { createAuthSessionFixture } = require('./helpers/createAuthSessionFixture');

const authFixture = createAuthSessionFixture();
authFixture.install();

const pool = require('../config/db');
const categoryController = require('../controllers/categoryController');
const originalPoolQuery = pool.query;
const originalFlag = process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED;
const originalHandlers = {
    getCategories: categoryController.getCategories,
    createCategory: categoryController.createCategory,
    deleteCategory: categoryController.deleteCategory
};

const calls = {
    currentAdmin: 0,
    get: 0,
    create: 0,
    delete: 0
};

pool.query = async (sql, params = []) => {
    if (/SELECT id, role, auth_enabled FROM users WHERE id = \$1/i.test(String(sql))) {
        calls.currentAdmin += 1;
        if (Number(params[0]) === 17) {
            return { rows: [{ id: 17, role: 'admin', auth_enabled: true }] };
        }
        return { rows: [] };
    }
    throw new Error(`Unexpected legacy category capability query: ${String(sql)}`);
};

categoryController.getCategories = (_req, res) => {
    calls.get += 1;
    return res.status(200).json({ categories: [] });
};
categoryController.createCategory = (_req, res) => {
    calls.create += 1;
    return res.status(201).json({ created: true });
};
categoryController.deleteCategory = (_req, res) => {
    calls.delete += 1;
    return res.status(200).json({ archived: true });
};

delete require.cache[require.resolve('../routes/categoryRoutes')];
const categoryRoutes = require('../routes/categoryRoutes');

const request = (server, method, path, { token, body } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        method,
        path,
        headers
    }, (response) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => resolve({
            status: response.statusCode,
            body: data ? JSON.parse(data) : null
        }));
    });
    req.on('error', reject);
    req.end(payload);
});

(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/categories', categoryRoutes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const adminToken = authFixture.issue({ userId: 17, role: 'admin', principal: 'admin' }).token;
    const staleAdminToken = authFixture.issue({ userId: 19, role: 'admin', principal: 'admin' }).token;
    const customerToken = authFixture.issue({ userId: 18, role: 'customer', principal: 'customer' }).token;
    const sellerToken = authFixture.issue({ userId: 20, role: 'seller', principal: 'customer' }).token;

    try {
        delete process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED;

        const publicRead = await request(server, 'GET', '/api/categories');
        assert.equal(publicRead.status, 200);
        assert.equal(calls.get, 1, 'public category GET must remain available');

        const disabledPost = await request(server, 'POST', '/api/categories', {
            token: adminToken,
            body: { name: 'Kapalı kategori' }
        });
        const disabledDelete = await request(server, 'DELETE', '/api/categories/5', {
            token: adminToken
        });
        for (const denied of [disabledPost, disabledDelete]) {
            assert.equal(denied.status, 503);
            assert.equal(denied.body.code, 'ADMIN_CATALOG_STRUCTURE_WRITE_DISABLED');
        }
        assert.equal(calls.currentAdmin, 2, 'capability current Admin doğrulamasından sonra çalışmalı');
        assert.equal(calls.create, 0);
        assert.equal(calls.delete, 0);

        process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED = 'true';
        const customerDenied = await request(server, 'POST', '/api/categories', {
            token: customerToken,
            body: { name: 'Müşteri kategorisi' }
        });
        const sellerDenied = await request(server, 'POST', '/api/categories', {
            token: sellerToken,
            body: { name: 'Seller kategorisi' }
        });
        assert.equal(customerDenied.status, 401);
        assert.equal(sellerDenied.status, 401);
        assert.equal(calls.create, 0);

        const staleDenied = await request(server, 'POST', '/api/categories', {
            token: staleAdminToken,
            body: { name: 'Stale Admin kategorisi' }
        });
        assert.equal(staleDenied.status, 401);
        assert.equal(calls.create, 0);

        const allowedPost = await request(server, 'POST', '/api/categories', {
            token: adminToken,
            body: { name: 'İzinli kategori' }
        });
        const allowedDelete = await request(server, 'DELETE', '/api/categories/5', {
            token: adminToken
        });
        assert.equal(allowedPost.status, 201);
        assert.equal(allowedDelete.status, 200);
        assert.equal(calls.create, 1);
        assert.equal(calls.delete, 1);

        console.log('legacyCategoryCapabilityHttpSmoke: PASS');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        pool.query = originalPoolQuery;
        Object.assign(categoryController, originalHandlers);
        authFixture.restore();
        if (originalFlag === undefined) {
            delete process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED;
        } else {
            process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED = originalFlag;
        }
        await pool.end().catch(() => {});
    }
})().catch((error) => {
    pool.query = originalPoolQuery;
    Object.assign(categoryController, originalHandlers);
    authFixture.restore();
    if (originalFlag === undefined) {
        delete process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED;
    } else {
        process.env.NOVASTORE_ADMIN_CATALOG_STRUCTURE_WRITE_ENABLED = originalFlag;
    }
    console.error(error);
    process.exitCode = 1;
});
