'use strict';

const path = require('node:path');

const TEST_DATABASE_PREFIX = 'novastore_seller_wave3_test_';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const repositoryRoot = path.resolve(__dirname, '..', '..');
const migrationsDirectory = path.join(repositoryRoot, 'migrations');
const allowedMigrationNames = Object.freeze([
    '20260730_seller_f1_organizations_roles_memberships.sql',
    '20260730_seller_f1_store_bindings_invitations.sql',
    '20260730_seller_f1_sessions_audit_outbox.sql',
    '20260806_seller_f1b_bootstrap_operator_authorizations.sql',
    '20260806_seller_wave3_business_verticals.sql'
]);

class SellerWave3DisposableDbGuardError extends Error {
    constructor(code) {
        super(code);
        this.name = 'SellerWave3DisposableDbGuardError';
        this.code = code;
    }
}

const fail = (code) => { throw new SellerWave3DisposableDbGuardError(code); };

const validateDisposableDbTarget = (connection) => {
    if (!connection || typeof connection !== 'object' || Array.isArray(connection)) fail('SELLER_WAVE3_DB_CONNECTION_REQUIRED');
    const host = String(connection.host || '');
    const database = String(connection.database || '');
    if (!LOOPBACK_HOSTS.has(host)) fail('SELLER_WAVE3_DB_HOST_REJECTED');
    if (!database.startsWith(TEST_DATABASE_PREFIX) || /(?:production|staging|prod|stage|dev)/iu.test(database) || !/^[a-z0-9_]+$/u.test(database)) {
        fail('SELLER_WAVE3_DB_NAME_REJECTED');
    }
    return Object.freeze({ host, database, port: Number(connection.port || 5432), ssl: connection.ssl === true });
};

const validateMigrationPaths = (paths) => {
    if (!Array.isArray(paths) || paths.length !== allowedMigrationNames.length) fail('SELLER_WAVE3_MIGRATION_SET_REJECTED');
    const actual = paths.map((entry) => {
        if (typeof entry !== 'string' || entry.includes('..') || path.isAbsolute(entry) || entry.includes('\\')) fail('SELLER_WAVE3_MIGRATION_PATH_REJECTED');
        const resolved = path.resolve(migrationsDirectory, entry);
        if (path.relative(migrationsDirectory, resolved).split(path.sep).join('/') !== entry || !allowedMigrationNames.includes(entry)) fail('SELLER_WAVE3_MIGRATION_PATH_REJECTED');
        return resolved;
    }).sort();
    const expected = allowedMigrationNames.map((entry) => path.join(migrationsDirectory, entry)).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('SELLER_WAVE3_MIGRATION_SET_REJECTED');
    return Object.freeze(actual);
};

const authorize = (options, kind) => {
    if (!options || typeof options !== 'object' || options.allowDbOperation !== true || options[kind] !== true) {
        fail('SELLER_WAVE3_DB_EXPLICIT_OPT_IN_REQUIRED');
    }
    const result = { connection: validateDisposableDbTarget(options.connection) };
    if (kind === 'applyAuthorization') result.migrationPaths = validateMigrationPaths(options.migrationPaths);
    return Object.freeze(result);
};

module.exports = Object.freeze({
    LOOPBACK_HOSTS,
    TEST_DATABASE_PREFIX,
    allowedMigrationNames,
    SellerWave3DisposableDbGuardError,
    validateDisposableDbTarget,
    validateMigrationPaths,
    authorizeMigrationApply: (options) => authorize(options, 'applyAuthorization'),
    authorizeDisposableDbCleanup: (options) => authorize(options, 'cleanupAuthorization')
});
