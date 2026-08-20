const { loadRegistry } = require('../scripts/staging-migrations/registry');
const {
    verifyMigrationFiles: verifySellerMigrationFiles
} = require('./sellerWave3MigrationRegistry');

const MAIN6T_SESSION_BINDING_ID = '20260820_01_main6t_seller_session_membership_binding';
const MAIN6T_SESSION_BINDING_PATH = 'migrations/20260820_01_main6t_seller_session_membership_binding.sql';

const selectSellerMigrations = ({
    registry = loadRegistry(),
    verifiedSellerMigrations = verifySellerMigrationFiles()
} = {}) => {
    const byPath = new Map(registry.map((migration) => [migration.path, migration]));

    return verifiedSellerMigrations.map((descriptor) => {
        const migration = byPath.get(descriptor.relativePath);
        if (!migration) {
            throw new Error(`Combined migration registry is missing Seller migration ${descriptor.relativePath}.`);
        }
        if (
            migration.sha256 !== descriptor.sha256 ||
            migration.transactionWrapper !== true ||
            migration.mode !== 'transactional'
        ) {
            throw new Error(`Combined migration registry disagrees with Seller registry for ${descriptor.relativePath}.`);
        }
        return migration;
    });
};

const selectLocalSellerMigrations = (options = {}) => {
    const registry = options.registry || loadRegistry();
    const sellerMigrations = selectSellerMigrations({
        registry,
        verifiedSellerMigrations: options.verifiedSellerMigrations || verifySellerMigrationFiles()
    });
    const sessionBinding = registry.find((migration) => migration.id === MAIN6T_SESSION_BINDING_ID);
    if (
        !sessionBinding ||
        sessionBinding.path !== MAIN6T_SESSION_BINDING_PATH ||
        sessionBinding.transactionWrapper !== true ||
        sessionBinding.mode !== 'transactional'
    ) {
        throw new Error('Combined migration registry is missing the Main-6T Seller session-membership binding migration.');
    }
    return [...sellerMigrations, sessionBinding];
};

const applyLocalSellerMigrations = async ({
    database,
    registry = loadRegistry(),
    output = console.log
} = {}) => {
    const effectiveDatabase = database || require('../config/db');
    const migrations = selectLocalSellerMigrations({ registry });
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

    return migrations.map((migration) => migration.id);
};

module.exports = {
    applyLocalSellerMigrations,
    selectLocalSellerMigrations,
    selectSellerMigrations
};
