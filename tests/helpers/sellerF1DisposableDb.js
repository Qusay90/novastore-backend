'use strict';

const path = require('node:path');

const TEST_DATABASE_PREFIX = 'novastore_seller_f1_test_';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const repositoryRoot = path.resolve(__dirname, '..', '..');
const migrationsDirectory = path.join(repositoryRoot, 'migrations');
const allowedMigrationNames = Object.freeze([
    '20260730_seller_f1_organizations_roles_memberships.sql',
    '20260730_seller_f1_store_bindings_invitations.sql',
    '20260730_seller_f1_sessions_audit_outbox.sql',
    '20260806_seller_f1b_bootstrap_operator_authorizations.sql'
]);

class SellerF1DisposableDbGuardError extends Error {
    constructor(code) {
        super(code);
        this.name = 'SellerF1DisposableDbGuardError';
        this.code = code;
    }
}

const fail = (code) => {
    throw new SellerF1DisposableDbGuardError(code);
};

const requirePlainObject = (value, code) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        fail(code);
    }
    return value;
};

const validateDisposableDbTarget = (connection) => {
    const input = requirePlainObject(connection, 'SELLER_F1_DB_CONNECTION_REQUIRED');
    const host = String(input.host || '');
    const database = String(input.database || '');

    if (!LOOPBACK_HOSTS.has(host)) {
        fail('SELLER_F1_DB_HOST_REJECTED');
    }

    if (!database.startsWith(TEST_DATABASE_PREFIX)) {
        fail('SELLER_F1_DB_NAME_REJECTED');
    }

    if (database === 'postgres' || /(?:production|staging|prod|stage|dev)/i.test(database)) {
        fail('SELLER_F1_DB_NAME_REJECTED');
    }

    if (!/^[a-z0-9_]+$/.test(database)) {
        fail('SELLER_F1_DB_NAME_REJECTED');
    }

    return Object.freeze({
        host,
        database,
        port: input.port === undefined ? 5432 : Number(input.port),
        ssl: input.ssl === true
    });
};

const validateMigrationPath = (migrationPath) => {
    if (typeof migrationPath !== 'string' || migrationPath.length === 0) {
        fail('SELLER_F1_MIGRATION_PATH_REQUIRED');
    }

    const resolved = path.resolve(migrationsDirectory, migrationPath);
    const relative = path.relative(migrationsDirectory, resolved);
    const isOutsideMigrations = relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

    if (isOutsideMigrations) {
        fail('SELLER_F1_MIGRATION_PATH_ESCAPE_REJECTED');
    }

    if (!allowedMigrationNames.includes(relative)) {
        fail('SELLER_F1_MIGRATION_PATH_UNAUTHORIZED');
    }

    return resolved;
};

const validateMigrationPaths = (migrationPaths) => {
    if (!Array.isArray(migrationPaths) || migrationPaths.length !== allowedMigrationNames.length) {
        fail('SELLER_F1_MIGRATION_SET_REJECTED');
    }

    const validated = migrationPaths.map(validateMigrationPath);
    const expected = allowedMigrationNames.map((name) => path.join(migrationsDirectory, name)).sort();
    if (JSON.stringify([...validated].sort()) !== JSON.stringify(expected)) {
        fail('SELLER_F1_MIGRATION_SET_REJECTED');
    }

    return Object.freeze(validated);
};

const assertExplicitDbOperation = (options) => {
    const input = requirePlainObject(options, 'SELLER_F1_DB_OPERATION_OPTIONS_REQUIRED');
    if (input.allowDbOperation !== true) {
        fail('SELLER_F1_DB_OPERATION_EXPLICIT_OPT_IN_REQUIRED');
    }
    return input;
};

const authorizeMigrationApply = (options) => {
    const input = assertExplicitDbOperation(options);
    if (input.applyAuthorization !== true) {
        fail('SELLER_F1_MIGRATION_APPLY_AUTHORIZATION_REQUIRED');
    }

    return Object.freeze({
        connection: validateDisposableDbTarget(input.connection),
        migrationPaths: validateMigrationPaths(input.migrationPaths)
    });
};

const authorizeDisposableDbCleanup = (options) => {
    const input = assertExplicitDbOperation(options);
    if (input.cleanupAuthorization !== true) {
        fail('SELLER_F1_DB_CLEANUP_AUTHORIZATION_REQUIRED');
    }

    return Object.freeze({
        connection: validateDisposableDbTarget(input.connection)
    });
};

const redactConnection = (connection) => {
    const input = requirePlainObject(connection, 'SELLER_F1_DB_CONNECTION_REQUIRED');
    return `host=${String(input.host || '')};database=${String(input.database || '')};port=${String(input.port || '')}`;
};

module.exports = {
    LOOPBACK_HOSTS,
    TEST_DATABASE_PREFIX,
    allowedMigrationNames,
    authorizeDisposableDbCleanup,
    authorizeMigrationApply,
    redactConnection,
    validateDisposableDbTarget,
    validateMigrationPath,
    validateMigrationPaths
};
