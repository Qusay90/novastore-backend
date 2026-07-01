const fs = require('fs');
const path = require('path');

const CATEGORY_V2_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260701_category_v2_additive_foundation.sql'
);

const getCategoryV2MigrationSql = () =>
    fs.readFileSync(CATEGORY_V2_MIGRATION_PATH, 'utf8');

const applyCategoryV2Schema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Category v2 schema requires a PostgreSQL queryable.');
    }

    await queryable.query(getCategoryV2MigrationSql());
};

module.exports = {
    CATEGORY_V2_MIGRATION_PATH,
    getCategoryV2MigrationSql,
    applyCategoryV2Schema
};
