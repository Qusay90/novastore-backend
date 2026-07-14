const PUBLIC_PRODUCT_STATUS = 'active';

const buildPublicProductSqlPredicate = (alias = 'products') => {
    if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
        throw new Error('Gecersiz urun tablo takma adi.');
    }

    return `${alias}.publication_status = '${PUBLIC_PRODUCT_STATUS}'
        AND ${alias}.is_customer_visible = TRUE
        AND ${alias}.deleted_at IS NULL`;
};

module.exports = {
    PUBLIC_PRODUCT_STATUS,
    buildPublicProductSqlPredicate
};
