const fs = require('fs');
const path = require('path');

const MENU_COLLECTION_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260702_menu_collection_foundation.sql'
);
const COLLECTION_HOME_VISIBILITY_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260703_collection_home_visibility.sql'
);

const getMenuCollectionMigrationSql = () =>
    fs.readFileSync(MENU_COLLECTION_MIGRATION_PATH, 'utf8');
const getCollectionHomeVisibilityMigrationSql = () =>
    fs.readFileSync(COLLECTION_HOME_VISIBILITY_MIGRATION_PATH, 'utf8');

const applyMenuCollectionSchema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Menu/collection schema requires a PostgreSQL queryable.');
    }
    await queryable.query(getMenuCollectionMigrationSql());
    await queryable.query(getCollectionHomeVisibilityMigrationSql());
};

module.exports = {
    MENU_COLLECTION_MIGRATION_PATH,
    COLLECTION_HOME_VISIBILITY_MIGRATION_PATH,
    getMenuCollectionMigrationSql,
    getCollectionHomeVisibilityMigrationSql,
    applyMenuCollectionSchema
};
