const assert = require('node:assert/strict');
const http = require('node:http');

Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: 'legacy-product-write-retirement-smoke-secret',
    NOVASTORE_SAFE_LOCAL_BACKEND: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'false',
    SKIP_SCHEMA_INIT: 'true',
    NOVASTORE_ALLOW_SCHEMA_INIT: 'false',
    DATABASE_URL: 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_legacy_product_retirement',
    DB_SSL: 'false'
});

const express = require('express');
const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');
const { createAuthSessionFixture } = require('./helpers/createAuthSessionFixture');

const authFixture = createAuthSessionFixture();
authFixture.install();
const adminToken = authFixture.issue({ userId: 17, role: 'admin', principal: 'admin' }).token;
const customerToken = authFixture.issue({ userId: 9, role: 'customer', principal: 'customer' }).token;

let providerCalls = 0;
const originalProviderMethods = {
    uploadStream: cloudinary.uploader.upload_stream,
    explicit: cloudinary.uploader.explicit,
    destroy: cloudinary.uploader.destroy
};
cloudinary.uploader.upload_stream = () => { providerCalls += 1; throw new Error('provider must not run'); };
cloudinary.uploader.explicit = () => { providerCalls += 1; throw new Error('provider must not run'); };
cloudinary.uploader.destroy = () => { providerCalls += 1; throw new Error('provider must not run'); };

const originalPoolQuery = pool.query;
let currentAdminQueries = 0;
pool.query = async (sql, params) => {
    currentAdminQueries += 1;
    assert.match(String(sql), /SELECT id, role, auth_enabled FROM users WHERE id = \$1/);
    assert.deepEqual(params, [17]);
    return { rows: [{ id: 17, role: 'admin', auth_enabled: true }] };
};

const productRoutes = require('../routes/productRoutes');
const app = express();
app.use('/api/products', productRoutes);

const request = ({ server, method, path, token }) => new Promise((resolve, reject) => {
    const req = http.request({
        host: '127.0.0.1',
        port: server.address().port,
        method,
        path,
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : null
        }));
    });
    req.on('error', reject);
    req.end();
});

(async () => {
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        const unauthorized = await request({ server, method: 'POST', path: '/api/products' });
        assert.equal(unauthorized.status, 401);
        const wrongPrincipal = await request({
            server,
            method: 'POST',
            path: '/api/products',
            token: customerToken
        });
        assert.equal(wrongPrincipal.status, 401);

        const retiredRoutes = [
            ['POST', '/api/products'],
            ['PUT', '/api/products/73'],
            ['DELETE', '/api/products/73'],
            ['POST', '/api/products/media-preview/remove-background'],
            ['POST', '/api/products/media-preview/cleanup'],
            ['POST', '/api/products/media/11/remove-background-preview'],
            ['POST', '/api/products/media/11/remove-background-apply'],
            ['DELETE', '/api/products/media/11']
        ];
        for (const [method, path] of retiredRoutes) {
            const response = await request({ server, method, path, token: adminToken });
            assert.equal(response.status, 410, `${method} ${path}`);
            assert.equal(response.body.code, 'LEGACY_ADMIN_PRODUCT_WRITE_RETIRED');
        }
        assert.equal(currentAdminQueries, retiredRoutes.length);
        assert.equal(providerCalls, 0);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }

    console.log('legacy Admin product write retirement smoke passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(() => {
    authFixture.restore();
    pool.query = originalPoolQuery;
    cloudinary.uploader.upload_stream = originalProviderMethods.uploadStream;
    cloudinary.uploader.explicit = originalProviderMethods.explicit;
    cloudinary.uploader.destroy = originalProviderMethods.destroy;
});
