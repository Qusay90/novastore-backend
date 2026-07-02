const fs = require('fs');
const path = require('path');

const ATTRIBUTE_SCHEMA_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260704_attribute_filter_foundation.sql'
);

const getAttributeSchemaSql = () =>
    fs.readFileSync(ATTRIBUTE_SCHEMA_MIGRATION_PATH, 'utf8');

const applyAttributeSchema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Attribute schema requires a PostgreSQL queryable.');
    }
    await queryable.query(getAttributeSchemaSql());
};

module.exports = {
    ATTRIBUTE_SCHEMA_MIGRATION_PATH,
    getAttributeSchemaSql,
    applyAttributeSchema
};
