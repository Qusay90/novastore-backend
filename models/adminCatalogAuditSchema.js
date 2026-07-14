const fs = require('fs');
const path = require('path');

const ADMIN_CATALOG_AUDIT_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260714_admin_catalog_mutation_foundation.sql'
);

const getAdminCatalogAuditSchemaSql = () =>
    fs.readFileSync(ADMIN_CATALOG_AUDIT_MIGRATION_PATH, 'utf8');

const applyAdminCatalogAuditSchema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Admin catalog audit schema requires a PostgreSQL queryable.');
    }
    await queryable.query(getAdminCatalogAuditSchemaSql());
};

module.exports = {
    ADMIN_CATALOG_AUDIT_MIGRATION_PATH,
    getAdminCatalogAuditSchemaSql,
    applyAdminCatalogAuditSchema
};
