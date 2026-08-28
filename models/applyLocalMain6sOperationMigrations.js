const { loadRegistry } = require('../scripts/staging-migrations/registry');

const MAIN6S_OPERATION_MIGRATION_IDS = Object.freeze([
    '20260813_01_review_question_operations',
    '20260813_02_support_notification_operations',
    '20260813_03_coupon_operations',
    '20260813_04_product_media_operations',
    '20260828_01_launch_critical_commerce_readiness'
]);

const selectOperationMigrations = (registry) => {
    const byId = new Map(registry.map((migration) => [migration.id, migration]));
    const migrations = MAIN6S_OPERATION_MIGRATION_IDS.map((id) => byId.get(id));
    const missing = MAIN6S_OPERATION_MIGRATION_IDS.filter((_, index) => !migrations[index]);
    if (missing.length > 0) {
        throw new Error(`Main6S local schema migration registry is incomplete: ${missing.join(', ')}.`);
    }
    return migrations;
};

const applyLocalMain6sOperationMigrations = async ({
    database,
    registry = loadRegistry(),
    output = console.log
} = {}) => {
    const effectiveDatabase = database || require('../config/db');
    const migrations = selectOperationMigrations(registry);
    const client = await effectiveDatabase.connect();

    try {
        for (const migration of migrations) {
            await client.query('BEGIN');
            try {
                await client.query(migration.executionSql);
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            }
            output(`LOCAL_SCHEMA_READY ${migration.id}`);
        }
    } finally {
        client.release();
    }

    return MAIN6S_OPERATION_MIGRATION_IDS.slice();
};

module.exports = {
    MAIN6S_OPERATION_MIGRATION_IDS,
    applyLocalMain6sOperationMigrations,
    selectOperationMigrations
};
