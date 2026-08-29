const fs = require('node:fs');
const path = require('node:path');

const AUTH_SESSION_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260721_auth_session_registry.sql'
);
const CUSTOMER_REFRESH_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260829_01_customer_refresh_rotation.sql'
);
const AUTH_SESSION_MIGRATION_PATHS = Object.freeze([
    AUTH_SESSION_MIGRATION_PATH,
    CUSTOMER_REFRESH_MIGRATION_PATH
]);

const getAuthSessionSchemaSql = () => AUTH_SESSION_MIGRATION_PATHS
    .map((migrationPath) => fs.readFileSync(migrationPath, 'utf8'))
    .join('\n');

const applyAuthSessionSchema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Auth session schema requires a PostgreSQL queryable.');
    }
    await queryable.query(getAuthSessionSchemaSql());
};

module.exports = {
    AUTH_SESSION_MIGRATION_PATH,
    AUTH_SESSION_MIGRATION_PATHS,
    CUSTOMER_REFRESH_MIGRATION_PATH,
    applyAuthSessionSchema,
    getAuthSessionSchemaSql
};
