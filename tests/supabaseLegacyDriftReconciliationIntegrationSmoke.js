const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { Client } = require('pg');

const rawAdminUrl = process.env.NOVASTORE_DRIFT_LOCAL_DATABASE_URL;
const expectedMajor = Number(process.env.NOVASTORE_DRIFT_EXPECTED_PG_MAJOR || 0);
const expectedPort = String(process.env.NOVASTORE_DRIFT_EXPECTED_PORT || '');
if (!rawAdminUrl) {
    console.log('Supabase legacy drift reconciliation integration smoke: DB replay SKIP');
    process.exit(0);
}

const parsedAdminUrl = new URL(rawAdminUrl);
assert.ok(['postgres:', 'postgresql:'].includes(parsedAdminUrl.protocol));
assert.equal(parsedAdminUrl.hostname, '127.0.0.1', 'integration smoke only accepts loopback PostgreSQL');
assert.equal(parsedAdminUrl.port, expectedPort, 'integration smoke requires the declared disposable port');
assert.equal(parsedAdminUrl.pathname.replace(/^\/+/, ''), 'novastore_drift_admin');
assert.ok([16, 17].includes(expectedMajor));
for (const marker of ['supabase', 'pooler', '.com', 'amazonaws', 'render', 'railway', 'neon.tech']) {
    assert.ok(!rawAdminUrl.toLowerCase().includes(marker), `remote marker rejected: ${marker}`);
}

const root = path.join(__dirname, '..');
const migrationSql = fs.readFileSync(
    path.join(root, 'migrations', '20260820_supabase_legacy_drift_reconciliation.sql'),
    'utf8'
);
const rollbackSql = fs.readFileSync(
    path.join(root, 'migrations', 'rollback', '20260820_supabase_legacy_drift_reconciliation.rollback.sql'),
    'utf8'
);
const pr26Sql = fs.readFileSync(
    path.join(root, 'migrations', '20260806_supabase_rls_quarantine_fail_closed.sql'),
    'utf8'
);
const originalEquivalentSql = [
    '20260702_menu_collection_foundation.sql',
    '20260712_admin_analytics_foundation.sql',
    '20260712_admin_notifications_foundation.sql',
    '20260712_admin_returns_foundation.sql'
].map((name) => fs.readFileSync(path.join(root, 'migrations', name), 'utf8'));

let activeSchemaClient = null;
const dbModulePath = require.resolve('../config/db');
const dbStubModule = new Module(dbModulePath);
dbStubModule.filename = dbModulePath;
dbStubModule.loaded = true;
dbStubModule.exports = {
    query(...args) {
        assert.ok(activeSchemaClient, 'schema query attempted without a disposable client');
        return activeSchemaClient.query(...args);
    }
};
require.cache[dbModulePath] = dbStubModule;

const createCoreSchema = require('../models/createCoreDb');
const createNotificationsSchema = require('../models/createNotificationDb');
const createCommerceSchema = require('../models/createCommerceDb');
const createAnalyticsSchema = require('../models/createAnalyticsDb');

const columns = [
    ['visitor_sessions', 'started_at', "TIMESTAMP '2026-01-01 00:00:00'"],
    ['visitor_sessions', 'last_seen_at', "TIMESTAMP '2026-01-01 00:01:00'"],
    ['page_visits', 'entered_at', "TIMESTAMP '2026-01-01 00:00:00'"],
    ['page_visits', 'last_seen_at', "TIMESTAMP '2026-01-01 00:01:00'"],
    ['page_visits', 'duration_seconds', '60'],
    ['page_visits', 'heartbeat_count', '2'],
    ['product_actions', 'quantity', '1'],
    ['product_actions', 'created_at', "TIMESTAMP '2026-01-01 00:02:00'"],
    ['notifications', 'is_read', 'FALSE'],
    ['notifications', 'created_at', "TIMESTAMP '2026-01-01 00:03:00'"],
    ['returns', 'status', "'REQUESTED'"],
    ['returns', 'created_at', "TIMESTAMP '2026-01-01 00:04:00'"],
    ['returns', 'updated_at', "TIMESTAMP '2026-01-01 00:04:00'"]
];
const indexes = [
    ['idx_product_actions_user_id', 'product_actions', 'user_id', false],
    ['idx_product_actions_created_at', 'product_actions', 'created_at', true],
    ['idx_notifications_created_at', 'notifications', 'created_at', true],
    ['idx_returns_status', 'returns', 'status', false],
    ['idx_returns_created_at', 'returns', 'created_at', true]
];

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const redact = (value) => String(value || 'unknown failure')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DB_URL]')
    .replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]');
const stable = (value) => JSON.stringify(value);
let negativeTestCount = 0;

const runRealSchemaChain = async (client) => {
    activeSchemaClient = client;
    try {
        await createCoreSchema();
        await createNotificationsSchema();
        await createCommerceSchema();
        await createAnalyticsSchema();
    } finally {
        activeSchemaClient = null;
    }
};

const seedProductionDrift = async (client) => {
    await client.query(`
        INSERT INTO public.products (id, name, price, stock, created_at) VALUES
            (101, 'Synthetic Product 1', 10.00, 10, TIMESTAMP '2025-12-01 00:00:00'),
            (102, 'Synthetic Product 2', 11.00, 10, TIMESTAMP '2025-12-01 00:00:00'),
            (103, 'Synthetic Product 3', 12.00, 10, TIMESTAMP '2025-12-01 00:00:00'),
            (104, 'Synthetic Product 4', 13.00, 10, TIMESTAMP '2025-12-01 00:00:00'),
            (105, 'Synthetic Product 5', 14.00, 10, TIMESTAMP '2025-12-01 00:00:00'),
            (106, 'Synthetic Product 6', 15.00, 10, TIMESTAMP '2025-12-01 00:00:00'),
            (107, 'Synthetic Product 7', 16.00, 10, TIMESTAMP '2025-12-01 00:00:00');
    `);
    const firstItems = [101, 102, 103, 104].map((id, index) => ({
        id,
        quantity: index + 1,
        price: String(10 + index)
    }));
    const secondItems = [105, 106, 107].map((id, index) => ({
        product_id: id,
        quantity: index + 1,
        unit_price: String(14 + index)
    }));
    await client.query(`
        INSERT INTO public.orders (
            id, total_amount, status, customer_name, items, created_at,
            payment_status, refund_status, shipment_status, updated_at
        ) VALUES
            (201, 100.00, 'pending', 'Synthetic Customer A', $1::jsonb,
             TIMESTAMP '2025-12-10 10:00:00', 'UNPAID', 'NONE', 'NONE', TIMESTAMP '2025-12-10 10:00:00'),
            (202, 110.00, 'pending', 'Synthetic Customer B', $2::jsonb,
             TIMESTAMP '2025-12-11 11:00:00', 'UNPAID', 'NONE', 'NONE', TIMESTAMP '2025-12-11 11:00:00');
    `, [JSON.stringify(firstItems), JSON.stringify(secondItems)]);
    await client.query(`
        INSERT INTO public.visitor_sessions (
            id, session_key, visitor_key, started_at, last_seen_at
        ) VALUES (
            301, 'synthetic-session', 'synthetic-visitor',
            TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-01-01 00:01:00'
        );
        INSERT INTO public.page_visits (
            id, page_key, session_key, page_path, product_id, entered_at,
            last_seen_at, duration_seconds, heartbeat_count
        ) VALUES (
            401, 'synthetic-page', 'synthetic-session', '/synthetic', 101,
            TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-01-01 00:01:00', 60, 2
        );
        INSERT INTO public.product_actions (
            id, action_key, session_key, visitor_key, product_id, action_type,
            quantity, created_at
        ) VALUES (
            501, 'synthetic-action', 'synthetic-session', 'synthetic-visitor', 101,
            'view', 1, TIMESTAMP '2026-01-01 00:02:00'
        );
        INSERT INTO public.notifications (
            id, type, message, is_read, created_at
        ) VALUES (
            601, 'synthetic', 'Synthetic notification', FALSE, TIMESTAMP '2026-01-01 00:03:00'
        );
        INSERT INTO public.returns (
            id, order_id, reason_code, status, created_at, updated_at
        ) VALUES (
            701, 201, 'SYNTHETIC', 'REQUESTED',
            TIMESTAMP '2026-01-01 00:04:00', TIMESTAMP '2026-01-01 00:04:00'
        );
    `);
};

const installSecurityFixture = async (client) => {
    await client.query(`
        CREATE TABLE public.assistant_events (
            id SERIAL,
            session_id VARCHAR(80) NOT NULL,
            user_id INTEGER,
            event_name VARCHAR(80) NOT NULL,
            tool_name VARCHAR(80),
            intent VARCHAR(80),
            product_id INTEGER,
            query_text TEXT,
            page VARCHAR(120),
            status VARCHAR(40) DEFAULT 'success',
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT assistant_events_pkey PRIMARY KEY (id),
            CONSTRAINT assistant_events_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL,
            CONSTRAINT assistant_events_product_id_fkey
                FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_assistant_events_name_created_at
            ON public.assistant_events (event_name, created_at DESC);
        CREATE INDEX idx_assistant_events_product_id
            ON public.assistant_events (product_id);
        CREATE INDEX idx_assistant_events_session_id
            ON public.assistant_events (session_id);
        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
        GRANT SELECT (id), INSERT (name), UPDATE (name), REFERENCES (id)
            ON public.products TO anon, authenticated;
        ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
    `);
};

const schemaSignature = async (client) => {
    const [columnResult, constraintResult, indexResult, triggerResult, routineResult] = await Promise.all([
        client.query(`
            SELECT relation.relname AS table_name, attribute.attnum, attribute.attname,
                   pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
                   attribute.attnotnull,
                   pg_catalog.pg_get_expr(default_entry.adbin, default_entry.adrelid) AS default_expression
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
            LEFT JOIN pg_catalog.pg_attrdef AS default_entry
              ON default_entry.adrelid = attribute.attrelid AND default_entry.adnum = attribute.attnum
            WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
            ORDER BY relation.relname, attribute.attnum
        `),
        client.query(`
            SELECT relation.relname AS table_name, constraint_entry.conname,
                   pg_catalog.pg_get_constraintdef(constraint_entry.oid, TRUE) AS definition
            FROM pg_catalog.pg_constraint AS constraint_entry
            JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_entry.conrelid
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
            ORDER BY relation.relname, constraint_entry.conname
        `),
        client.query(`
            SELECT table_relation.relname AS table_name, index_relation.relname AS index_name,
                   pg_catalog.pg_get_indexdef(index_relation.oid) AS definition
            FROM pg_catalog.pg_index AS index_entry
            JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
            JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
            WHERE namespace.nspname = 'public'
            ORDER BY table_relation.relname, index_relation.relname
        `),
        client.query(`
            SELECT relation.relname AS table_name, trigger_entry.tgname,
                   pg_catalog.pg_get_triggerdef(trigger_entry.oid, TRUE) AS definition
            FROM pg_catalog.pg_trigger AS trigger_entry
            JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_entry.tgrelid
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public' AND NOT trigger_entry.tgisinternal
            ORDER BY relation.relname, trigger_entry.tgname
        `),
        client.query(`
            SELECT routine.proname, pg_catalog.pg_get_function_identity_arguments(routine.oid) AS arguments,
                   pg_catalog.pg_get_functiondef(routine.oid) AS definition
            FROM pg_catalog.pg_proc AS routine
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
            WHERE namespace.nspname = 'public'
            ORDER BY routine.proname, arguments
        `)
    ]);
    return {
        columns: columnResult.rows,
        constraints: constraintResult.rows,
        indexes: indexResult.rows,
        triggers: triggerResult.rows,
        routines: routineResult.rows
    };
};

const securitySignature = async (client) => {
    const [schemaResult, relationResult, columnResult, policyResult, routineResult] = await Promise.all([
        client.query(`
            SELECT namespace.nspname, namespace.nspacl::TEXT
            FROM pg_catalog.pg_namespace AS namespace
            WHERE namespace.nspname = 'public'
        `),
        client.query(`
            SELECT relation.relname, relation.relkind::TEXT, relation.relrowsecurity,
                   relation.relforcerowsecurity, relation.relacl::TEXT
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p', 'S')
            ORDER BY relation.relkind, relation.relname
        `),
        client.query(`
            SELECT relation.relname, attribute.attname, attribute.attacl::TEXT
            FROM pg_catalog.pg_attribute AS attribute
            JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND attribute.attnum > 0 AND NOT attribute.attisdropped AND attribute.attacl IS NOT NULL
            ORDER BY relation.relname, attribute.attname
        `),
        client.query(`
            SELECT relation.relname, policy.polname, pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
                   pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
            FROM pg_catalog.pg_policy AS policy
            JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
            ORDER BY relation.relname, policy.polname
        `),
        client.query(`
            SELECT routine.proname, pg_catalog.pg_get_function_identity_arguments(routine.oid) AS arguments,
                   routine.proacl::TEXT
            FROM pg_catalog.pg_proc AS routine
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
            WHERE namespace.nspname = 'public'
            ORDER BY routine.proname, arguments
        `)
    ]);
    return {
        schemas: schemaResult.rows,
        relations: relationResult.rows,
        columns: columnResult.rows,
        policies: policyResult.rows,
        routines: routineResult.rows
    };
};

const surfaceSnapshot = async (client) => {
    const [schema, orderItems, issues, sequence, counts, security] = await Promise.all([
        schemaSignature(client),
        client.query(`SELECT * FROM public.order_items ORDER BY id`),
        client.query(`SELECT * FROM public.order_item_backfill_issues ORDER BY order_id`),
        client.query(`
            SELECT last_value::TEXT, start_value::TEXT, increment_by::TEXT
            FROM pg_catalog.pg_sequences
            WHERE schemaname = 'public' AND sequencename = 'order_items_id_seq'
        `),
        client.query(`
            SELECT relation.relname,
                   (xpath('/row/count/text()', pg_catalog.query_to_xml(
                       pg_catalog.format('SELECT pg_catalog.count(*) AS count FROM public.%I', relation.relname),
                       FALSE, TRUE, ''
                   )))[1]::TEXT::BIGINT AS row_count
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
            ORDER BY relation.relname
        `),
        securitySignature(client)
    ]);
    return {
        schema,
        orderItems: orderItems.rows,
        issues: issues.rows,
        sequence: sequence.rows,
        counts: counts.rows,
        security
    };
};

const expectMigrationFailure = async (client, sql, message) => {
    let failure = null;
    try {
        await client.query(sql);
    } catch (error) {
        failure = error;
    }
    assert.ok(failure, 'migration was expected to fail closed');
    assert.match(redact(failure.message), message);
    negativeTestCount += 1;
    await client.query('ROLLBACK');
};

const semanticIndexCount = async (client, [, tableName, columnName, descending]) => {
    const result = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_index AS index_entry
        JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
        JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
        JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_relation.relam
        WHERE namespace.nspname = 'public'
          AND table_relation.relname = $1
          AND access_method.amname = 'btree'
          AND NOT index_entry.indisunique
          AND index_entry.indisvalid AND index_entry.indisready
          AND index_entry.indnkeyatts = 1 AND index_entry.indnatts = 1
          AND index_entry.indpred IS NULL
          AND pg_catalog.pg_get_indexdef(index_relation.oid, 1, TRUE) = $2
          AND ((index_entry.indoption[0] & 1) = 1) = $3
          AND ((index_entry.indoption[0] & 2) = 2) = $3
    `, [tableName, columnName, descending]);
    return result.rows[0].count;
};

const assertReconciled = async (client, { exactNames = true } = {}) => {
    const columnResult = await client.query(`
        SELECT relation.relname, attribute.attname, attribute.attnotnull
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
          AND (relation.relname, attribute.attname) IN (
              ('visitor_sessions', 'started_at'), ('visitor_sessions', 'last_seen_at'),
              ('page_visits', 'entered_at'), ('page_visits', 'last_seen_at'),
              ('page_visits', 'duration_seconds'), ('page_visits', 'heartbeat_count'),
              ('product_actions', 'quantity'), ('product_actions', 'created_at'),
              ('notifications', 'is_read'), ('notifications', 'created_at'),
              ('returns', 'status'), ('returns', 'created_at'), ('returns', 'updated_at')
          )
        ORDER BY relation.relname, attribute.attname
    `);
    assert.equal(columnResult.rowCount, 13);
    assert.ok(columnResult.rows.every((row) => row.attnotnull));
    for (const index of indexes) {
        assert.equal(await semanticIndexCount(client, index), 1, `${index[0]} semantic count`);
        if (exactNames) {
            const named = await client.query(`SELECT pg_catalog.to_regclass($1) AS relation`, [`public.${index[0]}`]);
            assert.notEqual(named.rows[0].relation, null, `${index[0]} exact name`);
        }
    }
    const itemResult = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count,
               pg_catalog.count(DISTINCT (order_id, source_item_index))::INTEGER AS distinct_targets
        FROM public.order_items
    `);
    assert.deepEqual(itemResult.rows[0], { count: 7, distinct_targets: 7 });
    const issueResult = await client.query(`SELECT pg_catalog.count(*)::INTEGER AS count FROM public.order_item_backfill_issues`);
    assert.equal(issueResult.rows[0].count, 0, 'sequential original issue postcondition must be zero');
};

const assertStructurallyRolledBack = async (client) => {
    const columnsResult = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND attribute.attnotnull
          AND (relation.relname, attribute.attname) IN (
              ('visitor_sessions', 'started_at'), ('visitor_sessions', 'last_seen_at'),
              ('page_visits', 'entered_at'), ('page_visits', 'last_seen_at'),
              ('page_visits', 'duration_seconds'), ('page_visits', 'heartbeat_count'),
              ('product_actions', 'quantity'), ('product_actions', 'created_at'),
              ('notifications', 'is_read'), ('notifications', 'created_at'),
              ('returns', 'status'), ('returns', 'created_at'), ('returns', 'updated_at')
          )
    `);
    assert.equal(columnsResult.rows[0].count, 0);
    for (const index of indexes) {
        const result = await client.query(`SELECT pg_catalog.to_regclass($1) AS relation`, [`public.${index[0]}`]);
        assert.equal(result.rows[0].relation, null);
    }
    const itemResult = await client.query(`SELECT pg_catalog.count(*)::INTEGER AS count FROM public.order_items`);
    assert.equal(itemResult.rows[0].count, 7, 'conditional rollback must retain historical rows');
};

const grantRolesExist = async (adminClient) => {
    for (const role of ['anon', 'authenticated']) {
        const existing = await adminClient.query(`SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1`, [role]);
        if (existing.rowCount === 0) {
            await adminClient.query(`CREATE ROLE ${quoteIdentifier(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`);
        }
    }
};

const connectionUrlFor = (databaseName) => {
    const url = new URL(parsedAdminUrl.toString());
    url.pathname = `/${databaseName}`;
    return url.toString();
};

const adminClient = new Client({
    connectionString: parsedAdminUrl.toString(),
    application_name: `novastore_drift_pg${expectedMajor}_admin`
});
const databases = new Set();
const openClients = new Set();
let databaseCounter = 0;

const createFixture = async (slug) => {
    databaseCounter += 1;
    const databaseName = `novastore_drift_${expectedMajor}_${process.pid}_${databaseCounter}_${slug}`;
    assert.match(databaseName, /^novastore_drift_(16|17)_[0-9]+_[0-9]+_[a-z_]+$/);
    databases.add(databaseName);
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`);
    const client = new Client({
        connectionString: connectionUrlFor(databaseName),
        application_name: `novastore_drift_pg${expectedMajor}_${slug}`
    });
    await client.connect();
    client.on('error', () => {});
    openClients.add(client);
    await runRealSchemaChain(client);
    await seedProductionDrift(client);
    await installSecurityFixture(client);
    return { client, databaseName };
};

const closeFixture = async ({ client, databaseName }) => {
    await client.end().catch(() => {});
    openClients.delete(client);
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    databases.delete(databaseName);
};

const insertOneExpectedItem = async (client, { sourceItemIndexOffset = 0, quantityOffset = 0 } = {}) => {
    await client.query(`
        INSERT INTO public.order_items (
            order_id, product_id, product_name, quantity, unit_price,
            total_price, source_item_index, created_at
        )
        SELECT orders.id, products.id,
               LEFT(COALESCE(NULLIF(item.value->>'name', ''), products.name, 'Legacy product'), 255),
               (item.value->>'quantity')::INTEGER + $1::INTEGER,
               COALESCE(item.value->>'price', item.value->>'unit_price')::DECIMAL(12, 2),
               ((item.value->>'quantity')::INTEGER + $1::INTEGER) *
                   COALESCE(item.value->>'price', item.value->>'unit_price')::DECIMAL(12, 2),
               (item.ordinality - 1)::INTEGER + $2::INTEGER,
               orders.created_at
        FROM public.orders
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(orders.items)
            WITH ORDINALITY AS item(value, ordinality)
        LEFT JOIN public.products ON products.id = COALESCE(
            item.value->>'id', item.value->>'product_id', item.value->>'productId'
        )::INTEGER
        ORDER BY orders.id, item.ordinality
        LIMIT 1
    `, [quantityOffset, sourceItemIndexOffset]);
};

const assertPr26Compatible = async (client) => {
    await client.query(pr26Sql);
    const rls = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS total,
               pg_catalog.count(*) FILTER (WHERE relation.relrowsecurity)::INTEGER AS enabled,
               pg_catalog.count(*) FILTER (WHERE relation.relforcerowsecurity)::INTEGER AS forced
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
    `);
    assert.deepEqual(rls.rows[0], { total: 43, enabled: 43, forced: 0 });
    const policies = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_policy AS policy
        JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
    `);
    assert.equal(policies.rows[0].count, 0);
    const dataApiAcls = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl ON TRUE
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p', 'S')
          AND grantee.rolname IN ('anon', 'authenticated')
    `);
    assert.equal(dataApiAcls.rows[0].count, 0);
    const dataApiColumnAcls = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl ON TRUE
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'public'
          AND relation.relkind IN ('r', 'p')
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND grantee.rolname IN ('anon', 'authenticated')
    `);
    assert.equal(dataApiColumnAcls.rows[0].count, 0);
    const targetSequencePrivileges = await client.query(`
        SELECT pg_catalog.count(*)::INTEGER AS count
        FROM pg_catalog.pg_class AS sequence_relation
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = sequence_relation.relnamespace
        JOIN LATERAL pg_catalog.aclexplode(sequence_relation.relacl) AS acl ON TRUE
        JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'public'
          AND sequence_relation.relkind = 'S'
          AND grantee.rolname IN ('anon', 'authenticated')
    `);
    assert.equal(targetSequencePrivileges.rows[0].count, 0);
    const backendContract = await client.query(`
        SELECT role_entry.rolsuper OR role_entry.rolbypassrls AS bypass_contract,
               pg_catalog.count(products.id)::INTEGER AS readable_products
        FROM pg_catalog.pg_roles AS role_entry
        CROSS JOIN public.products
        WHERE role_entry.rolname = current_user
        GROUP BY role_entry.rolsuper, role_entry.rolbypassrls
    `);
    assert.equal(backendContract.rows[0].bypass_contract, true);
    assert.equal(backendContract.rows[0].readable_products, 7);
};

(async () => {
    await adminClient.connect();
    const proof = await adminClient.query(`
        SELECT current_database() AS database_name,
               current_setting('server_version_num')::INTEGER AS server_version_num,
               role_entry.rolsuper
        FROM pg_catalog.pg_roles AS role_entry WHERE role_entry.rolname = current_user
    `);
    assert.equal(proof.rows[0].database_name, 'novastore_drift_admin');
    assert.equal(Math.floor(proof.rows[0].server_version_num / 10000), expectedMajor);
    assert.equal(proof.rows[0].rolsuper, true);
    await grantRolesExist(adminClient);

    const control = await createFixture('control');
    for (const sql of originalEquivalentSql) await control.client.query(sql);
    await control.client.query(`
        ALTER TABLE public.visitor_sessions
            ALTER COLUMN started_at SET NOT NULL,
            ALTER COLUMN last_seen_at SET NOT NULL;
        ALTER TABLE public.page_visits
            ALTER COLUMN entered_at SET NOT NULL,
            ALTER COLUMN last_seen_at SET NOT NULL,
            ALTER COLUMN duration_seconds SET NOT NULL,
            ALTER COLUMN heartbeat_count SET NOT NULL;
        ALTER TABLE public.product_actions
            ALTER COLUMN quantity SET NOT NULL,
            ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE public.notifications
            ALTER COLUMN is_read SET NOT NULL,
            ALTER COLUMN created_at SET NOT NULL;
        ALTER TABLE public.returns
            ALTER COLUMN status SET NOT NULL,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN updated_at SET NOT NULL;
    `);
    await assertReconciled(control.client);
    const expectedSchema = await schemaSignature(control.client);

    const happy = await createFixture('happy');
    const happySecurityBefore = await securitySignature(happy.client);
    await happy.client.query(migrationSql);
    await assertReconciled(happy.client);
    assert.deepEqual(await securitySignature(happy.client), happySecurityBefore);
    assert.deepEqual(await schemaSignature(happy.client), expectedSchema, 'reconciled schema must equal original #1-#13 postconditions');
    const happyOnce = await surfaceSnapshot(happy.client);
    await happy.client.query(migrationSql);
    assert.deepEqual(await surfaceSnapshot(happy.client), happyOnce, 'second run must be a no-op');

    const failures = await createFixture('failures');
    for (const [tableName, columnName, restoreExpression] of columns) {
        await failures.client.query(`UPDATE public.${tableName} SET ${columnName} = NULL`);
        const before = await surfaceSnapshot(failures.client);
        await expectMigrationFailure(
            failures.client,
            migrationSql,
            new RegExp(`${tableName}\\.${columnName} has 1 NULL rows`, 'i')
        );
        assert.deepEqual(await surfaceSnapshot(failures.client), before, `${tableName}.${columnName} NULL guard residue`);
        await failures.client.query(`UPDATE public.${tableName} SET ${columnName} = ${restoreExpression}`);
    }

    await failures.client.query(`ALTER TABLE public.notifications ALTER COLUMN is_read SET DEFAULT TRUE`);
    let before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /wrong default for notifications\.is_read/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(`ALTER TABLE public.notifications ALTER COLUMN is_read SET DEFAULT FALSE`);

    await failures.client.query(`ALTER TABLE public.returns ALTER COLUMN status TYPE TEXT`);
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /wrong type for returns\.status/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(`ALTER TABLE public.returns ALTER COLUMN status TYPE VARCHAR(40)`);

    await failures.client.query(`CREATE INDEX idx_returns_status ON public.returns (created_at DESC)`);
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /named index idx_returns_status exists with a different definition/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(`DROP INDEX public.idx_returns_status`);

    await insertOneExpectedItem(failures.client);
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /partial prior execution detected/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(`DELETE FROM public.order_items`);

    await insertOneExpectedItem(failures.client, { quantityOffset: 1 });
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /deterministic order-item keys contain different values/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(`DELETE FROM public.order_items`);

    await insertOneExpectedItem(failures.client, { sourceItemIndexOffset: 100 });
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /business-equivalent order items exist under different keys/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(`DELETE FROM public.order_items`);

    const originalItems = await failures.client.query(`SELECT items FROM public.orders WHERE id = 201`);
    await failures.client.query(`
        UPDATE public.orders
        SET items = pg_catalog.jsonb_set(items, '{0,id}', '999999'::jsonb)
        WHERE id = 201
    `);
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /qualifying product references no longer resolve/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(
        `UPDATE public.orders SET items = $1::jsonb WHERE id = 201`,
        [JSON.stringify(originalItems.rows[0].items)]
    );

    await failures.client.query(`
        INSERT INTO public.orders (id, total_amount, status, items, created_at)
        VALUES (
            203, 10, 'pending',
            '[{"id":101,"quantity":1,"price":"10.00"}]'::jsonb,
            TIMESTAMP '2025-12-12 12:00:00'
        )
    `);
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /expected exactly 7 qualifying source items, found 8/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await failures.client.query(`DELETE FROM public.orders WHERE id = 203`);

    const lockHolder = new Client({
        connectionString: connectionUrlFor(failures.databaseName),
        application_name: `novastore_drift_pg${expectedMajor}_lock_holder`
    });
    await lockHolder.connect();
    await lockHolder.query('BEGIN');
    await lockHolder.query(`
        SELECT pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('novastore:legacy-drift-reconciliation:v1', 0)
        )
    `);
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /another reconciliation holds the advisory lock/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await lockHolder.query('ROLLBACK');

    await lockHolder.query('BEGIN');
    await lockHolder.query(`UPDATE public.orders SET status = status WHERE id = 201`);
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, migrationSql, /lock timeout|canceling statement due to lock timeout/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before);
    await lockHolder.query('ROLLBACK');
    await lockHolder.end();

    const forcedFailureSql = migrationSql.replace(
        '-- PARTIAL_FAILURE_TEST_HOOK',
        "RAISE EXCEPTION 'forced partial-failure integration hook';"
    );
    before = await surfaceSnapshot(failures.client);
    await expectMigrationFailure(failures.client, forcedFailureSql, /forced partial-failure integration hook/i);
    assert.deepEqual(await surfaceSnapshot(failures.client), before, 'forced failure must roll back rows, DDL, indexes and sequence state');

    const semantic = await createFixture('semantic');
    for (const [, tableName, columnName, descending] of indexes) {
        await semantic.client.query(
            `CREATE INDEX ${quoteIdentifier(`alt_${tableName}_${columnName}`)} ` +
            `ON public.${quoteIdentifier(tableName)} (${quoteIdentifier(columnName)} ${descending ? 'DESC' : 'ASC'})`
        );
    }
    const semanticSecurityBefore = await securitySignature(semantic.client);
    await semantic.client.query(migrationSql);
    await assertReconciled(semantic.client, { exactNames: false });
    for (const [indexName] of indexes) {
        const named = await semantic.client.query(`SELECT pg_catalog.to_regclass($1) AS relation`, [`public.${indexName}`]);
        assert.equal(named.rows[0].relation, null, `${indexName} must not duplicate a different-name equivalent`);
    }
    assert.deepEqual(await securitySignature(semantic.client), semanticSecurityBefore);

    const rollback = await createFixture('rollback');
    const rollbackSecurityBefore = await securitySignature(rollback.client);
    await rollback.client.query(migrationSql);
    await rollback.client.query(rollbackSql);
    await assertStructurallyRolledBack(rollback.client);
    assert.deepEqual(await securitySignature(rollback.client), rollbackSecurityBefore);
    await rollback.client.query(migrationSql);
    await assertReconciled(rollback.client);

    await assertPr26Compatible(happy.client);

    await closeFixture(control);
    await closeFixture(happy);
    await closeFixture(failures);
    await closeFixture(semantic);
    await closeFixture(rollback);

    console.log(
        `Supabase legacy drift reconciliation integration smoke: PASS ` +
        `(PostgreSQL ${expectedMajor}; ${negativeTestCount} negative cases, ` +
        `13 NULL guards, drift, duplicate, lock, partial, idempotency, rollback, PR26)`
    );
})().catch((error) => {
    console.error(`Supabase legacy drift reconciliation integration smoke failed: ${redact(error.stack || error.message)}`);
    process.exitCode = 1;
}).finally(async () => {
    for (const client of [...openClients]) {
        await client.end().catch(() => {});
        openClients.delete(client);
    }
    for (const databaseName of [...databases]) {
        await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`).catch(() => {});
    }
    await adminClient.end().catch(() => {});
});
