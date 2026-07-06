const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.SKIP_SCHEMA_INIT = 'true';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = 'postgresql://novastore_test:novastore_test_only@127.0.0.1:55432/novastore_category_v2_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '55432';
process.env.DB_NAME = 'novastore_category_v2_test';
process.env.DB_USER = 'novastore_test';
process.env.DB_PASSWORD = 'novastore_test_only';
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.JWT_SECRET = 'legacy-order-create-disabled-smoke-secret';

const pool = require('../config/db');
const orderRoutes = require('../routes/orderRoutes');

const originalConnect = pool.connect;
let connectCalled = false;

pool.connect = async () => {
    connectCalled = true;
    throw new Error('legacy order create must not touch the database');
};

const postJson = (server, path, body, headers = {}) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request({
        method: 'POST',
        host: '127.0.0.1',
        port: server.address().port,
        path,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...headers
        }
    }, (response) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            resolve({
                status: response.statusCode,
                body: data ? JSON.parse(data) : null
            });
        });
    });
    request.on('error', reject);
    request.end(payload);
});

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);

const payload = {
    fullName: 'Legacy Attack',
    email: 'legacy@example.com',
    phone: '05551234567',
    address: 'Test address',
    cartItems: [{ id: 101, quantity: 1 }],
    couponCode: 'LIVE50',
    paymentMethod: 'havale'
};

(async () => {
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
        const guestResponse = await postJson(server, '/api/orders', payload);
        assert.equal(guestResponse.status, 410);
        assert.equal(guestResponse.body.code, 'LEGACY_ORDER_CREATE_DISABLED');
        assert.match(guestResponse.body.error, /payments\/initialize/);

        const customerToken = jwt.sign(
            { id: 42, role: 'customer' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const authedResponse = await postJson(server, '/api/orders', payload, {
            Authorization: `Bearer ${customerToken}`
        });
        assert.equal(authedResponse.status, 410);
        assert.equal(authedResponse.body.code, 'LEGACY_ORDER_CREATE_DISABLED');

        assert.equal(connectCalled, false, 'legacy order create must not reserve stock, increment coupons, or write payments');
        console.log('legacyOrderCreateDisabledSmoke: OK');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        pool.connect = originalConnect;
    }
})().catch((err) => {
    pool.connect = originalConnect;
    console.error(err);
    process.exitCode = 1;
});
