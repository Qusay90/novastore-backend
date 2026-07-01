const fs = require('fs');
const path = require('path');

const CATEGORY_V2_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260701_category_v2_additive_foundation.sql'
);

const CATEGORY_V2_BACKFILL_CONSTRAINTS_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260702_category_v2_backfill_constraints.sql'
);

const getCategoryV2MigrationSql = () =>
    fs.readFileSync(CATEGORY_V2_MIGRATION_PATH, 'utf8');

const getCategoryV2BackfillConstraintsSql = () =>
    fs.readFileSync(CATEGORY_V2_BACKFILL_CONSTRAINTS_PATH, 'utf8');

const applyCategoryV2Schema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Category v2 schema requires a PostgreSQL queryable.');
    }

    await queryable.query(getCategoryV2MigrationSql());
};

const applyCategoryV2BackfillConstraints = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Category v2 constraints require a PostgreSQL queryable.');
    }

    await queryable.query(getCategoryV2BackfillConstraintsSql());
};

module.exports = {
    CATEGORY_V2_MIGRATION_PATH,
    CATEGORY_V2_BACKFILL_CONSTRAINTS_PATH,
    getCategoryV2MigrationSql,
    getCategoryV2BackfillConstraintsSql,
    applyCategoryV2Schema,
    applyCategoryV2BackfillConstraints
};
