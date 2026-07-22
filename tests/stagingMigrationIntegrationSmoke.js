const assert = require('node:assert/strict');
const { Client } = require('pg');
const { runBootstrap, SYNTHETIC_CATEGORY_PATH, SYNTHETIC_SKU } = require('../scripts/staging-migrations/bootstrap');
const { LOCAL_TEST_CAPABILITY } = require('../scripts/staging-migrations/guard');
const { loadRegistry } = require('../scripts/staging-migrations/registry');
const {
    LEDGER_TABLE,
    MIGRATION_LOCK_KEYS,
    executeTransactionalMigration,
    runApply,
    runStatus
} = require('../scripts/staging-migrations/runner');

const connectionString = String(process.env.P4D1A_TEST_DATABASE_URL || '').trim();
assert(connectionString, 'P4D1A_TEST_DATABASE_URL is required.');
const parsed = new URL(connectionString);
const host = parsed.hostname.replace(/^\[|\]$/g, '');
const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
assert(['127.0.0.1', 'localhost', '::1'].includes(host), 'Integration target must be loopback.');
assert(database.endsWith('_test'), 'Integration target must use a unique _test database.');

const env = {
    NODE_ENV: 'test',
    NOVASTORE_DEPLOY_ENV: 'staging',
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: 'true',
    NOVASTORE_STAGING_BOOTSTRAP_ENABLED: 'true',
    NOVASTORE_ALLOW_REMOTE_DB: 'true',
    NOVASTORE_EXPECTED_DATABASE_HOST: host,
    NOVASTORE_EXPECTED_DATABASE_NAME: database,
    [LOCAL_TEST_CAPABILITY]: 'true',
    DATABASE_URL: connectionString
};
const registry = loadRegistry();
const silent = () => {};
const admin = new Client({ connectionString, application_name: 'p4d1a_integration_assertions' });

const resetPublic = async () => {
    await admin.query('DROP SCHEMA public CASCADE');
    await admin.query('CREATE SCHEMA public');
};

const publicObjectCount = async () => {
    const result = await admin.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')`
    );
    return result.rows[0].count;
};

const tableCounts = async () => {
    const result = await admin.query(
        `SELECT
            (SELECT COUNT(*)::INTEGER FROM orders) AS orders,
            (SELECT COUNT(*)::INTEGER FROM payments) AS payments,
            (SELECT COUNT(*)::INTEGER FROM notifications) AS notifications,
            (SELECT COUNT(*)::INTEGER FROM webhook_events) AS webhooks`
    );
    return result.rows[0];
};

const bootstrapSnapshot = async ({ productId, categoryId }) => {
    const result = await admin.query(
        `SELECT
            (SELECT COUNT(*)::INTEGER FROM categories WHERE LOWER(path) = LOWER($1) AND deleted_at IS NULL) AS categories,
            (SELECT COUNT(*)::INTEGER FROM products WHERE normalized_sku = $2 AND deleted_at IS NULL) AS products,
            (SELECT COUNT(*)::INTEGER
             FROM product_categories
             WHERE product_id = $3 AND category_id = $4 AND is_primary = TRUE) AS relations,
            (SELECT updated_at::TEXT FROM categories WHERE id = $4) AS category_updated_at,
            (SELECT updated_at::TEXT FROM products WHERE id = $3) AS product_updated_at,
            (SELECT updated_at::TEXT FROM category_stats WHERE category_id = $4) AS stats_updated_at`,
        [SYNTHETIC_CATEGORY_PATH, SYNTHETIC_SKU, productId, categoryId]
    );
    return result.rows[0];
};

(async () => {
    await admin.connect();
    await resetPublic();

    const statusBefore = await runStatus({ env, registry, output: silent });
    assert.equal(statusBefore.filter((entry) => entry.status === 'pending').length, registry.length);
    assert.equal(await publicObjectCount(), 0, 'status must not create the ledger or any schema object');

    await admin.query('CREATE TABLE unmanaged_probe (id INTEGER PRIMARY KEY)');
    await assert.rejects(runApply({ env, registry, output: silent }), /non-empty schema/i);
    assert.equal(
        (await admin.query(`SELECT to_regclass('public.${LEDGER_TABLE}') AS ledger`)).rows[0].ledger,
        null,
        'unmanaged rejection must happen before ledger creation'
    );
    await resetPublic();

    const firstApply = await runApply({ env, registry, output: silent });
    assert.deepEqual(firstApply.applied, registry.map((entry) => entry.id));
    const ledgerRows = await admin.query(
        `SELECT migration_id, migration_path, sha256, applied_at
         FROM ${LEDGER_TABLE}
         ORDER BY migration_id`
    );
    assert.equal(ledgerRows.rowCount, registry.length);

    const expectedTables = [
        'admin_catalog_audit_events', 'attribute_definitions', 'attribute_options',
        'attribute_templates', 'auth_sessions', 'campaign_configs', 'categories',
        'category_aliases', 'category_stats', 'collection_products', 'collection_rules',
        'collections', 'coupons', 'customer_addresses', 'favorites', 'invoices',
        'menu_items', 'menus', 'messages', 'notification_audit_logs', 'notifications',
        'order_events', 'order_item_backfill_issues', 'order_items', 'orders',
        'page_visits', 'payments', 'product_actions', 'product_attribute_values',
        'product_categories', 'product_media', 'product_questions', 'products',
        'returns', 'review_media', 'reviews', 'shipments', 'stores',
        'template_attributes', 'user_shared_state', 'users', 'visitor_sessions',
        'webhook_events', LEDGER_TABLE
    ].sort();
    const tables = await admin.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`
    );
    assert.deepEqual(tables.rows.map((row) => row.table_name).sort(), expectedTables);

    const requiredColumns = await admin.query(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND (table_name, column_name) IN (
              ('users', 'auth_enabled'),
              ('products', 'normalized_sku'),
              ('products', 'revision'),
              ('categories', 'path'),
              ('categories', 'revision'),
              ('orders', 'analytics_session_key'),
              ('collections', 'show_on_home')
           )`
    );
    assert.equal(requiredColumns.rowCount, 7);

    const triggers = await admin.query(
        `SELECT trigger_name
         FROM information_schema.triggers
         WHERE trigger_schema = 'public'
           AND trigger_name IN (
              'trg_admin_catalog_audit_append_only',
              'trg_users_revoke_auth_sessions',
              'trg_auth_sessions_notify_revoked'
           )`
    );
    assert.equal(new Set(triggers.rows.map((row) => row.trigger_name)).size, 3);
    const platformStore = await admin.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM stores
         WHERE LOWER(slug) = 'novastore-platform'
           AND is_active = TRUE
           AND deleted_at IS NULL`
    );
    assert.equal(platformStore.rows[0].count, 1);
    assert.equal((await admin.query('SELECT COUNT(*)::INTEGER AS count FROM users')).rows[0].count, 0);
    assert.equal((await admin.query('SELECT COUNT(*)::INTEGER AS count FROM coupons')).rows[0].count, 0);
    assert.equal((await admin.query('SELECT COUNT(*)::INTEGER AS count FROM campaign_configs')).rows[0].count, 0);

    const statusAfter = await runStatus({ env, registry, output: silent });
    assert.equal(statusAfter.filter((entry) => entry.status === 'applied').length, registry.length);
    const appliedAtBefore = ledgerRows.rows.map((row) => String(row.applied_at));
    const secondApply = await runApply({ env, registry, output: silent });
    assert.deepEqual(secondApply.applied, []);
    const appliedAtAfter = await admin.query(
        `SELECT applied_at FROM ${LEDGER_TABLE} ORDER BY migration_id`
    );
    assert.deepEqual(appliedAtAfter.rows.map((row) => String(row.applied_at)), appliedAtBefore);

    const firstMigration = registry[0];
    await admin.query(
        `UPDATE ${LEDGER_TABLE} SET sha256 = $1 WHERE migration_id = $2`,
        ['0'.repeat(64), firstMigration.id]
    );
    await assert.rejects(runStatus({ env, registry, output: silent }), /checksum mismatch/i);
    await assert.rejects(runApply({ env, registry, output: silent }), /checksum mismatch/i);
    await admin.query(
        `UPDATE ${LEDGER_TABLE} SET sha256 = $1 WHERE migration_id = $2`,
        [firstMigration.sha256, firstMigration.id]
    );

    await admin.query(
        `INSERT INTO ${LEDGER_TABLE} (migration_id, migration_path, sha256, runner_version)
         VALUES ('20990101_unknown_probe', 'migrations/unknown_probe.sql', $1, 'integration-test')`,
        ['1'.repeat(64)]
    );
    await assert.rejects(runStatus({ env, registry, output: silent }), /unknown migration ledger entry/i);
    await assert.rejects(runApply({ env, registry, output: silent }), /unknown migration ledger entry/i);
    await admin.query(`DELETE FROM ${LEDGER_TABLE} WHERE migration_id = '20990101_unknown_probe'`);

    const lockHolder = new Client({ connectionString, application_name: 'p4d1a_lock_holder' });
    await lockHolder.connect();
    try {
        const lock = await lockHolder.query(
            'SELECT pg_try_advisory_lock($1::INTEGER, $2::INTEGER) AS locked',
            MIGRATION_LOCK_KEYS
        );
        assert.equal(lock.rows[0].locked, true);
        await assert.rejects(runApply({ env, registry, output: silent }), /holds the staging migration lock/i);
    } finally {
        await lockHolder.query(
            'SELECT pg_advisory_unlock($1::INTEGER, $2::INTEGER)',
            MIGRATION_LOCK_KEYS
        ).catch(() => {});
        await lockHolder.end();
    }

    const rollbackProbe = {
        id: '20990102_transaction_rollback_probe',
        path: 'migrations/transaction_rollback_probe.sql',
        sha256: '2'.repeat(64),
        mode: 'transactional',
        executionSql: `
            CREATE TABLE p4d1a_transaction_rollback_probe (id INTEGER PRIMARY KEY);
            DO $p4d1a_failure$ BEGIN
                RAISE EXCEPTION 'intentional p4d1a rollback probe';
            END $p4d1a_failure$;
        `
    };
    await assert.rejects(
        executeTransactionalMigration(admin, rollbackProbe),
        /intentional p4d1a rollback probe/i
    );
    assert.equal(
        (await admin.query("SELECT to_regclass('public.p4d1a_transaction_rollback_probe') AS probe")).rows[0].probe,
        null
    );
    assert.equal(
        (await admin.query(
            `SELECT COUNT(*)::INTEGER AS count FROM ${LEDGER_TABLE} WHERE migration_id = $1`,
            [rollbackProbe.id]
        )).rows[0].count,
        0
    );

    const protectedCountsBefore = await tableCounts();
    const firstBootstrap = await runBootstrap({ env, registry, output: silent });
    const snapshotAfterFirst = await bootstrapSnapshot(firstBootstrap);
    assert.equal(snapshotAfterFirst.categories, 1);
    assert.equal(snapshotAfterFirst.products, 1);
    assert.equal(snapshotAfterFirst.relations, 1);
    const secondBootstrap = await runBootstrap({ env, registry, output: silent });
    assert.deepEqual(secondBootstrap, firstBootstrap);
    const snapshotAfterSecond = await bootstrapSnapshot(secondBootstrap);
    assert.deepEqual(snapshotAfterSecond, snapshotAfterFirst);
    assert.deepEqual(await tableCounts(), protectedCountsBefore);

    console.log('staging migration PostgreSQL integration smoke passed: 20 scenarios');
})().finally(async () => {
    await admin.end().catch(() => {});
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
