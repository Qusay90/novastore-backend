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
process.env.JWT_SECRET = 'manual-shipment-route-smoke-secret';

const pool = require('../config/db');
const { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS, SHIPMENT_STATUS } = require('../constants/orderStatus');
const shipmentRoutes = require('../routes/shipmentRoutes');

const originalPoolConnect = pool.connect;
const originalPoolQuery = pool.query;
const originalFlag = process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;

const state = {
    order: {
        id: 7201,
        user_id: null,
        status: ORDER_STATUS.HAZIRLANIYOR,
        payment_status: PAYMENT_STATUS.PAID,
        payment_ref: 'PAY-7201',
        refund_status: REFUND_STATUS.NONE,
        shipment_status: SHIPMENT_STATUS.NONE,
        shipment_provider: null,
        tracking_no: null
    },
    payment: {
        id: 5201,
        provider: 'paytr',
        payment_ref: 'PAY-7201',
        status: PAYMENT_STATUS.PAID,
        raw_request: JSON.stringify({ stockReserved: true, finalizesOnWebhook: true }),
        raw_response: '{}'
    },
    shipment: null,
    calls: [],
    currentAdminQueries: 0,
    transactionConnects: 0,
    writes: 0
};

const createClient = () => ({
    async query(sql, params = []) {
        const text = String(sql).trim();
        state.calls.push({ sql: text, params });
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] };
        if (/FROM orders\s+WHERE id = \$1\s+FOR UPDATE/i.test(text)) {
            return { rows: [{ ...state.order }] };
        }
        if (/FROM shipments\s+WHERE order_id = \$1\s+FOR UPDATE/i.test(text)) {
            return { rows: state.shipment ? [{ ...state.shipment }] : [] };
        }
        if (/FROM payments\s+WHERE order_id = \$1[\s\S]*FOR UPDATE/i.test(text)) {
            return { rows: [{ ...state.payment }] };
        }
        if (/INSERT INTO shipments/i.test(text)) {
            state.writes += 1;
            state.shipment = {
                id: 8901,
                order_id: Number(params[0]),
                provider: params[1],
                tracking_no: params[2],
                tracking_url: null,
                shipment_status: params[3],
                eta_date: null,
                label_url: null,
                raw_payload: params[4]
            };
            return { rows: [{ ...state.shipment }] };
        }
        if (/UPDATE orders\s+SET status/i.test(text)) {
            state.writes += 1;
            state.order = {
                ...state.order,
                status: params[0],
                shipment_status: params[1],
                shipment_provider: params[2],
                tracking_no: params[3]
            };
            return { rows: [{ ...state.order }] };
        }
        if (/INSERT INTO order_events/i.test(text)) {
            state.writes += 1;
            return { rows: [{ id: 1 }] };
        }
        throw new Error(`Unexpected route fake query: ${text}`);
    },
    release() {}
});

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
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => resolve({
            status: response.statusCode,
            body: data ? JSON.parse(data) : null
        }));
    });
    request.on('error', reject);
    request.end(payload);
});

const body = {
    expected_status: ORDER_STATUS.HAZIRLANIYOR,
    handoff_confirmed: true,
    provider: 'Yurtiçi Kargo',
    tracking_no: 'YK-ROUTE-7201'
};

(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/shipments', shipmentRoutes);
    const server = await new Promise((resolve) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    try {
        const token = jwt.sign(
            { id: 17, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const authHeaders = {
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': 'shipment-route-7201-attempt-1'
        };

        delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
        let disabledDbCalls = 0;
        pool.query = async () => {
            disabledDbCalls += 1;
            throw new Error('disabled route must stop before current-admin query');
        };
        pool.connect = async () => {
            disabledDbCalls += 1;
            throw new Error('disabled route must stop before transaction');
        };

        const disabled = await postJson(server, '/api/shipments/7201/manual', body, authHeaders);
        assert.equal(disabled.status, 503);
        assert.equal(disabled.body.code, 'MANUAL_FULFILLMENT_DISABLED');
        assert.equal(disabledDbCalls, 0);

        const anonymous = await postJson(server, '/api/shipments/7201/manual', body, {
            'Idempotency-Key': authHeaders['Idempotency-Key']
        });
        assert.equal(anonymous.status, 401);
        assert.equal(disabledDbCalls, 0);

        process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = 'true';
        pool.query = async (sql, params) => {
            assert.match(String(sql), /SELECT id, role FROM users WHERE id = \$1/);
            assert.deepEqual(params, [17]);
            state.currentAdminQueries += 1;
            return { rows: [{ id: 17, role: 'admin' }] };
        };
        pool.connect = async () => {
            state.transactionConnects += 1;
            return createClient();
        };

        const first = await postJson(server, '/api/shipments/7201/manual', body, authHeaders);
        assert.equal(first.status, 201);
        assert.equal(first.body.reused, false);
        assert.equal(first.body.order.status, ORDER_STATUS.KARGOYA_VERILDI);
        assert.equal(first.body.shipment.trackingNo, 'YK-ROUTE-7201');
        assert.equal(first.body.shipment.trackingUrl, null);
        assert.equal(first.body.shipment.carrierApiExecuted, false);
        assert.equal(first.body.shipment.carrierConfirmed, false);
        assert.equal(first.body.shipment.labelGenerated, false);
        assert.equal(state.currentAdminQueries, 1);
        assert.equal(state.transactionConnects, 1);
        assert.equal(state.writes, 3);

        const replay = await postJson(server, '/api/shipments/7201/manual', body, authHeaders);
        assert.equal(replay.status, 200);
        assert.equal(replay.body.reused, true);
        assert.equal(state.currentAdminQueries, 2);
        assert.equal(state.transactionConnects, 2);
        assert.equal(state.writes, 3, 'route replay must not write again');

        const connectsBeforeRejectedXss = state.transactionConnects;
        const rejectedXss = await postJson(server, '/api/shipments/7201/manual', {
            ...body,
            tracking_no: '\"><img-src-x-onerror-alert-1>'
        }, {
            ...authHeaders,
            'Idempotency-Key': 'shipment-route-7201-attempt-xss'
        });
        assert.equal(rejectedXss.status, 400);
        assert.equal(rejectedXss.body.code, 'MANUAL_SHIPMENT_TRACKING_NO_INVALID');
        assert.equal(state.transactionConnects, connectsBeforeRejectedXss, 'invalid input must fail before transaction connect');

        console.log('manual shipment route smoke passed');
    } finally {
        await new Promise((resolve) => server.close(resolve));
        pool.connect = originalPoolConnect;
        pool.query = originalPoolQuery;
        if (originalFlag === undefined) {
            delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
        } else {
            process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = originalFlag;
        }
        await pool.end().catch(() => {});
    }
})().catch((error) => {
    pool.connect = originalPoolConnect;
    pool.query = originalPoolQuery;
    if (originalFlag === undefined) {
        delete process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED;
    } else {
        process.env.NOVASTORE_MANUAL_FULFILLMENT_WRITE_ENABLED = originalFlag;
    }
    console.error(error);
    process.exitCode = 1;
});
