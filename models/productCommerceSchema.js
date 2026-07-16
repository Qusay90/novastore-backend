const fs = require('fs');
const path = require('path');

const PRODUCT_COMMERCE_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260716_product_commerce_contract.sql'
);

const getProductCommerceSchemaSql = () =>
    fs.readFileSync(PRODUCT_COMMERCE_MIGRATION_PATH, 'utf8');

const applyProductCommerceSchema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Product commerce schema requires a PostgreSQL queryable.');
    }
    await queryable.query(getProductCommerceSchemaSql());
};

module.exports = {
    PRODUCT_COMMERCE_MIGRATION_PATH,
    getProductCommerceSchemaSql,
    applyProductCommerceSchema
};
