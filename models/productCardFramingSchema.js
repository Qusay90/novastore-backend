const fs = require('fs');
const path = require('path');

const PRODUCT_CARD_FRAMING_MIGRATION_PATH = path.join(
    __dirname,
    '..',
    'migrations',
    '20260823_01_product_media_card_framing.sql'
);

const getProductCardFramingSchemaSql = () =>
    fs.readFileSync(PRODUCT_CARD_FRAMING_MIGRATION_PATH, 'utf8');

const applyProductCardFramingSchema = async (queryable) => {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new TypeError('Product card framing schema requires a PostgreSQL queryable.');
    }
    await queryable.query(getProductCardFramingSchemaSql());
};

module.exports = {
    PRODUCT_CARD_FRAMING_MIGRATION_PATH,
    getProductCardFramingSchemaSql,
    applyProductCardFramingSchema
};
