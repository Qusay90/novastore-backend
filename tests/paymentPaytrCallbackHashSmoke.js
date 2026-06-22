const assert = require('assert');
const express = require('express');
const http = require('http');
const paymentRoutes = require('../routes/paymentRoutes');
const pool = require('../config/db');
const { buildPaytrCallbackHash } = require('../services/paytrPaymentService');

const trackedEnv = [
    'NODE_ENV',
    'PAYMENT_PROVIDER',
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
    'PAYTR_BASE_URL',
    'PAYTR_CALLBACK_URL',
    'PAYTR_SUCCESS_URL',
    'PAYTR_FAIL_URL',
    'PAYTR_TEST_MODE',
    'PAYTR_DEBUG_ON'
];

const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;

const restoreState = () => {
    for (const key of trackedEnv) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
    pool.connect = originalPoolConnect;
    pool.query = originalPoolQuery;
};

const applyPaytrEnv = () => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_PROVIDER = 'paytr';
    process.env.PAYTR_MERCHANT_ID = 'merchant-id';
    process.env.PAYTR_MERCHANT_KEY = 'merchant-key-secret';
    process.env.PAYTR_MERCHANT_SALT = 'merchant-salt-secret';
    process.env.PAYTR_BASE_URL = 'https://www.paytr.com';
    process.env.PAYTR_CALLBACK_URL = 'https://example.test/api/payments/webhook/paytr';
    process.env.PAYTR_SUCCESS_URL = 'https://example.test/payment-result.html';
    process.env.PAYTR_FAIL_URL = 'https://example.test/payment-result.html';
    process.env.PAYTR_TEST_MODE = 'true';
    process.env.PAYTR_DEBUG_ON = 'true';
};

const buildValidPayload = () => {
    const payload = {
        merchant_oid: 'NST-PAYTR-7001-abcdef1234567890',
        status: 'pending_review',
        total_amount: '104990',
        failed_reason_code: '',
        failed_reason_msg: ''
    };
    return {
        ...payload,
        hash: buildPaytrCallbackHash({
            merchantOid: payload.merchant_oid,
            status: payload.status,
            totalAmount: payload.total_amount,
            merchantKey: process.env.PAYTR_MERCHANT_KEY,
            merchantSalt: process.env.PAYTR_MERCHANT_SALT
        })
    };
};

const createAppServer = () => new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api/payments', paymentRoutes);
    const server = app.listen(0, () => resolve(server));
});

const postForm = (server, path, payload) => new Promise((resolve, reject) => {
    const body = new URLSearchParams(payload).toString();
    const { port } = server.address();
    const req = http.request({
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed = null;
            try {
                parsed = JSON.parse(text);
            } catch (_) {}
            resolve({ statusCode: res.statusCode, text, body: parsed });
        });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
});

(async () => {
    let server = null;
    try {
        applyPaytrEnv();
        pool.connect = async () => {
            throw new Error('PayTR callback hash smoke must not open a DB transaction.');
        };
        pool.query = async () => {
            throw new Error('PayTR callback hash smoke must not query the DB.');
        };

        const paytrRoute = paymentRoutes.stack.find((layer) => layer.route && layer.route.path === '/webhook/paytr');
        assert.ok(paytrRoute, 'PayTR webhook route should be registered');
        const handlerNames = paytrRoute.route.stack.map((layer) => layer.handle.name);
        assert.ok(handlerNames.includes('urlencodedParser'));
        assert.ok(handlerNames.includes('webhookPaytr'));
        assert.strictEqual(handlerNames.includes('authenticate'), false);

        server = await createAppServer();

        const validResponse = await postForm(server, '/api/payments/webhook/paytr', buildValidPayload());
        assert.strictEqual(validResponse.statusCode, 202);
        assert.strictEqual(validResponse.body.ok, true);
        assert.strictEqual(validResponse.body.provider, 'paytr');
        assert.strictEqual(validResponse.body.finalizationImplemented, false);
        assert.strictEqual(validResponse.text.includes('OK'), false);
        assert.strictEqual(validResponse.text.includes(process.env.PAYTR_MERCHANT_KEY), false);
        assert.strictEqual(validResponse.text.includes(process.env.PAYTR_MERCHANT_SALT), false);
        assert.strictEqual(validResponse.text.includes('merchant-key-secret'), false);
        assert.strictEqual(validResponse.text.includes('merchant-salt-secret'), false);

        const invalidHashResponse = await postForm(server, '/api/payments/webhook/paytr', {
            ...buildValidPayload(),
            hash: 'invalid-hash'
        });
        assert.strictEqual(invalidHashResponse.statusCode, 401);
        assert.strictEqual(invalidHashResponse.text.includes('merchant-key-secret'), false);
        assert.strictEqual(invalidHashResponse.text.includes('merchant-salt-secret'), false);

        const missingHashPayload = buildValidPayload();
        delete missingHashPayload.hash;
        const missingHashResponse = await postForm(server, '/api/payments/webhook/paytr', missingHashPayload);
        assert.strictEqual(missingHashResponse.statusCode, 400);
        assert.strictEqual(missingHashResponse.text.includes('merchant-key-secret'), false);
        assert.strictEqual(missingHashResponse.text.includes('merchant-salt-secret'), false);

        delete process.env.PAYTR_MERCHANT_KEY;
        const missingEnvResponse = await postForm(server, '/api/payments/webhook/paytr', buildValidPayload());
        assert.strictEqual(missingEnvResponse.statusCode, 503);
        assert.ok(missingEnvResponse.body.details.includes('PAYTR_MERCHANT_KEY'));
        assert.strictEqual(missingEnvResponse.text.includes('merchant-salt-secret'), false);

        console.log('payment PayTR callback hash smoke passed');
    } finally {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        restoreState();
    }
})().catch((err) => {
    restoreState();
    console.error(err);
    process.exit(1);
});
