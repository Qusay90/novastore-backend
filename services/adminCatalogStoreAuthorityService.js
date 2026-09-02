const { PLATFORM_STORE } = require('./categoryV2BackfillService');
const { AdminCatalogMutationError } = require('./adminCatalogMutationPolicy');

const platformStoreUnavailable = ({ unavailableAsNotFound = false } = {}) => new AdminCatalogMutationError(
    unavailableAsNotFound
        ? 'Katalog kaydı bulunamadı.'
        : 'Birinci taraf katalog mağazası kullanılamıyor.',
    {
        code: unavailableAsNotFound
            ? 'ADMIN_CATALOG_ENTITY_NOT_FOUND'
            : 'ADMIN_CATALOG_PLATFORM_STORE_UNAVAILABLE',
        statusCode: unavailableAsNotFound ? 404 : 503
    }
);

const sellerBoundStoreReadOnly = () => new AdminCatalogMutationError(
    'Seller organizasyonuna bağlı platform mağazası Admin katalog yazımına kapalıdır.',
    {
        code: 'ADMIN_CATALOG_SELLER_BOUND_STORE_READ_ONLY',
        statusCode: 409,
        details: Object.freeze({ refetchRequired: true })
    }
);

const lockAdminWritablePlatformStore = async (
    client,
    { unavailableAsNotFound = false } = {}
) => {
    const storeResult = await client.query(
        `SELECT id
         FROM stores
         WHERE LOWER(slug) = LOWER($1)
           AND is_active = TRUE
           AND deleted_at IS NULL
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
        [PLATFORM_STORE.slug]
    );
    if (!storeResult.rows?.length) {
        throw platformStoreUnavailable({ unavailableAsNotFound });
    }

    const store = Object.freeze({ id: Number(storeResult.rows[0].id) });
    // The store row serializes new FK bindings. Lock every historical binding
    // as well so a closed row cannot be reopened while this mutation commits.
    const bindingResult = await client.query(
        `SELECT id, status, closed_at
         FROM seller_stores
         WHERE legacy_store_id = $1
         ORDER BY id ASC
         FOR SHARE`,
        [store.id]
    );
    if ((bindingResult.rows || []).some((binding) => binding.closed_at === null)) {
        throw sellerBoundStoreReadOnly();
    }
    return store;
};

module.exports = {
    lockAdminWritablePlatformStore,
    sellerBoundStoreReadOnly
};
