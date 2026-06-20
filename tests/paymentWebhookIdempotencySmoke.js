const assert = require('assert');
const { webhookIyzico } = require('../controllers/paymentController');
const pool = require('../config/db');

const createRes = () => ({
    code: null,
    body: null,
    status(code) {
        this.code = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const createDuplicateWebhookClient = () => {
    const calls = [];
    return {
        calls,
        async query(sql, params = []) {
            calls.push({ sql, params });

            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
            }

            if (/INSERT INTO webhook_events/i.test(sql)) {
                return { rows: [{ id: 9001, processed: true }] };
            }

            throw new Error(`Duplicate webhook should not run side effect query: ${sql}`);
        },
        release() {}
    };
};

(async () => {
    const originalConnect = pool.connect;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSecret = process.env.IYZICO_WEBHOOK_SECRET;
    const client = createDuplicateWebhookClient();

    pool.connect = async () => client;
    process.env.NODE_ENV = 'test';
    delete process.env.IYZICO_WEBHOOK_SECRET;

    try {
        const res = createRes();
        await webhookIyzico({
            body: {
                eventId: 'evt-duplicate-1',
                paymentRef: 'PAY-7001',
                status: 'SUCCESS'
            },
            headers: {}
        }, res);

        assert.strictEqual(res.code, 200);
        assert.deepStrictEqual(res.body, { ok: true, processed: true, duplicate: true });
        assert.deepStrictEqual(
            client.calls.map((call) => call.sql),
            [
                'BEGIN',
                client.calls[1].sql,
                'COMMIT'
            ]
        );
        assert.match(client.calls[1].sql, /INSERT INTO webhook_events/i);
    } finally {
        pool.connect = originalConnect;
        process.env.NODE_ENV = originalNodeEnv;
        if (originalSecret === undefined) {
            delete process.env.IYZICO_WEBHOOK_SECRET;
        } else {
            process.env.IYZICO_WEBHOOK_SECRET = originalSecret;
        }
    }

    console.log('payment webhook idempotency smoke passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
