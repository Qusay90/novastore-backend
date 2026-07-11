const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');

const DEFAULT_LOCAL_DATABASE_URL =
    'postgresql://novastore_test:novastore_test_only@127.0.0.1:55433/novastore_admin_support_test';
const FORBIDDEN_MARKERS = ['supabase', 'pooler', '.com', 'amazonaws', 'render', 'railway'];
const MIGRATIONS = [
    '20260712_admin_notifications_foundation.sql',
    '20260712_admin_returns_foundation.sql',
    '20260712_admin_analytics_foundation.sql'
];
const EXPECTED_TABLES = [
    'notifications',
    'returns',
    'visitor_sessions',
    'page_visits',
    'product_actions'
];
const EXPECTED_INDEXES = [
    'idx_notifications_user_id',
    'idx_notifications_is_read',
    'idx_notifications_created_at',
    'idx_returns_order_id',
    'idx_returns_user_id',
    'idx_returns_status',
    'idx_returns_created_at',
    'idx_visitor_sessions_started_at',
    'idx_visitor_sessions_user_id',
    'idx_visitor_sessions_visitor_key',
    'idx_page_visits_session_key',
    'idx_page_visits_product_id',
    'idx_page_visits_entered_at',
    'idx_product_actions_session_key',
    'idx_product_actions_product_id',
    'idx_product_actions_user_id',
    'idx_product_actions_type_created_at',
    'idx_product_actions_created_at',
    'idx_orders_analytics_session_key'
];

const assertSafeLocalDatabaseUrl = (rawUrl) => {
    const parsed = new URL(String(rawUrl || '').trim());
    const normalized = String(rawUrl || '').toLowerCase();
    assert(
        ['127.0.0.1', 'localhost'].includes(parsed.hostname.toLowerCase()),
        'Admin support smoke requires a local database host.'
    );
    assert(
        FORBIDDEN_MARKERS.every((marker) => !normalized.includes(marker)),
        'Admin support smoke rejected a remote database marker.'
    );
    assert.strictEqual(
        parsed.pathname.replace(/^\/+/, ''),
        'novastore_admin_support_test',
        'Admin support smoke requires its dedicated disposable database.'
    );
    return parsed;
};

assert.throws(
    () => assertSafeLocalDatabaseUrl('postgresql://user:secret@db.example.supabase.co/postgres'),
    /local database host|remote database marker/i
);

const localDatabaseUrl = process.env.ADMIN_SUPPORT_LOCAL_DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
const parsedDatabaseUrl = assertSafeLocalDatabaseUrl(localDatabaseUrl);

process.env.NODE_ENV = 'test';
process.env.NOVASTORE_SAFE_LOCAL_BACKEND = 'true';
process.env.NOVASTORE_ALLOW_REMOTE_DB = 'false';
process.env.NOVASTORE_ALLOW_SCHEMA_INIT = 'true';
process.env.SKIP_SCHEMA_INIT = 'false';
process.env.DATABASE_URL = localDatabaseUrl;
process.env.DB_HOST = parsedDatabaseUrl.hostname;
process.env.DB_PORT = parsedDatabaseUrl.port || '5432';
process.env.DB_NAME = parsedDatabaseUrl.pathname.replace(/^\/+/, '');
process.env.DB_USER = decodeURIComponent(parsedDatabaseUrl.username);
process.env.DB_PASSWORD = decodeURIComponent(parsedDatabaseUrl.password);
process.env.DB_SSL = 'false';
process.env.SUPABASE_USE_POOLER = 'false';
process.env.SUPABASE_POOLER_HOST = '';
process.env.SUPABASE_REGION = '';
process.env.SUPABASE_PROJECT_REF = '';
process.env.JWT_SECRET = 'admin-support-local-smoke-secret';

const pool = require('../config/db');
const createCoreSchema = require('../models/createCoreDb');
const returnRoutes = require('../routes/returnRoutes');
const adminRoutes = require('../routes/adminRoutes');
const notificationRoutes = require('../routes/notificationRoutes');

const migrationSql = MIGRATIONS.map((name) => ({
    name,
    sql: fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8')
}));

const applyMigrations = async (client) => {
    for (const migration of migrationSql) {
        await client.query(migration.sql);
    }
};

const startApi = async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/returns', returnRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/notifications', notificationRoutes);

    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
};

const stopApi = (server) => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
});

const getJson = async (baseUrl, pathname, token) => {
    const response = await fetch(`${baseUrl}${pathname}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return { status: response.status, body: await response.json() };
};

(async () => {
    const client = await pool.connect();
    let api = null;

    try {
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        await createCoreSchema();
        await applyMigrations(client);
        await applyMigrations(client);

        const tableResult = await client.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name = ANY($1::text[])
             ORDER BY table_name`,
            [EXPECTED_TABLES]
        );
        assert.deepStrictEqual(
            tableResult.rows.map((row) => row.table_name).sort(),
            [...EXPECTED_TABLES].sort()
        );

        const orderColumnResult = await client.query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'orders'
               AND column_name = ANY($1::text[])`,
            [[
                'analytics_session_key',
                'cancel_reason',
                'refund_status',
                'shipment_status',
                'updated_at'
            ]]
        );
        assert.deepStrictEqual(
            orderColumnResult.rows.map((row) => row.column_name).sort(),
            [
                'analytics_session_key',
                'cancel_reason',
                'refund_status',
                'shipment_status',
                'updated_at'
            ]
        );

        const indexResult = await client.query(
            `SELECT indexname
             FROM pg_indexes
             WHERE schemaname = 'public'
               AND indexname = ANY($1::text[])
             ORDER BY indexname`,
            [EXPECTED_INDEXES]
        );
        assert.deepStrictEqual(
            indexResult.rows.map((row) => row.indexname).sort(),
            [...EXPECTED_INDEXES].sort()
        );

        api = await startApi();
        const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });

        const returnsResponse = await getJson(api.baseUrl, '/api/returns/admin/all', adminToken);
        assert.strictEqual(returnsResponse.status, 200);
        assert.deepStrictEqual(returnsResponse.body, []);

        const notificationsResponse = await getJson(api.baseUrl, '/api/notifications/admin', adminToken);
        assert.strictEqual(notificationsResponse.status, 200);
        assert.deepStrictEqual(notificationsResponse.body, []);

        const behaviorResponse = await getJson(api.baseUrl, '/api/admin/behavior?days=30', adminToken);
        assert.strictEqual(behaviorResponse.status, 200);
        assert.strictEqual(typeof behaviorResponse.body, 'object');
        assert(Array.isArray(behaviorResponse.body.topProducts));
        assert(Array.isArray(behaviorResponse.body.topSellingProducts));
        assert(Array.isArray(behaviorResponse.body.topAddToCartProducts));
        assert(Array.isArray(behaviorResponse.body.recentSessions));
        assert(Array.isArray(behaviorResponse.body.trends));

        console.log('admin support schema migration smoke passed');
    } finally {
        if (api) await stopApi(api.server);
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;').catch(() => {});
        client.release();
        await pool.end();
    }
})().catch(async (error) => {
    console.error(error);
    try {
        await pool.end();
    } catch (_) {
        // Pool may already be closed.
    }
    process.exitCode = 1;
});
