const fs = require('node:fs');
const path = require('node:path');

const AUTH_SESSION_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260721_auth_session_registry.sql'
);

const getAuthSessionSchemaSql = () => fs.readFileSync(AUTH_SESSION_MIGRATION_PATH, 'utf8');

const applyAuthSessionSchema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Auth session schema requires a PostgreSQL queryable.');
    }
    await queryable.query(getAuthSessionSchemaSql());
};

module.exports = {
    AUTH_SESSION_MIGRATION_PATH,
    applyAuthSessionSchema,
    getAuthSessionSchemaSql
};
